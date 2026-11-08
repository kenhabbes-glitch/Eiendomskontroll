// Felles form for en landpakke. Nøklene i maler og plikter har landets prefiks (mx_, se_, dk_), så de kan ligge
// i samme katalog som de norske og lagrede kontroller/plikter slås opp på samme måte overalt.
import type { Mal } from '../catalog';

export type Kilde = { navn: string; lenke: string; niva: string; sjekk?: 'nom' | 'ley' | 'side' | 'manuell' };
export type Pakke = {
  maler: Record<string, Mal>;
  /** Faste kontroller på eiendomsnivå; region begrenser til delstater/regioner */
  prop: { k: string; region?: string[] }[];
  /** Systemtype (KOMP-nøkkel) → kontroller */
  komp: Record<string, string[]>;
  plikter: Record<string, { n: string; h: string; dok?: string[] }>;
  stdPlikter: string[];
  /** Ekstra plikter for virksomhetstype (som i leieavtalen) */
  pliktVirksomhet?: Record<string, string[]>;
  dok: string[];
  dokPaakrevd: string[];
  tilsyn: string[];
  mynd: Record<string, string>;
  kilder: Kilde[];
  /** Oversikt på regelverkssiden (statisk innhold, trygt som HTML) */
  sek: [string, string[]][];
  /** Hvilke seksjoner leietakere ser */
  sekLeietaker?: string[];
  merknad: string;
};
