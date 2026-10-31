import { useState } from 'react';
import { S } from '../lib/store';
import { sortBy } from '../lib/utils';

const mem: Record<string, any> = {};
/** Filtre som huskes mens appen er åpen */
export function useFilter<T extends Record<string, any>>(key: string, init: T): [T, (p: Partial<T>) => void] {
  const [v, setV] = useState<T>(() => mem[key] || init);
  return [v, p => setV(prev => { const n = { ...prev, ...p }; mem[key] = n; return n; })];
}
export const eiendomOpts = () => sortBy(S.eiendommer, e => e.navn).map(e => [e.id, e.navn] as [string, string]);
export function Sel({ value, onChange, opts, empty, style }: { value: any; onChange: (v: string) => void; opts: (string | [string, string])[]; empty?: string; style?: any }) {
  return <select value={value ?? ''} onChange={e => onChange(e.target.value)} style={style}>
    {empty !== undefined && <option value="">{empty}</option>}
    {opts.map(o => { const [a, b] = Array.isArray(o) ? o : [o, o]; return <option key={a} value={a}>{b}</option>; })}
  </select>;
}
export function Search({ value, onChange, ph = 'Søk …', w }: { value: string; onChange: (v: string) => void; ph?: string; w?: number }) {
  return <input type="search" placeholder={ph} value={value || ''} onChange={e => onChange(e.target.value)} style={w ? { width: w } : undefined} />;
}
