# LLD-05 — Fare & Feedback Domain

**Tagline:** Money and trust. Settles fares at delivery, calculates agent payouts, and collects structured feedback from customers and sellers.

---

## 1. Scope

### Owns
- `fare_configs` table — tenant-level fare parameters (KV-cached, TTL 1h)
- `order_fares` table — quoted and settled fare per order
- `partner_earnings` table — agent payout per delivered order
- `order_feedback` table — ratings + comments from customers and sellers
- Fare quote computation at order intake (called by D1)
- Fare settlement at delivery (triggered by `order.delivered` queue message)
- Agent commission calculation
- Feedback submission endpoint

### Does NOT Own
- Order status transitions → D1/D4
- Delivery event log (calls D3 via `logEvent()`) → D3
- Route management → D2
- OTP or photo flows → D4

---

## 2. Cloudflare Bindings

| Binding | Purpose |
|---|---|
| `DB` | D1 — fare_configs, order_fares, partner_earnings, order_feedback |
| `KV` | `fare_config:{tenantId}` cache (TTL 3600s) |
| `QUEUE_ORDER_DELIVERED` | Consumer → settle fare + create partner_earnings |
| `HMAC_SECRET` | (unused in D5 directly) |

---

## 3. Cross-Domain Contracts

### Consumes (Queue)
```ts
// From D4 via QUEUE_ORDER_DELIVERED
{ type: 'order.delivered'; orderId: string; agentId: string; stopId: string; settledFare: number }
```

### HTTP used by D1 at order intake
```
GET /api/fare/quote?orderId=xxx   — D1 can pre-compute quoted fare
POST /api/fare/quote              — D1 calls to persist quoted fare after order creation
```

### Calls D3 (direct import)
```ts
import { logEvent } from '../d3/lib/logger'
// Logs: fare.settled, feedback.submitted
```

---

## 4. Fare Formula

```
Quoted Fare = Base
            + (Distance × perKmRate)
            + Weight Surcharge (tier 1/2/3)
            + Zone Premium (% of base+distance)
            + Narrow Window Fee (window < 3h)
            − Bulk Discount (if batch order)

Settled Fare = Recalculated at delivery using actual route_stop.distance_from_prev_km

Agent Payout = settled_fare × (commission_pct / 100)
Platform Cut = settled_fare − agent_payout
```

### Fare Config Shape (stored in `fare_configs` table + KV)
```ts
interface FareConfig {
  baseFare: number              // default 20
  perKmRate: number             // default 5
  weightTier1Max: number        // default 1 kg
  weightTier1Surcharge: number  // default 0
  weightTier2Max: number        // default 5 kg
  weightTier2Surcharge: number  // default 10
  weightTier3Surcharge: number  // default 25  (> tier2Max)
  zonePremiumPct: number        // default 0
  narrowWindowPremium: number   // default 15 (window < 3h)
  bulkThreshold: number         // default 50 orders in batch
  bulkDiscountPct: number       // default 5
}
```

---

## 5. Data Model

### `fare_configs`
```sql
CREATE TABLE IF NOT EXISTS fare_configs (
  id                      TEXT PRIMARY KEY,
  tenant_id               TEXT NOT NULL UNIQUE,
  base_fare               REAL NOT NULL DEFAULT 20,
  per_km_rate             REAL NOT NULL DEFAULT 5,
  weight_tier_1_max       REAL NOT NULL DEFAULT 1,
  weight_tier_1_surcharge REAL NOT NULL DEFAULT 0,
  weight_tier_2_max       REAL NOT NULL DEFAULT 5,
  weight_tier_2_surcharge REAL NOT NULL DEFAULT 10,
  weight_tier_3_surcharge REAL NOT NULL DEFAULT 25,
  zone_premium_pct        REAL NOT NULL DEFAULT 0,
  narrow_window_premium   REAL NOT NULL DEFAULT 15,
  bulk_threshold          INTEGER NOT NULL DEFAULT 50,
  bulk_discount_pct       REAL NOT NULL DEFAULT 5,
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### `order_fares`
```sql
CREATE TABLE IF NOT EXISTS order_fares (
  id           TEXT PRIMARY KEY,
  order_id     TEXT NOT NULL REFERENCES orders(id),
  quoted_fare  REAL NOT NULL,
  settled_fare REAL,
  distance_km  REAL,
  breakdown    TEXT NOT NULL DEFAULT '{}',  -- JSON itemised breakdown
  status       TEXT NOT NULL DEFAULT 'quoted'
                 CHECK (status IN ('quoted','settled','waived')),
  settled_at   TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### `partner_earnings`
```sql
CREATE TABLE IF NOT EXISTS partner_earnings (
  id             TEXT PRIMARY KEY,
  agent_id       TEXT NOT NULL REFERENCES delivery_agents(id),
  order_id       TEXT NOT NULL REFERENCES orders(id),
  gross_fare     REAL NOT NULL,
  commission_pct REAL NOT NULL DEFAULT 80,
  partner_payout REAL NOT NULL,
  platform_cut   REAL NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','approved','paid')),
  paid_at        TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### `order_feedback` (new table — migration 0003)
```sql
CREATE TABLE IF NOT EXISTS order_feedback (
  id          TEXT PRIMARY KEY,           -- fb_{nanoid()}
  order_id    TEXT NOT NULL REFERENCES orders(id),
  agent_id    TEXT REFERENCES delivery_agents(id),
  from_actor  TEXT NOT NULL CHECK (from_actor IN ('customer','seller','admin')),
  rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_feedback_order ON order_feedback(order_id);
CREATE INDEX IF NOT EXISTS idx_feedback_agent ON order_feedback(agent_id, created_at);
```

---

## 6. API Reference

### GET `/api/fare/config`
Get the current tenant fare config. KV-cached for 1 hour.

**Auth:** `admin`, `dispatcher`

**Response `200`:**
```json
{
  "baseFare": 20,
  "perKmRate": 5,
  "weightTier1Max": 1,
  "weightTier1Surcharge": 0,
  "weightTier2Max": 5,
  "weightTier2Surcharge": 10,
  "weightTier3Surcharge": 25,
  "zonePremiumPct": 0,
  "narrowWindowPremium": 15,
  "bulkThreshold": 50,
  "bulkDiscountPct": 5
}
```

---

### PUT `/api/fare/config`
Update tenant fare config.

**Auth:** `admin`

**Request body:** Partial `FareConfig` — any fields to update.

**Side effects:** Busts KV cache for this tenant.

**Response `200`:** Updated full config.

---

### GET `/api/fare/quote?orderId=:id`
Get or compute fare quote for an order. Returns existing `order_fares` record if present, otherwise computes from order details + fare config.

**Auth:** `admin`, `dispatcher`, `seller`

**Response `200`:**
```json
{
  "orderId": "ord_xxx",
  "quotedFare": 87.50,
  "status": "quoted",
  "breakdown": {
    "base": 20,
    "distance": 42.5,
    "weightSurcharge": 10,
    "zonePremium": 0,
    "narrowWindowFee": 15,
    "bulkDiscount": 0
  }
}
```

---

### POST `/api/fare/settle`
Settle fare for a delivered order. Called internally by D5 queue consumer.

**Auth:** Internal (X-Internal-Token) — not exposed as a public route.

**Side effects:**
- Creates/updates `order_fares` with `settled_fare`, `status = 'settled'`
- Creates `partner_earnings` record
- Logs `fare.settled` event

---

### GET `/api/orders/:id/feedback`
Get all feedback for an order.

**Auth:** `admin`, `dispatcher`, `seller` (own orders only)

**Response `200`:**
```json
{
  "orderId": "ord_xxx",
  "feedback": [
    {
      "id": "fb_xxx",
      "fromActor": "customer",
      "rating": 5,
      "comment": "Very fast delivery!",
      "createdAt": "2026-04-25T12:00:00Z"
    }
  ]
}
```

---

### POST `/api/orders/:id/feedback`
Submit feedback. One feedback record per actor per order.

**Auth:** `admin`, `dispatcher`, `seller`, `agent` (for customer feedback submitted by agent)

**Request body:**
```json
{
  "fromActor": "customer",
  "rating": 5,
  "comment": "Excellent service!"
}
```

**Side effects:**
- Inserts `order_feedback` record
- Logs `feedback.submitted` event

**Response `201`:**
```json
{ "feedbackId": "fb_xxx" }
```

---

### GET `/api/agents/:id/earnings`
Get agent earnings summary.

**Auth:** `admin`, `dispatcher`, `agent` (own only)

**Query params:** `month` (YYYY-MM), `status`

**Response `200`:**
```json
{
  "agentId": "agent_ravi",
  "period": "2026-04",
  "totalDeliveries": 42,
  "totalEarnings": 1764.00,
  "pendingPayout": 840.00,
  "earnings": [...]
}
```

---

## 7. Queue Consumer

```ts
// src/domains/d5/consumer.ts
export async function handleD5Queue(
  messages: Message<OrderDeliveredMessage>[],
  env: Env,
): Promise<void> {
  for (const msg of messages) {
    const { orderId, agentId, stopId } = msg.body
    await settleFare(env.DB, env.KV, orderId, agentId)
    msg.ack()
  }
}

async function settleFare(db: D1Database, kv: KVNamespace, orderId: string, agentId: string) {
  // 1. Load order + agent commission
  // 2. Load route_stop distance
  // 3. Load fare config from KV / DB
  // 4. Compute settled fare
  // 5. Upsert order_fares (status='settled')
  // 6. Insert partner_earnings
  // 7. logEvent('fare.settled', ...)
}
```

---

## 8. Fare Calculation

```ts
// src/domains/d5/fare.ts

export interface FareBreakdown {
  base: number
  distance: number
  weightSurcharge: number
  zonePremium: number
  narrowWindowFee: number
  bulkDiscount: number
  total: number
}

export function computeFare(params: {
  config: FareConfig
  distanceKm: number
  weightKg: number
  parcelSize: 'small' | 'medium' | 'large'
  deliveryWindowStart: string | null
  deliveryWindowEnd: string | null
  isBulk: boolean
}): FareBreakdown {
  const base = params.config.baseFare
  const distance = params.distanceKm * params.config.perKmRate

  // Weight surcharge
  let weightSurcharge = 0
  if (params.weightKg <= params.config.weightTier1Max) {
    weightSurcharge = params.config.weightTier1Surcharge
  } else if (params.weightKg <= params.config.weightTier2Max) {
    weightSurcharge = params.config.weightTier2Surcharge
  } else {
    weightSurcharge = params.config.weightTier3Surcharge
  }

  // Zone premium
  const zonePremium = (base + distance) * (params.config.zonePremiumPct / 100)

  // Narrow window: < 3 hours
  let narrowWindowFee = 0
  if (params.deliveryWindowStart && params.deliveryWindowEnd) {
    const windowHours =
      (new Date(params.deliveryWindowEnd).getTime() -
        new Date(params.deliveryWindowStart).getTime()) / 3_600_000
    if (windowHours < 3) narrowWindowFee = params.config.narrowWindowPremium
  }

  // Bulk discount
  const subtotal = base + distance + weightSurcharge + zonePremium + narrowWindowFee
  const bulkDiscount = params.isBulk ? subtotal * (params.config.bulkDiscountPct / 100) : 0

  return {
    base,
    distance,
    weightSurcharge,
    zonePremium,
    narrowWindowFee,
    bulkDiscount,
    total: Math.max(0, subtotal - bulkDiscount),
  }
}
```

---

## 9. File Structure

```
backend/src/domains/d5/
├── routes.ts      ← Hono router (fare config, quote, feedback, earnings)
├── consumer.ts    ← handleD5Queue() — settles fare on order.delivered
├── fare.ts        ← computeFare() pure function
└── types.ts       ← FareConfig, FareBreakdown, FeedbackRow, EarningRow
```

---

## 10. Frontend Integration

### Dispatch Dashboard
- `GET /api/fare/config` → `FareConfigPanel` (admin-only settings panel)
- `GET /api/fare/quote?orderId=xxx` → shown in order detail / route stop card

### Seller Dashboard
- `GET /api/orders/:id/feedback` → feedback tab on order detail
- `POST /api/orders/:id/feedback` → seller rating form (after delivery)

### Agent PWA
- `GET /api/agents/:id/earnings` → Earnings tab in bottom nav

### API types
```ts
export const d5Api = {
  getFareConfig: (token) => ...
  updateFareConfig: (token, config) => ...
  getFareQuote: (token, orderId) => ...
  getFeedback: (token, orderId) => ...
  submitFeedback: (token, orderId, payload) => ...
  getEarnings: (token, agentId, params?) => ...
}
```
