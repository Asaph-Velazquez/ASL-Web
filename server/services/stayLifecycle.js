import jwt from 'jsonwebtoken';
import { Stay } from '../models/index.js';

function ensureJwtSecret() {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }
}

export function buildStayToken(stay) {
  ensureJwtSecret();

  return jwt.sign(
    {
      stayId: stay.stayId,
      roomNumber: stay.roomNumber,
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      guestName: stay.guestName || null,
    },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
}

export async function hasRoomConflict({ roomNumber, checkIn, checkOut, excludeStayId = null }) {
  const overlapQuery = {
    roomNumber,
    status: { $in: ['scheduled', 'active'] },
    checkIn: { $lt: checkOut },
    checkOut: { $gt: checkIn },
  };

  if (excludeStayId) {
    overlapQuery.stayId = { $ne: excludeStayId };
  }

  const conflict = await Stay.findOne(overlapQuery).lean();
  return Boolean(conflict);
}

function isCurrentWindow(stay, now) {
  return stay.checkIn <= now && stay.checkOut > now;
}

export async function processStayTransitions(now = new Date()) {
  const result = {
    ended: 0,
    activated: 0,
    activatedStayIds: [],
  };

  const endedStays = await Stay.find({ active: true, checkOut: { $lte: now } });
  if (endedStays.length > 0) {
    const endedIds = endedStays.map((stay) => stay.stayId);
    await Stay.updateMany(
      { stayId: { $in: endedIds } },
      { active: false, status: 'ended' }
    );
    result.ended = endedIds.length;
  }

  const dueStays = await Stay.find({ active: false, status: 'scheduled', checkIn: { $lte: now }, checkOut: { $gt: now } })
    .sort({ roomNumber: 1, checkIn: 1, createdAt: 1 });

  const activatedRooms = new Set();

  for (const stay of dueStays) {
    if (!isCurrentWindow(stay, now)) {
      continue;
    }

    if (activatedRooms.has(stay.roomNumber)) {
      continue;
    }

    const activeInRoom = await Stay.findOne({
      roomNumber: stay.roomNumber,
      active: true,
      checkOut: { $gt: now },
      stayId: { $ne: stay.stayId },
    }).lean();

    if (activeInRoom) {
      continue;
    }

    stay.active = true;
    stay.status = 'active';
    stay.qrToken = buildStayToken(stay);
    await stay.save();

    activatedRooms.add(stay.roomNumber);
    result.activated += 1;
    result.activatedStayIds.push(stay.stayId);
  }

  return result;
}
