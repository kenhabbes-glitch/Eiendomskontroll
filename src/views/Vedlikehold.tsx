import { aktivtProsjektFor, opprettUtskifting } from '../lib/prosjekt';
import { TgForslagChip } from '../components/TgKg';
import React from 'react';
import { Hjelp } from '../components/Hjelp';
import { S, useStore, kanRedigereE } from '../lib/store';
import { YEAR, aNavn, compYear, eNavn, kNavn, knok, nok, kostJustert, kpiInnst, kostNaa, egetAar, sysKomp, naaverdi, renteInnst, erForslag, harForslag } from '../lib/utils';
import { editAnlegg, editKomponent } from '../lib/actions';
import { AnleggTable } from '../components/tables';
import { capexRapport } from './CapexRapport';
import { tilstandsrapport } from './Tilstandsrapport';
import { harModul } from '../lib/moduler';
import { Chip, ForslagMerke, TgChip } from '../components/ui';
import { Sel, eiendomOpts, useFilter } from './common';
import { tt, lokale } from '../lib/i18n';

export function Vedlikehold() {
  useStore();
  const [f, setF] = useFilter('ved', { e: '', h: '20', pris: 'justert' });
  const pj = f.pris !== 'dagens'; const kpi = kpiInnst();
  const H = +f.h || 20; let A = S.anlegg.slice(); if (f.e) A = A.filter(a => a.eiendomId === f.e);

  const years: number[] = []; for (let y = YEAR; y < YEAR + H; y++) years.push(y);
  // Systemet skiftes med sentralkost + alle komponenter i systemets utskiftingsår.
  // Komponenter med egen kortere levetid skiftes i tillegg i sitt eget år (før systemet).
  const planAar = (a: any) => { let y = compYear(a); if (a.tg === 'TG3') y = Math.min(y || YEAR, YEAR); if (y !== null && y < YEAR) y = YEAR; return y; };
  const kost = (o: any, y: number | null) => pj ? kostJustert(o, y) : kostNaa(o);
  type It = { a: any; y: number | null; k: number; nv: number; late: boolean; n?: number; sentral?: number };
  const items: It[] = [];
  A.forEach(a => { const y = planAar(a); const cy = compYear(a); const ks = sysKomp(a); const sentral = Math.round(kost(a, y)); const kk = ks.reduce((s, k) => s + kost(k, y), 0);
    items.push({ a, y, k: Math.round(sentral + kk), nv: Math.round(naaverdi(kostJustert(a, y) + ks.reduce((s, k) => s + kostJustert(k, y), 0), y)), late: cy !== null && cy < YEAR, n: ks.filter(k => +k.kost > 0).length, sentral });
    ks.filter(k => egetAar(k)).forEach(k => { const ky = planAar(k); const kcy = compYear(k); if (ky === null || (y !== null && ky >= y)) return; items.push({ a: { ...k, _k: 1 }, y: ky, k: Math.round(kost(k, ky)), nv: Math.round(naaverdi(kostJustert(k, ky), ky)), late: kcy !== null && kcy < YEAR }); }); });
  for (let i = items.length - 1; i >= 0; i--) if (items[i].y === null || items[i].y! >= YEAR + H) items.splice(i, 1);
  const sum = years.map(y => items.filter(i => i.y === y).reduce((s, i) => s + i.k, 0)); const max = Math.max(...sum, 1);
  const nice = (v: number) => { const p = Math.pow(10, Math.floor(Math.log10(v))); return Math.ceil(v / p) * p; }; const top = nice(max);
  const tot = sum.reduce((a, b) => a + b, 0); const noYear = A.filter(a => compYear(a) === null).length; const noCost = items.filter(i => !i.k).length;
  const akutt = items.filter(i => i.late || i.a.tg === 'TG3');
  const byY: Record<number, typeof items> = {}; items.forEach(i => { (byY[i.y!] = byY[i.y!] || []).push(i); });
  return <>
    <div className="head"><div className="grow"><h1>{tt("Vedlikeholdsplan")}<Hjelp id="side.vedlikehold" /></h1><p className="sub">{tt("Langsiktig utskiftingsplan basert på installasjonsår, levetid og tilstandsgrad")}</p></div><button className="btn" onClick={() => capexRapport(f.e || undefined, H)}>{tt("Capex-rapport")}</button><button className="btn" onClick={() => tilstandsrapport(f.e || undefined)} title={tt("Tilstandsgrad og konsekvensgrad per system i NS 3424-format")}>{tt("Tilstandsrapport")}</button></div>
    <div className="toolbar"><Sel value={f.e} onChange={e => setF({ e })} opts={eiendomOpts()} empty={tt("Alle eiendommer")} /><Sel value={f.h} onChange={h => setF({ h })} opts={[['10', '10 år'], ['20', '20 år'], ['30', '30 år']]} /><Sel value={f.pris} onChange={pris => setF({ pris })} opts={[['justert', 'Prisjustert (KPI)'], ['dagens', `Dagens kroner (${YEAR}-nivå)`]]} />
      <span className="small muted">{pj ? <>{tt("KPI:")} {kpi.modus === 'fast' ? kpi.fast.toLocaleString(lokale()) + tt(" % per år") : tt("egen sats per år")} · <a href="#/innstillinger">{tt("endre")}</a></> : tt("Alle beløp indeksregulert til {0}-kroner", YEAR)}</span></div>
    <div className="kpis">
      <div className="kpi" style={{ cursor: 'default' }}><div className="l">{tt("Sum utskiftinger")} {H} {tt("år")}</div><div className="v">{knok(tot)}</div><div className="s">{items.length} {tt("systemer/komponenter")}</div></div>
      <div className={'kpi ' + (akutt.length ? 'bad' : 'ok')} style={{ cursor: 'default' }}><div className="l">{tt("Etterslep / akutt (TG3)")}</div><div className="v">{akutt.length}</div><div className="s">{nok(akutt.reduce((s, i) => s + i.k, 0))}</div></div>
      <div className="kpi" style={{ cursor: 'default' }} data-tip={`Summen av alle utskiftinger i perioden, KPI-justert til utskiftingsåret og diskontert til ${YEAR} med ${renteInnst().toLocaleString(lokale())} % kalkulasjonsrente`}><div className="l">{tt("Nåverdi")} {H} {tt("år")}<Hjelp id="naaverdi" size={14} /></div><div className="v">{knok(items.reduce((s, i) => s + i.nv, 0))}</div><div className="s">{renteInnst().toLocaleString(lokale())} {tt("% kalkulasjonsrente ·")} <a href="#/innstillinger">{tt("endre")}</a></div></div>
      <div className="kpi" style={{ cursor: 'default' }}><div className="l">{tt("Neste 5 år")}</div><div className="v">{knok(sum.slice(0, 5).reduce((a, b) => a + b, 0))}</div><div className="s">{tt("snitt")} {knok(sum.slice(0, 5).reduce((a, b) => a + b, 0) / 5)} {tt("per år")}</div></div>
      <div className={'kpi ' + (noYear || noCost ? 'warn' : 'ok')} style={{ cursor: 'default' }}><div className="l">{tt("Mangler data")}</div><div className="v">{noYear + noCost}</div><div className="s">{noYear} {tt("uten år ·")} {noCost} {tt("uten kostnad")}</div></div>
    </div>
    <div className="card"><h2>{tt("Utskiftingskostnad per år")}</h2>
      {tot ? <><div className="chart">{[1, .5].map(r => <div key={r} className="gl" style={{ bottom: r * 100 + '%' }}><span>{knok(top * r)}</span></div>)}
        {years.map((y, i) => { const n = items.filter(x => x.y === y); return <div key={y} className={'bw ' + (y === YEAR && n.some(x => x.late || x.a.tg === 'TG3') ? 'now' : '')} data-tip={`${y}\n${nok(sum[i])}\n${n.length} systemer/komponenter`}><div className="bar" style={{ height: sum[i] / top * 100 + '%' }} /></div>; })}</div>
        <div className="xax">{years.map((y, i) => <span key={y}>{H > 20 ? (i % 5 === 0 ? y : '') : (i % 2 === 0 ? '’' + String(y).slice(2) : '')}</span>)}</div></>
        : <p className="muted">{tt("Legg inn installasjonsår og estimert utskiftingskostnad på systemer/komponenter for å se kostnadsprofilen.")}</p>}
      <p className="small muted" style={{ marginBottom: 0 }}>{tt("Etterslep (passert levetid) og TG3 legges i inneværende år og vises i rødt.")} {pj ? tt("Beløpene er prisjustert med KPI fra prisnivååret de ble anslått i, frem til utskiftingsåret.") : tt("Beløpene er indeksregulert fra året de ble anslått til {0}-kroner.", YEAR)}</p></div>
    <div className="sec"><h2>{tt("Plan per år")}</h2>{Object.keys(byY).length ? <div className="tbl-wrap"><table><thead><tr><th>{tt("År")}</th><th>{tt("System / komponent")}</th><th>{tt("Eiendom")}</th><th>{tt("Tilstand")}</th><th>{tt("Ansvar utskifting")}</th><th className="num">{tt("Kostnad")}</th><th className="num">{tt("Nåverdi")}<Hjelp id="naaverdi" size={14} /></th></tr></thead><tbody>
      {Object.keys(byY).sort().map(y => <React.Fragment key={y}>{byY[+y].map((i, j) => <tr key={i.a.id} className="click" onClick={() => i.a._k ? editKomponent(i.a.id) : editAnlegg(i.a.id)}><td className="mono">{j === 0 ? y : ''}</td><td>{i.a._k ? kNavn(i.a.id) : aNavn(i.a.id)}{i.late && <> <Chip c="red">{tt("Etterslep")}</Chip></>}{!i.a._k && harModul('prosjekter', i.a.eiendomId) && (aktivtProsjektFor(i.a.id) ? <> <a href={'#/prosjekt/' + aktivtProsjektFor(i.a.id)!.id} onClick={e => e.stopPropagation()}><Chip c="amber">{tt("Utskiftingsprosjekt opprettet")}</Chip></a></> : +y <= YEAR + 2 && kanRedigereE(i.a.eiendomId) && harModul('prosjekter', i.a.eiendomId) ? <> <button className="btn sm" onClick={async e => { e.stopPropagation(); const pid = await opprettUtskifting(i.a.id); if (pid) location.hash = '#/prosjekt/' + pid; }}>{tt("Opprett utskiftingsprosjekt")}</button></> : null)}{i.a._k ? <div className="small muted">{tt("Komponent med egen levetid")}</div> : i.n ? <div className="small muted">{tt("Sentralkost")} {nok(i.sentral || 0)} + {i.n} {tt("komponenter")}</div> : null}</td><td>{eNavn(i.a.eiendomId)}</td><td><TgChip t={i.a.tg} /><TgForslagChip o={i.a} /></td><td className="small">{i.a.utskiftAnsvar || i.a.ansvar || tt("Eier")}</td><td className="num">{i.k ? nok(i.k) : '–'}{i.k > 0 && (i.a._k ? erForslag(i.a) : harForslag(i.a)) && <ForslagMerke />}</td><td className="num">{i.nv ? nok(i.nv) : '–'}</td></tr>)}
        <tr className="grp"><td /><td colSpan={4}>{tt("Sum")} {y}</td><td className="num">{nok(byY[+y].reduce((s, i) => s + i.k, 0))}</td><td className="num">{nok(byY[+y].reduce((s, i) => s + i.nv, 0))}</td></tr></React.Fragment>)}
    </tbody></table></div> : <p className="muted">{tt("Ingen planlagte utskiftinger i perioden.")}</p>}</div>
    <div className="sec"><h2>{tt("Alle systemer og bygningsdeler")}</h2><AnleggTable list={A} showE /></div>
  </>;
}
