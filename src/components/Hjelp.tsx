import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HJELP, hjelpFor, type HjelpEmne } from '../lib/hjelpTekster';
import { tt } from '../lib/i18n';

// Viser tekst med avsnitt (tom linje) og punkter («- »)
export function HjelpTekst({ tekst }: { tekst: string }) {
  return <>{tekst.split(/\n\s*\n/).map((blokk, i) => {
    const linjer = blokk.split('\n').map(l => l.trim()).filter(Boolean);
    const pkt = linjer.filter(l => l.startsWith('- ')); const vanlig = linjer.filter(l => !l.startsWith('- '));
    return <React.Fragment key={i}>{vanlig.length > 0 && <p style={{ margin: '0 0 8px' }}>{vanlig.join(' ')}</p>}
      {pkt.length > 0 && <ul style={{ margin: '0 0 8px', paddingLeft: 18 }}>{pkt.map((l, j) => <li key={j} style={{ marginBottom: 3 }}>{l.slice(2)}</li>)}</ul>}</React.Fragment>;
  })}</>;
}

// «?» i sirkel. Bruk id (fra HJELP) eller egen tittel/tekst.
export function Hjelp({ id, tittel, tekst, size = 16, kilde }: { id?: string; tittel?: string; tekst?: string; size?: number; kilde?: [string, string][] }) {
  const emne: HjelpEmne | undefined = tekst ? { tittel: tittel || 'Hjelp', tekst, gruppe: 'Begreper' } : hjelpFor(id);
  const [apen, setApen] = useState(false); const [iModal, setIModal] = useState(false); const [pos, setPos] = useState({ x: 0, y: 0, opp: false });
  const knapp = useRef<HTMLButtonElement>(null); const boks = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!apen) return;
    const lukk = (e: Event) => { if (e.type === 'keydown' && (e as KeyboardEvent).key !== 'Escape') return; if (e.type === 'mousedown' && (boks.current?.contains(e.target as Node) || knapp.current?.contains(e.target as Node))) return; if (e.type === 'keydown') e.stopPropagation(); setApen(false); };
    const flytt = () => setApen(false);
    document.addEventListener('mousedown', lukk, true); document.addEventListener('keydown', lukk, true); window.addEventListener('resize', flytt);
    return () => { document.removeEventListener('mousedown', lukk, true); document.removeEventListener('keydown', lukk, true); window.removeEventListener('resize', flytt); };
  }, [apen]);
  if (!emne) return null;
  const vis = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    const r = knapp.current!.getBoundingClientRect(); const W = 340;
    const x = Math.max(8, Math.min(r.left + r.width / 2 - W / 2, window.innerWidth - W - 8));
    const opp = r.bottom > window.innerHeight * 0.6;
    setPos({ x, y: opp ? window.innerHeight - r.top + 6 : r.bottom + 6, opp }); setIModal(!!knapp.current!.closest('.ov, .modal')); setApen(a => !a);
  };
  return <>
    <button ref={knapp} type="button" className="hjelp-q" aria-label={tt("Hjelp: ") + emne.tittel} title={tt("Hjelp")} onClick={vis} onMouseDown={e => e.stopPropagation()}
      style={{ width: size, height: size, fontSize: size * 0.68 }}>?</button>
    {apen && createPortal(<div ref={boks} className="hjelp-pop" role="dialog" onClick={e => e.stopPropagation()}
      style={{ left: pos.x, ...(pos.opp ? { bottom: pos.y } : { top: pos.y }) }}>
      <div style={{ display: 'flex', alignItems: 'start', gap: 8, marginBottom: 6 }}><b style={{ flex: 1 }}>{emne.tittel}</b>
        <button type="button" className="hjelp-x" aria-label={tt("Lukk")} onClick={() => setApen(false)}>×</button></div>
      <HjelpTekst tekst={emne.tekst} />
      {kilde && kilde.length > 0 && <p className="small" style={{ margin: '0 0 6px' }}>{tt("Kilde:")} {kilde.map(([n, u], i) => <React.Fragment key={u}>{i ? ' · ' : ''}<a href={u} target="_blank" rel="noopener noreferrer">{n}</a></React.Fragment>)}</p>}
      {id && HJELP[id] && !iModal && <a href={'#/hjelp/' + encodeURIComponent(id)} className="small" onClick={() => setApen(false)}>{tt("Mer hjelp →")}</a>}
    </div>, document.body)}
  </>;
}
