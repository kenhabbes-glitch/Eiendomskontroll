import React from 'react';
import { S, useStore } from '../lib/store';
import { YEAR, aNavn, compYear, eNavn, kNavn, knok, nok } from '../lib/utils';
import { editAnlegg, editKomponent } from '../lib/actions';
import { AnleggTable } from '../components/tables';
import { Chip, TgChip } from '../components/ui';
import { Sel, eiendomOpts, useFilter } from './common';

export function Vedlikehold() {
  useStore();
  const [f, setF] = useFilter('ved', { e: '', h: '20' });
  const H = +f.h || 20; let A = S.anlegg.slice(); if (f.e) A = A.filter(a => a.eiendomId === f.e);
  const KC = S.komponenter.filter(k => (k.levetid || k.planAar) && (!f.e || k.eiendomId === f.e)).map(k => ({ ...k, _k: 1 }));
  const years: number[] = []; for (let y = YEAR; y < YEAR + H; y++) years.push(y);
  const items = [...A, ...KC].map((a: any) => { let y = compYear(a); if (a.tg === 'TG3') y = Math.min(y || YEAR, YEAR); if (y !== null && y < YEAR) y = YEAR; const cy = compYear(a); return { a, y, k: +a.kost || 0, late: cy !== null && cy < YEAR }; }).filter(x => x.y !== null && x.y < YEAR + H);
  const sum = years.map(y => items.filter(i => i.y === y).reduce((s, i) => s + i.k, 0)); const max = Math.max(...sum, 1);
  const nice = (v: number) => { const p = Math.pow(10, Math.floor(Math.log10(v))); return Math.ceil(v / p) * p; }; const top = nice(max);
  const tot = sum.reduce((a, b) => a + b, 0); const noYear = A.filter(a => compYear(a) === null).length; const noCost = items.filter(i => !i.k).length;
  const akutt = items.filter(i => i.late || i.a.tg === 'TG3');
  const byY: Record<number, typeof items> = {}; items.forEach(i => { (byY[i.y!] = byY[i.y!] || []).push(i); });
  return <>
    <div className="head"><div className="grow"><h1>Vedlikeholdsplan</h1><p className="sub">Langsiktig utskiftingsplan basert på installasjonsår, levetid og tilstandsgrad</p></div></div>
    <div className="toolbar"><Sel value={f.e} onChange={e => setF({ e })} opts={eiendomOpts()} empty="Alle eiendommer" /><Sel value={f.h} onChange={h => setF({ h })} opts={[['10', '10 år'], ['20', '20 år'], ['30', '30 år']]} /></div>
    <div className="kpis">
      <div className="kpi" style={{ cursor: 'default' }}><div className="l">Sum utskiftinger {H} år</div><div className="v">{knok(tot)}</div><div className="s">{items.length} systemer/komponenter</div></div>
      <div className={'kpi ' + (akutt.length ? 'bad' : 'ok')} style={{ cursor: 'default' }}><div className="l">Etterslep / akutt (TG3)</div><div className="v">{akutt.length}</div><div className="s">{nok(akutt.reduce((s, i) => s + i.k, 0))}</div></div>
      <div className="kpi" style={{ cursor: 'default' }}><div className="l">Neste 5 år</div><div className="v">{knok(sum.slice(0, 5).reduce((a, b) => a + b, 0))}</div><div className="s">snitt {knok(sum.slice(0, 5).reduce((a, b) => a + b, 0) / 5)} per år</div></div>
      <div className={'kpi ' + (noYear || noCost ? 'warn' : 'ok')} style={{ cursor: 'default' }}><div className="l">Mangler data</div><div className="v">{noYear + noCost}</div><div className="s">{noYear} uten år · {noCost} uten kostnad</div></div>
    </div>
    <div className="card"><h2>Utskiftingskostnad per år</h2>
      {tot ? <><div className="chart">{[1, .5].map(r => <div key={r} className="gl" style={{ bottom: r * 100 + '%' }}><span>{knok(top * r)}</span></div>)}
        {years.map((y, i) => { const n = items.filter(x => x.y === y); return <div key={y} className={'bw ' + (y === YEAR && n.some(x => x.late || x.a.tg === 'TG3') ? 'now' : '')} data-tip={`${y}\n${nok(sum[i])}\n${n.length} systemer/komponenter`}><div className="bar" style={{ height: sum[i] / top * 100 + '%' }} /></div>; })}</div>
        <div className="xax">{years.map((y, i) => <span key={y}>{H > 20 ? (i % 5 === 0 ? y : '') : (i % 2 === 0 ? '’' + String(y).slice(2) : '')}</span>)}</div></>
        : <p className="muted">Legg inn installasjonsår og estimert utskiftingskostnad på systemer/komponenter for å se kostnadsprofilen.</p>}
      <p className="small muted" style={{ marginBottom: 0 }}>Etterslep (passert levetid) og TG3 legges i inneværende år og vises i rødt. Beløp er estimater, ikke indeksjustert.</p></div>
    <div className="sec"><h2>Plan per år</h2>{Object.keys(byY).length ? <div className="tbl-wrap"><table><thead><tr><th>År</th><th>System / komponent</th><th>Eiendom</th><th>Tilstand</th><th>Ansvar</th><th className="num">Kostnad</th></tr></thead><tbody>
      {Object.keys(byY).sort().map(y => <React.Fragment key={y}>{byY[+y].map((i, j) => <tr key={i.a.id} className="click" onClick={() => i.a._k ? editKomponent(i.a.id) : editAnlegg(i.a.id)}><td className="mono">{j === 0 ? y : ''}</td><td>{i.a._k ? kNavn(i.a.id) : aNavn(i.a.id)}{i.late && <> <Chip c="red">Etterslep</Chip></>}</td><td>{eNavn(i.a.eiendomId)}</td><td><TgChip t={i.a.tg} /></td><td className="small">{i.a.ansvar || 'Eier'}</td><td className="num">{i.k ? nok(i.k) : '–'}</td></tr>)}
        <tr className="grp"><td /><td colSpan={4}>Sum {y}</td><td className="num">{nok(byY[+y].reduce((s, i) => s + i.k, 0))}</td></tr></React.Fragment>)}
    </tbody></table></div> : <p className="muted">Ingen planlagte utskiftinger i perioden.</p>}</div>
    <div className="sec"><h2>Alle systemer og bygningsdeler</h2><AnleggTable list={A} showE /></div>
  </>;
}
