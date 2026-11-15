import { test } from 'node:test'; import assert from 'node:assert/strict';
import { energikrav } from '../src/lib/energikrav.ts';

const vp = (id: string, kW?: number) => ({ id, type: 'varmepumpe', effektKw: kW });
test('varmeanlegg: grensen på 20 kW gjelder samlet for bygget, og over 100 kW er det hvert 2. år', () => {
  assert.equal(energikrav({}, [vp('a', 12)], vp('a', 12)).krav, 'nei');
  const to = [vp('a', 12), { id: 'b', type: 'kjel', effektKw: '9,5' }];
  assert.deepEqual([energikrav({}, to, to[0]).krav, energikrav({}, to, to[0]).aar], ['ja', 4]);
  assert.equal(energikrav({}, [vp('a', 150)], vp('a', 150)).aar, 2);
});
test('varmeanlegg uten registrert effekt: må avklares – men er det kjente alene over grensen, gjelder kravet', () => {
  assert.equal(energikrav({}, [vp('a')], vp('a')).krav, 'ukjent');
  const L = [vp('a'), vp('b', 30)]; assert.equal(energikrav({}, L, L[0]).krav, 'ja');
});
test('klimaanlegg: over 12 kW eller bygg over 500 m²', () => {
  const v = { id: 'v', type: 'ventilasjon', effektKw: 5 };
  assert.equal(energikrav({ bta: 300 }, [v], v).krav, 'nei');
  assert.equal(energikrav({ bta: 2400 }, [v], v).krav, 'ja');
  assert.equal(energikrav({ bta: 300 }, [v, { id: 'k', type: 'kjole', effektKw: 9 }], v).krav, 'ja');
  assert.equal(energikrav({}, [v], v).krav, 'ukjent', 'areal ukjent');
  assert.equal(energikrav({ bta: 300 }, [{ id: 'v', type: 'ventilasjon' }], { id: 'v', type: 'ventilasjon' }).krav, 'ukjent', 'effekt ukjent');
});
test('andre systemtyper og arkiverte anlegg teller ikke', () => {
  assert.equal(energikrav({}, [], { id: 'h', type: 'heis' }).krav, 'nei');
  const L = [vp('a', 15), { ...vp('b', 50), arkivert: true }]; assert.equal(energikrav({}, L, L[0]).krav, 'nei');
});
