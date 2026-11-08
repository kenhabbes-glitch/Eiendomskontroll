// Rapporter til eier: beslutningsnotat ved faseavslutning (godkjenning før neste fase) og statusrapport (fremdrift og økonomi).
// Rapporten lagres som et øyeblikksbilde i prosjektet, kan skrives ut/lagres som PDF og sendes på e-post med en personlig lenke.
import React, { useEffect, useRef, useState } from 'react';
import { aoApi, refetch, toast, useStore, state } from '../lib/store';
import { byId, fd, today, addDays, nok, type Rec } from '../lib/utils';
import { openModal, ModalFrame, Chip, Empty, confirmBox, copyText } from '../components/ui';
import { FASER, uid } from '../lib/prosjekt';
import { BESLUTNING_TEKST, GODKJENT, krevGodkjenning, n, oppdaterP, snapshot, trafikklysForslag } from '../lib/prosjektArbeid';
import { Gantt, GanttForklaring } from '../components/Gantt';
import { nsNavn } from '../components/NsVelger';
import { tt } from '../lib/i18n';

const kr = (v: any) => nok(Math.round(+v || 0));
export const RAP_CSS = `.rap{font:10.5pt/1.5 system-ui,-apple-system,"Segoe UI",Arial,sans-serif;color:#1d2521}.rap h1{font-size:18pt;margin:0 0 2px}.rap h2{font-size:12pt;margin:20px 0 6px;padding-bottom:3px;border-bottom:1px solid #d7dbd5}
.rap h3{font-size:10.5pt;margin:12px 0 4px}.rap table{border-collapse:collapse;width:100%;margin:4px 0 8px;font-size:9.5pt}.rap th,.rap td{border-bottom:1px solid #e3e6e1;padding:4px 6px;text-align:left;vertical-align:top}
.rap th{background:#f4f5f2;font-weight:600;position:static}.rap td.n,.rap th.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.rap .sum td{font-weight:700;border-top:1.5px solid #9aa39d}
.rap .meta{color:#6b736d;font-size:9.5pt}.rap .rkpi{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}.rap .rkpi>div{flex:1;min-width:120px;border:1px solid #e3e6e1;border-radius:6px;padding:6px 10px}
.rap .rkpi b{display:block;font-size:13pt}.rap .rkpi span{color:#6b736d;font-size:8.5pt}.rap .besl{border:2px solid #1f6f5c;background:#eef6f3;border-radius:6px;padding:10px 12px;margin:12px 0}
.rap .tl{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}.rap .tl>div{flex:1;min-width:150px;border:1px solid #e3e6e1;border-radius:6px;padding:6px 10px}.rap .dot{display:inline-block;width:11px;height:11px;border-radius:50%;margin-right:6px;vertical-align:-1px}
.rap .pre{white-space:pre-wrap}.rap .muted{color:#6b736d}.rap .svar{border-left:4px solid #2f7d4f;background:#f2f8f4;padding:8px 12px;margin:12px 0}.rap .svar.avvist{border-color:#c0392b;background:#fbefed}
.rap .gantt-wrap{overflow:hidden}@media print{.rap h2{break-after:avoid}.rap table,.rap .gantt-wrap{break-inside:avoid}}`;
const TL: Record<string, [string, string]> = { gronn: ['#2f7d4f', 'Grønn – i rute'], gul: ['#d49a1a', 'Gul – avvik, under kontroll'], rod: ['#c0392b', 'Rød – krever beslutning'] };

/** Ren visning av rapporten fra øyeblikksbildet (brukes i appen, i utskrift og på eiers lenkeside) */
export function RapportVisning({ s, svar, kommentarer }: { s: Rec; svar?: Rec | null; kommentarer?: Rec[] }) {
  const P = s.prosjekt || {}; const O = s.okonomi || {}; const fase = s.type === 'fase'; const B = s.beskrivelse || {};
  const kalk = !fase ? null : s.fase?.k === 'ide' ? s.overslag : s.fase?.k === 'plan' ? (s.kalkyle || s.overslag) : null;
  const tabell = (k: Rec) => <table><thead><tr><th>{tt("Post")}</th><th>{tt("Bygningsdel")}</th><th className="n">{tt("Mengde")}</th><th className="n">{tt("Enhetspris")}</th><th className="n">{tt("Sum")}</th></tr></thead><tbody>
    {k.linjer.map((l: Rec, i: number) => <tr key={i}><td>{l.post}</td><td>{l.bygningsdel ? tt("{0} {1}", l.bygningsdel, nsNavn(l.bygningsdel)) : ''}</td><td className="n">{n(l.mengde) ? tt("{0} {1}", l.mengde, l.enhet || '') : ''}</td><td className="n">{n(l.mengde) ? kr(l.pris) : ''}</td><td className="n">{kr(l.sum)}</td></tr>)}
    <tr><td colSpan={4}>{tt("Sum poster")}</td><td className="n">{kr(k.sum)}</td></tr>
    {k.pa.filter((x: Rec) => x.belop).map((x: Rec) => <tr key={x.id}><td colSpan={4}>{x.navn} ({x.pst} %)</td><td className="n">{kr(x.belop)}</td></tr>)}
    <tr className="sum"><td colSpan={4}>{tt("Totalt eks. mva")}</td><td className="n">{kr(k.tot)}</td></tr></tbody></table>;
  return <div className="rap"><style>{RAP_CSS}</style>
    <div className="meta">{P.eiendom}{P.adresse ? ' · ' + P.adresse : ''}</div>
    <h1>{s.tittel}</h1>
    <div><b>{P.navn}</b> <span className="meta">· {P.type}{P.leder ? tt(" · prosjektleder {0}", P.leder) : ''}</span></div>
    <div className="meta">{tt("Utarbeidet")} {fd(String(s.laget).slice(0, 10))} {tt("av")} {s.av}{s.periode ? tt(" · periode {0}–{1}", s.periode.fra ? fd(s.periode.fra) : 'oppstart', fd(s.periode.til)) : ''}{fase ? tt(" · fase {0} av 6", s.fase.nr) : ''}</div>

    <div className="rkpi">
      <div><span>{s.ramme ? tt("Budsjettramme") : tt("Budsjett")}</span><b>{kr(s.ramme || O.tot?.budsjett)}</b></div>
      <div><span>{tt("Prognose")}</span><b style={{ color: O.avvik > 0 ? '#c0392b' : undefined }}>{kr(O.tot?.prognose)}</b>{O.avvik ? <span>{O.avvik > 0 ? '+' : ''}{kr(O.avvik)} {tt("mot budsjett")}</span> : null}</div>
      <div><span>{tt("Forpliktet / påløpt")}</span><b>{kr(O.tot?.palopt)}</b><span>{tt("forpliktet")} {kr(O.tot?.forpliktet)}</span></div>
      <div><span>{tt("Fremdrift (oppgaver)")}</span><b>{s.fremdrift} %</b>{s.forsinket?.length ? <span style={{ color: '#c0392b' }}>{s.forsinket.length} {tt("forsinket")}</span> : null}</div>
    </div>

    {!fase && s.trafikklys && <div className="tl">{(['fremdrift', 'okonomi', 'kvalitet'] as const).map(k => { const v = s.trafikklys[k] || 'gul'; return <div key={k}><b><span className="dot" style={{ background: TL[v][0] }} />{k === 'fremdrift' ? tt("Fremdrift") : k === 'okonomi' ? tt("Økonomi") : tt("Kvalitet og HMS")}</b><div className="meta">{TL[v][1]}</div>{s.trafikklysTekst?.[k] && <div>{s.trafikklysTekst[k]}</div>}</div>; })}</div>}

    {fase && <>
      {s.anbefaling && <><h2>{tt("Sammendrag og anbefaling")}</h2><p className="pre">{s.anbefaling}</p></>}
      <div className="besl"><b>{tt("Det bes om godkjenning av:")}</b><p className="pre" style={{ margin: '4px 0 0' }}>{s.beslutning}</p>{s.neste && <p className="meta" style={{ margin: '6px 0 0' }}>{tt("Ved godkjenning går prosjektet videre til fase")} {s.fase.nr + 1}: {s.neste.navn}.</p>}</div>
    </>}
    {!fase && <>{s.statusTekst && <><h2>{tt("Status og vurdering")}</h2><p className="pre">{s.statusTekst}</p></>}</>}

    {(fase ? ['ide', 'plan'].includes(s.fase?.k) : false) && (B.bakgrunn || B.mal) && <><h2>{tt("Prosjektbeskrivelse")}</h2>
      {([['bakgrunn', 'Bakgrunn og behov'], ['mal', 'Mål'], ['omfang', 'Omfang'], ['avgrensning', 'Avgrensning'], ['alternativer', 'Alternativer vurdert'], ['konsekvens', 'Konsekvens hvis prosjektet ikke gjennomføres'], ['gevinst', 'Gevinster'], ['berorte', 'Berørte leietakere og drift']] as [string, string][]).filter(([k]) => B[k]).map(([k, l]) => <React.Fragment key={k}><h3>{tt(l)}</h3><p className="pre" style={{ margin: 0 }}>{B[k]}</p></React.Fragment>)}</>}
    {fase && !B.bakgrunn && P.beskrivelse && s.fase?.k === 'ide' && <><h2>{tt("Prosjektbeskrivelse")}</h2><p className="pre">{P.beskrivelse}</p></>}

    {kalk && <><h2>{kalk === s.kalkyle ? tt("Kostnadskalkyle") : tt("Grovt kostnadsoverslag")}</h2>{tabell(kalk)}{kalk.notat && <p className="meta pre">{tt("Forutsetninger:")} {kalk.notat}</p>}</>}
    {fase && s.fase?.k === 'ide' && (s.ramme > 0 || s.finansiering?.length > 0) && <><h2>{tt("Budsjettramme og finansiering")}</h2>
      <table><tbody><tr><td>{tt("Foreslått budsjettramme")}</td><td className="n"><b>{kr(s.ramme)}</b></td></tr>{s.finansiering.map((f: Rec, i: number) => <tr key={i}><td>{f.kilde}{f.merknad ? <span className="muted"> – {f.merknad}</span> : null}</td><td className="n">{kr(f.belop)}</td></tr>)}</tbody></table>
      {s.rammeNotat && <p className="pre meta">{s.rammeNotat}</p>}</>}
    {fase && s.fase?.k === 'anbud' && s.tilbud && <><h2>{tt("Tilbudsevaluering")}</h2>
      <table><thead><tr><th>{tt("Leverandør")}</th><th>{tt("Fag")}</th><th className="n">{tt("Pris eks. mva")}</th><th className="n">{tt("Pris")}</th><th className="n">{tt("Kvalitet")}</th><th className="n">{tt("Fremdrift")}</th><th className="n">{tt("Poeng")}</th><th>{tt("Merknad")}</th></tr></thead><tbody>
        {[...s.tilbud].sort((a: Rec, b: Rec) => b.tot - a.tot).map((t: Rec, i: number) => <tr key={i} style={{ fontWeight: t.valgt ? 700 : 400 }}><td>{t.leverandor}{t.valgt ? tt(" ★ anbefalt") : ''}</td><td>{t.fag}</td><td className="n">{kr(t.pris)}</td><td className="n">{t.ps}</td><td className="n">{t.kvalitet}</td><td className="n">{t.fremdrift}</td><td className="n">{t.tot}</td><td>{t.forbehold}</td></tr>)}</tbody></table>
      {s.tilbudVekt && <p className="meta">{tt("Vekting: pris")} {s.tilbudVekt.pris} {tt("%, kvalitet")} {s.tilbudVekt.kvalitet} {tt("%, fremdrift")} {s.tilbudVekt.fremdrift} %.</p>}</>}
    {fase && s.fase?.k === 'over' && <><h2>{tt("Overtakelse")}</h2><p>{s.mangler.totalt ? tt("{0} åpne av {1} registrerte mangler.", s.mangler.apne, s.mangler.totalt) : tt("Ingen mangler registrert.")}</p>
      {s.mangler.liste.length > 0 && <table><thead><tr><th>{tt("Nr")}</th><th>{tt("Mangel")}</th><th>{tt("Ansvar")}</th><th>{tt("Frist")}</th><th>{tt("Status")}</th></tr></thead><tbody>{s.mangler.liste.map((m: Rec, i: number) => <tr key={i}><td>{m.nr}</td><td>{m.beskrivelse}</td><td>{m.ansvar}</td><td>{fd(m.frist)}</td><td>{m.status}</td></tr>)}</tbody></table>}</>}

    {fase && <><h2>{tt("Oppgaver i fasen")}</h2><table><thead><tr><th>{tt("Oppgave")}</th><th>{tt("Ansvarlig")}</th><th>{tt("Status")}</th></tr></thead><tbody>
      {s.oppgaverFase.map((o: Rec, i: number) => <tr key={i}><td>{o.tittel}</td><td>{o.ansvarlig}</td><td>{o.status}{o.status === 'Ferdig' && o.ferdig ? tt(" {0}", fd(o.ferdig)) : ''}</td></tr>)}</tbody></table></>}

    {!fase && <>
      {s.ferdigIPer?.length > 0 && <><h2>{tt("Utført i perioden")}</h2><ul>{s.ferdigIPer.map((o: Rec, i: number) => <li key={i}>{o.tittel} <span className="muted">({fd(o.ferdig)})</span></li>)}</ul></>}
      {s.forsinket?.length > 0 && <><h2>{tt("Forsinket")}</h2><table><thead><tr><th>{tt("Oppgave")}</th><th>{tt("Frist")}</th><th>{tt("Ansvarlig")}</th></tr></thead><tbody>{s.forsinket.map((o: Rec, i: number) => <tr key={i}><td>{o.tittel}</td><td style={{ color: '#c0392b' }}>{fd(o.frist)}</td><td>{o.ansvarlig}</td></tr>)}</tbody></table></>}
      {s.kommende?.length > 0 && <><h2>{tt("Neste seks uker")}</h2><table><thead><tr><th>{tt("Oppgave")}</th><th>{tt("Frist")}</th><th>{tt("Ansvarlig")}</th></tr></thead><tbody>{s.kommende.map((o: Rec, i: number) => <tr key={i}><td>{o.tittel}</td><td>{fd(o.frist)}</td><td>{o.ansvarlig}</td></tr>)}</tbody></table></>}
      {s.nesteTekst && <><h3>{tt("Plan for neste periode")}</h3><p className="pre">{s.nesteTekst}</p></>}
    </>}

    <h2>{tt("Faser")}</h2><table><thead><tr><th>{tt("Fase")}</th><th>{tt("Periode")}</th><th className="n">{tt("Oppgaver")}</th><th>{tt("Beslutning")}</th></tr></thead><tbody>
      {s.faser.map((f: Rec) => <tr key={f.k} style={{ fontWeight: f.naa ? 700 : 400 }}><td>{f.nr}. {f.navn}{f.naa ? tt(" (nå)") : ''}</td><td>{f.start ? tt("{0}–{1}", fd(f.start), fd(f.slutt)) : '–'}</td><td className="n">{f.ferdig}/{f.antall}</td>
        <td>{f.beslutning ? tt("{0}{1}", f.beslutning.status, f.beslutning.dato ? ' ' + fd(String(f.beslutning.dato).slice(0, 10)) : '') : f.krever ? <span className="muted">{tt("krever godkjenning")}</span> : ''}</td></tr>)}</tbody></table>
    {s.gantt?.length > 0 && <><h2>{tt("Fremdriftsplan")}</h2><div className="gantt-wrap"><Gantt rader={s.gantt} statisk bredde={690} idag={String(s.laget).slice(0, 10)} /></div></>}

    <h2>{tt("Økonomi")}</h2>
    {O.poster?.length > 0 ? <table><thead><tr><th>{tt("Post")}</th><th>{tt("Bygg/teknisk")}</th><th className="n">{tt("Budsjett")}</th><th className="n">{tt("Forpliktet")}</th><th className="n">{tt("Påløpt")}</th><th className="n">{tt("Prognose")}</th><th className="n">{tt("Avvik")}</th></tr></thead><tbody>
      {O.poster.map((x: Rec, i: number) => <tr key={i}><td>{x.post}{x.fag ? <span className="muted"> · {x.fag}</span> : null}</td><td>{x.del}</td><td className="n">{kr(x.budsjett)}</td><td className="n">{kr(x.forpliktet)}</td><td className="n">{kr(x.palopt)}</td><td className="n">{kr(x.prognose)}</td><td className="n" style={{ color: x.prognose > x.budsjett ? '#c0392b' : undefined }}>{kr(x.prognose - x.budsjett)}</td></tr>)}
      <tr className="sum"><td colSpan={2}>{tt("Sum")}</td><td className="n">{kr(O.tot.budsjett)}</td><td className="n">{kr(O.tot.forpliktet)}</td><td className="n">{kr(O.tot.palopt)}</td><td className="n">{kr(O.tot.prognose)}</td><td className="n">{kr(O.avvik)}</td></tr></tbody></table>
      : <p className="muted">{tt("Ingen budsjettposter ennå.")}</p>}
    {O.matrise?.length > 0 && O.tot?.prognose > 0 && (() => { const D = [...new Set(O.matrise.flatMap((m: Rec) => Object.keys(m.r)))] as string[]; return <table><thead><tr><th>{tt("Klassifisering (prognose)")}</th>{D.map(d => <th key={d} className="n">{d}</th>)}</tr></thead><tbody>
      {O.matrise.map((m: Rec, i: number) => <tr key={i}><td>{m.klasse}</td>{D.map(d => <td key={d} className="n">{m.r[d] ? kr(m.r[d]) : '–'}</td>)}</tr>)}</tbody></table>; })()}
    {s.endringer?.antall > 0 && <p>{tt("Endringer:")} {s.endringer.antall} {tt("registrert – godkjent")} {kr(s.endringer.godkjent)}{tt(", til behandling")} {kr(s.endringer.behandling)}.</p>}
    {O.fordeling?.leietaker > 0 && <p>{tt("Fordeling: eier")} {kr(O.fordeling.eier)}{tt(", leietaker")} {kr(O.fordeling.leietaker)}.</p>}

    {s.risiko?.length > 0 && <><h2>{tt("Risiko")}</h2><table><thead><tr><th>{tt("Risiko")}</th><th>{tt("Sannsynlighet")}</th><th>{tt("Konsekvens")}</th><th>{tt("Tiltak")}</th><th>{tt("Ansvar")}</th></tr></thead><tbody>
      {s.risiko.map((r: Rec, i: number) => <tr key={i}><td>{r.risiko}</td><td>{r.sannsynlighet}</td><td>{r.konsekvens}</td><td>{r.tiltak}</td><td>{r.ansvar}</td></tr>)}</tbody></table></>}

    {svar && <div className={'svar' + (svar.beslutning === 'Avvist' ? ' avvist' : '')}><b>{svar.beslutning}</b> {tt("av")} {svar.navn}{svar.epost ? tt(" ({0})", svar.epost) : ''} {fd(String(svar.t).slice(0, 10))}{svar.via === 'manuelt' ? tt(" · registrert manuelt") : tt(" · via lenke")}{svar.komm && <p className="pre" style={{ margin: '4px 0 0' }}>{svar.komm}</p>}</div>}
    {(kommentarer || []).map((k, i) => <div key={i} className="svar"><b>{tt("Kommentar")}</b> {tt("fra")} {k.navn} {fd(String(k.t).slice(0, 10))}<p className="pre" style={{ margin: '4px 0 0' }}>{k.komm}</p></div>)}
  </div>;
}

export function skrivUt(el: HTMLElement | null, tittel: string) {
  const w = window.open('', '_blank'); if (!w || !el) return toast(tt("Tillat sprettoppvinduer for å skrive ut"));
  w.document.write(`<!doctype html><html lang="nb"><head><meta charset="utf-8"><title>${tittel.replace(/</g, '')}</title><style>body{max-width:760px;margin:24px auto;padding:0 20px}@page{margin:15mm}</style></head><body>${el.innerHTML}</body></html>`);
  w.document.close(); w.focus(); setTimeout(() => w.print(), 350);
}

// ---------------- Lage rapport
export function lagRapport(pid: string, type: 'fase' | 'status', fase?: string) { openModal({ wide: true, render: close => <RapportDialog pid={pid} type={type} fase0={fase} close={close} /> }); }

function RapportDialog({ pid, type, fase0, close }: { pid: string; type: 'fase' | 'status'; fase0?: string; close: () => void }) {
  useStore();
  const p = byId('prosjekter', pid)!;
  const forrige = (p.rapporter || []).filter((r: Rec) => r.type === 'status').map((r: Rec) => r.snap?.periode?.til).filter(Boolean).sort().slice(-1)[0];
  const [fase, setFase] = useState(fase0 || p.fase);
  const [t, setT0] = useState<Rec>(() => ({ fra: forrige ? addDays(forrige, 1) : p.start || '', til: today(), anbefaling: '', beslutning: '', statusTekst: '', nesteTekst: '', trafikklys: null, trafikklysTekst: {} }));
  const setT = (x: Rec) => setT0(v => ({ ...v, ...x }));
  const base = snapshot(p, type, { fase, fra: t.fra, til: t.til });
  const besl = t.beslutning || BESLUTNING_TEKST[fase]?.(p, base) || '';
  const tl = t.trafikklys || trafikklysForslag(base);
  const s = snapshot(p, type, { fase, fra: t.fra, til: t.til, tekst: type === 'fase' ? { anbefaling: t.anbefaling, beslutning: besl } : { statusTekst: t.statusTekst, nesteTekst: t.nesteTekst, trafikklys: tl, trafikklysTekst: t.trafikklysTekst } });
  const ref = useRef<HTMLDivElement>(null);
  const [send, setSend] = useState<Rec | null>(null); const [busy, setBusy] = useState(false); const [res, setRes] = useState<Rec | null>(null);
  const lagre = async (): Promise<string> => { const id = uid(); const P = byId('prosjekter', pid)!;
    await oppdaterP(pid, { rapporter: [...(P.rapporter || []), { id, type, fase: type === 'fase' ? fase : P.fase, tittel: s.tittel, opprettet: new Date().toISOString(), av: state.me?.navn || state.me?.epost, status: 'Utkast', snap: s }] }, `${type === 'fase' ? 'Beslutningsnotat' : 'Statusrapport'} laget: ${s.tittel}`); return id; };
  const sendNa = async () => {
    if (!send?.epost || !/^\S+@\S+\.\S+$/.test(send.epost)) return toast(tt("Skriv en gyldig e-postadresse"));
    setBusy(true);
    try { const id = await lagre(); const r = await aoApi({ action: 'pr_send', prosjekt_id: pid, rapport_id: id, epost: send.epost, navn: send.navn, melding: send.melding, lenkeBase: location.origin }); await refetch('prosjekter', pid); setRes(r); if (r.sendt) toast(tt("Sendt til ") + r.til); }
    catch (e: any) { toast(e.message); } finally { setBusy(false); }
  };
  const ek = p.eierKontakt || {};
  const ikkeFerdig = type === 'fase' ? (p.oppgaver || []).filter((o: Rec) => o.fase === fase && !['Ferdig', 'Ikke relevant'].includes(o.status)) : [];
  return <ModalFrame title={type === 'fase' ? tt("Beslutningsnotat til eier") : tt("Statusrapport til eier")} close={close}
    foot={res ? <button className="btn pri" onClick={close}>{tt("Ferdig")}</button> : send ? <><button className="btn" onClick={() => setSend(null)}>{tt("Tilbake")}</button><span style={{ flex: 1 }} /><button className="btn pri" disabled={busy} onClick={sendNa}>{busy ? tt("Sender …") : tt("Send")}</button></>
      : <><button className="btn" onClick={() => skrivUt(ref.current, s.tittel + ' – ' + p.navn)}>{tt("Skriv ut / PDF")}</button><button className="btn" onClick={async () => { await lagre(); toast(tt("Lagret under Rapporter")); close(); }}>{tt("Lagre")}</button><span style={{ flex: 1 }} />
        <button className="btn pri" onClick={() => setSend({ navn: ek.navn || '', epost: ek.epost || '', melding: type === 'fase' ? `Vedlagt beslutningsnotat for ${s.fase.navn.toLowerCase()} i prosjektet «${p.navn}». Jeg ber om godkjenning før vi går videre.` : `Her er statusrapport for prosjektet «${p.navn}».` })}>{tt("Send til eier …")}</button></>}>
    {res ? <div>{res.sendt ? <p>{tt("✓ Sendt til")} <b>{res.til}</b>{tt(". Du får e-post når eieren svarer, og svaret registreres i prosjektet.")}</p>
      : <><p>{tt("E-post kunne ikke sendes automatisk")}{res.grunn ? tt(": {0}", res.grunn) : ''}{tt(". Rapporten er lagret. Send lenken på annen måte:")}</p><p className="mono small" style={{ wordBreak: 'break-all' }}>{res.lenke}</p>
        <p><button className="btn sm" onClick={() => copyText(res.lenke)}>{tt("Kopier lenke")}</button> <a className="btn sm" href={`mailto:${res.til}?subject=${encodeURIComponent(res.emne)}&body=${encodeURIComponent(res.tekst)}`}>{tt("Åpne i e-postprogram")}</a></p></>}</div>
    : send ? <div className="pa-grid">
      <label className="pa-felt half"><span>{tt("Mottaker (navn)")}</span><input value={send.navn} onChange={e => setSend({ ...send, navn: e.target.value })} placeholder={tt("F.eks. styreleder")} /></label>
      <label className="pa-felt half"><span>{tt("E-post")}</span><input type="email" value={send.epost} onChange={e => setSend({ ...send, epost: e.target.value })} /></label>
      <label className="pa-felt"><span>{tt("Melding")}</span><textarea rows={4} value={send.melding} onChange={e => setSend({ ...send, melding: e.target.value })} /></label>
      <p className="small muted" style={{ gridColumn: '1/-1' }}>{tt("Eieren får en personlig lenke (gyldig i 90 dager) der rapporten kan leses")}{type === 'fase' ? tt(" og godkjennes, godkjennes med merknader eller avvises. Ved godkjenning går prosjektet automatisk videre til neste fase") : tt(" og kommenteres")}{tt(". Mottakeren trenger ikke bruker i appen.")}</p></div>
    : <>
      <div className="pa-grid" style={{ marginBottom: 10 }}>
        {type === 'fase' ? <>
          <label className="pa-felt half"><span>{tt("Fase som avsluttes")}</span><select value={fase} onChange={e => { setFase(e.target.value); setT({ beslutning: '' }); }}>{FASER.map(([k, l], i) => <option key={k} value={k}>{i + 1}. {l}</option>)}</select></label>
          <div className="half small" style={{ alignSelf: 'end' }}>{ikkeFerdig.length ? <span style={{ color: 'var(--amber)' }}>{ikkeFerdig.length} {tt("oppgaver i fasen er ikke ferdige.")}</span> : <span style={{ color: 'var(--green)' }}>{tt("Alle oppgaver i fasen er ferdige.")}</span>}</div>
          <label className="pa-felt"><span>{tt("Sammendrag og anbefaling")}</span><textarea rows={4} value={t.anbefaling} onChange={e => setT({ anbefaling: e.target.value })} placeholder={tt("Kort om hva som er gjort i fasen, hva som anbefales og hvorfor.")} /></label>
          <label className="pa-felt"><span>{tt("Det bes om godkjenning av")}</span><textarea rows={2} value={besl} onChange={e => setT({ beslutning: e.target.value })} /></label>
        </> : <>
          <label className="pa-felt half"><span>{tt("Periode fra")}</span><input type="date" value={t.fra} onChange={e => setT({ fra: e.target.value })} /></label>
          <label className="pa-felt half"><span>{tt("Til")}</span><input type="date" value={t.til} onChange={e => setT({ til: e.target.value })} /></label>
          {(['fremdrift', 'okonomi', 'kvalitet'] as const).map(k => <label key={k} className="pa-felt third"><span>{k === 'fremdrift' ? tt("Fremdrift") : k === 'okonomi' ? tt("Økonomi") : tt("Kvalitet og HMS")}</span>
            <select value={tl[k]} onChange={e => setT({ trafikklys: { ...tl, [k]: e.target.value } })}>{Object.entries(TL).map(([v, [, l]]) => <option key={v} value={v}>{l}</option>)}</select>
            <input value={t.trafikklysTekst[k] || ''} placeholder={tt("Kort kommentar")} onChange={e => setT({ trafikklysTekst: { ...t.trafikklysTekst, [k]: e.target.value } })} /></label>)}
          <label className="pa-felt"><span>{tt("Status og vurdering")}</span><textarea rows={3} value={t.statusTekst} onChange={e => setT({ statusTekst: e.target.value })} placeholder={tt("Hva er gjort, hvordan ligger vi an, hva bør eier vite?")} /></label>
          <label className="pa-felt"><span>{tt("Plan for neste periode")}</span><textarea rows={2} value={t.nesteTekst} onChange={e => setT({ nesteTekst: e.target.value })} /></label>
        </>}
      </div>
      <div className="pa-forhand"><div className="small muted" style={{ marginBottom: 6 }}>{tt("Forhåndsvisning")}</div><div ref={ref}><RapportVisning s={s} /></div></div>
    </>}
  </ModalFrame>;
}

// ---------------- Rapporter-fanen
export function Rapporter({ p, kan }: { p: Rec; kan: boolean }) {
  const R: Rec[] = [...(p.rapporter || [])].sort((a, b) => String(b.opprettet).localeCompare(String(a.opprettet)));
  return <>
    <div className="toolbar"><h2 style={{ margin: 0, flex: 1 }}>{tt("Rapporter og godkjenninger")}</h2>
      {kan && <><button className="btn" onClick={() => lagRapport(p.id, 'status')}>{tt("+ Statusrapport")}</button><button className="btn pri" onClick={() => lagRapport(p.id, 'fase')}>{tt("+ Beslutningsnotat")}</button></>}</div>
    {!R.length ? <div className="card"><Empty t="Ingen rapporter ennå">{tt("Lag et beslutningsnotat når en fase er ferdig, så eier kan godkjenne før neste fase. Statusrapporter med fremdrift og økonomi kan sendes underveis.")}</Empty></div> :
      <div className="tbl-wrap"><table><thead><tr><th>{tt("Rapport")}</th><th>{tt("Laget")}</th><th>{tt("Sendt til")}</th><th>{tt("Status")}</th><th>{tt("Svar")}</th></tr></thead><tbody>
        {R.map(r => <tr key={r.id} className="click" onClick={() => visRapport(p.id, r.id)}>
          <td><b style={{ fontWeight: 600 }}>{r.tittel}</b></td><td className="small">{fd(String(r.opprettet).slice(0, 10))}<div className="muted">{r.av}</div></td>
          <td className="small">{r.sendtTil ? <>{r.sendtTil.navn || r.sendtTil.epost}<div className="muted">{fd(String(r.sendt).slice(0, 10))}{r.lest ? tt(" · lest") : ''}</div></> : <span className="muted">–</span>}</td>
          <td><StatusChip s={r.status} /></td><td className="small">{r.svar ? <>{r.svar.navn} {fd(String(r.svar.t).slice(0, 10))}{r.svar.komm && <div className="muted">«{String(r.svar.komm).slice(0, 80)}»</div>}</> : (r.kommentarer || []).length ? tt("{0} kommentar(er)", r.kommentarer.length) : ''}</td></tr>)}
      </tbody></table></div>}
    <p className="small muted">{tt("Faser som krever eiers godkjenning velges på hver fase under «Faser og oppgaver». Svar fra eier registreres automatisk når de svarer via lenken, eller kan føres inn manuelt (f.eks. vedtak i styremøte).")}</p>
  </>;
}
export const StatusChip = ({ s }: { s?: string }) => <Chip c={GODKJENT.includes(s || '') ? 'green' : s === 'Avvist' ? 'red' : s === 'Sendt' ? 'blue' : s === 'Til orientering' ? 'blue' : ''}>{s || tt("Utkast")}</Chip>;

export function visRapport(pid: string, rid: string) { openModal({ wide: true, render: close => <RapportVis pid={pid} rid={rid} close={close} /> }); }
function RapportVis({ pid, rid, close }: { pid: string; rid: string; close: () => void }) {
  useStore(); const p = byId('prosjekter', pid); const r = (p?.rapporter || []).find((x: Rec) => x.id === rid); const ref = useRef<HTMLDivElement>(null);
  const [man, setMan] = useState<Rec | null>(null);
  if (!p || !r) return <ModalFrame title={tt("Rapport")} close={close}><p>{tt("Fant ikke rapporten.")}</p></ModalFrame>;
  const besvart = GODKJENT.includes(r.status) || r.status === 'Avvist';
  const settRapport = async (patch: Rec, logg: string, extra: Rec = {}) => { const P = byId('prosjekter', pid)!; await oppdaterP(pid, { ...extra, rapporter: (P.rapporter || []).map((x: Rec) => x.id === rid ? { ...x, ...patch } : x) }, logg); };
  const registrer = async () => {
    if (!man?.navn?.trim()) return toast(tt("Skriv hvem som fattet beslutningen"));
    const svar = { navn: man.navn.trim(), komm: man.komm || '', t: (man.dato || today()) + 'T12:00:00.000Z', via: 'manuelt', beslutning: man.beslutning, regAv: state.me?.navn };
    const P = byId('prosjekter', pid)!; const i = FASER.findIndex(f => f[0] === r.fase); let extra: Rec = {};
    if (GODKJENT.includes(man.beslutning) && P.fase === r.fase && i < FASER.length - 1) extra = { fase: FASER[i + 1][0], status: P.status === 'Idé' || (P.status === 'Planlagt' && i + 1 >= 3) ? (i + 1 >= 3 ? 'Pågår' : 'Planlagt') : P.status };
    await settRapport({ status: man.beslutning, svar }, `Beslutningsnotat «${FASER[i]?.[1]}»: ${man.beslutning.toLowerCase()} av ${svar.navn} (registrert manuelt)${extra.fase ? ` – fase: ${FASER[i + 1][1]}` : ''}`, extra);
    setMan(null); toast(tt("Beslutning registrert"));
  };
  return <ModalFrame title={<span>{r.tittel} <StatusChip s={r.status} /></span>} close={close}
    foot={man ? <><button className="btn" onClick={() => setMan(null)}>{tt("Avbryt")}</button><button className="btn pri" onClick={registrer}>{tt("Registrer beslutning")}</button></> : <>
      {kanSlette(r) && <button className="btn danger" onClick={async () => { if (!(await confirmBox(tt("Slette rapporten? En sendt lenke slutter å virke.")))) return; await settRapport({}, `Rapport slettet: ${r.tittel}`, { rapporter: (byId('prosjekter', pid)!.rapporter || []).filter((x: Rec) => x.id !== rid) }); close(); }}>{tt("Slett")}</button>}
      <span style={{ flex: 1 }} /><button className="btn" onClick={() => skrivUt(ref.current, r.tittel + ' – ' + p.navn)}>{tt("Skriv ut / PDF")}</button>
      {r.type === 'fase' && !besvart && <button className="btn" onClick={() => setMan({ beslutning: 'Godkjent', navn: r.sendtTil?.navn || '', dato: today(), komm: '' })}>{tt("Registrer beslutning manuelt")}</button>}
      {!besvart && <button className="btn pri" onClick={() => sendPaNytt(pid, rid)}>{r.sendt ? tt("Send på nytt") : tt("Send til eier")}</button>}</>}>
    {man && <div className="card" style={{ marginBottom: 12 }}><div className="pa-grid">
      <label className="pa-felt half"><span>{tt("Beslutning")}</span><select value={man.beslutning} onChange={e => setMan({ ...man, beslutning: e.target.value })}>{['Godkjent', 'Godkjent med merknader', 'Avvist'].map(x => <option key={x}>{x}</option>)}</select></label>
      <label className="pa-felt half"><span>{tt("Dato")}</span><input type="date" value={man.dato} onChange={e => setMan({ ...man, dato: e.target.value })} /></label>
      <label className="pa-felt"><span>{tt("Besluttet av")}</span><input value={man.navn} onChange={e => setMan({ ...man, navn: e.target.value })} placeholder={tt("F.eks. styret v/styreleder")} /></label>
      <label className="pa-felt"><span>{tt("Merknad / referanse")}</span><textarea rows={2} value={man.komm} onChange={e => setMan({ ...man, komm: e.target.value })} placeholder={tt("F.eks. styremøte 12.11, sak 14/26")} /></label></div></div>}
    {r.sendtTil && <p className="small muted">{tt("Sendt til")} {r.sendtTil.navn ? tt("{0} ({1})", r.sendtTil.navn, r.sendtTil.epost) : r.sendtTil.epost} {fd(String(r.sendt).slice(0, 10))} {tt("av")} {r.sendtAv}{r.lest ? tt(" · åpnet {0}", fd(String(r.lest).slice(0, 10))) : tt(" · ikke åpnet ennå")}</p>}
    <div ref={ref}><RapportVisning s={r.snap} svar={r.svar} kommentarer={r.kommentarer} /></div>
  </ModalFrame>;
}
const kanSlette = (r: Rec) => !GODKJENT.includes(r.status) && r.status !== 'Avvist';
function sendPaNytt(pid: string, rid: string) {
  const p = byId('prosjekter', pid)!; const r = (p.rapporter || []).find((x: Rec) => x.id === rid)!; const ek = r.sendtTil || p.eierKontakt || {};
  openModal({ render: close => <SendSkjema close={close} start={{ navn: ek.navn || '', epost: ek.epost || '', melding: '' }} onSend={async x => {
    const res = await aoApi({ action: 'pr_send', prosjekt_id: pid, rapport_id: rid, ...x, lenkeBase: location.origin }); await refetch('prosjekter', pid); return res; }} /> });
}
function SendSkjema({ close, start, onSend }: { close: () => void; start: Rec; onSend: (x: Rec) => Promise<Rec> }) {
  const [x, setX] = useState(start); const [busy, setBusy] = useState(false); const [res, setRes] = useState<Rec | null>(null);
  return <ModalFrame title={tt("Send rapport")} close={close} foot={res ? <button className="btn pri" onClick={close}>{tt("Ferdig")}</button> : <><button className="btn" onClick={close}>{tt("Avbryt")}</button><button className="btn pri" disabled={busy} onClick={async () => { setBusy(true); try { const r = await onSend(x); setRes(r); if (r.sendt) toast(tt("Sendt")); } catch (e: any) { toast(e.message); } finally { setBusy(false); } }}>{busy ? tt("Sender …") : tt("Send")}</button></>}>
    {res ? (res.sendt ? <p>{tt("✓ Sendt til")} {res.til}{tt(". En tidligere sendt lenke er erstattet av den nye.")}</p> : <><p>{tt("Kunne ikke sende e-post")}{res.grunn ? tt(": {0}", res.grunn) : ''}{tt(". Lenke:")}</p><p className="mono small" style={{ wordBreak: 'break-all' }}>{res.lenke}</p><button className="btn sm" onClick={() => copyText(res.lenke)}>{tt("Kopier lenke")}</button></>)
      : <div className="pa-grid"><label className="pa-felt half"><span>{tt("Navn")}</span><input value={x.navn} onChange={e => setX({ ...x, navn: e.target.value })} /></label><label className="pa-felt half"><span>{tt("E-post")}</span><input value={x.epost} onChange={e => setX({ ...x, epost: e.target.value })} /></label>
        <label className="pa-felt"><span>{tt("Melding")}</span><textarea rows={3} value={x.melding} onChange={e => setX({ ...x, melding: e.target.value })} /></label></div>}
  </ModalFrame>;
}

// ---------------- Eiers lenkeside (uten innlogging)
export function PrLenke({ token }: { token: string }) {
  const [info, setInfo] = useState<Rec | null>(null); const [err, setErr] = useState(''); const [f, setF] = useState<Rec>({ beslutning: '', navn: '', komm: '' }); const [busy, setBusy] = useState(false); const [ok, setOk] = useState<Rec | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const last = () => aoApi({ action: 'pr_info', token }, false).then(i => { setInfo(i); setF((x: Rec) => ({ ...x, navn: x.navn || i.sendtTil?.navn || '', beslutning: x.beslutning || (i.type === 'fase' ? '' : 'Kommentar') })); }).catch(e => setErr(e.message));
  useEffect(() => { last(); }, [token]);
  const svar = async () => {
    if (!f.beslutning) return setErr(tt("Velg et svar")); if (!f.navn.trim()) return setErr(tt("Skriv navnet ditt"));
    if (f.beslutning !== 'Godkjent' && !f.komm.trim()) return setErr(tt("Skriv en kommentar"));
    setBusy(true); setErr('');
    try { const r = await aoApi({ action: 'pr_svar', token, ...f }, false); setOk(r); await last(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  if (err && !info) return <div className="login"><div className="card" style={{ maxWidth: 560 }}><h2>{tt("Kan ikke åpne rapporten")}</h2><p>{err}</p></div></div>;
  if (!info) return <div className="login"><div className="card"><p>{tt("Laster …")}</p></div></div>;
  const besvart = GODKJENT.includes(info.status) || info.status === 'Avvist';
  return <div style={{ maxWidth: 860, margin: '20px auto', padding: '0 14px' }}>
    <div className="card" style={{ marginBottom: 12 }}><div ref={ref}><RapportVisning s={info.snap} svar={info.svar} kommentarer={info.kommentarer} /></div>
      <p style={{ marginBottom: 0 }}><button className="btn sm" onClick={() => skrivUt(ref.current, info.snap?.tittel || 'Rapport')}>{tt("Skriv ut / lagre som PDF")}</button></p></div>
    {info.type === 'fase' && !besvart && <div className="card">
      <h2 style={{ marginTop: 0 }}>{tt("Ditt svar")}</h2>
      <div className="pa-svarvalg">{[['Godkjent', 'Godkjenn', 'green'], ['Godkjent med merknader', 'Godkjenn med merknader', 'amber'], ['Avvist', 'Avvis', 'red']].map(([v, l, c]) => <label key={v} className={'pa-svar ' + c + (f.beslutning === v ? ' on' : '')}><input type="radio" name="b" checked={f.beslutning === v} onChange={() => setF({ ...f, beslutning: v })} />{l}</label>)}</div>
      <label className="pa-felt"><span>{tt("Navn")}</span><input value={f.navn} onChange={e => setF({ ...f, navn: e.target.value })} /></label>
      <label className="pa-felt"><span>{tt("Kommentar")}{f.beslutning && f.beslutning !== 'Godkjent' ? '' : tt(" (valgfritt)")}</span><textarea rows={3} value={f.komm} onChange={e => setF({ ...f, komm: e.target.value })} placeholder={f.beslutning === 'Avvist' ? tt("Hva må endres eller avklares?") : ''} /></label>
      {err && <p style={{ color: 'var(--red)' }}>{err}</p>}
      <button className="btn pri" disabled={busy} onClick={svar}>{busy ? tt("Sender …") : tt("Send svar")}</button>
      <p className="small muted">{tt("Svaret, navnet ditt og tidspunktet registreres i prosjektets logg")}{info.gjeldende ? tt(". Ved godkjenning går prosjektet videre til neste fase") : ''}.</p></div>}
    {(info.type !== 'fase' || besvart) && !ok && <div className="card"><h3 style={{ marginTop: 0 }}>{tt("Kommentar til prosjektlederen")}</h3>
      <label className="pa-felt"><span>{tt("Navn")}</span><input value={f.navn} onChange={e => setF({ ...f, navn: e.target.value })} /></label>
      <label className="pa-felt"><span>{tt("Kommentar")}</span><textarea rows={3} value={f.komm} onChange={e => setF({ ...f, komm: e.target.value })} /></label>
      {err && <p style={{ color: 'var(--red)' }}>{err}</p>}
      <button className="btn" disabled={busy || !f.komm.trim()} onClick={() => { f.beslutning = 'Kommentar'; void svar(); }}>{tt("Send kommentar")}</button></div>}
    {ok && <div className="card"><p style={{ margin: 0 }}>{tt("✓ Takk – svaret er registrert")}{ok.nyFase ? tt(", og prosjektet er flyttet til fasen «{0}»", ok.nyFase) : ''}.</p></div>}
  </div>;
}
export { krevGodkjenning };
