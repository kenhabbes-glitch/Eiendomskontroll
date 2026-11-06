// Status for regelverksovervåkingen: hentes fra /regelverk-status.json, som oppdateres ukentlig av regelverkssjekken mot Lovdata.
import React, { useEffect, useState } from 'react';
import { fd, type Rec } from '../lib/utils';

let cache: Rec | null | undefined;
export function useRegelverkStatus() {
  const [s, setS] = useState<Rec | null | undefined>(cache);
  useEffect(() => { if (cache !== undefined) return; fetch('/regelverk-status.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null).then(x => { cache = x; setS(x); }); }, []);
  return s;
}
const dato = (t?: string) => t ? fd(String(t).slice(0, 10)) : '–';

export function RegelverkStatus({ kompakt }: { kompakt?: boolean }) {
  const s = useRegelverkStatus(); const [vis, setVis] = useState(false);
  if (s === undefined) return null;
  if (!s) return kompakt ? null : <div className="note small" style={{ marginBottom: 16 }}>Overvåking av lover og forskrifter mot Lovdata er satt opp, men har ikke kjørt ennå.</div>;
  const E: Rec[] = s.endringer || [];
  if (kompakt) return E.length ? <div className="note" style={{ marginBottom: 12, borderColor: 'var(--amber)' }}><b>Regelverk endret:</b> {E.map(e => e.navn).join(', ')}. Tekstene i appen blir oppdatert i en programoppdatering. <a href="#/regelverk">Se detaljer</a></div> : null;
  return <div className="card" style={{ marginBottom: 16, borderLeft: `4px solid ${E.length ? 'var(--amber)' : 'var(--green)'}` }}>
    <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
      <b style={{ flex: 1 }}>{E.length ? `${E.length} endring${E.length > 1 ? 'er' : ''} i regelverk appen viser til` : '✓ Ingen endringer i lovene og forskriftene appen bygger på'}</b>
      <span className="small muted">Sist sjekket mot Lovdata {dato(s.sjekket)} · appen kontrollert {dato(s.kontrollertMot)} · {s.antallKilder} lover og forskrifter overvåkes</span></div>
    {E.length > 0 && <><ul style={{ margin: '8px 0', paddingLeft: 18 }}>{E.map((e, i) => <li key={i} className="small" style={{ marginBottom: 4 }}><b>{e.navn}</b> – {e.tekst}{e.lenke && <> · <a href={e.lenke} target="_blank" rel="noopener noreferrer">Lovdata ↗</a></>}</li>)}</ul>
      <p className="small muted" style={{ margin: 0 }}>Utvikleren er varslet. Tekster, sjekklister og hjelp i appen som bygger på disse reglene, oppdateres i en programoppdatering. Til da: les gjeldende tekst hos Lovdata før du bruker de berørte punktene.</p></>}
    <p style={{ margin: '8px 0 0' }}><a href="#" className="small" onClick={e => { e.preventDefault(); setVis(!vis); }}>{vis ? 'Skjul' : 'Vis'} overvåkede lover og forskrifter</a></p>
    {vis && <div className="tbl-wrap" style={{ marginTop: 6 }}><table><thead><tr><th>Lov / forskrift</th><th>Sist endret (Lovdata)</th></tr></thead><tbody>
      {(s.kilder || []).map((k: Rec, i: number) => <tr key={i}><td>{k.lenke ? <a href={k.lenke} target="_blank" rel="noopener noreferrer">{k.navn}</a> : k.navn}{k.finnes === false && <span className="small" style={{ color: 'var(--red)' }}> · ikke funnet</span>}</td><td className="small">{k.sistEndret || '–'}</td></tr>)}</tbody></table>
      <p className="small muted">Kilde: Lovdata, gjeldende lover og sentrale forskrifter (NLOD 2.0). Standarder (NS/NEK) og veiledere overvåkes ikke automatisk.</p></div>}
  </div>;
}
