// Levetidsvarsler: poster, kostnad (KPI), haste én gang, kvartalsoversikt én gang per kvartal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lagFalsk, type Db } from './falsk-supabase.ts';
import { renInvest, kvartalsDag, kpiFaktor, byggPoster, nyeHaster, iHorisont, investVarsel } from '../src/lib/investVarselServer.ts';

test('renInvest og kvartalsDag', () => {
  assert.deepEqual(renInvest(undefined), { pa: false, aar: 2, haste: true, epost: '', sistKvartal: '' }); assert.equal(renInvest({ aar: 99 }).aar, 5);
  assert.equal(kvartalsDag(new Date('2026-10-05T06:00:00Z')), '2026-K4'); assert.equal(kvartalsDag(new Date('2027-01-04T06:00:00Z')), '2027-K1');
  assert.equal(kvartalsDag(new Date('2026-10-12T06:00:00Z')), null); assert.equal(kvartalsDag(new Date('2026-11-02T06:00:00Z')), null); assert.equal(kvartalsDag(new Date('2026-10-06T06:00:00Z')), null);
});
test('kpiFaktor: fast 3 % og årsvise verdier', () => {
  assert.ok(Math.abs(kpiFaktor({}, 2026, 2028) - 1.0609) < 1e-9); assert.ok(Math.abs(kpiFaktor({ modus: 'aar', fast: 3, aar: { '2027': 5 } }, 2026, 2028) - 1.05 * 1.03) < 1e-9); assert.equal(kpiFaktor({}, 2026, 2026), 1);
});
const sys = (id: string, d: any) => ({ id, eiendom_id: 'e1', data: d }); const komp = (id: string, sid: string, d: any) => ({ id, eiendom_id: 'e1', system_id: sid, data: d });
test('byggPoster: standardlevetid, komponent følger systemet, egen levetid for seg, arkiverte ute, datahull telles', () => {
  const S = [sys('s1', { type: 'vent', navn: 'Ventilasjon', aar: 2000, kost: 1000000, kostAar: 2026, tg: 'TG2' }), sys('s2', { navn: 'Tak', planAar: 2030, kost: 500000 }), sys('s3', { navn: 'Gammel', arkivert: true }), sys('s4', { navn: 'Uten data' })];
  const K = [komp('k1', 's1', { navn: 'Vifte', kost: 100000, kostAar: 2026 }), komp('k2', 's1', { navn: 'Filter', aar: 2020, levetid: 3, kost: 10000, kostAar: 2026 })];
  const { poster, hull } = byggPoster(S, K, { e1: 'Bygg A' }, {}, 2026, t => t === 'vent' ? 25 : 0);
  assert.equal(poster.length, 4); const v = poster.find(p => p.id === 's1')!; assert.equal(v.y, 2025); assert.equal(v.etterslep, true); assert.equal(v.kost, Math.round(1100000 * 1), 'vifte følger systemet, filter egen post'); assert.equal(v.eiendom, 'Bygg A');
  const f = poster.find(p => p.id === 'k2')!; assert.equal(f.y, 2023); assert.equal(f.tabell, 'komponenter'); assert.deepEqual(hull, { utenAar: 1, utenKost: 1, utenTg: 2 });
  assert.equal(iHorisont(poster.find(p => p.id === 's2')!, 2026, 2), false); assert.equal(iHorisont(poster.find(p => p.id === 's2')!, 2026, 5), true);
});
test('nyeHaster: bare det som ikke er varslet for samme grunn', () => {
  const P: any[] = [{ id: 'a', tg: 'TG3', etterslep: false, haste: null }, { id: 'b', tg: '', etterslep: true, haste: 'etterslep' }, { id: 'c', tg: '', etterslep: true, haste: null }, { id: 'd', tg: 'TG1', etterslep: false, haste: null }];
  assert.deepEqual(nyeHaster(P).map(x => x.p.id + ':' + x.kode), ['a:TG3', 'c:etterslep']);
});

const json = (s: number, b: any) => new Response(JSON.stringify(b), { status: s });
const sp = async () => ({ t: (s: any, ...a: any[]) => String(s).replace(/\{(\d)\}/g, (_: any, i: any) => a[+i]) });
function kjor(idag: string, innst: any = { pa: true }) {
  const db: Db = { organisasjoner: [{ id: 'o1', navn: 'Org', aktiv: true }], eiendommer: [{ id: 'e1', eier_org_id: 'o1', data: { navn: 'Bygg A' } }], innstillinger: [{ org_id: 'o1', nokkel: 'investVarsel', data: innst }],
    systemer: [sys('s1', { type: 'vent', navn: 'Ventilasjon', aar: 2000, kost: 1000000, kostAar: 2026 }), sys('s2', { navn: 'Tak', aar: 2020, levetid: 40, kost: 800000, kostAar: 2026, tg: 'TG3' })], komponenter: [], hendelseslogg: [],
    org_medlem: [{ org_id: 'o1', rolle: 'admin', aktiv: true, profiles: { epost: 'eier@example.no' } }] } as any;
  const sendt: any[] = []; const push: any[] = [];
  const ctx = (body: any, erCron = true) => ({ admin: lagFalsk(db, {}, {}).klient as any, body, json, esc: (s: any) => String(s ?? ''), erCron, hvem: async () => null, sprakFor: sp as any, oppsettFor: async () => ({}), levetidFor: (t: string) => t === 'vent' ? 25 : 0, idag: new Date(idag + 'T06:00:00Z'),
    sendEpost: async (til: string, emne: string, _h: string, tekst: string) => { sendt.push({ til, emne, tekst }); return { sendt: true }; }, pushTilOrg: async (_a: any, _o: string, _t: string[], inn: any) => { push.push(inn); return 1; } });
  return { db, sendt, push, ctx };
}
test('jobb en vanlig dag: haste-push én gang, ingen e-post', async () => {
  const k = kjor('2026-11-24'); const j = await (await investVarsel(k.ctx({ action: 'invest_varsel' })))!.json(); assert.equal(j.rapport[0].haste, 2); assert.equal(k.push.length, 1); assert.equal(k.sendt.length, 0);
  assert.equal(k.db.systemer[0].data.investHaste, 'etterslep'); assert.equal(k.db.systemer[1].data.investHaste, 'TG3');
  await investVarsel(k.ctx({ action: 'invest_varsel' })); assert.equal(k.push.length, 1, 'ikke varslet på nytt');
});
test('kvartalsdag: oversikt på e-post én gang, med datahull og kostnad', async () => {
  const k = kjor('2026-10-05'); const j = await (await investVarsel(k.ctx({ action: 'invest_varsel' })))!.json(); assert.equal(j.rapport[0].kvartal, true); assert.equal(k.sendt.length, 1); assert.equal(k.sendt[0].til, 'eier@example.no');
  assert.match(k.sendt[0].tekst, /2 utskiftinger/); assert.match(k.sendt[0].tekst, /Ventilasjon \(Bygg A\)/); assert.match(k.sendt[0].tekst, /mangler kostnad|mangler tilstandsgrad/); assert.equal(k.db.innstillinger[0].data.sistKvartal, '2026-K4');
  await investVarsel(k.ctx({ action: 'invest_varsel' })); assert.equal(k.sendt.length, 1);
});
test('av som standard, og uten signatur nektes', async () => {
  const av = kjor('2026-10-05', {}); await investVarsel(av.ctx({ action: 'invest_varsel' })); assert.equal(av.sendt.length, 0); assert.equal(av.push.length, 0);
  assert.equal((await investVarsel(av.ctx({ action: 'invest_varsel' }, false)))!.status, 403);
});
