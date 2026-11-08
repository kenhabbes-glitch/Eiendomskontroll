// Målere: oversikt, avlesning (enkeltvis og som runde), forbruk per måned og fordeling per leietaker.
import React, { useState } from 'react';
import { Hjelp } from '../components/Hjelp';
import { S, save, removeDoc, toast, useStore, uploadFile, state, kanDrifteE, kanRedigereE, canEdit } from '../lib/store';
import { byId, fd, today, sortBy, kNavn, aNavn, eNavn, lNavn, toCsv, type Rec } from '../lib/utils';
import { Chip, Empty, ModalFrame, openModal, confirmBox, FileLink, formModal } from '../components/ui';
import { BildeVelger } from '../components/PosVelger';
import { editAvvik, editKomponent, MaalerRef } from '../lib/actions';
import { MEDIER, alleMaalere, avlFor, enhet, fmt, forbrukMnd, fordeling, grenseTekst, maalerStatus, mediumNavn, perioder, tall, vurderVerdi } from '../lib/maaler';
import { KOMP } from '../lib/catalog';
import { Sel, eiendomOpts, useFilter } from './common';
import { tt } from '../lib/i18n';

const kL = (k: Rec) => kNavn(k.id) + (k.mNr ? ` · nr. ${k.mNr}` : '');
const mndNavn = (m: string) => { const [y, mm] = m.split('-'); return ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'][+mm - 1] + ' ' + y.slice(2); };
const mndListe = (n: number, slutt = today().slice(0, 7)) => { const out: string[] = []; let [y, m] = slutt.split('-').map(Number); for (let i = 0; i < n; i++) { out.unshift(`${y}-${String(m).padStart(2, '0')}`); m--; if (!m) { m = 12; y--; } } return out; };

function StatusChip({ k }: { k: Rec }) {
  const st = maalerStatus(k);
  if (st.utenfor) return <Chip c="red">{tt("Utenfor grense")}</Chip>;
  if (!st.siste) return <Chip c="amber">{tt("Ikke avlest")}</Chip>;
  if (st.forfalt) return <Chip c="amber">{tt("Avlesning forfalt")}</Chip>;
  if (st.sistePeriode?.neg) return <Chip c="orange">{tt("Negativt forbruk?")}</Chip>;
  return <Chip c="green">{tt("OK")}</Chip>;
}

/** Registrer (eller rediger) én avlesning */
export function lesAv(kid: string, eksisterende?: Rec, etter?: () => void) {
  openModal({ render: close => <LesAv kid={kid} a0={eksisterende} close={() => { close(); etter?.(); }} /> });
}
function LesAv({ kid, a0, close }: { kid: string; a0?: Rec; close: () => void }) {
  const k = byId('komponenter', kid)!; const forr = avlFor(kid).filter(a => a.id !== a0?.id).pop();
  const [dato, setDato] = useState(a0?.dato || today()); const [v, setV] = useState(a0?.verdi != null ? String(a0.verdi).replace('.', ',') : '');
  const [bytte, setBytte] = useState(!!a0?.bytte); const [slutt, setSlutt] = useState(a0?.bytte?.slutt != null ? String(a0.bytte.slutt).replace('.', ',') : '');
  const [komm, setKomm] = useState(a0?.komm || ''); const [bilder, setBilder] = useState<File[]>([]); const [busy, setBusy] = useState(false);
  const n = tall(v); const advarsler = n != null ? vurderVerdi(k, n, dato, bytte ? { slutt } : null) : [];
  const diff = n != null && forr && k.mType === 'forbruk' ? ((bytte ? (tall(slutt) ?? n) : n) - tall(forr.verdi)!) * (tall(k.mFaktor) || 1) : null;
  const lagre = async () => {
    if (n == null) return toast(tt("Skriv inn avlest verdi"));
    if (bytte && tall(slutt) == null) return toast(tt("Skriv inn sluttstand på den gamle måleren"));
    if (dato > today()) return toast(tt("Datoen kan ikke være fram i tid"));
    setBusy(true);
    try {
      let bilde = a0?.bilde || null; if (bilder[0]) bilde = await uploadFile(bilder[0], k.eiendomId, undefined, undefined, 'maaler/' + kid);
      await save('avlesninger', { ...(a0 || {}), eiendomId: k.eiendomId, komponentId: kid, dato, verdi: n, t: a0?.t || new Date().toISOString(), av: a0?.av || state.me?.navn || state.me?.epost || '',
        komm, bilde, bytte: bytte ? { slutt: tall(slutt) } : null, kilde: a0?.kilde || 'manuell' });
      toast(tt("Avlesning lagret")); close();
      if (k.mType === 'tilstand' && advarsler.length && !a0 && await confirmBox(tt("{0}: {1} {2} er utenfor grensen ({3}). Registrere avvik?", kNavn(kid), fmt(n), enhet(k), grenseTekst(k)), tt("Registrer avvik")))
        editAvvik(undefined, { eiendomId: k.eiendomId, anleggId: k.anleggId, komponentId: kid, tittel: `${kNavn(kid)}: ${fmt(n)} ${enhet(k)} – utenfor grense (${grenseTekst(k)})`, alv: 'Høy', kilde: 'Egenkontroll', pos: k.pos?.tegningId ? k.pos : null, plassering: k.plassering || '' });
    } catch (e: any) { toast(e?.message || tt("Kunne ikke lagre")); }
    setBusy(false);
  };
  return <ModalFrame title={<>{a0 ? tt("Rediger avlesning") : tt("Les av")}: {kNavn(kid)}<div className="small muted" style={{ fontWeight: 400 }}>{[mediumNavn(k.mMedium), k.mNr && 'nr. ' + k.mNr, k.plassering].filter(Boolean).join(' · ')}</div></>} close={close}
    foot={<>{a0 && kanDrifteE(k.eiendomId) && <button className="btn danger" onClick={async () => { if (await confirmBox(tt("Slette avlesningen?"))) { await removeDoc('avlesninger', a0.id); toast(tt("Slettet")); close(); } }}>{tt("Slett")}</button>}
      <span className="grow" /><button className="btn" onClick={close}>{tt("Avbryt")}</button><button className="btn pri" disabled={busy} onClick={lagre}>{busy ? tt("Lagrer …") : tt("Lagre")}</button></>}>
    <div className="frm">
      {forr && <p className="small muted" style={{ marginTop: 0 }}>{tt("Forrige:")} <b>{fmt(tall(forr.verdi))} {enhet(k)}</b> {fd(forr.dato)}{forr.av ? ' · ' + forr.av : ''}{grenseTekst(k) ? tt(" · grense {0}", grenseTekst(k)) : ''}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div className="fld"><label>{tt("Dato")}</label><input type="date" value={dato} max={today()} onChange={e => setDato(e.target.value)} /></div>
        <div className="fld"><label>{bytte ? tt("Startverdi ny måler") : tt("Avlest verdi")} ({enhet(k) || tt("verdi")})</label><input inputMode="decimal" autoFocus value={v} onChange={e => setV(e.target.value)} style={{ fontSize: 18, fontFamily: 'ui-monospace, monospace' }} /></div>
      </div>
      {k.mType === 'forbruk' && <label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 400 }}><input type="checkbox" style={{ width: 'auto' }} checked={bytte} onChange={e => setBytte(e.target.checked)} />{tt("Måleren er byttet")}</label>}
      {bytte && <div className="fld"><label>{tt("Sluttstand gammel måler")}</label><input inputMode="decimal" value={slutt} onChange={e => setSlutt(e.target.value)} /></div>}
      {diff != null && !advarsler.length && <p className="small" style={{ margin: '4px 0' }}>{tt("Forbruk siden forrige:")} <b>{fmt(diff)} {enhet(k)}</b></p>}
      {advarsler.map(w => <p key={w} className="small" style={{ color: 'var(--amber)', margin: '4px 0' }}>⚠ {w}</p>)}
      <div className="fld"><label>{tt("Bilde av displayet (valgfritt)")}</label><BildeVelger filer={bilder} set={b => setBilder(b.slice(-1))} />{a0?.bilde && !bilder.length && <div className="small"><FileLink fil={a0.bilde} /></div>}</div>
      <div className="fld"><label>{tt("Kommentar")}</label><input value={komm} onChange={e => setKomm(e.target.value)} /></div>
    </div>
  </ModalFrame>;
}

/** Søylediagram (forbruk per måned) eller linje (tilstand) */
function Graf({ k }: { k: Rec }) {
  const W = 640, H = 170, pl = 44, pb = 22, pt = 10; const e = enhet(k);
  if (k.mType === 'tilstand') {
    const A = avlFor(k.id).slice(-60); if (A.length < 2) return <p className="small muted">{tt("For få avlesninger til graf.")}</p>;
    const V = A.map(a => tall(a.verdi)!); const min = tall(k.mMin), max = tall(k.mMax);
    const lo = Math.min(...V, min ?? Infinity), hi = Math.max(...V, max ?? -Infinity); const sp = hi - lo || 1;
    const x = (i: number) => pl + i * (W - pl - 8) / (A.length - 1); const y = (v: number) => pt + (H - pt - pb) * (1 - (v - lo + sp * .05) / (sp * 1.1));
    return <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W }} role="img" aria-label={tt("Avlesninger {0}", kNavn(k.id))}>
      {[lo, (lo + hi) / 2, hi].map(v => <g key={v}><line x1={pl} x2={W - 8} y1={y(v)} y2={y(v)} stroke="var(--line)" /><text x={pl - 6} y={y(v) + 4} textAnchor="end" fontSize={10} fill="var(--muted)">{fmt(v)}</text></g>)}
      {min != null && <line x1={pl} x2={W - 8} y1={y(min)} y2={y(min)} stroke="var(--red)" strokeDasharray="4 3" />}{max != null && <line x1={pl} x2={W - 8} y1={y(max)} y2={y(max)} stroke="var(--red)" strokeDasharray="4 3" />}
      <polyline points={V.map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" stroke="var(--acc)" strokeWidth={2} />
      {V.map((v, i) => { const ut = (min != null && v < min) || (max != null && v > max); return <circle key={i} cx={x(i)} cy={y(v)} r={4} fill={ut ? 'var(--red)' : 'var(--acc)'} stroke="#fff" strokeWidth={2}><title>{fd(A[i].dato)}: {fmt(v)} {e}</title></circle>; })}
      <text x={pl} y={H - 6} fontSize={10} fill="var(--muted)">{fd(A[0].dato)}</text><text x={W - 8} y={H - 6} fontSize={10} fill="var(--muted)" textAnchor="end">{fd(A[A.length - 1].dato)}</text>
    </svg>;
  }
  const M = mndListe(24); const F = forbrukMnd(k); const V = M.map(m => F[m] || 0); const hi = Math.max(...V, 0);
  if (!hi) return <p className="small muted">{tt("Forbruk vises når måleren har minst to avlesninger.")}</p>;
  const bw = (W - pl - 8) / M.length; const y = (v: number) => pt + (H - pt - pb) * (1 - v / hi);
  return <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W }} role="img" aria-label={tt("Forbruk per måned {0}", kNavn(k.id))}>
    {[0, hi / 2, hi].map(v => <g key={v}><line x1={pl} x2={W - 8} y1={y(v)} y2={y(v)} stroke="var(--line)" /><text x={pl - 6} y={y(v) + 4} textAnchor="end" fontSize={10} fill="var(--muted)">{fmt(v, 0)}</text></g>)}
    {M.map((m, i) => { const v = V[i]; const h = Math.max(0, H - pb - y(v)); return <g key={m}>
      <rect x={pl + i * bw + 1} y={y(v)} width={Math.max(1, bw - 2)} height={h} rx={Math.min(4, (bw - 2) / 2)} fill="var(--acc)" opacity={m.slice(0, 4) === today().slice(0, 4) ? 1 : .55}><title>{mndNavn(m)}: {fmt(v)} {e}</title></rect>
      {i % 3 === 0 && <text x={pl + i * bw + bw / 2} y={H - 6} fontSize={10} fill="var(--muted)" textAnchor="middle">{mndNavn(m)}</text>}</g>; })}
  </svg>;
}

/** Kort med siste avlesninger – brukes nederst i komponentskjemaet og i målervisningen */
export function MaalerKort({ kid }: { kid: string }) {
  useStore(); const k = byId('komponenter', kid); if (!k) return null;
  const A = avlFor(kid).slice().reverse(); const st = maalerStatus(k); const P = perioder(k); const kan = kanDrifteE(k.eiendomId);
  const pMap = Object.fromEntries(P.map(p => [p.til, p]));
  return <div className="sec"><div className="toolbar"><h2 style={{ margin: 0, flex: 1 }}>{tt("Avlesninger")}</h2><StatusChip k={k} />{kan && <button className="btn pri sm" onClick={() => lesAv(kid)}>{tt("+ Les av")}</button>}</div>
    <p className="small muted" style={{ marginTop: 0 }}>{mediumNavn(k.mMedium)} · {k.mType === 'tilstand' ? tt("tilstandsmåler") : tt("forbruksmåler")}{grenseTekst(k) ? tt(" · grense {0}", grenseTekst(k)) : ''} {tt("· leses av hver")} {+(k.mFrekN || 1) > 1 ? k.mFrekN + '. ' : ''}{k.mFrekE === 'uke' ? tt("uke") : k.mFrekE === 'år' ? tt("år") : tt("måned")}{st.neste ? tt(" · neste {0}", fd(st.neste)) : ''}{k.mLeietaker ? tt(" · leietaker {0}", lNavn(k.mLeietaker)) : ''}{k.mHoved ? tt(" · undermåler av {0}", kNavn(k.mHoved)) : ''}</p>
    <Graf k={k} />
    {A.length ? <div className="tbl-wrap"><table><thead><tr><th>{tt("Dato")}</th><th>{tt("Verdi")}</th>{k.mType === 'forbruk' && <th>{tt("Forbruk")}</th>}<th>{tt("Avlest av")}</th><th /></tr></thead><tbody>
      {A.slice(0, 50).map(a => { const p = pMap[a.dato]; return <tr key={a.id} className={kan ? 'click' : ''} onClick={() => kan && lesAv(kid, a)}>
        <td className="small">{fd(a.dato)}</td><td className="mono">{fmt(tall(a.verdi))} {enhet(k)}{a.bytte && <div className="small muted">{tt("Målerbytte – sluttstand")} {fmt(tall(a.bytte.slutt))}</div>}</td>
        {k.mType === 'forbruk' && <td className="mono small" style={{ color: p?.neg ? 'var(--red)' : undefined }}>{p ? fmt(p.forbruk) + ' ' + enhet(k) : ''}{p && p.dager > 0 ? <span className="muted"> ({fmt(p.forbruk / p.dager)}{tt("/døgn)")}</span> : null}</td>}
        <td className="small">{a.av}{a.kilde === 'kontroll' ? <span className="muted"> {tt("· fra kontroll")}</span> : a.kilde === 'servicefirma' ? <span className="muted"> {tt("· servicefirma")}</span> : null}{a.komm && <div className="muted">{a.komm}</div>}</td>
        <td onClick={e => e.stopPropagation()}>{a.bilde && <FileLink fil={a.bilde}>📷</FileLink>}</td></tr>; })}</tbody></table></div> : <p className="muted small">{tt("Ingen avlesninger ennå.")}</p>}
  </div>;
}
MaalerRef.Kort = MaalerKort;

export function visMaaler(kid: string) {
  openModal({ wide: true, render: close => <ModalFrame title={kNavn(kid)} close={close} foot={<><span className="grow" />{kanRedigereE(byId('komponenter', kid)?.eiendomId) && <button className="btn" onClick={() => { close(); editKomponent(kid); }}>{tt("Rediger måler")}</button>}<button className="btn" onClick={close}>{tt("Lukk")}</button></>}><MaalerKort kid={kid} /></ModalFrame> });
}

/** Avlesningsrunde: alle målere på en eiendom i én liste, sortert etter plassering */
export function avlesningsRunde(eid: string) { openModal({ wide: true, render: close => <Runde eid={eid} close={close} /> }); }
function Runde({ eid, close }: { eid: string; close: () => void }) {
  useStore();
  const [verdi, setVerdi] = useState<Record<string, string>>({}); const [lagret, setLagret] = useState<Record<string, boolean>>({}); const [bare, setBare] = useState(true); const [busy, setBusy] = useState('');
  const M = sortBy(alleMaalere(eid), k => (k.plassering || '~') + kNavn(k.id));
  const L = bare ? M.filter(k => lagret[k.id] || maalerStatus(k).forfalt) : M;
  const lagre = async (k: Rec) => {
    const n = tall(verdi[k.id]); if (n == null) return toast(tt("Skriv inn verdi"));
    const w = vurderVerdi(k, n, today(), null); if (w.length && k.mType === 'forbruk' && !(await confirmBox(tt("{0}: {1} Lagre likevel?", kNavn(k.id), w.join(' ')), tt("Lagre")))) return;
    setBusy(k.id);
    try { await save('avlesninger', { eiendomId: eid, komponentId: k.id, dato: today(), verdi: n, t: new Date().toISOString(), av: state.me?.navn || state.me?.epost || '', kilde: 'runde' }); setLagret({ ...lagret, [k.id]: true });
      if (k.mType === 'tilstand' && w.length) toast(tt("⚠ {0} er utenfor grensen – registrer avvik fra måleren", kNavn(k.id))); }
    catch (e: any) { toast(e?.message || tt("Kunne ikke lagre")); }
    setBusy('');
  };
  const nLagret = Object.keys(lagret).length;
  return <ModalFrame title={<>{tt("Avlesningsrunde –")} {eNavn(eid)}<div className="small muted" style={{ fontWeight: 400 }}>{nLagret} {tt("avlest i denne runden ·")} {M.length} {tt("målere")}</div></>} close={close}
    foot={<><label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" style={{ width: 'auto' }} checked={bare} onChange={e => setBare(e.target.checked)} />{tt("Vis bare målere som skal leses av")}</label><span className="grow" /><button className="btn pri" onClick={close}>{tt("Ferdig")}</button></>}>
    {!L.length ? <Empty t="Ingen målere å lese av">{M.length ? tt("Alle målerne er avlest. Fjern avkrysningen for å vise alle.") : tt("Registrer målere som komponenter med «Er komponenten en måler?».")}</Empty> :
      <div className="kr-liste" style={{ maxHeight: '62vh' }}>{L.map(k => { const s = maalerStatus(k).siste; const n = tall(verdi[k.id]); const w = n != null ? vurderVerdi(k, n, today(), null) : [];
        return <div key={k.id} className={'kr-rad' + (lagret[k.id] ? ' ok' : '')} style={{ cursor: 'default', flexWrap: 'wrap' }}>
          <span className="kr-ikon">{lagret[k.id] ? '✓' : ''}</span>
          <span style={{ flex: 1, minWidth: 180 }}><b>{kNavn(k.id)}</b><span className="small muted" style={{ display: 'block' }}>{[mediumNavn(k.mMedium), k.mNr && 'nr. ' + k.mNr, k.plassering].filter(Boolean).join(' · ')}</span>
            <span className="small muted">{tt("Forrige:")} {s ? tt("{0} {1} ({2})", fmt(tall(s.verdi)), enhet(k), fd(s.dato)) : '–'}{grenseTekst(k) ? tt(" · grense {0}", grenseTekst(k)) : ''}</span>
            {w.map(x => <span key={x} className="small" style={{ display: 'block', color: 'var(--amber)' }}>⚠ {x}</span>)}</span>
          {lagret[k.id] ? <span className="small">{tt("Lagret")}</span> : <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input inputMode="decimal" value={verdi[k.id] || ''} onChange={e => setVerdi({ ...verdi, [k.id]: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') lagre(k); }} placeholder={enhet(k)} style={{ width: 120, fontFamily: 'ui-monospace, monospace', border: '1px solid var(--line2)', borderRadius: 8, padding: '8px 9px' }} />
            <button className="btn pri sm" disabled={busy === k.id} onClick={() => lagre(k)}>{tt("Lagre")}</button>
            <button className="btn ghost sm" title={tt("Med bilde, målerbytte eller kommentar")} onClick={() => lesAv(k.id, undefined, () => setLagret(l => ({ ...l, [k.id]: avlFor(k.id).some(a => a.dato === today()) })))}>…</button></span>}
        </div>; })}</div>}
  </ModalFrame>;
}

function nyMaaler(eid?: string) {
  const SY = sortBy(S.anlegg.filter(a => (!eid || a.eiendomId === eid) && kanRedigereE(a.eiendomId)), a => eNavn(a.eiendomId) + aNavn(a.id));
  if (!SY.length) return toast(tt("Registrer først et system måleren hører til (f.eks. sprinkleranlegg, sanitæranlegg, fjernvarme)"));
  formModal({ title: tt("Ny måler"), saveTxt: tt("Neste"), fields: [
    { k: 'a', label: tt("Hører til system"), type: 'select', req: true, options: SY.map(a => [a.id, (eid ? '' : eNavn(a.eiendomId) + ' – ') + aNavn(a.id)] as [string, string]) },
    { k: 'm', label: tt("Måler hva"), type: 'select', options: MEDIER.map(([k, n]) => [k, n] as [string, string]), def: 'vann' }],
    onSave: async x => { const tilstand = ['trykk', 'temperatur'].includes(x.m); const kode = tilstand ? (x.m === 'trykk' ? 'RP' : 'RT') : x.m === 'el' ? 'RE' : 'RF';
      setTimeout(() => editKomponent(undefined, x.a, { kode, mType: tilstand ? 'tilstand' : 'forbruk', mMedium: x.m, mFrekN: 1, mFrekE: tilstand ? 'uke' : 'mnd' }), 50); } });
}

export function Maalere() {
  useStore();
  const [f, setF] = useFilter('maalere', { e: '', m: '', q: '', fane: 'oversikt', fra: '', til: '' });
  let M = alleMaalere(f.e); if (f.m) M = M.filter(k => k.mMedium === f.m);
  if (f.q) { const q = f.q.toLowerCase(); M = M.filter(k => (kNavn(k.id) + ' ' + (k.mNr || '') + ' ' + (k.plassering || '') + ' ' + lNavn(k.mLeietaker)).toLowerCase().includes(q)); }
  M = sortBy(M, k => eNavn(k.eiendomId) + aNavn(k.anleggId) + kNavn(k.id));
  const kanLese = S.eiendommer.some(e => kanDrifteE(e.id)); const ES = f.e ? [f.e] : [...new Set(alleMaalere().map(k => k.eiendomId))];
  const forfalt = M.filter(k => maalerStatus(k).forfalt || maalerStatus(k).utenfor).length;
  const iAar = today().slice(0, 4); const fra = f.fra || `${iAar}-01`; const til = f.til || today().slice(0, 7);
  const tabs: [string, string][] = [['oversikt', 'Oversikt'], ['forbruk', 'Forbruk per måned'], ['fordeling', 'Fordeling per leietaker']];
  const eksport = (rader: (string | number)[][], navn: string) => { const b = new Blob(['﻿' + toCsv(rader)], { type: 'text/csv;charset=utf-8' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = navn; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1000); };
  let c: React.ReactNode = null;
  if (!alleMaalere().length) c = <div className="card"><Empty t="Ingen målere registrert">{tt("Målere er komponenter i et system, f.eks. trykkmålere på sprinkleranlegget, vannmåler på sanitæranlegget eller energimålere for fjernvarme og seriemålere.")} {canEdit() && <><br /><button className="btn pri" style={{ marginTop: 10 }} onClick={() => nyMaaler(f.e)}>{tt("+ Registrer første måler")}</button></>}</Empty></div>;
  else if (f.fane === 'oversikt') c = <div className="tbl-wrap"><table><thead><tr><th>{tt("Måler")}</th>{!f.e && <th>{tt("Eiendom")}</th>}<th>{tt("Hva")}</th><th>{tt("Siste avlesning")}</th><th>{tt("Siste periode")}</th><th>{tt("Neste")}</th><th>{tt("Status")}</th><th /></tr></thead><tbody>
    {M.map(k => { const st = maalerStatus(k); const p = st.sistePeriode; return <tr key={k.id} className="click" onClick={() => visMaaler(k.id)}>
      <td><b style={{ fontWeight: 600 }}>{kNavn(k.id)}</b><div className="small muted">{[k.mNr && 'nr. ' + k.mNr, k.plassering, k.mLeietaker && lNavn(k.mLeietaker), k.mHoved && 'under ' + kNavn(k.mHoved)].filter(Boolean).join(' · ')}</div></td>
      {!f.e && <td className="small">{eNavn(k.eiendomId)}</td>}
      <td className="small">{mediumNavn(k.mMedium)}<div className="muted">{aNavn(k.anleggId)}</div></td>
      <td className="mono small">{st.siste ? <>{fmt(tall(st.siste.verdi))} {enhet(k)}<div className="muted">{fd(st.siste.dato)}</div></> : '–'}</td>
      <td className="mono small">{k.mType === 'forbruk' && p ? <>{fmt(p.forbruk)} {enhet(k)}<div className="muted">{p.dager > 0 ? fmt(p.forbruk / p.dager) + tt("/døgn") : ''}</div></> : k.mType === 'tilstand' ? <span className="muted">{grenseTekst(k)}</span> : ''}</td>
      <td className="small">{st.neste ? fd(st.neste) : tt("nå")}</td><td><StatusChip k={k} /></td>
      <td onClick={e => e.stopPropagation()}>{kanDrifteE(k.eiendomId) && <button className="btn sm" onClick={() => lesAv(k.id)}>{tt("Les av")}</button>}</td></tr>; })}
  </tbody></table></div>;
  else if (f.fane === 'forbruk') { const MM = mndListe(12, til); const F = M.filter(k => k.mType === 'forbruk');
    const rad = (k: Rec) => { const x = forbrukMnd(k); return MM.map(m => x[m] || 0); };
    c = <><div className="tbl-wrap"><table><thead><tr><th>{tt("Måler")}</th>{MM.map(m => <th key={m} className="num">{mndNavn(m)}</th>)}<th className="num">{tt("Sum")}</th></tr></thead><tbody>
      {F.map(k => { const r = rad(k); return <tr key={k.id} className="click" onClick={() => visMaaler(k.id)}><td><b style={{ fontWeight: 600 }}>{kNavn(k.id)}</b><div className="small muted">{mediumNavn(k.mMedium)} · {enhet(k)}{!f.e ? ' · ' + eNavn(k.eiendomId) : ''}</div></td>
        {r.map((v, i) => <td key={i} className="num mono small">{v ? fmt(v, 0) : '–'}</td>)}<td className="num mono small"><b>{fmt(r.reduce((s, v) => s + v, 0), 0)}</b></td></tr>; })}</tbody></table></div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}><span className="small muted" style={{ flex: 1 }}>{tt("Forbruket fordeles jevnt per døgn mellom avlesningene. Siste 12 måneder til og med")} {mndNavn(til)}.</span>
        <button className="btn sm" onClick={() => eksport([['Eiendom', 'Måler', 'Målernr', 'Medium', 'Enhet', ...MM], ...F.map(k => [eNavn(k.eiendomId), kNavn(k.id), k.mNr || '', mediumNavn(k.mMedium), enhet(k), ...rad(k).map(v => Math.round(v * 100) / 100)])], 'forbruk-per-maned.csv')}>{tt("Eksporter til Excel (CSV)")}</button></div></>; }
  else { const blokker = ES.flatMap(eid => fordeling(eid, fra, til).filter(b => b.harUnder || b.h.mLeietaker).map(b => ({ eid, ...b })));
    const csv: (string | number)[][] = [['Eiendom', 'Hovedmåler', 'Måler', 'Leietaker', 'Enhet', `Forbruk ${fra}–${til}`, 'Andel %']];
    c = <><div className="toolbar"><span className="small">{tt("Periode")}</span><input type="month" value={fra} onChange={e => setF({ fra: e.target.value })} /><span>–</span><input type="month" value={til} onChange={e => setF({ til: e.target.value })} />
      <span className="grow" /><button className="btn sm" onClick={() => eksport(csv, `fordeling-${fra}-${til}.csv`)}>{tt("Eksporter til Excel (CSV)")}</button></div>
      {!blokker.length ? <div className="card"><Empty t="Ingen seriemålere">{tt("Koble seriemålere til en leietaker og til hovedmåleren de måler en del av (i måleren: «Leietaker» og «Undermåler av»). Da vises forbruket per leietaker her, og hvor mye som ikke fanges opp av seriemålerne.")}</Empty></div> :
        blokker.map(b => { const e = enhet(b.h); const pst = (v: number) => b.hv > 0 ? fmt(v / b.hv * 100, 1) + ' %' : '';
          const perLt: Record<string, number> = {}; b.rader.forEach(r => { perLt[r.lt] = (perLt[r.lt] || 0) + r.v; });
          b.rader.forEach(r => csv.push([eNavn(b.eid), kNavn(b.h.id), kNavn(r.k.id), r.lt ? lNavn(r.lt) : 'Felles/eier', e, Math.round(r.v * 100) / 100, b.hv > 0 ? Math.round(r.v / b.hv * 1000) / 10 : '']));
          if (b.harUnder) csv.push([eNavn(b.eid), kNavn(b.h.id), 'Ikke målt av seriemålere', '', e, Math.round(b.rest * 100) / 100, b.hv > 0 ? Math.round(b.rest / b.hv * 1000) / 10 : '']);
          return <div key={b.h.id} className="card" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}><b>{kNavn(b.h.id)}</b><span className="small muted">{mediumNavn(b.h.mMedium)} · {eNavn(b.eid)}</span><span className="grow" /><span className="mono">{tt("Hovedmåler:")} <b>{fmt(b.hv, 0)} {e}</b></span></div>
            <table style={{ marginTop: 6 }}><thead><tr><th>{tt("Leietaker")}</th><th>{tt("Seriemålere")}</th><th className="num">{tt("Forbruk")}</th><th className="num">{tt("Andel")}</th></tr></thead><tbody>
              {Object.entries(perLt).sort((a, z) => z[1] - a[1]).map(([lt, v]) => <tr key={lt}><td>{lt ? lNavn(lt) : <span className="muted">{tt("Felles / eier")}</span>}</td><td className="small">{b.rader.filter(r => r.lt === lt).map(r => kNavn(r.k.id)).join(', ')}</td><td className="num mono">{fmt(v, 0)} {e}</td><td className="num mono">{pst(v)}</td></tr>)}
              {b.harUnder && <tr><td className="muted">{tt("Ikke målt av seriemålere")}</td><td className="small muted">{tt("Fellesarealer, tap eller lekkasje")}</td><td className="num mono" style={{ color: b.rest < 0 ? 'var(--red)' : undefined }}>{fmt(b.rest, 0)} {e}</td><td className="num mono">{pst(b.rest)}</td></tr>}
            </tbody></table>
            {b.rest < 0 && <p className="small" style={{ color: 'var(--red)', margin: '6px 0 0' }}>{tt("Seriemålerne viser mer enn hovedmåleren – kontroller avlesninger og faktorer.")}</p>}
          </div>; })}
      <p className="small muted">{tt("Forbruket beregnes fra avlesningene og fordeles jevnt per døgn, så perioden kan velges fritt selv om målerne leses av på ulike datoer. Grunnlaget kan brukes til viderefakturering – kontroller mot leieavtalen.")}</p></>; }
  return <>
    <div className="head"><div className="grow"><h1>{tt("Målere")}<Hjelp id="side.maalere" /></h1><p className="sub">{tt("Avlesning av trykk, vann, fjernvarme, fjernkjøling og energi.")} {forfalt ? <span style={{ color: 'var(--amber)' }}>{forfalt} {tt("målere skal leses av eller er utenfor grense.")}</span> : ''}</p></div>
      {kanLese && alleMaalere().length > 0 && <button className="btn" onClick={() => { const e = f.e || (ES.length === 1 ? ES[0] : ''); if (!e) return toast(tt("Velg eiendom for avlesningsrunden")); avlesningsRunde(e); }}>{tt("Avlesningsrunde")}</button>}
      {canEdit() && <button className="btn pri" onClick={() => nyMaaler(f.e)}>{tt("+ Ny måler")}</button>}</div>
    {alleMaalere().length > 0 && <><div className="tabs">{tabs.map(([k, l]) => <a key={k} className={f.fane === k ? 'on' : ''} onClick={() => setF({ fane: k })}>{tt(l)}</a>)}</div>
      <div className="toolbar"><input placeholder={tt("Søk …")} value={f.q} onChange={e => setF({ q: e.target.value })} style={{ border: '1px solid var(--line2)', borderRadius: 8, padding: '7px 9px' }} />
        <Sel value={f.e} onChange={e => setF({ e })} opts={eiendomOpts()} empty={tt("Alle eiendommer")} />
        <Sel value={f.m} onChange={m => setF({ m })} opts={MEDIER.filter(([k]) => alleMaalere().some(x => x.mMedium === k)).map(([k, n]) => [k, n] as [string, string])} empty={tt("Alle typer")} />
        <span className="small muted">{M.length} {tt("målere")}</span></div></>}
    {c}
  </>;
}
export { KOMP };
