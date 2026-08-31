/* ================================================ */
/* Assignment Engine — Analytics Tracker (Hidden)   */
/* ================================================ */

import pool from '../../db.js';

/**
 * Hidden analytics module.
 *
 * Tracks:
 *   1. Tickets taken manually (not ODIN-assigned)
 *   2. Workers completing only one ticket per day
 *   3. Owner ranking
 *   4. Expired vs active tickets
 *
 * Only visible in restricted admin analytics.
 */
export const analyticsTracker = {
  /* ------------------------------------------------ */
  /* 1. Manual Pickup Tracking                        */
  /* ------------------------------------------------ */

  /**
   * Record a manual ticket pickup (ticket assigned outside ODIN engine).
   */
  async trackManualPickup({ ticketId, workerId, workerName, timestamp }) {
    try {
      await pool.query(
        `INSERT INTO assignment_analytics_events
           (event_type, ticket_id, worker_id, worker_name, event_data, created_at)
         VALUES ('manual_pickup', $1, $2, $3, $4, $5)`,
        [ticketId, workerId, workerName, JSON.stringify({ source: 'manual' }), timestamp || new Date().toISOString()]
      );
    } catch (err) {
      console.error('[ANALYTICS] Failed to track manual pickup:', err.message);
    }
  },

  /**
   * Get tickets taken manually in a date range.
   */
  async getManualPickups({ from, to, limit = 200 } = {}) {
    const { rows } = await pool.query(
      `SELECT * FROM assignment_analytics_events
       WHERE event_type = 'manual_pickup'
         AND created_at >= $1 AND created_at <= $2
       ORDER BY created_at DESC LIMIT $3`,
      [from, to, limit]
    );
    return rows;
  },

  /* ------------------------------------------------ */
  /* 2. Single-Ticket-Per-Day Workers                 */
  /* ------------------------------------------------ */

  /**
   * Get workers who completed only one ticket on any given day.
   */
  async getSingleTicketWorkers({ from, to } = {}) {
    const { rows } = await pool.query(
      `SELECT
         worker_id, worker_name,
         DATE(created_at) AS work_date,
         COUNT(*)::int AS ticket_count
       FROM assignment_analytics_events
       WHERE event_type IN ('assigned', 'manual_pickup')
         AND created_at >= $1 AND created_at <= $2
       GROUP BY worker_id, worker_name, DATE(created_at)
       HAVING COUNT(*) = 1
       ORDER BY work_date DESC, worker_name`,
      [from, to]
    );
    return rows;
  },

  /* ------------------------------------------------ */
  /* 3. Owner Ranking                                 */
  /* ------------------------------------------------ */

  /**
   * Get ranking of workers by total assigned tickets.
   */
  async getOwnerRanking({ from, to, limit = 50 } = {}) {
    const { rows } = await pool.query(
      `SELECT
         assigned_worker_id   AS worker_id,
         assigned_worker_name AS worker_name,
         COUNT(*)::int AS total_assigned,
         COUNT(*) FILTER (WHERE result = 'assigned')::int AS auto_assigned,
         COUNT(*) FILTER (WHERE ticket_type = 'TroubleTicket')::int AS trouble_tickets,
         COUNT(*) FILTER (WHERE ticket_type = 'SmartHands')::int AS smart_hands,
         COUNT(*) FILTER (WHERE ticket_type = 'CrossConnect')::int AS cross_connects,
         COUNT(*) FILTER (WHERE ticket_type = 'Scheduled')::int AS scheduled
       FROM assignment_ticket_decisions
       WHERE result = 'assigned'
         AND decided_at >= $1 AND decided_at <= $2
         AND assigned_worker_id IS NOT NULL
       GROUP BY assigned_worker_id, assigned_worker_name
       ORDER BY total_assigned DESC
       LIMIT $3`,
      [from, to, limit]
    );
    return rows;
  },

  /* ------------------------------------------------ */
  /* 4. Expired vs Active Tickets                     */
  /* ------------------------------------------------ */

  /**
   * Get counts of expired vs still-active tickets.
   */
  async getExpiredVsActive(now = new Date()) {
    const { rows } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE active = true)::int AS total_active,
         COUNT(*) FILTER (WHERE active = true AND commit_date IS NOT NULL AND commit_date < $1)::int AS expired,
         COUNT(*) FILTER (WHERE active = true AND (commit_date IS NULL OR commit_date >= $1))::int AS not_expired
       FROM queue_items`,
      [now.toISOString()]
    );
    return rows[0] || { total_active: 0, expired: 0, not_expired: 0 };
  },

  /* ------------------------------------------------ */
  /* Event Recording (internal)                       */
  /* ------------------------------------------------ */

  /**
   * Record an ODIN assignment event for analytics aggregation.
   */
  async trackAssignment({ ticketId, workerId, workerName, ticketType, result, timestamp }) {
    try {
      await pool.query(
        `INSERT INTO assignment_analytics_events
           (event_type, ticket_id, worker_id, worker_name, event_data, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [result || 'assigned', ticketId, workerId, workerName, JSON.stringify({ ticketType }), timestamp || new Date().toISOString()]
      );
    } catch (err) {
      console.error('[ANALYTICS] Failed to track assignment event:', err.message);
    }
  },
};
