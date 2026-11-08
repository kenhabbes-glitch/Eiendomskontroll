// Offentlig side: registrer ny kunde med 30 dagers prøveperiode
import React, { useEffect, useState } from 'react';
import { hentEnhet } from '../lib/oppslag';
import { VILKAR_VERSJON, VilkarTekst } from '../components/Vilkar';
import { PersonvernTekst } from '../components/Personvern';

const TYPER: [string, string][] = [['eier', 'Gårdeier / eiendomsselskap'], ['forvalter', 'Forvaltningsselskap'], ['drift', 'Driftsselskap'], ['service', 'Servicefirma']];

export function Registrer() {
  const [f, setF] = useState({ orgnr: '', type: 'eier', navn: '', epost: '', nettside: '' }); const [samtykke, setSamtykke] = useState(false);
  const [enhet, setEnhet] = useState<{ navn: string; form?: string; feil?: string } | null>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [ferdig, setFerdig] = useState('');
  const [vis, setVis] = useState<'' | 'vilkar' | 'personvern'>('');
  const set = (k: string, v: string) => setF(o => ({ ...o, [k]: v }));
  const nr = f.orgnr.replace(/\D/g, '');
  useEffect(() => { setEnhet(null); if (nr.length !== 9) return; let av = false;
    hentEnhet(nr).then((e: any) => { if (av) return; setEnhet(!e ? { navn: '', feil: 'Fant ikke organisasjonsnummeret' } : e.slettet ? { navn: e.navn, feil: 'Organisasjonen er slettet' } : e.konkurs || e.avvikling || e.tvangsavvikling ? { navn: e.navn, feil: 'Organisasjonen er konkurs eller under avvikling' } : { navn: e.navn, form: e.orgform }); }).catch(() => !av && setEnhet(null));
    return () => { av = true; }; }, [nr]);
  const send = async (e: React.FormEvent) => { e.preventDefault(); setErr('');
    if (!samtykke) return setErr('Du må godta vilkårene og databehandleravtalen');
    setBusy(true);
    try { const r = await fetch('/.netlify/functions/registrer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...f, orgnr: nr, samtykke: true, vilkaar: VILKAR_VERSJON, redirectTo: location.origin + '/' }) });
      const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Registreringen feilet'); setFerdig(j.firmanavn || enhet?.navn || ''); }
    catch (x: any) { setErr(x.message); } finally { setBusy(false); } };

  if (vis) return <div className="login"><div className="card" style={{ maxWidth: 760, maxHeight: '90vh', overflow: 'auto' }}>{vis === 'vilkar' ? <VilkarTekst /> : <PersonvernTekst />}<p><button className="btn" onClick={() => setVis('')}>Tilbake til registreringen</button></p></div></div>;
  if (ferdig) return <div className="login"><div className="card" style={{ maxWidth: 520 }}>
    <h1>Sjekk e-posten din</h1>
    <p><b>{ferdig}</b> er registrert med 30 dagers gratis prøveperiode på alle moduler.</p>
    <p>Vi har sendt en invitasjon til <b>{f.epost}</b>. Trykk på lenken i e-posten for å sette passord og logge inn. Finner du den ikke, sjekk søppelpost.</p>
    <p className="small muted">Når du er logget inn, kan du legge inn eiendommene og invitere kollegaer under «Organisasjon og tilgang».</p>
    <a className="btn" href="#/">Til innlogging</a></div></div>;
  return <div className="login"><form className="card" onSubmit={send} style={{ maxWidth: 520 }}>
    <h1>Prøv Eiendomskontroll</h1>
    <p className="muted" style={{ marginTop: 0 }}>30 dager gratis med alle moduler. Ingen betalingskort. Prøveperioden avsluttes av seg selv.</p>
    <div className="fld"><label>Organisasjonsnummer</label><input inputMode="numeric" value={f.orgnr} onChange={e => set('orgnr', e.target.value)} placeholder="9 siffer" required autoFocus />
      {enhet && (enhet.feil ? <div className="err" style={{ marginTop: 4 }}>{enhet.feil}</div> : <div className="small" style={{ marginTop: 4 }}>✓ <b>{enhet.navn}</b>{enhet.form ? ' · ' + enhet.form : ''}</div>)}</div>
    <div className="fld"><label>Hva slags virksomhet?</label><select value={f.type} onChange={e => set('type', e.target.value)}>{TYPER.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
    <div className="fld"><label>Ditt navn</label><input value={f.navn} onChange={e => set('navn', e.target.value)} autoComplete="name" required /></div>
    <div className="fld"><label>Din e-post (jobb)</label><input type="email" value={f.epost} onChange={e => set('epost', e.target.value)} autoComplete="email" required /><div className="small muted" style={{ marginTop: 4 }}>Du blir administrator for organisasjonen og får en e-post for å sette passord.</div></div>
    <div style={{ position: 'absolute', left: -9999, width: 1, height: 1, overflow: 'hidden' }} aria-hidden="true"><label>Nettside<input tabIndex={-1} autoComplete="off" value={f.nettside} onChange={e => set('nettside', e.target.value)} /></label></div>
    <label className="small" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', margin: '10px 0' }}><input type="checkbox" checked={samtykke} onChange={e => setSamtykke(e.target.checked)} style={{ marginTop: 3 }} />
      <span>Jeg godtar på vegne av organisasjonen <a href="#" onClick={e => { e.preventDefault(); setVis('vilkar'); }}>vilkårene og databehandleravtalen</a>, og har lest <a href="#" onClick={e => { e.preventDefault(); setVis('personvern'); }}>personvernerklæringen</a>.</span></label>
    {err && <div className="err">{err}</div>}
    <button className="btn pri" style={{ width: '100%', justifyContent: 'center' }} disabled={busy || !!enhet?.feil}>{busy ? 'Registrerer …' : 'Start prøveperioden'}</button>
    <p className="small" style={{ marginBottom: 0 }}>Har du allerede bruker? <a href="#/">Logg inn</a></p>
  </form></div>;
}
