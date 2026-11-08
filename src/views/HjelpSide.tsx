import React, { useEffect, useState } from 'react';
import { HJELP, hjelpFor } from '../lib/hjelpTekster';
import { HjelpTekst } from '../components/Hjelp';
import { isTenant, isUtforer } from '../lib/store';
import { tt } from '../lib/i18n';

const GRUPPER = ['Sider', 'Begreper', 'Skjemafelt'] as const;

export function HjelpSide({ id }: { id?: string }) {
  const [q, setQ] = useState('');
  const valgt = id ? decodeURIComponent(id) : '';
  useEffect(() => { if (valgt) setTimeout(() => document.getElementById('h-' + valgt)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 50); }, [valgt]);
  // Leietakere og eksterne utførere ser bare det som gjelder dem
  const synlig = (k: string) => isTenant() ? ['side.portal', 'side.regelverk', 'tg', 'kg'].includes(k) : isUtforer() ? ['side.arbeidsordre', 'tg', 'kg'].includes(k) : true;
  const qq = q.trim().toLowerCase();
  const emner = Object.keys(HJELP).map(k => [k, hjelpFor(k)!] as const).filter(([k, e]) => synlig(k) && (!qq || (e.tittel + ' ' + e.tekst).toLowerCase().includes(qq)));
  return <>
    <div className="head"><div className="grow"><h1>{tt("Hjelp")}</h1><p className="sub">{tt("Forklaring av sider, begreper og felt. Du finner også")} <span className="hjelp-q" style={{ width: 15, height: 15, fontSize: 10, cursor: 'default' }}>?</span> {tt("ved overskrifter og felt rundt i appen – trykk på dem for en kort forklaring.")}</p></div></div>
    <div className="toolbar"><input type="search" placeholder={tt("Søk i hjelpen …")} value={q} onChange={e => setQ(e.target.value)} style={{ width: 300 }} autoFocus={!valgt} /><span className="muted small">{emner.length} {tt("emner")}</span></div>
    {GRUPPER.map(g => { const L = emner.filter(([, e]) => e.gruppe === g); if (!L.length) return null;
      return <div className="sec" key={g}><h2>{tt(g)}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12 }}>
          {L.map(([k, e]) => <div key={k} id={'h-' + k} className="card" style={{ padding: 16, scrollMarginTop: 16, outline: k === valgt ? '2px solid var(--acc)' : undefined }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 15 }}>{e.tittel}</h3><div className="small" style={{ lineHeight: 1.55 }}><HjelpTekst tekst={e.tekst} /></div></div>)}
        </div></div>; })}
    {!emner.length && <div className="card"><p className="muted">{tt("Ingen treff på «")}{q}».</p></div>}
  </>;
}
