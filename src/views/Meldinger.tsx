// Utleierens meldingsoversikt: siste samtaler med leietakere, ulest først.
import { useEffect, useState } from 'react';
import { S, kanDrifteE, sb, useStore } from '../lib/store';
import { Samtale, malAv, type Melding } from '../components/Samtale';
import { Empty, showModal } from '../components/ui';
import { byId } from '../lib/utils';
import { tt, lokale } from '../lib/i18n';

export function samtaleModal(m: { eiendom_id: string; leietaker_id: string | null; avvik_id: string | null }) {
  const l = m.leietaker_id ? byId('leietakere', m.leietaker_id) : null; const a = m.avvik_id ? byId('avvik', m.avvik_id) : null;
  showModal(`${l?.navn || byId('eiendommer', m.eiendom_id)?.navn || tt("Samtale")}${a ? ` – #${a.nr} ${a.tittel}` : ''}`, () => <Samtale eiendomId={m.eiendom_id} leietakerId={m.leietaker_id || undefined} avvikId={m.avvik_id || undefined} />, { wide: true });
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
    <div className="head"><div className="grow"><h1>{tt("Meldinger")}</h1><p className="sub">{tt("Samtaler med leietakere og ressurser, sortert etter saksnummer. Du velger selv om en melding skal være synlig for leietakeren.")}</p></div><input placeholder={tt("Søk (saksnr, tittel, leietaker, melding) …")} value={sok} onChange={e => setSok(e.target.value)} style={{ border: '1px solid var(--line2)', borderRadius: 8, padding: '7px 10px', width: 300 }} /></div>
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
