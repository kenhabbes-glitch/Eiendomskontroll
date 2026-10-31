import React, { useState } from 'react';
import { COLS, ROLLER, S, adminApi, reloadAdmin, rolleNavn, sb, save, state, toast, useStore, type Col, feiltekst } from '../lib/store';
import { eNavn, fdt, lNavn, sortBy } from '../lib/utils';
import { Chip, Empty, confirmBox, formModal, openModal, showModal, textModal, type Field } from '../components/ui';
import { Search, Sel, useFilter } from './common';

const RETT: [string, string, string, string, string][] = [
  // funksjon, admin, forvalter, tekniker, leietaker
  ['Se eiendommer', 'Alle', 'Tildelte', 'Tildelte', 'Egen'],
  ['Opprette/slette eiendommer', '✓', '–', '–', '–'],
  ['Redigere eiendomsdata', '✓', '✓', '–', '–'],
  ['Systemer og komponenter (TFM)', 'Endre', 'Endre', 'Lese', '–'],
  ['Kontrollplan', 'Endre', 'Endre', 'Lese', '–'],
  ['Registrere utført kontroll', '✓', '✓', '✓', '–'],
  ['Avvik', 'Alle', 'Tildelte', 'Tildelte', 'Melde og se egne'],
  ['Dokumenter', 'Alle', 'Tildelte', 'Tekniske (ikke leieavtaler)', 'Egne'],
  ['Leietakere og leieavtaler', '✓', '✓', '–', 'Eget leieforhold'],
  ['Bekrefte internkontrollplikter', '✓', '✓', '–', 'Egne'],
  ['Tegninger og arealoppgave', 'Endre', 'Endre', 'Lese', '–'],
  ['Økonomi (kostnader, vedlikeholdsplan)', '✓', '✓', '–', '–'],
  ['Brukere, roller og tilganger', '✓', '–', '–', '–'],
];

export function inviter(preset: any = {}) {
  const fields: Field[] = [
    { k: 'navn', label: 'Navn', req: true, half: true }, { k: 'epost', label: 'E-post', type: 'email', req: true, half: true },
    { k: 'rolle', label: 'Rolle', type: 'select', options: ROLLER.filter(r => r[0] !== 'ingen').map(r => [r[0], r[1]] as [string, string]), def: 'tekniker' },
    { k: 'info', type: 'custom', render: v => <p className="small muted" style={{ margin: 0 }}>{ROLLER.find(r => r[0] === v.rolle)?.[2]}</p> },
    { k: 'eiendommer', type: 'custom', label: 'Tilgang til eiendommer', show: v => v.rolle === 'forvalter' || v.rolle === 'tekniker', def: [], render: (v, set) => <EiendomPicker val={v.eiendommer || []} set={x => set({ eiendommer: x })} /> },
    { k: 'leietaker_id', label: 'Leietaker', type: 'select', options: () => sortBy(S.leietakere, l => l.navn).map(l => [l.id, l.navn + ' – ' + eNavn(l.eiendomId)] as [string, string]), empty: '– velg –', show: v => v.rolle === 'leietaker', req: true },
  ];
  formModal({
    title: 'Inviter bruker', fields, values: preset, saveTxt: 'Send invitasjon',
    top: <p className="small" style={{ marginTop: 0 }}>Brukeren får en e-post med lenke for å velge passord og logge inn.</p>,
    onSave: async v => {
      if (v.rolle === 'leietaker' && !v.leietaker_id) { toast('Velg leietaker'); return false; }
      try { await adminApi({ action: 'inviter', epost: v.epost.trim(), navn: v.navn, rolle: v.rolle, leietaker_id: v.rolle === 'leietaker' ? v.leietaker_id : null, eiendommer: ['forvalter', 'tekniker'].includes(v.rolle) ? v.eiendommer : [], redirectTo: location.origin }); }
      catch (e: any) { toast('Invitasjon feilet: ' + e.message); return false; }
      await reloadAdmin(); toast('Invitasjon sendt til ' + v.epost);
    },
  });
}
function EiendomPicker({ val, set }: { val: string[]; set: (v: string[]) => void }) {
  const E = sortBy(S.eiendommer, e => e.navn);
  if (!E.length) return <p className="small muted">Ingen eiendommer registrert ennå.</p>;
  return <><div className="checks" style={{ maxHeight: 220 }}>{E.map(e => <label key={e.id}><input type="checkbox" checked={val.includes(e.id)} onChange={ev => set(ev.target.checked ? [...val, e.id] : val.filter(x => x !== e.id))} /><span className="ct">{e.navn}</span></label>)}</div>
    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}><button type="button" className="btn sm" onClick={() => set(E.map(e => e.id))}>Velg alle</button><button type="button" className="btn sm" onClick={() => set([])}>Ingen</button></div></>;
}
function editBruker(p: any) {
  const egne = S.tilganger.filter(t => t.user_id === p.id).map(t => t.eiendom_id);
  const admins = S.profiles.filter(x => x.rolle === 'admin' && x.aktiv);
  const fields: Field[] = [
    { k: 'navn', label: 'Navn', half: true }, { k: 'epost', label: 'E-post', half: true, hint: 'E-post endres av brukeren selv' },
    { k: 'rolle', label: 'Rolle', type: 'select', options: ROLLER.map(r => [r[0], r[1]] as [string, string]) },
    { k: 'info', type: 'custom', render: v => <p className="small muted" style={{ margin: 0 }}>{ROLLER.find(r => r[0] === v.rolle)?.[2]}</p> },
    { k: 'eiendommer', type: 'custom', label: 'Tilgang til eiendommer', show: v => v.rolle === 'forvalter' || v.rolle === 'tekniker', render: (v, set) => <EiendomPicker val={v.eiendommer || []} set={x => set({ eiendommer: x })} /> },
    { k: 'leietaker_id', label: 'Leietaker', type: 'select', options: () => sortBy(S.leietakere, l => l.navn).map(l => [l.id, l.navn + ' – ' + eNavn(l.eiendomId)] as [string, string]), empty: '– velg –', show: v => v.rolle === 'leietaker' },
    { k: 'aktiv', label: 'Aktiv (kan logge inn og se data)', type: 'checkbox' }];
  formModal({
    title: p.navn || p.epost, fields, values: { ...p, eiendommer: egne },
    extraFoot: close => p.id !== state.me?.id ? <><button className="btn danger" onClick={async () => { if (await confirmBox(`Slette brukeren ${p.epost} permanent? Historikk de har registrert beholdes.`)) { try { await adminApi({ action: 'slett', user_id: p.id }); await reloadAdmin(); toast('Bruker slettet'); close(); } catch (e: any) { toast(e.message); } } }}>Slett bruker</button>
      <button className="btn" onClick={async () => { const { error } = await sb.auth.resetPasswordForEmail(p.epost, { redirectTo: location.origin }); toast(error ? error.message : 'Lenke for nytt passord er sendt'); }}>Send ny innloggingslenke</button></> : null,
    onSave: async v => {
      if (p.id === state.me?.id && (v.rolle !== 'admin' || !v.aktiv) && admins.length <= 1) { toast('Du er eneste administrator og kan ikke fjerne din egen administratorrolle'); return false; }
      if (v.rolle === 'leietaker' && !v.leietaker_id) { toast('Velg leietaker'); return false; }
      const { error } = await sb.from('profiles').update({ navn: v.navn, rolle: v.rolle, aktiv: v.aktiv, leietaker_id: v.rolle === 'leietaker' ? v.leietaker_id : null }).eq('id', p.id);
      if (error) { toast(feiltekst(error)); return false; }
      const want: string[] = ['forvalter', 'tekniker'].includes(v.rolle) ? v.eiendommer || [] : [];
      const del = egne.filter(x => !want.includes(x)); const add = want.filter(x => !egne.includes(x));
      if (del.length) await sb.from('eiendom_tilgang').delete().eq('user_id', p.id).in('eiendom_id', del);
      if (add.length) await sb.from('eiendom_tilgang').insert(add.map(e => ({ user_id: p.id, eiendom_id: e })));
      await reloadAdmin(); toast('Bruker oppdatert');
    },
  });
}

export function Brukere() {
  useStore();
  const [f, setF] = useFilter('brukere', { r: '', q: '' });
  let L = S.profiles.slice(); if (f.r) L = L.filter(p => p.rolle === f.r);
  if (f.q) { const q = f.q.toLowerCase(); L = L.filter(p => ((p.navn || '') + ' ' + (p.epost || '')).toLowerCase().includes(q)); }
  const venter = S.profiles.filter(p => p.rolle === 'ingen' && p.aktiv);
  return <>
    <div className="head"><div className="grow"><h1>Brukere og roller</h1><p className="sub">{S.profiles.length} brukere · Rollen bestemmer hva brukeren kan se og gjøre, og tilgangen håndheves i databasen</p></div><button className="btn pri" onClick={() => inviter()}>+ Inviter bruker</button></div>
    {venter.length > 0 && <div className="banner info">{venter.length} bruker(e) venter på å få tildelt rolle.</div>}
    <div className="toolbar"><Search value={f.q} onChange={q => setF({ q })} /><Sel value={f.r} onChange={r => setF({ r })} opts={ROLLER.map(r => [r[0], r[1]] as [string, string])} empty="Alle roller" /><span className="muted small">{L.length} brukere</span></div>
    {L.length ? <div className="tbl-wrap"><table><thead><tr><th>Navn</th><th>E-post</th><th>Rolle</th><th>Tilgang</th><th>Status</th><th>Opprettet</th></tr></thead><tbody>
      {sortBy(L, p => (p.rolle === 'ingen' ? '0' : '1') + (p.navn || p.epost)).map(p => { const eg = S.tilganger.filter(t => t.user_id === p.id);
        return <tr key={p.id} className="click" onClick={() => editBruker(p)}><td><b style={{ fontWeight: 500 }}>{p.navn || '–'}</b>{p.id === state.me?.id && <span className="muted small"> (deg)</span>}</td><td className="small">{p.epost}</td>
          <td><Chip c={p.rolle === 'admin' ? 'blue' : p.rolle === 'ingen' ? 'amber' : p.rolle === 'leietaker' ? '' : 'green'}>{rolleNavn(p.rolle)}</Chip></td>
          <td className="small">{p.rolle === 'admin' ? 'Alle eiendommer' : p.rolle === 'leietaker' ? lNavn(p.leietaker_id) || '–' : eg.length ? (eg.length <= 2 ? eg.map(t => eNavn(t.eiendom_id)).join(', ') : `${eg.length} eiendommer`) : <span style={{ color: 'var(--amber)' }}>Ingen eiendommer</span>}</td>
          <td>{p.aktiv ? <Chip c="green">Aktiv</Chip> : <Chip>Deaktivert</Chip>}</td><td className="small muted">{fdt(p.created_at)}</td></tr>; })}
    </tbody></table></div> : <div className="card"><Empty t="Ingen brukere" /></div>}
    <div className="sec"><h2>Hva rollene kan</h2><div className="tbl-wrap"><table className="permtbl"><thead><tr><th>Funksjon</th>{ROLLER.slice(0, 4).map(r => <th key={r[0]}>{r[1]}</th>)}</tr></thead><tbody>
      {RETT.map(r => <tr key={r[0]}><td>{r[0]}</td>{r.slice(1).map((c, i) => <td key={i} className={c === '–' ? 'no' : c === '✓' ? 'yes' : 'small'}>{c}</td>)}</tr>)}
    </tbody></table></div><p className="small muted">Forvalter og tekniker ser bare eiendommer de har fått tilgang til. Leietakere ser bare sitt eget leieforhold. Reglene håndheves i databasen (Row Level Security), ikke bare i skjermbildene.</p></div>
  </>;
}

// ---------------- Import / eksport
const REF_KEYS = ['eiendomId', 'anleggId', 'leietakerId', 'oppgaveId', 'komponentId', 'dokId'];
export function DataAdmin() {
  useStore();
  const [busy, setBusy] = useState('');
  const eksport = () => { const d = { versjon: 2, eksportert: new Date().toISOString(), ...Object.fromEntries(COLS.map(c => [c, S[c]])) }; textModal('Eksport (JSON)', JSON.stringify(d), 'Lagre teksten i en fil som sikkerhetskopi. Filer (PDF/bilder) ligger i Supabase Storage og er ikke med.'); };
  const importer = () => {
    let txt = '';
    openModal({ wide: true, render: close => <>
      <div className="mh"><h2>Importer data</h2><button className="btn ghost sm" onClick={close}>✕</button></div>
      <div className="mb"><p style={{ marginTop: 0 }} className="small">Lim inn JSON fra «Sikkerhetskopi og data» i prototypen eller fra en eksport her. Alle poster får nye ID-er, og koblinger mellom eiendom, systemer, kontroller, avvik, leietakere og dokumenter beholdes. Opplastede filer fra prototypen følger ikke med.</p>
        <textarea className="codebox" style={{ minHeight: 220 }} onChange={e => { txt = e.target.value; }} /></div>
      <div className="mf"><button className="btn" onClick={close}>Avbryt</button><button className="btn pri" onClick={async () => {
        let d: any; try { d = JSON.parse(txt); } catch { toast('Ugyldig JSON'); return; }
        close(); setBusy('Importerer …');
        try {
          const map: Record<string, string> = {}; const nid = (old: string) => old ? (map[old] = map[old] || crypto.randomUUID()) : '';
          COLS.forEach(c => (d[c] || []).forEach((r: any) => r?.id && nid(r.id)));
          const fix = (o: any): any => { if (Array.isArray(o)) return o.map(fix); if (o && typeof o === 'object') { const n: any = {}; for (const k in o) { const v = o[k]; n[k] = REF_KEYS.includes(k) && typeof v === 'string' && map[v] ? map[v] : k === 'avvik' && Array.isArray(v) ? v.map((x: any) => map[x] || x) : fix(v); } return n; } return o; };
          let n = 0; const order: Col[] = ['eiendommer', 'leietakere', 'anlegg', 'komponenter', 'oppgaver', 'avvik', 'dokumenter', 'tegninger'];
          for (const c of order) for (const r of (d[c] || [])) { if (!r?.id) continue; const o = fix({ ...r }); o.id = map[r.id]; delete o.nr; delete o.fil; delete o.vedlegg; if (c === 'tegninger') continue; await save(c, o); n++; if (n % 10 === 0) setBusy(`Importerer … ${n}`); }
          toast(`${n} poster importert`);
        } catch (e: any) { toast('Import stoppet: ' + feiltekst(e)); }
        setBusy('');
      }}>Importer</button></div></> });
  };
  return <>
    <div className="head"><div className="grow"><h1>Import og eksport</h1><p className="sub">Sikkerhetskopi og flytting av data</p></div></div>
    <div className="grid g2">
      <div className="card"><h2>Eksporter</h2><p className="small muted">Alle data du har tilgang til som JSON. Supabase tar i tillegg daglig sikkerhetskopi av databasen på betalte planer.</p><button className="btn" onClick={eksport}>Eksporter alle data</button></div>
      <div className="card"><h2>Importer</h2><p className="small muted">Hent inn data fra prototypen («Sikkerhetskopi og data» → «Kopier alle data») eller fra en eksport. Tegninger må lastes opp på nytt.</p><button className="btn pri" disabled={!!busy} onClick={importer}>{busy || 'Importer data'}</button></div>
    </div>
  </>;
}
