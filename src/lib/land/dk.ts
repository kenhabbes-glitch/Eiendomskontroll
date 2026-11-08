// Landpakke Danmark. Kilder: Bygningsreglementet 2018 (BR18) §§ 137–158 om drift, kontrol og vedligehold af
// brandsikkerheden og vejledningens kapitel 7, bekendtgørelse om brandsyn (BEK nr. 2341 af 9.12.2021, ændret ved
// BEK nr. 1435 af 27.11.2025), Arbejdstilsynets bekendtgørelse om anvendelse m.v. af elevatorer (BEK nr. 461 af
// 23.5.2016), bekendtgørelse om energimærkning af bygninger (BEK nr. 549 af 15.5.2023), arbejdsmiljøloven og
// F-gasforordningen (EU) 2024/573. Intervaller er vejledende – en godkendt DKV-plan går forud.
import type { Mal } from '../catalog';
import type { Pakke } from './pakke';

const M: Record<string, Mal> = {
  // --- Ejendomsniveau
  dk_dkv: { n: 'DKV-plan for brandsikkerheden – ajourføring og årlig gennemgang', k: 'Brann', t: 'Lovpålagt', h: 'BR18 §§ 137–158 (drift, kontrol og vedligehold i hele bygningens levetid); vejledning til kap. 5, kapitel 7 – uden DKV-plan følges kapitel 7', i: [1, 'år'], u: 'Ejer / driftsansvarlig', lvl: 'e', b: 'Bygninger med byggetilladelse efter BR18 skal have en DKV-plan fra certificeret brandrådgiver før ibrugtagning.' },
  dk_egenkontrol: { n: 'Egenkontrol af flugtveje, branddøre, skiltning og slukningsmateriel', k: 'Brann', t: 'Egenkontroll', h: 'BR18 §§ 140–142; vejledning til kap. 5, kapitel 7 (DKV-skema, appendiks 7A)', i: [1, 'mnd'], u: 'Driftsansvarlig', lvl: 'e' },
  dk_brandsyn: { n: 'Brandsyn – deltagelse og opfølgning på påbud', k: 'Brann', t: 'Lovpålagt', h: 'Bekendtgørelse om brandsyn (BEK nr. 2341/2021, ændret BEK nr. 1435/2025) – ejer, bruger eller driftsansvarlig skal deltage; brandsyn efter DKV-plan, DV-plan eller kapitel 7', i: [1, 'år'], u: 'Ejer / driftsansvarlig', lvl: 'e', b: 'Intervallet fastsættes af det kommunale redningsberedskab efter bygningens anvendelse.' },
  dk_samordning: { n: 'Samordning af sikkerhed og sundhed med lejerne', k: 'Internkontroll', t: 'Lovpålagt', h: 'Arbejdsmiljøloven og bekendtgørelse om samarbejde om sikkerhed og sundhed; BR18 (driftsansvar)', i: [1, 'år'], u: 'Ejer', lvl: 'e' },
  dk_lejer_dok: { n: 'Indhent lejernes dokumentation (APV, egenkontrol, brandinstruks)', k: 'Internkontroll', t: 'Egenkontroll', h: 'Arbejdsmiljøloven (APV); BR18 (driftsforhold); lejekontrakt', i: [1, 'år'], u: 'Ejer / administrator', lvl: 'e', pl: 'alle' },
  dk_energimaerke: { n: 'Energimærkning – gyldigt energimærke (10 år)', k: 'Energi', t: 'Lovpålagt', h: 'Bekendtgørelse om energimærkning af bygninger (BEK nr. 549/2023) § 15 – gyldig i 10 år; krav ved salg og udlejning, og løbende for offentlige bygninger over 250 m²', i: [10, 'år'], u: 'Certificeret energimærkningsfirma', lvl: 'e' },
  dk_forsikring: { n: 'Forsikring – gennemgang af sikkerhedsforskrifter', k: 'Annet', t: 'Forsikringskrav', h: 'Forsikringsvilkår (ofte krav om DBI-retningslinjer og eftersyn)', i: [1, 'år'], u: 'Ejer', lvl: 'e' },
  dk_radon: { n: 'Radonmåling', k: 'Annet', t: 'Anbefalt', h: 'BR18 §§ 323–325 (nybyggeri); Sundhedsstyrelsens anbefaling 100 Bq/m³', i: [10, 'år'], u: 'Måleinstitut', lvl: 'e' },
  dk_snerydning: { n: 'Vintervedligehold – snerydning og glatførebekæmpelse', k: 'Utomhus', t: 'Lovpålagt', h: 'Lov om offentlige veje (vintervedligeholdelse af fortov) og kommunens regulativ', i: [1, 'år'], u: 'Ejer / vicevært', lvl: 'e' },
  // --- Systemniveau
  dk_aba: { n: 'ABA-anlæg – kontrol og serviceeftersyn', k: 'Brann', t: 'Lovpålagt', h: 'BR18 §§ 140–142 og vejledning kapitel 7.4; DBI-retningslinje 232 – ugentlig/kvartalsvis egenkontrol og årligt eftersyn af ABA-installationsfirma', i: [3, 'mnd'], u: 'Driftsansvarlig / ABA-installationsfirma', lvl: 'a' },
  dk_aba_aar: { n: 'ABA-anlæg – årligt serviceeftersyn', k: 'Brann', t: 'Lovpålagt', h: 'BR18 vejledning kapitel 7.4.5; DBI-retningslinje 232', i: [1, 'år'], u: 'Certificeret ABA-installationsfirma', lvl: 'a' },
  dk_ava: { n: 'Varslingsanlæg (AVA) – eftersyn og vedligehold', k: 'Brann', t: 'Lovpålagt', h: 'BR18-vejledningen: varslingsanlæg efterses og vedligeholdes hvert andet år af autoriseret elinstallatørvirksomhed', i: [2, 'år'], u: 'Autoriseret elinstallatør', lvl: 'a' },
  dk_sprinkler_uge: { n: 'Sprinkleranlæg – ugentlig kontrol', k: 'Brann', t: 'Lovpålagt', h: 'BR18 vejledning kapitel 7.4; DBI-retningslinje 251', i: [1, 'uke'], u: 'Driftsansvarlig', lvl: 'a' },
  dk_sprinkler_aar: { n: 'Sprinkleranlæg – årligt eftersyn', k: 'Brann', t: 'Lovpålagt', h: 'BR18 vejledning kapitel 7.4; DBI-retningslinje 251', i: [1, 'år'], u: 'Sprinklerinstallationsfirma', lvl: 'a' },
  dk_slukker: { n: 'Håndslukkere – eftersyn', k: 'Brann', t: 'Egenkontroll', h: 'BR18 vejledning kapitel 7 (lempet fra 2024 – følg DKV-planen hvis den er strengere); DS/EN 3', i: [1, 'år'], u: 'Driftsansvarlig / servicefirma', lvl: 'a' },
  dk_slange: { n: 'Brandslanger (slangevindere) – kontrol', k: 'Brann', t: 'Egenkontroll', h: 'BR18 vejledning kapitel 7 (lempet fra 2024 – følg DKV-planen hvis den er strengere)', i: [1, 'år'], u: 'Driftsansvarlig', lvl: 'a' },
  dk_flugtvejslys: { n: 'Flugtvejs- og panikbelysning – funktionsafprøvning', k: 'Brann', t: 'Lovpålagt', h: 'BR18 vejledning kapitel 7; DS/EN 50172', i: [1, 'mnd'], u: 'Driftsansvarlig', lvl: 'a' },
  dk_branddor: { n: 'Branddøre og dørpumper – kontrol', k: 'Brann', t: 'Egenkontroll', h: 'BR18 vejledning kapitel 7.3 (passive brandsikringstiltag)', i: [3, 'mnd'], u: 'Driftsansvarlig', lvl: 'a' },
  dk_roeg: { n: 'Røgudluftning – funktionsafprøvning', k: 'Brann', t: 'Lovpålagt', h: 'BR18 vejledning kapitel 7.4; DBI-retningslinje 027', i: [1, 'år'], u: 'Servicefirma', lvl: 'a' },
  dk_spjaeld: { n: 'Brandspjæld – funktionsafprøvning', k: 'Brann', t: 'Lovpålagt', h: 'BR18 vejledning kapitel 7.4', i: [1, 'år'], u: 'Ventilationsfirma', lvl: 'a' },
  dk_elevator_kontrol: { n: 'Elevator – kontrol af certificeret sagkyndig virksomhed', k: 'Heis', t: 'Lovpålagt', h: 'BEK nr. 461/2016 § 24 og bilag 2 (interval efter elevatortype; fabrikantens anvisning hvis hyppigere)', i: [1, 'mnd'], u: 'Certificeret sagkyndig elevatorvirksomhed', lvl: 'a' },
  dk_elevator_insp: { n: 'Elevator/rulletrappe – periodisk inspektion af inspektionsorgan', k: 'Heis', t: 'Lovpålagt', h: 'BEK nr. 461/2016 § 33 – hvert tredje år med højst 36 måneders mellemrum (visse tovbårne elevatorer hvert andet år)', i: [3, 'år'], u: 'Akkrediteret inspektionsorgan', lvl: 'a' },
  dk_koel: { n: 'Køleanlæg/varmepumpe – lækagekontrol (F-gas) og periodisk eftersyn', k: 'VVS', t: 'Lovpålagt', h: 'Forordning (EU) 2024/573 art. 5; Arbejdstilsynets bekendtgørelse om anvendelse af trykbærende udstyr (kølebekendtgørelsen)', i: [1, 'år'], u: 'Certificeret kølefirma', lvl: 'a' },
  dk_tryk: { n: 'Trykbærende udstyr/kedel – periodisk kontrol', k: 'Annet', t: 'Lovpålagt', h: 'Bekendtgørelse om anvendelse af trykbærende udstyr – kontrolinterval efter kategori', i: [1, 'år'], u: 'Akkrediteret inspektionsorgan', lvl: 'a' },
  dk_vent: { n: 'Ventilationsanlæg – filterskift og eftersyn', k: 'VVS', t: 'Service', h: 'DS 447 (drift af ventilationsanlæg); EU-direktiv 2024/1275 art. 23 (eftersyn af anlæg over 70 kW – national gennemførelse afventer)', i: [6, 'mnd'], u: 'Ventilationsfirma', lvl: 'a' },
  dk_nodstrom: { n: 'Nødstrøm/UPS – prøvekørsel', k: 'Elektro', t: 'Egenkontroll', h: 'Leverandørens anvisning; BR18 vejledning (nødstrøm til brandtekniske installationer)', i: [1, 'mnd'], u: 'Driftstekniker', lvl: 'a' },
  dk_fedt: { n: 'Fedtudskiller – tømning', k: 'VVS', t: 'Lovpålagt', h: 'Kommunens regulativ for spildevand/affald', i: [3, 'mnd'], u: 'Kommunalt godkendt firma', lvl: 'a' },
  dk_el_forsamling: { n: 'Elinstallation i forsamlingslokale – elsikkerhedsattest', k: 'Elektro', t: 'Lovpålagt', h: 'Bekendtgørelse om kontrol af elektriske installationer i forsamlingslokaler – attest højst 2 år gammel (kontrolleres ved brandsyn)', i: [2, 'år'], u: 'Autoriseret elinstallatør', lvl: 'a', b: 'Gælder kun forsamlingslokaler.' },
  dk_tag: { n: 'Tag – eftersyn og rensning af tagrender', k: 'Bygg', t: 'Anbefalt', h: 'God praksis', i: [1, 'år'], u: 'Vicevært', lvl: 'a' },
};

export const PAKKE_DK: Pakke = {
  maler: M,
  prop: [{ k: 'dk_dkv' }, { k: 'dk_egenkontrol' }, { k: 'dk_brandsyn' }, { k: 'dk_samordning' }, { k: 'dk_lejer_dok' }, { k: 'dk_energimaerke' }, { k: 'dk_forsikring' }, { k: 'dk_snerydning' }, { k: 'dk_radon' }],
  komp: {
    brannalarm: ['dk_aba', 'dk_aba_aar'], talevarsling: ['dk_ava'], sprinkler: ['dk_sprinkler_uge', 'dk_sprinkler_aar'], slokkere: ['dk_slukker'], brannslanger: ['dk_slange'], nodlys: ['dk_flugtvejslys'],
    branndorer: ['dk_branddor'], roykluker: ['dk_roeg'], brannspjeld: ['dk_spjaeld'], heis: ['dk_elevator_kontrol', 'dk_elevator_insp'], rulletrapp: ['dk_elevator_kontrol', 'dk_elevator_insp'], loft: ['dk_elevator_kontrol'],
    kjole: ['dk_koel'], varmepumpe: ['dk_koel'], trykk: ['dk_tryk'], kjel: ['dk_tryk'], ventilasjon: ['dk_vent'], nodstrom: ['dk_nodstrom'], fettutskiller: ['dk_fedt'], elanlegg: ['dk_el_forsamling'],
    tak_asfalt: ['dk_tag'], tak_folie: ['dk_tag'], tak_stein: ['dk_tag'],
  },
  plikter: {
    dk_apv: { n: 'Arbejdspladsvurdering (APV) – mindst hvert 3. år', h: 'Arbejdsmiljøloven § 15 a; bekendtgørelse om arbejdets udførelse', dok: ['Gældende APV', 'Handlingsplan'] },
    dk_amo: { n: 'Arbejdsmiljøorganisation og årlig arbejdsmiljødrøftelse', h: 'Bekendtgørelse om samarbejde om sikkerhed og sundhed', dok: ['Referat af årlig drøftelse'] },
    dk_brandinstruks: { n: 'Brandinstruks, ordensregler og evakueringsøvelse', h: 'BR18 (driftsforhold); vejledning kapitel 7; driftsmæssige forudsætninger i DKV-planen', dok: ['Opslåede instrukser', 'Dato for øvelse'] },
    dk_drift_lejer: { n: 'Lejers egne brandtekniske installationer efterses efter DKV-planen', h: 'BR18 §§ 140–142', dok: ['Eftersynsrapporter'] },
    dk_varmt: { n: 'Varmt arbejde udføres med certifikat og tilladelse', h: 'Forsikringsvilkår (DBI-certifikat varmt arbejde)', dok: ['Certifikater', 'Tilladelser'] },
    dk_kontakt: { n: 'Driftsansvarlig/kontaktperson meddelt til udlejer', h: 'Lejekontrakt; bekendtgørelse om brandsyn (driftsansvarlig)', dok: ['Navn og kontaktoplysninger'] },
    dk_forsikring_l: { n: 'Gældende forsikring for virksomhed og løsøre', h: 'Lejekontrakt', dok: ['Police'] },
    dk_kokken: { n: 'Køkkenventilation og fedtudskiller (restauration) rengøres', h: 'Kommunens regulativ; forsikringsvilkår', dok: ['Rengøringsbevis', 'Tømningsbevis'] },
  },
  stdPlikter: ['dk_apv', 'dk_amo', 'dk_brandinstruks', 'dk_drift_lejer', 'dk_varmt', 'dk_kontakt', 'dk_forsikring_l'],
  pliktVirksomhet: { Servering: ['dk_kokken'] },
  dok: ['DKV-plan (brand)', 'Brandteknisk dokumentation (BR18)', 'Brandsynsrapport', 'Energimærkning', 'Elevator – inspektionsattest', 'Drift- og vedligeholdelsesvejledninger (DV)', 'Som udført-tegninger', 'Eftersynsrapporter ABA/sprinkler', 'Elsikkerhedsattest (forsamlingslokale)', 'Forsikringspolice (DK)', 'Lejekontrakt (DK)'],
  dokPaakrevd: ['DKV-plan (brand)', 'Brandteknisk dokumentation (BR18)', 'Brandsynsrapport', 'Energimærkning', 'Elevator – inspektionsattest', 'Drift- og vedligeholdelsesvejledninger (DV)', 'Som udført-tegninger'],
  tilsyn: ['Brandsyn (redningsberedskab)', 'Arbejdstilsynet (DK)', 'Kommunen (byggesag)', 'Sikkerhedsstyrelsen', 'Forsikringsselskab (DK)'],
  mynd: { 'Brandsyn (redningsberedskab)': 'Det kommunale redningsberedskab', 'Arbejdstilsynet (DK)': 'Arbejdstilsynet', 'Kommunen (byggesag)': 'Kommunen (byggemyndighed)', 'Sikkerhedsstyrelsen': 'Sikkerhedsstyrelsen', 'Forsikringsselskab (DK)': 'Forsikringsselskabet' },
  kilder: [
    { navn: 'Bygningsreglementet (BR18) §§ 137–158 og vejledning kapitel 7', lenke: 'https://www.bygningsreglementet.dk/', niva: 'bekendtgørelse', sjekk: 'side' },
    { navn: 'Bekendtgørelse om brandsyn (BEK nr. 2341 af 9.12.2021)', lenke: 'https://www.retsinformation.dk/eli/lta/2021/2341', niva: 'bekendtgørelse', sjekk: 'side' },
    { navn: 'Bekendtgørelse om anvendelse m.v. af elevatorer (BEK nr. 461 af 23.5.2016)', lenke: 'https://www.retsinformation.dk/eli/lta/2016/461', niva: 'bekendtgørelse', sjekk: 'side' },
    { navn: 'Bekendtgørelse om energimærkning af bygninger (BEK nr. 549 af 15.5.2023)', lenke: 'https://www.retsinformation.dk/eli/lta/2023/549', niva: 'bekendtgørelse', sjekk: 'side' },
    { navn: 'Beredskabsloven', lenke: 'https://www.retsinformation.dk/eli/lta/2017/314', niva: 'lov', sjekk: 'side' },
    { navn: 'Arbejdsmiljøloven', lenke: 'https://www.retsinformation.dk/eli/lta/2021/2062', niva: 'lov', sjekk: 'side' },
    { navn: 'Forordning (EU) 2024/573 om fluorholdige drivhusgasser', lenke: 'https://eur-lex.europa.eu/legal-content/DA/TXT/?uri=CELEX:32024R0573', niva: 'EU', sjekk: 'side' },
    { navn: 'DBI-retningslinjer (232 ABA, 251 sprinkler)', lenke: 'https://brandogsikring.dk/', niva: 'standard', sjekk: 'manuell' },
  ],
  sek: [
    ['Brandsikkerhed', ['<b>BR18 §§ 137–158</b>: drift, kontrol og vedligehold af brandsikkerheden i hele bygningens levetid. Bygninger med byggetilladelse efter BR18 skal have en <b>DKV-plan</b> før ibrugtagning.', 'Uden DKV-plan følges <b>kapitel 7</b> i vejledningen til BR18 kap. 5 (DKV-skema i appendiks 7A). Kravene til egenkontrol af slangevindere og håndslukkere er lempet fra 2024, medmindre DKV-planen siger andet.', '<b>Brandsyn</b> (BEK nr. 2341/2021): ejer, bruger eller driftsansvarlig deltager; brandsyn sker efter DKV-plan, DV-plan eller kapitel 7.', 'ABA og sprinkler efter DBI-retningslinje 232 og 251; varslingsanlæg efterses hvert andet år af autoriseret elinstallatør.']],
    ['Elevatorer', ['<b>BEK nr. 461/2016</b>: kontrol af certificeret sagkyndig virksomhed efter bilag 2, og periodisk inspektion af inspektionsorgan hvert tredje år (højst 36 måneder; visse elevatorer hvert andet år).']],
    ['Energi og miljø', ['<b>Energimærkning</b> (BEK nr. 549/2023): gyldig i 10 år; krav ved salg og udlejning og løbende for offentlige bygninger over 250 m².', '<b>F-gas (EU) 2024/573</b>: lækagekontrol efter CO₂-ækvivalenter; kølebekendtgørelsen stiller krav til eftersyn.', 'Eftersynsordningen for ventilations- og klimaanlæg blev ophævet i 2015; EU-direktiv 2024/1275 kræver eftersyn af anlæg over 70 kW – følg den danske gennemførelse.']],
    ['Arbejdsmiljø og lejere', ['Lejer har egen <b>APV</b> (mindst hvert 3. år) og arbejdsmiljøorganisation.', 'Ejer og lejere samordner sikkerhed på fælles arbejdssteder; driftsmæssige forudsætninger i DKV-planen skal kendes af lejerne.']],
  ],
  sekLeietaker: ['Brandsikkerhed', 'Arbejdsmiljø og lejere'],
  merknad: 'Reglerne for Danmark er samlet fra officielle kilder (retsinformation.dk, bygningsreglementet.dk, Energistyrelsen, Arbejdstilsynet), men er endnu ikke kvalitetssikret af en dansk fagperson. Brug dem som tjekliste – en godkendt DKV-plan går altid forud.',
};
