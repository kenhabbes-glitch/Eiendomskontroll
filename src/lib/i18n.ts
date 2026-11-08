// Språk i appen. Kildeteksten er norsk (bokmål) og brukes som nøkkel; andre språk ligger i src/i18n/<kode>.json.
// tt('Lagre') → «Guardar» på meksikansk spansk. Plassholdere: tt('Sendt til {0}', navn).
// Mangler en oversettelse, vises norsk tekst. Lagrede verdier (status, typer o.l.) lagres alltid på norsk
// og oversettes bare når de vises – slik kan brukere med ulike språk jobbe i samme data.
export type Sprak = 'nb' | 'en' | 'sv' | 'da' | 'es-MX' | 'es-ES';
export const SPRAK: { k: Sprak; navn: string; lokale: string }[] = [
  { k: 'nb', navn: 'Norsk (bokmål)', lokale: 'nb-NO' },
  { k: 'en', navn: 'English', lokale: 'en-GB' },
  { k: 'sv', navn: 'Svenska', lokale: 'sv-SE' },
  { k: 'da', navn: 'Dansk', lokale: 'da-DK' },
  { k: 'es-MX', navn: 'Español (México)', lokale: 'es-MX' },
  { k: 'es-ES', navn: 'Español (España)', lokale: 'es-ES' },
];
const LASTERE: Partial<Record<Sprak, () => Promise<any>>> = {
  'en': () => import('../i18n/en.json'),
  'sv': () => import('../i18n/sv.json'),
  'da': () => import('../i18n/da.json'),
  'es-MX': () => import('../i18n/es-MX.json'),
  'es-ES': () => import('../i18n/es-ES.json'),
};
const NOKKEL = 'ek.sprak';
function fraNettleser(): Sprak {
  try { const s = localStorage.getItem(NOKKEL) as Sprak | null; if (s && SPRAK.some(x => x.k === s)) return s; } catch { }
  const n = (navigator.languages || [navigator.language || '']).map(x => x.toLowerCase());
  for (const l of n) { if (/^(nb|no|nn)\b/.test(l)) return 'nb'; if (l === 'es-es') return 'es-ES'; if (l.startsWith('es')) return 'es-MX'; if (l.startsWith('sv')) return 'sv'; if (l.startsWith('da')) return 'da'; if (l.startsWith('en')) return 'en'; }
  return 'nb';
}
let SP: Sprak = 'nb'; let DICT: Record<string, string> | null = null;
export const sprak = () => SP;
export const lokale = () => SPRAK.find(x => x.k === SP)?.lokale || 'nb-NO';

/** Lastes før appen startes (main.tsx), slik at tekster som lages ved oppstart også blir oversatt */
export async function lastSprak() {
  SP = fraNettleser();
  try { document.documentElement.lang = SP === 'nb' ? 'no' : SP; } catch { }
  const f = LASTERE[SP]; if (f) { try { const m = await f(); DICT = (m.default || m) as Record<string, string>; } catch { DICT = null; } }
}
/** Bytt språk: lagres på enheten og appen lastes på nytt */
export function settSprak(s: Sprak) { try { localStorage.setItem(NOKKEL, s); } catch { } location.reload(); }

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
export function tt(s: any, ...a: any[]): string {
  if (typeof s !== 'string') return s;
  let r = s;
  if (DICT && s) { const d = DICT[s] ?? DICT[norm(s)]; if (d) r = d; }
  if (a.length) for (let i = 0; i < a.length; i++) r = r.split('{' + i + '}').join(String(a[i] ?? ''));
  return r;
}
/** Oversetter en lagret verdi bare for visning (f.eks. status «Ny» → «Nuevo») */
export const vis = (v: any) => (typeof v === 'string' && v ? tt(v) : v);
/** Tekst med kontekst, for norske ord som oversettes ulikt etter sammenheng: ttc('svar', 'Avvik') slår opp «Avvik|svar» først */
export function ttc(ctx: string, s: string, ...a: any[]): string { const k = s + '|' + ctx; return DICT && DICT[k] ? tt(DICT[k], ...a) : tt(s, ...a); }
