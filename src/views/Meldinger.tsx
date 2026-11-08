// Utleierens meldingsoversikt: siste samtaler med leietakere, ulest først.
import { useEffect, useState } from 'react';
import { S, kanDrifteE, sb, useStore } from '../lib/store';
import { Samtale, type Melding } from '../components/Samtale';
import { Empty, showModal } from '../components/ui';
import { byId } from '../lib/utils';
import { tt, lokale } from '../lib/i18n';

export function samtaleModal(leietakerId: string, avvikId?: string) {
  const l = byId('leietakere', leietakerId); if (!l) return; const a = avvikId ? byId('avvik', avvikId) : null;
  showModal(`${l.navn}${a ? ` – #${a.nr} ${a.tittel}` : ''}`, () => <Samtale eiendomId={l.eiendomId} leietakerId={l.id} avvikId={avvikId} />, { wide: true });
}

export function MeldingerView() {
  useStore(); const [L, setL] = useState<Melding[] | null>(null); const [ver, setVer] = useState(0);
  useEffect(() => { let on = true; sb.from('meldinger').select('*').order('created_at', { ascending: false }).limit(500).then(({ data }) => { if (on) setL(((data as Melding[]) || []).filter(m => kanDrifteE(m.eiendom_id))); });
    const f = () => setVer(x => x + 1); window.addEventListener('ek-meldinger', f); return () => { on = false; window.removeEventListener('ek-meldinger', f); }; }, [ver]);
  const tr: { key: string; m: Melding; ulest: number }[] = [];
  (L || []).forEach(m => { const key = m.leietaker_id + '|' + (m.avvik_id || ''); let t = tr.find(x => x.key === key); if (!t) { t = { key, m, ulest: 0 }; tr.push(t); } if (m.data.rolle === 'leietaker' && !m.data.lest) t.ulest++; });
  tr.sort((a, b) => (b.ulest ? 1 : 0) - (a.ulest ? 1 : 0));
  return <>
    <div className="head"><div className="grow"><h1>{tt("Meldinger")}</h1><p className="sub">{tt("Samtaler med leietakere. Du velger selv om en melding skal være synlig for leietakeren.")}</p></div></div>
    {!L ? <p className="muted">{tt("Laster …")}</p> : tr.length ? <div className="tbl-wrap"><table><thead><tr><th>{tt("Leietaker")}</th><th>{tt("Gjelder")}</th><th>{tt("Siste melding")}</th><th>{tt("Sist")}</th></tr></thead><tbody>
      {tr.map(t => { const l = byId('leietakere', t.m.leietaker_id); const a = t.m.avvik_id ? byId('avvik', t.m.avvik_id) : null;
        return <tr key={t.key} className="click" onClick={() => { samtaleModal(t.m.leietaker_id, t.m.avvik_id || undefined); }}>
          <td><b style={{ fontWeight: t.ulest ? 700 : 500 }}>{l?.navn || '–'}</b>{t.ulest > 0 && <span className="chip red" style={{ marginLeft: 6 }}>{t.ulest} {tt("ny")}</span>}<div className="small muted">{byId('eiendommer', t.m.eiendom_id)?.navn}</div></td>
          <td className="small">{a ? `#${a.nr} ${a.tittel}` : tt("Generelt")}</td><td className="small">{t.m.data.synlig === false ? '🔒 ' : ''}{t.m.data.tekst.slice(0, 90)}</td>
          <td className="small" style={{ whiteSpace: 'nowrap' }}>{new Date(t.m.created_at).toLocaleString(lokale(), { dateStyle: 'short', timeStyle: 'short' })}</td></tr>; })}
    </tbody></table></div> : <div className="card"><Empty t="Ingen meldinger ennå">{tt("Leietakere skriver til deg fra leietakerportalen. Du kan også starte en samtale fra en leietaker eller et avvik.")}</Empty></div>}
    <p className="small muted">{S.leietakere.length ? '' : tt("Ingen leietakere er registrert ennå.")}</p>
  </>;
}
