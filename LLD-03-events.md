# LLD-03 — Delivery Events & Audit Domain

**Tagline:** Immutable observer. Every action by every actor hits this domain. It never initiates — it only records.

---

## 1. Scope

### Owns
- `delivery_events` table — append-only, immutable event log
- Structured event timeline per order (seller, admin, agent, customer views)
- Queue consumer for events published by D1, D2, D4
- HTTP endpoint to append events internally (called by D4 on GPS ping, OTP attempt, photo upload)
- Public audit trail retrieval per order

### Does NOT Own
- Order status transitions → D1 (D3 records the transition, does not trigger it)
- Route stop status → D2/D4
- GPS fan-out WebSocket → D4
- Fare records → D5
- Any write to `orders`, `routes`, or `route_stops`

---

## 2. Cloudflare Bindings

| Binding | Purpose |
|---|---|
| `DB` | D1 — delivery_events |
| `QUEUE_ORDER_CREATED` | Consumer — writes `order.created` event |
| `QUEUE_AGENT_ASSIGNED` | Consumer — writes `agent.assigned` event |
| `QUEUE_ROUTE_ACTIVATED` | Consumer — writes `route.activated` event |
| `QUEUE_STOP_DEPARTED` | Consumer — writes `stop.departed` event |
| `QUEUE_ORDER_DELIVERED` | Consumer — writes `order.delivered` event |
| `QUEUE_ORDER_FAILED` | Consumer — writes `order.failed` event |

> D3 is a multi-queue consumer. In Cloudflare Workers, bind multiple queues to the same worker and dispatch by `event.body.type` in the `queue` handler.

---

## 3. Cross-Domain Contracts

### Consumes (all Queue events)
```ts
type InboundEvent =
  | OrderCreatedMessage       // from D1
  | AgentAssignedMessage      // from D2
  | RouteActivatedMessage     // from D2
  | StopDepartedMessage       // from D2
  | OrderDeliveredMessage     // from D4
  | OrderFailedMessage        // from D4

// All defined in src/types.ts
```

### HTTP API consumed by other domains
```
POST /api/events          ← D4 calls for GPS pings, OTP attempts, photo uploads
GET  /api/orders/:id/events     ← admin / seller / D5 audit retrieval
GET  /api/orders/:id/timeline   ← seller-friendly milestone view
```

### Produces nothing
D3 is write-only from the event side. It never publishes to any queue.

### Mock Adapters
```ts
// src/domains/d3/mock/events.ts
// Inserts a realistic event history for a demo order
export async function seedDemoEvents(db: D1Database, orderId: string): Promise<void>
```

---

## 4. Data Model

### `delivery_events`
```sql
-- Owns: D3 (append-only; no UPDATE or DELETE ever)
CREATE TABLE IF NOT EXISTS delivery_events (
  id          TEXT PRIMARY KEY,        -- evt_{nanoid()}
  order_id    TEXT NOT NULL REFERENCES orders(id),
  agent_id    TEXT REFERENCES delivery_agents(id),
  actor_type  TEXT NOT NULL CHECK (actor_type IN ('system','seller','admin','agent','customer')),
  event_type  TEXT NOT NULL,
  --  Structured event types (see Event Taxonomy below)
  lat         REAL,
  lng         REAL,
  metadata    TEXT NOT NULL DEFAULT '{}',  -- JSON; event-specific payload
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_events_order    ON delivery_events(order_id, created_at);
CREATE INDEX IF NOT EXISTS idx_events_agent    ON delivery_events(agent_id, created_at);
CREATE INDEX IF NOT EXISTS idx_events_type     ON delivery_events(event_type, created_at);
```

### Event Taxonomy
```
order.created              — D1 → Q → D3
order.status_changed       — D1/D4 → internal POST /api/events
agent.assigned             — D2 → Q → D3
route.activated            — D2 → Q → D3
stop.departed              — D2 → Q → D3
agent.gps_ping             — D4 → POST /api/events (sampled: 1 in 10)
stop.arrived               — D4 → POST /api/events
otp.requested              — D4 → POST /api/events
otp.verified               — D4 → POST /api/events
otp.failed                 — D4 → POST /api/events
photo.uploaded             — D4 → POST /api/events
order.delivered            — D4 → Q → D3
order.failed               — D4 → Q → D3
order.rescheduled          — D4 → POST /api/events
feedback.submitted         — D5 → POST /api/events
fare.settled               — D5 → POST /api/events
```

### TypeScript Row + Payload Types
```ts
// src/domains/d3/types.ts

export interface DeliveryEventRow {
  id: string
  order_id: string
  agent_id: string | null
  actor_type: ActorType
  event_type: EventType
  lat: number | null
  lng: number | null
  metadata: string  // JSON
  created_at: string
}

export type ActorType = 'system' | 'seller' | 'admin' | 'agent' | 'customer'

export type EventType =
  | 'order.created'         | 'order.status_changed'    | 'order.delivered'
  | 'order.failed'          | 'order.rescheduled'        | 'agent.assigned'
  | 'route.activated'       | 'stop.departed'            | 'stop.arrived'
  | 'agent.gps_ping'        | 'otp.requested'            | 'otp.verified'
  | 'otp.failed'            | 'photo.uploaded'           | 'feedback.submitted'
  | 'fare.settled'

// Typed metadata per event
export type EventMetadata =
  | { event: 'order.created';       sellerId: string; quotedFare: number }
  | { event: 'order.status_changed'; from: string; to: string; triggeredBy: string }
  | { event: 'agent.assigned';      agentId: string; routeId: string; stopId: string }
  | { event: 'route.activated';     agentId: string; stopCount: number }
  | { event: 'stop.departed';       etaSeconds: number; trackingToken: string }
  | { event: 'stop.arrived' }
  | { event: 'agent.gps_ping';      speed?: number; heading?: number }
  | { event: 'otp.requested';       expiresAt: string }
  | { event: 'otp.verified' }
  | { event: 'otp.failed';          attempt: number }
  | { event: 'photo.uploaded';      stage: string; r2Key: string }
  | { event: 'order.delivered';     settledFare: number }
  | { event: 'order.failed';        reason: string }
  | { event: 'fare.settled';        settledFare: number; partnerPayout: number }
  | { event: 'feedback.submitted';  rating: number; fromActor: ActorType }
```

---

## 5. API Reference

### POST `/api/events`
Append a single event. Called by D4 for in-flight events (GPS, OTP, photo).

**Auth:** `internal` (`X-Internal-Token`) or `agent`/`admin`

**Request body:**
```json
{
  "orderId": "order_d01",
  "agentId": "agent_demo01",
  "actorType": "agent",
  "eventType": "otp.verified",
  "lat": 19.0596,
  "lng": 72.8295,
  "metadata": {}
}
```

**Response `201`:**
```json
{ "eventId": "evt_xyz123" }
```

**Key rules:**
- Never update or delete — only `INSERT`
- `gps_ping` events: caller is responsible for sampling (D4 sends 1 in 10 pings to this endpoint; all pings still go to the DO)
- Unknown `eventType` values are accepted (no strict enum enforcement here — taxonomy enforcement is at the writer level)

---

### GET `/api/orders/:id/events`
Full raw event log for an order, newest first.

**Auth:** `admin`, `dispatcher`, `seller` (own orders only)

**Query params:** `limit` (default 100), `cursor`, `eventType` (filter)

**Response:**
```json
{
  "orderId": "order_d01",
  "events": [
    {
      "id": "evt_abc",
      "actorType": "agent",
      "eventType": "otp.verified",
      "lat": 19.0596,
      "lng": 72.8295,
      "metadata": {},
      "createdAt": "2026-04-26T11:32:00Z"
    }
  ],
  "nextCursor": null
}
```

---

### GET `/api/orders/:id/timeline`
Milestone-only view. Returns the key state transitions in chronological order. Used by seller dashboard and customer tracking page.

**Auth:** Public (no auth required — used via tracking token); or authenticated

**Response:**
```json
{
  "orderId": "order_d01",
  "milestones": [
    { "status": "placed",            "label": "Order Placed",           "at": "2026-04-26T08:00:00Z", "done": true },
    { "status": "confirmed",         "label": "Order Confirmed",        "at": "2026-04-26T08:05:00Z", "done": true },
    { "status": "packed",            "label": "Packed at Warehouse",    "at": "2026-04-26T09:00:00Z", "done": true },
    { "status": "out_for_delivery",  "label": "Out for Delivery",       "at": "2026-04-26T09:30:00Z", "done": true },
    { "status": "in_transit",        "label": "Agent En Route",         "at": "2026-04-26T10:15:00Z", "done": true },
    { "status": "delivered",         "label": "Delivered",              "at": null,                   "done": false }
  ]
}
```

**Implementation:** Query `delivery_events` for `order.status_changed` events, map status values to human labels.

---

### GET `/api/agents/:id/events`
Agent activity log. Used by admin performance view.

**Auth:** `admin`, `dispatcher`

**Query:** `date` (YYYY-MM-DD), `limit`

**Response:** `{ events: DeliveryEventRow[] }`

---

## 6. Queue Consumer

```ts
// src/domains/d3/consumer.ts

export async function handleQueue(
  batch: MessageBatch<QueueMessage>,
  env: Env,
): Promise<void> {
  const stmts = batch.messages.map((msg) => buildInsertStmt(env.DB, msg.body))
  await env.DB.batch(stmts)
  batch.ackAll()
}

function buildInsertStmt(db: D1Database, msg: QueueMessage): D1PreparedStatement {
  const id = `evt_${nanoid()}`
  const meta = buildMetadata(msg)
  return db.prepare(
    `INSERT INTO delivery_events (id, order_id, agent_id, actor_type, event_type, metadata)
     VALUES (?, ?, ?, 'system', ?, ?)`,
  ).bind(id, msg.orderId, agentId(msg), msg.type, JSON.stringify(meta))
}
```

---

## 7. Demo Setup

### Seed SQL (`src/domains/d3/seed/demo.sql`)
This seed inserts a complete, realistic event history for `order_d01` so the timeline and audit trail are demo-ready without running the full pipeline.

```sql
-- Full lifecycle for order_d01 (from D1 seed)
INSERT OR IGNORE INTO delivery_events (id, order_id, agent_id, actor_type, event_type, metadata, created_at) VALUES
  ('evt_d01_01', 'order_d01', NULL,           'system',   'order.created',         '{"sellerId":"seller_demo01","quotedFare":87.50}',          datetime('now', '-4 hours')),
  ('evt_d01_02', 'order_d01', NULL,           'system',   'order.status_changed',  '{"from":"placed","to":"confirmed","triggeredBy":"workflow"}',datetime('now', '-3 hours 55 minutes')),
  ('evt_d01_03', 'order_d01', 'agent_demo01', 'system',   'agent.assigned',        '{"agentId":"agent_demo01","routeId":"route_demo01"}',       datetime('now', '-3 hours 50 minutes')),
  ('evt_d01_04', 'order_d01', NULL,           'system',   'order.status_changed',  '{"from":"confirmed","to":"packed","triggeredBy":"workflow"}',datetime('now', '-3 hours')),
  ('evt_d01_05', 'order_d01', NULL,           'system',   'route.activated',       '{"agentId":"agent_demo01","stopCount":5}',                  datetime('now', '-2 hours')),
  ('evt_d01_06', 'order_d01', 'agent_demo01', 'agent',    'stop.departed',         '{"etaSeconds":1800,"trackingToken":"tk_demo01"}',           datetime('now', '-1 hour 30 minutes')),
  ('evt_d01_07', 'order_d01', 'agent_demo01', 'agent',    'agent.gps_ping',        '{"speed":28,"heading":45}',                                 datetime('now', '-1 hour 20 minutes')),
  ('evt_d01_08', 'order_d01', 'agent_demo01', 'agent',    'stop.arrived',          '{}',                                                        datetime('now', '-45 minutes')),
  ('evt_d01_09', 'order_d01', 'agent_demo01', 'agent',    'otp.requested',         '{"expiresAt":"2026-04-26T11:00:00Z"}',                      datetime('now', '-44 minutes')),
  ('evt_d01_10', 'order_d01', 'agent_demo01', 'agent',    'otp.verified',          '{}',                                                        datetime('now', '-40 minutes')),
  ('evt_d01_11', 'order_d01', 'agent_demo01', 'system',   'order.delivered',       '{"settledFare":92.00}',                                     datetime('now', '-40 minutes'));
```

### Demo Flow
```bash
# 1. View full audit trail
curl http://localhost:8787/api/orders/order_d01/events \
  -H "Authorization: Bearer <admin_token>"

# 2. View seller-friendly timeline
curl http://localhost:8787/api/orders/order_d01/timeline

# 3. Append a test event
curl -X POST http://localhost:8787/api/events \
  -H "X-Internal-Token: <HMAC_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"orderId":"order_d01","actorType":"agent","eventType":"otp.failed","metadata":{"attempt":1}}'
```

---

## 8. File Structure

```
backend/src/domains/d3/
├── routes.ts          ← Hono router (POST /api/events, GET /api/orders/:id/events, GET /api/orders/:id/timeline)
├── consumer.ts        ← handleQueue() — all domain queues → delivery_events
├── types.ts           ← DeliveryEventRow, EventType, ActorType, EventMetadata union
├── lib/
│   └── timeline.ts    ← buildTimeline() — maps events to milestone structs
├── mock/
│   └── events.ts      ← seedDemoEvents()
└── seed/
    └── demo.sql
```

---

## 9. Coding Conventions

### Immutability guarantee
```ts
// No UPDATE or DELETE anywhere in D3 — enforced by code review
// Only INSERT is permitted in delivery_events
// If a correction is needed, insert a new event with eventType: 'correction' and reference the original
```

### Event metadata
```ts
// Always JSON.stringify before insert; JSON.parse in the query response handler
// Never store metadata as separate columns — keep the table schema stable

function serializeMeta<T>(meta: T): string {
  return JSON.stringify(meta)
}
```

### Queue consumer batching
```ts
// Use DB.batch() for all queue messages — one round trip per batch
const stmts = batch.messages.map(/* build statement */)
await env.DB.batch(stmts)
batch.ackAll()  // ack only after successful DB write
```

### Timeline rendering
```ts
// src/domains/d3/lib/timeline.ts
const STATUS_LABELS: Record<string, string> = {
  placed:           'Order Placed',
  confirmed:        'Order Confirmed',
  packed:           'Packed at Warehouse',
  out_for_delivery: 'Out for Delivery',
  in_transit:       'Agent En Route',
  delivered:        'Delivered',
  failed:           'Delivery Attempted',
  rescheduled:      'Rescheduled',
}
// Map `order.status_changed` events in chronological order → milestone array
// Mark milestones as done if the timestamp is in the past
```

### Sampling GPS pings
- D4 sends 1 in every 10 GPS pings to `POST /api/events` with type `agent.gps_ping`
- The DO receives all pings; D3 stores only sampled ones to keep the event log readable
- Sampling counter lives in the DO — D4 owns this decision

### Tests
```ts
// src/domains/d3/__tests__/timeline.test.ts
import { buildTimeline } from '../lib/timeline'

it('marks all milestones before delivered as done', () => {
  const events = [/* status_changed events */]
  const timeline = buildTimeline(events)
  const delivered = timeline.find(m => m.status === 'delivered')
  expect(delivered?.done).toBe(false)
  expect(timeline.filter(m => m.done).length).toBe(5)
})
```
