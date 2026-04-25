INSERT OR IGNORE INTO hubs VALUES (
  'hub_demo01',
  'tenant_demo',
  'Mumbai Hub',
  'Lower Parel, Mumbai',
  18.9949,
  72.8298,
  datetime('now')
);

INSERT OR IGNORE INTO sellers VALUES (
  'seller_demo01',
  'user_demo_seller',
  'tenant_demo',
  'Demo Apparel Co.',
  NULL,
  NULL,
  NULL,
  NULL,
  '["order.delivered"]',
  datetime('now'),
  datetime('now')
);

INSERT OR IGNORE INTO orders (
  id,
  tenant_id,
  seller_id,
  customer_name,
  customer_phone,
  address,
  lat,
  lng,
  hub_id,
  status,
  parcel_weight,
  parcel_size
) VALUES
  ('order_d01', 'tenant_demo', 'seller_demo01', 'Priya Shah', '+919876540001', 'Bandra West, Mumbai 400050', 19.0596, 72.8295, 'hub_demo01', 'placed', 0.5, 'small'),
  ('order_d02', 'tenant_demo', 'seller_demo01', 'Rohan Verma', '+919876540002', 'Andheri East, Mumbai 400069', 19.1136, 72.8697, 'hub_demo01', 'placed', 1.2, 'medium'),
  ('order_d03', 'tenant_demo', 'seller_demo01', 'Meena Pillai', '+919876540003', 'Dadar, Mumbai 400014', 19.0178, 72.8478, 'hub_demo01', 'placed', 2.5, 'medium'),
  ('order_d04', 'tenant_demo', 'seller_demo01', 'Arjun Kapoor', '+919876540004', 'Kurla West, Mumbai 400070', 19.0726, 72.8867, 'hub_demo01', 'placed', 0.3, 'small'),
  ('order_d05', 'tenant_demo', 'seller_demo01', 'Sunita Nair', '+919876540005', 'Malad West, Mumbai 400064', 19.1863, 72.8483, 'hub_demo01', 'placed', 5.0, 'large');
