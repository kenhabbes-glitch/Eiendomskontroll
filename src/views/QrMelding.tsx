// Offentlig side som åpnes fra en QR-kode: meld avvik uten innlogging.
import React, { useEffect, useState } from 'react';
import { tt } from '../lib/i18n';
import { SprakVelger } from '../components/SprakVelger';

const api = async (b: any) => {
  const r = await fetch('/.netlify/functions/qr-meld', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Noe gikk galt'); return j;
};
/** Skalerer ned bilder fra mobilkamera (ofte 5–10 MB) til maks 1600 px JPEG før de sendes. */
async function lesBilde(f: File): Promise<{ type: string; b64: string }> {
  const url = URL.createObjectURL(f);
  try {
    const img = await new Promise<HTMLImageElement>((ok, feil) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => feil(new Error(tt("Kunne ikke lese bildet"))); i.src = url; });
    const k = Math.min(1, 1600 / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return { type: 'image/jpeg', b64: c.toDataURL('image/jpeg', 0.82).split(',')[1] };
  } finally { URL.revokeObjectURL(url); }
}

export function QrLenke({ token }: { token: string }) {
  const [info, setInfo] = useState<{ eiendom: string; navn: string; sted: string } | null>(null); const [err, setErr] = useState('');
  const [f, setF] = useState({ tittel: '', beskrivelse: '', alv: 'Middels', navn: '', kontakt: '', nettside: '' }); const [bilde, setBilde] = useState<File | null>(null);
  const [busy, setBusy] = useState(false); const [ferdig, setFerdig] = useState<number | null>(null);
  useEffect(() => { api({ action: 'info', t: token }).then(setInfo).catch(e => setErr(e.message)); }, [token]);
  const set = (k: string, v: string) => setF(o => ({ ...o, [k]: v }));
  const send = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); if (f.tittel.trim().length < 3) return setErr(tt("Skriv kort hva som er galt"));
    setBusy(true);
    try { const fil = bilde ? await lesBilde(bilde) : undefined; const r = await api({ action: 'meld', t: token, ...f, fil }); setFerdig(r.nr || 0); }
    catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  };
  const inp = { width: '100%' } as any;
  if (ferdig !== null) return <div className="login"><div className="card" style={{ maxWidth: 480 }}>
    <h1>{tt("Takk for meldingen!")}</h1><p>{tt("Den er sendt til driftsansvarlig for")} <b>{info?.eiendom}</b>.</p>
    <p className="small muted">{tt("Ring 110, 112 eller 113 ved fare for liv og helse. Denne meldingen følges ikke opp i sanntid.")}</p>
    <p><button className="btn" onClick={() => { setFerdig(null); setF({ tittel: '', beskrivelse: '', alv: 'Middels', navn: '', kontakt: '', nettside: '' }); setBilde(null); }}>{tt("Send en ny melding")}</button></p></div></div>;
  if (!info) return <div className="login"><div className="card" style={{ maxWidth: 480 }}>{err ? <><h1>{tt("Meldepunktet fungerer ikke")}</h1><p>{tt(err)}</p></> : <p className="muted">{tt("Laster …")}</p>}</div></div>;
  return <div className="login"><form className="card" style={{ maxWidth: 480 }} onSubmit={send}>
    <div style={{ float: 'right' }}><SprakVelger /></div>
    <h1>{tt("Meld avvik eller feil")}</h1>
    <p className="sub" style={{ marginTop: 0 }}><b>{info.eiendom}</b>{info.navn ? ' · ' + info.navn : ''}{info.sted ? ' · ' + info.sted : ''}</p>
    <p className="small muted">{tt("Du trenger ikke å logge inn. Meldingen går til eier/driftsansvarlig. Ring 110, 112 eller 113 ved fare for liv og helse.")}</p>
    <label>{tt("Hva gjelder det?")} *<input style={inp} value={f.tittel} maxLength={150} onChange={e => set('tittel', e.target.value)} placeholder={tt("F.eks. Nødlys lyser ikke")} required /></label>
    <label>{tt("Hvor alvorlig?")}<select style={inp} value={f.alv} onChange={e => set('alv', e.target.value)}>
      <option value="Kritisk">{tt("Kritisk – fare for liv/helse eller stor skade")}</option><option value="Høy">{tt("Høy – må rettes raskt")}</option><option value="Middels">{tt("Middels")}</option><option value="Lav">{tt("Lav – ikke hastesak")}</option></select></label>
    <label>{tt("Beskrivelse")}<textarea style={inp} rows={3} maxLength={2000} value={f.beskrivelse} onChange={e => set('beskrivelse', e.target.value)} /></label>
    <label>{tt("Bilde (valgfritt)")}<input style={inp} type="file" accept="image/*" capture="environment" onChange={e => setBilde(e.target.files?.[0] || null)} /></label>
    <label>{tt("Navn (valgfritt)")}<input style={inp} value={f.navn} maxLength={80} onChange={e => set('navn', e.target.value)} /></label>
    <label>{tt("E-post eller telefon hvis du vil ha svar (valgfritt)")}<input style={inp} value={f.kontakt} maxLength={120} onChange={e => set('kontakt', e.target.value)} /></label>
    <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px' }}><input tabIndex={-1} autoComplete="off" value={f.nettside} onChange={e => set('nettside', e.target.value)} /></div>
    {err && <p className="banner" role="alert">{tt(err)}</p>}
    <button className="btn pri" disabled={busy}>{busy ? tt("Sender …") : tt("Send melding")}</button>
  </form></div>;
}
