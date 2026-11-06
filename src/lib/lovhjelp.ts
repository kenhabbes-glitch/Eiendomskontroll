// Forklaringer til sjekkpunkter som viser til lover og forskrifter. Vises bak (?) i appen.
// Tekstene er veiledende og erstatter ikke regelverket – kilde er alltid lenket.
export type Hjelp = { tittel: string; tekst: string; kilde?: [string, string][] };

const BHF: [string, string] = ['Byggherreforskriften (Lovdata)', 'https://lovdata.no/dokument/SF/forskrift/2009-08-03-1028'];
const BHF_AT: [string, string] = ['Arbeidstilsynet: byggherreforskriften med kommentarer (PDF)', 'https://arbeidstilsynet.no/globalassets/regelverkspdfer/byggherreforskriften'];
const PBL: [string, string] = ['Plan- og bygningsloven (Lovdata)', 'https://lovdata.no/dokument/NL/lov/2008-06-27-71'];
const SAK: [string, string] = ['DiBK: byggesaksforskriften § 4-1 med veiledning', 'https://www.dibk.no/regelverk/sak/2/4/4-1'];

export const HJELP: Record<string, Hjelp> = {
  bhf_risiko: { tittel: 'Risikovurdering av arbeidet (byggherreforskriften §§ 5, 6 og 8)',
    tekst: 'Byggherren skal kartlegge risikoforhold som kan oppstå på grunn av byggherrens planer – valg av løsninger, materialer, rekkefølge og tidsbruk – og planlegge tiltak som reduserer risikoen.\n\nVurder hver arbeidsoperasjon: Hva kan gå galt (fall, ras, strøm, støv/asbest, tunge løft, trafikk, arbeid i drift med leietakere til stede)? Hvor sannsynlig er det, og hvor alvorlig blir konsekvensen?\n\nRisikoforholdene og foreløpige tiltak skal med i tilbudsgrunnlaget (§ 6) og inn i SHA-planen (§ 8), slik at entreprenørene kan prise og planlegge dem.',
    kilde: [BHF_AT, BHF] },
  bhf_shaplan: { tittel: 'Behov for SHA-plan (byggherreforskriften §§ 7 og 8)',
    tekst: 'Før arbeidet starter skal byggherren sørge for en skriftlig plan for sikkerhet, helse og arbeidsmiljø (SHA-plan). Planen skal blant annet beskrive organisering, fremdrift med nok tid til arbeidsoperasjonene, risikoforhold og spesifikke tiltak for arbeid som kan innebære særlig fare, og rutiner for avvik og endringer.\n\nVurder først om forskriften gjelder: den gjelder ikke når byggherren er forbruker, og rutinemessig eller mindre omfattende vedlikehold er unntatt. En næringseiendom som får utført ombygging, rehabilitering eller utskifting av anlegg er normalt omfattet.\n\nDokumenter vurderingen – også når konklusjonen er at det ikke trengs egen plan.',
    kilde: [BHF_AT, BHF] },
  bhf_kp: { tittel: 'Koordinator for prosjektering – KP (byggherreforskriften §§ 13 og 14)',
    tekst: 'Når mer enn én arbeidsgiver eller enmannsbedrift skal arbeide på plassen (underentreprenører teller med), skal byggherren utpeke koordinator for prosjekteringsfasen.\n\nKP koordinerer prosjekteringen slik at SHA ivaretas, og sørger for at SHA-planen utarbeides. Byggherren kan være KP selv, men må ha nødvendig kunnskap om SHA og praktisk erfaring. Utpekingen skal være skriftlig, og byggherren skal følge opp at koordinatoren gjør jobben.',
    kilde: [BHF_AT] },
  bhf_ku: { tittel: 'Koordinator for utførelse – KU (byggherreforskriften §§ 13 og 14)',
    tekst: 'Ved mer enn én arbeidsgiver eller enmannsbedrift skal byggherren også utpeke koordinator for utførelsen.\n\nKU følger opp risikoforholdene i SHA-planen, oppdaterer planen ved behov, koordinerer virksomheter som kan påvirke hverandres sikkerhet, følger opp at arbeidsgiverne gjennomfører planen og sørger for oversiktslister (§ 15). Utpekes skriftlig, og byggherren skal følge opp jevnlig.',
    kilde: [BHF_AT] },
  bhf_forhandsmelding: { tittel: 'Forhåndsmelding til Arbeidstilsynet (byggherreforskriften § 10)',
    tekst: 'Forhåndsmelding kreves når arbeidet skal vare mer enn 15 virkedager, eller den forventede arbeidsmengden overstiger 250 dagsverk.\n\nMeldingen sendes elektronisk (Altinn) og må være Arbeidstilsynet i hende senest én uke før oppstart. Den skal holdes oppdatert og henges synlig opp på byggeplassen. Innhold er bl.a. adresse, type prosjekt, byggherre, koordinatorer, prosjekterende og utførende, forventet start, varighet og maks antall arbeidstakere samtidig.\n\nEstimer dagsverk som antall personer × antall dager (f.eks. 4 personer i 70 dager = 280 dagsverk → melding kreves).',
    kilde: [['Arbeidstilsynet: § 10 forhåndsmelding', 'https://arbeidstilsynet.no/en/laws-and-regulations/regulations/construction-client-regulations/2/section10'], BHF] },
  bhf_tilbud: { tittel: 'SHA i tilbudsgrunnlaget (byggherreforskriften § 6)',
    tekst: 'Byggherren skal beskrive risikoforhold i prosjektet og foreløpige planer for hvordan risikoen skal reduseres i tilbudsgrunnlaget, sammen med krav som kan ha økonomisk eller tidsmessig betydning (f.eks. arbeid i drift, arbeidstider, støyrestriksjoner, adkomst).\n\nLegg ved byggherrens SHA-plan (eller utkast) og risikovurderingen, slik at tilbyderne kan prise tiltakene.',
    kilde: [BHF_AT] },
  bhf_dok: { tittel: 'Dokumentasjon for fremtidig arbeid (byggherreforskriften § 12)',
    tekst: 'Byggherren skal sørge for dokumentasjon som er nødvendig for sikkert arbeid senere – drift, vedlikehold, ombygging og riving – og at den overleveres eieren av bygget etter ferdigstillelse. Eksempler: forankringspunkter på tak, adkomst til tekniske rom, farlige stoffer som er brukt, særlige risikoforhold ved anlegget.',
    kilde: [BHF_AT] },
  pbl_soknad: { tittel: 'Søknadsplikt (plan- og bygningsloven § 20-1 og § 20-2)',
    tekst: 'Tiltak som oppføring, endring og reparasjon av bygningstekniske installasjoner, fasadeendring, bruksendring, riving og oppdeling eller sammenføyning av bruksenheter er søknadspliktige etter § 20-1. Hovedregelen (§ 20-2) er at de ikke kan utføres før kommunen har gitt tillatelse.\n\nVurder om tiltaket berører bærende konstruksjoner, brannskiller, rømningsveier, fasade eller bruken av lokalene – da er det som regel søknadspliktig.',
    kilde: [PBL] },
  pbl_unntak: { tittel: 'Unntak fra søknadsplikt (pbl. § 20-5 og SAK10 § 4-1)',
    tekst: 'Enkelte mindre tiltak er unntatt fra søknad og tillatelse når de er i samsvar med plan, f.eks. visse mindre endringer og reparasjoner av tekniske installasjoner og mindre fasadeendringer. Vilkårene står i byggesaksforskriften § 4-1 og må være oppfylt i sin helhet.\n\nSelv om tiltaket er unntatt, gjelder kravene i TEK17 (brann, ventilasjon, energi osv.). Kommunen kan føre tilsyn også med unntatte tiltak. Skriv ned hvilket unntak du bygger på.',
    kilde: [SAK, PBL] },
  pbl_ansvar: { tittel: 'Ansvarlig søker og ansvarsrett (pbl. §§ 20-3, 20-4 og kap. 23)',
    tekst: 'Søknadspliktige tiltak skal som hovedregel forestås av foretak med ansvarsrett – ansvarlig søker, prosjekterende og utførende (§ 20-3). Enkelte mindre tiltak på bebygd eiendom kan tiltakshaver søke om selv (§ 20-4). Avklar tidlig hvem som er ansvarlig søker, og at foretakene har nødvendige kvalifikasjoner.',
    kilde: [PBL] },
  pbl_nabo: { tittel: 'Nabovarsel (pbl. § 21-3)',
    tekst: 'Ved søknad om tiltak skal naboer og gjenboere som hovedregel varsles før søknaden sendes kommunen. De har to uker på seg til å komme med merknader. Kommunen kan unnta fra varsling når naboens interesser ikke berøres.',
    kilde: [PBL] },
  pbl_disp: { tittel: 'Dispensasjon (pbl. kap. 19)',
    tekst: 'Er tiltaket i strid med reguleringsplan eller byggteknisk forskrift, må det søkes dispensasjon. Det kan bare gis når hensynene bak bestemmelsen ikke blir vesentlig tilsidesatt og fordelene er klart større enn ulempene. Regn med lengre saksbehandling.',
    kilde: [PBL] },
  tek_miljo: { tittel: 'Miljøkartlegging og avfallsplan (TEK17 §§ 9-6 og 9-7)',
    tekst: 'Ved rehabilitering og riving over visse størrelser (bl.a. over 100 m² BRA berørt, eller over 10 tonn avfall) kreves avfallsplan, og bygningsdeler som kan inneholde farlig avfall – asbest, PCB, KFK, tungmetaller, bromerte flammehemmere – skal kartlegges før arbeidet starter (miljøsaneringsbeskrivelse).\n\nKartleggingen er også viktig for SHA: funn av asbest gir egne krav til arbeidet.',
    kilde: [['DiBK: byggteknisk forskrift (TEK17)', 'https://www.dibk.no/regelverk/byggteknisk-forskrift-tek17']] },
  tg_kg: { tittel: 'Tilstandsgrad og konsekvensgrad (NS 3424)',
    tekst: 'Tilstandsgrad: TG0 ingen symptomer, TG1 svake, TG2 middels, TG3 store symptomer eller sammenbrudd. Konsekvensgrad (KG0–KG3) beskriver hvor alvorlig følgen er for sikkerhet, helse, miljø, økonomi og drift. TG3 kombinert med høy KG bør gi tiltak raskt.' },
  leie_arbeid: { tittel: 'Arbeider i leide lokaler',
    tekst: 'Sjekk leieavtalen: Har utleier rett til å utføre arbeider i lokalene, og med hvilket varsel? Er det avtalt bestemmelser om reduksjon i leie, erstatning eller midlertidige lokaler ved ulemper? I standard næringsleieavtaler er utleiers adgang ofte regulert, og leietaker må tåle nødvendige arbeider etter rimelig varsel.\n\nVarsle skriftlig, med tidsplan og kontaktperson, og avklar adkomst, støy, rømningsveier og driftsavbrudd.' },
  ns84: { tittel: 'Kontraktstandarder (NS 8405 / 8406 / 8407)',
    tekst: 'NS 8405: utførelsesentreprise der byggherren står for prosjekteringen – for større prosjekter. NS 8406: forenklet utførelsesentreprise – for mindre og enklere prosjekter. NS 8407: totalentreprise der entreprenøren også prosjekterer.\n\nValget styrer risikofordelingen: i totalentreprise bærer entreprenøren prosjekteringsrisikoen, men byggherren har mindre styring med løsningene.' },
};

/** Hjelpenøkkel for et sjekkpunkt ut fra teksten (fungerer også for sjekklister lagret før hjelpen fantes) */
export function hjelpFor(t: string): string | undefined {
  const s = t.toLowerCase();
  if (/risikovurdering av arbeidet|risikovurdering/.test(s)) return 'bhf_risiko';
  if (/sha-plan vurdert|behov for sha-plan/.test(s)) return 'bhf_shaplan';
  if (/sha-plan del av konkurranse|sha-plan.*tilbud/.test(s)) return 'bhf_tilbud';
  if (/koordinator for prosjektering|\(kp\)/.test(s)) return 'bhf_kp';
  if (/koordinator for utførelse|\(ku\)/.test(s)) return 'bhf_ku';
  if (/forhåndsmelding/.test(s)) return 'bhf_forhandsmelding';
  if (/^sha-plan$|sha-plan i tilbud/.test(s)) return 'bhf_tilbud';
  if (/byggherreforskrift/.test(s)) return 'bhf_shaplan';
  if (/dokumentasjon for fremtidig|§ 12\)/.test(s)) return 'bhf_dok';
  if (/§ ?20-1|søknadspliktig|søknadsplikt etter/.test(s)) return 'pbl_soknad';
  if (/§ ?20-5|§ ?4-1|unntak/.test(s)) return 'pbl_unntak';
  if (/ansvarlig søker|ansvarsrett/.test(s)) return 'pbl_ansvar';
  if (/nabovarsel/.test(s)) return 'pbl_nabo';
  if (/dispensasjon/.test(s)) return 'pbl_disp';
  if (/miljøkartlegging|asbest|pcb/.test(s)) return 'tek_miljo';
  if (/tilstandsgrad|\(tg\)/.test(s)) return 'tg_kg';
  if (/leieavtalens/.test(s)) return 'leie_arbeid';
  if (/ns 8405|ns 8406|ns 8407|kontraktsbestemmelser/.test(s)) return 'ns84';
  return undefined;
}
/** Verktøy i SHA-arbeidsflaten som hører til sjekkpunktet */
export function verktoyFor(t: string): 'risiko' | 'vurdering' | 'org' | 'plan' | undefined {
  const s = t.toLowerCase();
  if (/risikovurdering av arbeidet/.test(s)) return 'risiko';
  if (/behov for sha-plan|forhåndsmelding/.test(s)) return 'vurdering';
  if (/koordinator/.test(s)) return 'org';
  if (/sha-plan del av/.test(s)) return 'plan';
  return undefined;
}

/** Typiske risikoforhold i bygge- og anleggsarbeid – brukes som hurtigvalg i risikovurderingen (jf. byggherreforskriften § 8 om særlig farlig arbeid) */
export const RISIKOFORHOLD: [string, string, string][] = [
  ['Arbeid i høyden', 'Fall fra tak, stillas, lift eller gjennom åpninger', 'Rekkverk/sikring av åpninger, godkjent stillas, fallsikring, opplæring'],
  ['Arbeid på tak', 'Fall, glatt underlag, vind, sprø takflater/takluker', 'Sikringsline og forankring, kantsikring, værforbehold'],
  ['Arbeid i bygg i drift', 'Leietakere og besøkende i arbeidsområdet, rømningsveier sperret', 'Avsperring, skilting, varsling av leietakere, opprettholdte rømningsveier'],
  ['Varme arbeider', 'Brann ved sveising, skjæring, sliping, takarbeid med åpen flamme', 'Sertifikat varme arbeider, brannvakt, slukkeutstyr, frakobling av detektorer etter avtale'],
  ['Elektriske anlegg', 'Strømgjennomgang, lysbue, arbeid nær spenningssatte anlegg', 'Frakobling og sikring (FSE), kvalifisert personell, merking'],
  ['Farlige stoffer / asbest / PCB', 'Eksponering for helsefarlig støv, fibre eller kjemikalier', 'Miljøkartlegging, sanering av godkjent firma, verneutstyr, avfallshåndtering'],
  ['Støv, støy og vibrasjoner', 'Helseskadelig eksponering for arbeidere og leietakere', 'Avsug og støvskjerming, arbeidstid for støyende arbeid, hørselvern'],
  ['Tunge løft og kranarbeid', 'Fallende last, klemskader ved montering/demontering av tunge elementer (f.eks. aggregat)', 'Løfteplan, sertifisert kranfører/stropper, avsperring under last'],
  ['Riving / inngrep i bærende konstruksjoner', 'Sammenrasing, uforutsette forhold', 'Statiker vurderer, midlertidig avstiving, rekkefølge'],
  ['Graving og grunnarbeid', 'Ras, skjulte kabler og rør i grunnen', 'Påvisning av kabler, sikring av grøfter, gravemelding'],
  ['Trafikk og adkomst', 'Påkjørsel ved arbeid nær vei, parkering eller varelevering', 'Arbeidsvarslingsplan, avsperring, trafikkdirigering'],
  ['Trange rom / tekniske rom', 'Oksygenmangel, gass, vanskelig rømning (sjakter, tanker, kulverter)', 'Gassmåling, vakt utenfor, prosedyre for arbeid i trange rom'],
  ['Kjølemedier og trykksatte anlegg', 'Lekkasje av kuldemedium, trykk og temperatur', 'Sertifisert personell, tømming før arbeid, ventilasjon'],
  ['Alenearbeid', 'Ingen hjelp ved skade', 'Rutine for kontakt, varslingsutstyr'],
];
