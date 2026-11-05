// Kontrollrunde for vaktmester: alt som forfaller, gruppert etter sted og i gangrekkefølge. Liste (standard på mobil) eller tegning.
import React, { useEffect, useRef, useState } from 'react';
import { Hjelp } from '../components/Hjelp';
import { S, save, state, toast, useStore, kanDrifteE } from '../lib/store';
import { byId, fd, today, sortBy, eNavn, kNavn, type Rec } from '../lib/utils';
import { Chip, Empty, confirmBox, useFileUrl } from '../components/ui';
import { editAvvik, registrerOk, utfor } from '../lib/actions';
import { lagSteder, rundePunkter, type RItem, type Sted } from '../lib/runde';
import { kompOk, sjekkEnKomp, rundeKomp } from './KomponentRunde';
import { enhet, fmt, grenseTekst, maalerStatus, tall, vurderVerdi } from '../lib/maaler';
import { useFilter } from './common';

const FARGE = { forfalt: '#b42318', idag: '#9a5b00', snart: '#2457a6', ok: '#1d7a3e' } as const;
const stedStatus = (s: Sted) => s.items.some(i => i.status === 'forfalt') ? 'forfalt' : s.items.some(i => i.status === 'idag') ? 'idag' : s.items.some(i => i.status === 'snart') ? 'snart' : 'ok';

function StatusMerke({ i }: { i: RItem }) {
  if (i.status === 'ok') return <Chip c="green">✓ Gjort</Chip>;
  if (i.status === 'forfalt') return <Chip c="red">Forfalt{i.frist ? ' ' + fd(i.frist) : ''}</Chip>;
  if (i.status === 'idag') return <Chip c="amber">I dag</Chip>;
  return <Chip c="blue" title="Forfaller snart – kan tas nå når du likevel er her">Kan tas nå · {fd(i.frist)}</Chip>;
}

function MaalerInput({ k }: { k: Rec }) {
  const [v, setV] = useState(''); const [busy, setBusy] = useState(false);
  const n = tall(v); const w = n != null ? vurderVerdi(k, n, today(), null) : [];
  const lagre = async () => {
    if (n == null) return toast('Skriv inn verdi');
    if (w.length && k.mType === 'forbruk' && !(await confirmBox(`${w.join(' ')} Lagre likevel?`, 'Lagre'))) return;
    setBusy(true);
    try { await save('avlesninger', { eiendomId: k.eiendomId, komponentId: k.id, dato: today(), verdi: n, t: new Date().toISOString(), av: state.me?.navn || state.me?.epost || '', kilde: 'kontrollrunde' });
      if (k.mType === 'tilstand' && w.length && await confirmBox(`${kNavn(k.id)}: ${fmt(n)} ${enhet(k)} er utenfor grensen (${grenseTekst(k)}). Registrere avvik?`, 'Registrer avvik'))
        editAvvik(undefined, { eiendomId: k.eiendomId, anleggId: k.anleggId, komponentId: k.id, tittel: `${kNavn(k.id)}: ${fmt(n)} ${enhet(k)} – utenfor grense (${grenseTekst(k)})`, alv: 'Høy', kilde: 'Egenkontroll', pos: k.pos?.tegningId ? k.pos : null, plassering: k.plassering || '' }); }
    catch (e: any) { toast(e?.message || 'Kunne ikke lagre'); }
    setBusy(false);
  };
  const s = maalerStatus(k).siste;
  return <div className="rk-maal"><span className="small muted">Forrige {s ? `${fmt(tall(s.verdi))} ${enhet(k)}` : '–'}{grenseTekst(k) ? ` · ${grenseTekst(k)}` : ''}</span>
    <span style={{ display: 'flex', gap: 6 }}><input inputMode="decimal" value={v} onChange={e => setV(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') lagre(); }} placeholder={enhet(k)} style={{ borderColor: w.length ? 'var(--amber)' : undefined }} />
      <button className="btn pri sm" disabled={busy} onClick={lagre}>Lagre</button></span>
    {w.map(x => <span key={x} className="small" style={{ color: 'var(--amber)' }}>⚠ {x}</span>)}</div>;
}

function Rad({ i }: { i: RItem }) {
  const gjort = i.status === 'ok';
  return <div className={'rk-rad' + (gjort ? ' gjort' : '')}>
    <div className="rk-tekst"><b>{i.navn}</b>{i.under && <span className="small muted">{i.type === 'komp' ? 'Sjekkliste: ' : ''}{i.under}</span>}<StatusMerke i={i} /></div>
    {!gjort && <div className="rk-knapper">
      {i.type === 'kontroll' && <><button className="btn sm" onClick={() => utfor(i.o!.id)}>Utfør …</button><button className="btn pri sm" onClick={async () => { await registrerOk(i.o!.id); toast(`${i.navn}: OK`); }}>✓ OK</button></>}
      {i.type === 'komp' && <><button className="btn sm" onClick={() => sjekkEnKomp(i.o!.id, i.k!.id)}>Sjekkliste …</button><button className="btn pri sm" onClick={async () => { await kompOk(i.o!.id, i.k!.id); toast(`${i.navn}: OK`); }}>✓ OK</button></>}
      {i.type === 'avvik' && <button className="btn sm" onClick={() => editAvvik(i.a!.id)}>Åpne avvik</button>}
    </div>}
    {!gjort && i.type === 'maaler' && <MaalerInput k={i.k!} />}
  </div>;
}

function StedKort({ s, aktiv }: { s: Sted; aktiv?: boolean }) {
  const kan = s.items.filter(i => i.status !== 'ok' && (i.type === 'kontroll' || i.type === 'komp'));
  const gjort = s.items.filter(i => i.status === 'ok').length;
  const altOk = async () => {
    const harM = s.items.some(i => i.status !== 'ok' && i.type === 'maaler');
    if (!(await confirmBox(`Kvitter ut ${kan.length} kontroll${kan.length === 1 ? '' : 'er'} på «${s.navn}» som OK uten avvik?${harM ? ' Måleravlesninger må skrives inn hver for seg.' : ''}`, 'Kvitter ut'))) return;
    for (const i of kan) { if (i.type === 'kontroll') await registrerOk(i.o!.id); else await kompOk(i.o!.id, i.k!.id); }
    toast(`${kan.length} punkter kvittert ut på ${s.navn}`);
  };
  const T = s.tegningId ? byId('tegninger', s.tegningId) : null;
  return <div className={'card rk-sted' + (aktiv ? ' aktiv' : '')} id={'sted-' + s.key}>
    <div className="rk-hode"><span className="rk-nr" style={{ background: FARGE[stedStatus(s)] }}>{s.nr}</span>
      <div style={{ flex: 1, minWidth: 0 }}><b>{s.navn}</b><div className="small muted">{s.items.length} punkter{gjort ? ` · ${gjort} gjort` : ''}</div></div></div>
    <div className="rk-handling">
      {kan.length > 0 && <button className="btn pri" onClick={altOk}>✓ Alt OK her ({kan.length})</button>}
      {kanDrifteE(s.items[0]?.o?.eiendomId || s.items[0]?.k?.eiendomId || s.items[0]?.a?.eiendomId) && <button className="btn" onClick={() => editAvvik(undefined, { eiendomId: T?.eiendomId || s.items[0]?.o?.eiendomId || s.items[0]?.k?.eiendomId, kilde: 'Egenkontroll', plassering: s.navn, pos: T ? { tegningId: T.id, x: Math.round(s.x), y: Math.round(s.y) } : null })}>+ Avvik her</button>}
    </div>
    {s.items.map(i => <Rad key={i.key} i={i} />)}
  </div>;
}

/** Tegning med ett nummerert punkt per sted. Én finger flytter, to fingre zoomer, trykk åpner stedet. */
function RundeKart({ T, steder, valgt, velg }: { T: Rec; steder: Sted[]; valgt: string; velg: (k: string) => void }) {
  const src = useFileUrl(T.fil?.path); const svg = useRef<SVGSVGElement>(null);
  const init = () => { const L = steder; if (!L.length) return { x: 0, y: 0, w: T.w || 1000, h: T.h || 800 };
    const xs = L.map(s => s.x), ys = L.map(s => s.y); const pad = 0.12 * Math.max(T.w || 1000, T.h || 800);
    const x0 = Math.max(0, Math.min(...xs) - pad), x1 = Math.min(T.w || 1000, Math.max(...xs) + pad), y0 = Math.max(0, Math.min(...ys) - pad), y1 = Math.min(T.h || 800, Math.max(...ys) + pad);
    return { x: x0, y: y0, w: Math.max(x1 - x0, (T.w || 1000) / 4), h: Math.max(y1 - y0, (T.h || 800) / 4) }; };
  const [vb, setVb] = useState(init); useEffect(() => setVb(init()), [T.id]);
  const P = useRef(new Map<number, { x: number; y: number }>()); const G = useRef<any>(null);
  const k = () => { const r = svg.current?.getBoundingClientRect(); return r ? Math.max(vb.w / (r.width || 1), vb.h / (r.height || 1)) : 1; };
  const tilSvg = (cx: number, cy: number) => { const s = svg.current!; const p = s.createSVGPoint(); p.x = cx; p.y = cy; const q = p.matrixTransform(s.getScreenCTM()!.inverse()); return { x: q.x, y: q.y }; };
  const ned = (e: React.PointerEvent) => {
    svg.current!.setPointerCapture(e.pointerId); P.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const L = [...P.current.values()];
    if (L.length === 1) G.current = { t: 'pan', s: L[0], vb0: vb, moved: false, sted: (e.target as Element).closest?.('[data-sted]')?.getAttribute('data-sted') || '' };
    else if (L.length === 2) { const c = { x: (L[0].x + L[1].x) / 2, y: (L[0].y + L[1].y) / 2 }; G.current = { t: 'pinch', d0: Math.hypot(L[0].x - L[1].x, L[0].y - L[1].y), vb0: vb, c0: tilSvg(c.x, c.y), cs: c, moved: true }; }
  };
  const flytt = (e: React.PointerEvent) => {
    if (!P.current.has(e.pointerId) || !G.current) return; P.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); const g = G.current; const L = [...P.current.values()];
    const r = svg.current!.getBoundingClientRect();
    if (g.t === 'pan' && L.length === 1) { const dx = L[0].x - g.s.x, dy = L[0].y - g.s.y; if (Math.abs(dx) + Math.abs(dy) > 6) g.moved = true; if (!g.moved) return;
      const kk = Math.max(g.vb0.w / r.width, g.vb0.h / r.height); setVb({ ...g.vb0, x: g.vb0.x - dx * kk, y: g.vb0.y - dy * kk }); }
    if (g.t === 'pinch' && L.length === 2) { const d = Math.hypot(L[0].x - L[1].x, L[0].y - L[1].y); const f = Math.min(8, Math.max(.12, g.d0 / (d || 1)));
      const w = Math.min((T.w || 1000) * 2, Math.max((T.w || 1000) / 40, g.vb0.w * f)); const ff = w / g.vb0.w; const c = { x: (L[0].x + L[1].x) / 2, y: (L[0].y + L[1].y) / 2 };
      const kk = Math.max(w / r.width, g.vb0.h * ff / r.height);
      setVb({ w, h: g.vb0.h * ff, x: g.c0.x - (g.c0.x - g.vb0.x) * ff - (c.x - g.cs.x) * kk, y: g.c0.y - (g.c0.y - g.vb0.y) * ff - (c.y - g.cs.y) * kk }); }
  };
  const opp = (e: React.PointerEvent) => { const g = G.current; P.current.delete(e.pointerId); if (g?.t === 'pan' && !g.moved && g.sted) velg(g.sted); if (!P.current.size) G.current = null; else if (g?.t === 'pinch') G.current = null; };
  useEffect(() => { const s = svg.current!; const h = (e: WheelEvent) => { e.preventDefault(); const p = tilSvg(e.clientX, e.clientY); const f = e.deltaY > 0 ? 1.15 : 1 / 1.15;
    setVb(v => { const w = v.w * f; if (w < (T.w || 1000) / 40 || w > (T.w || 1000) * 2) return v; return { x: p.x - (p.x - v.x) * f, y: p.y - (p.y - v.y) * f, w, h: v.h * f }; }); };
    s.addEventListener('wheel', h, { passive: false }); return () => s.removeEventListener('wheel', h); }, [T.id]);
  const kk = k(); const R = 15 * kk;
  return <div className="rk-kart">
    <svg ref={svg} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} onPointerDown={ned} onPointerMove={flytt} onPointerUp={opp} onPointerCancel={opp} style={{ touchAction: 'none' }}>
      {src && <image href={src} x={0} y={0} width={T.w} height={T.h} />}
      {steder.map(s => { const c = FARGE[stedStatus(s)]; const on = s.key === valgt; return <g key={s.key} data-sted={s.key} style={{ cursor: 'pointer' }}>
        <circle cx={s.x} cy={s.y} r={R * 1.9} fill="transparent" />
        <circle cx={s.x} cy={s.y} r={on ? R * 1.25 : R} fill={c} stroke="#fff" strokeWidth={3 * kk} />
        <text x={s.x} y={s.y + R * .36} textAnchor="middle" fontSize={R * 1.05} fontWeight={700} fill="#fff" pointerEvents="none">{s.nr}</text></g>; })}
    </svg>
    <div className="rk-kartknapper"><button className="btn sm" onClick={() => setVb(init())}>Tilpass</button></div>
  </div>;
}

export function Kontrollrunde() {
  useStore();
  const ES = sortBy(S.eiendommer.filter(e => kanDrifteE(e.id)), e => e.navn || '');
  const [f, setF] = useFilter('runde', { e: '', h: '14', vis: 'liste', alle: '', t: '' });
  const eid = ES.find(e => e.id === f.e)?.id || ES[0]?.id || '';
  const [valgt, setValgt] = useState('');
  if (!eid && (state.loading || !state.ready)) return <p className="muted">Laster …</p>;
  if (!eid) return <><div className="head"><div className="grow"><h1>Kontrollrunde</h1></div></div><div className="card"><Empty t="Ingen eiendommer">Du har ikke tilgang til å utføre kontroller på noen eiendom.</Empty></div></>;
  const punkter = rundePunkter(eid, +f.h || 14);
  const { steder, uten } = lagSteder(punkter, !!f.alle);
  const alle = [...steder, ...uten]; const it = alle.flatMap(s => s.items); const nGjort = it.filter(i => i.status === 'ok').length;
  const nForfalt = it.filter(i => i.status === 'forfalt').length;
  // Komponentvise kontroller som er påbegynt: kan fullføres
  const paabegynt = S.oppgaver.filter(o => o.eiendomId === eid && o.runde?.kp && Object.keys(o.runde.kp).length > 0 && o.aktiv !== false);
  const TT = sortBy(S.tegninger.filter(t => steder.some(s => s.tegningId === t.id)), t => +t.etasje || 0);
  const tid = TT.find(t => t.id === f.t)?.id || TT[0]?.id || '';
  const velg = (k: string) => { setValgt(k); setTimeout(() => document.getElementById('sted-' + k)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60); };
  const valgtSted = alle.find(s => s.key === valgt);
  return <>
    <div className="head"><div className="grow"><h1>Kontrollrunde<Hjelp id="side.runde" /></h1>
      <p className="sub">{alle.length ? <>{alle.length} steder · {it.length} punkter{nForfalt ? <> · <span style={{ color: 'var(--red)' }}>{nForfalt} forfalt</span></> : null} · {nGjort} gjort i dag</> : 'Ingenting å gjøre akkurat nå'}</p></div></div>
    <div className="toolbar rk-verktoy">
      {ES.length > 1 && <select value={eid} onChange={e => { setF({ e: e.target.value, t: '' }); setValgt(''); }}>{ES.map(e => <option key={e.id} value={e.id}>{e.navn}</option>)}</select>}
      <div className="seg"><button className={'btn sm' + (f.vis !== 'kart' ? ' pri' : '')} onClick={() => setF({ vis: 'liste' })}>Liste</button><button className={'btn sm' + (f.vis === 'kart' ? ' pri' : '')} onClick={() => setF({ vis: 'kart' })} disabled={!TT.length} title={TT.length ? '' : 'Ingen punkter er plassert på tegning'}>Tegning</button></div>
      <details className="rk-innst"><summary className="small">{+f.h ? `Tar med det som forfaller innen ${f.h} dager` : 'Bare forfalt og i dag'}{f.alle ? ' · alle steder' : ''}</summary>
        <select value={f.h} onChange={e => setF({ h: e.target.value })}>{['0', '7', '14', '30'].map(d => <option key={d} value={d}>{d === '0' ? 'Bare forfalt / i dag' : `Ta med det som forfaller innen ${d} dager`}</option>)}</select>
        <label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}><input type="checkbox" style={{ width: 'auto' }} checked={!!f.alle} onChange={e => setF({ alle: e.target.checked ? '1' : '' })} />Vis også steder der alt bare forfaller snart</label>
        <p className="small muted" style={{ margin: '4px 0 0' }}>Kontroller som forfaller snart tas med på steder der du uansett må innom, så du slipper en ekstra tur.</p></details>
    </div>
    {it.length > 0 && <div className="rk-fremdrift"><div style={{ width: (nGjort / it.length * 100) + '%' }} /></div>}
    {f.vis !== 'kart' && paabegynt.map(o => { const K = rundeKomp(o); const n = K.filter(k => o.runde.kp[k.id]).length;
      return <div key={o.id} className="note" style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '0 0 10px', color: 'var(--ink)' }}><span style={{ flex: 1 }}><b>{o.navn}</b>: {n} av {K.length} komponenter kontrollert</span><button className="btn sm pri" onClick={() => utfor(o.id)}>{n === K.length ? 'Fullfør kontrollen' : 'Fortsett / fullfør'}</button></div>; })}
    {!alle.length ? <div className="card"><Empty t="Alt er gjort">Ingen kontroller, avlesninger eller tildelte avvik forfaller{+f.h ? ` de neste ${f.h} dagene` : ''} på {eNavn(eid)}.</Empty></div>
      : f.vis === 'kart' && tid ? <>
        {TT.length > 1 && <div className="tabs">{TT.map(t => <a key={t.id} className={t.id === tid ? 'on' : ''} onClick={() => { setF({ t: t.id }); setValgt(''); }}>{t.navn} ({steder.filter(s => s.tegningId === t.id).length})</a>)}</div>}
        <RundeKart T={byId('tegninger', tid)!} steder={steder.filter(s => s.tegningId === tid)} valgt={valgt} velg={velg} />
        {valgtSted ? <div className="rk-ark"><button className="btn ghost sm rk-lukk" onClick={() => setValgt('')} aria-label="Lukk">✕</button><StedKort s={valgtSted} aktiv /></div>
          : <p className="small muted" style={{ textAlign: 'center' }}>Trykk på et nummer for å se hva som skal gjøres der. Én finger flytter tegningen, to fingre zoomer.</p>}
        {uten.length > 0 && <p className="small muted">{uten.reduce((s, x) => s + x.items.length, 0)} punkter er ikke plassert på tegning – se listen.</p>}
      </>
      : <>{alle.map((s, i) => <React.Fragment key={s.key}>
          {(i === 0 || alle[i - 1].tegningId !== s.tegningId) && <h3 className="rk-etasje">{s.tegningId ? byId('tegninger', s.tegningId)?.navn : 'Ikke plassert på tegning'}</h3>}
          <StedKort s={s} aktiv={s.key === valgt} /></React.Fragment>)}</>}
  </>;
}
