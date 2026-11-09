// Capex-rapport / langtidsvedlikehold – visning med valgfri periode, utskrift, PDF og lagring under Dokumenter
import React, { useMemo, useRef, useState } from 'react';
import { S, canEdit, kanDrifteE, save, state, toast, uploadFile, useStore } from '../lib/store';
import { openModal } from '../components/ui';
import { YEAR, fd, sortBy, today, type Rec } from '../lib/utils';
import { KGER, TGER, TG_FARGE, capex, endringer, hovedfunn, katFarge, knok, mnok, snapshot, type Capex, type Valg } from '../lib/capexRapport';
import { RAP_CSS, skrivUt } from './ProsjektRapport';
import { tt, lokale } from '../lib/i18n';

const CSS = `.rap .kp{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:10px 0 16px}.rap .kp>div{border:1px solid #dfe3dd;border-radius:8px;padding:8px 10px}
.rap .kp span{display:block;color:#5b645f;font-size:9pt}.rap .kp b{display:block;font-size:15pt;font-variant-numeric:tabular-nums}.rap .lg{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:9pt;margin:6px 0 12px}
.rap .lg i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px;vertical-align:-1px}.rap .ch{display:flex;align-items:flex-end;gap:2px;height:210px;border-bottom:1px solid #9aa39d;position:relative;margin-left:34px}
.rap .ch .gl{position:absolute;left:0;right:0;border-top:1px solid #e9ece7}.rap .ch .gl span{position:absolute;left:-34px;top:-7px;font-size:8pt;color:#5b645f}
.rap .ch .c{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;position:relative;min-width:0}.rap .ch .st{width:72%;max-width:26px;display:flex;flex-direction:column-reverse;border-radius:3px 3px 0 0;overflow:hidden}
.rap .ch .st div{border-top:1.5px solid #fff}.rap .ch .v{font-size:7.5pt;color:#5b645f;margin-bottom:2px;white-space:nowrap}.rap .xa{display:flex;gap:2px;margin-left:34px;font-size:8pt;color:#5b645f}.rap .xa span{flex:1;text-align:center}
.rap .ring{outline:2px solid #b42318;outline-offset:1px}.rap .ett{border:1px solid #e9b4ad;background:#fbefed;border-radius:8px;padding:10px 12px;margin:12px 0}.rap .ett b{color:#b42318}
.rap .tgb{display:grid;grid-template-columns:150px 1fr 50px;gap:8px;align-items:center;font-size:9.5pt;padding:2px 0}.rap .tgb .b{display:flex;height:13px;border-radius:0 3px 3px 0;overflow:hidden}.rap .tgb .b div{border-right:1.5px solid #fff}
.rap .mx td{text-align:center;border:1px solid #e3e6e1}.rap .to{display:grid;grid-template-columns:1fr 1fr;gap:20px}.rap .sig{display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-top:20px}.rap .sig div{border-bottom:1px solid #1d2521;height:30px}
.rap .side{break-before:page;page-break-before:always}.rap .dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:4px}`;
const Lg = ({ L }: { L: [string, string][] }) => <div className="lg">{L.map(([n, c]) => <span key={n}><i style={{ background: c }} />{n}</span>)}</div>;
const risiko = (tg: string, kg: string) => (({ TG3: 3, TG2: 2, TG1: 1, TG0: 0 } as Record<string, number>)[tg] ?? 0) + (+kg.slice(2) || 0);
const rBg = (r: number) => r >= 5 ? '#f6d5d1' : r >= 4 ? '#f7e3c6' : r >= 2 ? '#eef3e8' : '#fff';

function Rapport({ c, kommentar, maxRader, forrige }: { c: Capex; kommentar: string; maxRader: number; forrige?: Rec | null }) {
  const v = c.v; const navn = v.eid ? S.eiendommer.find(e => e.id === v.eid)?.navn : `Alle eiendommer (${S.eiendommer.length})`; const til = v.fra + v.aar - 1;
  const max = Math.max(...c.perAar, 1); const p10 = Math.pow(10, Math.floor(Math.log10(max))); const top = Math.ceil(max / p10) * p10;
  const tiltak = sortBy(c.kort, p => p.y * 1e12 - p.kost).sort((a, b) => a.y - b.y || b.kost - a.kost); const vis = [...tiltak].sort((a, b) => b.kost - a.kost).slice(0, maxRader).sort((a, b) => a.y - b.y || b.kost - a.kost);
  const resten = c.kortSum - vis.reduce((s, p) => s + p.kost, 0); const funn = hovedfunn(c); const end = endringer(c, forrige);
  const tgMax = Math.max(...c.tgKat.map(x => x.tg.reduce((s, y) => s + y, 0)), 1);
  const etikett = (i: number) => v.aar > 20 ? (i % 5 === 0 ? String(c.years[i]) : '') : v.aar > 10 ? (i % 2 === 0 ? '’' + String(c.years[i]).slice(2) : '') : String(c.years[i]);
  const kortTekst = c.korteste === v.aar ? 'perioden' : `de første ${c.korteste} årene`;
  return <div className="rap"><style>{RAP_CSS + CSS}</style>
    <div className="meta">{tt("Capex-rapport · langtidsvedlikehold ·")} {fd(today())} · {state.me?.navn || state.me?.epost || ''}</div>
    <h1>{navn}</h1>
    <div className="meta">{tt("Utskiftingsbehov")} {v.fra}–{til} ({v.aar} {tt("år) ·")} {v.pris === 'dagens' ? tt("{0}-kroner", YEAR) : tt("prisjustert med KPI{0}", c.kpi.modus === 'fast' ? ' ' + c.kpi.fast.toLocaleString(lokale()) + ' %' : '')}{v.leietaker ? tt(" · inkl. leietakers anlegg") : tt(" · eiers ansvar")}</div>
    <div className="kp">
      <div><span>{tt("Sum")} {v.aar} {tt("år")}</span><b>{mnok(c.tot)} {tt("MNOK")}</b><span>{c.P.length} {tt("tiltak på")} {c.antallSys} {tt("systemer")}</span></div>
      {c.korteste < v.aar && <div><span>{tt("Første")} {c.korteste} {tt("år")}</span><b>{mnok(c.kortSum)} {tt("MNOK")}</b><span>{tt("snitt")} {mnok(c.kortSum / c.korteste)} {tt("MNOK per år")}</span></div>}
      <div><span>{tt("Etterslep og TG3")}</span><b style={{ color: c.ett.length ? '#b42318' : undefined }}>{mnok(c.ettSum)} {tt("MNOK")}</b><span>{c.ett.length} {tt("tiltak lagt i")} {YEAR}</span></div>
      <div><span>{tt("Nåverdi")} {v.aar} {tt("år")}</span><b>{mnok(c.nv)} {tt("MNOK")}</b><span>{tt("kalkulasjonsrente")} {c.rente.toLocaleString(lokale())} %</span></div>
      {c.korteste === v.aar && <div><span>{tt("Snitt per år")}</span><b>{mnok(c.tot / v.aar)} {tt("MNOK")}</b><span>&nbsp;</span></div>}
    </div>
    <h2>{tt("Utskiftingskostnad per år")}</h2><p className="meta" style={{ marginTop: 0 }}>{tt("MNOK per bygningsdel (NS 3451). Rød ramme = år med etterslep eller TG3.")}</p>
    {c.tot ? <><div className="ch">{[1, 0.5].map(r => <div key={r} className="gl" style={{ bottom: r * 100 + '%' }}><span>{mnok(top * r)}</span></div>)}
      {c.years.map((y, i) => <div key={y} className="c"><span className="v">{c.perAar[i] && v.aar <= 20 ? mnok(c.perAar[i]) : ''}</span>
        <div className={'st' + (y === YEAR && c.ett.length ? ' ring' : '')}>{c.kat.map(k => k.perAar[i] > 0 && <div key={k.k} style={{ height: k.perAar[i] / top * 190, background: k.c }} />)}</div></div>)}</div>
      <div className="xa">{c.years.map((y, i) => <span key={y}>{etikett(i)}</span>)}</div>
      <Lg L={c.kat.map(k => [k.n, k.c])} /></> : <p className="muted">{tt("Ingen tiltak med kostnad i perioden. Legg inn installasjonsår, levetid og kostnad på systemene.")}</p>}
    {funn.length > 0 && <><h2>{tt("Hovedfunn")}</h2><ul>{funn.map((f, i) => <li key={i}>{f}</li>)}</ul></>}
    {kommentar.trim() && <><h3>{tt("Kommentar fra forvalter")}</h3><p className="pre">{kommentar}</p></>}

    <div className="side" />
    <h2>{tt("Kostnad per bygningsdel")}</h2>
    <table><thead><tr><th>{tt("Bygningsdel (NS 3451)")}</th>{c.sp.map(s => <th key={s.n} className="n">{s.n}</th>)}<th className="n">{tt("Sum MNOK")}</th><th className="n">{tt("Andel")}</th></tr></thead><tbody>
      {c.kat.map((k, j) => <tr key={k.k}><td><span className="dot" style={{ background: k.c, borderRadius: 2 }} />{k.k !== '?' ? k.k + ' ' : ''}{k.n}</td>{c.sp.map(s => <td key={s.n} className="n">{mnok(s.perKat[j])}</td>)}<td className="n"><b>{mnok(k.sum)}</b></td><td className="n">{c.tot ? Math.round(k.sum / c.tot * 100) : 0} %</td></tr>)}
      <tr className="sum"><td>{tt("Sum")}</td>{c.sp.map(s => <td key={s.n} className="n">{mnok(s.sum)}</td>)}<td className="n">{mnok(c.tot)}</td><td className="n">100 %</td></tr></tbody></table>
    <div className="to">
      <div><h3>{tt("Tilstandsgrad –")} {kortTekst}</h3><p className="meta" style={{ marginTop: 0 }}>{tt("MNOK per bygningsdel fordelt på TG (NS 3424)")}</p>
        {c.tgKat.filter(x => x.tg.some(y => y > 0)).map(x => <div key={x.k} className="tgb"><span>{x.n}</span><div className="b">{x.tg.map((s, i) => s > 0 && <div key={i} style={{ width: s / tgMax * 100 + '%', background: TG_FARGE[TGER[i]] }} />)}</div><span className="n" style={{ textAlign: 'right' }}>{mnok(x.tg.reduce((a, b) => a + b, 0))}</span></div>)}
        <Lg L={TGER.map(t => [t, TG_FARGE[t]])} /></div>
      <div><h3>{tt("Risikomatrise –")} {kortTekst}</h3><p className="meta" style={{ marginTop: 0 }}>{tt("Antall tiltak · MNOK")}</p>
        <table className="mx"><thead><tr><th>{tt("TG \\ KG")}</th>{[...KGER, 'KG?'].map(k => <th key={k} style={{ textAlign: 'center' }}>{k === 'KG?' ? tt("Ikke satt") : k}</th>)}</tr></thead><tbody>
          {['TG3', 'TG2', 'TG1', 'TG0', 'TGIU'].map(t => <tr key={t}><th>{t}</th>{[...KGER, 'KG?'].map(k => { const x = c.mx[t + '|' + k]; return <td key={k} style={{ background: x ? rBg(risiko(t, k)) : '#fff' }}>{x ? tt("{0} · {1}", x.n, mnok(x.s)) : '–'}</td>; })}</tr>)}</tbody></table>
        <p className="meta">{tt("Rødt = høy risiko: bør prioriteres selv om levetiden ikke er nådd. Uten TG = TGIU.")}</p></div>
    </div>
    <div className="kp" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))' }}>
      <div><span>{tt("Eiers ansvar")}</span><b>{c.tot ? Math.round(c.eier / c.tot * 100) : 0} %</b><span>{mnok(c.eier)} {tt("MNOK")}{v.leietaker ? tt(" · leietaker {0}", mnok(c.leietaker)) : ''}</span></div>
      <div><span>{tt("Brann og sikkerhet")}</span><b>{mnok(c.brann)} {tt("MNOK")}</b><span>{tt("brannalarm, nødlys, sprinkler m.m.")}</span></div>
      <div><span>{tt("Før")} {v.fra} {tt("(ikke med)")}</span><b>{mnok(c.ute.foer)} {tt("MNOK")}</b><span>{c.ute.foer ? tt("etterslep før perioden") : tt("ingen")}</span></div>
    </div>

    <div className="side" />
    <h2>{tt("Tiltaksliste –")} {kortTekst}</h2><p className="meta" style={{ marginTop: 0 }}>{vis.length < tiltak.length ? tt("De {0} største av {1} tiltak, sortert på år.", vis.length, tiltak.length) : tt("{0} tiltak, sortert på år.", tiltak.length)}</p>
    {vis.length ? <table><thead><tr><th>{tt("År")}</th><th>{tt("System / komponent")}</th><th>{tt("TG")}</th><th>{tt("KG")}</th><th>{tt("Bygget / levetid")}</th><th className="n">{tt("kNOK")}</th><th>{tt("Grunnlag")}</th></tr></thead><tbody>
      {vis.map(p => <tr key={p.id + p.y}><td><b>{p.y}</b></td><td>{p.navn}</td><td><span className="dot" style={{ background: TG_FARGE[p.tg] }} />{p.tg}</td><td>{p.kg || '–'}</td><td>{p.aar ? tt("{0} / {1} år", p.aar, p.levetid) : '–'}</td><td className="n"><b>{p.kost ? knok(p.kost) : tt("mangler")}</b></td><td>{p.grunnlag}</td></tr>)}
      {resten > 0 && <tr><td colSpan={5} className="muted">{tt("Øvrige")} {tiltak.length - vis.length} {tt("tiltak")}</td><td className="n">{knok(resten)}</td><td /></tr>}
      <tr className="sum"><td colSpan={5}>{tt("Sum")} {kortTekst}</td><td className="n">{knok(c.kortSum)}</td><td /></tr></tbody></table> : <p className="muted">{tt("Ingen tiltak.")}</p>}
    {c.ett.length > 0 && <div className="ett"><b>{tt("Etterslep og strakstiltak –")} {mnok(c.ettSum)} {tt("MNOK")}</b><div>{c.ett.length} {tt("tiltak har passert levetiden eller har TG3 og er lagt i")} {YEAR}: {c.ett.slice(0, 6).map(p => p.navn).join(', ')}{c.ett.length > 6 ? tt(" m.fl.") : ''}.{c.ettAvvik.length ? tt(" Det er {0} åpne avvik på disse systemene ({1}).", c.ettAvvik.length, c.ettAvvik.slice(0, 4).map(a => '#' + a.nr).join(', ')) : ''}</div></div>}
    {c.prosjRader.length > 0 && <><h3>{tt("Koblet til prosjekter")}</h3><table><thead><tr><th>{tt("Prosjekt")}</th><th>{tt("Status")}</th><th className="n">{tt("Budsjett kNOK")}</th><th>{tt("Dekker tiltak")}</th></tr></thead><tbody>
      {c.prosjRader.map(({ p, dekker }) => <tr key={p.id}><td>{p.navn}</td><td>{p.fase || p.status}</td><td className="n">{p.budsjett ? knok(+p.budsjett) : '–'}</td><td>{dekker.map(d => `${d.navn} (${d.y})`).join(', ') || '–'}</td></tr>)}</tbody></table></>}

    <div className="side" />
    <h2>{tt("Forutsetninger")}</h2><table><tbody>
      <tr><td>{tt("Prisnivå")}</td><td>{v.pris === 'dagens' ? tt("Alle beløp indeksregulert til {0}-kroner.", YEAR) : tt("Kostnadene er KPI-justert fra året de ble anslått til utskiftingsåret ({0}).", c.kpi.modus === 'fast' ? c.kpi.fast.toLocaleString(lokale()) + ' % per år' : 'egen sats per år')}</td></tr>
      <tr><td>{tt("Utskiftingsår")}</td><td>{tt("Installasjonsår + teknisk levetid, eller planlagt år der det er satt. TG3 og passert levetid legges i")} {YEAR}.</td></tr>
      <tr><td>{tt("Nåverdi")}</td><td>{tt("Diskontert til")} {YEAR} {tt("med")} {c.rente.toLocaleString(lokale())} {tt("% kalkulasjonsrente.")}</td></tr>
      <tr><td>{tt("Omfang")}</td><td>{v.leietaker ? tt("Alle systemer og bygningsdeler, også anlegg leietaker har ansvar for.") : tt("Systemer og bygningsdeler der eier har ansvaret. Leietakers egne anlegg er holdt utenfor.")}</td></tr>
      <tr><td>{tt("Ikke med")}</td><td>{tt("Løpende drift, service og serviceavtaler, mva, prosjektering og byggherrekostnader, med mindre de ligger i estimatet.")}</td></tr></tbody></table>
    <h2>{tt("Datakvalitet")}</h2>
    <div className="kp" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))' }}>
      <div><span>{tt("Tiltak med kostnad")}</span><b>{c.P.length - c.ute.utenKost.length} {tt("av")} {c.P.length}</b><span>{c.P.length ? Math.round((c.P.length - c.ute.utenKost.length) / c.P.length * 100) : 100} %</span></div>
      <div><span>{tt("Systemer uten år/levetid")}</span><b>{c.ute.utenAar.length}</b><span>{c.ute.utenAar.slice(0, 2).map(a => a.navn || a.type).join(', ') || tt("ingen")}</span></div>
      <div><span>{tt("Uten tilstandsgrad")}</span><b>{c.ute.utenTg}</b><span>{tt("regnes som TGIU")}</span></div>
    </div>
    {end && <><h2>{tt("Endringer siden forrige rapport")}</h2><p className="meta" style={{ marginTop: 0 }}>{tt("Sammenlignet med rapporten")} {fd(end.dato)}{end.periode && end.periode !== `${v.fra}–${v.fra + v.aar - 1}` ? tt(" (periode {0} – sammenligningen er derfor omtrentlig)", end.periode) : ''} {tt("· sum")} {v.aar} {tt("år")} {end.totDelta >= 0 ? '+' : '−'}{mnok(Math.abs(end.totDelta))} {tt("MNOK ·")} {kortTekst} {end.kortDelta >= 0 ? '+' : '−'}{knok(Math.abs(end.kortDelta))} {tt("kNOK")}</p>
      {end.L.length ? <table><thead><tr><th>{tt("Endring")}</th><th className="n">{tt("Effekt")} {kortTekst}{tt(", kNOK")}</th></tr></thead><tbody>{end.L.map((x, i) => <tr key={i}><td>{x.t}</td><td className="n">{x.d ? (x.d > 0 ? '+' : '−') + knok(Math.abs(x.d)) : '–'}</td></tr>)}</tbody></table> : <p className="muted">{tt("Ingen endringer i tiltakene.")}</p>}</>}
    <h2>{tt("Godkjenning")}</h2><div className="sig"><div /><div /></div><div className="sig" style={{ marginTop: 4 }}><span className="meta">{tt("Forvalter · dato")}</span><span className="meta">{tt("Eier · dato")}</span></div>
  </div>;
}

async function lagPdf(c: Capex, kommentar: string, maxRader: number) {
  const { ArkivDoc } = await import('../lib/prosjektArkiv'); const { hex, M, profilFor } = await import('../lib/arealRapport');
  const d: any = await ArkivDoc.lag('Capex-rapport – langtidsvedlikehold'); d.profil = profilFor(c.v.eid || undefined, 'Capex-rapport'); const v = c.v; const navn = v.eid ? S.eiendommer.find(e => e.id === v.eid)?.navn : 'Alle eiendommer';
  d.t(`Utskiftingsbehov ${v.fra}–${v.fra + v.aar - 1} · ${v.pris === 'dagens' ? YEAR + '-kroner' : 'KPI-justert'} · ${fd(today())}`, M, d.y - 8, 8, hex('#5b645f')); d.y -= 14; d.h1(navn);
  d.tab([['Nøkkeltall', 3], ['MNOK', 1.2, true], ['', 3]], [
    { c: [`Sum ${v.aar} år`, mnok(c.tot), `${c.P.length} tiltak`] }, ...(c.korteste < v.aar ? [{ c: [`Første ${c.korteste} år`, mnok(c.kortSum), `snitt ${mnok(c.kortSum / c.korteste)} per år`] }] : []),
    { c: ['Etterslep og TG3', mnok(c.ettSum), `${c.ett.length} tiltak i ${YEAR}`], farge: [undefined, c.ett.length ? hex('#b42318') : undefined] }, { c: [`Nåverdi (${c.rente} %)`, mnok(c.nv), ''] }]);
  // Søylediagram
  if (c.tot) { d.h2('Utskiftingskostnad per år (MNOK)'); const W = d.page.getWidth() - 2 * M - 30; const Hh = 150; d.plass(Hh + 40); const x0 = M + 30; const y0 = d.y - Hh;
    const max = Math.max(...c.perAar, 1); const bw = W / c.years.length;
    [0.5, 1].forEach(r => { d.page.drawLine({ start: { x: x0, y: y0 + Hh * r }, end: { x: x0 + W, y: y0 + Hh * r }, thickness: 0.4, color: hex('#e3e6e1') }); d.t(mnok(max * r), M, y0 + Hh * r - 3, 7, hex('#5b645f')); });
    c.years.forEach((y, i) => { let yy = y0; for (const k of c.kat) { const h = k.perAar[i] / max * Hh; if (h > 0) { d.page.drawRectangle({ x: x0 + i * bw + bw * 0.15, y: yy, width: bw * 0.7, height: h, color: hex(k.c) }); yy += h; } }
      if (c.years.length <= 20 || i % 5 === 0) d.t(c.years.length > 12 ? "'" + String(y).slice(2) : String(y), x0 + i * bw + bw * 0.1, y0 - 10, 6.5, hex('#5b645f')); });
    d.y = y0 - 18; let lx = M; for (const k of c.kat) { d.page.drawRectangle({ x: lx, y: d.y - 2, width: 7, height: 7, color: hex(k.c) }); d.t(k.n, lx + 10, d.y - 1, 7.5); lx += 18 + d.w(k.n, 7.5); } d.y -= 16; }
  const funn = hovedfunn(c); if (funn.length) { d.h2('Hovedfunn'); funn.forEach((f: string) => d.tekst('• ' + f)); }
  if (kommentar.trim()) { d.h2('Kommentar fra forvalter'); d.tekst(kommentar); }
  d.h2('Kostnad per bygningsdel (MNOK)');
  d.tab([['Bygningsdel', 3], ...c.sp.map(s => [s.n, 1.2, true] as [string, number, boolean]), ['Sum', 1.2, true], ['Andel', 1, true]], [
    ...c.kat.map((k, j) => ({ c: [k.n, ...c.sp.map(s => mnok(s.perKat[j])), mnok(k.sum), (c.tot ? Math.round(k.sum / c.tot * 100) : 0) + ' %'] })),
    { c: ['Sum', ...c.sp.map(s => mnok(s.sum)), mnok(c.tot), '100 %'], bold: true }]);
  d.h2(`Tilstandsgrad – første ${c.korteste} år (MNOK)`);
  d.tab([['Bygningsdel', 3], ...TGER.map(t => [t, 1, true] as [string, number, boolean])], c.tgKat.filter(x => x.tg.some(y => y > 0)).map(x => ({ c: [x.n, ...x.tg.map(s => s ? mnok(s) : '–')] })));
  const tiltak = [...c.kort].sort((a, b) => b.kost - a.kost).slice(0, maxRader).sort((a, b) => a.y - b.y || b.kost - a.kost);
  d.h2(`Tiltaksliste – første ${c.korteste} år`);
  d.tab([['År', 0.7], ['System / komponent', 4], ['TG', 0.8], ['KG', 0.8], ['kNOK', 1.1, true], ['Grunnlag', 1.8]], [...tiltak.map(p => ({ c: [p.y, p.navn, p.tg, p.kg || '–', p.kost ? knok(p.kost) : 'mangler', p.grunnlag], farge: [undefined, undefined, hex(TG_FARGE[p.tg])] })), { c: ['', 'Sum', '', '', knok(c.kortSum), ''], bold: true }]);
  if (c.ett.length) { d.h2('Etterslep og strakstiltak'); d.tekst(`${mnok(c.ettSum)} MNOK fordelt på ${c.ett.length} tiltak som er lagt i ${YEAR}: ${c.ett.map(p => p.navn).join(', ')}.`, 9, hex('#b42318')); }
  d.h2('Forutsetninger og datakvalitet');
  d.kv([['Prisnivå', v.pris === 'dagens' ? `${YEAR}-kroner` : 'KPI-justert til utskiftingsåret'], ['Utskiftingsår', 'Installasjonsår + levetid, eller planlagt år. TG3/passert levetid i ' + YEAR], ['Kalkulasjonsrente', c.rente + ' %'],
    ['Tiltak uten kostnad', String(c.ute.utenKost.length)], ['Systemer uten år/levetid', String(c.ute.utenAar.length)], ['Uten tilstandsgrad', String(c.ute.utenTg)]]);
  return await d.pdf.save();
}

function Body({ eid, aar, close }: { eid?: string; aar?: number; close: () => void }) {
  useStore();
  const [v, setV] = useState<Valg>({ eid: eid ?? (S.eiendommer.length === 1 ? S.eiendommer[0].id : ''), fra: YEAR, aar: aar || 10, pris: 'justert', leietaker: false });
  const [kommentar, setKommentar] = useState(''); const [rader, setRader] = useState(15); const [busy, setBusy] = useState(false); const [egen, setEgen] = useState(false);
  const c = useMemo(() => capex(v), [v, S.anlegg, S.komponenter, S.innst, S.prosjekter, S.avvik]);
  const forrige = useMemo(() => { const D = sortBy(S.dokumenter.filter(d => d.type === 'Capex-rapport' && d.capex && (d.capex.v?.eid || '') === v.eid), d => d.dato || '').pop();
    return D ? { ...D.capex, _dato: D.dato } : null; }, [S.dokumenter, v.eid]);
  const ref = useRef<HTMLDivElement>(null); const set = (x: Partial<Valg>) => setV(o => ({ ...o, ...x }));
  const navn = v.eid ? S.eiendommer.find(e => e.id === v.eid)?.navn : 'alle eiendommer'; const tittel = `Capex-rapport ${navn} ${v.fra}–${v.fra + v.aar - 1}`;
  const last = async () => { setBusy(true); try { const b = await lagPdf(c, kommentar, rader); const u = URL.createObjectURL(new Blob([b as any], { type: 'application/pdf' })); const a = document.createElement('a'); a.href = u; a.download = tittel + '.pdf'; a.click(); setTimeout(() => URL.revokeObjectURL(u), 5000); } catch (e: any) { toast(tt("Feil: ") + (e?.message || e)); } finally { setBusy(false); } };
  const lagre = async () => { const e = v.eid || S.eiendommer.find(x => kanDrifteE(x.id))?.id; if (!e || !kanDrifteE(e)) return toast(tt("Mangler skrivetilgang")); setBusy(true);
    try { const b = await lagPdf(c, kommentar, rader); const fil = await uploadFile(new Blob([b as any], { type: 'application/pdf' }) as any, e, undefined, tittel.replace(/[\/\\]/g, '-') + '.pdf', 'rapporter'); if (!fil) throw new Error('Opplasting feilet');
      await save('dokumenter', { eiendomId: e, leietakerId: '', type: 'Capex-rapport', tittel: `Capex-rapport ${v.fra}–${v.fra + v.aar - 1}${v.eid ? '' : ' (alle eiendommer)'}`, dato: today(), fil, notat: kommentar.slice(0, 500), capex: snapshot(c) });
      toast(tt("Rapporten er lagret under Dokumenter. Neste rapport viser hva som er endret siden denne.")); } catch (x: any) { toast(tt("Feil: ") + (x?.message || x)); } finally { setBusy(false); } };
  const PER = [5, 10, 15, 20, 25, 30];
  return <>
    <div className="mh"><h2>{tt("Capex-rapport – langtidsvedlikehold")}</h2><button className="btn ghost sm" onClick={close}>✕</button></div>
    <div className="mb">
      <div className="pa-grid">
        <label className="pa-felt half"><span>{tt("Eiendom")}</span><select value={v.eid} onChange={e => set({ eid: e.target.value })}>{S.eiendommer.length > 1 && <option value="">{tt("Alle eiendommer")}</option>}{sortBy(S.eiendommer, e => e.navn).map(e => <option key={e.id} value={e.id}>{e.navn}</option>)}</select></label>
        <label className="pa-felt half"><span>{tt("Prisnivå")}</span><select value={v.pris} onChange={e => set({ pris: e.target.value as any })}><option value="justert">{tt("Prisjustert (KPI) til utskiftingsåret")}</option><option value="dagens">{tt("Dagens kroner (")}{YEAR})</option></select></label>
        <div className="pa-felt"><span>{tt("Periode")}</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {PER.map(n => <button key={n} type="button" className={'btn sm' + (!egen && v.aar === n ? ' pri' : '')} onClick={() => { setEgen(false); set({ aar: n, fra: YEAR }); }}>{n} {tt("år")}</button>)}
            <button type="button" className={'btn sm' + (egen ? ' pri' : '')} onClick={() => setEgen(true)}>{tt("Egen")}</button>
            {egen && <><label className="small">{tt("fra")} <select value={v.fra} onChange={e => set({ fra: +e.target.value })}>{Array.from({ length: 11 }, (_, i) => YEAR + i).map(y => <option key={y}>{y}</option>)}</select></label>
              <label className="small">{tt("til")} <select value={v.fra + v.aar - 1} onChange={e => set({ aar: Math.max(1, +e.target.value - v.fra + 1) })}>{Array.from({ length: 40 }, (_, i) => v.fra + i).map(y => <option key={y}>{y}</option>)}</select></label></>}
            <span className="small muted">{v.fra}–{v.fra + v.aar - 1}</span></div></div>
        <div className="pa-felt half"><span>{tt("Innhold")}</span><label className="small" style={{ display: 'flex', gap: 6 }}><input type="checkbox" checked={v.leietaker} onChange={e => set({ leietaker: e.target.checked })} />{tt("Ta med anlegg leietaker har ansvar for")}</label>
          <label className="small">{tt("Tiltaksliste: vis de")} <select value={rader} onChange={e => setRader(+e.target.value)}>{[10, 15, 25, 50, 200].map(n => <option key={n} value={n}>{n === 200 ? tt("alle") : n}</option>)}</select> {tt("største")}</label></div>
        <label className="pa-felt half"><span>{tt("Kommentar til eier (valgfritt)")}</span><textarea rows={2} value={kommentar} onChange={e => setKommentar(e.target.value)} placeholder={tt("F.eks. anbefalt budsjettramme og beslutninger eier må ta")} /></label>
      </div>
      <div className="card" ref={ref} style={{ marginTop: 10, maxHeight: '58vh', overflow: 'auto', background: '#fff' }}><Rapport c={c} kommentar={kommentar} maxRader={rader} forrige={forrige} /></div>
    </div>
    <div className="mf"><button className="btn" onClick={close}>{tt("Lukk")}</button>
      <button className="btn" disabled={busy} onClick={() => skrivUt(ref.current, tittel)}>{tt("Skriv ut")}</button>
      <button className="btn" disabled={busy} onClick={last}>{tt("Last ned PDF")}</button>
      {canEdit() && <button className="btn pri" disabled={busy} onClick={lagre} title={tt("Lagres som PDF under Dokumenter, med et øyeblikksbilde så neste rapport kan vise endringer")}>{busy ? tt("Lager …") : tt("Lagre i Dokumenter")}</button>}</div>
  </>;
}
export function capexRapport(eid?: string, aar?: number) { if (!S.eiendommer.length) return toast(tt("Ingen eiendommer")); openModal({ wide: true, render: close => <Body eid={eid} aar={aar} close={close} /> }); }
