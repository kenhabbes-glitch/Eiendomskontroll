// Målere og avlesninger: forbruksmålere (vann, el, fjernvarme, fjernkjøling, seriemålere) og tilstandsmålere (trykk, temperatur).
// En måler er en komponent med mType satt. Avlesningene ligger i S.avlesninger (egen tabell).
import { S } from './store';
import { addInt, byId, type Rec } from './utils';

export const MEDIER: [string, string, string][] = [
  ['vann', 'Vann', 'm³'], ['el', 'Elektrisitet', 'kWh'], ['fjernvarme', 'Fjernvarme', 'kWh'], ['fjernkjoling', 'Fjernkjøling', 'kWh'],
  ['varme', 'Varme (energimåler)', 'kWh'], ['kjoling', 'Kjøling (energimåler)', 'kWh'], ['gass', 'Gass', 'm³'], ['olje', 'Olje/diesel', 'l'],
  ['trykk', 'Trykk', 'bar'], ['temperatur', 'Temperatur', '°C'], ['timer', 'Driftstimer', 't'], ['annet', 'Annet', ''],
];
export const mediumNavn = (m?: string) => MEDIER.find(x => x[0] === m)?.[1] || m || '';
export const stdEnhet = (m?: string) => MEDIER.find(x => x[0] === m)?.[2] || '';
/** TFM-koder som vanligvis er målere */
export const MAALER_KODER: Record<string, { type: 'forbruk' | 'tilstand'; medium: string }> = {
  RF: { type: 'forbruk', medium: 'vann' }, RE: { type: 'forbruk', medium: 'el' }, RP: { type: 'tilstand', medium: 'trykk' }, RT: { type: 'tilstand', medium: 'temperatur' },
};

export const erMaaler = (k?: Rec | null) => !!k?.mType;
export const alleMaalere = (eid?: string) => S.komponenter.filter(k => erMaaler(k) && (!eid || k.eiendomId === eid));
export const enhet = (k: Rec) => k.mEnhet || stdEnhet(k.mMedium);
export const tall = (v: any): number | null => { if (v === '' || v == null) return null; const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/\s/g, '').replace(',', '.')); return isFinite(n) ? n : null; };
export const fmt = (v: number | null | undefined, des?: number) => v == null ? '–' : v.toLocaleString('nb-NO', { maximumFractionDigits: des ?? (Math.abs(v) < 100 ? 2 : 0) });

/** Avlesninger for en måler, eldste først */
export function avlFor(kid: string): Rec[] {
  return S.avlesninger.filter(a => a.komponentId === kid && tall(a.verdi) != null).sort((a, b) => (a.dato + (a.t || '')).localeCompare(b.dato + (b.t || '')));
}
export const sisteAvl = (kid: string) => { const A = avlFor(kid); return A[A.length - 1] || null; };

/** Forbruk mellom påfølgende avlesninger (forbruksmålere). Målerbytte: forbruk = sluttstand gammel måler − forrige; ny måler starter på verdi. */
export function perioder(k: Rec, A = avlFor(k.id)) {
  const f = tall(k.mFaktor) || 1; const out: { fra: string; til: string; forbruk: number; dager: number; neg: boolean }[] = [];
  for (let i = 1; i < A.length; i++) {
    const a = A[i - 1], b = A[i]; const slutt = b.bytte ? tall(b.bytte.slutt) : tall(b.verdi);
    if (slutt == null) continue; const d = (slutt - tall(a.verdi)!) * f;
    const dager = Math.max(0, (Date.parse(b.dato) - Date.parse(a.dato)) / 864e5);
    out.push({ fra: a.dato, til: b.dato, forbruk: d, dager, neg: d < 0 });
  }
  return out;
}

/** Forbruk per måned (YYYY-MM), fordelt jevnt per dag mellom avlesningene */
export function forbrukMnd(k: Rec, A = avlFor(k.id)): Record<string, number> {
  const res: Record<string, number> = {};
  for (const p of perioder(k, A)) {
    if (p.dager <= 0) { const m = p.til.slice(0, 7); res[m] = (res[m] || 0) + p.forbruk; continue; }
    const perDag = p.forbruk / p.dager; let t = Date.parse(p.fra); const slutt = Date.parse(p.til);
    while (t < slutt) {
      const d = new Date(t); const nesteMnd = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
      const til = Math.min(nesteMnd, slutt); const m = d.toISOString().slice(0, 7);
      res[m] = (res[m] || 0) + perDag * (til - t) / 864e5; t = til;
    }
  }
  return res;
}
export const sumPeriode = (mnd: Record<string, number>, fra: string, til: string) => Object.entries(mnd).filter(([m]) => m >= fra && m <= til).reduce((s, [, v]) => s + v, 0);

/** Status for en måler: siste avlesning, neste frist, utenfor grense */
export function maalerStatus(k: Rec) {
  const s = sisteAvl(k.id); const iv = { n: +(k.mFrekN || 1), enhet: k.mFrekE || 'mnd' };
  const neste = s ? addInt(s.dato, iv) : '';
  const v = s ? tall(s.verdi) : null; const min = tall(k.mMin), max = tall(k.mMax);
  const utenfor = k.mType === 'tilstand' && v != null && ((min != null && v < min) || (max != null && v > max));
  const P = perioder(k); const sist = P[P.length - 1] || null;
  return { siste: s, neste, forfalt: !s || (!!neste && neste < new Date().toISOString().slice(0, 10)), utenfor, min, max, sistePeriode: sist };
}
export function grenseTekst(k: Rec) {
  const min = tall(k.mMin), max = tall(k.mMax); const e = enhet(k);
  return min != null && max != null ? `${fmt(min)}–${fmt(max)} ${e}` : min != null ? `min. ${fmt(min)} ${e}` : max != null ? `maks. ${fmt(max)} ${e}` : '';
}
/** Vurder en ny verdi før lagring: advarsler om negativt eller uvanlig høyt forbruk, eller verdi utenfor grense */
export function vurderVerdi(k: Rec, verdi: number, dato: string, bytte?: { slutt?: any } | null): string[] {
  const w: string[] = [];
  if (k.mType === 'tilstand') { const min = tall(k.mMin), max = tall(k.mMax); if ((min != null && verdi < min) || (max != null && verdi > max)) w.push(`Verdien er utenfor grensen (${grenseTekst(k)})`); return w; }
  const A = avlFor(k.id).filter(a => a.dato <= dato); const f = A[A.length - 1]; if (!f) return w;
  const slutt = bytte ? tall(bytte.slutt) : verdi; if (slutt == null) return w;
  const d = slutt - tall(f.verdi)!;
  if (d < 0) w.push(bytte ? 'Sluttstanden er lavere enn forrige avlesning' : 'Verdien er lavere enn forrige avlesning – er måleren byttet? Kryss av for målerbytte.');
  const P = perioder(k, A).filter(p => p.dager > 0 && !p.neg); const dager = (Date.parse(dato) - Date.parse(f.dato)) / 864e5;
  if (P.length >= 2 && dager > 0 && d > 0) { const snitt = P.reduce((s, p) => s + p.forbruk, 0) / P.reduce((s, p) => s + p.dager, 0) / (tall(k.mFaktor) || 1); if (snitt > 0 && d / dager > snitt * 3) w.push(`Forbruket er ${fmt(d / dager / snitt, 1)} ganger høyere enn vanlig – mulig lekkasje eller feilavlesning`); }
  return w;
}

/** Fordeling per leietaker for en periode (YYYY-MM–YYYY-MM): seriemålere koblet til hovedmåler */
export function fordeling(eid: string, fra: string, til: string) {
  const M = alleMaalere(eid).filter(k => k.mType === 'forbruk');
  const hoved = M.filter(k => !k.mHoved || !byId('komponenter', k.mHoved));
  return hoved.map(h => {
    const under = M.filter(k => k.mHoved === h.id);
    const hv = sumPeriode(forbrukMnd(h), fra, til);
    const rader = under.map(u => ({ k: u, lt: u.mLeietaker || '', v: sumPeriode(forbrukMnd(u), fra, til) }));
    const sumU = rader.reduce((s, r) => s + r.v, 0);
    return { h, hv, rader, rest: hv - sumU, harUnder: under.length > 0 };
  });
}
