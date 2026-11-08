import { svaktPassord, PASSORDKRAV } from '../lib/utils';
import { PersonvernBekreft, PERSONVERN_VERSJON } from '../components/Personvern';
// Sjekkliste til leietaker: eier sender lenke, leietaker fyller ut i portalen, eier godkjenner.
import React, { useEffect, useState } from 'react';
import { S, aoApi, loadData, loadMe, sb, state, toast, useStore, save } from '../lib/store';
import { byId, fd, today, type Rec } from '../lib/utils';
import { PLIKTER } from '../lib/catalog';
import { confirmBox, copyText, FileLink, formModal, showModal, type Field } from '../components/ui';
import { autoKvitterIK, vurderPliktRef } from '../lib/actions';
import { lagPakke, lesPakke, pakkeNavn, blobTilBase64, type ImportResultat } from '../lib/sjekklistePakke';
import { uploadFile, isStaff } from '../lib/store';
import { tt } from '../lib/i18n';

export async function lastNedPakke(l: Rec, frist: string) {
  const b = await lagPakke(l, frist); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = pakkeNavn(l) + '.zip'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// ---------- Eier: importer utfylt pakke (ZIP, eller xlsx + filer)
export function importerPakke(lid: string) {
  const inp = document.createElement('input'); inp.type = 'file'; inp.multiple = true; inp.accept = '.zip,.xlsx,.pdf,.jpg,.jpeg,.png,.docx,.doc,.xls';
  inp.onchange = async () => {
    const l = byId('leietakere', lid)!; const filer = [...(inp.files || [])]; if (!filer.length) return;
    let r: ImportResultat; try { r = await lesPakke(l, filer); } catch (e: any) { toast(tt("Kunne ikke lese filen: ") + (e.message || e)); return; }
    if (!r.plikter.length) { toast(tt("Fant ingen utfylte punkter eller filer i pakken")); return; }
    showModal(tt("Importer sjekkliste fra ") + l.navn, () => <>
      <p className="small muted" style={{ marginTop: 0 }}>{tt("Pliktene under legges inn som")} <b>{tt("til godkjenning")}</b>{tt(". Du går gjennom og godkjenner hver enkelt etterpå (eller sender tilbake).")}</p>
      {r.advarsler.map(a => <div key={a} className="note small" style={{ color: 'var(--amber)' }}>{a}</div>)}
      <div className="tbl-wrap"><table><thead><tr><th>{tt("Plikt")}</th><th>{tt("Sjekkliste")}</th><th>{tt("Dato")}</th><th className="num">{tt("Filer")}</th></tr></thead><tbody>
        {r.plikter.map(p => <tr key={p.key}><td>{p.navn}{p.komm && <div className="small muted" style={{ whiteSpace: 'pre-wrap' }}>{p.komm}</div>}</td><td className="small" style={{ color: p.sjekk.length >= p.antall ? 'var(--green)' : 'var(--amber)' }}>{p.sjekk.length} {tt("av")} {p.antall}</td><td className="small">{p.dato ? fd(p.dato) : '–'}</td><td className="num small" title={p.filer.map(f => f.name).join('\n')}>{p.filer.length}</td></tr>)}
      </tbody></table></div>
      {r.ukjenteFiler.length > 0 && <details className="small" style={{ marginTop: 8 }}><summary>{tt("Filer som ikke ble lest inn (")}{r.ukjenteFiler.length})</summary>{r.ukjenteFiler.map(f => <div key={f} className="muted">{f}</div>)}</details>}
    </>, { foot: close => <><span className="grow" /><button className="btn" onClick={close}>{tt("Avbryt")}</button><button className="btn pri" onClick={async e => {
      const btn = e.currentTarget; btn.disabled = true; btn.textContent = 'Laster opp …';
      try {
        const l2 = byId('leietakere', lid)!; const pl = (l2.plikter || []).slice();
        for (const p of r.plikter) {
          const ids: string[] = [];
          for (const f of p.filer) { const up = await uploadFile(f, l2.eiendomId, l2.id); if (up) ids.push(await save('dokumenter', { eiendomId: l2.eiendomId, leietakerId: l2.id, type: 'Leietakers IK-dokumentasjon', tittel: p.navn + ' – ' + f.name, dato: p.dato || today(), fil: up })); }
          pl[p.idx] = { ...pl[p.idx], status: 'til_godkjenning', innsendt: { dato: p.dato || today(), komm: p.komm, sjekk: p.sjekk, dokId: ids[0] || null, dokIds: ids, tid: new Date().toISOString(), av: 'Import fra fil' }, tilbakemelding: null };
        }
        await save('leietakere', { ...l2, plikter: pl }); close(); toast(tt("{0} plikter lest inn – klare til godkjenning", r.plikter.length));
      } catch (err: any) { toast(tt("Import feilet: ") + (err.message || err)); btn.disabled = false; btn.textContent = 'Importer'; }
    }}>{tt("Importer")} {r.plikter.length} {tt("plikter")}</button></> });
  };
  inp.click();
}

// ---------- Eier: send sjekklisten
export function sendSjekkliste(lid: string) {
  const l = byId('leietakere', lid)!; const s = l.sjekklisteSendt;
  const fields: Field[] = [
    { k: 'maate', label: tt("Hvordan skal leietaker svare?"), type: 'select', def: 'lenke', options: [['lenke', 'Lenke – fylles ut i Eiendomskontroll (leietaker får egen bruker)'], ['fil', 'Fil – Excel-sjekkliste og mapper (ZIP) på e-post, returneres og importeres'], ['begge', 'Begge – lenke og fil']] },
    { k: 'epost', label: tt("E-post til leietakers kontaktperson"), type: 'email', def: l.epost || '', req: true },
    { k: 'frist', label: tt("Svarfrist"), type: 'date', def: (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().slice(0, 10); })(), half: true },
    { k: 'melding', label: tt("Melding (valgfri)"), type: 'textarea', ph: tt("Standardtekst brukes hvis feltet er tomt") },
  ];
  formModal({
    title: tt("Send sjekkliste til ") + l.navn, fields, saveTxt: tt("Send"),
    extraFoot: () => <button className="btn" type="button" onClick={() => lastNedPakke(l, '')} title={tt("Last ned ZIP med Excel-sjekkliste og mapper – send den selv")}>{tt("⇩ Last ned pakken")}</button>,
    top: <p className="small muted" style={{ marginTop: 0 }}>{tt("Leietaker får en lenke på e-post. Via lenken opprettes en leietakerbruker (eller de logger inn), krysser av i sjekklisten for hver plikt og laster opp dokumentasjon. Innsendt dokumentasjon havner hos deg til godkjenning.")}{s ? tt(" Sist sendt {0} til {1}.", fd(s.tid), s.til) : ''}</p>,
    onSave: async x => {
      if (!(await confirmBox(tt("Sende e-post med sjekklisten til {0} ({1})? Er testmodus på, holdes e-posten tilbake og du får teksten i stedet.", String(x.epost).trim(), l.navn), tt("Send e-post")))) return false;
      try {
        let vedlegg: any;
        if (x.maate !== 'lenke') { const b = await lagPakke(l, x.frist); vedlegg = { navn: pakkeNavn(l) + tt(".zip"), base64: await blobTilBase64(b), type: 'application/zip' }; }
        const r = await aoApi({ action: 'lt_send', leietaker_id: lid, epost: x.epost, frist: x.frist, melding: x.melding, lenkeBase: location.origin, maate: x.maate, vedlegg });
        if (!r.sendt && vedlegg) lastNedPakke(l, x.frist);
        if (r.sendt) { toast(tt("Sjekklisten er sendt til ") + r.til); return; }
        showModal(tt("Send sjekklisten selv"), () => <>
          <p className="small">{r.grunn || tt("E-post er ikke satt opp.")} {tt("Kopier teksten under, eller åpne den i e-postprogrammet ditt.")}{vedlegg ? tt(" Sjekklistepakken (ZIP) er lastet ned – legg den ved e-posten.") : ''}</p>
          <textarea readOnly value={r.tekst} style={{ width: '100%', height: 260, fontSize: 12.5 }} />
        </>, { foot: () => <><button className="btn" onClick={() => copyText(r.tekst)}>{tt("Kopier tekst")}</button><button className="btn" onClick={() => copyText(r.lenke)}>{tt("Kopier lenke")}</button><span className="grow" /><a className="btn pri" href={`mailto:${encodeURIComponent(r.til)}?subject=${encodeURIComponent(r.emne)}&body=${encodeURIComponent(r.tekst)}`}>{tt("Åpne i e-post")}</a></> });
      } catch (e: any) { toast(e.message); return false; }
    },
  });
}

// ---------- Eier: vurder innsendt plikt
export function vurderPlikt(lid: string, idx: number) {
  const l = byId('leietakere', lid)!; const p = (l.plikter || [])[idx]; const i = p?.innsendt; if (!p || !i) return;
  const dok = PLIKTER[p.key]?.dok || [];
  const lagre = async (np: Rec) => { const pl = l.plikter.slice(); pl[idx] = np; await save('leietakere', { ...l, plikter: pl }); };
  showModal(tt("Vurder: ") + p.navn, () => <>
    <p className="small muted" style={{ marginTop: 0 }}>{l.navn} {tt("· sendt inn")} {fd(i.tid)}{i.av ? tt(" av ") + i.av : ''} · {p.hjemmel}</p>
    {dok.length > 0 && <><h3>{tt("Sjekkliste")}</h3><div className="note small" style={{ color: 'var(--ink)' }}>{dok.map(t => { const on = (i.sjekk || []).includes(t); return <div key={t} style={{ margin: '3px 0' }}><span style={{ color: on ? 'var(--green)' : 'var(--red)', fontWeight: 700, marginRight: 6 }}>{on ? '✓' : '✕'}</span>{t}</div>; })}
      <div className="muted" style={{ marginTop: 4 }}>{(i.sjekk || []).length} {tt("av")} {dok.length} {tt("punkter krysset av")}</div></div></>}
    <dl className="dl" style={{ marginTop: 12 }}><dt>{tt("Dato")}</dt><dd>{fd(i.dato)}</dd><dt>{tt("Kommentar")}</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{i.komm || '–'}</dd><dt>{tt("Dokumentasjon")}</dt><dd>{(() => { const D = ((i.dokIds as string[] | undefined) || (i.dokId ? [i.dokId] : [])).map(x => byId('dokumenter', x)).filter(x => x?.fil); return D.length ? D.map(x => <div key={x!.id}><FileLink fil={x!.fil} /></div>) : <span className="muted">{tt("Ingen fil lastet opp")}</span>; })()}</dd></dl>
  </>, { foot: close => <>
    <button className="btn" onClick={async () => {
      close();
      formModal({ title: tt("Send tilbake til leietaker"), fields: [{ k: 'tb', label: tt("Hva mangler eller må rettes?"), type: 'textarea', req: true }], saveTxt: tt("Send tilbake"),
        onSave: async x => { await lagre({ ...p, status: 'avvist', tilbakemelding: { tekst: x.tb, tid: new Date().toISOString(), av: state.me?.navn || state.me?.epost } }); toast(tt("Sendt tilbake – leietaker ser tilbakemeldingen i portalen")); } });
    }}>{tt("Send tilbake")}</button>
    <span className="grow" />
    <button className="btn pri" onClick={async () => {
      if (dok.length && (i.sjekk || []).length < dok.length && !(await confirmBox(tt("Bare {0} av {1} punkter er krysset av. Godkjenne likevel?", (i.sjekk || []).length, dok.length), tt("Godkjenn")))) return;
      await lagre({ ...p, sist: i.dato || today(), komm: i.komm, sjekk: i.sjekk || [], dokId: i.dokId || p.dokId, form: 'Innsendt av leietaker – godkjent', bekreftetAvLeietaker: true, godkjent: { tid: new Date().toISOString(), av: state.me?.navn || state.me?.epost }, status: '', innsendt: null, tilbakemelding: null });
      close(); toast(tt("Godkjent")); setTimeout(autoKvitterIK, 300);
    }}>{tt("Godkjenn")}</button></> });
}

vurderPliktRef.f = vurderPlikt;

// Antall innsendinger som venter på godkjenning
export const tilGodkjenning = () => S.leietakere.flatMap(l => (l.plikter || []).map((p: any, idx: number) => ({ l, p, idx })).filter(x => x.p.status === 'til_godkjenning' && x.p.innsendt));

// ---------- Leietaker åpner lenken fra e-posten
export function LtLenke({ token }: { token: string }) {
  useStore();
  const [info, setInfo] = useState<any>(null); const [err, setErr] = useState(''); const [modus, setModus] = useState<'reg' | 'login'>('reg');
  const [navn, setNavn] = useState(''); const [pw, setPw] = useState(''); const [pw2, setPw2] = useState(''); const [busy, setBusy] = useState(false); const [sam, setSam] = useState(false);
  const inne = !!state.me;
  useEffect(() => { (async () => {
    try {
      if (inne) { const r = await aoApi({ action: 'lt_aksepter', token }); await loadMe(); await loadData(); location.hash = r.ansatt ? '#/leietaker/' + r.leietaker_id : '#/portal'; return; }
      const i = await aoApi({ action: 'lt_info', token }, false); setInfo(i); if (i.finnes || i.brukt) setModus('login');
    } catch (e: any) { setErr(e.message); }
  })(); }, [inne]);
  const registrer = async (e: React.FormEvent) => {
    e.preventDefault(); if (!sam) return setErr(tt("Du må godta personvernerklæringen")); if (svaktPassord(pw)) return setErr(PASSORDKRAV); if (pw !== pw2) return setErr(tt("Passordene er ikke like"));
    setBusy(true); setErr('');
    try { await aoApi({ action: 'lt_registrer', token, navn, passord: pw, samtykke: true, personvernVersjon: PERSONVERN_VERSJON }, false); const { error } = await sb.auth.signInWithPassword({ email: info.epost, password: pw }); if (error) throw error; }
    catch (e: any) { setErr(e.message); } setBusy(false);
  };
  const logginn = async (e: React.FormEvent) => { e.preventDefault(); setBusy(true); setErr(''); const { error } = await sb.auth.signInWithPassword({ email: info.epost, password: pw }); if (error) setErr(tt("Feil passord eller e-post")); setBusy(false); };
  const inp = { width: '100%' } as any;
  return <div className="login"><div className="card" style={{ maxWidth: 440 }}>
    <p className="small" style={{ color: 'var(--acc)', fontWeight: 700, margin: 0 }}>{tt("SJEKKLISTE BRANN OG INTERNKONTROLL")}</p>
    {err && !info ? <><h1>{tt("Lenken virker ikke")}</h1><p>{err}</p><a href="#/">{tt("Gå til innlogging")}</a></>
      : !info ? <p>{inne ? tt("Kobler brukeren din til leieforholdet …") : tt("Henter sjekklisten …")}</p>
      : <>
        <h1 style={{ marginBottom: 4 }}>{info.leietaker}</h1>
        {modus === 'reg' ? <form onSubmit={registrer}>
          <p className="small">{tt("Opprett en bruker for å fylle ut sjekklisten, krysse av for dokumentasjon og laste opp filer. Brukeren gir bare tilgang til ditt eget leieforhold.")}</p>
          <label>{tt("E-post")}</label><input value={info.epost} readOnly style={inp} />
          <label>{tt("Navn")}</label><input value={navn} onChange={e => setNavn(e.target.value)} required style={inp} />
          <label>{tt("Velg passord (min. 8 tegn)")}</label><input type="password" value={pw} onChange={e => setPw(e.target.value)} style={inp} autoComplete="new-password" />
          <label>{tt("Gjenta passord")}</label><input type="password" value={pw2} onChange={e => setPw2(e.target.value)} style={inp} autoComplete="new-password" />
          <PersonvernBekreft ok={sam} set={setSam} ansvarlig="utleier" />
          {err && <p style={{ color: 'var(--red)' }}>{err}</p>}
          <button className="btn pri" disabled={busy || !sam} style={{ width: '100%', marginTop: 10 }}>{busy ? tt("Oppretter …") : tt("Opprett bruker og åpne sjekklisten")}</button>
          <p className="small" style={{ textAlign: 'center' }}><a href="#" onClick={e => { e.preventDefault(); setModus('login'); setErr(''); }}>{tt("Har du allerede bruker? Logg inn")}</a></p></form>
        : <form onSubmit={logginn}>
          <p className="small">{info.finnes ? tt("Du har allerede en bruker. Logg inn for å åpne sjekklisten.") : tt("Logg inn for å åpne sjekklisten.")}</p>
          <label>{tt("E-post")}</label><input value={info.epost} readOnly style={inp} />
          <label>{tt("Passord")}</label><input type="password" value={pw} onChange={e => setPw(e.target.value)} style={inp} autoComplete="current-password" />
          {err && <p style={{ color: 'var(--red)' }}>{err}</p>}
          <button className="btn pri" disabled={busy} style={{ width: '100%', marginTop: 12 }}>{busy ? tt("Logger inn …") : tt("Logg inn og åpne")}</button></form>}
      </>}
  </div></div>;
}
