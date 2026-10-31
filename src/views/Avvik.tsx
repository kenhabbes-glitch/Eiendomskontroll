import React from 'react';
import { AV_ALV, AV_KILDE, AV_LUKKET, AV_STATUS } from '../lib/catalog';
import { S, useStore } from '../lib/store';
import { dUntil, openAvvik } from '../lib/utils';
import { editAvvik, UTBEDRER } from '../lib/actions';
import { AvvikTable } from '../components/tables';
import { Search, Sel, eiendomOpts, useFilter } from './common';

export function AvvikView() {
  useStore();
  const [f, setF] = useFilter('avvik', { st: 'apne', e: '', a: '', k: '', an: '', q: '' });
  let L = S.avvik.slice();
  if (f.st === 'apne') L = L.filter(a => !AV_LUKKET.includes(a.status)); else if (f.st && f.st !== 'alle') L = L.filter(a => a.status === f.st);
  if (f.e) L = L.filter(a => a.eiendomId === f.e); if (f.a) L = L.filter(a => a.alv === f.a); if (f.k) L = L.filter(a => a.kilde === f.k); if (f.an) L = L.filter(a => (a.ansvar || 'Eier') === f.an);
  if (f.q) { const q = f.q.toLowerCase(); L = L.filter(a => (a.tittel + ' ' + (a.beskrivelse || '') + ' ' + (a.nr || '') + ' ' + (a.meldtAv || '')).toLowerCase().includes(q)); }
  const OA = openAvvik(); const cnt = (s: string) => S.avvik.filter(a => a.status === s).length;
  return <>
    <div className="head"><div className="grow"><h1>Avvik</h1><p className="sub">{OA.length} åpne · {OA.filter(a => a.frist && (dUntil(a.frist) as number) < 0).length} over frist · {S.avvik.length - OA.length} lukket/rettet/avvist</p></div><button className="btn pri" onClick={() => editAvvik()}>+ Nytt avvik</button></div>
    <div className="toolbar"><Search value={f.q} onChange={q => setF({ q })} />
      <Sel value={f.st} onChange={st => setF({ st })} opts={[['apne', 'Alle åpne'], ['alle', 'Alle'], ...AV_STATUS.map(s => [s, `${s} (${cnt(s)})`] as [string, string])]} />
      <Sel value={f.e} onChange={e => setF({ e })} opts={eiendomOpts()} empty="Alle eiendommer" /><Sel value={f.a} onChange={a => setF({ a })} opts={AV_ALV} empty="All alvorlighet" />
      <Sel value={f.k} onChange={k => setF({ k })} opts={AV_KILDE} empty="Alle kilder" /><Sel value={f.an} onChange={an => setF({ an })} opts={UTBEDRER} empty="Alle ansvarlige" />
      <span className="muted small">{L.length} avvik</span></div>
    <AvvikTable list={L} />
  </>;
}
