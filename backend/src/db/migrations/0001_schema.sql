-- ============================================================
-- Breaking Code — Smart Last Mile Delivery System
-- D1 Schema  (SQLite / Cloudflare D1)
-- ============================================================

-- ── Hubs ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS hubs (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL,
  name       TEXT NOT NULL,
  address    TEXT NOT NULL,
  lat        REAL NOT NULL,
  lng        REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Sellers (Domain 1) ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS sellers (
  id              TEXT PRIMARY KEY,
  clerk_user_id   TEXT NOT NULL UNIQUE,
  tenant_id       TEXT NOT NULL,
  company_name    TEXT NOT NULL,
  gstin           TEXT,
  api_key_hash    TEXT,
  webhook_url     TEXT,
  webhook_secret  TEXT,
  webhook_events  TEXT NOT NULL DEFAULT '[]',   -- JSON string[]
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sellers_tenant ON sellers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sellers_api_key ON sellers(api_key_hash);

-- ── Orders (Domain 1 owns, all domains read) ─────────────────

CREATE TABLE IF NOT EXISTS orders (
  id                     TEXT PRIMARY KEY,
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
  otp_code_hash          TEXT,
  tracking_token         TEXT,
  notes                  TEXT,
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at             TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_orders_tenant_status  ON orders(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_hub_status     ON orders(hub_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_seller         ON orders(seller_id, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_tracking_token ON orders(tracking_token);

-- ── Delivery Agents (Domain 2 owns) ─────────────────────────

CREATE TABLE IF NOT EXISTS delivery_agents (
  id             TEXT PRIMARY KEY,
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

CREATE INDEX IF NOT EXISTS idx_agents_hub_status ON delivery_agents(hub_id, status);
CREATE INDEX IF NOT EXISTS idx_agents_tenant     ON delivery_agents(tenant_id);

-- ── Routes (Domain 2 owns) ───────────────────────────────────

CREATE TABLE IF NOT EXISTS routes (
  id                      TEXT PRIMARY KEY,
  tenant_id               TEXT NOT NULL,
  agent_id                TEXT REFERENCES delivery_agents(id),
  hub_id                  TEXT NOT NULL REFERENCES hubs(id),
  date                    TEXT NOT NULL,             -- YYYY-MM-DD
  status                  TEXT NOT NULL DEFAULT 'planned'
                            CHECK (status IN ('planned','active','completed')),
  optimized_sequence      TEXT NOT NULL DEFAULT '[]',  -- JSON: ordered stop IDs
  total_distance_km       REAL NOT NULL DEFAULT 0,
  estimated_duration_mins INTEGER NOT NULL DEFAULT 0,
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_routes_hub_date  ON routes(hub_id, date);
CREATE INDEX IF NOT EXISTS idx_routes_agent     ON routes(agent_id, status);
CREATE INDEX IF NOT EXISTS idx_routes_tenant    ON routes(tenant_id, date);

-- ── Route Stops (Domain 2 creates, Domain 3 updates) ─────────

CREATE TABLE IF NOT EXISTS route_stops (
  id                    TEXT PRIMARY KEY,
  route_id              TEXT NOT NULL REFERENCES routes(id),
  order_id              TEXT NOT NULL REFERENCES orders(id),
  sequence_no           INTEGER NOT NULL,
  status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN (
                            'pending','heading_to','arrived','delivered','failed'
                          )),
  --  heading_to = Mode 2 trigger (live tracking activates)
  eta                   TEXT,                        -- ISO 8601
  actual_arrival_at     TEXT,
  actual_departure_at   TEXT,
  failure_reason        TEXT,
  distance_from_prev_km REAL NOT NULL DEFAULT 0,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_stops_route_seq ON route_stops(route_id, sequence_no);
CREATE INDEX IF NOT EXISTS idx_stops_order     ON route_stops(order_id);
CREATE INDEX IF NOT EXISTS idx_stops_status    ON route_stops(status);

-- ── Delivery Events (Domain 3 owns) ──────────────────────────

CREATE TABLE IF NOT EXISTS delivery_events (
  id          TEXT PRIMARY KEY,
  order_id    TEXT NOT NULL REFERENCES orders(id),
  agent_id    TEXT REFERENCES delivery_agents(id),
  event_type  TEXT NOT NULL,
  --  e.g. status_changed | gps_ping | otp_verified | photo_uploaded
  lat         REAL,
  lng         REAL,
  metadata    TEXT NOT NULL DEFAULT '{}',   -- JSON
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_events_order    ON delivery_events(order_id, created_at);
CREATE INDEX IF NOT EXISTS idx_events_agent    ON delivery_events(agent_id, created_at);

-- ── Order Batches (Domain 1 owns) ────────────────────────────

CREATE TABLE IF NOT EXISTS order_batches (
  id                TEXT PRIMARY KEY,
  seller_id         TEXT NOT NULL REFERENCES sellers(id),
  total_rows        INTEGER NOT NULL DEFAULT 0,
  accepted_rows     INTEGER NOT NULL DEFAULT 0,
  rejected_rows     INTEGER NOT NULL DEFAULT 0,
  total_quoted_fare REAL NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN (
                        'pending','validated','confirmed','processing','done','failed'
                      )),
  r2_key            TEXT,
  validation_report TEXT NOT NULL DEFAULT '{}',   -- JSON
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_batches_seller ON order_batches(seller_id, created_at);

-- ── Fare Configs (Domain 5 owns) ─────────────────────────────

CREATE TABLE IF NOT EXISTS fare_configs (
  id                     TEXT PRIMARY KEY,
  tenant_id              TEXT NOT NULL UNIQUE,
  base_fare              REAL NOT NULL DEFAULT 20,
  per_km_rate            REAL NOT NULL DEFAULT 5,
  weight_tier_1_max      REAL NOT NULL DEFAULT 1,
  weight_tier_1_surcharge REAL NOT NULL DEFAULT 0,
  weight_tier_2_max      REAL NOT NULL DEFAULT 5,
  weight_tier_2_surcharge REAL NOT NULL DEFAULT 10,
  weight_tier_3_surcharge REAL NOT NULL DEFAULT 25,
  zone_type              TEXT NOT NULL DEFAULT 'urban'
                           CHECK (zone_type IN ('urban','semi_urban')),
  zone_premium_pct       REAL NOT NULL DEFAULT 0,
  narrow_window_premium  REAL NOT NULL DEFAULT 15,   -- applies when window < 3 h
  bulk_threshold         INTEGER NOT NULL DEFAULT 50,
  bulk_discount_pct      REAL NOT NULL DEFAULT 5,
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at             TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Order Fares (Domain 5 owns) ───────────────────────────────

CREATE TABLE IF NOT EXISTS order_fares (
  id           TEXT PRIMARY KEY,
  order_id     TEXT NOT NULL REFERENCES orders(id),
  quoted_fare  REAL NOT NULL,
  settled_fare REAL,
  distance_km  REAL,
  breakdown    TEXT NOT NULL DEFAULT '{}',   -- JSON itemised breakdown
  status       TEXT NOT NULL DEFAULT 'quoted'
                 CHECK (status IN ('quoted','settled','waived')),
  settled_at   TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_fares_order ON order_fares(order_id);

-- ── Partner Earnings (Domain 5 owns) ─────────────────────────

CREATE TABLE IF NOT EXISTS partner_earnings (
  id              TEXT PRIMARY KEY,
  agent_id        TEXT NOT NULL REFERENCES delivery_agents(id),
  order_id        TEXT NOT NULL REFERENCES orders(id),
  gross_fare      REAL NOT NULL,
  commission_pct  REAL NOT NULL DEFAULT 80,
  partner_payout  REAL NOT NULL,
  platform_cut    REAL NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','paid')),
  paid_at         TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_earnings_agent  ON partner_earnings(agent_id, status);
CREATE INDEX IF NOT EXISTS idx_earnings_order  ON partner_earnings(order_id);

-- ── Customer Comms Log (Domain 4 owns) ───────────────────────

CREATE TABLE IF NOT EXISTS customer_comms (
  id         TEXT PRIMARY KEY,
  order_id   TEXT NOT NULL REFERENCES orders(id),
  channel    TEXT NOT NULL CHECK (channel IN ('email','sms','push')),
  event_type TEXT NOT NULL,
  recipient  TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','failed','bounced')),
  sent_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_comms_order ON customer_comms(order_id, sent_at);
