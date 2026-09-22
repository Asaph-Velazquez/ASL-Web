# Transport WebSocket Contract

Transport proposal operations apply to requests with `details.serviceType: "taxi"`
and status `pending` or `in-progress`. All input messages use a top-level
`operationId` (a unique string of letters, digits, underscores or hyphens, max 100).

```json
{"type":"PUBLISH_TRANSPORT_OPTIONS","operationId":"op-1","payload":{"id":"request-id","options":[{"id":"option-1","vehicleType":"car","vehicleCount":2,"totalCapacity":8,"priceCents":12345}]}}
{"type":"ACCEPT_TRANSPORT_OPTION","operationId":"op-2","payload":{"id":"request-id","revision":1,"optionId":"option-1"}}
{"type":"ASSIGN_TRANSPORT_VEHICLES","operationId":"op-3","payload":{"id":"request-id","revision":1,"vehicles":[{"vehiclePlate":"AAA-1","vehicleModel":"Sedan","vehicleColor":"Blue"},{"vehiclePlate":"AAA-2","vehicleModel":"Sedan"}]}}
```

Publish and assign require staff. Accept requires a guest from the request's own
stay. Option IDs may be omitted on publication; the server generates them.
Counts/capacity are positive integers and prices are nonnegative safe integer cents.
Each option may include `description`, a trimmed plain-text string of 1-240
characters (no angle brackets or control characters). It is broadcast with the
option and retained in the accepted snapshot and revision archive. Omit the field
when no description is provided; older options remain compatible.
Capacity must cover the request's passengers. Assignment must contain the accepted
number of vehicles, with distinct plates.

Successful mutations persist atomically before broadcasting `UPDATE_REQUEST` with
the persisted request, `id`, and full `details`, only to staff and sockets belonging
to the owning stay. Generic request updates, creation, cancellation and rating use
the same scope; requests without a stay are staff-only. The requesting socket receives:

```json
{"type":"TRANSPORT_RESULT","payload":{"operationId":"op-2","ok":true}}
{"type":"TRANSPORT_RESULT","payload":{"operationId":"op-2","ok":false,"error":"Stale transport revision"}}
```

Stale revisions and write conflicts also send the current `UPDATE_REQUEST` to the
authorized requester before the failure result. Refresh state before retrying.
Repeating acceptance of the same option/revision is idempotent; changing the
accepted option requires a new publication. Publication itself is not idempotent.

Each publication increments `details.transportProposals.revision`, archives the
previous publication, acceptance and response together in `details.transportArchive`,
and clears acceptance/assignment. Acceptance stores an immutable snapshot at
`details.transportAcceptance.option`. Assignment stores `vehicles`, first-vehicle
`vehiclePlate`/`vehicleModel`, a decimal-string `transportCost` derived from accepted
cents (e.g. `"123.45"`), and server `updatedAt`/`updatedBy` in `transportResponse`.

Generic `UPDATE_REQUEST` cannot replace or clear proposal/acceptance/archive state.
For quoted requests, responses and accepted costs are also protected. Legacy valet
and unquoted taxi responses can still be merged by staff, including on completed
requests, but not cancelled requests. Historical immediate taxis remain readable
and editable. New taxis must use `timeMode: "scheduled"` and `scheduledAt` as an ISO
date/time at least 24 hours ahead of server time; `timeMode: "now"` is rejected.

For initial taxi creation, send the ordinary `NEW_REQUEST` with a top-level
`operationId`. After persistence, the server broadcasts `NEW_REQUEST` and returns
the same `TRANSPORT_RESULT` envelope. Validation/persistence failures return
`ok: false`. Legacy creation without `operationId` does not get a correlated result.
Retry with the same request ID and original business payload: an owning guest gets
idempotent success without overwriting the request or appending history, even after
staff edits or crossing the 24-hour boundary. Lookup/matching precedes schedule
validation. Server lifecycle fields and retry timestamps are not part of the match.
Other owners or changed business payloads are rejected. Initial requests still
cannot seed any transport state. An internal fingerprint records original creation
input and is excluded from socket payloads. Pre-fingerprint records can only match
their currently stored business payload conservatively.

`CANCEL_REQUEST` keeps its existing action/envelope (`payload.id`, with `requestId`
also accepted). Only staff or the owning stay may cancel. Completed requests cannot
be cancelled; repeated cancellation is idempotent. Rejected terminal-state
cancellations send current `UPDATE_REQUEST` so optimistic clients can reconcile.

Run `npm test`. Where subprocesses are sandbox-restricted, use
`node --test --experimental-test-isolation=none`. Tests use an atomic in-memory
repository plus Mongoose schema validation; they do not require a running MongoDB.
