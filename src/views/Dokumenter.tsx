import React from 'react';
import { DOK_TYPER } from '../lib/catalog';
import { S, canEdit, useStore } from '../lib/store';
import { dUntil, sortBy } from '../lib/utils';
import { editDok } from '../lib/actions';
import { CoverageTable, DokTable } from '../components/tables';
import { Search, Sel, eiendomOpts, useFilter } from './common';

export function Dokumenter() {
  useStore();
  const [f, setF] = useFilter('dok', { e: '', t: '', g: '', q: '' });
  let L = S.dokumenter.slice(); if (f.e) L = L.filter(d => d.eiendomId === f.e); if (f.t) L = L.filter(d => d.type === f.t);
  if (f.g === 'exp') L = L.filter(d => d.gyldigTil && (dUntil(d.gyldigTil) as number) <= 90);
  if (f.q) { const q = f.q.toLowerCase(); L = L.filter(d => (d.tittel + ' ' + (d.notat || '') + ' ' + (d.plassering || '')).toLowerCase().includes(q)); }
  return <>
    <div className="head"><div className="grow"><h1>Dokumenter</h1><p className="sub">Påkrevd og relevant dokumentasjon for eiendommene{canEdit() ? '. Klikk i dekningstabellen for å registrere det som mangler.' : ''}</p></div><button className="btn pri" onClick={() => editDok()}>+ Dokument</button></div>
    {canEdit() && <><h2>Dokumentdekning</h2><CoverageTable es={sortBy(S.eiendommer, e => e.navn)} /></>}
    <div className="sec"><div className="toolbar"><Search value={f.q} onChange={q => setF({ q })} /><Sel value={f.e} onChange={e => setF({ e })} opts={eiendomOpts()} empty="Alle eiendommer" />
      <Sel value={f.t} onChange={t => setF({ t })} opts={DOK_TYPER} empty="Alle typer" /><Sel value={f.g} onChange={g => setF({ g })} opts={[['exp', 'Utløpt / utløper ≤ 90 d']]} empty="Alle" /><span className="muted small">{L.length} dokumenter</span></div>
      <DokTable list={L} /></div>
  </>;
}
