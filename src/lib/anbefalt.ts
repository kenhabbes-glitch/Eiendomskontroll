// Anbefalt automatikk: hvilke automatiske løp som finnes, om de er på, og hvordan de slås på med standardverdier.
// Brukes av kortet «Anbefalt automatikk» i Innstillinger og av serveren når en ny organisasjon opprettes. Ingen avhengigheter.
export type AutoPunkt = { id: string; nokkel: string; flagg: string; navn: string; hva: string; sendtTilAndre: boolean };
export const AUTOMATIKK: AutoPunkt[] = [
  { id: 'purring', nokkel: 'avvikPurring', flagg: 'ansvarlig', navn: 'Purring på avvik', hva: 'Påminnelse før frist og purring etter frist til den som skal utbedre', sendtTilAndre: true },
  { id: 'eskalering', nokkel: 'avvikPurring', flagg: 'eier', navn: 'Eskalering til eier', hva: 'Samlet e-post om avvik som har passert fristen med to uker', sendtTilAndre: false },
  { id: 'avvikuke', nokkel: 'avvikPurring', flagg: 'ukentlig', navn: 'Ukentlig avviksoversikt', hva: 'Mandags-e-post med avvik som har frist innen 14 dager eller er over frist', sendtTilAndre: false },
  { id: 'ukeoversikt', nokkel: 'eierOversikt', flagg: 'pa', navn: 'Ukeoversikt til eier', hva: 'Forfalte og kommende kontroller, utløpende dokumenter og avvik over frist', sendtTilAndre: false },
  { id: 'leietakerrunde', nokkel: 'ltRunde', flagg: 'pa', navn: 'Leietaker-runde', hva: 'Sjekkliste til alle leietakere hvert år (15. januar), med purring', sendtTilAndre: true },
  { id: 'fornyelse', nokkel: 'dokFornyelse', flagg: 'pa', navn: 'Fornyelse av dokumenter', hva: 'Ber om nytt dokument 90, 30 og 0 dager før utløp', sendtTilAndre: true },
  { id: 'leievakt', nokkel: 'leieVakt', flagg: 'pa', navn: 'Leieavtale-vakt', hva: 'Varsler om avtaleutløp, oppsigelsesfrist og indeksregulering', sendtTilAndre: false },
];
export type InnstAlle = Record<string, any>;

export const erPa = (p: AutoPunkt, innst: InnstAlle) => !!innst?.[p.nokkel]?.[p.flagg];

/** Ny verdi for innstillingen: eksisterende verdier beholdes, bare bryteren slås på */
export function slaPaData(p: AutoPunkt, eksisterende: any, idag: string) {
  const d: any = { ...(eksisterende || {}), [p.flagg]: true };
  if (p.nokkel === 'ltRunde' && !d.aktivert) d.aktivert = idag; // første runde kommer ved neste planlagte dato, ikke bakover i tid
  return d;
}

/** Slår på de valgte punktene (id-er) og returnerer ferdige verdier per innstillingsnøkkel – bare nøkler som er endret */
export function slaPa(valgte: string[], innst: InnstAlle, idag: string): Record<string, any> {
  const ut: Record<string, any> = {};
  for (const p of AUTOMATIKK) if (valgte.includes(p.id) && !erPa(p, { ...innst, ...ut })) ut[p.nokkel] = slaPaData(p, ut[p.nokkel] ?? innst?.[p.nokkel], idag);
  return ut;
}

/** Oppsett for en ny organisasjon: alt på. «bareIntern» hopper over det som sender til leietakere og leverandører. */
export function oppsettForNyOrg(idag: string, bareIntern = false): Record<string, any> {
  return slaPa(AUTOMATIKK.filter(p => !(bareIntern && p.sendtTilAndre)).map(p => p.id), {}, idag);
}
