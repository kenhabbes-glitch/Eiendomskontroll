// Brannopplæring på autopilot: purring, årlig repetisjon og eskalering til eier (bare prosent, aldri navn eller e-post til ansatte).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lagFalsk, type Db } from './falsk-supabase.ts';
import { renOplAuto, skalPurres, trengerRepetisjon, status, brannAuto } from '../src/lib/opplaeringAuto.ts';

const nu = Date.now(); const dagerFoer = (n: number) => new Date(nu - n * 864e5).toISOString();
const c = renOplAuto({ pa: true });

test('skalPurres: etter 5 dager, så hver 5., maks 3, aldri for ferdige eller usendte', () => {
  assert.equal(skalPurres(c, { sendt_tid: dagerFoer(4) }, nu), false); assert.equal(skalPurres(c, { sendt_tid: dagerFoer(5) }, nu), true);
  assert.equal(skalPurres(c, { sendt_tid: dagerFoer(30), purret_ant: 1, purret_tid: dagerFoer(3) }, nu), false);
  assert.equal(skalPurres(c, { sendt_tid: dagerFoer(30), purret_ant: 1, purret_tid: dagerFoer(5) }, nu), true);
  assert.equal(skalPurres(c, { sendt_tid: dagerFoer(30), purret_ant: 3, purret_tid: dagerFoer(9) }, nu), false);
  assert.equal(skalPurres(c, { sendt_tid: dagerFoer(30), fullfort_tid: dagerFoer(1) }, nu), false); assert.equal(skalPurres(c, {}, nu), false);
});
test('trengerRepetisjon og status', () => {
  assert.equal(trengerRepetisjon(c, dagerFoer(300), nu), false); assert.equal(trengerRepetisjon(c, dagerFoer(400), nu), true); assert.equal(trengerRepetisjon(c, null, nu), false);
  assert.equal(trengerRepetisjon(renOplAuto({ pa: true, aarlig: false }), dagerFoer(900), nu), false);
  const d = [{ fullfort_tid: dagerFoer(1) }, { sendt_tid: dagerFoer(20), purret_ant: 3, purret_tid: dagerFoer(6) }, { sendt_tid: dagerFoer(20), purret_ant: 3, purret_tid: dagerFoer(6) }];
  assert.deepEqual(status(c, d, nu), { invitert: 3, fullfort: 1, prosent: 33, ferdigPurret: true });
  assert.equal(status(c, [{ sendt_tid: dagerFoer(20), purret_ant: 3, purret_tid: dagerFoer(1) }], nu).ferdigPurret, false, 'venter etter siste purring');
  assert.equal(renOplAuto({ purrMaks: 99, terskel: -5 }).purrMaks, 10);
});

const json = (s: number, b: any) => new Response(JSON.stringify(b), { status: s });
const sp = async () => ({ t: (s: any, ...a: any[]) => String(s).replace(/\{(\d)\}/g, (_: any, i: any) => a[+i]) });
const dl = (id: string, kurs: string, rolle: string, navn: string, ekstra: any = {}) => ({ id, kurs_id: kurs, eiendom_id: 'e1', leietaker_id: 'l1', token: 'tok-' + id, rolle, navn, epost: navn.toLowerCase() + '@lt.no', invitert_av: rolle === 'ansatt' ? 'leder' : null, ...ekstra });
function kjor(deltakere: any[], lt: any = { navn: 'Kafé AS' }) {
  const db: Db = { organisasjoner: [{ id: 'o1', navn: 'Org', aktiv: true }], eiendommer: [{ id: 'e1', eier_org_id: 'o1', data: { navn: 'Bygg A' } }], innstillinger: [{ org_id: 'o1', nokkel: 'oplAuto', data: { pa: true } }],
    leietakere: [{ id: 'l1', eiendom_id: 'e1', data: lt }], opplaering_kurs: [{ id: 'k1', eiendom_id: 'e1', leietaker_id: 'l1', versjon: 2, innhold: { tittel: 'Kurs', steg: [] } }], opplaering_deltakere: deltakere, hendelseslogg: [],
    org_medlem: [{ org_id: 'o1', rolle: 'admin', aktiv: true, profiles: { epost: 'eier@example.no' } }] } as any;
  const sendt: any[] = [];
  const ctx = (erCron = true) => ({ admin: lagFalsk(db, {}, {}).klient as any, body: { action: 'brannauto' }, json, esc: (s: any) => String(s ?? ''), erCron, hvem: async () => null, sprakFor: sp as any, oppsettFor: async () => ({}),
    sendEpost: async (til: string, emne: string, _h: string, tekst: string) => { sendt.push({ til, emne, tekst }); return { sendt: true }; } });
  return { db, sendt, ctx };
}

test('jobb: purrer bare de som ikke har gjennomført, og ikke igjen samme dag', async () => {
  const k = kjor([dl('leder', 'k1', 'leder', 'Lise', { sendt_tid: dagerFoer(20), fullfort_tid: dagerFoer(15) }), dl('a1', 'k1', 'ansatt', 'Ola', { sendt_tid: dagerFoer(6) }), dl('a2', 'k1', 'ansatt', 'Eva', { sendt_tid: dagerFoer(6), fullfort_tid: dagerFoer(2) })]);
  const j = await (await brannAuto(k.ctx()))!.json(); assert.equal(j.rapport[0].purret, 1); assert.equal(k.sendt.length, 1); assert.equal(k.sendt[0].til, 'ola@lt.no'); assert.match(k.sendt[0].emne, /Påminnelse/); assert.match(k.sendt[0].tekst, /#\/op\/tok-a1/);
  assert.equal(k.db.opplaering_deltakere.find((d: any) => d.id === 'a1')!.purret_ant, 1);
  await brannAuto(k.ctx()); assert.equal(k.sendt.length, 1);
});
test('jobb: årlig repetisjon lager ny runde og sender nye personlige lenker til leder og tidligere ansatte', async () => {
  const k = kjor([dl('leder', 'k1', 'leder', 'Lise', { sendt_tid: dagerFoer(420), fullfort_tid: dagerFoer(400) }), dl('a1', 'k1', 'ansatt', 'Ola', { sendt_tid: dagerFoer(410), fullfort_tid: dagerFoer(399) })]);
  const j = await (await brannAuto(k.ctx()))!.json(); assert.equal(j.rapport[0].repetert, 1); assert.equal(k.db.opplaering_kurs.length, 2); assert.equal(k.db.opplaering_kurs[1].versjon, 2);
  assert.equal(k.sendt.length, 2); assert.ok(k.sendt.every(s => /Årlig repetisjon/.test(s.emne))); assert.deepEqual(k.sendt.map(s => s.til).sort(), ['lise@lt.no', 'ola@lt.no']);
  const nye = k.db.opplaering_deltakere.filter((d: any) => d.kurs_id === k.db.opplaering_kurs[1].id); assert.equal(nye.length, 2); assert.ok(nye.every((d: any) => d.token !== 'tok-leder' && d.token !== 'tok-a1' && d.sendt_tid));
  assert.equal(nye.find((d: any) => d.rolle === 'ansatt').invitert_av, nye.find((d: any) => d.rolle === 'leder').id);
});
test('jobb: eskalerer til eier med bare prosent – aldri navn eller e-post til ansatte – og bare én gang', async () => {
  const gamle = { sendt_tid: dagerFoer(40), purret_ant: 3, purret_tid: dagerFoer(8) };
  const k = kjor([dl('leder', 'k1', 'leder', 'Lise', { sendt_tid: dagerFoer(40), fullfort_tid: dagerFoer(30) }), dl('a1', 'k1', 'ansatt', 'Ola', gamle), dl('a2', 'k1', 'ansatt', 'Eva', gamle)]);
  const j = await (await brannAuto(k.ctx()))!.json(); assert.equal(j.rapport[0].eskalert, 1); assert.equal(j.rapport[0].purret, 0);
  assert.equal(k.sendt.length, 1); assert.equal(k.sendt[0].til, 'eier@example.no'); assert.match(k.sendt[0].tekst, /Kafé AS \(Bygg A\): 33 % \(1 av 3\)/); assert.doesNotMatch(k.sendt[0].tekst, /Ola|Eva|Lise|@lt\.no/);
  await brannAuto(k.ctx()); assert.equal(k.sendt.length, 1);
});
test('jobb: utflyttet leietaker hoppes over, og uten signatur nektes', async () => {
  const k = kjor([dl('a1', 'k1', 'ansatt', 'Ola', { sendt_tid: dagerFoer(20) })], { navn: 'Kafé AS', slutt: '2020-01-01' }); await brannAuto(k.ctx()); assert.equal(k.sendt.length, 0);
  assert.equal((await brannAuto(k.ctx(false)))!.status, 403);
});
