// Landpakke Sverige. Kilder: lag (2003:778) om skydd mot olyckor (LSO), plan- och bygglagen/-förordningen (PBL/PBF),
// Boverkets föreskrifter om OVK (BFS 2011:16, ändrad BFS 2025:6) och om motordrivna anordningar (BFS 2011:12; nya
// BFS 2025:11–13 gäller från 2027-01-01), lag (2006:985) om energideklaration, arbetsmiljölagen med Arbetsmiljöverkets
// föreskrifter (AFS 2023:1 m.fl.), EU:s F-gasförordning (EU) 2024/573 och Svenska Brandskyddsföreningens regler
// (SBF 110 brandlarm, SBF 120 sprinkler – försäkringskrav). Intervall är vägledande och bör kvalitetssäkras lokalt.
import type { Mal } from '../catalog';
import type { Pakke } from './pakke';

const M: Record<string, Mal> = {
  // --- Fastighetsnivå
  se_sba: { n: 'Systematiskt brandskyddsarbete (SBA) – dokumentation, ansvar och årlig uppföljning', k: 'Brann', t: 'Lovpålagt', h: 'LSO 2 kap. 2 § (ägare och nyttjanderättshavare ska hålla skäligt brandskydd); MSB:s allmänna råd om systematiskt brandskyddsarbete', i: [1, 'år'], u: 'Fastighetsägare', lvl: 'e', b: 'Gör en skriftlig gränsdragning mot hyresgästerna (t.ex. Fastighetsägarnas brandskyddsklausul i hyresavtalet).' },
  se_sba_kontroll: { n: 'Brandskyddskontroll enligt SBA – utrymningsvägar, skyltar, släckutrustning, dörrar', k: 'Brann', t: 'Egenkontroll', h: 'LSO 2 kap. 2 §; MSB:s allmänna råd om SBA (egenkontroller enligt checklista)', i: [1, 'mnd'], u: 'Brandskyddsansvarig / fastighetsskötare', lvl: 'e' },
  se_samordning: { n: 'Samordning av brandskydd och arbetsmiljö med hyresgästerna', k: 'Internkontroll', t: 'Lovpålagt', h: 'Arbetsmiljölagen 3 kap. 7 § (samordning på gemensamt arbetsställe); LSO 2 kap. 2 §', i: [1, 'år'], u: 'Fastighetsägare', lvl: 'e' },
  se_hyresgast_sba: { n: 'Inhämta hyresgästernas SBA- och SAM-dokumentation', k: 'Internkontroll', t: 'Egenkontroll', h: 'LSO 2 kap. 2 § (nyttjanderättshavarens ansvar); AFS 2023:1 systematiskt arbetsmiljöarbete; hyresavtal', i: [1, 'år'], u: 'Fastighetsägare / förvaltare', lvl: 'e', pl: 'alle' },
  se_energidekl: { n: 'Energideklaration – giltig deklaration (förnyas var 10:e år)', k: 'Energi', t: 'Lovpålagt', h: 'Lag (2006:985) om energideklaration för byggnader – krävs när byggnaden upplåts med nyttjanderätt; byggnader > 250 m² som ofta besöks av allmänheten ska ha deklarationen uppsatt', i: [10, 'år'], u: 'Certifierad energiexpert', lvl: 'e' },
  se_radon: { n: 'Radonmätning på arbetsplats', k: 'Annet', t: 'Anbefalt', h: 'Strålskyddslagen (2018:396) och SSM:s föreskrifter – referensnivå 200 Bq/m³ på arbetsplatser', i: [10, 'år'], u: 'Mätföretag', lvl: 'e', b: 'Krav att mäta gäller arbetsplatser i radonriskområden och vissa lokaler under mark – kontrollera kommunens riskkarta.' },
  se_forsakring: { n: 'Försäkring – kontroll av villkor och säkerhetsföreskrifter', k: 'Annet', t: 'Forsikringskrav', h: 'Försäkringsvillkor (ofta krav på SBF-regler för brandlarm/sprinkler och elrevision)', i: [1, 'år'], u: 'Fastighetsägare', lvl: 'e' },
  se_elrevision: { n: 'Elrevision / termografering av elanläggning', k: 'Elektro', t: 'Forsikringskrav', h: 'Elsäkerhetslagen (2016:732) – innehavaren ska hålla anläggningen säker; elrevision krävs ofta av försäkringsbolaget', i: [1, 'år'], u: 'Auktoriserat elinstallationsföretag', lvl: 'e' },
  se_uteomrade: { n: 'Utemiljö – halkbekämpning, snöras och istappar', k: 'Utomhus', t: 'Lovpålagt', h: 'Ordningslagen 3 kap. 3 § och kommunala föreskrifter; skadeståndsansvar', i: [1, 'år'], u: 'Fastighetsskötare', lvl: 'e' },
  // --- Systemnivå
  se_ovk_ftx: { n: 'OVK – obligatorisk ventilationskontroll (FT/FTX)', k: 'VVS', t: 'Lovpålagt', h: 'PBF 5 kap. 1–7 §§; BFS 2011:16 OVK (ändrad BFS 2025:6) – kontor och lokaler med FT-/FTX-ventilation: vart 3:e år', i: [3, 'år'], u: 'Certifierad funktionskontrollant', lvl: 'a', b: 'Protokollet ska anslås synligt i byggnaden.' },
  se_ovk_f: { n: 'OVK – obligatorisk ventilationskontroll (S/F/FX)', k: 'VVS', t: 'Lovpålagt', h: 'PBF 5 kap. 1–7 §§; BFS 2011:16 OVK – byggnader med S-, F- och FX-ventilation: vart 6:e år', i: [6, 'år'], u: 'Certifierad funktionskontrollant', lvl: 'a' },
  se_vent_drift: { n: 'Ventilation – filterbyte och skötsel enligt drift- och skötselinstruktion', k: 'VVS', t: 'Service', h: 'BBR 6:25 (ventilation ska fungera); leverantörens instruktion', i: [6, 'mnd'], u: 'Serviceföretag', lvl: 'a' },
  se_hiss: { n: 'Hiss – återkommande besiktning av ackrediterat kontrollorgan', k: 'Heis', t: 'Lovpålagt', h: 'PBF 5 kap. 8–11 §§; BFS 2011:12 H (besiktning vart 1:a eller 2:a år beroende på typ); från 2027-01-01 BFS 2025:11–12', i: [1, 'år'], u: 'Ackrediterat kontrollorgan', lvl: 'a', b: 'Ändra till 2 år om besiktningsintyget anger det. Kontrollera de nya reglerna som gäller från 2027.' },
  se_hiss_service: { n: 'Hiss – förebyggande underhåll', k: 'Heis', t: 'Service', h: 'Ägaren ansvarar för säker användning (PBF 5 kap.); serviceavtal med hissföretag', i: [1, 'mnd'], u: 'Hissföretag', lvl: 'a' },
  se_port: { n: 'Motordriven port – återkommande besiktning', k: 'Bygg', t: 'Lovpålagt', h: 'PBF 5 kap. 8–11 §§; BFS 2011:12 H (portar i byggnader där allmänheten har tillträde)', i: [1, 'år'], u: 'Ackrediterat kontrollorgan', lvl: 'a' },
  se_brandlarm_kvartal: { n: 'Brandlarm – kvartalskontroll och årlig revision (SBF 110)', k: 'Brann', t: 'Forsikringskrav', h: 'SBF 110 Regler för brandlarm (försäkringskrav) – anläggningsskötare prov varje kvartal; revisionsbesiktning årligen av certifierat besiktningsföretag', i: [3, 'mnd'], u: 'Anläggningsskötare', lvl: 'a' },
  se_brandlarm_revision: { n: 'Brandlarm – revisionsbesiktning', k: 'Brann', t: 'Forsikringskrav', h: 'SBF 110 (försäkringskrav)', i: [1, 'år'], u: 'Certifierat besiktningsföretag', lvl: 'a' },
  se_sprinkler_vecka: { n: 'Sprinkler – veckokontroll (tryck, ventiler, pumpar)', k: 'Brann', t: 'Forsikringskrav', h: 'SBF 120 Regler för automatiska vattensprinklersystem (försäkringskrav)', i: [1, 'uke'], u: 'Anläggningsskötare', lvl: 'a' },
  se_sprinkler_revision: { n: 'Sprinkler – revisionsbesiktning', k: 'Brann', t: 'Forsikringskrav', h: 'SBF 120 (försäkringskrav)', i: [1, 'år'], u: 'Certifierat besiktningsföretag', lvl: 'a' },
  se_slackare: { n: 'Brandsläckare – underhållskontroll', k: 'Brann', t: 'Egenkontroll', h: 'LSO 2 kap. 2 § (utrustning för släckning); SS 3656 / SBF:s rekommendation', i: [1, 'år'], u: 'Certifierat serviceföretag', lvl: 'a' },
  se_brandpost: { n: 'Inomhusbrandposter – kontroll och provning', k: 'Brann', t: 'Egenkontroll', h: 'LSO 2 kap. 2 §; SS-EN 671-3', i: [1, 'år'], u: 'Certifierat serviceföretag', lvl: 'a' },
  se_nodbelysning: { n: 'Nödbelysning och vägledande markering – funktionsprov', k: 'Brann', t: 'Egenkontroll', h: 'BBR 5:3 (utrymning); AFS om arbetsplatsens utformning; SS-EN 50172', i: [1, 'mnd'], u: 'Brandskyddsansvarig / elinstallatör', lvl: 'a' },
  se_branddorr: { n: 'Branddörrar och stängningsanordningar – funktionskontroll', k: 'Brann', t: 'Egenkontroll', h: 'LSO 2 kap. 2 §; BBR 5:5 (brandcellsgränser)', i: [3, 'mnd'], u: 'Fastighetsskötare', lvl: 'a' },
  se_brandgas: { n: 'Brandgasluckor/brandgasfläktar – funktionsprov', k: 'Brann', t: 'Egenkontroll', h: 'BBR 5:5 (brandgasventilation); tillverkarens instruktion', i: [1, 'år'], u: 'Serviceföretag', lvl: 'a' },
  se_spjall: { n: 'Brandspjäll – funktionsprov', k: 'Brann', t: 'Egenkontroll', h: 'BBR 5:5; tillverkarens instruktion (ofta kontroll vid OVK och årligen)', i: [1, 'år'], u: 'Serviceföretag', lvl: 'a' },
  se_kyla: { n: 'Kylanläggning/värmepump – läckagekontroll (F-gas)', k: 'VVS', t: 'Lovpålagt', h: 'Förordning (EU) 2024/573 art. 5 – intervall efter CO₂-ekvivalenter (≥5 t: 12 mån, ≥50 t: 6 mån, ≥500 t: 3 mån); köldmedieförordningen (2016:1128) – årlig rapport till kommunen för ≥14 kg', i: [1, 'år'], u: 'Certifierat kylföretag', lvl: 'a' },
  se_tryck: { n: 'Trycksatta anordningar – återkommande kontroll', k: 'Annet', t: 'Lovpålagt', h: 'AFS 2023:2 / AFS om trycksatta anordningar – kontrollklass avgör intervall', i: [1, 'år'], u: 'Ackrediterat kontrollorgan', lvl: 'a' },
  se_reservkraft: { n: 'Reservkraft/UPS – provkörning med last', k: 'Elektro', t: 'Egenkontroll', h: 'Leverantörens instruktion', i: [1, 'mnd'], u: 'Drifttekniker', lvl: 'a' },
  se_fettavskiljare: { n: 'Fettavskiljare – tömning', k: 'VVS', t: 'Lovpålagt', h: 'Kommunens föreskrifter om avfallshantering (miljöbalken 15 kap.) och ABVA', i: [3, 'mnd'], u: 'Entreprenör godkänd av kommunen', lvl: 'a' },
  se_tak: { n: 'Tak – inspektion, takbrunnar och snöskottning', k: 'Bygg', t: 'Anbefalt', h: 'God praxis; ägarens skadeståndsansvar', i: [1, 'år'], u: 'Fastighetsskötare', lvl: 'a' },
};

export const PAKKE_SE: Pakke = {
  maler: M,
  prop: [{ k: 'se_sba' }, { k: 'se_sba_kontroll' }, { k: 'se_samordning' }, { k: 'se_hyresgast_sba' }, { k: 'se_energidekl' }, { k: 'se_elrevision' }, { k: 'se_forsakring' }, { k: 'se_uteomrade' }, { k: 'se_radon' }],
  komp: {
    ventilasjon: ['se_ovk_ftx', 'se_vent_drift'], kanaler: ['se_ovk_ftx'], heis: ['se_hiss', 'se_hiss_service'], rulletrapp: ['se_hiss', 'se_hiss_service'], loft: ['se_hiss'], porter: ['se_port'],
    brannalarm: ['se_brandlarm_kvartal', 'se_brandlarm_revision'], talevarsling: ['se_brandlarm_kvartal'], sprinkler: ['se_sprinkler_vecka', 'se_sprinkler_revision'], slokkere: ['se_slackare'], brannslanger: ['se_brandpost'],
    nodlys: ['se_nodbelysning'], branndorer: ['se_branddorr'], roykluker: ['se_brandgas'], brannspjeld: ['se_spjall'], kjole: ['se_kyla'], varmepumpe: ['se_kyla'], trykk: ['se_tryck'], kjel: ['se_tryck'],
    nodstrom: ['se_reservkraft'], fettutskiller: ['se_fettavskiljare'], energimerke: ['se_energidekl'], tak_asfalt: ['se_tak'], tak_folie: ['se_tak'], tak_stein: ['se_tak'], eltavle: ['se_elrevision'],
  },
  plikter: {
    se_sba_hg: { n: 'Systematiskt brandskyddsarbete i den egna verksamheten', h: 'LSO 2 kap. 2 § (nyttjanderättshavare); MSB:s allmänna råd om SBA', dok: ['Brandskyddsorganisation och brandskyddsansvarig', 'Rutiner och egenkontroller', 'Utbildning och övning av personal'] },
    se_sam: { n: 'Systematiskt arbetsmiljöarbete (SAM) med årlig uppföljning', h: 'Arbetsmiljölagen 3 kap. 2 a §; AFS 2023:1', dok: ['Riskbedömning', 'Handlingsplan', 'Årlig uppföljning'] },
    se_utrymning: { n: 'Utrymningsövning och utbildning av personal', h: 'LSO 2 kap. 2 §; AFS om arbetsplatsens utformning (utrymning)', dok: ['Datum för övning', 'Deltagare'] },
    se_heta: { n: 'Heta arbeten utförs av certifierad personal med tillstånd', h: 'Försäkringsvillkor (SBF Heta arbeten)', dok: ['Certifikat', 'Tillstånd för heta arbeten'] },
    se_el_hg: { n: 'Hyresgästens egna elinstallationer hålls säkra', h: 'Elsäkerhetslagen (2016:732) – innehavarens ansvar', dok: ['Egenkontroll / elrevision'] },
    se_kontakt: { n: 'Brandskyddsansvarig och kontaktperson meddelade till fastighetsägaren', h: 'Hyresavtal; LSO 2 kap. 2 §', dok: ['Namn och kontaktuppgifter'] },
    se_forsakring_hg: { n: 'Gällande försäkring för verksamhet och egendom', h: 'Hyresavtal', dok: ['Försäkringsbrev'] },
    se_fett_hg: { n: 'Fettavskiljare och köksventilation (restaurang) sköts och rengörs', h: 'Kommunens föreskrifter; SBF Regler för brandskydd i restaurang', dok: ['Tömningskvitton', 'Rengöring av imkanal'] },
  },
  stdPlikter: ['se_sba_hg', 'se_sam', 'se_utrymning', 'se_heta', 'se_el_hg', 'se_kontakt', 'se_forsakring_hg'],
  pliktVirksomhet: { Servering: ['se_fett_hg'] },
  dok: ['Brandskyddsdokumentation (bygglov/slutbesked)', 'SBA-pärm / brandskyddsdokumentation', 'OVK-protokoll', 'Energideklaration', 'Besiktningsintyg hiss/port', 'Relationsritningar', 'Drift- och underhållsinstruktioner', 'Gränsdragningslista brandskydd', 'Köldmedierapport / läckagekontroll', 'Radonmätning (protokoll)', 'Försäkringsbrev (fastighet)', 'Hyresavtal (SE)'],
  dokPaakrevd: ['Brandskyddsdokumentation (bygglov/slutbesked)', 'SBA-pärm / brandskyddsdokumentation', 'OVK-protokoll', 'Energideklaration', 'Besiktningsintyg hiss/port', 'Relationsritningar', 'Drift- och underhållsinstruktioner', 'Gränsdragningslista brandskydd'],
  tilsyn: ['Räddningstjänst (LSO-tillsyn)', 'Arbetsmiljöverket', 'Byggnadsnämnd (OVK/hiss)', 'Elsäkerhetsverket', 'Försäkringsbolag (SE)'],
  mynd: { 'Räddningstjänst (LSO-tillsyn)': 'Kommunens räddningstjänst', 'Arbetsmiljöverket': 'Arbetsmiljöverket', 'Byggnadsnämnd (OVK/hiss)': 'Kommunens byggnadsnämnd', 'Elsäkerhetsverket': 'Elsäkerhetsverket', 'Försäkringsbolag (SE)': 'Försäkringsbolaget' },
  kilder: [
    { navn: 'Lag (2003:778) om skydd mot olyckor', lenke: 'https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/lag-2003778-om-skydd-mot-olyckor_sfs-2003-778/', niva: 'lag', sjekk: 'side' },
    { navn: 'Plan- och byggförordning (2011:338)', lenke: 'https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/plan-och-byggforordning-2011338_sfs-2011-338/', niva: 'förordning', sjekk: 'side' },
    { navn: 'Lag (2006:985) om energideklaration för byggnader', lenke: 'https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/lag-2006985-om-energideklaration-for-byggnader_sfs-2006-985/', niva: 'lag', sjekk: 'side' },
    { navn: 'Arbetsmiljölag (1977:1160)', lenke: 'https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/arbetsmiljolag-19771160_sfs-1977-1160/', niva: 'lag', sjekk: 'side' },
    { navn: 'Elsäkerhetslag (2016:732)', lenke: 'https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/elsakerhetslag-2016732_sfs-2016-732/', niva: 'lag', sjekk: 'side' },
    { navn: 'BFS 2011:16 OVK (funktionskontroll av ventilationssystem)', lenke: 'https://www.boverket.se/sv/lag--ratt/forfattningssamling/gallande/ovk---bfs-201116/', niva: 'föreskrift', sjekk: 'side' },
    { navn: 'Boverkets föreskrifter om motordrivna anordningar (BFS 2011:12, BFS 2025:11–13)', lenke: 'https://www.boverket.se/sv/byggande/sakerhet/hissar-portar-rulltrappor-och-skidliftar/', niva: 'föreskrift', sjekk: 'side' },
    { navn: 'MSB – systematiskt brandskyddsarbete', lenke: 'https://www.msb.se/sv/amnesomraden/skydd-mot-olyckor-och-farliga-amnen/brandskydd/systematiskt-brandskyddsarbete/', niva: 'vägledning', sjekk: 'side' },
    { navn: 'Arbetsmiljöverkets föreskrifter (AFS 2023:1 m.fl.)', lenke: 'https://www.av.se/arbetsmiljoarbete-och-inspektioner/publikationer/foreskrifter/', niva: 'föreskrift', sjekk: 'manuell' },
    { navn: 'Förordning (EU) 2024/573 om fluorerade växthusgaser', lenke: 'https://eur-lex.europa.eu/legal-content/SV/TXT/?uri=CELEX:32024R0573', niva: 'EU', sjekk: 'side' },
    { navn: 'SBF 110 / SBF 120 (Brandskyddsföreningen)', lenke: 'https://www.brandskyddsforeningen.se/', niva: 'försäkring', sjekk: 'manuell' },
  ],
  sek: [
    ['Brandskydd', ['<b>Lagen om skydd mot olyckor (LSO) 2 kap. 2 §</b>: ägare och nyttjanderättshavare ska hålla skäligt brandskydd – i praktiken genom <b>systematiskt brandskyddsarbete (SBA)</b> med dokumentation, ansvar, egenkontroller och utbildning.', 'Den skriftliga redogörelsen för brandskyddet (tidigare 2 kap. 3 §) är borttagen sedan 2021. Räddningstjänsten gör tillsyn enligt MSBFS 2021:8.', 'Gör en skriftlig <b>gränsdragningslista</b> mellan fastighetsägare och hyresgäst.', 'Brandlarm och sprinkler följer ofta <b>SBF 110 / SBF 120</b> som försäkringskrav.']],
    ['Ventilation (OVK)', ['<b>PBF 5 kap. och BFS 2011:16</b>: obligatorisk ventilationskontroll av certifierad funktionskontrollant – kontor och lokaler med FT/FTX vart 3:e år, S/F/FX vart 6:e år. Protokollet anslås i byggnaden.', 'Intervallen ändrades senast genom BFS 2025:6 – kontrollera aktuell tabell hos Boverket.']],
    ['Hissar och portar', ['<b>PBF 5 kap. 8–11 §§ och BFS 2011:12</b>: återkommande besiktning av ackrediterat kontrollorgan, normalt vartannat eller varje år.', 'Nya föreskrifter <b>BFS 2025:11–13</b> gäller från 1 januari 2027.']],
    ['Energi och miljö', ['<b>Lag (2006:985)</b>: energideklaration krävs när byggnaden hyrs ut och gäller i 10 år.', '<b>F-gas (EU) 2024/573</b>: läckagekontroll av kyl- och värmepumpsaggregat efter CO₂-ekvivalenter; köldmedierapport till kommunen.', 'Radon: referensnivå 200 Bq/m³ på arbetsplatser.']],
    ['Arbetsmiljö och hyresgäster', ['<b>Arbetsmiljölagen 3 kap. 7 §</b>: samordning på gemensamma arbetsställen.', 'Hyresgästen bedriver eget <b>SAM (AFS 2023:1)</b> och eget SBA i sin verksamhet.', 'Heta arbeten utförs av certifierad personal (försäkringskrav).']],
  ],
  sekLeietaker: ['Brandskydd', 'Arbetsmiljö och hyresgäster'],
  merknad: 'Regelverket för Sverige är sammanställt från officiella källor (Riksdagen, Boverket, MSB, Arbetsmiljöverket), men är inte kvalitetssäkrat av en svensk fackperson ännu. Använd det som checklista och kontrollera krav och intervall för byggnadens användning.',
};
