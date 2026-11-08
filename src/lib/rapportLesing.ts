// Lesing av servicerapporter (PDF) i nettleseren – ingenting sendes ut av appen.
// 1) Teksten hentes ut linje for linje med pdf.js. 2) Linjene vurderes mot en ordliste (standard + egne ord)
// og mot det appen har lært av tidligere rapporter fra samme leverandør og samme type anlegg.
// 3) Når brukeren godtar eller forkaster forslag, oppdateres læringen (innstillinger → 'rapportlesing').
import { S, saveInnst, sb } from './store';
import { KOMP, TYPER } from './catalog';
import type { Rec } from './utils';
import { tt } from './i18n';

export type OrdType = 'avvik' | 'ok' | 'seksjon' | 'ignorer' | 'hoy' | 'lav';
export type Ord = { o: string; t: OrdType; kilde?: 'standard' | 'egen' };
export const ORD_TYPER: [OrdType, string, string][] = [
  ['avvik', 'Tegn på avvik', 'Linjer med disse ordene foreslås som avvik'],
  ['seksjon', 'Overskrift for avviksliste', 'Linjene under en slik overskrift foreslås som avvik (til neste overskrift)'],
  ['ok', 'Tegn på «ingen avvik»', 'Gjør at linjen ikke blir avvik, og at rapporten kan foreslås som OK'],
  ['hoy', 'Høy alvorlighet', 'Gir alvorlighet Høy/Kritisk'],
  ['lav', 'Lav alvorlighet', 'Gir alvorlighet Lav'],
  ['ignorer', 'Ignorer linjer med', 'F.eks. forklaringstekst eller tegnforklaring som står i alle rapporter'],
];
export const STD_ORD: Ord[] = [
  ...['avvik', 'anmerkning', 'mangel', 'mangler', 'feil', 'defekt', 'ikke ok', 'ikke godkjent', 'ikke i orden', 'må utbedres', 'bør utbedres', 'utbedres', 'byttes', 'skiftes ut', 'lekkasje', 'korrosjon', 'utløpt', 'ikke funksjon', 'fungerer ikke', 'virker ikke', 'løs', 'skadet', 'tg2', 'tg3', 'pålegg'].map(o => ({ o, t: 'avvik' as OrdType })),
  ...['avvik:', 'registrerte avvik', 'avvik og anmerkninger', 'anmerkninger:', 'mangler:', 'tiltak:', 'anbefalte tiltak', 'påviste feil', 'merknader'].map(o => ({ o, t: 'seksjon' as OrdType })),
  ...['ingen avvik', 'ingen anmerkninger', 'ingen mangler', 'uten anmerkning', 'uten avvik', 'i orden', 'godkjent', '0 avvik', 'ok'].map(o => ({ o, t: 'ok' as OrdType })),
  ...['kritisk', 'umiddelbart', 'straks', 'stanset', 'tas ut av drift', 'livsfare', 'tg3', 'brannfare', 'pålegg'].map(o => ({ o, t: 'hoy' as OrdType })),
  ...['anbefaling', 'anbefales', 'merknad', 'tg1', 'kosmetisk', 'bør vurderes'].map(o => ({ o, t: 'lav' as OrdType })),
  ...['side ', 'tegnforklaring', 'forklaring:', 'org.nr', 'org nr', 'telefon', 'e-post', 'www.', 'signatur', 'dato:'].map(o => ({ o, t: 'ignorer' as OrdType })),
].map(x => ({ ...x, kilde: 'standard' as const }));

type Laering = { m: Record<string, { g: number; a: number }>; ign: string[]; n: number };
export type Mal = { type: 'status' | 'seksjon' | 'prefiks'; avvik: string[]; ok: string[]; start: string; slutt: string; prefiks: string; navn: string; laget: string; kilde?: 'egen' | 'felles' };
type Innst = { ord: Ord[]; fjernet: string[]; laering: Record<string, Laering>; maler: Record<string, Mal>; felles: { del: boolean; bruk: boolean } };
export const lesInnst = (): Innst => { const v = S.innst.rapportlesing || {}; return { ord: [], fjernet: [], laering: {}, maler: {}, ...v, felles: { del: false, bruk: false, ...(v.felles || {}) } }; };
export const levNokkel = (lev: string) => lev ? 'lev:' + norm(lev).slice(0, 60) : '';
export const alleOrd = (I = lesInnst()) => [...STD_ORD.filter(x => !I.fjernet.includes(x.t + ':' + x.o)), ...I.ord];
export const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').replace(/[^\p{L}\p{N} %:.,/-]/gu, '').trim();
const hashL = (s: string) => { const t = norm(s).replace(/\d+/g, '#'); let h = 0; for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return String(h >>> 0); };
const har = (l: string, o: string) => { const s = ' ' + norm(l) + ' '; const w = norm(o); return w.length <= 3 ? new RegExp(`(^|[^\\p{L}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}]|$)`, 'u').test(s) : s.includes(w); };

// ---------------- PDF → linjer (pdf.js lastes ved behov, samme kilde som tegninger og brannkonsept)
let pdfjsP: Promise<any> | null = null;
function lastPdfjs(): Promise<any> {
  if ((window as any).pdfjsLib) return Promise.resolve((window as any).pdfjsLib);
  if (!pdfjsP) pdfjsP = (async () => { const b = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
    await new Promise<void>((ok, feil) => { const s = document.createElement('script'); s.src = b + 'pdf.min.js'; s.onload = () => ok(); s.onerror = () => feil(new Error('Kunne ikke laste PDF-leseren')); document.head.appendChild(s); });
    const L = (window as any).pdfjsLib; L.GlobalWorkerOptions.workerSrc = b + 'pdf.worker.min.js'; return L; })();
  pdfjsP.catch(() => { pdfjsP = null; }); return pdfjsP;
}
export async function pdfLinjer(data: ArrayBuffer): Promise<{ linjer: string[]; sider: number; tomTekst: boolean }> {
  const pdfjs: any = await lastPdfjs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data), isEvalSupported: false }).promise; const ut: string[] = [];
  for (let p = 1; p <= Math.min(doc.numPages, 40); p++) {
    const tc = await (await doc.getPage(p)).getTextContent(); const rader: { y: number; x: number; s: string }[] = [];
    for (const it of tc.items as any[]) if (it.str?.trim()) rader.push({ y: Math.round(it.transform[5]), x: it.transform[4], s: it.str });
    const grupper: Record<number, typeof rader> = {};
    for (const r of rader) { const k = Object.keys(grupper).map(Number).find(y => Math.abs(y - r.y) <= 2) ?? r.y; (grupper[k] ||= []).push(r); }
    for (const y of Object.keys(grupper).map(Number).sort((a, b) => b - a)) ut.push(grupper[y].sort((a, b) => a.x - b.x).map(r => r.s).join(' ').replace(/\s+/g, ' ').trim());
  }
  return { linjer: ut.filter(Boolean), sider: doc.numPages, tomTekst: ut.join('').trim().length < 30 };
}

// ---------------- Vurdering
export type Forslag = { id: string; tekst: string; linje: number; treff: string[]; score: number; alv: string; valgt: boolean; hash: string };
export function kontekster(o: Rec, leverandor: string) { const a = o.anleggId ? S.anlegg.find(x => x.id === o.anleggId) : null; return [leverandor && 'lev:' + norm(leverandor).slice(0, 60), a?.type && 'type:' + a.type, 'type:' + (o.type || 'kontroll')].filter(Boolean) as string[]; }
export function finnLeverandor(linjer: string[]): string {
  const t = linjer.slice(0, 25);
  const org = t.join(' ').match(/(\b(?:org\.?\s*nr\.?|organisasjonsnummer)\s*:?\s*)(\d{3}[\s.]?\d{3}[\s.]?\d{3})/i); if (org) return 'orgnr ' + org[2].replace(/\D/g, '');
  const as = t.find(l => /\b(as|asa|ans|da)\b\.?$/i.test(l.trim()) && l.length < 60); return as ? as.trim() : '';
}
export function vurder(linjer: string[], ctx: string[], I = lesInnst()) {
  const O = alleOrd(I); const by = (t: OrdType) => O.filter(x => x.t === t).map(x => x.o);
  const AV = by('avvik'), OK = by('ok'), SEK = by('seksjon'), IGN = by('ignorer'), HOY = by('hoy'), LAV = by('lav');
  const L = ctx.map(c => I.laering[c]).filter(Boolean) as Laering[];
  const ignorert = new Set(L.flatMap(l => l.ign));
  const F = I.felles.bruk ? ctx.map(c => FELLES[c]).filter(Boolean) : [];
  const vekt = (m: string) => { let g = 0, a = 0; for (const l of L) { const s = l.m[m]; if (s) { g += s.g; a += s.a; } }
    for (const f of F) { const s = f[m]; if (s) { const k = Math.min(1, 40 / (s.g + s.a)) * 0.25; g += s.g * k; a += s.a * k; } } // felles læring teller mindre enn egen
    return (g + 1) / (g + a + 2); }; // 0..1, 0.5 = ukjent
  const ut: Forslag[] = []; let iSeksjon = false; let okFunnet = ''; let seksjonNavn = ''; let liste = false; let forrigeVar = false;
  const punkt = (l: string) => /^\s*([-•*–]|\d{1,3}[.)]|[a-z][.)])\s+/.test(l);
  linjer.forEach((l0, i) => {
    const l = l0.trim(); if (l.length < 4) return;
    const erSek = SEK.some(s => norm(l).startsWith(norm(s).replace(/:$/, '')) && l.length < 60);
    if (erSek) { iSeksjon = true; seksjonNavn = l; liste = false; forrigeVar = false; return; }
    if (iSeksjon && /^[A-ZÆØÅ][A-ZÆØÅ \d.:]{4,}$/.test(l) && !AV.some(o => har(l, o))) iSeksjon = false; // ny overskrift i store bokstaver
    // Punktliste under overskriften: listen slutter ved første linje som verken er et punkt eller en fortsettelse
    if (iSeksjon) { if (punkt(l)) liste = true; else if (liste && !(forrigeVar && /^[a-zæøå(]/.test(l))) iSeksjon = false; }
    const h = hashL(l); if (ignorert.has(h)) return;
    if (IGN.some(o => har(l, o))) { forrigeVar = false; return; }
    const okT = OK.filter(o => har(l, o));
    // «Ingen avvik», «Automatikk: ingen anmerkninger», «0 avvik» → ikke avvik
    if (okT.some(o => /^(ingen|0|uten)\b/.test(norm(o)))) { okFunnet ||= l; forrigeVar = false; return; }
    const treff = AV.filter(o => har(l, o));
    if (!treff.length && !iSeksjon) { forrigeVar = false; return; }
    if (okT.length && !treff.some(t => t.length > 3)) return; // f.eks. «Nødlys: OK»
    if (/^[\d\s.,:/-]+$/.test(l)) return;
    const m = [...treff, ...(iSeksjon ? ['§seksjon'] : [])];
    const base = Math.min(0.9, 0.35 + 0.2 * treff.length + (iSeksjon ? 0.25 : 0));
    const lært = m.length ? m.reduce((s, x) => s + vekt(x), 0) / m.length : 0.5;
    const score = Math.max(0, Math.min(1, base * 0.6 + lært * 0.8 - 0.2));
    const alv = HOY.some(o => har(l, o)) ? 'Høy' : LAV.some(o => har(l, o)) ? 'Lav' : 'Middels';
    forrigeVar = true;
    ut.push({ id: 'f' + i, tekst: l.replace(/^[-•*–\d.)\s]+/, '').slice(0, 300), linje: i, treff: m, score, alv, valgt: score >= 0.45, hash: h });
  });
  // Slå sammen linjer som fortsetter forrige forslag (brutt tekst)
  const slatt: Forslag[] = [];
  for (const f of ut) { const p = slatt[slatt.length - 1]; if (p && f.linje === p.linje + 1 && !/[.:!?]$/.test(p.tekst) && /^[a-zæøå]/.test(f.tekst)) { p.tekst = (p.tekst + ' ' + f.tekst).slice(0, 400); p.linje = f.linje; } else slatt.push({ ...f }); }
  return { forslag: slatt.slice(0, 60), okFunnet, seksjonNavn };
}

/** Lær av brukerens valg: godtatte forslag styrker ordene som traff, forkastede svekker dem; «ignorer» lagres per leverandør */
export async function laer(ctx: string[], forslag: Forslag[], valgt: Set<string>, ignorer: Set<string>) {
  const I = lesInnst(); const ny = { ...I, laering: { ...I.laering } };
  for (const c of ctx) {
    const l: Laering = { m: {}, ign: [], n: 0, ...(ny.laering[c] || {}) }; l.m = { ...l.m }; l.n++;
    for (const f of forslag) for (const m of f.treff) { const s = { g: 0, a: 0, ...(l.m[m] || {}) }; valgt.has(f.id) ? s.g++ : s.a++; l.m[m] = s; }
    if (c.startsWith('lev:')) l.ign = [...new Set([...l.ign, ...forslag.filter(f => ignorer.has(f.id)).map(f => f.hash)])].slice(-400);
    ny.laering[c] = l;
  }
  // Begrens størrelsen
  const keys = Object.keys(ny.laering); if (keys.length > 300) for (const k of keys.sort((a, b) => ny.laering[a].n - ny.laering[b].n).slice(0, keys.length - 300)) delete ny.laering[k];
  await saveInnst('rapportlesing', ny);
  if (I.felles.del) delFelles(ctx, forslag, valgt).catch(() => null);
}
// ---------------- Felles, anonymisert læring (valgfritt). Bare anleggs-/kontrolltype + standardord – ingen tekst, eiendom eller person.
const DELBAR_KTX = new Set([...Object.keys(KOMP), ...TYPER].map(k => 'type:' + k));
const FELLES: Record<string, Record<string, { g: number; a: number }>> = {};
export const delbarKontekst = (c: string) => DELBAR_KTX.has(c) && /^type:[A-Za-zÆØÅæøå0-9_-]{2,40}$/.test(c);
const delbarMarkor = (m: string) => m === '§seksjon' || STD_ORD.some(x => x.o === m && /^[a-zæøå][a-zæøå .:/-]{1,38}[a-zæøå0-9:.]?$/.test(m));
async function delFelles(ctx: string[], forslag: Forslag[], valgt: Set<string>) {
  const rader: { k: string; m: string; g: number; a: number }[] = [];
  for (const k of ctx.filter(delbarKontekst)) { const t: Record<string, { g: number; a: number }> = {};
    for (const f of forslag) for (const m of f.treff) if (delbarMarkor(m)) { const s = t[m] ||= { g: 0, a: 0 }; valgt.has(f.id) ? s.g++ : s.a++; }
    for (const [m, s] of Object.entries(t)) rader.push({ k, m, g: Math.min(s.g, 5), a: Math.min(s.a, 5) }); }
  if (rader.length) await sb.rpc('felles_bidra', { p: rader.slice(0, 120) });
}
/** Henter felles læring for kontekstene (feiler stille om funksjonen ikke finnes) */
export async function hentFelles(ctx: string[]) {
  if (!lesInnst().felles.bruk) return; const k = ctx.filter(delbarKontekst); if (!k.length) return;
  try { const { data, error } = await sb.rpc('felles_hent', { p_kontekster: k }); if (error || !Array.isArray(data)) return;
    for (const c of k) FELLES[c] = {}; for (const r of data) (FELLES[r.kontekst] ||= {})[r.markor] = { g: r.g, a: r.a }; } catch { /* ikke tilgjengelig */ }
}
export const orgnrFraLev = (lev: string) => (lev.match(/^orgnr (\d{9})$/) || [])[1] || '';
export async function hentFellesMal(lev: string): Promise<Mal | null> {
  const nr = orgnrFraLev(lev); if (!nr || !lesInnst().felles.bruk) return null;
  try { const { data, error } = await sb.rpc('felles_mal_hent', { p_orgnr: nr }); if (error || !data?.type) return null;
    return { type: data.type, avvik: data.avvik || [], ok: data.ok || [], start: data.start || '', slutt: data.slutt || '', prefiks: data.prefiks || '', navn: lev + tt(" (felles mal") + (data.stemmer > 1 ? tt(", brukt av {0}", data.stemmer) : '') + ')', laget: '', kilde: 'felles' }; } catch { return null; }
}
export async function delFellesMal(lev: string, m: Mal) { const nr = orgnrFraLev(lev); if (!nr) throw new Error('Malen kan bare deles når leverandøren er funnet med org.nr');
  const { error } = await sb.rpc('felles_mal_del', { p_orgnr: nr, p_mal: { type: m.type, avvik: m.avvik, ok: m.ok, start: m.start, slutt: m.slutt, prefiks: m.prefiks } }); if (error) throw new Error(/function|schema/i.test(error.message) ? 'Deling er ikke aktivert på serveren ennå' : error.message); }
export async function settFelles(f: Partial<Innst['felles']>) { const I = lesInnst(); await saveInnst('rapportlesing', { ...I, felles: { ...I.felles, ...f } }); }
export async function lagreOrd(ord: Ord[], fjernet: string[]) { const I = lesInnst(); await saveInnst('rapportlesing', { ...I, ord, fjernet }); }
export async function nullstillLaering() { const I = lesInnst(); await saveInnst('rapportlesing', { ...I, laering: {} }); }
export function laeringsOversikt(I = lesInnst()) {
  return Object.entries(I.laering).map(([k, l]) => ({ k, navn: k.startsWith('lev:') ? tt("Leverandør: ") + k.slice(4) : tt("Anleggstype: ") + k.slice(5), rapporter: l.n, ignorert: l.ign.length,
    beste: Object.entries(l.m).map(([m, s]) => ({ m: m === '§seksjon' ? '(linjer under avviksoverskrift)' : m, g: s.g, a: s.a })).sort((a, b) => (b.g + b.a) - (a.g + a.a)).slice(0, 6) })).sort((a, b) => b.rapporter - a.rapporter);
}

// ---------------- Faste maler per leverandør (rapporter med samme oppsett hver gang)
export const MALTYPER: [Mal['type'], string, string][] = [
  ['status', 'Statuskolonne', 'Hver linje har en status, f.eks. «OK» eller «Avvik» – linjer med avviksstatus blir avvik'],
  ['seksjon', 'Avsnitt fra–til', 'Alt mellom en fast overskrift og neste faste overskrift blir avvik'],
  ['prefiks', 'Linjer som starter med', 'F.eks. «AV-», «Avvik nr» eller «Mangel:»'],
];
const ordTreff = (l: string, v: string) => { const w = v.trim(); if (!w) return false; const re = new RegExp(`(^|[\\s:;|/(\\[-])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[\\s:;|/)\\].,-])`, 'i'); return re.test(' ' + l + ' '); };
export function brukMal(linjer: string[], m: Mal): Forslag[] {
  const ut: Forslag[] = []; const IGN = alleOrd().filter(x => x.t === 'ignorer').map(x => x.o);
  const ny = (l: string, i: number, tekst: string): Forslag => { const HOY = alleOrd().filter(x => x.t === 'hoy').map(x => x.o), LAV = alleOrd().filter(x => x.t === 'lav').map(x => x.o);
    return { id: 'm' + i, tekst: tekst.replace(/^[-•*–\d.)\s|:]+/, '').replace(/[\s|:;-]+$/, '').slice(0, 300), linje: i, treff: ['§mal'], score: 0.92, alv: HOY.some(o => har(l, o)) ? 'Høy' : LAV.some(o => har(l, o)) ? 'Lav' : 'Middels', valgt: true, hash: hashL(l) }; };
  if (m.type === 'status') linjer.forEach((l, i) => { const t = m.avvik.find(v => ordTreff(l, v)); if (!t || m.ok.some(v => ordTreff(l, v))) return;
    const tekst = l.replace(new RegExp(`(^|\\s)${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[\\s:;|/)\\].,-])`, 'i'), ' ').replace(/\s+/g, ' ').trim(); if (tekst.length >= 4) ut.push(ny(l, i, tekst)); });
  if (m.type === 'prefiks' && m.prefiks.trim()) linjer.forEach((l, i) => { if (norm(l).startsWith(norm(m.prefiks))) ut.push(ny(l, i, l.slice(m.prefiks.length))); });
  if (m.type === 'seksjon' && m.start.trim()) { let inne = false;
    linjer.forEach((l, i) => { if (!inne) { if (norm(l).includes(norm(m.start))) inne = true; return; }
      if (m.slutt.trim() && norm(l).includes(norm(m.slutt))) { inne = false; return; }
      if (l.trim().length < 4 || IGN.some(o => har(l, o))) return;
      const p = ut[ut.length - 1]; if (p && p.linje === i - 1 && /^[a-zæøå(]/.test(l.trim())) { p.tekst = (p.tekst + ' ' + l.trim()).slice(0, 400); p.linje = i; } else ut.push(ny(l, i, l)); }); }
  return ut.slice(0, 80);
}
/** Forslag til mal ut fra hvilke linjer brukeren har godtatt */
export function foreslaMal(linjer: string[], valgte: Forslag[], seksjonNavn: string): Partial<Mal> | null {
  if (!valgte.length) return seksjonNavn ? { type: 'seksjon', start: seksjonNavn } : null;
  if (valgte.length >= 2) {
  const sist = valgte.map(f => (linjer[f.linje] || f.tekst).trim().split(/\s+/).pop() || '').map(x => x.replace(/[.:;,]$/, ''));
  const f0 = sist[0]; if (f0 && f0.length >= 1 && sist.filter(x => x.toLowerCase() === f0.toLowerCase()).length >= Math.max(2, valgte.length * 0.7)) return { type: 'status', avvik: [f0] };
  const forst = valgte.map(f => (linjer[f.linje] || '').trim().split(/\s+/)[0] || ''); const p0 = forst[0].replace(/\d+.*$/, '');
  if (p0.length >= 2 && forst.every(x => x.toLowerCase().startsWith(p0.toLowerCase()))) return { type: 'prefiks', prefiks: p0 };
  }
  if (!seksjonNavn) return null;
  const etter = Math.max(...valgte.map(f => f.linje)) + 1; const neste = linjer.slice(etter).find(l => l.trim().length >= 4 && !/^[a-zæøå(]/.test(l.trim()));
  return { type: 'seksjon', start: seksjonNavn, slutt: neste ? neste.split(/[:–-]/)[0].trim().slice(0, 40) : '' };
}
export async function lagreMal(levKey: string, mal: Mal | null) { const I = lesInnst(); const maler = { ...I.maler }; if (mal) maler[levKey] = mal; else delete maler[levKey]; await saveInnst('rapportlesing', { ...I, maler }); }

// ---------------- Tekstgjenkjenning (OCR) for skannede rapporter og bilder – kjører i nettleseren
const TESS = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/';
let tessP: Promise<any> | null = null;
function lastTesseract(): Promise<any> {
  if ((window as any).Tesseract) return Promise.resolve((window as any).Tesseract);
  if (!tessP) tessP = new Promise((ok, feil) => { const s = document.createElement('script'); s.src = TESS + 'tesseract.min.js'; s.onload = () => ok((window as any).Tesseract); s.onerror = () => feil(new Error('Kunne ikke laste tekstgjenkjenningen')); document.head.appendChild(s); });
  tessP.catch(() => { tessP = null; }); return tessP;
}
/** Leser tekst fra bilder av sider. pdf: tegner sidene med pdf.js først. framdrift(0–1, tekst) */
export async function ocrLinjer(data: ArrayBuffer, erPdf: boolean, framdrift: (p: number, t: string) => void, maksSider = 10): Promise<string[]> {
  const T = await lastTesseract(); framdrift(0.02, 'Laster språkdata (norsk) …');
  const w = await T.createWorker('nor', 1, { workerPath: TESS + 'worker.min.js', corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1', langPath: 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/nor/4.0.0_best_int',
    logger: (m: any) => { if (m.status === 'recognizing text') framdrift(-1, ''); } });
  const ut: string[] = [];
  try {
    const bilder: (HTMLCanvasElement | Blob)[] = [];
    if (erPdf) { const L = await lastPdfjs(); const doc = await L.getDocument({ data: new Uint8Array(data), isEvalSupported: false }).promise;
      for (let p = 1; p <= Math.min(doc.numPages, maksSider); p++) { const side = await doc.getPage(p); const vp = side.getViewport({ scale: 2 }); const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
        await side.render({ canvasContext: c.getContext('2d')!, viewport: vp }).promise; bilder.push(c); } }
    else bilder.push(new Blob([data]));
    for (let i = 0; i < bilder.length; i++) { framdrift(0.05 + 0.95 * i / bilder.length, `Gjenkjenner tekst, side ${i + 1} av ${bilder.length} …`);
      const r = await w.recognize(bilder[i]); for (const l of r.data.lines || []) { const t = String(l.text || '').replace(/\s+/g, ' ').trim(); if (t && (l.confidence ?? 100) > 35) ut.push(t); } }
  } finally { await w.terminate().catch(() => null); }
  framdrift(1, 'Ferdig'); return ut;
}
