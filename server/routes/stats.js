import express from 'express';
import { Request } from '../models/index.js';
import { verifyStaffToken } from '../middleware/auth.js';

const router = express.Router();
router.use(verifyStaffToken);

const SERVICE_LABELS = {
  services: 'Mobility',
  'room-service': 'Room Service',
  problem: 'Problems',
  extra: 'Extra',
};

function parseDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toDayKey(date) {
  return date.toISOString().slice(0, 10);
}

function createEmptyDistribution() {
  return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
}

function buildSummary(items) {
  if (items.length === 0) {
    return {
      totalRated: 0,
      averageRating: 0,
      highestRatedService: null,
      lowestRatedService: null,
      distribution: createEmptyDistribution(),
    };
  }

  const distribution = createEmptyDistribution();
  let total = 0;
  const serviceGroups = new Map();

  for (const item of items) {
    total += item.rating;
    distribution[item.rating] += 1;

    const service = item.type;
    const group = serviceGroups.get(service) || { key: service, label: SERVICE_LABELS[service] || service, count: 0, total: 0 };
    group.count += 1;
    group.total += item.rating;
    serviceGroups.set(service, group);
  }

  const services = Array.from(serviceGroups.values()).map((group) => ({
    ...group,
    averageRating: group.total / group.count,
  }));

  services.sort((a, b) => b.averageRating - a.averageRating || b.count - a.count);

  return {
    totalRated: items.length,
    averageRating: total / items.length,
    highestRatedService: services[0] || null,
    lowestRatedService: services[services.length - 1] || null,
    distribution,
  };
}

function groupBy(items, getKey, getLabel) {
  const groups = new Map();

  for (const item of items) {
    const key = getKey(item);
    const group = groups.get(key) || {
      key,
      label: getLabel(item),
      count: 0,
      total: 0,
      distribution: createEmptyDistribution(),
    };

    group.count += 1;
    group.total += item.rating;
    group.distribution[item.rating] += 1;
    groups.set(key, group);
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      averageRating: group.count > 0 ? group.total / group.count : 0,
    }))
    .sort((a, b) => b.averageRating - a.averageRating || b.count - a.count || String(a.label).localeCompare(String(b.label)));
}

function buildPeriodSeries(items) {
  const groups = groupBy(
    items,
    (item) => toDayKey(item.ratedAt || item.timestamp),
    (item) => toDayKey(item.ratedAt || item.timestamp)
  );

  return groups.sort((a, b) => a.key.localeCompare(b.key));
}

router.get('/ratings', async (req, res) => {
  try {
    const { service = 'all', room = 'all', start, end } = req.query;
    const startDate = parseDate(start);
    const endDate = parseDate(end);

    const query = {
      rating: { $ne: null },
    };

    if (service !== 'all') {
      query.type = service;
    }

    if (room !== 'all') {
      query.roomNumber = String(room);
    }

    if (startDate || endDate) {
      query.ratedAt = {};
      if (startDate) query.ratedAt.$gte = startDate;
      if (endDate) {
        const inclusiveEnd = new Date(endDate);
        inclusiveEnd.setHours(23, 59, 59, 999);
        query.ratedAt.$lte = inclusiveEnd;
      }
    }

    const requests = await Request.find(query)
      .select('requestId type roomNumber guestName message rating ratedAt timestamp')
      .sort({ ratedAt: -1, timestamp: -1 })
      .lean();

    const normalized = requests.map((request) => ({
      requestId: request.requestId,
      type: request.type,
      serviceLabel: SERVICE_LABELS[request.type] || request.type,
      roomNumber: request.roomNumber,
      guestName: request.guestName,
      message: request.message,
      rating: request.rating,
      ratedAt: request.ratedAt || request.timestamp,
      timestamp: request.timestamp,
    }));

    const rooms = await Request.distinct('roomNumber', { rating: { $ne: null } });

    return res.json({
      filters: {
        service,
        room,
        start: startDate ? toDayKey(startDate) : null,
        end: endDate ? toDayKey(endDate) : null,
      },
      availableServices: Object.entries(SERVICE_LABELS).map(([key, label]) => ({ key, label })),
      availableRooms: rooms.sort((a, b) => String(a).localeCompare(String(b), 'en-US', { numeric: true })),
      summary: buildSummary(normalized),
      byService: groupBy(normalized, (item) => item.type, (item) => item.serviceLabel),
      byRoom: groupBy(normalized, (item) => item.roomNumber, (item) => `Room ${item.roomNumber}`),
      byPeriod: buildPeriodSeries(normalized),
      recentRatings: normalized.slice(0, 30),
    });
  } catch (error) {
    console.error('Error building rating statistics:', error);
    return res.status(500).json({ error: 'Unable to build rating statistics' });
  }
});

export default router;
