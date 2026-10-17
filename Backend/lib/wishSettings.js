/* ================================================ */
/* Employee wish settings                           */
/* One place decides whether a wish type is used:   */
/* its strength (shiftplan.pref_strength.*).        */
/* 0 % = ignored, 1-99 % = soft, 100 % = binding.   */
/* The former separate on/off switches for blocked  */
/* weekdays and preferred colleagues are merged     */
/* into the strengths (migration 110).              */
/* ================================================ */

import { PREFERENCE_STRENGTH_KEY_PREFIX, isIgnoredStrength, parsePreferenceStrengths } from './preferenceStrength.js';

export async function loadWishSettings(queryFn) {
  const { rows } = await queryFn(
    'SELECT key, value FROM app_settings WHERE key LIKE $1',
    [`${PREFERENCE_STRENGTH_KEY_PREFIX}%`]
  );
  const strengths = parsePreferenceStrengths(rows);
  return {
    strengths,
    blockedDaysEnabled: !isIgnoredStrength(strengths.blocked_days),
    colleaguesEnabled: !isIgnoredStrength(strengths.colleagues),
  };
}
