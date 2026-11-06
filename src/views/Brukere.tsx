import React, { useState } from 'react';
import { Hjelp } from '../components/Hjelp';
import { COLS, ROLLER, S, adminApi, reloadAdmin, rolleNavn, sb, save, removeDoc, state, toast, useStore, type Col, feiltekst } from '../lib/store';
import { eNavn, fdt, lNavn, sortBy, today } from '../lib/utils';
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

// Inviter leietakerbruker (fra leietakersiden). Ansatte legges til under Organisasjon og tilgang.
export function inviter(preset: any = {}) {
  formModal({
    title: 'Inviter bruker for leietakeren', values: preset, saveTxt: 'Send invitasjon',
    fields: [{ k: 'navn', label: 'Navn', req: true, half: true }, { k: 'epost', label: 'E-post', type: 'email', req: true, half: true }],
    top: <p className="small" style={{ marginTop: 0 }}>Brukeren får e-post med lenke for å velge passord, og ser bare sitt eget leieforhold.</p>,
    onSave: async v => {
      if (!(await confirmBox(`Sende invitasjon på e-post til ${v.epost.trim()}? Er testmodus på, sendes den ikke.`, 'Send invitasjon'))) return false;
      try { await adminApi({ action: 'inviter', rolle: 'leietaker', leietaker_id: preset.leietaker_id, epost: v.epost.trim(), navn: v.navn, redirectTo: location.origin }); }
      catch (e: any) { toast('Invitasjon feilet: ' + e.message); return false; }
      await reloadAdmin(); toast('Invitasjon sendt til ' + v.epost);
    },
  });
}
export { Organisasjon as Brukere } from './Organisasjon';

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
    <div className="head"><div className="grow"><h1>Import og eksport<Hjelp id="side.data" /></h1><p className="sub">Sikkerhetskopi og flytting av data</p></div></div>
    <div className="grid g2">
      <div className="card"><h2>Eksporter</h2><p className="small muted">Alle data du har tilgang til som JSON. Supabase tar i tillegg daglig sikkerhetskopi av databasen på betalte planer.</p><button className="btn" onClick={eksport}>Eksporter alle data</button></div>
      <div className="card"><h2>Importer</h2><p className="small muted">Hent inn data fra prototypen («Sikkerhetskopi og data» → «Kopier alle data») eller fra en eksport. Tegninger må lastes opp på nytt.</p><button className="btn pri" disabled={!!busy} onClick={importer}>{busy || 'Importer data'}</button></div>
    </div>
  </>;
}

// ---------------- Testbrukere
type TB = { slug: string; navn: string; rolle: string; gruppe: string; lt?: number };
const TEST_LT = [
  { navn: 'Kafé Havnekanten AS (test)', lokale: '1. etasje, øst', kontakt: 'Lise Kafé', virksomhet: 'Servering' },
  { navn: 'Regnskapshuset Nord AS (test)', lokale: '2. etasje', kontakt: 'Rune Regnskap', virksomhet: 'Kontor' },
  { navn: 'Fysio Sentrum AS (test)', lokale: '1. etasje, vest', kontakt: 'Frida Fysio', virksomhet: 'Helse' },
];
const TEST_BRUKERE: TB[] = [
  { slug: 'eier', navn: 'Ola Eier (test)', rolle: 'admin', gruppe: 'Eier' },
  { slug: 'driftsleder1', navn: 'Kari Driftsleder (test)', rolle: 'forvalter', gruppe: 'Driftsleder' },
  { slug: 'driftsleder2', navn: 'Per Driftsleder (test)', rolle: 'forvalter', gruppe: 'Driftsleder' },
  { slug: 'driftstekniker', navn: 'Dag Driftstekniker (test)', rolle: 'tekniker', gruppe: 'Driftstekniker' },
  { slug: 'service-brann', navn: 'Brannsikring Service AS (test)', rolle: 'tekniker', gruppe: 'Serviceleverandør' },
  { slug: 'service-heis', navn: 'Heisteknikk Service AS (test)', rolle: 'tekniker', gruppe: 'Serviceleverandør' },
  { slug: 'service-ventilasjon', navn: 'Ventilasjon Service AS (test)', rolle: 'tekniker', gruppe: 'Serviceleverandør' },
  { slug: 'leietaker1', navn: 'Lise Kafé (test)', rolle: 'leietaker', gruppe: 'Leietaker', lt: 0 },
  { slug: 'leietaker2', navn: 'Rune Regnskap (test)', rolle: 'leietaker', gruppe: 'Leietaker', lt: 1 },
  { slug: 'leietaker3', navn: 'Frida Fysio (test)', rolle: 'leietaker', gruppe: 'Leietaker', lt: 2 },
];
const testEpost = (base: string, slug: string) => { const [u, d] = base.split('@'); return `${u.split('+')[0]}+test-${slug}@${d}`; };
const erTest = (p: any) => /\+test-/.test(p.epost || '');

function testbrukere() {
  openModal({ wide: true, render: close => <TestBody close={close} /> });
}
function TestBody({ close }: { close: () => void }) {
  useStore();
  const [base, setBase] = useState(state.me?.epost || '');
  const [pw, setPw] = useState('Test-' + new Date().getFullYear() + '!');
  const [eid, setEid] = useState(S.eiendommer[0]?.id || '');
  const [valgt, setValgt] = useState<Record<string, boolean>>(() => Object.fromEntries(TEST_BRUKERE.map(t => [t.slug, true])));
  const [logg, setLogg] = useState<string[]>([]); const [busy, setBusy] = useState(false); const [ferdig, setFerdig] = useState(false);
  const eksisterende = S.profiles.filter(erTest);
  const ok = /^\S+@\S+\.\S+$/.test(base) && pw.length >= 8 && !!eid;
  const log = (t: string) => setLogg(l => [...l, t]);
  const kjør = async () => {
    setBusy(true); setLogg([]);
    try {
      // leietakere på valgt eiendom (gjenbrukes hvis de finnes)
      const ltIds: string[] = [];
      for (const [i, l] of TEST_LT.entries()) {
        const fins = S.leietakere.find(x => x.eiendomId === eid && x.navn === l.navn);
        const id = fins ? fins.id : await save('leietakere', { ...l, eiendomId: eid, epost: testEpost(base, 'leietaker' + (i + 1)), tlf: '000 00 00' + i, avtaletype: 'Leieavtale', start: today(), test: true });
        ltIds.push(id as string); if (!fins) log('Leietaker opprettet: ' + l.navn);
      }
      for (const t of TEST_BRUKERE.filter(t => valgt[t.slug])) {
        try {
          await adminApi({ action: 'testbruker', epost: testEpost(base, t.slug), passord: pw, navn: t.navn, rolle: t.rolle, leietaker_id: t.lt != null ? ltIds[t.lt] : null, eiendommer: ['forvalter', 'tekniker'].includes(t.rolle) ? [eid] : [] });
          log('✓ ' + t.gruppe + ': ' + testEpost(base, t.slug));
        } catch (e: any) { log('✕ ' + t.navn + ': ' + e.message); }
      }
      await reloadAdmin(); setFerdig(true);
    } catch (e: any) { log('Stoppet: ' + feiltekst(e)); }
    setBusy(false);
  };
  const slett = async () => {
    if (!(await confirmBox(`Slette ${eksisterende.length} testbrukere og leietakerne merket «(test)»?`))) return;
    setBusy(true); setLogg([]);
    for (const p of eksisterende) { if (p.id === state.me?.id) continue; try { await adminApi({ action: 'slett', user_id: p.id }); log('Slettet ' + p.epost); } catch (e: any) { log('✕ ' + p.epost + ': ' + e.message); } }
    for (const l of S.leietakere.filter(l => l.test)) { await removeDoc('leietakere', l.id); log('Slettet leietaker ' + l.navn); }
    await reloadAdmin(); setBusy(false);
  };
  const inp = { border: '1px solid var(--line2)', borderRadius: 8, padding: '7px 10px', width: '100%' } as any;
  return <>
    <div className="mh"><h2>Testbrukere</h2><button className="btn ghost sm" onClick={close}>✕</button></div>
    <div className="mb">
      <p className="small" style={{ marginTop: 0 }}>Oppretter innloggingsbrukere for hver rolle med samme passord, slik at du kan logge inn og se programmet slik de ser det. Det sendes <b>ingen e-post</b>. Adressene lages med pluss-adressering av e-posten under (f.eks. <span className="mono">{base ? testEpost(base, 'driftstekniker') : 'navn+test-driftstekniker@…'}</span>), så de havner i din egen innboks om noe likevel sendes.</p>
      <div className="form"><div className="fld half"><label>Basis-e-post</label><input style={inp} value={base} onChange={e => setBase(e.target.value)} /></div>
        <div className="fld half"><label>Felles passord (min. 8 tegn)</label><input style={inp} className="mono" value={pw} onChange={e => setPw(e.target.value)} /></div>
        <div className="fld"><label>Eiendom de får tilgang til (leietakerne opprettes her)</label><select style={inp} value={eid} onChange={e => setEid(e.target.value)}>{S.eiendommer.map(e => <option key={e.id} value={e.id}>{e.navn}</option>)}</select></div></div>
      <div className="tbl-wrap" style={{ marginTop: 10 }}><table><thead><tr><th /><th>Hvem</th><th>Navn</th><th>Rolle i programmet</th><th>Innlogging</th></tr></thead><tbody>
        {TEST_BRUKERE.map(t => <tr key={t.slug}><td><input type="checkbox" checked={!!valgt[t.slug]} onChange={e => setValgt({ ...valgt, [t.slug]: e.target.checked })} /></td><td>{t.gruppe}</td><td>{t.navn}{t.lt != null && <div className="small muted">{TEST_LT[t.lt].navn}</div>}</td><td><Chip c={t.rolle === 'admin' ? 'blue' : t.rolle === 'leietaker' ? '' : 'green'}>{rolleNavn(t.rolle)}</Chip></td><td className="mono small">{base ? testEpost(base, t.slug) : ''}</td></tr>)}
      </tbody></table></div>
      <p className="small muted">Eier får administratorrolle. Driftsledere blir forvaltere, driftstekniker og serviceleverandører blir teknikere, alle med tilgang til valgt eiendom. Leietakerne kobles til hver sin testleietaker. Kjører du på nytt, oppdateres brukerne og passordet.</p>
      {logg.length > 0 && <pre className="codebox" style={{ minHeight: 0, maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{logg.join('\n')}</pre>}
      {ferdig && <div className="note small">Ferdig. Logg ut og inn med en av adressene over og passordet <b className="mono">{pw}</b>. Bruk gjerne et privat nettleservindu, så slipper du å logge ut selv.</div>}
    </div>
    <div className="mf">{eksisterende.length > 0 && <button className="btn danger" disabled={busy} onClick={slett} style={{ marginRight: 'auto' }}>Slett {eksisterende.length} testbrukere</button>}
      <button className="btn" onClick={close}>Lukk</button><button className="btn pri" disabled={!ok || busy} onClick={kjør}>{busy ? 'Arbeider …' : 'Opprett testbrukere'}</button></div>
  </>;
}
