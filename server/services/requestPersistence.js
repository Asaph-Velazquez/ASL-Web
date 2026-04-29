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
    guestName: actorName || 'Huesped',
    type: payload.type,
    message: payload.message,
    priority: payload.priority || 'medium',
    status: payload.status || 'pending',
    timestamp: baseTimestamp,
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

  return Request.findOneAndUpdate(
    { requestId },
    {
      $set: {
        status: payload.status,
      },
      $push: {
        history: buildHistoryEntry({
          eventType: 'UPDATE_REQUEST',
          status: payload.status,
          changedBy: meta.isStaff ? 'staff' : 'guest',
          actorName: meta.username || meta.guestName || null,
          note: `Status changed to ${payload.status}`,
          timestamp: new Date(),
        }),
      },
    },
    { new: true }
  ).lean();
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
