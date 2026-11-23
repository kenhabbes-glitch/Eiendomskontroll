// «Slik henger appen sammen»: data til venstre, automatikk i midten (med brytere som er de samme som i Innstillinger), varsler og oppgaver til høyre.
import React, { useState } from 'react';
import { S, canEdit, isAdmin, saveInnst, state, toast, useStore } from '../lib/store';
import { AUTOMATIKK, erPa, slaPaData } from '../lib/anbefalt';
import { KART_AUTO, KART_DATA, KART_UT } from '../lib/systemkart';
import { today } from '../lib/utils';
import { tt } from '../lib/i18n';

const W = 1000, RAD = 56, TOPP = 56, BH = 40;
const yMid = (i: number, n: number, h: number) => TOPP + (h - TOPP - 20) * (n === 1 ? 0.5 : (i + 0.5) / n);
const kurve = (x1: number, y1: number, x2: number, y2: number) => { const d = (x2 - x1) * 0.5; return `M${x1},${y1} C${x1 + d},${y1} ${x2 - d},${y2} ${x2},${y2}`; };

export function Systemkart() {
  useStore(); const ro = !isAdmin() && state.me?.rolle !== 'forvalter'; const [hover, setHover] = useState(''); const [busy, setBusy] = useState('');
  const H = TOPP + KART_AUTO.length * RAD + 20;
  const innst = S.innst; const pa = (id: string) => { const p = AUTOMATIKK.find(x => x.id === id); return p ? erPa(p, innst) : true; };
  const bytt = async (id: string) => {
    const p = AUTOMATIKK.find(x => x.id === id); if (!p || ro || busy) return; setBusy(id);
    try { const eks = innst[p.nokkel]; await saveInnst(p.nokkel, pa(id) ? { ...(eks || {}), [p.flagg]: false } : slaPaData(p, eks, today())); toast(pa(id) ? tt("Slått av: {0}", tt(p.navn)) : tt("Slått på: {0}", tt(p.navn))); } catch { }
    setBusy('');
  };
  const dx = 20, dw = 200, ax = 360, aw = 280, ux = 790, uw = 190;
  const dataY = (id: string) => yMid(KART_DATA.findIndex(d => d.id === id), KART_DATA.length, H); const utY = (id: string) => yMid(KART_UT.findIndex(d => d.id === id), KART_UT.length, H);
  const autoY = (i: number) => TOPP + i * RAD + BH / 2 + 4;
  const kant = (a: typeof KART_AUTO[number], i: number) => { const paa = a.fast || pa(a.id); const lys = !hover || hover === a.id || a.fra.includes(hover) || a.til.includes(hover);
    return [...a.fra.map(f => ({ d: kurve(dx + dw, dataY(f), ax, autoY(i)), k: `${a.id}-${f}` })), ...a.til.map(t => ({ d: kurve(ax + aw, autoY(i), ux, utY(t)), k: `${a.id}>${t}` }))]
      .map(e => <path key={e.k} d={e.d} fill="none" stroke={paa ? 'var(--acc, #1f6f5c)' : 'var(--muted, #9aa39d)'} strokeWidth={paa ? 2 : 1.2} strokeDasharray={paa ? undefined : '4 4'} opacity={lys ? (paa ? 0.75 : 0.5) : 0.08} />); };
  const lysNode = (id: string) => !hover || hover === id || KART_AUTO.some(a => (a.id === hover && (a.fra.includes(id) || a.til.includes(id))) || (a.id === id && false) || (a.fra.includes(hover) && a.til.includes(id)) || (a.til.includes(hover) && a.fra.includes(id)));
  const gaa = (side: string) => { if (side) location.hash = '#/' + side; };
  return <div className="sec"><h2>{tt("Slik henger appen sammen")}</h2>
    <p className="small muted" style={{ marginTop: -4 }}>{tt("Til venstre ser du dataene i appen, i midten det som skjer automatisk, og til høyre hva du får ut. Bryterne er de samme som i Innstillinger. Hold musen over en boks for å se hva den henger sammen med. Alt hører til en eiendom, og hver eiendom hører til en organisasjon.")}</p>
    <div className="card" style={{ padding: 8, overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 760, display: 'block' }} role="img" aria-label={tt("Diagram over hvordan appens funksjoner henger sammen")}>
        <text x={dx} y={30} fontSize="13" fontWeight="600" fill="currentColor">{tt("Data i appen")}</text><text x={ax} y={30} fontSize="13" fontWeight="600" fill="currentColor">{tt("Automatikk")}</text><text x={ux} y={30} fontSize="13" fontWeight="600" fill="currentColor">{tt("Resultat")}</text>
        {KART_AUTO.map((a, i) => <g key={a.id}>{kant(a, i)}</g>)}
        {KART_DATA.map(d => <g key={d.id} style={{ cursor: 'pointer' }} opacity={lysNode(d.id) ? 1 : 0.25} onMouseEnter={() => setHover(d.id)} onMouseLeave={() => setHover('')} onClick={() => gaa(d.side)}>
          <rect x={dx} y={dataY(d.id) - 18} width={dw} height={36} rx={8} fill="var(--surface2, #f2f4f1)" stroke="var(--line, #d5dad4)" /><text x={dx + 12} y={dataY(d.id) + 5} fontSize="13" fill="currentColor">{tt(d.navn)}</text></g>)}
        {KART_UT.map(u => <g key={u.id} style={{ cursor: u.side ? 'pointer' : 'default' }} opacity={lysNode(u.id) ? 1 : 0.25} onMouseEnter={() => setHover(u.id)} onMouseLeave={() => setHover('')} onClick={() => gaa(u.side)}>
          <rect x={ux} y={utY(u.id) - 18} width={uw} height={36} rx={8} fill="var(--surface2, #f2f4f1)" stroke="var(--line, #d5dad4)" /><text x={ux + 12} y={utY(u.id) + 5} fontSize="13" fill="currentColor">{tt(u.navn)}</text></g>)}
        {KART_AUTO.map((a, i) => { const y = autoY(i); const paa = a.fast || pa(a.id); const lys = !hover || hover === a.id || a.fra.includes(hover) || a.til.includes(hover);
          return <g key={a.id} opacity={lys ? 1 : 0.25} onMouseEnter={() => setHover(a.id)} onMouseLeave={() => setHover('')}>
            <rect x={ax} y={y - BH / 2} width={aw} height={BH} rx={10} fill="var(--surface, #fff)" stroke={paa ? 'var(--acc, #1f6f5c)' : 'var(--line, #d5dad4)'} strokeWidth={paa ? 2 : 1} />
            <text x={ax + 12} y={y + 5} fontSize="13" fill="currentColor">{tt(a.navn)}</text>
            {a.fast ? <text x={ax + aw - 12} y={y + 4} fontSize="11" textAnchor="end" fill="var(--muted, #6b746e)">{tt("alltid på")}</text>
              : <g role="switch" aria-checked={paa} aria-label={tt(a.navn)} tabIndex={ro ? -1 : 0} style={{ cursor: ro ? 'default' : 'pointer' }} onClick={() => bytt(a.id)} onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); bytt(a.id); } }} opacity={busy === a.id ? 0.5 : 1}>
                <rect x={ax + aw - 52} y={y - 10} width={40} height={20} rx={10} fill={paa ? 'var(--acc, #1f6f5c)' : 'var(--line, #c9cfc8)'} /><circle cx={paa ? ax + aw - 22 : ax + aw - 42} cy={y} r={8} fill="#fff" /></g>}
          </g>; })}
      </svg>
    </div>
    <p className="small muted" style={{ marginBottom: 0 }}><span style={{ color: 'var(--acc, #1f6f5c)' }}>━━</span> {tt("på")} · <span>╌╌</span> {tt("av")}. {ro ? tt("Bare administrator eller forvalter kan endre bryterne.") : tt("Trykk på en bryter for å slå automatikken av eller på. Detaljer og «Kjør nå» finner du under Innstillinger.")} {canEdit() ? '' : ''}</p>
  </div>;
}
