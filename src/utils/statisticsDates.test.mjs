import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toDateBoundary, toDateInput } from './statisticsDates.ts';
import { parseDate } from '../../server/routes/stats.js';

test('Mexico calendar day includes evening ratings and stops before the next day', () => {
  const previous = process.env.TZ;
  process.env.TZ = 'America/Mexico_City';
  try {
    const start = toDateBoundary('2026-10-03');
    const end = toDateBoundary('2026-10-03', true);
    assert.equal(start, '2026-10-03T06:00:00.000Z');
    assert.equal(end, '2026-10-04T05:59:59.999Z');
    const eveningRating = new Date('2026-10-03T23:43:31.514Z');
    assert.ok(eveningRating >= parseDate(start) && eveningRating <= parseDate(end, true));
    assert.ok(new Date('2026-10-04T06:00:00.000Z') > parseDate(end, true));
    assert.equal(parseDate('2026-10-03', true).toISOString(), end);
    assert.equal(toDateInput(new Date('2026-10-04T02:00:00.000Z')), '2026-10-03');

    // A server in another time zone must preserve the browser's bounds.
    process.env.TZ = 'UTC';
    assert.equal(parseDate(start).toISOString(), start);
    assert.equal(parseDate(end, true).toISOString(), end);
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test('empty date filters stay unbounded', () => {
  assert.equal(toDateBoundary(''), '');
  assert.equal(parseDate(''), null);
  assert.equal(parseDate('invalid'), null);
});
