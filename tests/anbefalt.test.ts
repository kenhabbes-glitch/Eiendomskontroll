// Anbefalt automatikk: slår på bare det som er av, beholder justerte verdier, og nye organisasjoner får alt på.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AUTOMATIKK, erPa, slaPa, oppsettForNyOrg } from '../src/lib/anbefalt.ts';

test('tom innstilling: alt er av, og slaPa slår på de valgte', () => {
  assert.ok(AUTOMATIKK.every(p => !erPa(p, {})));
  const ny = slaPa(['purring', 'ukeoversikt'], {}, '2026-11-23');
  assert.deepEqual(ny, { avvikPurring: { ansvarlig: true }, eierOversikt: { pa: true } });
});
test('justerte verdier og andre brytere på samme nøkkel beholdes', () => {
  const innst = { avvikPurring: { ansvarlig: false, ansvarligFor: 5, eier: true, eierEpost: 'a@b.no' }, ltRunde: { pa: false, dato: '03-01', frist: 30 } };
  const ny = slaPa(['purring', 'eskalering', 'leietakerrunde'], innst, '2026-11-23');
  assert.deepEqual(ny.avvikPurring, { ansvarlig: true, ansvarligFor: 5, eier: true, eierEpost: 'a@b.no' });
  assert.deepEqual(ny.ltRunde, { pa: true, dato: '03-01', frist: 30, aktivert: '2026-11-23' });
});
test('flere punkter på samme nøkkel gir én samlet verdi; allerede på gir ingen endring', () => {
  const ny = slaPa(['purring', 'eskalering', 'avvikuke'], {}, '2026-11-23'); assert.deepEqual(ny, { avvikPurring: { ansvarlig: true, eier: true, ukentlig: true } });
  assert.deepEqual(slaPa(['purring'], ny, '2026-11-23'), {});
  assert.deepEqual(slaPa(['finnesikke'], {}, '2026-11-23'), {});
});
test('ltRunde: eksisterende aktivert-dato overskrives ikke', () => {
  assert.equal(slaPa(['leietakerrunde'], { ltRunde: { pa: false, aktivert: '2026-01-01' } }, '2026-11-23').ltRunde.aktivert, '2026-01-01');
});
test('nye organisasjoner: alt på, eller bare interne varsler', () => {
  const alt = oppsettForNyOrg('2026-11-23'); assert.ok(AUTOMATIKK.every(p => erPa(p, alt))); assert.equal(Object.keys(alt).sort().join(','), 'avvikPurring,chatVarsel,dokFornyelse,eierOversikt,investVarsel,leieVakt,ltRunde,oplAuto,rapportVarsel');
  const intern = oppsettForNyOrg('2026-11-23', true); assert.equal(erPa(AUTOMATIKK.find(p => p.id === 'purring')!, intern), false); assert.equal(erPa(AUTOMATIKK.find(p => p.id === 'eskalering')!, intern), true); assert.equal(intern.ltRunde, undefined); assert.equal(intern.dokFornyelse, undefined);
});
