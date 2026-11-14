// Samsvar med lov og forskrift – trafikklys som brukes på forsiden og på eiendomssiden.
import { useMemo } from 'react';
import { S, state } from '../lib/store';
import { tt } from '../lib/i18n';
import { eierStatus, LYS_TEKST, type EierStatus, type Lys } from '../lib/eierRapport';

/** Fargen alene skal aldri bære meningen: prikken har alltid tekst ved siden av eller som hjelpetekst. */
export function Lyspunkt({ lys, title }: { lys: Lys; title?: string }) {
  return <span className={'lysp ' + lys} title={title} role="img" aria-label={title || tt(LYS_TEKST[lys])} />;
}
export function LysChip({ lys }: { lys: Lys }) { return <span className={'chip ' + (lys === 'grey' ? '' : lys)}>{tt(LYS_TEKST[lys])}</span>; }

/** Status for alle eiendommene, regnet ut én gang per endring i dataene. */
export function useSamsvar(): Map<string, EierStatus> {
  return useMemo(() => new Map(S.eiendommer.map(e => [e.id, eierStatus(e.id)] as [string, EierStatus])),
    [state.version]);
}

const PRI = ['', 'Må gjøres nå', 'Bør gjøres snart', 'Bør vurderes'];
/** Kortet øverst på eiendomssiden: samlet status, status per område og hva som må gjøres. */
export function SamsvarKort({ id, tilFane, leggTil }: { id: string; tilFane: (fane: string) => void; leggTil?: () => void }) {
  const s = eierStatus(id); const mangler = s.kontroller.filter(k => k.mangler); const tiltak = s.tiltak.slice(0, 6);
  return <div className="card samsvar">
    <h2>{tt("Samsvar med lov og forskrift")} <LysChip lys={s.lys} /></h2>
    <div className="samsvar-omr">{s.omrader.map(o => <button key={o.key} className="samsvar-o" onClick={() => tilFane(o.key === 'tilsyn' ? 'avvik' : o.key === 'kontroll' || o.key === 'dok' ? 'krav' : o.key)}>
      <Lyspunkt lys={o.lys} /><span><b>{o.navn}</b><span className="small muted">{o.tekst}</span></span></button>)}</div>
    {tiltak.length > 0 ? <><h3>{tt("Dette må gjøres")}</h3><ol className="samsvar-t">{tiltak.map((t, i) => <li key={i}><span className={'chip ' + (t.pri === 1 ? 'red' : t.pri === 2 ? 'amber' : '')}>{tt(PRI[t.pri])}</span> {t.tekst}</li>)}</ol>
      {s.tiltak.length > tiltak.length && <p className="small muted">+ {s.tiltak.length - tiltak.length} {tt("til")} {tt("– se «Statusrapport til eier»")}</p>}</>
      : <p className="muted" style={{ marginBottom: 0 }}>{tt("Ingen tiltak nødvendig akkurat nå.")}</p>}
    <p style={{ marginBottom: 0 }}>{mangler.length > 0 && leggTil && <><button className="btn pri sm" onClick={leggTil}>{tt("Legg inn {0} manglende lovpålagte kontroller", mangler.length)}</button> </>}<button className="btn sm" onClick={() => tilFane('krav')}>{tt("Se alle lovkrav med status og dokumentasjon")}</button></p>
  </div>;
}
