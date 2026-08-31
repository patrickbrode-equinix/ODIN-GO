import pool from '../db.js';
import { SETTINGS_KEYS } from '../assignment/constants.js';
import { DEFAULT_CONFIG } from '../engine/constants.js';

const LEGACY_ENGINE_TO_SETTINGS_KEY = {
  engine_mode: SETTINGS_KEYS.MODE,
  stale_threshold_minutes: SETTINGS_KEYS.CRAWLER_MAX_AGE,
  enabled: SETTINGS_KEYS.ENABLED,
};

const SETTINGS_TO_LEGACY_ENGINE_KEY = Object.fromEntries(
  Object.entries(LEGACY_ENGINE_TO_SETTINGS_KEY).map(([legacyKey, settingsKey]) => [settingsKey, legacyKey])
);

function unwrapLegacyValue(value) {
  if (typeof value !== 'string') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value.replace(/^"|"$/g, '');
  }
}

function normalizeBoolean(value) {
  return value === true || value === 'true';
}

function normalizeLegacyEngineValue(key, value) {
  if (key === 'enabled') {
    return normalizeBoolean(value);
  }

  if (key === 'stale_threshold_minutes') {
    return Number(value) || DEFAULT_CONFIG.stale_threshold_minutes;
  }

  if (key === 'max_tickets_per_person_sh') {
    return Number(value) || DEFAULT_CONFIG.max_tickets_per_person_sh;
  }

  if (key === 'similar_remaining_hours_threshold') {
    return Number(value) || DEFAULT_CONFIG.similar_remaining_hours_threshold;
  }

  return typeof value === 'string' ? value : String(value);
}

function toSettingsValue(legacyKey, value) {
  const normalized = normalizeLegacyEngineValue(legacyKey, value);

  if (legacyKey === 'enabled') {
    return normalized ? 'true' : 'false';
  }

  return String(normalized);
}

async function upsertAssignmentConfig(key, value, updatedBy = 'unknown') {
  await pool.query(
    `INSERT INTO assignment_config (key, value, updated_by, updated_at)
     VALUES ($1, $2::jsonb, $3, NOW())
     ON CONFLICT (key) DO UPDATE
     SET value = $2::jsonb, updated_by = $3, updated_at = NOW()`,
    [key, JSON.stringify(normalizeLegacyEngineValue(key, value)), updatedBy]
  );
}

async function upsertAssignmentSetting(key, value, updatedBy = 'unknown') {
  await pool.query(
    `INSERT INTO assignment_settings (key, value, updated_at, updated_by)
     VALUES ($1, $2, NOW(), $3)
     ON CONFLICT (key) DO UPDATE
     SET value = $2, updated_at = NOW(), updated_by = $3`,
    [key, value, updatedBy]
  );
}

export async function loadUnifiedLegacyEngineConfig() {
  const [legacyRes, settingsRes] = await Promise.all([
    pool.query(`SELECT key, value FROM assignment_config`),
    pool.query(`SELECT key, value FROM assignment_settings WHERE key = ANY($1::text[])`, [Object.values(LEGACY_ENGINE_TO_SETTINGS_KEY)]),
  ]);

  const config = { ...DEFAULT_CONFIG };

  for (const row of legacyRes.rows) {
    if (!(row.key in config)) {
      continue;
    }
    config[row.key] = normalizeLegacyEngineValue(row.key, unwrapLegacyValue(row.value));
  }

  for (const row of settingsRes.rows) {
    const legacyKey = SETTINGS_TO_LEGACY_ENGINE_KEY[row.key];
    if (!legacyKey) {
      continue;
    }
    config[legacyKey] = normalizeLegacyEngineValue(legacyKey, row.value);
  }

  return config;
}

export async function syncLegacyEngineConfigFromAssignmentSettings(updates, updatedBy = 'unknown') {
  const entries = Object.entries(SETTINGS_TO_LEGACY_ENGINE_KEY)
    .filter(([settingsKey]) => Object.prototype.hasOwnProperty.call(updates, settingsKey))
    .map(([settingsKey, legacyKey]) => [legacyKey, updates[settingsKey]]);

  await Promise.all(entries.map(([legacyKey, value]) => upsertAssignmentConfig(legacyKey, value, updatedBy)));
}

export async function upsertLegacyEngineConfig(updates, updatedBy = 'unknown') {
  const entries = Object.entries(updates).filter(([key]) => Object.prototype.hasOwnProperty.call(DEFAULT_CONFIG, key));

  for (const [legacyKey, value] of entries) {
    await upsertAssignmentConfig(legacyKey, value, updatedBy);

    const settingsKey = LEGACY_ENGINE_TO_SETTINGS_KEY[legacyKey];
    if (settingsKey) {
      await upsertAssignmentSetting(settingsKey, toSettingsValue(legacyKey, value), updatedBy);
    }
  }

  return loadUnifiedLegacyEngineConfig();
}