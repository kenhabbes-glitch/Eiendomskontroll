// Tegningsverktøy for befaring: avviksmarkører, måling, areal, frihånd, pil og tekst på etasjeplanen.
// Koordinater lagres i tegningens eget koordinatsystem (t.w/t.h), likt med «Tegninger og arealer».
// Tegningen hentes fra enheten om den er lagret der (arbeid uten nett).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { S, fileUrl } from '../lib/store';
import { byId, mpp, polyArea, sortBy, type Rec } from '../lib/utils';
import { tegningUrl } from '../lib/offline';
import type { Funn, Shape } from '../lib/befaring';

type Verktoy = 'flytt' | 'avvik' | 'maal' | 'areal' | 'fri' | 'pil' | 'tekst' | 'kalibrer' | 'slett';
const VERKTOY: [Verktoy, string, string][] = [['flytt', '✋', 'Flytt / zoom'], ['avvik', '⚠', 'Nytt funn'], ['maal', '↔', 'Mål avstand'], ['areal', '▱', 'Mål areal'], ['fri', '✎', 'Tegn'], ['pil', '➚', 'Pil'], ['tekst', 'T', 'Tekst'], ['slett', '⌫', 'Slett tegning']];
const FARGER = ['#b42318', '#1f6f5c', '#2457a6', '#b07a00', '#1d2521'];
export type Skala = { a: number[]; b: number[]; m: number };
const fmtM = (v: number) => v.toLocaleString('nb-NO', { maximumFractionDigits: v < 10 ? 2 : 1 }) + ' m';
const fmtM2 = (v: number) => v.toLocaleString('nb-NO', { maximumFractionDigits: 1 }) + ' m²';

export function useTegningUrl(t?: Rec) {
  const [u, setU] = useState('');
  useEffect(() => { let on = true; setU(''); if (t?.fil?.path) tegningUrl(t.fil.path, () => fileUrl(t.fil.path)).then(x => on && setU(x)); return () => { on = false; }; }, [t?.fil?.path]);
  return u;
}

export function BefTegning({ eiendomId, tegningId, setTegningId, shapes, setShapes, funn, nyttFunn, aapneFunn, skala, setSkala, ro, hoyde = 560 }: {
  eiendomId: string; tegningId: string; setTegningId: (id: string) => void; shapes: Shape[]; setShapes: (s: Shape[]) => void;
  funn: Funn[]; nyttFunn: (pos: { tegningId: string; x: number; y: number }) => void; aapneFunn: (id: string) => void;
  skala?: Skala | null; setSkala: (s: Skala | null) => void; ro?: boolean; hoyde?: number;
}) {
  const T = sortBy(S.tegninger.filter(x => x.eiendomId === eiendomId && x.fil?.path), (x: Rec) => +x.etasje || 0) as Rec[];
  const t = byId('tegninger', tegningId); const url = useTegningUrl(t);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => { setNat(null); if (!url || (t?.w && t?.h)) return; const im = new Image(); im.onload = () => setNat({ w: im.naturalWidth, h: im.naturalHeight }); im.src = url; }, [url]);
  const W = t?.w || nat?.w || 1000, H = t?.h || nat?.h || 800;
  const [vb, setVb] = useState({ x: 0, y: 0, w: W, h: H });
  useEffect(() => { setVb({ x: 0, y: 0, w: W, h: H }); }, [tegningId, W, H]);
  const [v, setV] = useState<Verktoy>(ro ? 'flytt' : 'avvik'); const [farge, setFarge] = useState(FARGER[0]);
  const [utkast, setUtkast] = useState<number[][]>([]); const [tekst, setTekst] = useState(''); const [lengde, setLengde] = useState('');
  const [hover, setHover] = useState<number[] | null>(null);
  const svg = useRef<SVGSVGElement>(null); const peker = useRef(new Map<number, { x: number; y: number }>()); const drag = useRef<{ x: number; y: number; vb: typeof vb; d0?: number } | null>(null);
  const r = skala ? (() => { const d = Math.hypot(skala.b[0] - skala.a[0], skala.b[1] - skala.a[1]); return d ? skala.m / d : null; })() : mpp(t);
  const S0 = Math.max(vb.w, vb.h); const sw = S0 / 450; const R = S0 / 70;

  const pkt = (e: { clientX: number; clientY: number }) => { const s = svg.current!; const p = s.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; const m = s.getScreenCTM(); if (!m) return [0, 0]; const q = p.matrixTransform(m.inverse()); return [Math.round(q.x * 10) / 10, Math.round(q.y * 10) / 10]; };
  const zoom = (f: number, c?: number[]) => setVb(z => { const cx = c ? c[0] : z.x + z.w / 2, cy = c ? c[1] : z.y + z.h / 2; const w = Math.min(W * 1.5, Math.max(W / 40, z.w * f)), h = w * z.h / z.w; return { x: cx - (cx - z.x) * w / z.w, y: cy - (cy - z.y) * h / z.h, w, h }; });
  useEffect(() => { const s = svg.current; if (!s) return; const f = (e: WheelEvent) => { e.preventDefault(); zoom(e.deltaY > 0 ? 1.18 : 1 / 1.18, pkt(e)); }; s.addEventListener('wheel', f, { passive: false }); return () => s.removeEventListener('wheel', f); });
  const legg = (sh: Omit<Shape, 'id'>) => setShapes([...shapes, { ...sh, id: crypto.randomUUID() }]);
  const ferdig = () => {
    if (v === 'areal' && utkast.length >= 3) legg({ t: 'areal', pts: utkast, farge });
    if (v === 'fri' && utkast.length >= 2) legg({ t: 'fri', pts: utkast, farge });
    setUtkast([]);
  };
  useEffect(() => { setUtkast([]); }, [v, tegningId]);

  const down = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId); peker.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (peker.current.size === 2) { const [a, b] = [...peker.current.values()]; drag.current = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, vb, d0: Math.hypot(a.x - b.x, a.y - b.y) }; setUtkast([]); return; }
    const p = pkt(e);
    if (v === 'flytt' || ro) { drag.current = { x: e.clientX, y: e.clientY, vb }; return; }
    if (v === 'fri') { setUtkast([p]); return; }
  };
  const move = (e: React.PointerEvent) => {
    if (peker.current.has(e.pointerId)) peker.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const s = svg.current; if (!s) return; const rc = s.getBoundingClientRect(); const k = vb.w / rc.width;
    if (peker.current.size === 2 && drag.current?.d0) { const [a, b] = [...peker.current.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); const f = drag.current.d0 / d; const z = drag.current.vb; const w = Math.min(W * 1.5, Math.max(W / 40, z.w * f)); const h = w * z.h / z.w;
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2; const c0 = [z.x + (drag.current.x - rc.left) * z.w / rc.width, z.y + (drag.current.y - rc.top) * z.h / rc.height];
      setVb({ x: c0[0] - (cx - rc.left) * w / rc.width, y: c0[1] - (cy - rc.top) * h / rc.height, w, h }); return; }
    if (drag.current && (v === 'flytt' || ro)) { const z = drag.current.vb; setVb({ ...z, x: z.x - (e.clientX - drag.current.x) * k, y: z.y - (e.clientY - drag.current.y) * k }); return; }
    if (v === 'fri' && utkast.length && peker.current.size === 1) { const p = pkt(e); const l = utkast[utkast.length - 1]; if (Math.hypot(p[0] - l[0], p[1] - l[1]) > sw * 2) setUtkast([...utkast, p]); return; }
    if (['maal', 'pil', 'areal', 'kalibrer'].includes(v) && utkast.length) setHover(pkt(e));
  };
  const up = (e: React.PointerEvent) => {
    const var2 = peker.current.size === 2; peker.current.delete(e.pointerId);
    if (var2 || drag.current?.d0) { if (!peker.current.size) drag.current = null; return; }
    if (drag.current) { const moved = Math.hypot(e.clientX - drag.current.x, e.clientY - drag.current.y) > 6; drag.current = null; if (moved || ro || v === 'flytt') return; }
    if (ro) return; const p = pkt(e);
    if (v === 'fri') { ferdig(); return; }
    if (v === 'avvik') { nyttFunn({ tegningId, x: p[0], y: p[1] }); return; }
    if (v === 'tekst') { if (!tekst.trim()) { setUtkast([p]); return; } legg({ t: 'tekst', pts: [p], tekst: tekst.trim(), farge }); setTekst(''); setUtkast([]); return; }
    if (v === 'maal' || v === 'pil' || v === 'kalibrer') { if (!utkast.length) { setUtkast([p]); return; }
      const pts = [utkast[0], p]; setHover(null);
      if (v === 'kalibrer') { setUtkast(pts); return; }
      legg({ t: v, pts, farge: v === 'maal' ? '#2457a6' : farge }); setUtkast([]); return; }
    if (v === 'areal') { if (utkast.length >= 3 && Math.hypot(p[0] - utkast[0][0], p[1] - utkast[0][1]) < R) { ferdig(); return; } setUtkast([...utkast, p]); return; }
  };
  const klikkShape = (id: string, e: React.PointerEvent) => { if (v !== 'slett' || ro) return; e.stopPropagation(); setShapes(shapes.filter(s => s.id !== id)); };

  const lengdeM = (pts: number[][]) => r ? Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]) * r : null;
  const tegnShape = (s: Shape, utk = false) => {
    const c = s.farge || '#b42318'; const ev = { onPointerDown: (e: React.PointerEvent) => klikkShape(s.id, e), style: { cursor: v === 'slett' ? 'pointer' : undefined, pointerEvents: (v === 'slett' ? 'all' : 'none') as any } };
    if (s.t === 'fri') return <polyline key={s.id} points={s.pts.map(p => p.join(',')).join(' ')} fill="none" stroke={c} strokeWidth={sw * 2} strokeLinecap="round" strokeLinejoin="round" {...ev} />;
    if (s.t === 'tekst') return <text key={s.id} x={s.pts[0][0]} y={s.pts[0][1]} fontSize={R * 1.3} fill={c} fontWeight={600} stroke="#fff" strokeWidth={sw * 2.2} paintOrder="stroke" {...ev}>{s.tekst}</text>;
    if (s.t === 'areal') { const a = r ? polyArea(s.pts) * r * r : null; const cx = s.pts.reduce((x, p) => x + p[0], 0) / s.pts.length, cy = s.pts.reduce((x, p) => x + p[1], 0) / s.pts.length;
      return <g key={s.id} {...ev}><polygon points={s.pts.map(p => p.join(',')).join(' ')} fill={c} fillOpacity={.12} stroke={c} strokeWidth={sw * 1.6} strokeDasharray={utk ? `${sw * 4} ${sw * 3}` : undefined} />
        {a !== null && !utk && <text x={cx} y={cy} fontSize={R * 1.1} textAnchor="middle" fill={c} fontWeight={700} stroke="#fff" strokeWidth={sw * 2} paintOrder="stroke">{fmtM2(a)}</text>}</g>; }
    const [a, b] = s.pts; const L = lengdeM(s.pts); const ang = Math.atan2(b[1] - a[1], b[0] - a[0]); const hd = R * .8;
    return <g key={s.id} {...ev}><line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={c} strokeWidth={sw * 1.8} strokeDasharray={s.t === 'kalibrer' as any ? `${sw * 4} ${sw * 3}` : undefined} />
      {s.t === 'pil' && <path d={`M${b[0]} ${b[1]} L${b[0] - hd * Math.cos(ang - .45)} ${b[1] - hd * Math.sin(ang - .45)} L${b[0] - hd * Math.cos(ang + .45)} ${b[1] - hd * Math.sin(ang + .45)} Z`} fill={c} />}
      {s.t === 'maal' && <>{[a, b].map((p, i) => <line key={i} x1={p[0] - hd * .5 * Math.sin(ang)} y1={p[1] + hd * .5 * Math.cos(ang)} x2={p[0] + hd * .5 * Math.sin(ang)} y2={p[1] - hd * .5 * Math.cos(ang)} stroke={c} strokeWidth={sw * 1.8} />)}
        <text x={(a[0] + b[0]) / 2} y={(a[1] + b[1]) / 2 - R * .4} fontSize={R * 1.05} textAnchor="middle" fill={c} fontWeight={700} stroke="#fff" strokeWidth={sw * 2} paintOrder="stroke">{L !== null ? fmtM(L) : 'mangler målestokk'}</text></>}</g>;
  };
  const egne = shapes || [];
  const fh = funn.filter(f => f.pos?.tegningId === tegningId);
  const nr = useMemo(() => new Map(funn.map((f, i) => [f.id, i + 1])), [funn]);
  const fFarge = (f: Funn) => f.art === 'system' ? '#2457a6' : f.art === 'merknad' ? '#6b736d' : f.art === 'tilpasning' ? '#b07a00' : f.art === 'energi' ? '#1f6f5c' : '#b42318';

  if (!T.length) return <div className="note small">Eiendommen har ingen etasjeplaner ennå. Last opp under «Tegninger og arealer» for å registrere funn på tegning. Funn kan registreres uten tegning.</div>;
  const utkastShape: Shape | null = utkast.length ? (v === 'areal' ? { id: '_u', t: 'areal', pts: hover ? [...utkast, hover] : utkast, farge } : v === 'fri' ? { id: '_u', t: 'fri', pts: utkast, farge } : (v === 'maal' || v === 'pil' || v === 'kalibrer') && (hover || utkast.length > 1) ? { id: '_u', t: v === 'kalibrer' ? 'maal' : v, pts: utkast.length > 1 ? utkast : [utkast[0], hover!], farge: v === 'maal' || v === 'kalibrer' ? '#2457a6' : farge } : null) : null;
  return <div className="bt">
    <div className="bt-bar">
      {T.length > 1 && <select value={tegningId} onChange={e => setTegningId(e.target.value)} className="bt-sel">{T.map(x => <option key={x.id} value={x.id}>{x.navn}{funn.some(f => f.pos?.tegningId === x.id) ? ' ●' : ''}</option>)}</select>}
      {!ro && VERKTOY.map(([k, ic, l]) => <button key={k} type="button" className={'btn sm' + (v === k ? ' pri' : '')} title={l} aria-label={l} onClick={() => setV(k)}><span aria-hidden>{ic}</span><span className="bt-l">{l}</span></button>)}
      {ro && <span className="small muted">Bare visning</span>}
      <span style={{ flex: 1 }} />
      {!ro && ['fri', 'pil', 'tekst', 'areal'].includes(v) && <span className="bt-farger">{FARGER.map(c => <button key={c} type="button" aria-label={'Farge ' + c} onClick={() => setFarge(c)} style={{ background: c, outline: farge === c ? '2px solid var(--ink)' : 'none' }} />)}</span>}
      <button type="button" className="btn sm" onClick={() => zoom(1 / 1.4)} aria-label="Zoom inn">＋</button><button type="button" className="btn sm" onClick={() => zoom(1.4)} aria-label="Zoom ut">－</button>
      <button type="button" className="btn sm ghost" onClick={() => setVb({ x: 0, y: 0, w: W, h: H })}>Hele</button>
      {!ro && egne.length > 0 && <button type="button" className="btn sm ghost" onClick={() => setShapes(egne.slice(0, -1))}>Angre</button>}
    </div>
    {!ro && <div className="bt-hint small">
      {v === 'avvik' && 'Trykk på tegningen der funnet er.'}
      {v === 'flytt' && 'Dra for å flytte. Zoom med to fingre, musehjul eller knappene.'}
      {v === 'maal' && (r ? 'Trykk på startpunkt og sluttpunkt.' : <>Tegningen mangler målestokk. <a href="#" onClick={e => { e.preventDefault(); setV('kalibrer'); }}>Sett målestokk</a> først.</>)}
      {v === 'areal' && (utkast.length >= 3 ? <>Trykk på første punkt eller <button type="button" className="btn sm" onClick={ferdig}>Ferdig</button> <button type="button" className="btn sm ghost" onClick={() => setUtkast([])}>Avbryt</button></> : r ? 'Trykk på hjørnene i arealet.' : 'Arealet tegnes, men m² vises først når målestokk er satt.')}
      {v === 'fri' && 'Tegn med fingeren eller musen.'}
      {v === 'pil' && 'Trykk på start og spiss.'}
      {v === 'slett' && 'Trykk på en tegning, et mål eller en tekst for å slette den. Funn slettes i listen.'}
      {v === 'tekst' && <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>Tekst: <input value={tekst} onChange={e => setTekst(e.target.value)} placeholder="Skriv, og trykk på tegningen" style={{ border: '1px solid var(--line2)', borderRadius: 7, padding: '4px 7px' }} />
        {utkast.length > 0 && tekst.trim() && <button type="button" className="btn sm pri" onClick={() => { legg({ t: 'tekst', pts: [utkast[0]], tekst: tekst.trim(), farge }); setTekst(''); setUtkast([]); }}>Sett inn</button>}</span>}
      {v === 'kalibrer' && (utkast.length < 2 ? 'Trykk på to punkter med kjent avstand (f.eks. en dør eller en målsatt vegg).' : <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>Avstand i meter: <input inputMode="decimal" value={lengde} onChange={e => setLengde(e.target.value)} style={{ width: 90, border: '1px solid var(--line2)', borderRadius: 7, padding: '4px 7px' }} autoFocus />
        <button type="button" className="btn sm pri" onClick={() => { const m = +lengde.replace(',', '.'); if (m > 0) { setSkala({ a: utkast[0], b: utkast[1], m }); setUtkast([]); setLengde(''); setV('maal'); } }}>Bruk målestokk</button>
        <button type="button" className="btn sm ghost" onClick={() => setUtkast([])}>Avbryt</button></span>)}
      {!['kalibrer'].includes(v) && <span className="muted"> {r ? `Målestokk ${skala ? 'satt i befaringen' : 'fra tegningen'}.` : ''} {!ro && <a href="#" onClick={e => { e.preventDefault(); setV('kalibrer'); }}>{r ? 'Juster målestokk' : 'Sett målestokk'}</a>}{skala && !ro && <> · <a href="#" onClick={e => { e.preventDefault(); setSkala(null); }}>bruk tegningens</a></>}</span>}
    </div>}
    <div className="bt-flate" style={{ height: `min(${hoyde}px, 68vh)` }}>
      {!url && <div className="muted small" style={{ padding: 30, textAlign: 'center' }}>Laster tegning …</div>}
      <svg ref={svg} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} preserveAspectRatio="xMidYMid meet" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={e => { peker.current.delete(e.pointerId); drag.current = null; }}
        style={{ width: '100%', height: '100%', touchAction: 'none', cursor: ro || v === 'flytt' ? 'grab' : 'crosshair', display: url ? 'block' : 'none' }}>
        {url && <image href={url} x={0} y={0} width={W} height={H} />}
        {egne.map(s => tegnShape(s))}
        {utkastShape && tegnShape(utkastShape, true)}
        {v === 'areal' && utkast.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={sw * 3} fill="#fff" stroke={farge} strokeWidth={sw} />)}
        {v === 'tekst' && utkast[0] && <circle cx={utkast[0][0]} cy={utkast[0][1]} r={sw * 3} fill={farge} />}
        {skala && <line x1={skala.a[0]} y1={skala.a[1]} x2={skala.b[0]} y2={skala.b[1]} stroke="#2457a6" strokeOpacity={.35} strokeWidth={sw} strokeDasharray={`${sw * 3} ${sw * 3}`} />}
        {fh.map(f => { const p = f.pos!; const c = fFarge(f); return <g key={f.id} style={{ cursor: 'pointer' }} onPointerDown={e => e.stopPropagation()} onPointerUp={e => { e.stopPropagation(); aapneFunn(f.id); }}>
          <circle cx={p.x} cy={p.y} r={R * 1.05} fill={c} stroke="#fff" strokeWidth={sw * 1.5} />
          <text x={p.x} y={p.y} dy=".35em" fontSize={R * 1.05} textAnchor="middle" fill="#fff" fontWeight={700} style={{ pointerEvents: 'none' }}>{nr.get(f.id)}</text><title>{f.tittel}</title></g>; })}
      </svg>
    </div>
  </div>;
}

/** Tegning med markeringer som bilde (JPEG) – brukes i rapporten */
export async function tegningSomBilde(t: Rec, shapes: Shape[], funn: Funn[], alle: Funn[], skala?: Skala | null): Promise<{ data: Uint8Array; w: number; h: number } | null> {
  const u = await tegningUrl(t.fil.path, () => fileUrl(t.fil.path)); if (!u) return null;
  const r0 = await fetch(u); const bmp = await createImageBitmap(await r0.blob());
  const W = t.w || bmp.width, H = t.h || bmp.height; const pts = [...shapes.flatMap(s => s.pts), ...funn.filter(f => f.pos).map(f => [f.pos!.x, f.pos!.y])];
  let x0 = 0, y0 = 0, x1 = W, y1 = H;
  if (pts.length) { const pad = Math.max(W, H) * 0.06; x0 = Math.max(0, Math.min(...pts.map(p => p[0])) - pad); y0 = Math.max(0, Math.min(...pts.map(p => p[1])) - pad); x1 = Math.min(W, Math.max(...pts.map(p => p[0])) + pad); y1 = Math.min(H, Math.max(...pts.map(p => p[1])) + pad);
    const minS = Math.max(W, H) * 0.35; if (x1 - x0 < minS) { const c = (x0 + x1) / 2; x0 = Math.max(0, c - minS / 2); x1 = Math.min(W, x0 + minS); } if (y1 - y0 < minS * 0.6) { const c = (y0 + y1) / 2; y0 = Math.max(0, c - minS * 0.3); y1 = Math.min(H, y0 + minS * 0.6); } }
  const sw = x1 - x0, sh = y1 - y0; const sc = Math.min(1800 / sw, 1400 / sh, 4); const cw = Math.round(sw * sc), ch = Math.round(sh * sc);
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch; const g = cv.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, cw, ch);
  const kx = bmp.width / W, ky = bmp.height / H; g.drawImage(bmp, x0 * kx, y0 * ky, sw * kx, sh * ky, 0, 0, cw, ch);
  const P = (p: number[]) => [(p[0] - x0) * sc, (p[1] - y0) * sc]; const R = Math.max(cw, ch) / 70; const L = Math.max(cw, ch) / 450;
  const r = skala ? (() => { const d = Math.hypot(skala.b[0] - skala.a[0], skala.b[1] - skala.a[1]); return d ? skala.m / d : null; })() : mpp(t);
  const etikett = (s: string, x: number, y: number, c: string) => { g.font = `bold ${R * 1.05}px Helvetica, Arial`; g.textAlign = 'center'; g.lineWidth = L * 3; g.strokeStyle = '#fff'; g.strokeText(s, x, y); g.fillStyle = c; g.fillText(s, x, y); };
  for (const s of shapes) { const c = s.farge || '#b42318'; g.strokeStyle = c; g.fillStyle = c; g.lineWidth = L * 2; g.lineCap = 'round'; g.lineJoin = 'round';
    const q = s.pts.map(P);
    if (s.t === 'tekst') { g.textAlign = 'left'; g.font = `600 ${R * 1.3}px Helvetica, Arial`; g.lineWidth = L * 3; g.strokeStyle = '#fff'; g.strokeText(s.tekst || '', q[0][0], q[0][1]); g.fillStyle = c; g.fillText(s.tekst || '', q[0][0], q[0][1]); continue; }
    g.beginPath(); q.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]));
    if (s.t === 'areal') { g.closePath(); g.globalAlpha = .12; g.fill(); g.globalAlpha = 1; g.stroke(); if (r) { const cx = q.reduce((a, p) => a + p[0], 0) / q.length, cy = q.reduce((a, p) => a + p[1], 0) / q.length; etikett(fmtM2(polyArea(s.pts) * r * r), cx, cy, c); } continue; }
    g.stroke();
    if (s.t === 'pil') { const [a, b] = q; const an = Math.atan2(b[1] - a[1], b[0] - a[0]); const hd = R * .8; g.beginPath(); g.moveTo(b[0], b[1]); g.lineTo(b[0] - hd * Math.cos(an - .45), b[1] - hd * Math.sin(an - .45)); g.lineTo(b[0] - hd * Math.cos(an + .45), b[1] - hd * Math.sin(an + .45)); g.closePath(); g.fill(); }
    if (s.t === 'maal' && r) { const [a, b] = q; etikett(fmtM(Math.hypot(s.pts[1][0] - s.pts[0][0], s.pts[1][1] - s.pts[0][1]) * r), (a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - R * .4, c); }
  }
  for (const f of funn) { if (!f.pos) continue; const [x, y] = P([f.pos.x, f.pos.y]); const c = f.art === 'system' ? '#2457a6' : f.art === 'merknad' ? '#6b736d' : f.art === 'tilpasning' ? '#b07a00' : f.art === 'energi' ? '#1f6f5c' : '#b42318';
    g.beginPath(); g.arc(x, y, R * 1.05, 0, Math.PI * 2); g.fillStyle = c; g.fill(); g.lineWidth = L * 1.5; g.strokeStyle = '#fff'; g.stroke();
    g.fillStyle = '#fff'; g.font = `bold ${R * 1.05}px Helvetica, Arial`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(alle.indexOf(f) + 1), x, y + R * .05); g.textBaseline = 'alphabetic'; }
  const blob: Blob = await new Promise((res, rej) => cv.toBlob(b => b ? res(b) : rej(new Error('bilde')), 'image/jpeg', 0.86));
  return { data: new Uint8Array(await blob.arrayBuffer()), w: cw, h: ch };
}
