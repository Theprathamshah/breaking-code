# HLD — Smart Last Mile Delivery System

## 1. System Overview

A multi-tenant SaaS platform for e-commerce companies to dispatch parcels from a hub to
customers' doorsteps. Tracking works in **two distinct modes**:

- **UPS-style milestone tracking** — status updates throughout the order lifecycle
  (Order Placed → Packed → Out for Delivery → Delivered)
- **Blinkit/Uber live tracking** — real-time driver map that activates **only when the
  driver departs for that customer's specific stop**

Four actor roles: **Seller (E-commerce Company)**, **Admin/Dispatcher**, **Delivery Agent**, **Customer**.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Auth | Clerk (JWT, multi-role RBAC) |
| API | Cloudflare Workers + Hono |
| Database | Cloudflare D1 (SQLite) |
| Live Tracking State | Cloudflare Durable Objects |
| Async Events | Cloudflare Queues |
| Caching | Cloudflare KV |
| File Storage | Cloudflare R2 |
| AI / Route Optimization | Workers AI |
| Order Orchestration | Cloudflare Workflows |
| Email Notifications | Cloudflare Email Workers |
| Frontend | React + Vite → Cloudflare Pages |
| Observability | Workers Observability + Logpush |

---

## 3. Tracking — Two Modes Explained

### Mode 1: UPS-Style Milestone Tracking
Active from order creation until driver departs for the customer's stop.
Customer sees a timeline of statuses — no map, no live updates.

```
[Order Placed] → [Confirmed] → [Packed at Hub] → [Out for Delivery] → [Delivered / Failed]
```

- Statuses stored in D1 `orders.status`
- Customer gets email/notification at each transition
- Tracking page shows a static timeline (polling D1 every 30s is fine here)

### Mode 2: Blinkit/Uber Live Tracking
**Triggers when**: Driver taps "Heading to this stop" on the agent PWA for a specific order.

- Customer receives a push notification / email: "Your driver is on the way — track live"
- Tracking page switches from milestone timeline → live map view
- Driver's GPS streams in real-time via WebSocket
- Customer sees driver moving on map + live ETA countdown + driver name/photo
- **Stops** when driver marks the stop as delivered or failed

```
Driver taps "Heading to Stop"
        │
        ▼
POST /api/stops/:stopId/depart
        │
        ├── D1: order status → in_transit
        ├── KV: set tracking_mode = "live" for order_id
        ├── Queue: enqueue "live_tracking.started" → email customer with tracking URL
        └── DeliverySessionDO activated for this order_id
                │
                ▼
        Customer opens tracking URL
                │
                ▼
        WS /ws/track/:orderId → connects to DeliverySessionDO
                │
                ▼
        Driver GPS pings every 3s → DO broadcasts to customer WebSocket
        (driver lat/lng, ETA, distance remaining)
                │
                ▼
        Driver marks delivered / failed
                │
                └── DO closes all connections, KV: tracking_mode = "done"
```

---

## 4. Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          CLIENTS (CF Pages)                              │
│                                                                          │
│  ┌──────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐ │
│  │  Admin /         │  │  Delivery Agent PWA │  │  Customer Tracking  │ │
│  │  Dispatcher      │  │                     │  │  Portal             │ │
│  │  Dashboard       │  │  - View route stops │  │                     │ │
│  │                  │  │  - GPS stream       │  │  [MODE 1]           │ │
│  │  - Orders        │  │  - Mark delivered   │  │  Status timeline    │ │
│  │  - Route planner │  │  - Capture POD photo│  │  (UPS-style)        │ │
│  │  - Agent map     │  │  - "Heading to Stop"│  │                     │ │
│  │                  │  │    button           │  │  [MODE 2]           │ │
│  └──────────────────┘  └─────────────────────┘  │  Live map + ETA     │ │
│                                                  │  (Uber/Blinkit)     │ │
│                                                  └─────────────────────┘ │
└────────────────┬──────────────────┬──────────────────────┬───────────────┘
                 │                  │                      │
                 ▼                  ▼                      ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                     Cloudflare Workers (Hono)                            │
│                                                                          │
│  REST API routes                   WebSocket routes                      │
│  ┌────────────────────────────┐    ┌──────────────────────────────────┐  │
│  │ POST /api/orders           │    │ WS /ws/agent/:agentId            │  │
│  │ GET  /api/orders/:id       │    │   Agent GPS stream → DO          │  │
│  │ POST /api/routes/optimize  │    │                                  │  │
│  │ POST /api/stops/:id/depart │    │ WS /ws/track/:orderId            │  │
│  │ POST /api/stops/:id/attempt│    │   Customer live map ← DO         │  │
│  │ GET  /track/:token         │    │   (only active in MODE 2)        │  │
│  └────────────────────────────┘    └──────────────────────────────────┘  │
│                                                                          │
│              ┌──── Clerk JWT Middleware ────┐                            │
│              │  role: admin/dispatcher/     │                            │
│              │        agent/customer        │                            │
│              └──────────────────────────────┘                           │
└──────┬──────────────┬───────────────┬──────────────┬─────────────────────┘
       │              │               │              │
       ▼              ▼               ▼              ▼
┌──────────┐   ┌────────────┐  ┌───────────┐  ┌────────────────────────────┐
│   D1     │   │     KV     │  │  Queues   │  │    Durable Objects         │
│          │   │            │  │           │  │                            │
│ orders   │   │ ETA cache  │  │ order.    │  │  DeliverySessionDO         │
│ agents   │   │ geo cache  │  │ created   │  │  (one per active agent)    │
│ routes   │   │ tracking_  │  │ departed  │  │                            │
│ stops    │   │ mode flag  │  │ delivered │  │  - Holds driver GPS state  │
│ events   │   │ JWKS cache │  │ failed    │  │  - WebSocket connections:  │
│          │   │            │  │           │  │    · 1x agent (write)      │
└──────────┘   └────────────┘  └─────┬─────┘  │    · Nx customers (read)  │
                                      │        │  - Broadcasts GPS to all  │
                               ┌──────┘        │    connected customers    │
                               ▼               │  - Auto-closes on delivery│
                    ┌──────────────────┐       └────────────────────────────┘
                    │  CF Workflows    │
                    │                  │       ┌──────────────┐
                    │ OrderLifecycle   │──────▶│  Workers AI  │
                    │ Workflow         │       │              │
                    │ (durable steps)  │       │ Route optim  │
                    └─────────┬────────┘       │ ETA predict  │
                              │                └──────────────┘
                   ┌──────────┴──────────┐
                   ▼                     ▼
          ┌────────────────┐    ┌──────────────┐
          │ Email Workers  │    │  R2 Storage  │
          │                │    │              │
          │ - Order placed │    │ POD photos   │
          │ - Out for del. │    │ Signatures   │
          │ - Live link    │    └──────────────┘
          │ - Delivered    │
          └────────────────┘
```

---

## 5. Core Domain Entities (D1 Schema)

```sql
orders
  id, tenant_id, customer_id, hub_id
  status: ENUM(placed|confirmed|packed|out_for_delivery|in_transit|delivered|failed|rescheduled)
  -- note: out_for_delivery = driver's route started (Mode 1)
  --       in_transit       = driver heading to THIS stop (Mode 2 active)
  address, lat, lng
  parcel_weight, parcel_size
  delivery_window_start, delivery_window_end
  otp_code_hash
  tracking_token          -- HMAC signed, used for public tracking URL
  created_at, updated_at

delivery_agents
  id, tenant_id, clerk_user_id
  name, phone, photo_url, vehicle_type
  current_lat, current_lng, last_seen_at
  status: ENUM(available|on_route|offline)

routes
  id, agent_id, hub_id, date
  status: ENUM(planned|active|completed)
  optimized_sequence      -- JSON: ordered array of stop IDs
  total_distance_km, estimated_duration_mins

route_stops
  id, route_id, order_id, sequence_no
  status: ENUM(pending|heading_to|arrived|delivered|failed)
  --      heading_to = Mode 2 trigger
  eta, actual_arrival_at, actual_departure_at
  failure_reason

delivery_events
  id, order_id, agent_id, event_type
  -- event_type examples: status_changed, gps_ping, otp_verified, photo_uploaded
  lat, lng, metadata (JSON), created_at
```

---

## 6. Cloudflare Products — Role Mapping

| CF Product | Role in this system |
|---|---|
| **Workers + Hono** | All REST + WebSocket endpoints |
| **D1** | Orders, agents, routes, stops, events |
| **Durable Objects** | `DeliverySessionDO` — real-time GPS hub per active agent, broadcasts to customers |
| **KV** | `tracking_mode` flag per order, ETA cache, geocode cache, JWKS cache |
| **Queues** | Async event bus — decouples status changes from notifications |
| **Workflows** | `OrderLifecycleWorkflow` — durable orchestration with retries |
| **Workers AI** | TSP route optimization, ETA prediction from GPS history |
| **R2** | Proof-of-delivery photos, agent signature captures |
| **Email Workers** | Status emails + live tracking link when Mode 2 activates |
| **Pages** | Hosts all three frontends (Admin, Agent PWA, Customer portal) |
| **Observability** | Request tracing, Worker logs, DO connection metrics |

---

## 7. Key Flows

### 7.1 Order Placed → Out for Delivery (UPS Mode)

```
E-commerce / Admin → POST /api/orders
        │
        ▼
Worker: validate (Clerk JWT) → insert D1 (status=placed)
        │
        ▼
Enqueue "order.created"
        │
        ▼
Queue Consumer → trigger OrderLifecycleWorkflow:
  Step 1: geocode address (KV cache → else geocode API)
  Step 2: find best available agent (proximity + load from D1)
  Step 3: add stop to agent's route in D1
  Step 4: Workers AI re-optimizes route stop sequence
  Step 5: compute ETAs → write to KV (TTL 10min)
  Step 6: D1 order status → confirmed → packed → out_for_delivery
  Step 7: email customer at each milestone
          (last email: "Your parcel is out for delivery, ETA window: 2pm–4pm")
```

### 7.2 Driver Departs for Stop → Live Tracking Activates (Blinkit/Uber Mode)

```
Agent taps "Heading to this stop" in PWA
        │
        ▼
POST /api/stops/:stopId/depart
        │
        ├── D1: route_stops.status → heading_to
        ├── D1: orders.status → in_transit
        ├── KV: set tracking_mode:{orderId} = "live"
        └── Enqueue "live_tracking.started"
                │
                ▼
        Queue Consumer:
          - Email customer: "Your driver is X mins away — track live"
            (includes link: /track/:trackingToken)

Customer opens tracking URL → GET /track/:trackingToken
        │
        ▼
Worker validates HMAC token → checks KV tracking_mode = "live"
        │
        ├── if "live"  → return { mode: "live", agentId, agentName, agentPhoto }
        └── if not yet → return { mode: "milestone", statusTimeline }

Customer page connects: WS /ws/track/:orderId
        │
        ▼
Worker upgrades to DeliverySessionDO.get(agentId)
        │
        ▼
DO adds customer WebSocket to subscriber list for this orderId

Meanwhile — Agent PWA: WS /ws/agent/:agentId (connected since route started)
        │
        ▼
Agent sends GPS ping every 3s: { lat, lng, speed, heading }
        │
        ▼
DO receives ping → filters subscribers for orders agent is heading_to
        │
        ▼
DO broadcasts to matching customer WebSockets:
  { lat, lng, eta_seconds, distance_meters, agent_name, agent_photo }

Customer map updates in real time (driver dot moves on map)
```

### 7.3 Delivery Attempt

```
Agent arrives → taps "Mark Arrived" → POST /api/stops/:id/arrived
  D1: route_stops.status → arrived

SUCCESS:
  Agent captures POD photo → PUT /api/stops/:id/photo → stored in R2
  Customer shows OTP → POST /track/:token/verify-otp
  Worker: verify HMAC(otp) against D1 otp_code_hash
  D1: order status → delivered
  KV: tracking_mode:{orderId} = "done"
  DO: broadcast { event: "delivered" } → customer page shows success screen
  DO: close all WebSocket connections for this orderId
  Enqueue "order.delivered" → confirmation email to customer

FAILURE:
  Agent selects reason (not_home / wrong_address / refused)
  D1: order status → failed, route_stops.status → failed
  KV: tracking_mode:{orderId} = "done"
  DO: broadcast { event: "failed" } → customer page shows failure screen
  DO: close connections
  Workflow: auto-schedule reschedule → email customer with reschedule link
```

### 7.4 Route Optimization

```
Dispatcher → POST /api/routes/optimize  { hubId, date }
        │
        ▼
Worker: fetch all pending orders for hub from D1
        │
        ▼
Workers AI: nearest-neighbor TSP on lat/lng coordinates
  → returns ordered stop sequence + estimated distance + total time
        │
        ▼
Dispatcher reviews → POST /api/routes/:id/activate
        │
        ▼
D1: route status → active, stops assigned sequence numbers
KV: ETAs per order_id cached (TTL 10min)
Email agents their route summary
```

---

## 8. DeliverySessionDO — Internal Design

One DO instance per **active agent**. Lives for the duration of their delivery shift.

```
State held in DO memory:
  agentId: string
  lastGPS: { lat, lng, ts }
  activeStops: Map<orderId, { customerId, subscribers: WebSocket[] }>

On agent GPS ping:
  1. Update lastGPS
  2. For each orderId in activeStops where status = "heading_to":
       - Compute ETA (haversine distance + speed factor)
       - Broadcast { lat, lng, eta_seconds } to subscribers[orderId]
  3. Write GPS to D1 delivery_events (every 10th ping to reduce writes)

On customer WS connect /ws/track/:orderId:
  - Add WebSocket to activeStops[orderId].subscribers
  - Immediately send last known GPS + ETA

On delivery completed/failed for orderId:
  - Broadcast final event
  - Close + remove all subscribers for orderId
  - Remove orderId from activeStops

DO hibernates (zero cost) when agent goes offline
DO wakes on next agent WS connection
```

---

## 9. Auth — Clerk Integration

```
Roles (Clerk publicMetadata.role):
  admin       → full access scoped to org_id
  dispatcher  → orders + routes for their hub_id
  agent       → own route + stop updates + GPS writes
  customer    → no Clerk account needed

Hono Middleware:
  1. Extract Bearer token
  2. Verify JWT against Clerk JWKS (cached in KV, TTL 1h)
  3. ctx.set({ userId, orgId, role, hubId })
  4. Route-level guards per role

Customer Tracking (no auth):
  - trackingToken = HMAC-SHA256(orderId + secret + expiry)
  - Issued at order creation, sent in email
  - Worker validates on every /track/:token request
  - Expiry: 48h after expected delivery window
  - Read-only — can only call verify-otp and read order state
```

---

## 10. Fare Calculation

### Overview
Fare is calculated at **order creation time** (quoted to e-commerce client) and
**reconciled at delivery** (actual distance/time may differ). Partners earn a
commission from the settled fare.

### Fare Components

```
Total Fare = Base Fare + Distance Fare + Weight Surcharge + Zone Premium + Time Window Premium
           - Bulk Discount (if applicable)

Base Fare          flat rate per delivery attempt         e.g. ₹20
Distance Fare      ₹/km × route_stop distance            e.g. ₹5/km
Weight Surcharge   tiered by parcel_weight                0–1kg: ₹0 | 1–5kg: ₹10 | 5kg+: ₹25
Zone Premium       hub zone config (urban/semi-urban)     urban: 0% | semi-urban: +15%
Time Window Prem   narrow window = higher fare            2hr window: +₹15 | 4hr: ₹0
Bulk Discount      >50 orders/day from same tenant        -5%

Rescheduled Attempt  charged at 50% of original fare
Failed (no fault)    no charge to customer, deducted from partner earnings
```

### D1 Schema Additions

```sql
fare_configs
  id, tenant_id
  base_fare, per_km_rate
  weight_tier_1_max, weight_tier_1_surcharge
  weight_tier_2_max, weight_tier_2_surcharge
  weight_tier_3_surcharge
  zone_type: ENUM(urban|semi_urban)
  zone_premium_pct
  narrow_window_premium     -- applies when window < 3h
  bulk_threshold, bulk_discount_pct
  created_at, updated_at

order_fares
  id, order_id
  quoted_fare               -- calculated at order creation
  settled_fare              -- recalculated on delivery with actual distance
  distance_km               -- actual route stop distance
  breakdown (JSON)          -- itemised: base, distance, weight, zone, window, discount
  status: ENUM(quoted|settled|waived)
  settled_at

partner_earnings
  id, agent_id, order_id
  gross_fare                -- settled_fare
  commission_pct            -- from agents config (e.g. 80%)
  partner_payout            -- gross_fare × commission_pct
  platform_cut
  status: ENUM(pending|approved|paid)
  paid_at
```

### Fare Calculation Flow

```
POST /api/orders  { ..., delivery_window_start, delivery_window_end, parcel_weight }
        │
        ▼
Worker: load fare_config for tenant from D1 (KV cached, TTL 1h)
        │
        ▼
Calculate quoted_fare:
  distance_km  = haversine(hub_lat/lng, order_lat/lng)   // approximation at intake
  base         = config.base_fare
  distance     = distance_km × config.per_km_rate
  weight       = tier lookup on parcel_weight
  zone         = base × config.zone_premium_pct
  window       = window_hours < 3 ? config.narrow_window_premium : 0
  bulk         = daily_order_count(tenant) > threshold ? -subtotal × discount : 0
  quoted_fare  = base + distance + weight + zone + window + bulk
        │
        ▼
Store in D1 order_fares (status=quoted)
Return quoted_fare in order creation response

[ON DELIVERY SETTLED]
POST /api/stops/:id/attempt  (success)
        │
        ▼
Worker: recalculate with actual distance_km from route_stops
Store in order_fares (status=settled, settled_fare, breakdown JSON)
Insert partner_earnings row (status=pending)
Enqueue "fare.settled" → admin can review + approve payouts
```

### Partner Payout Summary API

```
GET /api/agents/:id/earnings?from=&to=
  → { total_deliveries, total_payout, pending, paid, breakdown_by_day[] }

GET /api/earnings/summary?hubId=&date=
  → hub-level settlement report for dispatcher/admin
```

---

## 11. Delivery Partner Interface (Agent PWA)

### Overview
Mobile-first PWA (React, hosted on CF Pages). Optimised for one-handed use while
standing at a doorstep. Works on low-end Android devices. Uses the device GPS for
streaming location.

### Screens & Flows

```
┌─────────────────────────────────────────────────────┐
│  LOGIN                                              │
│  Clerk-powered sign in (phone OTP or email magic    │
│  link — no password). Role=agent auto-detected.     │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│  HOME / GO ONLINE                                   │
│                                                     │
│  [ Go Online ]  ← PATCH /api/agents/:id/status      │
│                                                     │
│  Today's stats:                                     │
│  Deliveries: 0/12  |  Earnings: ₹0  |  Km: 0       │
└────────────────────┬────────────────────────────────┘
                     │ (after going online)
                     ▼
┌─────────────────────────────────────────────────────┐
│  MY ROUTE  (GET /api/routes/:id)                    │
│                                                     │
│  Stop 1  ● Rahul Sharma        [ Navigate ]         │
│           123 MG Road, 1.2km                        │
│           ETA: 10:15 AM                             │
│                                                     │
│  Stop 2  ● Priya Mehta         [ Navigate ]         │
│           45 Park St, 2.8km                         │
│           ETA: 10:38 AM                             │
│  ...                                                │
│                                                     │
│  Total: 12 stops | 18.4 km | ~3h 20min              │
└────────────────────┬────────────────────────────────┘
                     │ (taps stop)
                     ▼
┌─────────────────────────────────────────────────────┐
│  STOP DETAIL                                        │
│                                                     │
│  Rahul Sharma  |  +91 98765 43210                   │
│  123 MG Road, Andheri East, Mumbai 400069           │
│                                                     │
│  Parcel: 2kg, Medium box                            │
│  Window: 10:00 AM – 12:00 PM                        │
│  Fare: ₹47                                          │
│                                                     │
│  [ Open in Maps ]                                   │
│                                                     │
│  [ Heading to this Stop ]  ← POST /stops/:id/depart │
│    (triggers customer live tracking)                │
└────────────────────┬────────────────────────────────┘
                     │ (after tapping "Heading to Stop")
                     ▼
┌─────────────────────────────────────────────────────┐
│  EN ROUTE  (GPS streaming active)                   │
│                                                     │
│  Navigating to Rahul Sharma...                      │
│  Live tracking active for customer                  │
│                                                     │
│  [ I've Arrived ]  ← POST /stops/:id/arrived        │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│  AT STOP — ATTEMPT DELIVERY                         │
│                                                     │
│  [ Take POD Photo ]  ← PUT /stops/:id/photo → R2   │
│                                                     │
│  Enter OTP from customer:  [ _ _ _ _ ]             │
│  [ Verify & Mark Delivered ]                        │
│                                                     │
│  ── OR ──                                           │
│                                                     │
│  [ Mark as Failed ]                                 │
│    ○ Customer not home                              │
│    ○ Wrong address                                  │
│    ○ Customer refused                               │
│    ○ Other                                          │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│  STOP DONE  ✓                                       │
│                                                     │
│  Delivered to Rahul Sharma                          │
│  Earnings this stop: ₹37.60                         │
│                                                     │
│  [ Next Stop → ]                                    │
└─────────────────────────────────────────────────────┘
```

### Earnings Tab

```
┌─────────────────────────────────────────────────────┐
│  MY EARNINGS  (GET /api/agents/:id/earnings)        │
│                                                     │
│  Today      ₹ 452.00   (12 delivered, 1 failed)     │
│  This Week  ₹ 2,140.00                              │
│  Pending    ₹ 452.00   (awaiting approval)          │
│  Paid       ₹ 1,688.00                              │
│                                                     │
│  Per-delivery breakdown:                            │
│  ✓ Rahul Sharma      ₹37.60  10:22 AM              │
│  ✓ Priya Mehta       ₹44.00  10:51 AM              │
│  ✗ Suresh Kumar      ₹0.00   11:14 AM  (failed)    │
│  ...                                                │
└─────────────────────────────────────────────────────┘
```

### Technical Notes — Agent PWA

| Concern | Solution |
|---|---|
| GPS streaming | `navigator.geolocation.watchPosition` → WS `/ws/agent/:agentId` |
| Background GPS | Service Worker keeps WS alive when app backgrounded |
| Offline stops | IndexedDB local cache of route stops; sync on reconnect |
| POD photo | `<input type="file" capture="environment">` → multipart to R2 presigned URL |
| OTP entry | Numeric keypad input, verified server-side against D1 hash |
| Low-end device | PWA, no heavy maps in agent app (maps open externally in Google Maps / device nav) |
| Auth persistence | Clerk session token stored in localStorage, refreshed silently |

---

## 12. Seller UI — Order Intake

### Overview
The Seller UI is the **entry point of the entire system**. E-commerce companies
(tenants) log in here to submit delivery orders — either manually one at a time,
in bulk via CSV, or programmatically via API. This is where the delivery lifecycle
begins.

Seller is a Clerk role (`role: seller`) scoped to their `tenant_id`. Each seller
maps to one or more hubs they ship from.

---

### Screens & Flows

#### 12.1 Seller Onboarding

```
┌─────────────────────────────────────────────────────┐
│  SIGN UP / LOGIN                                    │
│  Clerk-powered (email + password or Google SSO)     │
│                                                     │
│  After signup → onboarding wizard:                  │
│   Step 1: Company name, GSTIN, contact              │
│   Step 2: Select hub(s) to ship from                │
│   Step 3: Configure fare preferences                │
│   Step 4: Generate API key (for programmatic use)   │
│                                                     │
│  [ Complete Setup → Go to Dashboard ]               │
└─────────────────────────────────────────────────────┘
```

#### 12.2 Seller Dashboard (Home)

```
┌─────────────────────────────────────────────────────┐
│  DASHBOARD                             Acme Corp ▾  │
│                                                     │
│  Today's Overview                                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │
│  │  Total   │ │  Out for │ │Delivered │ │ Failed │ │
│  │  Orders  │ │ Delivery │ │          │ │        │ │
│  │    124   │ │    67    │ │    48    │ │    9   │ │
│  └──────────┘ └──────────┘ └──────────┘ └────────┘ │
│                                                     │
│  Success Rate: 84.2%   Avg Delivery Time: 2h 14m    │
│                                                     │
│  Recent Orders                                      │
│  ORD-001  Rahul Sharma   Mumbai    ● Delivered      │
│  ORD-002  Priya Mehta    Thane     ● In Transit     │
│  ORD-003  Suresh Kumar   Andheri   ● Failed         │
│  ...                        [ View All Orders → ]   │
│                                                     │
│  [ + New Order ]   [ ↑ Bulk Upload ]                │
└─────────────────────────────────────────────────────┘
```

#### 12.3 Single Order Intake

```
┌─────────────────────────────────────────────────────┐
│  NEW ORDER                                          │
│                                                     │
│  Customer Details                                   │
│  Name        [ Rahul Sharma              ]          │
│  Phone       [ +91 98765 43210           ]          │
│  Email       [ rahul@example.com         ]          │
│                                                     │
│  Delivery Address                                   │
│  Address     [ 123 MG Road, Andheri East ]          │
│  City        [ Mumbai        ]                      │
│  Pincode     [ 400069        ]                      │
│  [ Verify Address ]  ← geocode check on blur        │
│  ✓ Address verified — 12.4 km from hub              │
│                                                     │
│  Parcel Details                                     │
│  Weight      [ 2   ] kg                             │
│  Size        ○ Small  ● Medium  ○ Large             │
│  Fragile?    [ ] Yes                                │
│  Reference # [ ORD-SELLER-9821        ]             │
│                                                     │
│  Delivery Window                                    │
│  Date        [ 26 Apr 2026  ]                       │
│  Window      ● 9am–1pm  ○ 1pm–5pm  ○ 5pm–9pm       │
│              (Narrow window <3h → +₹15 fare)        │
│                                                     │
│  Quoted Fare: ₹ 67.00  (preview, updates live)      │
│                                                     │
│  [ Cancel ]              [ Submit Order → ]         │
└─────────────────────────────────────────────────────┘
```

**On Submit:**
```
POST /api/orders
  → Worker: validate, geocode, calculate quoted_fare
  → D1: insert order (status=placed)
  → Queue: "order.created"
  → Response: { orderId, trackingToken, quotedFare, eta_window }

Seller sees: order appears in list with status "Placed"
Customer receives: order confirmation email with tracking token
```

#### 12.4 Bulk Order Intake (CSV Upload)

```
┌─────────────────────────────────────────────────────┐
│  BULK UPLOAD                                        │
│                                                     │
│  [ Download CSV Template ]                          │
│                                                     │
│  Drag & drop your CSV here                         │
│  ┌─────────────────────────────────────────────┐   │
│  │  orders_26apr.csv  (124 rows detected)       │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Validation Preview                                 │
│  ✓ 121 rows valid                                   │
│  ✗  3 rows have errors:                             │
│     Row 14: invalid pincode                         │
│     Row 67: missing customer phone                  │
│     Row 98: address not geocodable                  │
│                                                     │
│  [ Fix Errors ]   [ Skip Errors & Upload 121 ]      │
│                                                     │
│  Total Quoted Fare: ₹ 7,834.00                      │
│  [ Confirm & Submit Batch → ]                       │
└─────────────────────────────────────────────────────┘
```

**CSV Template columns:**
```
customer_name, customer_phone, customer_email,
address, city, pincode,
weight_kg, size (small|medium|large), fragile (yes|no),
delivery_date, delivery_window (morning|afternoon|evening),
seller_reference_id
```

**On Submit:**
```
POST /api/orders/bulk  { file: multipart CSV }
  → Worker: parse CSV rows (stream via R2 presigned upload for large files)
  → Validate each row: geocode + fare quote
  → Return validation report (errors flagged, valid rows previewed)

POST /api/orders/bulk/confirm  { batchId }
  → Worker: insert all valid rows into D1
  → Enqueue each order into Queues individually
  → Return { total, accepted, rejected, totalFare }
```

#### 12.5 Order List & Filters

```
┌─────────────────────────────────────────────────────┐
│  ALL ORDERS                       [ + New ] [ ↑ CSV]│
│                                                     │
│  Filters:                                           │
│  Status  [ All ▾ ]  Date [ Today ▾ ]  Hub [ All ▾ ]│
│  Search  [ order ID or customer name...    ]        │
│                                                     │
│  Order ID    Customer       Status        Fare      │
│  ──────────────────────────────────────────────     │
│  ORD-001     Rahul Sharma   ✓ Delivered   ₹67       │
│  ORD-002     Priya Mehta    ⟳ In Transit  ₹52       │
│  ORD-003     Suresh Kumar   ✗ Failed      ₹0        │
│  ORD-004     Anita Desai    ◷ Out for Del ₹44       │
│  ...                                                │
│                                         [Export CSV]│
└─────────────────────────────────────────────────────┘
```

#### 12.6 Order Detail (Seller View)

```
┌─────────────────────────────────────────────────────┐
│  ORDER  ORD-002                    [ Cancel Order ] │
│                                                     │
│  Customer: Priya Mehta  •  +91 99123 45678          │
│  Address:  45 Park St, Thane, 400601                │
│  Parcel:   1.5kg, Small, Non-fragile                │
│  Window:   26 Apr, 1pm–5pm                          │
│  Ref:      SELLER-ORD-772                           │
│                                                     │
│  Fare: ₹52.00 (quoted)  →  ₹49.00 (settled)         │
│                                                     │
│  Status Timeline                    ← UPS Mode      │
│  ✓ Placed          25 Apr, 11:02 AM                 │
│  ✓ Confirmed       25 Apr, 11:03 AM                 │
│  ✓ Packed          26 Apr, 08:45 AM                 │
│  ✓ Out for Delivery 26 Apr, 09:30 AM                │
│  ⟳ In Transit      26 Apr, 02:14 PM  ← Mode 2 active│
│                                                     │
│  Agent: Vikram D.  •  Enroute since 2:14 PM         │
│  ETA: ~2:38 PM (est)                                │
│                                                     │
│  [ View Live Tracking ]  ← same link as customer    │
└─────────────────────────────────────────────────────┘
```

#### 12.7 API Key Management (Programmatic Intake)

```
┌─────────────────────────────────────────────────────┐
│  DEVELOPER  →  API ACCESS                           │
│                                                     │
│  Your API Key                                       │
│  sk_live_••••••••••••••••  [ Reveal ] [ Rotate ]    │
│                                                     │
│  Usage this month: 1,243 API calls                  │
│                                                     │
│  Webhooks                                           │
│  Endpoint URL  [ https://yourstore.com/webhooks ]   │
│  Events        [✓] order.delivered                  │
│                [✓] order.failed                     │
│                [ ] order.out_for_delivery           │
│  Secret        [ auto-generated HMAC secret ]       │
│  [ Save Webhook ]                                   │
│                                                     │
│  Docs: POST /api/orders with Bearer {API_KEY}       │
└─────────────────────────────────────────────────────┘
```

---

### Seller D1 Schema Additions

```sql
sellers
  id, clerk_user_id, tenant_id
  company_name, gstin, contact_email, contact_phone
  api_key_hash               -- hashed API key for programmatic access
  webhook_url, webhook_secret, webhook_events (JSON array)
  status: ENUM(active|suspended)
  created_at

order_batches
  id, seller_id, tenant_id
  total_rows, accepted_rows, rejected_rows
  total_quoted_fare
  status: ENUM(pending_confirm|confirmed|processing|done)
  r2_key                     -- raw CSV stored in R2
  validation_report (JSON)   -- per-row errors
  created_at
```

---

### Seller API Surface Additions

```
# Auth (Clerk handles UI, API key for programmatic)
POST   /api/sellers/register            onboard new seller tenant
GET    /api/sellers/me                  get seller profile + stats

# Order intake
POST   /api/orders                      single order (UI or API key)
POST   /api/orders/bulk                 upload + validate CSV batch
POST   /api/orders/bulk/:batchId/confirm  confirm and submit valid rows
GET    /api/orders                      list with filters (status, date, hub)
GET    /api/orders/:id                  order detail including seller tracking view
DELETE /api/orders/:id                  cancel order (only if status=placed|confirmed)

# Webhooks
PUT    /api/sellers/webhook             configure webhook endpoint + events
POST   /api/sellers/webhook/test        send a test event to webhook URL

# API key
POST   /api/sellers/api-key/rotate     rotate API key (old key invalidated)
```

---

### Webhook Outbound Events

When a seller configures a webhook, the Worker fires a signed POST to their URL on
each subscribed event:

```json
{
  "event": "order.delivered",
  "order_id": "ORD-002",
  "seller_reference_id": "SELLER-ORD-772",
  "timestamp": "2026-04-26T14:38:00Z",
  "data": {
    "status": "delivered",
    "delivered_at": "2026-04-26T14:37:52Z",
    "agent_name": "Vikram D.",
    "pod_photo_url": "https://r2.../pods/ORD-002.jpg"
  }
}
```

Signature: `X-Webhook-Signature: HMAC-SHA256(payload, webhook_secret)`
Seller verifies signature on their end before processing.

Delivery: fired from Queue consumer → retried up to 3 times with exponential backoff.

---

## 16. Notification Timeline (Customer Emails)

| Trigger | Email Content |
|---|---|
| Order placed | Confirmation + order summary |
| Order confirmed | "We've confirmed your order" |
| Packed at hub | "Your parcel is packed and ready" |
| Out for delivery | "Out for delivery — ETA window: 2pm–4pm" |
| **Live tracking starts** | **"Your driver is on the way — [Track Live]"** |
| Delivered | "Delivered — thanks for shopping with us" |
| Failed attempt | "We couldn't deliver — [Reschedule]" |
| ETA shift > 10min | "Your ETA has been updated to X:XX pm" |

---

## 13. API Surface

```
# Orders
POST   /api/orders                      create order
GET    /api/orders/:id                  get order detail
PATCH  /api/orders/:id/reschedule       reschedule failed delivery

# Agents
GET    /api/agents                      list agents (admin/dispatcher)
PATCH  /api/agents/:id/status           set online/offline

# Routes
POST   /api/routes/optimize             trigger AI route optimization
GET    /api/routes/:id                  get route + ordered stops with ETAs
PATCH  /api/routes/:id/activate         dispatch route to agent

# Stops (agent actions)
POST   /api/stops/:id/depart            agent heading to this stop → triggers Mode 2
POST   /api/stops/:id/arrived           agent arrived at stop
POST   /api/stops/:id/attempt           mark delivered or failed
PUT    /api/stops/:id/photo             upload POD photo to R2

# WebSockets
WS     /ws/agent/:agentId              agent GPS stream (write) → DeliverySessionDO
WS     /ws/track/:orderId              customer live map (read) ← DeliverySessionDO

# Public tracking (no Clerk auth, HMAC token only)
GET    /track/:token                    get order state + tracking mode
POST   /track/:token/verify-otp         customer submits OTP for delivery confirmation

# Fare
GET    /api/fares/config                get fare config for tenant
PUT    /api/fares/config                update fare config (admin only)
GET    /api/orders/:id/fare             get quoted + settled fare breakdown
GET    /api/agents/:id/earnings         partner earnings summary (filterable by date)
GET    /api/earnings/summary            hub-level settlement report (admin/dispatcher)
```

---

## 14. wrangler.jsonc Bindings

```jsonc
{
  "name": "backend",
  "main": "src/index.ts",
  "compatibility_date": "2026-04-25",
  "compatibility_flags": ["nodejs_compat"],

  "d1_databases": [
    { "binding": "DB", "database_name": "lastmile-db", "database_id": "..." }
  ],
  "kv_namespaces": [
    { "binding": "CACHE", "id": "..." }
    // stores: ETA cache, tracking_mode flags, geocode cache, JWKS
  ],
  "r2_buckets": [
    { "binding": "STORAGE", "bucket_name": "lastmile-pods" }
  ],
  "queues": {
    "producers": [
      { "binding": "ORDER_QUEUE", "queue": "order-events" }
    ],
    "consumers": [
      { "queue": "order-events", "max_batch_size": 10, "max_retries": 3 }
    ]
  },
  "durable_objects": {
    "bindings": [
      { "name": "DELIVERY_SESSION", "class_name": "DeliverySessionDO" }
      // one DO instance per active agent
    ]
  },
  "ai": { "binding": "AI" },
  "workflows": [
    {
      "binding": "ORDER_WORKFLOW",
      "name": "OrderLifecycleWorkflow",
      "class_name": "OrderLifecycleWorkflow"
    }
  ],
  "send_email": [
    { "name": "EMAIL" }
  ],
  "observability": { "enabled": true, "head_sampling_rate": 1 },

  "vars": {
    "CLERK_PUBLISHABLE_KEY": "pk_...",
    "TRACKING_HMAC_SECRET": "" // use: wrangler secret put TRACKING_HMAC_SECRET
    // also secret put: CLERK_SECRET_KEY
  }
}
```

---

## 15. End-to-End Data Flow Summary

```
[ORDER PLACED]
     │
     ▼
Queue → Workflow → assign agent → optimize route → ETAs in KV
     │
     ▼
Customer emails: placed → confirmed → packed → out_for_delivery   ← UPS Mode active

[DRIVER STARTS ROUTE]
     │
     ▼
Agent PWA connects WS → DeliverySessionDO (GPS stream starts)

[DRIVER TAPS "HEADING TO STOP" for Order #123]
     │
     ├── D1: status → in_transit
     ├── KV: tracking_mode = "live"
     └── Email customer: "Track live →"                           ← Uber/Blinkit Mode activates

Customer opens link → WS /ws/track/123 → DO subscriber added
Driver GPS pings → DO broadcasts → customer map updates live

[DELIVERY ATTEMPT]
     │
     ├── SUCCESS: R2 photo + OTP verify → D1 delivered → DO closes → confirm email
     └── FAILURE: reason selected → D1 failed → DO closes → reschedule email
```
