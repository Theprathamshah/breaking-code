-- ============================================================
-- D3 Demo Seed — Full lifecycle event history for order_d01
-- Run after D1 and D2 seeds so foreign keys resolve.
-- ============================================================

INSERT OR IGNORE INTO delivery_events
  (id, order_id, agent_id, actor_type, event_type, metadata, created_at)
VALUES
  ('evt_d01_01', 'order_d01', NULL,           'system',  'order.created',
   '{"sellerId":"seller_demo01","quotedFare":87.50}',
   datetime('now', '-4 hours')),

  ('evt_d01_02', 'order_d01', NULL,           'system',  'order.status_changed',
   '{"from":"placed","to":"confirmed","triggeredBy":"workflow"}',
   datetime('now', '-3 hours 55 minutes')),

  ('evt_d01_03', 'order_d01', 'agent_demo01', 'system',  'agent.assigned',
   '{"agentId":"agent_demo01","routeId":"route_demo01"}',
   datetime('now', '-3 hours 50 minutes')),

  ('evt_d01_04', 'order_d01', NULL,           'system',  'order.status_changed',
   '{"from":"confirmed","to":"packed","triggeredBy":"workflow"}',
   datetime('now', '-3 hours')),

  ('evt_d01_05', 'order_d01', 'agent_demo01', 'system',  'route.activated',
   '{"agentId":"agent_demo01","stopCount":5}',
   datetime('now', '-2 hours')),

  ('evt_d01_06', 'order_d01', NULL,           'system',  'order.status_changed',
   '{"from":"packed","to":"out_for_delivery","triggeredBy":"route.activate"}',
   datetime('now', '-2 hours')),

  ('evt_d01_07', 'order_d01', 'agent_demo01', 'agent',   'stop.departed',
   '{"etaSeconds":1800,"trackingToken":"tk_demo01"}',
   datetime('now', '-1 hour 30 minutes')),

  ('evt_d01_08', 'order_d01', NULL,           'system',  'order.status_changed',
   '{"from":"out_for_delivery","to":"in_transit","triggeredBy":"stop.departed"}',
   datetime('now', '-1 hour 30 minutes')),

  ('evt_d01_09', 'order_d01', 'agent_demo01', 'agent',   'agent.gps_ping',
   '{"speed":28,"heading":45}',
   datetime('now', '-1 hour 20 minutes')),

  ('evt_d01_10', 'order_d01', 'agent_demo01', 'agent',   'stop.arrived',
   '{}',
   datetime('now', '-45 minutes')),

  ('evt_d01_11', 'order_d01', 'agent_demo01', 'agent',   'otp.requested',
   '{"expiresAt":"2026-04-26T11:00:00Z"}',
   datetime('now', '-44 minutes')),

  ('evt_d01_12', 'order_d01', 'agent_demo01', 'agent',   'otp.verified',
   '{}',
   datetime('now', '-40 minutes')),

  ('evt_d01_13', 'order_d01', 'agent_demo01', 'system',  'order.delivered',
   '{"settledFare":92.00}',
   datetime('now', '-40 minutes')),

  ('evt_d01_14', 'order_d01', NULL,           'system',  'order.status_changed',
   '{"from":"in_transit","to":"delivered","triggeredBy":"otp.verified"}',
   datetime('now', '-40 minutes'));
