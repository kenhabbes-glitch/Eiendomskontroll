// Beredskapsplan og risikovurdering per eiendom (kun for eier og drift – leietakere er ikke involvert).
//
// Hjemmel / grunnlag:
//  Internkontrollforskriften § 5 andre ledd nr. 6: kartlegge farer og problemer, vurdere risiko og lage planer og tiltak
//    (skriftlig dokumentasjon, jf. § 5). Gjelder virksomheter med arbeidstakere; for en ren eiendomsbesitter er den en anbefalt standard.
//  Forskrift om brannforebygging §§ 4, 9 og 10: kjenne kravene, systematisk sikkerhetsarbeid og dokumentasjon (se Brannvern-fanen).
//  Beredskapsplanens innhold, øvelsesintervall og risikoskala (5 × 5) er anbefalt praksis og må tilpasses egne rutiner og forsikringsvilkår.
//
// Data: eiendom.beredskap = { plan, planSist, ovelseSist, risikoSist, risikoer[], logg[] }
import React, { useState } from 'react';
import { S, canEdit, kanRedigereE, loggHendelse, save, state, toast } from './store';
import { addDays, byId, fd, today, uid, type Rec } from './utils';
import { Chip, Empty, confirmBox, formModal } from '../components/ui';
import { esc, skrivDok, tabell } from './dokument';
import { editOppgave } from './actions';
import { tt } from './i18n';

export const HJEMMEL = 'Internkontrollforskriften § 5 andre ledd nr. 6 (kartlegging, risikovurdering, planer og tiltak)';
export const INTERVALL_DAGER = 365;
export const KATEGORIER: [string, string][] = [['brann', 'Brann'], ['vann', 'Vann, strøm og tekniske feil'], ['sikring', 'Innbrudd, hærverk og sikring'], ['vaer', 'Ekstremvær, flom og klima'], ['person', 'Personsikkerhet og helse']];
const SKALA_S: [string, string][] = [['1', '1 – Svært lite sannsynlig'], ['2', '2 – Lite sannsynlig'], ['3', '3 – Mulig'], ['4', '4 – Sannsynlig'], ['5', '5 – Svært sannsynlig']];
const SKALA_K: [string, string][] = [['1', '1 – Ubetydelig'], ['2', '2 – Liten'], ['3', '3 – Moderat'], ['4', '4 – Alvorlig'], ['5', '5 – Kritisk']];

const STANDARD: [string, string, string][] = [
  ['brann', 'Brann i bygget', 'Brann med fare for liv og store materielle skader'],
  ['brann', 'Brann hos leietaker sprer seg til andre brannceller', 'Brann sprer seg mellom leieareal'],
  ['vann', 'Vannlekkasje', 'Rørbrudd, lekkasje fra tak eller teknisk rom med følgeskader'],
  ['vann', 'Strømbrudd over tid', 'Langvarig strømbrudd som rammer heis, ventilasjon, brannalarm og nødlys'],
  ['vann', 'Svikt i varme, ventilasjon eller kjøling', 'Driftsstans i tekniske anlegg som påvirker bruken av bygget'],
  ['sikring', 'Innbrudd og tyveri', 'Uvedkommende kommer seg inn i bygget eller leieareal'],
  ['sikring', 'Hærverk og brannstiftelse', 'Tilsiktet skade på bygg, uteområde eller tekniske anlegg'],
  ['vaer', 'Flom, overvann og stormflo', 'Vann trenger inn i kjeller, tekniske rom eller første etasje'],
  ['vaer', 'Storm, snølast og isdannelse', 'Skade på tak, fasade eller skilt, og fare fra fallende snø og is'],
  ['person', 'Personskade og akutt sykdom', 'Alvorlig skade eller sykdom i bygget som krever førstehjelp og varsling'],
  ['person', 'Evakuering med personer som trenger hjelp', 'Rømning når personer med nedsatt funksjonsevne er i bygget'],
  ['person', 'Trusler og vold', 'Trusler eller voldshendelser mot personer i bygget'],
];

export const bd = (e?: Rec): Rec => e?.beredskap || {};
export const risikoer = (e?: Rec): Rec[] => bd(e).risikoer || [];
export const nivaaRisiko = (r: any, ss = 's', kk = 'k') => {
  const s = +(r as any)[ss], k = +(r as any)[kk]; if (!s || !k) return { p: 0, t: 'Ikke vurdert', c: 'blue' as const };
  const p = s * k; return p >= 15 ? { p, t: 'Høy', c: 'red' as const } : p >= 8 ? { p, t: 'Middels', c: 'amber' as const } : { p, t: 'Lav', c: 'green' as const };
};

type Frist = { c: 'green' | 'amber' | 'red'; t: string; o: number };
/** o: 0 i orden, 1 snart, 2 forfalt/mangler */
export function fristStatus(sist?: string, manglerTekst = 'Ikke registrert'): Frist {
  if (!sist) return { c: 'red', t: manglerTekst, o: 2 };
  const neste = addDays(sist, INTERVALL_DAGER); const d = Math.round((new Date(neste).getTime() - new Date(today()).getTime()) / 86400000);
  return d < 0 ? { c: 'red', t: 'Forfalt ' + fd(neste), o: 2 } : d <= 30 ? { c: 'amber', t: 'Frist ' + fd(neste), o: 1 } : { c: 'green', t: 'Neste ' + fd(neste), o: 0 };
}
export function beredskapStatus(e?: Rec) {
  const b = bd(e); const R = risikoer(e); const vurdert = R.filter(r => nivaaRisiko(r).p > 0);
  return {
    plan: b.plan && Object.keys(b.plan).length ? fristStatus(b.planSist, 'Ikke revidert') : { c: 'red' as const, t: 'Mangler', o: 2 },
    ovelse: fristStatus(b.ovelseSist, 'Ingen øvelse'),
    risiko: R.length ? fristStatus(b.risikoSist, 'Ikke gjennomgått') : { c: 'red' as const, t: 'Mangler', o: 2 },
    hoye: vurdert.filter(r => nivaaRisiko(r).c === 'red' && !r.tiltakFerdig).length, uvurdert: R.length - vurdert.length, antall: R.length,
  };
}
/** Antall punkter som krever oppfølging (for fanemerket). */
export const beredskapOppfolging = (e?: Rec) => { const s = beredskapStatus(e); return [s.plan, s.ovelse, s.risiko].filter(x => x.o >= 1).length + s.hoye; };

const PLAN_FELT: { k: string; label: string; ph?: string; hint?: string }[] = [
  { k: 'kontakter', label: 'Nøkkelpersoner og kontakter (én per linje: rolle – navn – telefon)', ph: 'Eier – Ola Nordmann – 900 00 000\nDriftsleder – …\nVaktselskap – …\nForsikringsselskap (skademelding) – …' },
  { k: 'varsling', label: 'Varsling: hvem varsles, i hvilken rekkefølge og hvordan', ph: 'Først 110/112/113 ved fare for liv. Deretter driftsleder, eier og berørte leietakere.' },
  { k: 'kriseledelse', label: 'Hvem leder og tar beslutninger ved en hendelse (og stedfortreder)' },
  { k: 'evakuering', label: 'Evakuering og samlingssted', ph: 'Samlingssted, rømningsveier, hvem hjelper personer som trenger bistand. Se Brannvern-fanen for brannkortet.' },
  { k: 'forstehjelp', label: 'Førstehjelp og livreddende utstyr', ph: 'Plassering av førstehjelpsskap, hjertestarter og slokkeutstyr. Hvem har førstehjelpskurs.' },
  { k: 'tekniskStopp', label: 'Stenging av vann, strøm, gass og ventilasjon', ph: 'Plassering av hovedstoppekran, hovedsikring og nødstopp, og hvem som har nøkkel.' },
  { k: 'scenarier', label: 'Tiltak per hendelsestype', ph: 'Brann:\nVannlekkasje:\nStrømbrudd:\nInnbrudd/hærverk:\nEkstremvær/flom:\nPersonskade/trusler:' },
  { k: 'kommunikasjon', label: 'Kommunikasjon (leietakere, media, pårørende, forsikring)' },
  { k: 'etterHendelse', label: 'Etter hendelsen: sikring av bevis, skademelding, avviksregistrering og læring', hint: 'Registrer hendelsen som avvik i appen, og oppdater planen og risikovurderingen.' },
];

function registrer(eid: string, type: 'plan' | 'ovelse' | 'risiko') {
  const e = byId('eiendommer', eid)!; const b = bd(e);
  const T = { plan: ['Registrer revisjon av beredskapsplanen', 'planSist', 'Beredskapsplanen er gjennomgått og oppdatert'], ovelse: ['Registrer beredskapsøvelse', 'ovelseSist', 'Beredskapsøvelse gjennomført'], risiko: ['Registrer gjennomgang av risikovurderingen', 'risikoSist', 'Risikovurderingen er gjennomgått'] }[type];
  formModal({
    title: tt(T[0]), saveTxt: tt("Registrer"),
    fields: [{ k: 'dato', label: tt("Dato"), type: 'date', def: today(), req: true, half: true }, { k: 'av', label: tt("Utført av"), def: state.me?.navn || '', half: true },
      { k: 'tekst', label: tt("Hva ble gjort / funn"), type: 'textarea', dikter: true, ph: type === 'ovelse' ? tt("Type øvelse (tabletop, evakuering, varsling), deltakere og læringspunkter") : tt("Hva er endret, og hva er lært") }],
    onSave: async v => {
      const logg = [...(b.logg || []), { id: uid(), type, dato: v.dato, av: v.av, tekst: v.tekst || '' }];
      const sist = !b[T[1]] || v.dato > b[T[1]] ? v.dato : b[T[1]];
      await save('eiendommer', { ...e, beredskap: { ...b, [T[1]]: sist, logg } });
      loggHendelse(`${T[2]} ${fd(v.dato)}`, eid, eid); toast(tt("Registrert"));
    },
  });
}

export function editPlan(eid: string) {
  const e = byId('eiendommer', eid)!; const b = bd(e);
  formModal({
    title: tt("Beredskapsplan – ") + e.navn, wide: true, saveTxt: tt("Lagre planen"), values: b.plan || {},
    top: <p className="small muted" style={{ marginTop: 0 }}>{tt("Planen skal være kort og brukbar i en krisesituasjon. Fyll ut det som gjelder, og registrer revisjon etter at du har gått gjennom den.")}</p>,
    fields: PLAN_FELT.map(f => ({ k: f.k, label: tt(f.label), type: 'textarea' as const, ph: f.ph ? tt(f.ph) : undefined, hint: f.hint ? tt(f.hint) : undefined, dikter: true })),
    onSave: async v => { const plan: any = {}; for (const f of PLAN_FELT) plan[f.k] = v[f.k] ?? ''; await save('eiendommer', { ...e, beredskap: { ...b, plan } }); toast(tt("Planen er lagret – husk å registrere revisjon")); },
  });
}

export function editRisiko(eid: string, rid?: string, preset: any = {}) {
  const e = byId('eiendommer', eid)!; const b = bd(e); const R = risikoer(e); const r: Rec = rid ? R.find(x => x.id === rid)! : { kat: 'brann', ...preset };
  formModal({
    title: rid ? tt("Rediger risiko") : tt("Ny risiko"), wide: true, values: r,
    fields: [
      { k: 'kat', label: tt("Kategori"), type: 'select', options: KATEGORIER.map(([k, l]) => [k, tt(l)] as [string, string]), half: true },
      { k: 'tittel', label: tt("Uønsket hendelse"), req: true, half: true, dikter: true },
      { k: 'hendelse', label: tt("Beskrivelse og årsaker"), type: 'textarea', dikter: true },
      { k: 's', label: tt("Sannsynlighet"), type: 'select', options: SKALA_S.map(([k, l]) => [k, tt(l)] as [string, string]), empty: tt("Ikke vurdert"), half: true },
      { k: 'k', label: tt("Konsekvens"), type: 'select', options: SKALA_K.map(([k, l]) => [k, tt(l)] as [string, string]), empty: tt("Ikke vurdert"), half: true, hint: tt("Vurder mennesker først, deretter bygg, drift og økonomi.") },
      { k: 'tiltak', label: tt("Eksisterende og planlagte tiltak"), type: 'textarea', dikter: true },
      { k: 'ansvarlig', label: tt("Ansvarlig"), half: true }, { k: 'frist', label: tt("Frist for tiltak"), type: 'date', half: true },
      { k: 'rs', label: tt("Sannsynlighet etter tiltak"), type: 'select', options: SKALA_S.map(([k, l]) => [k, tt(l)] as [string, string]), empty: '–', half: true },
      { k: 'rk', label: tt("Konsekvens etter tiltak"), type: 'select', options: SKALA_K.map(([k, l]) => [k, tt(l)] as [string, string]), empty: '–', half: true },
      { k: 'tiltakFerdig', label: tt("Tiltakene er gjennomført"), type: 'checkbox' },
    ],
    onSave: async v => {
      const ny = { ...r, ...v, id: r.id || uid(), vurdert: today() };
      const liste = rid ? R.map(x => (x.id === rid ? ny : x)) : [...R, ny];
      await save('eiendommer', { ...e, beredskap: { ...b, risikoer: liste } });
    },
  });
}

async function leggTilStandard(eid: string) {
  const e = byId('eiendommer', eid)!; const b = bd(e); const R = risikoer(e);
  const nye = STANDARD.filter(([, t]) => !R.some(r => r.tittel === t)).map(([kat, tittel, hendelse]) => ({ id: uid(), kat, tittel, hendelse, s: '', k: '', tiltak: '' }));
  if (!nye.length) return toast(tt("Alle standardrisikoene er allerede lagt til"));
  await save('eiendommer', { ...e, beredskap: { ...b, risikoer: [...R, ...nye] } }); toast(tt("{0} risikoer lagt til – vurder sannsynlighet og konsekvens for hver", nye.length));
}

function skrivUt(eid: string) {
  const e = byId('eiendommer', eid)!; const b = bd(e); const p = b.plan || {}; const R = [...risikoer(e)].sort((a, c) => nivaaRisiko(c).p - nivaaRisiko(a).p);
  const sek = PLAN_FELT.filter(f => String(p[f.k] || '').trim()).map(f => `<section class="sek"><h2>${esc(tt(f.label.replace(/ \(.*\)$/, '')))}</h2><p style="white-space:pre-wrap">${esc(p[f.k])}</p></section>`);
  const rader = R.map(r => { const n = nivaaRisiko(r); const re = nivaaRisiko(r, 'rs', 'rk'); return [esc(tt(KATEGORIER.find(k => k[0] === r.kat)?.[1] || '')), esc(r.tittel), esc(n.p ? `${r.s}×${r.k}=${n.p} (${tt(n.t)})` : tt(n.t)), esc(r.tiltak || ''), esc(re.p ? `${re.p} (${tt(re.t)})` : '–'), esc(r.ansvarlig || '')]; });
  skrivDok({
    type: tt("Beredskap"), tittel: tt("Beredskapsplan og risikovurdering"), undertittel: `${e.navn}${b.planSist ? ' · ' + tt("Revidert") + ' ' + fd(b.planSist) : ''}`, filnavn: `${tt("Beredskap")} – ${e.navn}`,
    innhold: [
      ...(sek.length ? sek : [`<p>${esc(tt("Beredskapsplanen er ikke fylt ut."))}</p>`]),
      `<section class="sek"><h2>${esc(tt("Risikovurdering"))}</h2>${R.length ? tabell([tt("Kategori"), tt("Hendelse"), tt("Risiko"), tt("Tiltak"), tt("Etter tiltak"), tt("Ansvarlig")], rader) : `<p>${esc(tt("Ingen risikoer registrert."))}</p>`}<p class="small" style="margin-top:8px">${esc(tt("Risiko = sannsynlighet × konsekvens (1–5). 15 eller mer er høy, 8–14 middels, under 8 lav."))}</p></section>`,
      `<section class="sek"><h2>${esc(tt("Grunnlag"))}</h2><p>${esc(tt(HJEMMEL))}. ${esc(tt("Revisjon og øvelse minst hver 12. måned er anbefalt praksis."))}</p></section>`,
    ],
  });
}

function Matrise({ R }: { R: Rec[] }) {
  const V = R.filter(r => nivaaRisiko(r).p > 0); const farge = (s: number, k: number) => (s * k >= 15 ? '#f8d4cf' : s * k >= 8 ? '#fdeccb' : '#d8f0dd');
  return <table className="small" style={{ borderCollapse: 'collapse', textAlign: 'center' }} aria-label={tt("Risikomatrise")}>
    <tbody>{[5, 4, 3, 2, 1].map(s => <tr key={s}><th style={{ padding: '2px 8px', fontWeight: 500 }}>{s}</th>{[1, 2, 3, 4, 5].map(k => { const n = V.filter(r => +r.s === s && +r.k === k).length; return <td key={k} style={{ width: 38, height: 30, background: farge(s, k), border: '2px solid #fff', fontWeight: 600 }}>{n || ''}</td>; })}</tr>)}
      <tr><td /><td colSpan={5} className="muted" style={{ paddingTop: 4 }}>{tt("Konsekvens →  (sannsynlighet ↑)")}</td></tr></tbody></table>;
}

export function BeredskapSection({ eid }: { eid: string }) {
  const e = byId('eiendommer', eid)!; const b = bd(e); const ed = canEdit() && kanRedigereE(eid); const st = beredskapStatus(e);
  const [kat, setKat] = useState(''); const R = risikoer(e); const vis = (kat ? R.filter(r => r.kat === kat) : R).slice().sort((a, c) => nivaaRisiko(c).p - nivaaRisiko(a).p);
  const plan = b.plan || {}; const harPlan = PLAN_FELT.some(f => String(plan[f.k] || '').trim());
  const logg = [...(b.logg || [])].reverse();
  return <>
    <div className="note small" style={{ color: 'var(--ink)', marginBottom: 12 }}>{tt("Kartlegg farer, vurder risiko og ha en plan for hva som skjer når noe går galt (")}<b>{tt("internkontrollforskriften § 5 andre ledd nr. 6")}</b>{tt("). Dette er bare for eier og drift. Plan, øvelse og risikovurdering bør gjennomgås minst hvert år.")}</div>
    <div className="grid g3" style={{ marginBottom: 12 }}>
      {([['Beredskapsplan', st.plan, 'plan'], ['Beredskapsøvelse', st.ovelse, 'ovelse'], ['Risikovurdering', st.risiko, 'risiko']] as const).map(([n, s, t]) => <div key={t} className="card">
        <div className="small muted">{tt(n)}</div><div style={{ margin: '6px 0' }}><Chip c={s.c}>{tt(s.t.split(' ')[0])}{s.t.includes(' ') ? ' ' + s.t.split(' ').slice(1).join(' ') : ''}</Chip></div>
        {ed && <button className="btn sm" onClick={() => registrer(eid, t)}>{tt(t === 'ovelse' ? 'Registrer øvelse' : 'Registrer gjennomgang')}</button>}</div>)}
    </div>
    <div className="grid g2">
      <div className="card"><div className="toolbar" style={{ marginBottom: 6 }}><h2 style={{ margin: 0, flex: 1 }}>{tt("Beredskapsplan")} {b.planSist && <Chip c="green">{tt("revidert")} {fd(b.planSist)}</Chip>}</h2>
        {ed && <button className="btn sm pri" onClick={() => editPlan(eid)}>{harPlan ? tt("Rediger") : tt("Fyll ut planen")}</button>}<button className="btn sm" onClick={() => skrivUt(eid)}>{tt("Skriv ut / PDF")}</button></div>
        {harPlan ? <dl className="dl">{PLAN_FELT.filter(f => String(plan[f.k] || '').trim()).map(f => <React.Fragment key={f.k}><dt>{tt(f.label.replace(/ \(.*\)$/, ''))}</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{plan[f.k]}</dd></React.Fragment>)}</dl>
          : <p className="small muted">{tt("Beredskapsplanen er ikke fylt ut. Start med kontaktliste, varsling, evakuering og stenging av vann og strøm.")}</p>}
      </div>
      <div className="card"><h2>{tt("Risikobilde")}</h2>
        {R.length ? <><Matrise R={R} /><p className="small" style={{ marginBottom: 0 }}>{st.hoye > 0 && <Chip c="red">{st.hoye} {tt("høy risiko uten gjennomførte tiltak")}</Chip>} {st.uvurdert > 0 && <Chip c="blue">{st.uvurdert} {tt("ikke vurdert")}</Chip>}</p></>
          : <p className="small muted">{tt("Ingen risikoer registrert. Legg til standardrisikoene og vurder hver av dem.")}</p>}
      </div>
    </div>
    <div className="sec"><div className="toolbar"><h2 style={{ margin: 0, flex: 1 }}>{tt("Risikoregister")}</h2>
      <select value={kat} onChange={ev => setKat(ev.target.value)} aria-label={tt("Kategori")}><option value="">{tt("Alle kategorier")}</option>{KATEGORIER.map(([k, l]) => <option key={k} value={k}>{tt(l)}</option>)}</select>
      {ed && <><button className="btn sm" onClick={() => leggTilStandard(eid)}>{tt("Legg til standardrisikoer")}</button><button className="btn sm pri" onClick={() => editRisiko(eid)}>{tt("+ Risiko")}</button></>}</div>
      {vis.length ? <div className="tbl-wrap"><table><thead><tr><th>{tt("Hendelse")}</th><th>{tt("Kategori")}</th><th>{tt("Risiko")}</th><th>{tt("Tiltak")}</th><th>{tt("Frist")}</th><th /></tr></thead><tbody>
        {vis.map(r => { const n = nivaaRisiko(r); return <tr key={r.id}>
          <td><b>{r.tittel}</b>{r.hendelse && <div className="small muted">{r.hendelse}</div>}</td>
          <td className="small">{tt(KATEGORIER.find(k => k[0] === r.kat)?.[1] || '')}</td>
          <td><Chip c={n.c}>{tt(n.t)}{n.p ? ` ${n.p}` : ''}</Chip>{r.tiltakFerdig && <div className="small muted">{tt("tiltak gjennomført")}</div>}</td>
          <td className="small" style={{ whiteSpace: 'pre-wrap' }}>{r.tiltak || '–'}{r.ansvarlig && <div className="muted">{tt("Ansvar:")} {r.ansvarlig}</div>}</td>
          <td className="small">{r.frist ? fd(r.frist) : '–'}</td>
          <td style={{ whiteSpace: 'nowrap' }}>{ed && <><button className="btn sm" onClick={() => editRisiko(eid, r.id)}>{tt("Rediger")}</button> <button className="btn sm" onClick={() => editOppgave(undefined, { eiendomId: eid, navn: tt("Risikotiltak: ") + r.tittel, type: 'Egenkontroll', kategori: 'Bygg', hjemmel: HJEMMEL, nesteFrist: r.frist || addDays(today(), 30), notat: r.tiltak || '' })} title={tt("Legg tiltaket i kontrollplanen med frist")}>{tt("Lag kontroll")}</button> <button className="btn sm ghost" aria-label={tt("Slett")} onClick={async () => { if (await confirmBox(tt("Slette risikoen «{0}»?", r.tittel), tt("Slett"))) await save('eiendommer', { ...e, beredskap: { ...b, risikoer: R.filter(x => x.id !== r.id) } }); }}>✕</button></>}</td>
        </tr>; })}</tbody></table></div>
        : <div className="tbl-wrap"><Empty t="Ingen risikoer">{tt("Bruk «Legg til standardrisikoer» for å komme i gang.")}</Empty></div>}
    </div>
    {logg.length > 0 && <div className="sec"><h2>{tt("Historikk")}</h2><ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{logg.slice(0, 12).map((x: Rec) => <li key={x.id}><b>{fd(x.dato)}</b> · {tt(x.type === 'plan' ? 'Revisjon av beredskapsplan' : x.type === 'ovelse' ? 'Beredskapsøvelse' : 'Gjennomgang av risikovurdering')}{x.av ? ' · ' + x.av : ''}{x.tekst ? ' – ' + x.tekst : ''}</li>)}</ul></div>}
  </>;
}
