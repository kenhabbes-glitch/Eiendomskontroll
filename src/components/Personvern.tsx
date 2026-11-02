// Personvernerklæring for eksterne som bruker lenker fra arbeidsordre/sjekklister, og for nye brukere.
// Versjonen lagres sammen med bekreftelsen. Endres teksten vesentlig: øk versjonen.
import React, { useState } from 'react';

export const PERSONVERN_VERSJON = '1.0 (november 2026)';

export function PersonvernTekst({ ansvarlig }: { ansvarlig?: string }) {
  const bA = ansvarlig || 'oppdragsgiveren (eieren eller forvalteren av eiendommen)';
  return <div className="small" style={{ lineHeight: 1.55 }}>
    <h3 style={{ margin: '0 0 6px' }}>Personvernerklæring – Eiendomskontroll</h3>
    <p className="muted" style={{ marginTop: 0 }}>Versjon {PERSONVERN_VERSJON}</p>
    <p><b>Behandlingsansvarlig</b> er {bA}, som har sendt deg arbeidsordren, sjekklisten eller invitasjonen. Leverandøren av Eiendomskontroll behandler opplysningene på vegne av den behandlingsansvarlige (databehandler).</p>
    <p><b>Hvilke opplysninger:</b> navn, e-postadresse, firma, eventuelt telefonnummer, tidspunkt for innsending og pålogging, rapporter, kommentarer, bilder og dokumenter du laster opp, og teknisk logg (bl.a. IP-adresse) fra drift av tjenesten.</p>
    <p><b>Formål:</b> å gjennomføre, kvittere ut og dokumentere arbeid, kontroller og plikter knyttet til eiendommen – blant annet dokumentasjon som kreves etter forskrift om brannforebygging, internkontrollforskriften og FDV-krav – og å kunne kontakte deg om oppdraget.</p>
    <p><b>Behandlingsgrunnlag:</b> gjennomføring av avtale/oppdrag (personvernforordningen art. 6 nr. 1 b), rettslige forpliktelser til å dokumentere kontroller og vedlikehold (art. 6 nr. 1 c) og berettiget interesse i å kunne dokumentere hvem som har utført arbeid på eiendommen (art. 6 nr. 1 f).</p>
    <p><b>Lagring og sikkerhet:</b> Data lagres i database og fillager hos Supabase i EU/EØS-tilsvarende område (Sveits), med tilgangskontroll slik at bare de som har tilgang til eiendommen ser opplysningene. Appen leveres via Netlify, og e-post sendes via oppdragsgiverens e-postleverandør. Lenker uten innlogging er personlige, tidsbegrensede og kan bare brukes til det aktuelle oppdraget.</p>
    <p><b>Lagringstid:</b> Rapporter og dokumentasjon av utført arbeid oppbevares så lenge de er nødvendige for eiendommens drifts- og kontrollhistorikk, eller så lenge regelverket krever. Brukerkontoer slettes på forespørsel eller når de ikke lenger trengs.</p>
    <p><b>Dine rettigheter:</b> Du kan be om innsyn, retting, sletting og begrensning, og protestere mot behandlingen. Henvendelser rettes til {bA}. Du kan også klage til Datatilsynet (datatilsynet.no).</p>
  </div>;
}

/** Avkrysning med lenke som viser erklæringen. */
export function PersonvernBekreft({ ok, set, ansvarlig }: { ok: boolean; set: (b: boolean) => void; ansvarlig?: string }) {
  const [vis, setVis] = useState(false);
  return <div style={{ margin: '12px 0 4px' }}>
    <label className="small" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontWeight: 400, cursor: 'pointer' }}>
      <input type="checkbox" checked={ok} onChange={e => set(e.target.checked)} style={{ marginTop: 3, width: 'auto' }} />
      <span>Jeg har lest og godtar <a href="#" onClick={e => { e.preventDefault(); setVis(!vis); }}>personvernerklæringen</a>, og at opplysningene jeg sender inn behandles som beskrevet.</span></label>
    {vis && <div className="note" style={{ marginTop: 8, maxHeight: 280, overflow: 'auto', color: 'var(--ink)' }}><PersonvernTekst ansvarlig={ansvarlig} /></div>}
  </div>;
}
