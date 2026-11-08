// Capex-rapport / langtidsvedlikehold: utskiftingsbehov per år, bygningsdel, tilstand og konsekvens for en valgfri periode.
// Samme beregning som Vedlikeholdsplan: systemet skiftes med sentralkost + komponenter i systemets år; komponenter med
// egen kortere levetid skiftes i sitt eget år. Etterslep (passert levetid) og TG3 legges i inneværende år.
import { S } from './store';
import { AV_LUKKET, KOMP, TYPE_TAGGER } from './catalog';
import { YEAR, aNavn, byId, compYear, egetAar, kNavn, kostJustert, kostNaa, kpiInnst, naaverdi, renteInnst, sysKomp, type Rec } from './utils';
import { lokale } from './i18n';

export const KATEGORI: [string, string, string][] = [
  ['2', 'Bygning', '#1f4e79'], ['3', 'VVS', '#5aa0d6'], ['4', 'Elektro', '#c9792a'], ['5', 'Tele og automatisering', '#7b5ea7'],
  ['6', 'Andre installasjoner', '#8c9690'], ['7', 'Utendørs', '#5f8f45'], ['?', 'Uten kategori', '#c8ccc6'],
];
export const TG_FARGE: Record<string, string> = { TG0: '#2f7d4f', TG1: '#86b36a', TG2: '#d08a2c', TG3: '#b42318', TGIU: '#9aa39d' };
export const TGER = ['TG0', 'TG1', 'TG2', 'TG3', 'TGIU']; export const KGER = ['KG1', 'KG2', 'KG3'];

export type Post = { id: string; navn: string; sys: Rec; k: boolean; y: number; kost: number; nv: number; late: boolean; tg: string; kg: string; kat: string; ansvar: string; aar: string; levetid: string; grunnlag: string; brann: boolean };
export type Valg = { eid: string; fra: number; aar: number; pris: 'justert' | 'dagens'; leietaker: boolean };

const katFor = (a: Rec) => { const s = String(a.tfmSys || '')[0]; if (s && '234567'.includes(s)) return s; const g = String(KOMP[a.type]?.g || '')[0]; return g && '234567'.includes(g) ? g : '?'; };
export const katFarge = (k: string) => KATEGORI.find(x => x[0] === k)?.[2] || '#c8ccc6';

export function poster(v: Valg): { P: Post[]; ute: { utenAar: Rec[]; utenKost: Post[]; utenTg: number; foer: number } } {
  const pj = v.pris !== 'dagens'; const til = v.fra + v.aar - 1;
  let A = S.anlegg.filter(a => !a.arkivert && (!v.eid || a.eiendomId === v.eid)); if (!v.leietaker) A = A.filter(a => (a.ansvar || 'Eier') !== 'Leietaker');
  const planAar = (o: Rec) => { let y = compYear(o); if (o.tg === 'TG3') y = Math.min(y || YEAR, YEAR); if (y !== null && y < YEAR) y = YEAR; return y; };
  const kost = (o: Rec, y: number | null) => pj ? kostJustert(o, y) : kostNaa(o);
  const grunn = (o: Rec, late: boolean) => o.tg === 'TG3' ? 'TG3' : late ? 'Passert levetid' : o.planAar ? 'Planlagt år' : o.tg === 'TG2' ? 'Levetid · TG2' : 'Levetid';
  const P: Post[] = []; let foer = 0;
  const legg = (o: Rec, sys: Rec, erK: boolean, y: number | null, k: number, nvBelop: number) => {
    if (y === null) return; if (y > til) return; if (y < v.fra) { foer += k; return; }
    const cy = compYear(o); const late = cy !== null && cy < YEAR; const tg = o.tg || sys.tg || 'TGIU';
    P.push({ id: o.id, navn: erK ? kNavn(o.id) : aNavn(o.id), sys, k: erK, y, kost: Math.round(k), nv: Math.round(naaverdi(nvBelop, y)), late, tg: ['TG0', 'TG1', 'TG2', 'TG3'].includes(tg) ? tg : 'TGIU', kg: o.kg || sys.kg || '', kat: katFor(sys), ansvar: sys.ansvar || 'Eier',
      aar: o.aar || '', levetid: String(o.levetid || KOMP[o.type]?.l || ''), grunnlag: grunn(o, late), brann: (TYPE_TAGGER[sys.type] || []).includes('Brann') });
  };
  for (const a of A) { const y = planAar(a); const ks = sysKomp(a);
    legg(a, a, false, y, kost(a, y) + ks.reduce((s, k) => s + kost(k, y), 0), kostJustert(a, y) + ks.reduce((s, k) => s + kostJustert(k, y), 0));
    ks.filter(k => egetAar(k)).forEach(k => { const ky = planAar(k); if (ky === null || (y !== null && ky >= y)) return; legg(k, a, true, ky, kost(k, ky), kostJustert(k, ky)); }); }
  return { P, ute: { utenAar: A.filter(a => compYear(a) === null), utenKost: P.filter(p => !p.kost), utenTg: P.filter(p => p.tg === 'TGIU').length, foer } };
}

export type Capex = ReturnType<typeof capex>;
export function capex(v: Valg) {
  const { P, ute } = poster(v); const years: number[] = []; for (let y = v.fra; y < v.fra + v.aar; y++) years.push(y);
  const sum = (L: Post[]) => L.reduce((s, p) => s + p.kost, 0);
  const tot = sum(P); const perAar = years.map(y => sum(P.filter(p => p.y === y)));
  const kat = KATEGORI.map(([k, n, c]) => ({ k, n, c, sum: sum(P.filter(p => p.kat === k)), perAar: years.map(y => sum(P.filter(p => p.kat === k && p.y === y))) })).filter(x => x.sum > 0 || P.some(p => p.kat === x.k));
  // Intervaller: 0–5, 6–10, 11–N (bare de som finnes i perioden)
  const sp: [string, number, number][] = v.aar <= 5 ? [[`${v.fra}–${v.fra + v.aar - 1}`, 0, v.aar]] : v.aar <= 10 ? [['1–5 år', 0, 5], [`6–${v.aar} år`, 5, v.aar]] : [['1–5 år', 0, 5], ['6–10 år', 5, 10], [`11–${v.aar} år`, 10, v.aar]];
  const korteste = Math.min(5, v.aar); const kort = P.filter(p => p.y < v.fra + korteste);
  const tgKat = kat.map(x => ({ ...x, tg: TGER.map(t => sum(kort.filter(p => p.kat === x.k && p.tg === t))) }));
  const mx: Record<string, { n: number; s: number }> = {}; for (const p of kort) { const kg = KGER.includes(p.kg) ? p.kg : 'KG?'; const c = (mx[p.tg + '|' + kg] ||= { n: 0, s: 0 }); c.n++; c.s += p.kost; }
  const ett = P.filter(p => p.late || p.tg === 'TG3');
  const avvikFor = (ids: string[]) => S.avvik.filter(a => !AV_LUKKET.includes(a.status) && ids.includes(a.anleggId));
  const ettAvvik = avvikFor(ett.map(p => p.sys.id));
  const toppAar = years[perAar.indexOf(Math.max(...perAar))]; const toppPoster = P.filter(p => p.y === toppAar).sort((a, b) => b.kost - a.kost).slice(0, 3);
  const prosj = S.prosjekter.filter(p => !['Avbrutt'].includes(p.status) && p.status !== 'Ferdigstilt' && (!v.eid || p.eiendomId === v.eid));
  const prosjRader = prosj.map(p => { const dekker = P.filter(x => x.sys.id === p.gammeltSystemId); return { p, dekker }; }).filter(x => x.dekker.length || x.p.type === 'Utskifting av system' || x.p.type === 'Rehabilitering');
  return {
    v, years, P, tot, perAar, kat, sp: sp.map(([n, a, b]) => ({ n, a, b, perKat: kat.map(x => x.perAar.slice(a, b).reduce((s, y) => s + y, 0)), sum: perAar.slice(a, b).reduce((s, y) => s + y, 0) })),
    korteste, kort, kortSum: sum(kort), tgKat, mx, ett, ettSum: sum(ett), ettAvvik, toppAar, toppPoster,
    nv: P.reduce((s, p) => s + p.nv, 0), rente: renteInnst(), kpi: kpiInnst(),
    eier: sum(P.filter(p => p.ansvar !== 'Leietaker')), leietaker: sum(P.filter(p => p.ansvar === 'Leietaker')), brann: sum(P.filter(p => p.brann)),
    ute, prosjRader, antallSys: new Set(P.map(p => p.sys.id)).size,
  };
}

export function hovedfunn(c: Capex): string[] {
  const f: string[] = []; const m = (n: number) => mnok(n) + ' MNOK';
  if (c.ett.length) f.push(`${c.v.fra === YEAR ? 'Første år' : String(YEAR)} er tungt (${m(c.perAar[0])}) fordi etterslep og TG3 legges i inneværende år: ${c.ett.slice(0, 3).map(p => p.navn).join(', ')}${c.ett.length > 3 ? ' m.fl.' : ''}.`);
  if (c.toppAar && c.perAar.length > 1) f.push(`Toppåret er ${c.toppAar} (${m(Math.max(...c.perAar))}), drevet av ${c.toppPoster.map(p => p.navn).join(', ')}. Vurder om noe kan fordeles over flere år.`);
  const st = [...c.kat].sort((a, b) => b.sum - a.sum).slice(0, 2); if (c.tot && st.length) f.push(`${st.map(x => x.n).join(' og ')} utgjør ${Math.round(st.reduce((s, x) => s + x.sum, 0) / c.tot * 100)} % av behovet i perioden.`);
  const mangl = c.ute.utenKost.length + c.ute.utenAar.length; if (mangl) f.push(`${c.ute.utenKost.length ? c.ute.utenKost.length + ' tiltak mangler kostnadsestimat' : ''}${c.ute.utenKost.length && c.ute.utenAar.length ? ' og ' : ''}${c.ute.utenAar.length ? c.ute.utenAar.length + ' systemer mangler installasjonsår/levetid' : ''} – tallene er trolig for lave.`);
  if (c.ute.foer) f.push(`${m(c.ute.foer)} i etterslep og tiltak før ${c.v.fra} er ikke med i perioden.`);
  return f;
}
export const mnok = (n: number) => (n / 1e6).toLocaleString(lokale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const knok = (n: number) => Math.round(n / 1e3).toLocaleString(lokale());

// Øyeblikksbilde for «endringer siden forrige rapport»
export const snapshot = (c: Capex) => ({ v: c.v, tot: c.tot, kort: c.kortSum, poster: c.P.slice(0, 600).map(p => [p.id, p.y, p.kost, p.tg]) });
export function endringer(c: Capex, forrige?: Rec | null) {
  if (!forrige?.poster) return null; const gml = new Map<string, any[]>(forrige.poster.map((x: any[]) => [x[0], x])); const nye = new Map(c.P.map(p => [p.id, p]));
  const L: { t: string; d: number }[] = []; const grense = c.v.fra + c.korteste;
  for (const p of c.P) { const g = gml.get(p.id);
    if (!g) { if (p.y < grense) L.push({ t: `Nytt i perioden: ${p.navn} (${p.y})`, d: p.kost }); continue; }
    if (g[3] !== p.tg) L.push({ t: `${p.navn}: ${g[3]} → ${p.tg}${g[1] !== p.y ? `, flyttet ${g[1]} → ${p.y}` : ''}`, d: (p.y < grense ? p.kost : 0) - (g[1] < grense ? g[2] : 0) });
    else if (g[1] !== p.y) L.push({ t: `${p.navn}: flyttet ${g[1]} → ${p.y}`, d: (p.y < grense ? p.kost : 0) - (g[1] < grense ? g[2] : 0) });
    else if (Math.abs(g[2] - p.kost) > Math.max(20000, g[2] * 0.1)) L.push({ t: `${p.navn}: nytt kostnadsestimat`, d: p.y < grense ? p.kost - g[2] : 0 }); }
  for (const [id, g] of gml) if (!nye.has(id)) { const s = byId('anlegg', id) || byId('komponenter', id); L.push({ t: `Ute av planen: ${s ? (s.navn || id) : 'slettet/utskiftet system'}`, d: g[1] < grense ? -g[2] : 0 }); }
  return { L: L.sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 12), totDelta: c.tot - (forrige.tot || 0), kortDelta: c.kortSum - (forrige.kort || 0), dato: forrige._dato, periode: forrige.v ? `${forrige.v.fra}–${forrige.v.fra + forrige.v.aar - 1}` : '' };
}
