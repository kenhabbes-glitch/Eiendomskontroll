/** Oppdateringshistorikk. Nyeste øverst. Legg til en ny post når noe nytt slippes – da vises «Nytt i appen» én gang for hver bruker. */
export type Nyhet = { id: string; dato: string; tittel: string; punkter: string[] };
export const NYHETER: Nyhet[] = [
  { id: '2026-11-25', dato: '2026-11-25', tittel: 'Tegninger i fullskjerm og lås mot utilsiktet flytting', punkter: [
    'På mobil åpner tegninger og systemkart nå i fullskjerm, med «Lukk» øverst. Trykk «Verktøy» for å få fram verktøyene og listen.',
    'Klyp med to fingre for å zoome, eller bruk knappene + og − i hjørnet. ⤢ viser hele tegningen igjen.',
    'Trykker du på et system, en komponent eller et avvik, vises detaljene nederst på skjermen.',
    'Små kart i skjemaer og arbeidsordrer har fått en egen fullskjerm-knapp (⛶).',
    'Ny lås (🔒) i hjørnet av tegningen: når den er låst, kan du zoome og flytte rundt med fingrene uten å dra systemer, komponenter eller arealhjørner ut av posisjon ved et uhell. Trykk på låsen for å kunne flytte. På mobil og nettbrett er den låst fra start.',
  ] },
  { id: '2026-11-24', dato: '2026-11-24', tittel: 'Tydeligere «Vis i 3D»', punkter: [
    '«Vis i 3D» på en komponent eller et system åpner modellen med objektene i sterk oransje, synlige gjennom vegger og tak, og med navnet over.',
    'Kameraet flyr mykt inn og ser litt ovenfra på trygg avstand, så du ser hvor i bygget objektet står.',
    'Nederst i modellen: «Zoom til», «Avslutt fokus» og «Gjennomsiktig rundt», som gjør resten av bygget nesten usynlig.',
  ] },
  { id: '2026-11-23', dato: '2026-11-23', tittel: 'Systemer og komponenter fra IFC – koblet til 3D', punkter: [
    'Importen fra IFC lager nå ett system per etasje (f.eks. «Branndører – 2. etasje»), og hver bygningsdel blir en egen komponent i systemet med TFM-kode og løpenummer.',
    'Systemer og komponenter kobles automatisk til objektene i 3D-modellen. Trykk «Vis i 3D» på en komponent for å se akkurat den døra, eller «Vis i modellen» på systemet.',
    'Har modellen TFM-merking (=360.001-JV001) eller fagsystemer (vanlig i RIV- og RIE-modeller), brukes de: komponentene samles i riktig system med riktig kode. Fabrikat og serienummer tas med når modellen har dem.',
    'Ny knapp på 3D-fanen: «Importer systemer og komponenter fra IFC». Komponenter som allerede er importert fra samme objekt, lages ikke på nytt.',
    'Hvert system og hver komponent får forventet levetid (f.eks. vinduer 40 år, dører 30, rekkverk 25, pumper 15) og byggeåret som installasjonsår, slik at de havner riktig i vedlikeholdsplanen. Endre året før import på rader som er skiftet senere.',
  ] },
  { id: '2026-11-22', dato: '2026-11-22', tittel: 'Flere fagmodeller i 3D – slå fag av og på', punkter: [
    'Last opp alle IFC-filene for bygget – ARK, RIB, RIV, RIE, RIBr osv. De settes sammen til én 3D-modell, i riktig posisjon i forhold til hverandre.',
    'Faget gjenkjennes fra filnavnet, og du kan slå hvert fag av og på – f.eks. skjule arkitekten for å se ventilasjon og el-føringer.',
    'Kom det en ny IFC fra et fag? Bruk «Ny versjon». Mål, notater, tegningskoblinger og koblinger til systemer beholdes, og appen sjekker om koblingene finner objektene sine i den nye filen.',
    'Modeller lastet opp tidligere bør lastes opp på nytt med «Ny versjon» dersom du legger til flere fag, slik at de ligger riktig sammen.',
  ] },
  { id: '2026-11-21', dato: '2026-11-21', tittel: 'Store IFC-modeller kan lastes opp', punkter: [
    '3D-modeller pakkes nå 2–3 ganger tettere, slik at de lastes opp og åpnes raskere. Nøyaktigheten er bedre enn 2 mm.',
    'Svært store modeller deles automatisk i flere filer ved lagring, så det er ikke lenger noen grense på 50 MB. Modeller som feilet tidligere kan lastes opp på nytt.',
  ] },
  { id: '2026-11-21', dato: '2026-11-21', tittel: 'Måle og tegne i 3D – og tegninger koblet til modellen', punkter: [
    'Nye verktøy i 3D-modellen: mål avstand (med vannrett og høydeforskjell), areal (også på vegger og skrå flater) og vinkel. Punktene fester seg til nærmeste hjørne. Målene kan lagres i modellen.',
    'Tegn linjer og sett notater direkte i modellen. De lagres, kan skjules og vises for alle som åpner modellen.',
    'Koble en etasjetegning til modellen med to punkter, så vises alle systemer, komponenter og avvik du har plassert på tegningen som markører i 3D. Klikk på en markør for å åpne den.',
    'Ny IFC-modell? Appen sjekker koblingene dine mot den nye modellen, finner dem som har mistet objektet sitt og foreslår riktig nytt objekt (samme merke, navn eller sted).',
  ] },
  { id: '2026-11-20', dato: '2026-11-20', tittel: 'Plassering på tegning i driften – og bytte av tegning', punkter: [
    'Arbeidsordren viser nå et utsnitt av tegningen med systemet, komponenten eller avviket markert. Du kan zoome og flytte i utsnittet, også på mobil.',
    'Avvik kan plasseres (eller flyttes) på tegningen med ett trykk – enten fra arbeidsordren eller fra avviket. Plasseringen vises på planen for alle.',
    'Ny funksjon «Bytt tegning (ny versjon)» på tegningen: last opp oppdatert DWG, PDF eller bilde, så regnes alle plasseringer og oppmålte arealer om automatisk. Er begge DWG, går det av seg selv; ellers peker du på to like punkter. Gammel versjon arkiveres.',
  ] },
  { id: '2026-11-19', dato: '2026-11-19', tittel: '3D-modell av bygget', punkter: [
    'Ny fane «3D-modell» på eiendommen. Last opp IFC-filen (.ifc eller .ifczip), så konverteres den til en kompakt modell som du kan snu, zoome og flytte i – også på mobil og nettbrett.',
    'Vis og skjul etasjer, lag et snitt i valgfri høyde, og klikk på en bygningsdel for å se type, etasje, merke og egenskaper fra IFC-filen. Terreng og omgivelser ligger i en egen gruppe som kan slås på.',
    'Koble bygningsdeler til systemer i appen (alle dører i en etasje på én gang, om du vil). I Status-visning farges de koblede delene etter kontrollstatus, og du kan gå fra et system til «Vis i 3D».',
    'Registrer avvik direkte i modellen. Avviket får en markør på stedet og vises i listen.',
  ] },
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
