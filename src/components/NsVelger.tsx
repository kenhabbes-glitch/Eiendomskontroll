// Søk og velg bygningsdel i NS 3451. Bygningsdeler som hører til valgt fag vises først.
import React, { useState } from 'react';
import { NS3451_LEVETID } from '../lib/ns3451';

/** Hvilke deler av NS 3451 som normalt hører til et fag (prefikser) */
export const FAG_NS: Record<string, string[]> = {
  'Rådgiver / arkitekt': ['1'], 'Bygningsarbeider / tømrer': ['2'], 'Riving': ['2'], 'Murer / betong': ['21', '22', '23', '24', '25'],
  'Maler / overflater': ['235', '236', '246', '256', '257', '266'], 'Gulv': ['25'], 'Himling': ['257', '25'], 'Glass / dører / lås': ['234', '244', '23', '24'],
  'Elektro': ['4'], 'Rør / sanitær': ['30', '31', '32', '38'], 'Ventilasjon': ['36'], 'Kjøling': ['35', '37'], 'Brann (alarm, sprinkler, branntetting)': ['33', '54', '225', '263'],
  'Tele / data / adgangskontroll': ['5'], 'Heis': ['62'], 'Storkjøkken': ['6', '27'], 'Skilt og profilering': ['27', '7'], 'Rengjøring / byggvask': ['2'],
};
const ALLE = Object.values(NS3451_LEVETID).sort((a, b) => a.kode.localeCompare(b.kode));
export const nsNavn = (k?: string) => (k && NS3451_LEVETID[k]?.navn) || '';

export function NsVelger({ value, set, fag }: { value?: string; set: (k: string) => void; fag?: string }) {
  const [q, setQ] = useState(''); const [apen, setApen] = useState(false);
  const pref = fag ? FAG_NS[fag] || [] : [];
  const s = q.trim().toLowerCase();
  const treff = ALLE.filter(r => !s || r.kode.startsWith(s) || (r.navn + ' ' + r.sti).toLowerCase().includes(s));
  const forslag = pref.length ? treff.filter(r => pref.some(p => r.kode.startsWith(p))) : [];
  const ovrige = s ? treff.filter(r => !forslag.includes(r)) : [];
  const rad = (r: typeof ALLE[number]) => <button type="button" key={r.kode} className={'ns-rad' + (r.kode === value ? ' on' : '')} onClick={() => { set(r.kode); setApen(false); setQ(''); }}
    style={{ paddingLeft: 8 + (r.kode.length - 2) * 12 }}><b className="mono">{r.kode}</b> {r.navn}</button>;
  return <div className="ns-velger">
    <div style={{ display: 'flex', gap: 6 }}>
      <input value={apen ? q : value ? `${value} ${nsNavn(value)}` : ''} placeholder={fag && pref.length ? `Søk – forslag for ${fag}` : 'Søk på kode eller navn, f.eks. 442 eller belysning'}
        onFocus={() => { setApen(true); setQ(''); }} onChange={e => { setQ(e.target.value); setApen(true); }} style={{ flex: 1 }} />
      {value && <button type="button" className="btn ghost sm" title="Fjern" onClick={() => set('')}>✕</button>}
    </div>
    {apen && <div className="ns-liste">
      {forslag.length > 0 && <><div className="ns-hode">Forslag for {fag}</div>{forslag.slice(0, 60).map(rad)}</>}
      {(ovrige.length > 0 || (!forslag.length && treff.length > 0)) && <><div className="ns-hode">{s ? 'Andre treff' : 'Alle bygningsdeler'}</div>{(forslag.length || s ? ovrige : treff).slice(0, 80).map(rad)}</>}
      {!treff.length && <div className="small muted" style={{ padding: 8 }}>Ingen treff</div>}
      <div style={{ textAlign: 'right', padding: 4 }}><button type="button" className="btn ghost sm" onClick={() => setApen(false)}>Lukk</button></div>
    </div>}
  </div>;
}
