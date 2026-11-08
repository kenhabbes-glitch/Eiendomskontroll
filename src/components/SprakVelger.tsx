// Velg språk i appen. Valget lagres på enheten, og appen lastes på nytt.
import React from 'react';
import { SPRAK, settSprak, sprak, tt, type Sprak } from '../lib/i18n';

export function SprakVelger({ kompakt }: { kompakt?: boolean }) {
  const v = <select aria-label={tt('Språk')} value={sprak()} onChange={e => settSprak(e.target.value as Sprak)} style={{ border: '1px solid var(--line2)', borderRadius: 8, padding: '6px 8px', width: 'auto', background: 'var(--surface)' }}>
    {SPRAK.map(s => <option key={s.k} value={s.k}>{s.navn}</option>)}</select>;
  if (kompakt) return <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>{v}</div>;
  return <div className="card"><h2>{tt('Språk')}</h2><p className="small muted" style={{ marginTop: 0 }}>{tt('Gjelder denne enheten. Data du registrerer lagres slik du skriver dem; faste valg som status og typer vises på valgt språk.')}</p>{v}</div>;
}
