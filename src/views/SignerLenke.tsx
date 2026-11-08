// Åpen side for signering av befaringsrapport (#/sg/<token>). Krever ikke innlogging.
// Parten leser rapporten, skriver navn, kan tegne signatur, og bekrefter med engangskode sendt til e-posten lenken gikk til.
import React, { useEffect, useState } from 'react';
import { aoApi } from '../lib/store';
import { fd, fdt, type Rec } from '../lib/utils';
import { SignaturFelt } from '../components/Signatur';

export function SignerLenke({ token }: { token: string }) {
  const [info, setInfo] = useState<Rec | null>(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const [navn, setNavn] = useState(''); const [png, setPng] = useState(''); const [ok, setOk] = useState(false); const [forb, setForb] = useState('');
  const [kodeSendt, setKodeSendt] = useState(''); const [kode, setKode] = useState(''); const [ferdig, setFerdig] = useState<Rec | null>(null);
  const last = () => aoApi({ action: 'bef_sign_info', token }, false).then(i => { setInfo(i); setNavn(n => n || i.part?.navn || ''); }).catch(e => setErr(e.message));
  useEffect(() => { last(); }, [token]);
  const sendKode = async () => { setErr(''); if (!navn.trim()) return setErr('Skriv navnet ditt'); if (!ok) return setErr('Bekreft at du har lest rapporten');
    setBusy(true); try { const r = await aoApi({ action: 'bef_sign_kode', token }, false); setKodeSendt(r.til || 'e-postadressen din'); } catch (e: any) { setErr(e.message); } setBusy(false); };
  const signer = async () => { setErr(''); if (!/^\d{6}$/.test(kode.trim())) return setErr('Koden har 6 sifre');
    setBusy(true); try { const r = await aoApi({ action: 'bef_sign_signer', token, kode: kode.trim(), navn: navn.trim(), signatur: png, forbehold: forb.trim() }, false); setFerdig(r); await last(); } catch (e: any) { setErr(e.message); } setBusy(false); };
  if (err && !info) return <div className="login"><div className="card" style={{ maxWidth: 560 }}><h2>Kan ikke åpne signeringen</h2><p>{err}</p></div></div>;
  if (!info) return <div className="login"><div className="card"><p>Laster …</p></div></div>;
  const signert = info.part?.signert;
  return <div style={{ maxWidth: 760, margin: '20px auto', padding: '0 14px' }}>
    <div className="card"><p className="small muted" style={{ margin: 0 }}>BEFARINGSRAPPORT TIL SIGNERING</p>
      <h1 style={{ margin: '4px 0' }}>{info.tittel}</h1>
      <p className="muted" style={{ marginTop: 0 }}>{info.type} · {info.eiendom}{info.adresse ? ', ' + info.adresse : ''} · {fd(info.dato)}</p>
      <p>{info.pdfUrl ? <a className="btn pri" href={info.pdfUrl} target="_blank" rel="noopener noreferrer">Les rapporten (PDF)</a> : <span className="muted">Rapporten kunne ikke hentes.</span>}</p>
      <p className="small muted mono" style={{ marginBottom: 0 }}>Dokumentets fingeravtrykk (SHA-256): {info.dokHash}</p></div>
    <div className="card"><h2 style={{ marginTop: 0 }}>Parter</h2>
      {(info.parter || []).map((p: Rec, i: number) => <div key={i} className="small" style={{ display: 'flex', gap: 8, padding: '3px 0' }}><span style={{ flex: 1 }}><b>{p.navn}</b> – {p.rolle}{p.firma ? ', ' + p.firma : ''}</span><span style={{ color: p.signert ? 'var(--green)' : 'var(--muted)' }}>{p.signert ? '✓ Signert ' + fdt(p.signert) : 'Venter'}</span></div>)}
      {info.ferdigUrl && <p><a className="btn" href={info.ferdigUrl} target="_blank" rel="noopener noreferrer">Last ned signert rapport</a></p>}</div>
    {signert ? <div className="card"><p style={{ margin: 0 }}>✓ Du signerte {fdt(signert)}.{ferdig?.alle ? ' Alle parter har nå signert – du får den signerte rapporten på e-post.' : ''}</p></div> :
      <div className="card"><h2 style={{ marginTop: 0 }}>Din signatur – {info.part?.rolle}</h2>
        <label className="pa-felt"><span>Fullt navn</span><input value={navn} onChange={e => setNavn(e.target.value)} autoComplete="name" /></label>
        <p className="small" style={{ marginBottom: 4 }}>Signatur (valgfritt å tegne)</p><SignaturFelt onChange={setPng} hoyde={130} />
        <label className="pa-felt"><span>Forbehold eller merknad (valgfritt)</span><textarea rows={2} value={forb} onChange={e => setForb(e.target.value)} placeholder="F.eks. uenig i punkt 4" /></label>
        <label className="small" style={{ display: 'flex', gap: 6, fontWeight: 400, margin: '8px 0' }}><input type="checkbox" style={{ width: 'auto' }} checked={ok} onChange={e => setOk(e.target.checked)} />Jeg har lest rapporten og bekrefter at den gir et riktig bilde av befaringen{forb.trim() ? ', med forbeholdet over' : ''}.</label>
        {!kodeSendt ? <button className="btn pri" disabled={busy} onClick={sendKode}>{busy ? 'Sender …' : 'Send meg engangskode'}</button> : <>
          <p className="small">Vi har sendt en 6-sifret kode til {kodeSendt}. Koden gjelder i 10 minutter.</p>
          <label className="pa-felt"><span>Engangskode</span><input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={kode} onChange={e => setKode(e.target.value.replace(/\D/g, ''))} style={{ maxWidth: 160, fontFamily: 'var(--mono)', letterSpacing: 3 }} /></label>
          <button className="btn pri" disabled={busy} onClick={signer}>{busy ? 'Signerer …' : 'Signer'}</button> <button className="btn ghost" disabled={busy} onClick={sendKode}>Send ny kode</button></>}
        {err && <p style={{ color: 'var(--red)' }}>{err}</p>}
        <p className="small muted">Ved signering lagres navnet ditt, tidspunktet, IP-adressen, nettleseren og dokumentets fingeravtrykk. Det er en enkel elektronisk signatur bekreftet med e-post. Les <a href="#/personvern" target="_blank">personvernerklæringen</a>.</p></div>}
  </div>;
}
