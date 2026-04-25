-- ── Dev Demo Seed ─────────────────────────────────────────────────────────────
-- Wipes and re-seeds all dev_tenant data for a clean UI demo.
-- Run: npx wrangler d1 execute lastmile-db --local --file src/db/seed.sql

PRAGMA foreign_keys = OFF;

DELETE FROM order_feedback  WHERE order_id IN (SELECT id FROM orders WHERE tenant_id = 'dev_tenant');
DELETE FROM partner_earnings WHERE orderE_id IN (SELECT id FROM orders WHERE tenant_id = 'dev_tenant');
DELETE FROM order_fares      WHERE order_id IN (SELECT id FROM orders WHERE tenant_id = 'dev_tenant');
DELETE FROM delivery_events WHERE order_id IN (SELECT id FROM orders WHERE tenant_id = 'dev_tenant');
DELETE FROM route_stops WHERE route_id IN (SELECT id FROM routes WHERE tenant_id = 'dev_tenant');
DELETE FROM routes         WHERE tenant_id = 'dev_tenant';
DELETE FROM orders         WHERE tenant_id = 'dev_tenant';
DELETE FROM delivery_agents WHERE tenant_id = 'dev_tenant';
DELETE FROM sellers        WHERE tenant_id = 'dev_tenant';
DELETE FROM hubs           WHERE tenant_id = 'dev_tenant';
DELETE FROM fare_configs   WHERE tenant_id = 'dev_tenant';

PRAGMA foreign_keys = ON;

-- ── Hubs ──────────────────────────────────────────────────────────────────────

INSERT INTO hubs (id, tenant_id, name, address, lat, lng) VALUES
  ('hub_mumbai',  'dev_tenant', 'Mumbai — Andheri Hub',  'MIDC, Andheri East, Mumbai 400093', 19.1136, 72.8697),
  ('hub_bandra',  'dev_tenant', 'Mumbai — Bandra Hub',   'BKC, Bandra East, Mumbai 400051',   19.0596, 72.8656),
  ('hub_thane',   'dev_tenant', 'Thane Hub',             'Wagle Estate, Thane 400604',        19.1663, 72.9964);

-- ── Sellers ───────────────────────────────────────────────────────────────────

INSERT INTO sellers (id, clerk_user_id, tenant_id, company_name) VALUES
  ('seller_nykaa',    'clerk_s1', 'dev_tenant', 'Nykaa Fashion'),
  ('seller_bewakoof', 'clerk_s2', 'dev_tenant', 'Bewakoof Brands'),
  ('seller_boat',     'clerk_s3', 'dev_tenant', 'boAt Lifestyle');

-- ── Delivery Agents ───────────────────────────────────────────────────────────
-- Replace the clerk_user_id on the first row with your own Clerk user ID
-- so the Agent View page shows your route.

INSERT INTO delivery_agents (id, tenant_id, clerk_user_id, name, phone, vehicle_type, hub_id, status, commission_pct) VALUES
  ('agent_you',    'dev_tenant', 'user_3CqLZeZzbmexj1NVg59VfgNmQSe', 'Heet (You)',      '+91-9000000001', 'bike',    'hub_mumbai', 'available', 80),
  ('agent_ravi',   'dev_tenant', 'clerk_agent_ravi',                  'Ravi Sharma',     '+91-9000000002', 'bike',    'hub_mumbai', 'on_route',  80),
  ('agent_kiran',  'dev_tenant', 'clerk_agent_kiran',                 'Kiran Patil',     '+91-9000000003', 'scooter', 'hub_mumbai', 'available', 80),
  ('agent_suresh', 'dev_tenant', 'clerk_agent_suresh',                'Suresh Nair',     '+91-9000000004', 'bike',    'hub_bandra', 'available', 80),
  ('agent_meena',  'dev_tenant', 'clerk_agent_meena',                 'Meena Joshi',     '+91-9000000005', 'van',     'hub_bandra', 'offline',   75),
  ('agent_arjun',  'dev_tenant', 'clerk_agent_arjun',                 'Arjun Singh',     '+91-9000000006', 'scooter', 'hub_thane',  'available', 80);

-- ── Orders ────────────────────────────────────────────────────────────────────
-- Mix of statuses across hubs so every stat card on the Orders page has data.

INSERT INTO orders (id, tenant_id, seller_id, customer_name, customer_phone, address, lat, lng, hub_id, status, parcel_weight, parcel_size) VALUES
  -- hub_mumbai — confirmed & packed (eligible for route optimize)
  ('ord_m01', 'dev_tenant', 'seller_nykaa',    'Priya Mehta',      '+91-9800000001', '14 Palm Beach Road, Juhu',         19.1013, 72.8264, 'hub_mumbai', 'confirmed', 1.2, 'small'),
  ('ord_m02', 'dev_tenant', 'seller_nykaa',    'Rahul Kapoor',     '+91-9800000002', '22 Hill Road, Bandra West',        19.0553, 72.8295, 'hub_mumbai', 'confirmed', 0.8, 'small'),
  ('ord_m03', 'dev_tenant', 'seller_bewakoof', 'Sunita Rao',       '+91-9800000003', '5 Linking Road, Santacruz',        19.0836, 72.8418, 'hub_mumbai', 'packed',    3.5, 'medium'),
  ('ord_m04', 'dev_tenant', 'seller_bewakoof', 'Amit Kulkarni',    '+91-9800000004', '88 Carter Road, Bandra',           19.0597, 72.8350, 'hub_mumbai', 'confirmed', 2.1, 'medium'),
  ('ord_m05', 'dev_tenant', 'seller_boat',     'Neha Joshi',       '+91-9800000005', '12 SV Road, Malad West',           19.1873, 72.8484, 'hub_mumbai', 'packed',    0.5, 'small'),
  ('ord_m06', 'dev_tenant', 'seller_boat',     'Karan Verma',      '+91-9800000006', '3 Worli Sea Face, Worli',          19.0173, 72.8184, 'hub_mumbai', 'confirmed', 5.0, 'large'),

  -- hub_mumbai — in-flight (out_for_delivery, in_transit, delivered, failed)
  ('ord_m07', 'dev_tenant', 'seller_nykaa',    'Deepa Singh',      '+91-9800000007', '101 Andheri West, Mumbai',         19.1319, 72.8272, 'hub_mumbai', 'out_for_delivery', 1.5, 'small'),
  ('ord_m08', 'dev_tenant', 'seller_bewakoof', 'Vikram Sharma',    '+91-9800000008', '45 Versova Road, Andheri',         19.1357, 72.8168, 'hub_mumbai', 'in_transit',       2.3, 'medium'),
  ('ord_m09', 'dev_tenant', 'seller_boat',     'Anjali Gupta',     '+91-9800000009', '7 Oshiwara, Andheri West',         19.1419, 72.8317, 'hub_mumbai', 'delivered',        1.0, 'small'),
  ('ord_m10', 'dev_tenant', 'seller_nykaa',    'Rohan Patel',      '+91-9800000010', '33 DN Road, Fort',                 18.9322, 72.8361, 'hub_mumbai', 'delivered',        4.2, 'medium'),
  ('ord_m11', 'dev_tenant', 'seller_boat',     'Kavya Nair',       '+91-9800000011', '19 Colaba Causeway, Colaba',       18.9067, 72.8148, 'hub_mumbai', 'failed',           3.0, 'medium'),

  -- hub_bandra — confirmed & packed
  ('ord_b01', 'dev_tenant', 'seller_nykaa',    'Ishaan Chawla',    '+91-9800000012', '60 Pali Hill, Bandra West',        19.0608, 72.8239, 'hub_bandra', 'confirmed', 0.9, 'small'),
  ('ord_b02', 'dev_tenant', 'seller_bewakoof', 'Simran Kaur',      '+91-9800000013', '8 Chapel Road, Bandra West',      19.0635, 72.8355, 'hub_bandra', 'packed',    2.5, 'medium'),
  ('ord_b03', 'dev_tenant', 'seller_boat',     'Aditya Menon',     '+91-9800000014', '14 Linking Road, Bandra',          19.0714, 72.8382, 'hub_bandra', 'confirmed', 1.8, 'small'),
  ('ord_b04', 'dev_tenant', 'seller_nykaa',    'Tanvi Shah',       '+91-9800000015', '22 Turner Road, Bandra West',     19.0558, 72.8278, 'hub_bandra', 'delivered', 0.7, 'small');

-- ── Routes + Stops ────────────────────────────────────────────────────────────

-- Route 1: Active, assigned to Ravi (on_route)
INSERT INTO routes (id, tenant_id, agent_id, hub_id, date, status, optimized_sequence, total_distance_km, estimated_duration_mins) VALUES
  ('route_active_01', 'dev_tenant', 'agent_ravi', 'hub_mumbai', date('now'), 'active', '["stop_a01","stop_a02","stop_a03"]', 14.3, 87);

INSERT INTO route_stops (id, route_id, order_id, sequence_no, status, eta, distance_from_prev_km) VALUES
  ('stop_a01', 'route_active_01', 'ord_m07', 1, 'heading_to', datetime('now', '+25 minutes'), 4.8),
  ('stop_a02', 'route_active_01', 'ord_m08', 2, 'pending',    datetime('now', '+60 minutes'), 5.2),
  ('stop_a03', 'route_active_01', 'ord_m09', 3, 'delivered',  datetime('now', '-20 minutes'), 4.3);

-- Route 2: Planned, assigned to you (agent_you)
INSERT INTO routes (id, tenant_id, agent_id, hub_id, date, status, optimized_sequence, total_distance_km, estimated_duration_mins) VALUES
  ('route_planned_01', 'dev_tenant', 'agent_you', 'hub_mumbai', date('now'), 'planned', '["stop_p01","stop_p02","stop_p03","stop_p04"]', 21.7, 130);

INSERT INTO route_stops (id, route_id, order_id, sequence_no, status, eta, distance_from_prev_km) VALUES
  ('stop_p01', 'route_planned_01', 'ord_m01', 1, 'pending', datetime('now', '+1 hour'),                  5.4),
  ('stop_p02', 'route_planned_01', 'ord_m02', 2, 'pending', datetime('now', '+1 hour', '+35 minutes'),  6.1),
  ('stop_p03', 'route_planned_01', 'ord_m03', 3, 'pending', datetime('now', '+2 hours', '+15 minutes'), 5.8),
  ('stop_p04', 'route_planned_01', 'ord_m04', 4, 'pending', datetime('now', '+3 hours'),               4.4);

-- Route 3: Planned, unassigned (so dispatcher can assign it)
INSERT INTO routes (id, tenant_id, agent_id, hub_id, date, status, optimized_sequence, total_distance_km, estimated_duration_mins) VALUES
  ('route_planned_02', 'dev_tenant', NULL, 'hub_mumbai', date('now'), 'planned', '["stop_q01","stop_q02"]', 8.6, 55);

INSERT INTO route_stops (id, route_id, order_id, sequence_no, status, eta, distance_from_prev_km) VALUES
  ('stop_q01', 'route_planned_02', 'ord_m05', 1, 'pending', datetime('now', '+2 hours'), 4.2),
  ('stop_q02', 'route_planned_02', 'ord_m06', 2, 'pending', datetime('now', '+2 hours', '+45 minutes'), 4.4);

-- Route 4: Bandra hub — planned, assigned to Suresh
INSERT INTO routes (id, tenant_id, agent_id, hub_id, date, status, optimized_sequence, total_distance_km, estimated_duration_mins) VALUES
  ('route_bandra_01', 'dev_tenant', 'agent_suresh', 'hub_bandra', date('now'), 'planned', '["stop_b01","stop_b02","stop_b03"]', 5.2, 40);

INSERT INTO route_stops (id, route_id, order_id, sequence_no, status, eta, distance_from_prev_km) VALUES
  ('stop_b01', 'route_bandra_01', 'ord_b01', 1, 'pending', datetime('now', '+1 hour', '+15 minutes'), 1.8),
  ('stop_b02', 'route_bandra_01', 'ord_b02', 2, 'pending', datetime('now', '+1 hour', '+50 minutes'), 1.7),
  ('stop_b03', 'route_bandra_01', 'ord_b03', 3, 'pending', datetime('now', '+2 hours', '+25 minutes'), 1.7);

-- ── Delivery Events (D3) ──────────────────────────────────────────────────────
-- Covers five orders so every event type appears in the audit trail.
-- All datetime offsets use single-modifier minute form (SQLite-safe).
--
-- ord_m09 — Delivered (happy path)
-- ord_m10 — Delivered (OTP retry)
-- ord_m11 — Failed    (OTP timeout)
-- ord_m07 — In Transit / actively heading to stop
-- ord_m08 — Out for delivery, not yet departed

INSERT INTO delivery_events (id, order_id, agent_id, actor_type, event_type, metadata, created_at) VALUES

  -- ── ord_m09 — Delivered (Anjali Gupta) ──────────────────────────────────────
  ('evt_m09_01', 'ord_m09', NULL,         'system', 'order.created',
   '{"sellerId":"seller_boat","quotedFare":72.00}',           datetime('now', '-300 minutes')),
  ('evt_m09_02', 'ord_m09', NULL,         'system', 'order.status_changed',
   '{"from":"placed","to":"confirmed","triggeredBy":"workflow"}', datetime('now', '-295 minutes')),
  ('evt_m09_03', 'ord_m09', 'agent_ravi', 'system', 'agent.assigned',
   '{"agentId":"agent_ravi","routeId":"route_active_01"}',    datetime('now', '-290 minutes')),
  ('evt_m09_04', 'ord_m09', NULL,         'system', 'order.status_changed',
   '{"from":"confirmed","to":"packed","triggeredBy":"workflow"}', datetime('now', '-240 minutes')),
  ('evt_m09_05', 'ord_m09', NULL,         'system', 'route.activated',
   '{"agentId":"agent_ravi","stopCount":3}',                  datetime('now', '-180 minutes')),
  ('evt_m09_06', 'ord_m09', NULL,         'system', 'order.status_changed',
   '{"from":"packed","to":"out_for_delivery","triggeredBy":"route.activate"}', datetime('now', '-180 minutes')),
  ('evt_m09_07', 'ord_m09', 'agent_ravi', 'agent',  'stop.departed',
   '{"etaSeconds":1200,"trackingToken":"tk_m09"}',            datetime('now', '-150 minutes')),
  ('evt_m09_08', 'ord_m09', NULL,         'system', 'order.status_changed',
   '{"from":"out_for_delivery","to":"in_transit","triggeredBy":"stop.departed"}', datetime('now', '-150 minutes')),
  ('evt_m09_09', 'ord_m09', 'agent_ravi', 'agent',  'agent.gps_ping',
   '{"speed":24,"heading":270}',                              datetime('now', '-130 minutes')),
  ('evt_m09_10', 'ord_m09', 'agent_ravi', 'agent',  'stop.arrived',
   '{}',                                                       datetime('now', '-120 minutes')),
  ('evt_m09_11', 'ord_m09', 'agent_ravi', 'agent',  'otp.requested',
   '{"expiresAt":"2026-04-25T08:00:00Z"}',                    datetime('now', '-120 minutes')),
  ('evt_m09_12', 'ord_m09', 'agent_ravi', 'agent',  'otp.verified',
   '{}',                                                       datetime('now', '-117 minutes')),
  ('evt_m09_13', 'ord_m09', 'agent_ravi', 'system', 'order.delivered',
   '{"settledFare":78.50}',                                    datetime('now', '-117 minutes')),
  ('evt_m09_14', 'ord_m09', NULL,         'system', 'order.status_changed',
   '{"from":"in_transit","to":"delivered","triggeredBy":"otp.verified"}', datetime('now', '-117 minutes')),

  -- ── ord_m10 — Delivered with OTP retry (Rohan Patel) ────────────────────────
  ('evt_m10_01', 'ord_m10', NULL,         'system', 'order.created',
   '{"sellerId":"seller_nykaa","quotedFare":65.00}',           datetime('now', '-360 minutes')),
  ('evt_m10_02', 'ord_m10', NULL,         'system', 'order.status_changed',
   '{"from":"placed","to":"confirmed","triggeredBy":"workflow"}', datetime('now', '-355 minutes')),
  ('evt_m10_03', 'ord_m10', 'agent_ravi', 'system', 'agent.assigned',
   '{"agentId":"agent_ravi","routeId":"route_active_01"}',    datetime('now', '-350 minutes')),
  ('evt_m10_04', 'ord_m10', NULL,         'system', 'order.status_changed',
   '{"from":"confirmed","to":"packed","triggeredBy":"workflow"}', datetime('now', '-300 minutes')),
  ('evt_m10_05', 'ord_m10', NULL,         'system', 'route.activated',
   '{"agentId":"agent_ravi","stopCount":3}',                  datetime('now', '-240 minutes')),
  ('evt_m10_06', 'ord_m10', NULL,         'system', 'order.status_changed',
   '{"from":"packed","to":"out_for_delivery","triggeredBy":"route.activate"}', datetime('now', '-240 minutes')),
  ('evt_m10_07', 'ord_m10', 'agent_ravi', 'agent',  'stop.departed',
   '{"etaSeconds":2400,"trackingToken":"tk_m10"}',            datetime('now', '-210 minutes')),
  ('evt_m10_08', 'ord_m10', NULL,         'system', 'order.status_changed',
   '{"from":"out_for_delivery","to":"in_transit","triggeredBy":"stop.departed"}', datetime('now', '-210 minutes')),
  ('evt_m10_09', 'ord_m10', 'agent_ravi', 'agent',  'stop.arrived',
   '{}',                                                       datetime('now', '-180 minutes')),
  ('evt_m10_10', 'ord_m10', 'agent_ravi', 'agent',  'otp.requested',
   '{"expiresAt":"2026-04-25T06:00:00Z"}',                    datetime('now', '-180 minutes')),
  ('evt_m10_11', 'ord_m10', 'agent_ravi', 'agent',  'otp.failed',
   '{"attempt":1}',                                            datetime('now', '-178 minutes')),
  ('evt_m10_12', 'ord_m10', 'agent_ravi', 'agent',  'otp.requested',
   '{"expiresAt":"2026-04-25T06:15:00Z"}',                    datetime('now', '-177 minutes')),
  ('evt_m10_13', 'ord_m10', 'agent_ravi', 'agent',  'otp.verified',
   '{}',                                                       datetime('now', '-170 minutes')),
  ('evt_m10_14', 'ord_m10', 'agent_ravi', 'system', 'order.delivered',
   '{"settledFare":70.00}',                                    datetime('now', '-170 minutes')),
  ('evt_m10_15', 'ord_m10', NULL,         'system', 'order.status_changed',
   '{"from":"in_transit","to":"delivered","triggeredBy":"otp.verified"}', datetime('now', '-170 minutes')),

  -- ── ord_m11 — Failed (Kavya Nair, OTP timeout) ───────────────────────────────
  ('evt_m11_01', 'ord_m11', NULL,         'system', 'order.created',
   '{"sellerId":"seller_boat","quotedFare":88.00}',            datetime('now', '-240 minutes')),
  ('evt_m11_02', 'ord_m11', NULL,         'system', 'order.status_changed',
   '{"from":"placed","to":"confirmed","triggeredBy":"workflow"}', datetime('now', '-235 minutes')),
  ('evt_m11_03', 'ord_m11', 'agent_ravi', 'system', 'agent.assigned',
   '{"agentId":"agent_ravi","routeId":"route_active_01"}',    datetime('now', '-230 minutes')),
  ('evt_m11_04', 'ord_m11', NULL,         'system', 'order.status_changed',
   '{"from":"confirmed","to":"packed","triggeredBy":"workflow"}', datetime('now', '-180 minutes')),
  ('evt_m11_05', 'ord_m11', NULL,         'system', 'route.activated',
   '{"agentId":"agent_ravi","stopCount":3}',                  datetime('now', '-120 minutes')),
  ('evt_m11_06', 'ord_m11', NULL,         'system', 'order.status_changed',
   '{"from":"packed","to":"out_for_delivery","triggeredBy":"route.activate"}', datetime('now', '-120 minutes')),
  ('evt_m11_07', 'ord_m11', 'agent_ravi', 'agent',  'stop.departed',
   '{"etaSeconds":1800,"trackingToken":"tk_m11"}',            datetime('now', '-105 minutes')),
  ('evt_m11_08', 'ord_m11', NULL,         'system', 'order.status_changed',
   '{"from":"out_for_delivery","to":"in_transit","triggeredBy":"stop.departed"}', datetime('now', '-105 minutes')),
  ('evt_m11_09', 'ord_m11', 'agent_ravi', 'agent',  'agent.gps_ping',
   '{"speed":18,"heading":180}',                              datetime('now', '-90 minutes')),
  ('evt_m11_10', 'ord_m11', 'agent_ravi', 'agent',  'stop.arrived',
   '{}',                                                       datetime('now', '-75 minutes')),
  ('evt_m11_11', 'ord_m11', 'agent_ravi', 'agent',  'otp.requested',
   '{"expiresAt":"2026-04-25T10:00:00Z"}',                    datetime('now', '-75 minutes')),
  ('evt_m11_12', 'ord_m11', 'agent_ravi', 'agent',  'otp.failed',
   '{"attempt":1}',                                            datetime('now', '-73 minutes')),
  ('evt_m11_13', 'ord_m11', 'agent_ravi', 'agent',  'otp.failed',
   '{"attempt":2}',                                            datetime('now', '-71 minutes')),
  ('evt_m11_14', 'ord_m11', 'agent_ravi', 'system', 'order.failed',
   '{"reason":"OTP timeout - customer unreachable"}',         datetime('now', '-70 minutes')),
  ('evt_m11_15', 'ord_m11', NULL,         'system', 'order.status_changed',
   '{"from":"in_transit","to":"failed","triggeredBy":"otp.timeout"}', datetime('now', '-70 minutes')),

  -- ── ord_m07 — In Transit / heading to stop (Deepa Singh) ─────────────────────
  ('evt_m07_01', 'ord_m07', NULL,         'system', 'order.created',
   '{"sellerId":"seller_nykaa","quotedFare":55.00}',           datetime('now', '-180 minutes')),
  ('evt_m07_02', 'ord_m07', NULL,         'system', 'order.status_changed',
   '{"from":"placed","to":"confirmed","triggeredBy":"workflow"}', datetime('now', '-175 minutes')),
  ('evt_m07_03', 'ord_m07', 'agent_ravi', 'system', 'agent.assigned',
   '{"agentId":"agent_ravi","routeId":"route_active_01"}',    datetime('now', '-170 minutes')),
  ('evt_m07_04', 'ord_m07', NULL,         'system', 'order.status_changed',
   '{"from":"confirmed","to":"packed","triggeredBy":"workflow"}', datetime('now', '-120 minutes')),
  ('evt_m07_05', 'ord_m07', NULL,         'system', 'route.activated',
   '{"agentId":"agent_ravi","stopCount":3}',                  datetime('now', '-90 minutes')),
  ('evt_m07_06', 'ord_m07', NULL,         'system', 'order.status_changed',
   '{"from":"packed","to":"out_for_delivery","triggeredBy":"route.activate"}', datetime('now', '-90 minutes')),
  ('evt_m07_07', 'ord_m07', 'agent_ravi', 'agent',  'stop.departed',
   '{"etaSeconds":1500,"trackingToken":"tk_m07"}',            datetime('now', '-25 minutes')),
  ('evt_m07_08', 'ord_m07', NULL,         'system', 'order.status_changed',
   '{"from":"out_for_delivery","to":"in_transit","triggeredBy":"stop.departed"}', datetime('now', '-25 minutes')),
  ('evt_m07_09', 'ord_m07', 'agent_ravi', 'agent',  'agent.gps_ping',
   '{"speed":32,"heading":90}',                               datetime('now', '-15 minutes')),
  ('evt_m07_10', 'ord_m07', 'agent_ravi', 'agent',  'agent.gps_ping',
   '{"speed":28,"heading":85}',                               datetime('now', '-10 minutes')),

  -- ── ord_m08 — Out for delivery, not yet departed (Vikram Sharma) ──────────────
  ('evt_m08_01', 'ord_m08', NULL,         'system', 'order.created',
   '{"sellerId":"seller_bewakoof","quotedFare":92.00}',        datetime('now', '-180 minutes')),
  ('evt_m08_02', 'ord_m08', NULL,         'system', 'order.status_changed',
   '{"from":"placed","to":"confirmed","triggeredBy":"workflow"}', datetime('now', '-175 minutes')),
  ('evt_m08_03', 'ord_m08', 'agent_ravi', 'system', 'agent.assigned',
   '{"agentId":"agent_ravi","routeId":"route_active_01"}',    datetime('now', '-170 minutes')),
  ('evt_m08_04', 'ord_m08', NULL,         'system', 'order.status_changed',
   '{"from":"confirmed","to":"packed","triggeredBy":"workflow"}', datetime('now', '-120 minutes')),
  ('evt_m08_05', 'ord_m08', NULL,         'system', 'route.activated',
   '{"agentId":"agent_ravi","stopCount":3}',                  datetime('now', '-90 minutes')),
  ('evt_m08_06', 'ord_m08', NULL,         'system', 'order.status_changed',
   '{"from":"packed","to":"out_for_delivery","triggeredBy":"route.activate"}', datetime('now', '-90 minutes'));

-- ── Delivery Events — Bandra (ord_b04, delivered) ─────────────────────────────

INSERT INTO delivery_events (id, order_id, agent_id, actor_type, event_type, metadata, created_at) VALUES
  ('evt_b04_01', 'ord_b04', NULL,           'system', 'order.created',
   '{"sellerId":"seller_nykaa","quotedFare":45.00}',           datetime('now', '-300 minutes')),
  ('evt_b04_02', 'ord_b04', NULL,           'system', 'order.status_changed',
   '{"from":"placed","to":"confirmed","triggeredBy":"workflow"}', datetime('now', '-295 minutes')),
  ('evt_b04_03', 'ord_b04', 'agent_suresh', 'system', 'agent.assigned',
   '{"agentId":"agent_suresh","routeId":"route_bandra_01"}',  datetime('now', '-290 minutes')),
  ('evt_b04_04', 'ord_b04', NULL,           'system', 'order.status_changed',
   '{"from":"confirmed","to":"packed","triggeredBy":"workflow"}', datetime('now', '-240 minutes')),
  ('evt_b04_05', 'ord_b04', NULL,           'system', 'route.activated',
   '{"agentId":"agent_suresh","stopCount":3}',                 datetime('now', '-180 minutes')),
  ('evt_b04_06', 'ord_b04', NULL,           'system', 'order.status_changed',
   '{"from":"packed","to":"out_for_delivery","triggeredBy":"route.activate"}', datetime('now', '-180 minutes')),
  ('evt_b04_07', 'ord_b04', 'agent_suresh', 'agent',  'stop.departed',
   '{"etaSeconds":900,"trackingToken":"tk_b04"}',              datetime('now', '-150 minutes')),
  ('evt_b04_08', 'ord_b04', NULL,           'system', 'order.status_changed',
   '{"from":"out_for_delivery","to":"in_transit","triggeredBy":"stop.departed"}', datetime('now', '-150 minutes')),
  ('evt_b04_09', 'ord_b04', 'agent_suresh', 'agent',  'stop.arrived',
   '{}',                                                        datetime('now', '-130 minutes')),
  ('evt_b04_10', 'ord_b04', 'agent_suresh', 'agent',  'otp.requested',
   '{"expiresAt":"2026-04-25T07:30:00Z"}',                     datetime('now', '-130 minutes')),
  ('evt_b04_11', 'ord_b04', 'agent_suresh', 'agent',  'otp.verified',
   '{}',                                                        datetime('now', '-127 minutes')),
  ('evt_b04_12', 'ord_b04', 'agent_suresh', 'system', 'order.delivered',
   '{"settledFare":48.00}',                                     datetime('now', '-127 minutes')),
  ('evt_b04_13', 'ord_b04', NULL,           'system', 'order.status_changed',
   '{"from":"in_transit","to":"delivered","triggeredBy":"otp.verified"}', datetime('now', '-127 minutes'));

-- ── Fare Config (D5) ──────────────────────────────────────────────────────────

INSERT INTO fare_configs (id, tenant_id, base_fare, per_km_rate, weight_tier_1_max, weight_tier_1_surcharge, weight_tier_2_max, weight_tier_2_surcharge, weight_tier_3_surcharge, zone_premium_pct, narrow_window_premium, bulk_threshold, bulk_discount_pct) VALUES
  ('fconf_dev', 'dev_tenant', 20, 5, 1, 0, 5, 10, 25, 0, 15, 50, 5);

-- ── Order Fares (D5) ──────────────────────────────────────────────────────────
-- Quoted fares for all orders + settled fares for delivered orders.

INSERT INTO order_fares (id, order_id, quoted_fare, settled_fare, distance_km, breakdown, status, settled_at) VALUES
  -- hub_mumbai — delivered
  ('fare_m09', 'ord_m09', 72.00,  75.00,  9.0,  '{"base":20,"distance":45,"weightSurcharge":0,"zonePremium":0,"narrowWindowFee":0,"bulkDiscount":0}', 'settled', datetime('now', '-120 minutes')),
  ('fare_m10', 'ord_m10', 101.00, 105.50, 14.5, '{"base":20,"distance":72.5,"weightSurcharge":10,"zonePremium":0,"narrowWindowFee":0,"bulkDiscount":0}', 'settled', datetime('now', '-115 minutes')),
  -- hub_mumbai — failed (waived)
  ('fare_m11', 'ord_m11', 87.00,  NULL,   NULL, '{"base":20,"distance":45,"weightSurcharge":10,"zonePremium":0,"narrowWindowFee":0,"bulkDiscount":0}',  'waived',  NULL),
  -- hub_mumbai — in-flight (quoted only)
  ('fare_m07', 'ord_m07', 57.50,  NULL,   NULL, '{"base":20,"distance":30,"weightSurcharge":0,"zonePremium":0,"narrowWindowFee":0,"bulkDiscount":0}',   'quoted',  NULL),
  ('fare_m08', 'ord_m08', 71.50,  NULL,   NULL, '{"base":20,"distance":37.5,"weightSurcharge":10,"zonePremium":0,"narrowWindowFee":0,"bulkDiscount":0}', 'quoted',  NULL),
  -- hub_mumbai — confirmed/packed (quoted)
  ('fare_m01', 'ord_m01', 50.00,  NULL,   NULL, '{"base":20,"distance":24,"weightSurcharge":0,"zonePremium":0,"narrowWindowFee":0,"bulkDiscount":0}',   'quoted',  NULL),
  ('fare_m02', 'ord_m02', 46.00,  NULL,   NULL, '{"base":20,"distance":26,"weightSurcharge":0,"zonePremium":0,"narrowWindowFee":0,"bulkDiscount":0}',   'quoted',  NULL),
  ('fare_m03', 'ord_m03', 73.50,  NULL,   NULL, '{"base":20,"distance":30,"weightSurcharge":10,"zonePremium":0,"narrowWindowFee":0,"bulkDiscount":0}',  'quoted',  NULL),
  ('fare_m04', 'ord_m04', 65.50,  NULL,   NULL, '{"base":20,"distance":28,"weightSurcharge":10,"zonePremium":0,"narrowWindowFee":0,"bulkDiscount":0}',  'quoted',  NULL),
  ('fare_m05', 'ord_m05', 41.00,  NULL,   NULL, '{"base":20,"distance":21,"weightSurcharge":0,"zonePremium":0,"narrowWindowFee":0,"bulkDiscount":0}',   'quoted',  NULL),
  ('fare_m06', 'ord_m06', 82.00,  NULL,   NULL, '{"base":20,"distance":37,"weightSurcharge":25,"zonePremium":0,"narrowWindowFee":0,"bulkDiscount":0}',  'quoted',  NULL),
  -- hub_bandra
  ('fare_b01', 'ord_b01', 39.00,  NULL,   NULL, '{"base":20,"distance":14,"weightSurcharge":0,"zonePremium":0,"narrowWindowFee":0,"bulkDiscount":0}',   'quoted',  NULL),
  ('fare_b02', 'ord_b02', 53.50,  NULL,   NULL, '{"base":20,"distance":20,"weightSurcharge":10,"zonePremium":0,"narrowWindowFee":0,"bulkDiscount":0}',  'quoted',  NULL),
  ('fare_b03', 'ord_b03', 47.00,  NULL,   NULL, '{"base":20,"distance":18,"weightSurcharge":0,"zonePremium":0,"narrowWindowFee":0,"bulkDiscount":0}',   'quoted',  NULL),
  ('fare_b04', 'ord_b04', 45.00,  48.00,  5.6,  '{"base":20,"distance":17,"weightSurcharge":0,"zonePremium":0,"narrowWindowFee":0,"bulkDiscount":0}',   'settled', datetime('now', '-127 minutes'));

-- ── Partner Earnings (D5) ──────────────────────────────────────────────────────
-- Payout records for delivered orders (commission_pct = 80).

INSERT INTO partner_earnings (id, agent_id, order_id, gross_fare, commission_pct, partner_payout, platform_cut, status) VALUES
  ('earn_m09', 'agent_ravi',   'ord_m09', 75.00,  80, 60.00, 15.00, 'pending'),
  ('earn_m10', 'agent_ravi',   'ord_m10', 105.50, 80, 84.40, 21.10, 'pending'),
  ('earn_b04', 'agent_suresh', 'ord_b04', 48.00,  80, 38.40,  9.60, 'pending');

-- ── Feedback (D5) ─────────────────────────────────────────────────────────────
-- Sample feedback for delivered orders.

INSERT INTO order_feedback (id, order_id, agent_id, from_actor, rating, comment, created_at) VALUES
  ('fb_m09_c', 'ord_m09', 'agent_ravi',   'customer', 5, 'Super fast! Loved the service.',    datetime('now', '-110 minutes')),
  ('fb_m09_s', 'ord_m09', 'agent_ravi',   'seller',   4, 'Delivered on time, good handling.', datetime('now', '-100 minutes')),
  ('fb_m10_c', 'ord_m10', 'agent_ravi',   'customer', 4, 'Took a couple OTP tries but ok.',   datetime('now', '-105 minutes')),
  ('fb_b04_c', 'ord_b04', 'agent_suresh', 'customer', 5, 'Very polite agent, quick delivery.',datetime('now', '-120 minutes'));
