import test from 'node:test';
import assert from 'node:assert/strict';

import { buildColoRolePlan, coloNameKey } from '../lib/coloPlanning.js';

const definitions = [{ code: 'E1', shift_type: 'early' }, { code: 'N', shift_type: 'night' }];

test('the Colo pool is matched to the plan whatever the spelling, and the mark is stored under the plan name', () => {
  assert.equal(coloNameKey('Brode, Patrick'), coloNameKey('patrick  BRODE'));
  assert.equal(coloNameKey('Müller, Jörg'), coloNameKey('Jörg Muller'));

  const plan = buildColoRolePlan({
    year: 2027, month: 1, numDays: 31,
    shifts: [
      { employee_name: 'Brode, Patrick', day: 4, shift_code: 'E1' },
      { employee_name: 'Ahmad, Awais', day: 4, shift_code: 'E1' },
    ],
    shiftDefinitions: definitions,
    config: {
      enabled: true,
      employeePool: ['patrick brode'],
      requirements: [{ id: 'prep', weekdays: [1], shift_type: 'early', staff: 1 }],
    },
  });
  const monday = plan.assignments.filter((entry) => entry.date === '2027-01-04');
  assert.equal(monday.length, 1);
  assert.equal(monday[0].employee_name, 'Brode, Patrick', 'stored with the spelling of the plan, so every view finds it');
  assert.equal(plan.summary.poolSize, 1);
});
