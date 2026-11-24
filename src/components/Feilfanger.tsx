// Fanger feil under en side, så brukeren ser hva som skjedde i stedet for en hvit skjerm. Laster på nytt (én gang) hvis feilen skyldes en gammel versjon etter oppdatering.
import React from 'react';
import { tt } from '../lib/i18n';

const GAMMEL = /dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk|error loading dynamically/i;
type P = { nokkel: string; children: React.ReactNode }; type St = { feil: Error | null };
export class Feilfanger extends React.Component<P, St> {
  state: St = { feil: null };
  static getDerivedStateFromError(feil: Error): St { return { feil }; }
  componentDidCatch(feil: Error) {
    console.error('Sidefeil:', feil);
    if (GAMMEL.test(String(feil?.message || ''))) { try { if (!sessionStorage.getItem('ek-ny-versjon')) { sessionStorage.setItem('ek-ny-versjon', '1'); location.reload(); } } catch { /* ingenting */ } }
  }
  componentDidUpdate(forrige: P) { if (forrige.nokkel !== this.props.nokkel && this.state.feil) this.setState({ feil: null }); }
  render() {
    const f = this.state.feil; if (!f) return this.props.children;
    const detalj = `${f.message}\n${String(f.stack || '').split('\n').slice(1, 6).join('\n')}\n${location.hash} · ${navigator.userAgent}`;
    return <div className="card" style={{ maxWidth: 720, margin: '40px auto', padding: 24 }}>
      <h2 style={{ marginTop: 0 }}>{tt("Noe gikk galt på denne siden")}</h2>
      <p>{tt("Dataene dine er ikke berørt. Prøv å laste siden på nytt. Hjelper ikke det, kan du sende teksten under til den som drifter appen.")}</p>
      <div className="toolbar"><button className="btn pri" onClick={() => { try { sessionStorage.removeItem('ek-ny-versjon'); } catch { /* ingenting */ } location.reload(); }}>{tt("Last siden på nytt")}</button>
        <button className="btn" onClick={() => { location.hash = '#/oversikt'; this.setState({ feil: null }); }}>{tt("Gå til oversikten")}</button>
        <button className="btn" onClick={() => navigator.clipboard?.writeText(detalj)}>{tt("Kopier feilmelding")}</button></div>
      <pre className="small" style={{ whiteSpace: 'pre-wrap', background: 'var(--surface2, #f2f4f1)', padding: 10, borderRadius: 8, marginTop: 12, maxHeight: 200, overflow: 'auto' }}>{detalj}</pre>
    </div>;
  }
}
