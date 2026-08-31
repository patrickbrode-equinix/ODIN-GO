-- ============================================================
-- 026_deinstall_queue.sql
-- Support for Deinstall queue type in queue_items.
--
-- No schema changes needed — queue_items already supports
-- arbitrary queue_type values. The Deinstall subtype (Cage,
-- Cabinet, Cross Connect, Patch Panel, Power, Others) is
-- stored in the existing subtype + group_key columns.
--
-- This migration adds an index on queue_type to optimize
-- filtered queries (GET /api/queue/tickets?queueType=Deinstall).
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_queue_type ON queue_items(queue_type);
CREATE INDEX IF NOT EXISTS idx_queue_active_type ON queue_items(active, queue_type);
