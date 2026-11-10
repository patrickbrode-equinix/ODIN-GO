import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCombinationStats } from '../lib/shiftCombinations.js';

const definitions = [
  { code: 'E1', shift_type: 'early' },
  { code: 'L1', shift_type: 'late' },
  { code: 'N', shift_type: 'night' },
];
// 5.1.2027 is a Tuesday, 9.1.2027 a Saturday
const row = (name, day, code) => ({ month: 'Januar 2027', employee_name: name, day, shift_code: code });
const shifts = [
  row('A', 5, 'E1'), row('B', 5, 'E1'), row('C', 5, 'E1'), row('D', 5, 'L1'),
  row('A', 6, 'E1'), row('B', 6, 'E1'),
  row('A', 9, 'N'), row('B', 9, 'N'), row('C', 9, 'N'), row('D', 9, 'N'),
  row('A', 7, 'FS'), row('B', 7, 'FS'),
];

test('pairs are counted per day and shift type', () => {
  const result = buildCombinationStats({ shifts, definitions, year: 2027, size: 2 });
  const ab = result.combinations.find((entry) => entry.employees.join() === 'A,B');
  assert.equal(ab.count, 3); // two early days + one night
  assert.deepEqual(ab.byType, { early: 2, late: 0, night: 1 });
  assert.equal(result.combinations.some((entry) => entry.employees.includes('D') && entry.employees.includes('A') && entry.byType.late > 0), false);
});

test('triples and quads, free markers do not count', () => {
  const triples = buildCombinationStats({ shifts, definitions, year: 2027, size: 3 });
  assert.equal(triples.combinations.find((entry) => entry.employees.join() === 'A,B,C').count, 2);
  const quads = buildCombinationStats({ shifts, definitions, year: 2027, size: 4 });
  assert.deepEqual(quads.combinations.map((entry) => [entry.employees.join(), entry.count]), [['A,B,C,D', 1]]);
});

test('filters: shift type, weekend, employee, month', () => {
  assert.equal(buildCombinationStats({ shifts, definitions, year: 2027, size: 2, shiftType: 'night' }).combinations.find((entry) => entry.employees.join() === 'A,B').count, 1);
  assert.equal(buildCombinationStats({ shifts, definitions, year: 2027, size: 2, days: 'weekend' }).combinations.every((entry) => entry.byType.night === entry.count), true);
  assert.equal(buildCombinationStats({ shifts, definitions, year: 2027, size: 2, days: 'weekdays' }).combinations.find((entry) => entry.employees.join() === 'A,B').count, 2);
  const withD = buildCombinationStats({ shifts, definitions, year: 2027, size: 2, employee: 'D' });
  assert.equal(withD.combinations.every((entry) => entry.employees.includes('D')), true);
  assert.equal(buildCombinationStats({ shifts, definitions, year: 2027, size: 2, month: 2 }).combinations.length, 0);
  assert.equal(buildCombinationStats({ shifts, definitions, year: 2026, size: 2 }).combinations.length, 0);
});
