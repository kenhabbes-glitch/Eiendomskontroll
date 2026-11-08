// Tilsynsanalyser: befaringsrapporter samlet på tvers av eiendommer, med funn per type, alvorlighet, system og status.
import React from 'react';
import { Hjelp } from '../components/Hjelp';
import { S, useStore } from '../lib/store';
import { byId, eNavn, fd, lNavn, sortBy, today, YEAR, type Rec } from '../lib/utils';
import { AV_ALV, AV_LUKKET } from '../lib/catalog';
import { Chip, Empty, FileLink } from '../components/ui';
import { Sel, useFilter } from './common';
import { BTYPER, btype, tellFunn, type Funn } from '../lib/befaring';
import { tt } from '../lib/i18n';

const NS_GRUPPE: Record<string, string> = { '2': 'Bygning', '3': 'VVS', '4': 'Elkraft', '5': 'Tele og automatisering', '6': 'Andre installasjoner', '7': 'Utendørs' };
const dager = (a: string, b: string) => Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 864e5);
type Rad = { k: string; n: number; apne: number };

/** Horisontal stolpe for én serie (magnitude) – verdien står som tekst, stolpen er bare støtte */
function Stolpe({ v, max, apne }: { v: number; max: number; apne?: number }) {
  return <div className="ta-bar" title={tt("{0} funn{1}", v, apne !== undefined ? `, ${apne} åpne` : '')}><div style={{ width: max ? `${Math.max(2, v / max * 100)}%` : 0 }} /></div>;
}
function Fordeling({ tittel, rader, total }: { tittel: string; rader: Rad[]; total?: string }) {
  const max = Math.max(0, ...rader.map(r => r.n));
  return <div className="card" style={{ flex: 1, minWidth: 280 }}><h3 style={{ marginTop: 0 }}>{tittel}</h3>
    {!rader.length ? <p className="small muted">{tt("Ingen funn.")}</p> : <table className="ta-tab"><thead><tr><th>{total || tt("Kategori")}</th><th className="num">{tt("Funn")}</th><th className="num">{tt("Åpne")}</th><th style={{ width: '38%' }}><span className="sr">{tt("Andel")}</span></th></tr></thead><tbody>
      {rader.map(r => <tr key={r.k}><td>{r.k}</td><td className="num mono">{r.n}</td><td className="num mono" style={{ color: r.apne ? 'var(--red)' : undefined }}>{r.apne}</td><td><Stolpe v={r.n} max={max} apne={r.apne} /></td></tr>)}
    </tbody></table>}</div>;
}

export function Tilsynsanalyser() {
  useStore();
  const [f, setF] = useFilter('tilsynsanalyser', { e: '', t: '', fra: `${YEAR - 1}-01-01`, til: '', alle: '' });
  let B = S.befaringer.filter(b => f.alle ? ['Fullført', 'Til signering', 'Signert'].includes(b.status) || b.analyse?.overfort : b.analyse?.overfort);
  if (f.e) B = B.filter(b => b.eiendomId === f.e); if (f.t) B = B.filter(b => b.type === f.t);
  if (f.fra) B = B.filter(b => (b.dato || '') >= f.fra); if (f.til) B = B.filter(b => (b.dato || '') <= f.til);
  B = sortBy(B, b => b.dato || '').reverse();
  const funn = B.flatMap(b => ((b.funn || []) as Funn[]).filter(x => x.art === 'avvik' || x.art === 'energi').map(x => ({ b, f: x, a: x.avvikId ? byId('avvik', x.avvikId) : null })));
  const apen = (x: { a: Rec | null | undefined }) => !x.a || !AV_LUKKET.includes(x.a.status);
  const lukket = funn.filter(x => !apen(x)); const forfalt = funn.filter(x => apen(x) && x.a?.frist && x.a.frist < today());
  const lt = lukket.filter(x => x.a?.lukket && x.a?.oppdaget).map(x => dager(x.a!.oppdaget, x.a!.lukket)); const snitt = lt.length ? Math.round(lt.reduce((s, v) => s + v, 0) / lt.length) : null;
  const grupper = (nok: (x: typeof funn[number]) => string, orden?: string[]) => { const m = new Map<string, Rad>(); funn.forEach(x => { const k = nok(x); const r = m.get(k) || { k, n: 0, apne: 0 }; r.n++; if (apen(x)) r.apne++; m.set(k, r); });
    const L = [...m.values()]; return orden ? orden.map(k => m.get(k)).filter(Boolean) as Rad[] : L.sort((a, b) => b.n - a.n); };
  const sys = (x: typeof funn[number]) => { const a = x.f.anleggId ? byId('anlegg', x.f.anleggId) : null; return a?.tfmSys ? NS_GRUPPE[String(a.tfmSys)[0]] || 'Annet' : 'Ikke knyttet til system'; };
  const ans = (x: typeof funn[number]) => ({ Eier: 'Eier / drift', Leietaker: 'Leietaker', Felles: 'Felles', 'Leverandør/entreprenør': 'Leverandør / entreprenør' } as any)[x.a?.ansvar || x.f.ansvar || ''] || 'Ikke satt';
  const kpi = (l: string, v: string | number, c?: string, t?: string) => <div className="kpi" style={{ cursor: 'default' }} title={t}><div className="l">{l}</div><div className="v" style={{ color: c }}>{v}</div></div>;
  return <>
    <div className="head"><div className="grow"><h1>{tt("Tilsynsanalyser")}<Hjelp id="side.tilsynsanalyser" /></h1><p className="sub">{tt("Befaringsrapporter samlet på tvers av eiendommer: hva som finnes, hvor, hvem som har ansvaret og hvor mye som fortsatt er åpent.")}</p></div></div>
    <div className="toolbar">
      <Sel value={f.e} onChange={e => setF({ e })} opts={sortBy(S.eiendommer, e => e.navn).map(e => [e.id, e.navn] as [string, string])} empty={tt("Alle eiendommer")} />
      <Sel value={f.t} onChange={t => setF({ t })} opts={BTYPER.map(t => [t.k, t.kort] as [string, string])} empty={tt("Alle typer")} />
      <label className="small">{tt("Fra")} <input type="date" value={f.fra} onChange={e => setF({ fra: e.target.value })} /></label><label className="small">{tt("Til")} <input type="date" value={f.til} onChange={e => setF({ til: e.target.value })} /></label>
      <label className="small" style={{ display: 'flex', gap: 5, alignItems: 'center', fontWeight: 400 }}><input type="checkbox" style={{ width: 'auto' }} checked={!!f.alle} onChange={e => setF({ alle: e.target.checked ? '1' : '' })} />{tt("Ta med alle fullførte befaringer")}</label></div>
    {!B.length ? <div className="card"><Empty t="Ingen rapporter i utvalget">{tt("Fullfør en befaring og velg «Overfør til Tilsynsanalyser» under «Rapport og signering», eller kryss av for alle fullførte.")}</Empty></div> : <>
      <div className="kpis">{kpi('Rapporter', B.length)}{kpi('Avvik registrert', funn.length)}{kpi('Åpne', funn.length - lukket.length, funn.length - lukket.length ? 'var(--red)' : undefined)}
        {kpi('Forfalt frist', forfalt.length, forfalt.length ? 'var(--red)' : undefined)}{kpi('Lukket', funn.length ? Math.round(lukket.length / funn.length * 100) + ' %' : '–')}{kpi('Snitt til lukket', snitt === null ? '–' : snitt + ' d', undefined, 'Fra oppdaget til lukket, for lukkede avvik')}</div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Fordeling tittel="Per alvorlighet" total="Alvorlighet" rader={grupper(x => x.a?.alv || x.f.alv || 'Middels', AV_ALV)} />
        <Fordeling tittel="Per ansvar" total="Ansvarlig" rader={grupper(ans)} />
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Fordeling tittel="Per fagområde (NS 3451)" total="Fagområde" rader={grupper(sys)} />
        <Fordeling tittel="Per befaringstype" total="Type" rader={grupper(x => btype(x.b.type).kort)} />
      </div>
      {!f.e && <Fordeling tittel="Per eiendom" total="Eiendom" rader={grupper(x => eNavn(x.b.eiendomId))} />}
      <div className="card"><h3 style={{ marginTop: 0 }}>{tt("Rapporter")}</h3><div className="tbl-wrap"><table><thead><tr><th>{tt("Befaring")}</th><th>{tt("Eiendom")}</th><th>{tt("Dato")}</th><th>{tt("Status")}</th><th className="num">{tt("Funn")}</th><th className="num">{tt("Åpne")}</th><th>{tt("Rapport")}</th></tr></thead><tbody>
        {B.map(b => { const n = tellFunn(b); return <tr key={b.id}><td><a href={'#/befaring/' + b.id}><b style={{ fontWeight: 600 }}>{b.tittel || btype(b.type).navn}</b></a><div className="small muted">{btype(b.type).kort}{b.leietakerId ? ' · ' + lNavn(b.leietakerId) : ''}</div></td>
          <td className="small">{eNavn(b.eiendomId)}</td><td className="small">{fd(b.dato)}</td><td><Chip c={b.status === 'Signert' ? 'green' : 'blue'}>{b.status}</Chip></td><td className="num">{n.n}</td><td className="num" style={{ color: n.apne ? 'var(--red)' : undefined }}>{n.apne}</td>
          <td className="small">{b.signering?.ferdig ? <FileLink fil={b.signering.ferdig.fil}>{tt("Signert PDF")}</FileLink> : b.rapport?.fil?.path ? <FileLink fil={b.rapport.fil}>{tt("PDF v")}{b.rapport.versjon}</FileLink> : '–'}</td></tr>; })}
      </tbody></table></div></div>
      <p className="small muted">{tt("Åpne = avvik som ikke er rettet, avvist eller lukket i avviksregisteret. Tallene følger status i avvikene fortløpende.")}</p>
    </>}
  </>;
}
