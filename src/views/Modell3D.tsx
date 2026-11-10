// 3D-modell av bygget (konvertert fra IFC): snu og zoom, etasjer og snitt, klikk for data, kobling til systemer, status og avvik.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { S, canEdit, fileUrl, save, sb, state, toast, uploadFile, useStore, feiltekst } from '../lib/store';
import { byId, aNavn, dUntil, openAvvik, fd, today, type Rec } from '../lib/utils';
import { tt } from '../lib/i18n';
import { Chip, Empty, confirmBox, formModal } from '../components/ui';
import { editAvvik } from '../lib/actions';
import { lagModell, lesModell, type Modell } from '../lib/ifc3d/modell';

const KLASSE: Record<string, string> = { IFCDOOR: 'Dør', IFCWINDOW: 'Vindu', IFCWALL: 'Vegg', IFCWALLSTANDARDCASE: 'Vegg', IFCSLAB: 'Dekke / plate', IFCCOLUMN: 'Søyle', IFCBEAM: 'Bjelke', IFCMEMBER: 'Profil / list', IFCPLATE: 'Plate', IFCRAILING: 'Rekkverk', IFCSTAIR: 'Trapp', IFCSTAIRFLIGHT: 'Trappeløp', IFCROOF: 'Tak', IFCCURTAINWALL: 'Glassfasade', IFCCOVERING: 'Kledning / himling', IFCFURNISHINGELEMENT: 'Inventar', IFCBUILDINGELEMENTPROXY: 'Bygningsdel', IFCFLOWTERMINAL: 'Terminal', IFCALARM: 'Alarm', IFCSANITARYTERMINAL: 'Sanitærutstyr', IFCLIGHTFIXTURE: 'Armatur', IFCTRANSPORTELEMENT: 'Heis / transport', IFCRAMP: 'Rampe', IFCFOOTING: 'Fundament', IFCOPENINGELEMENT: 'Åpning' };
const klNavn = (k: string) => KLASSE[k] ? tt(KLASSE[k]) : k.replace(/^IFC/, '').toLowerCase().replace(/^./, c => c.toUpperCase());
const ST = { ok: '#2e9e6b', snart: '#e0a100', rod: '#d64545', ingen: '#6f8fb0', valgt: '#ff7a00', fokus: '#7a3ff2' };
const hex = (c: string) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];

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
      const fil = await uploadFile(new File([blob], navn + '.ek3d.gz'), eid, undefined, navn + '.ek3d.gz', 'intern/modell'); if (!fil) throw new Error(tt("Opplastingen feilet"));
      const { error } = await sb.from('modeller3d').insert({ eiendom_id: eid, data: { navn, filnavn: f.name, path: fil.path, str: blob.size, tid: new Date().toISOString(), antall: hode.elementer.length, etasjer: hode.etasjer.map(e => e.navn), opprettetAv: state.me?.navn || '' } }); if (error) throw error;
      toast(tt("Modellen er klar – {0} objekter", hode.elementer.length)); await last();
    } catch (e: any) { toast(feiltekst(e)); } finally { setBusy(''); }
  };
  const slett = async (m: Rec) => { if (!await confirmBox(tt("Slette 3D-modellen? Koblinger mellom systemer og modellen beholdes."), tt("Slett"))) return; await sb.storage.from('filer').remove([m.data.path]); await sb.from('modeller3d').delete().eq('id', m.id); await last(); };
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

  // --- koblinger og status fra appen
  const anl = S.anlegg.filter(a => a.eiendomId === eid && !a.arkivert);
  const guidAnlegg = useMemo(() => { const m = new Map<string, string[]>(); anl.forEach(a => (a.ifcGuider || []).forEach((g: string) => m.set(g, [...(m.get(g) || []), a.id]))); return m; }, [S.anlegg]);
  const statusAnlegg = (id: string): keyof typeof ST => { const av = openAvvik().filter(a => a.anleggId === id); if (av.some(a => a.alv === 'Kritisk' || a.alv === 'Høy')) return 'rod';
    const o = S.oppgaver.filter(x => x.anleggId === id && x.aktiv !== false && x.nesteFrist); if (!o.length) return av.length ? 'snart' : 'ingen'; const d = Math.min(...o.map(x => dUntil(x.nesteFrist) as number)); return d < 0 ? 'rod' : (d <= 30 || av.length) ? 'snart' : 'ok'; };
  const statusEl = (guid: string): keyof typeof ST | null => { const ids = guidAnlegg.get(guid); if (!ids) return null; const s = ids.map(statusAnlegg); return s.includes('rod') ? 'rod' : s.includes('snart') ? 'snart' : s.includes('ok') ? 'ok' : 'ingen'; };

  // --- last modellen
  useEffect(() => { let av = false; (async () => { try { const u = await fileUrl(modellRad.data.path); const r = await fetch(u); if (!r.ok) throw new Error('HTTP ' + r.status); const m = await lesModell(await r.arrayBuffer()); if (!av) { setMod(m); setVis(m.hode.etasjer.map(e => !e.terreng)); } } catch (e: any) { if (!av) setFeil(feiltekst(e)); } })(); return () => { av = true; }; }, [modellRad.id]);

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
    const merker = new THREE.Group(); scene.add(merker);
    const farg = new Map<string, number>(); h.elementer.forEach((e, i) => { if (e.g) farg.set(e.g, i); });
    let rid = 0; const tegn = () => { rid = 0; renderer.render(scene, camera); }; const invalider = () => { if (!rid) rid = requestAnimationFrame(tegn); };
    kontroll.addEventListener('change', invalider);
    const resize = () => { const w = el.clientWidth, hh = el.clientHeight; renderer.setSize(w, hh); camera.aspect = w / hh; camera.updateProjectionMatrix(); invalider(); }; const ro = new ResizeObserver(resize); ro.observe(el); resize();
    Object.assign(T.current, { THREE, renderer, scene, camera, kontroll, plan, meshes, base, segEtter, segAvEl, merker, invalider, farg, sentr, str, mod }); setLastet(x => x + 1);
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

  // --- klikk
  const ned = useRef<[number, number]>([0, 0]);
  const klikk = (ev: React.PointerEvent) => {
    const t = T.current; if (!t.mod || Math.hypot(ev.clientX - ned.current[0], ev.clientY - ned.current[1]) > 5) return;
    const rect = t.renderer.domElement.getBoundingClientRect(); const ndc = new t.THREE.Vector2(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
    const rc = new t.THREE.Raycaster(); rc.setFromCamera(ndc, t.camera);
    const mk = rc.intersectObjects(t.merker.children, false); if (mk[0]) { editAvvik(mk[0].object.userData.avvik); return; }
    const treff = rc.intersectObjects(t.meshes.filter((m: THREE.Mesh) => m.visible), false).filter((x: any) => t.plan.constant > 1e5 || x.point.y <= t.plan.constant);
    if (!treff.length) { setSel(null); return; }
    const x = treff[0] as any; const gi = x.object.userData.g; const pos = x.faceIndex * 3; const lst: number[] = t.segEtter[gi]; let lo = 0, hi = lst.length - 1, fnn = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; const f = t.mod.seg[lst[mid] * 7 + 4]; if (f <= pos) { fnn = mid; lo = mid + 1; } else hi = mid - 1; }
    if (fnn < 0) return; setSel({ el: t.mod.seg[lst[fnn] * 7], p: [x.point.x, x.point.y, x.point.z] });
  };
  const flyTil = (els: Set<number> | number[]) => { const t = T.current; if (!t.mod) return; const b = new t.THREE.Box3(); for (const e of els) for (const i of t.segAvEl.get(e) || []) { const gi = t.mod.seg[i * 7 + 1], vf = t.mod.seg[i * 7 + 2], vc = t.mod.seg[i * 7 + 3]; const p = t.mod.grupper[gi].pos; for (let v = vf; v < vf + vc; v += 3) b.expandByPoint(new t.THREE.Vector3(p[v * 3], p[v * 3 + 1], p[v * 3 + 2])); }
    if (b.isEmpty()) return; const c = b.getCenter(new t.THREE.Vector3()); const s = Math.max(b.getSize(new t.THREE.Vector3()).length(), t.str * 0.05); const dir = t.camera.position.clone().sub(t.kontroll.target).normalize(); t.kontroll.target.copy(c); t.camera.position.copy(c).add(dir.multiplyScalar(s * 1.6)); t.kontroll.update(); t.invalider(); };

  if (feil) return <div className="card"><p style={{ margin: 0 }}>{tt("Kunne ikke åpne modellen:")} {feil}</p></div>;
  if (!mod) return <div className="card" style={{ textAlign: 'center' }}>{tt("Laster 3D-modellen …")}</div>;
  const h = mod.hode; const el = sel ? h.elementer[sel.el] : null; const eg = el ? h.egenskaper?.[el.g] : null; const koblet = el ? (guidAnlegg.get(el.g) || []) : [];
  const koble = () => { if (!el) return; const lik = h.elementer.map((e, i) => ({ e, i })).filter(x => x.e.k === el.k && x.e.e === el.e && x.e.g); const sys = anl.filter(a => !koblet.includes(a.id));
    formModal({ title: tt("Koble til system"), saveTxt: tt("Koble"), top: <p className="small muted" style={{ marginTop: 0 }}>{klNavn(el.k)} «{el.n || '–'}» · {h.etasjer[el.e]?.navn}</p>, values: { alle: false },
      fields: [{ k: 'anleggId', label: tt("System"), type: 'select', options: () => sys.map(a => [a.id, aNavn(a.id)] as [string, string]), req: true }, { k: 'alle', label: tt("Koble alle {0} i {1} ({2} stk) til samme system", klNavn(el.k).toLowerCase(), h.etasjer[el.e]?.navn || '', lik.length), type: 'checkbox' }],
      onSave: async v => { const a = byId('anlegg', v.anleggId)!; const nye = (v.alle ? lik.map(x => x.e.g) : [el.g]); await save('anlegg', { ...a, ifcGuider: [...new Set([...(a.ifcGuider || []), ...nye])] }); toast(tt("{0} objekt(er) er koblet til {1}", nye.length, aNavn(a.id))); } }); };
  const fjern = async (aid: string) => { const a = byId('anlegg', aid)!; await save('anlegg', { ...a, ifcGuider: (a.ifcGuider || []).filter((g: string) => g !== el!.g) }); };
  const nyttAvvik = () => { if (!el || !sel) return; editAvvik(undefined, { eiendomId: eid, anleggId: koblet[0] || '', tittel: `${klNavn(el.k)}${el.n ? ' «' + el.n + '»' : ''} – ${h.etasjer[el.e]?.navn || ''}: `, modell: { guid: el.g, x: sel.p[0], y: sel.p[1], z: sel.p[2], etasje: h.etasjer[el.e]?.navn || '' } }); };
  const stat = (k: keyof typeof ST) => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginRight: 12 }}><i style={{ width: 11, height: 11, borderRadius: 3, background: ST[k], display: 'inline-block' }} />{({ ok: tt("I orden"), snart: tt("Snart / avvik"), rod: tt("Forfalt / alvorlig avvik"), ingen: tt("Uten kontroll") } as any)[k]}</span>;
  const sna = h.fokus[1], snb = h.fokus[4] + 1;
  return <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 12 }}>
    <div className="card" style={{ padding: 0, overflow: 'hidden', position: 'relative' }}>
      <div ref={vert} onPointerDown={e => { ned.current = [e.clientX, e.clientY]; }} onPointerUp={klikk} style={{ width: '100%', height: 'min(72vh, 720px)', minHeight: 420, cursor: 'grab' }} />
      <div style={{ position: 'absolute', left: 10, top: 10, display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 'calc(100% - 20px)' }}>
        <div className="seg" style={{ background: '#fffd', borderRadius: 8, padding: 4, display: 'inline-flex', gap: 4 }}><button className={'btn sm' + (modus === 'utseende' ? ' pri' : '')} onClick={() => setModus('utseende')}>{tt("Utseende")}</button><button className={'btn sm' + (modus === 'status' ? ' pri' : '')} onClick={() => setModus('status')}>{tt("Status")}</button></div>
        <div style={{ background: '#fffd', borderRadius: 8, padding: '6px 8px', fontSize: 12 }}><b>{tt("Etasjer")}</b>
          {h.etasjer.map((e, i) => <label key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '2px 0' }}><input type="checkbox" checked={vis[i] !== false} onChange={x => setVis(v => v.map((y, j) => j === i ? x.target.checked : y))} />{e.navn}</label>)}
          <div style={{ marginTop: 4, display: 'flex', gap: 4 }}><button className="btn sm" onClick={() => setVis(h.etasjer.map(e => !e.terreng))}>{tt("Alle")}</button>{sel && <button className="btn sm" onClick={() => setVis(vis.map((_, i) => i === h.elementer[sel.el].e))}>{tt("Kun valgt")}</button>}</div>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}><input type="checkbox" checked={skjul} onChange={e => setSkjul(e.target.checked)} />{tt("Skjul glass")}</label></div>
        <div style={{ background: '#fffd', borderRadius: 8, padding: '6px 8px', fontSize: 12 }}><label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={snitt != null} onChange={e => setSnitt(e.target.checked ? (sna + snb) / 2 : null)} /><b>{tt("Snitt (høyde)")}</b></label>
          {snitt != null && <input type="range" min={sna} max={snb} step="any" value={snitt} onChange={e => setSnitt(+e.target.value)} style={{ width: 150, display: 'block' }} />}</div></div>
      {modus === 'status' && <div style={{ position: 'absolute', left: 10, bottom: 10, background: '#fffd', borderRadius: 8, padding: '6px 10px', fontSize: 12 }}>{stat('ok')}{stat('snart')}{stat('rod')}{stat('ingen')}<span className="muted">{tt("Grå = ikke koblet til system")}</span></div>}
      <div style={{ position: 'absolute', right: 10, bottom: 8, fontSize: 11, color: '#51656b' }}>{tt("Dra: snu · Skroll: zoom · Høyre knapp/to fingre: flytt · Klikk: velg")}</div></div>
    <div className="card">
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
        {avvikM.length > 0 && <><h3 style={{ marginBottom: 4 }}>{tt("Avvik markert i modellen")}</h3>{avvikM.map(a => <div key={a.id} className="small" style={{ padding: '2px 0' }}><a href="#" onClick={e => { e.preventDefault(); editAvvik(a.id); }}>{a.tittel}</a> <span className="muted">{a.modell.etasje} · {fd(a.oppdaget || today())}</span></div>)}</>}
      </>}
    </div></div>;
}
