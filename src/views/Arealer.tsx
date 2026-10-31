import React, { useEffect, useRef, useState } from 'react';
import { S, canEdit, deleteFile, save, removeDoc, toast, uploadFile, useStore } from '../lib/store';

/** Lagrer beregnet leieareal (inkl. andel fellesareal) på leietakerne til eiendommen */
export async function syncArealer(eid: string) {
  const C = arealCalc(eid); const dato = new Date().toISOString().slice(0, 10);
  for (const l of S.leietakere.filter(x => x.eiendomId === eid)) {
    const p = C.per[l.id]; const r = (v: number) => Math.round(v * 10) / 10;
    const ny = p ? { tot: r(p.tot), eks: r(p.eks), fe: r(p.fe), fb: r(p.fb), etg: p.etg, dato } : null;
    const gml = l.arealBeregnet || null;
    const lik = (!ny && !gml) || (ny && gml && ny.tot === gml.tot && ny.eks === gml.eks && ny.fe === gml.fe && ny.fb === gml.fb);
    if (!lik) { try { await save('leietakere', { ...l, arealBeregnet: ny }); } catch { } }
  }
}
import { AREAL_KAT, KAT_FARGE, arealCalc, byId, centroid, clone, eNavn, lNavn, ltColor, m2, mpp, sortBy, toCsv, today, zoneArea, zoneColor, type Rec } from '../lib/utils';
import { Chip, Empty, confirmBox, formModal, openModal, textModal, useFileUrl } from '../components/ui';
import { Sel, eiendomOpts, useFilter } from './common';

const go = (p: string) => { location.hash = '#/' + p; };

// ---------- PDF → bilde (pdf.js lastes ved behov)
let pdfjsP: Promise<any> | null = null;
function loadScript(src: string) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Kunne ikke laste PDF-leser')); document.head.appendChild(s); }); }
function loadPdfjs() {
  if (!pdfjsP) pdfjsP = (async () => { const b = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/'; await loadScript(b + 'pdf.min.js'); await loadScript(b + 'pdf.worker.min.js'); const L = (window as any).pdfjsLib; L.GlobalWorkerOptions.workerSrc = b + 'pdf.worker.min.js'; return L; })();
  pdfjsP.catch(() => { pdfjsP = null; }); return pdfjsP;
}
async function pdfToImage(file: File, page: number) {
  const L = await loadPdfjs(); const doc = await L.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
  const pg = await doc.getPage(Math.min(Math.max(1, +page || 1), doc.numPages)); const v0 = pg.getViewport({ scale: 1 }); const sc = Math.min(5, 5000 / Math.max(v0.width, v0.height)); const v = pg.getViewport({ scale: sc });
  const c = document.createElement('canvas'); c.width = Math.round(v.width); c.height = Math.round(v.height); const ctx = c.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  await pg.render({ canvasContext: ctx, viewport: v }).promise;
  let blob: Blob = await new Promise(r => c.toBlob(b => r(b!), 'image/png')); if (blob.size > 40e6) blob = await new Promise(r => c.toBlob(b => r(b!), 'image/jpeg', .85));
  return { blob, w: c.width, h: c.height };
}
function imgSize(blob: Blob): Promise<{ w: number; h: number }> { return new Promise((res, rej) => { const u = URL.createObjectURL(blob); const i = new Image(); i.onload = () => { res({ w: i.naturalWidth, h: i.naturalHeight }); URL.revokeObjectURL(u); }; i.onerror = () => rej(new Error('Kunne ikke lese bildet')); i.src = u; }); }

export function editTegning(id?: string, eid?: string) {
  const t: Rec = id ? byId('tegninger', id)! : { eiendomId: eid || S.eiendommer[0]?.id, etasje: 1, navn: '1. etasje', side: 1 } as any;
  const fields: any[] = [{ k: 'eiendomId', label: 'Eiendom', type: 'select', options: eiendomOpts, req: true },
    { k: 'navn', label: 'Navn på tegning / etasje', req: true, half: true, ph: '1. etasje' }, { k: 'etasje', label: 'Etasjenummer (sortering)', type: 'number', half: true, hint: 'Kjeller = -1, U1 = 0 osv.' }];
  if (!id) fields.push({ k: 'fil', label: 'Plantegning (PDF, PNG eller JPG)', type: 'file', req: true, accept: '.pdf,.png,.jpg,.jpeg,.webp' }, { k: 'side', label: 'Sidenummer i PDF', type: 'number', half: true, hint: 'Bare for PDF med flere sider' });
  formModal({
    title: id ? 'Rediger tegning' : 'Last opp plantegning', fields, values: t, saveTxt: id ? 'Lagre' : 'Last opp',
    extraFoot: close => id ? <button className="btn danger" onClick={async () => { if (await confirmBox(`Slette tegningen «${t.navn}» med ${(t.soner || []).length} oppmålte arealer?`)) { await deleteFile(t.fil); await removeDoc('tegninger', id); await syncArealer(t.eiendomId); close(); } }}>Slett</button> : null,
    onSave: async x => {
      if (id) { await save('tegninger', { ...t, eiendomId: x.eiendomId, navn: x.navn, etasje: x.etasje }); await syncArealer(x.eiendomId); if (x.eiendomId !== t.eiendomId) await syncArealer(t.eiendomId); return; }
      const f: File = x.fil; const ext = (f.name.split('.').pop() || '').toLowerCase(); let blob: Blob = f, w = 0, h = 0, navn = f.name;
      try {
        if (ext === 'pdf') { toast('Leser PDF …'); const r = await pdfToImage(f, x.side); blob = r.blob; w = r.w; h = r.h; navn = f.name.replace(/\.pdf$/i, '') + (blob.type === 'image/png' ? '.png' : '.jpg'); }
        else if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) { const z = await imgSize(f); w = z.w; h = z.h; }
        else { toast('Bruk PDF, PNG eller JPG'); return false; }
      } catch (e: any) { toast(ext === 'pdf' ? 'Kunne ikke lese PDF-en. Eksporter tegningen som PNG/JPG og prøv igjen.' : e?.message || 'Kunne ikke lese filen'); return false; }
      const fil = await uploadFile(blob as any, x.eiendomId, undefined, navn); if (!fil) return false;
      const nid = await save('tegninger', { eiendomId: x.eiendomId, navn: x.navn, etasje: x.etasje, fil, w, h, soner: [] });
      setTimeout(() => openPlan(nid), 150);
    },
  });
}

// ---------- tegneverktøy
const HELP: Record<string, string> = {
  velg: 'Klikk på et areal for å velge det. Dra i hjørnepunktene for å justere. Dra i bakgrunnen for å flytte tegningen, scroll for å zoome.',
  skala: 'Klikk på to punkter med kjent avstand, f.eks. endene av en målsatt vegg. Skriv inn lengden i meter til høyre. Zoom inn for presisjon.',
  tegn: 'Klikk hjørnene i arealet. Avslutt ved å klikke på første punkt, dobbeltklikke eller trykke Enter. Hold Shift for rette vinkler. Punkter fester seg til eksisterende hjørner. Backspace angrer, Esc avbryter.',
  maal: 'Klikk to punkter for å måle avstanden. Hold Shift for vannrett/loddrett.',
};
export function openPlan(tid: string) { openModal({ noFrame: true, render: close => <PlanEditor tid={tid} close={close} /> }); }

function PlanEditor({ tid, close }: { tid: string; close: () => void }) {
  const t0 = byId('tegninger', tid)!; const ro = !canEdit();
  const T = useRef<Rec>({ ...clone(t0), soner: clone(t0?.soner || []) }).current;
  const [, setTick] = useState(0); const rr = () => setTick(x => x + 1);
  const st = useRef({ tool: mpp(T) ? 'velg' : (ro ? 'velg' : 'skala'), sel: null as string | null, draft: [] as number[][], meas: [] as number[][], scale: [] as number[][], hover: null as number[] | null, drag: null as any, shift: false, space: false, dirty: false, saveT: 0 as any, status: '' }).current;
  const [vb, setVb] = useState({ x: 0, y: 0, w: T.w || 1000, h: T.h || 800 });
  const svgRef = useRef<SVGSVGElement>(null);
  const src = useFileUrl(T.fil?.path);
  const [scM, setScM] = useState('');
  const L = sortBy(S.leietakere.filter(l => l.eiendomId === T.eiendomId), l => l.navn);

  const k = () => { const r = svgRef.current?.getBoundingClientRect(); return r ? Math.max(vb.w / (r.width || 1), vb.h / (r.height || 1)) : 1; };
  const pt = (e: { clientX: number; clientY: number }) => { const s = svgRef.current!; const p = s.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; const q = p.matrixTransform(s.getScreenCTM()!.inverse()); return [q.x, q.y]; };
  const snap = (p: number[], ref?: number[] | null, skip?: { z: string; i: number }) => {
    const tol = 10 * k(); let best: number[] | null = null, bd = tol;
    T.soner.forEach((z: Rec) => z.pts.forEach((q: number[], i: number) => { if (skip && skip.z === z.id && skip.i === i) return; const d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < bd) { bd = d; best = q; } }));
    st.draft.forEach(q => { const d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < bd) { bd = d; best = q; } });
    if (best) return [best[0], best[1]];
    if (ref && st.shift) { const dx = Math.abs(p[0] - ref[0]), dy = Math.abs(p[1] - ref[1]); return dx > dy ? [p[0], ref[1]] : [ref[0], p[1]]; }
    return p;
  };
  const flush = async () => { clearTimeout(st.saveT); if (!st.dirty) return; st.dirty = false; st.status = 'Lagrer …'; rr(); try { await save('tegninger', clone(T)); await syncArealer(T.eiendomId); st.status = 'Lagret'; } catch { st.dirty = true; st.status = 'Lagring feilet'; } rr(); };
  const change = () => { if (ro) return; st.dirty = true; st.status = 'Ikke lagret …'; clearTimeout(st.saveT); st.saveT = setTimeout(flush, 900); rr(); };
  const setTool = (t: string) => { st.tool = t; st.draft = []; if (t !== 'skala') st.scale = []; if (t !== 'maal') st.meas = []; if (t !== 'velg') st.sel = null; rr(); };
  const closePoly = () => { if (st.draft.length < 3) return; const z = { id: crypto.randomUUID(), navn: 'Areal ' + (T.soner.length + 1), kat: 'leie', leietakerId: '', pts: st.draft.map(p => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]) }; T.soner.push(z); st.draft = []; st.sel = z.id; st.tool = 'velg'; change(); setTimeout(() => { const n = document.getElementById('zN') as HTMLInputElement; n?.focus(); n?.select(); }, 30); };
  const done = async () => { await flush(); close(); };

  useEffect(() => { const s = svgRef.current!; const wheel = (e: WheelEvent) => { e.preventDefault(); const p = pt(e); const f = e.deltaY > 0 ? 1.15 : 1 / 1.15; setVb(v => { const nw = v.w * f; if (nw < (T.w || 1000) / 80 || nw > (T.w || 1000) * 4) return v; return { x: p[0] - (p[0] - v.x) * f, y: p[1] - (p[1] - v.y) * f, w: nw, h: v.h * f }; }); }; s.addEventListener('wheel', wheel, { passive: false }); return () => s.removeEventListener('wheel', wheel); });
  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      const inField = /INPUT|SELECT|TEXTAREA/.test((document.activeElement as HTMLElement)?.tagName || '');
      st.shift = e.shiftKey;
      if (e.key === ' ' && !inField) { st.space = e.type === 'keydown'; e.preventDefault(); return; }
      if (e.type !== 'keydown') return;
      if (e.key === 'Escape') { if (st.draft.length || st.scale.length || st.meas.length) { st.draft = []; st.scale = []; st.meas = []; rr(); } else if (st.sel) { st.sel = null; rr(); } else done(); return; }
      if (inField || ro) return;
      if (e.key === 'Enter' && st.tool === 'tegn') closePoly();
      if (e.key === 'Backspace' && st.tool === 'tegn' && st.draft.length) { st.draft.pop(); rr(); e.preventDefault(); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && st.tool === 'velg' && st.sel) { T.soner = T.soner.filter((q: Rec) => q.id !== st.sel); st.sel = null; change(); e.preventDefault(); }
      const map: Record<string, string> = { v: 'velg', t: 'tegn', m: 'maal', s: 'skala' }; if (map[e.key]) setTool(map[e.key]);
    };
    document.addEventListener('keydown', keys); document.addEventListener('keyup', keys);
    return () => { document.removeEventListener('keydown', keys); document.removeEventListener('keyup', keys); };
  });
  useEffect(() => () => { if (st.dirty) save('tegninger', clone(T)).then(() => syncArealer(T.eiendomId)).catch(() => {}); }, []);

  const onDown = (e: React.PointerEvent) => {
    st.shift = e.shiftKey; const p = pt(e); const tg = e.target as Element; const hdl = tg.getAttribute('data-h'); const zid = tg.getAttribute('data-z');
    if (e.button === 1 || st.space || (st.tool === 'velg' && hdl == null && !zid)) { st.drag = { t: 'pan', cx: e.clientX, cy: e.clientY, vb0: { ...vb }, moved: false }; svgRef.current!.setPointerCapture(e.pointerId); return; }
    if (st.tool === 'velg') { if (hdl != null && !ro) { st.drag = { t: 'v', i: +hdl }; svgRef.current!.setPointerCapture(e.pointerId); return; } if (zid) { st.sel = zid; rr(); return; } }
    if (e.button !== 0 || ro) return;
    if (st.tool === 'tegn') { const q = snap(p, st.draft[st.draft.length - 1]); if (st.draft.length >= 3 && Math.hypot(q[0] - st.draft[0][0], q[1] - st.draft[0][1]) < 12 * k()) { closePoly(); return; } st.draft.push(q); rr(); return; }
    if (st.tool === 'skala') { const q = snap(p, st.scale[0]); if (st.scale.length >= 2) st.scale = []; st.scale.push(q); if (st.scale.length === 2) setTimeout(() => (document.getElementById('scM') as HTMLInputElement)?.focus(), 30); rr(); return; }
    if (st.tool === 'maal') { const q = snap(p, st.meas[0]); if (st.meas.length >= 2) st.meas = []; st.meas.push(q); rr(); }
  };
  const onMove = (e: React.PointerEvent) => {
    st.shift = e.shiftKey; const p = pt(e);
    if (st.drag?.t === 'pan') { const r = svgRef.current!.getBoundingClientRect(); const v0 = st.drag.vb0; const kk = Math.max(v0.w / r.width, v0.h / r.height); setVb({ ...v0, x: v0.x - (e.clientX - st.drag.cx) * kk, y: v0.y - (e.clientY - st.drag.cy) * kk }); if (Math.abs(e.clientX - st.drag.cx) + Math.abs(e.clientY - st.drag.cy) > 4) st.drag.moved = true; return; }
    if (st.drag?.t === 'v') { const z = T.soner.find((z: Rec) => z.id === st.sel); if (z) { const n = z.pts.length; z.pts[st.drag.i] = snap(p, z.pts[(st.drag.i + n - 1) % n], { z: z.id, i: st.drag.i }); rr(); } return; }
    const ref = st.tool === 'tegn' ? st.draft[st.draft.length - 1] : st.tool === 'skala' ? (st.scale.length === 1 ? st.scale[0] : null) : st.tool === 'maal' ? (st.meas.length === 1 ? st.meas[0] : null) : null;
    if (st.tool !== 'velg') { st.hover = snap(p, ref); rr(); }
  };
  const onUp = () => {
    if (st.drag?.t === 'v') { const z = T.soner.find((z: Rec) => z.id === st.sel); if (z) z.pts[st.drag.i] = z.pts[st.drag.i].map((v: number) => Math.round(v * 10) / 10); change(); }
    if (st.drag?.t === 'pan' && !st.drag.moved && st.tool === 'velg' && st.sel) { st.sel = null; rr(); }
    st.drag = null;
  };
  const saveScale = () => { const v = parseFloat(scM.replace(',', '.')); if (!(v > 0)) { toast('Skriv inn lengden i meter'); return; } T.skala = { a: st.scale[0], b: st.scale[1], m: v }; st.scale = []; st.tool = 'tegn'; setScM(''); change(); toast('Målestokk satt – nå kan du tegne arealer'); };

  const kk = k(), fs = 13 * kk, r = 5 * kk; const r0 = mpp(T); const fmtM = (v: number) => v.toLocaleString('nb-NO', { maximumFractionDigits: 2 }) + ' m';
  const line = (a: number[], b: number[], col: string, dash: boolean, lbl: string, key: string) => <g key={key} pointerEvents="none"><line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={col} strokeWidth={2.5} vectorEffect="non-scaling-stroke" strokeDasharray={dash ? '6 4' : undefined} />{[a, b].map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={r} fill={col} />)}{lbl && <text x={(a[0] + b[0]) / 2} y={(a[1] + b[1]) / 2 - fs * .6} textAnchor="middle" fontSize={fs} fontWeight={600} fill={col} stroke="#fff" strokeWidth={3 * kk} paintOrder="stroke">{lbl}</text>}</g>;
  const selZ = T.soner.find((z: Rec) => z.id === st.sel);
  const sum: Record<string, number> = {}; T.soner.forEach((z: Rec) => { sum[z.kat] = (sum[z.kat] || 0) + (zoneArea(T, z) || 0); });

  return <div className="modal plan" role="dialog" aria-modal="true">
    <div className="mh"><h2>{eNavn(T.eiendomId)} · {T.navn}</h2><span className="small muted">{ro ? 'Lesetilgang' : st.status}</span><button className="btn sm" onClick={done}>Ferdig</button></div>
    <div className="pbody">
      <div className="ptools">
        {(['velg', 'skala', 'tegn', 'maal'] as const).filter(t => !ro || t === 'velg' || t === 'maal').map(t => <button key={t} className={st.tool === t ? 'on' : ''} onClick={() => setTool(t)}>{({ velg: 'Velg / panorer', skala: 'Sett målestokk', tegn: 'Tegn areal', maal: 'Mål avstand' } as any)[t]}</button>)}
        <hr /><button onClick={() => setVb({ x: 0, y: 0, w: T.w, h: T.h })}>Tilpass til vindu</button><div className="phelp">{HELP[st.tool]}</div>
      </div>
      <div className="pcanvas"><svg ref={svgRef} className={st.tool === 'velg' ? 'pan' : ''} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
        onDoubleClick={() => { if (st.tool === 'tegn') { if (st.draft.length > 3) st.draft.pop(); closePoly(); } }} onPointerLeave={() => { st.hover = null; if (st.tool !== 'velg') rr(); }} fontFamily="IBM Plex Sans,sans-serif">
        {src && <image href={src} x={0} y={0} width={T.w} height={T.h} />}
        {T.soner.map((z: Rec) => { const c = zoneColor(T, z); const on = z.id === st.sel; return <polygon key={z.id} points={z.pts.map((p: number[]) => p.join(',')).join(' ')} fill={c} fillOpacity={on ? .38 : .24} stroke={c} strokeWidth={on ? 3 : 1.6} vectorEffect="non-scaling-stroke" data-z={z.id} style={{ cursor: 'pointer' }} />; })}
        {T.soner.map((z: Rec) => { const c = centroid(z.pts); const a = zoneArea(T, z); let lt = z.kat === 'leie' && z.leietakerId ? lNavn(z.leietakerId) : ''; if (lt === z.navn) lt = '';
          return <g key={'l' + z.id} pointerEvents="none"><text x={c[0]} y={c[1]} textAnchor="middle" fontSize={fs} fontWeight={600} fill="#1d2320" stroke="#fff" strokeWidth={3 * kk} paintOrder="stroke">{z.navn}</text>
            <text x={c[0]} y={c[1] + fs * 1.25} textAnchor="middle" fontSize={fs * .9} fill="#1d2320" stroke="#fff" strokeWidth={3 * kk} paintOrder="stroke">{(lt ? lt + ' · ' : '') + (a != null ? m2(a) : 'mangler målestokk')}</text></g>; })}
        {selZ && st.tool === 'velg' && !ro && selZ.pts.map((p: number[], i: number) => <circle key={'h' + i} cx={p[0]} cy={p[1]} r={r * 1.2} fill="#fff" stroke={zoneColor(T, selZ)} strokeWidth={2} vectorEffect="non-scaling-stroke" data-h={i} style={{ cursor: 'move' }} />)}
        {T.skala && (st.tool === 'skala' || !st.sel) && !st.scale.length && line(T.skala.a, T.skala.b, '#b42318', true, 'Målestokk ' + fmtM(T.skala.m), 'sk')}
        {st.scale.length > 0 && (st.scale[1] || st.hover) && line(st.scale[0], st.scale[1] || st.hover!, '#b42318', true, '', 'sc')}
        {st.meas.length > 0 && (st.meas[1] || st.hover) && (() => { const b = st.meas[1] || st.hover!; return line(st.meas[0], b, '#2457a6', false, r0 ? fmtM(Math.hypot(b[0] - st.meas[0][0], b[1] - st.meas[0][1]) * r0) : 'sett målestokk', 'ms'); })()}
        {st.draft.length > 0 && <g pointerEvents="none"><polyline points={[...st.draft, ...(st.hover ? [st.hover] : [])].map(p => p.join(',')).join(' ')} fill="rgba(31,111,92,.15)" stroke="#1f6f5c" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          {st.draft.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={i === 0 ? r * 1.5 : r} fill={i === 0 ? '#fff' : '#1f6f5c'} stroke="#1f6f5c" strokeWidth={2} vectorEffect="non-scaling-stroke" />)}
          {st.hover && r0 && <text x={st.hover[0] + 10 * kk} y={st.hover[1] - 10 * kk} fontSize={fs * .9} fill="#1f6f5c" stroke="#fff" strokeWidth={3 * kk} paintOrder="stroke">{fmtM(Math.hypot(st.hover[0] - st.draft[st.draft.length - 1][0], st.hover[1] - st.draft[st.draft.length - 1][1]) * r0)}</text>}</g>}
        {!st.draft.length && st.hover && st.tool !== 'velg' && <circle cx={st.hover[0]} cy={st.hover[1]} r={r} fill="none" stroke="#1f6f5c" strokeWidth={2} vectorEffect="non-scaling-stroke" pointerEvents="none" />}
      </svg></div>
      <div className="pside">
        <h3>Målestokk</h3>
        {st.scale.length === 2 ? <><label className="small">Lengde mellom punktene (meter)</label><input id="scM" type="number" step="any" placeholder="F.eks. 12.4" value={scM} onChange={e => setScM(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveScale(); }} />
          <div style={{ display: 'flex', gap: 6 }}><button className="btn sm pri" onClick={saveScale}>Lagre målestokk</button><button className="btn sm" onClick={() => { st.scale = []; rr(); }}>Avbryt</button></div></>
          : r0 ? <p className="small" style={{ margin: 0 }}>Referanse {fmtM(T.skala.m)} · 1 piksel = {(r0 * 1000).toLocaleString('nb-NO', { maximumFractionDigits: 1 })} mm</p>
          : <p className="small" style={{ margin: 0, color: 'var(--amber)' }}>Ikke satt.{!ro && ' Velg «Sett målestokk» og klikk to punkter med kjent avstand.'}</p>}
        {st.meas.length === 2 && r0 && <><h3>Måling</h3><p className="mono" style={{ margin: 0 }}>{fmtM(Math.hypot(st.meas[1][0] - st.meas[0][0], st.meas[1][1] - st.meas[0][1]) * r0)}</p></>}
        {selZ && <><h3>Valgt areal</h3>
          <label className="small">Navn</label><input id="zN" value={selZ.navn || ''} readOnly={ro} onChange={e => { selZ.navn = e.target.value; change(); }} placeholder="F.eks. Kontor 2. etg vest" />
          <label className="small">Kategori</label><select value={selZ.kat} disabled={ro} onChange={e => { selZ.kat = e.target.value; change(); }}>{AREAL_KAT.map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select>
          {selZ.kat === 'leie' && <><label className="small">Leietaker</label><select value={selZ.leietakerId || ''} disabled={ro} onChange={e => { selZ.leietakerId = e.target.value; if (!selZ.navn || selZ.navn.startsWith('Areal ')) selZ.navn = lNavn(selZ.leietakerId); change(); }}><option value="">– velg leietaker –</option>{L.map(l => <option key={l.id} value={l.id}>{l.navn}</option>)}</select></>}
          <p style={{ margin: '2px 0 8px' }}>Areal: <b className="mono">{m2(zoneArea(T, selZ))}</b> <span className="muted small">({selZ.pts.length} hjørner)</span></p>
          {!ro && <button className="btn sm danger" onClick={() => { T.soner = T.soner.filter((q: Rec) => q.id !== selZ.id); st.sel = null; change(); }}>Slett areal</button>}</>}
        <h3>Arealer på tegningen</h3>
        {T.soner.length ? <>{T.soner.map((z: Rec) => { const a = zoneArea(T, z); return <div key={z.id} className={'zl ' + (z.id === st.sel ? 'on' : '')} onClick={() => { st.sel = z.id; st.tool = 'velg'; rr(); }}>
          <span className="sw" style={{ background: zoneColor(T, z) }} /><span style={{ flex: 1, minWidth: 0 }}><b style={{ fontWeight: 500 }}>{z.navn || 'Uten navn'}</b><br /><span className="muted small">{z.kat === 'leie' ? (lNavn(z.leietakerId) || 'Ingen leietaker valgt') : AREAL_KAT.find(c => c[0] === z.kat)?.[1]}</span></span><span className="mono small">{a != null ? m2(a) : '–'}</span></div>; })}
          {r0 && <div className="small" style={{ marginTop: 10 }}>{AREAL_KAT.filter(c => sum[c[0]]).map(c => <div key={c[0]} style={{ display: 'flex', justifyContent: 'space-between' }}><span className="muted">{c[1]}</span><span className="mono">{m2(sum[c[0]])}</span></div>)}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, borderTop: '1px solid var(--line)', marginTop: 4, paddingTop: 4 }}><span>Sum oppmålt</span><span className="mono">{m2(Object.values(sum).reduce((a, b) => a + b, 0))}</span></div></div>}</>
          : <p className="muted small">Ingen arealer tegnet ennå.{!ro && ' Velg «Tegn areal».'}</p>}
      </div>
    </div>
  </div>;
}

function Thumb({ t }: { t: Rec }) { const u = useFileUrl(t.fil?.path); return u ? <img src={u} alt="" /> : <span className="muted small">Laster …</span>; }

export function ArealSection({ eid }: { eid: string }) {
  useStore();
  const e = byId('eiendommer', eid); if (!e) return null; const ed = canEdit();
  const T = sortBy(S.tegninger.filter(t => t.eiendomId === eid), t => +t.etasje || 0); const C = arealCalc(eid);
  const keys = Object.keys(C.per).sort((a, b) => (+a.startsWith('_') - +b.startsWith('_')) || lNavn(a).localeCompare(lNavn(b)));
  const nm = (k: string) => k === '_ledig' ? 'Ledig areal' : k === '_ukjent' ? 'Leieareal uten leietaker' : lNavn(k) || 'Ukjent leietaker';
  const tot = C.totLeie; const ikke = C.etg.reduce((s: number, x: any) => s + (x.sum.ikke || 0), 0);
  const csv = () => { const f = (v: number) => v.toLocaleString('nb-NO', { minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: false }); const rows: any[][] = [['Leietaker', 'Etasje', 'Eksklusivt areal m2', 'Andel felles etasje m2', 'Andel felles bygg m2', 'Leieareal m2', 'Andel %']]; keys.forEach(k => { const p = C.per[k]; rows.push([nm(k), p.etg.join(', '), f(p.eks), f(p.fe), f(p.fb), f(p.tot), tot ? f(p.tot / tot * 100) : '']); }); rows.push(['Sum', '', f(C.totEks), '', '', f(tot), '100']); textModal('Arealoppgave – ' + e.navn, toCsv(rows)); };
  return <>
    <div className="plancards">
      {T.map(t => <div key={t.id} className="card plancard"><div className="thumb" onClick={() => openPlan(t.id)}><Thumb t={t} /></div><div className="t">{t.navn}</div>
        <div className="small muted">{mpp(t) ? 'Målestokk satt' : <span style={{ color: 'var(--amber)' }}>Mangler målestokk</span>} · {(t.soner || []).length} arealer</div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}><button className="btn sm pri" onClick={() => openPlan(t.id)}>{ed ? 'Åpne og tegn' : 'Åpne'}</button>{ed && <button className="btn sm" onClick={() => editTegning(t.id)}>Rediger</button>}</div></div>)}
      {ed && <button className="upcard" onClick={() => editTegning(undefined, eid)}><b style={{ fontSize: 22 }}>+</b><span>Last opp plantegning</span><span className="small">PDF, PNG eller JPG</span></button>}
      {!ed && !T.length && <div className="card"><Empty t="Ingen tegninger" /></div>}
    </div>
    <div className="sec"><div className="toolbar"><h2 style={{ margin: 0, flex: 1 }}>Arealoppgave – {e.navn}</h2>{keys.length > 0 && <><button className="btn sm" onClick={csv}>Kopier arealoppgave (CSV)</button></>}</div>
      {C.unscaled > 0 && <div className="banner">{C.unscaled} tegning(er) har arealer, men mangler målestokk og er ikke med i oppgaven.</div>}
      {keys.length ? <div className="tbl-wrap"><table><thead><tr><th>Leietaker</th><th>Etasje</th><th className="num">Eksklusivt areal</th><th className="num">Andel felles etasje</th><th className="num">Andel felles bygg</th><th className="num">Leieareal</th><th className="num">Andel</th>{ed && <th className="num">Overstyrt på leietaker</th>}</tr></thead><tbody>
        {keys.map(k => { const p = C.per[k]; const l = byId('leietakere', k); const ov = l && l.arealOverstyrt !== '' && l.arealOverstyrt != null && !isNaN(+l.arealOverstyrt) ? +l.arealOverstyrt : null;
          return <tr key={k} className={l && ed ? 'click' : ''} onClick={() => l && ed && go('leietaker/' + k)}><td><span className="sw" style={{ display: 'inline-block', verticalAlign: -1, marginRight: 6, background: k === '_ledig' ? KAT_FARGE.ledig : ltColor(eid, k) }} />{nm(k)}</td><td className="small">{p.etg.join(', ')}</td>
            <td className="num">{m2(p.eks)}</td><td className="num">{m2(p.fe)}</td><td className="num">{m2(p.fb)}</td><td className="num" style={{ fontWeight: 600 }}>{m2(p.tot)}</td><td className="num">{tot ? (p.tot / tot * 100).toLocaleString('nb-NO', { maximumFractionDigits: 1 }) + ' %' : '–'}</td>
            {ed && <td className="num">{ov !== null ? <>{m2(ov)}{Math.abs(ov - p.tot) >= 1 && <div className="small" style={{ color: 'var(--amber)' }}>{ov - p.tot > 0 ? '+' : ''}{(ov - p.tot).toLocaleString('nb-NO', { maximumFractionDigits: 1 })} mot oppmålt</div>}</> : <span className="muted">–</span>}</td>}</tr>; })}
        <tr className="grp"><td colSpan={2}>Sum utleibart</td><td className="num">{m2(C.totEks)}</td><td className="num">{m2(keys.reduce((s, k) => s + C.per[k].fe, 0))}</td><td className="num">{m2(keys.reduce((s, k) => s + C.per[k].fb, 0))}</td><td className="num">{m2(tot)}</td><td className="num">100 %</td>{ed && <td />}</tr>
      </tbody></table></div> : <div className="tbl-wrap"><Empty t="Ingen oppmålte leiearealer ennå">{ed && 'Last opp plantegning, sett målestokk og tegn arealene.'}</Empty></div>}
      {C.ikkeFordelt > 0 && <p className="small" style={{ color: 'var(--amber)' }}>{m2(C.ikkeFordelt)} fellesareal er ikke fordelt fordi det ikke finnes leieareal å fordele på.</p>}
      {C.fellesBygg + C.etg.reduce((s: number, x: any) => s + (x.sum.felles_etg || 0), 0) < 0.05 && keys.length > 0 && <div className="banner">Det er ikke tegnet fellesarealer for eiendommen, så leiearealene inneholder ingen andel fellesareal. Tegn korridorer, trapperom, inngangsparti o.l. som «Fellesareal» hvis de skal fordeles.</div>}
      <p className="small muted">Leiearealet (inkl. andel fellesareal) lagres automatisk på leietakerne når tegningene endres, og kan overstyres på leietakeren. Fellesareal i etasjen fordeles forholdsmessig på leiearealene (inkl. ledig areal) i samme etasje. Fellesareal for hele bygget fordeles på alle leiearealer. Ikke utleibart areal: {m2(ikke)}. Arealene er målt fra tegning og er veiledende – en formell arealoppgave etter NS 3940 bør kontrollmåles.</p></div>
    {C.etg.length > 0 && <div className="sec"><h2>Oppmålt per etasje</h2><div className="tbl-wrap"><table><thead><tr><th>Tegning / etasje</th><th className="num">Leieareal</th><th className="num">Ledig</th><th className="num">Felles etasje</th><th className="num">Felles bygg</th><th className="num">Ikke utleibart</th><th className="num">Sum oppmålt</th></tr></thead><tbody>
      {C.etg.map((x: any) => <tr key={x.t.id} className="click" onClick={() => openPlan(x.t.id)}><td>{x.t.navn}{!x.ok && <> <Chip c="amber">Mangler målestokk</Chip></>}</td>{['leie', 'ledig', 'felles_etg', 'felles_bygg', 'ikke'].map(c => <td key={c} className="num">{x.ok ? m2(x.sum[c]) : '–'}</td>)}<td className="num" style={{ fontWeight: 600 }}>{x.ok ? m2(Object.values(x.sum as Record<string, number>).reduce((a, b) => a + b, 0)) : '–'}</td></tr>)}
    </tbody></table></div></div>}
  </>;
}

export function Arealer() {
  useStore();
  const [f, setF] = useFilter('areal', { e: '' });
  const e = f.e && byId('eiendommer', f.e) ? f.e : sortBy(S.eiendommer, x => x.navn)[0]?.id;
  if (!S.eiendommer.length) return <><h1>Tegninger og arealer</h1><div className="card"><Empty t="Ingen eiendommer" /></div></>;
  return <>
    <div className="head"><div className="grow"><h1>Tegninger og arealer</h1><p className="sub">Plantegninger med målestokk og oppmålte arealer – arealoppgaven beregnes automatisk</p></div></div>
    <div className="toolbar"><Sel value={e} onChange={v => setF({ e: v })} opts={eiendomOpts()} /></div>
    <ArealSection eid={e} />
  </>;
}
