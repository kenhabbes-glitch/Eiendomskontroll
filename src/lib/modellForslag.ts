// Foreslår systemer ut fra IFC-modellen: ser på IFC-klasse og navn/type på objektene og grupperer dem per systemtype.
// Rent regelverk i nettleseren – ingenting sendes ut. Forslagene godkjennes av brukeren før noe opprettes.
export type ModellEl = { g: string; k: string; n?: string; t?: string; e?: number };
export type SysForslag = { type: string; guider: string[]; etasjer: number[]; eksempler: string[] };

// Rekkefølgen er viktig: det første som passer vinner
const REGLER: { type: string; klasse?: string[]; tekst?: RegExp }[] = [
  { type: 'rulletrapp', tekst: /rulletrapp|escalator|rullebånd|moving walk/i },
  { type: 'heis', klasse: ['IFCTRANSPORTELEMENT'], tekst: /\bheis\b|heiser|elevator|\blift\b/i },
  { type: 'sprinkler', tekst: /sprinkler/i },
  { type: 'brannspjeld', tekst: /brannspjeld|brannspjæld|fire damper|fire_damper/i },
  { type: 'brannalarm', klasse: ['IFCALARM'], tekst: /røykvarsler|røykdetektor|brannvarsler|brannalarm|brannsentral|smoke detector|fire alarm|manuell melder|brannmelder/i },
  { type: 'nodlys', tekst: /nødlys|ledelys|nødbelysning|rømningsskilt|emergency light|exit sign/i },
  { type: 'slokkere', tekst: /håndslokker|brannslokker|slokkeapparat|fire extinguisher/i },
  { type: 'brannslanger', tekst: /brannslange|slangetrommel|hose reel/i },
  { type: 'varmepumpe', tekst: /varmepumpe|heat pump/i },
  { type: 'kjel', tekst: /\bkjel\b|fyrkjel|pelletskjel|boiler/i },
  { type: 'ventilasjon', tekst: /ventilasjonsaggregat|luftbehandling|\bahu\b|balansert ventilasjon|tilluftsaggregat|aggregat/i },
  { type: 'bereder', tekst: /varmtvannsbereder|\bbereder\b|water heater/i },
  { type: 'eltavle', tekst: /hovedtavle|fordelingstavle|\btavle\b|switchboard|distribution board/i },
  { type: 'branndorer', klasse: ['IFCDOOR'], tekst: /\b(ei|ei2)\s?-?(30|60|90)\b|branndør|branndor|fire door|fire rated|brannklasse/i },
];
const TEKSTKRAV: Record<string, boolean> = { branndorer: true }; // klassen alene er ikke nok – navnet må også passe

export function typeForElement(el: ModellEl): string {
  const tekst = `${el.n || ''} ${el.t || ''}`;
  for (const r of REGLER) {
    const treffTekst = !!r.tekst && r.tekst.test(tekst);
    const treffKlasse = !!r.klasse && r.klasse.includes(el.k);
    if (r.type === 'branndorer') { if (treffKlasse && treffTekst) return r.type; continue; }
    if (treffTekst || (treffKlasse && !TEKSTKRAV[r.type])) return r.type;
  }
  return '';
}

/** Grupperer objektene per systemtype. koblet = objekter som allerede er koblet til et system (hoppes over). */
export function foreslaFraModell(elementer: ModellEl[], koblet: Set<string> = new Set()): SysForslag[] {
  const m = new Map<string, SysForslag>();
  for (const el of elementer) {
    if (!el.g || koblet.has(el.g)) continue; const type = typeForElement(el); if (!type) continue;
    const f = m.get(type) || { type, guider: [], etasjer: [], eksempler: [] }; f.guider.push(el.g);
    if (el.e != null && !f.etasjer.includes(el.e)) f.etasjer.push(el.e);
    const navn = (el.n || el.t || '').trim(); if (navn && f.eksempler.length < 3 && !f.eksempler.includes(navn)) f.eksempler.push(navn);
    m.set(type, f);
  }
  return [...m.values()].sort((a, b) => b.guider.length - a.guider.length);
}
