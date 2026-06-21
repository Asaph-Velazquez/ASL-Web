import { Request } from '../models/index.js';

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

function mergeRequestDetails(existingDetails, incomingDetails) {
  if (!isPlainObject(existingDetails) && !isPlainObject(incomingDetails)) {
    return incomingDetails ?? existingDetails ?? null;
  }

  const base = isPlainObject(existingDetails) ? existingDetails : {};
  const incoming = isPlainObject(incomingDetails) ? incomingDetails : {};

  const merged = {
    ...base,
    ...incoming,
  };

  if (isPlainObject(base.transportResponse) || isPlainObject(incoming.transportResponse)) {
    merged.transportResponse = {
      ...(isPlainObject(base.transportResponse) ? base.transportResponse : {}),
      ...(isPlainObject(incoming.transportResponse) ? incoming.transportResponse : {}),
    };
  }

  return Object.keys(merged).length > 0 ? merged : null;
}

export async function persistNewRequest(payload, meta = {}) {
  const requestId = String(payload?.id || '').trim();
  if (!requestId) {
    throw new Error('NEW_REQUEST missing payload.id');
  }

  const baseTimestamp = normalizeTimestamp(payload.timestamp);
  const actorName = meta.guestName || payload.guestName || null;
  const document = {
    requestId,
    stayId: meta.stayId || payload.stayId || null,
    roomNumber: meta.roomNumber || payload.roomNumber,
    guestName: actorName || 'Guest',
    type: payload.type,
    message: payload.message,
    priority: payload.priority || 'medium',
    status: payload.status || 'pending',
    timestamp: baseTimestamp,
    details: payload.details || null,
  };

  return Request.findOneAndUpdate(
    { requestId },
    {
      $setOnInsert: {
        requestId: document.requestId,
      },
      $set: {
        stayId: document.stayId,
        roomNumber: document.roomNumber,
        guestName: document.guestName,
        type: document.type,
        message: document.message,
        priority: document.priority,
        status: document.status,
        timestamp: document.timestamp,
        details: document.details,
      },
      $push: {
        history: buildHistoryEntry({
          eventType: 'NEW_REQUEST',
          status: document.status,
          changedBy: meta.isStaff ? 'staff' : 'guest',
          actorName,
          note: document.message,
          timestamp: baseTimestamp,
        }),
      },
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }
  ).lean();
}

export async function persistRequestUpdate(payload, meta = {}) {
  const requestId = String(payload?.id || '').trim();
  if (!requestId) {
    throw new Error('UPDATE_REQUEST missing payload.id');
  }

  const request = await Request.findOne({ requestId });
  if (!request) {
    throw new Error(`Request not found for UPDATE_REQUEST: ${requestId}`);
  }

  const nextStatus = typeof payload.status === 'string' ? payload.status : request.status;
  const mergedDetails = mergeRequestDetails(request.details, payload.details);

  if (typeof payload.status === 'string') {
    request.status = payload.status;
  }

  if (payload.details !== undefined) {
    request.details = mergedDetails;
  }

  const note =
    payload.note ||
    (payload.details?.transportResponse
      ? (payload.details.transportResponse.transportCost
          ? 'Transport response updated with cost'
          : 'Transport response updated')
      : `Status changed to ${nextStatus}`);

  request.history.push(
    buildHistoryEntry({
      eventType: 'UPDATE_REQUEST',
      status: nextStatus,
      changedBy: meta.isStaff ? 'staff' : 'guest',
      actorName: meta.username || meta.guestName || null,
      note,
      timestamp: new Date(),
    })
  );

  await request.save();
  return request.toObject();
}

export async function persistRequestCancellation(payload, meta = {}) {
  const requestId = String(payload?.id || '').trim();
  if (!requestId) {
    throw new Error('CANCEL_REQUEST missing payload.id');
  }

  return Request.findOneAndUpdate(
    { requestId },
    {
      $set: {
        status: 'cancelled',
        cancelledBy: payload.cancelledBy || (meta.isStaff ? 'staff' : 'guest'),
        cancelledByName: payload.cancelledByName || meta.username || meta.guestName || null,
        cancelledAt: normalizeTimestamp(payload.cancelledAt),
      },
      $push: {
        history: buildHistoryEntry({
          eventType: 'CANCEL_REQUEST',
          status: 'cancelled',
          changedBy: payload.cancelledBy || (meta.isStaff ? 'staff' : 'guest'),
          actorName: payload.cancelledByName || meta.username || meta.guestName || null,
          note: 'Request cancelled',
          timestamp: payload.cancelledAt,
        }),
      },
    },
    { new: true }
  ).lean();
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
