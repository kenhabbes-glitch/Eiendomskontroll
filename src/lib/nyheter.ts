/** Oppdateringshistorikk. Nyeste øverst. Legg til en ny post når noe nytt slippes – da vises «Nytt i appen» én gang for hver bruker. */
export type Nyhet = { id: string; dato: string; tittel: string; punkter: string[] };
export const NYHETER: Nyhet[] = [
  { id: '2026-11-18', dato: '2026-11-18', tittel: 'Brannbok', punkter: [
    'Ny fane «Brannbok» på eiendommen: samler brannsikkerheten i syv–åtte kapitler (ansvar, bygg, installasjoner, kontroll, avvik, leietakere, fyring, årlig gjennomgang) fra data som allerede finnes. Hvert kapittel får status «I orden», «Følg opp» eller «Mangler».',
    'Del brannboken med brannvesenet via en lenke uten innlogging. Lenken har utløpsdato, kan sendes på e-post og trekkes tilbake. Du ser når den er åpnet.',
    'Brannvesenet kan legge inn merknader under hvert kapittel eller samlet nederst. Du får e-post, kan svare og lukke merknadene, og svarene vises for mottakeren.',
    'Brannboken kan lastes ned som PDF med statusside, alle kapitler og dokumentene som vedlegg. Registrer årlig gjennomgang direkte i fanen.',
  ] },
  { id: '2026-11-17', dato: '2026-11-17', tittel: 'Signerte nøkkelskjemaer og nøkkelrapport', punkter: [
    'Last opp det signerte utkvitteringsskjemaet (PDF eller bilde fra mobilen). Det lagres på utkvitteringen og vises på hver nøkkel og i nøkkelens historikk.',
    'Ny «Nøkkelrapport per leietaker»: PDF med alle nøkler leietakeren har ute, fordelt på type, med de signerte skjemaene som vedlegg. Velg leietaker ved utkvittering, så kobles nøklene til leietakeren.',
    'Utkvitteringsskjemaer kan åpnes igjen («Åpne skjema») og sendes på nytt på e-post («Send på nytt»), med skjemaet som PDF og eventuelt den signerte kopien.',
  ] },
  { id: '2026-11-16', dato: '2026-11-16', tittel: 'Nytt utseende på utskrifter', punkter: [
    'Nøkkelkvitteringer, arbeidsordre og PDF-rapportene (tilstand, areal, befaring, brannvern, capex, eier- og prosjektrapporter) har fått felles utseende: utleiers navn i et farget bånd øverst, og «Side x av y» nederst.',
  ] },
  { id: '2026-11-15', dato: '2026-11-15', tittel: 'Nøkkeladministrasjon', punkter: [
    'Nytt menyvalg «Nøkler»: opprett nøkkelsystemer (f.eks. 1SL 1058) med nøkkeltyper (HN, K1, K2 …), låsplan og nummererte nøkler.',
    'Utkvitter nøkler til en person og skriv ut skjema med system, type, løpenummer og regler. Ved innlevering får personen en returkvittering. Under «Hvem har nøkler» ser du alt som er ute.',
  ] },
  { id: '2026-11-14', dato: '2026-11-14', tittel: 'Import fra BIM-modell (IFC)', punkter: [
    'Last opp en IFC-modell (.ifc eller .ifczip) under «Importer systemer». Appen leser vinduer, dører, fasader, trapper, rekkverk og tekniske komponenter med etasje og NS 3451-kode, og foreslår systemer du kontrollerer før de lagres.',
  ] },
  { id: '2026-11-13', dato: '2026-11-13', tittel: 'Saksnummer for alle leietakersaker', punkter: [
    'Leietaker trykker «Meld ny sak» og får et saksnummer (samme som arbeidsordre-nr). Samtaler er knyttet til saken, sorteres etter saksnummer og kan søkes.',
  ] },
  { id: '2026-11-12', dato: '2026-11-12', tittel: 'Koble på vaktmester eller servicefirma i meldinger', punkter: [
    'Du kan koble en bruker (vaktmester, servicefirma) på en samtale, og velge per melding om den skal være synlig for alle, bare for utleier og ressurser, eller internt. Samtalen kan overføres til en arbeidsordre.',
  ] },
  { id: '2026-11-11', dato: '2026-11-11', tittel: 'Toveis meldinger med leietakere', punkter: [
    'Leietakere kan skrive til deg fra portalen, og du kan svare på saker og generelt. Du velger per melding om leietakeren skal se den (ellers er den et internt notat). Se menyvalget Meldinger.',
    'Bilder og dokumenter kan legges ved meldingene.',
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
