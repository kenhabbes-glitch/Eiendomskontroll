// Bytt en etasjetegning med en ny versjon uten å miste plasseringer: systemer, komponenter, avvik og oppmålte arealer flyttes med.
import React, { useEffect, useMemo, useState } from 'react';
import { S, save, state, toast, uploadFile, useStore, feiltekst } from '../lib/store';
import { byId, type Rec } from '../lib/utils';
import { tt } from '../lib/i18n';
import { openModal, useFileUrl } from '../components/ui';
import { PlanKart } from '../components/PlanKart';
import { dwgTilBilde, ENHETER } from '../lib/dwg';
import { syncArealer, pdfToImage, imgSize } from './Arealer';
import { bruk, fraCad, likhet, rotasjonGrader, skalafaktor, type Mat, type Pt } from '../lib/planRef';

type Ny = { blob: Blob; w: number; h: number; navn: string; dwg?: { kilde: File; r: any } };
const itemsPaa = (tid: string) => ([['anlegg', S.anlegg], ['komponenter', S.komponenter], ['avvik', S.avvik]] as [string, Rec[]][]).flatMap(([col, L]) => L.filter(o => o.pos?.tegningId === tid).map(o => ({ col, o })));

export function byttTegning(tid: string) { openModal({ wide: true, render: close => <Bytt tid={tid} close={close} /> }); }

function Bytt({ tid, close }: { tid: string; close: () => void }) {
  useStore(); const t = byId('tegninger', tid)!;
  const [fil, setFil] = useState<File | null>(null); const [enhet, setEnhet] = useState('auto'); const [side, setSide] = useState(1); const [ny, setNy] = useState<Ny | null>(null);
  const [modus, setModus] = useState<'auto' | 'manuell'>('auto'); const [g, setG] = useState<Pt[]>([]); const [n, setN] = useState<Pt[]>([]); const [busy, setBusy] = useState('');
  const gUrl = useFileUrl(t.fil?.path); const nUrl = useMemo(() => ny ? URL.createObjectURL(ny.blob) : '', [ny]); useEffect(() => () => { if (nUrl) URL.revokeObjectURL(nUrl); }, [nUrl]);
  const items = itemsPaa(tid); const antSoner = (t.soner || []).length;
  const kanAuto = !!(t.cad?.vb && ny?.dwg?.r?.vb);

  const les = async () => {
    if (!fil) return; setBusy(tt("Leser tegningen …")); setNy(null); setG([]); setN([]);
    try {
      const ext = (fil.name.split('.').pop() || '').toLowerCase();
      if (ext === 'dwg') { const r = await dwgTilBilde(fil, enhet); setNy({ blob: r.blob, w: r.w, h: r.h, navn: fil.name.replace(/\.dwg$/i, '') + '.png', dwg: { kilde: fil, r } }); setModus(t.cad?.vb ? 'auto' : 'manuell'); }
      else if (ext === 'pdf') { const r = await pdfToImage(fil, side); setNy({ blob: r.blob, w: r.w, h: r.h, navn: fil.name.replace(/\.pdf$/i, '') + (r.blob.type === 'image/png' ? '.png' : '.jpg') }); setModus('manuell'); }
      else if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) { const z = await imgSize(fil); setNy({ blob: fil, w: z.w, h: z.h, navn: fil.name }); setModus('manuell'); }
      else toast(tt("Bruk DWG, PDF, PNG eller JPG"));
    } catch (e: any) { toast(tt("Kunne ikke lese filen: ") + feiltekst(e)); }
    setBusy('');
  };

  // transformasjon gammel → ny
  const M: Mat | null = useMemo(() => {
    if (!ny) return null;
    if (modus === 'auto' && kanAuto) return fraCad({ vb: t.cad.vb, w: t.w, h: t.h }, { vb: ny.dwg!.r.vb, w: ny.w, h: ny.h });
    if (g.length === 2 && n.length === 2) return likhet(g[0], g[1], n[0], n[1]); return null;
  }, [ny, modus, g, n, kanAuto]); // eslint-disable-line

  const tapG = (x: number, y: number) => { if (g.length <= n.length && g.length < 2) setG([...g, [x, y]]); };
  const tapN = (x: number, y: number) => { if (n.length < g.length && n.length < 2) setN([...n, [x, y]]); };
  const neste = modus === 'auto' ? '' : g.length === n.length ? (g.length >= 2 ? '' : tt("Trykk på punkt {0} på den GAMLE tegningen (til venstre)", g.length + 1)) : tt("Trykk på samme punkt {0} på den NYE tegningen (til høyre)", n.length + 1);

  const flytt = async () => {
    if (!ny || !M) return; setBusy(tt("Laster opp ny tegning …"));
    try {
      const eid = t.eiendomId; const nyFil = await uploadFile(ny.blob as any, eid, undefined, ny.navn); if (!nyFil) throw new Error(tt("Opplastingen feilet"));
      let kilde: any = undefined, cad: any = undefined;
      if (ny.dwg) { const r = ny.dwg.r; kilde = await uploadFile(ny.dwg.kilde, eid, undefined, ny.dwg.kilde.name); const svgfil = await uploadFile(new Blob([r.svg], { type: 'image/svg+xml' }) as any, eid, undefined, ny.navn.replace(/\.png$/, '.svg')); cad = { enhet: r.enhet, bredde: r.bredde, hoyde: r.hoyde, advarsler: r.advarsler, vb: r.vb, svg: svgfil, lag: r.lag, skjult: [], omriss: false }; }
      setBusy(tt("Flytter {0} plasseringer …", items.length)); let i = 0;
      for (const { col, o } of items) { await save(col as any, { ...o, pos: { ...o.pos, tegningId: tid, x: bruk(M, [o.pos.x, o.pos.y])[0], y: bruk(M, [o.pos.x, o.pos.y])[1] } }); if (++i % 10 === 0) setBusy(tt("Flytter plasseringer ({0} av {1}) …", i, items.length)); }
      const skala = t.skala ? { ...t.skala, a: bruk(M, t.skala.a), b: bruk(M, t.skala.b) } : undefined;
      const soner = (t.soner || []).map((z: Rec) => ({ ...z, pts: (z.pts || []).map((q: number[]) => bruk(M, q)) }));
      const versjoner = [{ fil: t.fil, kilde: t.kilde, w: t.w, h: t.h, dato: new Date().toISOString(), av: state.me?.navn || state.me?.epost || '' }, ...(t.versjoner || [])];
      const fersk = byId('tegninger', tid)!; await save('tegninger', { ...fersk, fil: nyFil, w: ny.w, h: ny.h, kilde, cad, skala: skala || (cad ? { a: [ny.w * 0.02, ny.h * 0.995], b: [ny.w * 0.98, ny.h * 0.995], m: Math.round(ny.w * 0.96 * ny.dwg!.r.mpp * 1000) / 1000 } : undefined), soner, versjoner });
      await syncArealer(eid); toast(tt("Tegningen er byttet. {0} plasseringer og {1} arealer er flyttet med.", items.length, antSoner)); close();
    } catch (e: any) { toast(tt("Kunne ikke bytte tegning: ") + feiltekst(e)); setBusy(''); }
  };

  const merkerNy = (px: number) => !M ? null : <>
    {(t.soner || []).map((z: Rec) => <polygon key={z.id} points={(z.pts || []).map((q: number[]) => bruk(M, q).join(',')).join(' ')} fill="#1f6f5c" fillOpacity={.12} stroke="#1f6f5c" strokeWidth={px * 1.2} />)}
    {items.map(({ col, o }) => { const p = bruk(M, [o.pos.x, o.pos.y]); return col === 'avvik' ? <path key={col + o.id} d={`M${p[0]} ${p[1] - px * 9} L${p[0] + px * 8} ${p[1] + px * 5} L${p[0] - px * 8} ${p[1] + px * 5} Z`} fill="#b42318" stroke="#fff" strokeWidth={px * 1.2} /> : <circle key={col + o.id} cx={p[0]} cy={p[1]} r={px * 5} fill="#1f6f5c" fillOpacity={.8} stroke="#fff" strokeWidth={px} />; })}</>;
  const pkt = (L: Pt[], px: number) => L.map((p, i) => <g key={i}><circle cx={p[0]} cy={p[1]} r={px * 9} fill="#1d4ed8" fillOpacity={.85} stroke="#fff" strokeWidth={px * 1.5} /><text x={p[0] + px * 12} y={p[1] - px * 10} fontSize={px * 16} fontWeight={700} fill="#1d4ed8" stroke="#fff" strokeWidth={px * 3} paintOrder="stroke">{i + 1}</text></g>);

  return <>
    <div className="mh"><h2>{tt("Bytt tegning –")} {t.navn}</h2><button className="btn ghost sm" onClick={close}>✕</button></div>
    <div className="mb">
      <div className="note small" style={{ color: 'var(--ink)', marginBottom: 10 }}>{tt("Last opp en ny versjon av tegningen. Appen regner om plasseringen til {0} systemer/komponenter/avvik og {1} oppmålte arealer, slik at alt står på samme sted i den nye tegningen. Den gamle versjonen arkiveres.", items.length, antSoner)}</div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
        <label className="small" style={{ flex: '1 1 260px' }}>{tt("Ny plantegning (DWG, PDF, PNG eller JPG)")}<input type="file" accept=".dwg,.pdf,.png,.jpg,.jpeg,.webp" onChange={e => { setFil(e.target.files?.[0] || null); setNy(null); }} style={{ display: 'block', width: '100%' }} /></label>
        {fil && /\.dwg$/i.test(fil.name) && <label className="small">{tt("Enhet i DWG")}<select value={enhet} onChange={e => setEnhet(e.target.value)} style={{ display: 'block' }}>{ENHETER.map((x: any) => <option key={x[0]} value={x[0]}>{x[1]}</option>)}</select></label>}
        {fil && /\.pdf$/i.test(fil.name) && <label className="small">{tt("Side")}<input type="number" min={1} value={side} onChange={e => setSide(+e.target.value || 1)} style={{ display: 'block', width: 70 }} /></label>}
        <button className="btn" disabled={!fil || !!busy} onClick={les}>{tt("Les inn")}</button></div>
      {busy && <p className="small muted">{busy}</p>}
      {ny && <>
        <h3 style={{ margin: '16px 0 6px' }}>{tt("Innpassing")}</h3>
        {kanAuto && <div className="small" style={{ display: 'flex', gap: 14, marginBottom: 6, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', gap: 5, alignItems: 'center' }}><input type="radio" checked={modus === 'auto'} onChange={() => setModus('auto')} />{tt("Automatisk – begge er DWG med samme koordinatsystem (anbefalt)")}</label>
          <label style={{ display: 'flex', gap: 5, alignItems: 'center' }}><input type="radio" checked={modus === 'manuell'} onChange={() => setModus('manuell')} />{tt("Manuelt med to punkter")}</label></div>}
        {modus === 'manuell' && <>
          <p className="small" style={{ margin: '0 0 6px' }}><b>{neste || (g.length === 2 ? tt("Ferdig – kontroller at punktene ligger likt i begge tegninger.") : tt("Velg to punkter som finnes på begge tegninger, f.eks. to bygningshjørner langt fra hverandre."))}</b> {(g.length > 0 || n.length > 0) && <button type="button" className="btn sm ghost" onClick={() => { setG([]); setN([]); }}>{tt("Start på nytt")}</button>}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 10 }}>
            <div><div className="small muted" style={{ marginBottom: 3 }}>{tt("Gammel tegning")}</div><PlanKart url={gUrl} W={t.w || 1000} H={t.h || 800} h={380} onTap={tapG}>{px => pkt(g, px)}</PlanKart></div>
            <div><div className="small muted" style={{ marginBottom: 3 }}>{tt("Ny tegning")}</div><PlanKart url={nUrl} W={ny.w} H={ny.h} h={380} onTap={tapN}>{px => pkt(n, px)}</PlanKart></div></div></>}
        {M && <>
          <h3 style={{ margin: '16px 0 6px' }}>{tt("Kontroller resultatet")}</h3>
          <p className="small muted" style={{ margin: '0 0 6px' }}>{tt("Prikkene viser hvor plasseringene havner på den nye tegningen (grønn = system/komponent, rød trekant = avvik). Zoom inn og sjekk at de står riktig, f.eks. ved dører og rom.")} {tt("Endring: skala ×{0}, rotasjon {1}°", skalafaktor(M).toFixed(3), rotasjonGrader(M).toFixed(1))}</p>
          <PlanKart url={nUrl} W={ny.w} H={ny.h} h={440}>{merkerNy}</PlanKart></>}
        {!M && modus === 'manuell' && g.length === 2 && n.length === 2 && <p className="small" style={{ color: 'var(--red)' }}>{tt("Punktene ligger for nær hverandre. Velg to punkter lenger fra hverandre.")}</p>}
      </>}
    </div>
    <div className="mf"><button className="btn" onClick={close} disabled={!!busy && !!M}>{tt("Avbryt")}</button><button className="btn pri" disabled={!M || !!busy} onClick={flytt}>{busy && M ? busy : tt("Bytt tegning og flytt {0} plasseringer", items.length)}</button></div>
  </>;
}
