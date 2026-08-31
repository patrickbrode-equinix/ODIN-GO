import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { requireAuth } from "../middleware/authMiddleware.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
router.use(requireAuth); // /api/commit-compliance/* requires a valid JWT

/* ------------------------------------------------ */
/* UPLOAD DIR                                       */
/* ------------------------------------------------ */

const uploadDir = path.join(__dirname, "..", "uploads", "commit-compliance");
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

/* ------------------------------------------------ */
/* MULTER CONFIG                                    */
/* ------------------------------------------------ */

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
        const ts = Date.now();
        const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
        cb(null, `${ts}_${safe}`);
    },
});

const upload = multer({
    storage,
    fileFilter: (_req, file, cb) => {
        if (file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf")) {
            cb(null, true);
        } else {
            cb(new Error("Only PDF files allowed"));
        }
    },
    limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
});

/* ------------------------------------------------ */
/* POST /upload                                     */
/* ------------------------------------------------ */

router.post("/upload", upload.single("file"), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
    }
    res.json({
        ok: true,
        filename: req.file.originalname,
        storedAs: req.file.filename,
        size: req.file.size,
    });
});

/* ------------------------------------------------ */
/* GET /files (list uploaded)                       */
/* ------------------------------------------------ */

router.get("/files", (_req, res) => {
    try {
        const files = fs.readdirSync(uploadDir).map((f) => ({
            name: f,
            size: fs.statSync(path.join(uploadDir, f)).size,
        }));
        res.json(files);
    } catch (err) {
        res.status(500).json({ error: "Failed to list files" });
    }
});

export default router;
