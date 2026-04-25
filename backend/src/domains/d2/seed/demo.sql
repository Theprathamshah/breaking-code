-- ── D2 Demo Seed ─────────────────────────────────────────────────────────────
-- Run after the main schema migration and D1 seed (sellers + orders must exist).
-- Uses tenant_demo / hub_demo01 as the demo tenant.
--
-- Apply with:
--   npx wrangler d1 execute lastmile-db --local --file src/domains/d2/seed/demo.sql

-- ── Hub ───────────────────────────────────────────────────────────────────────

INSERT OR IGNORE INTO hubs (id, tenant_id, name, address, lat, lng)
VALUES
  ('hub_demo01', 'tenant_demo', 'Mumbai Central Hub',  'Andheri East, Mumbai 400069', 19.076, 72.877),
  ('hub_demo02', 'tenant_demo', 'Pune Kothrud Hub',    'Kothrud, Pune 411038',        18.508, 73.808);

-- ── Delivery Agents ───────────────────────────────────────────────────────────

INSERT OR IGNORE INTO delivery_agents
  (id, tenant_id, clerk_user_id, name, phone, vehicle_type, hub_id, status, commission_pct)
VALUES
  ('agent_demo01', 'tenant_demo', 'user_demo_agent1', 'Ravi Sharma',  '+919876541001', 'bike',    'hub_demo01', 'available', 80),
  ('agent_demo02', 'tenant_demo', 'user_demo_agent2', 'Kiran Patil',  '+919876541002', 'scooter', 'hub_demo01', 'available', 80),
  ('agent_demo03', 'tenant_demo', 'user_demo_agent3', 'Suresh Nair',  '+919876541003', 'bike',    'hub_demo01', 'offline',   80),
  ('agent_demo04', 'tenant_demo', 'user_demo_agent4', 'Meena Joshi',  '+919876541004', 'van',     'hub_demo02', 'available', 75),
  ('agent_demo05', 'tenant_demo', 'user_demo_agent5', 'Arjun Singh',  '+919876541005', 'cycle',   'hub_demo02', 'offline',   80);

-- ── Sellers ───────────────────────────────────────────────────────────────────

INSERT OR IGNORE INTO sellers
  (id, clerk_user_id, tenant_id, company_name)
VALUES
  ('seller_demo01', 'user_demo_seller1', 'tenant_demo', 'FashionHub India'),
  ('seller_demo02', 'user_demo_seller2', 'tenant_demo', 'ElectroMart');

-- ── Orders (confirmed + packed — eligible for route optimization) ─────────────

INSERT OR IGNORE INTO orders
  (id, tenant_id, seller_id, customer_name, customer_phone, address, lat, lng, hub_id, status, parcel_weight, parcel_size)
VALUES
  ('order_demo01', 'tenant_demo', 'seller_demo01', 'Alice Sharma',   '+919000000001', '10 MG Road, Andheri East',       19.085, 72.883, 'hub_demo01', 'confirmed', 1.2, 'small'),
  ('order_demo02', 'tenant_demo', 'seller_demo01', 'Bob Patel',      '+919000000002', '5 Hill Street, Bandra West',     19.056, 72.830, 'hub_demo01', 'confirmed', 3.5, 'medium'),
  ('order_demo03', 'tenant_demo', 'seller_demo01', 'Carol Nair',     '+919000000003', '22 Linking Road, Khar',          19.080, 72.860, 'hub_demo01', 'packed',    0.8, 'small'),
  ('order_demo04', 'tenant_demo', 'seller_demo02', 'David Rao',      '+919000000004', '3 Worli Sea Face, Worli',        19.017, 72.818, 'hub_demo01', 'packed',    5.0, 'large'),
  ('order_demo05', 'tenant_demo', 'seller_demo02', 'Eva Iyer',       '+919000000005', '67 Linking Road, Santacruz',     19.083, 72.842, 'hub_demo01', 'confirmed', 1.5, 'small'),
  ('order_demo06', 'tenant_demo', 'seller_demo01', 'Farhan Khan',    '+919000000006', '14 Palm Beach Rd, Juhu',         19.101, 72.826, 'hub_demo01', 'confirmed', 2.3, 'medium'),
  ('order_demo07', 'tenant_demo', 'seller_demo01', 'Geeta Menon',    '+919000000007', '88 Carter Rd, Bandra East',      19.060, 72.835, 'hub_demo01', 'delivered', 1.0, 'small'),
  ('order_demo08', 'tenant_demo', 'seller_demo02', 'Hari Krishnan',  '+919000000008', '12 SV Road, Malad West',         19.187, 72.848, 'hub_demo01', 'failed',    4.2, 'large');
