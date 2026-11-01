import React from 'react';
import { Hjelp } from '../components/Hjelp';
import { KATS, TYPER } from '../lib/catalog';
import { S, canEdit, useStore } from '../lib/store';
import { aNavn, dUntil } from '../lib/utils';
import { editOppgave } from '../lib/actions';
import { TaskTable } from '../components/tables';
import { Search, Sel, eiendomOpts, useFilter } from './common';

export function Kontrollplan() {
  useStore();
  const [f, setF] = useFilter('kontroller', { st: 'aktive', e: '', k: '', t: '', an: '', q: '' });
  let L = S.oppgaver.slice();
  if (f.st !== 'alle') L = L.filter(o => o.aktiv !== false);
  if (f.e) L = L.filter(o => o.eiendomId === f.e); if (f.k) L = L.filter(o => o.kategori === f.k); if (f.t) L = L.filter(o => o.type === f.t); if (f.an) L = L.filter(o => (o.ansvar || 'Eier') === f.an);
  const d = (o: any) => dUntil(o.nesteFrist) ?? 99999;
  if (f.st === 'forfalt') L = L.filter(o => d(o) < 0); if (f.st === '30') L = L.filter(o => d(o) <= 30); if (f.st === '90') L = L.filter(o => d(o) <= 90);
  if (f.q) { const q = f.q.toLowerCase(); L = L.filter(o => (o.navn + ' ' + (o.hjemmel || '') + ' ' + (o.utfores || '') + ' ' + aNavn(o.anleggId)).toLowerCase().includes(q)); }
  return <>
    <div className="head"><div className="grow"><h1>Kontrollplan<Hjelp id="side.kontroller" /></h1><p className="sub">Lovpålagte kontroller, egenkontroller og service – på tvers av eiendommene</p></div>{canEdit() && <button className="btn pri" onClick={() => editOppgave()}>+ Ny kontroll</button>}</div>
    <div className="toolbar"><Search value={f.q} onChange={q => setF({ q })} />
      <Sel value={f.st} onChange={st => setF({ st })} opts={[['aktive', 'Alle aktive'], ['forfalt', 'Forfalte'], ['30', 'Forfaller ≤ 30 dager'], ['90', 'Forfaller ≤ 90 dager'], ['alle', 'Inkl. inaktive']]} />
      <Sel value={f.e} onChange={e => setF({ e })} opts={eiendomOpts()} empty="Alle eiendommer" />
      <Sel value={f.k} onChange={k => setF({ k })} opts={KATS} empty="Alle fagområder" /><Sel value={f.t} onChange={t => setF({ t })} opts={TYPER} empty="Alle typer" />
      <Sel value={f.an} onChange={an => setF({ an })} opts={['Eier', 'Leietaker']} empty="Alle ansvarlige" /><span className="muted small">{L.length} kontroller</span></div>
    <TaskTable list={L} />
  </>;
}
