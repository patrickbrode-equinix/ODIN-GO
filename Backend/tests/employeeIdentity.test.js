import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  areEquivalentEmployeeNames,
  dedupeEmployeeIdentities,
  normalizeEmployeeIdentity,
} from '../lib/employeeIdentity.js';

describe('employeeIdentity', () => {
  it('keeps double and multi-part names as complete display names', () => {
    for (const name of [
      'Patrick Albrecht-Schmidt',
      'Maria Clara de Souza',
      'Anna Lena Müller',
      'Jean-Pierre Dupont',
    ]) {
      const identity = normalizeEmployeeIdentity({ displayName: name });
      assert.equal(identity.displayName, name);
      assert.match(identity.employeeKey, /^legacy-name:/);
    }
  });

  it('prefers Entra ID, employee ID and UPN over display names', () => {
    assert.equal(
      normalizeEmployeeIdentity({
        entraObjectId: 'ENTRA-1',
        employeeId: 'E-1',
        upn: 'User@Example.COM',
        displayName: 'Display Name',
      }).employeeKey,
      'entra:entra-1'
    );
    assert.equal(
      normalizeEmployeeIdentity({
        employeeId: 'E-1',
        upn: 'User@Example.COM',
        displayName: 'Display Name',
      }).employeeKey,
      'employee:e-1'
    );
    assert.equal(
      normalizeEmployeeIdentity({
        upn: 'User@Example.COM',
        displayName: 'Display Name',
      }).employeeKey,
      'upn:user@example.com'
    );
  });

  it('deduplicates identical stable identities but does not merge similar names with different IDs', () => {
    const deduped = dedupeEmployeeIdentities([
      { displayName: 'Amine Mohamed Tigoudar', upn: 'amine.tigoudar@example.com' },
      { displayName: 'Amine M. Tigoudar', upn: 'Amine.Tigoudar@Example.com' },
      { displayName: 'Mohamed Tigoudar', entraObjectId: 'entra-mohamed' },
      { displayName: 'Amine Mohamed Tigoudar', entraObjectId: 'entra-amine' },
    ]);

    assert.deepEqual(deduped.map((entry) => entry.employeeKey), [
      'upn:amine.tigoudar@example.com',
      'entra:entra-mohamed',
      'entra:entra-amine',
    ]);
  });

  it('uses exact legacy display-name equality only', () => {
    assert.equal(areEquivalentEmployeeNames('Amine Mohamed Tigoudar', 'Mohamed Tigoudar'), false);
    assert.equal(areEquivalentEmployeeNames('Anna Lena Müller', 'Anna Lena Müller'), true);
    assert.equal(areEquivalentEmployeeNames('Mohamed@Tigoudar', 'Mohamed Tigoudar'), false);
  });
});
