// Katalog: kontrollmaler, systemtyper med levetid, TFM-koder, leietakerplikter m.m.
// Hjemler og intervaller er veiledende – kontroller mot gjeldende regelverk.
export type Intervall = { n: number; enhet: 'uke' | 'mnd' | 'år' };
export type Mal = { n: string; k: string; t: string; h: string; i: [number, 'uke' | 'mnd' | 'år']; u: string; lvl: 'e' | 'a'; b?: string; pl?: string[] | 'alle' };
export type KompType = { n: string; g: string; l: number; m?: string[]; enh?: 'm2' };

export const MALER: Record<string, Mal> = {
  nodutgang:{n:"Nødutganger og ytterdører – funksjonskontroll (dørlukker, panikk-/nødbeslag, nødåpner)",k:"Brann",t:"Egenkontroll",h:"FOB § 11 (rømningsveiene skal fungere); NS-EN 1125 / NS-EN 179 – produsentene anbefaler jevnlig (ofte månedlig) funksjonskontroll av panikk- og nødbeslag",i:[1,"mnd"],u:"Driftsansvarlig",lvl:"a"},
  vindu:{n:"Vinduer – ettersyn av beslag, tetting og smøring",k:"Bygg",t:"Egenkontroll",h:"Leverandørens FDV",i:[1,"år"],u:"Driftsansvarlig",lvl:"a"},
  bereder:{n:"Varmtvannsbereder – test av sikkerhetsventil og kontroll av temperatur (≥ 60 °C)",k:"VVS",t:"Egenkontroll",h:"Leverandørens FDV; FHIs veileder om legionella (temperatur i bereder ≥ 60 °C)",i:[1,"år"],u:"Driftsansvarlig/rørlegger",lvl:"a"},
  vann_ventiler:{n:"Vanninstallasjon – motionering av stengeventiler og lekkasjesjekk",k:"VVS",t:"Egenkontroll",h:"FDV; forsikringsvilkår (vannskadeforebygging)",i:[1,"år"],u:"Driftsansvarlig",lvl:"a"},
  avlop_spyl:{n:"Avløp – inspeksjon/spyling av fellesledninger, sluk og kummer",k:"VVS",t:"Anbefalt",h:"FDV; forebygging av tilbakeslag og vannskade",i:[2,"år"],u:"Rørlegger",lvl:"a"},
  vannbaren:{n:"Vannbåren varme – trykk, lufting, ekspansjonskar og sikkerhetsventil",k:"VVS",t:"Service",h:"Leverandørens FDV",i:[1,"år"],u:"Rørlegger/servicefirma",lvl:"a"},
  vp_service:{n:"Varmepumpe/kjøleanlegg – service iht. leverandørens anbefaling",k:"VVS",t:"Service",h:"Leverandørens FDV (filtre, fordamper/kondensator, drift)",i:[1,"år"],u:"Kuldetekniker",lvl:"a"},
  sd_kontroll:{n:"SD-anlegg – kontroll av alarmer, tidsprogrammer og settpunkter",k:"Energi",t:"Egenkontroll",h:"FDV; energioppfølging",i:[1,"år"],u:"Driftsansvarlig",lvl:"a"},
  innbrudd:{n:"Innbruddsalarm/adgangskontroll – årlig service og test",k:"Sikkerhet",t:"Service",h:"Forsikringsvilkår (FG-godkjent anlegg); NS-EN 50131",i:[1,"år"],u:"Sikkerhetsfirma",lvl:"a"},
  stottemur:{n:"Støttemurer, gjerder og rekkverk – visuell kontroll",k:"Bygg",t:"Egenkontroll",h:"Eiers aktsomhets- og vedlikeholdsplikt",i:[1,"år"],u:"Driftsansvarlig",lvl:"a"},
  // --- Eiendomsnivå ---
  brann_dok:{n:"Brannteknisk dokumentasjon og branntegninger – årlig gjennomgang",k:"Brann",t:"Lovpålagt",h:"Forskrift om brannforebygging (FOB) §§ 4–5, § 10",i:[1,"år"],u:"Eier",lvl:"e",b:"Kontroller at brannkonsept, branntegninger og rømningsplaner er oppdatert og i samsvar med faktisk bruk og planløsning."},
  vernerunde_brann:{n:"Brannvernrunde fellesareal (rømningsveier, skilting, slokkeutstyr)",k:"Brann",t:"Egenkontroll",h:"FOB § 5",i:[3,"mnd"],u:"Driftsansvarlig",lvl:"e"},
  samordning:{n:"Samordning med leietakere (brann og HMS) – årlig møte/gjennomgang",k:"Internkontroll",t:"Lovpålagt",h:"Internkontrollforskriften § 6; arbeidsmiljøloven § 2-2; FOB",i:[1,"år"],u:"Eier",lvl:"e"},
  brannovelse_bygg:{n:"Brannøvelse – samordnet evakueringsøvelse for bygget (eier og leietakere)",k:"Brann",t:"Samordning",h:"FOB § 12: brannøvelser og opplæring av alle ansatte (plikt for hver virksomhet som bruker bygget), dokumenteres etter § 13. Samordning mellom eier og leietakere: internkontrollforskriften § 6, aml. § 2-2. Omfang og hyppighet tilpasses risiko – minst årlig er vanlig praksis",i:[1,"år"],u:"Eier / brannvernansvarlig sammen med leietakerne",lvl:"e",pl:["brannovelse"]},
  eier_ik:{n:"Eiers internkontroll – årlig gjennomgang",k:"Internkontroll",t:"Lovpålagt",h:"Internkontrollforskriften § 5 nr. 8; FOB § 10",i:[1,"år"],u:"Eier",lvl:"e"},
  leietaker_ik:{n:"Innhente bekreftelse på leietakers internkontroll og vedlikehold",k:"Internkontroll",t:"Egenkontroll",h:"Internkontrollforskriften §§ 5–6; FOB § 13 (brukers dokumentasjon); leieavtalen",i:[1,"år"],u:"Eier",lvl:"e",pl:"alle"},
  energiattest:{n:"Energiattest – fornyelse",k:"Energi",t:"Lovpålagt",h:"Energimerkeforskriften – yrkesbygg over 1000 m² skal ha gyldig energiattest synlig oppslått; attest gyldig i 10 år",i:[10,"år"],u:"Energirådgiver",lvl:"e"},
  tilstand:{n:"Tilstandsvurdering (NS 3424) og revisjon av vedlikeholdsplan",k:"Bygg",t:"Anbefalt",h:"NS 3424 / NS 3454",i:[5,"år"],u:"Rådgiver",lvl:"e"},
  uteomrade:{n:"Utvendig vernerunde (fasade, tak, adkomst, belysning, skilt)",k:"Bygg",t:"Egenkontroll",h:"Eiers aktsomhets- og vedlikeholdsplikt",i:[6,"mnd"],u:"Driftsansvarlig",lvl:"e"},
  snoeis:{n:"Snø og is på tak – sesongplan og kontroll",k:"Bygg",t:"Egenkontroll",h:"Eiers aktsomhetsplikt (erstatningsansvar)",i:[1,"år"],u:"Driftsansvarlig",lvl:"e"},
  radon:{n:"Radonmåling (ved behov / etter ombygging)",k:"Miljø",t:"Anbefalt",h:"Strålevernforskriften – tiltaksnivå 100 Bq/m³ på arbeidsplasser",i:[10,"år"],u:"Rådgiver",lvl:"e"},
  // --- Anleggsnivå ---
  fasade_kontroll:{n:"Fasade – visuell kontroll (kledning, fuger, beslag, nedfallsfare)",k:"Bygg",t:"Egenkontroll",h:"Eiers aktsomhets- og vedlikeholdsplikt; leverandørens FDV",i:[1,"år"],u:"Driftsansvarlig",lvl:"a"},
  pumpe_kontroll:{n:"Grunnvanns-/lensepumpe – funksjonskontroll og test av høynivåalarm",k:"VVS",t:"Egenkontroll",h:"Leverandørens FDV; forsikringsvilkår (vannskadeforebygging)",i:[1,"mnd"],u:"Driftsansvarlig",lvl:"a"},
  pumpe_service:{n:"Grunnvanns-/lensepumpe – årlig service og rengjøring av pumpekum",k:"VVS",t:"Service",h:"Leverandørens FDV",i:[1,"år"],u:"Rørlegger",lvl:"a"},
  nokkelsafe:{n:"Nøkkelsafe for brannvesenet – kontroll av nøkler og nøkkelliste",k:"Brann",t:"Egenkontroll",h:"Avtale med brannvesenet; FOB § 5",i:[3,"mnd"],u:"Driftsansvarlig",lvl:"a"},
  brannalarm_aar:{n:"Brannalarmanlegg – årlig kontroll og service",k:"Brann",t:"Lovpålagt",h:"FOB § 5; NS 3960; FG-regler (forsikring)",i:[1,"år"],u:"FG-godkjent firma",lvl:"a"},
  brannalarm_mnd:{n:"Brannalarmanlegg – månedlig egenkontroll",k:"Brann",t:"Egenkontroll",h:"NS 3960; anleggets driftsinstruks",i:[1,"mnd"],u:"Driftsansvarlig",lvl:"a"},
  sprinkler_aar:{n:"Sprinkleranlegg – årlig hovedkontroll",k:"Brann",t:"Lovpålagt",h:"FOB § 5; NS-EN 12845; FG-regler",i:[1,"år"],u:"FG-godkjent firma",lvl:"a"},
  sprinkler_uke:{n:"Sprinkleranlegg – ukentlig egenkontroll (trykk, ventiler, pumpe)",k:"Brann",t:"Egenkontroll",h:"NS-EN 12845; FG-regler",i:[1,"uke"],u:"Driftsansvarlig",lvl:"a"},
  nodlys_aar:{n:"Nødlys/ledelys – årlig kontroll og varighetstest",k:"Brann",t:"Lovpålagt",h:"FOB § 5; NS-EN 50172; NEK 400",i:[1,"år"],u:"Elektroinstallatør",lvl:"a"},
  nodlys_mnd:{n:"Nødlys/ledelys – månedlig funksjonstest",k:"Brann",t:"Egenkontroll",h:"NS-EN 50172",i:[1,"mnd"],u:"Driftsansvarlig",lvl:"a"},
  slokker:{n:"Håndslokkere – årlig ettersyn",k:"Brann",t:"Lovpålagt",h:"FOB § 5; NS 3910",i:[1,"år"],u:"Sertifisert servicefirma",lvl:"a"},
  brannslange:{n:"Brannslanger – årlig kontroll",k:"Brann",t:"Lovpålagt",h:"FOB § 5; NS-EN 671-3",i:[1,"år"],u:"Sertifisert servicefirma",lvl:"a"},
  roykluke:{n:"Røykluker/brannventilasjon – årlig funksjonskontroll",k:"Brann",t:"Lovpålagt",h:"FOB § 5",i:[1,"år"],u:"Servicefirma",lvl:"a"},
  branndor:{n:"Branndører og brannskiller – kontroll av lukking, tetting og gjennomføringer",k:"Brann",t:"Egenkontroll",h:"FOB § 5",i:[1,"år"],u:"Driftsansvarlig",lvl:"a"},
  brannspjeld:{n:"Brannspjeld – funksjonstest",k:"Brann",t:"Lovpålagt",h:"FOB § 5; leverandørens FDV",i:[1,"år"],u:"Ventilasjonsfirma",lvl:"a"},
  talevarsling:{n:"Talevarsling – årlig kontroll",k:"Brann",t:"Lovpålagt",h:"FOB § 5",i:[1,"år"],u:"Servicefirma",lvl:"a"},
  fyring:{n:"Fyringsanlegg – kontroll og vedlikehold",k:"Brann",t:"Lovpålagt",h:"FOB § 6; DSBs temaveiledning",i:[1,"år"],u:"Servicefirma",lvl:"a"},
  el_kontroll:{n:"Elektrisk anlegg – periodisk kontroll / internkontroll el",k:"Elektro",t:"Lovpålagt",h:"Forskrift om elektriske lavspenningsanlegg (FEL); internkontrollforskriften",i:[1,"år"],u:"Elektroinstallatør",lvl:"a"},
  termografi:{n:"Termografering av el-tavler",k:"Elektro",t:"Forsikringskrav",h:"Forsikringsvilkår / FG",i:[1,"år"],u:"Sertifisert termograf",lvl:"a"},
  nodstrom:{n:"Nødstrømsaggregat/UPS – test og service",k:"Elektro",t:"Service",h:"FEL; leverandørens FDV",i:[6,"mnd"],u:"Servicefirma",lvl:"a"},
  lynvern:{n:"Lynvernanlegg – kontroll",k:"Elektro",t:"Anbefalt",h:"NEK EN 62305",i:[3,"år"],u:"Elektroinstallatør",lvl:"a"},
  heis_periodisk:{n:"Heis/løfteinnretning – periodisk kontroll (akkreditert kontrollforetak)",k:"Heis",t:"Lovpålagt",h:"Plan- og bygningsloven § 29-9; NS-EN 13015",i:[1,"år"],u:"Akkreditert kontrollforetak",lvl:"a"},
  heis_service:{n:"Heis – service iht. serviceavtale",k:"Heis",t:"Service",h:"Pbl. § 29-9; NS-EN 13015",i:[1,"mnd"],u:"Heisfirma",lvl:"a"},
  port_kontroll:{n:"Motoriserte porter – årlig sikkerhetskontroll",k:"Bygg",t:"Lovpålagt",h:"Maskinforskriften; NS-EN 12453 / NS-EN 12604",i:[1,"år"],u:"Portleverandør",lvl:"a"},
  fallsikring:{n:"Fallsikring og forankringspunkter på tak – årlig kontroll",k:"Bygg",t:"Lovpålagt",h:"Forskrift om utførelse av arbeid; NS-EN 795",i:[1,"år"],u:"Sertifisert kontrollør",lvl:"a"},
  tak_inspeksjon:{n:"Tak – inspeksjon og rensing av sluk og renner",k:"Bygg",t:"Egenkontroll",h:"FDV / vedlikeholdsplikt",i:[1,"år"],u:"Driftsansvarlig",lvl:"a"},
  vent_service:{n:"Ventilasjon – service og filterskift",k:"VVS",t:"Service",h:"FDV; arbeidsplassforskriften (inneklima)",i:[6,"mnd"],u:"Ventilasjonsfirma",lvl:"a"},
  kanalrens:{n:"Ventilasjonskanaler – inspeksjon/rens",k:"VVS",t:"Anbefalt",h:"FDV",i:[5,"år"],u:"Ventilasjonsfirma",lvl:"a"},
  energivurdering:{n:"Energivurdering av varme- og klimaanlegg",k:"Energi",t:"Lovpålagt",h:"Energimerkeforskriften (NVE) – gjelder anlegg over effektgrensene; kontroller intervall for ditt anlegg",i:[4,"år"],u:"Kvalifisert energirådgiver",lvl:"a"},
  fgass:{n:"Kuldeanlegg/varmepumpe – lekkasjekontroll (F-gass)",k:"VVS",t:"Lovpålagt",h:"Produktforskriften kap. 6a (F-gassforordningen): normalt 12 mnd (5–50 t CO₂e), 6 mnd (50–500 t), 3 mnd (≥500 t); lengre med lekkasjevarsling",i:[12,"mnd"],u:"Sertifisert kuldetekniker",lvl:"a"},
  legionella:{n:"Legionella – risikovurdering og forebyggende tiltak",k:"VVS",t:"Lovpålagt",h:"Folkehelseforskriften kap. 3a (gjelder bl.a. dusjanlegg tilgjengelig for publikum, kjøletårn, luftskrubbere)",i:[1,"år"],u:"Eier/rørlegger",lvl:"a"},
  tilbakeslag:{n:"Tilbakeslagssikring – årlig funksjonstest",k:"VVS",t:"Lovpålagt",h:"Kommunale abonnementsvilkår; NS-EN 1717",i:[1,"år"],u:"Rørlegger",lvl:"a"},
  fettutskiller:{n:"Fettutskiller – tømming og kontroll",k:"VVS",t:"Lovpålagt",h:"Forurensningsforskriften kap. 15A; kommunal forskrift",i:[6,"mnd"],u:"Godkjent tømmefirma",lvl:"a"},
  oljeutskiller:{n:"Olje-/sandfangutskiller – tømming og kontroll",k:"VVS",t:"Lovpålagt",h:"Forurensningsforskriften kap. 15; kommunale krav",i:[1,"år"],u:"Godkjent tømmefirma",lvl:"a"},
  trykk:{n:"Trykkpåkjent utstyr – periodisk kontroll",k:"Annet",t:"Lovpålagt",h:"Forskrift om utførelse av arbeid § 10-6 (kontroll av arbeidsutstyr) og forskrift om håndtering av farlig stoff § 9 – intervall etter utstyrets kategori og bruk",i:[1,"år"],u:"Kontrollorgan",lvl:"a"},
  lekeplass:{n:"Lekeplassutstyr – årlig hovedinspeksjon",k:"Annet",t:"Lovpålagt",h:"Forskrift om sikkerhet ved lekeplassutstyr; NS-EN 1176-7",i:[1,"år"],u:"Sertifisert inspektør",lvl:"a"},
};
export const PROP_MALER=["brann_dok","vernerunde_brann","samordning","brannovelse_bygg","eier_ik","leietaker_ik","energiattest","tilstand","uteomrade","snoeis","radon"];
export const KOMP: Record<string, KompType> = {
  // NS 3451 hovedgruppe 1 – Dokumentasjon (ingen teknisk levetid)
  dok_bygg:{n:"Bygningsdokumentasjon",g:"1 Dokumentasjon",l:0},
  dok_forv:{n:"Dokumenter for forvaltning",g:"1 Dokumentasjon",l:0},
  dok_jur:{n:"Juridiske og offentlige dokumenter",g:"1 Dokumentasjon",l:0},
  dok_tomt:{n:"Tomt",g:"1 Dokumentasjon",l:0},
  dok_dim:{n:"Dimensjonering",g:"1 Dokumentasjon",l:0},
  dok_miljo:{n:"Miljø",g:"1 Dokumentasjon",l:0},
  dok_tegn:{n:"Tegninger, planer og kart",g:"1 Dokumentasjon",l:0},
  dok_brann:{n:"Branndokumentasjon",g:"1 Dokumentasjon",l:0},
  dok_sikk:{n:"Sikkerhet",g:"1 Dokumentasjon",l:0},
  dok_fdv:{n:"Drift og vedlikehold (FDV)",g:"1 Dokumentasjon",l:0},
  tak_asfalt:{n:"Tak – asfaltbelegg/takpapp",g:"2 Bygning",l:25,m:["tak_inspeksjon"],enh:"m2"},
  tak_folie:{n:"Tak – PVC/folie/membran",g:"2 Bygning",l:25,m:["tak_inspeksjon"],enh:"m2"},
  tak_stein:{n:"Tak – takstein/plater",g:"2 Bygning",l:45,m:["tak_inspeksjon"],enh:"m2"},
  taksikring:{n:"Takadkomst og fallsikring",g:"2 Bygning",l:30,m:["fallsikring"]},
  fasade_tre:{n:"Fasade – trekledning",g:"2 Bygning",l:40,m:["fasade_kontroll"],enh:"m2"},
  fasade_mur:{n:"Fasade – mur/betong/puss",g:"2 Bygning",l:60,m:["fasade_kontroll"],enh:"m2"},
  fasade_plate:{n:"Fasade – plater/sandwich",g:"2 Bygning",l:40,m:["fasade_kontroll"],enh:"m2"},
  vinduer:{n:"Vinduer",g:"2 Bygning",l:40,m:["vindu"]},
  ytterdorer:{n:"Ytterdører/inngangsparti",g:"2 Bygning",l:30,m:["nodutgang"]},
  porter:{n:"Porter (motoriserte)",g:"2 Bygning",l:25,m:["port_kontroll"]},
  branndorer:{n:"Branndører/brannskiller",g:"2 Bygning",l:30,m:["branndor"]},
  gulv:{n:"Gulvbelegg fellesareal",g:"2 Bygning",l:20,enh:"m2"},
  innv:{n:"Innvendige overflater fellesareal",g:"2 Bygning",l:12,enh:"m2"},
  sanitar:{n:"Sanitærrør (vann)",g:"3 VVS",l:45,m:["vann_ventiler"]},
  avlop:{n:"Avløpsrør",g:"3 VVS",l:50,m:["avlop_spyl"]},
  tilbakeslag:{n:"Tilbakeslagssikring",g:"3 VVS",l:20,m:["tilbakeslag"]},
  bereder:{n:"Varmtvannsbereder",g:"3 VVS",l:20,m:["bereder"]},
  dusj:{n:"Dusjanlegg/garderober",g:"3 VVS",l:25,m:["legionella"]},
  kjel:{n:"Fyringsanlegg/kjel",g:"3 VVS",l:25,m:["fyring","energivurdering"]},
  varmepumpe:{n:"Varmepumpe",g:"3 VVS",l:15,m:["fgass","energivurdering","vp_service"]},
  kjole:{n:"Kjøleanlegg/klimakjøling",g:"3 VVS",l:20,m:["fgass","energivurdering","vp_service"]},
  fjernvarme:{n:"Fjernvarme – sentral/varmeveksler",g:"3 VVS",l:30},
  fjernkjoling:{n:"Fjernkjøling – sentral/veksler",g:"3 VVS",l:30},
  radiator:{n:"Radiatorer/vannbåren varme",g:"3 VVS",l:40,m:["vannbaren"]},
  ventilasjon:{n:"Ventilasjonsaggregat",g:"3 VVS",l:25,m:["vent_service","energivurdering"]},
  kanaler:{n:"Ventilasjonskanaler",g:"3 VVS",l:45,m:["kanalrens"]},
  grunnvann:{n:"Grunnvanns-/lensepumpe",g:"3 VVS",l:15,m:["pumpe_kontroll","pumpe_service"]},
  sprinkler:{n:"Sprinkleranlegg",g:"3 VVS",l:40,m:["sprinkler_aar","sprinkler_uke"]},
  brannslanger:{n:"Brannslanger",g:"3 VVS",l:20,m:["brannslange"]},
  fettutskiller:{n:"Fettutskiller",g:"3 VVS",l:30,m:["fettutskiller"]},
  oljeutskiller:{n:"Olje-/sandfangutskiller",g:"3 VVS",l:30,m:["oljeutskiller"]},
  eltavle:{n:"Hovedtavle og fordelinger",g:"4 Elkraft",l:35,m:["el_kontroll","termografi"]},
  elanlegg:{n:"Elektrisk anlegg (kabler/installasjon)",g:"4 Elkraft",l:40,m:["el_kontroll"]},
  nodlys:{n:"Nødlys/ledelys",g:"4 Elkraft",l:15,m:["nodlys_aar","nodlys_mnd"]},
  nodstrom:{n:"Nødstrømsaggregat/UPS",g:"4 Elkraft",l:20,m:["nodstrom"]},
  belysning:{n:"Belysning",g:"4 Elkraft",l:15},
  lynvern:{n:"Lynvern",g:"4 Elkraft",l:40,m:["lynvern"]},
  lading:{n:"Ladeanlegg el-bil",g:"4 Elkraft",l:12,m:["el_kontroll"]},
  solcelle:{n:"Solcelleanlegg",g:"4 Elkraft",l:25,m:["el_kontroll"]},
  brannalarm:{n:"Brannalarmanlegg",g:"5 Tele og automasjon",l:15,m:["brannalarm_aar","brannalarm_mnd"]},
  sd:{n:"SD-anlegg/byggautomasjon",g:"5 Tele og automasjon",l:15,m:["sd_kontroll"]},
  adgang:{n:"Adgangskontroll/innbruddsalarm",g:"5 Tele og automasjon",l:12,m:["innbrudd"]},
  talevarsling:{n:"Talevarsling",g:"5 Tele og automasjon",l:15,m:["talevarsling"]},
  heis:{n:"Heis",g:"6 Andre installasjoner",l:25,m:["heis_periodisk","heis_service"]},
  rulletrapp:{n:"Rulletrapp/rullebånd",g:"6 Andre installasjoner",l:25,m:["heis_periodisk","heis_service"]},
  loft:{n:"Løftebord/plattformheis",g:"6 Andre installasjoner",l:20,m:["heis_periodisk"]},
  nokkelsafe:{n:"Nøkkelsafe (brannvesenets)",g:"6 Andre installasjoner",l:20,m:["nokkelsafe"]},
  roykluker:{n:"Røykluker/brannventilasjon",g:"6 Andre installasjoner",l:25,m:["roykluke"]},
  brannspjeld:{n:"Brannspjeld",g:"6 Andre installasjoner",l:30,m:["brannspjeld"]},
  slokkere:{n:"Håndslokkere",g:"6 Andre installasjoner",l:20,m:["slokker"]},
  trykk:{n:"Trykkpåkjent utstyr",g:"6 Andre installasjoner",l:20,m:["trykk"]},
  asfalt:{n:"Asfalt/parkering",g:"7 Utendørs",l:20,enh:"m2"},
  lekeplass:{n:"Lekeplass/uteområde-utstyr",g:"7 Utendørs",l:15,m:["lekeplass"]},
  gjerder:{n:"Gjerder/murer/støttemurer",g:"7 Utendørs",l:30,m:["stottemur"]},
  annet:{n:"Annet",g:"Annet",l:20},
};
/* TFM: standard systemkode (NS 3451) og hovedkomponent per type. Der tredje siffer er usikkert er hovedgruppen (xx0) brukt. */
export const TFM_DEF: Record<string, [string, string]> = {dok_bygg:["10",""],dok_forv:["11",""],dok_jur:["12",""],dok_tomt:["13",""],dok_dim:["14",""],dok_miljo:["15",""],dok_tegn:["16",""],dok_brann:["17",""],dok_sikk:["18",""],dok_fdv:["19",""],tak_asfalt:["262","EA"],tak_folie:["262","EA"],tak_stein:["262","EA"],taksikring:["260","CA"],fasade_tre:["235","EA"],fasade_mur:["230","AA"],fasade_plate:["235","EA"],vinduer:["234","DV"],ytterdorer:["234","DU"],porter:["234","DP"],branndorer:["244","DB"],gulv:["255","EA"],innv:["240","EA"],
 sanitar:["313","KR"],avlop:["312","KN"],tilbakeslag:["313","SG"],bereder:["315","NW"],dusj:["315","UB"],kjel:["320","IO"],varmepumpe:["320","IK"],kjole:["370","IK"],radiator:["320","LD"],ventilasjon:["360","IV"],kanaler:["360","KK"],sprinkler:["332","SJ"],brannslanger:["330","UO"],fettutskiller:["312","MO"],oljeutskiller:["312","MO"],
 eltavle:["432","FS"],elanlegg:["433","FS"],nodlys:["443","UN"],nodstrom:["460","IG"],belysning:["440","UP"],lynvern:["410","QY"],lading:["430","UE"],solcelle:["400","IG"],
 brannalarm:["542","OS"],sd:["563","OS"],adgang:["543","RK"],grunnvann:["319","JP"],fjernvarme:["320","RF"],fjernkjoling:["370","RF"],nokkelsafe:["549",""],talevarsling:["540","UH"],heis:["621","KH"],rulletrapp:["622","KH"],loft:["620","KH"],roykluker:["263","DL"],brannspjeld:["360","SZ"],slokkere:["330","NZ"],trykk:["340","NT"],asfalt:["760","EA"],lekeplass:["770","HM"],gjerder:["720","AA"],annet:["","" ]};
export const NS3451: [string, string][] = [["21","Grunn og fundamenter"],["22","Bæresystemer"],["23","Yttervegger"],["234","Vinduer, dører, porter (yttervegg)"],["235","Utvendig kledning og overflate"],["24","Innervegger"],["244","Vinduer, dører, foldevegger (innervegg)"],["25","Dekker"],["255","Gulvoverflater"],["26","Yttertak"],["262","Taktekning"],["263","Glasstak, overlys og takluker"],["27","Fast inventar"],["28","Trapper, balkonger m.m."],["29","Andre bygningsmessige deler"],
 ["31","Sanitær"],["312","Ledningsnett for avløp"],["313","Ledningsnett for vannforsyning"],["315","Utstyr for sanitærinstallasjoner"],["32","Varme"],["33","Brannslokking"],["332","Sprinkleranlegg"],["34","Gass og trykkluft"],["35","Prosesskjøling"],["36","Luftbehandling"],["37","Komfortkjøling"],["38","Vannbehandling"],["39","Andre VVS-installasjoner"],
 ["41","Basisinstallasjoner for elkraft"],["42","Høyspent forsyning"],["43","Lavspent forsyning"],["432","Hovedfordeling"],["433","Fordeling til alminnelig forbruk"],["434","Fordeling til driftstekniske installasjoner"],["44","Lys"],["443","Nødlys"],["45","Elvarme"],["46","Reservekraft"],["49","Andre elkraftinstallasjoner"],
 ["51","Basisinstallasjoner tele og automatisering"],["52","Integrert kommunikasjon"],["521","Kabling for IKT"],["53","Telefoni og personsøking"],["54","Alarm- og signalsystemer"],["542","Brannalarm"],["543","Adgangskontroll, innbrudds- og overfallsalarm"],["55","Lyd- og bildesystemer"],["56","Automatisering"],["563","Automatikk/SD-anlegg"],["57","Instrumentering"],
 ["61","Prefabrikkerte rom"],["62","Person- og varetransport"],["621","Heiser"],["622","Rulletrapper og rullebånd"],["63","Transportanlegg for småvarer"],["64","Sceneteknisk utstyr"],["65","Avfall og støvsuging"],["66","Fastmontert spesialutrustning"],["69","Andre tekniske installasjoner"],
 ["71","Bearbeidet terreng"],["72","Utendørs konstruksjoner"],["73","Utendørs røranlegg"],["74","Utendørs elkraft"],["75","Utendørs tele og automatisering"],["76","Veier og plasser"],["77","Parker og hager"],["78","Utendørs infrastruktur"]];
export const TFM_KODER: [string, string][] = [["AA","Bærende/romdannende konstruksjon"],["CA","Kompletterende/påmontert bygningsdel"],["DB","Branndør"],["DI","Innvendig dør"],["DL","Luke (inspeksjon, brann, røykluke)"],["DP","Port (rulle-, folde-, skyveport)"],["DU","Utvendig dør"],["DV","Vindu"],["EA","Bekledning/overflate (tak, gulv, fasade)"],
 ["FS","Skap/tavle (el-tavle, rack)"],["HM","Maskin/utstyr"],["IB","Brenner"],["IC","Gasskjel"],["IE","Elektrokjel"],["IF","Kjel for fast brensel/bio"],["IG","Generator/aggregat"],["IK","Kjølemaskin/varmepumpe"],["IO","Oljekjel"],["IT","Trykkluftaggregat"],["IV","Ventilasjonsaggregat (komplett)"],
 ["JK","Kompressor"],["JP","Pumpe"],["JV","Vifte"],["KA","Aktuator (spjeld-/ventilmotor, dørautomatikk)"],["KH","Transportenhet (heiskabin, rulletrapp)"],["KK","Kanal"],["KN","Avløp/sluk"],["KR","Rør"],["KW","Lavspentkabel"],["KX","Svakstrømskabel/sløyfe"],
 ["LC","Varme-/kjøleenhet med vifte (aerotemper, fancoil)"],["LD","Radiator/varmeflate"],["LK","Kjølebatteri"],["LR","Frekvensomformer"],["LU","Befukter"],["LV","Varmebatteri/varmeveksler"],["LX","Varmegjenvinner"],
 ["MF","Luftfilter"],["MG","Fettfilter"],["MO","Utskiller (olje/fett)"],["MR","Rist/gitter"],["MV","Vannfilter"],["NB","Batteri/UPS"],["NT","Tank med trykk (ekspansjon, akkumulator)"],["NU","Tank uten trykk"],["NW","Varmtvannsbereder"],["NZ","Brannslokker"],
 ["OE","Energimåler"],["OS","Sentralenhet (brannsentral, SD-sentral)"],["OU","Undersentral/kontroller"],["QD","Differansetrykkvakt (filtervakt)"],["QT","Termostat/frostvakt"],["QV","Sikkerhetsventil"],["QY","Overspenningsvern/lynavleder"],["QZ","Brannbeskyttelse (branntetting)"],
 ["RB","Bevegelsesdetektor"],["RD","Differansetrykkgiver"],["RE","Elektrisk måling"],["RF","Mengdemåler"],["RH","Fuktgiver"],["RK","Kortleser"],["RP","Trykkgiver/manometer"],["RT","Temperaturgiver"],["RY","Røyk-/gassdetektor (brannmelder, CO₂)"],
 ["SB","Reguleringsventil"],["SC","Motorstyrt stengeventil"],["SG","Tilbakeslagsventil"],["SJ","Trykkreduksjons-/alarmventil (sprinkler)"],["SM","Manuell stengeventil"],["SQ","VAV-regulator"],["SR","Reguleringsspjeld"],["SS","Stengespjeld"],["SV","Strupeventil"],["SZ","Brann-/røykspjeld"],
 ["UB","Blandebatteri"],["UE","Stikkontakt/uttak"],["UH","Høyttaler"],["UN","Nødlys/ledelys"],["UO","Slangetrommel (brannslange)"],["UP","Lysarmatur"],["UZ","Dyse/sprinklerhode"],["XF","Vern (sikring, jordfeilbryter)"],["XM","Elektromotor"],["XQ","Effektbryter"],["XS","Bryter/trykknapp"]];
// Leietakers plikter. dok = sjekkliste over dokumentasjon eier bør innhente / leietaker bør kunne legge fram.
export const PLIKTER: Record<string, { n: string; h: string; dok?: string[] }> = {
  brannvernleder:{n:"Ansvarlig for brannsikkerhet (brannvernleder) utpekt og meldt til eier",h:"FOB § 12 (ansvarsforhold før og under brann)",dok:["Navn og kontaktinfo til brannvernleder/brannansvarlig","Stedfortreder","Dato meldt skriftlig til eier"]},
  branninstruks:{n:"Branninstruks fastsatt og gjort kjent for alle ansatte",h:"FOB § 12 (instruks for varsling, evakuering/redning og slokking)",dok:["Branninstruks for virksomheten (varsling, evakuering/redning, slokking)","Bekreftelse på at instruksen er formidlet til alle ansatte","Rømningsplan/oppslag i egne lokaler"]},
  brannovelse:{n:"Brannøvelse gjennomført og ansatte opplært",h:"FOB § 12 (brannøvelser og opplæring av alle ansatte) og § 13 (dokumentasjon)",dok:["Dato og type øvelse (evakuering, praktisk slokking, teoretisk)","Deltakerliste","Evaluering med læringspunkter og tiltak","Opplæring av nyansatte og vikarer (dato/liste)","Plan for neste øvelse"]},
  rommingsvei:{n:"Rømningsveier i egne lokaler holdes frie, merket og funksjonelle",h:"FOB § 11 (rømningsveiene skal opprettholde sin funksjon)",dok:["Egenkontroll/sjekkliste for rømningsveier og nødutganger","Kontroll av slokkeutstyr i egne lokaler (tilgjengelig, ikke tildekket)","Avvik og tiltak"]},
  brann_syst:{n:"Systematisk brannsikkerhetsarbeid dokumentert (mål, rutiner, egenkontroller)",h:"FOB §§ 12–13",dok:["Mål og plan for brannsikkerhetsarbeidet","Rutiner for brannsikker drift (f.eks. varme arbeider, avfall, elektrisk utstyr)","Gjennomførte egenkontroller i perioden","Avviksliste med lukking","Årlig gjennomgang av brannvernarbeidet"]},
  hms_ik:{n:"HMS-internkontroll etablert (risikovurdering, handlingsplan, årlig gjennomgang)",h:"Internkontrollforskriften § 5",dok:["Mål for helse, miljø og sikkerhet","Oversikt over ansvar, oppgaver og myndighet (organisering)","Kartlegging og risikovurdering med handlingsplan","Rutiner for å avdekke, rette og forebygge avvik","Oversikt over relevante lover og forskrifter","Dokumentert årlig gjennomgang av internkontrollen (§ 5 nr. 8)"]},
  samordningsavtale:{n:"Samordningsavtale brann/HMS signert og gjeldende",h:"Internkontrollforskriften § 6; aml. § 2-2",dok:["Signert samordningsavtale","Kontaktpersoner for brann og HMS","Dato for siste samordningsmøte"]},
  el_egne:{n:"Egne elektriske installasjoner og utstyr kontrollert",h:"FEL; internkontrollforskriften",dok:["Oversikt over egne el-anlegg og utstyr","Kontrollrapport / internkontroll el for egne installasjoner","Termografirapport hvis forsikringen krever det"]},
  vedlikehold:{n:"Vedlikehold iht. leieavtalen utført (innvendig, egne anlegg)",h:"Leieavtalen",dok:["Bekreftelse på utført vedlikehold iht. ansvarsfordelingen","Servicerapporter for anlegg leietaker har ansvar for"]},
  forsikring:{n:"Gyldig forsikring for innbo/løsøre og ansvar",h:"Leieavtalen",dok:["Forsikringsbevis/polise med gyldighetsdato"]},
  endring:{n:"Ingen endret bruk/ombygging uten varsel til eier",h:"Pbl. § 20-1; leieavtalen",dok:["Skriftlig bekreftelse på at det ikke er gjort endringer, eller varsel/søknad og ansvarsrett ved ombygging"]},
  fett:{n:"Fettutskiller tømt og dokumentert (servering)",h:"Forurensningsforskriften kap. 15A / kommunal forskrift",dok:["Tømmebevis fra godkjent firma","Kontroll/serviceattest"]},
  fgass_egen:{n:"Egne kjøle-/fryseanlegg – lekkasjekontroll dokumentert",h:"Produktforskriften kap. 6a",dok:["Lekkasjekontrollrapport fra sertifisert kuldetekniker","Servicelogg for anlegget"]},
  // Plikter som følger av kontraktstypen (leietaker drifter tekniske anlegg / bygget)
  serviceavtaler:{n:"Serviceavtaler og periodisk service på tekniske anlegg leietaker drifter",h:"Leieavtalen; FOB § 6 (vedlikehold av byggverk og installasjoner)",dok:["Oversikt over anlegg og serviceleverandører","Gyldige serviceavtaler","Servicerapporter for perioden","Avvik fra service og hvordan de er lukket"]},
  fdv:{n:"FDV-dokumentasjon holdes oppdatert etter service og endringer",h:"Leieavtalen; TEK17 § 4-1",dok:["Oppdatert FDV for anlegg som er endret eller skiftet","Oversikt over endringer i perioden"]},
  brann_anlegg:{n:"Kontroll og service av brannalarm, sprinkler, nødlys og slokkere",h:"FOB § 6 og § 10; NS 3960, NS-EN 12845, NS-EN 50172",dok:["Årlig kontrollrapport brannalarm (FG-godkjent)","Sprinkler – årlig kontroll og service","Nødlys – årlig kontroll og funksjonstest","Håndslokkere og brannslanger – kontroll","Egenkontroll-logg (månedlig/kvartalsvis)"]},
  el_hoved:{n:"Internkontroll og periodisk kontroll av el-anlegget",h:"FEL § 10; FOB § 6",dok:["Kontrollrapport for el-anlegget","Termografirapport","Avviksliste med lukking"]},
  utvendig:{n:"Utvendig vedlikehold (tak, fasade, vinduer) utført og dokumentert",h:"Leieavtalen; pbl. § 31-3 (byggverk holdes i stand)",dok:["Takinspeksjon / rapport (sluk, membran, beslag)","Dokumentasjon på utført vedlikehold av fasade og vinduer","Plan for kommende vedlikehold"]},
  heis_kontroll:{n:"Heis – serviceavtale og periodisk sakkyndig kontroll",h:"Forskrift om heis (DSB/TEK); NS-EN 13015",dok:["Serviceavtale med heisfirma","Rapport fra periodisk sakkyndig kontroll","Lukking av pålegg"]},
  uteareal:{n:"Snømåking, strøing og vedlikehold av uteareal",h:"Leieavtalen; vegtrafikkloven/ansvar for fallulykker",dok:["Avtale om brøyting og strøing","Logg eller bekreftelse for vintersesongen"]},
  utskiftingsplan:{n:"Plan for utskifting av bygningsdeler og anlegg leietaker har ansvar for",h:"Leieavtalen",dok:["Langsiktig vedlikeholds- og utskiftingsplan","Dokumentasjon på utførte utskiftinger","Oppdatert FDV etter utskifting"]},
};
export const STD_PLIKTER=["brannvernleder","branninstruks","brannovelse","rommingsvei","brann_syst","hms_ik","samordningsavtale","el_egne","vedlikehold","forsikring","endring"];
export const VEDL_KAT: [string, string][] = [
  ["Tak, fasader, vinduer og utvendig vedlikehold","Eier"],
  ["Bærende konstruksjoner","Eier"],
  ["Utskifting av bygningsdeler og tekniske anlegg","Eier"],
  ["Fellesanlegg (ventilasjon, varme, sanitær, el-hovedanlegg)","Eier"],
  ["Brannteknisk utstyr (alarm, nødlys, slokkere)","Eier"],
  ["Innvendig vedlikehold av leieobjektet (vegger, gulv, himling)","Leietaker"],
  ["Dører, låser og nøkler i leieobjektet","Leietaker"],
  ["Belysning, armaturer og stikkontakter i leieobjektet","Leietaker"],
  ["Sluk, vannlåser og avløp i leieobjektet (rensing)","Leietaker"],
  ["Anlegg som kun betjener leieobjektet (filterskift, ettersyn)","Delt"],
  ["Leietakers egne installasjoner (kjøl, kjøkken, IT)","Leietaker"],
  ["Renhold og avfallshåndtering","Leietaker"],
  ["Snømåking, strøing og uteareal","Eier"],
];
export const DOK_TYPER=["Ferdigattest/brukstillatelse","Brannkonsept/brannteknisk dokumentasjon","Branntegninger/rømningsplaner","FDV-dokumentasjon","Energiattest","Samsvarserklæring el-anlegg","Tilstandsrapport","Miljøkartlegging (asbest/PCB)","Forsikringspolise","Tegninger (plan/snitt/fasade)","Radonmåling","Tilsynsrapport","Servicerapport","Egenkontrollskjema","Serviceavtale","Leieavtale","Samordningsavtale","Leietakers IK-dokumentasjon","SHA-plan","Prosjektdokumentasjon","Kontrakt / tilbud","Oversiktsliste (mannskap)","Brannvernpakke (informasjon til leietaker)","Statusrapport til eier","Annet"];
export const DOK_PAAKREVD=DOK_TYPER.slice(0,9);
// NS 3451 hovedgruppe 1 – Dokumentasjon (koder 10–19) og hvilken undergruppe hver dokumenttype hører til
export const NS_DOK: Record<string, string> = { '10': 'Bygningsdokumentasjon', '11': 'Dokumenter for forvaltning', '12': 'Juridiske og offentlige dokumenter', '13': 'Tomt', '14': 'Dimensjonering', '15': 'Miljø', '16': 'Tegninger, planer og kart', '17': 'Branndokumentasjon', '18': 'Sikkerhet', '19': 'Drift og vedlikehold' };
export const DOK_NS: Record<string, string> = { 'Ferdigattest/brukstillatelse': '12', 'Brannkonsept/brannteknisk dokumentasjon': '17', 'Branntegninger/rømningsplaner': '17', 'FDV-dokumentasjon': '19', 'Energiattest': '15', 'Samsvarserklæring el-anlegg': '12', 'Tilstandsrapport': '11', 'Miljøkartlegging (asbest/PCB)': '15', 'Forsikringspolise': '11', 'Tegninger (plan/snitt/fasade)': '16', 'Radonmåling': '15', 'Tilsynsrapport': '12', 'Servicerapport': '19', 'Egenkontrollskjema': '19', 'Serviceavtale': '19', 'Leieavtale': '11', 'Samordningsavtale': '18', 'Leietakers IK-dokumentasjon': '18', 'Annet': '10' };
export const dokNs = (d: { type?: string; ns?: string }) => d.ns || DOK_NS[d.type || ''] || '10';
export const DOK_LEIE=["Leieavtale","Samordningsavtale"];
export const KATEGORIER=["Kontor","Handel","Lager/logistikk","Industri/verksted","Hotell/servering","Helse/omsorg","Undervisning","Kombinasjonsbygg","Parkering","Annet"];
export const AV_STATUS=["Ny","Under vurdering","Planlagt","Under utbedring","Utført – til kontroll","Utsatt","Rettet","Avvist","Lukket"];
export const AV_LUKKET=["Rettet","Avvist","Lukket"];
export const AV_ALV=["Kritisk","Høy","Middels","Lav"];
export const AV_FRIST: Record<string, number> = {Kritisk:7,"Høy":30,Middels:90,Lav:365};
export const AV_KILDE=["Servicerapport","Egenkontroll","Periodisk kontroll","Leietaker","Brannvesen/tilsyn","Arbeidstilsynet","El-tilsyn","Forsikring","Tilstandsvurdering","Eier/drift","Annet"];
export const TYPER=["Lovpålagt","Egenkontroll","Service","Forsikringskrav","Anbefalt","Vedlikehold"];
export const KATS=["Brann","Elektro","Heis","VVS","Energi","Bygg","Internkontroll","Miljø","Annet"];
export const ENH: [string, string][] = [["uke","uke(r)"],["mnd","måned(er)"],["år","år"]];


/* Serviceavtale per systemtype.
   lov = lovkrav om fagkyndig vedlikehold/kontroll – serviceavtale er den normale måten å oppfylle kravet på
   anb = ikke lovkrav, men anbefalt (driftssikkerhet, garanti, forsikring) */
export const SERVICEAVTALE: Record<string, { n: 'lov' | 'anb'; h: string }> = {
  heis: { n: 'lov', h: 'Pbl. § 29-9 og TEK17 § 16-1: eier skal sørge for vedlikehold og ettersyn utført av fagkyndig, i tillegg til sikkerhetskontroll minst hvert annet år' },
  rulletrapp: { n: 'lov', h: 'Pbl. § 29-9 og TEK17 § 16-1: vedlikehold og ettersyn utført av fagkyndig' },
  loft: { n: 'lov', h: 'Pbl. § 29-9 og TEK17 § 16-1: vedlikehold og ettersyn av løfteinnretning' },
  brannalarm: { n: 'lov', h: 'Forskrift om brannforebygging § 5: sikkerhetsinnretninger skal kontrolleres og vedlikeholdes (NS 3960). Forsikring krever normalt FG-godkjent firma' },
  talevarsling: { n: 'lov', h: 'Forskrift om brannforebygging § 5: sikkerhetsinnretninger skal kontrolleres og vedlikeholdes (NS 3961)' },
  sprinkler: { n: 'lov', h: 'Forskrift om brannforebygging § 5 (NS-EN 12845). Forsikring krever normalt årlig kontroll av FG-godkjent firma' },
  roykluker: { n: 'lov', h: 'Forskrift om brannforebygging § 5: brannventilasjon er sikkerhetsinnretning som skal kontrolleres og vedlikeholdes' },
  fettutskiller: { n: 'lov', h: 'Forurensningsforskriften kap. 15A og kommunal forskrift: regelmessig tømming av godkjent firma – mange kommuner krever tømmeavtale' },
  oljeutskiller: { n: 'lov', h: 'Forurensningsforskriften kap. 15 og kommunal forskrift: tømming og kontroll av godkjent firma' },
  varmepumpe: { n: 'lov', h: 'Produktforskriften kap. 6a (F-gass): lekkasjekontroll av sertifisert personell/foretak' },
  kjole: { n: 'lov', h: 'Produktforskriften kap. 6a (F-gass): lekkasjekontroll av sertifisert personell/foretak' },
  trykk: { n: 'lov', h: 'Forskrift om utførelse av arbeid § 10-6 og forskrift om håndtering av farlig stoff § 9: periodisk kontroll av trykkpåkjent utstyr i bruk' },
  nodlys: { n: 'anb', h: 'Årlig kontroll (NS-EN 50172) – kan gjøres av egen elektroinstallatør. Forsikring kan kreve det' },
  nodstrom: { n: 'anb', h: 'Anbefalt service etter produsentens krav' },
  ventilasjon: { n: 'anb', h: 'Anbefalt for drift, inneklima og energi' },
  sd: { n: 'anb', h: 'Anbefalt for drift og programvareoppdatering' },
  adgang: { n: 'anb', h: 'Anbefalt; forsikring kan kreve service på innbruddsalarm' },
  kjel: { n: 'anb', h: 'Anbefalt service på brenner og kjel' },
  brannspjeld: { n: 'anb', h: 'Funksjonstest etter FOB § 5 – kan inngå i avtale med ventilasjonsfirma' },
};

/* Tagger (fagområder) for systemer og komponenter. Komponenter arver systemets tagger hvis de ikke har egne. */
export const TAGGER: [string, string][] = [['Brann', '#b42318'], ['HVAC', '#0e7490'], ['VVS', '#2457a6'], ['Elektro', '#b07a00'], ['Bygning', '#8a5a2b'], ['Heis', '#7b3fa0'], ['Tele/IKT', '#4b5563'], ['Sikkerhet', '#9f1239'], ['Energi', '#15803d'], ['Utomhus', '#5b6b00']];
export const TYPE_TAGGER: Record<string, string[]> = {
  dok_brann: ['Brann'], dok_sikk: ['Sikkerhet'], dok_miljo: ['Energi'],
  brannalarm: ['Brann', 'Elektro'], talevarsling: ['Brann', 'Elektro'], nodlys: ['Brann', 'Elektro'], sprinkler: ['Brann', 'VVS'], brannslanger: ['Brann', 'VVS'], slokkere: ['Brann'],
  roykluker: ['Brann', 'Bygning'], brannspjeld: ['Brann', 'HVAC'], ventilasjon: ['HVAC'], kanaler: ['HVAC'], kjole: ['HVAC', 'Energi'], varmepumpe: ['HVAC', 'Energi'],
  heis: ['Heis'], rulletrapp: ['Heis'], loft: ['Heis'], eltavle: ['Elektro'], elanlegg: ['Elektro'], nodstrom: ['Elektro'], belysning: ['Elektro'], lynvern: ['Elektro'], lading: ['Elektro', 'Energi'], solcelle: ['Elektro', 'Energi'],
  sd: ['Tele/IKT', 'Energi'], adgang: ['Sikkerhet', 'Tele/IKT'], fettutskiller: ['VVS'], oljeutskiller: ['VVS', 'Utomhus'], trykk: ['VVS'], kjel: ['VVS', 'Energi'], radiator: ['VVS'],
  asfalt: ['Utomhus'], lekeplass: ['Utomhus'], gjerder: ['Utomhus'],
};
/** Standardtagg ut fra hovedgruppe i NS 3451 når typen ikke har egne */
export const NS_TAGG: Record<string, string> = { '2': 'Bygning', '3': 'VVS', '4': 'Elektro', '5': 'Tele/IKT', '6': 'Bygning', '7': 'Utomhus' };

/* Tilstandsgrader etter NS 3424 (Tilstandsanalyse av byggverk). Beskrivelsene er en forenklet gjengivelse. */
export const TG_DEF: [string, string, string][] = [
  ['TG0', 'Ingen avvik', 'Tilstanden tilsvarer referansenivået eller bedre. Ingen symptomer på avvik.'],
  ['TG1', 'Mindre eller moderate avvik', 'Normal slitasje og vedlikeholdt, eller avvik/mangel på dokumentasjon som ikke er vesentlig.'],
  ['TG2', 'Vesentlige avvik', 'Sterkt nedslitt, vesentlig skade eller redusert funksjon, kort gjenværende brukstid, mangelfullt utført/vedlikeholdt eller vesentlig dokumentasjon mangler.'],
  ['TG3', 'Stort eller alvorlig avvik', 'Total eller nært forestående funksjonssvikt, behov for strakstiltak eller fare for liv og helse.'],
  ['TGIU', 'Ikke undersøkt', 'Ikke tilgjengelig for inspeksjon og mangler dokumentasjon, samtidig som mulig avvik kan gi vesentlige konsekvenser.'],
];
export const KG_DEF: [string, string][] = [['KG0', 'Ingen konsekvens'], ['KG1', 'Små og middels konsekvenser'], ['KG2', 'Middels store konsekvenser'], ['KG3', 'Store og alvorlige konsekvenser']];
