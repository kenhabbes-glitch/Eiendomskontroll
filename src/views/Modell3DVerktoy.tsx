// Små paneler til 3D-visningen: kalibrering av plantegning mot modellen og sjekk av koblinger mot en ny modell.
import React from 'react';
import { tt } from '../lib/i18n';
import { useFileUrl } from '../components/ui';
import { PlanKart } from '../components/PlanKart';
import type { Rec } from '../lib/utils';

export const STEG = [
  () => tt("Trykk på et punkt på TEGNINGEN (f.eks. et bygningshjørne)"),
  () => tt("Trykk på samme punkt i 3D-MODELLEN (helst nede ved gulvet)"),
  () => tt("Trykk på punkt 2 på TEGNINGEN – langt fra punkt 1"),
  () => tt("Trykk på samme punkt 2 i 3D-MODELLEN"),
];

/** Plantegning ved siden av 3D-modellen: pek ut to punkter på tegningen, og de samme to i modellen. */
export function KalPanel({ tegninger, tid, setTid, steg, p, sp, setSp, onTap, nullstill, lagre, ferdig, mpp, fil }: { tegninger: Rec[]; tid: string; setTid: (s: string) => void; steg: number; p: [number, number][]; sp: boolean; setSp: (b: boolean) => void; onTap: (x: number, y: number) => void; nullstill: () => void; lagre: () => void; ferdig: boolean; mpp: number | null; fil?: string }) {
  const t = tegninger.find(x => x.id === tid); const url = useFileUrl(t?.fil?.path);
  const pkt = (px: number) => p.map((q, i) => <g key={i}><circle cx={q[0]} cy={q[1]} r={px * 9} fill="#1d4ed8" fillOpacity={.85} stroke="#fff" strokeWidth={px * 1.5} /><text x={q[0] + px * 12} y={q[1] - px * 10} fontSize={px * 16} fontWeight={700} fill="#1d4ed8" stroke="#fff" strokeWidth={px * 3} paintOrder="stroke">{i + 1}</text></g>);
  return <div className="card">
    <div className="toolbar" style={{ marginBottom: 6 }}><h2 style={{ margin: 0, flex: 1 }}>{tt("Koble en plantegning til modellen")}</h2>
      <select value={tid} onChange={e => { setTid(e.target.value); nullstill(); }}>{tegninger.map(x => <option key={x.id} value={x.id}>{x.navn}</option>)}</select></div>
    <p className="small muted" style={{ marginTop: 0 }}>{tt("Gjør dette én gang per etasjetegning. Etterpå vises alle systemer, komponenter og avvik du har plassert på tegningen som markører i 3D-modellen. Ved ny IFC-modell eller ny tegning trenger du bare å kalibrere på nytt.")}</p>
    {!ferdig ? <p style={{ margin: '0 0 6px' }}><b>{tt("Punkt {0} av 2:", Math.floor(steg / 2) + 1)} {STEG[Math.min(steg, 3)]()}</b></p>
      : <p style={{ margin: '0 0 6px' }}><b>{tt("Ferdig.")}</b> {mpp != null && <span className="small muted">{tt("Tegningen får {0} cm per piksel i modellen.", (mpp * 100).toFixed(1))}</span>} {tt("Sjekk at markørene i modellen havner riktig før du lagrer.")}</p>}
    {t ? <PlanKart url={url} W={t.w || 1000} H={t.h || 800} h={300} onTap={(x, y) => { if (steg % 2 === 0 && !ferdig) onTap(x, y); }}>{pkt}</PlanKart> : <p className="small muted">{tt("Ingen tegninger er lastet opp på eiendommen.")}</p>}
    <div className="toolbar" style={{ marginTop: 8 }}>
      <label className="small" style={{ display: 'flex', gap: 5, alignItems: 'center' }}><input type="checkbox" checked={sp} onChange={e => setSp(e.target.checked)} />{tt("Speilvend (hvis markørene havner speilvendt)")}</label>
      <span className="grow" /><button className="btn sm ghost" onClick={nullstill}>{tt("Start på nytt")}</button><button className="btn sm pri" disabled={!ferdig} onClick={lagre}>{tt("Lagre kalibrering")}</button></div>
    {fil}
  </div>;
}

export type Rad = { anleggId: string; navn: string; guid: string; beskr: string; forslag: { i: number; tekst: string; grunn: string }[] };

/** Koblinger som ikke finner sitt objekt i denne modellen, med forslag til nytt objekt. */
export function SjekkPanel({ rader, onBruk, onFjern, onLukk, ed }: { rader: Rad[]; onBruk: (r: Rad, i: number) => void; onFjern: (r: Rad) => void; onLukk: () => void; ed: boolean }) {
  return <div className="card">
    <div className="toolbar" style={{ marginBottom: 6 }}><h2 style={{ margin: 0, flex: 1 }}>{tt("Koblinger som ikke passer med modellen")}</h2><button className="btn sm ghost" onClick={onLukk}>✕</button></div>
    <p className="small muted" style={{ marginTop: 0 }}>{tt("Disse systemene er koblet til bygningsdeler som ikke finnes med samme ID i denne modellen. Det skjer ofte når arkitekten eksporterer ny IFC. Velg riktig objekt, så flyttes koblingen – kontroller, avvik og historikk beholdes.")}</p>
    {rader.length ? <div className="tbl-wrap"><table><thead><tr><th>{tt("System")}</th><th>{tt("Var koblet til")}</th><th>{tt("Forslag")}</th></tr></thead><tbody>{rader.map(r => <tr key={r.anleggId + r.guid}>
      <td><b>{r.navn}</b></td><td className="small">{r.beskr}</td>
      <td>{r.forslag.length ? r.forslag.map(f => <div key={f.i} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '2px 0', flexWrap: 'wrap' }}><span className="small">{f.tekst} <span className="muted">({f.grunn})</span></span>{ed && <button className="btn sm" onClick={() => onBruk(r, f.i)}>{tt("Bruk")}</button>}</div>) : <span className="small muted">{tt("Ingen forslag – koble på nytt ved å klikke på riktig del i modellen.")}</span>}
        {ed && <button className="btn sm ghost" onClick={() => onFjern(r)}>{tt("Fjern kobling")}</button>}</td></tr>)}</tbody></table></div> : <p className="small">{tt("Alle koblinger er i orden.")}</p>}
  </div>;
}
