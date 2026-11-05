// Notat til advokat: hva Eiendomskontroll behandler av personopplysninger, hvordan og hvorfor, og hva som bør vurderes.
// Vises under Organisasjon og tilgang → «Personvern». Status for gjennomgangen lagres på organisasjonen.
import React, { useRef, useState } from 'react';
import { S, sb, toast, feiltekst, bump } from '../lib/store';
import { PERSONVERN_VERSJON, PersonvernTekst } from '../components/Personvern';
import { fd } from '../lib/utils';

const NOTATVERSJON = '1.0 – 5. november 2026';

const T = ({ rader, hode }: { hode: string[]; rader: React.ReactNode[][] }) =>
  <table className="pn-t"><thead><tr>{hode.map(h => <th key={h}>{h}</th>)}</tr></thead>
    <tbody>{rader.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody></table>;

export function PersonvernNotat({ org }: { org: string }) {
  const O: any = S.orgs.find(o => o.id === org) || {};
  const g = O.data?.personvernGjennomgang || {};
  const [f, setF] = useState({ advokat: g.advokat || '', dato: g.dato || '', status: g.status || 'Ikke sendt', kommentar: g.kommentar || '' });
  const ref = useRef<HTMLDivElement>(null);
  const lagre = async () => {
    const data = { ...(O.data || {}), personvernGjennomgang: { ...f, oppdatert: new Date().toISOString() } };
    const { error } = await sb.from('organisasjoner').update({ data }).eq('id', org);
    if (error) return toast(feiltekst(error)); O.data = data; bump(); toast('Lagret');
  };
  const skrivUt = () => {
    const w = window.open('', '_blank'); if (!w || !ref.current) return toast('Tillat sprettoppvinduer for å skrive ut');
    w.document.write(`<!doctype html><html lang="nb"><head><meta charset="utf-8"><title>Personvern – notat til advokat – ${O.navn || ''}</title><style>
      body{font:11pt/1.5 Georgia,serif;color:#111;max-width:780px;margin:32px auto;padding:0 24px}h1{font-size:20pt;margin:0 0 4px}h2{font-size:13pt;margin:22px 0 6px;border-bottom:1px solid #ccc;padding-bottom:2px}h3{font-size:11pt;margin:14px 0 4px}
      table{border-collapse:collapse;width:100%;margin:6px 0 10px;font-size:9.5pt}th,td{border:1px solid #bbb;padding:4px 6px;text-align:left;vertical-align:top}th{background:#f0f0f0}
      .flagg{background:#fff4d6;border-left:3px solid #c08a00;padding:6px 10px;margin:8px 0}.muted{color:#666}.small{font-size:9.5pt}.noprint{display:none}ol li,ul li{margin:2px 0}
      @page{margin:18mm}</style></head><body>${ref.current.innerHTML}</body></html>`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  };

  return <>
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <b>Advokatgjennomgang</b><span className="grow" />
        <button className="btn" onClick={skrivUt}>Skriv ut / lagre som PDF</button>
      </div>
      <div className="frm" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10, marginTop: 10 }}>
        <div className="fld"><label>Status</label><select value={f.status} onChange={e => setF({ ...f, status: e.target.value })}>
          {['Ikke sendt', 'Sendt til advokat', 'Under vurdering', 'Tilbakemelding mottatt', 'Tiltak gjennomført', 'Godkjent'].map(x => <option key={x}>{x}</option>)}</select></div>
        <div className="fld"><label>Advokat / firma</label><input value={f.advokat} onChange={e => setF({ ...f, advokat: e.target.value })} placeholder="Navn, firma" /></div>
        <div className="fld"><label>Dato sendt / gjennomgått</label><input type="date" value={f.dato} onChange={e => setF({ ...f, dato: e.target.value })} /></div>
      </div>
      <div className="fld" style={{ marginTop: 8 }}><label>Advokatens kommentarer og tiltak</label><textarea rows={4} value={f.kommentar} onChange={e => setF({ ...f, kommentar: e.target.value })} placeholder="Notér tilbakemeldinger og hva som skal endres" /></div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8 }}><button className="btn pri" onClick={lagre}>Lagre status</button>
        {g.oppdatert && <span className="small muted">Sist lagret {fd(g.oppdatert.slice(0, 10))}</span>}</div>
    </div>

    <div className="card pn" ref={ref}>
      <h1>Personvern i Eiendomskontroll – notat til advokat</h1>
      <p className="muted small">Utarbeidet for {O.navn || 'organisasjonen'}{O.orgnr ? ` (org.nr. ${O.orgnr})` : ''} · Notatversjon {NOTATVERSJON} · Personvernerklæring i appen: versjon {PERSONVERN_VERSJON}{f.status !== 'Ikke sendt' ? ` · Status: ${f.status}` : ''}</p>

      <h2>1. Hva vi ber om</h2>
      <p>Eiendomskontroll er en nettbasert tjeneste for drift, kontroll og dokumentasjon av næringseiendom (brannvern, internkontroll, lovpålagt service, avvik, vedlikeholdsplan, leietakeres plikter). Tjenesten brukes av eiere og forvaltere, og skal selges til flere eiere og forvaltningsselskaper. Vi ber om en vurdering av om behandlingen av personopplysninger er i tråd med personopplysningsloven/GDPR, om personvernerklæringen er dekkende, og hvilke avtaler og rutiner som må på plass før tjenesten tilbys kunder. Konkrete spørsmål står i punkt 10.</p>
      <p>Notatet beskriver hvordan tjenesten faktisk er bygget per i dag, inkludert svakheter vi selv har identifisert (markert med gul bakgrunn).</p>

      <h2>2. Roller</h2>
      <ul>
        <li><b>Kunden</b> (eier eller forvalter av eiendommen, registrert som «organisasjon» i appen) bestemmer formålet med opplysningene om egne brukere, leietakere og leverandører. Vi legger til grunn at kunden er <b>behandlingsansvarlig</b>.</li>
        <li><b>Leverandøren av Eiendomskontroll</b> drifter tjenesten og behandler opplysningene på vegne av kundene. Vi legger til grunn at leverandøren er <b>databehandler</b>. Leverandøren har en plattformadministrator som administrerer kundeorganisasjoner, men som <i>ikke</i> automatisk har tilgang til kundenes eiendomsdata (håndheves i databasen).</li>
        <li>Når leverandøren selv eier eiendommer i tjenesten, er leverandøren behandlingsansvarlig for disse.</li>
        <li>Flere organisasjoner kan ha tilgang til samme bygg gjennom «oppdrag» (f.eks. eier + forvaltningsselskap + serviceselskap). Hver organisasjon ser bare det oppdraget gir tilgang til.</li>
      </ul>
      <div className="flagg">Rollefordelingen ved oppdrag (eier og forvalter deler data om samme bygg) bør vurderes: felles behandlingsansvar (art. 26) eller to selvstendige behandlingsansvarlige?</div>

      <h2>3. Hvem det behandles opplysninger om, og hvilke</h2>
      <T hode={['Registrerte', 'Opplysninger', 'Kilde']} rader={[
        ['Brukere hos kunden (administrator, forvalter, driftstekniker, leser)', 'Navn, e-post, rolle og tilganger, tidspunkt for innlogging, bekreftelse av personvernerklæring (versjon og tidspunkt), tofaktor-oppsett (hemmelig nøkkel lagres hos Supabase Auth), hvem som har gjort hva i appen (hendelseslogg)', 'Brukeren selv / administrator'],
        ['Kontaktpersoner hos leietakere', 'Navn, e-post, telefon, rolle som brannvernleder, notater (vises ikke for leietaker). Leietakere som får egen bruker: som for brukere over', 'Utleier / leietaker'],
        ['Ansatte hos serviceselskaper og andre eksterne', 'Navn, firma, e-post, eventuelt telefon, rapporter og kommentarer, opplastede bilder og dokumenter, tidspunkt for innsending, tilstandsvurderinger, bekreftelse av personvernerklæring', 'Den eksterne selv via lenke / kunden'],
        ['Personer som tilfeldig kommer med på bilder', 'Bilder av avvik og utført arbeid kan vise personer, kjøretøy o.l.', 'Den som tar bildet'],
        ['Personer omtalt i leiekontrakter og dokumenter', 'Leiekontrakter og andre dokumenter lastes opp som filer og kan inneholde personopplysninger (f.eks. personlig ansvarlige, kausjonister, enkeltpersonforetak, signaturer)', 'Kunden'],
        ['Alle som bruker tjenesten', 'Tekniske logger hos driftsleverandørene (bl.a. IP-adresse, nettleser, tidspunkt)', 'Automatisk'],
      ]} />
      <p className="small">Tjenesten er ikke laget for særlige kategorier av personopplysninger (art. 9) eller fødselsnummer, og har ingen felt for dette. Fritekstfelt og opplastede filer kan likevel inneholde slike opplysninger dersom brukerne skriver det inn.</p>
      <p className="small">Leiekontrakter behandles som konfidensielle: de lagres bare i kundens fillager med tilgangskontroll og sendes <b>ikke</b> til KI-tjenester eller andre tredjeparter. Ansvarsfordeling fra kontrakten registreres manuelt.</p>

      <h2>4. Formål og behandlingsgrunnlag (slik vi har vurdert det)</h2>
      <T hode={['Formål', 'Grunnlag vi har lagt til grunn']} rader={[
        ['Gi brukere tilgang og styre hva den enkelte kan se og endre', 'Art. 6 nr. 1 b (avtale med kunden/brukeren) og f (berettiget interesse i sikker tilgangsstyring)'],
        ['Dokumentere kontroller, service og vedlikehold som kreves etter forskrift om brannforebygging, internkontrollforskriften, el-tilsyn, heisforskrift, FDV-krav m.m.', 'Art. 6 nr. 1 c (rettslig forpliktelse) for eier/virksomhet, supplert med f'],
        ['Sende arbeidsordre og kontrolloppdrag til serviceselskap og ta imot utkvittering', 'Art. 6 nr. 1 b (oppdragsavtale) og f'],
        ['Følge opp leietakers plikter etter leiekontrakten (internkontroll, brannvern)', 'Art. 6 nr. 1 b (leieavtale) og c'],
        ['Hendelseslogg (hvem gjorde hva, når)', 'Art. 6 nr. 1 f (sporbarhet og dokumentasjon) og c'],
        ['Tofaktorinnlogging og passordkontroll', 'Art. 6 nr. 1 f og art. 32 (sikkerhet)'],
      ]} />
      <p>Eksterne som bruker lenker og nye brukere må krysse av for at de har lest personvernerklæringen før de sender inn. Dette er utformet som en <b>bekreftelse på informasjon</b> (art. 13), ikke som samtykke etter art. 6 nr. 1 a. Versjon og tidspunkt lagres.</p>
      <div className="flagg">Teksten i avkrysningen sier i dag «Jeg har lest og godtar personvernerklæringen». Ordet «godtar» kan misforstås som samtykke. Bør formuleringen endres?</div>

      <h2>5. Underleverandører og hvor data lagres</h2>
      <T hode={['Leverandør', 'Hva de gjør', 'Hvor', 'Merknad']} rader={[
        ['Supabase Inc.', 'Database, fillager (bilder, dokumenter, tegninger, leiekontrakter), innlogging og tofaktor', 'Datasenter i Zürich, Sveits (AWS eu-central-2)', 'Sveits har adekvansvedtak fra EU. Supabase er et amerikansk selskap – mulig tilgang fra USA ved support/drift. Databehandleravtale (DPA) må inngås/aksepteres.'],
        ['Netlify Inc.', 'Leverer selve nettsiden og kjører serverfunksjoner (sending av e-post med arbeidsordre/PDF og bilder, mottak av utkvitteringer via lenker, brukeradministrasjon, daglig automatisk utsending)', 'Nettsiden via globalt CDN. Serverfunksjoner kjører som standard i USA (Ohio) med mindre regionen endres', <span className="flagg" style={{ display: 'block', margin: 0 }}>Personopplysninger passerer gjennom serverfunksjonene i USA. Regionen kan endres til EU (Frankfurt/Irland) i Netlify-innstillingene – dette bør gjøres. Overføringsgrunnlag (EU–US Data Privacy Framework / standardavtaler) og DPA må vurderes.</span>],
        ['E-postleverandør valgt av kunden (f.eks. Google Gmail/Workspace, Microsoft 365) eller Resend', 'Sender e-post med arbeidsordre, kontrolloppdrag og sjekklister fra kundens egen konto', 'Avhenger av leverandør (Google og Resend: bl.a. USA)', 'Kunden har normalt egen avtale med sin e-postleverandør. Tilgangsopplysningene (app-passord / API-nøkkel) lagres i en databasetabell som bare serveren kan lese.'],
        ['Brønnøysundregistrene, Kartverket/Geonorge', 'Oppslag på organisasjonsnummer og adresser', 'Norge', 'Bare offentlige foretaks- og adresseopplysninger sendes i oppslaget.'],
        ['GitHub Inc.', 'Lagrer programkoden', 'USA', 'Ingen kundedata ligger i koden.'],
      ]} />
      <p className="small">Det brukes ikke analyseverktøy, sporingskapsler, annonsering eller KI-tjenester. Nettleseren lagrer innloggingsøkten og enkelte visningsvalg (lokal lagring), som er nødvendig for at tjenesten skal virke.</p>

      <h2>6. Sikkerhet (art. 32)</h2>
      <ul>
        <li><b>Tilgangskontroll i databasen</b> (radnivåsikkerhet): hver organisasjon og bruker ser bare bygg de er tildelt, med nivåene skrive, drifte, lese og service. Reglene er testet automatisk (59 tester for at én kunde ikke kan se en annens data).</li>
        <li><b>Tofaktorinnlogging</b> er påkrevd for administratorer og forvaltere (kan slås av per organisasjon). Kravet håndheves i databasen og i serverfunksjonene, ikke bare i brukergrensesnittet.</li>
        <li><b>Passord</b>: minst 10 tegn med store og små bokstaver og tall; passord kjent fra datalekkasjer avvises.</li>
        <li><b>Lenker til eksterne</b> (serviceselskap, leietaker) er personlige, tilfeldige og har utløpsdato. De gir bare tilgang til det aktuelle oppdraget. Opplasting via lenke skjer med engangs opplastingsadresser.</li>
        <li>All trafikk er kryptert (HTTPS/TLS). Data er kryptert på disk hos Supabase. Hemmelige nøkler ligger i miljøvariabler hos Netlify/Supabase, ikke i koden.</li>
        <li>Plattformadministrator hos leverandøren ser ikke kundenes eiendomsdata uten at kunden gir tilgang.</li>
      </ul>
      <div className="flagg">Ikke på plass ennå: skriftlig rutine for håndtering av personvernbrudd (melding til Datatilsynet innen 72 timer, art. 33–34), rutine for tilgangsgjennomgang, og logg over hvem hos leverandøren som har driftstilgang.</div>

      <h2>7. Lagringstid og sletting</h2>
      <ul>
        <li>Kontroll-, service- og avviksdokumentasjon beholdes som eiendommens historikk så lenge kunden trenger den, eller så lenge regelverket krever.</li>
        <li>Brukere kan deaktiveres eller slettes av administrator. Lenker utløper, men selve invitasjonen (med navn/e-post og innsendt svar) blir liggende.</li>
        <li>Hendelsesloggen beholdes uten tidsbegrensning.</li>
      </ul>
      <div className="flagg">Det finnes i dag ingen automatisk sletting. Vi trenger råd om lagringstider for: hendelseslogg, utløpte invitasjoner, opplysninger om tidligere leietakere og deres kontaktpersoner, og hva som skjer med data når en kunde avslutter avtalen.</div>

      <h2>8. De registrertes rettigheter</h2>
      <p>Innsyn, retting og sletting håndteres i dag manuelt av kundens administrator (redigere/slette i appen, eksport under «Import og eksport»). Henvendelser fra eksterne rettes til kunden som behandlingsansvarlig. Det finnes ingen egen selvbetjening for innsyn.</p>

      <h2>9. Personvernerklæringen slik den vises i appen</h2>
      <p className="small muted">Vises for eksterne før de sender inn via lenke, og for nye brukere ved registrering. «Behandlingsansvarlig» fylles automatisk ut med navnet på kundens organisasjon.</p>
      <div style={{ border: '1px solid var(--line, #ccc)', borderRadius: 6, padding: '8px 12px' }}><PersonvernTekst ansvarlig={O.navn} /></div>

      <h2>10. Spørsmål til advokaten</h2>
      <ol>
        <li>Er rollefordelingen riktig (kunde = behandlingsansvarlig, leverandør = databehandler)? Hvordan bør forholdet mellom eier og forvalter som deler et bygg reguleres?</li>
        <li>Er behandlingsgrunnlagene i punkt 4 riktige, og holder det med en bekreftelse på informasjon (ikke samtykke) for eksterne?</li>
        <li>Er personvernerklæringen (punkt 9) dekkende og korrekt? Hva mangler (f.eks. underleverandører, tredjelandsoverføring, kontaktinformasjon)?</li>
        <li>Er bruken av Supabase (Sveits, amerikansk selskap) og Netlify (serverfunksjoner i USA) forsvarlig? Hvilke overføringsgrunnlag og vurderinger (TIA) trengs? Holder det å flytte serverfunksjonene til EU?</li>
        <li>Hvilke lagringstider bør vi sette for hendelseslogg, invitasjoner, tidligere leietakere og bilder?</li>
        <li>Trengs det en vurdering av personvernkonsekvenser (DPIA, art. 35)?</li>
        <li>Hva må stå i en <b>databehandleravtale</b> mellom leverandøren og kundene, og i brukervilkårene for tjenesten?</li>
        <li>Er det noe særskilt å ta hensyn til ved at leiekontrakter (konfidensielle forretningsdokumenter med mulige personopplysninger) lagres i tjenesten?</li>
        <li>Kan bilder av avvik som viser personer brukes slik de gjør, eller trengs det rutiner/informasjon?</li>
      </ol>

      <h2>11. Dokumenter vi regner med å trenge</h2>
      <ul>
        <li>Databehandleravtale (mal) mellom leverandøren og kundene, med liste over underdatabehandlere</li>
        <li>Brukervilkår for tjenesten</li>
        <li>Protokoll over behandlingsaktiviteter (art. 30) – både som behandlingsansvarlig og som databehandler</li>
        <li>Rutine for personvernbrudd og avviksmelding</li>
        <li>Oppdatert personvernerklæring (ny versjon i appen; eksterne og brukere bekrefter da på nytt)</li>
        <li>Eventuell DPIA og vurdering av tredjelandsoverføring</li>
      </ul>
      <p className="small muted" style={{ marginTop: 18 }}>Notatet er utarbeidet fra hvordan tjenesten er bygget, og er ikke juridisk rådgivning. Tekniske detaljer kan utdypes på forespørsel.</p>
    </div>
  </>;
}
