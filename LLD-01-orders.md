# LLD-01 — Orders Domain

**Tagline:** Source of truth for every parcel. Intake, fare quoting, seller management, and bulk import — nothing else.

---

## 1. Scope

### Owns
- `orders` table — lifecycle state, all metadata
- `sellers` table — seller profile, API key
- `order_batches` table — bulk CSV import state
- Order ID generation and tracking token minting
- Fare **quoting** (preview at creation, reads fare config from KV)
- Bulk CSV parsing and validation
- Webhook dispatch to seller on status change

### Does NOT Own
- Agent assignment or route planning → D2
- Delivery event log → D3
- Live GPS / OTP / stop execution → D4
- Fare settlement or payout → D5
- Order **status transitions** from In-Transit onward (those come as Queue events; D1 only applies them to its own table)

---

## 2. Cloudflare Bindings

| Binding | Purpose |
|---|---|
| `DB` | D1 — orders, sellers, order_batches |
| `KV` | Fare config cache (`fare_config:{tenantId}`, TTL 1h); tracking token lookup |
| `STORAGE` | R2 — bulk CSV storage (`csv/{batchId}/{filename}`) |
| `QUEUE_ORDER_CREATED` | Producer — fires on every new order |

---

## 3. Cross-Domain Contracts

### Produces (Queue)
```ts
// On every new single/bulk order
QUEUE_ORDER_CREATED.send({
  type: 'order.created',
  orderId: string,
  tenantId: string,
  hubId: string,
  createdAt: string   // ISO 8601
})
```

### Consumes (Queue events from other domains)
```ts
// D4 fires when stop is delivered/failed → D1 updates order.status
type InboundEvent =
  | { type: 'order.delivered'; orderId: string; settledFare: number }
  | { type: 'order.failed';    orderId: string; reason: string }
  | { type: 'order.rescheduled'; orderId: string }
```

### HTTP API consumed by other domains
```
PATCH /api/orders/:id/status   ← D2, D4 call this via internal token
GET   /api/orders/:id          ← D2 workflow reads order details
```

### Mock Adapters (for standalone demo)
```ts
// src/domains/d1/mock/geocoder.ts
// Returns deterministic coordinates from address string hash
export function mockGeocode(address: string): { lat: number; lng: number }

// src/domains/d1/mock/fare-config.ts
// Returns hardcoded demo fare config when KV is empty
export const DEMO_FARE_CONFIG: FareConfig
```

---

## 4. Data Model

> Tables are already defined in `src/db/migrations/0001_schema.sql`.
> Reproduced here with D1-specific ownership annotations.

### `sellers`
```sql
-- Owns: D1
CREATE TABLE IF NOT EXISTS sellers (
  id              TEXT PRIMARY KEY,          -- seller_{nanoid()}
  clerk_user_id   TEXT NOT NULL UNIQUE,
  tenant_id       TEXT NOT NULL,
  company_name    TEXT NOT NULL,
  gstin           TEXT,
  api_key_hash    TEXT,                      -- SHA-256 of raw API key
  webhook_url     TEXT,
  webhook_secret  TEXT,
  webhook_events  TEXT NOT NULL DEFAULT '[]', -- JSON: string[]
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### `orders`
```sql
-- Owns: D1 (status column written by D1 + inbound queue events)
CREATE TABLE IF NOT EXISTS orders (
  id                     TEXT PRIMARY KEY,   -- order_{nanoid()}
  tenant_id              TEXT NOT NULL,
  seller_id              TEXT NOT NULL REFERENCES sellers(id),
  customer_name          TEXT NOT NULL,
  customer_phone         TEXT,
  customer_email         TEXT,
  address                TEXT NOT NULL,
  lat                    REAL NOT NULL,
  lng                    REAL NOT NULL,
  hub_id                 TEXT REFERENCES hubs(id),
  status                 TEXT NOT NULL DEFAULT 'placed'
                           CHECK (status IN (
                             'placed','confirmed','packed',
                             'out_for_delivery','in_transit',
                             'delivered','failed','rescheduled'
                           )),
  parcel_weight          REAL NOT NULL DEFAULT 0,
  parcel_size            TEXT NOT NULL DEFAULT 'small'
                           CHECK (parcel_size IN ('small','medium','large')),
  delivery_window_start  TEXT,
  delivery_window_end    TEXT,
  otp_code_hash          TEXT,               -- bcrypt; written by D4
  tracking_token         TEXT,               -- HMAC-signed; written by D1 at creation
  notes                  TEXT,
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at             TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### `order_batches`
```sql
-- Owns: D1
CREATE TABLE IF NOT EXISTS order_batches (
  id                TEXT PRIMARY KEY,        -- batch_{nanoid()}
  seller_id         TEXT NOT NULL REFERENCES sellers(id),
  total_rows        INTEGER NOT NULL DEFAULT 0,
  accepted_rows     INTEGER NOT NULL DEFAULT 0,
  rejected_rows     INTEGER NOT NULL DEFAULT 0,
  total_quoted_fare REAL NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN (
                        'pending','validated','confirmed','processing','done','failed'
                      )),
  r2_key            TEXT,                    -- CSV file path in R2
  validation_report TEXT NOT NULL DEFAULT '{}',
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### TypeScript Row Types
```ts
// src/domains/d1/types.ts

export interface SellerRow {
  id: string
  clerk_user_id: string
  tenant_id: string
  company_name: string
  gstin: string | null
  api_key_hash: string | null
  webhook_url: string | null
  webhook_secret: string | null
  webhook_events: string  // JSON: string[]
  created_at: string
  updated_at: string
}

export interface OrderRow {
  id: string
  tenant_id: string
  seller_id: string
  customer_name: string
  customer_phone: string | null
  customer_email: string | null
  address: string
  lat: number
  lng: number
  hub_id: string | null
  status: OrderStatus
  parcel_weight: number
  parcel_size: ParcelSize
  delivery_window_start: string | null
  delivery_window_end: string | null
  otp_code_hash: string | null
  tracking_token: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export type OrderStatus =
  | 'placed' | 'confirmed' | 'packed'
  | 'out_for_delivery' | 'in_transit'
  | 'delivered' | 'failed' | 'rescheduled'

export type ParcelSize = 'small' | 'medium' | 'large'

export interface OrderBatchRow {
  id: string
  seller_id: string
  total_rows: number
  accepted_rows: number
  rejected_rows: number
  total_quoted_fare: number
  status: BatchStatus
  r2_key: string | null
  validation_report: string
  created_at: string
  updated_at: string
}

export type BatchStatus =
  | 'pending' | 'validated' | 'confirmed' | 'processing' | 'done' | 'failed'
```

---

## 5. API Reference

All routes live under `src/domains/d1/routes.ts` and are mounted on the main Hono app.

### POST `/api/orders`
Create a single order.

**Auth:** `seller` or `admin`

**Request body:**
```json
{
  "customerName": "Arjun Mehta",
  "customerPhone": "+919876543210",
  "customerEmail": "arjun@example.com",
  "address": "42 Marine Lines, Mumbai 400002",
  "hubId": "hub_abc123",
  "parcelWeight": 1.2,
  "parcelSize": "small",
  "deliveryWindowStart": "2026-04-26T06:00:00Z",
  "deliveryWindowEnd": "2026-04-26T12:00:00Z",
  "notes": "Call before delivery"
}
```

**Response `201`:**
```json
{
  "orderId": "order_xk2m9p",
  "status": "placed",
  "trackingToken": "tk_<hmac>",
  "quotedFare": 87.50,
  "fareBreakdown": {
    "base": 20,
    "distance": 42.50,
    "weightSurcharge": 10,
    "zonePremium": 0,
    "narrowWindowFee": 15,
    "bulkDiscount": 0,
    "total": 87.50
  }
}
```

**Key steps:**
1. Validate body (Zod)
2. Resolve `sellerId` from `auth.userId`
3. Geocode address (mock adapter or real geocoder)
4. Fetch fare config from `KV` → calculate quoted fare
5. Mint tracking token: `HMAC-SHA256(orderId + tenantId, HMAC_SECRET)` truncated to 16 chars
6. Insert `orders` row with `status = 'placed'`
7. Insert `order_fares` row (D5 table, written by D1 at creation)
8. Publish `order.created` to `QUEUE_ORDER_CREATED`

---

### POST `/api/orders/bulk`
Upload a CSV file and create orders in batch.

**Auth:** `seller` or `admin`

**Request:** `multipart/form-data` — field `file` (CSV), field `hubId`

**CSV columns:**
```
customer_name,customer_phone,address,parcel_weight,parcel_size,delivery_window_start,delivery_window_end,notes
```

**Response `202`:**
```json
{
  "batchId": "batch_7xyz",
  "totalRows": 50,
  "acceptedRows": 48,
  "rejectedRows": 2,
  "totalQuotedFare": 4320.00,
  "validationReport": {
    "errors": [
      { "row": 12, "field": "address", "reason": "Cannot geocode" },
      { "row": 31, "field": "parcel_weight", "reason": "Must be > 0" }
    ]
  },
  "status": "validated"
}
```

**Key steps:**
1. Upload raw CSV to R2 at `csv/{batchId}/{filename}`
2. Parse CSV row-by-row; validate each row with Zod
3. Batch-geocode addresses using mock adapter
4. Calculate fare per order
5. Write accepted orders in a D1 batch transaction
6. Enqueue one `order.created` event per accepted order
7. Write `order_batches` row with validation report

---

### GET `/api/orders`
List orders. Seller sees own orders; admin sees all.

**Auth:** `seller`, `admin`, `dispatcher`

**Query params:** `status`, `hubId`, `date` (YYYY-MM-DD), `limit` (default 50), `cursor`

**Response:**
```json
{
  "orders": [ ...OrderRow ],
  "nextCursor": "order_abc"
}
```

---

### GET `/api/orders/:id`
Get single order with fare details.

**Auth:** `seller` (own only), `admin`, `dispatcher`, `agent`

**Response:**
```json
{
  "order": { ...OrderRow },
  "fare": { ...FareRow }
}
```

---

### PATCH `/api/orders/:id/status`
Internal endpoint — transitions order status. Called by D2 workflow and D4 queue consumer.

**Auth:** `internal` header `X-Internal-Token: <HMAC_SECRET>` OR `admin`/`dispatcher`

**Request body:**
```json
{ "status": "packed", "meta": {} }
```

**Allowed transitions:**
```
placed       → confirmed (D2 workflow)
confirmed    → packed    (D2 workflow)
packed       → out_for_delivery (D2 route activate)
out_for_delivery → in_transit (D4 stop depart)
in_transit   → delivered  (D4 OTP verify)
in_transit   → failed     (D4 stop fail)
failed       → rescheduled (D4 EOD workflow)
```

**Response:**
```json
{ "orderId": "order_xk2m9p", "previousStatus": "placed", "status": "confirmed" }
```

---

### GET `/api/sellers/me`
Get authenticated seller profile.

**Auth:** `seller`

**Response:** `SellerRow` with `api_key_hash` redacted.

---

### POST `/api/sellers/me/api-key`
Rotate API key. Returns the raw key once (never stored, only the hash is kept).

**Auth:** `seller`

**Response:**
```json
{ "apiKey": "sk_live_<32 random bytes hex>" }
```

---

## 6. Fare Quote Algorithm

```ts
// src/domains/d1/lib/fare.ts

export function quoteFare(config: FareConfig, distanceKm: number, weight: number, windowHours: number | null, bulkCount: number): FareBreakdown {
  const base = config.base_fare
  const distance = distanceKm * config.per_km_rate
  const weightSurcharge =
    weight <= config.weight_tier_1_max ? config.weight_tier_1_surcharge
    : weight <= config.weight_tier_2_max ? config.weight_tier_2_surcharge
    : config.weight_tier_3_surcharge
  const zonePremium = base * (config.zone_premium_pct / 100)
  const narrowWindowFee = windowHours !== null && windowHours < 3 ? config.narrow_window_premium : 0
  const subtotal = base + distance + weightSurcharge + zonePremium + narrowWindowFee
  const bulkDiscount = bulkCount >= config.bulk_threshold ? subtotal * (config.bulk_discount_pct / 100) : 0
  const total = Math.round((subtotal - bulkDiscount) * 100) / 100
  return { base, distance, weightSurcharge, zonePremium, narrowWindowFee, bulkDiscount, total }
}
```

---

## 7. Demo Setup

### Seed SQL (`src/domains/d1/seed/demo.sql`)
```sql
-- Demo tenant + hub
INSERT OR IGNORE INTO hubs VALUES ('hub_demo01', 'tenant_demo', 'Mumbai Hub', 'Lower Parel, Mumbai', 18.9949, 72.8298, datetime('now'));

-- Demo seller
INSERT OR IGNORE INTO sellers VALUES (
  'seller_demo01', 'user_demo_seller', 'tenant_demo',
  'Demo Apparel Co.', NULL, NULL, NULL, NULL, '["order.delivered"]',
  datetime('now'), datetime('now')
);

-- 5 demo orders
INSERT OR IGNORE INTO orders (id, tenant_id, seller_id, customer_name, customer_phone, address, lat, lng, hub_id, status, parcel_weight, parcel_size)
VALUES
  ('order_d01', 'tenant_demo', 'seller_demo01', 'Priya Shah',    '+919876540001', 'Bandra West, Mumbai 400050', 19.0596, 72.8295, 'hub_demo01', 'placed', 0.5, 'small'),
  ('order_d02', 'tenant_demo', 'seller_demo01', 'Rohan Verma',   '+919876540002', 'Andheri East, Mumbai 400069', 19.1136, 72.8697, 'hub_demo01', 'placed', 1.2, 'medium'),
  ('order_d03', 'tenant_demo', 'seller_demo01', 'Meena Pillai',  '+919876540003', 'Dadar, Mumbai 400014', 19.0178, 72.8478, 'hub_demo01', 'placed', 2.5, 'medium'),
  ('order_d04', 'tenant_demo', 'seller_demo01', 'Arjun Kapoor',  '+919876540004', 'Kurla West, Mumbai 400070', 19.0726, 72.8867, 'hub_demo01', 'placed', 0.3, 'small'),
  ('order_d05', 'tenant_demo', 'seller_demo01', 'Sunita Nair',   '+919876540005', 'Malad West, Mumbai 400064', 19.1863, 72.8483, 'hub_demo01', 'placed', 5.0, 'large');
```

### Running Demo Standalone
```bash
cd backend
# Apply schema
wrangler d1 execute DB --local --file=src/db/migrations/0001_schema.sql
# Seed demo data
wrangler d1 execute DB --local --file=src/domains/d1/seed/demo.sql
# Start dev server
wrangler dev
```

### Demo API Flow
```bash
# 1. Create an order
curl -X POST http://localhost:8787/api/orders \
  -H "Authorization: Bearer <clerk_token>" \
  -H "Content-Type: application/json" \
  -d '{"customerName":"Test Customer","address":"Bandra West, Mumbai","hubId":"hub_demo01","parcelWeight":1.0,"parcelSize":"small"}'

# 2. List orders
curl http://localhost:8787/api/orders \
  -H "Authorization: Bearer <clerk_token>"

# 3. Get fare preview
curl http://localhost:8787/api/orders/order_d01 \
  -H "Authorization: Bearer <clerk_token>"
```

---

## 8. File Structure

```
backend/src/domains/d1/
├── routes.ts          ← Hono router, all D1 endpoints
├── types.ts           ← SellerRow, OrderRow, OrderBatchRow, FareBreakdown
├── lib/
│   ├── fare.ts        ← quoteFare(), getFareConfig()
│   ├── geocoder.ts    ← geocodeAddress() interface + mock impl
│   ├── hmac.ts        ← mintTrackingToken(), verifyTrackingToken()
│   └── csv.ts         ← parseBulkCsv(), validateCsvRow()
├── mock/
│   ├── geocoder.ts    ← mockGeocode() deterministic from address hash
│   └── fare-config.ts ← DEMO_FARE_CONFIG constant
└── seed/
    └── demo.sql       ← Demo data for local dev
```

---

## 9. Coding Conventions

### Naming
- Route file exports one `Hono` instance named `d1`
- All IDs use `{prefix}_{nanoid()}` — prefix matches the table short name (`order_`, `seller_`, `batch_`)
- DB column names: `snake_case`. TypeScript field names: `camelCase` at the API boundary, `snake_case` inside D1 row types
- Error responses always have shape `{ error: string, field?: string }`

### Validation
- Every `POST`/`PATCH` body parsed with Zod schema; return `400` on failure
- Zod schemas live in `routes.ts` next to the handler — no separate schema file unless reused

### SQL patterns
```ts
// Always parameterize; never interpolate user data
const row = await c.env.DB
  .prepare('SELECT * FROM orders WHERE id = ? AND tenant_id = ? LIMIT 1')
  .bind(orderId, auth.orgId)
  .first<OrderRow>()

// Multi-step writes use batch()
await c.env.DB.batch([stmt1, stmt2, stmt3])
```

### Auth check pattern
```ts
// Seller can only see own orders; admin sees all
if (auth.role === 'seller') {
  const seller = await resolveSeller(c.env.DB, auth.userId, auth.orgId)
  if (!seller) return c.json({ error: 'Seller not found' }, 404)
  params.push(seller.id)
  parts.push('AND seller_id = ?')
}
```

### KV cache pattern
```ts
async function getFareConfig(kv: KVNamespace, tenantId: string): Promise<FareConfig> {
  const cached = await kv.get<FareConfig>(`fare_config:${tenantId}`, 'json')
  if (cached) return cached
  // ...fetch from DB, write to KV with TTL
  await kv.put(`fare_config:${tenantId}`, JSON.stringify(config), { expirationTtl: 3600 })
  return config
}
```

### Mock vs real adapters
```ts
// Adapter interface — real and mock implement the same shape
interface Geocoder {
  geocode(address: string): Promise<{ lat: number; lng: number } | null>
}

// Switch at runtime
const geocoder: Geocoder = c.env.ENVIRONMENT === 'production'
  ? new GoogleGeocoder(c.env.GOOGLE_MAPS_KEY)
  : new MockGeocoder()
```

### Tests (Vitest + `@cloudflare/vitest-pool-workers`)
```ts
// src/domains/d1/__tests__/fare.test.ts
import { quoteFare } from '../lib/fare'
import { DEMO_FARE_CONFIG } from '../mock/fare-config'

it('applies narrow window fee when window < 3h', () => {
  const breakdown = quoteFare(DEMO_FARE_CONFIG, 10, 1, 2, 1)
  expect(breakdown.narrowWindowFee).toBe(DEMO_FARE_CONFIG.narrow_window_premium)
})
```
