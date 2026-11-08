// Befaringsmodul: liste, ny befaring, befaringsside (sjekkpunkter, tegning og funn, målere/nøkler, rapport og signering).
// Alt arbeid lagres først på enheten og synkes når det er nett (se lib/befaring.ts og lib/offline.ts).
import React, { useEffect, useRef, useState } from 'react';
import { Hjelp } from '../components/Hjelp';
import { S, state, toast, useStore, kanDrifteE, kanRedigereE, aoApi, sb, uploadFile, fileUrl, removeDoc, isStaff, type Fil } from '../lib/store';
import { byId, eNavn, fd, fdt, lNavn, sortBy, today, uid, aNavn, kNavn, type Rec } from '../lib/utils';
import { Chip, Empty, confirmBox, formModal, openModal, ModalFrame, FileLink, useFileUrl, AlvChip } from '../components/ui';
import { AV_ALV, KOMP } from '../lib/catalog';
import { UTBEDRER, editAvvik } from '../lib/actions';
import { harModul } from '../lib/moduler';
import { NsVelger, nsNavn } from '../components/NsVelger';
import { BefTegning, type Skala } from '../components/BefTegning';
import { SignaturFelt } from '../components/Signatur';
import { Sel, useFilter } from './common';
import { sendAo } from '../lib/arbeidsordre';
import { ART_NAVN, BSTATUS, BTYPER, LEIEFORLOP, ROLLER_DELT, ROM_PUNKTER, alleBefaringer, btype, erLokal, forkastUtkast, funnStatus, lagreBefaring, lastLokale, lokaleBefaringer, loggB, nyBefaring, sisteFor, synkBefaring, synkStatus, tellFunn, useBefaring, vpliktPunkter, type Art, type BFil, type Funn, type Punkt, type Shape } from '../lib/befaring';
import { komprimer, lagreLokalFil, lokalUrl, paaNett, tegningBlob, harTegningLokalt } from '../lib/offline';
import { befaringPdf, sha256 } from '../lib/befaringRapport';
import { tt, lokale, ttc } from '../lib/i18n';
import { sprakForEiendom, sprakValg } from '../components/MottakerSprak';

type O = Record<string, any>;
const go = (p: string) => { location.hash = '#/' + p; };
const stFarge = (s: string) => ({ Planlagt: 'blue', 'Pågår': 'amber', 'Fullført': 'green', 'Til signering': 'blue', Signert: 'green', Avbrutt: '' } as any)[s] || '';
const redigerbar = (b: Rec) => ['Planlagt', 'Pågår'].includes(b.status);

// ---------------- små byggeklosser
function Thumb({ f, onDel }: { f: BFil; onDel?: () => void }) {
  const [lu, setLu] = useState(''); const ru = useFileUrl(erLokal(f) ? undefined : (f as Fil).path);
  useEffect(() => { if (erLokal(f)) lokalUrl(f.lokal).then(setLu); }, [erLokal(f) ? f.lokal : '']);
  const u = erLokal(f) ? lu : ru; const bilde = /^image\//.test(f.type || '') || /\.(jpe?g|png|webp|gif)$/i.test(f.navn || '');
  return <span className="bf-thumb">{bilde && u ? <a href={u} target="_blank" rel="noopener noreferrer"><img src={u} alt={f.navn} /></a> : <span className="small">{f.navn}</span>}
    {erLokal(f) && <span className="bf-lokal" title={tt("Lagret på enheten – lastes opp når det er nett")}>●</span>}
    {onDel && <button type="button" aria-label={tt("Fjern bilde")} onClick={onDel}>✕</button>}</span>;
}
export function Kamera({ leggTil, liten }: { leggTil: (f: BFil[]) => void; liten?: boolean }) {
  const kam = useRef<HTMLInputElement>(null); const fil = useRef<HTMLInputElement>(null);
  const ta = async (l: FileList | null) => { if (!l?.length) return; const out: BFil[] = []; for (const f of Array.from(l)) { const b = await komprimer(f); out.push(await lagreLokalFil(b, f.name.replace(/\.(heic|png|webp)$/i, '.jpg') || 'bilde.jpg')); } leggTil(out); };
  return <span style={{ display: 'inline-flex', gap: 6 }}>
    <button type="button" className={'btn sm' + (liten ? ' ghost' : '')} onClick={() => kam.current?.click()} aria-label={tt("Ta bilde")}>📷{liten ? '' : tt(" Ta bilde")}</button>
    {!liten && <button type="button" className="btn sm ghost" onClick={() => fil.current?.click()}>{tt("+ Fra fil")}</button>}
    <input ref={kam} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => { ta(e.target.files); e.target.value = ''; }} />
    <input ref={fil} type="file" multiple accept="image/*,application/pdf" style={{ display: 'none' }} onChange={e => { ta(e.target.files); e.target.value = ''; }} />
  </span>;
}
export function SynkMerke({ id }: { id: string }) {
  useStore(); const s = synkStatus[id];
  if (!s?.usynket) return s?.t ? <Chip c="green" title={tt("Synket ") + new Date(s.t).toLocaleTimeString(lokale())}>{tt("Lagret")}</Chip> : null;
  if (s.feil) return <Chip c="red" title={s.feil}>{tt("Ikke lagret på server")}</Chip>;
  return <Chip c="amber" title={tt("Endringene ligger på enheten og lagres på serveren når det er nett")}>{paaNett() ? tt("Lagrer …") : tt("Lagret på enheten")}</Chip>;
}

// ---------------- ny befaring
export function nyBefaringDialog(preset: O = {}) {
  preset = Object.fromEntries(Object.entries(preset).filter(([, v]) => v !== undefined && v !== ''));
  const E = sortBy(S.eiendommer.filter(e => kanDrifteE(e.id) && harModul('befaring', e.id)), e => e.navn);
  if (!E.length) return toast(S.eiendommer.some(e => kanDrifteE(e.id)) ? tt("Befaringsmodulen er ikke aktivert for eieren av eiendommene dine") : tt("Du har ikke tilgang til å gjennomføre befaringer"));
  formModal({ title: tt("Ny befaring"), saveTxt: tt("Start befaring"), values: { eiendomId: preset.eiendomId && E.some(e => e.id === preset.eiendomId) ? preset.eiendomId : E[0].id, type: preset.type || 'tilfeldig', dato: today(), ...preset }, fields: [
    { k: 'type', label: tt("Type befaring"), type: 'select', options: BTYPER.map(t => [t.k, t.navn] as [string, string]), req: true },
    { k: 'info', type: 'custom', render: v => <p className="small muted" style={{ margin: '-4px 0 0' }}>{btype(v.type).beskr}</p> },
    { k: 'eiendomId', label: tt("Eiendom"), type: 'select', options: E.map(e => [e.id, e.navn] as [string, string]), req: true, half: true },
    { k: 'dato', label: tt("Dato"), type: 'date', half: true },
    { k: 'leietakerId', label: tt("Leietaker"), type: 'select', empty: tt("– velg –"), half: true, show: v => !!btype(v.type).leie, req: false,
      options: (v: any) => sortBy(S.leietakere.filter(l => l.eiendomId === v?.eiendomId), l => l.navn).map(l => [l.id, l.navn] as [string, string]), hint: tt("Forbefaring kan gjøres før leietakeren er registrert") },
    { k: 'lokale', label: tt("Lokale / leieobjekt"), half: true, show: v => !!btype(v.type).leie, ph: tt("F.eks. 2. etg øst") },
    { k: 'prosjektId', label: tt("Prosjekt"), type: 'select', empty: tt("– ingen –"), show: v => !!btype(v.type).garanti && harModul('prosjekter', v.eiendomId), options: (v: any) => S.prosjekter.filter(p => p.eiendomId === v?.eiendomId).map(p => [p.id, p.navn] as [string, string]) },
    { k: 'garantiType', label: tt("Garantibefaring"), type: 'select', show: v => !!btype(v.type).garanti, options: ['Overtakelse', 'Ettårsbefaring', 'Treårsbefaring (reklamasjon)', 'Femårsbefaring', 'Annen'], half: true },
    { k: 'tittel', label: tt("Tittel (valgfri)"), ph: tt("Lages automatisk") }],
    onSave: async v => {
      if (btype(v.type).vplikt && !v.leietakerId) { toast(tt("Velg leietaker – sjekkpunktene hentes fra leieavtalen")); return false; }
      const x: O = { leietakerId: v.leietakerId || '', lokale: v.lokale || '', dato: v.dato || today() };
      if (v.prosjektId) { x.prosjektId = v.prosjektId; const p = byId('prosjekter', v.prosjektId); if (p?.entreprenor) x.entreprenor = p.entreprenor; }
      if (v.garantiType) x.garantiType = v.garantiType;
      const rec = nyBefaring(v.eiendomId, v.type, x); if (v.tittel?.trim()) rec.tittel = v.tittel.trim();
      if (v.garantiType && !v.tittel?.trim()) rec.tittel = `${v.garantiType}${v.prosjektId ? ' – ' + byId('prosjekter', v.prosjektId)?.navn : ''}`;
      rec.id = uid(); lokaleBefaringer[rec.id] = rec; await lagreBefaring(rec); go('befaring/' + rec.id);
    } });
}

// ---------------- liste
export function Befaringer({ eiendomId, leietakerId, kompakt }: { eiendomId?: string; leietakerId?: string; kompakt?: boolean }) {
  useStore();
  const [f, setF] = useFilter('befaringer', { e: '', t: '', s: 'aktive', q: '' });
  useEffect(() => { lastLokale(); }, []);
  let L = alleBefaringer();
  if (eiendomId) L = L.filter(b => b.eiendomId === eiendomId); else if (f.e) L = L.filter(b => b.eiendomId === f.e);
  if (leietakerId) L = L.filter(b => b.leietakerId === leietakerId);
  if (!kompakt) { if (f.t) L = L.filter(b => b.type === f.t); if (f.s === 'aktive') L = L.filter(b => !['Signert', 'Avbrutt'].includes(b.status)); else if (f.s) L = L.filter(b => b.status === f.s);
    if (f.q) { const q = f.q.toLowerCase(); L = L.filter(b => `${b.tittel} ${eNavn(b.eiendomId)} ${lNavn(b.leietakerId)} ${btype(b.type).navn}`.toLowerCase().includes(q)); } }
  L = sortBy(L, b => b.dato || '').reverse();
  const kan = S.eiendommer.some(e => kanDrifteE(e.id) && harModul('befaring', e.id));
  const tabell = !L.length ? <div className="card"><Empty t="Ingen befaringer">{kan ? tt("Start en befaring – den kan gjennomføres på mobil eller nettbrett, også uten nett.") : ''}</Empty></div> :
    <div className="tbl-wrap"><table><thead><tr><th>{tt("Befaring")}</th>{!eiendomId && <th>{tt("Eiendom")}</th>}<th>{tt("Dato")}</th><th>{tt("Status")}</th><th className="num">{tt("Funn")}</th><th className="num">{tt("Åpne avvik")}</th></tr></thead><tbody>
      {L.map(b => { const n = tellFunn(b); return <tr key={b.id} className="click" onClick={() => go('befaring/' + b.id)}>
        <td><b style={{ fontWeight: 600 }}>{b.tittel || btype(b.type).navn}</b> <SynkMerke id={b.id} /><div className="small muted">{btype(b.type).navn}{b.leietakerId ? ' · ' + lNavn(b.leietakerId) : ''}</div></td>
        {!eiendomId && <td className="small">{eNavn(b.eiendomId)}</td>}<td className="small">{fd(b.dato)}</td><td><Chip c={stFarge(b.status)}>{b.status}</Chip>{b.analyse?.overfort && <div className="small muted">{tt("I tilsynsanalyser")}</div>}</td>
        <td className="num">{n.n || '–'}</td><td className="num" style={{ color: n.apne ? 'var(--red)' : undefined }}>{n.avvik ? n.apne : '–'}</td></tr>; })}
    </tbody></table></div>;
  if (kompakt) return <>{tabell}</>;
  return <>
    <div className="head"><div className="grow"><h1>{tt("Befaringer")}<Hjelp id="side.befaringer" /></h1><p className="sub">{tt("Leieforhold fra forbefaring til tilbakelevering, energityven, HMS, garanti og systemregistrering – med funn på tegning, ansvar og frist.")}</p></div>
      {kan && <button className="btn" onClick={() => klarUtenNett()}>{tt("Gjør klar uten nett")}</button>}
      {kan && <button className="btn pri" onClick={() => nyBefaringDialog({ eiendomId: f.e || undefined })}>{tt("+ Ny befaring")}</button>}</div>
    {!paaNett() && <div className="note small" style={{ marginBottom: 10 }}>{tt("Du er uten nett. Befaringer lagres på enheten og synkes automatisk når nettet er tilbake.")}</div>}
    <div className="toolbar"><input placeholder={tt("Søk …")} value={f.q} onChange={e => setF({ q: e.target.value })} style={{ border: '1px solid var(--line2)', borderRadius: 8, padding: '7px 9px' }} />
      <Sel value={f.e} onChange={e => setF({ e })} opts={sortBy(S.eiendommer, e => e.navn).map(e => [e.id, e.navn] as [string, string])} empty={tt("Alle eiendommer")} />
      <Sel value={f.t} onChange={t => setF({ t })} opts={BTYPER.map(t => [t.k, t.kort] as [string, string])} empty={tt("Alle typer")} />
      <Sel value={f.s} onChange={s => setF({ s })} opts={[['aktive', 'Aktive'], ...BSTATUS.map(s => [s, s] as [string, string])]} empty={tt("Alle statuser")} />
      <span className="small muted">{L.length} {tt("befaringer")}</span></div>
    {tabell}
  </>;
}

/** Last ned tegningene for valgte eiendommer til enheten */
function klarUtenNett() {
  const E = sortBy(S.eiendommer.filter(e => kanDrifteE(e.id) && harModul('befaring', e.id)), e => e.navn);
  formModal({ title: tt("Gjør klar for befaring uten nett"), saveTxt: tt("Last ned"), values: { eids: E.length === 1 ? [E[0].id] : [] }, fields: [
    { k: 'i', type: 'custom', render: () => <p className="small" style={{ margin: 0 }}>{tt("Appen husker siste data for alle eiendommene dine. Her lastes også")} <b>{tt("tegningene")}</b> {tt("ned til enheten, slik at du kan registrere funn på tegning i kjeller, tekniske rom eller andre steder uten dekning. Start appen på nett minst én gang før du drar.")}</p> },
    { k: 'eids', type: 'custom', label: tt("Eiendommer"), def: [], render: (v, set) => <div style={{ maxHeight: 260, overflow: 'auto', border: '1px solid var(--line)', borderRadius: 8, padding: '4px 8px' }}>{E.map(e => { const n = S.tegninger.filter(t => t.eiendomId === e.id && t.fil?.path).length; return <label key={e.id} className="small" style={{ display: 'flex', gap: 6, fontWeight: 400 }}><input type="checkbox" style={{ width: 'auto' }} checked={(v.eids || []).includes(e.id)} onChange={x => set({ eids: x.target.checked ? [...(v.eids || []), e.id] : (v.eids || []).filter((i: string) => i !== e.id) })} />{e.navn} <span className="muted">({n} {tt("tegning")}{n === 1 ? '' : tt("er")})</span></label>; })}</div> }],
    onSave: async v => { if (!paaNett()) { toast(tt("Du må være på nett for å laste ned")); return false; }
      const T = S.tegninger.filter(t => (v.eids || []).includes(t.eiendomId) && t.fil?.path); let ok = 0; for (const t of T) { if (await harTegningLokalt(t.fil.path) || await tegningBlob(t.fil.path, () => fileUrl(t.fil.path))) ok++; }
      toast(tt("{0} av {1} tegninger er lagret på enheten", ok, T.length)); } });
}

// ---------------- befaringsside
export function BefaringSide({ id }: { id: string }) {
  useStore();
  const [b, oppd, lastet] = useBefaring(id); const [fane, setFane] = useState('punkter');
  const [tid, setTid] = useState('');
  useEffect(() => { if (b && !tid) { const T = sortBy(S.tegninger.filter(t => t.eiendomId === b.eiendomId && t.fil?.path), t => +t.etasje || 0); const brukt = (b.funn || []).find((f: Funn) => f.pos)?.pos?.tegningId; setTid(brukt || T[0]?.id || ''); } }, [b?.id]);
  useEffect(() => { if (b && !b.punkter?.length && fane === 'punkter' && ['tilfeldig', 'annen', 'system'].includes(b.type)) setFane('tegning'); }, [b?.id]);
  if (!lastet) return <div className="card"><p>{tt("Laster …")}</p></div>;
  if (!b) return <div className="card"><Empty t="Fant ikke befaringen">{tt("Den kan være slettet, eller du mangler tilgang.")}</Empty></div>;
  const T = btype(b.type); const kan = kanDrifteE(b.eiendomId) || !!b._lokal; const ro = !kan || !redigerbar(b);
  const F: Funn[] = b.funn || []; const P: Punkt[] = b.punkter || [];
  const ferdigP = P.filter(p => p.svar).length;
  const tabs: [string, string][] = [['punkter', tt('Sjekkpunkter') + (P.length ? ` (${ferdigP}/${P.length})` : '')], ['tegning', 'Tegning og funn'], ['funn', `${tt('Funn')} (${F.length})`], ['info', 'Deltakere og info'], ...((T.maalere || T.nokler) ? [['maalere', 'Målere og nøkler'] as [string, string]] : []), ['rapport', 'Rapport og signering'], ['logg', 'Logg']];
  const fullfor = async () => {
    const mangler = P.filter(p => !p.svar).length; if (mangler && !(await confirmBox(tt("{0} sjekkpunkt{1} er ikke besvart. Fullføre likevel?", mangler, mangler > 1 ? 'er' : ''), tt("Fullfør")))) return;
    oppd(x => loggB({ ...x, status: 'Fullført', fullfort: today() }, 'Befaringen er fullført')); setFane('rapport'); toast(tt("Befaringen er fullført – lag rapporten og send den til signering"));
  };
  return <>
    <div className="head"><div className="grow"><p className="small" style={{ margin: 0 }}><a href="#/befaringer">{tt("← Befaringer")}</a> · <a href={'#/eiendom/' + b.eiendomId}>{eNavn(b.eiendomId)}</a>{b.leietakerId ? <> · <a href={'#/leietaker/' + b.leietakerId}>{lNavn(b.leietakerId)}</a></> : null}</p>
      <h1 style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>{b.tittel || T.navn} <Chip c={stFarge(b.status)}>{b.status}</Chip> <SynkMerke id={b.id} /></h1>
      <p className="sub">{T.navn} · {fd(b.dato)}{b.lokale ? ' · ' + b.lokale : ''}{b.forrigeId && byId('befaringer', b.forrigeId) ? <> {tt("· sammenlignes med")} <a href={'#/befaring/' + b.forrigeId}>{btype(byId('befaringer', b.forrigeId)!.type).kort.toLowerCase()} {fd(byId('befaringer', b.forrigeId)!.dato)}</a></> : null}</p></div>
      {kan && redigerbar(b) && <button className="btn pri" onClick={fullfor}>{tt("Fullfør befaring")}</button>}
      {kan && !redigerbar(b) && b.status !== 'Avbrutt' && <button className="btn" onClick={async () => { if (b.status === 'Signert' && !(await confirmBox(tt("Rapporten er signert. Gjenåpner du befaringen og endrer den, må den signeres på nytt."), tt("Gjenåpne")))) return; oppd(x => loggB({ ...x, status: 'Pågår', gjenapnet: new Date().toISOString() }, 'Befaringen er gjenåpnet')); }}>{tt("Gjenåpne")}</button>}
    </div>
    {synkStatus[b.id]?.feil && <div className="note small" style={{ marginBottom: 10, color: 'var(--red)' }}>{tt("Kunne ikke lagre på serveren:")} {synkStatus[b.id].feil} <button className="btn sm" onClick={() => synkBefaring(b.id)}>{tt("Prøv igjen")}</button>{isStaff() && <button className="btn sm ghost" onClick={async () => { if (await confirmBox(tt("Forkaste endringene som bare ligger på denne enheten?"), tt("Forkast"))) forkastUtkast(b.id); }}>{tt("Forkast lokale endringer")}</button>}</div>}
    <div className="tabs">{tabs.map(([k, l]) => <a key={k} className={fane === k ? 'on' : ''} onClick={() => setFane(k)}>{tt(l)}</a>)}</div>
    {fane === 'punkter' && <Sjekkpunkter b={b} oppd={oppd} ro={ro} />}
    {fane === 'tegning' && <div className="bf-tegnfane">
      <div className="card" style={{ padding: 10 }}>
        <BefTegning eiendomId={b.eiendomId} tegningId={tid} setTegningId={setTid} shapes={(b.tegn || {})[tid] || []} setShapes={s => oppd(x => ({ ...x, tegn: { ...(x.tegn || {}), [tid]: s } }))}
          funn={F} nyttFunn={pos => funnDialog(b, oppd, { pos })} aapneFunn={fid => funnDialog(b, oppd, F.find(f => f.id === fid))} ro={ro}
          skala={(b.skala || {})[tid] || null} setSkala={(s: Skala | null) => oppd(x => ({ ...x, skala: { ...(x.skala || {}), [tid]: s } }))} />
      </div>
      <div className="card" style={{ padding: 10 }}><div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}><h3 style={{ margin: 0, flex: 1 }}>{tt("Funn")}</h3>{!ro && <button className="btn sm" onClick={() => funnDialog(b, oppd, {})}>{tt("+ Uten tegning")}</button>}</div>
        <FunnListe b={b} oppd={oppd} ro={ro} kort /></div>
    </div>}
    {fane === 'funn' && <div className="card"><div className="toolbar" style={{ marginBottom: 6 }}><h2 style={{ margin: 0, flex: 1 }}>{tt("Funn")}</h2>{!ro && <button className="btn sm" onClick={() => funnDialog(b, oppd, {})}>{tt("+ Nytt funn")}</button>}</div><FunnListe b={b} oppd={oppd} ro={ro} /></div>}
    {fane === 'info' && <Info b={b} oppd={oppd} ro={!kan} />}
    {fane === 'maalere' && <MaalereNokler b={b} oppd={oppd} ro={ro} />}
    {fane === 'rapport' && <Rapport b={b} oppd={oppd} kan={kan} />}
    {fane === 'logg' && <div className="card"><div className="log">{(b.logg || []).slice().reverse().map((l: Rec, i: number) => <div key={i}><span className="lt">{fdt(l.t)}</span> {l.k}{l.av ? <span className="muted"> · {l.av}</span> : null}</div>)}</div>
      {kanRedigereE(b.eiendomId) && byId('befaringer', b.id) && !b.signering?.ferdig && <p><button className="btn danger sm" onClick={async () => { if (!(await confirmBox(tt("Slette befaringen? Avvik som er registrert blir liggende i avviksregisteret.")))) return; await removeDoc('befaringer', b.id); await forkastUtkast(b.id); delete lokaleBefaringer[b.id]; go('befaringer'); }}>{tt("Slett befaringen")}</button></p>}</div>}
  </>;
}

// ---------------- sjekkpunkter
function Sjekkpunkter({ b, oppd, ro }: { b: Rec; oppd: (f: (b: Rec) => Rec) => void; ro: boolean }) {
  const P: Punkt[] = b.punkter || []; const grupper = [...new Set(P.map(p => p.gruppe))]; const [apen, setApen] = useState<string>('');
  const sett = (pid: string, patch: Partial<Punkt>) => oppd(x => ({ ...x, punkter: x.punkter.map((p: Punkt) => p.id === pid ? { ...p, ...patch } : p) }));
  const svar = (p: Punkt, s: Punkt['svar']) => { if (ro) return; sett(p.id, { svar: p.svar === s ? '' : s });
    if (s === 'avvik' && p.svar !== 'avvik' && !(b.funn || []).some((f: Funn) => f.punktId === p.id)) funnDialog(b, oppd, { punktId: p.id, tittel: `${p.gruppe !== 'Generelt' ? p.gruppe + ': ' : ''}${p.tekst}`, beskrivelse: p.komm || '' }); };
  const T = btype(b.type);
  return <>
    {!P.length && <div className="card"><Empty t="Ingen sjekkpunkter">{T.k === 'vplikt' ? tt("Velg leietaker under «Deltakere og info» for å hente pliktene fra leieavtalen.") : tt("Denne befaringstypen har ingen faste punkter. Registrer funn på tegningen, eller legg til egne punkter.")}</Empty></div>}
    {grupper.map(gr => { const L = P.filter(p => p.gruppe === gr); const ok = L.filter(p => p.svar).length; return <div key={gr} className="card bf-gruppe">
      <div className="bf-ghead"><h3 style={{ margin: 0, flex: 1 }}>{tt(gr)}</h3><span className="small muted">{ok}/{L.length}</span>
        {!ro && <button className="btn sm ghost" onClick={() => L.forEach(p => { if (!p.svar) sett(p.id, { svar: 'ok' }); })} title={tt("Sett alle ubesvarte til OK")}>{tt("Resten OK")}</button>}
        {!ro && <button className="btn sm ghost" aria-label={tt("Mer for ") + gr} onClick={() => gruppeMeny(b, oppd, gr)}>⋯</button>}</div>
      {L.map(p => <div key={p.id} className={'bf-punkt' + (p.svar === 'avvik' ? ' av' : '')}>
        <div className="bf-ptekst"><div>{tt(p.tekst)}{p.hjelp && <div className="small muted">{tt(p.hjelp)}</div>}
          {p.ref && <div className="small" style={{ color: 'var(--blue)' }}>{tt("Ved overtakelse")} {p.ref.dato ? fd(p.ref.dato) : ''}: {({ ok: 'OK', avvik: 'Avvik', ia: 'Ikke aktuelt', merk: 'Merknad', '': 'ikke kontrollert' } as any)[p.ref.svar || '']}{p.ref.komm ? ' – ' + p.ref.komm : ''}</div>}</div>
          <div className="bf-svar" role="group" aria-label={tt("Svar for ") + p.tekst}>{([['ok', 'OK'], ['avvik', 'Avvik'], ['merk', 'Merknad'], ['ia', 'IA']] as [Punkt['svar'], string][]).map(([k, l]) => <button key={k} type="button" disabled={ro} aria-pressed={p.svar === k} className={'bf-s ' + k + (p.svar === k ? ' on' : '')} onClick={() => svar(p, k)}>{ttc('svar', l)}</button>)}
            <button type="button" className="btn sm ghost" aria-label={tt("Kommentar og bilder")} onClick={() => setApen(apen === p.id ? '' : p.id)}>{p.komm || p.bilder?.length ? '✎•' : '✎'}</button></div></div>
        {(apen === p.id || p.komm || p.bilder?.length) ? <div className="bf-pdet">
          {apen === p.id && !ro ? <textarea rows={2} defaultValue={p.komm || ''} placeholder={tt("Kommentar")} onBlur={e => { if (e.target.value !== (p.komm || '')) sett(p.id, { komm: e.target.value }); }} /> : p.komm ? <div className="small">{p.komm}</div> : null}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 4 }}>{(p.bilder || []).map((f, i) => <Thumb key={i} f={f} onDel={ro ? undefined : () => sett(p.id, { bilder: (p.bilder || []).filter((_, j) => j !== i) })} />)}
            {!ro && apen === p.id && <Kamera liten leggTil={f => sett(p.id, { bilder: [...(p.bilder || []), ...f] })} />}
            {(b.funn || []).filter((f: Funn) => f.punktId === p.id).map((f: Funn) => <a key={f.id} href="#" className="small" onClick={e => { e.preventDefault(); funnDialog(b, oppd, f); }}>{tt("Funn:")} {f.tittel}</a>)}</div>
        </div> : null}
      </div>)}
      {!ro && <p style={{ margin: '6px 0 0' }}><button className="btn sm ghost" onClick={() => leggTilPunkt(oppd, gr)}>{tt("+ Punkt")}</button></p>}
    </div>; })}
    {!ro && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <button className="btn" onClick={() => leggTilRom(b, oppd)}>{T.rom ? tt("+ Rom / område") : tt("+ Gruppe med punkter")}</button>
      {T.vplikt && <button className="btn ghost" onClick={async () => { if (!b.leietakerId) return toast(tt("Velg leietaker først")); if (P.some(p => p.svar) && !(await confirmBox(tt("Hente pliktene fra leieavtalen på nytt? Svar på punktene forsvinner."), tt("Hent på nytt")))) return; oppd(x => ({ ...x, punkter: vpliktPunkter(x.leietakerId) })); }}>{tt("Hent plikter fra leieavtalen")}</button>}
    </div>}
  </>;
}
function leggTilPunkt(oppd: (f: (b: Rec) => Rec) => void, gr: string) {
  formModal({ title: tt("Nytt sjekkpunkt i ") + gr, fields: [{ k: 'tekst', label: tt("Sjekkpunkt"), req: true }], onSave: v => oppd(x => ({ ...x, punkter: [...x.punkter.filter((p: Punkt) => true), { id: uid(), gruppe: gr, tekst: v.tekst, svar: '' }].sort((a: Punkt, c: Punkt) => grIdx(x, a.gruppe) - grIdx(x, c.gruppe)) })) });
}
const grIdx = (b: Rec, gr: string) => { const G = [...new Set((b.punkter || []).map((p: Punkt) => p.gruppe))]; const i = G.indexOf(gr); return i < 0 ? 999 : i; };
function leggTilRom(b: Rec, oppd: (f: (b: Rec) => Rec) => void) {
  const T = btype(b.type); const soner = S.tegninger.filter(t => t.eiendomId === b.eiendomId).flatMap(t => (t.soner || []).filter((z: Rec) => z.navn && (!b.leietakerId || z.leietakerId === b.leietakerId)).map((z: Rec) => `${t.navn}: ${z.navn}`));
  formModal({ title: T.rom ? tt("Nytt rom / område") : tt("Ny gruppe"), values: { std: !!T.rom }, fields: [
    { k: 'navn', label: T.rom ? tt("Rom / område") : tt("Navn på gruppen"), req: true, ph: T.rom ? tt("F.eks. Møterom 2, kontorlandskap, lager") : '', dl: soner.map(s => [s, s] as [string, string]) },
    { k: 'std', label: tt("Med standard punkter for rom (vegger, gulv, himling, dører, vinduer, el, ventilasjon …)"), type: 'checkbox' },
    { k: 'egne', label: tt("Egne punkter (ett per linje)"), type: 'textarea' }],
    onSave: v => { const navn = v.navn.trim(); const L = [...(v.std ? ROM_PUNKTER : []), ...String(v.egne || '').split('\n').map(s => s.trim()).filter(Boolean)]; if (!L.length) L.push('Tilstand');
      oppd(x => ({ ...x, punkter: [...(x.punkter || []), ...L.map(t => ({ id: uid(), gruppe: navn, tekst: t, svar: '' as const }))] })); } });
}
function gruppeMeny(b: Rec, oppd: (f: (b: Rec) => Rec) => void, gr: string) {
  formModal({ title: gr, values: { navn: gr }, fields: [{ k: 'navn', label: tt("Navn"), req: true }],
    extraFoot: close => <><button className="btn" onClick={() => { const navn = gr + ' (kopi)'; oppd(x => ({ ...x, punkter: [...x.punkter, ...x.punkter.filter((p: Punkt) => p.gruppe === gr).map((p: Punkt) => ({ id: uid(), gruppe: navn, tekst: p.tekst, svar: '' as const }))] })); close(); }}>{tt("Kopier")}</button>
      <button className="btn danger" onClick={async () => { if (!(await confirmBox(tt("Fjerne «{0}» med alle punktene?", gr), tt("Fjern")))) return; oppd(x => ({ ...x, punkter: x.punkter.filter((p: Punkt) => p.gruppe !== gr) })); close(); }}>{tt("Fjern")}</button></>,
    onSave: v => oppd(x => ({ ...x, punkter: x.punkter.map((p: Punkt) => p.gruppe === gr ? { ...p, gruppe: v.navn.trim() } : p) })) });
}

// ---------------- funn
const ARTER = (b: Rec): [Art, string][] => { const T = btype(b.type); return [['avvik', 'Avvik (følges opp med ansvar og frist)'], ...(T.energi ? [['energi', 'Energityv (tiltak med besparelse)'] as [Art, string]] : []), ...(T.tilpasning || T.leie ? [['tilpasning', 'Leietakertilpasning (registreres mot leietaker)'] as [Art, string]] : []), ...(T.system ? [['system', 'Registrer system i TFM'] as [Art, string]] : []), ['merknad', 'Merknad (ingen oppfølging)']]; };
export function funnDialog(b: Rec, oppd: (f: (b: Rec) => Rec) => void, f0: Partial<Funn> = {}) {
  const ny = !f0.id; const T = btype(b.type); const ro = !redigerbar(b) || !(kanDrifteE(b.eiendomId) || b._lokal || state.offline);
  const f: Funn = { id: uid(), art: T.system ? 'system' : T.energi ? 'energi' : T.k === 'tilpasning' ? 'tilpasning' : 'avvik', tittel: '', alv: 'Middels', ansvar: T.leie && b.type === 'tilbakelevering' ? 'Leietaker' : T.garanti ? 'Leverandør/entreprenør' : 'Eier', utbedresAv: T.garanti ? b.entreprenor || '' : '', leietakerId: b.leietakerId || '', bilder: [], betaler: 'Leietaker', ...f0 } as Funn;
  const st = funnStatus(f); const avv = st.a;
  const A = sortBy(S.anlegg.filter(a => a.eiendomId === b.eiendomId), a => aNavn(a.id));
  formModal({ title: ny ? tt("Nytt funn") : tt("Funn {0}", (b.funn || []).findIndex((x: Funn) => x.id === f.id) + 1), wide: true, readOnly: ro, values: { ...f, bilderNye: f.bilder || [] }, saveTxt: ny ? tt("Registrer funn") : tt("Lagre"),
    top: avv ? <div className="note small" style={{ marginBottom: 10 }}>{tt("Registrert som")} <a href="#" onClick={e => { e.preventDefault(); editAvvik(avv.id); }}>{tt("avvik #")}{avv.nr}</a> {tt("– status")} <b>{avv.status}</b>{avv.frist ? tt(", frist {0}", fd(avv.frist)) : ''}{tt(". Status, tildeling og arbeidsordre følges opp i avviket. Endringer her oppdaterer avviket.")}</div> : undefined,
    fields: [
      { k: 'art', label: tt("Type funn"), type: 'select', options: ARTER(b), half: true },
      { k: 'alv', label: tt("Alvorlighet"), type: 'select', options: AV_ALV, half: true, show: v => v.art === 'avvik' || v.art === 'energi' },
      { k: 'tittel', label: tt("Hva er funnet"), req: true, ph: tt("Kort beskrivelse") },
      { k: 'beskrivelse', label: tt("Beskrivelse / tiltak"), type: 'textarea' },
      { k: 'bilderNye', label: tt("Bilder"), type: 'custom', render: (v, set) => <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>{(v.bilderNye || []).map((x: BFil, i: number) => <Thumb key={i} f={x} onDel={ro ? undefined : () => set({ bilderNye: v.bilderNye.filter((_: any, j: number) => j !== i) })} />)}{!ro && <Kamera leggTil={n => set({ bilderNye: [...(v.bilderNye || []), ...n] })} />}</div> },
      { k: 'sAns', label: tt("Ansvar og frist"), type: 'sec', show: v => v.art === 'avvik' || v.art === 'energi' },
      { k: 'ansvar', label: tt("Ansvarlig for utbedring"), type: 'select', options: UTBEDRER, half: true, show: v => v.art === 'avvik' || v.art === 'energi' },
      { k: 'utbedresAv', label: tt("Servicefirma / entreprenør"), half: true, show: v => (v.art === 'avvik' || v.art === 'energi') && v.ansvar === 'Leverandør/entreprenør' },
      { k: 'leietakerId', label: tt("Leietaker"), type: 'select', empty: '–', half: true, show: v => ['Leietaker', 'Felles'].includes(v.ansvar) || v.art === 'tilpasning', options: () => S.leietakere.filter(l => l.eiendomId === b.eiendomId).map(l => [l.id, l.navn] as [string, string]) },
      { k: 'frist', label: tt("Frist for utbedring"), type: 'date', half: true, show: v => v.art === 'avvik' || v.art === 'energi', hint: tt("Tom = ut fra alvorlighet") },
      { k: 'besparelse', label: tt("Anslått besparelse (kWh/år)"), type: 'number', half: true, show: v => v.art === 'energi' },
      { k: 'kost', label: tt("Kostnad (kr eks. mva)"), type: 'number', half: true, show: v => ['avvik', 'tilpasning', 'energi'].includes(v.art) },
      { k: 'betaler', label: tt("Betales av"), type: 'select', options: ['Leietaker', 'Eier', 'Delt', 'Ikke avklart'], half: true, show: v => v.art === 'tilpasning' },
      { k: 'sSys', label: tt("System"), type: 'sec', show: v => v.art === 'system' },
      { k: 'sys', type: 'custom', show: v => v.art === 'system', render: (v, set) => { const s = v.sys || {}; const ss = (p: O) => set({ sys: { ...s, ...p } });
        return <div className="grid2">
          <label className="pa-felt" style={{ gridColumn: '1/-1' }}><span>{tt("Systemkode (NS 3451)")}</span><NsVelger value={s.tfmSys} set={k => ss({ tfmSys: k, navn: s.navn || nsNavn(k) })} /></label>
          <label className="pa-felt"><span>{tt("Type")}</span><select value={s.type || ''} onChange={e => ss({ type: e.target.value })}><option value="">–</option>{Object.entries(KOMP).map(([k, x]) => <option key={k} value={k}>{x.n}</option>)}</select></label>
          <label className="pa-felt"><span>{tt("Betegnelse")}</span><input value={s.navn || ''} onChange={e => ss({ navn: e.target.value })} /></label>
          <label className="pa-felt"><span>{tt("Fabrikat / modell")}</span><input value={s.fabrikat || ''} onChange={e => ss({ fabrikat: e.target.value })} /></label>
          <label className="pa-felt"><span>{tt("År installert")}</span><input inputMode="numeric" value={s.aar || ''} onChange={e => ss({ aar: e.target.value })} /></label>
          {f.nyAnleggId && <p className="small" style={{ gridColumn: '1/-1' }}>{tt("Registrert i TFM som")} <a href={'#/tfm'}>{aNavn(f.nyAnleggId)}</a>.</p>}</div>; } },
      { k: 'sPl', label: tt("Plassering"), type: 'sec' },
      { k: 'anleggId', label: tt("Gjelder system"), type: 'select', empty: '–', half: true, show: v => v.art !== 'system', options: () => A.map(a => [a.id, aNavn(a.id)] as [string, string]) },
      { k: 'komponentId', label: tt("Komponent"), type: 'select', empty: '–', half: true, show: v => v.art !== 'system' && !!v.anleggId, options: (v: any) => S.komponenter.filter(k => k.anleggId === v?.anleggId).map(k => [k.id, kNavn(k.id)] as [string, string]) },
      { k: 'plassering', label: tt("Plassering i tekst"), ph: tt("F.eks. 2. etg, korridor ved trapp B") },
      { k: 'posInfo', type: 'custom', render: (v, set) => <p className="small muted" style={{ margin: 0 }}>{v.pos ? tt("Plassert på {0}. ", byId('tegninger', v.pos.tegningId)?.navn || 'tegning') : tt("Ikke plassert på tegning. Bruk fanen «Tegning og funn» og verktøyet «Nytt funn» for å plassere.")}{v.pos && !ro && <a href="#" onClick={e => { e.preventDefault(); set({ pos: null }); }}>{tt("Fjern plasseringen")}</a>}</p> }],
    onChange: (k, v) => { if (k === 'art' && v.art === 'tilpasning' && !v.leietakerId) return { leietakerId: b.leietakerId || '' }; },
    extraFoot: close => !ny && !ro ? <button className="btn danger" onClick={async () => { if (!(await confirmBox(f.avvikId ? tt("Fjerne funnet fra befaringen? Avviket blir liggende i avviksregisteret.") : tt("Slette funnet?")))) return; oppd(x => ({ ...x, funn: x.funn.filter((y: Funn) => y.id !== f.id), punkter: (x.punkter || []).map((p: Punkt) => p.id === f.punktId && p.svar === 'avvik' ? { ...p, svar: '' as const } : p) })); close(); }}>{tt("Slett")}</button> : null,
    onSave: v => { const { bilderNye, sAns, sSys, sPl, posInfo, ...rest } = v; const ny2: Funn = { ...f, ...rest, bilder: bilderNye || [], endret: Date.now() };
      if ((ny2.art === 'avvik' || ny2.art === 'energi') && !ny2.avvikId) ny2.avvikId = uid(); if (ny2.art === 'system' && !ny2.nyAnleggId) ny2.nyAnleggId = uid();
      if (ny2.kost === '' as any) delete ny2.kost; if (ny2.besparelse === '' as any) delete ny2.besparelse;
      oppd(x => { const finnes = (x.funn || []).some((y: Funn) => y.id === ny2.id); let n: Rec = { ...x, funn: finnes ? x.funn.map((y: Funn) => y.id === ny2.id ? ny2 : y) : [...(x.funn || []), ny2] };
        if (ny2.punktId && (ny2.art === 'avvik' || ny2.art === 'energi')) n = { ...n, punkter: n.punkter.map((p: Punkt) => p.id === ny2.punktId ? { ...p, svar: 'avvik' as const } : p) };
        return finnes ? n : loggB(n, `Funn registrert: ${ny2.tittel}`); });
      toast(ny ? (paaNett() ? tt("Funn registrert") : tt("Funn lagret på enheten")) : tt("Funn lagret")); } });
}

function FunnListe({ b, oppd, ro, kort }: { b: Rec; oppd: (f: (b: Rec) => Rec) => void; ro: boolean; kort?: boolean }) {
  const F: Funn[] = b.funn || [];
  if (!F.length) return <Empty t="Ingen funn ennå">{ro ? '' : tt("Velg «Nytt funn» og trykk på tegningen, eller svar «Avvik» på et sjekkpunkt.")}</Empty>;
  const ltEpost = (lid?: string) => { const l = lid ? byId('leietakere', lid) : null; return l?.epost || ''; };
  return <div className={kort ? 'bf-funnkort' : 'tbl-wrap'}>{kort ? F.map((f, i) => { const st = funnStatus(f); return <div key={f.id} className="bf-funn" onClick={() => funnDialog(b, oppd, f)}>
      <span className={'bf-nr ' + f.art}>{i + 1}</span><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600 }}>{f.tittel}</div><div className="small muted">{tt(ART_NAVN[f.art])}{f.alv && (f.art === 'avvik' || f.art === 'energi') ? ' · ' + f.alv : ''}{f.pos ? '' : tt(" · ikke på tegning")}</div></div>
      <Chip c={st.c}>{st.s}</Chip></div>; })
    : <table><thead><tr><th>{tt("Nr")}</th><th>{tt("Funn")}</th><th>{tt("Alvorlighet")}</th><th>{tt("Ansvar")}</th><th>{tt("Frist")}</th><th>{tt("Status")}</th><th></th></tr></thead><tbody>
      {F.map((f, i) => { const st = funnStatus(f); const a = st.a; return <tr key={f.id}>
        <td><span className={'bf-nr ' + f.art}>{i + 1}</span></td>
        <td className="click" onClick={() => funnDialog(b, oppd, f)}><b style={{ fontWeight: 600 }}>{f.tittel}</b><div className="small muted">{tt(ART_NAVN[f.art])}{f.anleggId ? ' · ' + aNavn(f.anleggId) : ''}{f.art === 'tilpasning' && f.kost ? tt(" · {0} kr, {1}", (+f.kost).toLocaleString(lokale()), f.betaler || '') : ''}{f.art === 'energi' && f.besparelse ? tt(" · {0} kWh/år", (+f.besparelse).toLocaleString(lokale())) : ''}</div></td>
        <td>{f.art === 'avvik' || f.art === 'energi' ? <AlvChip a={a?.alv || f.alv} /> : '–'}</td>
        <td className="small">{f.art === 'avvik' || f.art === 'energi' ? (f.ansvar === 'Leverandør/entreprenør' ? f.utbedresAv || tt("Leverandør") : f.ansvar) + (a?.tildeltId ? ' · ' + (S.profiles.find(p => p.id === a.tildeltId)?.navn || tt("tildelt")) : '') : '–'}</td>
        <td className="small">{a?.frist || f.frist ? fd(a?.frist || f.frist) : '–'}</td><td><Chip c={st.c}>{st.s}</Chip></td>
        <td style={{ whiteSpace: 'nowrap' }}>{a && isStaff() && paaNett() && <><button className="btn sm" onClick={() => sendAo(a.id, false, f.ansvar === 'Leietaker' ? ltEpost(f.leietakerId || b.leietakerId) : '')} title={tt("Send arbeidsordre på e-post til eier, drift, leietaker eller servicefirma")}>{tt("Arbeidsordre")}</button> <button className="btn sm ghost" onClick={() => editAvvik(a.id)} title={tt("Åpne avviket: tildel bruker, endre status, se logg")}>{tt("Avvik #")}{a.nr}</button></>}</td></tr>; })}
    </tbody></table>}</div>;
}

// ---------------- deltakere og info
function Info({ b, oppd, ro }: { b: Rec; oppd: (f: (b: Rec) => Rec) => void; ro: boolean }) {
  const T = btype(b.type); const D: Rec[] = b.deltakere || [];
  const settD = (i: string, p: O) => oppd(x => ({ ...x, deltakere: x.deltakere.map((d: Rec) => d.id === i ? { ...d, ...p } : d) }));
  const felt = (k: string, l: string, type = 'text', opts?: [string, string][]) => <label className="pa-felt"><span>{l}</span>{opts ? <select disabled={ro} value={b[k] || ''} onChange={e => oppd(x => ({ ...x, [k]: e.target.value }))}><option value="">–</option>{opts.map(o => <option key={o[0]} value={o[0]}>{o[1]}</option>)}</select>
    : <input disabled={ro} type={type} defaultValue={b[k] || ''} onBlur={e => { if (e.target.value !== (b[k] || '')) oppd(x => ({ ...x, [k]: e.target.value })); }} />}</label>;
  return <>
    <div className="card"><h2 style={{ marginTop: 0 }}>{tt("Befaringen")}</h2><div className="grid2">
      {felt('tittel', 'Tittel')}{felt('dato', 'Dato', 'date')}{felt('tid', 'Klokkeslett', 'time')}
      {T.leie && felt('leietakerId', 'Leietaker', 'text', sortBy(S.leietakere.filter(l => l.eiendomId === b.eiendomId), l => l.navn).map(l => [l.id, l.navn]))}
      {T.leie && felt('lokale', 'Lokale / leieobjekt')}{T.garanti && felt('entreprenor', 'Entreprenør')}
      <label className="pa-felt"><span>{tt("Status")}</span><select disabled={ro} value={b.status} onChange={e => oppd(x => loggB({ ...x, status: e.target.value }, 'Status: ' + e.target.value))}>{BSTATUS.filter(s => !['Til signering', 'Signert'].includes(s) || s === b.status).map(s => <option key={s} value={s}>{tt(s)}</option>)}</select></label></div>
      <label className="pa-felt"><span>{tt("Oppsummering / konklusjon (kommer først i rapporten)")}</span><textarea disabled={ro} rows={4} defaultValue={b.oppsummering || ''} onBlur={e => { if (e.target.value !== (b.oppsummering || '')) oppd(x => ({ ...x, oppsummering: e.target.value })); }} /></label></div>
    <div className="card"><div className="toolbar" style={{ marginBottom: 6 }}><h2 style={{ margin: 0, flex: 1 }}>{tt("Deltakere")}</h2>{!ro && <button className="btn sm" onClick={() => oppd(x => ({ ...x, deltakere: [...(x.deltakere || []), { id: uid(), navn: '', rolle: 'Leietaker', signerer: true }] }))}>{tt("+ Deltaker")}</button>}</div>
      {!D.length && <p className="small muted">{tt("Ingen deltakere registrert.")}</p>}
      {D.map(d => <div key={d.id} className="bf-delt">
        <input disabled={ro} placeholder={tt("Navn")} defaultValue={d.navn} onBlur={e => e.target.value !== d.navn && settD(d.id, { navn: e.target.value })} />
        <select disabled={ro} value={d.rolle} onChange={e => settD(d.id, { rolle: e.target.value })}>{ROLLER_DELT.map(r => <option key={r} value={r}>{tt(r)}</option>)}</select>
        <input disabled={ro} placeholder={tt("Firma")} defaultValue={d.firma || ''} onBlur={e => e.target.value !== (d.firma || '') && settD(d.id, { firma: e.target.value })} />
        <input disabled={ro} type="email" placeholder={tt("E-post (for signering)")} defaultValue={d.epost || ''} onBlur={e => e.target.value !== (d.epost || '') && settD(d.id, { epost: e.target.value.trim() })} />
        <input disabled={ro} placeholder={tt("Telefon")} defaultValue={d.tlf || ''} onBlur={e => e.target.value !== (d.tlf || '') && settD(d.id, { tlf: e.target.value })} />
        <label className="small" style={{ display: 'flex', gap: 4, alignItems: 'center', fontWeight: 400 }}><input disabled={ro} type="checkbox" style={{ width: 'auto' }} checked={!!d.signerer} onChange={e => settD(d.id, { signerer: e.target.checked })} />{tt("Signerer")}</label>
        {!ro && <button className="btn sm ghost" aria-label={tt("Fjern deltaker")} onClick={() => oppd(x => ({ ...x, deltakere: x.deltakere.filter((y: Rec) => y.id !== d.id) }))}>✕</button>}</div>)}
      {b.leietakerId && !ro && (() => { const l = byId('leietakere', b.leietakerId); return l && !D.some(d => d.rolle === 'Leietaker') ? <p className="small"><a href="#" onClick={e => { e.preventDefault(); oppd(x => ({ ...x, deltakere: [...(x.deltakere || []), { id: uid(), navn: l.kontakt || '', firma: l.navn, rolle: 'Leietaker', epost: l.epost || '', tlf: l.telefon || '', signerer: true }] })); }}>{tt("Legg til leietakerens kontaktperson")}</a></p> : null; })()}
    </div>
    {T.leie && b.leietakerId && <Leieforlop lid={b.leietakerId} aktiv={b.id} />}
  </>;
}

// ---------------- målere og nøkler
function MaalereNokler({ b, oppd, ro }: { b: Rec; oppd: (f: (b: Rec) => Rec) => void; ro: boolean }) {
  const M: Rec[] = b.maalere || []; const N: Rec[] = b.nokler || [];
  const kandidater = S.komponenter.filter(k => k.eiendomId === b.eiendomId && /m[aå]ler/i.test(`${k.navn} ${KOMP[k.type]?.n || ''} ${k.type}`) && (!b.leietakerId || !k.leietakerId || k.leietakerId === b.leietakerId));
  const rad = (liste: 'maalere' | 'nokler', r: Rec, felt: [string, string, string?][]) => <div key={r.id} className="bf-delt">{felt.map(([k, ph, t]) => <input key={k} disabled={ro} inputMode={t === 'n' ? 'decimal' : undefined} placeholder={ph} defaultValue={r[k] ?? ''} onBlur={e => { if (e.target.value !== String(r[k] ?? '')) oppd(x => ({ ...x, [liste]: x[liste].map((y: Rec) => y.id === r.id ? { ...y, [k]: e.target.value } : y) })); }} />)}
    {!ro && <button className="btn sm ghost" aria-label={tt("Fjern")} onClick={() => oppd(x => ({ ...x, [liste]: x[liste].filter((y: Rec) => y.id !== r.id) }))}>✕</button>}</div>;
  return <>
    {btype(b.type).maalere && <div className="card"><div className="toolbar" style={{ marginBottom: 6 }}><h2 style={{ margin: 0, flex: 1 }}>{tt("Målerstander")}</h2>
      {!ro && kandidater.length > 0 && <button className="btn sm ghost" onClick={() => oppd(x => ({ ...x, maalere: [...(x.maalere || []), ...kandidater.filter(k => !(x.maalere || []).some((m: Rec) => m.komponentId === k.id)).map(k => ({ id: uid(), komponentId: k.id, navn: k.navn || KOMP[k.type]?.n || tt("Måler"), nr: k.serienr || k.malernr || '', verdi: '', enhet: k.enhet || 'kWh' }))] }))}>{tt("Hent målere fra TFM (")}{kandidater.length})</button>}
      {!ro && <button className="btn sm" onClick={() => oppd(x => ({ ...x, maalere: [...(x.maalere || []), { id: uid(), navn: tt("Strøm"), nr: '', verdi: '', enhet: 'kWh' }] }))}>{tt("+ Måler")}</button>}</div>
      {!M.length ? <p className="small muted">{tt("Ingen målere registrert.")}</p> : M.map(m => rad('maalere', m, [['navn', 'Måler'], ['nr', 'Målernr.'], ['verdi', 'Stand', 'n'], ['enhet', 'Enhet']]))}</div>}
    {btype(b.type).nokler && <div className="card"><div className="toolbar" style={{ marginBottom: 6 }}><h2 style={{ margin: 0, flex: 1 }}>{tt("Nøkler og adgangskort")}</h2>{!ro && <button className="btn sm" onClick={() => oppd(x => ({ ...x, nokler: [...(x.nokler || []), { id: uid(), type: 'Nøkkel', antall: 1, merknad: '' }] }))}>{tt("+ Nøkler / kort")}</button>}</div>
      {!N.length ? <p className="small muted">{tt("Ingen registrert.")}</p> : N.map(n => rad('nokler', n, [['type', 'Type (nøkkel, kort, brikke)'], ['antall', 'Antall', 'n'], ['merknad', 'Merknad / nummer']]))}</div>}
  </>;
}

// ---------------- rapport og signering
function Rapport({ b, oppd, kan }: { b: Rec; oppd: (f: (b: Rec) => Rec) => void; kan: boolean }) {
  useStore(); const [busy, setBusy] = useState(''); const [sig, setSig] = useState<Rec[]>([]);
  const r = b.rapport; const sg = b.signering; const parter: Rec[] = (b.deltakere || []).filter((d: Rec) => d.signerer);
  const gammelSign = sg && r && sg.dokHash !== r.hash;
  useEffect(() => { if (!paaNett() || !byId('befaringer', b.id)) return; sb.from('bef_signatur').select('*').eq('befaring_id', b.id).then(({ data }) => setSig((data || []) as Rec[])); }, [b.id, sg?.parter?.map((p: Rec) => p.signert?.t).join()]);
  const lag = async () => {
    if (redigerbar(b) && !(await confirmBox(tt("Befaringen er ikke fullført. Lage rapport likevel (f.eks. utkast)?"), tt("Lag rapport")))) return;
    setBusy('Lager rapport …');
    try { const pdf = await befaringPdf(b, s => setBusy(s)); const hash = await sha256(pdf); const versjon = (r?.versjon || 0) + 1; const navn = `Befaringsrapport ${btype(b.type).kort} ${eNavn(b.eiendomId)} ${b.dato} v${versjon}.pdf`;
      const blob = new Blob([pdf as any], { type: 'application/pdf' }); let fil: BFil;
      if (paaNett() && byId('befaringer', b.id)) { const f = await uploadFile(blob, b.eiendomId, undefined, navn, 'befaring/' + b.id); if (!f) throw new Error('Opplasting feilet'); fil = f; } else fil = await lagreLokalFil(blob, navn);
      oppd(x => loggB({ ...x, rapport: { fil, hash, versjon, laget: new Date().toISOString(), av: state.me?.navn || state.me?.epost } }, `Rapport versjon ${versjon} laget`));
      const u = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = u; a.download = navn; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000);
    } catch (e: any) { toast(tt("Kunne ikke lage rapport: ") + (e?.message || e)); }
    setBusy('');
  };
  const send = () => {
    if (!r || erLokal(r.fil)) return toast(paaNett() ? tt("Vent til rapporten er lastet opp") : tt("Du må være på nett for å sende til signering"));
    const mangler = parter.filter(p => !/^\S+@\S+\.\S+$/.test(p.epost || ''));
    formModal({ title: tt("Send rapporten til signering"), saveTxt: tt("Send"), values: { valgt: parter.filter(p => !mangler.includes(p) && !signertAv(p.id)).map(p => p.id), melding: '' }, fields: [
      { k: 'i', type: 'custom', render: () => <p className="small" style={{ margin: 0 }}>{tt("Hver part får en personlig lenke på e-post. De leser rapporten, skriver navnet sitt (og kan tegne signatur) og bekrefter med en engangskode som sendes til samme e-postadresse. Når alle har signert, får alle den signerte rapporten med signeringsside.")}{mangler.length ? <><br /><b>{tt("Mangler e-post:")}</b> {mangler.map(p => p.navn || p.rolle).join(', ')} {tt("– legg inn under «Deltakere og info», eller la dem signere på stedet.")}</> : null}</p> },
      { k: 'valgt', label: tt("Send til"), type: 'custom', def: [], render: (v, set) => <div>{parter.filter(p => !mangler.includes(p)).map(p => <label key={p.id} className="small" style={{ display: 'flex', gap: 6, fontWeight: 400 }}><input type="checkbox" style={{ width: 'auto' }} disabled={!!signertAv(p.id)} checked={(v.valgt || []).includes(p.id)} onChange={e => set({ valgt: e.target.checked ? [...v.valgt, p.id] : v.valgt.filter((x: string) => x !== p.id) })} />{p.navn} ({p.rolle}) – {p.epost}{signertAv(p.id) ? tt(" · signert") : ''}</label>)}</div> },
      { k: 'mottakerSprak', label: tt("Mottakerens språk"), type: 'select', def: sprakForEiendom(b.eiendomId), options: sprakValg(), half: true },
      { k: 'melding', label: tt("Melding (valgfri)"), type: 'textarea' }],
      onSave: async v => { if (!v.valgt?.length) { toast(tt("Velg minst én")); return false; }
        try { await synkBefaring(b.id); const res = await aoApi({ action: 'bef_sign_send', befaring_id: b.id, parter: parter.map(p => ({ id: p.id, navn: p.navn, epost: p.epost, rolle: p.rolle, firma: p.firma || '' })), send: v.valgt, melding: v.melding, lenkeBase: location.origin, mottakerSprak: v.mottakerSprak });
          toast(res.sendt ? tt("Sendt til {0} {1}", res.sendt, res.sendt === 1 ? 'part' : 'parter') : res.grunn || tt("Klargjort – e-post ble ikke sendt")); if (res.lenker?.length && !res.sendt) visLenker(res.lenker); }
        catch (e: any) { toast(e.message); return false; } } });
  };
  const signertAv = (pid: string) => sg?.dokHash === r?.hash ? sg?.parter?.find((p: Rec) => p.id === pid)?.signert : null;
  const sted = (p: Rec) => openModal({ render: close => <SignerStedet b={b} oppd={oppd} part={p} close={close} /> });
  const T = btype(b.type);
  return <>
    <div className="card"><h2 style={{ marginTop: 0 }}>{tt("Rapport")}</h2>
      {r ? <p>{tt("Versjon")} {r.versjon} {tt("laget")} {fdt(r.laget)}{r.av ? tt(" av ") + r.av : ''}. {erLokal(r.fil) ? <span className="muted">{tt("(ligger på enheten – lastes opp når det er nett)")}</span> : <FileLink fil={r.fil}>{tt("Åpne PDF")}</FileLink>}<br /><span className="small muted mono" title={tt("SHA-256 – brukes til å kontrollere at det er dette dokumentet som signeres")}>{tt("Fingeravtrykk")} {r.hash.slice(0, 16)}…</span></p> : <p className="muted">{tt("Ingen rapport laget ennå.")}</p>}
      {kan && <button className="btn pri" disabled={!!busy} onClick={lag}>{busy || (r ? tt("Lag ny versjon") : tt("Lag rapport (PDF)"))}</button>}
      {gammelSign && <p className="small" style={{ color: 'var(--amber)' }}>{tt("Rapporten er endret etter at den ble sendt til signering. Signaturer gjelder bare versjonen de ble gitt på – send den nye versjonen til signering.")}</p>}
    </div>
    <div className="card"><div className="toolbar" style={{ marginBottom: 6 }}><h2 style={{ margin: 0, flex: 1 }}>{tt("Signering")}</h2>
      {kan && r && parter.length > 0 && !(sg?.ferdig && !gammelSign) && <button className="btn" disabled={!paaNett()} onClick={send} title={paaNett() ? '' : tt("Krever nett")}>{tt("Send til signering på e-post")}</button>}</div>
      {!parter.length ? <p className="small muted">{tt("Ingen deltakere er merket «Signerer». Merk dem under «Deltakere og info».")}</p> :
        <div className="tbl-wrap"><table><thead><tr><th>{tt("Part")}</th><th>{tt("E-post")}</th><th>{tt("Status")}</th><th></th></tr></thead><tbody>
          {parter.map(p => { const sp = sg?.parter?.find((x: Rec) => x.id === p.id); const s = signertAv(p.id); const ventende = (b.stedSign || []).find((x: Rec) => x.partId === p.id && x.dokHash === r?.hash);
            return <tr key={p.id}><td><b style={{ fontWeight: 600 }}>{p.navn || '–'}</b><div className="small muted">{p.rolle}{p.firma ? ' · ' + p.firma : ''}</div></td><td className="small">{p.epost || '–'}</td>
              <td>{s ? <Chip c="green" title={s.metode}>{tt("Signert")} {fdt(s.t)}</Chip> : ventende ? <Chip c="amber">{tt("Signert på stedet – lagres ved nett")}</Chip> : sp?.sendt && !gammelSign ? <Chip c="blue">{sp.lest ? tt("Åpnet") : tt("Sendt")} {fd(String(sp.sendt).slice(0, 10))}</Chip> : <Chip>{tt("Ikke signert")}</Chip>}</td>
              <td>{kan && r && !s && !ventende && <button className="btn sm" onClick={() => sted(p)}>{tt("Signer på stedet")}</button>}</td></tr>; })}
        </tbody></table></div>}
      {sg?.ferdig && !gammelSign && <p>{tt("✓ Alle har signert")} {fdt(sg.ferdig.t)}. <FileLink fil={sg.ferdig.fil}>{tt("Åpne signert rapport")}</FileLink> {tt("– lagret under Dokumenter.")}</p>}
      {sig.length > 0 && <details style={{ marginTop: 8 }}><summary className="small">{tt("Signaturlogg (")}{sig.length})</summary><div className="log">{sig.map(x => <div key={x.id}><span className="lt">{fdt(x.signert_at)}</span> {x.navn} ({x.rolle}) – {x.metode === 'epost_kode' ? tt("e-post med engangskode") : x.metode}{x.ip ? tt(" · IP ") + x.ip : ''} {tt("· dokument")} {String(x.dok_hash).slice(0, 12)}…</div>)}</div></details>}
      <p className="small muted" style={{ marginBottom: 0 }}>{tt("Enkel elektronisk signatur: tid, IP-adresse, nettleser og dokumentets fingeravtrykk (SHA-256) lagres for hver signatur og kan ikke endres i appen. Signatur på stedet bekreftes av deg som innlogget bruker.")}</p>
    </div>
    <div className="card"><h2 style={{ marginTop: 0 }}>{tt("Tilsynsanalyser")}</h2>
      {b.analyse?.overfort ? <p>{tt("Overført")} {fdt(b.analyse.overfort)}{b.analyse.av ? tt(" av ") + b.analyse.av : ''}. <a href="#/tilsynsanalyser">{tt("Åpne Tilsynsanalyser")}</a>{kan && <> · <a href="#" onClick={e => { e.preventDefault(); oppd(x => loggB({ ...x, analyse: null }, 'Fjernet fra Tilsynsanalyser')); }}>{tt("fjern")}</a></>}</p>
        : <><p className="small muted">{tt("Overfør rapporten til oversikten over tilsyn og befaringer på tvers av eiendommer, med funn per kategori, alvorlighet og status.")}</p>{kan && <button className="btn" disabled={redigerbar(b)} title={redigerbar(b) ? tt("Fullfør befaringen først") : ''} onClick={() => oppd(x => loggB({ ...x, analyse: { overfort: new Date().toISOString(), av: state.me?.navn || state.me?.epost } }, 'Overført til Tilsynsanalyser'))}>{tt("Overfør til Tilsynsanalyser")}</button>}</>}
    </div>
    {T.leie && b.leietakerId && <Leieforlop lid={b.leietakerId} aktiv={b.id} />}
  </>;
}
function visLenker(L: { navn: string; lenke: string }[]) {
  openModal({ render: close => <ModalFrame title={tt("Lenker til signering")} close={close}><p className="small">{tt("E-post er ikke satt opp eller er i testmodus. Del lenkene selv:")}</p>{L.map(l => <p key={l.lenke} className="small"><b>{l.navn}</b><br /><input readOnly value={l.lenke} onFocus={e => e.target.select()} /></p>)}</ModalFrame> });
}
function SignerStedet({ b, oppd, part, close }: { b: Rec; oppd: (f: (b: Rec) => Rec) => void; part: Rec; close: () => void }) {
  const [navn, setNavn] = useState(part.navn || ''); const [png, setPng] = useState(''); const [ok, setOk] = useState(false); const [forb, setForb] = useState(''); const [busy, setBusy] = useState(false);
  const r = b.rapport;
  const lagre = async () => {
    if (!navn.trim() || !png || !ok) return toast(tt("Skriv navn, tegn signatur og bekreft"));
    setBusy(true); const s = { partId: part.id, navn: navn.trim(), rolle: part.rolle, epost: part.epost || '', firma: part.firma || '', signatur: png, forbehold: forb.trim(), dokHash: r.hash, t: new Date().toISOString() };
    if (paaNett() && byId('befaringer', b.id) && !erLokal(r.fil)) {
      try { await synkBefaring(b.id); await aoApi({ action: 'bef_sign_sted', befaring_id: b.id, ...s, parter: (b.deltakere || []).filter((d: Rec) => d.signerer).map((d: Rec) => ({ id: d.id, navn: d.navn, epost: d.epost || '', rolle: d.rolle, firma: d.firma || '' })) }); toast(tt("Signatur lagret")); close(); }
      catch (e: any) { toast(e.message); } setBusy(false); return; }
    oppd(x => loggB({ ...x, stedSign: [...(x.stedSign || []).filter((y: Rec) => y.partId !== part.id), s] }, `${s.navn} signerte på stedet (lagres når det er nett)`)); toast(tt("Signaturen er lagret på enheten og registreres når det er nett")); close();
  };
  return <ModalFrame title={tt("Signer på stedet – ") + (part.rolle || '')} close={close} foot={<><button className="btn" onClick={close}>{tt("Avbryt")}</button><button className="btn pri" disabled={busy} onClick={lagre}>{busy ? tt("Lagrer …") : tt("Signer")}</button></>}>
    <p className="small">{tt("Gi enheten til")} {part.navn || tt("parten")}{tt(". Rapporten (versjon")} {r.versjon}{tt(", fingeravtrykk")} {r.hash.slice(0, 12)}{tt("…) bør gjennomgås før signering.")} {!erLokal(r.fil) && <FileLink fil={r.fil}>{tt("Åpne rapporten")}</FileLink>}</p>
    <label className="pa-felt"><span>{tt("Fullt navn")}</span><input value={navn} onChange={e => setNavn(e.target.value)} /></label>
    <SignaturFelt onChange={setPng} />
    <label className="pa-felt"><span>{tt("Forbehold eller merknad (valgfritt)")}</span><textarea rows={2} value={forb} onChange={e => setForb(e.target.value)} /></label>
    <label className="small" style={{ display: 'flex', gap: 6, fontWeight: 400 }}><input type="checkbox" style={{ width: 'auto' }} checked={ok} onChange={e => setOk(e.target.checked)} />{tt("Jeg har gjennomgått rapporten og bekrefter at den gir et riktig bilde av befaringen")}{forb.trim() ? tt(", med forbeholdet over") : ''}.</label>
    <p className="small muted">{tt("Signaturen bekreftes av")} {state.me?.navn || state.me?.epost} {tt("som innlogget bruker.")}</p>
  </ModalFrame>;
}

// ---------------- leieforløp (leietakersiden og befaringssiden)
export function Leieforlop({ lid, aktiv }: { lid: string; aktiv?: string }) {
  useStore(); const l = byId('leietakere', lid); if (!l) return null;
  const kan = kanDrifteE(l.eiendomId) && harModul('befaring', l.eiendomId);
  return <div className="card"><h2 style={{ marginTop: 0 }}>{tt("Leieforløpet –")} {l.navn}</h2>
    <div className="bf-forlop">{LEIEFORLOP.map(k => { const T = btype(k); const L = sortBy(alleBefaringer().filter(b => b.leietakerId === lid && b.type === k && b.status !== 'Avbrutt'), b => b.dato || ''); const siste = L[L.length - 1];
      return <div key={k} className={'bf-steg' + (siste ? ' ok' : '')}><div className="bf-sirkel">{siste ? '✓' : ''}</div><div><b>{T.kort}</b>
        {L.map(b => <div key={b.id} className="small"><a href={'#/befaring/' + b.id} style={{ fontWeight: b.id === aktiv ? 700 : undefined }}>{fd(b.dato)}</a> · {b.status}{tellFunn(b).apne ? <span style={{ color: 'var(--red)' }}> · {tellFunn(b).apne} {tt("åpne")}</span> : ''}</div>)}
        {!L.length && <div className="small muted">{tt("Ikke gjennomført")}</div>}
        {kan && <a href="#" className="small" onClick={e => { e.preventDefault(); nyBefaringDialog({ eiendomId: l.eiendomId, type: k, leietakerId: lid, lokale: l.lokale || '' }); }}>{L.length ? tt("+ Ny") : tt("Start")}</a>}</div></div>; })}</div>
    {sisteFor(lid, 'overtakelse') && !sisteFor(lid, 'tilbakelevering') && <p className="small muted" style={{ marginBottom: 0 }}>{tt("Ved tilbakelevering hentes rommene og tilstanden fra overtakelsen automatisk, så de kan sammenlignes punkt for punkt.")}</p>}
  </div>;
}
