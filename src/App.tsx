import React, { useEffect, useState } from 'react';
import { canEdit, configured, initAuth, isAdmin, isStaff, isTenant, rolleNavn, sb, signOut, state, useStore, toast, S } from './lib/store';
import { activeTasks, dUntil, openAvvik } from './lib/utils';
import { ModalHost, Tip, Toast } from './components/ui';
import { Oversikt } from './views/Oversikt';
import { Eiendommer, Eiendom } from './views/Eiendommer';
import { Kontrollplan } from './views/Kontrollplan';
import { AvvikView } from './views/Avvik';
import { Leietakere, LeietakerView } from './views/Leietakere';
import { Dokumenter } from './views/Dokumenter';
import { Vedlikehold } from './views/Vedlikehold';
import { TfmRegister } from './views/Tfm';
import { Arealer } from './views/Arealer';
import { Regelverk } from './views/Regelverk';
import { Brukere, DataAdmin } from './views/Brukere';
import { Portal } from './views/Portal';
import { Profil } from './views/Profil';

export function go(path: string) { if (location.hash === '#/' + path) window.dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = '#/' + path; }
function useRoute() {
  const [h, setH] = useState(location.hash);
  useEffect(() => { const f = () => { setH(location.hash); window.scrollTo(0, 0); }; window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
  const p = h.replace(/^#\/?/, '').split('/');
  return { v: p[0] || '', id: p[1] };
}

const I: Record<string, string> = {
  oversikt: 'M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z',
  eiendommer: 'M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6',
  kontroller: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2zM9 16l2 2 4-4',
  avvik: 'M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z',
  leietakere: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.9M16 3.1a4 4 0 010 7.8',
  tfm: 'M20.6 13.4l-7.2 7.2a2 2 0 01-2.8 0L2 12V2h10l8.6 8.6a2 2 0 010 2.8zM7 7h.01',
  arealer: 'M3 3h18v18H3zM3 12h9M12 3v18M12 16h9',
  dokumenter: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M8 13h8M8 17h8',
  vedlikehold: 'M3 3v18h18M7 15l4-4 3 3 5-6',
  regelverk: 'M4 19.5A2.5 2.5 0 016.5 17H20V2H6.5A2.5 2.5 0 004 4.5zM4 19.5A2.5 2.5 0 006.5 22H20v-5',
  brukere: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
  portal: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z',
  data: 'M4 7c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 7v10c0 1.7 3.6 3 8 3s8-1.3 8-3V7M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
};

function navFor(): [string, string][] {
  if (isTenant()) return [['portal', 'Mitt leieforhold'], ['regelverk', 'Plikter og regelverk']];
  const n: [string, string][] = [['oversikt', 'Oversikt'], ['eiendommer', 'Eiendommer'], ['kontroller', 'Kontrollplan'], ['avvik', 'Avvik']];
  if (canEdit()) n.push(['leietakere', 'Leietakere']);
  n.push(['tfm', 'TFM-register'], ['arealer', 'Tegninger og arealer'], ['dokumenter', 'Dokumenter']);
  if (canEdit()) n.push(['vedlikehold', 'Vedlikeholdsplan']);
  n.push(['regelverk', 'Regelverk og plikter']);
  if (isAdmin()) n.push(['brukere', 'Brukere og roller'], ['data', 'Import og eksport']);
  return n;
}

export default function App() {
  useEffect(() => { initAuth(); }, []);
  useStore();
  const r = useRoute();
  if (!configured) return <Setup />;
  if (!state.ready) return <div className="login"><div className="card"><p>Laster …</p></div></div>;
  if (state.recovery && state.me) return <SetPassword />;
  if (!state.me) return <Login />;
  if (state.me.rolle === 'ingen') return <NoAccess />;

  const nav = navFor();
  const def = isTenant() ? 'portal' : 'oversikt';
  let v = r.v || def;
  if (!nav.some(n => n[0] === v) && !['eiendom', 'leietaker', 'profil'].includes(v)) v = def;
  if (v === 'leietaker' && !canEdit()) v = def;
  if (v === 'eiendom' && !isStaff()) v = def;
  const cur = v === 'eiendom' ? 'eiendommer' : v === 'leietaker' ? 'leietakere' : v;
  const forf = isStaff() ? activeTasks().filter(o => (dUntil(o.nesteFrist) as number) < 0).length : 0;
  const avv = isStaff() ? openAvvik().filter(a => (a.frist && (dUntil(a.frist) as number) < 0) || a.alv === 'Kritisk').length : 0;
  const me = state.me;
  const ini = (me.navn || me.epost || '?').split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase();

  let body: React.ReactNode;
  switch (v) {
    case 'oversikt': body = <Oversikt />; break;
    case 'eiendommer': body = <Eiendommer />; break;
    case 'eiendom': body = <Eiendom id={r.id!} />; break;
    case 'kontroller': body = <Kontrollplan />; break;
    case 'avvik': body = <AvvikView />; break;
    case 'leietakere': body = <Leietakere />; break;
    case 'leietaker': body = <LeietakerView id={r.id!} />; break;
    case 'tfm': body = <TfmRegister />; break;
    case 'arealer': body = <Arealer />; break;
    case 'dokumenter': body = <Dokumenter />; break;
    case 'vedlikehold': body = <Vedlikehold />; break;
    case 'regelverk': body = <Regelverk />; break;
    case 'brukere': body = <Brukere />; break;
    case 'data': body = <DataAdmin />; break;
    case 'portal': body = <Portal />; break;
    case 'profil': body = <Profil />; break;
  }
  return <div id="app">
    <aside id="side">
      <div className="brand"><b>Eiendomskontroll</b><span>Drift · kontroll · dokumentasjon</span></div>
      <nav id="nav">{nav.map(([k, l]) => <a key={k} href={'#/' + k} className={cur === k ? 'on' : ''}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={I[k]} /></svg>{l}
        {k === 'kontroller' && forf > 0 && <span className="n">{forf}</span>}{k === 'avvik' && avv > 0 && <span className="n">{avv}</span>}
      </a>)}</nav>
      <div className="sidefoot">
        <a className="userbox" href="#/profil" style={{ textDecoration: 'none' }}><span className="av">{ini}</span><span><div style={{ color: '#fff' }}>{me.navn || me.epost}</div><div className="r">{rolleNavn(me.rolle)}</div></span></a>
        <button onClick={() => signOut()}>Logg ut</button>
      </div>
    </aside>
    <main id="main">
      {state.error && <div className="banner">{state.error}</div>}
      {state.loading && !S.eiendommer.length ? <div className="empty"><b>Laster data …</b></div> : body}
    </main>
    <ModalHost /><Toast /><Tip />
  </div>;
}

function Login() {
  const [ep, setEp] = useState(''); const [pw, setPw] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [glemt, setGlemt] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setBusy(true);
    if (glemt) {
      const { error } = await sb.auth.resetPasswordForEmail(ep, { redirectTo: location.origin });
      setBusy(false); if (error) setErr(error.message); else { toast('Sjekk e-posten din for lenke til nytt passord'); setGlemt(false); }
      return;
    }
    const { error } = await sb.auth.signInWithPassword({ email: ep, password: pw });
    setBusy(false); if (error) setErr(error.message === 'Invalid login credentials' ? 'Feil e-post eller passord' : error.message);
  };
  return <div className="login"><form className="card" onSubmit={submit}>
    <h1>Eiendomskontroll</h1><p className="muted" style={{ marginTop: 0 }}>{glemt ? 'Få tilsendt lenke for å sette nytt passord.' : 'Logg inn for å fortsette.'}</p>
    <div className="fld"><label>E-post</label><input type="email" value={ep} onChange={e => setEp(e.target.value)} autoFocus required /></div>
    {!glemt && <div className="fld"><label>Passord</label><input type="password" value={pw} onChange={e => setPw(e.target.value)} required /></div>}
    {err && <div className="err">{err}</div>}
    <button className="btn pri" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>{busy ? 'Vent …' : glemt ? 'Send lenke' : 'Logg inn'}</button>
    <p className="small" style={{ marginBottom: 0 }}><a href="#" onClick={e => { e.preventDefault(); setGlemt(!glemt); setErr(''); }}>{glemt ? 'Tilbake til innlogging' : 'Glemt passord?'}</a></p>
    <p className="small muted" style={{ marginBottom: 0 }}>Har du ikke bruker? Kontakt administratoren for å få en invitasjon.</p>
    <Toast />
  </form></div>;
}
function SetPassword() {
  const [pw, setPw] = useState(''); const [pw2, setPw2] = useState(''); const [err, setErr] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (pw.length < 8) return setErr('Passordet må ha minst 8 tegn'); if (pw !== pw2) return setErr('Passordene er ikke like');
    const { error } = await sb.auth.updateUser({ password: pw });
    if (error) return setErr(error.message);
    state.recovery = false; history.replaceState(null, '', location.pathname); toast('Passordet er lagret'); location.hash = '';
  };
  return <div className="login"><form className="card" onSubmit={submit}><h1>Velg passord</h1><p className="muted" style={{ marginTop: 0 }}>Velkommen{state.me?.navn ? ', ' + state.me.navn : ''}! Velg et passord du bruker for å logge inn.</p>
    <div className="fld"><label>Nytt passord</label><input type="password" value={pw} onChange={e => setPw(e.target.value)} autoFocus /></div>
    <div className="fld"><label>Gjenta passord</label><input type="password" value={pw2} onChange={e => setPw2(e.target.value)} /></div>
    {err && <div className="err">{err}</div>}<button className="btn pri" style={{ width: '100%', justifyContent: 'center' }}>Lagre passord</button><Toast /></form></div>;
}
function NoAccess() {
  return <div className="login"><div className="card"><h1>Venter på tilgang</h1><p>Du er logget inn som <b>{state.me?.epost}</b>, men har ikke fått tildelt en rolle ennå. Be administratoren om å gi deg tilgang.</p><button className="btn" onClick={() => signOut()}>Logg ut</button></div></div>;
}
function Setup() {
  return <div className="login"><div className="card" style={{ maxWidth: 560 }}><h1>Oppsett mangler</h1><p>Appen finner ikke tilkoblingen til Supabase. Legg inn miljøvariablene <code>VITE_SUPABASE_URL</code> og <code>VITE_SUPABASE_ANON_KEY</code> i Netlify (Site configuration → Environment variables) og publiser på nytt. Se README.md i repoet.</p></div></div>;
}
