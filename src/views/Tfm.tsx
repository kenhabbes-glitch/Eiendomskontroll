import { TgForslagChip } from '../components/TgKg';
import React from 'react';
import { Hjelp } from '../components/Hjelp';
import { KOMP } from '../lib/catalog';
import { S, canEdit, useStore } from '../lib/store';
import { eNavn, openAvvik, pad, sortBy, tfmKomp, tfmSys, toCsv } from '../lib/utils';
import { editAnlegg, editKomponent } from '../lib/actions';
import { Empty, TaggChips, TgChip, textModal } from '../components/ui';
import { Search, Sel, eiendomOpts, useFilter } from './common';
import { Pin, HOVEDGRUPPER, useApen } from '../components/tables';
import { openPlan, plasserteFor, visPaaTegning } from './Arealer';
import { TAGGER } from '../lib/catalog';
import { taggerFor } from '../lib/utils';

export function TfmRegister() {
  useStore(); const { apen, toggle, settApen } = useApen();
  const [f, setF] = useFilter('tfm', { e: '', k: '', q: '', t: '', tg: '' });
  let rows: any[] = [];
  S.anlegg.forEach(a => {
    rows.push({ kind: 's', o: a, e: a.eiendomId, code: tfmSys(a, true), navn: a.navn || KOMP[a.type]?.n, fab: a.fabrikat || '', aar: a.aar || '', sort: (a.tfmSys || '999') + '.' + pad(a.tfmLop) });
    S.komponenter.filter(k => k.anleggId === a.id).forEach(k => rows.push({ kind: 'k', o: k, e: a.eiendomId, code: tfmKomp(k, true), navn: k.navn || '', fab: k.fabrikat || '', aar: k.aar || '', plass: k.plassering || '', sort: (a.tfmSys || '999') + '.' + pad(a.tfmLop) + '-' + (k.kode || '') + pad(k.lop) }));
  });
  if (f.e) rows = rows.filter(r => r.e === f.e); if (f.k === 's') rows = rows.filter(r => r.kind === 's'); if (f.k === 'k') rows = rows.filter(r => r.kind === 'k'); if (f.k === 'mangler') rows = rows.filter(r => r.kind === 's' && !r.o.tfmSys); if (f.k === 'uplassert') rows = rows.filter(r => !r.o.pos); if (f.t) rows = rows.filter(r => taggerFor(r.o, r.kind === 's' ? 'a' : 'k').includes(f.t)); if (f.tg) rows = rows.filter(r => f.tg === 'TG23' ? ['TG2', 'TG3'].includes(r.o.tg) : f.tg === 'ingen' ? !r.o.tg : r.o.tg === f.tg);
  if (f.q) { const q = f.q.toLowerCase(); rows = rows.filter(r => (r.code + ' ' + r.navn + ' ' + r.fab + ' ' + (r.plass || '')).toLowerCase().includes(q)); }
  const nk = (r: any) => { const sys = r.kind === 's' ? r.o : S.anlegg.find(a => a.id === r.o.anleggId); return (sys?.tfmSys || '999') + '.' + pad(sys?.tfmLop) + '|' + eNavn(r.e) + '|' + (sys?.id || '') + '|' + (r.kind === 's' ? '' : '~' + (r.o.kode || '') + pad(r.o.lop)); };
  rows.sort((a, b) => nk(a).localeCompare(nk(b)));
  const mis = S.anlegg.filter(a => !a.tfmSys).length;
  // Gruppering etter hovedgruppe i NS 3451 (første siffer i systemkoden)
  const sysFor = (r: any) => r.kind === 's' ? r.o : S.anlegg.find(a => a.id === r.o.anleggId);
  const hg = (r: any) => String(sysFor(r)?.tfmSys || '')[0] || '';
  const grupper = [...new Set(rows.map(hg))].sort((x, y) => (x || '9z').localeCompare(y || '9z')).map(k => ({ k, n: k ? HOVEDGRUPPER[k] || 'Hovedgruppe ' + k : 'Uten TFM-kode', rader: rows.filter(r => hg(r) === k) }));
  const tving = !!f.q || f.k === 'k' || !!f.tg;
  const avFor = (r: any) => openAvvik().filter(a => r.kind === 's' ? a.anleggId === r.o.id && !a.komponentId : a.komponentId === r.o.id).length;
  const alleNokler = () => [...grupper.map(g => 'g' + g.k), ...rows.filter(r => r.kind === 's').map(r => 's' + r.o.id)];
  const csv = () => {
    const L: any[][] = [['TFM-kode', 'Type', 'Betegnelse', 'Eiendom', 'Fabrikat', 'Plassering', 'Serienr', 'Installert år', 'Levetid', 'Tilstand', ...(canEdit() ? ['Kostnad'] : [])]];
    sortBy(S.anlegg, a => eNavn(a.eiendomId) + (a.tfmSys || '999') + pad(a.tfmLop)).forEach(a => {
      L.push([tfmSys(a, true), 'System', a.navn || KOMP[a.type]?.n, eNavn(a.eiendomId), a.fabrikat || '', '', '', a.aar || '', a.levetid || KOMP[a.type]?.l || '', a.tg || '', ...(canEdit() ? [a.kost || ''] : [])]);
      sortBy(S.komponenter.filter(k => k.anleggId === a.id), k => (k.kode || '') + pad(k.lop)).forEach(k => L.push([tfmKomp(k, true), 'Komponent', k.navn || '', eNavn(a.eiendomId), k.fabrikat || '', k.plassering || '', k.serienr || '', k.aar || '', k.levetid || '', k.tg || '', ...(canEdit() ? [k.kost || ''] : [])]));
    });
    textModal('TFM-register som CSV', toCsv(L), 'Semikolonseparert – lim inn i Excel eller lagre som .csv.');
  };
  return <>
    <div className="head"><div className="grow"><h1>TFM-register<Hjelp id="side.tfm" /></h1><p className="sub">Systemer og komponenter merket etter tverrfaglig merkesystem · {S.anlegg.length} systemer · {S.komponenter.length} komponenter{mis > 0 && <span style={{ color: 'var(--amber)' }}> · {mis} systemer mangler kode</span>}</p></div><button className="btn" onClick={csv}>Kopier som regneark (CSV)</button></div>
    <div className="toolbar"><Search value={f.q} onChange={q => setF({ q })} ph="Søk TFM-kode, f.eks. 360.001-JV …" w={280} /><Sel value={f.e} onChange={e => setF({ e })} opts={eiendomOpts()} empty="Alle eiendommer" />
      <Sel value={f.k} onChange={k => setF({ k })} opts={[['s', 'Bare systemer'], ['k', 'Bare komponenter'], ['mangler', 'Systemer uten TFM-kode'], ['uplassert', 'Ikke plassert på tegning']]} empty="Systemer og komponenter" /><Sel value={f.t} onChange={t => setF({ t })} opts={[...new Set([...TAGGER.map(x => x[0]), ...S.anlegg.flatMap(a => taggerFor(a, 'a'))])].map(x => [x, x] as [string, string])} empty="Alle tagger" /><Sel value={f.tg} onChange={tg => setF({ tg })} opts={[['TG3', 'Bare TG3'], ['TG23', 'TG2 og TG3'], ['TG1', 'TG1'], ['TG0', 'TG0'], ['TGIU', 'TGIU'], ['ingen', 'Ikke vurdert']]} empty="Alle tilstander" /><span className="muted small">{rows.length} rader</span>
      {f.e && (() => { const T = sortBy(S.tegninger.filter(t => t.eiendomId === f.e), t => +t.etasje || 0); return T.length ? <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>{T.map(t => <button key={t.id} className="btn sm" onClick={() => openPlan(t.id, { mode: 'tfm' })}>Systemkart: {t.navn}</button>)}</span> : null; })()}</div>
    {rows.length ? <><div className="toolbar" style={{ marginTop: -4 }}><button className="btn sm" onClick={() => settApen(alleNokler(), true)}>▾ Vis alle</button><button className="btn sm" onClick={() => settApen(alleNokler(), false)}>▸ Skjul alle</button>{tving && <span className="small muted">Søk/filter er aktivt – alt vises utvidet</span>}</div>
      <div className="tbl-wrap"><table><thead><tr><th>TFM-kode</th><th>Betegnelse</th><th>Tagger</th><th>Eiendom</th><th>Fabrikat</th><th>Plassering</th><th className="num">År</th><th>Tilstand</th><th>Tegning</th><th className="num">Åpne avvik</th></tr></thead><tbody>
      {grupper.map(g => { const gOpen = tving || !!apen['g' + g.k]; const nS = g.rader.filter(r => r.kind === 's').length, nK = g.rader.filter(r => r.kind === 'k').length; const gAv = g.rader.reduce((s0, r) => s0 + avFor(r), 0);
        return <React.Fragment key={'g' + g.k}>
          <tr className="click grp" onClick={() => !tving && toggle('g' + g.k)} style={{ background: 'var(--bg2, #eef0ec)' }}>
            <td colSpan={9} style={{ fontWeight: 700 }}><span style={{ display: 'inline-block', width: 18, color: 'var(--muted)' }}>{gOpen ? '▾' : '▸'}</span><span className="mono" style={{ marginRight: 8 }}>{g.k || '–'}</span>{g.n}<span className="small muted" style={{ fontWeight: 400, marginLeft: 10 }}>{nS} system{nS === 1 ? '' : 'er'}{nK ? ` · ${nK} komponent${nK === 1 ? '' : 'er'}` : ''}</span></td>
            <td className="num">{gAv ? <span style={{ color: 'var(--red)', fontWeight: 600 }}>{gAv}</span> : 0}</td></tr>
          {gOpen && g.rader.map(r => { const av = avFor(r);
            if (r.kind === 'k' && !tving && !apen['s' + r.o.anleggId] && g.rader.some(x => x.kind === 's' && x.o.id === r.o.anleggId)) return null;
            const ks = r.kind === 's' ? g.rader.filter(x => x.kind === 'k' && x.o.anleggId === r.o.id).length : 0; const sOpen = tving || !!apen['s' + r.o.id];
            return <tr key={r.o.id} className={'click ' + (r.kind === 's' ? 'sysrow' : '')} onClick={() => r.kind === 's' ? editAnlegg(r.o.id) : editKomponent(r.o.id)}>
              <td className={'mono ' + (r.kind === 'k' ? 'small' : '')} style={r.kind === 's' ? { fontWeight: 600, whiteSpace: 'nowrap', paddingLeft: 22 } : { paddingLeft: 58, whiteSpace: 'nowrap' }}>
                {r.kind === 's' && <span onClick={e => { e.stopPropagation(); if (ks && !tving) toggle('s' + r.o.id); }} title={ks ? (sOpen ? 'Skjul komponenter' : 'Vis komponenter') : ''} style={{ display: 'inline-block', width: 22, cursor: ks ? 'pointer' : 'default', color: 'var(--muted)', fontFamily: 'sans-serif' }}>{ks ? (sOpen ? '▾' : '▸') : ''}</span>}
                {r.code || '–'}<Pin o={r.o} />{r.kind === 's' && ks > 0 && !sOpen && <span className="small muted" style={{ fontWeight: 400, marginLeft: 6, fontFamily: 'sans-serif' }}>({ks})</span>}</td>
              <td>{r.navn}</td><td>{(() => { const tg = taggerFor(r.o, r.kind === 's' ? 'a' : 'k'); return <span style={{ opacity: r.kind === 'k' && !Array.isArray(r.o.tagger) ? 0.6 : 1 }} title={r.kind === 'k' && !Array.isArray(r.o.tagger) ? 'Arvet fra systemet' : ''}><TaggChips t={tg} small /></span>; })()}</td><td className="small">{eNavn(r.e)}</td><td className="small">{r.fab}</td><td className="small">{r.plass}</td><td className="num">{r.aar || '–'}</td><td><TgChip t={r.o.tg} /><TgForslagChip o={r.o} />{r.kind === 's' && (() => { const ord: Record<string, number> = { TG0: 0, TG1: 1, TGIU: 1.5, TG2: 2, TG3: 3 }; const v = S.komponenter.filter(k => k.anleggId === r.o.id && k.tg).sort((a, b) => (ord[b.tg] ?? 0) - (ord[a.tg] ?? 0))[0]; return v && (ord[v.tg] ?? 0) > (ord[r.o.tg] ?? -1) && (ord[v.tg] ?? 0) >= 2 ? <div className="small" style={{ color: v.tg === 'TG3' ? 'var(--red)' : 'var(--amber)', whiteSpace: 'nowrap' }} title="Dårligste tilstand blant komponentene">komp. {v.tg}</div> : null; })()}</td>
              <td>{(() => { const n = plasserteFor(r.o).length; return n ? <button className="btn sm" onClick={e => { e.stopPropagation(); visPaaTegning(r.o); }} title="Vis hvor det er på tegningen">⌖ Vis{r.kind === 's' && n > 1 ? ` (${n})` : ''}</button> : <span className="muted small">–</span>; })()}</td>
              <td className="num">{av ? <span style={{ color: 'var(--red)', fontWeight: 600 }}>{av}</span> : 0}</td></tr>; })}
        </React.Fragment>; })}
    </tbody></table></div></> : <div className="card"><Empty t="Ingen systemer eller komponenter">Registrer systemer under en eiendom, eller bruk «Importer TFM-liste» der.</Empty></div>}
  </>;
}
