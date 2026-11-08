// Status for regelverksovervåkingen: hentes fra /regelverk-status.json, som oppdateres ukentlig av regelverkssjekken mot Lovdata.
import React, { useEffect, useState } from 'react';
import { fd, type Rec } from '../lib/utils';
import { tt } from '../lib/i18n';
import { KILDER_MX } from '../lib/land/mx';

const cache: Record<string, Rec | null | undefined> = {};
export function useRegelverkStatus(land = 'NO') {
  const [s, setS] = useState<Rec | null | undefined>(cache[land]);
  useEffect(() => { if (cache[land] !== undefined) { setS(cache[land]); return; } setS(undefined); fetch(land === 'MX' ? '/regelverk-status-mx.json' : '/regelverk-status.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null).then(x => { cache[land] = x; setS(x); }); }, [land]);
  return s;
}
const dato = (t?: string) => t ? fd(String(t).slice(0, 10)) : '–';

export function RegelverkStatus({ kompakt, land = 'NO' }: { kompakt?: boolean; land?: string }) {
  const s = useRegelverkStatus(land); const [vis, setVis] = useState(false);
  if (s === undefined) return null;
  if (land === 'MX') return <StatusMX s={s} kompakt={kompakt} />;
  if (!s) return kompakt ? null : <div className="note small" style={{ marginBottom: 16 }}>{tt("Overvåking av lover og forskrifter mot Lovdata er satt opp, men har ikke kjørt ennå.")}</div>;
  const E: Rec[] = s.endringer || [];
  if (kompakt) return E.length ? <div className="note" style={{ marginBottom: 12, borderColor: 'var(--amber)' }}><b>{tt("Regelverk endret:")}</b> {E.map(e => e.navn).join(', ')}{tt(". Tekstene i appen blir oppdatert i en programoppdatering.")} <a href="#/regelverk">{tt("Se detaljer")}</a></div> : null;
  return <div className="card" style={{ marginBottom: 16, borderLeft: `4px solid ${E.length ? 'var(--amber)' : 'var(--green)'}` }}>
    <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
      <b style={{ flex: 1 }}>{E.length ? tt("{0} endring{1} i regelverk appen viser til", E.length, E.length > 1 ? 'er' : '') : tt("✓ Ingen endringer i lovene og forskriftene appen bygger på")}</b>
      <span className="small muted">{tt("Sist sjekket mot Lovdata")} {dato(s.sjekket)} {tt("· appen kontrollert")} {dato(s.kontrollertMot)} · {s.antallKilder} {tt("lover og forskrifter overvåkes")}</span></div>
    {E.length > 0 && <><ul style={{ margin: '8px 0', paddingLeft: 18 }}>{E.map((e, i) => <li key={i} className="small" style={{ marginBottom: 4 }}><b>{e.navn}</b> – {e.tekst}{e.lenke && <> · <a href={e.lenke} target="_blank" rel="noopener noreferrer">{tt("Lovdata ↗")}</a></>}</li>)}</ul>
      <p className="small muted" style={{ margin: 0 }}>{tt("Utvikleren er varslet. Tekster, sjekklister og hjelp i appen som bygger på disse reglene, oppdateres i en programoppdatering. Til da: les gjeldende tekst hos Lovdata før du bruker de berørte punktene.")}</p></>}
    <p style={{ margin: '8px 0 0' }}><a href="#" className="small" onClick={e => { e.preventDefault(); setVis(!vis); }}>{vis ? tt("Skjul") : tt("Vis")} {tt("overvåkede lover og forskrifter")}</a></p>
    {vis && <div className="tbl-wrap" style={{ marginTop: 6 }}><table><thead><tr><th>{tt("Lov / forskrift")}</th><th>{tt("Sist endret (Lovdata)")}</th></tr></thead><tbody>
      {(s.kilder || []).map((k: Rec, i: number) => <tr key={i}><td>{k.lenke ? <a href={k.lenke} target="_blank" rel="noopener noreferrer">{k.navn}</a> : k.navn}{k.finnes === false && <span className="small" style={{ color: 'var(--red)' }}> {tt("· ikke funnet")}</span>}</td><td className="small">{k.sistEndret || '–'}</td></tr>)}</tbody></table>
      <p className="small muted">{tt("Kilde: Lovdata, gjeldende lover og sentrale forskrifter (NLOD 2.0). Standarder (NS/NEK) og veiledere overvåkes ikke automatisk.")}</p></div>}
  </div>;
}

// Mexico: føderale normer sjekkes automatisk mot Secretaría de Economía (platiica) og lovene mot Cámara de Diputados.
// Delstatsregler (CDMX) publiseres i Gaceta Oficial uten maskinlesbar endringsdato og står som «manuell kontroll».
function StatusMX({ s, kompakt }: { s: Rec | null; kompakt?: boolean }) {
  const [vis, setVis] = useState(false); const K: Rec[] = s?.kilder || KILDER_MX.map(k => ({ ...k, status: 'ikke sjekket' })); const E: Rec[] = s?.endringer || [];
  if (kompakt) return E.length ? <div className="note" style={{ marginBottom: 12, borderColor: 'var(--amber)' }}><b>{tt("Regelverk endret (Mexico):")}</b> {E.map(e => e.navn).join(', ')} <a href="#/regelverk">{tt("Se detaljer")}</a></div> : null;
  const man = K.filter(k => k.niva === 'CDMX');
  return <div className="card" style={{ marginBottom: 16, borderLeft: `4px solid ${!s ? 'var(--line)' : E.length ? 'var(--amber)' : 'var(--green)'}` }}>
    <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
      <b style={{ flex: 1 }}>{!s ? tt("Overvåking av meksikanske normer og lover er satt opp, men har ikke kjørt ennå.") : E.length ? tt("{0} endring(er) i meksikansk regelverk appen viser til", E.length) : tt("✓ Ingen endringer i føderale normer og lover appen bygger på")}</b>
      {s && <span className="small muted">{tt("Sist sjekket")} {dato(s.sjekket)} · {K.length} {tt("kilder")}</span>}</div>
    {E.length > 0 && <ul style={{ margin: '8px 0', paddingLeft: 18 }}>{E.map((e, i) => <li key={i} className="small" style={{ marginBottom: 4 }}><b>{e.navn}</b> – {e.tekst}{e.lenke && <> · <a href={e.lenke} target="_blank" rel="noopener noreferrer">{tt("Kilde ↗")}</a></>}</li>)}</ul>}
    {man.length > 0 && <p className="small muted" style={{ margin: '6px 0 0' }}>{tt("Regler for Ciudad de México kontrolleres manuelt mot Gaceta Oficial:")} {man.map(k => k.navn).join('; ')}.</p>}
    <p style={{ margin: '8px 0 0' }}><a href="#" className="small" onClick={e => { e.preventDefault(); setVis(!vis); }}>{vis ? tt("Skjul") : tt("Vis")} {tt("overvåkede normer og lover")}</a></p>
    {vis && <div className="tbl-wrap" style={{ marginTop: 6 }}><table><thead><tr><th>{tt("Norm / lov")}</th><th>{tt("Status")}</th><th>{tt("Sist endret")}</th></tr></thead><tbody>
      {K.map((k, i) => <tr key={i}><td><a href={k.lenke} target="_blank" rel="noopener noreferrer">{k.navn}</a></td><td className="small">{k.niva === 'CDMX' ? tt("manuell kontroll") : k.status || '–'}</td><td className="small">{k.sistEndret || '–'}</td></tr>)}</tbody></table>
      <p className="small muted">{tt("Kilder: Secretaría de Economía (Estado de la Norma), Cámara de Diputados (Leyes Federales Vigentes), Gaceta Oficial de la Ciudad de México.")}</p></div>}
  </div>;
}
