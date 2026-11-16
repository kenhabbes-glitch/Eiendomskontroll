import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foreslaFraModell, typeForElement } from '../src/lib/modellForslag.ts';

test('systemtype ut fra IFC-klasse og navn', () => {
  assert.equal(typeForElement({ g: '1', k: 'IFCTRANSPORTELEMENT', n: 'Personheis 1' }), 'heis');
  assert.equal(typeForElement({ g: '2', k: 'IFCFLOWTERMINAL', n: 'Sprinklerhode K-factor 80' }), 'sprinkler');
  assert.equal(typeForElement({ g: '3', k: 'IFCDOOR', n: 'Enkel dør' }), '', 'vanlig dør er ikke et system');
  assert.equal(typeForElement({ g: '4', k: 'IFCDOOR', n: 'Branndør EI 30' }), 'branndorer');
  assert.equal(typeForElement({ g: '5', k: 'IFCALARM', n: 'Røykdetektor' }), 'brannalarm');
  assert.equal(typeForElement({ g: '6', k: 'IFCWALL', n: 'Yttervegg' }), '');
  assert.equal(typeForElement({ g: '7', k: 'IFCUNITARYEQUIPMENT', n: 'Luftbehandlingsaggregat LB01' }), 'ventilasjon');
});

test('grupperer per type, hopper over koblede objekter og teller etasjer', () => {
  const els = [{ g: 'a', k: 'IFCFLOWTERMINAL', n: 'Sprinkler', e: 0 }, { g: 'b', k: 'IFCFLOWTERMINAL', n: 'Sprinkler', e: 1 }, { g: 'c', k: 'IFCFLOWTERMINAL', n: 'Sprinkler', e: 1 }, { g: 'd', k: 'IFCTRANSPORTELEMENT', n: 'Heis', e: 0 }, { g: 'e', k: 'IFCWALL', n: 'Vegg', e: 0 }];
  const f = foreslaFraModell(els, new Set(['c']));
  assert.equal(f.length, 2);
  assert.equal(f[0].type, 'sprinkler'); assert.deepEqual(f[0].guider, ['a', 'b']); assert.deepEqual(f[0].etasjer, [0, 1]);
  assert.equal(f[1].type, 'heis');
});
