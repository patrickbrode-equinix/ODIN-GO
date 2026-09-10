import pool from '../db.js';
import { generateShiftPlan } from '../routes/shiftplanControl.js';

const month = '2031-12';
const sourceMonth = 'Dezember 2031';
const year = 2031;
const monthNumber = 12;
const prefix = 'SIM-NIGHT-2031-';
const names = Array.from({ length: 40 }, (_, index) => `${prefix}${String(index + 1).padStart(2, '0')}`);
const emails = names.map((name) => `${name.toLowerCase()}@simulation.invalid`);

function preferenceFor(index) {
  if (index < 8) {
    return { nightModel: 'SEVEN_DAY', preferred: ['N'], unwanted: [], blockedDays: [], maxNights: 7, group: 'SEVEN_DAY' };
  }
  if (index < 24) {
    return { nightModel: 'SHORT', preferred: ['N'], unwanted: [], blockedDays: index % 4 === 0 ? [0] : [], maxNights: null, group: 'SHORT' };
  }
  if (index < 32) {
    return { nightModel: 'SEVEN_DAY', preferred: ['E1', 'E2'], unwanted: ['N'], blockedDays: index % 2 === 0 ? [6, 0] : [], maxNights: null, group: 'NO_NIGHT' };
  }
  return { nightModel: 'SHORT', preferred: index % 2 === 0 ? ['L1'] : ['E1'], unwanted: ['N'], blockedDays: index % 3 === 0 ? [0] : [], maxNights: null, group: 'DAY_ONLY' };
}

function countConsecutive(days) {
  const daySet = new Set(days);
  let longest = 0;
  let current = 0;
  for (let day = 1; day <= 31; day++) {
    current = daySet.has(day) ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  return longest;
}

async function cleanup() {
  await pool.query('DELETE FROM shiftplan_employee_monthly_targets WHERE month = $1 AND employee_name = ANY($2::text[])', [month, names]);
  await pool.query('DELETE FROM shifts WHERE month = $1 AND employee_name = ANY($2::text[])', [sourceMonth, names]);
  await pool.query('DELETE FROM absences WHERE employee_name = ANY($1::text[])', [names]);
  await pool.query('DELETE FROM users WHERE email = ANY($1::text[])', [emails]);
}

async function run() {
  // The migration is repeated here so the simulation also works before the
  // application server has performed its next startup migration pass.
  await pool.query("ALTER TABLE employee_preferences ADD COLUMN IF NOT EXISTS night_model VARCHAR(16) NOT NULL DEFAULT 'SEVEN_DAY'");
  await pool.query("UPDATE employee_preferences SET night_model = 'SEVEN_DAY' WHERE night_model IS NULL OR night_model NOT IN ('SEVEN_DAY', 'SHORT')");

  const appSetting = await pool.query("SELECT value FROM app_settings WHERE key = 'shiftplan.blocked_weekday_employee_pool' LIMIT 1");
  const previousBlockedPool = appSetting.rows[0]?.value;
  const nightDefinition = await pool.query("SELECT min_staff, max_staff, series_days FROM shift_definitions WHERE UPPER(code) = 'N' LIMIT 1");
  if (!nightDefinition.rows[0]) throw new Error('Die Schichtdefinition N fehlt.');
  const previousNightDefinition = nightDefinition.rows[0];

  await cleanup();
  try {
    for (let index = 0; index < names.length; index++) {
      await pool.query(
        `INSERT INTO users (first_name, last_name, email, login_name, password_hash, approved, user_group, department)
         VALUES ($1, NULL, $2, $3, 'SIMULATION_ONLY', TRUE, 'c-ops', 'c-ops')`,
        [names[index], emails[index], names[index].toLowerCase()]
      );
    }

    const users = await pool.query("SELECT id, first_name, last_name, email FROM users WHERE email = ANY($1::text[])", [emails]);
    for (const user of users.rows) {
      const index = emails.indexOf(user.email);
      const preference = preferenceFor(index);
      await pool.query(
        `INSERT INTO employee_preferences
          (user_id, preferred_shifts, unwanted_shifts, preferred_holidays, max_nights_per_month, preferred_days, blocked_days, avoid_colleagues, workload_preference, monthly_preferences, night_model)
         VALUES ($1, $2::jsonb, $3::jsonb, '[]'::jsonb, $4, '[]'::jsonb, $5::jsonb, '[]'::jsonb, 'normal', '{}'::jsonb, $6)`,
        [user.id, JSON.stringify(preference.preferred), JSON.stringify(preference.unwanted), preference.maxNights, JSON.stringify(preference.blockedDays), preference.nightModel]
      );
    }

    // A harmless source row makes the 40 test people the complete employee
    // set for the isolated future planning year.
    for (const name of names) {
      await pool.query('INSERT INTO shifts (month, employee_name, day, shift_code) VALUES ($1, $2, 1, $3)', [sourceMonth, name, 'SIM']);
      await pool.query('INSERT INTO shiftplan_employee_monthly_targets (month, employee_name, target_hours) VALUES ($1, $2, 40)', [month, name]);
    }

    await pool.query("UPDATE shift_definitions SET min_staff = 3, max_staff = 3, series_days = 7 WHERE UPPER(code) = 'N'");
    await pool.query(
      `INSERT INTO app_settings (key, value)
       VALUES ('shiftplan.blocked_weekday_employee_pool', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [JSON.stringify(names)]
    );

    const result = await generateShiftPlan(year, monthNumber, 31, 'night-model-simulation');
    const nightAssignments = result.shifts.filter((shift) => String(shift.shift_code).toUpperCase() === 'N');
    const details = names.map((name, index) => {
      const preference = preferenceFor(index);
      const nightDays = nightAssignments.filter((shift) => shift.employee_name === name).map((shift) => Number(shift.day));
      return { name, ...preference, nightDays, longestNightRun: countConsecutive(nightDays) };
    });
    const dailyNightCounts = Array.from({ length: 31 }, (_, offset) => {
      const day = offset + 1;
      return { day, assigned: nightAssignments.filter((shift) => Number(shift.day) === day).length };
    });
    const shortViolations = details.filter((entry) => entry.group === 'SHORT' && entry.longestNightRun > 3);
    const noNightViolations = details.filter((entry) => entry.group === 'NO_NIGHT' || entry.group === 'DAY_ONLY').filter((entry) => entry.nightDays.length > 0);
    const overstaffedNights = dailyNightCounts.filter((entry) => entry.assigned > 3);
    const understaffedNights = dailyNightCounts.filter((entry) => entry.assigned < 3);
    const targetShortfalls = result.conflicts.filter((conflict) => conflict.type === 'target_hours_shortfall');

    const markdown = [
      '# Nachtmodell-Simulation mit 40 Fantasiemitarbeitern',
      '',
      `**Planungsmonat:** ${month} (Monatsbeginn Montag)  `,
      '**Testdaten:** 40 eindeutig markierte, nach dem Lauf wieder entfernte Simulationsmitarbeiter',
      '',
      '## Verteilte Praeferenzen',
      '',
      '- 8 Mitarbeiter: `SEVEN_DAY`, Nachtschicht bevorzugt, maximal sieben Naechte.',
      '- 16 Mitarbeiter: `SHORT`, Nachtschicht bevorzugt; bei einem Teil ist Sonntag gesperrt.',
      '- 8 Mitarbeiter: Nachtschicht `N` als unerwuenscht, teils Wochenende gesperrt.',
      '- 8 Mitarbeiter: Tagesdienst-Praeferenzen, Nachtschicht `N` als unerwuenscht.',
      '',
      '## Ergebnis',
      '',
      `- Geplante Nachtzuweisungen: **${nightAssignments.length}**`,
      `- Nacht-Coverage: **${dailyNightCounts.filter((entry) => entry.assigned === 3).length}/31** Tage exakt mit 3 Personen besetzt.`,
      `- Ueberbesetzte Nachttermine: **${overstaffedNights.length}**`,
      `- Unterbesetzte Nachttermine: **${understaffedNights.length}**`,
      `- SHORT-Verstoesse (>3 Naechte am Stueck): **${shortViolations.length}**`,
      `- Verstoesse gegen die harte N-Abwahl: **${noNightViolations.length}**`,
      `- Ausgewiesene Sollstunden-Konflikte: **${targetShortfalls.length}**`,
      '',
      '## Nachtverteilung je Mitarbeiter',
      '',
      '| Mitarbeiter | Gruppe | Modell | Nacht-Tage | Laengster Block |',
      '|---|---|---|---|---:|',
      ...details.map((entry) => `| ${entry.name} | ${entry.group} | ${entry.nightModel} | ${entry.nightDays.join(', ') || '-'} | ${entry.longestNightRun} |`),
      '',
      '## Auffaellige Konflikte',
      '',
      ...(result.conflicts.length === 0
        ? ['Keine Konflikte vom Generator gemeldet.']
        : result.conflicts.slice(0, 40).map((conflict) => `- ${conflict.type || 'unknown'}: ${conflict.message || 'ohne Meldung'}`)),
      '',
      '## Bewertung',
      '',
      `Die harte Obergrenze fuer N wurde ${overstaffedNights.length === 0 ? 'eingehalten' : 'verletzt'}. `
        + `Die harte N-Abwahl wurde ${noNightViolations.length === 0 ? 'eingehalten' : 'verletzt'}. `
        + `Das SHORT-Limit wurde ${shortViolations.length === 0 ? 'eingehalten' : 'verletzt'}.`,
    ].join('\n');
    console.log('--- NIGHT MODEL SIMULATION REPORT ---');
    console.log(markdown);
    console.log(JSON.stringify({
      employees: names.length,
      nightAssignments: nightAssignments.length,
      fullyCoveredNightDays: dailyNightCounts.filter((entry) => entry.assigned === 3).length,
      overstaffedNights: overstaffedNights.length,
      understaffedNights: understaffedNights.length,
      shortViolations: shortViolations.length,
      noNightViolations: noNightViolations.length,
      targetShortfalls: targetShortfalls.length,
    }));
  } finally {
    await pool.query('UPDATE shift_definitions SET min_staff = $1, max_staff = $2, series_days = $3 WHERE UPPER(code) = \'N\'', [previousNightDefinition.min_staff, previousNightDefinition.max_staff, previousNightDefinition.series_days]);
    if (previousBlockedPool === undefined) {
      await pool.query("DELETE FROM app_settings WHERE key = 'shiftplan.blocked_weekday_employee_pool'");
    } else {
      await pool.query(
        `INSERT INTO app_settings (key, value) VALUES ('shiftplan.blocked_weekday_employee_pool', $1)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [previousBlockedPool]
      );
    }
    await cleanup();
  }
}

try {
  await run();
} finally {
  await pool.end();
}
