import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KONTROLL_SJEKK, sysSjekkFor } from '../src/lib/komponentsjekk.ts';

test('standardlister for kontroller på hele eiendommen: unike punkt-id-er og nok punkter', () => {
  for (const [nokkel, k] of Object.entries(KONTROLL_SJEKK)) {
    const ids = k.punkter.map(x => x.id);
    assert.equal(new Set(ids).size, ids.length, `${nokkel}: punkt-id-ene må være unike`);
    assert.ok(k.punkter.length >= 8 && k.punkter.every(x => x.t.length > 10), `${nokkel}: for få eller for korte punkter`);
  }
  for (const n of ['brann_dok', 'samordning', 'eier_ik']) assert.ok(KONTROLL_SJEKK[n], 'mangler liste for ' + n);
});

test('sysSjekkFor: standardliste bare for kontroller uten system og uten egen mal', () => {
  const s = sysSjekkFor([], { malKey: 'eier_ik' }, undefined);
  assert.equal(s?.malId, 'kontroll:eier_ik'); assert.equal(s?.punkter.length, KONTROLL_SJEKK.eier_ik.punkter.length); assert.deepEqual(s?.svar, {});
  assert.equal(sysSjekkFor([], { malKey: 'eier_ik', anleggId: 'a1' }, 'ventilasjon'), null, 'kontroll på et system uten mal skal ikke få eiendomslisten');
  assert.equal(sysSjekkFor([], { malKey: 'eier_ik', kompSjekk: 'av' }, undefined), null);
  assert.equal(sysSjekkFor([], { malKey: 'radon' }, undefined), null, 'kontroller uten liste får ingen');
});
