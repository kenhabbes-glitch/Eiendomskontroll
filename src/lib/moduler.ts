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

// ---------- Priser per bygg og per bruker med rabatttrapper (settes av leverandøren; leses av alle innloggede)
export type Trapp = { fra: number; rabatt: number }[];
export type ModulPris = { pris: number | null; min: number | null; prisBygg?: number | null; minBygg?: number | null };
export type Priser = { moduler: Record<string, ModulPris>; trapp: Trapp; trappBygg: Trapp; notat?: string; oppdatert?: string };
export type Enhet = 'bruker' | 'bygg';
export const STD_TRAPP: Trapp = [{ fra: 1, rabatt: 0 }, { fra: 2, rabatt: 10 }, { fra: 6, rabatt: 20 }, { fra: 11, rabatt: 30 }, { fra: 26, rabatt: 40 }];
export const STD_TRAPP_BYGG: Trapp = [{ fra: 1, rabatt: 0 }, { fra: 6, rabatt: 10 }, { fra: 21, rabatt: 20 }, { fra: 51, rabatt: 30 }];
let PRISER: Priser | null = null;
const sorter = (t: any, std: Trapp) => Array.isArray(t) && t.length ? [...t].sort((a: any, b: any) => a.fra - b.fra) : std;
const normaliser = (v: any): Priser => ({ moduler: v?.moduler || {}, trapp: sorter(v?.trapp, STD_TRAPP), trappBygg: sorter(v?.trappBygg, STD_TRAPP_BYGG), notat: v?.notat || '', oppdatert: v?.oppdatert });
export async function lastPriser(): Promise<Priser | null> {
  try { const { data, error } = await sb.from('plattform_innstilling').select('verdi').eq('nokkel', 'priser').maybeSingle(); PRISER = error ? null : normaliser(data?.verdi); } catch { PRISER = null; }
  return PRISER;
}
export const priser = () => PRISER;
export const trappFor = (P: Priser | null, e: Enhet) => e === 'bygg' ? (P?.trappBygg || STD_TRAPP_BYGG) : (P?.trapp || STD_TRAPP);
export const rabattFor = (P: Priser | null, n: number, e: Enhet = 'bruker') => { let r = 0; for (const t of trappFor(P, e)) if (n >= t.fra) r = t.rabatt; return r; };
/** Pris per enhet (bruker eller bygg) per måned ved n enheter: listepris minus rabatt, aldri under minimum. Bare minimum satt = fast pris. null = ikke priset */
export function prisPer(P: Priser | null, k: string, n: number, e: Enhet): number | null {
  const m = P?.moduler?.[k]; if (!m) return null;
  const pris = e === 'bygg' ? m.prisBygg : m.pris; const min = e === 'bygg' ? m.minBygg : m.min;
  if (pris === null || pris === undefined) return min === null || min === undefined ? null : min;
  return Math.max(min ?? 0, Math.round(pris * (1 - rabattFor(P, n, e) / 100)));
}
export const prisPerBruker = (P: Priser | null, k: string, n: number) => prisPer(P, k, n, 'bruker');
/** Har modulen en pris i det hele tatt (per bygg eller per bruker)? */
export const harPris = (P: Priser | null, k: string) => prisPer(P, k, 1, 'bruker') !== null || prisPer(P, k, 1, 'bygg') !== null;
/** Månedspris for modulen ved nU brukere og nB bygg */
export const modulPris = (P: Priser | null, k: string, nU: number, nB: number) => (prisPer(P, k, nU, 'bruker') || 0) * nU + (prisPer(P, k, nB, 'bygg') || 0) * nB;
export const prisTotal = (P: Priser | null, moduler: string[], nU: number, nB = 0) => moduler.reduce((s, k) => s + modulPris(P, k, nU, nB), 0);
export const kr = (n: number | null | undefined) => n === null || n === undefined || isNaN(n as number) ? '' : Math.round(n).toLocaleString('nb-NO') + ' kr';
/** Antall bygg en organisasjon eier i appen */
export const byggFor = (org: string) => S.eiendommer.filter(e => e.eierOrgId === org).length;
/** Hva ett bygg til koster per måned for organisasjonen (betalte moduler, ikke prøve). 0 = ingen kostnad/ukjent */
export function byggTillegg(org: string): number {
  if (!PRISER || RADER === null || !org) return 0;
  const o = S.orgs.find(x => x.id === org); const nU = o?.lisenser || Math.max(1, S.medlemmer.filter(m => m.org_id === org && m.aktiv).length); const nB = byggFor(org);
  const M = MODULER.filter(m => orgHar(org, m.k) && !proveTil(m.k, org)).map(m => m.k);
  return Math.max(0, prisTotal(PRISER, M, nU, nB + 1) - prisTotal(PRISER, M, nU, nB));
}
