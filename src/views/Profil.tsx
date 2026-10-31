import React, { useState } from 'react';
import { rolleNavn, sb, signOut, state, toast, useStore, feiltekst } from '../lib/store';

export function Profil() {
  useStore();
  const me = state.me!; const [navn, setNavn] = useState(me.navn || ''); const [pw, setPw] = useState(''); const [pw2, setPw2] = useState('');
  const lagreNavn = async () => { const { error } = await sb.rpc('oppdater_min_profil', { p_navn: navn }); if (error) toast(feiltekst(error)); else { me.navn = navn; toast('Navnet er lagret'); } };
  const lagrePw = async () => { if (pw.length < 8) return toast('Passordet må ha minst 8 tegn'); if (pw !== pw2) return toast('Passordene er ikke like'); const { error } = await sb.auth.updateUser({ password: pw }); if (error) toast(error.message); else { setPw(''); setPw2(''); toast('Passordet er endret'); } };
  return <>
    <div className="head"><div className="grow"><h1>Min profil</h1><p className="sub">{me.epost} · {rolleNavn(me.rolle)}</p></div><button className="btn" onClick={() => signOut()}>Logg ut</button></div>
    <div className="grid g2">
      <div className="card"><h2>Navn</h2><div className="form"><div className="fld"><label>Navn som vises for andre</label><input value={navn} onChange={e => setNavn(e.target.value)} /></div></div><button className="btn pri" style={{ marginTop: 10 }} onClick={lagreNavn}>Lagre</button></div>
      <div className="card"><h2>Bytt passord</h2><div className="form"><div className="fld half"><label>Nytt passord</label><input type="password" value={pw} onChange={e => setPw(e.target.value)} /></div><div className="fld half"><label>Gjenta</label><input type="password" value={pw2} onChange={e => setPw2(e.target.value)} /></div></div><button className="btn pri" style={{ marginTop: 10 }} onClick={lagrePw}>Bytt passord</button></div>
    </div>
  </>;
}
