// Kontraktstyper og ansvarsfordeling mellom eier og leietaker.
// Hver kontraktsmal gir en fordeling per ansvarsområde, delt i «drift og vedlikehold» (v) og «utskifting» (u).
// Fordelingen kan justeres per leietaker etter hva kontrakten faktisk sier, og lagres som egen mal.
import { S } from './store';
import { STD_PLIKTER } from './catalog';
import { landFor, stdPlikter, virksomhetPlikter } from './land';

export type Ans = 'Eier' | 'Leietaker' | 'Delt' | 'Eier – viderefaktureres' | 'Ikke aktuelt';
export type Celle = { v: Ans; u: Ans; p?: string };
export type Fordeling = Record<string, Celle>;
export type Mal = { key: string; n: string; beskr: string; f: Fordeling; egen?: boolean };

export const ANS_VALG: Ans[] = ['Eier', 'Leietaker', 'Delt', 'Eier – viderefaktureres', 'Ikke aktuelt'];
export const ANS_KORT: Record<Ans, string> = { 'Eier': 'Eier', 'Leietaker': 'Leietaker', 'Delt': 'Delt', 'Eier – viderefaktureres': 'Eier, leietaker betaler', 'Ikke aktuelt': '–' };

// Ansvarsområder med NS 3451-koder (lengste prefiks vinner ved kobling til systemer)
export const OMR: { k: string; n: string; sys: string[]; tek?: boolean }[] = [
  { k: 'baerende', n: 'Bærende konstruksjoner og grunnmur', sys: ['21', '22'] },
  { k: 'tak', n: 'Tak og taktekking', sys: ['26'] },
  { k: 'fasade', n: 'Fasader, vinduer og ytterdører', sys: ['23'] },
  { k: 'innvendig', n: 'Innvendige overflater (vegger, gulv, himling) i leieobjektet', sys: ['24', '25', '27', '28'] },
  { k: 'dorer', n: 'Innvendige dører, låser og nøkler i leieobjektet', sys: [] },
  { k: 'sanitaer', n: 'Sanitær, vann og avløp', sys: ['31'], tek: true },
  { k: 'sluk', n: 'Sluk, vannlåser og avløp i leieobjektet (rensing)', sys: [] },
  { k: 'varme', n: 'Varme og kjøling', sys: ['32', '35', '37', '45'], tek: true },
  { k: 'ventilasjon', n: 'Ventilasjon', sys: ['36'], tek: true },
  { k: 'el', n: 'El-hovedanlegg, tavler og fordeling', sys: ['40', '41', '42', '43', '46', '47', '49'], tek: true },
  { k: 'belysning', n: 'Belysning, armaturer og stikkontakter', sys: ['44'] },
  { k: 'brann', n: 'Brannteknisk utstyr (alarm, sprinkler, nødlys, slokkere)', sys: ['33', '443', '542'], tek: true },
  { k: 'heis', n: 'Heis og transportanlegg', sys: ['6'], tek: true },
  { k: 'svakstrom', n: 'Tele, adgangskontroll og automasjon (SD)', sys: ['5'], tek: true },
  { k: 'utomhus', n: 'Uteareal, snømåking og strøing', sys: ['7'] },
  { k: 'egne', n: 'Leietakers egne installasjoner (kjøl, kjøkken, IT)', sys: [] },
  { k: 'renhold', n: 'Renhold og avfallshåndtering', sys: [] },
];

const lag = (v: Record<string, Ans>, u: Record<string, Ans>, std: [Ans, Ans]): Fordeling =>
  Object.fromEntries(OMR.map(o => [o.k, { v: v[o.k] || std[0], u: u[o.k] || std[1] }]));
const L: Ans = 'Leietaker', E: Ans = 'Eier', NA: Ans = 'Ikke aktuelt';
const inne = { innvendig: L, dorer: L, belysning: L, sluk: L, egne: L, renhold: L };

export const MALER_KONTRAKT: Mal[] = [
  { key: 'standard', n: 'Standard leieavtale for lokaler (Norsk Eiendom / Huseierne)',
    beskr: 'Eier har bygningskroppen, utvendig vedlikehold, fellesanlegg og utskifting. Leietaker har innvendig vedlikehold i leieobjektet og egne installasjoner.',
    f: lag({ ...inne }, { innvendig: L, dorer: L, belysning: L, egne: L, renhold: NA }, [E, E]) },
  { key: 'tn', n: 'Trippel netto – leietaker drifter og vedlikeholder, eier skifter ut',
    beskr: 'Leietaker har drift og vedlikehold av hele bygget og tekniske anlegg (inkl. service og lovpålagte kontroller). Eier har utskifting av bygningsdeler og tekniske anlegg.',
    f: lag({ baerende: E }, { innvendig: L, dorer: L, belysning: L, sluk: L, egne: L, renhold: NA }, [L, E]) },
  { key: 'tn_ytre', n: 'Trippel netto – eier beholder tak, fasade og bærende',
    beskr: 'Som trippel netto, men eier har både vedlikehold og utskifting av tak, fasader og bærende konstruksjoner.',
    f: lag({ baerende: E, tak: E, fasade: E }, { innvendig: L, dorer: L, belysning: L, sluk: L, egne: L, renhold: NA }, [L, E]) },
  { key: 'bare_hus', n: 'Bare hus – leietaker har vedlikehold og utskifting',
    beskr: 'Leietaker har alt vedlikehold og all utskifting, også utvendig og tekniske anlegg. Eier har bare utskifting av bærende konstruksjoner. Juster etter kontrakten.',
    f: lag({}, { baerende: E, renhold: NA }, [L, L]) },
  { key: 'egen', n: 'Egendefinert (start fra standard og juster)', beskr: 'Fyll inn fordelingen slik den står i kontrakten.',
    f: lag({ ...inne }, { innvendig: L, dorer: L, belysning: L, egne: L, renhold: NA }, [E, E]) },
];

export const alleMaler = (): Mal[] => [...MALER_KONTRAKT, ...((S.innst.kontraktsmaler || []) as Mal[]).map(m => ({ ...m, egen: true }))];
export const finnMal = (key?: string): Mal => alleMaler().find(m => m.key === key) || MALER_KONTRAKT[0];
export const kopi = (f: Fordeling): Fordeling => JSON.parse(JSON.stringify(f));

// Gamle leietakere hadde én kolonne med tekstnøkler – oversett til ny modell
const GAMMEL: Record<string, string[]> = {
  'Tak, fasader, vinduer og utvendig vedlikehold': ['tak', 'fasade'], 'Bærende konstruksjoner': ['baerende'],
  'Fellesanlegg (ventilasjon, varme, sanitær, el-hovedanlegg)': ['ventilasjon', 'varme', 'sanitaer', 'el'],
  'Brannteknisk utstyr (alarm, nødlys, slokkere)': ['brann'], 'Innvendig vedlikehold av leieobjektet (vegger, gulv, himling)': ['innvendig'],
  'Dører, låser og nøkler i leieobjektet': ['dorer'], 'Belysning, armaturer og stikkontakter i leieobjektet': ['belysning'],
  'Sluk, vannlåser og avløp i leieobjektet (rensing)': ['sluk'], 'Leietakers egne installasjoner (kjøl, kjøkken, IT)': ['egne'],
  'Renhold og avfallshåndtering': ['renhold'], 'Snømåking, strøing og uteareal': ['utomhus'],
};
export function kontraktKey(l: any): string {
  if (l.kontrakt) return l.kontrakt;
  return /Norsk Eiendom|Huseierne/.test(l.avtaletype || '') || !l.avtaletype ? 'standard' : 'egen';
}
export function fordeling(l: any): Fordeling {
  const mal = finnMal(kontraktKey(l)).f;
  if (l.ansvar) return Object.fromEntries(OMR.map(o => [o.k, { ...mal[o.k], ...(l.ansvar[o.k] || {}) }]));
  const f = kopi(mal); const mx = l.matrise || {};
  for (const [gk, keys] of Object.entries(GAMMEL)) if (mx[gk]) keys.forEach(k => { f[k].v = mx[gk]; });
  const ut = mx['Utskifting av bygningsdeler og tekniske anlegg'];
  if (ut) OMR.forEach(o => { if (!['innvendig', 'dorer', 'belysning', 'egne', 'renhold'].includes(o.k)) f[o.k].u = ut; });
  return f;
}
export const avvikerFraMal = (l: any, k: string): boolean => {
  const m = finnMal(kontraktKey(l)).f[k], c = fordeling(l)[k];
  return !!m && (m.v !== c.v || m.u !== c.u);
};

// Ansvarsområde for et system ut fra TFM/NS 3451-kode
export function omrForSys(kode?: string): string | null {
  if (!kode) return null; let best: string | null = null, len = 0;
  for (const o of OMR) for (const p of o.sys) if (kode.startsWith(p) && p.length > len) { best = o.k; len = p.length; }
  return best;
}
export const leietakerHar = (a: Ans) => a === 'Leietaker' || a === 'Delt';

// Plikter som følger av ansvarsfordelingen
export function avledetPlikter(l: any): string[] {
  const f = fordeling(l); const k: string[] = [];
  const tekL = OMR.filter(o => o.tek && leietakerHar(f[o.k].v));
  if (tekL.length) k.push('serviceavtaler', 'fdv');
  if (leietakerHar(f.brann.v)) k.push('brann_anlegg');
  if (leietakerHar(f.el.v)) k.push('el_hoved');
  if (leietakerHar(f.tak.v) || leietakerHar(f.fasade.v)) k.push('utvendig');
  if (leietakerHar(f.heis.v)) k.push('heis_kontroll');
  if (leietakerHar(f.utomhus.v)) k.push('uteareal');
  if (OMR.some(o => o.k !== 'renhold' && f[o.k].u === 'Leietaker' && !['innvendig', 'dorer', 'belysning', 'egne', 'sluk'].includes(o.k))) k.push('utskiftingsplan');
  return k;
}
export function pliktKeysFor(l: any): string[] {
  { const ld = landFor(l.eiendomId); if (ld !== 'NO') return [...new Set([...stdPlikter(ld), ...virksomhetPlikter(ld, l.virksomhet)])]; }
  const keys = STD_PLIKTER.slice();
  if (l.virksomhet === 'Servering') keys.push('fett', 'fgass_egen'); else if (l.virksomhet === 'Butikk/handel') keys.push('fgass_egen');
  return [...new Set([...keys, ...avledetPlikter(l)])];
}
export const AVLEDET = ['serviceavtaler', 'fdv', 'brann_anlegg', 'el_hoved', 'utvendig', 'heis_kontroll', 'uteareal', 'utskiftingsplan'];

// Systemer på eiendommen som omfattes av leietakerens kontrakt
export const systemerFor = (l: any) => S.anlegg.filter(a => a.eiendomId === l.eiendomId && (a.leietakerId === l.id || (l.heleBygget && !a.leietakerId)));
