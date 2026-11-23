// Systemkartet: hver bryter i kartet finnes i AUTOMATIKK, og alle linjer peker på noder som finnes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KART_AUTO, KART_DATA, KART_UT } from '../src/lib/systemkart.ts';
import { AUTOMATIKK } from '../src/lib/anbefalt.ts';

test('kartet og automatikklisten er like (ingen bryter mangler eller henger løst)', () => {
  assert.deepEqual(KART_AUTO.filter(a => !a.fast).map(a => a.id).sort(), AUTOMATIKK.map(p => p.id).sort());
});
test('alle linjer peker på noder som finnes, og ingen id er brukt to ganger', () => {
  const d = new Set(KART_DATA.map(x => x.id)), u = new Set(KART_UT.map(x => x.id));
  for (const a of KART_AUTO) { assert.ok(a.fra.every(f => d.has(f)), a.id + ' leser ukjent data'); assert.ok(a.til.length > 0 && a.til.every(t => u.has(t)), a.id + ' sender til ukjent resultat'); }
  const alle = [...KART_DATA, ...KART_UT, ...KART_AUTO].map(x => x.id); assert.equal(new Set(alle).size, alle.length);
  assert.ok(KART_DATA.every(x => KART_AUTO.some(a => a.fra.includes(x.id))), 'data som ingen automatikk bruker');
});
