// Språk for e-post til én mottaker. Standard er eiendommens språk («Språk i e-post», ellers landet).
import React from 'react';
import { byId } from '../lib/utils';
import { SPRAK, tt } from '../lib/i18n';

const LAND_SPRAK: Record<string, string> = { SE: 'sv', DK: 'da', MX: 'es-MX' };
export const sprakForEiendom = (eid?: string | null): string => { const e: any = eid ? byId('eiendommer', eid) : null; return e?.epostSprak || LAND_SPRAK[e?.land] || 'nb'; };
export const sprakValg = (): [string, string][] => SPRAK.map(x => [x.k, x.navn]);

export function MottakerSprak({ value, onChange, style }: { value: string; onChange: (v: string) => void; style?: React.CSSProperties }) {
  return <select aria-label={tt('Mottakerens språk')} value={value} onChange={e => onChange(e.target.value)} style={style}>
    {SPRAK.map(x => <option key={x.k} value={x.k}>{x.navn}</option>)}</select>;
}
