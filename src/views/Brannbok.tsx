// Brannbok: eierens fane (forhåndsvisning, delingslenker, PDF, svar på merknader) og den åpne siden brannvesenet ser.
import React, { useEffect, useState } from 'react';
import { S, aoApi, canEdit, fileUrl, save, sb, state, toast, uploadFile, useStore, feiltekst } from '../lib/store';
import { byId, fd, addDays, today, sortBy, type Rec } from '../lib/utils';
import { tt } from '../lib/i18n';
import { Chip, Empty, confirmBox, formModal } from '../components/ui';
import { byggBrannbok, brannbokPdf, samletStatus, STATUS_TEKST, type Brannbok, type BbSek, type BbMerknad, type BbStatus } from '../lib/brannbok';
import { bv } from '../lib/brannvern';

const FARGE: Record<BbStatus, string> = { ok: 'green', folg: 'amber', mangler: 'red', info: 'blue' };
const PETROL = '#1E4D57', BRASS = '#C9A66B';
const nyttToken = () => { const b = new Uint8Array(24); crypto.getRandomValues(b); return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const lenkeUrl = (t: string) => `${location.origin}/#/bb/${t}`;
const lastNedBlob = (blob: Blob, navn: string) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = navn; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
const hentFil = async (path: string) => { const u = await fileUrl(path); if (!u) return null; const r = await fetch(u); return r.ok ? r.arrayBuffer() : null; };
const filnavn = (bb: Brannbok) => `Brannbok_${(bb.eiendom.navn || 'eiendom').replace(/[^A-Za-z0-9æøåÆØÅ]+/g, '_')}_${today()}.pdf`;
const sekTittel = (bb: Brannbok | undefined, key: string) => key === 'samlet' ? tt("Samlet merknad") : bb?.sek.find(s => s.key === key)?.tittel || key;

// ---------------------------------------------------------------- eier
export function BrannbokSeksjon({ eid }: { eid: string }) {
  useStore();
  const e = byId('eiendommer', eid)!; const ed = canEdit(); const bb = byggBrannbok(eid); const tot = samletStatus(bb);
  const [lenker, setLenker] = useState<Rec[]>([]); const [mk, setMk] = useState<Rec[]>([]); const [busy, setBusy] = useState(false);
  const last = async () => {
    const [a, b] = await Promise.all([sb.from('brannbok_lenker').select('*').eq('eiendom_id', eid).order('created_at', { ascending: false }), sb.from('brannbok_merknader').select('*').eq('eiendom_id', eid).order('created_at', { ascending: false })]);
    setLenker(a.data || []); setMk(b.data || []);
  };
  useEffect(() => { last(); }, [eid]);
  const innholdUt = (x: Brannbok) => JSON.parse(JSON.stringify(x));
  const pdfFor = async (x: Brannbok) => { const m: BbMerknad[] = []; const bytes = await brannbokPdf(x, { merknader: m, vedlegg: v => hentFil(v.path) }); return new Blob([bytes as any], { type: 'application/pdf' }); };

  const lastNedPdf = async () => { setBusy(true); try { const blob = await brannbokPdf(bb, { merknader: mk.map(toMk), vedlegg: v => hentFil(v.path) }); lastNedBlob(new Blob([blob as any], { type: 'application/pdf' }), filnavn(bb)); } catch (x: any) { toast(feiltekst(x)); } finally { setBusy(false); } };
  const lagreGjennomgang = () => formModal({ title: tt("Registrer årlig gjennomgang"), saveTxt: tt("Lagre"),
    top: <p className="small muted" style={{ marginTop: 0 }}>{tt("Eier skal gå gjennom brannsikkerheten jevnlig og dokumentere det (FOB § 9). Dette vises i brannboken.")}</p>,
    fields: [{ k: 'dato', label: tt("Dato"), type: 'date', def: today(), req: true, half: true }, { k: 'av', label: tt("Utført av"), def: state.me?.navn || '', req: true, half: true }, { k: 'merknad', label: tt("Funn og avtalte tiltak"), type: 'textarea' }],
    onSave: async v => { const b = bv(e); await save('eiendommer', { ...e, brannvern: { ...b, gjennomgang: [{ dato: v.dato, av: v.av, merknad: v.merknad || '' }, ...(b.gjennomgang || [])] } }); toast(tt("Gjennomgangen er registrert")); } });

  const nyLenke = () => formModal({ title: tt("Del brannboken med brannvesenet"), saveTxt: tt("Lag lenke"), wide: true,
    top: <p className="small muted" style={{ marginTop: 0 }}>{tt("Lenken viser brannboken slik den ser ut nå (et øyeblikksbilde) og krever ingen innlogging. Mottakeren kan lese, laste ned PDF og legge inn merknader. Du kan trekke lenken tilbake når som helst.")}</p>,
    values: { utloper: addDays(today(), 30), merknader: true },
    fields: [{ k: 'til', label: tt("Mottaker (navn / brannvesen)"), req: true, ph: tt("F.eks. Oslo brann- og redningsetat, brannforebyggende"), half: true }, { k: 'epost', label: tt("E-post (valgfritt – sender lenken nå)"), half: true },
      { k: 'utloper', label: tt("Lenken gjelder til"), type: 'date', half: true, req: true }, { k: 'merknader', label: tt("Brannvesenet kan legge inn merknader"), type: 'checkbox', half: true },
      { k: 'melding', label: tt("Melding til mottaker"), type: 'textarea', show: v => !!v.epost }],
    onSave: async v => {
      const x = innholdUt(byggBrannbok(eid)); const token = nyttToken(); let pdfPath = '';
      try { const f = await uploadFile(await pdfFor(x), eid, undefined, filnavn(x), 'brannbok'); pdfPath = f?.path || ''; } catch (err) { console.error(err); }
      const data = { til: v.til, epost: v.epost || '', utloper: v.utloper, merknader: !!v.merknader, opprettetAv: state.me?.navn || '', opprettetAvEpost: state.me?.epost || '', innhold: x, pdfPath, oppdatert: new Date().toISOString(), apnet: [], sendt: [] };
      const { data: rad, error } = await sb.from('brannbok_lenker').insert({ eiendom_id: eid, token, data }).select().single(); if (error) throw error;
      if (v.epost) { try { const r = await aoApi({ action: 'bb_send', lenke_id: rad.id, epost: v.epost, melding: v.melding || '', lenkeBase: location.origin }); toast(r.sendt ? tt("Lenken er sendt til {0}", v.epost) : tt("Lenken er laget (e-post ble ikke sendt – kopier lenken)")); } catch (err: any) { toast(feiltekst(err)); } } else toast(tt("Lenken er laget"));
      await last();
    } });
  const kopier = async (t: string) => { try { await navigator.clipboard.writeText(lenkeUrl(t)); toast(tt("Lenken er kopiert")); } catch { prompt(tt("Kopier lenken"), lenkeUrl(t)); } };
  const send = (l: Rec) => formModal({ title: tt("Send lenke til brannboken"), saveTxt: tt("Send"), fields: [{ k: 'epost', label: tt("E-post"), req: true, def: l.data?.epost || '' }, { k: 'melding', label: tt("Melding (valgfritt)"), type: 'textarea' }],
    onSave: async v => { const r = await aoApi({ action: 'bb_send', lenke_id: l.id, epost: v.epost, melding: v.melding || '', lenkeBase: location.origin }); toast(r.sendt ? tt("Lenken er sendt til {0}", v.epost) : tt("E-post ble ikke sendt – kopier lenken")); await last(); } });
  const oppdater = async (l: Rec) => { if (!await confirmBox(tt("Oppdatere brannboken på lenken med dagens data? Mottakeren ser da den nye versjonen. Merknadene beholdes."), tt("Oppdater"))) return; setBusy(true);
    try { const x = innholdUt(byggBrannbok(eid)); let pdfPath = l.data?.pdfPath || ''; try { const f = await uploadFile(await pdfFor(x), eid, undefined, filnavn(x), 'brannbok'); pdfPath = f?.path || pdfPath; } catch (err) { console.error(err); }
      const { error } = await sb.from('brannbok_lenker').update({ data: { ...l.data, innhold: x, pdfPath, oppdatert: new Date().toISOString() } }).eq('id', l.id); if (error) throw error; toast(tt("Lenken er oppdatert")); await last(); } catch (x: any) { toast(feiltekst(x)); } finally { setBusy(false); } };
  const trekk = async (l: Rec) => { if (!await confirmBox(tt("Trekke lenken tilbake? Mottakeren mister tilgangen."), tt("Trekk tilbake"))) return; await sb.from('brannbok_lenker').update({ data: { ...l.data, trukket: new Date().toISOString() } }).eq('id', l.id); await last(); };
  const svar = (m: Rec) => formModal({ title: tt("Svar på merknad"), saveTxt: tt("Lagre svar"), top: <div className="note small" style={{ color: 'var(--ink)' }}><b>{m.data?.navn}</b>{m.data?.etat ? ` (${m.data.etat})` : ''} – {sekTittel(bb, m.seksjon)}<div style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{m.data?.tekst}</div></div>,
    values: { svar: m.data?.svar || '' }, fields: [{ k: 'svar', label: tt("Svar / hva som er gjort"), type: 'textarea', req: true }],
    onSave: async v => { await sb.from('brannbok_merknader').update({ data: { ...m.data, svar: v.svar, svarAv: state.me?.navn || '', svarTid: new Date().toISOString(), status: m.data?.status === 'lukket' ? 'lukket' : 'besvart' } }).eq('id', m.id); await last(); } });
  const lukk = async (m: Rec) => { await sb.from('brannbok_merknader').update({ data: { ...m.data, status: 'lukket' } }).eq('id', m.id); await last(); };
  const slettMk = async (m: Rec) => { if (!await confirmBox(tt("Slette merknaden?"))) return; await sb.from('brannbok_merknader').delete().eq('id', m.id); await last(); };
  const aktive = lenker.filter(l => !l.data?.trukket); const nye = mk.filter(m => (m.data?.status || 'ny') === 'ny').length;

  return <>
    <div className="note small" style={{ color: 'var(--ink)', marginBottom: 12 }}>{tt("Brannboken samler eiers dokumentasjon av brannsikkerheten (forskrift om brannforebygging §§ 4–13) fra data som allerede finnes i systemet. Den kan deles med brannvesenet via en lenke, og lastes ned som PDF.")}</div>
    <div className="card"><div className="toolbar" style={{ marginBottom: 8 }}><h2 style={{ margin: 0, flex: 1 }}>{tt("Innhold og status")} <Chip c={FARGE[tot]}>{tt(STATUS_TEKST[tot])}</Chip></h2>
      <button className="btn sm" disabled={busy} onClick={lastNedPdf}>{busy ? tt("Lager PDF …") : tt("Last ned PDF")}</button>{ed && <button className="btn sm" onClick={lagreGjennomgang}>{tt("Registrer årlig gjennomgang")}</button>}</div>
      <div className="tbl-wrap"><table><thead><tr><th>{tt("Kapittel")}</th><th>{tt("Hjemmel")}</th><th>{tt("Status")}</th><th>{tt("Kommentar")}</th></tr></thead><tbody>
        {bb.sek.map((s, i) => <tr key={s.key}><td><b>{i + 1}. {s.tittel}</b></td><td className="small muted">{s.hjemmel}</td><td><Chip c={FARGE[s.status]}>{tt(STATUS_TEKST[s.status])}</Chip></td><td className="small">{s.statusTekst}</td></tr>)}</tbody></table></div>
      <p className="small muted" style={{ marginBottom: 0 }}>{tt("Kapitlene med status «Mangler» eller «Følg opp» bør rettes før brannvesenet får lenken. Rett opp i Brannvern, Kontroller, Avvik og Leietakere – brannboken oppdaterer seg selv.")}</p></div>
    <div className="sec"><div className="toolbar"><h2 style={{ margin: 0, flex: 1 }}>{tt("Lenker til brannvesenet")}</h2>{ed && <button className="btn pri" onClick={nyLenke}>{tt("+ Ny lenke")}</button>}</div>
      {lenker.length ? <div className="tbl-wrap"><table><thead><tr><th>{tt("Mottaker")}</th><th>{tt("Gjelder til")}</th><th>{tt("Åpnet")}</th><th>{tt("Sendt")}</th><th>{tt("Merknader")}</th><th /></tr></thead><tbody>
        {lenker.map(l => { const d = l.data || {}; const utl = d.utloper && d.utloper < today(); const ap = d.apnet || []; const n = mk.filter(m => m.lenke_id === l.id);
          return <tr key={l.id} style={d.trukket ? { opacity: .5 } : undefined}><td><b>{d.til}</b><div className="small muted">{tt("Laget")} {fd(l.created_at)}{d.oppdatert && d.oppdatert.slice(0, 10) !== l.created_at.slice(0, 10) ? ` · ${tt("oppdatert")} ${fd(d.oppdatert)}` : ''}</div></td>
            <td>{d.trukket ? <Chip c="">{tt("Trukket tilbake")}</Chip> : utl ? <Chip c="red">{tt("Utløpt")} {fd(d.utloper)}</Chip> : fd(d.utloper)}</td>
            <td className="small">{ap.length ? <>{ap.length} {tt("ganger")}<div className="muted">{tt("sist")} {fd(ap[ap.length - 1].tid)}</div></> : <span className="muted">{tt("Ikke åpnet")}</span>}</td>
            <td className="small">{(d.sendt || []).length ? (d.sendt as Rec[]).map((x, i) => <div key={i}>{x.til} <span className="muted">{fd(x.tid)}</span></div>) : '–'}</td>
            <td className="small">{d.merknader === false ? <span className="muted">{tt("Av")}</span> : n.length ? <>{n.length}{n.filter(m => (m.data?.status || 'ny') === 'ny').length > 0 && <> <Chip c="amber">{n.filter(m => (m.data?.status || 'ny') === 'ny').length} {tt("nye")}</Chip></>}</> : '0'}</td>
            <td style={{ whiteSpace: 'nowrap' }}>{!d.trukket && <><button className="btn sm" onClick={() => kopier(l.token)}>{tt("Kopier lenke")}</button>{ed && <> <button className="btn sm" onClick={() => send(l)}>{tt("Send")}</button> <button className="btn sm" disabled={busy} onClick={() => oppdater(l)}>{tt("Oppdater")}</button> <button className="btn sm ghost" onClick={() => trekk(l)}>{tt("Trekk tilbake")}</button></>}</>}</td></tr>; })}</tbody></table></div>
        : <Empty t={tt("Ingen lenker er laget ennå.")} />}</div>
    {mk.length > 0 && <div className="sec"><h2>{tt("Merknader fra brannvesenet")} {nye > 0 && <Chip c="amber">{nye} {tt("nye")}</Chip>}</h2>
      <div className="list">{sortBy(mk, m => m.created_at).reverse().map(m => { const d = m.data || {}; const st = d.status || 'ny';
        return <div key={m.id} className="li" style={{ cursor: 'default', alignItems: 'flex-start' }}><div className="grow"><div className="lt"><b>{sekTittel(bb, m.seksjon)}</b> <Chip c={st === 'ny' ? 'amber' : st === 'besvart' ? 'blue' : 'green'}>{tt(st === 'ny' ? 'Ny' : st === 'besvart' ? 'Besvart' : 'Lukket')}</Chip></div>
          <div style={{ whiteSpace: 'pre-wrap', margin: '4px 0' }}>{d.tekst}</div><div className="small muted">{d.navn}{d.etat ? ` (${d.etat})` : ''}{d.epost ? ` · ${d.epost}` : ''} · {fd(m.created_at)}</div>
          {d.svar && <div className="note small" style={{ color: 'var(--ink)', marginTop: 6, whiteSpace: 'pre-wrap' }}><b>{tt("Svar fra eier")}</b> ({d.svarAv}, {fd(d.svarTid)}): {d.svar}</div>}</div>
          {ed && <div style={{ display: 'flex', gap: 6 }}><button className="btn sm" onClick={() => svar(m)}>{tt("Svar")}</button>{st !== 'lukket' && <button className="btn sm" onClick={() => lukk(m)}>{tt("Lukk")}</button>}<button className="btn sm ghost" title={tt("Slett")} onClick={() => slettMk(m)}>✕</button></div>}</div>; })}</div></div>}
  </>;
  function toMk(m: Rec): BbMerknad { const d = m.data || {}; return { id: m.id, seksjon: m.seksjon, tid: m.created_at, tekst: d.tekst, navn: d.navn, etat: d.etat, status: d.status || 'ny', svar: d.svar, svarAv: d.svarAv, svarTid: d.svarTid }; }
}

// ---------------------------------------------------------------- åpen side for brannvesenet
export function BbLenke({ token }: { token: string }) {
  const [x, setX] = useState<any>(null); const [err, setErr] = useState('');
  const hent = async () => { try { setX(await aoApi({ action: 'bb_hent', token }, false)); } catch (e: any) { setErr(e.message); } };
  useEffect(() => { hent(); }, [token]);
  const fil = async (path: string) => { try { const r = await aoApi({ action: 'bb_fil', token, path }, false); window.open(r.url, '_blank'); } catch (e: any) { toast(e.message); } };
  const wrap = (c: React.ReactNode) => <div style={{ background: '#F4F6F6', minHeight: '100vh' }}>{c}</div>;
  if (err) return wrap(<div style={{ maxWidth: 560, margin: '0 auto', padding: 40 }}><div className="card"><h2>{tt("Brannbok")}</h2><p>{err}</p></div></div>);
  if (!x) return wrap(<div style={{ padding: 40, textAlign: 'center' }}>{tt("Laster …")}</div>);
  const bb: Brannbok = x.innhold; const L = x.lenke; const M: Rec[] = x.merknader || []; const tot = samletStatus(bb); const kan = L.merknader;
  const mkFor = (key: string) => M.filter(m => m.seksjon === key);
  const MerkBlokk = ({ keyN }: { keyN: string }) => <div style={{ marginTop: 12, borderTop: '1px solid var(--line2)', paddingTop: 10 }}>
    {mkFor(keyN).map(m => <div key={m.id} className="note small" style={{ color: 'var(--ink)', marginBottom: 6 }}><b>{m.navn}</b>{m.etat ? ` (${m.etat})` : ''} <span className="muted">{fd(m.tid)}</span><div style={{ whiteSpace: 'pre-wrap' }}>{m.tekst}</div>{m.svar && <div style={{ marginTop: 4, paddingLeft: 8, borderLeft: `3px solid ${BRASS}` }}><b>{tt("Svar fra eier")}</b> <span className="muted">{fd(m.svarTid)}</span><div style={{ whiteSpace: 'pre-wrap' }}>{m.svar}</div></div>}</div>)}
    {kan && <MerkSkjema token={token} seksjon={keyN} onDone={hent} samlet={keyN === 'samlet'} />}</div>;
  return wrap(<>
    <div style={{ background: PETROL, color: '#fff', borderBottom: `4px solid ${BRASS}`, padding: '22px 16px' }}><div style={{ maxWidth: 920, margin: '0 auto' }}>
      <div style={{ fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: '#CFE0E3' }}>{tt("Brannbok")}</div>
      <h1 style={{ margin: '4px 0 2px', fontFamily: 'Georgia,serif', color: '#fff' }}>{bb.eiendom.navn}</h1>
      <div style={{ color: '#CFE0E3', fontSize: 13 }}>{[bb.eiendom.adresse, bb.eiendom.gnrbnr && `Gnr./bnr. ${bb.eiendom.gnrbnr}`, bb.eiendom.eier && `${tt("Eier")}: ${bb.eiendom.eier}`].filter(Boolean).join(' · ')}</div></div></div>
    <div style={{ maxWidth: 920, margin: '0 auto', padding: '16px 12px 60px' }}>
      <div className="card"><div className="toolbar" style={{ marginBottom: 6 }}><div style={{ flex: 1 }}><b>{tt("Samlet status")}:</b> <Chip c={FARGE[tot]}>{tt(STATUS_TEKST[tot])}</Chip> <span className="small muted">{tt("Oppdatert")} {fd(L.oppdatert)} · {tt("lenken gjelder til")} {fd(L.utloper)}</span></div>
        {L.pdf && <button className="btn sm" onClick={() => fil(L.pdf)}>{tt("Last ned PDF")}</button>}</div>
        <div className="tbl-wrap"><table><tbody>{bb.sek.map((s, i) => <tr key={s.key}><td><a href={'#/bb/' + token} onClick={ev => { ev.preventDefault(); document.getElementById('bb-' + s.key)?.scrollIntoView({ behavior: 'smooth' }); }}><b>{i + 1}. {s.tittel}</b></a></td><td><Chip c={FARGE[s.status]}>{tt(STATUS_TEKST[s.status])}</Chip></td><td className="small">{s.statusTekst}</td><td className="small muted">{kan && mkFor(s.key).length ? `${mkFor(s.key).length} ${tt("merknad(er)")}` : ''}</td></tr>)}</tbody></table></div>
        {kan && <p className="small muted" style={{ marginBottom: 0 }}>{tt("Du kan legge inn merknader under hvert kapittel, eller samlet nederst på siden. Ingen innlogging er nødvendig.")}</p>}</div>
      {bb.sek.map((s, i) => <Kapittel key={s.key} s={s} nr={i + 1} bb={bb} fil={fil}><MerkBlokk keyN={s.key} /></Kapittel>)}
      <div className="card" id="bb-samlet" style={{ marginTop: 14, borderTop: `3px solid ${PETROL}` }}><h2 style={{ marginTop: 0, fontFamily: 'Georgia,serif' }}>{tt("Samlede merknader")}</h2>
        {kan ? <p className="small muted" style={{ marginTop: 0 }}>{tt("Her kan dere skrive én samlet tilbakemelding på brannboken.")}</p> : <p className="small muted">{tt("Eier har ikke slått på merknader for denne lenken.")}</p>}<MerkBlokk keyN="samlet" /></div>
    </div></>);
}

function Kapittel({ s, nr, bb, fil, children }: { s: BbSek; nr: number; bb: Brannbok; fil: (p: string) => void; children: React.ReactNode }) {
  const ved = (s.vedlegg || []).map(id => bb.vedlegg.find(v => v.id === id)).filter(Boolean) as Rec[];
  return <div className="card" id={'bb-' + s.key} style={{ marginTop: 14, borderTop: `3px solid ${PETROL}` }}>
    <div className="toolbar" style={{ marginBottom: 6 }}><h2 style={{ margin: 0, flex: 1, fontFamily: 'Georgia,serif' }}>{nr}. {s.tittel}</h2><span className="small muted">{s.hjemmel}</span></div>
    <p style={{ margin: '0 0 8px' }}><Chip c={FARGE[s.status]}>{tt(STATUS_TEKST[s.status])}</Chip> <b>{s.statusTekst}</b></p>
    {s.fakta?.length ? <dl className="dl">{s.fakta.map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{v}</dd></React.Fragment>)}</dl> : null}
    {s.tekst && <p className="small">{s.tekst}</p>}{(s.punkter || []).map((p, i) => <p key={i} className="small">• {p}</p>)}
    {(s.tabeller || []).map((t, i) => <div key={i} style={{ marginTop: 8 }}>{t.tittel && <div className="small muted" style={{ fontWeight: 600 }}>{t.tittel}</div>}<div className="tbl-wrap"><table><thead><tr>{t.hode.map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{t.rader.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k} className="small">{c}</td>)}</tr>)}</tbody></table></div></div>)}
    {ved.length > 0 && <p className="small" style={{ marginBottom: 0 }}><b>{tt("Vedlegg:")}</b> {ved.map((v, i) => <React.Fragment key={v.id}>{i > 0 && ', '}<a href="#" onClick={ev => { ev.preventDefault(); fil(v.path); }}>{v.navn}</a></React.Fragment>)}</p>}
    {children}</div>;
}

function MerkSkjema({ token, seksjon, onDone, samlet }: { token: string; seksjon: string; onDone: () => void; samlet: boolean }) {
  const lagret = (() => { try { return JSON.parse(localStorage.getItem('bbNavn') || '{}'); } catch { return {}; } })();
  const [apen, setApen] = useState(samlet); const [navn, setNavn] = useState(lagret.navn || ''); const [etat, setEtat] = useState(lagret.etat || ''); const [epost, setEpost] = useState(lagret.epost || ''); const [tekst, setTekst] = useState(''); const [busy, setBusy] = useState(false);
  if (!apen) return <button className="btn sm" onClick={() => setApen(true)}>{tt("+ Legg inn merknad til dette kapittelet")}</button>;
  const send = async () => { if (!navn.trim() || !tekst.trim()) return toast(tt("Skriv inn navn og merknad")); setBusy(true);
    try { await aoApi({ action: 'bb_merknad', token, seksjon, tekst, navn, etat, epost }, false); try { localStorage.setItem('bbNavn', JSON.stringify({ navn, etat, epost })); } catch { /* ignorer */ } setTekst(''); if (!samlet) setApen(false); toast(tt("Merknaden er sendt til eier")); onDone(); } catch (e: any) { toast(e.message); } finally { setBusy(false); } };
  const inp = { border: '1px solid var(--line2)', borderRadius: 7, padding: '6px 8px', width: '100%' } as any;
  return <div style={{ display: 'grid', gap: 8 }}>
    <textarea style={{ ...inp, minHeight: 90 }} placeholder={samlet ? tt("Samlet merknad til brannboken …") : tt("Merknad til dette kapittelet …")} value={tekst} onChange={ev => setTekst(ev.target.value)} />
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 8 }}><input style={inp} placeholder={tt("Navn *")} value={navn} onChange={ev => setNavn(ev.target.value)} /><input style={inp} placeholder={tt("Etat / avdeling")} value={etat} onChange={ev => setEtat(ev.target.value)} /><input style={inp} placeholder={tt("E-post (valgfritt)")} value={epost} onChange={ev => setEpost(ev.target.value)} /></div>
    <div><button className="btn pri sm" disabled={busy} onClick={send}>{busy ? tt("Sender …") : tt("Send merknad")}</button>{!samlet && <> <button className="btn sm ghost" onClick={() => setApen(false)}>{tt("Avbryt")}</button></>}</div></div>;
}
