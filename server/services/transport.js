import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Request } from '../models/index.js';
import { publicRequest } from './requestBroadcast.js';

export const transportOperations = [
  'PUBLISH_TRANSPORT_OPTIONS', 'ACCEPT_TRANSPORT_OPTION', 'ASSIGN_TRANSPORT_VEHICLES',
];
export const protectedTransportFields = [
  'transportProposals', 'transportAcceptance', 'transportArchive', 'transportResponse', 'transportCost',
];
const identifier = z.string().trim().min(1).max(100).regex(/^[\w-]+$/);
const positiveInteger = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const label = z.string().trim().min(1).max(100).regex(/^[^<>\x00-\x1f]+$/);
const optionSchema = z.object({
  id: identifier.optional(),
  vehicleType: z.enum(['car', 'van', 'bus']),
  vehicleCount: positiveInteger.max(100),
  totalCapacity: positiveInteger.max(10000),
  priceCents: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  description: z.string().trim().min(1).max(240).regex(/^[^<>\x00-\x1f]+$/).optional(),
}).strict();
const payloadSchemas = {
  PUBLISH_TRANSPORT_OPTIONS: z.object({ id: identifier, options: z.array(optionSchema).min(1).max(20) }).strict(),
  ACCEPT_TRANSPORT_OPTION: z.object({ id: identifier, revision: positiveInteger, optionId: identifier }).strict(),
  ASSIGN_TRANSPORT_VEHICLES: z.object({
    id: identifier, revision: positiveInteger,
    vehicles: z.array(z.object({
      vehiclePlate: label, vehicleModel: label, vehicleColor: label.optional(),
    }).strict()).min(1).max(100),
  }).strict(),
};

export function versionFilter(request) {
  return {
    _id: request._id,
    mutationVersion: request.mutationVersion ?? { $exists: false },
    status: request.status,
  };
}

export function validateTaxiSchedule(details, now = Date.now()) {
  if (details?.serviceType !== 'taxi') return;
  if (details.timeMode !== 'scheduled' || typeof details.scheduledAt !== 'string'
    || !Number.isFinite(Date.parse(details.scheduledAt))
    || Date.parse(details.scheduledAt) < now + 24 * 60 * 60 * 1000) {
    throw new Error('Scheduled taxi requires at least 24 hours notice');
  }
}

function fail(message, current) {
  const error = new Error(message);
  if (current) error.current = current;
  throw error;
}

function authorize(request, operation, meta) {
  if (operation === 'ACCEPT_TRANSPORT_OPTION') {
    if (meta.isStaff || !meta.stayId || meta.stayId !== request.stayId) fail('Unauthorized action');
  } else if (!meta.isStaff) fail('Unauthorized action');
}

export async function persistTransportOperation(operation, input, meta = {}, model = Request) {
  const payload = payloadSchemas[operation].parse(input);
  const request = await model.findOne({ requestId: payload.id }).lean();
  if (!request) fail('Request not found');
  authorize(request, operation, meta);
  if (request.details?.serviceType !== 'taxi') fail('Request is not a taxi request');
  if (!['pending', 'in-progress'].includes(request.status)) fail('Request is not active', request);

  const details = structuredClone(request.details);
  const now = new Date().toISOString();
  const actor = meta.username || meta.userId || 'staff';
  const publication = details.transportProposals;
  if (operation === 'PUBLISH_TRANSPORT_OPTIONS') {
    const options = payload.options.map(option => ({ ...option, id: option.id || randomUUID() }));
    if (new Set(options.map(option => option.id)).size !== options.length) fail('Duplicate option IDs');
    if (options.some(option => option.totalCapacity < option.vehicleCount
      || option.totalCapacity < (details.passengerCount || 1))) fail('Insufficient total capacity');
    if (publication || details.transportAcceptance || details.transportResponse) {
      details.transportArchive = [...(details.transportArchive || []), {
        transportProposals: publication || null,
        transportAcceptance: details.transportAcceptance || null,
        transportResponse: details.transportResponse || null,
        archivedAt: now,
      }];
    }
    details.transportProposals = {
      revision: (publication?.revision || 0) + 1, options, publishedAt: now, publishedBy: actor,
    };
    delete details.transportAcceptance;
    delete details.transportResponse;
    delete details.transportCost;
  } else {
    if (!publication || publication.revision !== payload.revision) fail('Stale transport revision', request);
    if (operation === 'ACCEPT_TRANSPORT_OPTION') {
      const option = publication.options.find(candidate => candidate.id === payload.optionId);
      if (!option) fail('Unknown transport option');
      if (details.transportAcceptance?.revision === payload.revision) {
        if (details.transportAcceptance.optionId === payload.optionId) return request;
        fail('A different option is already accepted', request);
      }
      details.transportAcceptance = { revision: payload.revision, optionId: option.id, option: structuredClone(option), acceptedAt: now };
    } else {
      const accepted = details.transportAcceptance;
      if (!accepted || accepted.revision !== payload.revision) fail('Transport option must be accepted', request);
      if (payload.vehicles.length !== accepted.option.vehicleCount) fail('Vehicle count must match accepted option');
      if (new Set(payload.vehicles.map(vehicle => vehicle.vehiclePlate.toUpperCase())).size !== payload.vehicles.length) {
        fail('Duplicate vehicle plates');
      }
      details.transportResponse = {
        vehicles: payload.vehicles,
        vehiclePlate: payload.vehicles[0].vehiclePlate,
        vehicleModel: payload.vehicles[0].vehicleModel,
        transportCost: `${BigInt(accepted.option.priceCents) / 100n}.${String(BigInt(accepted.option.priceCents) % 100n).padStart(2, '0')}`,
        updatedAt: now, updatedBy: actor,
      };
    }
  }

  // The same version is incremented by all generic status/details mutations.
  const updated = await model.findOneAndUpdate(versionFilter(request), {
    $set: { details }, $inc: { mutationVersion: 1 },
    $push: { history: { eventType: operation, status: request.status, changedBy: meta.isStaff ? 'staff' : 'guest',
      actorName: meta.username || meta.guestName || null, timestamp: new Date(now) } },
  }, { new: true, runValidators: true }).lean();
  if (!updated) {
    const current = await model.findOne({ requestId: payload.id }).lean();
    if (current) authorize(current, operation, meta);
    if (operation === 'ACCEPT_TRANSPORT_OPTION' && ['pending', 'in-progress'].includes(current?.status)
      && current.details?.transportProposals?.revision === payload.revision
      && current.details?.transportAcceptance?.revision === payload.revision
      && current.details.transportAcceptance.optionId === payload.optionId) return current;
    fail('Concurrent request update; retry with current state', current);
  }
  return updated;
}

export function requestUpdateMessage(request) {
  return { type: 'UPDATE_REQUEST', payload: publicRequest(request) };
}

export async function handleTransportMessage(message, meta, send, broadcast, persist = persistTransportOperation) {
  if (!transportOperations.includes(message?.type)) return false;
  const operationId = typeof message.operationId === 'string' ? message.operationId : null;
  try {
    identifier.parse(operationId);
    const request = await persist(message.type, message.payload, meta);
    broadcast(requestUpdateMessage(request), request);
    send({ type: 'TRANSPORT_RESULT', payload: { operationId, ok: true } });
  } catch (error) {
    if (error.current) send(requestUpdateMessage(error.current));
    send({ type: 'TRANSPORT_RESULT', payload: { operationId, ok: false,
      error: error instanceof z.ZodError ? 'Invalid transport operation payload' : error.message } });
  }
  return true;
}
