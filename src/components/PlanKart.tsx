// Zoom- og panoreringsbar plantegning (SVG). Mus: hjul, dra. Touch: klyp, dra. Et trykk uten å dra gir onTap(x, y) i tegningens koordinater.
import React, { useEffect, useRef, useState } from 'react';
import { tt } from '../lib/i18n';

type VB = { x: number; y: number; w: number; h: number };
export type PlanKartProps = {
  url?: string; W: number; H: number; h?: number | string;
  onTap?: (x: number, y: number) => void;
  fokus?: { x: number; y: number; bredde?: number } | null;   // hvor kartet åpner (tegningens koordinater)
  nullstill?: unknown;                                         // endres denne, hoppes det tilbake til fokus
  children?: (px: number) => React.ReactNode;                  // tegnes i tegningens koordinater; px = tegningsenheter pr. skjermpiksel
  cursor?: string;
};

export function PlanKart({ url, W, H, h = 'min(60vh, 520px)', onTap, fokus, nullstill, children, cursor }: PlanKartProps) {
  const el = useRef<HTMLDivElement>(null); const [cw, setCw] = useState(600);
  const start = (): VB => { const asp = (el.current?.clientHeight || 400) / (el.current?.clientWidth || 600); const b = fokus ? Math.min(W, Math.max(W * 0.12, fokus.bredde || W * 0.3)) : W; const w = b, hh = Math.max(w * asp, 1); return fokus ? { x: fokus.x - w / 2, y: fokus.y - hh / 2, w, h: hh } : { x: 0, y: 0, w: W, h: Math.max(W * asp, H) }; };
  const [vb, setVb] = useState<VB>({ x: 0, y: 0, w: W, h: H });
  useEffect(() => { const e = el.current; if (!e) return; const ro = new ResizeObserver(() => { setCw(e.clientWidth || 600); }); ro.observe(e); setCw(e.clientWidth || 600); setVb(start()); return () => ro.disconnect(); }, [W, H, nullstill]); // eslint-disable-line
  const ptr = useRef(new Map<number, { x: number; y: number }>()); const g = useRef<{ d0: number; vb0: VB; cx: number; cy: number; flyttet: number; ned: { x: number; y: number } | null }>({ d0: 0, vb0: vb, cx: 0, cy: 0, flyttet: 0, ned: null });
  const aspect = () => { const r = el.current!.getBoundingClientRect(); return { r, sx: vb.w / r.width, sy: vb.h / r.height }; };
  // behold bildeformatet (meet): vb.h følger beholderens høyde/bredde
  const fiks = (v: VB): VB => { const r = el.current?.getBoundingClientRect(); const asp = r ? r.height / r.width : 0.6; const w = Math.min(Math.max(v.w, W * 0.02), W * 2.5); return { x: v.x, y: v.y, w, h: w * asp }; };
  const zoom = (f: number, px?: number, py?: number) => setVb(v => { const r = el.current!.getBoundingClientRect(); const fx = px == null ? 0.5 : (px - r.left) / r.width, fy = py == null ? 0.5 : (py - r.top) / r.height; const w = Math.min(Math.max(v.w * f, W * 0.02), W * 2.5); const hh = w * (r.height / r.width); return { x: v.x + (v.w - w) * fx, y: v.y + (v.h - hh) * fy, w, h: hh }; });
  useEffect(() => { const e = el.current; if (!e) return; const hjul = (ev: WheelEvent) => { ev.preventDefault(); zoom(ev.deltaY > 0 ? 1.18 : 1 / 1.18, ev.clientX, ev.clientY); }; e.addEventListener('wheel', hjul, { passive: false }); return () => e.removeEventListener('wheel', hjul); }, [W, H]); // eslint-disable-line

  const ned = (ev: React.PointerEvent) => { (ev.currentTarget as Element).setPointerCapture?.(ev.pointerId); ptr.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY }); const gg = g.current; gg.vb0 = vb; gg.flyttet = 0; gg.ned = { x: ev.clientX, y: ev.clientY };
    if (ptr.current.size === 2) { const [a, b] = [...ptr.current.values()]; gg.d0 = Math.hypot(a.x - b.x, a.y - b.y); gg.cx = (a.x + b.x) / 2; gg.cy = (a.y + b.y) / 2; gg.flyttet = 99; } };
  const flytt = (ev: React.PointerEvent) => { const p = ptr.current.get(ev.pointerId); if (!p) return; const gg = g.current; const { r } = aspect();
    if (ptr.current.size === 2) { ptr.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY }); const [a, b] = [...ptr.current.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2; const f = gg.d0 ? gg.d0 / d : 1; const v0 = gg.vb0;
      const w = Math.min(Math.max(v0.w * f, W * 0.02), W * 2.5); const hh = w * (r.height / r.width); const fx = (gg.cx - r.left) / r.width, fy = (gg.cy - r.top) / r.height;
      setVb({ x: v0.x + (v0.w - w) * fx - (cx - gg.cx) / r.width * w, y: v0.y + (v0.h - hh) * fy - (cy - gg.cy) / r.height * hh, w, h: hh }); return; }
    const dx = ev.clientX - p.x, dy = ev.clientY - p.y; gg.flyttet += Math.abs(dx) + Math.abs(dy); if (gg.flyttet < 6) return; ptr.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    setVb(v => ({ ...v, x: v.x - dx / r.width * v.w, y: v.y - dy / r.height * v.h })); };
  const opp = (ev: React.PointerEvent) => { const gg = g.current; const var1 = ptr.current.size === 1; ptr.current.delete(ev.pointerId);
    if (var1 && gg.flyttet < 6 && onTap && el.current) { const r = el.current.getBoundingClientRect(); const fx = (ev.clientX - r.left) / r.width, fy = (ev.clientY - r.top) / r.height; const x = vb.x + fx * vb.w, y = vb.y + fy * vb.h; if (x >= 0 && y >= 0 && x <= W && y <= H) onTap(Math.round(x * 10) / 10, Math.round(y * 10) / 10); }
    if (ptr.current.size === 1) { const [id, p] = [...ptr.current.entries()][0]; ptr.current.set(id, p); gg.vb0 = vb; gg.flyttet = 99; } };

  const px = vb.w / Math.max(cw, 1); const knapp = { width: 34, height: 34, borderRadius: 8, border: '1px solid var(--line2)', background: '#fffe', fontSize: 18, cursor: 'pointer', lineHeight: '30px', padding: 0 } as const;
  return <div ref={el} style={{ position: 'relative', border: '1px solid var(--line2)', borderRadius: 8, overflow: 'hidden', background: '#fff', height: h, touchAction: 'none', cursor: cursor || (onTap ? 'crosshair' : 'grab'), userSelect: 'none' }} onPointerDown={ned} onPointerMove={flytt} onPointerUp={opp} onPointerCancel={opp}>
    {url ? <svg viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: '100%', display: 'block' }}>
      <image href={url} x={0} y={0} width={W} height={H} />{children?.(px)}</svg>
      : <div className="muted small" style={{ padding: 30, textAlign: 'center' }}>{tt("Laster tegning …")}</div>}
    <div style={{ position: 'absolute', right: 8, top: 8, display: 'flex', flexDirection: 'column', gap: 6 }} onPointerDown={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()}>
      <button type="button" style={knapp} aria-label={tt("Zoom inn")} onClick={() => zoom(1 / 1.5)}>+</button><button type="button" style={knapp} aria-label={tt("Zoom ut")} onClick={() => zoom(1.5)}>−</button>
      <button type="button" style={{ ...knapp, fontSize: 13 }} aria-label={tt("Hele tegningen")} onClick={() => setVb(fiks({ x: 0, y: 0, w: W, h: H }))}>⤢</button></div>
  </div>;
}
