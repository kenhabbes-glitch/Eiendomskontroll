// 3D-modell av bygget (konvertert fra IFC): snu og zoom, etasjer og snitt, klikk for data, kobling til systemer, status og avvik.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { S, canEdit, fileUrl, save, sb, state, toast, uploadFile, useStore, feiltekst } from '../lib/store';
import { byId, aNavn, dUntil, openAvvik, fd, today, type Rec } from '../lib/utils';
import { tt } from '../lib/i18n';
import { Chip, Empty, confirmBox, formModal } from '../components/ui';
import { editAvvik, editAnlegg, editKomponent } from '../lib/actions';
import { fmt } from '../lib/maaler';
import { KalPanel, SjekkPanel, type Rad } from './Modell3DVerktoy';
import { avst, areal, vinkel, lengde, horisontalt, midt, kalMat, tilModell, meterPerPiksel, type V3, type Kal } from '../lib/ifc3d/geom';
import { lagModell, lesModell, delOpp, type Modell } from '../lib/ifc3d/modell';

const KLASSE: Record<string, string> = { IFCDOOR: 'Dør', IFCWINDOW: 'Vindu', IFCWALL: 'Vegg', IFCWALLSTANDARDCASE: 'Vegg', IFCSLAB: 'Dekke / plate', IFCCOLUMN: 'Søyle', IFCBEAM: 'Bjelke', IFCMEMBER: 'Profil / list', IFCPLATE: 'Plate', IFCRAILING: 'Rekkverk', IFCSTAIR: 'Trapp', IFCSTAIRFLIGHT: 'Trappeløp', IFCROOF: 'Tak', IFCCURTAINWALL: 'Glassfasade', IFCCOVERING: 'Kledning / himling', IFCFURNISHINGELEMENT: 'Inventar', IFCBUILDINGELEMENTPROXY: 'Bygningsdel', IFCFLOWTERMINAL: 'Terminal', IFCALARM: 'Alarm', IFCSANITARYTERMINAL: 'Sanitærutstyr', IFCLIGHTFIXTURE: 'Armatur', IFCTRANSPORTELEMENT: 'Heis / transport', IFCRAMP: 'Rampe', IFCFOOTING: 'Fundament', IFCOPENINGELEMENT: 'Åpning' };
const klNavn = (k: string) => KLASSE[k] ? tt(KLASSE[k]) : k.replace(/^IFC/, '').toLowerCase().replace(/^./, c => c.toUpperCase());
const ST = { ok: '#2e9e6b', snart: '#e0a100', rod: '#d64545', ingen: '#6f8fb0', valgt: '#ff7a00', fokus: '#7a3ff2' };
const hex = (c: string) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];

type Verk = 'velg' | 'avstand' | 'areal' | 'vinkel' | 'linje' | 'notat' | 'kal';
type Merk = { id: string; type: 'avstand' | 'areal' | 'vinkel' | 'linje' | 'notat'; pts: V3[]; tekst?: string; farge?: string; av?: string; dato?: string };
const FARGER: [string, string][] = [['#d6336c', 'Rosa'], ['#0b7285', 'Turkis'], ['#e8590c', 'Oransje'], ['#2f9e44', 'Grønn'], ['#1971c2', 'Blå'], ['#212529', 'Svart']];
const resultat = (ty: string, p: V3[]): string => {
  if (ty === 'avstand' && p.length > 1) return p.length === 2 ? `${fmt(avst(p[0], p[1]), 2)} m (${tt("vannrett")} ${fmt(horisontalt(p[0], p[1]), 2)} · ${tt("høydeforskjell")} ${fmt(Math.abs(p[1][1] - p[0][1]), 2)})` : `${tt("Sum")} ${fmt(lengde(p), 2)} m`;
  if (ty === 'linje' && p.length > 1) return `${fmt(lengde(p), 2)} m`;
  if (ty === 'areal' && p.length > 2) return `${fmt(areal(p), 2)} m² · ${tt("omkrets")} ${fmt(lengde(p, true), 2)} m`;
  if (ty === 'vinkel' && p.length === 3) return `${fmt(vinkel(p[0], p[1], p[2]), 1)}°`;
  return '';
};

// ------------------------------------------------------------------ fane på eiendommen
export default function ModellSeksjon({ eid }: { eid: string }) {
  useStore(); const ed = canEdit();
  const [mod, setMod] = useState<Rec[] | null>(null); const [valgt, setValgt] = useState(''); const [busy, setBusy] = useState(''); const [pct, setPct] = useState(0);
  const last = async () => { const { data } = await sb.from('modeller3d').select('*').eq('eiendom_id', eid).order('created_at', { ascending: false }); setMod(data || []); setValgt(v => v && (data || []).some(x => x.id === v) ? v : data?.[0]?.id || ''); };
  useEffect(() => { last(); }, [eid]);
  const velg = async (f?: File | null) => {
    if (!f) return; setBusy(tt("Leser egenskaper")); setPct(0);
    try {
      let props: any = null; try { const { lesIfc } = await import('../lib/ifc'); props = await lesIfc(f); } catch (e) { console.error('egenskaper', e); }
      const { blob, hode } = await lagModell(f, (p, t) => { setPct(p); const mm = t.match(/^(.*) \((\d+) objekter\)$/); setBusy(mm ? tt("Bygger 3D ({0} objekter)", mm[2]) : tt(t)); }, props);
      setBusy(tt("Laster opp")); setPct(0.98);
      const navn = f.name.replace(/\.(ifczip|ifc|zip)$/i, '');
      const biter = delOpp(blob); const deler: string[] = [];
      for (let i = 0; i < biter.length; i++) {
        if (biter.length > 1) setBusy(tt("Laster opp del {0} av {1}", i + 1, biter.length));
        const fn = navn + '.ek3d.gz' + (biter.length > 1 ? '.' + (i + 1) : ''); const fil = await uploadFile(new File([biter[i]], fn), eid, undefined, fn, 'intern/modell');
        if (!fil) { if (deler.length) await sb.storage.from('filer').remove(deler); throw new Error(tt("Opplastingen av modellen feilet ({0} MB). Sjekk nettforbindelsen og prøv igjen.", (blob.size / 1e6).toFixed(1))); }
        deler.push(fil.path);
      }
      const { error } = await sb.from('modeller3d').insert({ eiendom_id: eid, data: { navn, filnavn: f.name, path: deler[0], ...(deler.length > 1 ? { deler } : {}), str: blob.size, tid: new Date().toISOString(), antall: hode.elementer.length, etasjer: hode.etasjer.map(e => e.navn), opprettetAv: state.me?.navn || '' } }); if (error) throw error;
      toast(tt("Modellen er klar – {0} objekter", hode.elementer.length)); await last();
    } catch (e: any) { toast(feiltekst(e)); } finally { setBusy(''); }
  };
  const slett = async (m: Rec) => { if (!await confirmBox(tt("Slette 3D-modellen? Koblinger mellom systemer og modellen beholdes."), tt("Slett"))) return; await sb.storage.from('filer').remove(m.data.deler || [m.data.path]); await sb.from('modeller3d').delete().eq('id', m.id); await last(); };
  const m = mod?.find(x => x.id === valgt);
  return <>
    {busy ? <div className="card"><b>{busy} …</b><div style={{ height: 8, background: 'var(--line2)', borderRadius: 4, marginTop: 8 }}><div style={{ height: 8, width: Math.round(pct * 100) + '%', background: '#1E4D57', borderRadius: 4, transition: 'width .3s' }} /></div><p className="small muted" style={{ marginBottom: 0 }}>{tt("Store modeller kan ta et minutt. Ikke lukk siden.")}</p></div>
      : <div className="toolbar" style={{ marginBottom: 10 }}>{(mod || []).length > 1 && <select value={valgt} onChange={e => setValgt(e.target.value)}>{mod!.map(x => <option key={x.id} value={x.id}>{x.data.navn}</option>)}</select>}<span className="grow small muted">{m ? `${m.data.navn} · ${m.data.antall} ${tt("objekter")} · ${(m.data.str / 1e6).toFixed(1)} MB · ${tt("lastet opp")} ${fd(m.data.tid)}` : ''}</span>
        {ed && <label className="btn" style={{ display: 'inline-flex' }}>{m ? tt("Last opp ny modell") : tt("Last opp IFC-modell")}<input type="file" accept=".ifc,.ifczip,.zip" style={{ display: 'none' }} onChange={e => { velg(e.target.files?.[0]); e.target.value = ''; }} /></label>}
        {ed && m && <button className="btn ghost" onClick={() => slett(m)}>{tt("Slett")}</button>}</div>}
    {mod && !mod.length && !busy && <Empty t={tt("Ingen 3D-modell er lastet opp ennå.")}><p className="small muted" style={{ maxWidth: 560, margin: '8px auto' }}>{tt("Last opp en IFC-fil (.ifc eller .ifczip) fra arkitekt- eller fagmodellen. Den konverteres til en kompakt modell du kan snu og zoome på, se data for hver bygningsdel, koble til systemer og markere avvik i.")}</p></Empty>}
    {m && !busy && <Visning key={m.id} eid={eid} modellRad={m} />}
  </>;
}

// ------------------------------------------------------------------ visning
function Visning({ eid, modellRad }: { eid: string; modellRad: Rec }) {
  useStore(); const ed = canEdit();
  const vert = useRef<HTMLDivElement>(null); const T = useRef<any>({}); // three-objekter
  const [mod, setMod] = useState<Modell | null>(null); const [feil, setFeil] = useState(''); const [lastet, setLastet] = useState(0);
  const [sel, setSel] = useState<{ el: number; p: number[] } | null>(null); const [vis, setVis] = useState<boolean[]>([]); const [modus, setModus] = useState<'utseende' | 'status'>('utseende');
  const [snitt, setSnitt] = useState<number | null>(null); const [fokus, setFokus] = useState<string>(''); const [skjul, setSkjul] = useState(false);
  const [verk, setVerk] = useState<Verk>('velg'); const [pkt, setPkt] = useState<V3[]>([]); const [merk, setMerk] = useState<Merk[]>(modellRad.data.merk || []); const [skjulM, setSkjulM] = useState<Record<string, boolean>>({});
  const [kal, setKal] = useState<Record<string, Kal>>(modellRad.data.kal || {}); const [visPl, setVisPl] = useState(true); const [plSel, setPlSel] = useState<{ col: string; id: string } | null>(null);
  const [kt, setKt] = useState(''); const [ksteg, setKsteg] = useState(0); const [kp, setKp] = useState<[number, number][]>([]); const [km, setKm] = useState<V3[]>([]); const [ksp, setKsp] = useState(false);
  const [lab, setLab] = useState<{ id: string; x: number; y: number; t: string; c: string }[]>([]); const [sjekk, setSjekk] = useState(false); const bf = useRef(false);
  const tegninger = S.tegninger.filter(t => t.eiendomId === eid && t.fil?.path);
  const lagreData = async (patch: Record<string, any>) => { const d = { ...modellRad.data, ...patch }; modellRad.data = d; const { error } = await sb.from('modeller3d').update({ data: d }).eq('id', modellRad.id); if (error) toast(feiltekst(error)); };

  // --- koblinger og status fra appen
  const anl = S.anlegg.filter(a => a.eiendomId === eid && !a.arkivert);
  const guidAnlegg = useMemo(() => { const m = new Map<string, string[]>(); anl.forEach(a => (a.ifcGuider || []).forEach((g: string) => m.set(g, [...(m.get(g) || []), a.id]))); return m; }, [S.anlegg]);
  const statusAnlegg = (id: string): keyof typeof ST => { const av = openAvvik().filter(a => a.anleggId === id); if (av.some(a => a.alv === 'Kritisk' || a.alv === 'Høy')) return 'rod';
    const o = S.oppgaver.filter(x => x.anleggId === id && x.aktiv !== false && x.nesteFrist); if (!o.length) return av.length ? 'snart' : 'ingen'; const d = Math.min(...o.map(x => dUntil(x.nesteFrist) as number)); return d < 0 ? 'rod' : (d <= 30 || av.length) ? 'snart' : 'ok'; };
  const statusEl = (guid: string): keyof typeof ST | null => { const ids = guidAnlegg.get(guid); if (!ids) return null; const s = ids.map(statusAnlegg); return s.includes('rod') ? 'rod' : s.includes('snart') ? 'snart' : s.includes('ok') ? 'ok' : 'ingen'; };

  // --- last modellen
  useEffect(() => { let av = false; (async () => { try { const biter = await Promise.all(((modellRad.data.deler as string[]) || [modellRad.data.path]).map(async p => { const r = await fetch(await fileUrl(p)); if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); })); const m = await lesModell(await new Blob(biter).arrayBuffer()); if (!av) { setMod(m); setVis(m.hode.etasjer.map(e => !e.terreng)); } } catch (e: any) { if (!av) setFeil(feiltekst(e)); } })(); return () => { av = true; }; }, [modellRad.id]);

  // --- bygg scenen
  useEffect(() => {
    if (!mod || !vert.current) return; const el = vert.current; const h = mod.hode;
    const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.localClippingEnabled = true; el.appendChild(renderer.domElement); renderer.domElement.style.display = 'block'; renderer.domElement.style.touchAction = 'none';
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#eef2f3'); scene.add(new THREE.HemisphereLight('#ffffff', '#8a97a0', 1.1)); const sol = new THREE.DirectionalLight('#ffffff', 1.6); sol.position.set(60, 120, 80); scene.add(sol);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 5000); const f = h.fokus; const sentr = new THREE.Vector3((f[0] + f[3]) / 2, (f[1] + f[4]) / 2, (f[2] + f[5]) / 2); const str = Math.max(f[3] - f[0], f[4] - f[1], f[5] - f[2], 5);
    camera.position.copy(sentr).add(new THREE.Vector3(str * 0.9, str * 0.7, str * 1.1)); camera.near = str / 500; camera.far = str * 40; camera.updateProjectionMatrix();
    const kontroll = new OrbitControls(camera, renderer.domElement); kontroll.target.copy(sentr); kontroll.enableDamping = false; kontroll.update();
    const plan = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e6);
    // meshes
    const meshes: THREE.Mesh[] = []; const base: Uint8Array[] = []; const segEtter: number[][] = []; const segAvEl = new Map<number, number[]>();
    mod.grupper.forEach((g, gi) => { const gr = h.grupper[gi]; const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(g.pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(g.nor, 3, true)); const col = new Uint8Array(gr.nv * 3); geo.setAttribute('color', new THREE.BufferAttribute(col, 3, true)); geo.setIndex(new THREE.BufferAttribute(g.idx, 1)); geo.computeBoundingSphere();
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05, side: THREE.DoubleSide, transparent: gr.glass, opacity: gr.glass ? 0.35 : 1, depthWrite: !gr.glass, clippingPlanes: [plan] });
      const m = new THREE.Mesh(geo, mat); m.userData.g = gi; m.userData.glass = gr.glass; scene.add(m); meshes.push(m); base.push(col); segEtter.push([]); });
    const n = h.nSeg; const sg = mod.seg;
    for (let i = 0; i < n; i++) { const e = sg[i * 7], gi = sg[i * 7 + 1], vf = sg[i * 7 + 2], vc = sg[i * 7 + 3], rgba = sg[i * 7 + 6]; const r = (rgba >>> 24) & 255, gg = (rgba >>> 16) & 255, b = (rgba >>> 8) & 255; const col = base[gi];
      for (let v = vf; v < vf + vc; v++) { col[v * 3] = r; col[v * 3 + 1] = gg; col[v * 3 + 2] = b; } segEtter[gi].push(i); (segAvEl.get(e) || segAvEl.set(e, []).get(e)!).push(i); }
    const merker = new THREE.Group(); scene.add(merker); const maal = new THREE.Group(); scene.add(maal); const plass = new THREE.Group(); scene.add(plass);
    const farg = new Map<string, number>(); h.elementer.forEach((e, i) => { if (e.g) farg.set(e.g, i); });
    let rid = 0; const tegn = () => { rid = 0; renderer.render(scene, camera); T.current.etter?.(); }; const invalider = () => { if (!rid) rid = requestAnimationFrame(tegn); };
    kontroll.addEventListener('change', invalider);
    const resize = () => { const w = el.clientWidth, hh = el.clientHeight; renderer.setSize(w, hh); camera.aspect = w / hh; camera.updateProjectionMatrix(); invalider(); }; const ro = new ResizeObserver(resize); ro.observe(el); resize();
    Object.assign(T.current, { THREE, renderer, scene, camera, kontroll, plan, meshes, base, segEtter, segAvEl, merker, maal, plass, invalider, farg, sentr, str, mod }); setLastet(x => x + 1);
    return () => { cancelAnimationFrame(rid); ro.disconnect(); kontroll.dispose(); meshes.forEach(m => { m.geometry.dispose(); (m.material as THREE.Material).dispose(); }); renderer.dispose(); renderer.domElement.remove(); T.current = {}; };
  }, [mod]);

  // --- «Vis i 3D» fra et system i appen
  useEffect(() => { if (!lastet) return; let id = ''; try { id = sessionStorage.getItem('ek.3dfokus') || ''; sessionStorage.removeItem('ek.3dfokus'); } catch { /* ignorer */ } if (!id) return; const a = byId('anlegg', id); if (!a) return;
    setFokus(id); setModus('status'); const els = (a.ifcGuider || []).map((g: string) => T.current.farg?.get(g)).filter((x: any) => x != null); setTimeout(() => flyTil(new Set(els)), 50); }, [lastet]);

  // --- farger (utseende / status / valgt / fokus)
  const fokusEl = useMemo(() => { const s = new Set<number>(); if (fokus && T.current.farg) (byId('anlegg', fokus)?.ifcGuider || []).forEach((g: string) => { const i = T.current.farg.get(g); if (i != null) s.add(i); }); return s; }, [fokus, lastet, S.anlegg]);
  useEffect(() => {
    const t = T.current; if (!t.mod) return; const h = t.mod.hode; const sg = t.mod.seg; const sk = (e: number, gi: number, i: number) => { void gi; void i; void e; };
    void sk; const farg = (el: number): number[] | null => { if (sel?.el === el) return hex(ST.valgt); if (fokusEl.has(el)) return hex(ST.fokus); if (modus === 'status') { const s = statusEl(h.elementer[el].g); return s ? hex(ST[s]) : 'grå' as any; } return null; };
    for (let gi = 0; gi < t.meshes.length; gi++) { const col = t.meshes[gi].geometry.getAttribute('color') as THREE.BufferAttribute; const arr = col.array as Uint8Array; arr.set(t.base[gi]);
      for (const i of t.segEtter[gi]) { const f = farg(sg[i * 7]); if (!f) continue; const vf = sg[i * 7 + 2], vc = sg[i * 7 + 3];
        for (let v = vf; v < vf + vc; v++) { if ((f as any) === 'grå') { const g = (arr[v * 3] + arr[v * 3 + 1] + arr[v * 3 + 2]) / 3 * 0.35 + 150; arr[v * 3] = arr[v * 3 + 1] = arr[v * 3 + 2] = g; } else { arr[v * 3] = f[0]; arr[v * 3 + 1] = f[1]; arr[v * 3 + 2] = f[2]; } } }
      col.needsUpdate = true; }
    t.invalider();
  }, [mod, lastet, sel, modus, fokusEl, S.oppgaver, S.avvik, S.anlegg]);

  // --- etasjer og snitt
  useEffect(() => { const t = T.current; if (!t.mod) return; t.meshes.forEach((m: THREE.Mesh, gi: number) => { m.visible = vis[t.mod.hode.grupper[gi].etasje] !== false && !(skjul && t.mod.hode.grupper[gi].glass); }); t.invalider(); }, [vis, skjul, lastet]);
  useEffect(() => { const t = T.current; if (!t.mod) return; t.plan.constant = snitt == null ? 1e6 : snitt; t.invalider(); }, [snitt, lastet]);

  // --- avvik som markører
  const avvikM = openAvvik().filter(a => a.eiendomId === eid && a.modell?.x != null);
  useEffect(() => { const t = T.current; if (!t.mod) return; const g: THREE.Group = t.merker; while (g.children.length) { const c = g.children.pop() as THREE.Mesh; c.geometry.dispose(); (c.material as THREE.Material).dispose(); }
    const r = t.str * 0.011; for (const a of avvikM) { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), new THREE.MeshBasicMaterial({ color: a.alv === 'Kritisk' || a.alv === 'Høy' ? ST.rod : ST.snart, depthTest: false })); m.position.set(a.modell.x, a.modell.y, a.modell.z); m.renderOrder = 10; m.userData.avvik = a.id; g.add(m); } t.invalider(); }, [lastet, S.avvik]);

  // --- målinger og tegninger i modellen
  const projiser = () => { const t = T.current; if (!t.camera || !t.ankre) return; const c = t.renderer.domElement; const w = c.clientWidth, hh = c.clientHeight; const v = new THREE.Vector3(); const ut: any[] = [];
    for (const a of t.ankre) { v.set(a.p[0], a.p[1], a.p[2]).project(t.camera); if (v.z > -1 && v.z < 1) ut.push({ id: a.id, x: Math.round((v.x + 1) / 2 * w), y: Math.round((1 - v.y) / 2 * hh), t: a.t, c: a.c }); } setLab(old => JSON.stringify(old) === JSON.stringify(ut) ? old : ut); };
  const tomGruppe = (g: THREE.Group) => { while (g.children.length) { const c = g.children.pop() as THREE.Mesh; c.geometry.dispose(); (c.material as THREE.Material).dispose(); } };
  useEffect(() => { const t = T.current; if (!t.mod) return; tomGruppe(t.maal); const r = t.str * 0.004; const ankre: any[] = [];
    const tegnItem = (id: string, ty: string, p: V3[], farge: string, tekst: string) => { const pts = p.map(q => new THREE.Vector3(q[0], q[1], q[2]));
      pts.forEach(v => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), new THREE.MeshBasicMaterial({ color: farge, depthTest: false })); m.position.copy(v); m.renderOrder = 11; t.maal.add(m); });
      if (pts.length > 1) { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(ty === 'areal' && pts.length > 2 ? [...pts, pts[0]] : pts), new THREE.LineBasicMaterial({ color: farge, depthTest: false })); l.renderOrder = 11; t.maal.add(l); }
      if (tekst && p.length) ankre.push({ id, p: ty === 'avstand' || ty === 'linje' ? midt(p.slice(-2)) : ty === 'vinkel' && p.length === 3 ? p[1] : midt(p), t: tekst, c: farge }); };
    merk.filter(m => !skjulM[m.id]).forEach(m => tegnItem(m.id, m.type, m.pts, m.farge || '#d6336c', [m.tekst, resultat(m.type, m.pts)].filter(Boolean).join(' · ')));
    if (pkt.length) tegnItem('aktiv', verk, pkt, '#0b7285', resultat(verk, pkt)); if (verk === 'kal' && km.length) tegnItem('kal', 'kal', km, '#1d4ed8', '');
    t.ankre = ankre; t.etter = projiser; t.invalider(); projiser(); }, [lastet, merk, skjulM, pkt, verk, km]);

  // --- plasseringer fra 2D-tegninger vist i 3D (etter kalibrering)
  const kalEff = useMemo(() => ksteg >= 4 && kt ? { ...kal, [kt]: { p: kp, m: km, sp: ksp } as Kal } : kal, [kal, ksteg, kt, kp, km, ksp]);
  const plassert = useMemo(() => { const ut: { col: string; id: string; p: V3; farge: string }[] = []; if (!visPl) return ut;
    for (const tid of Object.keys(kalEff)) { const M = kalMat(kalEff[tid]); if (!M) continue;
      const tilf = (col: string, L: Rec[], farge: (o: Rec) => string) => L.filter(o => o.eiendomId === eid && !o.arkivert && o.pos?.tegningId === tid).forEach(o => ut.push({ col, id: o.id, p: tilModell(M, o.pos.x, o.pos.y), farge: farge(o) }));
      tilf('anlegg', S.anlegg, o => ST[statusAnlegg(o.id)]); tilf('komponenter', S.komponenter, o => ST[o.anleggId ? statusAnlegg(o.anleggId) : 'ingen']); tilf('avvik', openAvvik(), o => o.alv === 'Kritisk' || o.alv === 'Høy' ? ST.rod : ST.snart); }
    return ut; }, [kalEff, visPl, S.anlegg, S.komponenter, S.avvik, S.oppgaver, eid]);
  useEffect(() => { const t = T.current; if (!t.mod) return; tomGruppe(t.plass); const r = t.str * 0.009;
    for (const m of plassert) { const geo = m.col === 'avvik' ? new THREE.ConeGeometry(r, r * 2.2, 10) : m.col === 'anlegg' ? new THREE.BoxGeometry(r * 1.6, r * 1.6, r * 1.6) : new THREE.SphereGeometry(r * .8, 12, 8); const k = plSel && plSel.col === m.col && plSel.id === m.id;
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: k ? ST.valgt : m.farge, depthTest: false })); mesh.position.set(m.p[0], m.p[1], m.p[2]); if (k) mesh.scale.setScalar(1.7); mesh.renderOrder = 9; mesh.userData.pl = { col: m.col, id: m.id }; t.plass.add(mesh); } t.invalider(); }, [plassert, plSel, lastet]);

  // --- koblinger mot ny modell: fingeravtrykk av koblede objekter og forslag når GUID ikke finnes
  const elSenter = (i: number): V3 | null => { const t = T.current; const b = new THREE.Box3(); for (const sI of t.segAvEl?.get(i) || []) { const gi = t.mod.seg[sI * 7 + 1], vf = t.mod.seg[sI * 7 + 2], vc = t.mod.seg[sI * 7 + 3]; const pp = t.mod.grupper[gi].pos; for (let v = vf; v < vf + vc; v += 3) b.expandByPoint(new THREE.Vector3(pp[v * 3], pp[v * 3 + 1], pp[v * 3 + 2])); } if (b.isEmpty()) return null; const c = b.getCenter(new THREE.Vector3()); return [c.x, c.y, c.z]; };
  const lagMeta = (i: number) => { const hh = T.current.mod.hode; const e = hh.elementer[i]; const c = elSenter(i); return { k: e.k, n: e.n || '', t: e.t || '', e: hh.etasjer[e.e]?.navn || '', c: c ? c.map(x => Math.round(x * 100) / 100) : null }; };
  useEffect(() => { const t = T.current; if (!lastet || !t.mod || !ed || bf.current) return; bf.current = true;
    (async () => { for (const a of anl) { const m0 = a.ifcMeta || {}; const nye: Record<string, any> = {}; for (const g of a.ifcGuider || []) { if (m0[g]) continue; const i = t.farg.get(g); if (i != null) nye[g] = lagMeta(i); } if (Object.keys(nye).length) await save('anlegg', { ...a, ifcMeta: { ...m0, ...nye } }); } })(); }, [lastet]);
  const rader: Rad[] = useMemo(() => { const t = T.current; if (!lastet || !t.mod) return []; const hh = t.mod.hode; const brukt = new Set<string>(); anl.forEach(a => (a.ifcGuider || []).forEach((g: string) => brukt.add(g))); const ut: Rad[] = [];
    for (const a of anl) for (const g of a.ifcGuider || []) { if (t.farg.has(g)) continue; const m = a.ifcMeta?.[g];
      const forslag: Rad['forslag'] = []; if (m) { const kand: { i: number; d: number; grunn: string }[] = [];
        hh.elementer.forEach((e: any, i: number) => { if (e.k !== m.k || !e.g || brukt.has(e.g)) return; if (m.t && e.t === m.t) { kand.push({ i, d: 0, grunn: tt("samme merke") }); return; } if (m.n && e.n === m.n && (!m.e || hh.etasjer[e.e]?.navn === m.e)) { kand.push({ i, d: 1, grunn: tt("samme navn og etasje") }); return; }
          if (m.c) { const c = elSenter(i); if (c) { const d = Math.hypot(c[0] - m.c[0], c[1] - m.c[1], c[2] - m.c[2]); if (d < 4) kand.push({ i, d: 2 + d, grunn: tt("{0} m fra gammel plassering", d.toFixed(1)) }); } } });
        kand.sort((x, y) => x.d - y.d).slice(0, 3).forEach(k => { const e = hh.elementer[k.i]; forslag.push({ i: k.i, tekst: `${klNavn(e.k)}${e.n ? ' «' + e.n + '»' : ''} · ${hh.etasjer[e.e]?.navn || ''}`, grunn: k.grunn }); }); }
      ut.push({ anleggId: a.id, navn: aNavn(a.id), guid: g, beskr: m ? [klNavn(m.k), m.n && `«${m.n}»`, m.t && `(${m.t})`, m.e].filter(Boolean).join(' ') : tt("Ukjent objekt (koblet før modellen ble sammenlignet)"), forslag }); }
    return ut; }, [lastet, S.anlegg]);
  const bruk = async (r: Rad, i: number) => { const a = byId('anlegg', r.anleggId)!; const ny = T.current.mod.hode.elementer[i].g; const meta = { ...(a.ifcMeta || {}) }; delete meta[r.guid]; meta[ny] = lagMeta(i); await save('anlegg', { ...a, ifcGuider: [...new Set((a.ifcGuider || []).map((g: string) => g === r.guid ? ny : g))], ifcMeta: meta }); toast(tt("Koblingen er flyttet")); };
  const fjernKob = async (r: Rad) => { const a = byId('anlegg', r.anleggId)!; const meta = { ...(a.ifcMeta || {}) }; delete meta[r.guid]; await save('anlegg', { ...a, ifcGuider: (a.ifcGuider || []).filter((g: string) => g !== r.guid), ifcMeta: meta }); };

  // --- klikk
  const ned = useRef<[number, number]>([0, 0]);
  const klikk = (ev: React.PointerEvent) => {
    const t = T.current; if (!t.mod || Math.hypot(ev.clientX - ned.current[0], ev.clientY - ned.current[1]) > 5) return;
    const rect = t.renderer.domElement.getBoundingClientRect(); const ndc = new t.THREE.Vector2(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
    const rc = new t.THREE.Raycaster(); rc.setFromCamera(ndc, t.camera);
    if (verk === 'velg') { const mk = rc.intersectObjects(t.merker.children, false); if (mk[0]) { editAvvik(mk[0].object.userData.avvik); return; } const pm = rc.intersectObjects(t.plass.children, false); if (pm[0]) { setPlSel(pm[0].object.userData.pl); setSel(null); return; } }
    const treff = rc.intersectObjects(t.meshes.filter((m: THREE.Mesh) => m.visible), false).filter((x: any) => t.plan.constant > 1e5 || x.point.y <= t.plan.constant);
    if (!treff.length) { if (verk === 'velg') { setSel(null); setPlSel(null); } return; }
    if (verk !== 'velg') { const x0 = treff[0] as any; const geo = x0.object.geometry; const ia = geo.index.array; const pa = geo.getAttribute('position'); let best: V3 = [x0.point.x, x0.point.y, x0.point.z]; let bd = 14;
      for (let k = 0; k < 3; k++) { const vi = ia[x0.faceIndex * 3 + k]; const v = new t.THREE.Vector3(pa.getX(vi), pa.getY(vi), pa.getZ(vi)); const sc = v.clone().project(t.camera); const d = Math.hypot((sc.x + 1) / 2 * rect.width + rect.left - ev.clientX, (1 - sc.y) / 2 * rect.height + rect.top - ev.clientY); if (d < bd) { bd = d; best = [v.x, v.y, v.z]; } }
      if (verk === 'kal') { if (ksteg % 2 === 1 && ksteg < 4) { setKm([...km, best]); setKsteg(ksteg + 1); } } else if (verk === 'notat') lagreMerk('notat', [best]); else if (verk === 'vinkel') setPkt(pkt.length >= 3 ? [best] : [...pkt, best]); else setPkt([...pkt, best]); return; }
    setPlSel(null);
    const x = treff[0] as any; const gi = x.object.userData.g; const pos = x.faceIndex * 3; const lst: number[] = t.segEtter[gi]; let lo = 0, hi = lst.length - 1, fnn = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; const f = t.mod.seg[lst[mid] * 7 + 4]; if (f <= pos) { fnn = mid; lo = mid + 1; } else hi = mid - 1; }
    if (fnn < 0) return; setSel({ el: t.mod.seg[lst[fnn] * 7], p: [x.point.x, x.point.y, x.point.z] });
  };
  const flyTil = (els: Set<number> | number[]) => { const t = T.current; if (!t.mod) return; const b = new t.THREE.Box3(); for (const e of els) for (const i of t.segAvEl.get(e) || []) { const gi = t.mod.seg[i * 7 + 1], vf = t.mod.seg[i * 7 + 2], vc = t.mod.seg[i * 7 + 3]; const p = t.mod.grupper[gi].pos; for (let v = vf; v < vf + vc; v += 3) b.expandByPoint(new t.THREE.Vector3(p[v * 3], p[v * 3 + 1], p[v * 3 + 2])); }
    if (b.isEmpty()) return; const c = b.getCenter(new t.THREE.Vector3()); const s = Math.max(b.getSize(new t.THREE.Vector3()).length(), t.str * 0.05); const dir = t.camera.position.clone().sub(t.kontroll.target).normalize(); t.kontroll.target.copy(c); t.camera.position.copy(c).add(dir.multiplyScalar(s * 1.6)); t.kontroll.update(); t.invalider(); };

  const lagreMerk = (ty: Merk['type'], pts: V3[]) => formModal({ title: ty === 'notat' ? tt("Notat i modellen") : tt("Lagre i modellen"), saveTxt: tt("Lagre"), values: { tekst: '', farge: '#d6336c' }, top: <p className="small muted" style={{ marginTop: 0 }}>{resultat(ty, pts)}</p>,
    fields: [{ k: 'tekst', label: ty === 'notat' ? tt("Tekst") : tt("Navn / merknad"), type: ty === 'notat' ? 'textarea' : 'text', req: ty === 'notat' }, { k: 'farge', label: tt("Farge"), type: 'select', options: () => FARGER.map(f => [f[0], tt(f[1])] as [string, string]) }],
    onSave: async v => { const nytt: Merk = { id: crypto.randomUUID(), type: ty, pts, tekst: v.tekst, farge: v.farge, av: state.me?.navn || '', dato: new Date().toISOString() }; const liste = [...merk, nytt]; setMerk(liste); setPkt([]); await lagreData({ merk: liste }); } });
  const velgVerk = (v: Verk) => { setVerk(v); setPkt([]); if (v === 'kal') { setKt(kt || tegninger[0]?.id || ''); setKsteg(0); setKp([]); setKm([]); } if (v !== 'velg') { setSel(null); setPlSel(null); } };
  const slettMerk = async (id: string) => { const liste = merk.filter(m => m.id !== id); setMerk(liste); await lagreData({ merk: liste }); };
  const kalNullstill = () => { setKsteg(0); setKp([]); setKm([]); };
  const kalLagre = async () => { const nk = { ...kal, [kt]: { p: kp, m: km, sp: ksp } as Kal }; setKal(nk); await lagreData({ kal: nk }); toast(tt("Kalibreringen er lagret")); kalNullstill(); setVerk('velg'); };
  const kalTap = (x: number, y: number) => { setKp([...kp, [Math.round(x * 10) / 10, Math.round(y * 10) / 10]]); setKsteg(ksteg + 1); };
  const kalM = ksteg >= 4 ? kalMat({ p: kp, m: km, sp: ksp }) : null;
  if (feil) return <div className="card"><p style={{ margin: 0 }}>{tt("Kunne ikke åpne modellen:")} {feil}</p></div>;
  if (!mod) return <div className="card" style={{ textAlign: 'center' }}>{tt("Laster 3D-modellen …")}</div>;
  const h = mod.hode; const el = sel ? h.elementer[sel.el] : null; const eg = el ? h.egenskaper?.[el.g] : null; const koblet = el ? (guidAnlegg.get(el.g) || []) : [];
  const koble = () => { if (!el) return; const lik = h.elementer.map((e, i) => ({ e, i })).filter(x => x.e.k === el.k && x.e.e === el.e && x.e.g); const sys = anl.filter(a => !koblet.includes(a.id));
    formModal({ title: tt("Koble til system"), saveTxt: tt("Koble"), top: <p className="small muted" style={{ marginTop: 0 }}>{klNavn(el.k)} «{el.n || '–'}» · {h.etasjer[el.e]?.navn}</p>, values: { alle: false },
      fields: [{ k: 'anleggId', label: tt("System"), type: 'select', options: () => sys.map(a => [a.id, aNavn(a.id)] as [string, string]), req: true }, { k: 'alle', label: tt("Koble alle {0} i {1} ({2} stk) til samme system", klNavn(el.k).toLowerCase(), h.etasjer[el.e]?.navn || '', lik.length), type: 'checkbox' }],
      onSave: async v => { const a = byId('anlegg', v.anleggId)!; const nye = (v.alle ? lik.map(x => x.e.g) : [el.g]); const meta = { ...(a.ifcMeta || {}) }; nye.forEach((g: string) => { const i = T.current.farg.get(g); if (i != null) meta[g] = lagMeta(i); }); await save('anlegg', { ...a, ifcGuider: [...new Set([...(a.ifcGuider || []), ...nye])], ifcMeta: meta }); toast(tt("{0} objekt(er) er koblet til {1}", nye.length, aNavn(a.id))); } }); };
  const fjern = async (aid: string) => { const a = byId('anlegg', aid)!; await save('anlegg', { ...a, ifcGuider: (a.ifcGuider || []).filter((g: string) => g !== el!.g) }); };
  const nyttAvvik = () => { if (!el || !sel) return; editAvvik(undefined, { eiendomId: eid, anleggId: koblet[0] || '', tittel: `${klNavn(el.k)}${el.n ? ' «' + el.n + '»' : ''} – ${h.etasjer[el.e]?.navn || ''}: `, modell: { guid: el.g, x: sel.p[0], y: sel.p[1], z: sel.p[2], etasje: h.etasjer[el.e]?.navn || '' } }); };
  const stat = (k: keyof typeof ST) => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginRight: 12 }}><i style={{ width: 11, height: 11, borderRadius: 3, background: ST[k], display: 'inline-block' }} />{({ ok: tt("I orden"), snart: tt("Snart / avvik"), rod: tt("Forfalt / alvorlig avvik"), ingen: tt("Uten kontroll") } as any)[k]}</span>;
  const sna = h.fokus[1], snb = h.fokus[4] + 1;
  return <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 12 }}>
    <div className="card" style={{ padding: 0, overflow: 'hidden', position: 'relative' }}>
      <div ref={vert} onPointerDown={e => { ned.current = [e.clientX, e.clientY]; }} onPointerUp={klikk} style={{ width: '100%', height: 'min(72vh, 720px)', minHeight: 420, cursor: verk === 'velg' ? 'grab' : 'crosshair' }} />
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>{lab.map(l => <div key={l.id} style={{ position: 'absolute', left: l.x, top: l.y, transform: 'translate(-50%,-130%)', background: '#fffe', border: '1px solid ' + l.c, color: '#1b2a2f', borderRadius: 6, padding: '1px 6px', fontSize: 12, whiteSpace: 'nowrap', fontWeight: 600 }}>{l.t}</div>)}</div>
      <div style={{ position: 'absolute', right: 10, top: 10, display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: '50%' }}>{([['velg', 'Velg'], ['avstand', 'Avstand'], ['areal', 'Areal'], ['vinkel', 'Vinkel'], ['linje', 'Tegn linje'], ['notat', 'Notat'], ['kal', 'Tegning']] as [Verk, string][]).filter(([v]) => v === 'velg' || v === 'avstand' || v === 'areal' || v === 'vinkel' || ed || v === 'kal').map(([v, n]) => <button key={v} className={'btn sm' + (verk === v ? ' pri' : '')} style={{ background: verk === v ? undefined : '#fffd' }} onClick={() => velgVerk(v)}>{tt(n)}</button>)}</div>
      <div style={{ position: 'absolute', left: 10, top: 10, display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 'calc(100% - 20px)' }}>
        <div className="seg" style={{ background: '#fffd', borderRadius: 8, padding: 4, display: 'inline-flex', gap: 4 }}><button className={'btn sm' + (modus === 'utseende' ? ' pri' : '')} onClick={() => setModus('utseende')}>{tt("Utseende")}</button><button className={'btn sm' + (modus === 'status' ? ' pri' : '')} onClick={() => setModus('status')}>{tt("Status")}</button></div>
        <div style={{ background: '#fffd', borderRadius: 8, padding: '6px 8px', fontSize: 12 }}><b>{tt("Etasjer")}</b>
          {h.etasjer.map((e, i) => <label key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '2px 0' }}><input type="checkbox" checked={vis[i] !== false} onChange={x => setVis(v => v.map((y, j) => j === i ? x.target.checked : y))} />{e.navn}</label>)}
          <div style={{ marginTop: 4, display: 'flex', gap: 4 }}><button className="btn sm" onClick={() => setVis(h.etasjer.map(e => !e.terreng))}>{tt("Alle")}</button>{sel && <button className="btn sm" onClick={() => setVis(vis.map((_, i) => i === h.elementer[sel.el].e))}>{tt("Kun valgt")}</button>}</div>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}><input type="checkbox" checked={skjul} onChange={e => setSkjul(e.target.checked)} />{tt("Skjul glass")}</label></div>
        <div style={{ background: '#fffd', borderRadius: 8, padding: '6px 8px', fontSize: 12 }}><label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={snitt != null} onChange={e => setSnitt(e.target.checked ? (sna + snb) / 2 : null)} /><b>{tt("Snitt (høyde)")}</b></label>
          {snitt != null && <input type="range" min={sna} max={snb} step="any" value={snitt} onChange={e => setSnitt(+e.target.value)} style={{ width: 150, display: 'block' }} />}</div></div>
      {modus === 'status' && <div style={{ position: 'absolute', left: 10, bottom: 10, background: '#fffd', borderRadius: 8, padding: '6px 10px', fontSize: 12 }}>{stat('ok')}{stat('snart')}{stat('rod')}{stat('ingen')}<span className="muted">{tt("Grå = ikke koblet til system")}</span></div>}
      <div style={{ position: 'absolute', right: 10, bottom: 8, fontSize: 11, color: '#51656b' }}>{verk === 'velg' ? tt("Dra: snu · Skroll: zoom · Høyre knapp/to fingre: flytt · Klikk: velg") : tt("Klikk i modellen for å sette punkter – de fester seg til nærmeste hjørne")}</div></div>
    {rader.length > 0 && !sjekk && <div className="card" style={{ background: '#fff7e0', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><span style={{ flex: 1 }}><b>{rader.length}</b> {tt("koblinger til systemer finner ikke objektet i denne modellen.")}</span><button className="btn sm pri" onClick={() => setSjekk(true)}>{tt("Se gjennom og flytt")}</button></div>}
    {sjekk && <SjekkPanel rader={rader} ed={ed} onBruk={bruk} onFjern={fjernKob} onLukk={() => setSjekk(false)} />}
    {verk === 'kal' && <KalPanel tegninger={tegninger} tid={kt} setTid={setKt} steg={ksteg} p={kp} sp={ksp} setSp={setKsp} onTap={kalTap} nullstill={kalNullstill} lagre={kalLagre} ferdig={ksteg >= 4} mpp={kalM ? meterPerPiksel(kalM) : null} />}
    {(verk === 'avstand' || verk === 'areal' || verk === 'vinkel' || verk === 'linje' || verk === 'notat') && <div className="card"><div className="toolbar"><div style={{ flex: 1 }}><b>{({ avstand: tt("Mål avstand"), areal: tt("Mål areal"), vinkel: tt("Mål vinkel"), linje: tt("Tegn linje"), notat: tt("Sett notat") } as any)[verk]}</b> <span className="small muted">{({ avstand: tt("Klikk to eller flere punkter. Summen vises."), areal: tt("Klikk hjørnene i flaten (minst tre). Arealet regnes også for loddrette og skrå flater."), vinkel: tt("Klikk tre punkter – vinkelen måles i det midterste."), linje: tt("Klikk punktene langs linjen, og lagre den med et navn."), notat: tt("Klikk der notatet skal stå.") } as any)[verk]}</span>
      <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>{resultat(verk, pkt) || (pkt.length ? tt("{0} punkt(er)", pkt.length) : '–')}</div></div>
      <button className="btn sm" disabled={!pkt.length} onClick={() => setPkt(pkt.slice(0, -1))}>{tt("Angre punkt")}</button><button className="btn sm" disabled={!pkt.length} onClick={() => setPkt([])}>{tt("Nullstill")}</button>{ed && verk !== 'notat' && <button className="btn sm pri" disabled={!resultat(verk, pkt)} onClick={() => lagreMerk(verk as Merk['type'], pkt)}>{tt("Lagre i modellen")}</button>}</div></div>}
    <div className="card">
      {plSel && !el && (() => { const o = byId(plSel.col as any, plSel.id); if (!o) return null; const tg = byId('tegninger', o.pos?.tegningId); return <div style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid var(--line2)' }}>
        <div className="toolbar" style={{ marginBottom: 4 }}><h2 style={{ margin: 0, flex: 1 }}>{plSel.col === 'avvik' ? o.tittel : plSel.col === 'anlegg' ? aNavn(o.id) : (o.navn || o.kode || tt("Komponent"))}</h2><button className="btn sm ghost" onClick={() => setPlSel(null)}>✕</button></div>
        <p className="small muted" style={{ margin: '0 0 6px' }}>{tt("Plassert på tegningen «{0}»", tg?.navn || '')}</p>
        <button className="btn sm" onClick={() => plSel.col === 'avvik' ? editAvvik(o.id) : plSel.col === 'anlegg' ? editAnlegg(o.id) : editKomponent(o.id)}>{tt("Åpne")}</button></div>; })()}
      {el ? <>
        <div className="toolbar" style={{ marginBottom: 6 }}><h2 style={{ margin: 0, flex: 1 }}>{klNavn(el.k)}{el.n ? ` – ${el.n}` : ''}</h2><button className="btn sm ghost" onClick={() => setSel(null)}>✕</button></div>
        <dl className="dl"><dt>{tt("Etasje")}</dt><dd>{h.etasjer[el.e]?.navn}</dd>{el.t && <><dt>{tt("Merke / tag")}</dt><dd>{el.t}</dd></>}{eg?.ns && <><dt>NS 3451</dt><dd>{eg.ns}</dd></>}{eg?.type && <><dt>{tt("Type")}</dt><dd>{eg.type}</dd></>}
          {Object.entries(eg?.egenskaper || {}).slice(0, 14).map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}{Object.entries(eg?.mengder || {}).slice(0, 6).map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{Math.round(v * 100) / 100}</dd></React.Fragment>)}
          <dt>GUID</dt><dd className="mono small">{el.g}</dd></dl>
        <h3 style={{ marginBottom: 4 }}>{tt("Koblet til i appen")}</h3>
        {koblet.length ? koblet.map(a => { const an = byId('anlegg', a)!; return <div key={a} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '3px 0', flexWrap: 'wrap' }}><Chip c={({ ok: 'green', snart: 'amber', rod: 'red', ingen: '' } as any)[statusAnlegg(a)]}>{({ ok: tt("I orden"), snart: tt("Snart"), rod: tt("Forfalt"), ingen: tt("Ingen kontroll") } as any)[statusAnlegg(a)]}</Chip><b>{aNavn(a)}</b>
          <span className="small muted">{S.oppgaver.filter(o => o.anleggId === a && o.aktiv !== false).length} {tt("kontroller")} · {openAvvik().filter(x => x.anleggId === a).length} {tt("åpne avvik")}</span>{ed && <button className="btn sm ghost" onClick={() => fjern(a)}>{tt("Fjern kobling")}</button>}<button className="btn sm" onClick={() => { setFokus(a); flyTil(new Set((an.ifcGuider || []).map((g: string) => T.current.farg.get(g)).filter((x: any) => x != null))); }}>{tt("Vis alle i modellen")}</button></div>; }) : <p className="small muted" style={{ margin: '0 0 6px' }}>{tt("Ikke koblet til noe system.")}</p>}
        <div className="toolbar">{ed && <button className="btn sm" onClick={koble} disabled={!el.g}>{tt("Koble til system")}</button>}{ed && <button className="btn sm pri" onClick={nyttAvvik}>{tt("Registrer avvik her")}</button>}</div>
      </> : <>
        <div className="toolbar" style={{ marginBottom: 6 }}><h2 style={{ margin: 0, flex: 1 }}>{tt("Systemer i modellen")}</h2>{fokus && <button className="btn sm" onClick={() => setFokus('')}>{tt("Fjern markering")}</button>}</div>
        <p className="small muted" style={{ marginTop: 0 }}>{tt("Klikk på en bygningsdel i modellen for å se data, koble den til et system eller registrere avvik. Velg et system under for å se hvor det står i bygget.")}</p>
        {anl.filter(a => (a.ifcGuider || []).length).length ? <div className="tbl-wrap"><table><thead><tr><th>{tt("System")}</th><th>{tt("Objekter")}</th><th>{tt("Status")}</th><th /></tr></thead><tbody>{anl.filter(a => (a.ifcGuider || []).length).map(a => <tr key={a.id}><td><b>{aNavn(a.id)}</b></td><td>{a.ifcGuider.length}</td><td><Chip c={({ ok: 'green', snart: 'amber', rod: 'red', ingen: '' } as any)[statusAnlegg(a.id)]}>{({ ok: tt("I orden"), snart: tt("Snart"), rod: tt("Forfalt"), ingen: tt("Ingen kontroll") } as any)[statusAnlegg(a.id)]}</Chip></td><td><button className="btn sm" onClick={() => { setFokus(a.id); flyTil(new Set(a.ifcGuider.map((g: string) => T.current.farg.get(g)).filter((x: any) => x != null))); }}>{tt("Vis i modellen")}</button></td></tr>)}</tbody></table></div> : <p className="small muted">{tt("Ingen systemer er koblet til modellen ennå.")}</p>}
        <div className="toolbar" style={{ margin: '6px 0' }}><label className="small" style={{ display: 'flex', gap: 5, alignItems: 'center' }}><input type="checkbox" checked={visPl} onChange={e => setVisPl(e.target.checked)} />{tt("Vis plasseringer fra tegninger ({0})", plassert.length)}</label><span className="grow" />{anl.some(a => (a.ifcGuider || []).length) && <button className="btn sm" onClick={() => setSjekk(true)}>{tt("Sjekk koblinger")}</button>}</div>
        {Object.keys(kal).length > 0 && <p className="small muted" style={{ margin: '0 0 6px' }}>{tt("Koblede tegninger:")} {Object.keys(kal).map(id => byId('tegninger', id)?.navn).filter(Boolean).join(', ')}</p>}
        {merk.length > 0 && <><h3 style={{ marginBottom: 4 }}>{tt("Mål og tegninger")}</h3>{merk.map(m => <div key={m.id} className="small" style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '2px 0', flexWrap: 'wrap' }}><i style={{ width: 10, height: 10, borderRadius: 3, background: m.farge, display: 'inline-block' }} /><label style={{ display: 'flex', gap: 4, alignItems: 'center' }}><input type="checkbox" checked={!skjulM[m.id]} onChange={e => setSkjulM({ ...skjulM, [m.id]: !e.target.checked })} /><b>{m.tekst || ({ avstand: tt("Avstand"), areal: tt("Areal"), vinkel: tt("Vinkel"), linje: tt("Linje"), notat: tt("Notat") } as any)[m.type]}</b></label><span className="muted">{resultat(m.type, m.pts)}</span>{ed && <button className="btn sm ghost" onClick={() => slettMerk(m.id)}>{tt("Slett")}</button>}</div>)}</>}
        {avvikM.length > 0 && <><h3 style={{ marginBottom: 4 }}>{tt("Avvik markert i modellen")}</h3>{avvikM.map(a => <div key={a.id} className="small" style={{ padding: '2px 0' }}><a href="#" onClick={e => { e.preventDefault(); editAvvik(a.id); }}>{a.tittel}</a> <span className="muted">{a.modell.etasje} · {fd(a.oppdaget || today())}</span></div>)}</>}
      </>}
    </div></div>;
}
