import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alvorlighetFra, feilFra, plasseringFra, foreslaAvvik } from '../src/lib/avvikFoto.ts';

test('alvorlighet fra ord i teksten', () => {
  assert.equal(alvorlighetFra('Røyk fra tavlen i kjelleren').alv, 'Kritisk');
  assert.equal(alvorlighetFra('Lekkasje fra rør under vask').alv, 'Høy');
  assert.equal(alvorlighetFra('Riper i malingen på døra').alv, 'Lav');
  assert.equal(alvorlighetFra('Se på dette').alv, 'Middels');
  assert.equal(alvorlighetFra('lekkasje og røyk').alv, 'Kritisk', 'det alvorligste teller');
});
test('feil og plassering', () => {
  assert.equal(feilFra('Slokker utløpt dato 2023'), 'utløpt kontroll/dato');
  assert.equal(feilFra('ingenting'), '');
  assert.equal(plasseringFra('Rom 2.14 i 3. etg'), '3. etg, rom 2.14');
  assert.equal(plasseringFra('IMG_2231'), '');
});
test('tittel bygges av system og feil', () => {
  assert.equal(foreslaAvvik('lekkasje', 'Ventilasjonsaggregat').tittel, 'Ventilasjonsaggregat: lekkasje');
  assert.equal(foreslaAvvik('lekkasje').tittel, 'Lekkasje');
  assert.equal(foreslaAvvik('').tittel, '');
});
