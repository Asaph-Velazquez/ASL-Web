import { Request } from '../models/index.js';
import { createHash } from 'node:crypto';
import { protectedTransportFields, validateTaxiSchedule, versionFilter } from './transport.js';

function normalizeTimestamp(value) {
  const parsed = value ? new Date(value) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function buildHistoryEntry({ eventType, status, changedBy, actorName, note, rating, timestamp }) {
  return {
    eventType,
    status: status ?? null,
    changedBy: changedBy ?? 'system',
    actorName: actorName ?? null,
    note: note ?? null,
    rating: typeof rating === 'number' ? rating : null,
    timestamp: normalizeTimestamp(timestamp),
  };
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function mergeRequestDetails(existingDetails, incomingDetails, legacyTransportKind = existingDetails?.serviceType) {
  if (!isPlainObject(existingDetails) && !isPlainObject(incomingDetails)) {
    return incomingDetails ?? existingDetails ?? null;
  }
  const base = isPlainObject(existingDetails) ? existingDetails : {};
  const incoming = isPlainObject(incomingDetails) ? incomingDetails : {};

  const merged = {
    ...base,
    ...incoming,
  };

  for (const field of protectedTransportFields) {
    delete merged[field];
    if (Object.hasOwn(base, field)) merged[field] = base[field];
  }

  const quoted = base.transportProposals || base.transportAcceptance || base.transportArchive?.length;
  if (quoted) {
    for (const field of ['serviceType', 'passengerCount', 'destinationCategory', 'destinationId',
      'destinationLabel', 'destinationCoords', 'destinationPlaceId', 'destination', 'timeMode',
      'scheduledAt', 'hasLuggage', 'sourceMode', 'summary']) {
      delete merged[field];
      if (Object.hasOwn(base, field)) merged[field] = base[field];
    }
  }
  if (!quoted && ['valet', 'taxi'].includes(legacyTransportKind)
    && (isPlainObject(base.transportResponse) || isPlainObject(incoming.transportResponse))) {
    merged.transportResponse = {
      ...(isPlainObject(base.transportResponse) ? base.transportResponse : {}),
      ...(isPlainObject(incoming.transportResponse) ? incoming.transportResponse : {}),
    };
  }

  return Object.keys(merged).length > 0 ? merged : null;
}

function creationFingerprint(document) {
  // Exclude retry metadata and server-managed lifecycle state; retain original business input.
  const canonical = value => {
    if (Array.isArray(value)) return value.map(canonical);
    if (isPlainObject(value)) return Object.fromEntries(Object.keys(value).sort()
      .filter(key => value[key] !== undefined).map(key => [key, canonical(value[key])]));
    return value;
  };
  const { stayId, roomNumber, guestName, type, message, priority, details } = document;
  return createHash('sha256').update(JSON.stringify(canonical({
    stayId, roomNumber, guestName, type, message, priority, details,
  }))).digest('hex');
}

function existingCreationResult(existing, document, meta) {
  if (!meta.isStaff && meta.stayId && existing.stayId === meta.stayId
    && (existing.creationFingerprint || creationFingerprint(existing)) === document.creationFingerprint) {
    return existing;
  }
  throw new Error('Duplicate request ID with different owner or payload');
}

export async function persistNewRequest(payload, meta = {}, model = Request) {
  const requestId = String(payload?.id || '').trim();
  if (!requestId) {
    throw new Error('NEW_REQUEST missing payload.id');
  }

  const baseTimestamp = normalizeTimestamp(payload.timestamp);
  if (protectedTransportFields.some(field => Object.hasOwn(payload.details || {}, field))) {
    throw new Error('Transport fields must be set through transport operations');
  }
  const actorName = meta.guestName || payload.guestName || null;
  const document = {
    requestId,
    stayId: meta.stayId || payload.stayId || null,
    roomNumber: meta.roomNumber || payload.roomNumber,
    guestName: actorName || 'Guest',
    type: payload.type,
    message: payload.message,
    priority: payload.priority || 'medium',
    status: 'pending',
    timestamp: baseTimestamp,
    details: payload.details || null,
  };
  document.creationFingerprint = creationFingerprint(document);
  const existing = await model.findOne({ requestId }).lean();
  if (existing) return existingCreationResult(existing, document, meta);
  validateTaxiSchedule(payload.details);

  // Insert only: a repeated ID must never overwrite an existing request.
  try {
    const created = await model.create({
      ...document,
      history: [buildHistoryEntry({
        eventType: 'NEW_REQUEST',
        status: document.status,
        changedBy: meta.isStaff ? 'staff' : 'guest',
        actorName,
        note: document.message,
        timestamp: baseTimestamp,
      })],
    });
    return created.toObject();
  } catch (error) {
    if (error.code !== 11000) throw error;
    const winner = await model.findOne({ requestId }).lean();
    if (!winner) throw error;
    return existingCreationResult(winner, document, meta);
  }
}

export async function persistRequestUpdate(payload, meta = {}, model = Request) {
  if (!meta.isStaff) throw new Error('Unauthorized action');
  const requestId = String(payload?.id || '').trim();
  if (!requestId) {
    throw new Error('UPDATE_REQUEST missing payload.id');
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const request = await model.findOne({ requestId }).lean();
    if (!request) throw new Error(`Request not found for UPDATE_REQUEST: ${requestId}`);
    const nextStatus = typeof payload.status === 'string' ? payload.status : request.status;
    if (['completed', 'cancelled'].includes(request.status) && nextStatus !== request.status) {
      throw new Error('Terminal request status cannot be changed');
    }
    if (request.status === 'cancelled' && Object.hasOwn(payload.details || {}, 'transportResponse')) {
      throw new Error('Cancelled transport response cannot be edited');
    }
    const legacyTransportKind = request.details?.serviceType
      || (/(taxi|ride-hailing|uber|didi|cab)/i.test(request.message || '') ? 'taxi'
        : /(valet|parking|parkink|estacionamiento)/i.test(request.message || '') ? 'valet' : null);
    const mergedDetails = mergeRequestDetails(request.details, payload.details, legacyTransportKind);
    if (request.details?.transportProposals && mergedDetails?.serviceType !== request.details.serviceType) {
      throw new Error('Transport service type cannot be changed after publication');
    }
    if (mergedDetails?.serviceType === 'taxi'
      && (legacyTransportKind !== 'taxi'
        || mergedDetails.timeMode !== request.details?.timeMode
        || mergedDetails.scheduledAt !== request.details?.scheduledAt)) {
      validateTaxiSchedule(mergedDetails);
    }
    const updated = await model.findOneAndUpdate(versionFilter(request), {
      $set: { status: nextStatus, details: mergedDetails },
      $inc: { mutationVersion: 1 },
      $push: { history: buildHistoryEntry({
        eventType: 'UPDATE_REQUEST', status: nextStatus, changedBy: 'staff',
        actorName: meta.username || null,
        note: payload.note || `Status changed to ${nextStatus}`, timestamp: new Date(),
      }) },
    }, { new: true, runValidators: true }).lean();
    if (updated) return updated;
  }
  throw new Error('Concurrent request update; retry');
}

export async function persistRequestCancellation(payload, meta = {}, model = Request) {
  const requestId = String(payload?.id || payload?.requestId || '').trim();
  if (!requestId) {
    throw new Error('CANCEL_REQUEST missing payload.id');
  }

  const cancelledBy = meta.isStaff ? 'staff' : 'guest';
  if (!meta.isStaff && !meta.stayId) throw new Error('Unauthorized action');
  const ownerFilter = { requestId, ...(!meta.isStaff ? { stayId: meta.stayId } : {}) };
  const cancelledByName = meta.isStaff ? (meta.username || 'Staff') : (meta.guestName || 'Guest');
  const result = await model.findOneAndUpdate(
    { ...ownerFilter, status: { $in: ['pending', 'in-progress'] } },
    {
      $set: {
        status: 'cancelled',
        cancelledBy,
        cancelledByName,
        cancelledAt: new Date(),
      },
      $inc: { mutationVersion: 1 },
      $push: {
        history: buildHistoryEntry({
          eventType: 'CANCEL_REQUEST',
          status: 'cancelled',
          changedBy: cancelledBy,
          actorName: cancelledByName,
          note: 'Request cancelled',
          timestamp: new Date(),
        }),
      },
    },
    { new: true }
  ).lean();
  if (result) return result;
  const current = await model.findOne(ownerFilter).lean();
  if (current?.status === 'cancelled') return current;
  const error = new Error('Request cannot be cancelled');
  if (current) error.current = current;
  throw error;
}

export async function persistRequestRating(payload, meta = {}) {
  const requestId = String(payload?.id || '').trim();
  if (!requestId) {
    throw new Error('RATE_REQUEST missing payload.id');
  }

  return Request.findOneAndUpdate(
    { requestId },
    {
      $set: {
        rating: payload.rating,
        ratedAt: normalizeTimestamp(payload.ratedAt),
      },
      $inc: { mutationVersion: 1 },
      $push: {
        history: buildHistoryEntry({
          eventType: 'RATE_REQUEST',
          status: null,
          changedBy: meta.isStaff ? 'staff' : 'guest',
          actorName: meta.username || meta.guestName || null,
          rating: payload.rating,
          note: 'Request rated',
          timestamp: payload.ratedAt,
        }),
      },
    },
    { new: true }
  ).lean();
}

export async function listRequestsForSocket(meta = {}) {
  const filter = meta.isStaff ? {} : { stayId: meta.stayId };

  return Request.find(filter)
    .sort({ timestamp: -1 })
    .limit(200)
    .lean();
}
