// Når er energivurdering av varme- og klimaanlegg et lovkrav? Energimerkeforskriften for bygninger § 13:
//  a) varmeanlegg med samlet installert effekt over 20 kW – hvert 4. år, over 100 kW hvert 2. år
//  b) klimaanlegg (ventilasjon og/eller kjøling) med samlet installert effekt over 12 kW, eller som samlet betjener
//     mer enn 500 m² oppvarmet bruksareal – hvert 4. år
// Grensene gjelder samlet for bygningen, ikke per anlegg.
type R = { [k: string]: any };
export const VARME_TYPER = ['kjel', 'varmepumpe'];
export const KLIMA_TYPER = ['ventilasjon', 'kjole'];
export type Energikrav = { krav: 'ja' | 'nei' | 'ukjent'; aar: 2 | 4; grunn: string };

const tall = (x: any) => { const n = +String(x ?? '').replace(',', '.'); return Number.isFinite(n) && n > 0 ? n : 0; };
/** «e» er eiendommen, «alle» er systemene på eiendommen, «a» er systemet det spørres om. */
export function energikrav(e: R | undefined, alle: R[], a: R): Energikrav {
  const varme = VARME_TYPER.includes(a.type); const klima = KLIMA_TYPER.includes(a.type);
  if (!varme && !klima) return { krav: 'nei', aar: 4, grunn: '' };
  const gruppe = alle.filter(x => !x.arkivert && (varme ? VARME_TYPER : KLIMA_TYPER).includes(x.type));
  if (!gruppe.some(x => x.id === a.id)) gruppe.push(a);
  const kjent = gruppe.every(x => tall(x.effektKw)); const sum = gruppe.reduce((n, x) => n + tall(x.effektKw), 0); const kW = Math.round(sum * 10) / 10;
  if (varme) {
    if (sum > 100) return { krav: 'ja', aar: 2, grunn: `Varmeanleggene i bygget er på til sammen ${kW} kW (over 100 kW): energivurdering hvert 2. år` };
    if (sum > 20) return { krav: 'ja', aar: 4, grunn: `Varmeanleggene i bygget er på til sammen ${kW} kW (over 20 kW): energivurdering hvert 4. år` + (kjent ? '' : ' – oftere hvis samlet effekt er over 100 kW') };
    if (kjent) return { krav: 'nei', aar: 4, grunn: `Varmeanleggene i bygget er på til sammen ${kW} kW – under grensen på 20 kW` };
    return { krav: 'ukjent', aar: 4, grunn: 'Kravet gjelder når varmeanleggene i bygget til sammen er over 20 kW. Registrer installert effekt (kW) på systemene.' };
  }
  const bta = tall(e?.bta);
  if (sum > 12) return { krav: 'ja', aar: 4, grunn: `Ventilasjons- og kjøleanleggene i bygget er på til sammen ${kW} kW (over 12 kW)` };
  if (bta > 500) return { krav: 'ja', aar: 4, grunn: `Bygget er på ${bta} m² – kravet gjelder når anleggene betjener mer enn 500 m²` };
  if (kjent && bta) return { krav: 'nei', aar: 4, grunn: `Anleggene er på til sammen ${kW} kW og bygget er på ${bta} m² – under grensene på 12 kW og 500 m²` };
  return { krav: 'ukjent', aar: 4, grunn: 'Kravet gjelder når ventilasjons- og kjøleanleggene til sammen er over 12 kW eller betjener mer enn 500 m². Registrer byggets areal (BTA) og installert effekt (kW).' };
}
