// Utleierens meldingsoversikt: siste samtaler med leietakere, ulest først.
import { useEffect, useState } from 'react';
import { S, kanDrifteE, sb, state, toast, useStore, varsleChat } from '../lib/store';
import { formModal } from '../components/ui';
import { Samtale, malAv, type Melding } from '../components/Samtale';
import { AlvChip, Empty, FileLink, StChip, showModal } from '../components/ui';
import { byId, fd } from '../lib/utils';
import { tt, lokale } from '../lib/i18n';

export function samtaleModal(m: { eiendom_id: string; leietaker_id: string | null; avvik_id: string | null }) {
  const l = m.leietaker_id ? byId('leietakere', m.leietaker_id) : null; const a = m.avvik_id ? byId('avvik', m.avvik_id) : null;
  showModal(`${l?.navn || byId('eiendommer', m.eiendom_id)?.navn || tt("Samtale")}${a ? ` – #${a.nr} ${a.tittel}` : ''}`, close => <>
    {a && <div className="note small" style={{ color: 'var(--ink)', marginBottom: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><b>{tt("Saken")} #{a.nr}</b><StChip s={a.status} /><AlvChip a={a.alv} /><span className="muted">{tt("Meldt")} {fd(a.oppdaget)}{a.meldtAv ? ' ' + tt("av") + ' ' + a.meldtAv : ''}</span>
        <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => { close(); location.hash = '#/arbeidsordre/' + a.id; }}>{tt("Åpne arbeidsordre")}</button></div>
      {a.beskrivelse && <p style={{ whiteSpace: 'pre-wrap', margin: '8px 0 0' }}>{a.beskrivelse}</p>}
      {(a.vedlegg || []).length > 0 && <p style={{ margin: '6px 0 0' }}>{a.vedlegg.map((f: any, i: number) => <span key={i} style={{ marginRight: 10 }}>📎 <FileLink fil={f} /></span>)}</p>}
    </div>}
    <Samtale eiendomId={m.eiendom_id} leietakerId={m.leietaker_id || undefined} avvikId={m.avvik_id || undefined} /></>, { wide: true });
}

/** Starter en samtale med en leietaker (uten sak) */
function nySamtale() {
  const L = S.leietakere.filter(l => kanDrifteE(l.eiendomId)).sort((a, b) => (a.navn || '').localeCompare(b.navn || ''));
  formModal({ title: tt("Ny samtale"), saveTxt: tt("Åpne samtale"), fields: [{ k: 'lt', label: tt("Leietaker"), type: 'select', req: true, empty: tt("Velg leietaker …"), options: L.map(l => [l.id, `${l.navn} – ${byId('eiendommer', l.eiendomId)?.navn || ''}`] as [string, string]) }], values: { lt: L.length === 1 ? L[0].id : '' },
    onSave: async v => { const l = byId('leietakere', v.lt); if (l) setTimeout(() => samtaleModal({ eiendom_id: l.eiendomId, leietaker_id: l.id, avvik_id: null }), 50); } });
}
/** Én melding til flere leietakere samtidig. Lages som en vanlig melding i hver leietakers chat, og er alltid synlig for leietakeren. */
function fellesmelding() {
  const E = S.eiendommer.filter(e => kanDrifteE(e.id)); if (!E.length) return toast(tt("Du har ikke tilgang til å sende meldinger"));
  formModal({ title: tt("Fellesmelding til leietakere"), saveTxt: tt("Send til valgte"), wide: true,
    top: <p className="small muted" style={{ marginTop: 0 }}>{tt("Meldingen havner i chatten til hver valgt leietaker, og de ser den under «Chat med utleier» i portalen. Den er synlig for leietakerne, og de kan svare hver for seg uten at de andre ser det.")}</p>,
    values: { eiendom: E[0].id, tekst: '', valgte: null },
    fields: [{ k: 'eiendom', label: tt("Eiendom"), type: 'select', options: E.map(e => [e.id, e.navn] as [string, string]), req: true },
      { k: 'valgte', type: 'custom', label: tt("Mottakere"), render: (v: any, set: any) => { const LT = S.leietakere.filter(l => l.eiendomId === v.eiendom); const valgt: string[] = v.valgte ?? LT.map(l => l.id);
        return <div className="note small" style={{ color: 'var(--ink)', maxHeight: 180, overflow: 'auto' }}>{LT.length ? <><label style={{ display: 'flex', gap: 8, fontWeight: 500 }}><input type="checkbox" checked={valgt.length === LT.length} onChange={e => set({ valgte: e.target.checked ? LT.map(l => l.id) : [] })} style={{ width: 'auto' }} />{tt("Alle leietakere")} ({LT.length})</label>
          {LT.map(l => <label key={l.id} style={{ display: 'flex', gap: 8, fontWeight: 400, margin: '3px 0' }}><input type="checkbox" checked={valgt.includes(l.id)} onChange={() => set({ valgte: valgt.includes(l.id) ? valgt.filter(x => x !== l.id) : [...valgt, l.id] })} style={{ width: 'auto' }} />{l.navn}{l.lokale ? ' – ' + l.lokale : ''}</label>)}</> : tt("Ingen leietakere på eiendommen")}</div>; } },
      { k: 'tekst', label: tt("Melding"), type: 'textarea', req: true }],
    onSave: async v => {
      const LT = S.leietakere.filter(l => l.eiendomId === v.eiendom); const ids: string[] = v.valgte ?? LT.map(l => l.id); const tekst = String(v.tekst || '').trim().slice(0, 4000);
      if (!ids.length || !tekst) { toast(tt("Velg mottakere og skriv en melding")); return false; }
      if (!window.confirm(tt("Sende meldingen til {0} leietaker(e)? De kan se den med en gang.", ids.length))) return false;
      const felles = crypto.randomUUID(); const av = state.me?.navn || state.me?.epost;
      const { error } = await sb.from('meldinger').insert(ids.map(id => ({ eiendom_id: v.eiendom, leietaker_id: id, avvik_id: null, data: { tekst, rolle: 'utleier', av, til: 'alle', synlig: true, lest: true, felles } })));
      if (error) { toast(tt("Meldingen ble ikke sendt: {0}", error.message)); return false; }
      toast(tt("Fellesmelding sendt til {0} leietaker(e)", ids.length)); window.dispatchEvent(new Event('ek-meldinger')); ids.forEach(id => varsleChat(v.eiendom, id));
    } });
}

export function MeldingerView() {
  useStore(); const [L, setL] = useState<Melding[] | null>(null); const [ver, setVer] = useState(0); const [sok, setSok] = useState('');
  useEffect(() => { let on = true; sb.from('meldinger').select('*').order('created_at', { ascending: false }).limit(500).then(({ data }) => { if (on) setL((data as Melding[]) || []); });
    const f = () => setVer(x => x + 1); window.addEventListener('ek-meldinger', f); return () => { on = false; window.removeEventListener('ek-meldinger', f); }; }, [ver]);
  const tr: { key: string; m: Melding; ulest: number }[] = [];
  (L || []).forEach(m => { const key = (m.leietaker_id || '') + '|' + (m.avvik_id || ''); let t = tr.find(x => x.key === key); if (!t) { t = { key, m, ulest: 0 }; tr.push(t); } if (m.data.rolle !== 'utleier' && !m.data.lest && kanDrifteE(m.eiendom_id)) t.ulest++; });
  // Saker leietakere har meldt inn vises også før det finnes meldinger i dem
  S.avvik.filter(a => a.leietakerId && kanDrifteE(a.eiendomId) && !tr.some(t => t.m.avvik_id === a.id)).forEach(a => {
    tr.push({ key: (a.leietakerId || '') + '|' + a.id, ulest: a.status === 'Ny' ? 1 : 0,
      m: { id: 'sak-' + a.id, eiendom_id: a.eiendomId, leietaker_id: a.leietakerId, avvik_id: a.id, created_at: a.opprettet || a.oppdaget || new Date().toISOString(), data: { tekst: a.beskrivelse || a.tittel || '', rolle: 'leietaker' } } as Melding });
  });
  const nrAv = (t: { m: Melding }) => (t.m.avvik_id ? byId('avvik', t.m.avvik_id)?.nr || 0 : -1);
  tr.sort((a, b) => nrAv(b) - nrAv(a)); // etter saksnummer (arbeidsordre-nr), nyeste først; samtaler uten sak sist
  const q = sok.trim().toLowerCase().replace(/^#/, '');
  const T = q ? tr.filter(t => { const a = t.m.avvik_id ? byId('avvik', t.m.avvik_id) : null; const l = t.m.leietaker_id ? byId('leietakere', t.m.leietaker_id) : null;
    return (a && (String(a.nr) === q || (a.tittel || '').toLowerCase().includes(q))) || (l?.navn || '').toLowerCase().includes(q) || (L || []).some(m => (m.avvik_id || '') === (t.m.avvik_id || '') && (m.leietaker_id || '') === (t.m.leietaker_id || '') && m.data.tekst.toLowerCase().includes(q)); }) : tr;
  return <>
    <div className="head"><div className="grow"><h1>{tt("Meldinger")}</h1><p className="sub">{tt("Samtaler med leietakere og ressurser, sortert etter saksnummer. Nye meldinger er interne som standard. Du velger selv om leietakeren skal se dem.")}</p></div><button className="btn" onClick={nySamtale}>{tt("Ny samtale")}</button><button className="btn pri" onClick={fellesmelding}>{tt("Fellesmelding")}</button><input placeholder={tt("Søk (saksnr, tittel, leietaker, melding) …")} value={sok} onChange={e => setSok(e.target.value)} style={{ border: '1px solid var(--line2)', borderRadius: 8, padding: '7px 10px', width: 300 }} /></div>
    {!L ? <p className="muted">{tt("Laster …")}</p> : T.length ? <div className="tbl-wrap"><table><thead><tr><th className="num">{tt("Sak nr")}</th><th>{tt("Sak")}</th><th>{tt("Leietaker")}</th><th>{tt("Siste melding")}</th><th>{tt("Sist")}</th></tr></thead><tbody>
      {T.map(t => { const l = t.m.leietaker_id ? byId('leietakere', t.m.leietaker_id) : null; const a = t.m.avvik_id ? byId('avvik', t.m.avvik_id) : null;
        return <tr key={t.key} className="click" onClick={() => { samtaleModal(t.m); }}>
          <td className="num muted">{a ? '#' + a.nr : '–'}</td>
          <td><b style={{ fontWeight: t.ulest ? 700 : 500 }}>{a ? a.tittel : tt("Uten sak")}</b>{t.ulest > 0 && <span className="chip red" style={{ marginLeft: 6 }}>{t.ulest} {tt("ny")}</span>}</td>
          <td className="small">{l?.navn || '–'}<div className="muted">{byId('eiendommer', t.m.eiendom_id)?.navn}</div></td>
          <td className="small">{malAv(t.m) === 'intern' ? '🔒 ' : malAv(t.m) === 'ressurs' ? '👥 ' : ''}{t.m.data.tekst.slice(0, 90)}</td>
          <td className="small" style={{ whiteSpace: 'nowrap' }}>{new Date(t.m.created_at).toLocaleString(lokale(), { dateStyle: 'short', timeStyle: 'short' })}</td></tr>; })}
    </tbody></table></div> : <div className="card"><Empty t={q ? "Ingen treff" : "Ingen meldinger ennå"}>{q ? tt("Ingen saker passer med søket.") : tt("Leietakere melder nye saker fra leietakerportalen, og får et saksnummer. Du kan også starte en samtale fra et avvik.")}</Empty></div>}
    <p className="small muted">{S.leietakere.length ? '' : tt("Ingen leietakere er registrert ennå.")}</p>
  </>;
}
