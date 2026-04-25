# LLD-02 — Dispatch & Route Ops Domain

**Tagline:** Every agent gets the right stops in the right order. Route planning, TSP optimization, agent management, and order-to-agent assignment.

> **Status:** Core routes implemented in `src/domains/d2/`. This LLD covers what exists and what remains.

---

## 1. Scope

### Owns
- `delivery_agents` table — agent profiles, availability, GPS home position
- `routes` table — planned / active / completed daily routes
- `route_stops` table — per-stop sequencing, ETA, status up to `heading_to`
- `hubs` table — warehouse/hub coordinates (shared read, D2 owns writes)
- Route creation and nearest-neighbour TSP optimization
- Agent availability and zone assignment
- `OrderLifecycleWorkflow` — durable auto-assignment pipeline
- `order.created` queue consumer → triggers the workflow
- `route.activated` queue event → published when route goes live

### Does NOT Own
- Order intake or status at `placed`/`confirmed` → D1
- GPS fan-out and WebSocket → D4
- OTP and stop completion (`arrived`, `delivered`, `failed`) → D4
- Fare settlement → D5
- Delivery event log → D3

---

## 2. Cloudflare Bindings

| Binding | Purpose |
|---|---|
| `DB` | D1 — routes, route_stops, delivery_agents, hubs |
| `KV` | ETA cache per stop (`eta:stop:{stopId}`, TTL 10 min) |
| `AI` | Workers AI — reserved for future ML-based ETA; currently unused (nearest-neighbour is local) |
| `QUEUE_ORDER_CREATED` | Consumer → triggers OrderLifecycleWorkflow |
| `QUEUE_AGENT_ASSIGNED` | Producer → fired after workflow assigns agent |
| `QUEUE_ROUTE_ACTIVATED` | Producer → fired when dispatcher activates route |
| `ORDER_LIFECYCLE_WORKFLOW` | Durable Workflows — auto-assignment pipeline |

---

## 3. Cross-Domain Contracts

### Consumes (Queue)
```ts
// Fired by D1 when a new order is created
{ type: 'order.created'; orderId: string; tenantId: string; hubId: string; createdAt: string }
```

### Produces (Queue)
```ts
// After workflow assigns an agent
{ type: 'agent.assigned'; orderId: string; agentId: string; routeId: string; stopId: string }

// After dispatcher activates a route
{ type: 'route.activated'; routeId: string; agentId: string; hubId: string; stopCount: number }
```

### HTTP used by other domains
```
GET  /api/routes/:id            ← D4 reads stop list for agent PWA
GET  /api/routes/:id/stops/:stopId ← D4 reads single stop
PATCH /api/routes/:id/stops/:stopId/status ← D4 updates stop to heading_to
```

### Mock Adapters
```ts
// src/domains/d2/mock/orders.ts
// Returns demo orders when D1 is not populated
export function mockOrdersForHub(hubId: string): DemoOrder[]

// src/domains/d2/mock/ai-eta.ts
// Returns deterministic ETAs (30 km/h average) without calling Workers AI
export function mockComputeETAs(startTime: Date, result: OptimizeResult): Map<string, Date>
```

---

## 4. Data Model

### `hubs`
```sql
-- Owns: D2 (read by all domains)
CREATE TABLE IF NOT EXISTS hubs (
  id         TEXT PRIMARY KEY,      -- hub_{nanoid()}
  tenant_id  TEXT NOT NULL,
  name       TEXT NOT NULL,
  address    TEXT NOT NULL,
  lat        REAL NOT NULL,
  lng        REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### `delivery_agents`
```sql
-- Owns: D2
CREATE TABLE IF NOT EXISTS delivery_agents (
  id             TEXT PRIMARY KEY,  -- agent_{nanoid()}
  tenant_id      TEXT NOT NULL,
  clerk_user_id  TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  phone          TEXT,
  photo_url      TEXT,
  vehicle_type   TEXT NOT NULL DEFAULT 'bike'
                   CHECK (vehicle_type IN ('bike','scooter','van','cycle')),
  hub_id         TEXT REFERENCES hubs(id),
  current_lat    REAL,
  current_lng    REAL,
  last_seen_at   TEXT,
  status         TEXT NOT NULL DEFAULT 'offline'
                   CHECK (status IN ('available','on_route','offline')),
  commission_pct REAL NOT NULL DEFAULT 80,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### `routes`
```sql
-- Owns: D2
CREATE TABLE IF NOT EXISTS routes (
  id                      TEXT PRIMARY KEY,  -- route_{nanoid()}
  tenant_id               TEXT NOT NULL,
  agent_id                TEXT REFERENCES delivery_agents(id),
  hub_id                  TEXT NOT NULL REFERENCES hubs(id),
  date                    TEXT NOT NULL,        -- YYYY-MM-DD
  status                  TEXT NOT NULL DEFAULT 'planned'
                            CHECK (status IN ('planned','active','completed')),
  optimized_sequence      TEXT NOT NULL DEFAULT '[]',  -- JSON: stop IDs in order
  total_distance_km       REAL NOT NULL DEFAULT 0,
  estimated_duration_mins INTEGER NOT NULL DEFAULT 0,
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### `route_stops`
```sql
-- Owns: D2 (creates + sequences); D4 updates status to arrived/delivered/failed
CREATE TABLE IF NOT EXISTS route_stops (
  id                    TEXT PRIMARY KEY,  -- stop_{nanoid()}
  route_id              TEXT NOT NULL REFERENCES routes(id),
  order_id              TEXT NOT NULL REFERENCES orders(id),
  sequence_no           INTEGER NOT NULL,
  status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN (
                            'pending',      -- waiting to depart
                            'heading_to',   -- agent en-route → live GPS activates (D4)
                            'arrived',      -- agent at door  → OTP triggered (D4)
                            'delivered',    -- OTP matched    (D4)
                            'failed'        -- OTP failed / refused (D4)
                          )),
  eta                   TEXT,              -- ISO 8601; cached in KV
  actual_arrival_at     TEXT,
  actual_departure_at   TEXT,
  failure_reason        TEXT,
  distance_from_prev_km REAL NOT NULL DEFAULT 0,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### TypeScript Row Types
```ts
// src/domains/d2/types.ts

export interface HubRow {
  id: string; tenant_id: string; name: string
  address: string; lat: number; lng: number; created_at: string
}

export interface AgentRow {
  id: string; tenant_id: string; clerk_user_id: string
  name: string; phone: string | null; photo_url: string | null
  vehicle_type: VehicleType; hub_id: string | null
  current_lat: number | null; current_lng: number | null
  last_seen_at: string | null; status: AgentStatus
  commission_pct: number; created_at: string; updated_at: string
}

export type AgentStatus  = 'available' | 'on_route' | 'offline'
export type VehicleType  = 'bike' | 'scooter' | 'van' | 'cycle'
export type RouteStatus  = 'planned' | 'active' | 'completed'
export type StopStatus   = 'pending' | 'heading_to' | 'arrived' | 'delivered' | 'failed'

export interface RouteRow {
  id: string; tenant_id: string; agent_id: string | null
  hub_id: string; date: string; status: RouteStatus
  optimized_sequence: string   // JSON string
  total_distance_km: number; estimated_duration_mins: number
  created_at: string; updated_at: string
}

export interface RouteStopRow {
  id: string; route_id: string; order_id: string
  sequence_no: number; status: StopStatus
  eta: string | null; actual_arrival_at: string | null
  actual_departure_at: string | null; failure_reason: string | null
  distance_from_prev_km: number; created_at: string; updated_at: string
}
```

---

## 5. API Reference

Router exported from `src/domains/d2/routes.ts`, mounted as `app.route('/', d2)`.

### GET `/api/routes`
List routes by date/hub/status.

**Auth:** `admin`, `dispatcher`, `agent`

**Query:** `hubId`, `date` (YYYY-MM-DD), `status`, `limit`

**Response:**
```json
{
  "routes": [
    {
      "id": "route_abc",
      "date": "2026-04-26",
      "status": "planned",
      "agentId": null,
      "totalDistanceKm": 34.2,
      "estimatedDurationMins": 185,
      "stopCount": 8
    }
  ]
}
```

---

### GET `/api/routes/:id`
Full route with all stops and order details. ✅ Implemented.

**Auth:** `admin`, `dispatcher`, `agent` (agent sees own routes only)

**Response:** `RouteRow` + `stops[]` with joined order data.

---

### POST `/api/routes/optimize`
Create a new route for a hub + date and run TSP. ✅ Implemented.

**Auth:** `admin`, `dispatcher`

**Request:**
```json
{ "hubId": "hub_demo01", "date": "2026-04-26", "agentId": "agent_x01" }
```

**Response `201`:** Full route object with ordered stops and ETAs.

**Algorithm:** Nearest-neighbour TSP from `src/domains/d2/optimizer.ts`. Average speed 30 km/h, service time 5 min/stop.

---

### PATCH `/api/routes/:id/activate`
Assign agent and flip route to `active`. ✅ Implemented.

**Auth:** `admin`, `dispatcher`

**Request:** `{ "agentId": "agent_x01" }`

**Side effects:**
- `routes.status` → `active`
- All pending `orders.status` → `out_for_delivery`
- `delivery_agents.status` → `on_route`
- Publishes `route.activated` to queue

---

### GET `/api/agents`
List agents by hub/status. ✅ Implemented.

**Auth:** `admin`, `dispatcher`

---

### PATCH `/api/agents/:id/status`
Update agent availability. ✅ Implemented.

**Auth:** `admin`, `dispatcher`, `agent` (own only)

---

### POST `/api/agents`
Register a new agent.

**Auth:** `admin`

**Request:**
```json
{
  "clerkUserId": "user_abc",
  "name": "Raj Kumar",
  "phone": "+919876540010",
  "vehicleType": "bike",
  "hubId": "hub_demo01",
  "commissionPct": 80
}
```

**Response `201`:** `AgentRow`

---

### GET `/api/routes/:id/stops/:stopId`
Get a single stop with order details. Called by D4.

**Auth:** `admin`, `dispatcher`, `agent`

**Response:**
```json
{
  "stopId": "stop_abc",
  "sequenceNo": 3,
  "status": "pending",
  "eta": "2026-04-26T10:45:00Z",
  "distanceFromPrevKm": 2.1,
  "order": { ...OrderRow }
}
```

---

### PATCH `/api/routes/:id/stops/:stopId/status`
Called by D4 to mark a stop `heading_to`. D4 owns `arrived`, `delivered`, `failed`.

**Auth:** `internal` (`X-Internal-Token`) or `agent`

**Request:** `{ "status": "heading_to" }`

**Side effects:**
- `route_stops.status` → `heading_to`
- `orders.status` → `in_transit`
- Publishes `stop.departed` to `QUEUE_STOP_DEPARTED` with tracking token + ETA

---

### GET `/api/hubs`
List hubs for tenant.

**Auth:** `admin`, `dispatcher`

---

### POST `/api/hubs`
Create a hub.

**Auth:** `admin`

**Request:** `{ "name": string, "address": string, "lat": number, "lng": number }`

---

## 6. Key Algorithms

### Nearest-Neighbour TSP (`src/domains/d2/optimizer.ts` — ✅ exists)

```ts
export interface OptimizeResult {
  sequence: string[]          // ordered stop IDs
  totalDistanceKm: number
  estimatedDurationMins: number
  segmentDistances: number[]
}

export function optimizeRoute(
  hubLat: number, hubLng: number,
  stops: { id: string; lat: number; lng: number }[]
): OptimizeResult

export function computeETAs(
  startTime: Date,
  result: OptimizeResult
): Map<string, Date>     // stopId → ETA

export function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number
```

- Time complexity: O(n²) — sufficient for ≤ 50 stops per route
- Average speed: `30 km/h`, service time per stop: `5 min`

### Auto-Assignment Workflow (`src/domains/d2/workflow.ts` — ✅ exists)

Steps (each is durable via `step.do`):
1. Load order + hub from D1
2. Confirm order (`placed` → `confirmed`)
3. Find closest available agent at hub
4. Find or create today's route for that agent
5. Add stop to route
6. Re-run TSP on all pending stops
7. Cache ETAs in KV
8. Mark order `packed`
9. Publish `agent.assigned`

If no agent is free: re-enqueues `order.created` with a delay (Workflow will retry).

---

## 7. Demo Setup

### Seed SQL (`src/domains/d2/seed/demo.sql`)
```sql
-- Depends on hub_demo01 from D1 seed

-- Demo agents
INSERT OR IGNORE INTO delivery_agents (id, tenant_id, clerk_user_id, name, phone, vehicle_type, hub_id, status, commission_pct)
VALUES
  ('agent_demo01', 'tenant_demo', 'user_demo_agent1', 'Ravi Sharma',  '+919876541001', 'bike',    'hub_demo01', 'available', 80),
  ('agent_demo02', 'tenant_demo', 'user_demo_agent2', 'Kiran Patil',  '+919876541002', 'scooter', 'hub_demo01', 'available', 80),
  ('agent_demo03', 'tenant_demo', 'user_demo_agent3', 'Suresh Nair',  '+919876541003', 'bike',    'hub_demo01', 'offline',   80);
```

### Demo Flow
```bash
# 1. After running D1 seed (orders exist), create + optimize a route
curl -X POST http://localhost:8787/api/routes/optimize \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"hubId":"hub_demo01","date":"2026-04-26","agentId":"agent_demo01"}'

# 2. Activate the route
curl -X PATCH http://localhost:8787/api/routes/<routeId>/activate \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"agentId":"agent_demo01"}'

# 3. View the active route
curl http://localhost:8787/api/routes/<routeId> \
  -H "Authorization: Bearer <agent_token>"
```

---

## 8. File Structure

```
backend/src/domains/d2/
├── routes.ts         ← Hono router (GET/POST/PATCH endpoints)  ✅
├── optimizer.ts      ← optimizeRoute(), computeETAs(), haversine()  ✅
├── workflow.ts       ← OrderLifecycleWorkflow (durable steps)  ✅
├── consumer.ts       ← handleQueue() — order.created → workflow  ✅
├── types.ts          ← HubRow, AgentRow, RouteRow, RouteStopRow
├── mock/
│   ├── orders.ts     ← mockOrdersForHub()
│   └── ai-eta.ts     ← mockComputeETAs()
└── seed/
    └── demo.sql
```

---

## 9. Coding Conventions

### Workflow steps
- Every `step.do` label is a unique lowercase kebab string — serves as idempotency key
- Steps are pure: load data inside the step, not before
- If a step returns a value, assign it immediately — don't call `step.do` and ignore the return

### Route activation guard
```ts
// Always check route is in 'planned' state before activating
const route = await c.env.DB.prepare(
  "SELECT * FROM routes WHERE id = ? AND tenant_id = ? AND status = 'planned' LIMIT 1"
).bind(routeId, auth.orgId).first<RouteRow>()
if (!route) return c.json({ error: 'Route not found or not in planned state' }, 404)
```

### Batch DB writes
```ts
// D2 always uses batch() for multi-table writes (route + stops + agent status)
await c.env.DB.batch([routeStmt, orderStmt, agentStmt])
```

### KV ETA cache
- Key: `eta:stop:{stopId}` — TTL 10 minutes
- Written after every TSP run
- D4 reads this key when publishing `stop.departed`; fall back to `route_stops.eta` if cache miss

### Sequence JSON
- `routes.optimized_sequence` stores `stop_id[]` (not `order_id[]`)
- Always `JSON.parse` before returning to API consumers
- Always `JSON.stringify` before inserting/updating

### Tests
```ts
// src/domains/d2/__tests__/optimizer.test.ts
import { optimizeRoute, haversine } from '../optimizer'

it('returns stops in nearest-neighbour order', () => {
  const result = optimizeRoute(18.99, 72.83, [
    { id: 's1', lat: 19.05, lng: 72.82 },
    { id: 's2', lat: 19.11, lng: 72.87 },
    { id: 's3', lat: 19.01, lng: 72.85 },
  ])
  expect(result.sequence[0]).toBe('s3')  // closest to hub
})
```
