/* ================================================ */
/* 043 – Structured assignment decision trace       */
/* Adds persistent trace data for ODIN transparency */
/* ================================================ */

ALTER TABLE assignment_ticket_decisions
  ADD COLUMN IF NOT EXISTS decision_trace JSONB;