// Automatisk fornyelse av dokumenter: trinn, allerede fornyet, riktig mottaker, én e-post per mottaker og ingen gjentakelse.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lagFalsk, type Db } from './falsk-supabase.ts';
import { renFornyInnst, trinnNa, erFornyet, dokumentFornyelse } from '../src/lib/fornyelseServer.ts';

test('renFornyInnst: tekst blir sortert liste, ugyldig gir standard', () => {
  assert.deepEqual(renFornyInnst({ trinn: '30, 90 0 abc' }).trinn, [90, 30, 0]);
  assert.deepEqual(renFornyInnst({ trinn: 'x' }).trinn, [90, 30, 0]);
});
test('trinnNa: laveste nådde trinn som ikke er sendt; utløpt for lenge siden tas ikke med', () => {
  assert.equal(trinnNa([90, 30, 0], 100, []), null);
  assert.equal(trinnNa([90, 30, 0], 80, []), 90);
  assert.equal(trinnNa([90, 30, 0], 80, [90]), null);
  assert.equal(trinnNa([90, 30, 0], 20, [90]), 30);
  assert.equal(trinnNa([90, 30, 0], 20, [90, 30]), null);
  assert.equal(trinnNa([90, 30, 0], -5, [90, 30]), 0);
  assert.equal(trinnNa([90, 30, 0], -40, []), null);
});
test('erFornyet: nyere dokument av samme type og tilknytning', () => {
  const a = { id: 'a', eiendom_id: 'e', data: { type: 'Forsikringspolise', leietakerId: 'l1', gyldigTil: '2026-12-01' } };
  assert.equal(erFornyet(a, [a]), false);
  assert.equal(erFornyet(a, [a, { id: 'b', eiendom_id: 'e', data: { type: 'Forsikringspolise', leietakerId: 'l1', gyldigTil: '2027-12-01' } }]), true);
  assert.equal(erFornyet(a, [a, { id: 'b', eiendom_id: 'e', data: { type: 'Forsikringspolise', leietakerId: 'l2', gyldigTil: '2027-12-01' } }]), false, 'annen leietaker');
  assert.equal(erFornyet(a, [a, { id: 'b', eiendom_id: 'e', data: { type: 'Forsikringspolise', leietakerId: 'l1', gyldigTil: '2027-12-01', arkivert: true } }]), false, 'arkivert');
});

const json = (s: number, b: any) => new Response(JSON.stringify(b), { status: s });
const sp = async () => ({ t: (s: any, ...a: any[]) => String(s).replace(/\{(\d)\}/g, (_: any, i: any) => a[+i]), dato: (d: string) => d });
const om = (n: number) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
function kjor(docs: any[], lt: any[] = [], oppg: any[] = []) {
  const db: Db = { organisasjoner: [{ id: 'o1', navn: 'Org', aktiv: true }], eiendommer: [{ id: 'e1', eier_org_id: 'o1', data: { navn: 'Bygg A' } }],
    innstillinger: [{ org_id: 'o1', nokkel: 'dokFornyelse', data: { pa: true } }], dokumenter: docs, leietakere: lt, oppgaver: oppg, systemer: [], profiles: [], lt_invitasjon: [], hendelseslogg: [],
    org_medlem: [{ org_id: 'o1', rolle: 'admin', aktiv: true, profiles: { epost: 'eier@example.no' } }] } as any;
  const sendt: any[] = [];
  const ctx = (erCron = true) => ({ admin: lagFalsk(db, {}, {}).klient as any, body: { action: 'dok_fornyelse' }, json, esc: (s: any) => String(s ?? ''), erCron, hvem: async () => null, sprakFor: sp as any, oppsettFor: async () => ({}),
    sendEpost: async (til: string, emne: string, _h: string, tekst: string) => { sendt.push({ til, emne, tekst }); return { sendt: true }; } });
  return { db, sendt, ctx };
}
const dok = (id: string, data: any) => ({ id, eiendom_id: 'e1', data: { type: 'Forsikringspolise', tittel: 'Polise ' + id, ...data } });

test('jobb: leietakerdokumenter samles i én e-post til leietaker, leverandørdokument til leverandør, resten til eier', async () => {
  const k = kjor([dok('d1', { leietakerId: 'l1', gyldigTil: om(20) }), dok('d2', { leietakerId: 'l1', type: 'Energiattest', gyldigTil: om(10) }), dok('d3', { oppgaveId: 'o9', gyldigTil: om(5) }), dok('d4', { gyldigTil: om(5) }), dok('d5', { type: 'Energiattest', gyldigTil: om(400) })],
    [{ id: 'l1', eiendom_id: 'e1', data: { navn: 'Kafé', epost: 'kafe@example.no' } }], [{ id: 'o9', eiendom_id: 'e1', data: { ao: { epost: 'service@example.no' } } }]);
  const j = await (await dokumentFornyelse(k.ctx()))!.json();
  assert.equal(k.sendt.length, 3); assert.equal(j.rapport[0].dokumenter, 4);
  const til = k.sendt.map(s => s.til).sort(); assert.deepEqual(til, ['eier@example.no', 'kafe@example.no', 'service@example.no']);
  assert.match(k.sendt.find(s => s.til === 'kafe@example.no').tekst, /Polise d1[\s\S]*Polise d2|Energi|d2/);
  assert.match(k.sendt.find(s => s.til === 'kafe@example.no').tekst, /#\/lt\//);
});
test('jobb: sendes ikke på nytt for samme trinn, men neste trinn sendes', async () => {
  const k = kjor([dok('d1', { gyldigTil: om(20) })]); await dokumentFornyelse(k.ctx()); assert.equal(k.sendt.length, 1);
  await dokumentFornyelse(k.ctx()); assert.equal(k.sendt.length, 1);
  (k.db.dokumenter[0].data as any).gyldigTil = om(-1); await dokumentFornyelse(k.ctx()); assert.equal(k.sendt.length, 2);
});
test('jobb: allerede fornyet, arkivert og uten dato hoppes over; uten signatur nektes', async () => {
  const k = kjor([dok('d1', { gyldigTil: om(20) }), dok('d2', { gyldigTil: om(400) }), dok('d3', { gyldigTil: om(5), arkivert: true }), dok('d4', {})]);
  await dokumentFornyelse(k.ctx()); assert.equal(k.sendt.length, 0, 'd1 er fornyet av d2');
  assert.equal((await dokumentFornyelse(k.ctx(false)))!.status, 403);
});
