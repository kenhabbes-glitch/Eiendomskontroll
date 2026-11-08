// Arkiv: systemer, komponenter og kontroller som er erstattet (f.eks. i et utskiftingsprosjekt), samt ferdige prosjekter. Kan søkes i og åpnes.
import { harModul } from '../lib/moduler';
import React from 'react';
import { Hjelp } from '../components/Hjelp';
import { ARKIV, S, useStore } from '../lib/store';
import { byId, fd, sortBy, eNavn, aNavn, kNavn, tfmSys, nok, type Rec } from '../lib/utils';
import { Chip, Empty, ModalFrame, openModal, TgChip, FileLink } from '../components/ui';
import { KOMP } from '../lib/catalog';
import { Sel, eiendomOpts, useFilter } from './common';

type ARad = { type: 'System' | 'Komponent' | 'Kontroll' | 'Prosjekt'; o: Rec; navn: string; under: string; dato: string; grunn: string; tekst: string };
const go = (p: string) => { location.hash = '#/' + p; };

function rader(): ARad[] {
  const ut: ARad[] = [];
  for (const a of ARKIV.anlegg) ut.push({ type: 'System', o: a, navn: `${tfmSys(a) || ''} ${a.navn || KOMP[a.type]?.n || 'System'}`.trim(), under: [KOMP[a.type]?.n, a.fabrikat, a.aar && 'installert ' + a.aar].filter(Boolean).join(' · '), dato: a.arkivert?.dato || '', grunn: a.arkivert?.grunn || '', tekst: '' });
  for (const k of ARKIV.komponenter) ut.push({ type: 'Komponent', o: k, navn: kNavn(k.id), under: [k.fabrikat, k.plassering].filter(Boolean).join(' · '), dato: k.arkivert?.dato || '', grunn: k.arkivert?.grunn || '', tekst: '' });
  for (const o of ARKIV.oppgaver) ut.push({ type: 'Kontroll', o, navn: o.navn, under: `${aNavn(o.anleggId)} · ${(o.historikk || []).length} utførte`, dato: o.arkivert?.dato || '', grunn: o.arkivert?.grunn || '', tekst: (o.historikk || []).map((h: Rec) => h.komm || '').join(' ') });
  for (const p of S.prosjekter.filter(p => ['Ferdigstilt', 'Avbrutt'].includes(p.status))) ut.push({ type: 'Prosjekt', o: p, navn: p.navn, under: `${p.type} · ${p.status}`, dato: p.fullfort || '', grunn: '', tekst: p.beskrivelse || '' });
  for (const r of ut) r.tekst = [r.navn, r.under, r.grunn, r.tekst, r.o.notat, r.o.tgKomm, eNavn(r.o.eiendomId)].filter(Boolean).join(' ').toLowerCase();
  return sortBy(ut, r => r.dato).reverse();
}

function visArkivert(r: ARad) {
  if (r.type === 'Prosjekt') return harModul('prosjekter', r.o.eiendomId) ? go('prosjekt/' + r.o.id) : undefined;
  const o = r.o; const erst = o.arkivert?.erstattetAv ? byId('anlegg', o.arkivert.erstattetAv) : null; const pr = o.arkivert?.prosjektId ? byId('prosjekter', o.arkivert.prosjektId) : null;
  const K = r.type === 'System' ? ARKIV.oppgaver.filter(x => x.anleggId === o.id) : r.type === 'Kontroll' ? [o] : [];
  const komp = r.type === 'System' ? ARKIV.komponenter.filter(k => k.anleggId === o.id) : [];
  const avvik = r.type === 'System' ? S.avvik.filter(a => a.anleggId === o.id) : r.type === 'Komponent' ? S.avvik.filter(a => a.komponentId === o.id) : [];
  openModal({ wide: true, render: close => <ModalFrame title={<>{r.navn} <Chip>Arkivert</Chip></>} close={close} foot={<><span className="grow" /><button className="btn" onClick={close}>Lukk</button></>}>
    <div className="note" style={{ color: 'var(--ink)' }}>Arkivert {fd(o.arkivert?.dato)}{o.arkivert?.av ? ' av ' + o.arkivert.av : ''}. {o.arkivert?.grunn}
      {erst && <> Erstattet av <a href="#" onClick={e => { e.preventDefault(); close(); import('../lib/actions').then(m => m.editAnlegg(erst.id)); }}>{aNavn(erst.id)}</a>.</>}
      {pr && harModul('prosjekter', pr.eiendomId) && <> Prosjekt: <a href="#" onClick={e => { e.preventDefault(); close(); go('prosjekt/' + pr.id); }}>{pr.navn}</a>.</>}</div>
    {r.type !== 'Kontroll' && <dl className="dl small"><dt>Eiendom</dt><dd>{eNavn(o.eiendomId)}</dd><dt>Type</dt><dd>{KOMP[o.type]?.n || o.kode || '–'}</dd><dt>Fabrikat</dt><dd>{o.fabrikat || '–'}</dd><dt>Installert</dt><dd>{o.aar || '–'}</dd>
      <dt>Tilstand</dt><dd>{o.tg ? <><TgChip t={o.tg} /> {o.tgKomm}</> : '–'}</dd><dt>Kostnad</dt><dd>{o.kost ? nok(+o.kost) : '–'}</dd>{o.notat && <><dt>Notat</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{o.notat}</dd></>}</dl>}
    {komp.length > 0 && <><h3>Komponenter ({komp.length})</h3><div className="small">{komp.map(k => <div key={k.id}>{kNavn(k.id)} <span className="muted">{[k.fabrikat, k.plassering].filter(Boolean).join(' · ')}</span></div>)}</div></>}
    {K.map(k => <div key={k.id}><h3>{k.navn}</h3>{(k.historikk || []).length ? <div className="log">{k.historikk.map((h: Rec, i: number) => { const d = h.dokId && byId('dokumenter', h.dokId); return <div key={i}><span className="lt">{fd(h.dato)}</span> · <b>{h.res}</b>{h.av ? ' · ' + h.av : ''}{h.komm && <><br />{h.komm}</>}{d?.fil && <><br /><FileLink fil={d.fil} /></>}</div>; })}</div> : <p className="small muted">Ingen utførte kontroller registrert.</p>}</div>)}
    {avvik.length > 0 && <><h3>Avvik ({avvik.length})</h3><div className="small">{avvik.map(a => <div key={a.id}>#{a.nr} {a.tittel} <span className="muted">· {a.status} · {fd(a.oppdaget)}</span></div>)}</div></>}
  </ModalFrame> });
}

export function Arkiv() {
  useStore();
  const [f, setF] = useFilter('arkiv', { e: '', t: '', q: '' });
  let L = rader(); if (f.e) L = L.filter(r => r.o.eiendomId === f.e); if (f.t) L = L.filter(r => r.type === f.t);
  if (f.q) { const ord = f.q.toLowerCase().split(/\s+/).filter(Boolean); L = L.filter(r => ord.every(w => r.tekst.includes(w))); }
  return <>
    <div className="head"><div className="grow"><h1>Arkiv<Hjelp id="side.arkiv" /></h1><p className="sub">Erstattede systemer, komponenter og kontroller med historikk, og avsluttede prosjekter.</p></div></div>
    <div className="toolbar"><input placeholder="Søk i arkivet (navn, TFM, fabrikat, kommentar …)" value={f.q} onChange={e => setF({ q: e.target.value })} style={{ flex: 1, minWidth: 240, border: '1px solid var(--line2)', borderRadius: 8, padding: '7px 9px' }} />
      <Sel value={f.e} onChange={e => setF({ e })} opts={eiendomOpts()} empty="Alle eiendommer" /><Sel value={f.t} onChange={t => setF({ t })} opts={['System', 'Komponent', 'Kontroll', 'Prosjekt']} empty="Alt" />
      <span className="small muted">{L.length} treff</span></div>
    {!L.length ? <div className="card"><Empty t="Ingenting i arkivet">{f.q ? 'Ingen treff på søket.' : 'Når et utskiftingsprosjekt ferdigstilles, arkiveres det gamle systemet med komponenter og kontroller her.'}</Empty></div> :
      <div className="tbl-wrap"><table><thead><tr><th>Type</th><th>Navn</th><th>Eiendom</th><th>Arkivert</th><th>Grunn</th></tr></thead><tbody>
        {L.map(r => <tr key={r.type + r.o.id} className="click" onClick={() => visArkivert(r)}><td><Chip c={r.type === 'Prosjekt' ? 'blue' : ''}>{r.type}</Chip></td><td><b style={{ fontWeight: 600 }}>{r.navn}</b><div className="small muted">{r.under}</div></td>
          <td className="small">{eNavn(r.o.eiendomId)}</td><td className="small">{fd(r.dato)}</td><td className="small">{r.grunn}</td></tr>)}</tbody></table></div>}
  </>;
}
