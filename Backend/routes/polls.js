/* ------------------------------------------------ */
/* POLLS / UMFRAGEN ROUTES                           */
/* ------------------------------------------------ */

import express from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import db from "../db.js";

const router = express.Router();

/* ------------------------------------------------ */
/* HELPERS                                          */
/* ------------------------------------------------ */

function isOwnerOrMainAdmin(poll, user) {
  return poll.created_by === user.id || user.is_root === true || user.is_admin === true;
}

function isPollExpired(poll) {
  if (poll.closed) return true;
  if (poll.ends_at && new Date(poll.ends_at) < new Date()) return true;
  return false;
}

/* ------------------------------------------------ */
/* GET /api/polls – list all polls                  */
/* ------------------------------------------------ */

router.get("/", requireAuth, async (_req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT
        p.id, p.title, p.description, p.options, p.ends_at, p.closed, p.archived,
        p.archived_at, p.created_at, p.updated_at, p.created_by,
        u.email        AS creator_email,
        COALESCE(u.first_name || ' ' || u.last_name, u.email) AS creator_name,
        COALESCE(vc.vote_count, 0)::int AS vote_count,
        (SELECT COUNT(*)::int FROM users eu WHERE eu.approved = TRUE AND eu.is_root = FALSE) AS eligible_voter_count
      FROM polls p
      LEFT JOIN users u ON u.id = p.created_by
      LEFT JOIN (
        SELECT poll_id, COUNT(*) AS vote_count FROM poll_votes GROUP BY poll_id
      ) vc ON vc.poll_id = p.id
      ORDER BY p.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error("[POLLS] List failed:", err.message);
    res.status(500).json({ error: "Failed to load polls" });
  }
});

/* ------------------------------------------------ */
/* GET /api/polls/:id – single poll with votes      */
/* ------------------------------------------------ */

router.get("/:id", requireAuth, async (req, res) => {
  try {
    const pollId = parseInt(req.params.id, 10);
    if (!Number.isFinite(pollId)) return res.status(400).json({ error: "Invalid poll id" });

    const { rows: [poll] } = await db.query(`
      SELECT
        p.id, p.title, p.description, p.options, p.ends_at, p.closed, p.archived,
        p.archived_at, p.created_at, p.updated_at, p.created_by,
        u.email        AS creator_email,
        COALESCE(u.first_name || ' ' || u.last_name, u.email) AS creator_name,
        (SELECT COUNT(*)::int FROM users eu WHERE eu.approved = TRUE AND eu.is_root = FALSE) AS eligible_voter_count
      FROM polls p
      LEFT JOIN users u ON u.id = p.created_by
      WHERE p.id = $1
    `, [pollId]);

    if (!poll) return res.status(404).json({ error: "Poll not found" });

    // Aggregate votes per option
    const { rows: votes } = await db.query(`
      SELECT
        pv.option_index,
        COUNT(*)::int AS count,
        json_agg(json_build_object(
          'userId', pv.user_id,
          'name', COALESCE(vu.first_name || ' ' || vu.last_name, vu.email),
          'email', vu.email
        )) AS voters
      FROM poll_votes pv
      LEFT JOIN users vu ON vu.id = pv.user_id
      WHERE pv.poll_id = $1
      GROUP BY pv.option_index
      ORDER BY pv.option_index
    `, [pollId]);

    // Current user's vote
    const { rows: [myVote] } = await db.query(
      `SELECT option_index FROM poll_votes WHERE poll_id = $1 AND user_id = $2`,
      [pollId, req.user.id]
    );

    res.json({
      ...poll,
      votes,
      myVote: myVote ? myVote.option_index : null,
    });
  } catch (err) {
    console.error("[POLLS] Get failed:", err.message);
    res.status(500).json({ error: "Failed to load poll" });
  }
});

/* ------------------------------------------------ */
/* POST /api/polls – create new poll                */
/* ------------------------------------------------ */

router.post("/", requireAuth, async (req, res) => {
  try {
    const { title, description, options, ends_at } = req.body;
    if (!title || typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ error: "Title is required" });
    }
    if (!Array.isArray(options) || options.length < 2) {
      return res.status(400).json({ error: "At least 2 options required" });
    }
    const cleanOptions = options.map(o => String(o).trim()).filter(Boolean);
    if (cleanOptions.length < 2) {
      return res.status(400).json({ error: "At least 2 non-empty options required" });
    }

    const endsAt = ends_at ? new Date(ends_at) : null;

    const { rows: [poll] } = await db.query(`
      INSERT INTO polls (title, description, options, created_by, ends_at)
      VALUES ($1, $2, $3::jsonb, $4, $5)
      RETURNING *
    `, [
      title.trim(),
      (description || "").trim(),
      JSON.stringify(cleanOptions),
      req.user.id,
      endsAt,
    ]);

    res.status(201).json(poll);
  } catch (err) {
    console.error("[POLLS] Create failed:", err.message);
    res.status(500).json({ error: "Failed to create poll" });
  }
});

/* ------------------------------------------------ */
/* POST /api/polls/:id/vote – cast or change vote   */
/* ------------------------------------------------ */

router.post("/:id/vote", requireAuth, async (req, res) => {
  try {
    const pollId = parseInt(req.params.id, 10);
    const { option_index } = req.body;

    if (!Number.isFinite(pollId)) return res.status(400).json({ error: "Invalid poll id" });
    if (typeof option_index !== "number" || option_index < 0) {
      return res.status(400).json({ error: "Invalid option_index" });
    }

    // Fetch poll
    const { rows: [poll] } = await db.query(`SELECT * FROM polls WHERE id = $1`, [pollId]);
    if (!poll) return res.status(404).json({ error: "Poll not found" });

    // Check if voting is still allowed
    if (isPollExpired(poll)) {
      return res.status(403).json({ error: "Voting is closed for this poll" });
    }

    // Validate option index
    const opts = typeof poll.options === "string" ? JSON.parse(poll.options) : poll.options;
    if (option_index >= opts.length) {
      return res.status(400).json({ error: "Option index out of range" });
    }

    // Upsert vote (one per user)
    await db.query(`
      INSERT INTO poll_votes (poll_id, user_id, option_index)
      VALUES ($1, $2, $3)
      ON CONFLICT (poll_id, user_id)
      DO UPDATE SET option_index = EXCLUDED.option_index, updated_at = NOW()
    `, [pollId, req.user.id, option_index]);

    res.json({ ok: true });
  } catch (err) {
    console.error("[POLLS] Vote failed:", err.message);
    res.status(500).json({ error: "Failed to cast vote" });
  }
});

/* ------------------------------------------------ */
/* PATCH /api/polls/:id – update poll (owner/admin) */
/* ------------------------------------------------ */

router.patch("/:id", requireAuth, async (req, res) => {
  try {
    const pollId = parseInt(req.params.id, 10);
    if (!Number.isFinite(pollId)) return res.status(400).json({ error: "Invalid poll id" });

    const { rows: [poll] } = await db.query(`SELECT * FROM polls WHERE id = $1`, [pollId]);
    if (!poll) return res.status(404).json({ error: "Poll not found" });

    if (!isOwnerOrMainAdmin(poll, req.user)) {
      return res.status(403).json({ error: "Only the creator or main admin can edit this poll" });
    }

    const { closed, archived, ends_at } = req.body;
    const updates = [];
    const params = [];
    let idx = 1;

    if (typeof closed === "boolean") {
      updates.push(`closed = $${idx++}`);
      params.push(closed);
    }
    if (typeof archived === "boolean") {
      updates.push(`archived = $${idx++}`);
      params.push(archived);
      updates.push(`archived_at = $${idx++}`);
      params.push(archived ? new Date() : null);
      updates.push(`archived_by = $${idx++}`);
      params.push(archived ? req.user.id : null);
    }
    if (ends_at !== undefined) {
      updates.push(`ends_at = $${idx++}`);
      params.push(ends_at ? new Date(ends_at) : null);
    }

    if (updates.length === 0) return res.status(400).json({ error: "Nothing to update" });

    params.push(pollId);
    const { rows: [updated] } = await db.query(
      `UPDATE polls SET ${updates.join(", ")} WHERE id = $${idx} RETURNING *`,
      params
    );
    res.json(updated);
  } catch (err) {
    console.error("[POLLS] Update failed:", err.message);
    res.status(500).json({ error: "Failed to update poll" });
  }
});

/* ------------------------------------------------ */
/* DELETE /api/polls/:id – delete poll (owner/admin) */
/* ------------------------------------------------ */

router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const pollId = parseInt(req.params.id, 10);
    if (!Number.isFinite(pollId)) return res.status(400).json({ error: "Invalid poll id" });

    const { rows: [poll] } = await db.query(`SELECT * FROM polls WHERE id = $1`, [pollId]);
    if (!poll) return res.status(404).json({ error: "Poll not found" });

    if (!isOwnerOrMainAdmin(poll, req.user)) {
      return res.status(403).json({ error: "Only the creator or main admin can delete this poll" });
    }

    await db.query(`DELETE FROM polls WHERE id = $1`, [pollId]);
    res.json({ ok: true });
  } catch (err) {
    console.error("[POLLS] Delete failed:", err.message);
    res.status(500).json({ error: "Failed to delete poll" });
  }
});

export default router;
