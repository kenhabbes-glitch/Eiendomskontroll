// 3D-modell av bygget (konvertert fra IFC): snu og zoom, etasjer og snitt, klikk for data, kobling til systemer, status og avvik.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { S, canEdit, fileUrl, save, sb, state, toast, uploadFile, useStore, feiltekst } from '../lib/store';
import { byId, aNavn, dUntil, openAvvik, fd, today, tfmKomp, type Rec } from '../lib/utils';
import { tt } from '../lib/i18n';
import { Chip, Empty, confirmBox, formModal } from '../components/ui';
import { editAvvik, editAnlegg, editKomponent } from '../lib/actions';
import { fmt } from '../lib/maaler';
import { KalPanel, SjekkPanel, type Rad } from './Modell3DVerktoy';
import { avst, areal, vinkel, lengde, horisontalt, midt, kalMat, tilModell, meterPerPiksel, type V3, type Kal } from '../lib/ifc3d/geom';
import { lagModell, lesModellStrom, delStrom, delOpp, type Modell } from '../lib/ifc3d/modell';
import { samle, rammeFra, gjettFag, fagNavn, FAG, type Del, type Samlet } from '../lib/ifc3d/samle';

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
/** Samlet (komprimert) størrelse der mobil og nettbrett spør før modellen åpnes. */
const STOR_MOBIL = 15e6;
const erMobil = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 900;
export default function ModellSeksjon({ eid }: { eid: string }) {
  useStore(); const ed = canEdit();
  const [mod, setMod] = useState<Rec[] | null>(null); const [busy, setBusy] = useState(''); const [pct, setPct] = useState(0); const [visListe, setVisListe] = useState(false);
  const last = async () => { const { data } = await sb.from('modeller3d').select('*').eq('eiendom_id', eid).order('created_at', { ascending: true }); setMod(data || []); };
  useEffect(() => { last(); }, [eid]);
  const fagAv = (r: Rec) => r.data.fag || gjettFag(r.data.filnavn || r.data.navn || '');
  const hoved = (L: Rec[]) => L.find(r => r.data.hoved) || L.find(r => r.data.merk?.length || Object.keys(r.data.kal || {}).length || r.data.ramme) || L[0];
  const FELLES = ['merk', 'kal', 'ramme', 'hoved'] as const;
  const slettFiler = (r: Rec) => sb.storage.from('filer').remove(r.data.deler || [r.data.path]);
  // Flytter felles data (mål, kalibrering, ramme) til en annen rad før en rad slettes eller byttes
  const flyttFelles = async (fra: Rec, til: Rec) => { const d = { ...til.data }; for (const k of FELLES) if (fra.data[k] !== undefined) d[k] = fra.data[k]; await sb.from('modeller3d').update({ data: d }).eq('id', til.id); };
  const velg = async (f?: File | null, erstatt?: Rec) => {
    if (!f) return; setBusy(tt("Leser egenskaper")); setPct(0);
    try {
      let fag = erstatt ? fagAv(erstatt) : gjettFag(f.name);
      if (!erstatt) { const lik = (mod || []).find(r => fagAv(r) === fag && fag !== 'ANNET');
        if (lik) { setBusy(''); const svar = await confirmBox(tt("Det finnes allerede en {0}-modell («{1}»). Vil du erstatte den med den nye filen? Trykk Avbryt for å beholde begge.", fag, lik.data.navn), tt("Erstatt")); if (svar) erstatt = lik; setBusy(tt("Leser egenskaper")); } }
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
      const data: Record<string, any> = { navn, filnavn: f.name, fag, path: deler[0], ...(deler.length > 1 ? { deler } : {}), str: blob.size, tid: new Date().toISOString(), antall: hode.elementer.length, etasjer: hode.etasjer.map(e => e.navn), opprettetAv: state.me?.navn || '' };
      if (erstatt) { for (const k of FELLES) if (erstatt.data[k] !== undefined) data[k] = erstatt.data[k]; data.versjoner = [{ navn: erstatt.data.navn, filnavn: erstatt.data.filnavn, tid: erstatt.data.tid, av: erstatt.data.opprettetAv }, ...(erstatt.data.versjoner || [])].slice(0, 20); }
      const { error } = await sb.from('modeller3d').insert({ eiendom_id: eid, data }); if (error) throw error;
      if (erstatt) { await slettFiler(erstatt); await sb.from('modeller3d').delete().eq('id', erstatt.id); }
      toast(erstatt ? tt("{0}-modellen er oppdatert – {1} objekter", fag, hode.elementer.length) : tt("{0}-modellen er lagt til – {1} objekter", fag, hode.elementer.length)); await last();
    } catch (e: any) { toast(feiltekst(e)); } finally { setBusy(''); }
  };
  const slett = async (r: Rec) => {
    if (!await confirmBox(tt("Slette {0}-modellen «{1}»? Koblinger mellom systemer og modellen beholdes.", fagAv(r), r.data.navn), tt("Slett"))) return;
    const rest = (mod || []).filter(x => x.id !== r.id); if (rest.length && hoved(mod!) === r) await flyttFelles(r, rest[0]);
    await slettFiler(r); await sb.from('modeller3d').delete().eq('id', r.id); await last();
  };
  const settFag = async (r: Rec, fag: string) => { await sb.from('modeller3d').update({ data: { ...r.data, fag } }).eq('id', r.id); await last(); };
  const L = mod || []; const sum = L.reduce((s, r) => s + (r.data.antall || 0), 0); const nokkel = L.map(r => r.id + fagAv(r)).join('|');
  // Mobil/nettbrett: store modeller åpnes ikke av seg selv. Brukeren velger fag først (minnet i mobilnettlesere er begrenset).
  const totalStr = L.reduce((s, r) => s + (r.data.str || 0), 0); const stor = erMobil && totalStr > STOR_MOBIL;
  const [valgt, setValgt] = useState<string[] | null>(null); const [kryss, setKryss] = useState<string[]>([]);
  useEffect(() => { if (!stor) return; const minst = [...L].sort((x, y) => (x.data.str || 0) - (y.data.str || 0)); let s = 0; setKryss(minst.filter(r => (s += r.data.str || 0) <= STOR_MOBIL || r === minst[0]).map(r => r.id)); setValgt(null); }, [nokkel, stor]);
  const opp = (r?: Rec) => <label className={'btn' + (r ? ' sm' : '')} style={{ display: 'inline-flex' }}>{r ? tt("Ny versjon") : L.length ? tt("Legg til fagmodell (IFC)") : tt("Last opp IFC-modell")}<input type="file" accept=".ifc,.ifczip,.zip" style={{ display: 'none' }} onChange={e => { velg(e.target.files?.[0], r); e.target.value = ''; }} /></label>;
  return <>
    {busy ? <div className="card"><b>{busy} …</b><div style={{ height: 8, background: 'var(--line2)', borderRadius: 4, marginTop: 8 }}><div style={{ height: 8, width: Math.round(pct * 100) + '%', background: '#1E4D57', borderRadius: 4, transition: 'width .3s' }} /></div><p className="small muted" style={{ marginBottom: 0 }}>{tt("Store modeller kan ta et minutt. Ikke lukk siden.")}</p></div>
      : <div className="toolbar" style={{ marginBottom: 10 }}><span className="grow small muted">{L.length ? <>{L.length > 1 ? tt("{0} fagmodeller", L.length) : L[0].data.navn} · {sum} {tt("objekter")} · {(L.reduce((s, r) => s + (r.data.str || 0), 0) / 1e6).toFixed(1)} MB <a href="#" onClick={e => { e.preventDefault(); setVisListe(!visListe); }}>{visListe ? tt("Skjul filer") : tt("Vis filer")}</a></> : ''}</span>
        {ed && L.length > 0 && <button className="btn" onClick={() => import('./SystemImport').then(m => m.importerSystemer(eid))}>{tt("Importer systemer og komponenter fra IFC")}</button>}{ed && opp()}</div>}
    {visListe && !busy && L.length > 0 && <div className="card"><div className="tbl-wrap"><table><thead><tr><th>{tt("Fag")}</th><th>{tt("Fil")}</th><th>{tt("Objekter")}</th><th>{tt("Lastet opp")}</th><th /></tr></thead><tbody>{L.map(r => <tr key={r.id}>
      <td>{ed ? <select value={fagAv(r)} onChange={e => settFag(r, e.target.value)}>{FAG.map(f => <option key={f.k} value={f.k}>{fagNavn(f.k)}</option>)}</select> : fagNavn(fagAv(r))}</td>
      <td className="small">{r.data.filnavn || r.data.navn}{(r.data.versjoner || []).length > 0 && <div className="muted">{tt("{0} tidligere versjon(er)", r.data.versjoner.length)}</div>}</td><td>{r.data.antall}</td><td className="small">{fd(r.data.tid)}{r.data.opprettetAv ? ' · ' + r.data.opprettetAv : ''}</td>
      <td style={{ whiteSpace: 'nowrap' }}>{ed && opp(r)} {ed && <button className="btn sm ghost" onClick={() => slett(r)}>{tt("Slett")}</button>}</td></tr>)}</tbody></table></div>
      <p className="small muted" style={{ marginBottom: 0 }}>{tt("Faget gjettes fra filnavnet (ARK, RIB, RIV, RIE, RIBr …). Rett det her om det ble feil. «Ny versjon» bytter ut filen og beholder mål, notater, tegningskoblinger og koblinger til systemer.")}</p></div>}
    {mod && !L.length && !busy && <Empty t={tt("Ingen 3D-modell er lastet opp ennå.")}><p className="small muted" style={{ maxWidth: 560, margin: '8px auto' }}>{tt("Last opp IFC-filer (.ifc eller .ifczip) fra arkitekt- og fagmodellene – ARK, RIB, RIV, RIE, RIBr osv. De settes sammen til én modell du kan snu og zoome på, slå fag av og på, se data for hver bygningsdel, koble til systemer og markere avvik i.")}</p></Empty>}
    {L.length > 0 && !busy && stor && !valgt && <div className="card">
      <b>{tt("Stor 3D-modell ({0} MB)", (totalStr / 1e6).toFixed(0))}</b>
      <p className="small muted" style={{ margin: '6px 0 10px' }}>{tt("På mobil og nettbrett kan store modeller bruke mer minne enn nettleseren tillater, og da lukkes siden. Velg hva du vil åpne – færre og mindre fag er tryggest.")}</p>
      {L.map(r => <label key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0' }}><input type="checkbox" checked={kryss.includes(r.id)} onChange={e => setKryss(e.target.checked ? [...kryss, r.id] : kryss.filter(x => x !== r.id))} />
        <span className="grow">{fagNavn(fagAv(r))} <span className="small muted">· {r.data.navn}</span></span><span className="small muted">{((r.data.str || 0) / 1e6).toFixed(0)} MB</span></label>)}
      <button className="btn pri" style={{ marginTop: 10 }} disabled={!kryss.length} onClick={() => setValgt(kryss)}>{tt("Åpne 3D-modellen")}</button></div>}
    {L.length > 0 && !busy && (!stor || valgt) && <>
      {stor && valgt && <p className="small muted" style={{ margin: '0 0 8px' }}>{valgt.length < L.length ? tt("Viser {0} av {1} fagmodeller.", valgt.length, L.length) : ''} <a href="#" onClick={e => { e.preventDefault(); setValgt(null); }}>{tt("Velg fag på nytt")}</a></p>}
      <Visning key={nokkel + '|' + (valgt || []).join(',')} eid={eid} modeller={L.map(r => ({ ...r, data: { ...r.data, fag: fagAv(r) } }))} hovedId={hoved(L).id} last={stor ? valgt : null} /></>}
  </>;
}

// ------------------------------------------------------------------ visning
function Visning({ eid, modeller, hovedId, last }: { eid: string; modeller: Rec[]; hovedId: string; last?: string[] | null }) {
  useStore(); const ed = canEdit(); const modellRad = modeller.find(r => r.id === hovedId) || modeller[0];
  // «Vis i 3D» legger igjen hva som skal vises. Hentes ut med en gang, slik at en side som lastes på nytt (f.eks. etter at nettleseren gikk tom for minne) ikke åpner modellen automatisk igjen.
  const [ventFokus] = useState(() => { try { const v = sessionStorage.getItem('ek.3dfokus') || ''; sessionStorage.removeItem('ek.3dfokus'); return { id: v }; } catch { return { id: '' }; } });
  const [fagVis, setFagVis] = useState<boolean[]>([]); const [fagListe, setFagListe] = useState<Samlet['fag']>([]);
  const vert = useRef<HTMLDivElement>(null); const T = useRef<any>({}); // three-objekter
  const [mod, setMod] = useState<Modell | null>(null); const [feil, setFeil] = useState(''); const [lastet, setLastet] = useState(0);
  const [sel, setSel] = useState<{ el: number; p: number[] } | null>(null); const [vis, setVis] = useState<boolean[]>([]); const [modus, setModus] = useState<'utseende' | 'status'>('utseende');
  const [snitt, setSnitt] = useState<number | null>(null); const [fokus, setFokus] = useState<string>(''); const [fok, setFok] = useState<{ navn: string; els: number[] } | null>(null); const [gjennom, setGjennom] = useState(false); const [skjul, setSkjul] = useState(false);
  const [verk, setVerk] = useState<Verk>('velg'); const [pkt, setPkt] = useState<V3[]>([]); const [merk, setMerk] = useState<Merk[]>(modellRad.data.merk || []); const [skjulM, setSkjulM] = useState<Record<string, boolean>>({});
  const [kal, setKal] = useState<Record<string, Kal>>(modellRad.data.kal || {}); const [visPl, setVisPl] = useState(true); const [plSel, setPlSel] = useState<{ col: string; id: string } | null>(null);
  const [kt, setKt] = useState(''); const [ksteg, setKsteg] = useState(0); const [kp, setKp] = useState<[number, number][]>([]); const [km, setKm] = useState<V3[]>([]); const [ksp, setKsp] = useState(false);
  const [lab, setLab] = useState<{ id: string; x: number; y: number; t: string; c: string; stor?: boolean }[]>([]); const [sjekk, setSjekk] = useState(false); const bf = useRef(false);
  const tegninger = S.tegninger.filter(t => t.eiendomId === eid && t.fil?.path);
  const lagreData = async (patch: Record<string, any>) => { const d = { ...modellRad.data, ...patch }; modellRad.data = d; const { error } = await sb.from('modeller3d').update({ data: d }).eq('id', modellRad.id); if (error) toast(feiltekst(error)); };

  // --- koblinger og status fra appen
  const anl = S.anlegg.filter(a => a.eiendomId === eid && !a.arkivert);
  const guidAnlegg = useMemo(() => { const m = new Map<string, string[]>(); anl.forEach(a => (a.ifcGuider || []).forEach((g: string) => m.set(g, [...(m.get(g) || []), a.id]))); return m; }, [S.anlegg]);
  const statusAnlegg = (id: string): keyof typeof ST => { const av = openAvvik().filter(a => a.anleggId === id); if (av.some(a => a.alv === 'Kritisk' || a.alv === 'Høy')) return 'rod';
    const o = S.oppgaver.filter(x => x.anleggId === id && x.aktiv !== false && x.nesteFrist); if (!o.length) return av.length ? 'snart' : 'ingen'; const d = Math.min(...o.map(x => dUntil(x.nesteFrist) as number)); return d < 0 ? 'rod' : (d <= 30 || av.length) ? 'snart' : 'ok'; };
  const statusEl = (guid: string): keyof typeof ST | null => { const ids = guidAnlegg.get(guid); if (!ids) return null; const s = ids.map(statusAnlegg); return s.includes('rod') ? 'rod' : s.includes('snart') ? 'snart' : s.includes('ok') ? 'ok' : 'ingen'; };

  // --- last modellen
  useEffect(() => { let av = false; (async () => { try {
    // Én fagmodell om gangen, lest rett fra nettet bit for bit – da holdes minnebruken nede (store modeller på mobil)
    const deler: Del[] = []; for (const r of modeller) { if (av) return; if (last && !last.includes(r.id)) continue; deler.push({ mod: await lesModellStrom(delStrom((r.data.deler as string[]) || [r.data.path], async p => fetch(await fileUrl(p)))), fag: r.data.fag, navn: r.data.navn, id: r.id }); }
    // Felles ramme: lagres på hovedmodellen. Har hovedmodellen ikke forskyvning (lastet opp før fagstøtte), brukes en midlertidig ramme.
    const hd = deler.find(d => d.id === modellRad.id); const K = hd?.mod.hode.koord;
    let ramme: number[] | null = modellRad.data.ramme || (K ? [K[12], K[13], K[14]] : rammeFra(deler));
    if (!modellRad.data.ramme && K && ed && ramme) { modellRad.data = { ...modellRad.data, ramme }; sb.from('modeller3d').update({ data: modellRad.data }).eq('id', modellRad.id).then(() => { }); }
    if (!K && !modellRad.data.ramme) ramme = rammeFra(deler);
    const m = samle(deler, ramme); if (!av) { setMod(m); setFagListe(m.fag); setFagVis(m.fag.map(() => true)); setVis(m.hode.etasjer.map(e => !e.terreng)); } } catch (e: any) { if (!av) setFeil(feiltekst(e)); } })(); return () => { av = true; }; }, []);

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
  useEffect(() => { if (!lastet) return; const f = () => setTimeout(fokuser, 30); window.addEventListener('ek3d-fokus', f); fokuser(); return () => window.removeEventListener('ek3d-fokus', f); }, [lastet]);
  function fokuser() { let id = ''; try { id = sessionStorage.getItem('ek.3dfokus') || ''; sessionStorage.removeItem('ek.3dfokus'); } catch { /* ignorer */ } if (!id) { id = ventFokus.id; ventFokus.id = ''; } if (!id) return;
    if (id.startsWith('k:')) { const k = byId('komponenter', id.slice(2)); const els = [k?.ifcGuid, ...(k?.ifcDeler || [])].map(g => g && T.current.farg?.get(g)).filter((x: any) => x != null) as number[]; if (!els.length) return; setVerk('velg'); setTimeout(() => { setSel({ el: els[0], p: senterAv(els[0]) }); fokusPaa(els, [tfmKomp(k!), k!.navn].filter(Boolean).join(' – ')); }, 50); return; }
    const a = byId('anlegg', id); if (!a) return;
    setFokus(id); setModus('status'); const els = (a.ifcGuider || []).map((g: string) => T.current.farg?.get(g)).filter((x: any) => x != null); setTimeout(() => fokusPaa(els, a.navn), 50); }

  useEffect(() => { const t = T.current; if (!t.mod) return; const TH = t.THREE;
    if (t.fokGrp) { t.scene.remove(t.fokGrp); tomGruppe(t.fokGrp); t.fokGrp = null; }
    t.meshes.forEach((m: THREE.Mesh) => { const o = m.userData.orig; if (!o) return; const mat = m.material as THREE.MeshStandardMaterial; mat.transparent = o.tr; mat.opacity = o.op; mat.depthWrite = o.dw; mat.needsUpdate = true; m.userData.orig = null; });
    t.fokusAnker = [];
    if (fok) {
      const pos: number[] = []; for (const e of fok.els) for (const i of t.segAvEl.get(e) || []) { const gi = t.mod.seg[i * 7 + 1], f = t.mod.seg[i * 7 + 4], c = t.mod.seg[i * 7 + 5]; const P = t.mod.grupper[gi].pos, I = t.mod.grupper[gi].idx; for (let k = f; k < f + c; k++) { const v = I[k]; pos.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); } }
      const geo = new TH.BufferGeometry(); geo.setAttribute('position', new TH.Float32BufferAttribute(pos, 3)); geo.computeVertexNormals();
      const g = new TH.Group(); const FARGE = '#ff6a00';
      const solid = new TH.Mesh(geo, new TH.MeshStandardMaterial({ color: FARGE, emissive: FARGE, emissiveIntensity: 0.45, roughness: 0.6, side: TH.DoubleSide, clippingPlanes: [t.plan], polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); solid.renderOrder = 5; g.add(solid);
      const xray = new TH.Mesh(geo.clone(), new TH.MeshBasicMaterial({ color: FARGE, transparent: true, opacity: 0.3, depthTest: false, depthWrite: false, side: TH.DoubleSide, clippingPlanes: [t.plan] })); xray.renderOrder = 9; g.add(xray);
      if (pos.length < 3 * 3 * 400000) { const kant = new TH.LineSegments(new TH.EdgesGeometry(geo, 30), new TH.LineBasicMaterial({ color: '#7a2e00', transparent: true, opacity: 0.9, depthTest: false, clippingPlanes: [t.plan] })); kant.renderOrder = 10; g.add(kant); }
      t.scene.add(g); t.fokGrp = g;
      if (gjennom) t.meshes.forEach((m: THREE.Mesh) => { const mat = m.material as THREE.MeshStandardMaterial; m.userData.orig = { tr: mat.transparent, op: mat.opacity, dw: mat.depthWrite }; mat.transparent = true; mat.opacity = Math.min(mat.opacity, 0.14); mat.depthWrite = false; mat.needsUpdate = true; });
      const b = boksAv(fok.els); if (!b.isEmpty()) { const c = b.getCenter(new TH.Vector3()); t.fokusAnker = [{ id: 'fokus', p: [c.x, b.max.y, c.z], t: fok.navn + (fok.els.length > 1 ? ` (${fok.els.length})` : ''), c: FARGE, stor: true }]; }
    }
    t.invalider(); projiser(); }, [fok, gjennom, lastet]);

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
  useEffect(() => { const t = T.current; if (!t.mod) return; t.meshes.forEach((m: THREE.Mesh, gi: number) => { const gr = t.mod.hode.grupper[gi]; m.visible = vis[gr.etasje] !== false && fagVis[gr.fag ?? 0] !== false && !(skjul && gr.glass); }); t.invalider(); }, [vis, skjul, lastet, fagVis]);
  useEffect(() => { const t = T.current; if (!t.mod) return; t.plan.constant = snitt == null ? 1e6 : snitt; t.invalider(); }, [snitt, lastet]);

  // --- avvik som markører
  const avvikM = openAvvik().filter(a => a.eiendomId === eid && a.modell?.x != null);
  useEffect(() => { const t = T.current; if (!t.mod) return; const g: THREE.Group = t.merker; while (g.children.length) { const c = g.children.pop() as THREE.Mesh; c.geometry.dispose(); (c.material as THREE.Material).dispose(); }
    const r = t.str * 0.011; for (const a of avvikM) { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), new THREE.MeshBasicMaterial({ color: a.alv === 'Kritisk' || a.alv === 'Høy' ? ST.rod : ST.snart, depthTest: false })); m.position.set(a.modell.x, a.modell.y, a.modell.z); m.renderOrder = 10; m.userData.avvik = a.id; g.add(m); } t.invalider(); }, [lastet, S.avvik]);

  // --- målinger og tegninger i modellen
  const projiser = () => { const t = T.current; if (!t.camera) return; t.ankre = t.ankre || []; const c = t.renderer.domElement; const w = c.clientWidth, hh = c.clientHeight; const v = new THREE.Vector3(); const ut: any[] = [];
    for (const a of [...t.ankre, ...(t.fokusAnker || [])]) { v.set(a.p[0], a.p[1], a.p[2]).project(t.camera); if (v.z > -1 && v.z < 1) ut.push({ id: a.id, x: Math.round((v.x + 1) / 2 * w), y: Math.round((1 - v.y) / 2 * hh), t: a.t, c: a.c, stor: a.stor }); } setLab(old => JSON.stringify(old) === JSON.stringify(ut) ? old : ut); };
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
  const senterAv = (e: number): number[] => { const t = T.current; let x = 0, y = 0, z = 0, n = 0; for (const i of t.segAvEl?.get(e) || []) { const gi = t.mod.seg[i * 7 + 1], vf = t.mod.seg[i * 7 + 2], vc = t.mod.seg[i * 7 + 3]; const p = t.mod.grupper[gi].pos; for (let v = vf; v < vf + vc; v++) { x += p[v * 3]; y += p[v * 3 + 1]; z += p[v * 3 + 2]; n++; } } return n ? [x / n, y / n, z / n] : [0, 0, 0]; };
  const boksAv = (els: Iterable<number>) => { const t = T.current; const b = new t.THREE.Box3(); for (const e of els) for (const i of t.segAvEl.get(e) || []) { const gi = t.mod.seg[i * 7 + 1], vf = t.mod.seg[i * 7 + 2], vc = t.mod.seg[i * 7 + 3]; const p = t.mod.grupper[gi].pos; for (let v = vf; v < vf + vc; v += 3) b.expandByPoint(new t.THREE.Vector3(p[v * 3], p[v * 3 + 1], p[v * 3 + 2])); } return b; };
  // Flyr kameraet til objektene: litt ovenfra, på trygg avstand, med myk overgang
  const flyTil = (els: Set<number> | number[]) => { const t = T.current; if (!t.mod) return; const b = boksAv(els);
    if (b.isEmpty()) return; const c = b.getCenter(new t.THREE.Vector3()); const r = Math.max(b.getSize(new t.THREE.Vector3()).length() / 2, 1.5);
    const fov = t.camera.fov * Math.PI / 180; const avst = Math.max(r / Math.sin(fov / 2) * 1.25, 9);
    const hor = t.camera.position.clone().sub(t.kontroll.target); hor.y = 0; if (hor.lengthSq() < 1e-6) hor.set(1, 0, 1); hor.normalize();
    const dir = hor.multiplyScalar(Math.cos(0.6)).add(new t.THREE.Vector3(0, Math.sin(0.6), 0)).normalize(); // ca. 35° ovenfra
    const fraP = t.camera.position.clone(), fraT = t.kontroll.target.clone(), tilP = c.clone().add(dir.multiplyScalar(avst)); const start = performance.now(); const varig = 650;
    const steg = (n: number) => { const k = Math.min(1, (n - start) / varig); const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      t.camera.position.lerpVectors(fraP, tilP, e); t.kontroll.target.lerpVectors(fraT, c, e); t.kontroll.update(); t.invalider(); if (k < 1) requestAnimationFrame(steg); };
    requestAnimationFrame(steg); };
  // Fokus: markerer objektene tydelig, gjør resten gjennomsiktig og viser navnet over
  const fokusPaa = (els: number[], navn: string) => { if (!els.length) return; setFok({ navn, els }); setTimeout(() => vert.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 30); flyTil(els); };

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
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>{lab.map(l => l.stor ? <div key={l.id} style={{ position: 'absolute', left: l.x, top: l.y, transform: 'translate(-50%,-100%)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}><div style={{ background: l.c, color: '#fff', borderRadius: 8, padding: '4px 10px', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', boxShadow: '0 2px 8px #0004', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.t}</div><div style={{ width: 2, height: 26, background: l.c }} /></div>
        : <div key={l.id} style={{ position: 'absolute', left: l.x, top: l.y, transform: 'translate(-50%,-130%)', background: '#fffe', border: '1px solid ' + l.c, color: '#1b2a2f', borderRadius: 6, padding: '1px 6px', fontSize: 12, whiteSpace: 'nowrap', fontWeight: 600 }}>{l.t}</div>)}</div>
      {fok && <div style={{ position: 'absolute', left: '50%', bottom: 12, transform: 'translateX(-50%)', display: 'flex', gap: 8, alignItems: 'center', background: '#1b2a2ff2', color: '#fff', borderRadius: 10, padding: '6px 8px 6px 12px', fontSize: 13, maxWidth: 'calc(100% - 24px)', flexWrap: 'wrap', justifyContent: 'center', boxShadow: '0 4px 14px #0003' }}>
        <span style={{ width: 10, height: 10, borderRadius: 3, background: '#ff6a00', display: 'inline-block' }} /><b style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}>{fok.navn}</b>
        <label style={{ display: 'flex', gap: 4, alignItems: 'center', cursor: 'pointer' }}><input type="checkbox" checked={gjennom} onChange={e => setGjennom(e.target.checked)} />{tt("Gjennomsiktig rundt")}</label>
        <button className="btn sm" style={{ color: '#1b2a2f' }} onClick={() => flyTil(fok.els)}>{tt("Zoom til")}</button><button className="btn sm" style={{ color: '#1b2a2f' }} onClick={() => { setFok(null); setFokus(''); }}>{tt("Avslutt fokus")}</button></div>}
      <div style={{ position: 'absolute', right: 10, top: 10, display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: '50%' }}>{([['velg', 'Velg'], ['avstand', 'Avstand'], ['areal', 'Areal'], ['vinkel', 'Vinkel'], ['linje', 'Tegn linje'], ['notat', 'Notat'], ['kal', 'Tegning']] as [Verk, string][]).filter(([v]) => v === 'velg' || v === 'avstand' || v === 'areal' || v === 'vinkel' || ed || v === 'kal').map(([v, n]) => <button key={v} className={'btn sm' + (verk === v ? ' pri' : '')} style={{ background: verk === v ? undefined : '#fffd' }} onClick={() => velgVerk(v)}>{tt(n)}</button>)}</div>
      <div style={{ position: 'absolute', left: 10, top: 10, display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 'calc(100% - 20px)' }}>
        <div className="seg" style={{ background: '#fffd', borderRadius: 8, padding: 4, display: 'inline-flex', gap: 4 }}><button className={'btn sm' + (modus === 'utseende' ? ' pri' : '')} onClick={() => setModus('utseende')}>{tt("Utseende")}</button><button className={'btn sm' + (modus === 'status' ? ' pri' : '')} onClick={() => setModus('status')}>{tt("Status")}</button></div>
        {fagListe.length > 1 && <div style={{ background: '#fffd', borderRadius: 8, padding: '6px 8px', fontSize: 12 }}><b>{tt("Fag")}</b>
          {fagListe.map((f, i) => <label key={f.id} title={f.navn} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '2px 0' }}><input type="checkbox" checked={fagVis[i] !== false} onChange={x => setFagVis(v => v.map((y, j) => j === i ? x.target.checked : y))} />{fagNavn(f.k)}{f.utenKoord && <span title={tt("Lastet opp før fagstøtte – kan ligge feil i forhold til de andre fagene")} style={{ color: '#b54708' }}> ⚠</span>}</label>)}
          <div style={{ marginTop: 4, display: 'flex', gap: 4 }}><button className="btn sm" onClick={() => setFagVis(fagListe.map(() => true))}>{tt("Alle")}</button>{sel && <button className="btn sm" onClick={() => setFagVis(fagListe.map((_, i) => i === (h.elementer[sel.el].f ?? 0)))}>{tt("Kun valgt fag")}</button>}</div></div>}
        <div style={{ background: '#fffd', borderRadius: 8, padding: '6px 8px', fontSize: 12, maxHeight: 260, overflowY: 'auto' }}><b>{tt("Etasjer")}</b>
          {h.etasjer.map((e, i) => <label key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '2px 0' }}><input type="checkbox" checked={vis[i] !== false} onChange={x => setVis(v => v.map((y, j) => j === i ? x.target.checked : y))} />{e.navn}</label>)}
          <div style={{ marginTop: 4, display: 'flex', gap: 4 }}><button className="btn sm" onClick={() => setVis(h.etasjer.map(e => !e.terreng))}>{tt("Alle")}</button>{sel && <button className="btn sm" onClick={() => setVis(vis.map((_, i) => i === h.elementer[sel.el].e))}>{tt("Kun valgt")}</button>}</div>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}><input type="checkbox" checked={skjul} onChange={e => setSkjul(e.target.checked)} />{tt("Skjul glass")}</label></div>
        <div style={{ background: '#fffd', borderRadius: 8, padding: '6px 8px', fontSize: 12 }}><label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={snitt != null} onChange={e => setSnitt(e.target.checked ? (sna + snb) / 2 : null)} /><b>{tt("Snitt (høyde)")}</b></label>
          {snitt != null && <input type="range" min={sna} max={snb} step="any" value={snitt} onChange={e => setSnitt(+e.target.value)} style={{ width: 150, display: 'block' }} />}</div></div>
      {modus === 'status' && <div style={{ position: 'absolute', left: 10, bottom: 10, background: '#fffd', borderRadius: 8, padding: '6px 10px', fontSize: 12 }}>{stat('ok')}{stat('snart')}{stat('rod')}{stat('ingen')}<span className="muted">{tt("Grå = ikke koblet til system")}</span></div>}
      <div style={{ position: 'absolute', right: 10, bottom: 8, fontSize: 11, color: '#51656b' }}>{verk === 'velg' ? tt("Dra: snu · Skroll: zoom · Høyre knapp/to fingre: flytt · Klikk: velg") : tt("Klikk i modellen for å sette punkter – de fester seg til nærmeste hjørne")}</div></div>
    {fagListe.length > 1 && fagListe.some(f => f.utenKoord) && <div className="card" style={{ background: '#fff7e0' }}><span className="small">{tt("Disse modellene ble lastet opp før appen kunne sette sammen fag, og kan ligge forskjøvet i forhold til de andre: {0}. Last dem opp på nytt med «Ny versjon» (under «Vis filer») – mål, notater og koblinger beholdes.", fagListe.filter(f => f.utenKoord).map(f => `${f.k} «${f.navn}»`).join(', '))}</span></div>}
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
        <dl className="dl">{fagListe.length > 1 && <><dt>{tt("Fag")}</dt><dd>{fagNavn(fagListe[el.f ?? 0]?.k)} · {fagListe[el.f ?? 0]?.navn}</dd></>}<dt>{tt("Etasje")}</dt><dd>{h.etasjer[el.e]?.navn}</dd>{el.t && <><dt>{tt("Merke / tag")}</dt><dd>{el.t}</dd></>}{eg?.ns && <><dt>NS 3451</dt><dd>{eg.ns}</dd></>}{eg?.type && <><dt>{tt("Type")}</dt><dd>{eg.type}</dd></>}
          {Object.entries(eg?.egenskaper || {}).slice(0, 14).map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}{Object.entries(eg?.mengder || {}).slice(0, 6).map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{Math.round(v * 100) / 100}</dd></React.Fragment>)}
          <dt>GUID</dt><dd className="mono small">{el.g}</dd></dl>
        <h3 style={{ marginBottom: 4 }}>{tt("Koblet til i appen")}</h3>
        {S.komponenter.filter(k => k.ifcGuid === el.g || (k.ifcDeler || []).includes(el.g)).map(k => <div key={k.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '3px 0', flexWrap: 'wrap' }}><Chip>{tt("Komponent")}</Chip><b>{[tfmKomp(k), k.navn].filter(Boolean).join(' – ')}</b><span className="small muted">{aNavn(k.anleggId)}{k.fabrikat ? ' · ' + k.fabrikat : ''}</span><button className="btn sm" onClick={() => editKomponent(k.id)}>{tt("Åpne")}</button></div>)}
        {koblet.length ? koblet.map(a => { const an = byId('anlegg', a)!; return <div key={a} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '3px 0', flexWrap: 'wrap' }}><Chip c={({ ok: 'green', snart: 'amber', rod: 'red', ingen: '' } as any)[statusAnlegg(a)]}>{({ ok: tt("I orden"), snart: tt("Snart"), rod: tt("Forfalt"), ingen: tt("Ingen kontroll") } as any)[statusAnlegg(a)]}</Chip><b>{aNavn(a)}</b>
          <span className="small muted">{S.oppgaver.filter(o => o.anleggId === a && o.aktiv !== false).length} {tt("kontroller")} · {openAvvik().filter(x => x.anleggId === a).length} {tt("åpne avvik")}</span>{ed && <button className="btn sm ghost" onClick={() => fjern(a)}>{tt("Fjern kobling")}</button>}<button className="btn sm" onClick={() => { setFokus(a); flyTil(new Set((an.ifcGuider || []).map((g: string) => T.current.farg.get(g)).filter((x: any) => x != null))); }}>{tt("Vis alle i modellen")}</button></div>; }) : <p className="small muted" style={{ margin: '0 0 6px' }}>{tt("Ikke koblet til noe system.")}</p>}
        <div className="toolbar">{ed && <button className="btn sm" onClick={koble} disabled={!el.g}>{tt("Koble til system")}</button>}{ed && <button className="btn sm pri" onClick={nyttAvvik}>{tt("Registrer avvik her")}</button>}</div>
      </> : <>
        <div className="toolbar" style={{ marginBottom: 6 }}><h2 style={{ margin: 0, flex: 1 }}>{tt("Systemer i modellen")}</h2>{fokus && <button className="btn sm" onClick={() => { setFokus(''); setFok(null); }}>{tt("Fjern markering")}</button>}</div>
        <p className="small muted" style={{ marginTop: 0 }}>{tt("Klikk på en bygningsdel i modellen for å se data, koble den til et system eller registrere avvik. Velg et system under for å se hvor det står i bygget.")}</p>
        {anl.filter(a => (a.ifcGuider || []).length).length ? <div className="tbl-wrap"><table><thead><tr><th>{tt("System")}</th><th>{tt("Objekter")}</th><th>{tt("Status")}</th><th /></tr></thead><tbody>{anl.filter(a => (a.ifcGuider || []).length).map(a => <tr key={a.id}><td><b>{aNavn(a.id)}</b></td><td>{a.ifcGuider.length}</td><td><Chip c={({ ok: 'green', snart: 'amber', rod: 'red', ingen: '' } as any)[statusAnlegg(a.id)]}>{({ ok: tt("I orden"), snart: tt("Snart"), rod: tt("Forfalt"), ingen: tt("Ingen kontroll") } as any)[statusAnlegg(a.id)]}</Chip></td><td><button className="btn sm" onClick={() => { setFokus(a.id); fokusPaa(a.ifcGuider.map((g: string) => T.current.farg.get(g)).filter((x: any) => x != null), a.navn); }}>{tt("Vis i modellen")}</button></td></tr>)}</tbody></table></div> : <p className="small muted">{tt("Ingen systemer er koblet til modellen ennå.")}</p>}
        <div className="toolbar" style={{ margin: '6px 0' }}><label className="small" style={{ display: 'flex', gap: 5, alignItems: 'center' }}><input type="checkbox" checked={visPl} onChange={e => setVisPl(e.target.checked)} />{tt("Vis plasseringer fra tegninger ({0})", plassert.length)}</label><span className="grow" />{anl.some(a => (a.ifcGuider || []).length) && <button className="btn sm" onClick={() => setSjekk(true)}>{tt("Sjekk koblinger")}</button>}</div>
        {Object.keys(kal).length > 0 && <p className="small muted" style={{ margin: '0 0 6px' }}>{tt("Koblede tegninger:")} {Object.keys(kal).map(id => byId('tegninger', id)?.navn).filter(Boolean).join(', ')}</p>}
        {merk.length > 0 && <><h3 style={{ marginBottom: 4 }}>{tt("Mål og tegninger")}</h3>{merk.map(m => <div key={m.id} className="small" style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '2px 0', flexWrap: 'wrap' }}><i style={{ width: 10, height: 10, borderRadius: 3, background: m.farge, display: 'inline-block' }} /><label style={{ display: 'flex', gap: 4, alignItems: 'center' }}><input type="checkbox" checked={!skjulM[m.id]} onChange={e => setSkjulM({ ...skjulM, [m.id]: !e.target.checked })} /><b>{m.tekst || ({ avstand: tt("Avstand"), areal: tt("Areal"), vinkel: tt("Vinkel"), linje: tt("Linje"), notat: tt("Notat") } as any)[m.type]}</b></label><span className="muted">{resultat(m.type, m.pts)}</span>{ed && <button className="btn sm ghost" onClick={() => slettMerk(m.id)}>{tt("Slett")}</button>}</div>)}</>}
        {avvikM.length > 0 && <><h3 style={{ marginBottom: 4 }}>{tt("Avvik markert i modellen")}</h3>{avvikM.map(a => <div key={a.id} className="small" style={{ padding: '2px 0' }}><a href="#" onClick={e => { e.preventDefault(); editAvvik(a.id); }}>{a.tittel}</a> <span className="muted">{a.modell.etasje} · {fd(a.oppdaget || today())}</span></div>)}</>}
      </>}
    </div></div>;
}
