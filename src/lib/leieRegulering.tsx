// Leieavtale-vakt i nettleseren: frister på leietakersiden og utkast til indeksregulering (eier godkjenner selv).
import React, { useState } from 'react';
import { S, save, state, toast } from './store';
import { copyText, showModal } from '../components/ui';
import { aarsleie } from './verdivurdering';
import { byId, fd, kpiFor, nok, today } from './utils';
import { nesteRegulering, reguleringUtkast, sisteOppsigDato, dagerTil } from './leieServer';
import { tt } from './i18n';

function brevTekst(l: any, e: any, dato: string, u: { gammel: number; ny: number; prosent: number }, kpi: number, andel: number) {
  return `Emne: Indeksregulering av leie – ${l.lokale ? l.lokale + ', ' : ''}${e.navn || ''}\n\nHei${l.kontakt ? ' ' + l.kontakt : ''},\n\nI henhold til leieavtalen reguleres leien ved ${fd(dato)}. Endringen i konsumprisindeksen er ${kpi.toLocaleString('nb-NO')} %${andel !== 100 ? `, og avtalen regulerer ${andel.toLocaleString('nb-NO')} % av endringen` : ''}.\n\nÅrlig leie endres fra ${nok(u.gammel)} til ${nok(u.ny)} (${u.prosent > 0 ? '+' : ''}${u.prosent.toLocaleString('nb-NO')} %), med virkning fra ${fd(dato)}.\n\nBeregningen er gjort etter reguleringsklausulen i leieavtalen. Gi beskjed hvis dere har spørsmål.\n\nMed vennlig hilsen\n${state.me?.navn || ''}\n`;
}

function Innhold({ l, dato, close }: { l: any; dato: string; close: () => void }) {
  const e = byId('eiendommer', l.eiendomId) || ({} as any); const aar = +dato.slice(0, 4); const gammel = aarsleie(l);
  const [kpi, setKpi] = useState(String(kpiFor(aar))); const [andel, setAndel] = useState(String(l.kpiAndel === '' || l.kpiAndel == null ? 100 : l.kpiAndel));
  const k = Number(kpi.replace(',', '.')) || 0, a = Number(andel.replace(',', '.')); const u = reguleringUtkast(gammel, k, Number.isFinite(a) ? a : 100); const t = brevTekst(l, e, dato, u, k, Number.isFinite(a) ? a : 100);
  const godkjenn = async () => {
    const f = u.gammel ? u.ny / u.gammel : 1; const rad = { dato, gammel: u.gammel, ny: u.ny, kpi: k, andel: Number.isFinite(a) ? a : 100, av: state.me?.navn || '', tid: new Date().toISOString() };
    const nytt: any = { ...l, reguleringer: [...(l.reguleringer || []), rad] };
    if (l.leieEnhet === 'm2') nytt.leieM2 = Math.round((+l.leieM2 || 0) * f * 100) / 100; else nytt.leie = u.ny;
    await save('leietakere', nytt); toast(tt("Leien er oppdatert til {0}", nok(u.ny))); close();
  };
  return <>
    <p className="muted small" style={{ marginTop: 0 }}>{tt("Utkast basert på KPI-satsen i Innstillinger → KPI. Sjekk at utregningen stemmer med reguleringsklausulen i leieavtalen før du godkjenner. Leietaker får ingenting automatisk.")}</p>
    <div className="grid2" style={{ gap: 10 }}>
      <label>{tt("KPI-endring (%)")}<input className="num" value={kpi} onChange={ev => setKpi(ev.target.value)} /></label>
      <label>{tt("Andel av KPI som reguleres (%)")}<input className="num" value={andel} onChange={ev => setAndel(ev.target.value)} /></label>
    </div>
    <p><b>{nok(u.gammel)}</b> → <b>{nok(u.ny)}</b> <span className="muted">({u.prosent > 0 ? '+' : ''}{u.prosent.toLocaleString('nb-NO')} %, {tt("virkning {0}", fd(dato))})</span></p>
    {!u.gammel && <p className="small" style={{ color: 'var(--red)' }}>{tt("Leien er ikke fylt inn på leietakeren, så det er ingenting å regulere.")}</p>}
    <pre className="letter">{t}</pre>
    <div className="toolbar"><button className="btn" onClick={() => copyText(t)}>{tt("Kopier brev")}</button><button className="btn pri" disabled={!u.gammel} onClick={godkjenn}>{tt("Godkjenn og oppdater leien")}</button></div>
  </>;
}

export function LeieVaktKort({ l }: { l: any }) {
  const idag = today(); const nr = nesteRegulering(l, idag); const so = sisteOppsigDato(l);
  if (!l.slutt && !nr) return null;
  const sist = (l.reguleringer || []).slice(-1)[0];
  const dg = (d: string) => { const n = dagerTil(idag, d); return n < 0 ? tt("passert") : n === 0 ? tt("i dag") : tt("om {0} dager", n); };
  return <div className="card" style={{ margin: '12px 0' }}>
    <div className="toolbar" style={{ marginBottom: 6 }}><h2 style={{ margin: 0, flex: 1 }}>{tt("Avtalefrister")}</h2>
      {nr && <button className="btn sm" onClick={() => showModal(tt("Indeksregulering for ") + l.navn, close => <Innhold l={l} dato={nr} close={close} />, { wide: true, foot: close => <button className="btn" onClick={close}>{tt("Lukk")}</button> })}>{tt("Utkast til regulering")}</button>}</div>
    <dl className="dl">
      {l.slutt && <><dt>{tt("Avtaleutløp")}</dt><dd>{fd(l.slutt)} <span className="muted">({dg(l.slutt)})</span></dd></>}
      {so && <><dt>{tt("Siste oppsigelsesdato")}</dt><dd>{fd(so)} <span className="muted">({dg(so)}, {tt("{0} mnd oppsigelsesfrist", l.oppsigMnd)})</span></dd></>}
      {l.slutt && !so && <><dt>{tt("Oppsigelsesfrist")}</dt><dd className="muted">{tt("Ikke lagt inn – fyll ut under Rediger for å få varsel")}</dd></>}
      {nr && <><dt>{tt("Neste indeksregulering")}</dt><dd>{fd(nr)} <span className="muted">({dg(nr)})</span></dd></>}
      {sist && <><dt>{tt("Siste regulering")}</dt><dd>{fd(sist.dato)}: {nok(sist.gammel)} → {nok(sist.ny)}</dd></>}
    </dl></div>;
}
