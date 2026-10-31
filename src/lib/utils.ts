import { KOMP, TFM_KODER, AV_LUKKET } from './catalog';
import { S } from './store';

export type Rec = { id: string; [k: string]: any };

export const iso = (d: Date) => { const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 10); };
export const today = () => iso(new Date());
export const YEAR = new Date().getFullYear();
export function addInt(s: string, i?: { n?: number; enhet?: string }) {
  if (!s) return '';
  const d = new Date(s + 'T12:00:00'); const n = +(i?.n || 1); const e = i?.enhet || 'år';
  if (e === 'uke') d.setDate(d.getDate() + 7 * n); else if (e === 'mnd') d.setMonth(d.getMonth() + n); else d.setFullYear(d.getFullYear() + n);
  return iso(d);
}
export function addDays(s: string, n: number) { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return iso(d); }
export function dUntil(s?: string): number | null { if (!s) return null; return Math.round((new Date(s + 'T12:00:00').getTime() - new Date(today() + 'T12:00:00').getTime()) / 864e5); }
export function fd(s?: string) { if (!s) return '–'; const [y, m, d] = s.slice(0, 10).split('-'); return `${d}.${m}.${y}`; }
export function fdt(s?: string) { if (!s) return '–'; return new Date(s).toLocaleString('nb-NO', { dateStyle: 'short', timeStyle: 'short' }); }
export function intTxt(i?: { n?: number; enhet?: string }) {
  if (!i) return '–'; const n = +(i.n || 1);
  if (i.enhet === 'uke') return n === 1 ? 'Ukentlig' : `Hver ${n}. uke`;
  if (i.enhet === 'mnd') return n === 1 ? 'Månedlig' : n === 12 ? 'Årlig' : `Hver ${n}. mnd`;
  return n === 1 ? 'Årlig' : `Hvert ${n}. år`;
}
export const nok = (n: any) => (n || n === 0) && n !== '' ? new Intl.NumberFormat('nb-NO').format(Math.round(+n)) + ' kr' : '–';
export const knok = (v: any) => { const n = +v || 0; if (n >= 1e6) return (n / 1e6).toLocaleString('nb-NO', { maximumFractionDigits: 1 }) + ' mill'; if (n >= 1e3) return Math.round(n / 1e3) + ' k'; return String(Math.round(n)); };
export const uid = () => crypto.randomUUID();
export const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o ?? null));
export const pad = (n: any, l = 3) => (n === '' || n == null ? '' : String(n).padStart(l, '0'));
export const sortBy = <T,>(arr: T[], f: (x: T) => any) => arr.slice().sort((a, b) => { const x = f(a), y = f(b); return x < y ? -1 : x > y ? 1 : 0; });
export const m2 = (v: any) => v == null || isNaN(v) ? '–' : (+v).toLocaleString('nb-NO', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' m²';

// ---- oppslag
export const byId = (col: keyof typeof S, id?: string): Rec | undefined => id ? (S[col] as Rec[]).find(x => x.id === id) : undefined;
export const eNavn = (id?: string) => byId('eiendommer', id)?.navn || '–';
export const lNavn = (id?: string) => byId('leietakere', id)?.navn || '';
export function tfmSys(a?: Rec, full?: boolean) {
  if (!a || !a.tfmSys) return '';
  const e = full ? byId('eiendommer', a.eiendomId) : undefined;
  return `${e?.tfmBygg ? '+' + e.tfmBygg : ''}=${a.tfmSys}.${pad(a.tfmLop || 1)}`;
}
export function tfmKomp(k: Rec, full?: boolean) {
  const a = byId('anlegg', k.anleggId);
  return `${a ? tfmSys(a, full) : ''}-${(k.kode || '').toUpperCase()}${pad(k.lop || 1)}${k.typekode ? '%' + k.typekode : ''}`;
}
export const aNavn = (id?: string) => { const a = byId('anlegg', id); if (!a) return ''; const t = tfmSys(a); return (t ? t + ' ' : '') + (a.navn || KOMP[a.type]?.n || 'System'); };
export const kNavn = (id?: string) => { const k = byId('komponenter', id); if (!k) return ''; return tfmKomp(k) + ' ' + (k.navn || TFM_KODER.find(c => c[0] === (k.kode || '').toUpperCase())?.[1] || ''); };
export function nextSysLop(eid: string, sys: string, skip?: string) { const l = S.anlegg.filter(a => a.eiendomId === eid && a.tfmSys === sys && a.id !== skip).map(a => +a.tfmLop || 0); return pad(Math.max(0, ...l) + 1); }
export function nextKompLop(aid: string, kode: string, skip?: string) { const l = S.komponenter.filter(k => k.anleggId === aid && (k.kode || '').toUpperCase() === (kode || '').toUpperCase() && k.id !== skip).map(k => +k.lop || 0); return pad(Math.max(0, ...l) + 1); }

export const activeTasks = () => S.oppgaver.filter(o => o.aktiv !== false);
export const openAvvik = () => S.avvik.filter(a => !AV_LUKKET.includes(a.status));
export function compYear(a: Rec): number | null { if (a.planAar) return +a.planAar; const b = +a.aar || 0; const l = +a.levetid || KOMP[a.type]?.l || 0; return b && l ? b + l : null; }
// ---- KPI / prisjustering (innstilling «kpi»: { modus: 'fast' | 'aar', fast: 3, aar: { '2027': 2.8, ... } })
export const KPI_STANDARD = 3;
export function kpiInnst() { const k = S.innst?.kpi || {}; return { modus: k.modus === 'aar' ? 'aar' : 'fast', fast: k.fast === '' || k.fast == null || isNaN(+k.fast) ? KPI_STANDARD : +k.fast, aar: (k.aar || {}) as Record<string, number> }; }
export function kpiFor(y: number) { const k = kpiInnst(); if (k.modus === 'aar') { const v = k.aar[String(y)]; if (v !== undefined && v !== null && String(v) !== '' && !isNaN(+v)) return +v; } return k.fast; }
/** Faktor for å prisjustere fra prisnivå i år «fra» til år «til» */
export function kpiFaktor(fra: number, til: number) { let f = 1; for (let y = fra + 1; y <= til; y++) f *= 1 + kpiFor(y) / 100; return f; }
export const kostAarFor = (a: Rec) => +a.kostAar || YEAR;
/** Prisjustert kostnad i utskiftingsåret (etterslep regnes til inneværende år) */
export function kostJustert(a: Rec, aar?: number | null) { const k = +a.kost || 0; if (!k) return 0; const y = Math.max(aar ?? compYear(a) ?? YEAR, YEAR); return k * kpiFaktor(kostAarFor(a), y); }
/** Kostnad indeksregulert fra prisnivååret til inneværende år */
export function kostNaa(a: Rec) { const k = +a.kost || 0; if (!k) return 0; const f = kostAarFor(a); return f < YEAR ? k * kpiFaktor(f, YEAR) : k; }
export function kostTip(a: Rec) { const f = kostAarFor(a); return f < YEAR ? `Anslått ${nok(a.kost)} i ${f}-kroner, indeksregulert til ${YEAR}` : `Anslått i ${f}-kroner`; }
// ---- System = sentralkost (på systemet) + sum av komponentenes kostnader
export const sysKomp = (a: Rec) => S.komponenter.filter(k => k.anleggId === a.id);
/** Komponenten har egen levetid/utskiftingsår (ellers følger den systemet) */
export const egetAar = (k: Rec) => !!(+k.planAar || (+k.aar && +k.levetid));
export function kompAar(k: Rec): number | null { if (egetAar(k)) return compYear(k); const a = byId('anlegg', k.anleggId); return a ? compYear(a) : null; }
/** Kostnad i dag for hele systemet: sentralkost + alle komponenter */
export function sysKostNaa(a: Rec) { const ks = sysKomp(a).filter(k => +k.kost > 0); const sentral = kostNaa(a); const komp = ks.reduce((s, k) => s + kostNaa(k), 0); return { sentral, komp, n: ks.length, tot: sentral + komp }; }
/** Prisjustert kostnad for hele systemet i utskiftingsåret (alle komponenter skiftes sammen med systemet) */
export function sysKostUtskift(a: Rec, aar?: number | null) { const y = aar ?? compYear(a); if (!y) return 0; return kostJustert(a, y) + sysKomp(a).reduce((s, k) => s + kostJustert(k, y), 0); }
export function sysKostTip(a: Rec) { const c = sysKostNaa(a); return c.n ? `Sentralkost ${nok(c.sentral)} + ${c.n} komponenter ${nok(c.komp)} (${YEAR}-kroner)` : kostTip(a); }
export function beregnetAar(a: Rec) { const b = +a.aar || 0; const l = +a.levetid || KOMP[a.type]?.l || 0; return b && l ? b + l : null; }
export function compRest(a: Rec) { const y = compYear(a); return y === null ? null : y - YEAR; }
export function pliktStatus(p: Rec): { c: string; t: string; o: number; nx?: string } {
  if (p.ikkeRelevant) return { c: '', t: 'Ikke relevant', o: 0 };
  if (!p.sist) return { c: 'red', t: 'Ikke bekreftet', o: 3 };
  const nx = addInt(p.sist, p.frekvens || { n: 1, enhet: 'år' }); const d = dUntil(nx)!;
  if (d < 0) return { c: 'red', t: 'Forfalt', o: 2, nx }; if (d <= 30) return { c: 'amber', t: 'Fornyes snart', o: 1, nx }; return { c: 'green', t: 'OK', o: 0, nx };
}
export function taskFromMal(k: string, MALER: any, eiendomId: string, anleggId: string, frist: string) {
  const m = MALER[k];
  return { malKey: k, eiendomId, anleggId: anleggId || '', navn: m.n, kategori: m.k, type: m.t, hjemmel: m.h, intervall: { n: m.i[0], enhet: m.i[1] }, utfores: m.u, ansvar: 'Eier', nesteFrist: frist, aktiv: true, historikk: [] };
}

// ---- arealer
export const AREAL_KAT: [string, string][] = [['leie', 'Leieareal (leietaker)'], ['ledig', 'Ledig / utleibart'], ['felles_etg', 'Fellesareal – fordeles i etasjen'], ['felles_bygg', 'Fellesareal – fordeles på hele bygget'], ['ikke', 'Ikke utleibart (teknisk, sjakt, eier)']];
export const KAT_FARGE: Record<string, string> = { ledig: '#2457a6', felles_etg: '#b07a00', felles_bygg: '#b54708', ikke: '#6b736d' };
const LT_FARGE = ['#1f6f5c', '#7b3fa0', '#0e7490', '#a2456b', '#5b6b00', '#9a5b00', '#3d5a99', '#b42318'];
export function polyArea(p: number[][]) { let s = 0; for (let i = 0; i < p.length; i++) { const [a, b] = p[i], [c, d] = p[(i + 1) % p.length]; s += a * d - c * b; } return Math.abs(s) / 2; }
export function mpp(t?: Rec) { const k = t?.skala; if (!k || !k.m || !k.a || !k.b) return null; const d = Math.hypot(k.b[0] - k.a[0], k.b[1] - k.a[1]); return d ? k.m / d : null; }
export function zoneArea(t: Rec, z: Rec) { const r = mpp(t); return r && z.pts && z.pts.length > 2 ? polyArea(z.pts) * r * r : null; }
export function centroid(p: number[][]) { let a = 0, cx = 0, cy = 0; for (let i = 0; i < p.length; i++) { const [x0, y0] = p[i], [x1, y1] = p[(i + 1) % p.length]; const f = x0 * y1 - x1 * y0; a += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f; } if (Math.abs(a) < 1e-9) return p[0]; a /= 2; return [cx / (6 * a), cy / (6 * a)]; }
export function ltColor(eid: string, lid: string) { const L = sortBy(S.leietakere.filter(l => l.eiendomId === eid), l => l.navn).map(l => l.id); const i = L.indexOf(lid); return i < 0 ? '#1f6f5c' : LT_FARGE[i % LT_FARGE.length]; }
export function zoneColor(t: Rec, z: Rec) { return z.kat === 'leie' ? ltColor(t.eiendomId, z.leietakerId) : KAT_FARGE[z.kat] || '#6b736d'; }
export function arealCalc(eid: string) {
  const T = S.tegninger.filter(t => t.eiendomId === eid); const per: Record<string, any> = {}; const etg: any[] = [];
  let unscaled = 0, fellesBygg = 0, ikkeFordelt = 0;
  sortBy(T, t => +t.etasje || 0).forEach(t => {
    const sum: Record<string, number> = { leie: 0, ledig: 0, felles_etg: 0, felles_bygg: 0, ikke: 0 }; const own: Record<string, number> = {};
    if (!mpp(t)) { if ((t.soner || []).length) unscaled++; etg.push({ t, sum, ok: false }); return; }
    (t.soner || []).forEach((z: Rec) => { const a = zoneArea(t, z) || 0; sum[z.kat] = (sum[z.kat] || 0) + a; if (z.kat === 'leie' || z.kat === 'ledig') { const k = z.kat === 'ledig' ? '_ledig' : (z.leietakerId || '_ukjent'); own[k] = (own[k] || 0) + a; } });
    fellesBygg += sum.felles_bygg; const base = Object.values(own).reduce((a, b) => a + b, 0); if (!base) ikkeFordelt += sum.felles_etg;
    Object.entries(own).forEach(([k, a]) => { const p = per[k] = per[k] || { eks: 0, fe: 0, fb: 0, etg: [] }; p.eks += a; p.fe += base ? sum.felles_etg * a / base : 0; if (!p.etg.includes(t.navn)) p.etg.push(t.navn); });
    etg.push({ t, sum, ok: true });
  });
  const totEks = Object.values(per).reduce((s: number, p: any) => s + p.eks, 0); if (!totEks) ikkeFordelt += fellesBygg;
  Object.values(per).forEach((p: any) => { p.fb = totEks ? fellesBygg * p.eks / totEks : 0; p.tot = p.eks + p.fe + p.fb; });
  const totLeie = Object.values(per).reduce((s: number, p: any) => s + p.tot, 0);
  return { per, etg, unscaled, fellesBygg, totEks, totLeie, ikkeFordelt };
}
export type LeieArealInfo = { verdi: number | null; kilde: 'overstyrt' | 'maalt' | 'manuell' | null; p: { eks: number; fe: number; fb: number; tot: number; etg?: string[] } | null; adv: string[] };
/** Gjeldende leieareal for en leietaker: overstyrt > oppmålt fra tegninger (inkl. andel fellesareal) > eldre manuell verdi */
export function leieAreal(l: Rec): LeieArealInfo {
  const C = arealCalc(l.eiendomId); let p: any = C.per[l.id] || null;
  if (!p && l.arealBeregnet?.tot && !S.tegninger.some(t => t.eiendomId === l.eiendomId)) p = l.arealBeregnet; // leietakere ser ikke tegningene
  const ovRaw = l.arealOverstyrt; const ov = ovRaw !== '' && ovRaw != null && !isNaN(+ovRaw) ? +ovRaw : null;
  const adv: string[] = [];
  if (p && (p.fe || 0) + (p.fb || 0) < 0.05) adv.push('Andel fellesareal er ikke med – det er ikke tegnet fellesarealer for eiendommen');
  if (p && C.unscaled) adv.push(`${C.unscaled} tegning(er) på eiendommen mangler målestokk og er ikke regnet med`);
  if (ov !== null) return { verdi: ov, kilde: 'overstyrt', p, adv: [] };
  if (p) return { verdi: p.tot, kilde: 'maalt', p, adv };
  if (+l.areal) return { verdi: +l.areal, kilde: 'manuell', p: null, adv: [] };
  return { verdi: null, kilde: null, p: null, adv: [] };
}
export function docCoverage(e: Rec, PAAKREVD: string[]) {
  const docs = S.dokumenter.filter(d => d.eiendomId === e.id); const na = e.dokNA || [];
  return PAAKREVD.map(t => {
    if (na.includes(t)) return { t, s: 'na' };
    const ds = docs.filter(d => d.type === t); if (!ds.length) return { t, s: 'no' };
    const valid = ds.filter(d => !d.gyldigTil || (dUntil(d.gyldigTil) as number) >= 0);
    if (!valid.length) return { t, s: 'exp', d: ds[0] };
    const soon = valid.every(d => d.gyldigTil && (dUntil(d.gyldigTil) as number) <= 90);
    return { t, s: soon ? 'soon' : 'ok', d: valid[0] };
  });
}
export function csvCell(v: any) { const s = String(v ?? ''); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
export function toCsv(rows: any[][]) { return rows.map(r => r.map(csvCell).join(';')).join('\n'); }
