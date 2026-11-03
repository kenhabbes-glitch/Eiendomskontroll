// Plassering på etasjeplan direkte i et skjema: velg tegning og klikk der avviket er.
// Koordinatene lagres i tegningens eget koordinatsystem (t.w/t.h), samme som i «Tegninger og arealer».
import React, { useEffect, useRef, useState } from 'react';
import { S } from '../lib/store';
import { byId, sortBy } from '../lib/utils';
import { useFileUrl, FileLink } from './ui';

export type Pos = { tegningId: string; x: number; y: number } | null;

export function PosVelger({ eiendomId, value, set, ro, merker = [] }: { eiendomId: string; value: Pos; set: (p: Pos) => void; ro?: boolean; merker?: { x: number; y: number; tegningId: string; t: string }[] }) {
  const T = sortBy(S.tegninger.filter(t => t.eiendomId === eiendomId && t.fil?.path), t => +t.etasje || 0);
  const [tid, setTid] = useState<string>(value?.tegningId || T[0]?.id || '');
  useEffect(() => { if (value?.tegningId) setTid(value.tegningId); else if (!T.some(t => t.id === tid)) setTid(T[0]?.id || ''); }, [eiendomId, value?.tegningId]);
  const t = byId('tegninger', tid); const url = useFileUrl(t?.fil?.path);
  const img = useRef<HTMLImageElement>(null); const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  if (!T.length) return <div className="small muted">Ingen etasjeplaner for eiendommen ennå. Last opp under «Tegninger og arealer».</div>;
  const W = t?.w || nat?.w || 1000, H = t?.h || nat?.h || 800;
  const klikk = (e: React.MouseEvent) => {
    if (ro || !img.current) return; const r = img.current.getBoundingClientRect();
    set({ tegningId: tid, x: Math.round(((e.clientX - r.left) / r.width) * W * 10) / 10, y: Math.round(((e.clientY - r.top) / r.height) * H * 10) / 10 });
  };
  const her = value && value.tegningId === tid ? value : null;
  return <div>
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
      {T.length > 1 && <select value={tid} onChange={e => setTid(e.target.value)} style={{ border: '1px solid var(--line2)', borderRadius: 7, padding: '5px 6px', width: 'auto' }}>
        {T.map(x => <option key={x.id} value={x.id}>{x.navn}{value?.tegningId === x.id ? ' ●' : ''}</option>)}</select>}
      <span className="small muted">{ro ? '' : value ? (her ? 'Klikk for å flytte markeringen.' : `Plassert på ${byId('tegninger', value.tegningId)?.navn || 'annen tegning'}.`) : 'Klikk på tegningen der avviket er.'}</span>
      {value && !ro && <button type="button" className="btn sm ghost" onClick={() => set(null)}>Fjern plassering</button>}
    </div>
    <div style={{ position: 'relative', border: '1px solid var(--line2)', borderRadius: 8, overflow: 'hidden', background: '#fff', cursor: ro ? 'default' : 'crosshair' }} onClick={klikk}>
      {url ? <img ref={img} src={url} onLoad={e => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} style={{ width: '100%', display: 'block', maxHeight: 460, objectFit: 'contain' }} draggable={false} />
        : <div className="muted small" style={{ padding: 30, textAlign: 'center' }}>Laster tegning …</div>}
      {url && <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
        {merker.filter(m => m.tegningId === tid).map((m, i) => <circle key={i} cx={m.x} cy={m.y} r={Math.max(W, H) / 140} fill="#1f6f5c" fillOpacity={.55}><title>{m.t}</title></circle>)}
        {her && <g><circle cx={her.x} cy={her.y} r={Math.max(W, H) / 40} fill="#b42318" fillOpacity={.15} />
          <path d={(() => { const R = Math.max(W, H) / 90; return `M${her.x} ${her.y - R * 1.25} L${her.x + R * 1.15} ${her.y + R * .75} L${her.x - R * 1.15} ${her.y + R * .75} Z`; })()} fill="#b42318" stroke="#fff" strokeWidth={Math.max(W, H) / 600} /></g>}
      </svg>}
    </div>
    {merker.some(m => m.tegningId === tid) && <div className="small muted" style={{ marginTop: 4 }}>Grønne punkter viser systemet/komponentene avviket er koblet til.</div>}
  </div>;
}

/** Velg flere bilder/filer, med knapp for kamera på mobil og forhåndsvisning. */
export function BildeVelger({ filer, set }: { filer: File[]; set: (f: File[]) => void }) {
  const kam = useRef<HTMLInputElement>(null); const fil = useRef<HTMLInputElement>(null);
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => { const u = filer.map(f => f.type.startsWith('image/') ? URL.createObjectURL(f) : ''); setUrls(u); return () => u.forEach(x => x && URL.revokeObjectURL(x)); }, [filer]);
  const legg = (l: FileList | null) => { if (l?.length) set([...filer, ...Array.from(l)]); };
  return <div>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <button type="button" className="btn sm" onClick={() => kam.current?.click()}>📷 Ta bilde</button>
      <button type="button" className="btn sm" onClick={() => fil.current?.click()}>+ Velg bilder / filer</button>
      <input ref={kam} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => { legg(e.target.files); e.target.value = ''; }} />
      <input ref={fil} type="file" multiple accept="image/*,application/pdf,.heic,.doc,.docx,.xls,.xlsx" style={{ display: 'none' }} onChange={e => { legg(e.target.files); e.target.value = ''; }} />
    </div>
    {filer.length > 0 && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>{filer.map((f, i) => <div key={i} style={{ position: 'relative', width: 86 }}>
      {urls[i] ? <img src={urls[i]} style={{ width: 86, height: 86, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--line2)' }} /> : <div className="small" style={{ width: 86, height: 86, border: '1px solid var(--line2)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 4, overflow: 'hidden' }}>{f.name}</div>}
      <button type="button" className="btn ghost sm" title="Fjern" onClick={() => set(filer.filter((_, j) => j !== i))} style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(255,255,255,.9)', padding: '0 6px' }}>✕</button></div>)}</div>}
  </div>;
}

/** Miniatyrer av lagrede vedlegg (bilder vises, andre filer som lenke). */
export function VedleggGalleri({ filer }: { filer: any[] }) {
  return <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{filer.map((f, i) => <Miniatyr key={f.path || i} f={f} />)}</div>;
}
function Miniatyr({ f }: { f: any }) {
  const bilde = /^image\//.test(f.type || '') || /\.(jpe?g|png|webp|gif|heic)$/i.test(f.navn || f.path || ''); const u = useFileUrl(bilde ? f.path : undefined);
  return <FileLink fil={f}>{bilde && u ? <img src={u} title={f.navn} style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--line2)', display: 'block' }} />
    : <span className="small" style={{ display: 'inline-block', maxWidth: 160 }}>📎 {f.navn || 'Vedlegg'}</span>}</FileLink>;
}
