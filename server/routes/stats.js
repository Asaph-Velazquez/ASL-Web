import express from 'express';
import { Request } from '../models/index.js';
import { verifyStaffToken } from '../middleware/auth.js';

const router = express.Router();
router.use(verifyStaffToken);

const SERVICE_LABELS = {
  services: 'Mobility',
  taxi: 'Taxi',
  valet: 'Valet Parking',
  'room-service': 'Room Service',
  problem: 'Problems',
  extra: 'Extra',
  'interpreter-follow-up': 'Interpreter Follow-Up',
};

function getServiceKey(request) {
  // Mobility requests use the generic `services` type, while the concrete
  // service is persisted in details.serviceType.
  return request.type === 'services' && request.details?.serviceType
    ? String(request.details.serviceType)
    : request.type;
}

export function parseDate(value, endOfDay = false) {
  if (!value) return null;
  // Date-only inputs describe local calendar days, not UTC midnights.
  // ISO instants from the browser already include the selected day's bounds.
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const parsed = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(value);
  if (dateOnly && endOfDay) parsed.setHours(23, 59, 59, 999);
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
    const endDate = parseDate(end, true);

    const query = {
      rating: { $ne: null },
    };
    const filterClauses = [];

    if (service !== 'all') {
      filterClauses.push({ $or: [
        { type: service },
        { type: 'services', 'details.serviceType': service },
      ] });
    }

    if (room !== 'all') {
      query.roomNumber = String(room);
    }

    if (startDate || endDate) {
      const dateRange = {};
      if (startDate) dateRange.$gte = startDate;
      if (endDate) dateRange.$lte = endDate;
      // Older ratings may not have ratedAt; use the request timestamp then.
      filterClauses.push({ $or: [
        { ratedAt: dateRange },
        { ratedAt: null, timestamp: dateRange },
      ] });
    }

    if (filterClauses.length > 0) {
      query.$and = filterClauses;
    }

    const requests = await Request.find(query)
      .select('requestId type details roomNumber guestName message rating ratedAt timestamp')
      .sort({ ratedAt: -1, timestamp: -1 })
      .lean();

    const normalized = requests.map((request) => ({
      requestId: request.requestId,
      type: getServiceKey(request),
      serviceLabel: SERVICE_LABELS[getServiceKey(request)] || getServiceKey(request),
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
      availableServices: Array.from(new Map([
        ...Object.entries(SERVICE_LABELS).map(([key, label]) => [key, { key, label }]),
        ...normalized.map((item) => [item.type, { key: item.type, label: item.serviceLabel }]),
      ]).values()),
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
