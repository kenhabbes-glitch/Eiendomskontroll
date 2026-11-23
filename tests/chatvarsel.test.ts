// Chat-varsler: hvem varsles ved nye meldinger, demping per samtale, interne notater, og daglig påminnelse om ubesvarte.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lagFalsk, type Db } from './falsk-supabase.ts';
import { renChatInnst, velgVarsler, ubesvarte, chatVarsel } from '../src/lib/chatVarselServer.ts';

const nu = Date.now(); const minFoer = (n: number) => new Date(nu - n * 6e4).toISOString(); const dagerFoer = (n: number) => new Date(nu - n * 864e5).toISOString();
const m = (id: string, rolle: string, til: string, alder: number, ekstra: any = {}, lt = 'l1', avvik: string | null = null) => ({ id, eiendom_id: 'e1', leietaker_id: lt, avvik_id: avvik, created_at: alder < 1000 ? minFoer(alder) : dagerFoer(alder / 1440), data: { tekst: 'x', rolle, til, synlig: til === 'alle', ...ekstra } });

test('renChatInnst: standardverdier og grenser', () => {
  assert.deepEqual(renChatInnst(undefined), { pa: false, tilLeietaker: true, tilAnsatte: true, ansatteEpost: '', ubesvartDager: 2, paminnelse: true });
  assert.equal(renChatInnst({ ubesvartDager: 99 }).ubesvartDager, 14); assert.equal(renChatInnst({ ubesvartDager: 0 }).ubesvartDager, 1);
});
test('velgVarsler: mottakere etter retning, interne notater varsler ingen, og demping', () => {
  const v = velgVarsler([m('1', 'leietaker', 'alle', 1), m('2', 'utleier', 'alle', 1), m('3', 'utleier', 'intern', 1), m('4', 'utleier', 'ressurs', 1)] as any, nu);
  assert.deepEqual(v.tilAnsatte.map(x => x.id), ['1']); assert.deepEqual(v.tilLeietaker.map(x => x.id), ['2']); assert.deepEqual(v.tilRessurs.map(x => x.id), ['4']); assert.equal(v.dempet, false);
  assert.equal(velgVarsler([m('0', 'leietaker', 'alle', 100, { varslet: minFoer(10) }), m('1', 'leietaker', 'alle', 1)] as any, nu).dempet, true);
  assert.equal(velgVarsler([m('0', 'leietaker', 'alle', 100, { varslet: minFoer(40) }), m('1', 'leietaker', 'alle', 1)] as any, nu).dempet, false);
  assert.equal(velgVarsler([m('1', 'leietaker', 'alle', 60)] as any, nu).nye.length, 0, 'gamle meldinger varsles ikke');
});
test('ubesvarte: kun leietakermeldinger uten senere svar, ikke påminnet, og interne notater teller ikke som svar', () => {
  const l = [m('a', 'leietaker', 'alle', 3 * 1440), m('b', 'leietaker', 'alle', 3 * 1440, {}, 'l2'), m('c', 'utleier', 'alle', 2 * 1440, {}, 'l2'), m('d', 'leietaker', 'alle', 1440), m('e', 'leietaker', 'alle', 5 * 1440, { paminnet: 'x' }, 'l3'), m('f', 'leietaker', 'alle', 4 * 1440, {}, 'l4'), m('g', 'utleier', 'intern', 3 * 1440, {}, 'l4')];
  assert.deepEqual(ubesvarte(l as any, nu, 2).map(x => x.id).sort(), ['a', 'f']);
});

const json = (s: number, b: any) => new Response(JSON.stringify(b), { status: s });
const sp = async () => ({ t: (s: any, ...a: any[]) => String(s).replace(/\{(\d)\}/g, (_: any, i: any) => a[+i]) });
function kjor(meldinger: any[], innst: any = { pa: true }, profil: any = { id: 'u1', aktiv: true, rolle: 'admin' }) {
  const db: Db = { organisasjoner: [{ id: 'o1', navn: 'Org', aktiv: true }], eiendommer: [{ id: 'e1', eier_org_id: 'o1', data: { navn: 'Bygg A' } }], innstillinger: [{ org_id: 'o1', nokkel: 'chatVarsel', data: innst }],
    leietakere: [{ id: 'l1', eiendom_id: 'e1', data: { navn: 'Kafé AS', epost: 'kafe@lt.no' } }, { id: 'l2', eiendom_id: 'e1', data: { navn: 'Frisør' } }], meldinger, meldingsdeltakere: [{ eiendom_id: 'e1', leietaker_id: 'l1', bruker_id: 'vm' }],
    profiles: [{ id: 'p9', epost: 'portal@lt.no', rolle: 'leietaker', leietaker_id: 'l1', aktiv: true }], hendelseslogg: [],
    org_medlem: [{ org_id: 'o1', rolle: 'admin', aktiv: true, profiles: { epost: 'eier@example.no' } }] } as any;
  const sendt: any[] = []; const push: any[] = [];
  const ctx = (body: any, erCron = false) => ({ admin: lagFalsk(db, {}, {}).klient as any, body, json, esc: (s: any) => String(s ?? ''), erCron, hvem: async () => profil, harEiendom: async () => profil.rolle !== 'leietaker', sprakFor: sp as any, oppsettFor: async () => ({}),
    sendEpost: async (til: string, emne: string, _h: string, tekst: string) => { sendt.push({ til, emne, tekst }); return { sendt: true }; },
    pushTilOrg: async (_a: any, _o: string, typer: string[], inn: any) => { push.push({ typer, ...inn }); return 1; }, pushTilBrukere: async (_a: any, ids: string[], typer: string[], inn: any) => { push.push({ ids, typer, ...inn }); return ids.length; } });
  return { db, sendt, push, ctx };
}
const kall = (k: any, body: any = { eiendom_id: 'e1', leietaker_id: 'l1' }) => chatVarsel(k.ctx({ action: 'chat_varsel', ...body }));

test('leietaker skriver: push og e-post til ansatte, markert varslet, og ny melding rett etter dempes', async () => {
  const k = kjor([m('1', 'leietaker', 'alle', 1)], { pa: true }, { id: 'p9', aktiv: true, rolle: 'leietaker', leietaker_id: 'l1' });
  const j = await (await kall(k))!.json(); assert.equal(j.push, 1); assert.equal(j.epost, 1); assert.equal(k.sendt[0].til, 'eier@example.no'); assert.deepEqual(k.push[0].typer, ['melding']); assert.ok(k.db.meldinger[0].data.varslet);
  k.db.meldinger.push(m('2', 'leietaker', 'alle', 0)); const j2 = await (await kall(k))!.json(); assert.equal(j2.dempet, true); assert.equal(k.sendt.length, 1); assert.equal(k.db.meldinger[1].data.varslet, 'dempet');
});
test('utleier svarer: e-post til leietaker (kontakt og portalbruker) uten meldingstekst; intern notat gir ingenting', async () => {
  const k = kjor([m('1', 'utleier', 'alle', 1, { tekst: 'HEMMELIG INNHOLD' })]); const j = await (await kall(k))!.json(); assert.equal(j.epost, 2); assert.deepEqual(k.sendt.map(s => s.til).sort(), ['kafe@lt.no', 'portal@lt.no']); assert.ok(k.sendt.every(s => !/HEMMELIG/.test(s.tekst)));
  const i = kjor([m('1', 'utleier', 'intern', 1)]); const ji = await (await kall(i))!.json(); assert.equal(ji.sendt, 0); assert.equal(i.sendt.length, 0); assert.equal(i.push.length, 0);
});
test('til ressurs: push til de som er koblet på, ikke til avsender', async () => {
  const k = kjor([m('1', 'utleier', 'ressurs', 1)]); const j = await (await kall(k))!.json(); assert.equal(j.push, 1); assert.deepEqual(k.push[0].ids, ['vm']); assert.equal(k.sendt.length, 0);
});
test('av som standard, og tilgang kontrolleres', async () => {
  const av = kjor([m('1', 'leietaker', 'alle', 1)], {}); const j = await (await kall(av))!.json(); assert.equal(j.sendt, 0); assert.equal(av.sendt.length, 0); assert.equal(av.db.meldinger[0].data.varslet, 'av');
  const fremmed = kjor([m('1', 'leietaker', 'alle', 1)], { pa: true }, { id: 'p8', aktiv: true, rolle: 'leietaker', leietaker_id: 'l2' }); assert.equal((await kall(fremmed))!.status, 403);
  const uinnlogget = kjor([], { pa: true }, null); assert.equal((await kall(uinnlogget))!.status, 401);
});
test('daglig påminnelse: én samlet melding, én gang, og bare med cron-signatur', async () => {
  const k = kjor([m('a', 'leietaker', 'alle', 3 * 1440), m('b', 'leietaker', 'alle', 3 * 1440, {}, 'l2'), m('c', 'utleier', 'alle', 2 * 1440, {}, 'l2')]);
  const j = await (await chatVarsel(k.ctx({ action: 'chat_varsel_dag' }, true)))!.json(); assert.equal(j.rapport[0].ubesvarte, 1); assert.equal(k.sendt.length, 1); assert.match(k.sendt[0].tekst, /Kafé AS \(Bygg A\): 1/); assert.equal(k.push.length, 1); assert.ok(k.db.meldinger[0].data.paminnet);
  await chatVarsel(k.ctx({ action: 'chat_varsel_dag' }, true)); assert.equal(k.sendt.length, 1);
  assert.equal((await chatVarsel(k.ctx({ action: 'chat_varsel_dag' }, false)))!.status, 403);
});
