import React from 'react';
import { KOMP } from '../lib/catalog';
import { S, canEdit, useStore } from '../lib/store';
import { eNavn, openAvvik, pad, sortBy, tfmKomp, tfmSys, toCsv } from '../lib/utils';
import { editAnlegg, editKomponent } from '../lib/actions';
import { Empty, TgChip, textModal } from '../components/ui';
import { Search, Sel, eiendomOpts, useFilter } from './common';
import { Pin } from '../components/tables';
import { openPlan } from './Arealer';

export function TfmRegister() {
  useStore();
  const [f, setF] = useFilter('tfm', { e: '', k: '', q: '' });
  let rows: any[] = [];
  S.anlegg.forEach(a => {
    rows.push({ kind: 's', o: a, e: a.eiendomId, code: tfmSys(a, true), navn: a.navn || KOMP[a.type]?.n, fab: a.fabrikat || '', aar: a.aar || '', sort: (a.tfmSys || '999') + '.' + pad(a.tfmLop) });
    S.komponenter.filter(k => k.anleggId === a.id).forEach(k => rows.push({ kind: 'k', o: k, e: a.eiendomId, code: tfmKomp(k, true), navn: k.navn || '', fab: k.fabrikat || '', aar: k.aar || '', plass: k.plassering || '', sort: (a.tfmSys || '999') + '.' + pad(a.tfmLop) + '-' + (k.kode || '') + pad(k.lop) }));
  });
  if (f.e) rows = rows.filter(r => r.e === f.e); if (f.k === 's') rows = rows.filter(r => r.kind === 's'); if (f.k === 'k') rows = rows.filter(r => r.kind === 'k'); if (f.k === 'mangler') rows = rows.filter(r => r.kind === 's' && !r.o.tfmSys); if (f.k === 'uplassert') rows = rows.filter(r => !r.o.pos);
  if (f.q) { const q = f.q.toLowerCase(); rows = rows.filter(r => (r.code + ' ' + r.navn + ' ' + r.fab + ' ' + (r.plass || '')).toLowerCase().includes(q)); }
  rows.sort((a, b) => (eNavn(a.e) + a.sort).localeCompare(eNavn(b.e) + b.sort));
  const mis = S.anlegg.filter(a => !a.tfmSys).length;
  const csv = () => {
    const L: any[][] = [['TFM-kode', 'Type', 'Betegnelse', 'Eiendom', 'Fabrikat', 'Plassering', 'Serienr', 'Installert år', 'Levetid', 'Tilstand', ...(canEdit() ? ['Kostnad'] : [])]];
    sortBy(S.anlegg, a => eNavn(a.eiendomId) + (a.tfmSys || '999') + pad(a.tfmLop)).forEach(a => {
      L.push([tfmSys(a, true), 'System', a.navn || KOMP[a.type]?.n, eNavn(a.eiendomId), a.fabrikat || '', '', '', a.aar || '', a.levetid || KOMP[a.type]?.l || '', a.tg || '', ...(canEdit() ? [a.kost || ''] : [])]);
      sortBy(S.komponenter.filter(k => k.anleggId === a.id), k => (k.kode || '') + pad(k.lop)).forEach(k => L.push([tfmKomp(k, true), 'Komponent', k.navn || '', eNavn(a.eiendomId), k.fabrikat || '', k.plassering || '', k.serienr || '', k.aar || '', k.levetid || '', k.tg || '', ...(canEdit() ? [k.kost || ''] : [])]));
    });
    textModal('TFM-register som CSV', toCsv(L), 'Semikolonseparert – lim inn i Excel eller lagre som .csv.');
  };
  return <>
    <div className="head"><div className="grow"><h1>TFM-register</h1><p className="sub">Systemer og komponenter merket etter tverrfaglig merkesystem · {S.anlegg.length} systemer · {S.komponenter.length} komponenter{mis > 0 && <span style={{ color: 'var(--amber)' }}> · {mis} systemer mangler kode</span>}</p></div><button className="btn" onClick={csv}>Kopier som regneark (CSV)</button></div>
    <div className="toolbar"><Search value={f.q} onChange={q => setF({ q })} ph="Søk TFM-kode, f.eks. 360.001-JV …" w={280} /><Sel value={f.e} onChange={e => setF({ e })} opts={eiendomOpts()} empty="Alle eiendommer" />
      <Sel value={f.k} onChange={k => setF({ k })} opts={[['s', 'Bare systemer'], ['k', 'Bare komponenter'], ['mangler', 'Systemer uten TFM-kode'], ['uplassert', 'Ikke plassert på tegning']]} empty="Systemer og komponenter" /><span className="muted small">{rows.length} rader</span>
      {f.e && (() => { const T = sortBy(S.tegninger.filter(t => t.eiendomId === f.e), t => +t.etasje || 0); return T.length ? <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>{T.map(t => <button key={t.id} className="btn sm" onClick={() => openPlan(t.id, { mode: 'tfm' })}>Systemkart: {t.navn}</button>)}</span> : null; })()}</div>
    {rows.length ? <div className="tbl-wrap"><table><thead><tr><th>TFM-kode</th><th>Betegnelse</th><th>Eiendom</th><th>Fabrikat</th><th>Plassering</th><th className="num">År</th><th>Tilstand</th><th className="num">Åpne avvik</th></tr></thead><tbody>
      {rows.slice(0, 800).map(r => { const av = openAvvik().filter(a => r.kind === 's' ? a.anleggId === r.o.id && !a.komponentId : a.komponentId === r.o.id).length;
        return <tr key={r.o.id} className={'click ' + (r.kind === 's' ? 'sysrow' : '')} onClick={() => r.kind === 's' ? editAnlegg(r.o.id) : editKomponent(r.o.id)}>
          <td className={'mono ' + (r.kind === 'k' ? 'small' : '')} style={r.kind === 's' ? { fontWeight: 600, whiteSpace: 'nowrap' } : { paddingLeft: 24, whiteSpace: 'nowrap' }}>{r.code || '–'}<Pin o={r.o} /></td><td>{r.navn}</td><td className="small">{eNavn(r.e)}</td><td className="small">{r.fab}</td><td className="small">{r.plass}</td><td className="num">{r.aar || '–'}</td><td><TgChip t={r.o.tg} /></td>
          <td className="num">{av ? <span style={{ color: 'var(--red)', fontWeight: 600 }}>{av}</span> : 0}</td></tr>; })}
    </tbody></table></div> : <div className="card"><Empty t="Ingen systemer eller komponenter">Registrer systemer under en eiendom, eller bruk «Importer TFM-liste» der.</Empty></div>}
    {rows.length > 800 && <p className="small muted">Viser 800 av {rows.length}. Bruk søk eller filter.</p>}
  </>;
}
