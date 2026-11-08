// Moduler og abonnement. Kjernen er alltid med. Modulene til EIEREN av en eiendom gjelder for eiendommen.
// Tåler at databasen ikke har modultabellen ennå (da er alt tilgjengelig).
import { S, sb } from './store';

export type ModulKey = 'kjerne' | 'brannvern' | 'vedlikehold' | 'prosjekter' | 'tilsyn' | 'dokumentlesing' | 'rapporter';
export const MODULER: { k: ModulKey; navn: string; tekst: string; inneholder: string[] }[] = [
  { k: 'kjerne', navn: 'Kjerne', tekst: 'Alltid med', inneholder: ['Eiendommer og porteføljer', 'Systemer og komponenter (TFM)', 'Dokumenter', 'Kontrollplan og kontrollrunder', 'Avvik og purring', 'Leietakere', 'Tegninger og arealer', 'Målere', 'Regelverk og plikter', 'Arbeidsordre til servicefirma'] },
  { k: 'brannvern', navn: 'Brannvern og leietakeroppfølging', tekst: 'Brannkort, brannverninformasjon til leietakere, bekreftelser og redusert brannsikkerhet', inneholder: ['Brannvern på eiendommen', 'Brannvernpakke og bekreftelse i leietakerportalen', 'Varsel om redusert brannsikkerhet'] },
  { k: 'vedlikehold', navn: 'Vedlikeholdsplan og capex', tekst: 'Langtidsplan for utskifting, nåverdi og capex-rapport', inneholder: ['Vedlikeholdsplan', 'Capex-rapport'] },
  { k: 'prosjekter', navn: 'Prosjekter', tekst: 'Prosjektstyring fra idé til garanti med beslutningsnotat, SHA, Gantt og arkiv', inneholder: ['Prosjekter', 'Utskiftingsprosjekter fra systemer og avvik', 'Fase- og statusrapporter til eier'] },
  { k: 'tilsyn', navn: 'Tilsynssaker', tekst: 'Registrering og oppfølging av tilsyn fra myndighetene med svarfrister og tilbakemelding', inneholder: ['Tilsynssaker', 'Tilbakemeldingsbrev til myndigheten'] },
  { k: 'dokumentlesing', navn: 'Dokumentinnboks og rapportlesing', tekst: 'Appen leser rapporter og dokumenter lokalt og foreslår avvik, type, bygg og system', inneholder: ['Dokumentinnboks', 'Les avvik fra servicerapporter', 'Tekstgjenkjenning (OCR) og leverandørmaler'] },
  { k: 'rapporter', navn: 'Eierrapporter og verdivurdering', tekst: 'Statusrapport til eier og internt verdianslag', inneholder: ['Statusrapport til eier', 'Verdivurdering'] },
];
export const modulNavn = (k: string) => MODULER.find(m => m.k === k)?.navn || k;

type Rad = { org_id: string; modul: string; prove_til: string | null; til: string | null };
let RADER: Rad[] | null = null; // null = ikke tilgjengelig (gammel database) → alt er på
export async function lastModuler() {
  try { const { data, error } = await sb.rpc('mine_moduler'); RADER = error || !Array.isArray(data) ? null : data as Rad[]; } catch { RADER = null; }
}
export const modulerAktivert = () => RADER !== null;

/** Har eiendommen (via eieren) – eller, uten eiendom, noen av brukerens organisasjoner/eiere – modulen? */
export function harModul(k: ModulKey, eid?: string): boolean {
  if (k === 'kjerne' || RADER === null) return true;
  if (eid) { const e = S.eiendommer.find(x => x.id === eid); const org = e?.eierOrgId; if (!org) return true; return RADER.some(r => r.org_id === org && r.modul === k); }
  const ownerless = S.eiendommer.some(e => !e.eierOrgId); if (ownerless) return true;
  return RADER.some(r => r.modul === k);
}
/** Har en bestemt organisasjon modulen? */
export const orgHar = (org: string, k: ModulKey) => k === 'kjerne' || RADER === null || RADER.some(r => r.org_id === org && r.modul === k);
/** Prøveperiode som gjelder modulen for brukerens egen organisasjon */
export const proveTil = (k: string, org = S.primarOrg) => RADER?.find(r => r.org_id === org && r.modul === k)?.prove_til || null;

/** Rute → modul (for menyen og sperret side) */
export const RUTE_MODUL: Record<string, ModulKey> = { prosjekter: 'prosjekter', prosjekt: 'prosjekter', vedlikehold: 'vedlikehold', tilsyn: 'tilsyn', innboks: 'dokumentlesing' };

// ---------- Priser per bruker med rabatttrapp (settes av leverandøren; leses av alle innloggede)
export type Trapp = { fra: number; rabatt: number }[];
export type Priser = { moduler: Record<string, { pris: number | null; min: number | null }>; trapp: Trapp; notat?: string; oppdatert?: string };
export const STD_TRAPP: Trapp = [{ fra: 1, rabatt: 0 }, { fra: 2, rabatt: 10 }, { fra: 6, rabatt: 20 }, { fra: 11, rabatt: 30 }, { fra: 26, rabatt: 40 }];
let PRISER: Priser | null = null;
const normaliser = (v: any): Priser => ({ moduler: v?.moduler || {}, trapp: Array.isArray(v?.trapp) && v.trapp.length ? [...v.trapp].sort((a: any, b: any) => a.fra - b.fra) : STD_TRAPP, notat: v?.notat || '', oppdatert: v?.oppdatert });
export async function lastPriser(): Promise<Priser | null> {
  try { const { data, error } = await sb.from('plattform_innstilling').select('verdi').eq('nokkel', 'priser').maybeSingle(); PRISER = error ? null : normaliser(data?.verdi); } catch { PRISER = null; }
  return PRISER;
}
export const priser = () => PRISER;
export const rabattFor = (P: Priser | null, n: number) => { let r = 0; for (const t of P?.trapp || STD_TRAPP) if (n >= t.fra) r = t.rabatt; return r; };
/** Pris per bruker per måned for modulen ved n brukere: listepris minus rabatt, men aldri under minimumsprisen. null = på forespørsel */
export function prisPerBruker(P: Priser | null, k: string, n: number): number | null {
  const m = P?.moduler?.[k]; if (!m || m.pris === null || m.pris === undefined) return null;
  const r = Math.round(m.pris * (1 - rabattFor(P, n) / 100)); return Math.max(m.min ?? 0, r);
}
export const prisTotal = (P: Priser | null, moduler: string[], n: number) => moduler.reduce((s, k) => s + (prisPerBruker(P, k, n) || 0) * n, 0);
export const kr = (n: number | null | undefined) => n === null || n === undefined || isNaN(n as number) ? '' : Math.round(n).toLocaleString('nb-NO') + ' kr';
