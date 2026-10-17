-- The admin menu had two parallel settings for the same thing: an on/off switch
-- (blocked weekdays, preferred colleagues) and a strength slider. A switch that
-- was off silently overruled a strength of 100 %, so employee wishes were stored
-- but never used. The strength is now the only setting (0 % = off).
--
-- * Switches that only carry the migration default ('false') were never chosen by an
--   admin: the wish is enabled with its default strength.
-- * Switches an admin deliberately turned off become strength 0 %.

INSERT INTO app_settings (key, value, updated_by, updated_at)
SELECT 'shiftplan.pref_strength.blocked_days', '100', 'migration-110', NOW()
 WHERE NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'shiftplan.pref_strength.blocked_days');

INSERT INTO app_settings (key, value, updated_by, updated_at)
SELECT 'shiftplan.pref_strength.colleagues', '50', 'migration-110', NOW()
 WHERE NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'shiftplan.pref_strength.colleagues');

UPDATE app_settings
   SET value = '0', updated_by = 'migration-110', updated_at = NOW()
 WHERE key = 'shiftplan.pref_strength.blocked_days'
   AND EXISTS (
     SELECT 1 FROM app_settings legacy
      WHERE legacy.key = 'shiftplan.blocked_days_enabled'
        AND legacy.value = 'false'
        AND COALESCE(legacy.updated_by, '') NOT LIKE 'migration-%'
   );

UPDATE app_settings
   SET value = '0', updated_by = 'migration-110', updated_at = NOW()
 WHERE key = 'shiftplan.pref_strength.colleagues'
   AND EXISTS (
     SELECT 1 FROM app_settings legacy
      WHERE legacy.key = 'shiftplan.preferred_colleagues_enabled'
        AND legacy.value = 'false'
        AND COALESCE(legacy.updated_by, '') NOT LIKE 'migration-%'
   );

DELETE FROM app_settings
 WHERE key IN ('shiftplan.blocked_days_enabled', 'shiftplan.preferred_colleagues_enabled');
