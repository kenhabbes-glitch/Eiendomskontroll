import React, { useEffect, useState } from 'react';
import { Hjelp } from '../components/Hjelp';
import { AV_LUKKET } from '../lib/catalog';
import { S, aoApi, canEdit, fileUrl, isStaff, isUtforer, loadData, loadMe, sb, state, toast, useStore } from '../lib/store';
import { byId, fd, sortBy, type Rec } from '../lib/utils';
import { AlvChip, DueChip, Empty, FileLink, StChip, openModal } from '../components/ui';
import { AoKart, HendelseListe, hendelseTekst, lastNedAoPdf, lastOppAo, sendAo, settStatus, tildeltNavn } from '../lib/arbeidsordre';
import { editAvvik } from '../lib/actions';
import { PersonvernBekreft, PERSONVERN_VERSJON } from '../components/Personvern';
import { Sel, useFilter } from './common';

const aktiv = (a: Rec) => !AV_LUKKET.includes(a.status);
export const mineAo = () => S.avvik.filter(a => a.tildeltId === state.me?.id && aktiv(a) && a.status !== 'Utført – til kontroll');

// ---------------- Liste
export function ArbeidsordreListe({ id }: { id?: string }) {
  useStore();
  const [f, setF] = useFilter('ao', { v: 'mine', st: 'aktive' });
  if (id) return <AoDetalj id={id} />;
  const staff = isStaff();
  let L = S.avvik.filter(a => f.v === 'alle' && staff ? !!a.tildeltId : a.tildeltId === state.me?.id);
  if (f.st === 'aktive') L = L.filter(a => aktiv(a)); else if (f.st === 'utfort') L = L.filter(a => a.status === 'Utført – til kontroll'); else if (f.st === 'lukket') L = L.filter(a => !aktiv(a));
  const ord: Record<string, number> = { Kritisk: 0, 'Høy': 1, Middels: 2, Lav: 3 };
  L = L.slice().sort((a, b) => (+(a.status === 'Utført – til kontroll') - +(b.status === 'Utført – til kontroll')) || (ord[a.alv] - ord[b.alv]) || String(a.frist || '9').localeCompare(String(b.frist || '9')));
  return <>
    <div className="head"><div className="grow"><h1>{f.v === 'alle' && staff ? 'Tildelte arbeidsordre' : 'Mine arbeidsordre'}<Hjelp id="side.arbeidsordre" /></h1><p className="sub">Avvik som er tildelt {f.v === 'alle' && staff ? 'brukere' : 'deg'}. Åpne en arbeidsordre for å se plassering, starte jobben, laste opp bilder og kvittere ut.</p></div></div>
    <div className="toolbar">{staff && <Sel value={f.v} onChange={v => setF({ v })} opts={[['mine', 'Tildelt meg'], ['alle', 'Alle tildelte']]} />}
      <Sel value={f.st} onChange={st => setF({ st })} opts={[['aktive', 'Aktive'], ['utfort', 'Utført – til kontroll'], ['lukket', 'Lukket'], ['alle', 'Alle']]} /><span className="small muted">{L.length} arbeidsordre</span>
      {'Notification' in window && Notification.permission === 'default' && <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => Notification.requestPermission()}>Slå på varsler i nettleseren</button>}</div>
    {L.length ? <div className="aolist">{L.map(a => <a key={a.id} className="card aocard" href={'#/arbeidsordre/' + a.id}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}><span className="mono muted">#{a.nr}</span><b style={{ flex: 1 }}>{a.tittel}</b><AlvChip a={a.alv} /></div>
      <div className="small muted" style={{ margin: '4px 0' }}>{[a.ao?.eiendom || byId('eiendommer', a.eiendomId)?.navn, a.ao?.system, a.ao?.tegning].filter(Boolean).join(' · ')}</div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}><StChip s={a.status} />{aktiv(a) && a.frist && <DueChip s={a.frist} />}{f.v === 'alle' && <span className="small muted">→ {tildeltNavn(a.tildeltId) || 'ekstern'}</span>}{a.pos && <span className="small muted">▲ på tegning</span>}{(a.vedlegg || []).length > 0 && <span className="small muted">📎 {(a.vedlegg || []).length}</span>}</div>
    </a>)}</div> : <div className="card"><Empty t="Ingen arbeidsordre">{isUtforer() ? 'Du har ingen arbeidsordre akkurat nå.' : 'Tildel et avvik fra avviksskjemaet, eller send det på e-post.'}</Empty></div>}
  </>;
}

// ---------------- Detalj
function AoDetalj({ id }: { id: string }) {
  useStore(); const a = byId('avvik', id);
  if (!a) return <><a href="#/arbeidsordre" className="small">← Arbeidsordre</a><div className="card" style={{ marginTop: 10 }}><Empty t="Fant ikke arbeidsordren">Den kan være lukket, slettet eller tildelt en annen.</Empty></div></>;
  const meg = a.tildeltId === state.me?.id; const staff = isStaff(); const kan = meg || staff;
  const start = () => settStatus(id, 'Under utbedring', 'Arbeid startet', { startet: new Date().toISOString() });
  return <>
    <a href="#/arbeidsordre" className="small">← Arbeidsordre</a>
    <div className="head" style={{ marginTop: 6 }}><div className="grow"><p className="small muted" style={{ margin: 0 }}>ARBEIDSORDRE · AVVIK #{a.nr}</p><h1 style={{ marginTop: 2 }}>{a.tittel}</h1>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><AlvChip a={a.alv} /><StChip s={a.status} />{aktiv(a) && a.frist && <DueChip s={a.frist} />}</div></div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><button className="btn" onClick={() => lastNedAoPdf(id)}>PDF</button>{canEdit() && <button className="btn" onClick={() => editAvvik(id)}>Rediger avvik</button>}{staff && <button className="btn" onClick={() => sendAo(id)}>Send på e-post</button>}</div></div>
    <div className="grid g2" style={{ gap: 16, alignItems: 'start' }}>
      <div>
        <div className="card"><h2 style={{ marginTop: 0 }}>Lokasjon</h2>
          <table className="small" style={{ width: 'auto', marginBottom: 10 }}><tbody>{[['Eiendom', [a.ao?.eiendom || byId('eiendommer', a.eiendomId)?.navn, a.ao?.adresse].filter(Boolean).join(', ')], ['System', a.ao?.system], ['Komponent', a.ao?.komponent], ['Plassering', [a.ao?.tegning, a.ao?.plassering].filter(Boolean).join(' – ')]].filter(r => r[1]).map(r => <tr key={r[0]}><td className="muted" style={{ paddingRight: 14 }}>{r[0]}</td><td>{r[1]}</td></tr>)}</tbody></table>
          <AoKart a={a} /></div>
        {a.beskrivelse && <div className="card" style={{ marginTop: 12 }}><h2 style={{ marginTop: 0 }}>Beskrivelse og tiltak</h2><p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{a.beskrivelse}</p></div>}
      </div>
      <div>
        <div className="card"><h2 style={{ marginTop: 0 }}>Utførelse</h2>
          <p className="small muted" style={{ marginTop: 0 }}>Tildelt: <b style={{ color: 'var(--ink)' }}>{tildeltNavn(a.tildeltId) || (a.tildeltId ? 'ekstern bruker' : 'ingen')}</b>{a.startet && <> · startet {new Date(a.startet).toLocaleString('nb-NO', { dateStyle: 'short', timeStyle: 'short' })}</>}</p>
          {kan && aktiv(a) && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {!['Under utbedring', 'Utført – til kontroll'].includes(a.status) && <button className="btn" onClick={start}>Start arbeid</button>}
            {a.status !== 'Utført – til kontroll' && <button className="btn pri" onClick={() => kvitter(id)}>Kvitter ut – utført</button>}
            <label className="btn">Last opp filer<input type="file" multiple accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx" style={{ display: 'none' }} onChange={e => { if (e.target.files?.length) lastOppAo(id, e.target.files); e.target.value = ''; }} /></label>
            <label className="btn">Ta bilde<input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => { if (e.target.files?.length) lastOppAo(id, e.target.files); e.target.value = ''; }} /></label>
            <button className="btn" onClick={() => kommentar(id)}>Kommentar</button></div>}
          {a.status === 'Utført – til kontroll' && <div className="note small" style={{ marginTop: 10, color: 'var(--ink)' }}>Kvittert utført {a.utfort ? new Date(a.utfort.t).toLocaleString('nb-NO', { dateStyle: 'short', timeStyle: 'short' }) + ' av ' + a.utfort.av : ''}. Venter på kontroll fra eier/driftsleder.{a.utfort?.komm ? <><br />«{a.utfort.komm}»</> : null}
            {canEdit() && <div style={{ marginTop: 8 }}><button className="btn sm pri" onClick={() => settStatus(id, 'Rettet', 'Utført arbeid kontrollert og godkjent', { lukket: new Date().toISOString().slice(0, 10) })}>Godkjenn og lukk</button>{' '}<button className="btn sm" onClick={() => { const k = prompt('Hva mangler?'); if (k) settStatus(id, 'Under utbedring', 'Sendt tilbake: ' + k); }}>Send tilbake</button></div>}</div>}
          {!aktiv(a) && <p className="small">Avviket er {a.status.toLowerCase()}{a.lukket ? ' ' + fd(a.lukket) : ''}.</p>}
          <h3>Bilder og dokumentasjon</h3>
          {(a.vedlegg || []).length ? <Vedlegg list={a.vedlegg} /> : <p className="small muted">Ingen filer ennå.</p>}
        </div>
        <div className="card" style={{ marginTop: 12 }}><h2 style={{ marginTop: 0 }}>Logg</h2>
          {(a.logg || []).length ? <div className="log">{a.logg.slice().reverse().map((l: any, i: number) => <div key={i}><span className="lt">{new Date(l.t).toLocaleString('nb-NO', { dateStyle: 'short', timeStyle: 'short' })}{l.av ? ' · ' + l.av : ''}</span> · {l.k}</div>)}</div> : <p className="small muted">Ingen hendelser.</p>}
          <details style={{ marginTop: 10 }}><summary className="small">Full endringslogg fra databasen</summary><div style={{ marginTop: 8 }}><HendelseListe radId={id} /></div></details>
        </div>
      </div>
    </div>
  </>;
}
function Vedlegg({ list }: { list: any[] }) {
  return <div className="vedlegg">{list.map((f, i) => <div key={i} className="vd">{/^image\//.test(f.type || '') || /\.(jpe?g|png|webp|gif|heic)$/i.test(f.navn || '') ? <Bilde f={f} /> : <span className="ikon">📄</span>}<FileLink fil={f} /></div>)}</div>;
}
function Bilde({ f }: { f: any }) { const [u, setU] = useState(''); useEffect(() => { let on = true; fileUrl(f.path).then(x => on && setU(x)); return () => { on = false; }; }, [f.path]); return u ? <a href={u} target="_blank" rel="noopener noreferrer"><img src={u} alt="" /></a> : <span className="ikon">🖼</span>; }

function kvitter(id: string) {
  openModal({ render: close => <KvitterBody id={id} close={close} /> });
}
function KvitterBody({ id, close }: { id: string; close: () => void }) {
  const [k, setK] = useState(''); const [fs, setFs] = useState<File[]>([]); const [busy, setBusy] = useState(false);
  const ok = async () => {
    if (!k.trim()) { toast('Skriv kort hva som er gjort'); return; } setBusy(true);
    try { if (fs.length) await lastOppAo(id, fs); await settStatus(id, 'Utført – til kontroll', 'Kvittert utført: ' + k.trim(), { utfort: { t: new Date().toISOString(), av: state.me?.navn || state.me?.epost, komm: k.trim() } }); toast('Kvittert ut – takk!'); close(); } catch { }
    setBusy(false);
  };
  return <><div className="mh"><h2>Kvitter ut arbeidsordre</h2><button className="btn ghost sm" onClick={close}>✕</button></div>
    <div className="mb"><div className="form"><div className="fld"><label>Hva er gjort?</label><textarea value={k} onChange={e => setK(e.target.value)} style={{ minHeight: 100, border: '1px solid var(--line2)', borderRadius: 8, padding: 8, width: '100%' }} placeholder="F.eks. Byttet defekt armatur i trapperom, testet ok." /></div>
      <div className="fld"><label>Bilder / dokumentasjon (valgfritt)</label><input type="file" multiple accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx" onChange={e => setFs(Array.from(e.target.files || []))} /></div></div>
      <p className="small muted">Avviket settes til «Utført – til kontroll», og eier/driftsleder kontrollerer og lukker det.</p></div>
    <div className="mf"><button className="btn" onClick={close}>Avbryt</button><button className="btn pri" disabled={busy} onClick={ok}>{busy ? 'Lagrer …' : 'Kvitter ut'}</button></div></>;
}
function kommentar(id: string) {
  const k = prompt('Kommentar til arbeidsordren'); if (!k) return;
  const a = byId('avvik', id)!; settStatus(id, a.status, 'Kommentar: ' + k);
}

// ---------------- Lenke fra e-post (#/ao/<token>)
export function AoLenke({ token }: { token: string }) {
  useStore();
  const [info, setInfo] = useState<any>(null); const [err, setErr] = useState(''); const [modus, setModus] = useState<'kvitter' | 'reg' | 'login'>('kvitter');
  const [sam, setSam] = useState(false); const [komm, setKomm] = useState(''); const [filer, setFiler] = useState<File[]>([]); const [ferdig, setFerdig] = useState(false);
  const [navn, setNavn] = useState(''); const [firma, setFirma] = useState(''); const [pw, setPw] = useState(''); const [pw2, setPw2] = useState(''); const [busy, setBusy] = useState(false);
  const inne = !!state.me;
  useEffect(() => { (async () => {
    try {
      if (inne) { const r = await aoApi({ action: 'aksepter', token }); await loadMe(); await loadData(); location.hash = '#/arbeidsordre/' + r.avvik_id; return; }
      const i = await aoApi({ action: 'info', token }, false); setInfo(i); if (i.brukt) setModus('login'); if (i.kvittert) setFerdig(true);
    } catch (e: any) { setErr(e.message); }
  })(); }, [inne]);
  const kvitter = async (e: React.FormEvent) => {
    e.preventDefault(); if (!navn.trim()) return setErr('Skriv navnet ditt'); if (!komm.trim()) return setErr('Beskriv hva som er gjort'); if (!sam) return setErr('Du må godta personvernerklæringen');
    if (filer.some(x => x.size > 50e6)) return setErr('Hver fil kan være maks 50 MB');
    setBusy(true); setErr('');
    try {
      const opp: any[] = [];
      for (const fil of filer) { const u = await aoApi({ action: 'ao_opplasting', token, navn: fil.name }, false); const { error } = await sb.storage.from('filer').uploadToSignedUrl(u.path, u.token, fil, { contentType: fil.type || 'application/octet-stream' }); if (error) throw new Error('Opplasting feilet for ' + fil.name + ': ' + error.message); opp.push({ path: u.path, navn: fil.name, type: fil.type, str: fil.size }); }
      await aoApi({ action: 'ao_kvitter', token, navn, firma, komm, filer: opp, samtykke: true, personvernVersjon: PERSONVERN_VERSJON }, false); setFerdig(true);
    } catch (e: any) { setErr(e.message); } setBusy(false);
  };
  const registrer = async (e: React.FormEvent) => {
    e.preventDefault(); if (!sam) return setErr('Du må godta personvernerklæringen'); if (pw.length < 8) return setErr('Passordet må ha minst 8 tegn'); if (pw !== pw2) return setErr('Passordene er ikke like');
    setBusy(true); setErr('');
    try { await aoApi({ action: 'registrer', token, navn, firma, passord: pw, samtykke: true, personvernVersjon: PERSONVERN_VERSJON }, false); const { error } = await sb.auth.signInWithPassword({ email: info.epost, password: pw }); if (error) throw error; }
    catch (e: any) { setErr(e.message); } setBusy(false);
  };
  const logginn = async (e: React.FormEvent) => { e.preventDefault(); setBusy(true); setErr(''); const { error } = await sb.auth.signInWithPassword({ email: info.epost, password: pw }); if (error) setErr('Feil passord eller e-post'); setBusy(false); };
  const inp = { width: '100%' } as any;
  return <div className="login"><div className="card" style={{ maxWidth: 440 }}>
    <p className="small" style={{ color: 'var(--red)', fontWeight: 700, margin: 0 }}>ARBEIDSORDRE</p>
    {err && !info ? <><h1>Lenken virker ikke</h1><p>{err}</p><a href="#/">Gå til innlogging</a></>
      : !info ? <p>{inne ? 'Kobler arbeidsordren til brukeren din …' : 'Henter arbeidsordren …'}</p>
      : <>
        <h1 style={{ marginBottom: 4 }}>Avvik #{info.nr}: {info.tittel}</h1><p className="muted" style={{ marginTop: 0 }}>{[info.eiendom, info.adresse].filter(Boolean).join(', ')}</p>
        <dl className="dl small">{([['System', info.system], ['Komponent', info.komponent], ['Plassering', info.plassering], ['Alvorlighet', info.alv], ['Frist', info.frist ? fd(info.frist) : ''], ['Oppdragsgiver', info.oppdragsgiver]] as [string, string][]).filter(x => x[1]).map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}</dl>
        {info.beskrivelse && <div className="note small" style={{ whiteSpace: 'pre-wrap', color: 'var(--ink)' }}><b>Beskrivelse</b><br />{info.beskrivelse}</div>}
        {ferdig ? <div className="note" style={{ marginTop: 14 }}><b>Takk – arbeidsordren er kvittert ut.</b><br /><span className="small">Oppdragsgiver kontrollerer arbeidet og lukker avviket. Har du spørsmål, ta kontakt med oppdragsgiver.</span></div>
        : <><div className="tabs" style={{ margin: '14px 0 8px' }}>{([['kvitter', 'Kvitter ut uten bruker'], ...(info.finnes ? [] : [['reg', 'Opprett bruker']]), ['login', 'Logg inn']] as [string, string][]).map(([k, l]) => <a key={k} href="#" className={modus === k ? 'on' : ''} onClick={e => { e.preventDefault(); setModus(k as any); setErr(''); }}>{l}</a>)}</div>
        {modus === 'kvitter' ? <form onSubmit={kvitter}>
          <p className="small" style={{ marginTop: 0 }}>Kvitter ut jobben direkte, uten å opprette bruker. Lenken er personlig{info.utloper ? ` og gjelder til ${fd(info.utloper)}` : ''}.</p>
          <label>Navn</label><input value={navn} onChange={e => setNavn(e.target.value)} required style={inp} />
          <label>Firma</label><input value={firma} onChange={e => setFirma(e.target.value)} style={inp} />
          <label>Hva er gjort?</label><textarea value={komm} onChange={e => setKomm(e.target.value)} required style={{ ...inp, minHeight: 80 }} placeholder="Beskriv utbedringen, materialer, målinger …" />
          <label>Bilder og dokumentasjon</label><input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.heic,.webp,.doc,.docx,.xls,.xlsx,.txt" onChange={e => setFiler(Array.from(e.target.files || []))} />
          <PersonvernBekreft ok={sam} set={setSam} ansvarlig={info.oppdragsgiver} />
          {err && <p style={{ color: 'var(--red)' }}>{err}</p>}
          <button className="btn pri" disabled={busy || !sam} style={{ width: '100%', marginTop: 10 }}>{busy ? 'Sender …' : 'Kvitter ut – utført'}</button>
          <p className="small muted" style={{ textAlign: 'center' }}>Vil du se arbeidsordrene dine samlet og kunne følge dem opp senere? Velg «Opprett bruker».</p></form>
        : modus === 'reg' ? <form onSubmit={registrer}>
          <p className="small">Opprett en bruker for å se arbeidsordren med plassering på tegning, kvittere ut og laste opp bilder og dokumentasjon. Brukeren gir bare tilgang til arbeidsordre som er tildelt deg.</p>
          <label>E-post</label><input value={info.epost} readOnly style={inp} />
          <label>Navn</label><input value={navn} onChange={e => setNavn(e.target.value)} required style={inp} />
          <label>Firma (valgfritt)</label><input value={firma} onChange={e => setFirma(e.target.value)} style={inp} />
          <label>Velg passord (min. 8 tegn)</label><input type="password" value={pw} onChange={e => setPw(e.target.value)} style={inp} autoComplete="new-password" />
          <label>Gjenta passord</label><input type="password" value={pw2} onChange={e => setPw2(e.target.value)} style={inp} autoComplete="new-password" />
          <PersonvernBekreft ok={sam} set={setSam} ansvarlig={info.oppdragsgiver} />
          {err && <p style={{ color: 'var(--red)' }}>{err}</p>}
          <button className="btn pri" disabled={busy || !sam} style={{ width: '100%', marginTop: 10 }}>{busy ? 'Oppretter …' : 'Opprett bruker og åpne'}</button></form>
        : <form onSubmit={logginn}>
          <p className="small">{info.finnes ? 'Du har allerede en bruker. Logg inn for å åpne arbeidsordren.' : 'Logg inn for å åpne arbeidsordren.'}</p>
          <label>E-post</label><input value={info.epost} readOnly style={inp} />
          <label>Passord</label><input type="password" value={pw} onChange={e => setPw(e.target.value)} style={inp} autoComplete="current-password" />
          {err && <p style={{ color: 'var(--red)' }}>{err}</p>}
          <button className="btn pri" disabled={busy} style={{ width: '100%', marginTop: 12 }}>{busy ? 'Logger inn …' : 'Logg inn og åpne'}</button>
          </form>}</>}
      </>}
  </div></div>;
}

// ---------------- Hendelseslogg (admin/forvalter)
export function Hendelseslogg() {
  useStore();
  const [f, setF] = useFilter('hlogg', { e: '', t: '', q: '' }); const [L, setL] = useState<any[] | null>(null); const [n, setN] = useState(300);
  useEffect(() => { let on = true; (async () => {
    try { let q: any = sb.from('hendelseslogg').select('*').order('tid', { ascending: false }).limit(n); if (f.e) q = q.eq('eiendom_id', f.e); if (f.t) q = q.eq('tabell', f.t); const { data, error } = await q; if (error) throw error; if (on) setL(data || []); }
    catch { if (on) setL([]); } })(); return () => { on = false; }; }, [f.e, f.t, n]);
  const TAB: Record<string, string> = { eiendommer: 'Eiendom', leietakere: 'Leietaker', systemer: 'System', komponenter: 'Komponent', oppgaver: 'Kontroll', avvik: 'Avvik', dokumenter: 'Dokument', tegninger: 'Tegning', profiles: 'Bruker', hendelse: 'Hendelse' };
  let R = L || []; if (f.q) { const q = f.q.toLowerCase(); R = R.filter(h => JSON.stringify(h).toLowerCase().includes(q)); }
  return <>
    <div className="head"><div className="grow"><h1>Hendelseslogg<Hjelp id="side.logg" /></h1><p className="sub">Alle endringer i databasen logges automatisk med tid og bruker, i tillegg til hendelser som e-post sendt og PDF lastet ned.</p></div></div>
    <div className="toolbar"><input placeholder="Søk …" value={f.q} onChange={e => setF({ q: e.target.value })} style={{ border: '1px solid var(--line2)', borderRadius: 8, padding: '7px 10px', width: 220 }} />
      <Sel value={f.e} onChange={e => setF({ e })} opts={sortBy(S.eiendommer, e => e.navn).map(e => [e.id, e.navn] as [string, string])} empty="Alle eiendommer" />
      <Sel value={f.t} onChange={t => setF({ t })} opts={Object.entries(TAB)} empty="Alle typer" /><span className="small muted">{R.length} hendelser</span></div>
    {!L ? <p className="muted">Laster …</p> : R.length ? <div className="tbl-wrap"><table><thead><tr><th>Tid</th><th>Bruker</th><th>Type</th><th>Gjelder</th><th>Hendelse</th></tr></thead><tbody>
      {R.map(h => <tr key={h.id} className={h.tabell === 'avvik' || (h.tabell === 'hendelse' && byId('avvik', h.rad_id)) ? 'click' : ''} onClick={() => { if (byId('avvik', h.rad_id)) location.hash = '#/arbeidsordre/' + h.rad_id; }}>
        <td className="small" style={{ whiteSpace: 'nowrap' }}>{new Date(h.tid).toLocaleString('nb-NO', { dateStyle: 'short', timeStyle: 'medium' })}</td><td className="small">{h.bruker || <span className="muted">system</span>}</td>
        <td className="small">{TAB[h.tabell] || h.tabell}</td><td className="small">{h.tabell === 'avvik' && byId('avvik', h.rad_id) ? '#' + byId('avvik', h.rad_id)!.nr + ' ' : ''}{h.tabell !== 'hendelse' ? h.tekst : ''}{h.eiendom_id && byId('eiendommer', h.eiendom_id) && h.tabell !== 'eiendommer' ? <div className="muted">{byId('eiendommer', h.eiendom_id)!.navn}</div> : null}</td>
        <td className="small">{hTekst(h)}</td></tr>)}
    </tbody></table></div> : <div className="card"><Empty t="Ingen hendelser">Hendelsesloggen krever at 003_arbeidsordre.sql er kjørt i Supabase.</Empty></div>}
    {L && L.length >= n && <p><button className="btn" onClick={() => setN(n + 500)}>Vis flere</button></p>}
  </>;
}
const hTekst = (h: any) => hendelseTekst(h);
