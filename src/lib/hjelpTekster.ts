// Hjelpetekster. Nøkler: «side.<visning>» for sider, «felt.<feltnøkkel>» for skjemafelt (kobles automatisk),
// og frie emner. Tekst: avsnitt skilles med tom linje, linjer som starter med «- » blir punkter.
export type HjelpEmne = { tittel: string; tekst: string; gruppe: 'Sider' | 'Begreper' | 'Skjemafelt' };

export const HJELP: Record<string, HjelpEmne> = {
  // ---------------- Sider
  'side.oversikt': { gruppe: 'Sider', tittel: 'Oversikt', tekst: `Startsiden samler det som krever oppmerksomhet på tvers av alle eiendommer: forfalte og kommende kontroller, åpne avvik, leieavtaler som går ut og dokumenter som mangler eller er utløpt.

Klikk på en rad for å gå rett til saken.` },
  'side.eiendommer': { gruppe: 'Sider', tittel: 'Eiendommer', tekst: `Her registreres byggene du eier eller forvalter. Hver eiendom har egne faner for systemer og komponenter (TFM), kontrollplan, avvik, dokumenter, leietakere og tegninger.

- Søk opp adresse eller org.nr. for å hente data fra offentlige registre.
- Grunndata som byggeår, BTA, risikoklasse og brannklasse brukes til å foreslå lovpålagte kontroller.` },
  'side.eiendom.tfm': { gruppe: 'Sider', tittel: 'Systemer og komponenter (TFM)', tekst: `Alle tekniske systemer og bygningsdeler på eiendommen, gruppert etter hovedgruppe i NS 3451 (2 Bygning, 3 VVS, 4 Elkraft …).

- Klikk på en gruppe for å vise eller skjule systemene i den.
- Klikk på pilen ved TFM-koden for å vise komponentene i systemet. Tallet i parentes viser hvor mange komponenter som er skjult.
- Klikk på selve raden for å redigere.
- Kostnad i dag er summen av sentralkost og komponentkostnader. Kostnad ved utskifting er prisjustert med KPI til utskiftingsåret. Nåverdi er diskontert tilbake til i dag.
- FORSLAG betyr at kostnaden er hentet fra nettsøk og bør kontrolleres mot tilbud.` },
  'side.kontroller': { gruppe: 'Sider', tittel: 'Kontrollplan', tekst: `Lovpålagte kontroller, egenkontroller og avtalt service for alle eiendommer, med neste frist.

- Rødt betyr forfalt, gult betyr at fristen nærmer seg.
- Når du registrerer en kontroll som utført, beregnes neste frist automatisk ut fra intervallet.
- Kontroller opprettes automatisk når du legger inn systemer, men du kan også legge til egne.` },
  'side.avvik': { gruppe: 'Sider', tittel: 'Avvik', tekst: `Feil, mangler og pålegg som må følges opp. Et avvik kan knyttes til system, komponent, leietaker og en plassering på tegning.

- Sett alvorlighet og frist, og hvem som er ansvarlig.
- Tildel avviket til en utførende (intern eller ekstern) for å lage en arbeidsordre. Utføreren får e-post, kan kvittere ut og laste opp dokumentasjon.
- Alt som skjer med avviket logges i hendelsesloggen.` },
  'side.arbeidsordre': { gruppe: 'Sider', tittel: 'Arbeidsordre', tekst: `Avvik og oppgaver som er tildelt deg eller andre.

- Start: marker at du har begynt.
- Kvitter ut: beskriv hva som er gjort og last opp bilder eller rapport.
- Forvalter kontrollerer og godkjenner, eller sender tilbake med kommentar.` },
  'side.leietakere': { gruppe: 'Sider', tittel: 'Leietakere', tekst: `Leieavtaler, kontaktpersoner og hvem som har ansvar for hva.

- Velg avtalemal for å få riktig fordeling av vedlikeholdsansvar mellom eier og leietaker.
- Leietakers plikter (f.eks. internkontroll og brannvernleder) følges opp her, og leietaker kan selv bekrefte og laste opp dokumentasjon i sin portal.` },
  'side.tfm': { gruppe: 'Sider', tittel: 'TFM-register', tekst: `Samlet register over alle systemer og komponenter på tvers av eiendommer, merket etter TFM (tverrfaglig merkesystem) og NS 3451.

- Listen er gruppert etter hovedgruppe og lagt sammen. Klikk på gruppen, eller på pilen ved et system, for å vise innholdet.
- Filtrer på eiendom, tagg (Brann, HVAC …) eller tilstandsgrad.
- «⌖ Vis» viser hvor systemet er plassert på tegning.
- «Kopier som regneark» gir hele registeret som CSV.` },
  'side.arealer': { gruppe: 'Sider', tittel: 'Tegninger og arealer', tekst: `Last opp plantegninger (PDF, bilde eller DWG), sett målestokk og tegn opp arealer per leietaker og fellesareal.

- DWG leses automatisk med målestokk. Lag i tegningen kan slås av og på.
- Plasser systemer, komponenter og avvik på tegningen. Filtrer på tagg eller tilstandsgrad.
- Arealrapporten (PDF) viser leieareal, fordelt fellesareal og over- eller underdekning mot kontrakt.` },
  'side.prosjekter': { gruppe: 'Sider', tittel: 'Prosjekter', tekst: `Prosjekter fra små vedlikeholdsjobber til store rehabiliteringer.

• Faser: behov og idé → planlegging og prosjektering → anbud og kontrahering → utførelse → overlevering og ferdigstillelse → garantiperiode. Hver fase har standardoppgaver som kan endres, og datoer for en enkel fremdriftsplan.
• Økonomi: budsjettposter med NS 3451-bygningsdel, regnskapsklassifisering (vedlikehold, påkostning, nybygg, rådgivning, leietakertilpasning) og konto (NS 4102). Kostnader registreres som bestilt (forpliktet) eller fakturert/betalt (påløpt). Prognose og avvik mot budsjett beregnes. Eksport til regnskap som CSV.
• Dokumenter og FDV: sjekkliste for sluttdokumentasjon med opplasting.
• Utskiftingsprosjekt: trykk «Opprett utskiftingsprosjekt» på et system (eller i vedlikeholdsplanen). Systemet merkes, og prosjektet åpnes. Når prosjektet ferdigstilles, opprettes nytt system med samme TFM-merking, det gamle arkiveres med komponenter og kontroller, og kontrollene opprettes på nytt for det nye systemet.` },
  'side.arkiv': { gruppe: 'Sider', tittel: 'Arkiv', tekst: `Systemer, komponenter og kontroller som er erstattet, med all historikk (utførte kontroller, rapporter, avvik), og avsluttede prosjekter. Søk på navn, TFM-kode, fabrikat eller tekst i kommentarer. Arkiverte data vises ikke i kontrollplan, vedlikeholdsplan eller TFM-register.` },
  'side.runde': { gruppe: 'Sider', tittel: 'Kontrollrunde', tekst: `Én runde i bygget for alt som skal gjøres: egenkontroller, branndører og nødlys, måleravlesninger og avvik du er tildelt.

• Punktene er gruppert etter sted – arealet på tegningen der systemet eller komponenten står (eller nærhet hvis arealer ikke er tegnet) – og sortert etasje for etasje i en foreslått gangrekkefølge.
• «Kan tas nå»: kontroller i samme område som forfaller innen valgt antall dager tas med, så du slipper en ekstra tur. Velg 7, 14 eller 30 dager øverst.
• «✓ Alt OK her» kvitterer ut alle kontroller på stedet uten avvik (sjekklister settes til OK). Måleravlesninger skrives inn hver for seg.
• «Utfør …» / «Sjekkliste …» åpner full utkvittering hvis noe er galt.
• Tegning: ett nummer per sted. Trykk for å se hva som skal gjøres der. Én finger flytter, to fingre zoomer.
• Plasser systemer, komponenter og målere på tegningen (Tegninger og arealer) – da blir rundeforslaget bedre. Tegn gjerne inn rom/arealer, så får stedene riktige navn.` },
  'side.maalere': { gruppe: 'Sider', tittel: 'Målere', tekst: `Avlesning av målere: trykk på sprinkleranlegg, vannmåler, fjernvarme, fjernkjøling, energimålere og seriemålere.

En måler er en komponent i systemet den hører til (f.eks. trykkmåler under sprinkleranlegget). Kryss av for «Er komponenten en måler?» i komponenten, eller bruk «+ Ny måler».

• Forbruksmålere teller oppover. Appen regner ut forbruket mellom avlesningene og per måned. Ved målerbytte: kryss av «Måleren er byttet» og oppgi sluttstand på gammel måler og startverdi på ny.
• Tilstandsmålere (trykk, temperatur) har grenseverdier. Avlesninger utenfor grensen markeres rødt, og du får spørsmål om å registrere avvik.
• Avlesningsrunde: alle målere på eiendommen som skal leses av, i én liste sortert etter plassering – skriv inn verdien og trykk Enter.
• Fordeling per leietaker: koble seriemålere til leietaker og hovedmåler. Da vises forbruket per leietaker for valgfri periode, og hva som ikke fanges opp av seriemålerne. Kan eksporteres til Excel.
• Målere på et system kan også leses av når kontrollen av systemet kvitteres ut, og servicefirmaet kan registrere avlesninger i lenken.` },
  'side.dokumenter': { gruppe: 'Sider', tittel: 'Dokumenter', tekst: `Påkrevd og relevant dokumentasjon per eiendom: FDV, brannkonsept, el-kontroll, serviceavtaler med mer.

- Dekningsmatrisen viser hva som finnes, mangler eller er utløpt.
- Når du registrerer systemer som krever serviceavtale (f.eks. sprinkler, brannalarm, heis), dukker det opp en sjekk her.` },
  'side.vedlikehold': { gruppe: 'Sider', tittel: 'Vedlikeholdsplan', tekst: `Langsiktig utskiftingsplan basert på installert år, levetid og kostnad for hvert system og hver komponent.

- Kostnadene prisjusteres med KPI fram til utskiftingsåret.
- Nåverdi viser hva fremtidige utskiftinger er verdt i dag med valgt kalkulasjonsrente.
- Etterslep betyr at utskiftingsåret allerede er passert.
- Rente og KPI settes under Innstillinger.` },
  'side.regelverk': { gruppe: 'Sider', tittel: 'Regelverk og plikter', tekst: `Oversikt over lover og forskrifter som gjelder for eier og leietaker av næringseiendom, med hjemmel og hva det betyr i praksis: internkontrollforskriften, forskrift om brannforebygging, el-tilsynsloven, TEK med flere.` },
  'side.innstillinger': { gruppe: 'Sider', tittel: 'Innstillinger', tekst: `Felles forutsetninger for beregninger og utsending.

- KPI: årlig prisstigning brukt til å prisjustere kostnader fram i tid.
- Kalkulasjonsrente: brukt i nåverdiberegningen.
- E-post: avsenderadresse og SMTP for arbeidsordre, slik at e-post ser ut til å komme fra dere.` },
  'side.logg': { gruppe: 'Sider', tittel: 'Hendelseslogg', tekst: `Alle endringer i databasen logges automatisk: hvem som gjorde hva og når. Loggen kan ikke endres i etterkant.` },
  'side.brukere': { gruppe: 'Sider', tittel: 'Organisasjon og tilgang', tekst: `Hver kunde er en organisasjon: gårdeier, forvalterselskap, byggdrifter eller servicefirma. Brukere ser bare data de har fått tilgang til, og reglene håndheves i databasen.

- Brukere og tildeling: legg til ansatte med rolle (administrator, forvalter, driftstekniker, leser) og bestem hvilke bygg eller porteføljer hver person skal jobbe med. «Alle bygg» gir tilgang til alt organisasjonen har, også nye bygg.
- Porteføljer: gårdeier grupperer egne bygg, f.eks. per selskap eller område.
- Oppdrag: gårdeier gir et annet firma tilgang til et bygg eller en portefølje som forvaltning, drift, service (bare valgte systemer) eller innsyn. Tilgangen opphører når oppdraget avsluttes eller utløper.
- En person kan være medlem i flere organisasjoner med ulike roller.` },
  'portefolje': { gruppe: 'Begreper', tittel: 'Porteføljer', tekst: `En portefølje er en gruppe bygg hos samme eier, f.eks. «Sentrum», «Næringsparken» eller et eget eiendomsselskap. En eier kan ha mange porteføljer.

- Gi et forvalterselskap oppdrag på en hel portefølje – nye bygg som legges i porteføljen blir automatisk med.
- Tildel egne ansatte en portefølje i stedet for enkeltbygg.
- Oversikten viser statistikk per eier og portefølje: avvik, forfalte kontroller, tilstand, etterslep, utskiftingsbehov 10 år og dokumentdekning.` },
  'oppdrag': { gruppe: 'Begreper', tittel: 'Oppdrag – gi et firma tilgang', tekst: `Gårdeier bestemmer hvem utenfor egen organisasjon som får se byggene:

- Forvaltning: firmaet kan redigere alt, som en egen forvalter.
- Drift: ser hele bygget, utfører kontroller og håndterer avvik, men endrer ikke systemer, leietakere eller økonomi.
- Service: ser bare de systemene som er valgt (med kontroller, avvik og FDV for disse), og registrerer utført service.
- Innsyn: kan se, ikke endre.

Firmaets egen administrator fordeler byggene på sine ansatte. Avsluttes eller utløper oppdraget, mister hele firmaet tilgangen umiddelbart. Firmaet kan ikke gi tilgangen videre.` },
  'side.data': { gruppe: 'Sider', tittel: 'Import og eksport', tekst: `Ta sikkerhetskopi av alle data som en fil, eller les inn data fra en tidligere kopi.` },
  'side.brannvern': { gruppe: 'Sider', tittel: 'Brannvern – informasjon til leietakere', tekst: `Forskrift om brannforebygging § 4 sier at eier skal kjenne kravene til brannsikkerhet i bygget, gjøre leietakerne kjent med dem og samordne bruken når flere virksomheter leier i bygget. Etter § 10 skal eier kunne dokumentere at det er gjort.

Slik fungerer det:
- Brannkort: fyll ut risikoklasse, forutsetninger fra brannkonseptet, alarmorganisering, oppstillingsplass, husregler og velg rømningsplaner som skal legges ved.
- Publiser: hver publisering får et versjonsnummer. Endrer du brannkortet senere (ombygging, nytt brannkonsept, ny oppstillingsplass), publiserer du en ny versjon, og alle leietakerne må få og bekrefte den på nytt.
- Brannvernpakke: appen lager en PDF per leietaker med byggets brannsikkerhet, installasjonene (også komponenter plassert i leietakerens areal på tegningen), husregler, leietakerens plikter etter §§ 11–13 og en signaturside. Pakken legges i leietakerens dokumenter og vises i portalen.
- Bekreftelse: leietakeren bekrefter i portalen. Har leietakeren ikke innlogging, kan du registrere signert papir eller e-post. Bekreftelsen må fornyes hvert år.
- Redusert brannsikkerhet: er alarmen ute av drift, en rømningsvei stengt eller sprinkleren frakoblet, varsler du leietakerne. Varselet vises øverst i portalen til det avsluttes, og du ser hvem som har lest det.
- Samordning: oversikten viser brannvernansvarlig, samordningsavtale og siste brannøvelse per leietaker, og du kan legge en felles årlig brannøvelse i kontrollplanen.

Leietakerens egne plikter (rutiner, opplæring, øvelser) følges opp som før under Internkontroll og plikter.` },
  'side.portal': { gruppe: 'Sider', tittel: 'Mitt leieforhold', tekst: `Her ser du leieavtalen din, hva du som leietaker har ansvar for, og hvilke plikter du må dokumentere (f.eks. internkontroll og brannvernleder). Last opp dokumentasjon og bekreft når en plikt er utført.` },

  // ---------------- Begreper
  'tfm': { gruppe: 'Begreper', tittel: 'TFM og NS 3451', tekst: `TFM (tverrfaglig merkesystem) gir hvert system og hver komponent en entydig kode, f.eks. =360.001-JV001:

- =360 er systemkoden fra NS 3451 (360 = luftbehandling).
- .001 er løpenummeret på systemet i bygget.
- -JV001 er komponentkoden (JV = vifte) og løpenummeret.

Første siffer i systemkoden er hovedgruppen: 2 Bygning, 3 VVS, 4 Elkraft, 5 Tele og automatisering, 6 Andre installasjoner, 7 Utendørs.` },
  'levetid': { gruppe: 'Begreper', tittel: 'Levetid (teknisk og funksjonell)', tekst: `Teknisk levetid er hvor lenge en bygningsdel fungerer før den må skiftes. Funksjonell levetid er hvor lenge den dekker behovet (krav, bruk, energi) før den bør skiftes, selv om den fortsatt virker.

Appen foreslår levetid fra en NS 3451-referansetabell. Bruk teknisk levetid som utgangspunkt, og funksjonell der krav eller bruk endrer seg raskt. Du kan alltid overstyre.` },
  'naaverdi': { gruppe: 'Begreper', tittel: 'Hva er nåverdi?', tekst: `Nåverdi er hva en fremtidig kostnad er verdt i dag. Den svarer på spørsmålet: hvor mye må jeg sette av i dag for å ha nok penger når utskiftingen kommer?

- Først prisjusteres kostnaden med KPI fram til utskiftingsåret («Kostnad ved utskifting»).
- Deretter diskonteres den tilbake til i dag med kalkulasjonsrenten: nåverdi = fremtidig kostnad ÷ (1 + rente)^antall år.
- Nåverdien blir lavere enn dagens kostnad når renten er høyere enn prisstigningen, fordi pengene du setter av kan forrente seg i mellomtiden.

Eksempel: En utskifting som koster 712 880 kr i 2038 har med 6 % rente en nåverdi på ca. 354 000 kr. Setter du av 354 000 kr i dag og får 6 % avkastning hvert år, har du 712 880 kr i 2038.

Nåverdi gjør det mulig å sammenligne og summere utskiftinger som skjer i ulike år, f.eks. for å vurdere hva vedlikeholdsetterslepet er verdt i dag eller hvor mye som bør avsettes. Kalkulasjonsrenten settes under Innstillinger.` },
  'kpi': { gruppe: 'Begreper', tittel: 'Prisjustering (KPI)', tekst: `Kostnader legges inn i kroneverdien for et bestemt år (prisnivå). Fram til utskiftingsåret justeres de med KPI-satsen fra Innstillinger, slik at «kostnad ved utskifting» viser forventet pris det året.` },
  'tg': { gruppe: 'Begreper', tittel: 'Tilstandsgrad (NS 3424)', tekst: `- TG0: ingen avvik.
- TG1: mindre eller moderate avvik, normal slitasje.
- TG2: vesentlige avvik, tiltak bør planlegges.
- TG3: store eller alvorlige avvik, tiltak må gjøres raskt.
- TGIU: ikke undersøkt (f.eks. ikke tilgjengelig).

For TG2, TG3 og TGIU settes også konsekvensgrad (KG).` },
  'kg': { gruppe: 'Begreper', tittel: 'Konsekvensgrad (KG)', tekst: `Konsekvensgrad beskriver hvor alvorlige følgene av avviket kan bli, fra KG0 (ingen) til KG3 (store konsekvenser for f.eks. sikkerhet, helse, miljø eller økonomi). Tilstandsgrad sier hvor dårlig noe er, konsekvensgrad sier hvor mye det betyr.` },
  'forslag': { gruppe: 'Begreper', tittel: 'FORSLAG på kostnader', tekst: `En kostnad merket FORSLAG er hentet fra nettsøket etter leverandørdata og er et anslag, ikke et tilbud. Merket blir stående til du endrer beløpet selv, for eksempel etter å ha fått et pristilbud.` },
  'leverandorsok': { gruppe: 'Begreper', tittel: 'Søk etter leverandørdata', tekst: `Fyll inn fabrikat og modell, og trykk «Søk etter levetid og kostnad». Appen bruker Google Gemini til å finne leverandørens oppgitte levetid og et anslag for utskiftings- og retrofitkostnad.

- Bruk-knappene legger verdiene inn i skjemaet. Kostnader merkes FORSLAG.
- Hvis Google-søk ikke er tilgjengelig, svarer modellen ut fra generell kunnskap. Det står da en advarsel, og usikkerheten er høy.
- Kontroller alltid kostnader mot tilbud.` },
  'tagger': { gruppe: 'Begreper', tittel: 'Tagger (fag)', tekst: `Tagger som Brann, HVAC, Elektro og Bygning brukes til å filtrere i registeret og på tegningene. Et system får foreslått tagger ut fra type. Komponenter arver systemets tagger, men kan få egne.` },
  'fellesareal': { gruppe: 'Begreper', tittel: 'Fellesareal og over-/underdekning', tekst: `Fellesareal (korridorer, toaletter, tekniske rom) fordeles på leietakerne etter andel av leieareal.

Hvis leiekontrakten fastsetter fellesarealet (som m², prosent av fellesarealet eller prosentvis påslag), sammenlignes det med det faktiske. Differansen er over- eller underdekning, og kan vises i kroner.` },

  'ik.underpunkt': { gruppe: 'Begreper', tittel: 'Leietakernes dokumentasjon (underpunkter)', tekst: `Noen av eiers kontroller er koblet til leietakernes plikter, for eksempel «Innhente bekreftelse på leietakers internkontroll og vedlikehold» og «Brannøvelse – samordnet evakueringsøvelse».

- Hver aktiv leietaker på eiendommen vises som et underpunkt med sine plikter.
- Et underpunkt er grønt når alle relevante plikter er bekreftet i perioden (siden forrige utkvittering) og ikke er forfalt.
- Når alle leietakerne er grønne, kvitteres kontrollen ut automatisk, og neste frist settes.
- Bekreftelser kan registreres av eier/forvalter, eller av leietaker selv i leietakerportalen.
- Plikter merket «Ikke relevant» for en leietaker teller ikke med.` },
  'ko.arbeidsordre': { gruppe: 'Begreper', tittel: 'Arbeidsordre til servicefirma', tekst: `En kontroll kan sendes som arbeidsordre på e-post til servicefirmaet, enten manuelt («Send arbeidsordre» i kontrollen) eller automatisk et valgt antall dager før fristen.

- Arbeidsordren inneholder eiendom og adresse, system (TFM), frist, grunnlag (hjemmel) og sjekkpunktene fra «Notater / sjekkpunkter».
- Servicefirmaet får en lenke der de registrerer utført dato, resultat, avvik og laster opp servicerapport og bilder – uten å opprette bruker.
- Rapporten legges på kontrollen som «Til godkjenning» og vises under «Krever handling nå» på oversikten. Du godkjenner (kontrollen registreres som utført, filene lagres som servicerapport, avvik opprettes) eller avviser.

Automatisk sending: slå på «Send automatisk før frist» under «Rediger» på kontrollen, og velg antall dager. Utsendingen kjøres hver morgen. Den sendes én gang per frist; når kontrollen registreres utført og får ny frist, sendes neste arbeidsordre automatisk før den.

E-post til servicefirmaet kan også legges inn på systemet («E-post til servicefirma»), så brukes den for alle kontrollene på systemet. E-posten sendes fra organisasjonens oppsett under Administrasjon → Innstillinger.` },
  'kontrakt.type': { gruppe: 'Begreper', tittel: 'Kontraktstype og ansvarsfordeling', tekst: `Kontraktstypen bestemmer hvem som har ansvaret for drift og vedlikehold og hvem som har ansvaret for utskifting, område for område. Det styrer hvilke plikter leietakeren får, og hvem kontrollene på systemene ligger hos.

- Standard leieavtale for lokaler: eier har bygget, fellesanlegg og utskifting; leietaker har innvendig vedlikehold i leieobjektet.
- Trippel netto: leietaker drifter og vedlikeholder bygget og de tekniske anleggene, eier skifter ut. En variant lar eier beholde tak, fasade og bærende.
- Bare hus: leietaker har både vedlikehold og utskifting, også utvendig. Eier har bare utskifting av bærende konstruksjoner.
- Egendefinert: fyll inn slik kontrakten sier.

Kontrakter varierer, så hvert punkt kan justeres. Punkter som avviker fra malen, får gul ramme, og du kan skrive inn kontraktspunktet (f.eks. § 9.2). En fordeling du bruker flere ganger, lagrer du med «Lagre som egen mal».

«Eier, leietaker betaler» betyr at eier utfører arbeidet og viderefakturerer, vanlig i trippel netto.

Trykk «Oppdater plikter og kontroller» for å ta fordelingen i bruk. Du ser først hva som endres og kan fjerne haken på det som skal stå urørt:
- Nye plikter legges til, f.eks. serviceavtaler, kontroll av brannanlegg og el, utvendig vedlikehold og utskiftingsplan.
- Systemer som omfattes, får nytt ansvar for drift og utskifting, og kontrollene flyttes til leietaker eller tilbake til eier.

Systemer omfattes når de er knyttet til leietakeren («Betjener leietaker» på systemet), eller alle systemer når leietaker leier hele bygget. Koblingen mellom system og område går via NS 3451-koden.` },
  'ik.send': { gruppe: 'Begreper', tittel: 'Sende sjekklisten til leietaker', tekst: `På leietakersiden trykker du «Send sjekkliste til leietaker». Leietaker får en e-post med lenke.

- Første gang oppretter leietaker en bruker via lenken. Brukeren gir bare tilgang til eget leieforhold.
- I portalen fyller leietaker ut sjekklisten for hver plikt, legger ved dokumentasjon og sender inn.
- Innsendte plikter får status «Til godkjenning» og vises under «Krever handling nå» på oversikten.
- Trykk «Vurder» for å godkjenne, eller «Send tilbake» med en forklaring på hva som mangler. Leietaker ser tilbakemeldingen i portalen.
- Når du godkjenner, regnes plikten som dokumentert. Er alle leietakere dokumentert, kvitteres eierkontrollen ut automatisk.` },
  'ik.sjekkliste': { gruppe: 'Begreper', tittel: 'Sjekkliste for dokumentasjon', tekst: `Hver plikt har en sjekkliste over dokumentasjonen som bør innhentes fra leietaker, for eksempel branninstruks, deltakerliste fra brannøvelse eller risikovurdering i HMS-internkontrollen. Kryss av etter hvert som dokumentasjonen kommer inn, og legg ved filene. Du blir varslet hvis du registrerer en plikt som dokumentert uten at alle punktene er krysset av.` },
  'brannovelse': { gruppe: 'Begreper', tittel: 'Brannøvelser – hva krever regelverket?', tekst: `Forskrift om brannforebygging § 12 pålegger virksomheten som bruker bygget å drive systematisk brannsikkerhetsarbeid, med rutiner for kunnskap om brann, en branninstruks for varsling, evakuering/redning og slokking, og brannøvelser og opplæring av alle ansatte. Etter § 13 skal dette dokumenteres.

- Forskriften angir ikke et fast antall øvelser. Omfang og hyppighet skal tilpasses risiko og hvor komplisert bygget er. Minst én øvelse i året er vanlig praksis, og ofte høyere for bygg med mange personer eller sårbare brukere.
- I bygg med flere leietakere må øvelser samordnes mellom eier og leietakerne (internkontrollforskriften § 6, arbeidsmiljøloven § 2-2).
- Appen har derfor både en plikt for hver leietaker («Brannøvelse gjennomført og ansatte opplært») og en kontroll for eier («Brannøvelse – samordnet evakueringsøvelse for bygget») som viser status for hver leietaker.

Kontroller alltid mot gjeldende forskrift og DSBs veiledning.` },

  'kontroller.system': { gruppe: 'Begreper', tittel: 'Kontroller som opprettes for et system', tekst: `Når du legger til et system, foreslår appen kontroller ut fra systemtypen: lovpålagte kontroller (f.eks. årlig kontroll av brannalarm, sprinkler, nødlys, heis), egenkontroller (f.eks. månedlig test av nødlys, ukentlig sprinklerkontroll) og service etter leverandørens anbefaling. Hjemmel og intervall står under hver kontroll.

- Alle er krysset av som standard. Fjern de som ikke er relevante.
- På et eksisterende system ser du hvilke standardkontroller som finnes (✓) og hvilke som mangler. Kryss av og lagre for å opprette dem.
- Intervallene er veiledende. Juster dem etter anleggets FDV-dokumentasjon og serviceavtale.` },
  'kontroller.leverandor': { gruppe: 'Begreper', tittel: 'Leverandørens anbefalte vedlikehold', tekst: `Søket etter leverandørdata henter også vedlikeholdet produsenten anbefaler for modellen (f.eks. filterbytte, rengjøring, service), med intervall.

- Kryss av for de du vil følge opp, og lagre. De opprettes som kontroller av typen «Leverandøranbefaling», med første frist om 30 dager.
- For komponenter knyttes kontrollen til systemet, med komponentkoden i navnet.
- Kontroller mot FDV-dokumentasjonen. Uten Google-søk er anbefalingene generelle og mindre sikre.` },

  'kost.m2': { gruppe: 'Begreper', tittel: 'Kostnad per m² og areal målt på tegning', tekst: `For bygningsdeler der kostnaden naturlig regnes per m² (tak, fasade, gulv, innvendige overflater, asfalt), kan du velge «Areal × pris per m²».

- Skriv inn arealet, eller trykk «Mål areal på tegning». Velg tegning, tegn én eller flere flater (klikk hjørnene, avslutt på første punkt) og trykk «Bruk». Flatene summeres og lagres, så du kan endre målingen senere.
- Tegningen må ha målestokk. Mangler den, setter du den først (klikk to punkter med kjent avstand).
- Utskiftingskostnaden blir areal × m²-pris × faktor. Bruk faktor for takvinkel (plantegning viser horisontal flate), svinn eller rigg.
- Kostnaden prisjusteres og nåverdiberegnes som andre kostnader.` },

  'ns.dok': { gruppe: 'Begreper', tittel: 'NS 3451 hovedgruppe 1 – Dokumentasjon', tekst: `I NS 3451 er hovedgruppe 1 dokumentasjon, ikke fysiske systemer: 10 Bygningsdokumentasjon, 11 Dokumenter for forvaltning, 12 Juridiske og offentlige dokumenter, 13 Tomt, 14 Dimensjonering, 15 Miljø, 16 Tegninger, planer og kart, 17 Branndokumentasjon, 18 Sikkerhet og 19 Drift og vedlikehold.

- Dokumenter registreres under «Dokumenter» og får NS 3451-kode automatisk ut fra dokumenttypen (f.eks. brannkonsept → 17, FDV → 19, ferdigattest → 12). Koden kan overstyres i dokumentet.
- I «Systemer og komponenter (TFM)» vises gruppe 1 som en oversikt over eiendommens dokumenter, sortert på 10–19, slik at hele NS 3451-strukturen er samlet ett sted.` },

  'kontroller.generer': { gruppe: 'Begreper', tittel: 'Generer / utvid kontrollplan', tekst: `Knappen går gjennom eiendommen og foreslår kontroller som mangler i kontrollplanen. Den oppretter ingenting før du har valgt og trykket «Opprett valgte».

- Faste kontroller for eiendommen: brannteknisk dokumentasjon, brannvernrunde, samordning med leietakere, samordnet brannøvelse, eiers internkontroll, innhenting av leietakers dokumentasjon, energiattest, tilstandsvurdering, utvendig vernerunde, snø og is, radon.
- Standardkontroller for hvert registrert system (f.eks. årlig kontroll og månedlig egenkontroll av brannalarm), der de mangler.
- Kontroller som allerede finnes, vises ikke. Knappen er derfor trygg å bruke når som helst – f.eks. etter at du har registrert nye systemer, eller etter at appen har fått nye kontrollmaler.
- Du velger første frist for de nye kontrollene. Er en kontroll utført tidligere, registrerer du den etterpå med «Utført», så beregnes neste frist riktig.` },

  // ---------------- Skjemafelt (kobles automatisk på feltnøkkel)
  'felt.tfmSys': { gruppe: 'Skjemafelt', tittel: 'TFM systemkode', tekst: `Systemkoden fra NS 3451, normalt tre sifre (f.eks. 360 luftbehandling, 443 nødlys). Koden bestemmer hovedgruppen systemet vises under, og hvilken levetid som foreslås.` },
  'felt.tfmLop': { gruppe: 'Skjemafelt', tittel: 'Systemløpenummer', tekst: `Skiller like systemer i samme bygg fra hverandre: 360.001, 360.002 osv. Foreslås automatisk.` },
  'felt.tfmBygg': { gruppe: 'Skjemafelt', tittel: 'TFM byggnummer', tekst: `Valgfri lokaliseringskode foran systemkoden, f.eks. +B01, når en eiendom har flere bygg.` },
  'felt.kode': { gruppe: 'Skjemafelt', tittel: 'TFM komponentkode', tekst: `To bokstaver som sier hva komponenten er, f.eks. JV vifte, JP pumpe, RT temperaturgiver, DB branndør. Begynn å skrive for å få forslag.` },
  'felt.typekode': { gruppe: 'Skjemafelt', tittel: 'Typekode', tekst: `Valgfri kode etter %-tegnet som angir produkttype, f.eks. fra leverandørens FDV-dokumentasjon.` },
  'felt.levetid': { gruppe: 'Skjemafelt', tittel: 'Forventet levetid', tekst: `Antall år fra installert år til forventet utskifting. Ledetråden under feltet viser teknisk og funksjonell levetid fra NS 3451, og knappene legger inn midtverdien.

For komponenter: la feltet stå tomt hvis komponenten skal skiftes sammen med systemet.` },
  'felt.aar': { gruppe: 'Skjemafelt', tittel: 'Installert år', tekst: `Året systemet eller komponenten ble installert eller sist skiftet ut. Sammen med levetiden gir det utskiftingsåret.` },
  'felt.planAar': { gruppe: 'Skjemafelt', tittel: 'Overstyr utskiftingsår', tekst: `Bruk dette hvis utskiftingen er bestemt til et annet år enn det beregnede, for eksempel fordi den samordnes med en rehabilitering.` },
  'felt.kost': { gruppe: 'Skjemafelt', tittel: 'Kostnad', tekst: `Hva utskiftingen koster i dag, eks. mva, inkludert montasje.

På systemnivå er dette sentralkost (sentral, styring, kabling o.l.). Komponentenes kostnader legges til automatisk, så summen blir systemets totale utskiftingskostnad.` },
  'felt.kostAar': { gruppe: 'Skjemafelt', tittel: 'Prisnivå år', tekst: `Året kostnaden er anslått i. Beløpet prisjusteres med KPI derfra og fram til utskiftingsåret.` },
  'felt.fabrikat': { gruppe: 'Skjemafelt', tittel: 'Fabrikat / modell', tekst: `Produsent og modell, f.eks. «Swegon GOLD RX 25». Jo mer presist, jo bedre treff gir søket etter leverandørdata.` },
  'felt.tg': { gruppe: 'Skjemafelt', tittel: 'Tilstandsgrad', tekst: `TG0 ingen avvik · TG1 mindre avvik · TG2 vesentlige avvik · TG3 alvorlige avvik · TGIU ikke undersøkt. Se beskrivelsen under feltet for valgt grad.` },
  'felt.kg': { gruppe: 'Skjemafelt', tittel: 'Konsekvensgrad', tekst: `Hvor alvorlige følgene kan bli: KG0 ingen, KG1 små, KG2 middels, KG3 store. Brukes sammen med TG2, TG3 og TGIU.` },
  'felt.ansvar': { gruppe: 'Skjemafelt', tittel: 'Ansvar', tekst: `Hvem som skal sørge for vedlikehold eller utbedring: eier, leietaker eller en leverandør. For leietakere følger dette normalt leieavtalens fordeling.` },
  'felt.risikoklasse': { gruppe: 'Skjemafelt', tittel: 'Risikoklasse (TEK)', tekst: `Risikoklasse 1–6 etter byggteknisk forskrift, ut fra bruk og hvem som oppholder seg i bygget. Påvirker krav til brannsikring.` },
  'felt.brannklasse': { gruppe: 'Skjemafelt', tittel: 'Brannklasse (TEK)', tekst: `Brannklasse 1–4 ut fra konsekvensene av brann. Står normalt i brannkonseptet.` },
  'felt.tilsyn': { gruppe: 'Skjemafelt', tittel: 'Tilsynsobjekt', tekst: `Særskilte brannobjekter etter brann- og eksplosjonsvernloven § 13 får tilsyn fra brannvesenet og har strengere krav til dokumentasjon.` },
  'felt.avtaletype': { gruppe: 'Skjemafelt', tittel: 'Avtalemal / dokument', tekst: `Navn og utgave på kontraktsdokumentet dere har brukt, f.eks. «Standard bare-house leieavtale for næringsbygg, 2025». Feltet er til informasjon.

Det er «Kontraktstype» over som styrer ansvarsfordelingen og hvilke plikter leietakeren får. Fordelingen kan justeres punkt for punkt i tabellen «Ansvarsfordeling etter leieavtalen» på leietakeren.` },
  'felt.fellesAvtale': { gruppe: 'Skjemafelt', tittel: 'Kontraktfestet fellesareal', tekst: `Hvordan leiekontrakten fastsetter leietakers andel av fellesarealet: fast antall m², prosent av fellesarealet eller prosentvis påslag på eget areal. Brukes til å beregne over- eller underdekning.` },
  'felt.in': { gruppe: 'Skjemafelt', tittel: 'Intervall', tekst: `Hvor ofte kontrollen skal gjøres. Neste frist beregnes automatisk når kontrollen registreres som utført.` },
  'felt.alv': { gruppe: 'Skjemafelt', tittel: 'Alvorlighet', tekst: `Hvor raskt avviket må lukkes. Høy alvorlighet gir kortere standardfrist og vises først i listene.` },
  'felt.varsel': { gruppe: 'Skjemafelt', tittel: 'Varslingsfrist', tekst: `Hvor mange måneder før avtaleutløp du vil få varsel om å fornye eller si opp.` },
};

export const hjelpFor = (id?: string) => (id ? HJELP[id] : undefined);
