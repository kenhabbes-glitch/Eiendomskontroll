/** Oppdateringshistorikk. Nyeste øverst. Legg til en ny post når noe nytt slippes – da vises «Nytt i appen» én gang for hver bruker. */
export type Nyhet = { id: string; dato: string; tittel: string; punkter: string[] };
export const NYHETER: Nyhet[] = [
  { id: '2026-12-22', dato: '2026-12-22', tittel: 'Forhåndsvis brannvernpakken', punkter: [
    'Under Brannvern kan du nå trykke «Forhåndsvis» for å se brannvernpakken til en leietaker i en ny fane før du sender den. Ingenting lagres eller sendes.',
  ] },
  { id: '2026-12-21', dato: '2026-12-21', tittel: 'Samordningsavtale telles nå i Brannvern', punkter: [
    'Samordningsavtale som er lastet opp under leietakerens plikter vises nå som «Registrert» i Brannvern og tas med i Brannboken.',
  ] },
  { id: '2026-12-20', dato: '2026-12-20', tittel: 'Sjekklister for samordning og eiers internkontroll', punkter: [
    'Kontrollene «Samordning med leietakere (brann og HMS) – årlig møte/gjennomgang» og «Eiers internkontroll – årlig gjennomgang» har nå hver sin sjekkliste. Den vises når du kvitterer ut, og punktene svares OK, Avvik eller I.R.',
  ] },
  { id: '2026-12-19', dato: '2026-12-19', tittel: 'Sjekkliste for branntekniske dokumentasjon', punkter: [
    'Kontrollen «Brannteknisk dokumentasjon og branntegninger – årlig gjennomgang» har nå en sjekkliste med 11 punkter (brannkonsept, branntegninger, rømningsplaner, slokkeutstyr, installasjoner, ansvar, innsatsopplysninger og mer). Den vises både når du kvitterer ut i appen og i lenken til den som utfører.',
    'Hvert punkt svares OK, Avvik eller I.R. Avvik i sjekklisten gjør at resultatet blir «Avvik funnet», og de tas med i avviksoppfølgingen.',
  ] },
  { id: '2026-12-18', dato: '2026-12-18', tittel: 'Last opp flere dokumenter samtidig', punkter: [
    'Ny knapp «Last opp flere filer» på Dokumenter. Velg eller dra inn mange filer samtidig, velg eiendom og dokumenttype én gang, og hver fil blir et eget dokument. Tittelen foreslås ut fra filnavnet, og du kan rette den før opplasting.',
    'I dokumentdekningen kan du nå legge til flere dokumenter under samme kategori med «+ flere». Når det finnes mer enn ett dokument av en type, vises antallet (for eksempel ×3), og et klikk på cellen viser alle dokumentene i en liste.',
  ] },
  { id: '2026-12-17', dato: '2026-12-17', tittel: 'Sikkerhetskopi som fil', punkter: [
    'Under Import og eksport lager «Eksporter alle data» nå en JSON-fil direkte. I Chrome og Edge åpnes lagringsdialogen, så du velger selv hvor filen skal ligge. I andre nettlesere lastes filen ned til nedlastingsmappen. Du slipper å kopiere tekst.',
  ] },
  { id: '2026-12-16', dato: '2026-12-16', tittel: 'Flere bygningsdeler å velge mellom', punkter: [
    'Typelisten har fått 25 nye bygningsdeler, blant annet innvendige dører, trapper, rekkverk, himlinger, glassfasade, innervegger, dekker, fundament, innredning, pumper, vifter, stikkontakter, kamera, terreng og uthus. Færre ting havner i «Annet».',
    'Ved IFC-import velges riktig type nå automatisk for innvendige dører, trapper, rekkverk, himlinger, innredning, pumper, vifter, lamper og tavler. Uspesifiserte objekter får type ut fra navnet, for eksempel servant eller gelender.',
    'I importtabellen er typelisten delt inn i grupper (Bygning, VVS, Elkraft …), så det er lettere å finne riktig bygningsdel.',
  ] },
  { id: '2026-12-15', dato: '2026-12-15', tittel: 'Importer systemer fra opplastede IFC-filer', punkter: [
    'IFC-importen er forbedret: riktig etasje også for objekter inne i rom, tekniske komponenter sorteres i riktig system (heis, sprinkler, ventilasjon, brannalarm …), og elektro- og kjøleutstyr som tidligere ble hoppet over, kommer nå med. Samme IFC-objekt opprettes aldri to ganger på et bygg.',
    'Ny knapp «Fjern IFC-importerte data» på 3D-siden fjerner komponenter og systemer en tidligere IFC-import opprettet, så du kan importere på nytt. Avvik, dokumenter, utførte kontroller og det du har lagt inn selv, blir værende.',
    'Når du har lastet opp IFC-filene til et bygg, trykker du «Importer systemer fra opplastede IFC-filer» på 3D-siden. Appen leser alle fagmodellene på bygget og foreslår systemer og komponenter, så du slipper å velge filene på nytt.',
  ] },
  { id: '2026-12-14', dato: '2026-12-14', tittel: 'Gårdeiere kan opprette egne bygg (valgfritt)', punkter: [
    'Gårdeiere som kan opprette egne bygg får nå full meny (leietakere, målere, TFM-register, kontrollrunde m.m.) og snarveier på mobil, så lenge de har redigeringsrett på minst ett bygg.',
    'Administrator kan under Organisasjon og tilgang slå på «La gårdeiere opprette egne bygg». Da får gårdeiere knappen «+ Ny eiendom» og full redigering på byggene de selv oppretter. På andre bygg har de fortsatt bare lesetilgang.',
  ] },
  { id: '2026-12-13', dato: '2026-12-13', tittel: 'Beredskapsplan og risikovurdering', punkter: [
    'Ny fane «Beredskap» på hver eiendom, for eier og drift. Her fyller du ut beredskapsplanen (kontakter, varsling, evakuering, stenging av vann og strøm, tiltak per hendelse) og skriver den ut som PDF.',
    'Risikoregisteret har standardrisikoer for brann, vann og tekniske feil, innbrudd og hærverk, ekstremvær og personsikkerhet. Du vurderer sannsynlighet og konsekvens, og ser alt i en risikomatrise.',
    'Plan, øvelse og risikovurdering har årlig frist. Fanen viser et tall når noe er forfalt eller har høy risiko uten tiltak, og du kan lage en kontroll i kontrollplanen fra hvert tiltak.',
  ] },
  { id: '2026-12-12', dato: '2026-12-12', tittel: 'Diktering i avviksskjemaet', punkter: [
    'Ved kort beskrivelse, beskrivelse og tiltak, plassering i tekst og kommentar finnes det nå en mikrofonknapp. Trykk, snakk, og trykk igjen for å stoppe. Teksten legges inn i feltet, og du kan rette den etterpå. Lyden behandles av nettleserens talegjenkjenning (Google i Chrome og Edge, Apple i Safari), ikke av appen.',
  ] },
  { id: '2026-12-11', dato: '2026-12-11', tittel: 'Ny rolle: Gårdeier', punkter: [
    'Under Organisasjon og tilgang kan du nå legge til brukere som Gårdeier. En gårdeier eier ett bygg, en portefølje eller flere, og ser bare de byggene du tildeler (eller alle). Vedkommende kan se oversikt, avvik, kontroller og dokumenter, men ikke endre noe.',
    'Gårdeieren får sin egen ukeoversikt på e-post med bare sine bygg, og kan slå på push-varsler for kritiske saker på sin profilside.',
  ] },
  { id: '2026-12-10', dato: '2026-12-10', tittel: 'Ny mobilmeny', punkter: [
    'På mobil har appen nå en meny nederst med fem store knapper som følger rollen din: eier, forvalter, vaktmester, utførende og leietaker får hver sin. Resten av sidene ligger under «Mer», med søk, sist brukte sider og store fliser.',
    'På forsiden ligger store knapper for Nytt avvik, Skann QR og Kontrollrunde, så du slipper å lete når du er ute på eiendommen. PC-menyen er uendret.',
  ] },
  { id: '2026-12-09', dato: '2026-12-09', tittel: 'Push-varsler på telefon og PC', punkter: [
    'Under Innstillinger → «Varsler på denne enheten» kan du slå på varsler. Da får du beskjed med en gang en sak meldes som kritisk, når leietakere eller QR-koder melder nye saker, og når ukeoversikten er sendt.',
    'Hver enhet slås på for seg, og du velger selv hvilke varsler som skal komme. På iPhone og iPad må appen først legges til på Hjem-skjermen.',
  ] },
  { id: '2026-12-08', dato: '2026-12-08', tittel: 'Hastemeldinger heves automatisk', punkter: [
    'Når en leietaker eller en QR-melding nevner tydelige faresignaler (røyk, brent lukt, gasslukt, vann fra taket, blokkert rømningsvei …) hever appen alvorligheten til Kritisk. Ord som lekkasje, nødlys som ikke virker og heis som står gir minst Høy.',
    'Appen hever bare opp, aldri ned, og skriver det i loggen og som en advarsel i avviket, så du kan rette det hvis det ble feil.',
  ] },
  { id: '2026-12-07', dato: '2026-12-07', tittel: 'Raskere avvik med to trykk', punkter: [
    'I «Nytt avvik» trykker du nå to ganger: hva som er feil (flekk, hakk, sprekk, lekkasje, løs …) og hvor (tak, vegg, gulv, list, dør …). Appen setter tittel, alvorlighet og system for deg. Det du selv har skrevet blir ikke overskrevet.',
    'Har bildet tekst på seg (skilt, typeskilt), kan du også trykke «Les tekst på bildet» for forslag til system og rom. Ingenting fylles ut før du trykker «Bruk forslag».',
    'Dette er ordgjenkjenning, ikke bildetolkning: appen ser ikke selve motivet. Skriv derfor gjerne noen ord om hva som er feil, så blir forslaget bedre. Alt skjer i nettleseren, og bildet sendes ikke til noen AI-tjeneste.',
  ] },
  { id: '2026-12-06', dato: '2026-12-06', tittel: 'Systemer foreslått fra 3D-modellen', punkter: [
    'I 3D-modellen finner du «Foreslå systemer fra modellen». Appen leser klasse og navn på objektene (heis, sprinkler, brannalarm, branndører, ventilasjon, tavler m.m.) og foreslår systemer. Du godkjenner, og systemene opprettes og kobles til objektene i modellen.',
    'Du får deretter forslag til lovpålagte kontroller for de nye systemene. Gjenkjenningen avhenger av hvordan objektene er navngitt i modellen.',
  ] },
  { id: '2026-12-05', dato: '2026-12-05', tittel: 'Ett dokument kan gjelde flere systemer', punkter: [
    'I Dokumentinnboksen kan du nå knytte ett dokument (f.eks. en FDV-perm eller serviceavtale) til flere systemer. Systemer som nevnes i dokumentet foreslås, og du godkjenner dem selv.',
    'Dokumentet teller da som FDV for alle valgte systemer i lovkravoversikten.',
  ] },
  { id: '2026-12-04', dato: '2026-12-04', tittel: 'Ukeoversikt til eier på e-post', punkter: [
    'Under Innstillinger → Ukeoversikt til eier kan du slå på én samlet e-post med kontroller og service som er forfalt eller forfaller snart, dokumenter som utløper og avvik over frist. Den sendes bare når det er noe å melde, og er av som standard.',
    'Bruk «Send en nå (test)» for å se hvordan den ser ut. E-posten går via e-postoppsettet du allerede har.',
  ] },
  { id: '2026-12-03', dato: '2026-12-03', tittel: 'FDV telles per system', punkter: [
    'FDV-dokumentasjon er ikke ett dokument, men dokumentasjon for hvert anlegg som følger bygget gjennom hele levetiden. Lovkravet viser nå «Delvis» og hvor mange systemer som har FDV, og lister hvilke som mangler.',
    'Legg FDV inn på hvert system (fanen Dokumentasjon på systemet) – da blir kravet grønt når alle er dekket.',
  ] },
  { id: '2026-12-02', dato: '2026-12-02', tittel: 'Søk og etasjefilter i 3D', punkter: [
    'Når du skjuler en etasje i 3D-modellen, skjules nå også systemer, komponenter og avvik som er plassert på den etasjen.',
    'Nytt søkefelt i 3D-panelet: skriv for eksempel «brann» eller navnet på et system, så vises bare treffene i modellen. Velg «Vis systemer i modellen» eller «Zoom til markeringer» for å se hvor de står.',
  ] },
  { id: '2026-12-01', dato: '2026-12-01', tittel: 'Lagret kalibrering kan justeres', punkter: [
    'Åpner du «Tegning» i 3D-modellen for en etasje som allerede er koblet, kommer den lagrede kalibreringen opp ferdig utfylt. Ble markørene speilvendt, kan du bare krysse av «Speilvend», se at de havner riktig, og lagre – uten å måle punktene på nytt. «Start på nytt» gir en blank kalibrering.',
    'På mobil er panelet med etasjer og filtre i 3D-visningen lukket til du åpner det med «☰ Etasjer og visning».',
  ] },
  { id: '2026-11-30', dato: '2026-11-30', tittel: 'Bilder på kontroller og sesongavhengige kontroller', punkter: [
    'Når du registrerer en kontroll som utført, kan du nå ta bilder med kameraet eller velge flere fra bildebiblioteket. Bildene lagres på utførelsen og vises i historikken.',
    'Kontroller kan ha sesong, f.eks. november–april for snø og is på tak. Utenfor sesongen får de ingen frist – neste frist settes til første dag i neste sesong. Velg «Sesong fra/til» når du redigerer kontrollen.',
    'Malen «Snø og is på tak» er nå månedlig i vintersesongen (november–april). Kontroller du allerede har, setter du sesong på selv.',
  ] },
  { id: '2026-11-29', dato: '2026-11-29', tittel: 'Appen kan brukes uten nett', punkter: [
    'I kjeller, teknisk rom og andre steder uten dekning kan du nå kvittere kontroller, melde og oppdatere avvik, ta bilder og lese av målere. Alt lagres på telefonen og sendes av seg selv når nettet er tilbake.',
    'Rader som ikke er sendt ennå er merket «Ikke sendt», og et gult felt øverst viser hvor mange endringer som venter.',
    'Har en kollega endret det samme i mellomtiden, beholdes begge endringene så langt det går – bare feltene du selv endret blir oppdatert. Det som ikke lar seg sende, vises med «Prøv igjen» og «Forkast».',
    'Appen må ha vært åpnet med nett på enheten først. Sletting, e-post og import krever fortsatt nett.',
  ] },
  { id: '2026-11-28', dato: '2026-11-28', tittel: 'Riktigere lovkrav for heis og energivurdering', punkter: [
    'Sikkerhetskontroll av heis er nå satt til hvert 2. år, utført av uavhengig kontrollorgan (ikke heisfirmaets service). Kontroller du allerede har lagt inn må du selv endre intervallet på.',
    'Energivurdering av varme- og klimaanlegg regnes bare som lovkrav når bygget er over grensene: varmeanlegg over 20 kW samlet (over 100 kW: hvert 2. år), ventilasjon/kjøling over 12 kW samlet eller mer enn 500 m². Registrer «Installert effekt (kW)» på systemet, så avgjør appen det for deg.',
    'For varme-, ventilasjons- og kjøleanlegg som er 15 år eller eldre foreslår appen en energi- og utskiftingsvurdering, også når den ikke er lovpålagt.',
    'Energiattest forventes nå for alle utleide bygg, ikke bare over 1000 m² – plikten gjelder ved utleie og salg uansett størrelse.',
    'Ny systemtype «Kjøletårn/luftskrubber» med lovpålagt vurdering fra akkreditert inspeksjonsorgan hvert 5. år. Hjemlene for legionella og motoriserte porter er rettet.',
    'Rapporten du legger ved når «Energiattest – fornyelse» kvitteres, teller nå som dokumentet «Energiattest». Du kan ha flere attester per bygg (f.eks. kontordel og butikkdel) – bruk «+ Flere» under Lovkrav.',
  ] },
  { id: '2026-11-27', dato: '2026-11-27', tittel: 'Lovkrav: se om alt er på plass', punkter: [
    'Forsiden viser nå trafikklys per eiendom og område (kontroller, dokumenter, avvik, tilsyn, brannvern og leietakere), og en teller for lovpålagte kontroller som mangler i kontrollplanen.',
    'Øverst på hver eiendom står «Samsvar med lov og forskrift» med de viktigste tiltakene i prioritert rekkefølge.',
    'Ny fane «Lovkrav» på eiendommen: hvert krav med hjemmel, status og hva som dokumenterer det. Manglende kontroller legges inn med ett trykk, eller merkes «Ikke aktuelt» med begrunnelse.',
    'Lovpålagte kontroller som er kvittert uten rapport eller annen dokumentasjon blir flagget, så du kan legge ved det som mangler før et tilsyn.',
    'Ny eiendom? «Hva finnes i bygget?» spør om heis, sprinkler, brannalarm og lignende, og foreslår de lovpålagte kontrollene. Knappen finnes også under «Lovkrav» på eksisterende eiendommer.',
    'Menyen er ryddet: det du bruker daglig står øverst, mens målere, TFM, tegninger, nøkler, vedlikehold og prosjekter ligger under «Bygg og teknikk». Appen starter også raskere.',
  ] },
  { id: '2026-11-26', dato: '2026-11-26', tittel: 'Store 3D-modeller bruker mindre minne', punkter: [
    'Nye 3D-modeller blir mye lettere: like punkter slås sammen ved opplasting, så modellen bruker rundt en tredjedel av minnet. Modeller som er lastet opp tidligere kan gjøres lettere med ett trykk på PC («Gjør modellene lettere») – uten ny opplasting.',
    'På mobil og nettbrett åpnes ikke store modeller av seg selv lenger. Du velger først hvilke fag du vil se, slik at siden ikke lukkes fordi minnet går fullt.',
    '3D-modeller leses nå bit for bit mens de lastes ned, og fagmodellene hentes én om gangen. Store modeller bruker rundt 40 % mindre minne enn før – nyttig på mobil og nettbrett.',
  ] },
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
