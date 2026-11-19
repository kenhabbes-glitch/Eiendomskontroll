// Lenke til brannvernopplæring (#/op/<token>) – ingen innlogging. Gjennomgang med spørsmål, og for brannvernleder/hovedkontakt
// også invitasjon og oppfølging av egne ansatte.
import { useEffect, useState } from 'react';
import { aoApi } from '../lib/store';
import { tt } from '../lib/i18n';
import { fd } from '../lib/utils';

const api = (a: string, token: string, x: any = {}) => aoApi({ action: a, token, lenkeBase: location.origin, ...x }, false);

export function OpLenke({ token }: { token: string }) {
  const [info, setInfo] = useState<any>(null); const [err, setErr] = useState('');
  const [i, setI] = useState(0); const [riktige, setRiktige] = useState<string[]>([]); const [valg, setValg] = useState<number | null>(null);
  const [svar, setSvar] = useState<any>(null); const [ferdig, setFerdig] = useState(''); const [busy, setBusy] = useState(false); const [visKurs, setVisKurs] = useState(false);
  useEffect(() => { api('opl_info', token).then(r => {
    setInfo(r); setRiktige(r.riktige || []); setFerdig(r.fullfort || '');
    const f = r.innhold.steg.findIndex((s: any) => s.spm && !(r.riktige || []).includes(s.spm.id)); setI(f < 0 ? 0 : f);
  }).catch(e => setErr(e.message)); }, [token]);
  const steg = info?.innhold?.steg || []; const s = steg[i]; const sisteSteg = i === steg.length - 1;
  const erRiktig = !s?.spm || riktige.includes(s.spm.id);
  const sjekk = async () => {
    if (valg == null || !s?.spm) return; setBusy(true);
    try { const r = await api('opl_sjekk', token, { spm: s.spm.id, valg }); setSvar(r); if (r.riktig) setRiktige(r.riktige); } catch (e: any) { setErr(e.message); }
    setBusy(false);
  };
  const apne = async (fil: string) => {
    const w = window.open('', '_blank');
    try { const r = await api('opl_fil', token, { fil }); if (w) w.location.href = r.url; else location.href = r.url; } catch (e: any) { w?.close(); setErr(e.message); }
  };
  const neste = async () => {
    setSvar(null); setValg(null); setErr('');
    if (!sisteSteg) return setI(i + 1);
    setBusy(true); try { const r = await api('opl_ferdig', token); setFerdig(r.fullfort); } catch (e: any) { setErr(e.message); }
    setBusy(false);
  };
  return <div className="login"><div className="card" style={{ maxWidth: 620 }}>
    <p className="small" style={{ color: 'var(--acc)', fontWeight: 700, margin: 0 }}>{tt("BRANNVERNOPPLÆRING")}</p>
    {err && !info ? <><h1>{tt("Lenken virker ikke")}</h1><p>{err}</p></>
      : !info ? <p>{tt("Henter opplæringen …")}</p>
      : <>
        <h1 style={{ marginBottom: 2 }}>{info.eiendom}</h1>
        <p className="muted" style={{ marginTop: 0 }}>{info.leietaker} · {tt("Hei")} {info.navn}</p>
        {ferdig && !visKurs ? <>
          <div className="note"><b>{tt("Takk – opplæringen er gjennomført.")}</b><br /><span className="small">{tt("Gjennomført")} {fd(ferdig)}. {tt("Du kan ta den på nytt når du vil.")}</span>
            <div><button type="button" className="btn sm" style={{ marginTop: 8 }} onClick={() => { setVisKurs(true); setI(0); setSvar(null); setValg(null); }}>{tt("Se gjennomgangen igjen")}</button></div></div>
          {info.rolle === 'leder' && <Ansatte token={token} />}
        </> : <>
          <div style={{ display: 'flex', gap: 4, margin: '10px 0' }}>{steg.map((x: any, k: number) => <span key={x.id} style={{ flex: 1, height: 5, borderRadius: 3, background: k < i || (x.spm ? riktige.includes(x.spm.id) : k < i) ? 'var(--acc)' : k === i ? 'var(--acc-soft, #9fc9bd)' : 'var(--line2)' }} />)}</div>
          <p className="small muted" style={{ margin: 0 }}>{tt("Steg {0} av {1}", i + 1, steg.length)}</p>
          <h2 style={{ margin: '4px 0 8px' }}>{s.tittel}</h2>
          {s.tekst.map((t: string, k: number) => <p key={k} style={{ margin: '0 0 8px', whiteSpace: 'pre-wrap' }}>{t}</p>)}
          {(s.filer || []).length > 0 && <div style={{ margin: '4px 0 10px' }}><p className="small muted" style={{ margin: '0 0 4px' }}>{tt("Dokumenter – åpnes i ny fane")}</p>
            {s.filer.map((f: any) => <button key={f.id} type="button" className="btn sm" style={{ margin: '0 6px 6px 0' }} onClick={() => apne(f.id)}>📄 {f.tittel}</button>)}</div>}
          {s.spm && <div className="note" style={{ color: 'var(--ink)', background: 'var(--surface)', marginTop: 10 }}>
            <b>{s.spm.q}</b>
            {s.spm.valg.map((v: string, k: number) => <label key={k} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', margin: '8px 0', fontWeight: 400 }}>
              <input type="radio" name={'q' + s.spm.id} disabled={erRiktig && !!svar?.riktig} checked={valg === k} onChange={() => { setValg(k); setSvar(null); }} style={{ width: 'auto', marginTop: 3 }} /><span>{v}</span></label>)}
            {svar?.riktig && <p style={{ color: 'var(--green, #1f7a4d)', margin: '6px 0 0' }}><b>✓ </b>{svar.forklaring}</p>}
            {svar && !svar.riktig && <p style={{ color: 'var(--red)', margin: '6px 0 0' }}><b>{tt("Ikke helt – prøv igjen.")}</b> {svar.tips}</p>}
            {!erRiktig && <button type="button" className="btn sm pri" disabled={busy || valg == null} onClick={sjekk}>{tt("Sjekk svaret")}</button>}
          </div>}
          {err && <p style={{ color: 'var(--red)' }}>{err}</p>}
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            {i > 0 && <button type="button" className="btn" onClick={() => { setI(i - 1); setSvar(null); setValg(null); }}>{tt("Tilbake")}</button>}
            <span style={{ flex: 1 }} />
            <button type="button" className="btn pri" disabled={busy || !erRiktig} onClick={() => { if (visKurs && ferdig && sisteSteg) { setVisKurs(false); return; } neste(); }}>{sisteSteg ? tt("Fullfør opplæringen") : tt("Neste")}</button>
          </div>
        </>}
      </>}
  </div></div>;
}

// Brannvernleder/hovedkontakt: inviter ansatte, se status og purr
function Ansatte({ token }: { token: string }) {
  const [liste, setListe] = useState<any[] | null>(null); const [tekst, setTekst] = useState(''); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(''); const [lenker, setLenker] = useState<any[]>([]);
  const last = () => api('opl_oversikt', token).then(r => setListe(r.ansatte)).catch(e => setMsg(e.message));
  useEffect(() => { last(); }, [token]);
  const parse = () => tekst.split('\n').map(x => x.trim()).filter(Boolean).map(l => { const m = l.match(/[^\s,;<>"]+@[^\s,;<>"]+\.[^\s,;<>"]+/); const ep = m ? m[0] : ''; const navn = l.replace(ep, '').replace(/[<>,;"]/g, ' ').replace(/\s+/g, ' ').trim() || ep.split('@')[0]; return { navn, epost: ep }; });
  const inviter = async () => {
    const P = parse(); if (!P.length) return; setBusy(true); setMsg('');
    try { const r = await api('opl_inviter', token, { personer: P }); const ok = r.resultat.filter((x: any) => x.sendt).length; const feil = r.resultat.filter((x: any) => x.feil);
      setLenker(r.resultat.filter((x: any) => x.lenke)); setMsg(`${ok} ${tt("invitasjon(er) sendt på e-post.")}${r.resultat.some((x: any) => x.lenke) ? ' ' + tt("E-post kunne ikke sendes til noen – lenkene står under, og du kan sende dem selv.") : ''}${feil.length ? ' ' + feil.map((x: any) => `${x.epost || x.navn}: ${x.feil}`).join('; ') : ''}`);
      if (!feil.length) setTekst(''); await last(); } catch (e: any) { setMsg(e.message); }
    setBusy(false);
  };
  const purr = async (id?: string) => { setBusy(true); setMsg(''); try { const r = await api('opl_purr', token, { id }); setMsg(`${r.sendt} ${tt("påminnelse(r) sendt.")}${r.ventet ? ' ' + r.ventet + ' ' + tt("ble purret for kort tid siden.") : ''}${r.feil?.length ? ' ' + r.feil.join('; ') : ''}`); await last(); } catch (e: any) { setMsg(e.message); } setBusy(false); };
  const ferdige = (liste || []).filter(x => x.fullfort).length;
  return <div style={{ marginTop: 16 }}>
    <h2 style={{ margin: '0 0 6px' }}>{tt("Ansatte")}</h2>
    <p className="small muted" style={{ marginTop: 0 }}>{tt("Inviter de ansatte til samme opplæring. Hver får en personlig lenke på e-post. Her ser du hvem som har gjennomført, og du kan sende påminnelse.")}</p>
    <label>{tt("Ett navn og én e-postadresse per linje")}</label>
    <textarea value={tekst} onChange={e => setTekst(e.target.value)} placeholder={'Kari Nordmann, kari@firma.no\nOla Hansen <ola@firma.no>'} style={{ width: '100%', minHeight: 90 }} />
    <button type="button" className="btn pri" disabled={busy || !parse().length} onClick={inviter} style={{ marginTop: 6 }}>{tt("Send invitasjoner")} ({parse().length})</button>
    {msg && <p className="small" style={{ marginTop: 8 }}>{msg}</p>}
    {lenker.length > 0 && <ul className="small">{lenker.map(x => <li key={x.epost}>{x.navn}: <code style={{ wordBreak: 'break-all' }}>{x.lenke}</code></li>)}</ul>}
    {liste && liste.length > 0 && <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '14px 0 6px' }}><b style={{ flex: 1 }}>{ferdige} {tt("av")} {liste.length} {tt("har gjennomført")} ({Math.round(100 * ferdige / liste.length)} %)</b>
        {ferdige < liste.length && <button type="button" className="btn sm" disabled={busy} onClick={() => purr()}>{tt("Purr alle som mangler")}</button>}</div>
      <table className="tbl small"><thead><tr><th>{tt("Navn")}</th><th>{tt("Status")}</th><th /></tr></thead><tbody>
        {liste.map(x => <tr key={x.id}><td>{x.navn}<div className="muted">{x.epost}</div></td>
          <td>{x.fullfort ? <span style={{ color: 'var(--green, #1f7a4d)' }}>✓ {tt("Gjennomført")} {fd(x.fullfort)}</span> : x.startet ? tt("Påbegynt") : tt("Ikke startet")}{x.purret && !x.fullfort && <div className="muted">{tt("Purret")} {fd(x.purret)}</div>}</td>
          <td>{!x.fullfort && <button type="button" className="btn sm" disabled={busy} onClick={() => purr(x.id)}>{tt("Purr")}</button>}</td></tr>)}
      </tbody></table></>}
  </div>;
}
