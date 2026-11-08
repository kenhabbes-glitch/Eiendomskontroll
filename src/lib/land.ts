// Landpakker: hvilket regelverk som gjelder for en eiendom. Land settes per eiendom (data.land, standard Norge),
// og for Mexico også delstat (data.region). Kjernen i appen er lik; det som varierer er kontrollmaler, eiers og
// leietakers plikter, påkrevde dokumenter, tilsynsmyndigheter, valuta og prisindeks.
import { S } from './store';
import { DOK_PAAKREVD, KOMP, MALER, PLIKTER, PROP_MALER, STD_PLIKTER, DOK_TYPER } from './catalog';
import { TILSYN_KILDER, MYND } from './tilsyn';
import { DOK_MX, DOK_MX_PAAKREVD, KILDER_MX, KOMP_MX, MALER_MX, MYND_MX, PLIKTER_MX, PROP_MX, REGIONER_MX, STD_PLIKTER_MX, TILSYN_MX } from './land/mx';

export type Land = 'NO' | 'MX';
export const LAND: { k: Land; navn: string; valuta: string; tegn: string; indeks: string; lokale: string; regioner?: [string, string][] }[] = [
  { k: 'NO', navn: 'Norge', valuta: 'NOK', tegn: 'kr', indeks: 'KPI', lokale: 'nb-NO' },
  { k: 'MX', navn: 'México', valuta: 'MXN', tegn: '$', indeks: 'INPC', lokale: 'es-MX', regioner: REGIONER_MX },
];
export const landInfo = (l?: string) => LAND.find(x => x.k === l) || LAND[0];

// Meksikanske maler og plikter ligger i samme katalog (egne nøkler), så oppslag på lagrede kontroller og plikter virker overalt
Object.assign(MALER, MALER_MX); Object.assign(PLIKTER, PLIKTER_MX);
DOK_MX.forEach(t => { if (!DOK_TYPER.includes(t)) DOK_TYPER.push(t); });

export const landFor = (eid?: string): Land => ((eid && S.eiendommer.find(e => e.id === eid)?.land) || 'NO') as Land;
export const regionFor = (eid?: string) => (eid && S.eiendommer.find(e => e.id === eid)?.region) || '';

/** Faste kontroller på eiendomsnivå */
export function propMaler(eid?: string): string[] {
  if (landFor(eid) === 'MX') { const r = regionFor(eid) || 'CDMX'; return PROP_MX.filter(p => !p.region || p.region.includes(r)).map(p => p.k); }
  return PROP_MALER;
}
/** Kontroller for en systemtype */
export const kompMaler = (type: string, eid?: string): string[] => landFor(eid) === 'MX' ? KOMP_MX[type] || [] : KOMP[type]?.m || [];
export const stdPlikter = (land: Land) => land === 'MX' ? STD_PLIKTER_MX : STD_PLIKTER;
export const dokPaakrevd = (eid?: string) => landFor(eid) === 'MX' ? DOK_MX_PAAKREVD : DOK_PAAKREVD;
export const tilsynKilder = (eid?: string) => landFor(eid) === 'MX' ? TILSYN_MX : TILSYN_KILDER;
export const alleTilsynKilder = [...TILSYN_KILDER, ...TILSYN_MX];
export const myndighet = (kilde: string) => MYND[kilde] || MYND_MX[kilde] || '';
export const kilderFor = (land: Land) => land === 'MX' ? KILDER_MX : [];
export const malerForLand = (land: Land) => Object.fromEntries(Object.entries(MALER).filter(([k]) => land === 'MX' ? k.startsWith('mx_') : !k.startsWith('mx_')));

/** Landene brukeren har eiendommer i (for regelverkssiden og valuta) */
export const mineLand = (): Land[] => { const s = new Set<Land>(S.eiendommer.map(e => (e.land || 'NO') as Land)); return s.size ? [...s] : ['NO']; };
/** Valuta som vises når beløp ikke er knyttet til én eiendom: landet de fleste eiendommene ligger i */
export function hovedLand(): Land { const t: Record<string, number> = {}; S.eiendommer.forEach(e => { const l = e.land || 'NO'; t[l] = (t[l] || 0) + 1; }); return ((Object.entries(t).sort((a, b) => b[1] - a[1])[0] || ['NO'])[0]) as Land; }
export const valutaTegn = (eid?: string) => landInfo(eid ? landFor(eid) : hovedLand()).tegn;
export const indeksNavn = (eid?: string) => landInfo(eid ? landFor(eid) : hovedLand()).indeks;
