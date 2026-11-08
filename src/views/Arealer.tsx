import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Hjelp } from '../components/Hjelp';
import { S, canEdit, deleteFile, fileUrl, save, removeDoc, toast, uploadFile, useStore } from '../lib/store';
import { tt, lokale } from '../lib/i18n';

/** Lagrer beregnet leieareal (inkl. andel fellesareal) på leietakerne til eiendommen */
export async function syncArealer(eid: string) {
  const C = arealCalc(eid); const dato = new Date().toISOString().slice(0, 10);
  for (const l of S.leietakere.filter(x => x.eiendomId === eid)) {
    const p = C.per[l.id]; const r = (v: number) => Math.round(v * 10) / 10;
    const ny = p ? { tot: r(p.tot), eks: r(p.eks), fe: r(p.fe), fb: r(p.fb), felles: r(p.felles), fellesBer: r(p.fellesBer), avtale: p.avtale || '', etg: p.etg, dato } : null;
    const gml = l.arealBeregnet || null;
    const lik = (!ny && !gml) || (ny && gml && ny.tot === gml.tot && ny.eks === gml.eks && ny.fe === gml.fe && ny.fb === gml.fb && ny.felles === gml.felles);
    if (!lik) { try { await save('leietakere', { ...l, arealBeregnet: ny }); } catch { } }
  }
}
import { AREAL_KAT, KAT_FARGE, arealCalc, byId, centroid, clone, eNavn, lNavn, ltColor, m2, mpp, polyArea, sortBy, toCsv, today, zoneArea, zoneColor, type Rec } from '../lib/utils';
import { Chip, Empty, confirmBox, formModal, openModal, textModal, useFileUrl } from '../components/ui';
import { Sel, eiendomOpts, useFilter } from './common';
import { KOMP, TFM_KODER, TFM_DEF, AV_LUKKET } from '../lib/catalog';
import { pad, tfmSys, tfmKomp, openAvvik, nextKompLop, aNavn } from '../lib/utils';
import { editAnlegg, editAvvik, editKomponent } from '../lib/actions';
import { kanRedigereE } from '../lib/store';
import { state, isUtforer } from '../lib/store';
import { AlvChip, FileLink, StChip, TaggChips, taggFarge } from '../components/ui';
import { arealRapport } from '../lib/arealRapport';
import { TAGGER } from '../lib/catalog';
import { taggerFor } from '../lib/utils';
import { ENHETER, dwgTilBilde, lagStil, rasteriser } from '../lib/dwg';

// ---------- systemer/komponenter som markører på tegning
export const FAG: [string, string, string][] = [['2', 'Bygning', '#8a5a2b'], ['3', 'VVS', '#2457a6'], ['4', 'Elkraft', '#b07a00'], ['5', 'Tele og automasjon', '#b42318'], ['6', 'Andre installasjoner', '#7b3fa0'], ['7', 'Utendørs', '#5b6b00']];
export type MItem = { kind: 'a' | 'k' | 'v'; o: Rec };
export function itemFag(i: MItem) { const sys = i.kind === 'a' ? i.o : byId('anlegg', i.kind === 'v' && i.o.komponentId ? byId('komponenter', i.o.komponentId)?.anleggId || i.o.anleggId : i.o.anleggId); const c = String(sys?.tfmSys || '')[0] || String(KOMP[sys?.type]?.g || '')[0] || ''; return c; }
export const fagFarge = (c: string) => FAG.find(f => f[0] === c)?.[2] || '#3d4a44';
export function itemKode(i: MItem) { if (i.kind === 'v') return 'Avvik #' + (i.o.nr || ''); return i.kind === 'a' ? (tfmSys(i.o) || '(uten kode)') : '-' + (i.o.kode || '') + pad(i.o.lop); }
export function itemNavn(i: MItem) { if (i.kind === 'v') return i.o.tittel || 'Avvik'; return i.kind === 'a' ? (i.o.navn || KOMP[i.o.type]?.n || 'System') : (i.o.navn || TFM_KODER.find(c => c[0] === (i.o.kode || '').toUpperCase())?.[1] || 'Komponent'); }
async function lagrePos(i: MItem, pos: any) {
  if (i.kind === 'v') { const fersk = byId('avvik', i.o.id) || i.o; const t = pos ? byId('tegninger', pos.tegningId) : null; const logg = [...(fersk.logg || []), { t: new Date().toISOString(), s: fersk.status, k: pos ? (fersk.pos ? 'Flyttet på tegning ' : 'Plassert på tegning ') + (t?.navn || '') : 'Fjernet fra tegning', av: state.me?.navn || state.me?.epost }]; await save('avvik', { ...fersk, pos, logg }); return; }
  await save(i.kind === 'a' ? 'anlegg' : 'komponenter', { ...i.o, pos });
  const fersk = byId(i.kind === 'a' ? 'anlegg' : 'komponenter', i.o.id); if (fersk) import('./KontrollAo').then(m => m.oppdaterLokasjonFor(fersk)).catch(() => { }); }

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
  const t: Rec = id ? byId('tegninger', id)! : { eiendomId: eid || S.eiendommer[0]?.id, etasje: 1, navn: tt("1. etasje"), side: 1 } as any;
  const fields: any[] = [{ k: 'eiendomId', label: tt("Eiendom"), type: 'select', options: eiendomOpts, req: true },
    { k: 'navn', label: tt("Navn på tegning / etasje"), req: true, half: true, ph: tt("1. etasje") }, { k: 'etasje', label: tt("Etasjenummer (sortering)"), type: 'number', half: true, hint: tt("Kjeller = -1, U1 = 0 osv.") }];
  if (id && t.kilde) fields.push({ k: 'kildeInfo', type: 'custom', render: () => <div className="note small" style={{ color: 'var(--ink)' }}>{tt("Original DWG:")} <FileLink fil={t.kilde} />{t.cad?.enhet ? tt(" · enhet {0}", t.cad.enhet) : ''}{t.cad?.bredde ? tt(" · ca. {0} × {1} m", Math.round(t.cad.bredde * 10) / 10, Math.round(t.cad.hoyde * 10) / 10) : ''}{t.cad?.advarsler?.length ? <div style={{ color: 'var(--amber)', marginTop: 4 }}>{tt("Ikke vist:")} {t.cad.advarsler.join('; ')}</div> : null}
    <div style={{ marginTop: 6 }}>{t.cad?.svg && <><button type="button" className="btn sm pri" onClick={() => dwgLag(t.id)}>{tt("Lag i DWG (")}{(t.cad.lag || []).length})</button> </>}<button type="button" className="btn sm" onClick={() => lesDwgPaaNytt(t.id)}>{tt("Les inn DWG på nytt")}</button> <span className="muted">{tt("Bruker siste versjon av DWG-leseren.")}</span></div></div> });
  const erCad = (x: any) => /\.dwg$/i.test(x?.fil?.name || '');
  if (!id) fields.push({ k: 'fil', label: tt("Plantegning (DWG, PDF, PNG eller JPG)"), type: 'file', req: true, accept: '.dwg,.pdf,.png,.jpg,.jpeg,.webp' },
    { k: 'side', label: tt("Sidenummer i PDF"), type: 'number', half: true, hint: tt("Bare for PDF med flere sider"), show: (x: any) => /\.pdf$/i.test(x?.fil?.name || '') },
    { k: 'enhet', label: tt("Tegningsenhet i DWG"), type: 'select', options: ENHETER.map(e => [e[0], e[1]]), half: true, def: 'auto', show: erCad, hint: tt("Målestokken settes automatisk ut fra enheten. Bygningstegninger er nesten alltid i mm.") });
  formModal({
    title: id ? tt("Rediger tegning") : tt("Last opp plantegning"), fields, values: t, saveTxt: id ? tt("Lagre") : tt("Last opp"),
    extraFoot: close => id ? <button className="btn danger" onClick={async () => { if (await confirmBox(tt("Slette tegningen «{0}» med {1} oppmålte arealer?", t.navn, (t.soner || []).length))) { await deleteFile(t.fil); if (t.kilde) await deleteFile(t.kilde); await removeDoc('tegninger', id); await syncArealer(t.eiendomId); close(); } }}>{tt("Slett")}</button> : null,
    onSave: async x => {
      if (id) { await save('tegninger', { ...t, eiendomId: x.eiendomId, navn: x.navn, etasje: x.etasje }); await syncArealer(x.eiendomId); if (x.eiendomId !== t.eiendomId) await syncArealer(t.eiendomId); return; }
      const f: File = x.fil; const ext = (f.name.split('.').pop() || '').toLowerCase(); let blob: Blob = f, w = 0, h = 0, navn = f.name;
      try {
        if (ext === 'dxf') { toast(tt("DXF støttes ikke ennå. Bruk DWG, eller lagre tegningen som PDF.")); return false; }
        if (ext === 'dwg') {
          toast(tt("Leser DWG … (første gang lastes DWG-leseren, ca. 11 MB)"));
          const r = await dwgTilBilde(f, x.enhet || 'auto'); blob = r.blob; w = r.w; h = r.h; navn = f.name.replace(/\.dwg$/i, '') + '.png';
          const kilde = await uploadFile(f, x.eiendomId, undefined, f.name);
          const fil = await uploadFile(blob as any, x.eiendomId, undefined, navn); if (!fil) return false;
          const skala = { a: [w * 0.02, h * 0.995], b: [w * 0.98, h * 0.995], m: Math.round(w * 0.96 * r.mpp * 1000) / 1000 };
          const svgfil = await uploadFile(new Blob([r.svg], { type: 'image/svg+xml' }) as any, x.eiendomId, undefined, navn.replace(/\.png$/, '.svg'));
          const nid = await save('tegninger', { eiendomId: x.eiendomId, navn: x.navn, etasje: x.etasje, fil, kilde, w, h, soner: [], skala, cad: { enhet: r.enhet, bredde: r.bredde, hoyde: r.hoyde, advarsler: r.advarsler, vb: r.vb, svg: svgfil, lag: r.lag, skjult: [], omriss: false } });
          if (r.advarsler.length) setTimeout(() => textModal(tt("DWG – innhold som ikke vises"), tt("Tegningen er lest, men dette kunne ikke vises:\n\n• ") + r.advarsler.join('\n• ') + tt("\n\nRåd:\n• Xref: åpne tegningen i AutoCAD og bruk «Bind» (eller eTransmit) så eksterne tegninger blir en del av filen.\n• Proxy-objekter (AutoCAD Architecture, MagiCAD m.fl.): bruk «Export to AutoCAD» / «-EXPORTTOAUTOCAD», eller «Explode», og lagre på nytt.\n• Alternativt: plott tegningen til PDF og last opp PDF-en."), tt("Lagre som ny DWG fra CAD-programmet og last opp på nytt, eller bruk PDF.")), 600);
          toast(tt("DWG lest. Målestokk satt automatisk (enhet {0}, ca. {1} × {2} m). Kontroller med «Mål avstand».", r.enhet, r.bredde.toLocaleString(lokale(), { maximumFractionDigits: 1 }), r.hoyde.toLocaleString(lokale(), { maximumFractionDigits: 1 })));
          setTimeout(() => openPlan(nid), 150); return;
        }
        if (ext === 'pdf') { toast(tt("Leser PDF …")); const r = await pdfToImage(f, x.side); blob = r.blob; w = r.w; h = r.h; navn = f.name.replace(/\.pdf$/i, '') + (blob.type === 'image/png' ? '.png' : '.jpg'); }
        else if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) { const z = await imgSize(f); w = z.w; h = z.h; }
        else { toast(tt("Bruk DWG, PDF, PNG eller JPG")); return false; }
      } catch (e: any) { toast(ext === 'pdf' ? tt("Kunne ikke lese PDF-en. Eksporter tegningen som PNG/JPG og prøv igjen.") : ext === 'dwg' || ext === 'dxf' ? tt("Kunne ikke lese DWG-filen: ") + (e?.message || e) + tt(". Prøv å lagre den i en annen DWG-versjon eller som PDF fra CAD-programmet.") : e?.message || tt("Kunne ikke lese filen")); return false; }
      const fil = await uploadFile(blob as any, x.eiendomId, undefined, navn); if (!fil) return false;
      const nid = await save('tegninger', { eiendomId: x.eiendomId, navn: x.navn, etasje: x.etasje, fil, w, h, soner: [] });
      setTimeout(() => openPlan(nid), 150);
    },
  });
}

// ---------- Lag i DWG (skru av/på)
export function dwgLag(tid: string) { openModal({ wide: true, render: close => <DwgLag tid={tid} close={close} /> }); }
function DwgLag({ tid, close }: { tid: string; close: () => void }) {
  const t = byId('tegninger', tid)!; const cad = t.cad || {};
  const [svg, setSvg] = useState(''); const [skjult, setSkjult] = useState<string[]>(cad.skjult || []); const [omriss, setOmriss] = useState(!!cad.omriss); const [q, setQ] = useState(''); const [busy, setBusy] = useState(''); const [prev, setPrev] = useState('');
  useEffect(() => { (async () => { try { const u = await fileUrl(cad.svg.path); setSvg(await (await fetch(u)).text()); } catch { toast(tt("Kunne ikke hente DWG-data")); } })(); }, []);
  useEffect(() => { if (!svg) return; const v = cad.vb; const doc = svg.replace(/<svg([^>]*?)viewBox="[^"]*"/, `<svg$1viewBox="${v.x} ${v.y} ${v.w} ${v.h}"`).replace(/<\/svg>\s*$/, `<style>${lagStil(skjult, omriss)}</style></svg>`);
    const u = URL.createObjectURL(new Blob([doc], { type: 'image/svg+xml' })); setPrev(u); return () => URL.revokeObjectURL(u); }, [svg, skjult.join('|'), omriss]);
  const lag: { navn: string; antall: number }[] = cad.lag || []; const vis = lag.filter(l => !q || l.navn.toLowerCase().includes(q.toLowerCase()));
  const veksle = (n: string) => setSkjult(skjult.includes(n) ? skjult.filter(x => x !== n) : [...skjult, n]);
  const bruk = async () => {
    setBusy('Tegner …');
    try {
      const blob = await rasteriser(svg, cad.vb, t.w, t.h, skjult, omriss);
      const fil = await uploadFile(blob as any, t.eiendomId, undefined, (t.kilde?.navn || 'tegning').replace(/\.dwg$/i, '') + '.png'); if (!fil) { setBusy(''); return; }
      const gml = t.fil; await save('tegninger', { ...byId('tegninger', tid)!, fil, cad: { ...cad, skjult, omriss } }); await deleteFile(gml);
      toast(skjult.length ? tt("{0} lag skjult", skjult.length) : tt("Alle lag vises")); close();
    } catch (e: any) { toast(tt("Feil: ") + (e?.message || e)); }
    setBusy('');
  };
  return <>
    <div className="mh"><h2>{tt("Lag i DWG –")} {t.navn}</h2><button className="btn ghost sm" onClick={close}>✕</button></div>
    <div className="mb"><div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 320px) 1fr', gap: 16 }}>
      <div>
        <input placeholder={tt("Søk lag …")} value={q} onChange={e => setQ(e.target.value)} style={{ width: '100%', border: '1px solid var(--line2)', borderRadius: 8, padding: '6px 10px', marginBottom: 6 }} />
        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}><button className="btn sm" onClick={() => setSkjult(skjult.filter(n => !vis.some(l => l.navn === n)))}>{tt("Vis alle")}</button><button className="btn sm" onClick={() => setSkjult([...new Set([...skjult, ...vis.map(l => l.navn)])])}>{tt("Skjul alle")}</button></div>
        <div style={{ maxHeight: 440, overflow: 'auto', border: '1px solid var(--line2)', borderRadius: 8, padding: '4px 8px' }}>
          {vis.map(l => <label key={l.navn} className="small" style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '2px 0' }}><input type="checkbox" checked={!skjult.includes(l.navn)} onChange={() => veksle(l.navn)} /><span style={{ flex: 1, wordBreak: 'break-all' }}>{l.navn || tt("(uten navn)")}</span><span className="muted">{l.antall}</span></label>)}
          {!vis.length && <p className="small muted">{tt("Ingen lag.")}</p>}</div>
        <label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }}><input type="checkbox" checked={omriss} onChange={e => setOmriss(e.target.checked)} />{tt("Vis skravur bare som omriss")}</label>
        <p className="small muted">{tt("Fjern haken for lag som ligger i veien, f.eks. arealskravur, møblering eller rutenett. Målestokk, arealer og markører beholdes.")}</p>
      </div>
      <div style={{ border: '1px solid var(--line2)', borderRadius: 8, background: '#fff', minHeight: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{prev ? <img src={prev} alt="" style={{ maxWidth: '100%', maxHeight: 520 }} /> : <span className="muted small">{tt("Laster forhåndsvisning …")}</span>}</div>
    </div></div>
    <div className="mf"><button className="btn" onClick={close}>{tt("Avbryt")}</button><button className="btn pri" disabled={!!busy || !svg} onClick={bruk}>{busy || tt("Bruk")}</button></div>
  </>;
}

async function lesDwgPaaNytt(id: string) {
  const t = byId('tegninger', id); if (!t?.kilde) return;
  if ((t.soner || []).length && !(await confirmBox(tt("Tegningen har {0} oppmålte arealer. Når DWG-en leses inn på nytt kan utsnittet endre seg, slik at arealer og markører må kontrolleres/flyttes. Fortsette?", (t.soner || []).length)))) return;
  try {
    toast(tt("Leser DWG på nytt …")); const u = await fileUrl(t.kilde.path); const b = await (await fetch(u)).blob();
    const r = await dwgTilBilde(new File([b], t.kilde.navn || 'tegning.dwg'), 'auto');
    const fil = await uploadFile(r.blob as any, t.eiendomId, undefined, (t.kilde.navn || 'tegning').replace(/\.dwg$/i, '') + '.png'); if (!fil) return;
    const gml = t.fil; const skala = { a: [r.w * 0.02, r.h * 0.995], b: [r.w * 0.98, r.h * 0.995], m: Math.round(r.w * 0.96 * r.mpp * 1000) / 1000 };
    const svgfil = await uploadFile(new Blob([r.svg], { type: 'image/svg+xml' }) as any, t.eiendomId, undefined, (t.kilde.navn || 'tegning').replace(/\.dwg$/i, '') + '.svg');
    if (t.cad?.svg) await deleteFile(t.cad.svg);
    await save('tegninger', { ...t, fil, w: r.w, h: r.h, skala, cad: { enhet: r.enhet, bredde: r.bredde, hoyde: r.hoyde, advarsler: r.advarsler, vb: r.vb, svg: svgfil, lag: r.lag, skjult: [], omriss: false } }); await deleteFile(gml); await syncArealer(t.eiendomId);
    toast(tt("DWG lest inn på nytt")); setTimeout(() => openPlan(id), 150);
  } catch (e: any) { toast(tt("Kunne ikke lese DWG: ") + (e?.message || e)); }
}

// ---------- tegneverktøy
const HELP: Record<string, string> = {
  nykomp: 'Velg system og komponenttype til høyre. Hvert klikk på tegningen lager en ny komponent med neste løpenummer, plassert der du klikket. For systemer som måles i m² (gulv, overflater, fasade) tegner du flaten i stedet – arealet lagres på komponenten og summeres på systemet.',
  plasser: 'Velg system eller komponent i listen til høyre, og klikk der det skal stå på tegningen. Markører kan dras til ny plassering.',
  velg: 'Klikk på et areal for å velge det. Dra i hjørnepunktene for å justere. Dra i bakgrunnen for å flytte tegningen, scroll for å zoome.',
  skala: 'Klikk på to punkter med kjent avstand, f.eks. endene av en målsatt vegg. Skriv inn lengden i meter til høyre. Zoom inn for presisjon.',
  tegn: 'Klikk hjørnene i arealet. Avslutt ved å klikke på første punkt, dobbeltklikke eller trykke Enter. Hold Shift for rette vinkler. Punkter fester seg til eksisterende hjørner. Backspace angrer, Esc avbryter.',
  maal: 'Klikk to punkter for å måle avstanden. Hold Shift for vannrett/loddrett.',
};
/** Viser system (med komponenter) eller komponent på tegningen der den er plassert */
export function plasserteFor(o: Rec): Rec[] { const erSys = !!o.type || !o.anleggId; const L = erSys ? [o, ...S.komponenter.filter(k => k.anleggId === o.id)] : [o]; return L.filter(x => x.pos?.tegningId && byId('tegninger', x.pos.tegningId)); }
export function visPaaTegning(o: Rec) {
  const L = plasserteFor(o); if (!L.length) { toast(tt("Ikke plassert på noen tegning ennå")); return; }
  const tell: Record<string, number> = {}; L.forEach(x => { tell[x.pos.tegningId] = (tell[x.pos.tegningId] || 0) + 1; });
  const tid = Object.entries(tell).sort((a, b) => b[1] - a[1])[0][0];
  openPlan(tid, { mode: 'tfm', focus: o.pos?.tegningId === tid ? o.id : undefined, fokus: L.filter(x => x.pos.tegningId === tid).map(x => x.id) });
}
export type MaalResultat = { tegningId: string; flater: number[][][]; m2: number };
export type PlanOpts = { nyKomp?: string; mode?: 'tfm'; placeId?: string; focus?: string; fokus?: string[]; tagg?: string; maal?: { tittel: string; flater?: number[][][]; onFerdig: (r: MaalResultat) => void } };
export function openPlan(tid: string, opts: PlanOpts = {}) { openModal({ noFrame: true, render: close => <PlanEditor tid={tid} close={close} opts={opts} /> }); }

function PlanEditor({ tid, close, opts = {} }: { tid: string; close: () => void; opts?: PlanOpts }) {
  const t0 = byId('tegninger', tid)!; const ro = !canEdit();
  const T = useRef<Rec>({ ...clone(t0), soner: clone(t0?.soner || []) }).current;
  const [, setTick] = useState(0); const rr = () => setTick(x => x + 1);
  const [tip, setTip] = useState<{ i: MItem; x: number; y: number } | null>(null);
  const tipOn = (i: MItem) => (e: React.PointerEvent) => { if (!st.drag && e.pointerType !== 'touch') setTip({ i, x: e.clientX, y: e.clientY }); };
  const tipMove = (e: React.PointerEvent) => { if (tip && !st.drag) setTip({ ...tip, x: e.clientX, y: e.clientY }); else if (tip) setTip(null); };
  const tipOff = () => setTip(null);
  const tfmMode = opts.mode === 'tfm'; const maalMode = !!opts.maal;
  const st = useRef({ flater: (opts.maal?.flater ? clone(opts.maal.flater) : []) as number[][][], tgF: '', tagg: (opts.tagg || '') as string, fokus: new Set<string>(opts.fokus || (opts.focus ? [opts.focus] : [])), visPlassert: false, flyttOk: (opts.placeId || '') as string, lagA: !tfmMode, lagM: true, lagV: true, fag: '', selM: (opts.focus || null) as string | null, placeId: (opts.placeId || '') as string, mpos: null as number[] | null, nkSys: (opts.nyKomp || '') as string, nkKode: '', nkNavn: '', nkLagt: [] as string[], tool: opts.nyKomp && !ro ? 'nykomp' : opts.placeId && !ro ? 'plasser' : tfmMode ? 'velg' : mpp(T) ? 'velg' : (ro ? 'velg' : 'skala'), sel: null as string | null, draft: [] as number[][], meas: [] as number[][], scale: [] as number[][], hover: null as number[] | null, drag: null as any, shift: false, space: false, dirty: false, saveT: 0 as any, status: '' }).current;
  const [vb, setVb] = useState({ x: 0, y: 0, w: T.w || 1000, h: T.h || 800 });
  const svgRef = useRef<SVGSVGElement>(null);
  const src = useFileUrl(T.fil?.path);
  const [scM, setScM] = useState('');
  const L = sortBy(S.leietakere.filter(l => l.eiendomId === T.eiendomId), l => l.navn);
  const items: MItem[] = [...sortBy(S.anlegg.filter(a => a.eiendomId === T.eiendomId), a => (a.tfmSys || '999') + pad(a.tfmLop)).flatMap(a => [{ kind: 'a', o: a } as MItem, ...sortBy(S.komponenter.filter(k => k.anleggId === a.id), k => (k.kode || '') + pad(k.lop)).map(k => ({ kind: 'k', o: k } as MItem))])];
  const avItems: MItem[] = sortBy(S.avvik.filter(a => a.eiendomId === T.eiendomId && (!AV_LUKKET.includes(a.status) || a.id === opts.focus || a.id === opts.placeId)), a => -(a.nr || 0)).map(a => ({ kind: 'v', o: a } as MItem));
  const itemTagger = (i: MItem) => i.kind === 'v' ? (i.o.komponentId ? taggerFor(byId('komponenter', i.o.komponentId), 'k') : taggerFor(byId('anlegg', i.o.anleggId), 'a')) : taggerFor(i.o, i.kind as any);
  const tgOk = (i: MItem) => { if (!st.tgF || i.kind === 'v') return true; const tg = i.o.tg || ''; return st.tgF === 'TG23' ? ['TG2', 'TG3'].includes(tg) : st.tgF === 'ingen' ? !tg : tg === st.tgF; };
  const filt = (i: MItem) => i.o.pos?.tegningId === T.id && (!st.fag || itemFag(i) === st.fag) && (!st.tagg || itemTagger(i).includes(st.tagg)) && tgOk(i);
  const markers = items.filter(filt);
  const avMarkers = avItems.filter(filt);
  const brukteTagger = [...new Set(items.filter(i => i.o.pos?.tegningId === T.id).flatMap(itemTagger))];
  const findItem = (id: string | null) => items.find(i => i.o.id === id) || avItems.find(i => i.o.id === id);
  useEffect(() => {
    const ps = [...st.fokus].map(id => findItem(id)).filter(i => i?.o.pos?.tegningId === T.id).map(i => i!.o.pos);
    if (!ps.length) return; const x0 = Math.min(...ps.map(p => p.x)), x1 = Math.max(...ps.map(p => p.x)), y0 = Math.min(...ps.map(p => p.y)), y1 = Math.max(...ps.map(p => p.y));
    const w = Math.max((T.w || 1000) / 3, (x1 - x0) * 1.5), h = Math.max((T.h || 800) / 3, (y1 - y0) * 1.5); setVb({ x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - h / 2, w, h });
  }, []);

  const k = () => { const r = svgRef.current?.getBoundingClientRect(); return r ? Math.max(vb.w / (r.width || 1), vb.h / (r.height || 1)) : 1; };
  const pt = (e: { clientX: number; clientY: number }) => { const s = svgRef.current!; const p = s.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; const q = p.matrixTransform(s.getScreenCTM()!.inverse()); return [q.x, q.y]; };
  const snap = (p: number[], ref?: number[] | null, skip?: { z: string; i: number }) => {
    const tol = 10 * k(); let best: number[] | null = null, bd = tol;
    T.soner.forEach((z: Rec) => z.pts.forEach((q: number[], i: number) => { if (skip && skip.z === z.id && skip.i === i) return; const d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < bd) { bd = d; best = q; } }));
    st.draft.forEach(q => { const d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < bd) { bd = d; best = q; } });
    st.flater.forEach((f: number[][]) => f.forEach(q => { const d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < bd) { bd = d; best = q; } }));
    if (best) return [best[0], best[1]];
    if (ref && st.shift) { const dx = Math.abs(p[0] - ref[0]), dy = Math.abs(p[1] - ref[1]); return dx > dy ? [p[0], ref[1]] : [ref[0], p[1]]; }
    return p;
  };
  const flush = async () => { clearTimeout(st.saveT); if (!st.dirty) return; st.dirty = false; st.status = 'Lagrer …'; rr(); try { await save('tegninger', clone(T)); await syncArealer(T.eiendomId); st.status = 'Lagret'; } catch { st.dirty = true; st.status = 'Lagring feilet'; } rr(); };
  const change = () => { if (ro) return; st.dirty = true; st.status = 'Ikke lagret …'; clearTimeout(st.saveT); st.saveT = setTimeout(flush, 900); rr(); };
  const setTool = (t: string) => { st.tool = t; if (t === 'nykomp' && !st.nkSys) { const a1 = S.anlegg.filter(a => a.eiendomId === T.eiendomId); if (a1.length === 1) st.nkSys = a1[0].id; } if (t !== 'plasser') st.placeId = ''; if (t === 'tegn' || t === 'skala') st.lagA = true; if (t !== 'velg') st.selM = null; st.draft = []; if (t !== 'skala') st.scale = []; if (t !== 'maal') st.meas = []; if (t !== 'velg') st.sel = null; rr(); };
  if (maalMode && !st.maalInit) { st.maalInit = true; st.tool = T.skala ? 'flate' : 'skala'; st.lagM = false; st.lagV = false; }
  const flateM2 = (f: number[][]) => { const r = mpp(T); return r ? polyArea(f) * r * r : 0; };
  const closePoly = () => { if (st.draft.length < 3) return; if (st.tool === 'nykomp') { const f = st.draft.map(p => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]); st.draft = []; rr(); nyKompHer(centroid(f), f); return; } if (st.tool === 'flate') { st.flater.push(st.draft.map(p => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10])); st.draft = []; rr(); return; } const z = { id: crypto.randomUUID(), navn: tt("Areal ") + (T.soner.length + 1), kat: 'leie', leietakerId: '', pts: st.draft.map(p => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]) }; T.soner.push(z); st.draft = []; st.sel = z.id; st.tool = 'velg'; change(); setTimeout(() => { const n = document.getElementById('zN') as HTMLInputElement; n?.focus(); n?.select(); }, 30); };
  const done = async () => { await flush(); close(); };

  useEffect(() => { const s = svgRef.current!; const wheel = (e: WheelEvent) => { e.preventDefault(); const p = pt(e); const f = e.deltaY > 0 ? 1.15 : 1 / 1.15; setVb(v => { const nw = v.w * f; if (nw < (T.w || 1000) / 80 || nw > (T.w || 1000) * 4) return v; return { x: p[0] - (p[0] - v.x) * f, y: p[1] - (p[1] - v.y) * f, w: nw, h: v.h * f }; }); }; s.addEventListener('wheel', wheel, { passive: false }); return () => s.removeEventListener('wheel', wheel); });
  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      const inField = /INPUT|SELECT|TEXTAREA/.test((document.activeElement as HTMLElement)?.tagName || '');
      st.shift = e.shiftKey;
      if (e.key === ' ' && !inField) { st.space = e.type === 'keydown'; e.preventDefault(); return; }
      if (e.type !== 'keydown') return;
      if (e.key === 'Escape') { if (st.draft.length || st.scale.length || st.meas.length) { st.draft = []; st.scale = []; st.meas = []; rr(); } else if (st.sel || st.selM || st.placeId) { st.sel = null; st.selM = null; st.placeId = ''; rr(); } else done(); return; }
      if (inField || ro) return;
      if (e.key === 'Enter' && (st.tool === 'tegn' || st.tool === 'flate' || st.tool === 'nykomp')) closePoly();
      if (e.key === 'Backspace' && (st.tool === 'tegn' || st.tool === 'flate' || st.tool === 'nykomp') && st.draft.length) { st.draft.pop(); rr(); e.preventDefault(); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && st.tool === 'velg' && st.sel) { T.soner = T.soner.filter((q: Rec) => q.id !== st.sel); st.sel = null; change(); e.preventDefault(); }
      const map: Record<string, string> = maalMode ? { v: 'velg', t: 'flate', m: 'maal', s: 'skala' } : { v: 'velg', t: 'tegn', m: 'maal', s: 'skala', p: 'plasser', k: 'nykomp' }; if (map[e.key]) setTool(map[e.key]);
    };
    document.addEventListener('keydown', keys); document.addEventListener('keyup', keys);
    return () => { document.removeEventListener('keydown', keys); document.removeEventListener('keyup', keys); };
  });
  useEffect(() => () => { if (st.dirty) save('tegninger', clone(T)).then(() => syncArealer(T.eiendomId)).catch(() => {}); }, []);

  const onDown = (e: React.PointerEvent) => {
    st.shift = e.shiftKey; const p = pt(e); const tg = e.target as Element; const hdl = tg.getAttribute('data-h'); const zid = tg.getAttribute('data-z');
    const mid = (tg.closest && tg.closest('[data-m]')?.getAttribute('data-m')) || null;
    if (mid && e.button === 0 && (st.tool === 'velg' || st.tool === 'plasser' || st.tool === 'nykomp')) { st.selM = mid; st.sel = null; if (!ro) { st.drag = { t: 'm', id: mid, cx: e.clientX, cy: e.clientY, moved: false }; svgRef.current!.setPointerCapture(e.pointerId); } rr(); return; }
    if (st.tool === 'nykomp' && e.button === 0 && !ro && !st.space && nkM2() && st.nkSys) {
      if (!mpp(T)) { toast(tt("Sett målestokk på tegningen først («Sett målestokk»), så arealet blir riktig")); return; }
      const q = snap(p, st.draft[st.draft.length - 1]); if (st.draft.length >= 3 && Math.hypot(q[0] - st.draft[0][0], q[1] - st.draft[0][1]) < 12 * k()) { closePoly(); return; } st.draft.push(q); rr(); return; }
    if (st.tool === 'nykomp' && e.button === 0 && !ro && !st.space) { nyKompHer(p); return; }
    if (st.tool === 'plasser' && e.button === 0 && !ro) { const it = findItem(st.placeId); if (!it) { toast(tt("Velg først hva som skal plasseres i listen til høyre")); return; }
      if (it.o.pos && st.flyttOk !== it.o.id) { const fra = byId('tegninger', it.o.pos.tegningId)?.navn || 'en annen tegning'; const pos = [p[0], p[1]];
        confirmBox(tt("{0} {1} er allerede plassert {2}. Vil du flytte den hit? Den forrige plasseringen fjernes.", itemKode(it), itemNavn(it), it.o.pos.tegningId === T.id ? 'på denne tegningen' : 'på ' + fra), tt("Flytt hit")).then(ok => { if (!ok) return; st.flyttOk = it.o.id;
          lagrePos(it, { tegningId: T.id, x: Math.round(pos[0] * 10) / 10, y: Math.round(pos[1] * 10) / 10 }).then(() => toast(tt("{0} flyttet hit fra {1}", itemKode(it), it.o.pos?.tegningId === T.id ? 'forrige plassering' : fra))); st.selM = it.o.id; st.placeId = ''; rr(); });
        return; }
      lagrePos(it, { tegningId: T.id, x: Math.round(p[0] * 10) / 10, y: Math.round(p[1] * 10) / 10 }).then(() => { toast(itemKode(it) + tt(" plassert")); }); st.selM = it.o.id; const nx = (it.kind === 'v' ? [] : items).find(i => !i.o.pos && i.o.id !== it.o.id); st.placeId = nx ? nx.o.id : ''; rr(); return; }
    if (e.button === 1 || st.space || (st.tool === 'velg' && hdl == null && !zid)) { st.drag = { t: 'pan', cx: e.clientX, cy: e.clientY, vb0: { ...vb }, moved: false }; svgRef.current!.setPointerCapture(e.pointerId); return; }
    if (st.tool === 'velg') { if (st.selM) { st.selM = null; rr(); } if (hdl != null && !ro) { st.drag = { t: 'v', i: +hdl }; svgRef.current!.setPointerCapture(e.pointerId); return; } if (zid) { st.sel = zid; rr(); return; } }
    if (e.button !== 0 || ro) return;
    if (st.tool === 'tegn' || st.tool === 'flate') { const q = snap(p, st.draft[st.draft.length - 1]); if (st.draft.length >= 3 && Math.hypot(q[0] - st.draft[0][0], q[1] - st.draft[0][1]) < 12 * k()) { closePoly(); return; } st.draft.push(q); rr(); return; }
    if (st.tool === 'skala') { const q = snap(p, st.scale[0]); if (st.scale.length >= 2) st.scale = []; st.scale.push(q); if (st.scale.length === 2) setTimeout(() => (document.getElementById('scM') as HTMLInputElement)?.focus(), 30); rr(); return; }
    if (st.tool === 'maal') { const q = snap(p, st.meas[0]); if (st.meas.length >= 2) st.meas = []; st.meas.push(q); rr(); }
  };
  // Legg til komponent der det klikkes (f.eks. hver branndør), med neste løpenummer og plassering fra arealet
  const nkM2 = () => KOMP[byId('anlegg', st.nkSys)?.type || '']?.enh === 'm2';
  const nkKode = () => (st.nkKode || TFM_DEF[byId('anlegg', st.nkSys)?.type || '']?.[1] || '').toUpperCase();
  const inniAreal = (q: number[]) => T.soner.find((z: Rec) => { let inn = false; const P = z.pts; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > q[1]) !== (yj > q[1]) && q[0] < (xj - xi) * (q[1] - yi) / (yj - yi) + xi) inn = !inn; } return inn; });
  const nyKompHer = async (q: number[], flate?: number[][]) => {
    const sys = byId('anlegg', st.nkSys); if (!sys) { toast(tt("Velg først hvilket system komponentene hører til")); return; }
    if (!kanRedigereE(sys.eiendomId)) { toast(tt("Du har ikke tilgang til å legge til komponenter på dette bygget")); return; }
    const kode = nkKode(); if (!kode) { toast(tt("Velg komponenttype (TFM-kode) til høyre")); return; }
    const z = inniAreal(q); const lop = nextKompLop(sys.id, kode);
    const ny: Rec = { anleggId: sys.id, eiendomId: sys.eiendomId, kode, lop, navn: st.nkNavn.trim(), plassering: [T.navn, z?.navn].filter(Boolean).join(' – '), pos: { tegningId: T.id, x: Math.round(q[0] * 10) / 10, y: Math.round(q[1] * 10) / 10 } } as any;
    if (flate) { const r = mpp(T)!; const a2 = Math.round(polyArea(flate) * r * r * 10) / 10; ny.mengde = a2; ny.arealMaaling = { tegningId: T.id, flater: [flate], m2: a2 }; if (sys.kostMetode === 'm2' && sys.m2pris) { ny.kostMetode = 'm2'; ny.m2pris = sys.m2pris; } }
    try { const id = await save('komponenter', ny); st.nkLagt = [...st.nkLagt, id]; st.selM = id; rr(); toast(tt("-{0}{1} lagt til{2}{3}", kode, pad(lop), flate ? ' – ' + m2(ny.mengde) : '', z?.navn ? ' i ' + z.navn : '')); }
    catch (e: any) { toast(e?.message || tt("Kunne ikke lagre komponenten")); }
  };
  const onMove = (e: React.PointerEvent) => {
    st.shift = e.shiftKey; const p = pt(e);
    if (st.drag?.t === 'pan') { const r = svgRef.current!.getBoundingClientRect(); const v0 = st.drag.vb0; const kk = Math.max(v0.w / r.width, v0.h / r.height); setVb({ ...v0, x: v0.x - (e.clientX - st.drag.cx) * kk, y: v0.y - (e.clientY - st.drag.cy) * kk }); if (Math.abs(e.clientX - st.drag.cx) + Math.abs(e.clientY - st.drag.cy) > 4) st.drag.moved = true; return; }
    if (st.drag?.t === 'm') { if (Math.abs(e.clientX - st.drag.cx) + Math.abs(e.clientY - st.drag.cy) > 4) st.drag.moved = true; if (st.drag.moved) { st.mpos = p; rr(); } return; }
    if (st.drag?.t === 'v') { const z = T.soner.find((z: Rec) => z.id === st.sel); if (z) { const n = z.pts.length; z.pts[st.drag.i] = snap(p, z.pts[(st.drag.i + n - 1) % n], { z: z.id, i: st.drag.i }); rr(); } return; }
    const ref = st.tool === 'tegn' || st.tool === 'flate' ? st.draft[st.draft.length - 1] : st.tool === 'skala' ? (st.scale.length === 1 ? st.scale[0] : null) : st.tool === 'maal' ? (st.meas.length === 1 ? st.meas[0] : null) : null;
    if (st.tool !== 'velg') { st.hover = snap(p, ref); rr(); }
  };
  const onUp = () => {
    if (st.drag?.t === 'm') { const it = findItem(st.drag.id); if (it && st.drag.moved && st.mpos) { const pos = { tegningId: T.id, x: Math.round(st.mpos[0] * 10) / 10, y: Math.round(st.mpos[1] * 10) / 10 }; it.o.pos = pos; lagrePos(it, pos); } st.mpos = null; st.drag = null; rr(); return; }
    if (st.drag?.t === 'v') { const z = T.soner.find((z: Rec) => z.id === st.sel); if (z) z.pts[st.drag.i] = z.pts[st.drag.i].map((v: number) => Math.round(v * 10) / 10); change(); }
    if (st.drag?.t === 'pan' && !st.drag.moved && st.tool === 'velg' && st.sel) { st.sel = null; rr(); }
    st.drag = null;
  };
  const saveScale = () => { const v = parseFloat(scM.replace(',', '.')); if (!(v > 0)) { toast(tt("Skriv inn lengden i meter")); return; } T.skala = { a: st.scale[0], b: st.scale[1], m: v }; st.scale = []; st.tool = maalMode ? 'flate' : 'tegn'; setScM(''); change(); toast(maalMode ? tt("Målestokk satt – tegn flaten som skal måles") : tt("Målestokk satt – nå kan du tegne arealer")); };

  const kk = k(), fs = 13 * kk, r = 5 * kk; const r0 = mpp(T); const fmtM = (v: number) => v.toLocaleString(lokale(), { maximumFractionDigits: 2 }) + ' m';
  const line = (a: number[], b: number[], col: string, dash: boolean, lbl: string, key: string) => <g key={key} pointerEvents="none"><line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={col} strokeWidth={2.5} vectorEffect="non-scaling-stroke" strokeDasharray={dash ? '6 4' : undefined} />{[a, b].map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={r} fill={col} />)}{lbl && <text x={(a[0] + b[0]) / 2} y={(a[1] + b[1]) / 2 - fs * .6} textAnchor="middle" fontSize={fs} fontWeight={600} fill={col} stroke="#fff" strokeWidth={3 * kk} paintOrder="stroke">{lbl}</text>}</g>;
  const selZ = T.soner.find((z: Rec) => z.id === st.sel);
  const sum: Record<string, number> = {}; T.soner.forEach((z: Rec) => { sum[z.kat] = (sum[z.kat] || 0) + (zoneArea(T, z) || 0); });

  return <div className="modal plan" role="dialog" aria-modal="true">
    <div className="mh"><h2>{eNavn(T.eiendomId)} · {T.navn}</h2><span className="small muted">{ro ? tt("Lesetilgang") : st.status}</span><button className="btn sm" onClick={done}>{tt("Ferdig")}</button></div>
    <div className="pbody">
      <div className="ptools">
        {(maalMode ? ['velg', 'skala', 'flate', 'maal'] as const : ['velg', 'skala', 'tegn', 'maal', 'plasser', 'nykomp'] as const).filter(t => !ro || t === 'velg' || t === 'maal').map(t => <button key={t} className={st.tool === t ? 'on' : ''} onClick={() => setTool(t)}>{({ velg: 'Velg / panorer', skala: 'Sett målestokk', tegn: 'Tegn areal', flate: 'Tegn flate som skal måles', maal: 'Mål avstand', plasser: 'Plasser system/komponent', nykomp: 'Legg til komponenter' } as any)[t]}</button>)}
        <hr /><div className="small" style={{ fontWeight: 600 }}>{tt("Vis på tegningen")}</div>
        <label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={st.lagA} onChange={e => { st.lagA = e.target.checked; rr(); }} />{tt("Arealer")}</label>
        <label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={st.lagM} onChange={e => { st.lagM = e.target.checked; rr(); }} />{tt("Systemer og komponenter")}</label>
        <label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={st.lagV} onChange={e => { st.lagV = e.target.checked; rr(); }} />{tt("Avvik")}</label>
        <select value={st.fag} onChange={e => { st.fag = e.target.value; rr(); }} style={{ border: '1px solid var(--line2)', borderRadius: 7, padding: '5px 6px', fontSize: 12.5 }}><option value="">{tt("Alle fag")}</option>{FAG.map(f => <option key={f[0]} value={f[0]}>{f[0]} {f[1]}</option>)}</select>
        <select value={st.tagg} onChange={e => { st.tagg = e.target.value; rr(); }} style={{ border: '1px solid var(--line2)', borderRadius: 7, padding: '5px 6px', fontSize: 12.5, marginTop: 4, color: st.tagg ? taggFarge(st.tagg) : undefined, fontWeight: st.tagg ? 600 : 400 }}><option value="">{tt("Alle tagger")}</option>{[...new Set([...TAGGER.map(t => t[0]), ...brukteTagger])].map(t => <option key={t} value={t}>{t}{brukteTagger.includes(t) ? '' : tt(" (ingen her)")}</option>)}</select>
        <select value={st.tgF} onChange={e => { st.tgF = e.target.value; rr(); }} style={{ border: '1px solid var(--line2)', borderRadius: 7, padding: '5px 6px', fontSize: 12.5, marginTop: 4, fontWeight: st.tgF ? 600 : 400 }}><option value="">{tt("Alle tilstandsgrader")}</option><option value="TG3">{tt("Bare TG3")}</option><option value="TG23">{tt("TG2 og TG3")}</option><option value="TG1">{tt("TG1")}</option><option value="TG0">{tt("TG0")}</option><option value="TGIU">{tt("TGIU – ikke undersøkt")}</option><option value="ingen">{tt("Ikke vurdert")}</option></select>
        {st.fokus.size > 0 && <button className="btn sm" style={{ marginTop: 4 }} onClick={() => { st.fokus = new Set(); rr(); }}>{tt("Fjern utheving")}</button>}
        <hr /><button onClick={() => setVb({ x: 0, y: 0, w: T.w, h: T.h })}>{tt("Tilpass til vindu")}</button><div className="phelp">{HELP[st.tool]}</div>
      </div>
      <div className="pcanvas"><svg ref={svgRef} className={st.tool === 'velg' ? 'pan' : ''} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
        onDoubleClick={() => { if (st.tool === 'tegn' || st.tool === 'flate' || (st.tool === 'nykomp' && st.draft.length)) { if (st.draft.length > 3) st.draft.pop(); closePoly(); } }} onPointerLeave={() => { st.hover = null; if (st.tool !== 'velg') rr(); }} fontFamily="IBM Plex Sans,sans-serif">
        {src && <image href={src} x={0} y={0} width={T.w} height={T.h} />}
        {st.lagA && T.soner.map((z: Rec) => { const c = zoneColor(T, z); const on = z.id === st.sel; return <polygon key={z.id} points={z.pts.map((p: number[]) => p.join(',')).join(' ')} fill={c} fillOpacity={on ? .38 : .24} stroke={c} strokeWidth={on ? 3 : 1.6} vectorEffect="non-scaling-stroke" data-z={z.id} style={{ cursor: 'pointer' }} />; })}
        {st.lagA && T.soner.map((z: Rec) => { const c = centroid(z.pts); const a = zoneArea(T, z); let lt = z.kat === 'leie' && z.leietakerId ? lNavn(z.leietakerId) : ''; if (lt === z.navn) lt = '';
          return <g key={'l' + z.id} pointerEvents="none"><text x={c[0]} y={c[1]} textAnchor="middle" fontSize={fs} fontWeight={600} fill="#1d2320" stroke="#fff" strokeWidth={3 * kk} paintOrder="stroke">{z.navn}</text>
            <text x={c[0]} y={c[1] + fs * 1.25} textAnchor="middle" fontSize={fs * .9} fill="#1d2320" stroke="#fff" strokeWidth={3 * kk} paintOrder="stroke">{(lt ? lt + ' · ' : '') + (a != null ? m2(a) : tt("mangler målestokk"))}</text></g>; })}
        {maalMode && st.flater.map((f: number[][], fi: number) => { const c = centroid(f); return <g key={'fl' + fi} pointerEvents="none"><polygon points={f.map(p => p.join(',')).join(' ')} fill="#b54708" fillOpacity={.28} stroke="#b54708" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
          <text x={c[0]} y={c[1]} textAnchor="middle" fontSize={fs} fontWeight={700} fill="#7a2e00" stroke="#fff" strokeWidth={3 * kk} paintOrder="stroke">{tt("Flate ") + (fi + 1) + ': ' + m2(flateM2(f))}</text></g>; })}
        {st.lagM && !maalMode && items.filter(i => i.o.arealMaaling?.tegningId === T.id && (!st.fag || itemFag(i) === st.fag)).map(i => { const col = fagFarge(itemFag(i)); const F: number[][][] = i.o.arealMaaling.flater || [];
          const big = F.slice().sort((x, y) => polyArea(y) - polyArea(x))[0]; const c = big ? centroid(big) : null;
          return <g key={'am' + i.o.id} pointerEvents="none">{F.map((f, fi) => <polygon key={fi} points={f.map(p => p.join(',')).join(' ')} fill={col} fillOpacity={st.selM === i.o.id ? .28 : .13} stroke={col} strokeWidth={1.5} strokeDasharray="5 3" vectorEffect="non-scaling-stroke" />)}
            {c && <text x={c[0]} y={c[1] + fs * 1.9} textAnchor="middle" fontSize={fs * .9} fontWeight={700} fill={col} stroke="#fff" strokeWidth={3 * kk} paintOrder="stroke">{m2(i.o.arealMaaling.m2)}</text>}</g>; })}
        {st.lagM && markers.map(i => { const isDrag = st.drag?.t === 'm' && st.drag.id === i.o.id && st.mpos; const x = isDrag ? st.mpos![0] : i.o.pos.x, y = isDrag ? st.mpos![1] : i.o.pos.y; const col = fagFarge(itemFag(i)); const on = st.selM === i.o.id || st.fokus.has(i.o.id);
          const av = openAvvik().filter(a => i.kind === 'a' ? a.anleggId === i.o.id && !a.komponentId : a.komponentId === i.o.id).length; const R0 = (i.kind === 'a' ? 8 : 6) * kk;
          return <g key={'m' + i.o.id} data-m={i.o.id} style={{ cursor: ro ? 'pointer' : 'move' }} onPointerEnter={tipOn(i)} onPointerMove={tipMove} onPointerLeave={tipOff}>
            {on && <circle cx={x} cy={y} r={R0 * 2.1} fill={col} fillOpacity={.18} />}
            {av > 0 && <circle cx={x} cy={y} r={R0 * 1.55} fill="none" stroke="#b42318" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />}
            {i.kind === 'a' ? <rect x={x - R0} y={y - R0} width={R0 * 2} height={R0 * 2} rx={R0 * .3} fill={col} stroke="#fff" strokeWidth={2} vectorEffect="non-scaling-stroke" /> : <circle cx={x} cy={y} r={R0} fill={col} stroke="#fff" strokeWidth={2} vectorEffect="non-scaling-stroke" />}
            <text x={x} y={y - R0 - 4 * kk} textAnchor="middle" fontSize={fs * .85} fontFamily="IBM Plex Mono,monospace" fontWeight={600} fill={col} stroke="#fff" strokeWidth={3 * kk} paintOrder="stroke">{itemKode(i)}{['TG2', 'TG3'].includes(i.o.tg) && <tspan fill={i.o.tg === 'TG3' ? '#b42318' : '#b07a00'}> {i.o.tg}</tspan>}</text></g>; })}
        {st.lagV && avMarkers.map(i => { const isDrag = st.drag?.t === 'm' && st.drag.id === i.o.id && st.mpos; const x = isDrag ? st.mpos![0] : i.o.pos.x, y = isDrag ? st.mpos![1] : i.o.pos.y; const on = st.selM === i.o.id || st.fokus.has(i.o.id); const R0 = 10 * kk; const lukket = AV_LUKKET.includes(i.o.status); const col = lukket ? '#1f6f5c' : i.o.status === 'Utført – til kontroll' ? '#b07a00' : '#b42318';
          return <g key={'v' + i.o.id} data-m={i.o.id} style={{ cursor: ro ? 'pointer' : 'move' }} onPointerEnter={tipOn(i)} onPointerMove={tipMove} onPointerLeave={tipOff}>
            {on && <circle cx={x} cy={y - R0 * .2} r={R0 * 2.2} fill={col} fillOpacity={.18} />}
            <path d={`M${x} ${y - R0 * 1.25} L${x + R0 * 1.15} ${y + R0 * .75} L${x - R0 * 1.15} ${y + R0 * .75} Z`} fill={col} stroke="#fff" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            <text x={x} y={y + R0 * .5} textAnchor="middle" fontSize={R0 * 1.25} fontWeight={700} fill="#fff" fontFamily="IBM Plex Sans,sans-serif">!</text>
            <text x={x} y={y - R0 * 1.25 - 4 * kk} textAnchor="middle" fontSize={fs * .85} fontWeight={700} fill={col} stroke="#fff" strokeWidth={3 * kk} paintOrder="stroke">#{i.o.nr}</text></g>; })}
        {((st.tool === 'plasser' && st.placeId) || (st.tool === 'nykomp' && st.nkSys)) && st.hover && <g pointerEvents="none"><line x1={st.hover[0] - 12 * kk} y1={st.hover[1]} x2={st.hover[0] + 12 * kk} y2={st.hover[1]} stroke="#1d2320" strokeWidth={1.5} vectorEffect="non-scaling-stroke" /><line x1={st.hover[0]} y1={st.hover[1] - 12 * kk} x2={st.hover[0]} y2={st.hover[1] + 12 * kk} stroke="#1d2320" strokeWidth={1.5} vectorEffect="non-scaling-stroke" /><text x={st.hover[0] + 10 * kk} y={st.hover[1] - 8 * kk} fontSize={fs * .85} fontFamily="IBM Plex Mono,monospace" fill="#1d2320" stroke="#fff" strokeWidth={3 * kk} paintOrder="stroke">{findItem(st.placeId) ? itemKode(findItem(st.placeId)!) : ''}</text></g>}
        {selZ && st.tool === 'velg' && !ro && selZ.pts.map((p: number[], i: number) => <circle key={'h' + i} cx={p[0]} cy={p[1]} r={r * 1.2} fill="#fff" stroke={zoneColor(T, selZ)} strokeWidth={2} vectorEffect="non-scaling-stroke" data-h={i} style={{ cursor: 'move' }} />)}
        {T.skala && (st.tool === 'skala' || !st.sel) && !st.scale.length && line(T.skala.a, T.skala.b, '#b42318', true, 'Målestokk ' + fmtM(T.skala.m), 'sk')}
        {st.scale.length > 0 && (st.scale[1] || st.hover) && line(st.scale[0], st.scale[1] || st.hover!, '#b42318', true, '', 'sc')}
        {st.meas.length > 0 && (st.meas[1] || st.hover) && (() => { const b = st.meas[1] || st.hover!; return line(st.meas[0], b, '#2457a6', false, r0 ? fmtM(Math.hypot(b[0] - st.meas[0][0], b[1] - st.meas[0][1]) * r0) : 'sett målestokk', 'ms'); })()}
        {st.draft.length > 0 && <g pointerEvents="none"><polyline points={[...st.draft, ...(st.hover ? [st.hover] : [])].map(p => p.join(',')).join(' ')} fill="rgba(31,111,92,.15)" stroke="#1f6f5c" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          {st.draft.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={i === 0 ? r * 1.5 : r} fill={i === 0 ? '#fff' : '#1f6f5c'} stroke="#1f6f5c" strokeWidth={2} vectorEffect="non-scaling-stroke" />)}
          {st.hover && r0 && <text x={st.hover[0] + 10 * kk} y={st.hover[1] - 10 * kk} fontSize={fs * .9} fill="#1f6f5c" stroke="#fff" strokeWidth={3 * kk} paintOrder="stroke">{fmtM(Math.hypot(st.hover[0] - st.draft[st.draft.length - 1][0], st.hover[1] - st.draft[st.draft.length - 1][1]) * r0)}</text>}</g>}
        {!st.draft.length && st.hover && st.tool !== 'velg' && <circle cx={st.hover[0]} cy={st.hover[1]} r={r} fill="none" stroke="#1f6f5c" strokeWidth={2} vectorEffect="non-scaling-stroke" pointerEvents="none" />}
      </svg>
      {tip && (() => { const i = tip.i; const sys = i.kind === 'k' ? byId('anlegg', i.o.anleggId) : i.kind === 'v' ? byId('anlegg', i.o.anleggId) : null; const kc = i.kind === 'v' && i.o.komponentId ? byId('komponenter', i.o.komponentId) : null;
        const kode = i.kind === 'a' ? tfmSys(i.o, true) : i.kind === 'k' ? tfmKomp(i.o, true) : '#' + (i.o.nr || '');
        const ekstra = i.kind === 'v' ? [i.o.status, i.o.alv].filter(Boolean).join(' · ') : [i.o.fabrikat, i.o.tg].filter(Boolean).join(' · ');
        const left = Math.min(tip.x + 14, window.innerWidth - 320), top = tip.y + 16 > window.innerHeight - 90 ? tip.y - 80 : tip.y + 16;
        return createPortal(<div className="plan-tip" style={{ left, top }}>
          <div className="mono" style={{ fontWeight: 700, color: i.kind === 'v' ? '#b42318' : fagFarge(itemFag(i)) }}>{kode || tt("(uten TFM-kode)")}</div>
          <div style={{ fontWeight: 600 }}>{itemNavn(i)}</div>
          {i.kind === 'k' && sys && <div className="muted">i {tfmSys(sys)} {sys.navn || KOMP[sys.type]?.n}</div>}
          {i.kind === 'v' && (kc || sys) && <div className="muted mono">{kc ? tfmKomp(kc) : tfmSys(sys!) + ' ' + (sys!.navn || KOMP[sys!.type]?.n || '')}</div>}
          {ekstra && <div className="muted">{ekstra}</div>}
        </div>, document.body); })()}
      </div>
      <div className="pside">
        {maalMode && (() => { const sum = st.flater.reduce((s0: number, f: number[][]) => s0 + flateM2(f), 0); return <><h3>{tt("Mål areal")}</h3>
          <div className="note small" style={{ color: 'var(--ink)' }}><b>{opts.maal!.tittel}</b><br />{T.skala ? tt("Velg «Tegn flate», klikk hjørnene og avslutt ved å klikke på første punkt (eller Enter). Tegn flere flater ved behov – de summeres.") : tt("Tegningen mangler målestokk. Klikk to punkter med kjent avstand og skriv inn lengden først.")}</div>
          {st.flater.map((f: number[][], fi: number) => <div key={fi} className="zl" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span className="grow">{tt("Flate")} {fi + 1}</span><b className="mono">{m2(flateM2(f))}</b><button className="btn ghost sm" title={tt("Fjern flaten")} onClick={() => { st.flater.splice(fi, 1); rr(); }}>✕</button></div>)}
          <p style={{ margin: '8px 0' }}>{tt("Sum:")} <b className="mono" style={{ fontSize: 16 }}>{m2(sum)}</b></p>
          <button className="btn pri" disabled={!sum} style={{ width: '100%' }} onClick={() => { opts.maal!.onFerdig({ tegningId: T.id, flater: clone(st.flater), m2: Math.round(sum * 10) / 10 }); flush(); close(); }}>{tt("Bruk")} {m2(sum)}</button>
          <hr style={{ margin: '14px 0', border: 0, borderTop: '1px solid var(--line)' }} /></>; })()}
        {st.tool === 'nykomp' && (() => { const SY = sortBy(S.anlegg.filter(a => a.eiendomId === T.eiendomId), a => aNavn(a.id)); const kode = nkKode(); const sel = { width: '100%', marginBottom: 6 } as React.CSSProperties;
          const lagt = st.nkLagt.map(id => byId('komponenter', id)).filter(Boolean) as Rec[];
          return <><h3>{tt("Legg til komponenter")}</h3>
            {!SY.length ? <p className="small muted">{tt("Eiendommen har ingen systemer ennå.")} <a href="#" onClick={e => { e.preventDefault(); editAnlegg(undefined, T.eiendomId); }}>{tt("Registrer et system")}</a> {tt("først, f.eks. «Branndører/brannskiller».")}</p> : <>
              <label className="small">{tt("System")}</label>
              <select style={sel} value={st.nkSys} onChange={e => { st.nkSys = e.target.value; st.nkKode = ''; rr(); }}><option value="">{tt("– velg system –")}</option>{SY.map(a => <option key={a.id} value={a.id}>{aNavn(a.id)}</option>)}</select>
              <label className="small">{tt("Komponenttype (TFM-kode)")}</label>
              <select style={sel} value={kode} onChange={e => { st.nkKode = e.target.value; rr(); }}><option value="">{tt("– velg –")}</option>{TFM_KODER.map(([c, n]) => <option key={c} value={c}>{c} – {n}</option>)}</select>
              <label className="small">{tt("Betegnelse (valgfritt)")}</label>
              <input style={sel} value={st.nkNavn} onChange={e => { st.nkNavn = e.target.value; rr(); }} placeholder={TFM_KODER.find(c => c[0] === kode)?.[1] || tt("F.eks. Branndør EI60")} />
              <p className="small muted" style={{ margin: '2px 0 8px' }}>{st.nkSys && kode ? <>{nkM2() ? <>{tt("Systemet måles i m²:")} <b>{tt("tegn flaten")}</b> {tt("for hver komponent – klikk hjørnene og avslutt på første punkt (eller Enter). Arealet lagres på komponenten.")}{!mpp(T) && <span style={{ color: 'var(--amber)' }}> {tt("Tegningen mangler målestokk.")}</span>}</> : tt("Klikk på tegningen der hver komponent står.")} {tt("Neste blir")} <b className="mono">-{kode}{nextKompLop(st.nkSys, kode)}</b>.</> : tt("Velg system og type, og klikk så på tegningen.")}</p>
              {lagt.length > 0 && <div className="note small" style={{ color: 'var(--ink)' }}><b>{tt("Lagt til nå:")} {lagt.length}{lagt.some(k => +k.mengde > 0) ? tt(" · {0}", m2(lagt.reduce((s0, k) => s0 + (+k.mengde || 0), 0))) : ''}</b>
                <div style={{ maxHeight: 160, overflow: 'auto', margin: '4px 0' }}>{lagt.slice().reverse().map(k => <div key={k.id}><a href="#" onClick={e => { e.preventDefault(); editKomponent(k.id); }} className="mono">-{k.kode}{pad(k.lop)}</a> <span className="muted">{+k.mengde > 0 ? m2(k.mengde) + ' · ' : ''}{k.plassering}</span></div>)}</div>
                <button className="btn sm" onClick={async () => { const id = st.nkLagt[st.nkLagt.length - 1]; if (!id) return; await removeDoc('komponenter', id); st.nkLagt = st.nkLagt.slice(0, -1); if (st.selM === id) st.selM = null; rr(); toast(tt("Siste komponent fjernet")); }}>{tt("Angre siste")}</button></div>}
              <p className="small muted">{tt("Klikk på en markør for å se eller flytte den. Fabrikat, brannklasse og annet kan fylles ut senere i komponenten.")}</p></>}
            <hr style={{ margin: '14px 0', border: 0, borderTop: '1px solid var(--line)' }} /></>; })()}
        {st.tool === 'plasser' && <><h3>{tt("Plasser på tegningen")}</h3>
          {items.length + avItems.length ? <><select value={st.placeId} onChange={e => { st.placeId = e.target.value; st.flyttOk = ''; rr(); }}><option value="">{tt("– velg system, komponent eller avvik –")}</option>
            {(() => { const vis = (i: MItem) => st.visPlassert || !i.o.pos || i.o.id === st.placeId; const lab = (i: MItem) => i.o.pos ? (i.o.pos.tegningId === T.id ? ' – plassert her (flyttes)' : ` – plassert på ${byId('tegninger', i.o.pos.tegningId)?.navn || 'annen tegning'} (flyttes)`) : ''; const A = avItems.filter(vis), I = items.filter(vis);
              return <>{A.length > 0 && <optgroup label={tt("Åpne avvik")}>{A.map(i => <option key={i.o.id} value={i.o.id}>{itemKode(i) + ' ' + itemNavn(i) + lab(i)}</option>)}</optgroup>}
                {I.length > 0 && <optgroup label={st.visPlassert ? tt("Systemer og komponenter") : tt("Systemer og komponenter som ikke er plassert")}>{I.map(i => <option key={i.o.id} value={i.o.id}>{(i.kind === 'k' ? '   ' : '') + itemKode(i) + ' ' + itemNavn(i) + lab(i)}</option>)}</optgroup>}
                {!A.length && !I.length && <option disabled>{tt("Alt er plassert – kryss av for å vise plasserte")}</option>}</>; })()}</select>
            <label className="small" style={{ display: 'flex', gap: 6, alignItems: 'flex-start', margin: '4px 0 6px', fontWeight: 400 }}><input type="checkbox" style={{ width: 'auto', margin: '2px 0 0' }} checked={st.visPlassert} onChange={e => { st.visPlassert = e.target.checked; if (!e.target.checked && findItem(st.placeId)?.o.pos && st.flyttOk !== st.placeId) st.placeId = ''; rr(); }} />{tt("Vis også plasserte (flyttes fra forrige plassering)")}</label>
            {(() => { const it = findItem(st.placeId); if (!it?.o.pos) return null; const fra = it.o.pos.tegningId === T.id ? 'denne tegningen' : byId('tegninger', it.o.pos.tegningId)?.navn || 'en annen tegning'; return <div className="note small" style={{ color: 'var(--amber)', margin: '0 0 8px' }}>⚠ {itemKode(it)} {tt("er allerede plassert på")} {fra}{tt(". Klikker du på tegningen, flyttes den hit og den forrige plasseringen fjernes.")}</div>; })()}
            <p className="small muted" style={{ margin: '0 0 8px' }}>{st.placeId ? tt("Klikk på tegningen der den skal stå.") + (findItem(st.placeId)?.kind !== 'v' ? tt(" Neste uplasserte velges automatisk.") : '') : tt("Velg hva som skal plasseres.")} {items.filter(i => !i.o.pos).length} {tt("av")} {items.length} {tt("systemer/komponenter og")} {avItems.filter(i => !i.o.pos).length} {tt("av")} {avItems.length} {tt("åpne avvik er ikke plassert.")}</p></>
            : <p className="small muted">{tt("Ingen systemer eller åpne avvik på eiendommen.")}</p>}</>}
        {(() => { const i = findItem(st.selM); if (!i || i.kind !== 'v') return null; const a = i.o; const sys = a.anleggId ? byId('anlegg', a.anleggId) : null; const kc = a.komponentId ? byId('komponenter', a.komponentId) : null; const tp = a.tildeltId ? S.profiles.find(p => p.id === a.tildeltId) : null;
          return <><h3>{tt("Avvik #")}{a.nr}</h3>
            <div className="note small" style={{ color: 'var(--ink)' }}><b>{a.tittel}</b><div style={{ display: 'flex', gap: 4, margin: '4px 0' }}><AlvChip a={a.alv} /><StChip s={a.status} /></div>
              {(kc || sys || a.ao?.system) && <div className="mono muted">{kc ? tfmKomp(kc) : sys ? tfmSys(sys) + ' ' + (sys.navn || KOMP[sys.type]?.n) : a.ao?.system}</div>}
              {(tp || a.tildeltId) && <div className="muted">{tt("Tildelt:")} {tp ? tp.navn || tp.epost : a.tildeltId === state.me?.id ? tt("deg") : tt("bruker")}</div>}
              {a.frist && <div className="muted">{tt("Frist:")} {a.frist.split('-').reverse().join('.')}</div>}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}><button className="btn sm" onClick={() => isUtforer() ? (close(), location.hash = '#/arbeidsordre/' + a.id) : editAvvik(a.id)}>{tt("Åpne")}</button>
              {!ro && <button className="btn sm" onClick={() => { st.tool = 'plasser'; st.placeId = a.id; st.flyttOk = a.id; rr(); }}>{tt("Flytt")}</button>}
              {!ro && <button className="btn sm danger" onClick={async () => { await lagrePos(i, null); st.selM = null; rr(); }}>{tt("Fjern fra tegning")}</button>}</div></>; })()}
        {(() => { const i = findItem(st.selM); if (!i || i.kind === 'v') return null; const av = openAvvik().filter(a => i.kind === 'a' ? a.anleggId === i.o.id && !a.komponentId : a.komponentId === i.o.id); const sys = i.kind === 'k' ? byId('anlegg', i.o.anleggId) : null; const info = [i.o.fabrikat, i.o.plassering, i.o.aar ? 'installert ' + i.o.aar : '', i.o.tg].filter(Boolean);
          return <><h3>{i.kind === 'a' ? tt("System") : tt("Komponent")}</h3>
            <div className="note small" style={{ color: 'var(--ink)' }}><b className="mono" style={{ color: fagFarge(itemFag(i)) }}>{i.kind === 'a' ? tfmSys(i.o, true) : tfmKomp(i.o, true)}</b><br /><b>{itemNavn(i)}</b>{sys && <div className="muted">i {tfmSys(sys)} {sys.navn || KOMP[sys.type]?.n}</div>}
              {info.length > 0 && <div className="muted">{info.join(' · ')}</div>}{itemTagger(i).length > 0 && <div style={{ marginTop: 4 }}><TaggChips t={itemTagger(i)} small /></div>}
              {av.length > 0 && <div style={{ color: 'var(--red)', marginTop: 4 }}>{av.length} {tt("åpne avvik:")} {av.slice(0, 3).map(a => '#' + a.nr + ' ' + a.tittel).join(', ')}</div>}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}><button className="btn sm" onClick={() => i.kind === 'a' ? editAnlegg(i.o.id) : editKomponent(i.o.id)}>{tt("Åpne")}</button>
              {!ro && <button className="btn sm" onClick={() => { st.tool = 'plasser'; st.placeId = i.o.id; st.flyttOk = i.o.id; rr(); }}>{tt("Flytt")}</button>}
              {!ro && <button className="btn sm danger" onClick={async () => { await lagrePos(i, null); st.selM = null; rr(); }}>{tt("Fjern fra tegning")}</button>}</div></>; })()}
        {st.lagM && markers.length > 0 && <><h3>{tt("Tegnforklaring")}</h3><div className="small">{FAG.filter(f => markers.some(m => itemFag(m) === f[0])).map(f => <div key={f[0]} style={{ display: 'flex', gap: 6, alignItems: 'center' }}><span className="sw" style={{ background: f[2] }} />{f[0]} {f[1]}</div>)}<div className="muted" style={{ marginTop: 4 }}>{tt("■ system · ● komponent · rød ring = åpne avvik")}</div></div></>}
        {st.lagV && avMarkers.length > 0 && <div className="small" style={{ marginTop: 6 }}><span style={{ color: '#b42318' }}>▲</span> {tt("åpent avvik ·")} <span style={{ color: '#b07a00' }}>▲</span> {tt("utført, til kontroll")}</div>}
        {T.cad?.svg && !ro && <div style={{ marginTop: 12 }}><button className="btn sm" onClick={() => dwgLag(T.id)}>{tt("Lag i DWG (")}{(T.cad.lag || []).length}){(T.cad.skjult || []).length ? tt(" · {0} skjult", (T.cad.skjult || []).length) : ''}</button></div>}
        <h3>{tt("Målestokk")}</h3>
        {st.scale.length === 2 ? <><label className="small">{tt("Lengde mellom punktene (meter)")}</label><input id="scM" type="number" step="any" placeholder={tt("F.eks. 12.4")} value={scM} onChange={e => setScM(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveScale(); }} />
          <div style={{ display: 'flex', gap: 6 }}><button className="btn sm pri" onClick={saveScale}>{tt("Lagre målestokk")}</button><button className="btn sm" onClick={() => { st.scale = []; rr(); }}>{tt("Avbryt")}</button></div></>
          : r0 ? <p className="small" style={{ margin: 0 }}>{tt("Referanse")} {fmtM(T.skala.m)} {tt("· 1 piksel =")} {(r0 * 1000).toLocaleString(lokale(), { maximumFractionDigits: 1 })} {tt("mm")}</p>
          : <p className="small" style={{ margin: 0, color: 'var(--amber)' }}>{tt("Ikke satt.")}{!ro && tt(" Velg «Sett målestokk» og klikk to punkter med kjent avstand.")}</p>}
        {st.meas.length === 2 && r0 && <><h3>{tt("Måling")}</h3><p className="mono" style={{ margin: 0 }}>{fmtM(Math.hypot(st.meas[1][0] - st.meas[0][0], st.meas[1][1] - st.meas[0][1]) * r0)}</p></>}
        {selZ && <><h3>{tt("Valgt areal")}</h3>
          <label className="small">{tt("Navn")}</label><input id="zN" value={selZ.navn || ''} readOnly={ro} onChange={e => { selZ.navn = e.target.value; change(); }} placeholder={tt("F.eks. Kontor 2. etg vest")} />
          <label className="small">{tt("Kategori")}</label><select value={selZ.kat} disabled={ro} onChange={e => { selZ.kat = e.target.value; change(); }}>{AREAL_KAT.map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select>
          {selZ.kat === 'leie' && <><label className="small">{tt("Leietaker")}</label><select value={selZ.leietakerId || ''} disabled={ro} onChange={e => { selZ.leietakerId = e.target.value; if (!selZ.navn || selZ.navn.startsWith('Areal ')) selZ.navn = lNavn(selZ.leietakerId); change(); }}><option value="">{tt("– velg leietaker –")}</option>{L.map(l => <option key={l.id} value={l.id}>{l.navn}</option>)}</select></>}
          <p style={{ margin: '2px 0 8px' }}>{tt("Areal:")} <b className="mono">{m2(zoneArea(T, selZ))}</b> <span className="muted small">({selZ.pts.length} {tt("hjørner)")}</span></p>
          {!ro && <button className="btn sm danger" onClick={() => { T.soner = T.soner.filter((q: Rec) => q.id !== selZ.id); st.sel = null; change(); }}>{tt("Slett areal")}</button>}</>}
        <h3>{tt("Arealer på tegningen")}</h3>
        {T.soner.length ? <>{T.soner.map((z: Rec) => { const a = zoneArea(T, z); return <div key={z.id} className={'zl ' + (z.id === st.sel ? 'on' : '')} onClick={() => { st.sel = z.id; st.tool = 'velg'; rr(); }}>
          <span className="sw" style={{ background: zoneColor(T, z) }} /><span style={{ flex: 1, minWidth: 0 }}><b style={{ fontWeight: 500 }}>{z.navn || tt("Uten navn")}</b><br /><span className="muted small">{z.kat === 'leie' ? (lNavn(z.leietakerId) || tt("Ingen leietaker valgt")) : AREAL_KAT.find(c => c[0] === z.kat)?.[1]}</span></span><span className="mono small">{a != null ? m2(a) : '–'}</span></div>; })}
          {r0 && <div className="small" style={{ marginTop: 10 }}>{AREAL_KAT.filter(c => sum[c[0]]).map(c => <div key={c[0]} style={{ display: 'flex', justifyContent: 'space-between' }}><span className="muted">{c[1]}</span><span className="mono">{m2(sum[c[0]])}</span></div>)}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, borderTop: '1px solid var(--line)', marginTop: 4, paddingTop: 4 }}><span>{tt("Sum oppmålt")}</span><span className="mono">{m2(Object.values(sum).reduce((a, b) => a + b, 0))}</span></div></div>}</>
          : <p className="muted small">{tt("Ingen arealer tegnet ennå.")}{!ro && tt(" Velg «Tegn areal».")}</p>}
      </div>
    </div>
  </div>;
}

function Thumb({ t }: { t: Rec }) { const u = useFileUrl(t.fil?.path); return u ? <img src={u} alt="" /> : <span className="muted small">{tt("Laster …")}</span>; }

export function Dekning({ C }: { C: any }) {
  const d = C.dekning; const neg = d.netto < -0.05;
  return <div className="card" style={{ marginTop: 12 }}><h3 style={{ marginTop: 0 }}>{tt("Dekning av fellesareal")}</h3>
    <div className="kpis" style={{ marginBottom: 8 }}>
      <div className="kpi" style={{ cursor: 'default' }}><div className="l">{tt("Fellesareal totalt")}</div><div className="v">{m2(d.F)}</div></div>
      <div className="kpi" style={{ cursor: 'default' }}><div className="l">{tt("Fakturert leietakere")}</div><div className="v">{m2(d.fakturert)}</div><div className="s">{(d.grad * 100).toLocaleString(lokale(), { maximumFractionDigits: 1 })} {tt("% dekning")}</div></div>
      <div className={'kpi ' + (neg ? 'bad' : 'ok')} style={{ cursor: 'default' }}><div className="l">{neg ? tt("Underdekning (eier bærer)") : tt("Overdekning")}</div><div className="v">{m2(Math.abs(d.netto))}</div></div></div>
    <table className="small" style={{ width: 'auto' }}><tbody>
      <tr><td>{tt("Avvik fra kontraktfestet fellesareal")}</td><td className="num" style={{ paddingLeft: 24, color: d.avvik < 0 ? 'var(--red)' : undefined }}>{d.avvik >= 0 ? '+' : '−'}{m2(Math.abs(d.avvik))}</td></tr>
      {d.ledig > 0.05 && <tr><td>{tt("Andel som faller på ledig areal")}</td><td className="num" style={{ paddingLeft: 24, color: 'var(--red)' }}>−{m2(d.ledig)}</td></tr>}
      {d.ukjent > 0.05 && <tr><td>{tt("Andel på leieareal uten leietaker")}</td><td className="num" style={{ paddingLeft: 24, color: 'var(--red)' }}>−{m2(d.ukjent)}</td></tr>}
      {d.ikkeFordelt > 0.05 && <tr><td>{tt("Ikke fordelt (ingen leieareal i etasjen)")}</td><td className="num" style={{ paddingLeft: 24, color: 'var(--red)' }}>−{m2(d.ikkeFordelt)}</td></tr>}
      <tr style={{ fontWeight: 600 }}><td>{tt("Netto")} {neg ? tt("underdekning") : tt("overdekning")}</td><td className="num" style={{ paddingLeft: 24 }}>{d.netto >= 0 ? '+' : '−'}{m2(Math.abs(d.netto))}</td></tr>
    </tbody></table>
    <p className="small muted" style={{ marginBottom: 0 }}>{tt("Underdekning betyr fellesareal eier ikke får fakturert leietakerne (og dermed ikke får dekket felleskostnad for). Kontraktfestet fellesareal settes på leietakeren.")}</p></div>;
}

export function ArealSection({ eid }: { eid: string }) {
  useStore();
  const e = byId('eiendommer', eid); if (!e) return null; const ed = canEdit();
  const T = sortBy(S.tegninger.filter(t => t.eiendomId === eid), t => +t.etasje || 0); const C = arealCalc(eid);
  const keys = Object.keys(C.per).sort((a, b) => (+a.startsWith('_') - +b.startsWith('_')) || lNavn(a).localeCompare(lNavn(b)));
  const nm = (k: string) => k === '_ledig' ? 'Ledig areal' : k === '_ukjent' ? 'Leieareal uten leietaker' : lNavn(k) || 'Ukjent leietaker';
  const tot = C.totLeie; const ikke = C.etg.reduce((s: number, x: any) => s + (x.sum.ikke || 0), 0);
  const csv = () => { const f = (v: number) => v.toLocaleString(lokale(), { minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: false }); const rows: any[][] = [['Leietaker', 'Etasje', 'Eksklusivt areal m2', 'Andel felles etasje m2', 'Andel felles bygg m2', 'Leieareal m2', 'Andel %']]; keys.forEach(k => { const p = C.per[k]; rows.push([nm(k), p.etg.join(', '), f(p.eks), f(p.fe), f(p.fb), f(p.tot), tot ? f(p.tot / tot * 100) : '']); }); rows.push(['Sum', '', f(C.totEks), '', '', f(tot), '100']); textModal(tt("Arealoppgave – ") + e.navn, toCsv(rows)); };
  return <>
    <div className="plancards">
      {T.map(t => <div key={t.id} className="card plancard"><div className="thumb" onClick={() => openPlan(t.id)}><Thumb t={t} /></div><div className="t">{t.navn}</div>
        <div className="small muted">{mpp(t) ? tt("Målestokk satt") : <span style={{ color: 'var(--amber)' }}>{tt("Mangler målestokk")}</span>} · {(t.soner || []).length} {tt("arealer")}</div>
        <div className="small muted">{[...S.anlegg, ...S.komponenter].filter(x => x.pos?.tegningId === t.id).length} {tt("systemer/komponenter plassert")}</div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}><button className="btn sm pri" onClick={() => openPlan(t.id)}>{ed ? tt("Arealer") : tt("Åpne")}</button><button className="btn sm" onClick={() => openPlan(t.id, { mode: 'tfm' })}>{tt("Systemkart")}</button>{ed && <button className="btn sm" onClick={() => editTegning(t.id)}>{tt("Rediger")}</button>}</div></div>)}
      {ed && <button className="upcard" onClick={() => editTegning(undefined, eid)}><b style={{ fontSize: 22 }}>+</b><span>{tt("Last opp plantegning")}</span><span className="small">{tt("DWG, PDF, PNG eller JPG")}</span></button>}
      {!ed && !T.length && <div className="card"><Empty t="Ingen tegninger" /></div>}
    </div>
    <div className="sec"><div className="toolbar"><h2 style={{ margin: 0, flex: 1 }}>{tt("Arealoppgave –")} {e.navn}</h2>{keys.length > 0 && <><button className="btn sm" onClick={csv}>{tt("Kopier arealoppgave (CSV)")}</button><button className="btn sm pri" onClick={() => arealRapport(eid)}>{tt("Arealrapport (PDF)")}</button></>}</div>
      {C.unscaled > 0 && <div className="banner">{C.unscaled} {tt("tegning(er) har arealer, men mangler målestokk og er ikke med i oppgaven.")}</div>}
      {keys.length ? <div className="tbl-wrap"><table><thead><tr><th>{tt("Leietaker")}</th><th>{tt("Etasje")}</th><th className="num">{tt("Eksklusivt areal")}</th><th className="num">{tt("Andel felles etasje")}</th><th className="num">{tt("Andel felles bygg")}</th>{C.dekning.harAvtale && <th className="num">{tt("Avtalt felles")}</th>}<th className="num">{tt("Leieareal")}</th><th className="num">{tt("Andel")}</th>{ed && <th className="num">{tt("Overstyrt på leietaker")}</th>}</tr></thead><tbody>
        {keys.map(k => { const p = C.per[k]; const l = byId('leietakere', k); const ov = l && l.arealOverstyrt !== '' && l.arealOverstyrt != null && !isNaN(+l.arealOverstyrt) ? +l.arealOverstyrt : null;
          return <tr key={k} className={l && ed ? 'click' : ''} onClick={() => l && ed && go('leietaker/' + k)}><td><span className="sw" style={{ display: 'inline-block', verticalAlign: -1, marginRight: 6, background: k === '_ledig' ? KAT_FARGE.ledig : ltColor(eid, k) }} />{nm(k)}</td><td className="small">{p.etg.join(', ')}</td>
            <td className="num">{m2(p.eks)}</td><td className="num">{m2(p.fe)}</td><td className="num">{m2(p.fb)}</td>{C.dekning.harAvtale && <td className="num">{p.avtale ? <>{m2(p.felles)}<div className="small" style={{ color: p.diff < 0 ? 'var(--red)' : 'var(--green)' }}>{p.diff >= 0 ? '+' : '−'}{m2(Math.abs(p.diff))}</div></> : <span className="muted">–</span>}</td>}<td className="num" style={{ fontWeight: 600 }}>{m2(p.tot)}</td><td className="num">{tot ? (p.tot / tot * 100).toLocaleString(lokale(), { maximumFractionDigits: 1 }) + ' %' : '–'}</td>
            {ed && <td className="num">{ov !== null ? <>{m2(ov)}{Math.abs(ov - p.tot) >= 1 && <div className="small" style={{ color: 'var(--amber)' }}>{ov - p.tot > 0 ? '+' : ''}{(ov - p.tot).toLocaleString(lokale(), { maximumFractionDigits: 1 })} {tt("mot oppmålt")}</div>}</> : <span className="muted">–</span>}</td>}</tr>; })}
        <tr className="grp"><td colSpan={2}>{tt("Sum utleibart")}</td><td className="num">{m2(C.totEks)}</td><td className="num">{m2(keys.reduce((s, k) => s + C.per[k].fe, 0))}</td><td className="num">{m2(keys.reduce((s, k) => s + C.per[k].fb, 0))}</td>{C.dekning.harAvtale && <td />}<td className="num">{m2(tot)}</td><td className="num">100 %</td>{ed && <td />}</tr>
      </tbody></table></div> : <div className="tbl-wrap"><Empty t="Ingen oppmålte leiearealer ennå">{ed && tt("Last opp plantegning, sett målestokk og tegn arealene.")}</Empty></div>}
      {C.dekning.F > 0 && keys.length > 0 && <Dekning C={C} />}
      {C.ikkeFordelt > 0 && <p className="small" style={{ color: 'var(--amber)' }}>{m2(C.ikkeFordelt)} {tt("fellesareal er ikke fordelt fordi det ikke finnes leieareal å fordele på.")}</p>}
      {C.fellesBygg + C.etg.reduce((s: number, x: any) => s + (x.sum.felles_etg || 0), 0) < 0.05 && keys.length > 0 && <div className="banner">{tt("Det er ikke tegnet fellesarealer for eiendommen, så leiearealene inneholder ingen andel fellesareal. Tegn korridorer, trapperom, inngangsparti o.l. som «Fellesareal» hvis de skal fordeles.")}</div>}
      <p className="small muted">{tt("Leiearealet (inkl. andel fellesareal) lagres automatisk på leietakerne når tegningene endres, og kan overstyres på leietakeren. Fellesareal i etasjen fordeles forholdsmessig på leiearealene (inkl. ledig areal) i samme etasje. Fellesareal for hele bygget fordeles på alle leiearealer. Ikke utleibart areal:")} {m2(ikke)}{tt(". Arealene er målt fra tegning og er veiledende – en formell arealoppgave etter NS 3940 bør kontrollmåles.")}</p></div>
    {C.etg.length > 0 && <div className="sec"><h2>{tt("Oppmålt per etasje")}</h2><div className="tbl-wrap"><table><thead><tr><th>{tt("Tegning / etasje")}</th><th className="num">{tt("Leieareal")}</th><th className="num">{tt("Ledig")}</th><th className="num">{tt("Felles etasje")}</th><th className="num">{tt("Felles bygg")}</th><th className="num">{tt("Ikke utleibart")}</th><th className="num">{tt("Sum oppmålt")}</th></tr></thead><tbody>
      {C.etg.map((x: any) => <tr key={x.t.id} className="click" onClick={() => openPlan(x.t.id)}><td>{x.t.navn}{!x.ok && <> <Chip c="amber">{tt("Mangler målestokk")}</Chip></>}</td>{['leie', 'ledig', 'felles_etg', 'felles_bygg', 'ikke'].map(c => <td key={c} className="num">{x.ok ? m2(x.sum[c]) : '–'}</td>)}<td className="num" style={{ fontWeight: 600 }}>{x.ok ? m2(Object.values(x.sum as Record<string, number>).reduce((a, b) => a + b, 0)) : '–'}</td></tr>)}
    </tbody></table></div></div>}
  </>;
}

export function Arealer() {
  useStore();
  const [f, setF] = useFilter('areal', { e: '' });
  const e = f.e && byId('eiendommer', f.e) ? f.e : sortBy(S.eiendommer, x => x.navn)[0]?.id;
  if (!S.eiendommer.length) return <><h1>{tt("Tegninger og arealer")}<Hjelp id="side.arealer" /></h1><div className="card"><Empty t="Ingen eiendommer" /></div></>;
  return <>
    <div className="head"><div className="grow"><h1>{tt("Tegninger og arealer")}<Hjelp id="side.arealer" /></h1><p className="sub">{tt("Plantegninger med målestokk og oppmålte arealer – arealoppgaven beregnes automatisk")}</p></div></div>
    <div className="toolbar"><Sel value={e} onChange={v => setF({ e: v })} opts={eiendomOpts()} /></div>
    <ArealSection eid={e} />
  </>;
}
