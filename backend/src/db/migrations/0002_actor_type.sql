-- ============================================================
-- Migration 0002 — Add actor_type + event_type index to delivery_events
-- ============================================================

-- SQLite does not support ADD COLUMN with a CHECK constraint directly,
-- so we add the column without the constraint and enforce at the app layer.
ALTER TABLE delivery_events ADD COLUMN actor_type TEXT NOT NULL DEFAULT 'system';

-- Index for event type filtering (used by GET /api/orders/:id/events?eventType=...)
CREATE INDEX IF NOT EXISTS idx_events_type ON delivery_events(event_type, created_at);
