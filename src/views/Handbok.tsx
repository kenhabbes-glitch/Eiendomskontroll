// Håndbok for eier, eiendomssjef og teknisk forvalter: hvordan rollene utfyller hverandre,
// med status fra dataene i appen, sjekklister og nedlasting som PDF.
import React, { useState } from 'react';
import { KAPITLER, ROLLER, HANDBOK_VERSJON, type Auto, type Blokk, type Kapittel, type Rolle } from '../lib/handbok';
import { S, canEdit, state, useStore } from '../lib/store';
import { activeTasks, compRest, docCoverage, dUntil, openAvvik, pliktStatus } from '../lib/utils';
import { dokPaakrevd } from '../lib/land';
import { bvOppfolging } from '../lib/brannvern';
import { harModul } from '../lib/moduler';
import { Chip } from '../components/ui';
import { esc, skrivDok, tabell } from '../lib/dokument';
import { tt } from '../lib/i18n';

type Status = { n: number; tekst: string; til: string };

/** Tall fra appen som sjekklistene og statusfeltet bygger på (samme regler som Oversikt). */
function beregnStatus(): Partial<Record<Auto, Status>> {
  const ed = canEdit();
  const T = activeTasks(); const OA = openAvvik();
  const r: Partial<Record<Auto, Status>> = {
    forfalte: { n: T.filter(o => (dUntil(o.nesteFrist) as number) < 0).length, tekst: 'Forfalte kontroller', til: 'kontroller' },
    kritiskeAvvik: { n: OA.filter(a => a.alv === 'Kritisk' || a.alv === 'Høy').length, tekst: 'Åpne kritiske/høye avvik', til: 'avvik' },
    avvikOverFrist: { n: OA.filter(a => a.frist && (dUntil(a.frist) as number) < 0).length, tekst: 'Avvik over frist', til: 'avvik' },
    tg3: { n: [...S.anlegg, ...S.komponenter.filter(k => k.levetid || k.planAar || k.tg)].filter(a => { const x = compRest(a); return (x !== null && x <= 0) || a.tg === 'TG3'; }).length, tekst: 'TG3 eller passert levetid', til: ed && harModul('vedlikehold') ? 'vedlikehold' : 'tfm' },
  };
  if (ed) {
    r.dokMangler = { n: S.eiendommer.flatMap(e => docCoverage(e, dokPaakrevd(e.id)).filter(x => x.s === 'no' || x.s === 'exp')).length, tekst: 'Dokumenter mangler/utløpt', til: 'dokumenter' };
    r.dokUtloper = { n: S.dokumenter.filter(d => { const x = dUntil(d.gyldigTil); return x !== null && x >= 0 && x <= 90; }).length, tekst: 'Dokumenter som utløper innen 90 d', til: 'dokumenter' };
    r.ikUbekreftet = { n: S.leietakere.flatMap(l => (l.plikter || []).filter((p: any) => pliktStatus(p).o >= 2)).length, tekst: 'Leietakerplikter ubekreftet', til: 'leietakere' };
    r.fornyelse = { n: S.leietakere.filter(l => l.slutt && (dUntil(l.slutt) as number) <= (+l.varsel || 12) * 30.5).length, tekst: 'Leieavtaler til fornyelse', til: 'leietakere' };
    if (harModul('brannvern')) r.brannvern = { n: bvOppfolging().length, tekst: 'Leietakere som mangler brannvernbekreftelse', til: 'leietakere' };
  }
  return r;
}

const NOKKEL = () => 'ek.handbok.sjekk.' + (state.me?.id || 'x');
function lesAvkryss(): Record<string, boolean> { try { return JSON.parse(localStorage.getItem(NOKKEL()) || '{}'); } catch { return {}; } }

const go = (p: string) => { location.hash = '#/' + p; };
const tilKap = (id: string) => document.getElementById('hb-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

export function Handbok() {
  useStore();
  const [rolle, setRolle] = useState<Rolle | ''>(() => { try { return (localStorage.getItem('ek.handbok.rolle') as Rolle) || ''; } catch { return ''; } });
  const [kryss, setKryss] = useState<Record<string, boolean>>(lesAvkryss);
  const velgRolle = (r: Rolle | '') => { setRolle(r); try { localStorage.setItem('ek.handbok.rolle', r); } catch { } };
  const toggle = (id: string) => { const n = { ...kryss, [id]: !kryss[id] }; setKryss(n); try { localStorage.setItem(NOKKEL(), JSON.stringify(n)); } catch { } };
  const st = beregnStatus();
  const kap = KAPITLER.filter(k => !rolle || k.roller.includes(rolle));
  const kpi = (Object.keys(st) as Auto[]).filter(k => k !== 'dokUtloper' && k !== 'avvikOverFrist');

  return <>
    <div className="head"><div className="grow"><h1>{tt("Håndbok for eier og forvaltning")}</h1>
      <p className="sub">{tt("Hvordan eier, eiendomssjef og teknisk forvalter utfyller hverandre – fra plikter til ferdig produkt. Versjon")} {HANDBOK_VERSJON}</p></div>
      <button className="btn pri" onClick={() => lastNedPdf(kap, rolle, st, kryss)}>{tt("Last ned som PDF")}</button></div>

    <div className="seg" style={{ marginBottom: 14 }}>
      <button className={'btn sm' + (!rolle ? ' pri' : '')} onClick={() => velgRolle('')}>{tt("Alle roller")}</button>
      {ROLLER.map(([k, n]) => <button key={k} className={'btn sm' + (rolle === k ? ' pri' : '')} onClick={() => velgRolle(k)}>{tt(n)}</button>)}
    </div>

    <div className="sec" style={{ marginTop: 0 }}><h2>{tt("Status nå")}</h2>
      <div className="kpis">{kpi.map(k => { const s = st[k]!; return <button key={k} className={'kpi ' + (s.n ? 'warn' : 'ok')} onClick={() => go(s.til)}><div className="l">{tt(s.tekst)}</div><div className="v">{s.n}</div><div className="s">{s.n ? tt("Følg opp") : tt("I orden")}</div></button>; })}</div>
    </div>

    <div className="card" style={{ marginBottom: 16 }}><h3 style={{ marginTop: 0 }}>{tt("Innhold")}</h3>
      <ol style={{ margin: 0, paddingLeft: 20, columns: 2, columnGap: 32 }}>{kap.map(k => <li key={k.id}><a href="#" onClick={e => { e.preventDefault(); tilKap(k.id); }}>{tt(k.tittel)}</a></li>)}</ol>
    </div>

    {kap.map((k, i) => <div key={k.id} id={'hb-' + k.id} className="card rules" style={{ marginBottom: 16, scrollMarginTop: 16 }}>
      <h2 style={{ marginTop: 0 }}>{i + 1}. {tt(k.tittel)}</h2>
      <p style={{ fontWeight: 500 }}>{tt(k.ingress)}</p>
      {k.blokker.map((b, j) => <BlokkVis key={j} b={b} st={st} kryss={kryss} toggle={toggle} />)}
      <div className="small muted" style={{ marginTop: 8 }}>{tt("Gjelder")}: {k.roller.map(r => tt(ROLLER.find(x => x[0] === r)![1])).join(', ')}</div>
    </div>)}
  </>;
}

function BlokkVis({ b, st, kryss, toggle }: { b: Blokk; st: Partial<Record<Auto, Status>>; kryss: Record<string, boolean>; toggle: (id: string) => void }) {
  if ('p' in b) return <p>{tt(b.p)}</p>;
  if ('h3' in b) return <h3>{tt(b.h3)}</h3>;
  if ('ul' in b) return <ul>{b.ul.map((x, i) => <li key={i}>{tt(x)}</li>)}</ul>;
  if ('ol' in b) return <ol style={{ paddingLeft: 20, color: 'var(--ink2)' }}>{b.ol.map((x, i) => <li key={i} style={{ margin: '4px 0' }}>{tt(x)}</li>)}</ol>;
  if ('merk' in b) return <div className="note" style={{ color: 'var(--ink)', margin: '10px 0' }}>{tt(b.merk)}</div>;
  if ('tabell' in b) return <div className="tbl-wrap" style={{ margin: '8px 0 12px' }}><table><thead><tr>{b.tabell.hode.map(h => <th key={h}>{tt(h)}</th>)}</tr></thead>
    <tbody>{b.tabell.rader.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={j ? 'small' : undefined}>{tt(c)}</td>)}</tr>)}</tbody></table></div>;
  return <div className="list" style={{ margin: '6px 0 12px' }}>{b.sjekk.map(s => {
    const a = s.auto ? st[s.auto] : undefined;
    if (a) return <div key={s.id} className="li" onClick={() => go(a.til)} style={{ cursor: 'pointer' }}>
      <Chip c={a.n ? 'amber' : 'green'}>{a.n ? tt("{0} gjenstår", a.n) : tt("I orden")}</Chip>
      <div className="grow"><div className="lt">{tt(s.tekst)}</div><div className="ls">{tt("Fra appen")} · {tt(a.tekst)}</div></div></div>;
    return <label key={s.id} className="li" style={{ cursor: 'pointer' }}>
      <input type="checkbox" checked={!!kryss[s.id]} onChange={() => toggle(s.id)} />
      <div className="grow"><div className="lt" style={kryss[s.id] ? { textDecoration: 'line-through', color: 'var(--muted)' } : undefined}>{tt(s.tekst)}</div></div></label>;
  })}</div>;
}

// ---------- PDF (via felles dokumentmal: åpnes i nytt vindu, «Lagre som PDF») ----------
function blokkHtml(b: Blokk, st: Partial<Record<Auto, Status>>, kryss: Record<string, boolean>): string {
  if ('p' in b) return `<p>${esc(tt(b.p))}</p>`;
  if ('h3' in b) return `<h3 style="font-size:13px;margin:14px 0 6px;break-after:avoid">${esc(tt(b.h3))}</h3>`;
  if ('ul' in b) return `<ul style="margin:0 0 8px;padding-left:18px">${b.ul.map(x => `<li style="margin:2px 0">${esc(tt(x))}</li>`).join('')}</ul>`;
  if ('ol' in b) return `<ol style="margin:0 0 8px;padding-left:18px">${b.ol.map(x => `<li style="margin:2px 0">${esc(tt(x))}</li>`).join('')}</ol>`;
  if ('merk' in b) return `<div class="regler" style="margin-top:8px"><p style="margin:0">${esc(tt(b.merk))}</p></div>`;
  if ('tabell' in b) return `<div style="margin:6px 0 10px">${tabell(b.tabell.hode.map(h => tt(h)), b.tabell.rader.map(r => r.map(c => esc(tt(c)))))}</div>`;
  return `<ul style="list-style:none;margin:0 0 8px;padding:0">${b.sjekk.map(s => {
    const a = s.auto ? st[s.auto] : undefined;
    const ok = a ? !a.n : !!kryss[s.id];
    const merk = a ? ` <span style="color:#566170">(${esc(tt("fra appen"))}: ${a.n ? esc(tt("{0} gjenstår", a.n)) : esc(tt("i orden"))})</span>` : '';
    return `<li style="margin:3px 0;break-inside:avoid"><span style="display:inline-block;width:16px">${ok ? '☑' : '☐'}</span>${esc(tt(s.tekst))}${merk}</li>`;
  }).join('')}</ul>`;
}

function lastNedPdf(kap: Kapittel[], rolle: Rolle | '', st: Partial<Record<Auto, Status>>, kryss: Record<string, boolean>) {
  const rnavn = rolle ? tt(ROLLER.find(r => r[0] === rolle)![1]) : tt("Alle roller");
  const statusRader = (Object.keys(st) as Auto[]).map(k => [esc(tt(st[k]!.tekst)), String(st[k]!.n)]);
  const innhold = [
    `<section class="sek"><h2>${esc(tt("Status fra appen ved utskrift"))}</h2>${tabell([tt("Nøkkeltall"), tt("Antall")], statusRader, [1])}</section>`,
    `<section class="sek"><h2>${esc(tt("Innhold"))}</h2><ol style="margin:0;padding-left:18px">${kap.map(k => `<li>${esc(tt(k.tittel))}</li>`).join('')}</ol></section>`,
    ...kap.map((k, i) => `<section class="sek"><h2 style="break-after:avoid">${i + 1}. ${esc(tt(k.tittel))}</h2><p style="font-weight:500">${esc(tt(k.ingress))}</p>${k.blokker.map(b => blokkHtml(b, st, kryss)).join('')}</section>`),
  ];
  skrivDok({ type: tt("Håndbok"), tittel: tt("Håndbok for eier og forvaltning"), undertittel: `${rnavn} · ${tt("Versjon")} ${HANDBOK_VERSJON}`, innhold, filnavn: `${tt("Håndbok")} – ${rnavn}` });
}
