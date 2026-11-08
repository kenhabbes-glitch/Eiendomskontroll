// Bruksvilkår og databehandleravtale for Eiendomskontroll (godtas ved registrering).
// Leverandørens navn/org.nr/e-post settes i Netlify: VITE_LEVERANDOR_NAVN, VITE_LEVERANDOR_ORGNR, VITE_LEVERANDOR_EPOST.
// Utkast – bør gjennomgås av advokat før kommersiell bruk.
import React from 'react';

export const VILKAR_VERSJON = '1.0 (november 2026)';
const env: any = (import.meta as any).env || {};
export const LEVERANDOR = { navn: env.VITE_LEVERANDOR_NAVN || '[Leverandørens navn]', orgnr: env.VITE_LEVERANDOR_ORGNR || '[org.nr.]', epost: env.VITE_LEVERANDOR_EPOST || '[e-post]' };

export function VilkarTekst() {
  const L = LEVERANDOR;
  return <div className="vilkar" style={{ lineHeight: 1.55 }}>
    <h1 style={{ marginTop: 0 }}>Vilkår for bruk av Eiendomskontroll</h1>
    <p className="muted" style={{ marginTop: 0 }}>Versjon {VILKAR_VERSJON} · Leverandør: {L.navn} (org.nr. {L.orgnr}) · Kontakt: {L.epost}</p>

    <h2>1. Tjenesten</h2>
    <p>Eiendomskontroll er en nettbasert tjeneste for oppfølging av eiendommer: systemer, kontroller, avvik, dokumentasjon, leietakere og tilhørende moduler. Tjenesten leveres «som den er» og videreutvikles løpende. Kunden er organisasjonen som registreres, representert ved brukeren som godtar vilkårene på organisasjonens vegne.</p>

    <h2>2. Prøveperiode og abonnement</h2>
    <p>Nye kunder får 30 dagers gratis prøveperiode på alle moduler. Prøveperioden går ut automatisk og blir ikke fakturert. Fortsatt bruk etter prøveperioden krever avtale om abonnement med valgte moduler og priser. Når en modul ikke lenger er aktiv, skjules funksjonene, men dataene blir liggende.</p>

    <h2>3. Kundens ansvar</h2>
    <ul>
      <li>Kunden er ansvarlig for innholdet som legges inn, og for at brukere får riktig tilgang.</li>
      <li>Påloggingsinformasjon skal holdes hemmelig. Tofaktorinnlogging anbefales for administratorer.</li>
      <li>Tjenesten er et hjelpemiddel. Kunden har selv ansvaret for å oppfylle lover og forskrifter. Lovhenvisninger, forslag, beregninger, verdianslag og automatisk tolking av dokumenter er veiledende og må kontrolleres.</li>
    </ul>

    <h2>4. Kundens data</h2>
    <p>Kunden eier sine data. Leverandøren bruker dem bare for å levere tjenesten. Kunden kan når som helst eksportere dataene sine. Ved opphør slettes kundens data senest 90 dager etter avtalens slutt, med mindre annet er avtalt eller følger av lov. Sikkerhetskopier slettes etter sin vanlige syklus.</p>

    <h2>5. Tilgjengelighet og support</h2>
    <p>Leverandøren tilstreber høy tilgjengelighet, men garanterer ikke uavbrutt drift i prøveperioden. Planlagt vedlikehold varsles når det er mulig. Henvendelser sendes til {L.epost}.</p>

    <h2>6. Ansvarsbegrensning</h2>
    <p>Leverandøren er ikke ansvarlig for indirekte tap, tapt fortjeneste eller tap av data som skyldes forhold utenfor leverandørens kontroll. Samlet ansvar er begrenset til vederlaget kunden har betalt de siste 12 månedene. I prøveperioden ytes tjenesten vederlagsfritt.</p>

    <h2>7. Endringer og oppsigelse</h2>
    <p>Vesentlige endringer i vilkårene varsles minst 30 dager i forveien. Kunden kan avslutte bruken når som helst. Norsk rett gjelder. Tvister søkes løst i minnelighet, ellers ved leverandørens hjemting.</p>

    <h2 id="dba">Bilag: Databehandleravtale</h2>
    <p>Denne avtalen gjelder når leverandøren behandler personopplysninger på vegne av kunden (personvernforordningen artikkel 28). Kunden er behandlingsansvarlig, leverandøren er databehandler.</p>
    <ol>
      <li><b>Formål og omfang.</b> Leverandøren behandler personopplysninger bare for å levere tjenesten: kontaktopplysninger om brukere, leietakeres kontaktpersoner og ansatte hos servicefirma, opplysninger i avvik, dokumenter og logger. Behandlingen varer så lenge avtalen gjelder.</li>
      <li><b>Instrukser.</b> Leverandøren behandler opplysningene bare etter kundens dokumenterte instrukser, som er disse vilkårene og kundens bruk av tjenesten. Leverandøren varsler kunden dersom en instruks er i strid med regelverket.</li>
      <li><b>Taushetsplikt.</b> Personer hos leverandøren som har tilgang til opplysningene, har taushetsplikt.</li>
      <li><b>Sikkerhet.</b> Leverandøren har tiltak etter artikkel 32: kryptert overføring og lagring, tilgangsstyring i databasen per organisasjon, tofaktorinnlogging, logging av hendelser og daglig sikkerhetskopi. Plattformadministrator ser ikke kundedata uten å være gitt tilgang.</li>
      <li><b>Underdatabehandlere.</b> Kunden godkjenner disse: Supabase (database, innlogging og fillagring, datasenter i Zürich, Sveits – land med godkjent beskyttelsesnivå), Netlify (drift av nettsiden og serverfunksjoner) og leverandør av e-postutsending. Endringer varsles med rimelig frist, og kunden kan protestere.</li>
      <li><b>Bistand.</b> Leverandøren bistår kunden med å oppfylle de registrertes rettigheter, med sikkerhet og konsekvensvurderinger, så langt det er rimelig ut fra tjenesten.</li>
      <li><b>Avvik.</b> Brudd på personopplysningssikkerheten meldes til kunden uten ugrunnet opphold, og senest innen 36 timer etter at leverandøren ble klar over det.</li>
      <li><b>Sletting og tilbakelevering.</b> Ved avtalens slutt kan kunden eksportere dataene. Deretter slettes de som beskrevet i punkt 4.</li>
      <li><b>Revisjon.</b> Leverandøren gjør tilgjengelig informasjon som trengs for å vise at avtalen følges, og legger til rette for revisjon etter rimelig varsel.</li>
    </ol>
    <p>Rapporter og dokumenter som leses med funksjonene for rapportlesing og tekstgjenkjenning, behandles lokalt i brukerens nettleser og sendes ikke til tjenester for kunstig intelligens.</p>
  </div>;
}
