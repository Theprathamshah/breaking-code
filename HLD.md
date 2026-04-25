Here's the updated HLD with the tech stack section added in the right place — right after the Actors section, before the lifecycle, so it reads as foundational context before the logic kicks in.

---

# HLD — TrustShip Premium Last-Mile Delivery

---

## 1. What We're Building

A platform that sits between an e-commerce seller and their customer's doorstep. Three things make it premium: every party knows exactly what's happening in real time, every action is permanently recorded, and high-value shipments can be insured.

---

## 2. Actors

| Actor | What They Do |
|---|---|
| **Seller** | Creates orders, declares product value, tracks shipments |
| **Admin** | Tags parcels, assigns agents, approves insurance/KYC, manages exceptions |
| **Delivery Agent** | Picks up, navigates to customer, attempts delivery |
| **Customer** | Confirms availability, receives OTP, gives feedback |

---

## 3. Tech Stack

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

## 4. Order Lifecycle

```
Created ──► Ready to Pick ──► In Transit ──► Attempt to Deliver ──► Delivered
                                                      │
                                                      ▼
                                                  In Retry ──► Ready to Pick (EOD)
```

| State | Trigger | Key Logic |
|---|---|---|
| **Created** | Seller submits order | Value declared, insurance opted in, bulk or single |
| **Ready to Pick** | Admin tags parcel | Receipt printed, photos taken, agent assigned by zone, customer availability confirmed via WhatsApp |
| **In Transit** | Agent taps Start | GPS tracking begins, all stakeholders can see live location |
| **Attempt to Deliver** | Agent taps Arrived | OTP sent to customer WhatsApp, KYC check if applicable, photos captured |
| **Delivered** | OTP matched | Audit record sealed, feedback triggered via WhatsApp |
| **In Retry** | OTP timeout or failure | Return to warehouse logged, diff check against original details, flips to Ready to Pick at end of day |

---

## 5. Core Domains

### 5.1 Order Intake
Seller creates an order with customer details, declared product value, and optional insurance. Orders can come in one at a time via a form, in bulk via CSV, or programmatically via API. At intake, the system validates the address and generates a quoted fare. High-value orders flag for insurance premium calculation and KYC requirement.

### 5.2 Dispatch & Assignment
Once a parcel is tagged by admin, the system assigns a delivery agent based on delivery zone and availability. Before dispatch, a WhatsApp message goes to the customer asking for their availability window. The system then groups stops into an optimised route for the agent's day via Workers AI.

### 5.3 Live Tracking
Two tracking modes run across the lifecycle.

**Milestone mode** is always on — seller and customer see a status timeline from order creation through to delivery. The frontend polls D1 order state every 30 seconds.

**Live mode** activates the moment the agent taps "heading to this stop." A Durable Object spins up per active agent, holding GPS state and fanning out to all connected customer WebSockets in real time. The customer receives a WhatsApp link and sees the agent moving on the map with a live ETA. Live mode closes when the stop is marked delivered or failed, and the Durable Object hibernates.

### 5.4 Delivery Execution
The agent works through a stop list on their PWA. At each stop they capture photos to R2, trigger the OTP flow, and record the outcome. For open-box deliveries, photos are mandatory before the OTP step. For insured or high-value orders, KYC verification is required at the door. Every action is timestamped and written to the audit log in D1.

### 5.5 Audit & Accountability
Every state transition, photo, GPS ping, OTP attempt, and actor action is written to an immutable event log in D1. This is the backbone of the insurance offering — claims are supported by a complete, timestamped paper trail. Admins and sellers can inspect the full audit trail per order at any time.

### 5.6 Insurance & Valuation
At order creation, the seller declares the product value. Above a configurable threshold, the system calculates an insurance premium and flags the order for KYC. Insurance is backed by the audit trail — if something goes wrong, the documentation exists to support a claim.

### 5.7 Feedback & Performance
After delivery, the customer receives a WhatsApp feedback prompt. Sellers can rate the delivery partner via their dashboard. Feedback is tied to the agent record and feeds into performance scoring over time.

---

## 6. Key Flows

### Order Created → Ready to Pick
```
Seller submits order
    │
    ├── Address validated + fare quoted (Cloudflare Worker)
    ├── Insurance premium calculated if high value
    ├── Order written to D1 (status: Created)
    └── order.created enqueued → Cloudflare Queue

Admin opens order
    │
    ├── Tags physical parcel (label printed, receipt generated)
    ├── Photos uploaded → R2
    ├── Agent assigned by zone and availability
    ├── WhatsApp sent to customer → availability confirmation
    └── Order moves to Ready to Pick on customer confirmation
```

### Agent Departs → Live Tracking Activates
```
Agent taps "Heading to Stop" (Agent PWA)
    │
    ├── D1: order status → In Transit
    ├── KV: tracking_mode = "live" for order
    ├── Queue: live_tracking.started → WhatsApp sent to customer with tracking link
    └── Durable Object activated for this agent

Customer opens tracking link
    └── WebSocket connects to Durable Object → sees agent moving on map live

Agent marks Arrived
    └── OTP sent to customer WhatsApp
```

### Delivery Attempt
```
Agent at door
    │
    ├── [Open Box] Photos captured → R2
    ├── [KYC] Identity verified if applicable
    ├── Customer shares OTP
    │
    ├── OTP correct → Delivered
    │       ├── D1 order status → Delivered
    │       ├── KV: tracking_mode = "done"
    │       ├── Durable Object closes all WebSocket connections
    │       ├── Audit record sealed
    │       └── Feedback WhatsApp sent to customer
    │
    └── OTP timeout / failure → In Retry
            ├── Reason logged to D1 audit log
            ├── Diff check: compare current details against original order
            └── Flips to Ready to Pick at EOD via Cloudflare Workflow
```

---

## 7. Communication Layer (WhatsApp-First)

All customer-facing communication runs through WhatsApp. No app required.

| Trigger | Message |
|---|---|
| Order Ready to Pick | Availability confirmation request |
| Agent en route | Live tracking link |
| Agent at door | OTP for delivery |
| Delivered | Feedback prompt |
| Failed attempt | Reschedule options |

Seller and admin communication happens through dashboard UI (React + Vite, hosted on Cloudflare Pages).

---

## 8. Data Domains

### Order
Lifecycle state, declared value, insurance flag, KYC requirement, tracking token (HMAC-signed for public tracking URL), references to parcel, customer, agent, and audit records. Stored in D1.

### Parcel
Tag ID, R2 photo references at each stage, open-box flag, receipt URL.

### Customer
Contact details, confirmed availability window, OTP state and expiry, KYC document reference.

### Delivery Agent
Profile, zone, current GPS coordinates (updated via Durable Object), assigned stops, availability status.

### Audit Log
Immutable append-only records in D1. Every actor, every event, every timestamp. Metadata stored as JSON per event row.

### Feedback
Rating and comment from customer and seller, linked to order and agent record.

---

## 9. Dashboards

| Dashboard | Key Capabilities |
|---|---|
| **Admin** | All orders across all states, agent map, exception management, KYC approval, insurance review, product value modal |
| **Seller** | Order creation, bulk CSV upload, live tracking per order, delivery partner rating, order history |
| **Delivery Agent** | Today's stop list, navigation, OTP entry, photo capture, stop-by-stop status (PWA, mobile-first) |
| **Customer** | WhatsApp-first, no app — tracking link only, WebSocket live map when agent is en route |

---

## 10. Fare Logic

```
Quoted Fare = Base + (Distance × Rate) + Weight Surcharge + Zone Premium + Narrow Window Fee − Bulk Discount

Settled Fare = Recalculated at delivery with actual distance
```

Fare config is cached in KV per tenant (TTL 1h). Sellers see a live fare preview as they fill the order form. Bulk orders show a total quoted fare before confirmation. Fares are reconciled at delivery, written to D1, and agent payouts are calculated from settled fares.

---

## 11. What Makes This Different

Most logistics platforms optimise for volume. TrustShip optimises for value. The audit trail, insurance backing, open-box documentation, and real-time accountability are built for sellers whose products cannot afford to be lost, damaged, or unaccounted for. Over time the platform brand itself becomes the trust signal — sellers use it to elevate their customer experience, customers learn to recognise it as a guarantee.