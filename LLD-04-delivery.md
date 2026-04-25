# LLD-04 — Delivery Execution Domain

**Tagline:** The agent's hands on the ground. Owns every action from route activation through delivery confirmation — OTP, photos, stop transitions, and live GPS fan-out.

---

## 1. Scope

### Owns
- Stop status transitions: `arrived`, `delivered`, `failed` (D2 owns `heading_to`)
- OTP lifecycle: generate → send (mock) → verify → expire
- Photo upload to R2 (pre-delivery, open-box, POD)
- WebSocket gateway: agent GPS feed → Durable Object → customer tracking WebSockets
- Public tracking endpoint: `GET /track/:token` (milestone or live mode)
- KV tracking mode flag: `tracking:{orderId}` = `'live'` | `'milestone'` | `'done'`
- `customer_comms` log (records every notification sent)

### Does NOT Own
- Route creation or `heading_to` stop transition → D2
- Event log writes (except via `logEvent()` helper imported from D3) → D3
- Fare settlement → D5 (D4 publishes queue event; D5 acts on it)
- Order status at `placed`/`confirmed` → D1

---

## 2. Cloudflare Bindings

| Binding | Purpose |
|---|---|
| `DB` | D1 — reads/writes orders, route_stops, delivery_agents, customer_comms |
| `KV` | `tracking:{orderId}` mode flag; ETA cache (read) |
| `STORAGE` | R2 — photo uploads |
| `DELIVERY_SESSION_DO` | Durable Object namespace — one instance per active agent |
| `QUEUE_ORDER_DELIVERED` | Producer → fires when OTP verified |
| `QUEUE_ORDER_FAILED` | Producer → fires when stop marked failed |
| `HMAC_SECRET` | OTP hashing + tracking token generation |

---

## 3. Cross-Domain Contracts

### Reads from D2
```
GET /api/routes/:id/stops/:stopId  — validate stop ownership before mutation
```

### Calls D3 (direct import, no HTTP)
```ts
import { logEvent } from '../d3/lib/logger'

// D4 calls logEvent() for:
// stop.arrived, otp.requested, otp.verified, otp.failed,
// photo.uploaded, order.status_changed, order.delivered, order.failed
```

### Calls D5 (via queue)
```ts
// On OTP verified → publish QUEUE_ORDER_DELIVERED
// D5 consumer creates order_fares (settled) + partner_earnings records
```

### Produces (Queue)
```ts
{ type: 'order.delivered'; orderId; agentId; stopId; settledFare: 0 }
// settledFare: 0 at publish — D5 recalculates from actual distance

{ type: 'order.failed'; orderId; agentId; stopId; reason }
```

---

## 4. Data Model

### `orders` — columns written by D4
```sql
otp_code_hash  TEXT    -- HMAC-SHA256(secret, `${otp}:${orderId}`)
status         TEXT    -- 'in_transit' → 'delivered' | 'failed'
```

### `route_stops` — columns written by D4
```sql
status              TEXT  -- 'arrived' | 'delivered' | 'failed'
actual_arrival_at   TEXT  -- set on arrive
actual_departure_at TEXT  -- set on deliver/fail
failure_reason      TEXT  -- set on fail
```

### `customer_comms` — written by D4
```sql
id         TEXT PRIMARY KEY
order_id   TEXT NOT NULL REFERENCES orders(id)
channel    TEXT NOT NULL  -- 'sms' | 'email' | 'push'
event_type TEXT NOT NULL  -- 'otp.requested' | 'tracking.link' | 'delivered' | 'feedback.prompt'
recipient  TEXT NOT NULL
status     TEXT DEFAULT 'sent'
sent_at    TEXT DEFAULT (datetime('now'))
```

### KV schema
```
tracking:{orderId}  →  'live' | 'milestone' | 'done'   TTL: none (cleared on delivery)
```

---

## 5. API Reference

### PATCH `/api/routes/:id/stops/:stopId/arrive`
Agent taps "I've arrived". Activates OTP flow.

**Auth:** `agent` (own route only)

**Side effects:**
- `route_stops.status` → `arrived`, `actual_arrival_at` = now
- Logs `stop.arrived` event

**Response `200`:**
```json
{ "success": true, "stopId": "stop_xxx", "orderId": "ord_xxx" }
```

---

### POST `/api/routes/:id/stops/:stopId/otp/request`
Generate and "send" OTP to customer.

**Auth:** `agent` (own route only)

**Side effects:**
- Generates 6-digit OTP
- Hashes: `hmacSHA256(HMAC_SECRET, "${otp}:${orderId}")`
- Stores hash in `orders.otp_code_hash`
- Logs `otp.requested` event
- Inserts `customer_comms` record (channel: `sms`)
- In dev, returns OTP plaintext; in prod, sends to `customer_phone`

**Response `200`:**
```json
{
  "success": true,
  "otpSentTo": "+91-98000xxxxx",
  "__dev_otp": "482910"
}
```

---

### POST `/api/routes/:id/stops/:stopId/otp/verify`
Verify OTP entered by agent from customer.

**Auth:** `agent` (own route only)

**Request body:** `{ "otp": "482910" }`

**On match:**
- `route_stops.status` → `delivered`, `actual_departure_at` = now
- `orders.status` → `delivered`, `otp_code_hash` → null
- KV `tracking:{orderId}` → `'done'`
- DO `.closeOrderSockets(orderId, 'delivered')`
- Publishes `QUEUE_ORDER_DELIVERED`
- Logs `otp.verified`, `order.status_changed`, `order.delivered`

**On mismatch:**
- Logs `otp.failed` with `{ attempt: n }`
- Returns `{ success: false, message: "OTP incorrect" }`

**Response `200`:**
```json
{ "success": true, "orderId": "ord_xxx", "status": "delivered" }
```

---

### POST `/api/routes/:id/stops/:stopId/fail`
Mark a stop as failed.

**Auth:** `agent` (own route only)

**Request body:** `{ "reason": "customer not home" }`

**Side effects:**
- `route_stops.status` → `failed`, `failure_reason` = reason, `actual_departure_at` = now
- `orders.status` → `failed`
- KV `tracking:{orderId}` → `'done'`
- DO `.closeOrderSockets(orderId, 'failed')`
- Publishes `QUEUE_ORDER_FAILED`
- Logs `order.status_changed`, `order.failed`

**Response `200`:**
```json
{ "success": true, "orderId": "ord_xxx", "status": "failed" }
```

---

### POST `/api/orders/:orderId/photos`
Upload a delivery photo to R2.

**Auth:** `agent`

**Request:** `multipart/form-data` — fields: `file` (binary), `stage` (string)

Valid stages: `pre_delivery` | `open_box` | `pod` (proof of delivery)

**R2 key:** `photos/{tenantId}/{orderId}/{stage}/{timestamp}.jpg`

**Side effects:**
- Stores blob in R2
- Logs `photo.uploaded` with `{ stage, r2Key }`

**Response `201`:**
```json
{ "r2Key": "photos/dev_tenant/ord_xxx/pod/1745000000000.jpg" }
```

---

### GET `/ws/agent?agentId=:agentId`
Open the agent's GPS WebSocket. Routes to `DELIVERY_SESSION_DO` named by `agentId`.

**Auth:** `agent` (JWT in query string `?token=...` since WebSocket headers are limited)

**Protocol:** WebSocket. Agent sends GPS pings:
```json
{ "lat": 19.0596, "lng": 72.8295, "speed": 28, "heading": 45 }
```

The DO fans out each ping to all subscribed customer sockets.

D4 samples 1 in 10 pings → `logEvent('agent.gps_ping', ...)`.

---

### GET `/ws/customer?orderId=:orderId&agentId=:agentId`
Open a customer read-only WebSocket for live tracking.

**Auth:** Public (tracking token validated via query param `token=...`)

Receives GPS frames: `{ event: 'gps', lat, lng, ts }` or terminal `{ event: 'delivered' }`.

---

### GET `/track/:token`
Public order tracking. No auth.

**Response:**
```json
{
  "mode": "live",
  "order": {
    "id": "ord_xxx",
    "status": "in_transit",
    "customerName": "Priya Mehta",
    "address": "14 Palm Beach Road, Juhu",
    "trackingToken": "tk_xxx"
  },
  "agentId": "agent_ravi",
  "agentName": "Ravi Sharma",
  "agentPhoto": null,
  "eta": "2026-04-25T11:30:00Z",
  "statusTimeline": [
    { "status": "placed",    "ts": "2026-04-25T08:00:00Z" },
    { "status": "in_transit","ts": "2026-04-25T10:00:00Z" }
  ]
}
```

Mode is `'live'` when KV `tracking:{orderId}` = `'live'`, otherwise `'milestone'`.

---

## 6. Durable Object (DeliverySessionDO)

Already implemented in `src/domains/d4/durable-object.ts`. Key behaviour:

```
Agent WS connect → handleAgentSocket()
  GPS message → broadcastGPS() → all subscriber sockets

Customer WS connect → handleCustomerSocket(orderId)
  Gets last known GPS immediately
  Added to subscribers[orderId]

closeOrderSockets(orderId, 'delivered'|'failed')
  Sends terminal event + closes all sockets for that order
```

One DO instance per `agentId`. Named `DELIVERY_SESSION_DO.get(id)` where `id = stub.idFromName(agentId)`.

---

## 7. OTP Design

```
Generate: crypto.getRandomValues → 6-digit number
Hash:     hmacSHA256(HMAC_SECRET, `${otp}:${orderId}`)
Store:    orders.otp_code_hash = hash
Verify:   hash(input) === otp_code_hash
Expire:   otp_code_hash cleared on deliver or after 10 min (Workflow handles expiry)
```

No OTP stored in plaintext anywhere. The hash in DB is sufficient for verification.

---

## 8. File Structure

```
backend/src/domains/d4/
├── routes.ts           ← Hono router (arrive, OTP, fail, photos, WS, /track/:token)
├── types.ts            ← OTP body, photo stage enum, WS frame types
└── durable-object.ts   ← DeliverySessionDO (already implemented)

backend/src/domains/d3/
└── lib/
    └── logger.ts       ← logEvent() shared helper (new — imported by D4)
```

---

## 9. Frontend Integration

### Agent PWA (`AgentHome.tsx`)

Extend `StopSheet` bottom sheet with the full delivery flow:

```
[ heading_to stop ]
    ↓ arrive button
[ arrived ]
    ↓ request OTP button
[ OTP sent — enter 6 digits ]
    ↓ verify / fail buttons
[ delivered ✓ ] or [ failed ✗ ]
```

API calls:
```ts
d4Api.arrive(token, routeId, stopId)
d4Api.requestOtp(token, routeId, stopId)
d4Api.verifyOtp(token, routeId, stopId, otp)
d4Api.failStop(token, routeId, stopId, reason)
```

### Customer Tracking (`TrackingPage.tsx`)

Calls `GET /track/:token`. Shows milestone timeline. If `mode === 'live'`, opens WebSocket to `/ws/customer?orderId=...&agentId=...` and renders agent location on a map stub.

### API types (`frontend/src/lib/api.ts`)

```ts
export const d4Api = {
  arrive:     (token, routeId, stopId) => ...
  requestOtp: (token, routeId, stopId) => ...
  verifyOtp:  (token, routeId, stopId, otp) => ...
  failStop:   (token, routeId, stopId, reason) => ...
  uploadPhoto:(token, orderId, file, stage) => ...
}
```
