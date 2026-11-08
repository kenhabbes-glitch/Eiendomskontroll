import React from 'react';
import { harModul } from '../lib/moduler';
import { Hjelp } from '../components/Hjelp';
import { DOK_TYPER } from '../lib/catalog';
import { S, canEdit, useStore } from '../lib/store';
import { dUntil, sortBy, today, aNavn, eNavn } from '../lib/utils';
import { editDok } from '../lib/actions';
import { CoverageTable, DokTable, ServiceavtaleTable } from '../components/tables';
import { Search, Sel, eiendomOpts, useFilter } from './common';
import { Sjekkmaler } from './Sjekkmaler';

export function Dokumenter() {
  useStore();
  const [f, setF] = useFilter('dok', { e: '', t: '', g: '', q: '', anb: '', s: '' });
  let L = S.dokumenter.slice(); if (f.e) L = L.filter(d => d.eiendomId === f.e); if (f.t) L = L.filter(d => d.type === f.t);
  if (f.g === 'exp') L = L.filter(d => d.gyldigTil && (dUntil(d.gyldigTil) as number) <= 90);
  if (f.g === 'slett') L = L.filter(d => d.arkiv?.minstTil && d.arkiv.minstTil < today());
  if (f.g === 'prosj') L = L.filter(d => d.prosjektId);
  if (f.g === 'fdv') L = L.filter(d => /fdv|samsvar|som bygget|brukerveiledning|driftsinstruks/i.test(d.type + ' ' + d.tittel));
  if (f.g === 'usys') L = L.filter(d => /fdv/i.test(d.type) && !d.anleggId && !(d.anleggIds || []).length);
  if (f.s) L = L.filter(d => d.anleggId === f.s || (d.anleggIds || []).includes(f.s));
  if (f.q) { const q = f.q.toLowerCase(); L = L.filter(d => (d.tittel + ' ' + (d.notat || '') + ' ' + (d.plassering || '')).toLowerCase().includes(q)); }
  return <>
    <div className="head"><div className="grow"><h1>Dokumenter<Hjelp id="side.dokumenter" /></h1><p className="sub">Påkrevd og relevant dokumentasjon for eiendommene{canEdit() ? '. Klikk i dekningstabellen for å registrere det som mangler.' : ''}</p></div><div style={{ display: 'flex', gap: 6 }}>{harModul('dokumentlesing') && <a className="btn" href="#/innboks">Dokumentinnboks</a>}<button className="btn pri" onClick={() => editDok()}>+ Dokument</button></div></div>
    {canEdit() && <><h2>Dokumentdekning</h2><CoverageTable es={sortBy(S.eiendommer, e => e.navn)} /></>}
    <div className="sec"><div className="toolbar"><h2 style={{ margin: 0, flex: 1 }}>Serviceavtaler for systemer</h2><label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={!!f.anb} onChange={e => setF({ anb: e.target.checked ? '1' : '' })} />Vis også anbefalte</label></div>
      <ServiceavtaleTable es={f.e ? S.eiendommer.filter(e => e.id === f.e) : sortBy(S.eiendommer, e => e.navn)} visAnb={!!f.anb} showE={!f.e} />
      <p className="small muted">Listen fylles automatisk når du registrerer systemer der det er lovkrav om fagkyndig vedlikehold eller kontroll. Registrer avtalen som dokument av typen «Serviceavtale» koblet til systemet. Én avtale kan gjelde flere systemer. Hold musen over «Lovkrav» for å se hjemmelen.</p></div>
    <div className="sec"><div className="toolbar"><Search value={f.q} onChange={q => setF({ q })} /><Sel value={f.e} onChange={e => setF({ e })} opts={eiendomOpts()} empty="Alle eiendommer" />
      <Sel value={f.t} onChange={t => setF({ t })} opts={DOK_TYPER} empty="Alle typer" /><Sel value={f.s} onChange={s => setF({ s })} opts={sortBy(S.anlegg.filter(a => !a.arkivert && (!f.e || a.eiendomId === f.e) && S.dokumenter.some(d => d.anleggId === a.id || (d.anleggIds || []).includes(a.id))), a => aNavn(a.id)).map(a => [a.id, (f.e ? '' : eNavn(a.eiendomId) + ' – ') + aNavn(a.id)] as [string, string])} empty="Alle systemer" />
      <Sel value={f.g} onChange={g => setF({ g })} opts={[['exp', 'Utløpt / utløper ≤ 90 d'], ['fdv', 'FDV og sluttdokumentasjon'], ['usys', 'FDV uten system'], ['prosj', 'Fra prosjekter'], ['slett', 'Oppbevaringstid ute – vurder sletting']]} empty="Alle" /><span className="muted small">{L.length} dokumenter</span></div>
      <DokTable list={L} /></div>
    <Sjekkmaler />
  </>;
}
