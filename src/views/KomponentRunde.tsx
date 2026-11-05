// Komponentvis kontrollrunde: én sjekkliste per komponent (branndør, nødlys …), kvittert ut fortløpende mens man går gjennom bygget.
import React, { useState } from 'react';
import { S, save, state, toast, useStore, uploadFile, kanDrifteE } from '../lib/store';
import { byId, type Rec } from '../lib/utils';
import { RundeRef, utfor } from '../lib/actions';
import { AV_ALV, AV_FRIST } from '../lib/catalog';
import { addDays, fd, today, tfmKomp, kNavn, aNavn, sortBy } from '../lib/utils';
import { ModalFrame, openModal, confirmBox, Chip } from '../components/ui';
import { BildeVelger } from '../components/PosVelger';
import { kompForKontroll, nyRunde, malIRunde, punkterFor, rundeStatus, type KompSvar, type Runde, type Svar } from '../lib/komponentsjekk';
import { alleSjekkmaler } from './Sjekkmaler';

const kLabel = (k: Rec) => `${tfmKomp(k)} ${k.navn || ''}`.trim();
export const rundeKomp = (o: Rec) => kompForKontroll(o, S.komponenter, alleSjekkmaler());
const harAvvik = (s?: KompSvar) => !!s && ((s.avvik || []).length > 0 || Object.values(s.svar || {}).includes('avvik'));

/** Starter (eller fortsetter) runden. Returnerer false hvis kontrollen ikke skal kvitteres komponentvis. */
export function startRunde(id: string): boolean {
  const o = byId('oppgaver', id); if (!o) return false;
  const K = rundeKomp(o); if (!K.length) return false;
  openModal({ wide: true, render: close => <RundeModal oid={id} close={close} /> });
  return true;
}
RundeRef.start = startRunde;
RundeRef.Oppsummering = (p: { r: any }) => <RundeOppsummering r={p.r} />;

async function sikreRunde(oid: string): Promise<Runde> {
  const o = byId('oppgaver', oid)!;
  if (o.runde?.kp) {
    const mangler = rundeKomp(o).filter(k => !o.runde.malId?.[k.id]); if (!mangler.length) return o.runde;
    const nr = nyRunde(mangler, alleSjekkmaler(), o.runde.start); const r = { ...o.runde, malId: { ...(o.runde.malId || {}), ...nr.malId }, maler: { ...nr.maler, ...o.runde.maler } };
    await save('oppgaver', { ...o, runde: r }); return r;
  }
  const r = nyRunde(rundeKomp(o), alleSjekkmaler(), today());
  await save('oppgaver', { ...o, runde: r }); return r;
}

function RundeModal({ oid, close }: { oid: string; close: () => void }) {
  useStore();
  const o = byId('oppgaver', oid); const [q, setQ] = useState(''); const [vis, setVis] = useState<'alle' | 'igjen' | 'avvik'>('igjen');
  if (!o) return <ModalFrame title="Kontroll" close={close}><p>Kontrollen finnes ikke lenger.</p></ModalFrame>;
  const K = sortBy(rundeKomp(o), k => (k.plassering || '~') + ' ' + kLabel(k));
  const r: Runde | null = o.runde?.kp ? o.runde : null; const st = rundeStatus(r, K);
  const kan = kanDrifteE(o.eiendomId);
  let L = K; if (q) { const s = q.toLowerCase(); L = L.filter(k => (kLabel(k) + ' ' + (k.plassering || '')).toLowerCase().includes(s)); }
  if (vis === 'igjen') L = L.filter(k => !r?.kp[k.id]); if (vis === 'avvik') L = L.filter(k => harAvvik(r?.kp[k.id]));
  const nesteEtter = (kid?: string) => { const i = K.findIndex(k => k.id === kid); return [...K.slice(i + 1), ...K.slice(0, i + 1)].find(k => k.id !== kid && !byId('oppgaver', oid)?.runde?.kp?.[k.id]); };
  const aapne = async (k: Rec) => { if (!kan) return toast('Du har ikke tilgang til å registrere kontroller på dette bygget'); await sikreRunde(oid); sjekkKomp(oid, k.id, nesteEtter); };
  const fullfor = async () => {
    if (!r || !st.gjort) return toast('Kvitter ut minst én komponent først');
    if (st.igjen && !(await confirmBox(`${st.igjen} av ${st.antall} komponenter er ikke kontrollert. Fullføre kontrollen likevel? De blir ført opp som «ikke kontrollert» i rapporten.`, 'Fullfør likevel'))) return;
    close();
    const ikke = K.filter(k => !r.kp[k.id]).map(kLabel);
    utfor(oid, { fraRunde: true, res: st.avvik ? 'Avvik funnet' : 'OK – ingen avvik',
      komm: `Komponentvis kontroll: ${st.ok} OK, ${st.avvik} med avvik${st.igjen ? `, ${st.igjen} ikke kontrollert (${ikke.slice(0, 15).join(', ')}${ikke.length > 15 ? ' …' : ''})` : ''}.` });
  };
  const pst = st.antall ? Math.round(st.gjort / st.antall * 100) : 0;
  return <ModalFrame title={<>{o.navn}<div className="small muted" style={{ fontWeight: 400 }}>{aNavn(o.anleggId)} · komponentvis sjekkliste{r ? ` · startet ${fd(r.start)}` : ''}</div></>} close={close}
    foot={<><span className="small muted">{r ? 'Alt lagres fortløpende – du kan lukke og fortsette senere.' : ''}</span><span className="grow" /><button className="btn" onClick={close}>Lukk</button>
      {kan && <button className="btn pri" disabled={!st.gjort} onClick={fullfor}>Fullfør kontrollen</button>}</>}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
      <div style={{ flex: 1, height: 10, background: 'var(--surface2)', borderRadius: 5, overflow: 'hidden', border: '1px solid var(--line)' }}>
        <div style={{ width: pst + '%', height: '100%', background: st.avvik ? 'var(--amber)' : 'var(--acc)' }} /></div>
      <b className="small">{st.gjort} av {st.antall}</b>{st.avvik > 0 && <Chip c="amber">{st.avvik} med avvik</Chip>}
    </div>
    <div className="toolbar" style={{ marginBottom: 8 }}>
      <input placeholder="Søk komponent eller plassering" value={q} onChange={e => setQ(e.target.value)} style={{ flex: 1, minWidth: 160, border: '1px solid var(--line2)', borderRadius: 8, padding: '7px 9px' }} />
      <div className="seg">{([['igjen', `Gjenstår (${st.igjen})`], ['avvik', `Avvik (${st.avvik})`], ['alle', `Alle (${st.antall})`]] as const).map(([k, l]) =>
        <button key={k} className={'btn sm' + (vis === k ? ' pri' : '')} onClick={() => setVis(k)}>{l}</button>)}</div>
    </div>
    {!L.length ? <p className="muted" style={{ padding: '18px 0', textAlign: 'center' }}>{vis === 'igjen' ? 'Alle komponentene er kontrollert. Trykk «Fullfør kontrollen».' : 'Ingen treff.'}</p> :
      <div className="kr-liste">{L.map(k => { const s = r?.kp[k.id]; const av = harAvvik(s);
        return <button key={k.id} className={'kr-rad' + (s ? (av ? ' avvik' : ' ok') : '')} onClick={() => aapne(k)}>
          <span className="kr-ikon">{s ? (av ? '!' : '✓') : ''}</span>
          <span style={{ flex: 1, textAlign: 'left' }}><b>{kLabel(k)}</b><span className="small muted" style={{ display: 'block' }}>{k.plassering || 'Plassering ikke registrert'}</span></span>
          <span className="small muted" style={{ textAlign: 'right' }}>{s ? <>{fd(s.t.slice(0, 10))}{s.av ? <><br />{s.av}</> : null}</> : 'Ikke kontrollert'}</span>
        </button>; })}</div>}
  </ModalFrame>;
}

function sjekkKomp(oid: string, kid: string, neste: (kid?: string) => Rec | undefined) {
  openModal({ render: close => <SjekkKomp oid={oid} kid={kid} close={close} neste={neste} /> });
}

function SjekkKomp({ oid, kid, close, neste }: { oid: string; kid: string; close: () => void; neste: (kid?: string) => Rec | undefined }) {
  const o = byId('oppgaver', oid)!; const k = byId('komponenter', kid)!; const r: Runde = o.runde;
  const mal = malIRunde(r, kid); const P = punkterFor(mal, o.intervall); const f0 = r.kp[kid];
  const [svar, setSvar] = useState<Record<string, Svar>>(f0?.svar || {});
  const [tekst, setTekst] = useState<Record<string, string>>({});
  const [komm, setKomm] = useState(f0?.komm || ''); const [alv, setAlv] = useState('Middels'); const [bilder, setBilder] = useState<File[]>([]);
  const [av, setAv] = useState(f0?.av || state.me?.navn || ''); const [busy, setBusy] = useState(false);
  const avP = P.filter(p => svar[p.id] === 'avvik'); const alleSvart = P.every(p => svar[p.id]);
  const lagre = async (videre: boolean) => {
    if (!alleSvart) return toast('Svar på alle sjekkpunktene (OK, Avvik eller Ikke relevant)');
    setBusy(true);
    try {
      const fersk = byId('oppgaver', oid)!; const rr: Runde = fersk.runde;
      const avvik = avP.map(p => (tekst[p.id] ?? p.t).trim()).filter(Boolean);
      const s: KompSvar = { t: new Date().toISOString(), av, svar, komm, avvik, kilde: 'app' };
      // Avvik registreres med en gang, koblet til komponenten og plassert der komponenten er på tegningen
      const gml = rr.kp[kid]?.avvikIds || [];
      if (avvik.length && !gml.length) {
        const id = crypto.randomUUID(); const ved: any[] = [];
        for (const b of bilder) { const f = await uploadFile(b, o.eiendomId, undefined, undefined, 'ao/' + id); if (f) ved.push(f); }
        await save('avvik', { id, tittel: `${kLabel(k)}: ${avvik.join('; ')}`.slice(0, 200), eiendomId: o.eiendomId, anleggId: o.anleggId || '', komponentId: kid, alv, status: 'Ny',
          kilde: o.type === 'Egenkontroll' ? 'Egenkontroll' : 'Servicerapport', oppgaveId: oid, ansvar: o.ansvar === 'Leietaker' ? 'Leietaker' : 'Eier', leietakerId: o.ansvar === 'Leietaker' ? (o.leietakerId || '') : '',
          beskrivelse: avvik.map(t => '• ' + t).join('\n') + (komm ? '\n\n' + komm : ''), plassering: k.plassering || '', pos: k.pos?.tegningId ? k.pos : null, vedlegg: ved, oppdaget: today(), frist: addDays(today(), AV_FRIST[alv]),
          logg: [{ t: s.t, s: 'Ny', k: `Registrert fra komponentkontroll: ${o.navn}`, av }] });
        s.avvikIds = [id];
      } else if (gml.length) s.avvikIds = gml;
      await save('oppgaver', { ...fersk, runde: { ...rr, kp: { ...rr.kp, [kid]: s } } });
      toast(avvik.length ? `${kLabel(k)} kvittert – avvik registrert` : `${kLabel(k)} kvittert ut`);
      close();
      if (videre) { const n = neste(kid); if (n) sjekkKomp(oid, n.id, neste); else toast('Alle komponentene er kontrollert – trykk «Fullfør kontrollen»'); }
    } catch (e: any) { toast(e?.message || 'Kunne ikke lagre'); }
    setBusy(false);
  };
  return <ModalFrame title={<>{kLabel(k)}<div className="small muted" style={{ fontWeight: 400 }}>{k.plassering || 'Plassering ikke registrert'} · {mal.navn}</div></>} close={close}
    foot={<><button className="btn" onClick={close}>Avbryt</button><span className="grow" />
      <button className="btn" disabled={busy} onClick={() => lagre(false)}>Kvitter ut</button>
      <button className="btn pri" disabled={busy} onClick={() => lagre(true)}>{busy ? 'Lagrer …' : 'Kvitter ut og neste →'}</button></>}>
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
      <button className="btn sm" onClick={() => setSvar(Object.fromEntries(P.map(p => [p.id, svar[p.id] === 'ia' ? 'ia' : 'ok'])))}>✓ Alt OK</button></div>
    {f0?.avvikIds?.length ? <p className="note">Avvik er allerede registrert for denne komponenten i denne runden. Endringer her oppdaterer bare sjekklisten – rediger avviket under Avvik.</p> : null}
    <div className="kr-punkter">{P.map((p, i) => <div key={p.id} className="kr-punkt">
      <div style={{ flex: 1 }}><span className="muted small">{i + 1}.</span> {p.t}{p.aar && <span className="small muted"> (årlig)</span>}
        {svar[p.id] === 'avvik' && <input className="kr-avtekst" value={tekst[p.id] ?? p.t} onChange={e => setTekst({ ...tekst, [p.id]: e.target.value })} placeholder="Beskriv avviket" />}</div>
      <div className="kr-valg">{([['ok', 'OK'], ['avvik', 'Avvik'], ['ia', 'I.R.']] as const).map(([v, l]) =>
        <button key={v} type="button" title={v === 'ia' ? 'Ikke relevant' : l} className={'kr-v ' + v + (svar[p.id] === v ? ' on' : '')} onClick={() => setSvar({ ...svar, [p.id]: v })}>{l}</button>)}</div>
    </div>)}</div>
    {avP.length > 0 && !f0?.avvikIds?.length && <div className="note" style={{ marginTop: 10, color: 'var(--ink)' }}>
      <b>Avvik registreres på komponenten</b>{k.pos?.tegningId ? ' og plasseres der den står på tegningen' : ''}.
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '8px 0' }}><span className="small">Alvorlighet</span>
        <select value={alv} onChange={e => setAlv(e.target.value)}>{AV_ALV.map(a => <option key={a}>{a}</option>)}</select></div>
      <BildeVelger filer={bilder} set={setBilder} /></div>}
    <div className="fld" style={{ marginTop: 10 }}><label>Kommentar (valgfritt)</label><textarea rows={2} value={komm} onChange={e => setKomm(e.target.value)} /></div>
    <div className="fld"><label>Kontrollert av</label><input value={av} onChange={e => setAv(e.target.value)} /></div>
  </ModalFrame>;
}

/** Kort oppsummering av runden for utkvitteringsskjemaet og historikken. */
export function RundeOppsummering({ r, K }: { r: Runde; K?: Rec[] }) {
  const ids = Object.keys(r.kp || {}); const KK = K || ids.map(i => byId('komponenter', i)).filter(Boolean) as Rec[];
  const st = rundeStatus(r, KK.length ? KK : ids.map(id => ({ id })));
  const [vis, setVis] = useState(false);
  return <div className="note" style={{ color: 'var(--ink)' }}>
    <b>Komponentvis sjekkliste:</b> {st.ok} OK · {st.avvik} med avvik{st.igjen > 0 ? ` · ${st.igjen} ikke kontrollert` : ''} <a href="#" className="small" onClick={e => { e.preventDefault(); setVis(!vis); }}>{vis ? 'skjul' : 'vis detaljer'}</a>
    {vis && <table className="small" style={{ marginTop: 6, width: '100%' }}><tbody>{(KK.length ? KK : ids.map(i => ({ id: i }))).map((k: Rec) => { const s = r.kp[k.id]; const m = malIRunde(r, k.id);
      return <tr key={k.id}><td style={{ whiteSpace: 'nowrap', paddingRight: 8 }}>{k.kode ? kLabel(k) : (kNavn(k.id) || 'Slettet komponent')}</td>
        <td>{!s ? <span className="muted">Ikke kontrollert</span> : harAvvik(s) ? <span style={{ color: 'var(--amber)' }}>Avvik: {(s.avvik || []).join('; ') || m.punkter.filter(p => s.svar[p.id] === 'avvik').map(p => p.t).join('; ')}</span> : 'OK'}
          {s?.komm ? <span className="muted"> – {s.komm}</span> : null}</td>
        <td className="muted" style={{ whiteSpace: 'nowrap' }}>{s ? `${fd(s.t.slice(0, 10))}${s.av ? ' · ' + s.av : ''}${s.firma ? ' (' + s.firma + ')' : ''}` : ''}</td></tr>; })}</tbody></table>}
  </div>;
}
