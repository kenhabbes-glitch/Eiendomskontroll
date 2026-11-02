// Arbeidsordre for kontroller/service: send til servicefirma (manuelt eller automatisk før frist),
// lenke uten innlogging der firmaet registrerer utført og laster opp rapport, og godkjenning hos eier.
import React, { useEffect, useState } from 'react';
import { S, aoApi, canEdit, kanDrifteE, sb, toast, useStore } from '../lib/store';
import { addDays, byId, fd, today, type Rec } from '../lib/utils';
import { Chip, FileLink, openModal, confirmBox } from '../components/ui';
import { Hjelp } from '../components/Hjelp';
import { KoPanelRef, utfor } from '../lib/actions';
import { save } from '../lib/store';

const gyldig = (e?: string) => /^\S+@\S+\.\S+$/.test(String(e || '').trim());
export const koMottaker = (o: Rec) => String(o.ao?.epost || byId('anlegg', o.anleggId)?.leverandorEpost || '').trim();
export const koSendesDato = (o: Rec) => o.ao?.auto && o.nesteFrist ? addDays(o.nesteFrist, -(+o.ao.dager || 0)) : '';
export const koSendtForFrist = (o: Rec) => !!o.aoSendt && o.aoSendt.frist === o.nesteFrist;

// ---------- Panel i kontrollvisningen
function KoPanel({ o, close }: { o: Rec; close: () => void }) {
  useStore(); o = byId('oppgaver', o.id) || o;
  const r = o.innrapport; const kan = kanDrifteE(o.eiendomId); const mott = koMottaker(o); const sd = koSendesDato(o);
  if (!kan && !r) return null;
  return <div style={{ marginTop: 16 }}>
    {r && <div className="note" style={{ color: 'var(--ink)', borderColor: 'var(--blue, #2f6fb5)', marginBottom: 10 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}><Chip c="blue">Til godkjenning</Chip><b>Rapport fra servicefirma</b><span className="grow" /><span className="small muted">mottatt {fd(r.mottatt)}</span></div>
      <div className="small">Utført <b>{fd(r.dato)}</b> av {r.av || r.epost}{r.firma ? ` (${r.firma})` : ''} · <b>{r.res}</b>{r.nesteDato ? ` · foreslått neste: ${fd(r.nesteDato)}` : ''}</div>
      {r.komm && <div className="small" style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{r.komm}</div>}
      {r.avvik?.length > 0 && <div className="small" style={{ marginTop: 4 }}><b>Avvik:</b><ul style={{ margin: '2px 0 0 18px', padding: 0 }}>{r.avvik.map((a: string, i: number) => <li key={i}>{a}</li>)}</ul></div>}
      {r.filer?.length > 0 && <div className="small" style={{ marginTop: 4 }}>{r.filer.map((f: any) => <div key={f.path}><FileLink fil={f} /></div>)}</div>}
      {kan && <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button className="btn sm pri" onClick={() => { close(); utfor(o.id, { dato: r.dato, av: r.av + (r.firma ? ` (${r.firma})` : ''), res: r.res, komm: r.komm, avs: r.avvik, nyFrist: r.nesteDato, filer: r.filer, kilde: 'servicefirma' }); }}>Godkjenn og registrer utført</button>
        <button className="btn sm" onClick={async () => { if (!await confirmBox('Avvise rapporten? Den fjernes fra kontrollen (filene beholdes). Send gjerne en ny arbeidsordre etterpå.', 'Avvis')) return; const n = { ...byId('oppgaver', o.id)! }; delete n.innrapport; await save('oppgaver', n); toast('Rapporten er avvist'); }}>Avvis</button></div>}
    </div>}
    {kan && <div className="small" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <b>Arbeidsordre<Hjelp id="ko.arbeidsordre" size={14} /></b>
      <span className="muted">{o.aoSendt ? <>Sendt {fd(o.aoSendt.dato)} til {o.aoSendt.til}{o.aoSendt.auto ? ' (automatisk)' : ''}{o.aoSendt.frist !== o.nesteFrist ? ' – for forrige frist' : ''}. </> : null}
        {o.ao?.auto ? (koSendtForFrist(o) ? 'Automatisk sending er aktiv for neste frist.' : gyldig(o.ao.epost) ? <>Sendes automatisk {fd(sd < today() ? today() : sd)} til {o.ao.epost}.</> : 'Automatisk sending mangler e-post.') : !o.aoSendt ? 'Ikke sendt.' : ''}</span>
      <span className="grow" /><button className="btn sm" onClick={() => sendKo(o.id)}>✉ Send arbeidsordre{mott ? '' : ' …'}</button></div>}
  </div>;
}
KoPanelRef.C = KoPanel;

// ---------- Send manuelt
export function sendKo(id: string) { openModal({ render: close => <SendKo id={id} close={close} /> }); }
function SendKo({ id, close }: { id: string; close: () => void }) {
  const o = byId('oppgaver', id)!;
  const [ep, setEp] = useState(koMottaker(o)); const [m, setM] = useState(o.ao?.melding || ''); const [busy, setBusy] = useState(false); const [res, setRes] = useState<any>(null); const [husk, setHusk] = useState(!o.ao?.epost);
  const send = async () => {
    setBusy(true);
    try {
      if (husk && ep.trim() !== (o.ao?.epost || '')) await save('oppgaver', { ...byId('oppgaver', id)!, ao: { ...(o.ao || {}), epost: ep.trim() } });
      const r = await aoApi({ action: 'ko_send', oppgave_id: id, epost: ep.trim(), melding: m, lenkeBase: location.origin }); setRes(r); if (r.sendt) toast('Arbeidsordren er sendt til ' + r.til);
    } catch (e: any) { toast(e.message || 'Feil'); }
    setBusy(false);
  };
  const inp = { border: '1px solid var(--line2)', borderRadius: 8, padding: '7px 10px', width: '100%' } as any;
  const mailto = res && !res.sendt ? `mailto:${encodeURIComponent(res.til)}?subject=${encodeURIComponent(res.emne)}&body=${encodeURIComponent(res.tekst)}` : '';
  return <>
    <div className="mh"><h2>Send arbeidsordre – {o.navn}</h2><button className="btn ghost sm" onClick={close}>✕</button></div>
    <div className="mb">{!res ? <>
      <p className="small" style={{ marginTop: 0 }}>Servicefirmaet får oppdraget med eiendom, system, frist, grunnlag og sjekkpunkter, og en lenke der de registrerer utført og laster opp servicerapporten – uten å opprette bruker. Du godkjenner rapporten før kontrollen registreres som utført.</p>
      <div className="form"><div className="fld"><label>Til (e-post)</label><input style={inp} type="email" value={ep} onChange={e => setEp(e.target.value)} placeholder="service@firma.no" /></div>
        <div className="fld"><label>Melding (valgfritt)</label><textarea style={{ ...inp, minHeight: 80 }} value={m} onChange={e => setM(e.target.value)} placeholder="F.eks. Avtal tidspunkt med driftsleder. Nøkkel i resepsjonen." /></div></div>
      <label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={husk} onChange={e => setHusk(e.target.checked)} />Husk mottakeren på kontrollen</label>
      <p className="small muted">Frist i arbeidsordren: {fd(o.nesteFrist)}. Automatisk sending før hver frist slår du på under «Rediger».</p>
    </> : res.sendt ? <div className="note">Arbeidsordren er sendt til <b>{res.til}</b> og ført i hendelsesloggen.</div>
      : <div className="note small" style={{ color: 'var(--ink)' }}><b>E-post er ikke satt opp for organisasjonen ennå</b> (Administrasjon → Innstillinger). Arbeidsordren og lenken er laget – åpne den i ditt eget e-postprogram:<br /><br />
        <a className="btn pri" href={mailto}>Åpne i e-postprogram</a><div style={{ marginTop: 10 }}>Lenke: <span className="mono" style={{ wordBreak: 'break-all' }}>{res.lenke}</span></div><div className="muted" style={{ marginTop: 6 }}>{res.grunn}</div></div>}
    </div>
    <div className="mf"><button className="btn" onClick={close}>{res ? 'Lukk' : 'Avbryt'}</button>{!res && <button className="btn pri" disabled={busy || !gyldig(ep)} onClick={send}>{busy ? 'Sender …' : 'Send'}</button>}</div>
  </>;
}

// ---------- Lenke til servicefirmaet (#/ko/<token>) – ingen innlogging
export function KoLenke({ token }: { token: string }) {
  const [info, setInfo] = useState<any>(null); const [err, setErr] = useState(''); const [ferdig, setFerdig] = useState(false); const [busy, setBusy] = useState(false);
  const [f, setF] = useState<any>({ dato: today(), av: '', firma: '', res: 'OK – ingen avvik', komm: '', avvik: [''], nesteDato: '' }); const [filer, setFiler] = useState<File[]>([]);
  useEffect(() => { aoApi({ action: 'ko_info', token }, false).then(i => { setInfo(i); if (i.innsendt) setFerdig(true); }).catch(e => setErr(e.message)); }, [token]);
  const set = (p: any) => setF((x: any) => ({ ...x, ...p }));
  const sendInn = async (e: React.FormEvent) => {
    e.preventDefault(); if (!f.av.trim()) return setErr('Skriv hvem som utførte jobben');
    if (f.res === 'Avvik funnet' && !f.avvik.some((a: string) => a.trim())) return setErr('Beskriv avvikene – ett per linje');
    if (filer.some(x => x.size > 50e6)) return setErr('Hver fil kan være maks 50 MB');
    setBusy(true); setErr('');
    try {
      const opp: any[] = [];
      for (const fil of filer) {
        const u = await aoApi({ action: 'ko_opplasting', token, navn: fil.name }, false);
        const { error } = await sb.storage.from('filer').uploadToSignedUrl(u.path, u.token, fil, { contentType: fil.type || 'application/octet-stream' });
        if (error) throw new Error('Opplasting feilet for ' + fil.name + ': ' + error.message);
        opp.push({ path: u.path, navn: fil.name, type: fil.type, str: fil.size });
      }
      await aoApi({ action: 'ko_innsend', token, ...f, avvik: f.res === 'Avvik funnet' ? f.avvik : [], filer: opp }, false); setFerdig(true);
    } catch (e: any) { setErr(e.message || String(e)); }
    setBusy(false);
  };
  const inp = { width: '100%' } as any;
  return <div className="login"><div className="card" style={{ maxWidth: 560 }}>
    <p className="small" style={{ color: 'var(--accent, #1f6f5c)', fontWeight: 700, margin: 0 }}>ARBEIDSORDRE{info?.type ? ' – ' + String(info.type).toUpperCase() : ''}</p>
    {err && !info ? <><h1>Lenken virker ikke</h1><p>{err}</p></>
      : !info ? <p>Henter arbeidsordren …</p>
      : <>
        <h1 style={{ marginBottom: 4 }}>{info.navn}</h1>
        <p className="muted" style={{ marginTop: 0 }}>{[info.eiendom, info.adresse].filter(Boolean).join(', ')}</p>
        <dl className="dl small">{([['System', info.system], ['Frist', info.frist ? fd(info.frist) : ''], ['Grunnlag', info.hjemmel], ['Kontakt', info.kontakt], ['Oppdragsgiver', info.oppdragsgiver]] as [string, string][]).filter(x => x[1]).map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}</dl>
        {info.notat && <div className="note small" style={{ whiteSpace: 'pre-wrap', color: 'var(--ink)' }}><b>Sjekkpunkter / merknader</b><br />{info.notat}</div>}
        {ferdig ? <div className="note" style={{ marginTop: 14 }}><b>Takk – rapporten er sendt inn.</b><br /><span className="small">Oppdragsgiver går gjennom den og registrerer kontrollen som utført. Lenken kan ikke brukes på nytt; ta kontakt med oppdragsgiver ved behov for endringer.</span></div>
        : <form onSubmit={sendInn} style={{ marginTop: 14 }}>
          {info.utdatert && <p className="small" style={{ color: 'var(--amber)' }}>Merk: Fristen er endret siden arbeidsordren ble sendt. Rapporten kan likevel sendes inn.</p>}
          <h3 style={{ margin: '4px 0 6px' }}>Registrer utført</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
            <div><label>Utført dato</label><input type="date" value={f.dato} max={today()} onChange={e => set({ dato: e.target.value })} required style={inp} /></div>
            <div><label>Resultat</label><select value={f.res} onChange={e => set({ res: e.target.value })} style={{ ...inp, border: '1px solid var(--line2)', borderRadius: 8, padding: '9px 10px', background: '#fff', marginTop: 0 }}>{['OK – ingen avvik', 'Avvik funnet', 'Ikke utført / utsatt'].map(x => <option key={x}>{x}</option>)}</select></div>
            <div><label>Utført av (navn)</label><input value={f.av} onChange={e => set({ av: e.target.value })} required style={inp} /></div>
            <div><label>Firma</label><input value={f.firma} onChange={e => set({ firma: e.target.value })} style={inp} /></div>
          </div>
          {f.res === 'Avvik funnet' && <><label>Avvik – ett per linje</label>{f.avvik.map((a: string, i: number) => <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4 }}><input value={a} onChange={e => set({ avvik: f.avvik.map((x: string, j: number) => j === i ? e.target.value : x) })} placeholder={`Avvik ${i + 1}`} style={inp} />{f.avvik.length > 1 && <button type="button" className="btn ghost sm" onClick={() => set({ avvik: f.avvik.filter((_: any, j: number) => j !== i) })}>✕</button>}</div>)}
            <div><button type="button" className="btn sm" onClick={() => set({ avvik: [...f.avvik, ''] })}>+ Legg til avvik</button></div></>}
          <label>Kommentar</label><textarea value={f.komm} onChange={e => set({ komm: e.target.value })} style={{ ...inp, minHeight: 70 }} placeholder="Utført arbeid, målinger, byttet filter, anbefalinger …" />
          <label>Anbefalt dato for neste service (valgfritt)</label><input type="date" value={f.nesteDato} onChange={e => set({ nesteDato: e.target.value })} style={inp} />
          <label>Servicerapport, sjekkliste og bilder</label><input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.heic,.webp,.doc,.docx,.xls,.xlsx,.txt,.csv" onChange={e => setFiler(Array.from(e.target.files || []))} />
          {filer.length > 0 && <div className="small muted">{filer.length} fil(er) valgt</div>}
          {err && <p style={{ color: 'var(--red)' }}>{err}</p>}
          <button className="btn pri" disabled={busy} style={{ width: '100%', marginTop: 14 }}>{busy ? 'Sender inn …' : 'Send inn rapport'}</button>
          <p className="small muted" style={{ textAlign: 'center' }}>Ingen innlogging nødvendig. Oppdragsgiver godkjenner rapporten.</p>
        </form>}
      </>}
  </div></div>;
}

// Kontroller med rapport som venter på godkjenning (til oversikten)
export const koTilGodkjenning = () => S.oppgaver.filter(o => o.innrapport && o.aktiv !== false && canEdit());
