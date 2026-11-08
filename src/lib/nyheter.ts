/** Oppdateringshistorikk. Nyeste øverst. Legg til en ny post når noe nytt slippes – da vises «Nytt i appen» én gang for hver bruker. */
export type Nyhet = { id: string; dato: string; tittel: string; punkter: string[] };
export const NYHETER: Nyhet[] = [
  { id: '2026-11-11', dato: '2026-11-11', tittel: 'Toveis meldinger med leietakere', punkter: [
    'Leietakere kan skrive til deg fra portalen, og du kan svare på saker og generelt. Du velger per melding om leietakeren skal se den (ellers er den et internt notat). Se menyvalget Meldinger.',
  ] },
  { id: '2026-11-10', dato: '2026-11-10', tittel: 'Installer som app og bruk i felt', punkter: [
    'Installer appen på mobilen (knapp nederst i menyen) og bruk den som en vanlig app.',
    'Skann QR-koder med kameraet (knapp nederst i menyen).',
    'Nye avvik du registrerer uten nett lagres på enheten og sendes automatisk når du er på nett igjen.',
  ] },
  { id: '2026-11-09', dato: '2026-11-09', tittel: 'Meld avvik med QR-kode og driftsmeldinger', punkter: [
    'Lag meldepunkter under Eiendommer → QR-melding og skriv ut QR-koder til å henge opp i bygget.',
    'Alle som skanner koden kan melde avvik med bilde uten å logge inn. Meldingen kommer inn som avvik med kilde «QR-melding».',
    'Send driftsmeldinger til leietakerne (f.eks. planlagt avstengning). De vises øverst i leietakerportalen.',
  ] },
  { id: '2026-11-08', dato: '2026-11-08', tittel: 'Import, energimerking og tilstandsrapport', punkter: [
    'Importer systemer fra Excel eller CSV (Dalux, Plania, Facilit, Propely eller egen liste). Du kobler kolonnene selv.',
    'Energiattest og energimerking kan legges inn som system med levetid.',
    'Tilstandsrapport i NS 3424-format kan lages som PDF fra vedlikeholdsplanen.',
    'Organisasjonsnummer er valgfritt ved registrering. Prøveperioden starter når det legges inn.',
    'PDF og Excel følger mottakerens språk.',
  ] },
];
const nokkel = (uid: string) => 'ek_nyheter_sett_' + uid;
export function sistSett(uid: string): string { try { return localStorage.getItem(nokkel(uid)) || ''; } catch { return ''; } }
export function merkSett(uid: string) { try { localStorage.setItem(nokkel(uid), NYHETER[0]?.id || ''); } catch { } }
