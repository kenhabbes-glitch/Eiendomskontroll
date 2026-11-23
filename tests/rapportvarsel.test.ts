// Rapporter til oppfølging: sammendrag av lesing (uten det firmaet allerede har oppgitt) og daglig påminnelse om rapporter som venter.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lagFalsk, type Db } from './falsk-supabase.ts';
import { renRapport, oppsummerLesing, trengerLesing, rapportVarsel } from '../src/lib/rapportVarselServer.ts';

const nu = Date.now(); const dagerFoer = (n: number) => new Date(nu - n * 864e5).toISOString();
test('renRapport og trengerLesing', () => {
  assert.deepEqual(renRapport(undefined), { pa: false, leseAuto: true, paminnDager: 1, epost: '' }); assert.equal(renRapport({ paminnDager: 99 }).paminnDager, 14);
  assert.equal(trengerLesing({ filer: [{ navn: 'r.pdf' }] }), true); assert.equal(trengerLesing({ filer: [{ navn: 'r.pdf' }], lesing: {} }), false); assert.equal(trengerLesing({ filer: [{ navn: 'bilde.jpg', type: 'image/jpeg' }] }), false); assert.equal(trengerLesing(null), false);
});
test('oppsummerLesing: fjerner det firmaet oppga, finner høy alvorlighet', () => {
  const l = oppsummerLesing([{ tekst: 'Lekkasje ved ventil 3', alv: 'Middels' }, { tekst: 'Brannspjeld stanset – umiddelbar utbedring', alv: 'Kritisk' }, { tekst: 'Filter må byttes', alv: 'Lav' }], ['lekkasje ved ventil 3.'], 'ingen avvik', 'T');
  assert.equal(l.n, 2); assert.equal(l.hoy, true); assert.deepEqual(l.forslag.map(f => f.a), ['Kritisk', 'Lav']); assert.equal(l.lest, 'T');
  assert.equal(oppsummerLesing([], [], '', 'T').hoy, false);
});
const json = (s: number, b: any) => new Response(JSON.stringify(b), { status: s });
const sp = async () => ({ t: (s: any, ...a: any[]) => String(s).replace(/\{(\d)\}/g, (_: any, i: any) => a[+i]) });
const opp = (id: string, mottatt: string, ekstra: any = {}) => ({ id, eiendom_id: 'e1', data: { navn: 'Ventilasjonsservice', innrapport: { mottatt, firma: 'Vent AS', avvik: ['a'], ...ekstra } } });
function kjor(oppgaver: any[], innst: any = { pa: true }) {
  const db: Db = { organisasjoner: [{ id: 'o1', navn: 'Org', aktiv: true }], eiendommer: [{ id: 'e1', eier_org_id: 'o1', data: { navn: 'Bygg A' } }], innstillinger: [{ org_id: 'o1', nokkel: 'rapportVarsel', data: innst }], oppgaver, hendelseslogg: [],
    org_medlem: [{ org_id: 'o1', rolle: 'admin', aktiv: true, profiles: { epost: 'eier@example.no' } }] } as any;
  const sendt: any[] = []; const push: any[] = [];
  const ctx = (body: any, erCron = true) => ({ admin: lagFalsk(db, {}, {}).klient as any, body, json, esc: (s: any) => String(s ?? ''), erCron, hvem: async () => null, sprakFor: sp as any, oppsettFor: async () => ({}), idag: new Date(nu),
    sendEpost: async (til: string, emne: string, _h: string, tekst: string) => { sendt.push({ til, emne, tekst }); return { sendt: true }; }, pushTilOrg: async (_a: any, _o: string, typer: string[], inn: any) => { push.push({ typer, ...inn }); return 1; } });
  return { db, sendt, push, ctx };
}
test('påminnelse: én samlet melding om rapporter som har ventet, med funn fra lesingen, og bare én gang', async () => {
  const k = kjor([opp('a', dagerFoer(2), { lesing: { n: 2, hoy: true } }), opp('b', dagerFoer(0.2)), { id: 'c', eiendom_id: 'e1', data: { navn: 'Ingen rapport' } }]);
  const j = await (await rapportVarsel(k.ctx({ action: 'rapport_paminn' })))!.json(); assert.equal(j.rapport[0].ventende, 1); assert.equal(k.sendt.length, 1); assert.match(k.sendt[0].emne, /1 servicerapport venter/);
  assert.match(k.sendt[0].tekst, /Ventilasjonsservice \(Bygg A\) – Vent AS, 3 avvik · høy alvorlighet/); assert.deepEqual(k.push[0].typer, ['kritisk', 'oversikt']); assert.ok(k.db.oppgaver[0].data.innrapport.paminnet);
  await rapportVarsel(k.ctx({ action: 'rapport_paminn' })); assert.equal(k.sendt.length, 1);
});
test('av som standard, godkjente rapporter ignoreres, og uten signatur nektes', async () => {
  const av = kjor([opp('a', dagerFoer(5))], {}); await rapportVarsel(av.ctx({ action: 'rapport_paminn' })); assert.equal(av.sendt.length, 0);
  const ferdig = kjor([{ id: 'x', eiendom_id: 'e1', data: { navn: 'Ferdig', innrapport: undefined } }]); await rapportVarsel(ferdig.ctx({ action: 'rapport_paminn' })); assert.equal(ferdig.sendt.length, 0);
  assert.equal((await rapportVarsel(av.ctx({ action: 'rapport_paminn' }, false)))!.status, 403);
});
