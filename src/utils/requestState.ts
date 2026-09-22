export interface RequestRecord {
  requestId?: string;
  id?: string;
  mutationVersion?: number;
  type?: string;
  roomNumber?: string;
  guestName?: string;
  message?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  status?: 'pending' | 'in-progress' | 'completed' | 'cancelled';
  timestamp?: string;
  cancelledBy?: 'staff' | 'guest';
  cancelledByName?: string;
  cancelledAt?: string;
  rating?: number;
  ratedAt?: string;
  details?: unknown;
  [key: string]: unknown;
}

export function canonicalRequestId(request: RequestRecord): string | null {
  for (const value of [request.requestId, request.id]) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function version(request: RequestRecord): number | undefined {
  return Number.isSafeInteger(request.mutationVersion) && request.mutationVersion! >= 0
    ? request.mutationVersion : undefined;
}

export function mergeRequestRecords(
  current: RequestRecord[], incoming: RequestRecord[], source: 'live' | 'history' = 'live',
): RequestRecord[] {
  const records = new Map<string, RequestRecord>();
  const merge = (request: RequestRecord, history: boolean) => {
    const id = canonicalRequestId(request);
    if (!id) return;
    const existing = records.get(id);
    const nextVersion = version(request);
    const oldVersion = existing ? version(existing) : undefined;
    // History is a snapshot, not a reset. Without comparable versions, live data wins.
    const keepExisting = existing && (history
      ? !(nextVersion !== undefined && oldVersion !== undefined && nextVersion > oldVersion)
      : nextVersion !== undefined && oldVersion !== undefined && nextVersion < oldVersion);
    // Shallow replacement is intentional: removed acceptance/assignment must stay removed.
    records.set(id, {
      ...(keepExisting ? { ...request, ...existing } : { ...existing, ...request }),
      id, requestId: id,
    });
  };
  current.forEach(request => merge(request, false));
  incoming.forEach(request => merge(request, source === 'history'));
  const result = [...records.values()];
  // Preserve card positions on retries; only genuinely new live requests move to the front.
  if (source === 'live') {
    const existingIds = new Set(current.map(canonicalRequestId));
    return [...result.filter(request => !existingIds.has(request.id!)), ...result.filter(request => existingIds.has(request.id!))];
  }
  return result;
}

export function reduceRequestMessage(current: RequestRecord[], message: { type: string; payload: unknown }): RequestRecord[] {
  if (!message.payload || typeof message.payload !== 'object' || Array.isArray(message.payload)) return current;
  const payload = message.payload as RequestRecord;
  if (message.type === 'INIT_REQUESTS') {
    if (!Array.isArray(payload.requests)) return current;
    const records = payload.requests.filter((request): request is RequestRecord =>
      !!request && typeof request === 'object' && !Array.isArray(request));
    return mergeRequestRecords(current, records, 'history');
  }
  if (!['NEW_REQUEST', 'UPDATE_REQUEST', 'CANCEL_REQUEST', 'RATE_REQUEST'].includes(message.type)) return current;
  const next = { ...payload };
  if (message.type === 'CANCEL_REQUEST' && !next.status) next.status = 'cancelled';
  if (message.type === 'UPDATE_REQUEST' && !next.status && typeof payload.estado === 'string') {
    next.status = payload.estado as RequestRecord['status'];
  }
  return mergeRequestRecords(current, [next]);
}
