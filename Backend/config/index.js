/* ─────────────────────────────────────────────────────────────────────────── */
/*  backend/config/index.js                                                    */
/*  SINGLE SOURCE OF TRUTH for all runtime configuration.                      */
/*                                                                             */
/*  Usage:  import { config } from "./config/index.js";                        */
/*  This module loads dotenv — do NOT import "dotenv/config" elsewhere.        */
/* ─────────────────────────────────────────────────────────────────────────── */

import "dotenv/config"; // Must be first — all process.env reads happen below.

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Environment flags                                                           */
/* ─────────────────────────────────────────────────────────────────────────── */

const NODE_ENV = process.env.NODE_ENV || "development";
const isProd = NODE_ENV === "production";
const APP_MODE = (process.env.APP_MODE || "odin").trim().toLowerCase();
const isShiftplannerMode = APP_MODE === "shiftplanner";

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Fail-fast: required vars in production                                      */
/* ─────────────────────────────────────────────────────────────────────────── */

const REQUIRED_IN_PROD = isShiftplannerMode
    ? ["JWT_SECRET", "SHIFTPLANNER_API_KEY", "DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD"]
    : ["JWT_SECRET", "QUEUE_INGEST_KEY"];

if (isProd) {
    const missing = REQUIRED_IN_PROD.filter((k) => !process.env[k]);
    if (missing.length > 0) {
        console.error(`[CONFIG] FATAL: Missing required env vars in production: ${missing.join(", ")}`);
        console.error("[CONFIG] Set them in backend/.env or as shell/container environment variables.");
        process.exit(1);
    }
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Database: DATABASE_URL preferred, individual DB_* vars as fallback          */
/* ─────────────────────────────────────────────────────────────────────────── */

const DATABASE_URL = process.env.DATABASE_URL || null;

// In production/Docker, DB_HOST must be set if DATABASE_URL is not provided.
if (!DATABASE_URL && !process.env.DB_HOST && isProd) {
    console.error("[CONFIG] FATAL: Neither DATABASE_URL nor DB_HOST is set in production.");
    process.exit(1);
}

const db = {
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5432", 10),
    database: process.env.DB_NAME || "shiftplanner",
    user: process.env.DB_USER || "shiftplanner_app",
    password: process.env.DB_PASSWORD || undefined, // No default — must be in .env
};

/* ─────────────────────────────────────────────────────────────────────────── */
/*  CORS: supports comma-separated list of origins                              */
/*  Set CORS_ORIGINS="https://a.com,https://b.com" for multiple origins.       */
/* ─────────────────────────────────────────────────────────────────────────── */

const CORS_ORIGINS = (process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Assembled config object                                                     */
/* ─────────────────────────────────────────────────────────────────────────── */

export const config = {
    PORT: parseInt(process.env.PORT || "5055", 10),
    NODE_ENV,
    isProd,
    APP_MODE,
    isShiftplannerMode,

    // Database
    DATABASE_URL,
    db,

    // Operational timezone — used for interpreting crawler timestamps and display
    // Override via OPERATIONAL_TIMEZONE env var (IANA identifier, e.g. "Europe/Berlin")
    OPERATIONAL_TIMEZONE: process.env.OPERATIONAL_TIMEZONE || "Europe/Berlin",

    // Auth
    JWT_SECRET: process.env.JWT_SECRET || (isProd ? "" : "dev-only-insecure-secret"),
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "8h",

    // Security
    QUEUE_INGEST_KEY: process.env.QUEUE_INGEST_KEY || "",
    SHIFTPLANNER_API_KEY: process.env.SHIFTPLANNER_API_KEY || "",
    SHIFTPLANNER_ADMIN_PASSWORD: process.env.SHIFTPLANNER_ADMIN_PASSWORD || "root",

    // CoC external review links + email notifications
    COC_PUBLIC_URL: String(process.env.COC_PUBLIC_URL || "").replace(/\/+$/, ""),
    COC_REVIEW_TOKEN_TTL: process.env.COC_REVIEW_TOKEN_TTL || "14d",
    SMTP_HOST: process.env.SMTP_HOST || "",
    SMTP_PORT: Number.parseInt(process.env.SMTP_PORT || "587", 10),
    SMTP_SECURE: String(process.env.SMTP_SECURE || "false").toLowerCase() === "true",
    SMTP_USER: process.env.SMTP_USER || "",
    SMTP_PASS: process.env.SMTP_PASS || "",
    SMTP_FROM: process.env.SMTP_FROM || "",

    // CORS
    CORS_ORIGINS,

    // Teams Integration (optional — set in .env)
    TEAMS_CHANNEL_WEBHOOK: process.env.TEAMS_CHANNEL_WEBHOOK || "",
    TEAMS_PERSONAL_WEBHOOK: process.env.TEAMS_PERSONAL_WEBHOOK || "",
};

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Sanitized startup log (no secrets)                                          */
/* ─────────────────────────────────────────────────────────────────────────── */

console.log("\n[CONFIG] ── Startup Configuration ──────────────────────");
console.log(`  NODE_ENV   : ${config.NODE_ENV}`);
console.log(`  APP_MODE   : ${config.APP_MODE}`);
console.log(`  PORT       : ${config.PORT}`);
console.log(`  TIMEZONE   : ${config.OPERATIONAL_TIMEZONE}`);
console.log(`  DATABASE   : ${DATABASE_URL ? "DATABASE_URL (set)" : `${db.host}:${db.port}/${db.database} (user: ${db.user})`}`);
console.log(`  DB_PASS    : ${db.password ? "****" : "⚠ MISSING"}`);
console.log(`  JWT_SECRET : ${config.JWT_SECRET && config.JWT_SECRET !== "dev-only-insecure-secret" ? "****" : (isProd ? "⚠ MISSING" : "dev (insecure)")}`);
console.log(`  INGEST_KEY : ${config.QUEUE_INGEST_KEY ? "****" : "⚠ MISSING"}`);
const corsMode = (process.env.CORS_ORIGINS || process.env.CORS_ORIGIN) ? `strict [${config.CORS_ORIGINS.join(", ")}]` : "proxy-mode (allow all — set CORS_ORIGINS to restrict)";
console.log(`  CORS       : ${corsMode}`);
console.log("─────────────────────────────────────────────────────────\n");
