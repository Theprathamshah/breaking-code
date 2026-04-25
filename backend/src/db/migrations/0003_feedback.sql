-- ── Migration 0003 — order_feedback table ────────────────────────────────────
-- Domain 5: customer and seller ratings per delivery.

CREATE TABLE IF NOT EXISTS order_feedback (
  id          TEXT PRIMARY KEY,
  order_id    TEXT NOT NULL REFERENCES orders(id),
  agent_id    TEXT REFERENCES delivery_agents(id),
  from_actor  TEXT NOT NULL CHECK (from_actor IN ('customer','seller','admin')),
  rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_feedback_order ON order_feedback(order_id);
CREATE INDEX IF NOT EXISTS idx_feedback_agent ON order_feedback(agent_id, created_at);
