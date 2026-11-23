// Automatisk leietaker-runde: datoplan, besvart-sjekk, purretrapp og at serverjobben sender, purrer og eskalerer riktig.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lagFalsk, type Db } from './falsk-supabase.ts';
import { RUNDE_STD, renRundeInnst, periodeStart, skalStarte, erBesvart, nesteSteg, leietakerRunde } from '../src/lib/rundeServer.ts';

const c = (x: any = {}) => renRundeInnst({ pa: true, ...x });

test('periodeStart: årlig og halvårlig', () => {
  assert.equal(periodeStart(c({ dato: '01-15' }), '2026-11-23'), '2026-01-15');
  assert.equal(periodeStart(c({ dato: '01-15' }), '2026-01-10'), '2025-01-15');
  assert.equal(periodeStart(c({ dato: '01-15', intervall: 'halvaar' }), '2026-11-23'), '2026-07-15');
  assert.equal(periodeStart(c({ dato: '09-01', intervall: 'halvaar' }), '2026-03-02'), '2026-03-01');
  assert.equal(periodeStart(c({ dato: '09-01', intervall: 'halvaar' }), '2026-02-28'), '2025-09-01');
});

test('skalStarte: hopper over runder før funksjonen ble slått på, og starter bare én gang per periode', () => {
  const k = c({ dato: '01-15', aktivert: '2026-11-23' });
  assert.equal(skalStarte(k, undefined, '2026-11-24'), false);
  assert.equal(skalStarte(k, undefined, '2027-01-15'), true);
  assert.equal(skalStarte(k, { start: '2027-01-15' }, '2027-01-20'), false);
  assert.equal(skalStarte(k, { start: '2027-01-15' }, '2027-12-01'), false);
  assert.equal(skalStarte(k, { start: '2027-01-15' }, '2028-01-15'), true);
  assert.equal(skalStarte(k, undefined, '2026-11-24', true), true, 'start nå');
  assert.equal(skalStarte(k, { start: '2026-11-24' }, '2026-11-24', true), false, 'ikke to ganger samme dag');
});

test('erBesvart: bekreftet etter start, eller til godkjenning; ikke relevante teller ikke', () => {
  const pl = [{ key: 'a', sist: '2026-02-01' }, { key: 'b', ikkeRelevant: true }, { key: 'c', status: 'til_godkjenning' }];
  assert.equal(erBesvart(pl, '2026-01-15'), true);
  assert.equal(erBesvart(pl, '2026-03-01'), false);
  assert.equal(erBesvart([{ key: 'a' }], '2026-01-15'), false);
});

test('nesteSteg: purring etter 7 dager, så hver 7., maks 3, deretter eskalering én gang', () => {
  const k = c({});
  const r = (x: any) => ({ start: '2026-01-15', sendt: '2026-01-15T07:00:00Z', ...x });
  assert.equal(nesteSteg(k, r({}), '2026-01-21'), 'ingen');
  assert.equal(nesteSteg(k, r({}), '2026-01-22'), 'purr');
  assert.equal(nesteSteg(k, r({ purret: 1, sistPurret: '2026-01-22T07:00:00Z' }), '2026-01-28'), 'ingen');
  assert.equal(nesteSteg(k, r({ purret: 1, sistPurret: '2026-01-22T07:00:00Z' }), '2026-01-29'), 'purr');
  assert.equal(nesteSteg(k, r({ purret: 3, sistPurret: '2026-02-05T07:00:00Z' }), '2026-02-12'), 'eskaler');
  assert.equal(nesteSteg(k, r({ purret: 3, sistPurret: '2026-02-05T07:00:00Z', eskalert: 'x' }), '2026-03-12'), 'ingen');
  assert.equal(nesteSteg(c({ eskaler: false }), r({ purret: 3, sistPurret: '2026-02-05T07:00:00Z' }), '2026-02-12'), 'ingen');
  assert.equal(nesteSteg(k, r({ besvart: '2026-01-20' }), '2026-02-20'), 'ingen');
});

test('renRundeInnst: ugyldige verdier får standard og grenser', () => {
  const x = renRundeInnst({ pa: 1, dato: '13-40', frist: 9999, purrMaks: -3, intervall: 'x' });
  assert.equal(x.dato, RUNDE_STD.dato); assert.equal(x.frist, 120); assert.equal(x.purrMaks, 0); assert.equal(x.intervall, 'aar');
});

// ---- Serverjobben mot falsk database
const json = (s: number, b: any) => new Response(JSON.stringify(b), { status: s });
const esc = (s: any) => String(s ?? '');
const sp = async () => ({ t: (s: any, ...a: any[]) => String(s).replace(/\{(\d)\}/g, (_: any, i: any) => a[+i]), dato: (d: string) => d });
function oppsett(db: Db) {
  const sendt: any[] = [];
  const ctx = (body: any, erCron = true) => ({ admin: lagFalsk(db, {}, {}).klient as any, body, json, esc, erCron, hvem: async () => null, sprakFor: sp as any, oppsettFor: async () => ({}),
    sendEpost: async (til: string, emne: string, html: string, tekst: string) => { sendt.push({ til, emne, tekst }); return { sendt: true }; } });
  return { sendt, ctx };
}
const idag = new Date().toISOString().slice(0, 10);
const dagerSiden = (n: number) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
const lagDb = (lt: any, innst: any = { pa: true, dato: '01-15', aktivert: '2000-01-01' }): Db => ({
  organisasjoner: [{ id: 'o1', navn: 'Org', aktiv: true }], eiendommer: [{ id: 'e1', eier_org_id: 'o1', data: { navn: 'Bygg A' } }],
  innstillinger: [{ org_id: 'o1', nokkel: 'ltRunde', data: innst }], leietakere: [{ id: 'l1', eiendom_id: 'e1', data: lt }], profiles: [], lt_invitasjon: [], hendelseslogg: [], org_medlem: [],
} as any);

test('jobb: starter runde, sender én e-post, og gjør ingenting neste dag', async () => {
  const db = lagDb({ navn: 'Kafé AS', epost: 'kafe@example.no', plikter: [{ key: 'a', navn: 'Brannslokker' }] });
  const o = oppsett(db);
  const r = await leietakerRunde(o.ctx({ action: 'lt_runde' })); const j = await r!.json();
  assert.equal(j.rapport[0].startet, 1); assert.equal(o.sendt.length, 1); assert.equal(o.sendt[0].til, 'kafe@example.no');
  assert.match(o.sendt[0].tekst, /Brannslokker/);
  assert.ok((db.leietakere[0].data as any).runde.sendt);
  await leietakerRunde(o.ctx({ action: 'lt_runde' })); assert.equal(o.sendt.length, 1, 'ingen ny e-post samme dag');
});

test('jobb: purrer etter 7 dager, ikke etter at leietaker har svart; eskalerer til slutt', async () => {
  const mk = (extra: any) => lagDb({ navn: 'Kafé AS', epost: 'kafe@example.no', plikter: [{ key: 'a', navn: 'Brannslokker' }], runde: { start: dagerSiden(8), sendt: new Date(Date.now() - 8 * 864e5).toISOString(), til: 'kafe@example.no', purret: 0, ...extra } });
  const db1 = mk({}); const o1 = oppsett(db1); await leietakerRunde(o1.ctx({ action: 'lt_runde' }));
  assert.equal(o1.sendt.length, 1); assert.match(o1.sendt[0].emne, /Purring/); assert.equal((db1.leietakere[0].data as any).runde.purret, 1);
  const db2 = lagDb({ navn: 'Kafé AS', epost: 'kafe@example.no', plikter: [{ key: 'a', navn: 'Brannslokker', sist: idag }], runde: { start: dagerSiden(8), sendt: new Date(Date.now() - 8 * 864e5).toISOString(), purret: 0 } });
  const o2 = oppsett(db2); await leietakerRunde(o2.ctx({ action: 'lt_runde' })); assert.equal(o2.sendt.length, 0); assert.ok((db2.leietakere[0].data as any).runde.besvart);
  const db3 = mk({ purret: 3, sistPurret: new Date(Date.now() - 8 * 864e5).toISOString() }); (db3 as any).org_medlem = [{ org_id: 'o1', rolle: 'admin', aktiv: true, profiles: { epost: 'eier@example.no' } }];
  const o3 = oppsett(db3); const j3 = await (await leietakerRunde(o3.ctx({ action: 'lt_runde' })))!.json();
  assert.equal(j3.rapport[0].eskalert, 1); assert.ok((db3.leietakere[0].data as any).runde.eskalert);
});

test('jobb: uten cron-signatur eller innlogging nektes', async () => {
  const o = oppsett(lagDb({ navn: 'X', epost: 'a@b.no', plikter: [{ key: 'a' }] }));
  assert.equal((await leietakerRunde(o.ctx({ action: 'lt_runde' }, false)))!.status, 403);
  assert.equal((await leietakerRunde(o.ctx({ action: 'lt_runde_na', org: 'o1' }, false)))!.status, 401);
});

test('jobb: leietaker uten e-post, utflyttet eller uten plikter hoppes over', async () => {
  for (const lt of [{ navn: 'A', plikter: [{ key: 'a' }] }, { navn: 'B', epost: 'b@b.no', slutt: '2020-01-01', plikter: [{ key: 'a' }] }, { navn: 'C', epost: 'c@c.no', plikter: [] }]) {
    const o = oppsett(lagDb(lt)); await leietakerRunde(o.ctx({ action: 'lt_runde' })); assert.equal(o.sendt.length, 0);
  }
});
