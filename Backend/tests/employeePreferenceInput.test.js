import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAdminPreferenceInput } from '../lib/employeePreferenceInput.js';

test('only the sent fields are returned and codes are normalised', () => {
  const { values } = parseAdminPreferenceInput({ preferred_shifts: ['e1we', 'NK', 'he1', 'E1'], blocked_days: [6, '0', 9] });
  assert.deepEqual(values, { preferred_shifts: ['E1', 'N'], blocked_days: [6, 0] });
});

test('limits, night model and colleagues are validated', () => {
  assert.equal(parseAdminPreferenceInput({ night_model: 'x' }).error, 'Ungültiges Nachtschicht-Modell');
  assert.equal(parseAdminPreferenceInput({ preferred_colleagues: [1, 2, 3, 4, 5] }, { userId: 9 }).error.includes('vier'), true);
  const { values } = parseAdminPreferenceInput({ max_nights_per_month: 99, max_weekends_per_month: '', preferred_colleagues: [9, 2, 2] }, { userId: 9 });
  assert.deepEqual(values, { max_nights_per_month: 21, max_weekends_per_month: null, preferred_colleagues: [2] });
});
