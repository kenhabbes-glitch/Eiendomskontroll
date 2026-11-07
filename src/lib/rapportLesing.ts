// Lesing av servicerapporter (PDF) i nettleseren – ingenting sendes ut av appen.
// 1) Teksten hentes ut linje for linje med pdf.js. 2) Linjene vurderes mot en ordliste (standard + egne ord)
// og mot det appen har lært av tidligere rapporter fra samme leverandør og samme type anlegg.
// 3) Når brukeren godtar eller forkaster forslag, oppdateres læringen (innstillinger → 'rapportlesing').
import { S, saveInnst } from './store';
import type { Rec } from './utils';

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
type Innst = { ord: Ord[]; fjernet: string[]; laering: Record<string, Laering> };
export const lesInnst = (): Innst => ({ ord: [], fjernet: [], laering: {}, ...(S.innst.rapportlesing || {}) });
export const alleOrd = (I = lesInnst()) => [...STD_ORD.filter(x => !I.fjernet.includes(x.t + ':' + x.o)), ...I.ord];
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').replace(/[^\p{L}\p{N} %:.,/-]/gu, '').trim();
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
  const org = t.join(' ').match(/(\b(?:org\.?\s*nr\.?|organisasjonsnummer)\s*:?\s*)(\d{3}\s?\d{3}\s?\d{3})/i); if (org) return 'orgnr ' + org[2].replace(/\s/g, '');
  const as = t.find(l => /\b(as|asa|ans|da)\b\.?$/i.test(l.trim()) && l.length < 60); return as ? as.trim() : '';
}
export function vurder(linjer: string[], ctx: string[], I = lesInnst()) {
  const O = alleOrd(I); const by = (t: OrdType) => O.filter(x => x.t === t).map(x => x.o);
  const AV = by('avvik'), OK = by('ok'), SEK = by('seksjon'), IGN = by('ignorer'), HOY = by('hoy'), LAV = by('lav');
  const L = ctx.map(c => I.laering[c]).filter(Boolean) as Laering[];
  const ignorert = new Set(L.flatMap(l => l.ign));
  const vekt = (m: string) => { let g = 0, a = 0; for (const l of L) { const s = l.m[m]; if (s) { g += s.g; a += s.a; } } return (g + 1) / (g + a + 2); }; // 0..1, 0.5 = ukjent
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
}
export async function lagreOrd(ord: Ord[], fjernet: string[]) { const I = lesInnst(); await saveInnst('rapportlesing', { ...I, ord, fjernet }); }
export async function nullstillLaering() { const I = lesInnst(); await saveInnst('rapportlesing', { ...I, laering: {} }); }
export function laeringsOversikt(I = lesInnst()) {
  return Object.entries(I.laering).map(([k, l]) => ({ k, navn: k.startsWith('lev:') ? 'Leverandør: ' + k.slice(4) : 'Anleggstype: ' + k.slice(5), rapporter: l.n, ignorert: l.ign.length,
    beste: Object.entries(l.m).map(([m, s]) => ({ m: m === '§seksjon' ? '(linjer under avviksoverskrift)' : m, g: s.g, a: s.a })).sort((a, b) => (b.g + b.a) - (a.g + a.a)).slice(0, 6) })).sort((a, b) => b.rapporter - a.rapporter);
}
