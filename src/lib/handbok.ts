// Håndbok for eier, eiendomssjef og teknisk forvalter.
// Innholdet brukes både på siden «Håndbok» og i PDF-utskriften, så teksten finnes bare ett sted.
// Hjemler kontrollert mot Lovdata og myndighetenes kilder 10.11.2026 (se kapittelet «Kilder og kontroll av hjemler»).

export type Rolle = 'eier' | 'es' | 'tf';
export const ROLLER: [Rolle, string][] = [['eier', 'Eier'], ['es', 'Eiendomssjef'], ['tf', 'Teknisk forvalter']];

/** Sjekkpunkter som kan vurderes automatisk ut fra dataene i appen. */
export type Auto = 'forfalte' | 'kritiskeAvvik' | 'avvikOverFrist' | 'dokMangler' | 'dokUtloper' | 'ikUbekreftet' | 'brannvern' | 'tg3' | 'fornyelse';

export type Sjekk = { id: string; tekst: string; auto?: Auto };
export type Blokk =
  | { p: string }
  | { h3: string }
  | { ul: string[] }
  | { ol: string[] }
  | { tabell: { hode: string[]; rader: string[][] } }
  | { merk: string }
  | { sjekk: Sjekk[] };
export type Kapittel = { id: string; tittel: string; roller: Rolle[]; ingress: string; blokker: Blokk[] };

export const HANDBOK_VERSJON = '10.11.2026';

export const KAPITLER: Kapittel[] = [
  {
    id: 'formal', tittel: 'Formål og målbilde', roller: ['eier', 'es', 'tf'],
    ingress: 'Målet er én ting: en eiendom som er trygg, lovlig, godt vedlikeholdt, fullt dokumentert og attraktiv å leie – der leietakerne gjør sin del og blir godt ivaretatt.',
    blokker: [
      { h3: 'Det ferdige produktet er nådd når' },
      { ul: [
        'Alle lovpålagte kontroller er utført innen frist, og avvik er lukket eller har plan.',
        'Påkrevd dokumentasjon (FDV, brann, el, heis, energi, avtaler) finnes, er gjeldende og kan hentes frem på minutter.',
        'Vedlikeholdsplanen viser behov 10–30 år frem, med kostnad per år og ingen ukjent TG3.',
        'Hver leietaker har bekreftet brannvernplikter og IK-plikter, og vedlikeholdsmatrisen i avtalen følges.',
        'Leietakerne får svar i tide, varsles om arbeider og opplever ryddige avregninger.',
      ] },
      { merk: 'Hjemler, intervaller og standarder er veiledende. De må vurderes mot byggets bruk, forsikringsvilkår, leieavtalene og brannkonseptet.' },
    ],
  },
  {
    id: 'eier', tittel: 'Eiers ansvar som ikke kan delegeres', roller: ['eier', 'es', 'tf'],
    ingress: 'Eier kan sette bort oppgaver til eiendomssjef, forvalter og leverandører, men ikke ansvaret. Overfor myndigheter, forsikring og leietakere er det eier som står ansvarlig, og eier må kunne dokumentere at oppgavene er fordelt, fulgt opp og utført.',
    blokker: [
      { tabell: { hode: ['Område', 'Eiers plikt (kortversjon)', 'Hjemmel'], rader: [
        ['Bygningens stand', 'Holde byggverk og installasjoner i forsvarlig stand, slik at det ikke oppstår vesentlig ulempe eller fare for skade på personer, eiendom eller miljø', 'Plan- og bygningsloven § 31-1'],
        ['Brannsikkerhet – sikringstiltak', 'Eier har ansvar for nødvendige sikringstiltak; eier og bruker skal holde sikkerhetsinnretningene i forsvarlig stand', 'Brann- og eksplosjonsvernloven § 6'],
        ['Brannsikkerhet – i detalj', 'Kjenne kravene, informere brukerne og samordne bruken (§ 4); kontrollere og vedlikeholde sikkerhetsinnretninger (§ 5); oppgradere så langt det er praktisk og økonomisk forsvarlig (§ 8); systematisk sikkerhetsarbeid (§ 9); dokumentere (§ 10)', 'Forskrift om brannforebygging §§ 4–10'],
        ['Internkontroll og samordning', 'Systematisk HMS-arbeid. Flere virksomheter på samme arbeidsplass skal ved behov avtale skriftlig hvem som samordner', 'Brann- og eksplosjonsvernloven § 8; internkontrollforskriften §§ 4–6'],
        ['Dokumentasjon', 'Ta vare på FDV-dokumentasjon og holde den oppdatert ved endringer', 'TEK17 kapittel 4'],
        ['El-anlegg', 'Ettersyn og vedlikehold slik at anlegget er i forskriftsmessig stand; arbeid utføres av registrert elektroforetak', 'Forskrift om elektriske lavspenningsanlegg; forskrift om elektroforetak'],
        ['Heis og løfteinnretninger', 'Sikkerhetskontroll av godkjent kontrollorgan minst hvert annet år; vedlikehold og ettersyn av fagkyndig foretak', 'TEK17 kapittel 16 (§ 16-1)'],
        ['Energi', 'Energiattest ved utleie, salg og nybygg; jevnlig energivurdering av varmeanlegg over 20 kW og klimaanlegg over 12 kW eller som betjener over 500 m²', 'Energimerkeforskriften for bygninger'],
        ['Miljø', 'F-gass-kontroll, olje- og fettutskillere, kartlegging av farlig avfall før rehabilitering og riving', 'Produktforskriften, forurensningsforskriften, TEK17 § 9-7'],
        ['Byggearbeid', 'Som byggherre: SHA-plan og koordinatorer ved bygge- og anleggsarbeid', 'Byggherreforskriften'],
        ['Leieforholdet', 'Levere lokalene i avtalt stand, utføre eiers vedlikehold, avregne felleskostnader', 'Leieavtalen; husleieloven § 1-2 andre ledd'],
      ] } },
      { h3: 'Eiers fire kjerneoppgaver' },
      { ol: [
        'Sette mål, risikonivå og budsjett for eiendommen.',
        'Gi skriftlige fullmakter og fordele ansvar mellom rollene.',
        'Kreve rapportering som viser at pliktene er oppfylt.',
        'Ta beslutningene som ligger over fullmaktene – og sette av penger til dem.',
      ] },
    ],
  },
  {
    id: 'roller', tittel: 'De tre rollene', roller: ['eier', 'es', 'tf'],
    ingress: 'Eier bestemmer hva og hvor mye, eiendomssjefen styrer forretningen og relasjonen, og teknisk forvalter sørger for at bygget fungerer og er dokumentert.',
    blokker: [
      { h3: 'Eier' },
      { ul: [
        'Vedtar eiendomsstrategi, årsbudsjett og langtids vedlikeholdsplan.',
        'Gir skriftlige fullmakter (beløpsgrenser, hvem som signerer leieavtaler og kontrakter).',
        'Godkjenner investeringer, utskiftinger og prosjekter over fullmakt.',
        'Behandler kvartals- og årsrapport; sikrer at forsikringsvilkårene er kjent.',
        'Leverer til de andre: klare mål, budsjett, fullmakter og raske beslutninger.',
      ] },
      { h3: 'Eiendomssjef' },
      { ul: [
        'Utleie, reforhandling og oppfølging av leieavtaler, inkludert vedlikeholdsmatrise.',
        'Budsjett, felleskostnader, avregning, husleie og KPI-regulering.',
        'Leietakerdialog: møter, tilfredshet, klager og varsling av arbeider.',
        'Følger opp leietakernes bekreftelser (brannvern, IK-plikter, forsikring, dokumentasjon).',
        'Rapporterer til eier og innstiller i saker over fullmakt.',
        'Leverer til de andre: prioriteringer og økonomiske rammer til forvalter; beslutningsgrunnlag til eier.',
      ] },
      { h3: 'Teknisk forvalter (driftsleder)' },
      { ul: [
        'Kontrollplan med lovpålagte kontroller, egenkontroller og service.',
        'Serviceavtaler, bestillinger og oppfølging av leverandører.',
        'Avvikshåndtering fra registrering til lukking.',
        'TFM-register, FDV-dokumentasjon, tegninger og arealer.',
        'Tilstand og levetid per komponent; forslag til vedlikeholdsplan.',
        'Teknisk brannvern: brannkort, brannsystemer, redusert brannsikkerhet.',
        'Leverer til de andre: status på kontroller og avvik, kostnadsoverslag, tilstand og risiko.',
      ] },
      { merk: 'Har én person to roller, skal oppgavene likevel være skilt i kontrollplanen og ansvarsmatrisen, så ingenting faller mellom stolene ved fravær eller bytte.' },
    ],
  },
  {
    id: 'samspill', tittel: 'Slik utfyller rollene hverandre', roller: ['eier', 'es', 'tf'],
    ingress: 'Samspillet er en sløyfe: eier setter rammer, eiendomssjefen omsetter dem til prioriteringer og avtaler, teknisk forvalter utfører og dokumenterer, og status går tilbake opp som rapport.',
    blokker: [
      { h3: 'Ansvarsmatrise (RACI)' },
      { p: 'R = utfører · A = ansvarlig/godkjenner · C = rådspurt · I = informert.' },
      { tabell: { hode: ['Oppgave', 'Eier', 'Eiendomssjef', 'Teknisk forvalter', 'Leietaker'], rader: [
        ['Eiendomsstrategi og årsbudsjett', 'A', 'R', 'C', '–'],
        ['Langtids vedlikeholdsplan', 'A', 'C', 'R', 'I'],
        ['Kontrollplan og lovpålagte kontroller', 'I', 'A', 'R', 'I'],
        ['Serviceavtaler og leverandørvalg', 'I', 'A', 'R', '–'],
        ['Avvik – registrering og utbedring', 'I', 'C', 'A/R', 'R (melder)'],
        ['Avvik over fullmakt / TG3', 'A', 'R', 'C', 'I'],
        ['FDV- og dokumentkontroll', 'I', 'A', 'R', 'C'],
        ['Brannkort, brannvernpakke, samordning', 'I', 'A', 'R', 'C'],
        ['Leietakers brannvernplikter (§§ 11–13)', 'I', 'A', 'C', 'R'],
        ['Leietakers IK-plikter og bekreftelser', 'I', 'A', 'C', 'R'],
        ['Leieavtale, vedlikeholdsmatrise, fornyelse', 'A', 'R', 'C', 'C'],
        ['Felleskostnader og avregning', 'I', 'A/R', 'C', 'I'],
        ['Ombygging for leietaker', 'A (over fullmakt)', 'R', 'R (teknisk)', 'C'],
        ['Byggherreplikter ved prosjekt', 'A', 'C', 'R', 'I'],
        ['Kvartals- og årsrapport', 'A', 'R', 'C', '–'],
      ] } },
      { h3: 'Beslutningsnivåer' },
      { tabell: { hode: ['Sak', 'Beslutter'], rader: [
        ['Løpende drift og service innen budsjett', 'Teknisk forvalter (beløpsgrense settes i fullmakten)'],
        ['Avvik som må rettes for å oppfylle lov eller forskrift', 'Teknisk forvalter straks, varsler eiendomssjef samme dag'],
        ['Tiltak utenfor budsjett, nye avtaler', 'Eiendomssjef (beløpsgrense settes i fullmakten)'],
        ['Investeringer, leieavtaler over terskel, salg', 'Eier'],
      ] } },
      { merk: 'Det som er lovpålagt og sikkerhetskritisk, venter aldri på budsjett. Forvalteren utbedrer eller setter kompenserende tiltak, eiendomssjefen varsles samme dag, og eier får saken i neste rapport.' },
    ],
  },
  {
    id: 'arshjul', tittel: 'Årshjul og møter', roller: ['eier', 'es', 'tf'],
    ingress: 'Årshjulet gjør samspillet forutsigbart: hver måned har faste leveranser, og budsjett og vedlikeholdsplan henger sammen.',
    blokker: [
      { tabell: { hode: ['Måned', 'Hovedaktivitet', 'Ansvarlig'], rader: [
        ['Januar', 'Oppdatere kontrollplanen; sende årlig brannvernbekreftelse og IK-forespørsel til leietakere', 'Teknisk forvalter / eiendomssjef'],
        ['Februar', 'Årsrapport for forrige år', 'Eiendomssjef'],
        ['Mars', 'Avregning felleskostnader; befaring av tak, fasade og utomhus etter vinteren', 'Eiendomssjef / teknisk forvalter'],
        ['April', 'Kvartalsrapport Q1; purring på manglende leietakerbekreftelser', 'Eiendomssjef'],
        ['Mai', 'Leietakermøter og tilfredshetsmåling; planlegge sommerens prosjekter', 'Eiendomssjef'],
        ['Juni', 'Utvendige prosjekter; oppdatere TFM og FDV etter arbeid', 'Teknisk forvalter'],
        ['Juli', 'Kvartalsrapport Q2; leieavtaler som utløper innen 24 måneder', 'Eiendomssjef'],
        ['August', 'Oppdatere vedlikeholdsplan og levetider; kostnadsoverslag for neste år', 'Teknisk forvalter'],
        ['September', 'Felles brannøvelse og samordningsmøte med alle leietakere', 'Teknisk forvalter / eiendomssjef'],
        ['Oktober', 'Budsjettforslag; kvartalsrapport Q3', 'Eiendomssjef'],
        ['November', 'Eier vedtar budsjett og vedlikeholdsplan; varsle leietakere om felleskostnader', 'Eier / eiendomssjef'],
        ['Desember', 'Inngå og fornye serviceavtaler; sjekke dokumenter som utløper neste år', 'Teknisk forvalter'],
      ] } },
      { h3: 'Faste møter' },
      { tabell: { hode: ['Møte', 'Hyppighet', 'Deltakere', 'Formål'], rader: [
        ['Driftsmøte', 'Ukentlig eller annenhver uke', 'Eiendomssjef, teknisk forvalter', 'Avvik, bestillinger, leietakersaker, frister neste 30 dager'],
        ['Eiermøte', 'Kvartalsvis', 'Eier, eiendomssjef', 'Rapport, saker over fullmakt, risiko'],
        ['Leietakermøte', 'Minst årlig per leietaker', 'Eiendomssjef, leietaker', 'Avtale, behov, vedlikeholdsmatrise, tilfredshet'],
        ['Samordningsmøte brann', 'Årlig og ved nye leietakere', 'Teknisk forvalter, leietakernes brannvernansvarlige', 'Rutiner, øvelse, endringer i brannkortet'],
        ['Leverandørmøte', 'Halvårlig', 'Teknisk forvalter, leverandør', 'Kvalitet, rapporter, avvik'],
      ] } },
    ],
  },
  {
    id: 'kontroller', tittel: 'Lovpålagt kontroll, service og vedlikehold', roller: ['es', 'tf'],
    ingress: 'Teknisk forvalter eier kontrollplanen, eiendomssjefen sørger for avtaler og budsjett, og eier får bekreftet i kvartalsrapporten at ingen lovpålagte frister er overskredet.',
    blokker: [
      { tabell: { hode: ['Anlegg', 'Typisk kontroll (veiledende)', 'Utføres av'], rader: [
        ['Brannalarmanlegg', 'Jevnlig egenkontroll; årlig kontroll av sertifisert foretak', 'Leverandør / driftstekniker'],
        ['Sprinkleranlegg', 'Jevnlig egenkontroll; årlig ettersyn og periodisk hovedkontroll', 'Sertifisert foretak'],
        ['Nødlys og ledesystem', 'Månedlig funksjonstest; årlig kontroll', 'Driftstekniker / leverandør'],
        ['Slokkeapparater og brannslanger', 'Årlig ettersyn', 'Godkjent servicefirma'],
        ['Branndører, brannspjeld, røykluker', 'Årlig funksjonskontroll', 'Driftstekniker / leverandør'],
        ['Heis og løfteplattform', 'Sikkerhetskontroll minst hvert annet år (TEK17 § 16-1); løpende service', 'Kontrollorgan og heisfirma'],
        ['Elektriske anlegg', 'Ettersyn og termografi etter risiko og forsikringskrav', 'Registrert elektroforetak'],
        ['Ventilasjon', 'Filterbytte og service; jevnlig energivurdering av klimaanlegg over 12 kW', 'Ventilasjonsfirma'],
        ['Kjøleanlegg og varmepumper', 'Lekkasjekontroll etter fyllmengde (F-gass)', 'Sertifisert kuldetekniker'],
        ['Olje-, fett- og sandfang', 'Tømming og kontroll etter kommunens krav', 'Godkjent tømmefirma'],
        ['Porter og dørautomatikk', 'Årlig service og sikkerhetskontroll', 'Leverandør'],
        ['Tak og sikringsutstyr for takarbeid', 'Årlig befaring; kontroll av festepunkter', 'Teknisk forvalter / leverandør'],
      ] } },
      { h3: 'Arbeidsflyt for hver kontroll' },
      { ol: [
        'Kontrollen ligger i kontrollplanen med intervall, hjemmel og ansvarlig.',
        'Leverandør eller driftstekniker utfører og laster opp rapport.',
        'Teknisk forvalter registrerer utført – neste frist beregnes automatisk.',
        'Anmerkninger blir avvik med alvorlighet, frist og ansvarlig.',
        'Rapporten lagres på eiendommen og komponenten (TFM).',
      ] },
    ],
  },
  {
    id: 'brannvern', tittel: 'Brannvern og samordning med leietakere', roller: ['es', 'tf'],
    ingress: 'Eier skal kjenne kravene, gjøre leietakerne kjent med dem og samordne bruken (forskrift om brannforebygging § 4), kontrollere og vedlikeholde sikkerhetsinnretningene (§ 5) og dokumentere pliktene (§ 10). Leietaker har egne plikter for sin bruk (§§ 11–13).',
    blokker: [
      { tabell: { hode: ['Hvem', 'Gjør dette'], rader: [
        ['Eier', 'Godkjenner brannkonsept og budsjett for brannsikkerhet; får status i rapporten'],
        ['Teknisk forvalter', 'Holder brannkortet oppdatert, følger opp kontroller av brannsystemene og publiserer ny versjon ved endringer'],
        ['Eiendomssjef', 'Sender brannvernpakke til hver leietaker, følger opp bekreftelse og brannvernansvarlig, tar brannkrav inn i leieavtalen'],
        ['Leietaker', 'Bekrefter brannvernpakken, utpeker brannvernansvarlig, holder rømningsveier frie, lærer opp ansatte og melder endringer og avvik'],
      ] } },
      { h3: 'Redusert brannsikkerhet' },
      { ol: [
        'Teknisk forvalter oppretter midlertidig varsel med kompenserende tiltak (brannvakt, ekstra slokkeutstyr, begrenset bruk).',
        'Varselet kobles til avviket og sendes berørte leietakere, som kvitterer for at de har lest det.',
        'Eiendomssjef varsles; ved lengre varighet vurderes varsel til brannvesen og forsikring.',
        'Varselet avsluttes når avviket er lukket.',
      ] },
      { p: 'Felles brannøvelse og samordningsmøte holdes årlig og ved nye leietakere. Referat, deltakerliste og samordningsavtale lagres på eiendommen.' },
    ],
  },
  {
    id: 'leietaker', tittel: 'Leieavtaler og leietakers forpliktelser', roller: ['es', 'tf'],
    ingress: 'For næringslokaler kan husleieloven i stor grad fravikes (§ 1-2 andre ledd), så det er avtalen som avgjør hvem som vedlikeholder hva. Uklare avtaler er den vanligste kilden til konflikt og forfalt vedlikehold.',
    blokker: [
      { h3: 'Dette må hver leieavtale ha' },
      { ul: [
        'Vedlikeholdsmatrise for utvendig, innvendig, tekniske anlegg og utskifting.',
        'Ansvar for lovpålagte kontroller i leietakers areal og av leietakers egne anlegg.',
        'Brannvernplikter og krav om brannvernansvarlig.',
        'Krav om internkontroll i egen virksomhet og årlig bekreftelse.',
        'Avtale om samordning av internkontroll og brannvern for felles områder.',
        'Krav om forsikring av eget innbo, inventar og drift.',
        'Regler for ombygging, tilbakeføring og godkjenning av endringer.',
        'Felleskostnader: innhold, fordelingsnøkkel og avregning.',
        'Tilgang for eier og leverandører til kontroll og vedlikehold, med varsel.',
        'Arealoppgave med leieareal og andel fellesareal.',
      ] },
      { h3: 'Typisk vedlikeholdsmatrise (startpunkt)' },
      { tabell: { hode: ['Bygningsdel / anlegg', 'Eier', 'Leietaker'], rader: [
        ['Tak, fasade, bærende konstruksjon', 'Vedlikehold og utskifting', 'Melde skader'],
        ['Vinduer og ytterdører', 'Utskifting, utvendig vedlikehold', 'Innvendig rengjøring; ruteknusing ved egen skyld'],
        ['Innvendige overflater', 'Ved overtakelse', 'Løpende vedlikehold i leieperioden'],
        ['Felles tekniske anlegg', 'Drift, kontroll, utskifting', 'Ikke hindre funksjon; melde feil'],
        ['Leietakers egne installasjoner', '–', 'Alt, inkludert lovpålagt kontroll'],
        ['Slokkeutstyr i leiearealet', 'Etter avtale', 'Ofte leietaker – avklares'],
        ['Sanitær og avløp', 'Hovedanlegg', 'Tette avløp ved egen bruk'],
      ] } },
      { h3: 'Leietakers internkontroll – hva eier følger opp' },
      { p: 'Leietaker er selv ansvarlig for HMS og internkontroll i egen virksomhet (internkontrollforskriften §§ 4–5). Når flere virksomheter er på samme arbeidsplass, skal de ved behov avtale skriftlig hvem som samordner internkontrollen for felles områder (§ 6). I et næringsbygg er det ofte naturlig at eier eller forvalter tar den rollen.' },
      { p: 'Eiendomssjefen ber årlig om bekreftelse på at leietaker har:' },
      { ul: [
        'Rutiner for HMS og internkontroll i egen virksomhet.',
        'Oppdatert risikovurdering for egen bruk, inkludert brann og farlige stoffer.',
        'Kontroll av egne anlegg og utstyr etter vedlikeholdsmatrisen.',
        'Opplæring av ansatte i brannrutiner og rømning.',
        'Gyldig forsikring.',
      ] },
    ],
  },
  {
    id: 'ivareta', tittel: 'Ivaretakelse av leietaker', roller: ['es', 'tf'],
    ingress: 'En leietaker som opplever ryddighet og respons, forlenger avtalen og følger opp sine plikter. Jo tydeligere eier leverer sin del, jo lettere er det å kreve at leietaker leverer sin.',
    blokker: [
      { tabell: { hode: ['Henvendelse', 'Svar innen', 'Tiltak', 'Ansvarlig'], rader: [
        ['Akutt (vannlekkasje, strømbrudd, brannsystem ute, innbrudd)', 'Straks', 'Sikring samme dag', 'Teknisk forvalter / vakt'],
        ['Feil som hindrer drift (varme, ventilasjon, heis)', 'Samme dag', 'Innen 1–3 virkedager', 'Teknisk forvalter'],
        ['Ordinært avvik', '2 virkedager', 'Etter alvorlighet og avtale', 'Teknisk forvalter'],
        ['Avtale-, areal- eller økonomispørsmål', '5 virkedager', '–', 'Eiendomssjef'],
      ] } },
      { h3: 'God praksis' },
      { ul: [
        'Én kontaktflate: leietaker vet hvem som er eiendomssjef og teknisk kontakt, og melder avvik i portalen.',
        'Synlig status: leietaker følger sine avvik i portalen og får beskjed når de lukkes.',
        'Varsling: planlagte arbeider og utkoblinger varsles minst 5 virkedager før.',
        'Forutsigbar økonomi: felleskostnadsbudsjett før årsskiftet og spesifisert avregning.',
        'Lytte: årlig leietakermøte og enkel tilfredshetsmåling.',
        'Tidlig dialog om fornyelse 18–24 måneder før utløp.',
        'Rettferdig håndheving: mangler tas først opp i dialog, deretter skriftlig med frist.',
      ] },
      { h3: 'Når leietaker ikke oppfyller pliktene' },
      { ol: [
        'Uformell påminnelse fra eiendomssjef.',
        'Skriftlig oppfølgingsbrev med frist (lages i appen).',
        'Møte med leietaker; teknisk forvalter deltar ved tekniske mangler.',
        'Ved fare for liv, helse eller bygg: eier utbedrer for leietakers regning der avtalen gir rett til det.',
        'Vesentlig mislighold vurderes juridisk etter leieavtalen.',
      ] },
    ],
  },
  {
    id: 'dokumentasjon', tittel: 'Dokumentasjon og FDV', roller: ['es', 'tf'],
    ingress: 'Dokumentasjonen er beviset for at pliktene er oppfylt. Eier skal kunne be om hvilket som helst dokument og få det samme dag.',
    blokker: [
      { tabell: { hode: ['Dokument', 'Ansvarlig', 'Oppdateres'], rader: [
        ['FDV-dokumentasjon per system (TFM-merket)', 'Teknisk forvalter', 'Ved hver endring'],
        ['Brannkonsept og brannteknisk dokumentasjon', 'Teknisk forvalter', 'Ved ombygging og bruksendring'],
        ['Brannkort, rømningsplaner, brannvernpakker', 'Teknisk forvalter', 'Ved endring, minst årlig'],
        ['Kontrollrapporter', 'Teknisk forvalter', 'Etter hver kontroll'],
        ['Ferdigattest og tegninger', 'Teknisk forvalter', 'Ved tiltak'],
        ['Tilstandsvurdering (NS 3424)', 'Teknisk forvalter', 'Hvert 3.–5. år'],
        ['Energiattest', 'Teknisk forvalter', 'Ved utleie og salg'],
        ['Miljøkartlegging (asbest, PCB m.m.)', 'Teknisk forvalter', 'Før rehabilitering'],
        ['Leieavtaler med bilag', 'Eiendomssjef', 'Ved inngåelse og endring'],
        ['Arealoppgave', 'Eiendomssjef', 'Ved endring av arealer'],
        ['Serviceavtaler og kontrakter', 'Eiendomssjef / teknisk forvalter', 'Ved fornyelse'],
        ['Forsikringspolise og sikkerhetsforskrifter', 'Eier / eiendomssjef', 'Årlig'],
      ] } },
      { ul: [
        'Alt lagres i appen på eiendom, komponent eller leietaker – ikke i e-post eller på private disker.',
        'Dokumenter med utløpsdato får dato registrert, så de vises på Oversikt før de går ut.',
        'Ved prosjekter kreves FDV-dokumentasjon med TFM-koder før sluttoppgjør.',
      ] },
    ],
  },
  {
    id: 'vedlikehold', tittel: 'Langsiktig vedlikehold, levetid og utskifting', roller: ['eier', 'es', 'tf'],
    ingress: 'Vedlikeholdsplanen forteller eier hva eiendommen vil koste å holde i stand de neste 10, 20 og 30 årene. Teknisk forvalter lager grunnlaget, eiendomssjefen kobler det til leieinntekter og avtaler, og eier vedtar planen.',
    blokker: [
      { ol: [
        'Registrer komponentene i TFM-registeret med installasjonsår, fabrikat og levetid.',
        'Vurder tilstand (TG0–TG3) ved befaring eller tilstandsvurdering etter NS 3424.',
        'Beregn utskiftingsår ut fra installasjonsår og levetid, justert for tilstand.',
        'Sett kostnad per tiltak – appen summerer per år.',
        'Prioriter: sikkerhet og lovkrav først, deretter skade på bygg, leietakers drift, energi og verdi.',
        'Avklar fordeling mot vedlikeholdsmatrisen.',
        'Vedta i budsjettmøtet i november; første år blir budsjett, resten prognose.',
      ] },
      { h3: 'Det eier bør se i planen' },
      { ul: [
        'Sum utskifting per år de neste 10 årene, og topper som bør jevnes ut.',
        'Etterslep: tiltak som allerede er forfalt.',
        'Alle TG3, med plan og frist.',
        'Store tiltak som bør koordineres med utløp av leieavtaler.',
      ] },
      { p: 'Veiledende levetider per komponent finnes under Regelverk og plikter.' },
    ],
  },
  {
    id: 'avvik', tittel: 'Avvikshåndtering', roller: ['es', 'tf'],
    ingress: 'Alle avvik registreres på samme sted, får en eier og en frist, og lukkes med dokumentasjon.',
    blokker: [
      { tabell: { hode: ['Alvorlighet', 'Eksempel', 'Frist (forslag)', 'Varsles'], rader: [
        ['Kritisk', 'Brannalarm ute av drift, blokkert rømningsvei, fare for liv og helse', 'Straks; kompenserende tiltak samme dag', 'Eiendomssjef straks, leietakere, ev. brannvesen og forsikring'],
        ['Høy', 'Anmerkning fra el- eller heiskontroll, lekkasje', '2–4 uker eller etter pålegg', 'Eiendomssjef'],
        ['Middels', 'Slitasje som gir følgeskader over tid', '3 måneder eller neste budsjett', 'Driftsmøte'],
        ['Lav', 'Kosmetisk, forbedringsforslag', 'Vedlikeholdsplanen', 'Rapport'],
      ] } },
      { ul: [
        'Avvik som gjelder lovkrav eller sikkerhet kan ikke utsettes uten kompenserende tiltak.',
        'Vedlikeholdsmatrisen avgjør om eier eller leietaker skal utbedre.',
        'Avvik kobles til TFM-komponent, så gjentatte feil synliggjør behov for utskifting.',
        'Lukking krever dokumentasjon: bilde, rapport eller kvittering.',
      ] },
    ],
  },
  {
    id: 'rapport', tittel: 'Rapportering og nøkkeltall', roller: ['eier', 'es', 'tf'],
    ingress: 'Kvartalsrapporten er der rollene møtes: forvalteren leverer tekniske tall, eiendomssjefen setter dem i sammenheng med økonomi og leietakere, og eier får beslutningsgrunnlaget på én side.',
    blokker: [
      { tabell: { hode: ['Nøkkeltall', 'Mål', 'Levert av'], rader: [
        ['Forfalte lovpålagte kontroller', '0', 'Teknisk forvalter'],
        ['Åpne kritiske og høye avvik', '0 kritiske; høye innen frist', 'Teknisk forvalter'],
        ['Manglende påkrevde dokumenter', '0', 'Teknisk forvalter'],
        ['Leietakere med bekreftet brannvern', '100 %', 'Eiendomssjef'],
        ['Leietakere med bekreftede IK-plikter', '100 %', 'Eiendomssjef'],
        ['Etterslep vedlikehold og antall TG3', 'Synkende', 'Teknisk forvalter'],
        ['Vedlikeholdskost mot budsjett', '± 10 %', 'Eiendomssjef'],
        ['Leieavtaler som utløper innen 24 måneder', 'Plan for hver', 'Eiendomssjef'],
      ] } },
      { p: 'Rapportens oppsett: status på nøkkeltallene, saker over fullmakt, vesentlige risikoer og hendelser, og neste kvartals hovedaktiviteter. Statusrapporten på Oversikt kan brukes som grunnlag.' },
    ],
  },
  {
    id: 'sjekk', tittel: 'Sjekklister per rolle', roller: ['eier', 'es', 'tf'],
    ingress: 'Punkter merket «fra appen» vurderes automatisk ut fra dataene. De andre krysser du av selv; avkrysningen lagres på denne enheten.',
    blokker: [
      { h3: 'Eier – årlig' },
      { sjekk: [
        { id: 'e1', tekst: 'Eiendomsstrategi og mål er oppdatert' },
        { id: 'e2', tekst: 'Skriftlige fullmakter for eiendomssjef og teknisk forvalter er gjeldende' },
        { id: 'e3', tekst: 'Budsjett og langtids vedlikeholdsplan er vedtatt' },
        { id: 'e4', tekst: 'Fire kvartalsrapporter er mottatt og behandlet' },
        { id: 'e5', tekst: 'Forsikringen er fornyet, og sikkerhetsforskriftene er kjent for forvaltningen' },
        { id: 'e6', tekst: 'Ingen komponenter står med TG3 eller passert levetid uten plan', auto: 'tg3' },
        { id: 'e7', tekst: 'Ingen lovpålagte kontroller er forfalt', auto: 'forfalte' },
      ] },
      { h3: 'Eiendomssjef – kvartalsvis' },
      { sjekk: [
        { id: 's1', tekst: 'Kvartalsrapport er levert til eier' },
        { id: 's2', tekst: 'Alle leietakere har bekreftet gjeldende brannvernpakke og har brannvernansvarlig', auto: 'brannvern' },
        { id: 's3', tekst: 'Alle leietakere har bekreftet IK-plikter', auto: 'ikUbekreftet' },
        { id: 's4', tekst: 'Leieavtaler innenfor varslingsfristen har plan', auto: 'fornyelse' },
        { id: 's5', tekst: 'Status i Brønnøysundregistrene er sjekket for alle leietakere' },
        { id: 's6', tekst: 'Vedlikeholdskost er fulgt opp mot budsjett' },
        { id: 's7', tekst: 'Leietakerhenvendelser er besvart innen servicenivået' },
      ] },
      { h3: 'Teknisk forvalter – månedlig' },
      { sjekk: [
        { id: 't1', tekst: 'Ingen forfalte kontroller i kontrollplanen', auto: 'forfalte' },
        { id: 't2', tekst: 'Ingen åpne kritiske eller høye avvik uten tiltak', auto: 'kritiskeAvvik' },
        { id: 't3', tekst: 'Ingen avvik over frist', auto: 'avvikOverFrist' },
        { id: 't4', tekst: 'Ingen påkrevde dokumenter mangler eller er utløpt', auto: 'dokMangler' },
        { id: 't5', tekst: 'Dokumenter som utløper innen 90 dager er fulgt opp', auto: 'dokUtloper' },
        { id: 't6', tekst: 'Servicerapporter fra leverandører er kontrollert og lagret' },
        { id: 't7', tekst: 'TFM og FDV er oppdatert etter utførte arbeider' },
        { id: 't8', tekst: 'Brannkortet er riktig, og ny versjon er publisert ved endringer' },
      ] },
      { h3: 'Ny leietaker – innflytting' },
      { sjekk: [
        { id: 'n1', tekst: 'Leieavtale med vedlikeholdsmatrise og arealoppgave er signert' },
        { id: 'n2', tekst: 'Leietaker er registrert i appen med portaltilgang' },
        { id: 'n3', tekst: 'Brannvernpakke er sendt og bekreftet; brannvernansvarlig er utpekt' },
        { id: 'n4', tekst: 'IK-plikter er sendt og bekreftet' },
        { id: 'n5', tekst: 'Samordningsavtale for internkontroll og brannvern er inngått' },
        { id: 'n6', tekst: 'Forsikringsbevis er mottatt' },
        { id: 'n7', tekst: 'Overtakelsesprotokoll med bilder er signert av begge parter' },
        { id: 'n8', tekst: 'Leietaker er med i neste brannøvelse og samordningsmøte' },
      ] },
      { h3: 'Leietaker flytter ut' },
      { sjekk: [
        { id: 'u1', tekst: 'Utflyttingsbefaring mot overtakelsesprotokollen er gjennomført' },
        { id: 'u2', tekst: 'Tilbakeføring er avklart etter avtalen' },
        { id: 'u3', tekst: 'Felleskostnader er sluttavregnet' },
        { id: 'u4', tekst: 'Tilganger i appen, nøkler og adgangskort er stengt' },
        { id: 'u5', tekst: 'Brannkort og arealoppgave er oppdatert' },
      ] },
    ],
  },
  {
    id: 'kilder', tittel: 'Kilder og kontroll av hjemler', roller: ['eier', 'es', 'tf'],
    ingress: 'Hjemlene er kontrollert mot Lovdata og myndighetenes kilder 10.11.2026. Regelverket endres – kontroller mot Lovdata ved tvil.',
    blokker: [
      { tabell: { hode: ['Var tidligere', 'Gjelder nå', 'Hvorfor'], rader: [
        ['Plan- og bygningsloven § 31-3', '§ 31-1', 'Kapittel 31 ble revidert fra 1.1.2023; plikten til å holde byggverk i forsvarlig stand står nå i § 31-1'],
        ['Forskrift om brannforebygging §§ 4 og 10', '§§ 4–10', 'Hele kapittel 2 er eiers plikter, også kontroll og vedlikehold (§ 5), oppgradering (§ 8) og systematisk sikkerhetsarbeid (§ 9)'],
        ['«Heisforskriften», årlig kontroll', 'TEK17 kapittel 16, minst hvert annet år', 'Sikkerhetskontroll av heis i drift er regulert i TEK17 § 16-1'],
        ['Energiattest alltid for yrkesbygg over 1 000 m²', 'Ved utleie, salg og nybygg', 'Den generelle plikten er opphevet i energimerkeforskriften'],
      ] } },
      { p: 'Ikke kontrollert paragraf for paragraf: byggherreforskriften, forskrift om elektriske lavspenningsanlegg og produktforskriften om F-gass.' },
      { ul: [
        'Forskrift om brannforebygging – lovdata.no/dokument/SF/forskrift/2015-12-17-1710',
        'Internkontrollforskriften – lovdata.no/dokument/SF/forskrift/1996-12-06-1127',
        'Plan- og bygningsloven – lovdata.no/dokument/NL/lov/2008-06-27-71',
        'NVE – endringer i energimerkeordningen (2024 og 2026)',
      ] },
    ],
  },
];
