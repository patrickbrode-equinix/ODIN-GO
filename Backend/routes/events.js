/* ------------------------------------------------ */
/* EVENTS IMAGES ROUTES – /api/events/*             */
/* Upload/list/delete event photos (auth-required)  */
/* Public read is on /api/tv/events/images (tv.js)  */
/* ------------------------------------------------ */

import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { query } from "../db.js";
import { requireAuth } from "../middleware/authMiddleware.js";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

/* ------------------------------------------------ */
/* UPLOAD DIRECTORY                                 */
/* ------------------------------------------------ */

const EVENTS_DIR = path.join(__dirname, "..", "uploads", "events");
fs.mkdirSync(EVENTS_DIR, { recursive: true });

/* ------------------------------------------------ */
/* MULTER STORAGE                                   */
/* ------------------------------------------------ */

const ALLOWED_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, EVENTS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    const rand = Math.random().toString(36).slice(2, 8);
    cb(null, `${Date.now()}-${rand}${ext}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.has(file.mimetype)) return cb(null, true);
    cb(new Error("Unsupported file type – only jpg/png/webp/gif allowed"));
  },
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB per file
});

/* ------------------------------------------------ */
/* GET /api/events/images                           */
/* List all event images (auth required)            */
/* ------------------------------------------------ */

router.get("/images", requireAuth, async (_req, res) => {
  try {
    const result = await query(
      "SELECT id, filename, original_name, url_path, is_visible, created_at, created_by FROM events_images ORDER BY created_at DESC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error("[Events] GET /images error:", err.message);
    res.status(500).json({ error: "Failed to fetch events images" });
  }
});

/* ------------------------------------------------ */
/* POST /api/events/images                          */
/* Upload one or more images (auth required)        */
/* Body: multipart/form-data, field name "images"   */
/* ------------------------------------------------ */

router.post(
  "/images",
  requireAuth,
  upload.array("images", 20),
  async (req, res) => {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    const user = req.user?.displayName || req.user?.username || "System";

    try {
      const inserted = [];

      for (const file of req.files) {
        const url_path = `/uploads/events/${file.filename}`;
        const row = await query(
          `INSERT INTO events_images (filename, original_name, url_path, created_by)
           VALUES ($1, $2, $3, $4)
           RETURNING id, filename, original_name, url_path, created_at, created_by`,
          [file.filename, file.originalname, url_path, user]
        );
        inserted.push(row.rows[0]);
      }

      res.status(201).json(inserted);
    } catch (err) {
      console.error("[Events] POST /images error:", err.message);
      res.status(500).json({ error: "Failed to save events images" });
    }
  }
);

/* ------------------------------------------------ */
/* DELETE /api/events/images/:id                    */
/* Remove image + DB record (auth required)         */
/* ------------------------------------------------ */

router.delete("/images/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  try {
    const result = await query(
      "SELECT filename FROM events_images WHERE id = $1",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Image not found" });
    }

    const { filename } = result.rows[0];

    // Remove file from disk (best-effort, don't fail if missing)
    const filePath = path.join(EVENTS_DIR, filename);
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (fsErr) {
      console.warn("[Events] Could not delete file:", fsErr.message);
    }

    await query("DELETE FROM events_images WHERE id = $1", [id]);

    res.json({ ok: true });
  } catch (err) {
    console.error("[Events] DELETE /images error:", err.message);
    res.status(500).json({ error: "Failed to delete events image" });
  }
});

/* ------------------------------------------------ */
/* PATCH /api/events/images/:id/visibility          */
/* Toggle is_visible for a single image (auth req)  */
/* ------------------------------------------------ */

router.patch("/images/:id/visibility", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const { is_visible } = req.body;
  if (typeof is_visible !== "boolean") {
    return res.status(400).json({ error: "is_visible must be a boolean" });
  }

  try {
    const result = await query(
      "UPDATE events_images SET is_visible = $1 WHERE id = $2 RETURNING id, filename, original_name, url_path, is_visible, created_at",
      [is_visible, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Image not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("[Events] PATCH /images visibility error:", err.message);
    res.status(500).json({ error: "Failed to update visibility" });
  }
});

export default router;
