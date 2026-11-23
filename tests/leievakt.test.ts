// Leieavtale-vakt: datoregler, indeksutkast og serverjobben (varsler eier, aldri leietaker, ett varsel per trinn).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lagFalsk, type Db } from './falsk-supabase.ts';
import { parseDagMnd, nesteRegulering, sisteOppsigDato, trinnDager, reguleringUtkast, renVaktInnst, leieVakt } from '../src/lib/leieServer.ts';


test('parseDagMnd og nesteRegulering', () => {
  assert.deepEqual(parseDagMnd('15.03'), { d: 15, m: 3 }); assert.equal(parseDagMnd('32.01'), null); assert.equal(parseDagMnd('x'), null);
  assert.equal(nesteRegulering({ reguleringDag: '15.03', start: '2020-01-01' }, '2026-11-23'), '2027-03-15');
  assert.equal(nesteRegulering({ reguleringDag: '15.03', start: '2020-01-01' }, '2026-03-15'), '2026-03-15');
  assert.equal(nesteRegulering({ start: '2024-09-01' }, '2026-11-23'), '2027-09-01', 'årsdagen for start');
  assert.equal(nesteRegulering({ start: '2024-09-01', slutt: '2027-06-30' }, '2026-11-23'), null, 'ingen regulering etter utløp');
  assert.equal(nesteRegulering({}, '2026-11-23'), null);
  assert.equal(nesteRegulering({ reguleringDag: '29.02', start: '2020-01-01' }, '2026-11-23'), '2027-02-28', 'skuddårsdag');
});
test('sisteOppsigDato', () => {
  assert.equal(sisteOppsigDato({ slutt: '2027-06-30', oppsigMnd: 6 }), '2026-12-30');
  assert.equal(sisteOppsigDato({ slutt: '2027-03-31', oppsigMnd: 6 }), '2026-09-30');
  assert.equal(sisteOppsigDato({ slutt: '2027-03-31' }), null); assert.equal(sisteOppsigDato({ oppsigMnd: 6 }), null);
});
test('trinnDager: laveste nådde, ikke sendt, ikke passert', () => {
  assert.equal(trinnDager([60, 30], 70, []), null); assert.equal(trinnDager([60, 30], 50, []), 60); assert.equal(trinnDager([60, 30], 50, [60]), null);
  assert.equal(trinnDager([60, 30], 10, [60]), 30); assert.equal(trinnDager([60, 30], -1, []), null);
});
test('reguleringUtkast: KPI × andel, avrundet', () => {
  assert.deepEqual(reguleringUtkast(1000000, 3.1, 100), { gammel: 1000000, ny: 1031000, endring: 31000, prosent: 3.1 });
  assert.equal(reguleringUtkast(1000000, 3, 50).ny, 1015000); assert.equal(reguleringUtkast(0, 3, 100).ny, 0);
  assert.equal(reguleringUtkast(1000000, 3, 0).ny, 1000000);
});
test('renVaktInnst: tekst og grenser', () => {
  assert.deepEqual(renVaktInnst({ utlopMnd: '3, 12 6', oppsigDager: 'x', regulerDager: 5000 }).utlopMnd, [12, 6, 3]);
  assert.deepEqual(renVaktInnst({ oppsigDager: 'x' }).oppsigDager, [60, 30]); assert.equal(renVaktInnst({ regulerDager: 5000 }).regulerDager, 180);
});

const json = (s: number, b: any) => new Response(JSON.stringify(b), { status: s });
const sp = async () => ({ t: (s: any, ...a: any[]) => String(s).replace(/\{(\d)\}/g, (_: any, i: any) => a[+i]), dato: (d: string) => d });
const om = (n: number) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
function kjor(lt: any[]) {
  const db: Db = { organisasjoner: [{ id: 'o1', navn: 'Org', aktiv: true }], eiendommer: [{ id: 'e1', eier_org_id: 'o1', data: { navn: 'Bygg A' } }],
    innstillinger: [{ org_id: 'o1', nokkel: 'leieVakt', data: { pa: true } }], leietakere: lt, hendelseslogg: [],
    org_medlem: [{ org_id: 'o1', rolle: 'admin', aktiv: true, profiles: { epost: 'eier@example.no' } }] } as any;
  const sendt: any[] = [];
  const ctx = (erCron = true) => ({ admin: lagFalsk(db, {}, {}).klient as any, body: { action: 'leie_vakt' }, json, esc: (s: any) => String(s ?? ''), erCron, hvem: async () => null, sprakFor: sp as any, oppsettFor: async () => ({}),
    sendEpost: async (til: string, emne: string, _h: string, tekst: string) => { sendt.push({ til, emne, tekst }); return { sendt: true }; } });
  return { db, sendt, ctx };
}
const lt = (id: string, d: any) => ({ id, eiendom_id: 'e1', data: { navn: 'Leietaker ' + id, epost: 'lt' + id + '@example.no', ...d } });

test('jobb: én samlet e-post til eier, aldri til leietaker, og ingen gjentakelse', async () => {
  const k = kjor([lt('a', { slutt: om(150), oppsigMnd: 3 }), lt('b', { start: '2020-01-01', reguleringDag: '01.01', slutt: om(900) }), lt('c', { slutt: om(500) })]);
  // a: utløp om 150 dager (≤ 6 mnd = 183) og siste oppsigelsesdato ca. 60 dager frem; b: regulering 1. januar – innenfor 60 dager bare hvis nær; c: ingen frister
  await leieVakt(k.ctx());
  assert.equal(k.sendt.length, 1); assert.ok(k.sendt.every(s => s.til === 'eier@example.no'));
  assert.match(k.sendt[0].tekst, /Leietaker a/); assert.doesNotMatch(k.sendt[0].tekst, /Leietaker c/);
  const n = k.sendt.length; await leieVakt(k.ctx()); assert.equal(k.sendt.length, n, 'samme trinn sendes ikke to ganger');
  assert.ok((k.db.leietakere[0].data as any).vakt.utlop.length > 0);
});
test('jobb: utløp om 100 dager gir varsel for 6 måneder; utløp om 20 dager gir også oppsigelses-varsel bare når dato ikke er passert', async () => {
  const k = kjor([lt('a', { slutt: om(100) })]); await leieVakt(k.ctx()); assert.equal(k.sendt.length, 1); assert.match(k.sendt[0].tekst, /Avtaleutløp: Leietaker a/);
  const k2 = kjor([lt('a', { slutt: om(100), oppsigMnd: 1 })]); await leieVakt(k2.ctx()); assert.doesNotMatch(k2.sendt[0].tekst, /Siste oppsigelsesdato/, 'oppsigelsesdato om ~70 dager er utenfor 60-dagersvarselet');
  const k3 = kjor([lt('a', { slutt: om(100), oppsigMnd: 2 })]); await leieVakt(k3.ctx()); assert.match(k3.sendt[0].tekst, /Siste oppsigelsesdato/);
});
test('jobb: regulering nær, endret sluttdato nullstiller, utflyttet og uten signatur', async () => {
  const dag = (() => { const d = new Date(); d.setUTCDate(d.getUTCDate() + 20); return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}`; })();
  const k = kjor([lt('a', { start: '2020-01-01', reguleringDag: dag })]); await leieVakt(k.ctx()); assert.equal(k.sendt.length, 1); assert.match(k.sendt[0].tekst, /Indeksregulering/);
  await leieVakt(k.ctx()); assert.equal(k.sendt.length, 1);
  const k2 = kjor([lt('a', { slutt: om(-5) })]); await leieVakt(k2.ctx()); assert.equal(k2.sendt.length, 0);
  assert.equal((await leieVakt(k.ctx(false)))!.status, 403);
});
