// Tofaktorinnlogging (TOTP) med Supabase Auth MFA: oppsett, innlogging med kode og administrasjon på profilen.
import React, { useEffect, useRef, useState } from 'react';
import { sb, state, toast, signOut, loadMe, useStore, feiltekst } from '../lib/store';

const qrSrc = (q: string) => (q.startsWith('data:') ? q : 'data:image/svg+xml;utf-8,' + encodeURIComponent(q));
const rensKode = (s: string) => s.replace(/\D/g, '').slice(0, 6);

function KodeFelt({ v, set, autoFocus }: { v: string; set: (s: string) => void; autoFocus?: boolean }) {
  return <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={7} value={v} autoFocus={autoFocus}
    onChange={e => set(rensKode(e.target.value))} placeholder="123456"
    style={{ fontSize: 22, letterSpacing: 6, textAlign: 'center', fontFamily: 'ui-monospace, monospace', width: '100%' }} />;
}

// Oppsett: lag faktor, vis QR-kode, bekreft med første kode
export function MfaOppsett({ ferdig, avbryt }: { ferdig: (id: string) => void; avbryt?: () => void }) {
  const [f, setF] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [kode, setKode] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [visNokkel, setVisNokkel] = useState(false);
  const startet = useRef(false);
  useEffect(() => { if (startet.current) return; startet.current = true; (async () => {
    setBusy(true);
    try {
      // Rydd bort påbegynte oppsett som aldri ble bekreftet
      const { data: l } = await sb.auth.mfa.listFactors();
      for (const x of (l?.all || []).filter((x: any) => x.status !== 'verified')) await sb.auth.mfa.unenroll({ factorId: x.id });
      const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Eiendomskontroll ' + new Date().toISOString().slice(0, 16).replace('T', ' ') });
      if (error || !data) throw error || new Error('Kunne ikke starte oppsett');
      setF({ id: data.id, qr: qrSrc(data.totp.qr_code), secret: data.totp.secret });
    } catch (e: any) { setErr(feiltekst(e)); }
    setBusy(false);
  })(); }, []);
  const bekreft = async (e: React.FormEvent) => {
    e.preventDefault(); if (!f || kode.length !== 6) return setErr('Skriv inn den sekssifrede koden fra appen');
    setBusy(true); setErr('');
    const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: f.id, code: kode });
    setBusy(false);
    if (error) { setKode(''); return setErr(/invalid|expired/i.test(error.message) ? 'Koden stemmer ikke. Vent på neste kode i appen og prøv igjen.' : error.message); }
    ferdig(f.id);
  };
  return <form onSubmit={bekreft}>
    <ol className="small" style={{ paddingLeft: 18, margin: '0 0 12px' }}>
      <li>Installer en autentiseringsapp på mobilen, f.eks. <b>Microsoft Authenticator</b> eller <b>Google Authenticator</b>.</li>
      <li>Trykk «+» / «Legg til konto» i appen og skann QR-koden.</li>
      <li>Skriv inn den sekssifrede koden appen viser.</li>
    </ol>
    {f ? <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
      <img src={f.qr} alt="QR-kode for autentiseringsapp" width={180} height={180} style={{ background: '#fff', padding: 8, borderRadius: 8, border: '1px solid var(--line2)' }} />
      <div className="small" style={{ flex: 1, minWidth: 180 }}>
        {visNokkel ? <>Kan du ikke skanne? Legg inn denne nøkkelen manuelt i appen (tidsbasert):<div className="mono" style={{ wordBreak: 'break-all', background: 'var(--bg2, #f4f5f3)', padding: '6px 8px', borderRadius: 6, marginTop: 4, userSelect: 'all' }}>{f.secret}</div></>
          : <a href="#" onClick={e => { e.preventDefault(); setVisNokkel(true); }}>Kan ikke skanne? Vis nøkkel for manuell innlegging</a>}
      </div>
    </div> : <p className="muted">{busy ? 'Lager QR-kode …' : ''}</p>}
    <div className="fld"><label>Kode fra appen</label><KodeFelt v={kode} set={setKode} /></div>
    {err && <div className="err">{err}</div>}
    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
      <button className="btn pri" disabled={busy || !f}>{busy ? 'Vent …' : 'Bekreft og slå på'}</button>
      {avbryt && <button type="button" className="btn" onClick={async () => { if (f) await sb.auth.mfa.unenroll({ factorId: f.id }).catch(() => null); avbryt(); }}>Avbryt</button>}
    </div>
  </form>;
}

// Innlogging: bekreft økten med kode
function MfaKode() {
  const [kode, setKode] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const send = async (e: React.FormEvent) => {
    e.preventDefault(); if (kode.length !== 6) return setErr('Skriv inn den sekssifrede koden');
    setBusy(true); setErr('');
    try {
      const { data: l, error: le } = await sb.auth.mfa.listFactors(); if (le) throw le;
      const fak = (l?.totp || []).filter((x: any) => x.status === 'verified');
      if (!fak.length) throw new Error('Fant ingen autentiseringsapp på brukeren');
      let siste: any = null;
      for (const x of fak) { const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: x.id, code: kode }); if (!error) { siste = null; break; } siste = error; }
      if (siste) throw siste;
      await loadMe();
    } catch (e: any) { setKode(''); setErr(/invalid|expired/i.test(e?.message || '') ? 'Koden stemmer ikke. Vent på neste kode i appen og prøv igjen.' : feiltekst(e)); }
    setBusy(false);
  };
  return <form className="card" onSubmit={send}>
    <h1>Bekreft innlogging</h1>
    <p className="muted" style={{ marginTop: 0 }}>Skriv inn koden fra autentiseringsappen på mobilen{state.mfaEpost ? <> for <b>{state.mfaEpost}</b></> : null}.</p>
    <div className="fld"><KodeFelt v={kode} set={setKode} autoFocus /></div>
    {err && <div className="err">{err}</div>}
    <button className="btn pri" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>{busy ? 'Vent …' : 'Bekreft'}</button>
    <p className="small muted" style={{ marginBottom: 0 }}>Mistet mobilen eller byttet telefon? Be administratoren i organisasjonen din om å nullstille tofaktor for deg.</p>
    <p className="small" style={{ marginBottom: 0 }}><a href="#" onClick={e => { e.preventDefault(); signOut(); }}>Logg ut</a></p>
  </form>;
}

// Skjerm før appen vises: kode ved innlogging, eller påkrevd oppsett
export function MfaSkjerm() {
  if (state.mfa === 'verifiser') return <div className="login"><MfaKode /></div>;
  return <div className="login"><div className="card" style={{ maxWidth: 520 }}>
    <h1>Slå på tofaktorinnlogging</h1>
    <p className="muted" style={{ marginTop: 0 }}>Organisasjonen din krever tofaktorinnlogging for administratorer og forvaltere. Du logger da inn med passord <b>og</b> en kode fra mobilen, slik at ingen kan bruke kontoen din med bare passordet.</p>
    <MfaOppsett ferdig={() => { toast('Tofaktorinnlogging er slått på'); loadMe(); }} />
    <p className="small" style={{ marginBottom: 0 }}><a href="#" onClick={e => { e.preventDefault(); signOut(); }}>Logg ut</a></p>
  </div></div>;
}

// Kort på «Min profil»
export function MfaProfilKort() {
  useStore();
  const [fak, setFak] = useState<any[] | null>(null); const [kreves, setKreves] = useState(false); const [oppsett, setOppsett] = useState<'' | 'ny' | 'bytt'>('');
  const last = async () => {
    const { data } = await sb.auth.mfa.listFactors(); setFak((data?.totp || []).filter((x: any) => x.status === 'verified'));
    const { data: s } = await sb.rpc('mfa_status'); setKreves(!!s?.kreves);
  };
  useEffect(() => { last().catch(() => setFak([])); }, []);
  const slaAv = async () => {
    if (kreves) return toast('Organisasjonen din krever tofaktor for din rolle, så den kan ikke slås av');
    for (const x of fak || []) { const { error } = await sb.auth.mfa.unenroll({ factorId: x.id }); if (error) return toast(feiltekst(error)); }
    await sb.auth.refreshSession().catch(() => null); toast('Tofaktorinnlogging er slått av'); last();
  };
  const paa = (fak || []).length > 0;
  return <div className="card"><h2>Tofaktorinnlogging</h2>
    {fak === null ? <p className="muted">Laster …</p> : oppsett ? <MfaOppsett ferdig={async id => { if (oppsett === 'bytt') for (const x of fak || []) if (x.id !== id) await sb.auth.mfa.unenroll({ factorId: x.id }).catch(() => null); toast(oppsett === 'bytt' ? 'Ny autentiseringsapp er tatt i bruk – den gamle virker ikke lenger' : 'Tofaktorinnlogging er slått på'); setOppsett(''); last(); }} avbryt={() => setOppsett('')} /> : <>
      <p style={{ marginTop: 0 }}>{paa ? <><span style={{ color: 'var(--green, #1f6f5c)', fontWeight: 600 }}>✓ På.</span> Du logger inn med passord og kode fra autentiseringsappen.</>
        : <><span style={{ color: 'var(--amber)', fontWeight: 600 }}>Av.</span> Slå på for å beskytte kontoen mot stjålne passord.</>}</p>
      {kreves && <p className="small muted">Påkrevd for din rolle i organisasjonen.</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        {!paa && <button className="btn pri" onClick={() => setOppsett('ny')}>Slå på tofaktor</button>}
        {paa && <button className="btn" onClick={() => setOppsett('bytt')}>Bytt telefon / app</button>}
        {paa && !kreves && <button className="btn danger" onClick={slaAv}>Slå av</button>}
      </div>
    </>}
  </div>;
}
