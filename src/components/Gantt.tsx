// Gantt-diagram for prosjekter: faser (sammendrag), oppgaver (stolper) og beslutningspunkter (milepæler).
// Interaktivt: dra stolpen for å flytte, dra i endene for å endre start/slutt, klikk for å åpne. Statisk i rapporter/utskrift.
import React, { useEffect, useRef, useState } from 'react';
import type { GRad } from '../lib/prosjektArbeid';
import { tt } from '../lib/i18n';

const DAG = 864e5;
const d2n = (s: string) => Math.floor(Date.parse(s + 'T00:00:00Z') / DAG);
const n2d = (x: number) => new Date(x * DAG).toISOString().slice(0, 10);
const MND = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];
const fdk = (s: string) => s ? s.slice(8, 10) + '.' + s.slice(5, 7) + '.' + s.slice(2, 4) : '';
const C = {
  ink: 'var(--ink,#1d2521)', ink2: 'var(--ink2,#3f4a44)', muted: 'var(--muted,#6b736d)', line: 'var(--line,#e3e6e1)', bg2: 'var(--surface2,#f4f5f2)',
  acc: 'var(--acc,#1f6f5c)', green: 'var(--green,#2f7d4f)', amber: 'var(--amber,#b7791f)', red: 'var(--red,#c0392b)', blue: 'var(--blue,#2563eb)',
};
const farge = (r: GRad, sen: boolean) => r.id.startsWith('bp:')
  ? (['Godkjent', 'Godkjent med merknader'].includes(r.status || '') ? C.green : r.status === 'Avvist' ? C.red : r.status === 'Sendt' ? C.blue : C.muted)
  : r.status === 'Ferdig' ? C.green : sen ? C.red : r.status === 'Pågår' ? C.amber : C.acc;

export type GanttProps = { rader: GRad[]; statisk?: boolean; bredde?: number; idag?: string; onEndre?: (id: string, start: string, slutt: string) => void; onKlikk?: (id: string) => void; skala?: 'uke' | 'mnd' | 'kvartal' | 'auto' };

export function Gantt({ rader, statisk, bredde = 900, idag = new Date().toISOString().slice(0, 10), onEndre, onKlikk, skala = 'auto' }: GanttProps) {
  const R = rader.filter(r => r.start);
  const [drag, setDrag] = useState<{ id: string; mode: 'flytt' | 'start' | 'slutt'; x0: number; dd: number; moved: boolean } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null); const boks = useRef<HTMLDivElement>(null); const [bw0, setBw] = useState(0);
  useEffect(() => { if (statisk || !boks.current) return; const el = boks.current; const ro = new ResizeObserver(() => setBw(el.clientWidth)); ro.observe(el); setBw(el.clientWidth); return () => ro.disconnect(); }, [statisk, R.length > 0]);
  if (!statisk && bw0) bredde = bw0 - 2;
  if (!R.length) return <p className="small muted">{tt("Ingen datoer ennå. Sett start og slutt på fasene, eller start og frist på oppgavene, så vises fremdriftsplanen her.")}</p>;
  const tn = d2n(idag);
  let min = Math.min(...R.map(r => d2n(r.start)), tn), max = Math.max(...R.map(r => d2n(r.slutt || r.start)), tn);
  min -= 7; max += 14;
  const span = max - min + 1; const LBL = statisk ? 190 : 0;
  const ppd = skala === 'uke' ? 22 : skala === 'mnd' ? 6 : skala === 'kvartal' ? 2 : Math.max(1.2, Math.min(28, (bredde - (statisk ? LBL : 250)) / span));
  const W = Math.round(span * ppd); const RH = statisk ? 18 : 26; const HH = 34; const H = HH + R.length * RH + 6;
  const x = (dn: number) => (dn - min) * ppd;
  // Skala: måneder (og uker ved høy oppløsning)
  const mnd: { x: number; t: string }[] = []; { const s = new Date(min * DAG); let d = Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), 1); while (d / DAG <= max) { const dt = new Date(d); mnd.push({ x: x(d / DAG), t: MND[dt.getUTCMonth()] + (dt.getUTCMonth() === 0 || !mnd.length ? ' ' + dt.getUTCFullYear() : '') }); d = Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 1); } }
  const uker: number[] = []; if (ppd >= 4) { let d = min + ((4 - ((min + 3) % 7) + 7) % 7); for (; d <= max; d += 7) uker.push(d); } // mandager
  const dd = (id: string) => drag && drag.id === id ? drag.dd : 0;
  const ned = (e: React.PointerEvent, r: GRad, mode: 'flytt' | 'start' | 'slutt') => {
    if (statisk) return; e.stopPropagation();
    const kanDra = onEndre && !r.id.startsWith('bp:') && !(r.nivaa === 0 && r.avledet);
    if (!kanDra) { onKlikk?.(r.id); return; }
    (e.target as Element).setPointerCapture?.(e.pointerId); setDrag({ id: r.id, mode, x0: e.clientX, dd: 0, moved: false });
  };
  const flytt = (e: React.PointerEvent) => { if (!drag) return; const d = Math.round((e.clientX - drag.x0) / ppd); if (d !== drag.dd || Math.abs(e.clientX - drag.x0) > 3) setDrag({ ...drag, dd: d, moved: drag.moved || Math.abs(e.clientX - drag.x0) > 3 }); };
  const opp = () => { if (!drag) return; const r = R.find(z => z.id === drag.id); const d = drag; setDrag(null); if (!r) return;
    if (!d.moved) { onKlikk?.(r.id); return; }
    if (!d.dd) return; let s = d2n(r.start), e = d2n(r.slutt || r.start);
    if (d.mode === 'flytt') { s += d.dd; e += d.dd; } else if (d.mode === 'start') s = Math.min(e, s + d.dd); else e = Math.max(s, e + d.dd);
    onEndre?.(r.id, n2d(s), n2d(e)); };
  const lab = (r: GRad) => (r.nivaa ? '   ' : '') + r.navn;
  const kort = (t: string, maks: number) => t.length > maks ? t.slice(0, maks - 1) + '…' : t;
  const bars = <svg ref={svgRef} width={W} height={H} style={{ display: 'block', touchAction: drag ? 'none' : 'pan-x pan-y', userSelect: 'none' }} onPointerMove={flytt} onPointerUp={opp} onPointerCancel={() => setDrag(null)}>
    <rect x={0} y={0} width={W} height={HH} style={{ fill: C.bg2 }} />
    {mnd.map((m, i) => <g key={i}><line x1={m.x} x2={m.x} y1={0} y2={H} style={{ stroke: C.line }} /><text x={m.x + 4} y={14} fontSize={11} style={{ fill: C.ink2 }}>{m.t}</text></g>)}
    {uker.map(u => <g key={u}><line x1={x(u)} x2={x(u)} y1={HH - 10} y2={H} style={{ stroke: C.line, opacity: .5 }} />{ppd >= 10 && <text x={x(u) + 2} y={HH - 4} fontSize={9} style={{ fill: C.muted }}>{fdk(n2d(u)).slice(0, 5)}</text>}</g>)}
    {R.map((r, i) => { const y = HH + i * RH; const z = i % 2 ? <rect key={'z' + i} x={0} y={y} width={W} height={RH} style={{ fill: C.bg2, opacity: .45 }} /> : null; return z; })}
    <line x1={x(tn) + ppd / 2} x2={x(tn) + ppd / 2} y1={HH - 8} y2={H} style={{ stroke: C.red, strokeDasharray: '4 3', strokeWidth: 1.5 }} />
    {!statisk && <text x={x(tn) + ppd / 2 + 3} y={HH - 22 + 10} fontSize={9} style={{ fill: C.red }}>{tt("i dag")}</text>}
    {R.map((r, i) => {
      const y = HH + i * RH; const d = dd(r.id); const m = drag?.id === r.id ? drag.mode : 'flytt';
      let s = d2n(r.start), e = d2n(r.slutt || r.start); if (m === 'flytt') { s += d; e += d; } else if (m === 'start') s = Math.min(e, s + d); else e = Math.max(s, e + d);
      const sen = r.status !== 'Ferdig' && e < tn && !r.id.startsWith('fase:'); const f = farge(r, sen);
      const tittel = `${r.navn}\n${fdk(n2d(s))}${e !== s ? ' – ' + fdk(n2d(e)) : ''}${r.status ? '\n' + r.status : ''}${r.ansvarlig ? '\n' + r.ansvarlig : ''}`;
      const kursor = statisk ? undefined : r.id.startsWith('bp:') || (r.nivaa === 0 && r.avledet) ? 'pointer' : 'grab';
      if (r.milepael) { const cx = x(s) + ppd / 2, cy = y + RH / 2, rr = statisk ? 5 : 7;
        return <g key={r.id} style={{ cursor: kursor }} onPointerDown={ev => ned(ev, r, 'flytt')}><title>{tittel}</title><polygon points={`${cx},${cy - rr} ${cx + rr},${cy} ${cx},${cy + rr} ${cx - rr},${cy}`} style={{ fill: f, stroke: '#fff', strokeWidth: 1.5 }} /></g>; }
      const bx = x(s), bw = Math.max(ppd, (e - s + 1) * ppd);
      if (r.nivaa === 0) { const h = statisk ? 6 : 8, by = y + (RH - h) / 2;
        return <g key={r.id} style={{ cursor: kursor }} onPointerDown={ev => ned(ev, r, 'flytt')}><title>{tittel}{r.avledet ? tt("\n(beregnet fra oppgavene)") : ''}</title>
          <rect x={bx} y={by} width={bw} height={h} rx={2} style={{ fill: r.status === 'Ferdig' ? C.green : C.ink2, opacity: r.avledet ? .45 : .9 }} />
          <polygon points={`${bx},${by + h} ${bx + 6},${by + h} ${bx},${by + h + 5}`} style={{ fill: C.ink2, opacity: r.avledet ? .45 : .9 }} />
          <polygon points={`${bx + bw},${by + h} ${bx + bw - 6},${by + h} ${bx + bw},${by + h + 5}`} style={{ fill: C.ink2, opacity: r.avledet ? .45 : .9 }} />
          {!statisk && !r.avledet && onEndre && <><rect x={bx - 4} y={y} width={8} height={RH} style={{ fill: 'transparent', cursor: 'ew-resize' }} onPointerDown={ev => ned(ev, r, 'start')} /><rect x={bx + bw - 4} y={y} width={8} height={RH} style={{ fill: 'transparent', cursor: 'ew-resize' }} onPointerDown={ev => ned(ev, r, 'slutt')} /></>}</g>; }
      const h = statisk ? 10 : 14, by = y + (RH - h) / 2;
      return <g key={r.id} style={{ cursor: kursor }}><title>{tittel}</title>
        <rect x={bx} y={by} width={bw} height={h} rx={3} style={{ fill: f, opacity: r.status === 'Ferdig' ? .75 : 1 }} onPointerDown={ev => ned(ev, r, 'flytt')} />
        {!statisk && onEndre && <><rect x={bx - 3} y={by - 3} width={7} height={h + 6} style={{ fill: 'transparent', cursor: 'ew-resize' }} onPointerDown={ev => ned(ev, r, 'start')} /><rect x={bx + bw - 4} y={by - 3} width={7} height={h + 6} style={{ fill: 'transparent', cursor: 'ew-resize' }} onPointerDown={ev => ned(ev, r, 'slutt')} /></>}
        {drag?.id === r.id && drag.moved && <text x={bx + bw + 6} y={by + h - 2} fontSize={10} style={{ fill: C.ink }}>{fdk(n2d(s))} – {fdk(n2d(e))}</text>}</g>;
    })}
  </svg>;
  const labels = (w: number) => <svg width={w} height={H} style={{ display: 'block', flex: 'none' }}>
    <rect x={0} y={0} width={w} height={HH} style={{ fill: C.bg2 }} /><text x={6} y={HH - 10} fontSize={11} fontWeight={600} style={{ fill: C.ink2 }}>{tt("Fase / oppgave")}</text>
    {R.map((r, i) => { const y = HH + i * RH; return <g key={r.id} style={{ cursor: statisk ? undefined : 'pointer' }} onClick={() => !statisk && onKlikk?.(r.id)}>
      {i % 2 ? <rect x={0} y={y} width={w} height={RH} style={{ fill: C.bg2, opacity: .45 }} /> : null}
      <text x={r.nivaa ? 16 : 6} y={y + RH / 2 + 4} fontSize={statisk ? 9.5 : 12} fontWeight={r.nivaa ? 400 : 700} style={{ fill: r.id.startsWith('bp:') ? C.ink2 : C.ink, fontStyle: r.id.startsWith('bp:') ? 'italic' : undefined, textDecoration: r.status === 'Ferdig' && r.nivaa ? 'line-through' : undefined }}>
        <title>{r.navn}</title>{r.id.startsWith('bp:') ? '◆ ' : ''}{kort(r.nivaa ? r.navn : r.navn.toUpperCase(), statisk ? 34 : 36)}</text></g>; })}
  </svg>;
  void lab;
  return <div ref={boks} style={{ display: 'flex', border: '1px solid ' + C.line, borderRadius: 8, overflow: 'hidden', background: 'var(--surface,#fff)' }}>
    {labels(statisk ? LBL : 250)}
    <div style={{ overflowX: statisk ? 'hidden' : 'auto', flex: 1, borderLeft: '1px solid ' + C.line }}>{bars}</div>
  </div>;
}

export function GanttForklaring() {
  const b = (c: string, t: string, d = false) => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginRight: 12 }}>{d ? <svg width={12} height={12}><polygon points="6,0 12,6 6,12 0,6" style={{ fill: c }} /></svg> : <span style={{ width: 14, height: 8, borderRadius: 2, background: c, display: 'inline-block' }} />}{t}</span>;
  return <p className="small muted" style={{ margin: '6px 0 0' }}>{b(C.acc, 'Ikke startet')}{b(C.amber, 'Pågår')}{b(C.green, 'Ferdig')}{b(C.red, 'Forsinket')}{b(C.ink2, 'Fase')}{b(C.muted, 'Beslutningspunkt venter', true)}{b(C.blue, 'Sendt eier', true)}{b(C.green, 'Godkjent', true)}</p>;
}
