import { test } from 'node:test'; import assert from 'node:assert/strict';
import { flett, konflikter, koSett, lokaleFiler, byttFiler, erNettfeil } from '../src/lib/synk.ts';

test('flett: bare felt som ble endret lokalt legges oppå serverens rad', () => {
  const base = { id: 'a', tittel: 'Lekkasje', status: 'Ny', alv: 'Middels' };
  const lokal = { ...base, status: 'Utbedret', usynket: true };
  const server = { ...base, alv: 'Høy', tildeltId: 'u2' }; // kollega har endret alvorlighet og tildelt
  assert.deepEqual(flett(base, lokal, server), { id: 'a', tittel: 'Lekkasje', status: 'Utbedret', alv: 'Høy', tildeltId: 'u2' });
});
test('flett: historikk fra begge beholdes når to har kvittert samme kontroll', () => {
  const base = { id: 'o', historikk: [{ dato: '2026-01-01', av: 'A' }], nesteFrist: '2026-02-01' };
  const lokal = { id: 'o', historikk: [{ dato: '2026-02-03', av: 'Tekniker' }, ...base.historikk], nesteFrist: '2026-03-03' };
  const server = { id: 'o', historikk: [{ dato: '2026-02-01', av: 'Kollega' }, ...base.historikk], nesteFrist: '2026-03-01' };
  const m = flett(base, lokal, server);
  assert.deepEqual(m.historikk.map((h: any) => h.av), ['Tekniker', 'Kollega', 'A']);
  assert.equal(m.nesteFrist, '2026-03-03', 'siste lokale verdi gjelder for enkeltfelt');
  assert.deepEqual(konflikter(base, lokal, server), ['nesteFrist']);
});
test('flett: logg som legges til bakerst, havner bakerst – og sendes ikke dobbelt', () => {
  const base = { logg: [{ t: 1 }] }; const lokal = { logg: [{ t: 1 }, { t: 3 }] }; const server = { logg: [{ t: 1 }, { t: 2 }] };
  assert.deepEqual(flett(base, lokal, server).logg, [{ t: 1 }, { t: 2 }, { t: 3 }]);
  assert.deepEqual(flett(base, lokal, { logg: [{ t: 1 }, { t: 3 }] }).logg, [{ t: 1 }, { t: 3 }]);
});
test('flett: en liste der noe er fjernet lokalt, erstatter serverens', () => {
  assert.deepEqual(flett({ bilder: [{ p: 1 }, { p: 2 }] }, { bilder: [{ p: 2 }] }, { bilder: [{ p: 1 }, { p: 2 }] }).bilder, [{ p: 2 }]);
});
test('kø: flere endringer på samme rad slås sammen og beholder første utgangspunkt', () => {
  const forste = { col: 'avvik', obj: { id: 'a', status: 'Pågår' }, tid: 1, base: { id: 'a', status: 'Ny' } };
  const k = koSett(forste, { col: 'avvik', obj: { id: 'a', status: 'Utbedret' }, tid: 2, base: { id: 'a', status: 'Pågår' } });
  assert.deepEqual(k, { col: 'avvik', obj: { id: 'a', status: 'Utbedret' }, tid: 1, base: { id: 'a', status: 'Ny' } });
  const ny = koSett({ col: 'avvik', obj: { id: 'b' }, tid: 1, base: null }, { col: 'avvik', obj: { id: 'b', tittel: 'x' }, tid: 2, base: { id: 'b' } });
  assert.equal(ny.base, null, 'en ny rad som endres før den er sendt, er fortsatt ny');
});
test('lokale filer finnes og byttes ut uansett hvor de ligger', () => {
  const o = { fil: { lokal: 'k1', navn: 'a.jpg' }, bilder: [{ lokal: 'k2' }, { path: 'p' }], historikk: [{ x: { lokal: 'k3' } }] };
  assert.deepEqual(lokaleFiler(o), ['k1', 'k2', 'k3']);
  const b = byttFiler(o, { k1: { path: 'e/a.jpg', navn: 'a.jpg' }, k2: { path: 'e/b.jpg' } });
  assert.deepEqual(b.fil, { path: 'e/a.jpg', navn: 'a.jpg' }); assert.deepEqual(b.bilder, [{ path: 'e/b.jpg' }, { path: 'p' }]); assert.deepEqual(lokaleFiler(b), ['k3']);
});
test('nettfeil kjennes igjen, tilgangsfeil gjør ikke', () => {
  assert.ok(erNettfeil(new TypeError('Failed to fetch'))); assert.ok(erNettfeil({ message: 'TypeError: Load failed' }));
  assert.ok(!erNettfeil({ message: 'new row violates row-level security policy' }));
});
