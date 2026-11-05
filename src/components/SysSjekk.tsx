// Sjekkliste for kontroll av et helt system (ventilasjon, heis, sprinkler …). Brukes i utkvitteringen i appen og i lenken til servicefirmaet.
import React from 'react';
import type { SysSjekk, Svar } from '../lib/komponentsjekk';

export function SysSjekkVelger({ v, set, ro }: { v: SysSjekk; set: (s: SysSjekk) => void; ro?: boolean }) {
  const svar = v.svar || {}; const tekst = v.tekst || {};
  const n = v.punkter.filter(p => svar[p.id]).length; const nAv = v.punkter.filter(p => svar[p.id] === 'avvik').length;
  return <div className="note" style={{ color: 'var(--ink)', background: 'var(--surface)' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
      <b style={{ flex: 1 }}>Sjekkliste: {v.navn}</b>
      <span className="small muted">{n} av {v.punkter.length}{nAv ? ` · ${nAv} avvik` : ''}</span>
      {!ro && <button type="button" className="btn sm" onClick={() => set({ ...v, svar: Object.fromEntries(v.punkter.map(p => [p.id, svar[p.id] === 'ia' ? 'ia' : svar[p.id] === 'avvik' ? 'avvik' : 'ok'])) as Record<string, Svar> })}>✓ Resten OK</button>}
    </div>
    <div className="kr-punkter">{v.punkter.map((p, i) => <div key={p.id} className="kr-punkt">
      <div style={{ flex: 1 }}><span className="muted small">{i + 1}.</span> {p.t}
        {svar[p.id] === 'avvik' && <input className="kr-avtekst" disabled={ro} value={tekst[p.id] ?? p.t} onChange={e => set({ ...v, tekst: { ...tekst, [p.id]: e.target.value } })} placeholder="Beskriv avviket" />}</div>
      <div className="kr-valg">{([['ok', 'OK'], ['avvik', 'Avvik'], ['ia', 'I.R.']] as const).map(([k, l]) =>
        <button key={k} type="button" disabled={ro} title={k === 'ia' ? 'Ikke relevant' : l} className={'kr-v ' + k + (svar[p.id] === k ? ' on' : '')} onClick={() => set({ ...v, svar: { ...svar, [p.id]: k } })}>{l}</button>)}</div>
    </div>)}</div>
    {nAv > 0 && !ro && <p className="small muted" style={{ margin: '6px 0 0' }}>Hvert punkt med avvik blir registrert som eget avvik på systemet.</p>}
  </div>;
}

/** Kort visning i historikken */
export function SysSjekkKort({ s }: { s: SysSjekk }) {
  const [vis, setVis] = React.useState(false);
  const nOk = s.punkter.filter(p => s.svar[p.id] === 'ok').length; const nAv = s.punkter.filter(p => s.svar[p.id] === 'avvik').length; const nIa = s.punkter.filter(p => s.svar[p.id] === 'ia').length;
  return <div className="small"><span className="muted">Sjekkliste {s.navn}: {nOk} OK{nAv ? `, ${nAv} avvik` : ''}{nIa ? `, ${nIa} ikke relevant` : ''}</span> <a href="#" onClick={e => { e.preventDefault(); setVis(!vis); }}>{vis ? 'skjul' : 'vis'}</a>
    {vis && <ul style={{ margin: '4px 0', paddingLeft: 18 }}>{s.punkter.map(p => <li key={p.id}>{p.t}: <b style={{ fontWeight: 600, color: s.svar[p.id] === 'avvik' ? 'var(--amber)' : undefined }}>{({ ok: 'OK', avvik: 'Avvik', ia: 'Ikke relevant' } as any)[s.svar[p.id]] || '–'}</b>{s.svar[p.id] === 'avvik' && s.tekst?.[p.id] && s.tekst[p.id] !== p.t ? ` – ${s.tekst[p.id]}` : ''}</li>)}</ul>}
  </div>;
}
