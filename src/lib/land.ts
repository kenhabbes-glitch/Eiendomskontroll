// Landpakker: hvilket regelverk som gjelder for en eiendom. Land settes per eiendom (data.land, standard Norge),
// og for Mexico også delstat (data.region). Kjernen i appen er lik; det som varierer er kontrollmaler, eiers og
// leietakers plikter, påkrevde dokumenter, tilsynsmyndigheter, valuta og prisindeks. Hver landpakke ligger i
// src/lib/land/<kode>.ts med formen i land/pakke.ts.
import { S } from './store';
import { DOK_PAAKREVD, KOMP, MALER, PLIKTER, PROP_MALER, STD_PLIKTER, DOK_TYPER } from './catalog';
import { TILSYN_KILDER, MYND } from './tilsyn';
import { PAKKE_MX, REGIONER_MX } from './land/mx';
import { PAKKE_SE } from './land/se';
import { PAKKE_DK } from './land/dk';
import type { Pakke } from './land/pakke';

export type Land = 'NO' | 'SE' | 'DK' | 'MX';
export const LAND: { k: Land; navn: string; valuta: string; tegn: string; indeks: string; lokale: string; regioner?: [string, string][] }[] = [
  { k: 'NO', navn: 'Norge', valuta: 'NOK', tegn: 'kr', indeks: 'KPI', lokale: 'nb-NO' },
  { k: 'SE', navn: 'Sverige', valuta: 'SEK', tegn: 'kr', indeks: 'KPI', lokale: 'sv-SE' },
  { k: 'DK', navn: 'Danmark', valuta: 'DKK', tegn: 'kr.', indeks: 'NPI', lokale: 'da-DK' },
  { k: 'MX', navn: 'México', valuta: 'MXN', tegn: '$', indeks: 'INPC', lokale: 'es-MX', regioner: REGIONER_MX },
];
export const PAKKER: Partial<Record<Land, Pakke>> = { SE: PAKKE_SE, DK: PAKKE_DK, MX: PAKKE_MX };
export const landInfo = (l?: string) => LAND.find(x => x.k === l) || LAND[0];
export const pakke = (l?: string): Pakke | undefined => PAKKER[l as Land];

// Utenlandske maler og plikter ligger i samme katalog (egne nøkler), så oppslag på lagrede kontroller og plikter virker overalt
for (const p of Object.values(PAKKER)) { Object.assign(MALER, p!.maler); Object.assign(PLIKTER, p!.plikter); p!.dok.forEach(t => { if (!DOK_TYPER.includes(t)) DOK_TYPER.push(t); }); }
const PREFIKS = Object.keys(PAKKER).map(l => l.toLowerCase() + '_');
const erUtenlandsk = (k: string) => PREFIKS.some(p => k.startsWith(p));

export const landFor = (eid?: string): Land => ((eid && S.eiendommer.find(e => e.id === eid)?.land) || 'NO') as Land;
export const regionFor = (eid?: string) => (eid && S.eiendommer.find(e => e.id === eid)?.region) || '';

/** Faste kontroller på eiendomsnivå */
export function propMaler(eid?: string): string[] {
  const l = landFor(eid); const p = pakke(l); if (!p) return PROP_MALER;
  const r = regionFor(eid) || (l === 'MX' ? 'CDMX' : ''); return p.prop.filter(x => !x.region || x.region.includes(r)).map(x => x.k);
}
/** Kontroller for en systemtype */
export const kompMaler = (type: string, eid?: string): string[] => { const p = pakke(landFor(eid)); return p ? p.komp[type] || [] : KOMP[type]?.m || []; };
export const stdPlikter = (land: Land) => pakke(land)?.stdPlikter || STD_PLIKTER;
export const virksomhetPlikter = (land: Land, virksomhet?: string) => (virksomhet && pakke(land)?.pliktVirksomhet?.[virksomhet]) || [];
export const dokPaakrevd = (eid?: string) => pakke(landFor(eid))?.dokPaakrevd || DOK_PAAKREVD;
export const tilsynKilder = (eid?: string) => pakke(landFor(eid))?.tilsyn || TILSYN_KILDER;
export const alleTilsynKilder = [...TILSYN_KILDER, ...Object.values(PAKKER).flatMap(p => p!.tilsyn)];
export const myndighet = (kilde: string) => MYND[kilde] || Object.values(PAKKER).map(p => p!.mynd[kilde]).find(Boolean) || '';
export const kilderFor = (land: Land) => pakke(land)?.kilder || [];
export const malerForLand = (land: Land) => { const pre = land.toLowerCase() + '_'; return Object.fromEntries(Object.entries(MALER).filter(([k]) => land === 'NO' ? !erUtenlandsk(k) : k.startsWith(pre))); };
export const plikterForLand = (land: Land) => { const pre = land.toLowerCase() + '_'; return Object.entries(PLIKTER).filter(([k]) => land === 'NO' ? !erUtenlandsk(k) : k.startsWith(pre)).map(([, p]) => p); };

/** Landene brukeren har eiendommer i (for regelverkssiden og valuta) */
export const mineLand = (): Land[] => { const s = new Set<Land>(S.eiendommer.map(e => (e.land || 'NO') as Land)); return s.size ? [...s] : ['NO']; };
/** Valuta som vises når beløp ikke er knyttet til én eiendom: landet de fleste eiendommene ligger i */
export function hovedLand(): Land { const t: Record<string, number> = {}; S.eiendommer.forEach(e => { const l = e.land || 'NO'; t[l] = (t[l] || 0) + 1; }); return ((Object.entries(t).sort((a, b) => b[1] - a[1])[0] || ['NO'])[0]) as Land; }
export const valutaTegn = (eid?: string) => landInfo(eid ? landFor(eid) : hovedLand()).tegn;
export const indeksNavn = (eid?: string) => landInfo(eid ? landFor(eid) : hovedLand()).indeks;
