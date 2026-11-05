// Komponentvis sjekkliste: én enkel sjekkliste per komponent (f.eks. hver branndør / hvert nødlys) som kvitteres ut
// etter hvert som man går gjennom bygget. Rene funksjoner – brukes både i appen og i serverfunksjonen (lenke til servicefirma).

export type SjekkPunkt = { id: string; t: string; aar?: boolean };
export type SjekkMal = { id: string; navn: string; koder: string[]; systemer?: string[]; punkter: SjekkPunkt[]; beskr?: string; std?: boolean; endret?: boolean };
export type Svar = 'ok' | 'avvik' | 'ia';
export type KompSvar = { t: string; av?: string; firma?: string; svar: Record<string, Svar>; komm?: string; avvik?: string[]; filer?: any[]; avvikIds?: string[]; kilde?: string };
export type Runde = { start: string; malId?: Record<string, string>; maler: Record<string, SjekkMal>; kp: Record<string, KompSvar> };

const p = (id: string, t: string, aar?: boolean): SjekkPunkt => (aar ? { id, t, aar } : { id, t });

/** Standardmaler. Punkter merket «aar» tas bare med på årlige (eller sjeldnere) kontroller. */
export const STD_SJEKKMALER: SjekkMal[] = [
  { id: 'nodlys', navn: 'Nødlys / ledelys', koder: ['UN'], std: true,
    beskr: 'Etter NS-EN 50172. Månedlig: kort funksjonstest. Årlig: i tillegg full varighetstest og batterisjekk.',
    punkter: [
      p('hel', 'Armatur hel, ren og godt festet'),
      p('lader', 'Ladeindikator lyser (armaturen har strøm)'),
      p('test', 'Funksjonstest: tenner ved simulert strømbrudd / testknapp'),
      p('skilt', 'Ledeskilt / piktogram viser riktig retning og er godt synlig'),
      p('fritt', 'Ikke skjult eller blokkert av inventar, skilt eller dekor'),
      p('varighet', 'Varighetstest: lyser i hele dimensjonert tid (normalt 1 t eller 3 t)', true),
      p('batteri', 'Batteri i orden (alder / utskiftingsdato kontrollert)', true),
      p('merket', 'Merket med dato for kontroll', true),
    ] },
  { id: 'branndor', navn: 'Branndør', koder: ['DB'], std: true,
    beskr: 'Egenkontroll av branndører etter forskrift om brannforebygging § 5 (brannskiller skal opprettholde sin funksjon).',
    punkter: [
      p('lukker', 'Lukker av seg selv fra helt åpen stilling (dørlukker virker)'),
      p('las', 'Går i lås – fallen fanger uten å måtte dyttes'),
      p('pakning', 'Pakninger og brannlister hele og på plass'),
      p('skade', 'Dørblad, karm og eventuelt glass uten skader'),
      p('kile', 'Ikke kilt eller holdt åpen med gjenstander'),
      p('magnet', 'Dørholdemagnet slipper ved brannalarm / test (hvis montert)'),
      p('merking', 'Merket med brannklasse og skilt «Branndør – holdes lukket»'),
      p('gjennomf', 'Gjennomføringer og fuger rundt karmen tettet'),
      p('hengsler', 'Hengsler, dørlukker og beslag uten slitasje eller oljelekkasje', true),
    ] },
  { id: 'generell', navn: 'Generell komponentkontroll', koder: ['*'], std: true,
    beskr: 'Brukes for komponenttyper uten egen mal når komponentvis sjekkliste er slått på for kontrollen.',
    punkter: [
      p('funnet', 'Komponenten er funnet og tilgjengelig'),
      p('visuell', 'Visuell kontroll – ingen skader'),
      p('funksjon', 'Funksjon testet og i orden'),
      p('merking', 'Merking / skilting i orden'),
    ] },
];

const sm = (id: string, navn: string, systemer: string[], beskr: string, mnd: string[], aar: string[]): SjekkMal =>
  ({ id, navn, koder: [], systemer, std: true, beskr, punkter: [...mnd.map((t, i) => p('m' + (i + 1), t)), ...aar.map((t, i) => p('a' + (i + 1), t, true))] });

/** Sjekklister for kontroller på hele systemet (ikke per komponent). Punkter merket «bare årlig» tas med på årlige kontroller. */
export const STD_SYSTEMMALER: SjekkMal[] = [
  sm('s_vent', 'Ventilasjonsanlegg', ['ventilasjon'], 'Driftskontroll av ventilasjonsaggregat. Årlig: service etter leverandørens FDV.', [
    'Aggregatet i drift – ingen unormal lyd eller vibrasjon', 'Ingen aktive alarmer i styring/SD', 'Filtre: trykkfall innenfor grense (bytt ved behov)', 'Driftstider og settpunkter stemmer',
    'Tilluftstemperatur som forventet', 'Kondensavløp/drenering fritt (ved kjølebatteri)', 'Luftinntak og avkast frie for løv, snø og smuss'], [
    'Filterbytte utført – dato og filterklasse notert', 'Vifter og motorer: lager, reimer og balansering kontrollert', 'Varmegjenvinner rengjort; tetting og rotasjonsvakt kontrollert',
    'Varme- og kjølebatteri rengjort; frostsikring testet', 'Spjeld og spjeldmotorer funksjonstestet', 'Brann-/røykspjeld i aggregat testet (hvis montert)',
    'Luftmengder kontrollert mot prosjektert (stikkprøve)', 'Aggregatet rengjort innvendig', 'Servicerapport/FDV oppdatert']),
  sm('s_kjole', 'Kjøleanlegg / varmepumpe', ['kjole', 'varmepumpe'], 'Driftskontroll. Årlig: service og lekkasjekontroll etter F-gassregelverket (sertifisert personell).', [
    'Anlegget i drift uten alarmer', 'Temperaturer og trykk normale i styringen', 'Ingen unormal lyd, vibrasjon eller isdannelse', 'Utedel/kondensator fri for løv, snø og smuss',
    'Kondensavløp fritt – ingen lekkasje', 'Rør og isolasjon uten synlige skader'], [
    'Lekkasjekontroll utført av sertifisert personell – journal oppdatert', 'Kuldemediefylling notert (type, kg, CO₂-ekvivalenter)', 'Kondensator og fordamper rengjort',
    'Filtre byttet/rengjort', 'Elektriske tilkoblinger og kontaktorer kontrollert', 'Sikkerhetsbrytere (høy-/lavtrykk) testet', 'Merking av anlegget (kuldemedium og fylling) på plass']),
  sm('s_brannalarm', 'Brannvarslingsanlegg', ['brannalarm'], 'Etter NS 3960. Månedlig egenkontroll av eier; årlig kontroll av sertifisert kontrollør.', [
    'Sentral i normal drift – ingen feil, utkoblinger eller forvarsler', 'Strømforsyning og batteri uten feilmelding', 'Funksjonstest av minst én detektor/sløyfe (roter mellom sløyfer)',
    'Alarmorganer (sirener/blitz) testet ved prøvealarm', 'Overføring til alarmmottak testet', 'Utkoblinger registrert og tilbakestilt',
    'Detektorer ikke tildekket eller skadet – frie avstander', 'Kontrollbok/logg ført'], [
    'Årskontroll utført av sertifisert kontrollør', 'Alle detektorer funksjonstestet i løpet av året', 'Batterier: kapasitet og alder kontrollert',
    'Branntegninger og dokumentasjon stemmer med anlegget', 'Styringer testet (dørholdemagneter, ventilasjonsstopp, heis, røykluker)', 'Avvik fra forrige årskontroll lukket']),
  sm('s_sprinkler', 'Sprinkleranlegg', ['sprinkler'], 'Etter NS-EN 12845. Ukentlig/månedlig egenkontroll; årlig kontroll av godkjent sprinklerfirma.', [
    'Vanntrykk og lufttrykk avlest og notert', 'Alle stengeventiler i riktig stilling og sikret/plombert', 'Alarmventil: alarmklokke/trykkbryter testet',
    'Sprinklerpumpe prøvekjørt (hvis pumpe)', 'Ventilrom frostfritt og ryddig', 'Sprinklerhoder ikke tildekket, skadet eller malt',
    'Fri avstand under sprinklerhoder (normalt min. 0,5 m til lager)', 'Alarmoverføring testet'], [
    'Årskontroll av godkjent sprinklerfirma', 'Strømnings- og trykktest utført', 'Reservesprinklerhoder og verktøy på plass',
    'Tørranlegg: kompressor, akselerator og drenering kontrollert (hvis tørranlegg)', 'Dokumentasjon og attest oppdatert']),
  sm('s_fasade', 'Fasade', ['fasade_tre', 'fasade_mur', 'fasade_plate'], 'Visuell kontroll fra bakkenivå og eventuelt lift.', [
    'Kledning/plater: ingen løse, sprukne eller manglende deler', 'Fuger og tetting rundt vinduer og dører i orden', 'Overflatebehandling: ingen avflassing eller råte',
    'Beslag, sålbenker og nedløp festet', 'Ingen tegn til fukt, sopp, saltutslag eller frostskader', 'Riss og sprekker i mur/puss registrert',
    'Skilt, lamper og fester sikre – ingen nedfallsfare', 'Graffiti og hærverk registrert'], []),
  sm('s_tak', 'Tak', ['tak_asfalt', 'tak_folie', 'tak_stein'], 'Inspeksjon av tak – også etter storm og før vinter.', [
    'Taksluk og takrenner frie for løv og rusk', 'Ingen stående vann på taket', 'Taktekning uten rifter, blærer eller løse skjøter',
    'Beslag, mønekam og inndekninger festet', 'Gjennomføringer (rør, hetter, ventilasjon) tette', 'Snø og is: ingen fare for nedfall eller overbelastning',
    'Takadkomst, fallsikring og stiger i orden', 'Lynvern intakt (hvis montert)'], [
    'Taksluk rengjort og varmekabler testet', 'Loft/undertak kontrollert innvendig for fukt og lekkasjer']),
  sm('s_pumpe', 'Grunnvanns-/lensepumpe', ['grunnvann'], 'Funksjonskontroll av pumpe og alarm.', [
    'Pumpen starter og stopper riktig (test med nivåvippe/sensor)', 'Nivåvippe/sensor beveger seg fritt', 'Høynivåalarm testet – varsel mottatt',
    'Ingen unormal lyd eller vibrasjon', 'Pumpekum fri for slam og rusk', 'Tilbakeslagsventil tett', 'Strømforsyning og jordfeilbryter i orden'], [
    'Pumpekum tømt og rengjort', 'Reservepumpe/alternering testet', 'Pumpe og løpehjul inspisert', 'Alarmoverføring til mottak testet']),
  sm('s_heis', 'Heis', ['heis', 'loft'], 'Eiers egenkontroll. Periodisk kontroll av akkreditert kontrollorgan etter heisforskriften.', [
    'Heisen går normalt og stopper i nivå med etasjene', 'Dører åpner og lukker uten slag – dørkant/lysgardin reverserer', 'Nødtelefon/alarmknapp testet – svar fra mottak',
    'Nødlys i heisstol fungerer', 'Belysning, knapper og display virker', 'Ingen skader i stol eller på dører', 'Maskinrom/sjakttopp låst, ryddig og uten lekkasje',
    'Kontrollskilt og driftsinstruks synlig'], [
    'Periodisk kontroll av akkreditert kontrollorgan gjennomført', 'Avvik fra periodisk kontroll lukket', 'Servicebesøk utført etter avtale', 'Rutine for nødbefrielse gjennomgått/øvet']),
  sm('s_rulletrapp', 'Rulletrapp / rullebånd', ['rulletrapp'], 'Eiers egenkontroll. Periodisk kontroll av akkreditert kontrollorgan.', [
    'Nødstopp testet øverst og nederst', 'Håndløper går synkront og er uten skader', 'Trinn/paletter uten skader – kammer hele', 'Skjørtebørster/skjørtebeskyttelse på plass',
    'Belysning, piktogrammer og skilting i orden', 'Ingen unormal lyd eller rykk', 'Automatisk start/stopp (sensor) virker'], [
    'Periodisk kontroll av akkreditert kontrollorgan gjennomført', 'Avvik fra periodisk kontroll lukket', 'Servicebesøk utført etter avtale']),
  sm('s_nokkelsafe', 'Nøkkelsafe (brannvesenets)', ['nokkelsafe'], 'Kontroll av at brannvesenet kommer inn og fram.', [
    'Nøkler/brikker i safen stemmer med nøkkellisten', 'Nøklene passer (stikkprøve: hoveddør, brannsentral, tekniske rom)', 'Safen er låst, hel og uten tegn til innbruddsforsøk',
    'Merking/skilt synlig for brannvesenet', 'Varme i safen virker (hvis montert)', 'Alarm ved åpning går til mottak (hvis tilkoblet)'], [
    'Nøkkelliste oppdatert – brannvesenet varslet ved endringer', 'Låssylinder smurt og kontrollert']),
  sm('s_roykluker', 'Røykluker / brannventilasjon', ['roykluker'], 'Funksjonskontroll av røykventilasjon.', [
    'Sentral/styring uten feil', 'Luker åpner ved test (manuell utløser)', 'Luker lukker og tetter etterpå', 'Utløserknapper merket og tilgjengelige'], [
    'Utløsning fra brannalarm testet', 'Gassfjærer/motorer og batterier kontrollert', 'Service av godkjent firma utført']),
  sm('s_nodstrom', 'Nødstrømsaggregat / UPS', ['nodstrom'], 'Prøvekjøring og kontroll.', [
    'Prøvekjørt med last – start og omkobling OK', 'Drivstoffnivå kontrollert og notert', 'Ingen alarmer, lekkasjer eller unormal lyd', 'Batteri/lader uten feil'], [
    'Service av leverandør utført', 'Belastningstest / batterikapasitetstest utført', 'Drivstoff og filtre skiftet etter plan']),
  sm('s_port', 'Porter (motoriserte)', ['porter'], 'Sikkerhets- og funksjonskontroll.', [
    'Klemsikring/fotocelle stopper og reverserer porten', 'Nødstopp og manuell åpning virker', 'Ingen skader på port, skinner eller fjærer', 'Varsellys og skilting i orden'], [
    'Service av leverandør utført', 'Fjærer, wire og festepunkter kontrollert']),
  sm('s_slokkere', 'Håndslokkere', ['slokkere'], 'Egenkontroll etter forskrift om brannforebygging; årlig kontroll av kompetent firma.', [
    'Slokkerne er på plass og godt synlige/merket', 'Trykkmåler i grønt felt', 'Plombe og splint på plass – ikke brukt', 'Ingen synlige skader eller korrosjon'], [
    'Årlig kontroll av kompetent firma – merkelapp oppdatert', 'Utløpsdato/trykkprøving kontrollert']),
  sm('s_fett', 'Fettutskiller', ['fettutskiller'], 'Kontroll av fettutskiller.', [
    'Fettlag og slam innenfor grense', 'Lokk og tetting i orden – ingen lukt', 'Alarm for nivå/fett virker (hvis montert)'], [
    'Tømming og rengjøring utført – kvittering arkivert', 'Inspeksjon av innløp/utløp og ventilasjon']),
];
export const systemMalFor = (maler: SjekkMal[], sysType?: string) => sysType ? maler.find(m => (m.systemer || []).includes(sysType)) || null : null;
export type SysSjekk = { malId: string; navn: string; punkter: SjekkPunkt[]; svar: Record<string, Svar>; tekst?: Record<string, string> };
/** Lag tom sjekkliste for en kontroll ut fra systemtype og intervall (kopi av punktene). */
export function sysSjekkFor(maler: SjekkMal[], o: any, sysType?: string): SysSjekk | null {
  if (!o || o.kompSjekk === 'pa' || o.kompSjekk === 'av' || ['energivurdering', 'tilstand'].includes(o.malKey)) return null;
  const m = systemMalFor(maler, sysType); if (!m) return null;
  return { malId: m.id, navn: m.navn, punkter: punkterFor(m, o.intervall).map(x => ({ id: x.id, t: x.t })), svar: {} };
}
/** Avvik fra sjekklisten som tekster. */
export const sysSjekkAvvik = (s?: SysSjekk | null) => s ? s.punkter.filter(x => s.svar[x.id] === 'avvik').map(x => (s.tekst?.[x.id] ?? x.t).trim()).filter(Boolean) : [];
export function renSysSjekk(x: any, mal: SysSjekk): SysSjekk | null {
  if (!x || typeof x !== 'object') return null; const svar: Record<string, Svar> = {}; const tekst: Record<string, string> = {};
  for (const pt of mal.punkter) { const v = x.svar?.[pt.id]; if (v === 'ok' || v === 'avvik' || v === 'ia') svar[pt.id] = v; if (typeof x.tekst?.[pt.id] === 'string') tekst[pt.id] = x.tekst[pt.id].slice(0, 300); }
  return Object.keys(svar).length ? { ...mal, svar, tekst } : null;
}

/** Standardmaler med organisasjonens endringer og egne maler (samme id = endret standard). */
export function sjekkMaler(egne?: SjekkMal[] | null): SjekkMal[] {
  const E = (egne || []).filter(m => m && m.id && Array.isArray(m.punkter));
  const std = [...STD_SJEKKMALER, ...STD_SYSTEMMALER].map(s => { const e = E.find(m => m.id === s.id); return e ? { ...e, std: true, endret: true } : s; });
  return [...std, ...E.filter(m => !STD_SJEKKMALER.some(s => s.id === m.id) && !STD_SYSTEMMALER.some(s => s.id === m.id)).map(m => ({ ...m, std: false }))];
}

export function malForKode(maler: SjekkMal[], kode?: string): SjekkMal | null {
  const k = String(kode || '').toUpperCase();
  return maler.find(m => m.koder.some(c => c.toUpperCase() === k)) || null;
}
export const generellMal = (maler: SjekkMal[]) => maler.find(m => m.koder.includes('*')) || STD_SJEKKMALER[2];

/** Hovedkontroll (hvert halvår eller sjeldnere)? Da tas også punktene merket «bare årlig» med. */
export function erAarlig(iv?: { n?: number; enhet?: string } | null): boolean {
  const n = +(iv?.n || 1); const e = String(iv?.enhet || 'år');
  return e.startsWith('år') ? true : e.startsWith('mnd') ? n >= 6 : false;
}
export const punkterFor = (mal: SjekkMal, iv?: any) => mal.punkter.filter(x => !x.aar || erAarlig(iv));

/** Komponenter som skal ha egen sjekkliste for en kontroll. Tom liste = vanlig utkvittering. */
export function kompForKontroll(o: any, komponenter: any[], maler: SjekkMal[]): any[] {
  if (!o || o.komponentId || !o.anleggId || o.kompSjekk === 'av') return [];
  const K = komponenter.filter(k => k.anleggId === o.anleggId);
  if (!K.length) return [];
  if (o.kompSjekk === 'pa') return K;
  return K.some(k => malForKode(maler, k.kode)) ? K : [];
}

/** Lag en ny runde: kopier malene som trengs, så pågående runder ikke endres om malen redigeres. */
export function nyRunde(K: any[], maler: SjekkMal[], start: string): Runde {
  const malId: Record<string, string> = {}; const brukt: Record<string, SjekkMal> = {};
  for (const k of K) { const m = malForKode(maler, k.kode) || generellMal(maler); malId[k.id] = m.id; brukt[m.id] = { id: m.id, navn: m.navn, koder: m.koder, punkter: m.punkter }; }
  return { start, malId, maler: brukt, kp: {} };
}
export const malIRunde = (r: Runde, kid: string): SjekkMal => r.maler[r.malId?.[kid] || ''] || Object.values(r.maler)[0] || STD_SJEKKMALER[2];

export function rundeStatus(r: Runde | null | undefined, K: any[]) {
  const kp = r?.kp || {}; let ok = 0, avvik = 0;
  for (const k of K) { const s = kp[k.id]; if (!s) continue; if ((s.avvik || []).length || Object.values(s.svar || {}).includes('avvik')) avvik++; else ok++; }
  return { antall: K.length, ok, avvik, gjort: ok + avvik, igjen: K.length - ok - avvik };
}

/** Rens et svar fra klienten (server og app). */
export function renKompSvar(x: any, mal: SjekkMal, iv: any): KompSvar | null {
  if (!x || typeof x !== 'object') return null;
  const svar: Record<string, Svar> = {};
  for (const pt of punkterFor(mal, iv)) { const v = x.svar?.[pt.id]; if (v === 'ok' || v === 'avvik' || v === 'ia') svar[pt.id] = v; }
  const avvik = (Array.isArray(x.avvik) ? x.avvik : []).map((a: any) => String(a || '').trim().slice(0, 300)).filter(Boolean).slice(0, 10);
  return { t: new Date().toISOString(), av: String(x.av || '').slice(0, 160), firma: x.firma ? String(x.firma).slice(0, 160) : undefined, svar, komm: String(x.komm || '').slice(0, 1000), avvik };
}
