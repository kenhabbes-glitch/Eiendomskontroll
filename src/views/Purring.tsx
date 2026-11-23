// Purring på avvik: innstillinger (alt av som standard), oversikt ved pålogging og manuell purring.
import React, { useEffect, useState } from 'react';
import { S, aoApi, canEdit, isAdmin, saveInnst, state, toast, useStore } from '../lib/store';
import { dUntil, eNavn, fd, today, type Rec } from '../lib/utils';
import { AV_LUKKET } from '../lib/catalog';
import { openModal, ModalFrame } from '../components/ui';
import { Hjelp } from '../components/Hjelp';
import { editAvvik } from '../lib/actions';
import { mineAo } from './Arbeidsordre';
import { settFilter } from './common';
import { svarfristSnart } from './Tilsyn';
import { tt } from '../lib/i18n';
import { RUNDE_STD, renRundeInnst } from '../lib/rundeServer';
import { renFornyInnst } from '../lib/fornyelseServer';
import { renVaktInnst } from '../lib/leieServer';
import { renOplAuto } from '../lib/opplaeringAuto';
import { renChatInnst } from '../lib/chatVarselServer';
import { renInvest } from '../lib/investVarselServer';
import { AUTOMATIKK, erPa, slaPa } from '../lib/anbefalt';
import { PUSH_TYPER, pushStotte, erIos, erInstallert, pushStatus, slaPaPush, slaAvPush, endreTyper, testPush } from '../lib/push';

export const PURR_STD = { paLogging: true, paLoggingDager: 7, ansvarlig: false, ansvarligFor: 3, ansvarligGjenta: 7, ansvarligMaks: 3, eier: false, eierEtter: 14, eierEpost: '', ukentlig: false, ukentligEpost: '' };
export const UKE_STD = { pa: false, epost: '', dager: 30, ukedag: 1 };
export const purrInnst = () => ({ ...PURR_STD, ...(S.innst.avvikPurring || {}) });

// ---------------- Innstillinger
const Bryter = ({ on, set, ro, children }: { on: boolean; set: (b: boolean) => void; ro: boolean; children: React.ReactNode }) =>
  <label className="pu-bryter"><input type="checkbox" checked={on} disabled={ro} onChange={e => set(e.target.checked)} /><span className="pu-sw" aria-hidden /><span>{children}</span></label>;
const Tall = ({ v, set, ro, w = 56 }: { v: any; set: (n: number) => void; ro: boolean; w?: number }) => <input className="num" style={{ width: w, display: 'inline-block', padding: '3px 6px' }} disabled={ro} value={v} inputMode="numeric" onChange={e => set(Math.max(0, Math.min(365, parseInt(e.target.value || '0', 10) || 0)))} />;

export function PurringKort() {
  useStore(); const ro = !isAdmin() && state.me?.rolle !== 'forvalter';
  const [c, setC0] = useState(purrInnst()); const [busy, setBusy] = useState(false);
  useEffect(() => setC0(purrInnst()), [JSON.stringify(S.innst.avvikPurring)]);
  const setC = (x: Partial<typeof PURR_STD>) => setC0(v => ({ ...v, ...x }));
  const lagre = async () => { setBusy(true); try { await saveInnst('avvikPurring', c); toast(tt("Purreinnstillinger lagret")); } catch { } setBusy(false); };
  return <div className="card" style={{ maxWidth: 900, marginTop: 16 }}>
    <h2 style={{ marginTop: 0 }}>{tt("Purring på avvik")}</h2>
    <p className="small muted" style={{ marginTop: -4 }}>{tt("Ingen e-post sendes automatisk før du slår det på her. Purringer og eskaleringer føres i avvikets logg og i hendelsesloggen.")}</p>
    <div className="pu-rad"><Bryter on={c.paLogging} set={b => setC({ paLogging: b })} ro={ro}><b>{tt("Vis purreoversikt ved pålogging")}</b><br /><span className="small muted">{tt("Et skjermbilde med avvik over frist og med frist som nærmer seg, med snarvei til listen. Vises én gang per dag.")}</span></Bryter>
      {c.paLogging && <div className="pu-under small">{tt("Ta med avvik med frist innen")} <Tall v={c.paLoggingDager} set={n => setC({ paLoggingDager: n })} ro={ro} w={46} /> {tt("dager")}</div>}</div>
    <div className="pu-rad"><Bryter on={c.ansvarlig} set={b => setC({ ansvarlig: b })} ro={ro}><b>{tt("Automatisk påminnelse og purring til den som skal utbedre")}</b><br />
      <span className="small muted">{tt("Går til tildelt bruker, leverandør med arbeidsordre-lenke eller leietaker. Avvik som står som «Utført – til kontroll» eller «Utsatt», purres ikke.")}</span></Bryter>
      {c.ansvarlig && <div className="pu-under small">{tt("Påminnelse")} <Tall v={c.ansvarligFor} set={n => setC({ ansvarligFor: n })} ro={ro} w={46} /> {tt("dager før frist · etter frist: purring hver")} <Tall v={c.ansvarligGjenta} set={n => setC({ ansvarligGjenta: n })} ro={ro} w={46} />{tt(". dag, maks")} <Tall v={c.ansvarligMaks} set={n => setC({ ansvarligMaks: n })} ro={ro} w={46} /> {tt("purringer")}</div>}</div>
    <div className="pu-rad"><Bryter on={c.eier} set={b => setC({ eier: b })} ro={ro}><b>{tt("Eskalering til eier på e-post")}</b><br /><span className="small muted">{tt("Én samlet e-post når avvik har passert fristen med et antall dager. Av som standard.")}</span></Bryter>
      {c.eier && <div className="pu-under small">{tt("Når fristen er passert med")} <Tall v={c.eierEtter} set={n => setC({ eierEtter: n })} ro={ro} w={46} /> {tt("dager, til")} <input disabled={ro} value={c.eierEpost} placeholder={tt("e-post (tom = organisasjonens administratorer)")} style={{ width: 300, display: 'inline-block', padding: '3px 6px' }} onChange={e => setC({ eierEpost: e.target.value })} /></div>}</div>
    <div className="pu-rad"><Bryter on={c.ukentlig} set={b => setC({ ukentlig: b })} ro={ro}><b>{tt("Ukentlig oversikt på e-post (mandager)")}</b><br /><span className="small muted">{tt("Avvik over frist og med frist innen 14 dager.")}</span></Bryter>
      {c.ukentlig && <div className="pu-under small">{tt("Til")} <input disabled={ro} value={c.ukentligEpost} placeholder={tt("e-post (tom = organisasjonens administratorer)")} style={{ width: 300, display: 'inline-block', padding: '3px 6px' }} onChange={e => setC({ ukentligEpost: e.target.value })} /></div>}</div>
    {!ro ? <button className="btn pri" disabled={busy || S.innstMangler} onClick={lagre}>{busy ? tt("Lagrer …") : tt("Lagre purreinnstillinger")}</button> : <p className="small muted">{tt("Bare administrator eller forvalter kan endre dette.")}</p>}
  </div>;
}

// ---------------- Ukeoversikt til eier: kontroller, dokumenter og avvik i én e-post (av som standard)
export function UkeOversiktKort() {
  useStore(); const ro = !isAdmin() && state.me?.rolle !== 'forvalter';
  const [c, setC0] = useState({ ...UKE_STD, ...(S.innst.eierOversikt || {}) }); const [busy, setBusy] = useState(false);
  useEffect(() => setC0({ ...UKE_STD, ...(S.innst.eierOversikt || {}) }), [JSON.stringify(S.innst.eierOversikt)]);
  const setC = (x: Partial<typeof UKE_STD>) => setC0(v => ({ ...v, ...x }));
  const lagre = async () => { setBusy(true); try { await saveInnst('eierOversikt', c); toast(tt("Innstillingene er lagret")); } catch { } setBusy(false); };
  const sendNa = async () => { if (!S.primarOrg) return; setBusy(true); try { await saveInnst('eierOversikt', c); const r = await aoApi({ action: 'eier_uke_na', org: S.primarOrg }); const x = (r.rapport || [])[0]; toast(x?.sendt ? tt("Oversikt sendt til {0}", (x.til || []).join(', ')) : tt("Ingen e-post sendt: {0}", x?.tomt || tt("sjekk e-postoppsettet"))); } catch (e: any) { toast(e.message); } setBusy(false); };
  const dager = [tt("søndager"), tt("mandager"), tt("tirsdager"), tt("onsdager"), tt("torsdager"), tt("fredager"), tt("lørdager")];
  return <div className="card" style={{ maxWidth: 900, marginTop: 16 }}>
    <h2 style={{ marginTop: 0 }}>{tt("Ukeoversikt til eier")}</h2>
    <p className="small muted" style={{ marginTop: -4 }}>{tt("Én e-post med kontroller og service som er forfalt eller forfaller snart, dokumenter som utløper og avvik over frist. Sendes bare når det er noe å melde. Av som standard.")}</p>
    <div className="pu-rad"><Bryter on={c.pa} set={b => setC({ pa: b })} ro={ro}><b>{tt("Send ukeoversikt på e-post")}</b></Bryter>
      {c.pa && <div className="pu-under small">{tt("Hver")} <select disabled={ro} value={c.ukedag} style={{ width: 'auto', display: 'inline-block', padding: '3px 6px' }} onChange={e => setC({ ukedag: +e.target.value })}>{dager.map((d, i) => <option key={i} value={i}>{d}</option>)}</select> · {tt("ta med de neste")} <Tall v={c.dager} set={n => setC({ dager: Math.max(7, n) })} ro={ro} w={50} /> {tt("dagene")} · {tt("til")} <input disabled={ro} value={c.epost} placeholder={tt("e-post (tom = organisasjonens administratorer)")} style={{ width: 300, display: 'inline-block', padding: '3px 6px' }} onChange={e => setC({ epost: e.target.value })} /></div>}</div>
    {!ro ? <div className="toolbar"><button className="btn pri" disabled={busy || S.innstMangler} onClick={lagre}>{busy ? tt("Lagrer …") : tt("Lagre")}</button><button className="btn" disabled={busy || S.innstMangler} onClick={sendNa}>{tt("Send en nå (test)")}</button></div> : <p className="small muted">{tt("Bare administrator eller forvalter kan endre dette.")}</p>}
  </div>;
}

// ---------------- Automatisk leietaker-runde (serverjobb kl. 07:00 norsk tid; status ligger på hver leietaker)
export function LtRundeKort() {
  useStore(); const ro = !isAdmin() && state.me?.rolle !== 'forvalter';
  const [c, setC0] = useState(renRundeInnst(S.innst.ltRunde)); const [busy, setBusy] = useState(false);
  useEffect(() => setC0(renRundeInnst(S.innst.ltRunde)), [JSON.stringify(S.innst.ltRunde)]);
  const setC = (x: Partial<typeof RUNDE_STD>) => setC0(v => ({ ...v, ...x }));
  const mnd = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
  const [mm, dd] = c.dato.split('-').map(Number);
  const settDato = (m: number, d: number) => setC({ dato: `${String(m).padStart(2, '0')}-${String(Math.min(28, Math.max(1, d || 1))).padStart(2, '0')}` });
  const lagre = async () => { setBusy(true); try { const ny = { ...renRundeInnst(c), aktivert: c.pa && !S.innst.ltRunde?.pa ? today() : (S.innst.ltRunde?.aktivert || '') }; await saveInnst('ltRunde', ny); toast(tt("Innstillingene er lagret")); } catch { } setBusy(false); };
  const startNa = async () => {
    if (!S.primarOrg || !confirm(tt("Starte en runde nå? Alle aktive leietakere med e-postadresse får sjekklisten per e-post."))) return; setBusy(true);
    try { await saveInnst('ltRunde', { ...renRundeInnst(c), aktivert: S.innst.ltRunde?.aktivert || today() }); const r = await aoApi({ action: 'lt_runde_na', org: S.primarOrg }); const x = (r.rapport || [])[0] || {};
      toast(tt("Runde startet: {0} sendt, {1} uten e-postadresse, {2} holdt tilbake", x.startet || 0, x.uten_epost || 0, x.holdt || 0)); } catch { } setBusy(false); };
  const sel = { width: 'auto', display: 'inline-block', padding: '3px 6px' } as const;
  return <div className="card" style={{ maxWidth: 900, marginTop: 16 }}>
    <h2 style={{ marginTop: 0 }}>{tt("Leietaker-runde")}</h2>
    <p className="small muted" style={{ marginTop: -4 }}>{tt("Appen sender sjekklisten for brann og internkontroll til alle aktive leietakere på et fast tidspunkt, purrer de som ikke har svart, og varsler deg til slutt. Status vises på hver leietaker. Av som standard.")}</p>
    <div className="pu-rad"><Bryter on={c.pa} set={b => setC({ pa: b })} ro={ro}><b>{tt("Send sjekkliste automatisk til alle leietakere")}</b><br /><span className="small muted">{tt("Leietakere uten e-postadresse, utflyttede og leietakere uten relevante plikter hoppes over. Første runde kommer ved neste planlagte dato.")}</span></Bryter>
      {c.pa && <div className="pu-under small">
        <select disabled={ro} value={c.intervall} style={sel} onChange={e => setC({ intervall: e.target.value as any })}><option value="aar">{tt("Hvert år")}</option><option value="halvaar">{tt("Hvert halvår")}</option></select> {tt("fra")}{' '}
        <input type="number" min={1} max={28} disabled={ro} className="num" style={{ ...sel, width: 56 }} value={dd} onChange={e => settDato(mm, +e.target.value)} />{'. '}
        <select disabled={ro} value={mm} style={sel} onChange={e => settDato(+e.target.value, dd)}>{mnd.map((m, i) => <option key={i} value={i + 1}>{tt(m)}</option>)}</select>
        {c.intervall === 'halvaar' && <span> {tt("og seks måneder senere")}</span>}<br />
        {tt("Frist for svar")} <Tall v={c.frist} set={n => setC({ frist: n })} ro={ro} w={46} /> {tt("dager")}</div>}</div>
    {c.pa && <div className="pu-rad"><span className="small"><b>{tt("Purring")}</b> {tt("første purring etter")} <Tall v={c.purrEtter} set={n => setC({ purrEtter: n })} ro={ro} w={46} /> {tt("dager, deretter hver")} <Tall v={c.purrGjenta} set={n => setC({ purrGjenta: n })} ro={ro} w={46} /> {tt("dag, maks")} <Tall v={c.purrMaks} set={n => setC({ purrMaks: n })} ro={ro} w={46} /> {tt("purringer")}</span></div>}
    {c.pa && <div className="pu-rad"><Bryter on={c.eskaler} set={b => setC({ eskaler: b })} ro={ro}><b>{tt("Samlet e-post til eier om de som fortsatt ikke har svart")}</b></Bryter>
      {c.eskaler && <div className="pu-under small">{tt("Til")} <input disabled={ro} value={c.eskalerEpost} placeholder={tt("administratorene (tomt = alle)")} style={{ width: 300, display: 'inline-block', padding: '3px 6px' }} onChange={e => setC({ eskalerEpost: e.target.value })} /></div>}</div>}
    {c.pa && <div className="pu-rad small"><label>{tt("Egen tekst i e-posten (valgfritt)")}<textarea disabled={ro} rows={3} value={c.melding} onChange={e => setC({ melding: e.target.value })} placeholder={tt("Tom = standardtekst")} /></label></div>}
    {!ro ? <div className="toolbar"><button className="btn pri" disabled={busy || S.innstMangler} onClick={lagre}>{busy ? tt("Lagrer …") : tt("Lagre")}</button><button className="btn" disabled={busy || S.innstMangler} onClick={startNa}>{tt("Start en runde nå")}</button></div> : <p className="small muted">{tt("Bare administrator eller forvalter kan endre dette.")}</p>}
  </div>;
}

// ---------------- Automatisk fornyelse av utløpende dokumenter (serverjobb hver morgen; status ligger på dokumentet)
export function FornyelseKort() {
  useStore(); const ro = !isAdmin() && state.me?.rolle !== 'forvalter';
  const [c, setC0] = useState(renFornyInnst(S.innst.dokFornyelse)); const [trinnTxt, setTrinn] = useState(renFornyInnst(S.innst.dokFornyelse).trinn.join(', ')); const [busy, setBusy] = useState(false);
  useEffect(() => { const n = renFornyInnst(S.innst.dokFornyelse); setC0(n); setTrinn(n.trinn.join(', ')); }, [JSON.stringify(S.innst.dokFornyelse)]);
  const setC = (x: Partial<ReturnType<typeof renFornyInnst>>) => setC0(v => ({ ...v, ...x }));
  const ferdig = () => renFornyInnst({ ...c, trinn: trinnTxt });
  const lagre = async () => { setBusy(true); try { await saveInnst('dokFornyelse', ferdig()); toast(tt("Innstillingene er lagret")); } catch { } setBusy(false); };
  const kjorNa = async () => {
    if (!S.primarOrg || !confirm(tt("Kjøre nå? Mottakere av dokumenter som utløper snart får e-post med en gang."))) return; setBusy(true);
    try { await saveInnst('dokFornyelse', ferdig()); const r = await aoApi({ action: 'dok_fornyelse_na', org: S.primarOrg }); const x = (r.rapport || [])[0] || {};
      toast(tt("{0} mottakere varslet om {1} dokumenter, {2} holdt tilbake", x.mottakere || 0, x.dokumenter || 0, x.holdt || 0)); } catch { } setBusy(false); };
  return <div className="card" style={{ maxWidth: 900, marginTop: 16 }}>
    <h2 style={{ marginTop: 0 }}>{tt("Fornyelse av dokumenter")}</h2>
    <p className="small muted" style={{ marginTop: -4 }}>{tt("Når et dokument med «Gyldig til» nærmer seg utløp, ber appen leietaker, leverandør eller deg om et nytt. Hver mottaker får én samlet e-post, og hvert trinn sendes bare én gang. Dokumenter som allerede har et nyere dokument av samme type, hoppes over. Av som standard.")}</p>
    <div className="pu-rad"><Bryter on={c.pa} set={b => setC({ pa: b })} ro={ro}><b>{tt("Be om fornyelse automatisk")}</b></Bryter>
      {c.pa && <div className="pu-under small">{tt("Varsle så mange dager før utløp")} <input disabled={ro} value={trinnTxt} className="num" style={{ width: 130, display: 'inline-block', padding: '3px 6px' }} onChange={e => setTrinn(e.target.value)} /> <span className="muted">{tt("(f.eks. 90, 30, 0)")}</span><br />
        <label><input type="checkbox" disabled={ro} checked={c.leietaker} onChange={e => setC({ leietaker: e.target.checked })} /> {tt("Send til leietaker for leietakerens dokumenter")}</label><br />
        <label><input type="checkbox" disabled={ro} checked={c.leverandor} onChange={e => setC({ leverandor: e.target.checked })} /> {tt("Send til leverandør når e-post er lagret på kontrollen eller anlegget")}</label><br />
        {tt("Øvrige dokumenter sendes til")} <input disabled={ro} value={c.eierEpost} placeholder={tt("administratorene (tomt = alle)")} style={{ width: 300, display: 'inline-block', padding: '3px 6px' }} onChange={e => setC({ eierEpost: e.target.value })} /></div>}</div>
    {!ro ? <div className="toolbar"><button className="btn pri" disabled={busy || S.innstMangler} onClick={lagre}>{busy ? tt("Lagrer …") : tt("Lagre")}</button><button className="btn" disabled={busy || S.innstMangler} onClick={kjorNa}>{tt("Kjør nå")}</button></div> : <p className="small muted">{tt("Bare administrator eller forvalter kan endre dette.")}</p>}
  </div>;
}

// ---------------- Leieavtale-vakt: varsler til eier om avtaleutløp, oppsigelsesfrist og kommende indeksregulering
export function LeieVaktInnstKort() {
  useStore(); const ro = !isAdmin() && state.me?.rolle !== 'forvalter';
  const [c, setC0] = useState(renVaktInnst(S.innst.leieVakt)); const [t1, setT1] = useState(''); const [t2, setT2] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { const n = renVaktInnst(S.innst.leieVakt); setC0(n); setT1(n.utlopMnd.join(', ')); setT2(n.oppsigDager.join(', ')); }, [JSON.stringify(S.innst.leieVakt)]);
  const setC = (x: Partial<ReturnType<typeof renVaktInnst>>) => setC0(v => ({ ...v, ...x }));
  const ferdig = () => renVaktInnst({ ...c, utlopMnd: t1, oppsigDager: t2 });
  const lagre = async () => { setBusy(true); try { await saveInnst('leieVakt', ferdig()); toast(tt("Innstillingene er lagret")); } catch { } setBusy(false); };
  const kjorNa = async () => {
    if (!S.primarOrg || !confirm(tt("Kjøre nå? Du får e-post med de fristene som er innenfor varselgrensene."))) return; setBusy(true);
    try { await saveInnst('leieVakt', ferdig()); const r = await aoApi({ action: 'leie_vakt_na', org: S.primarOrg }); const x = (r.rapport || [])[0] || {};
      toast(x.sendt ? tt("E-post sendt med {0} frister", x.sendt) : x.uten_mottaker ? tt("Ingen mottaker – legg inn e-post eller administrator") : tt("Ingen frister å varsle om nå")); } catch { } setBusy(false); };
  return <div className="card" style={{ maxWidth: 900, marginTop: 16 }}>
    <h2 style={{ marginTop: 0 }}>{tt("Leieavtale-vakt")}</h2>
    <p className="small muted" style={{ marginTop: -4 }}>{tt("Varsler deg om avtaleutløp, siste oppsigelsesdato og kommende indeksregulering. Leietakerne får ingenting automatisk. Fyll ut oppsigelsesfrist og reguleringsdato på hver leietaker. Av som standard.")}</p>
    <div className="pu-rad"><Bryter on={c.pa} set={b => setC({ pa: b })} ro={ro}><b>{tt("Send varsler om leieavtaler på e-post")}</b></Bryter>
      {c.pa && <div className="pu-under small">{tt("Avtaleutløp: varsle så mange måneder før")} <input disabled={ro} className="num" style={{ width: 110, display: 'inline-block', padding: '3px 6px' }} value={t1} onChange={e => setT1(e.target.value)} /><br />
        {tt("Siste oppsigelsesdato: varsle så mange dager før")} <input disabled={ro} className="num" style={{ width: 110, display: 'inline-block', padding: '3px 6px' }} value={t2} onChange={e => setT2(e.target.value)} /><br />
        {tt("Indeksregulering: varsle")} <Tall v={c.regulerDager} set={n => setC({ regulerDager: n })} ro={ro} w={56} /> {tt("dager før reguleringsdato")}<br />
        {tt("Send til")} <input disabled={ro} value={c.epost} placeholder={tt("administratorene (tomt = alle)")} style={{ width: 300, display: 'inline-block', padding: '3px 6px' }} onChange={e => setC({ epost: e.target.value })} /></div>}</div>
    {!ro ? <div className="toolbar"><button className="btn pri" disabled={busy || S.innstMangler} onClick={lagre}>{busy ? tt("Lagrer …") : tt("Lagre")}</button><button className="btn" disabled={busy || S.innstMangler} onClick={kjorNa}>{tt("Kjør nå")}</button></div> : <p className="small muted">{tt("Bare administrator eller forvalter kan endre dette.")}</p>}
  </div>;
}

// ---------------- Anbefalt automatikk: oversikt og én knapp som slår på det som er av (beholder alt du har justert)
export function AnbefaltKort() {
  useStore(); const ro = !isAdmin() && state.me?.rolle !== 'forvalter';
  const av = AUTOMATIKK.filter(p => !erPa(p, S.innst)); const [valgt, setValgt] = useState<string[]>([]); const [busy, setBusy] = useState(false);
  useEffect(() => setValgt(av.map(p => p.id)), [av.map(p => p.id).join(',')]);
  const slaPaNa = async () => {
    const ny = slaPa(valgt, S.innst, today()); const n = valgt.length; if (!n) return;
    if (!confirm(tt("Slå på {0} automatikker? Du kan slå dem av igjen i kortene under. Mens e-post står i testmodus, holdes e-post til andre tilbake.", n))) return;
    setBusy(true); try { for (const [nokkel, data] of Object.entries(ny)) await saveInnst(nokkel, data); toast(tt("Anbefalt oppsett er slått på")); } catch { } setBusy(false); };
  return <div className="card" style={{ maxWidth: 900, marginTop: 16 }}>
    <h2 style={{ marginTop: 0 }}>{tt("Anbefalt automatikk")}</h2>
    <p className="small muted" style={{ marginTop: -4 }}>{av.length ? tt("{0} av {1} automatikker er av. Slå på det du vil ha, så bruker appen anbefalte standardverdier. Innstillinger du har justert, beholdes.", av.length, AUTOMATIKK.length) : tt("Alle automatikker er på. Justér dem i kortene under.")}</p>
    {AUTOMATIKK.map(p => { const pa = erPa(p, S.innst); return <div key={p.id} className="pu-rad small" style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
      {pa ? <span style={{ color: 'var(--green)' }} aria-label={tt("På")}>✔</span> : <input type="checkbox" disabled={ro} checked={valgt.includes(p.id)} onChange={e => setValgt(v => e.target.checked ? [...v, p.id] : v.filter(x => x !== p.id))} aria-label={tt(p.navn)} />}
      <span><b>{tt(p.navn)}</b>{p.sendtTilAndre && <span className="muted"> · {tt("sender også til leietakere/leverandører")}</span>}<br /><span className="muted">{tt(p.hva)}</span></span></div>; })}
    {av.length > 0 && (!ro ? <div className="toolbar"><button className="btn pri" disabled={busy || S.innstMangler || !valgt.length} onClick={slaPaNa}>{busy ? tt("Slår på …") : tt("Slå på valgte")}</button></div> : <p className="small muted">{tt("Bare administrator eller forvalter kan endre dette.")}</p>)}
  </div>;
}

// ---------------- Brannopplæring på autopilot: purring, årlig repetisjon og eskalering (bare prosent til eier)
export function BrannAutoKort() {
  useStore(); const ro = !isAdmin() && state.me?.rolle !== 'forvalter';
  const [c, setC0] = useState(renOplAuto(S.innst.oplAuto)); const [busy, setBusy] = useState(false);
  useEffect(() => setC0(renOplAuto(S.innst.oplAuto)), [JSON.stringify(S.innst.oplAuto)]);
  const setC = (x: Partial<ReturnType<typeof renOplAuto>>) => setC0(v => ({ ...v, ...x }));
  const lagre = async () => { setBusy(true); try { await saveInnst('oplAuto', renOplAuto(c)); toast(tt("Innstillingene er lagret")); } catch { } setBusy(false); };
  const kjorNa = async () => {
    if (!S.primarOrg || !confirm(tt("Kjøre nå? Ledere og ansatte som skal purres eller repeteres, får e-post med en gang."))) return; setBusy(true);
    try { await saveInnst('oplAuto', renOplAuto(c)); const r = await aoApi({ action: 'brannauto_na', org: S.primarOrg }); const x = (r.rapport || [])[0] || {};
      toast(tt("{0} purret, {1} repetisjoner startet, {2} holdt tilbake", x.purret || 0, x.repetert || 0, x.holdt || 0)); } catch { } setBusy(false); };
  return <div className="card" style={{ maxWidth: 900, marginTop: 16 }}>
    <h2 style={{ marginTop: 0 }}>{tt("Brannopplæring på autopilot")}</h2>
    <p className="small muted" style={{ marginTop: -4 }}>{tt("Purrer brannvernledere og ansatte som ikke har gjennomført opplæringen, og starter en ny runde hvert år. Du ser bare prosent per leietaker, aldri navn eller e-post til ansatte. Av som standard.")}</p>
    <div className="pu-rad"><Bryter on={c.pa} set={b => setC({ pa: b })} ro={ro}><b>{tt("Purr og repeter automatisk")}</b></Bryter>
      {c.pa && <div className="pu-under small">{tt("Første purring etter")} <Tall v={c.purrEtter} set={n => setC({ purrEtter: n })} ro={ro} w={46} /> {tt("dager, deretter hver")} <Tall v={c.purrGjenta} set={n => setC({ purrGjenta: n })} ro={ro} w={46} /> {tt("dag, maks")} <Tall v={c.purrMaks} set={n => setC({ purrMaks: n })} ro={ro} w={46} /> {tt("purringer")}<br />
        <label><input type="checkbox" disabled={ro} checked={c.aarlig} onChange={e => setC({ aarlig: e.target.checked })} /> {tt("Start ny runde når lederen gjennomførte for mer enn")}</label> <Tall v={c.aarligMnd} set={n => setC({ aarligMnd: n })} ro={ro} w={46} /> {tt("måneder siden")}<br />
        {tt("Varsle meg når purringene er brukt opp og under")} <Tall v={c.terskel} set={n => setC({ terskel: n })} ro={ro} w={46} /> {tt("% har gjennomført, til")} <input disabled={ro} value={c.eierEpost} placeholder={tt("administratorene (tomt = alle)")} style={{ width: 260, display: 'inline-block', padding: '3px 6px' }} onChange={e => setC({ eierEpost: e.target.value })} /></div>}</div>
    {!ro ? <div className="toolbar"><button className="btn pri" disabled={busy || S.innstMangler} onClick={lagre}>{busy ? tt("Lagrer …") : tt("Lagre")}</button><button className="btn" disabled={busy || S.innstMangler} onClick={kjorNa}>{tt("Kjør nå")}</button></div> : <p className="small muted">{tt("Bare administrator eller forvalter kan endre dette.")}</p>}
  </div>;
}

export function ChatVarselKort() {
  useStore(); const ro = !isAdmin() && state.me?.rolle !== 'forvalter';
  const [c, setC0] = useState(renChatInnst(S.innst.chatVarsel)); const [busy, setBusy] = useState(false);
  useEffect(() => setC0(renChatInnst(S.innst.chatVarsel)), [JSON.stringify(S.innst.chatVarsel)]);
  const setC = (x: Partial<ReturnType<typeof renChatInnst>>) => setC0(v => ({ ...v, ...x }));
  const lagre = async () => { setBusy(true); try { await saveInnst('chatVarsel', renChatInnst(c)); toast(tt("Innstillingene er lagret")); } catch { } setBusy(false); };
  const kjorNa = async () => {
    if (!S.primarOrg || !confirm(tt("Kjøre nå? Du får en samlet påminnelse om leietakermeldinger som ikke har fått svar."))) return; setBusy(true);
    try { await saveInnst('chatVarsel', renChatInnst(c)); const r = await aoApi({ action: 'chat_varsel_na', org: S.primarOrg }); const x = (r.rapport || [])[0] || {};
      toast(tt("{0} meldinger uten svar, {1} varsler og {2} e-poster sendt", x.ubesvarte || 0, x.push || 0, x.epost || 0)); } catch { } setBusy(false); };
  return <div className="card" style={{ maxWidth: 900, marginTop: 16 }}>
    <h2 style={{ marginTop: 0 }}>{tt("Chat-varsler")}</h2>
    <p className="small muted" style={{ marginTop: -4 }}>{tt("Varsler når det kommer nye meldinger i chatten, og minner om leietakermeldinger som ikke har fått svar. Høyst ett varsel per samtale hvert 30. minutt. Interne notater varsler aldri. Av som standard.")}</p>
    <div className="pu-rad"><Bryter on={c.pa} set={b => setC({ pa: b })} ro={ro}><b>{tt("Send chat-varsler")}</b></Bryter>
      {c.pa && <div className="pu-under small">
        <label><input type="checkbox" disabled={ro} checked={c.tilAnsatte} onChange={e => setC({ tilAnsatte: e.target.checked })} /> {tt("Varsle ansatte (push og e-post) når en leietaker skriver")}</label><br />
        <label><input type="checkbox" disabled={ro} checked={c.tilLeietaker} onChange={e => setC({ tilLeietaker: e.target.checked })} /> {tt("Send e-post til leietaker når utleier svarer")}</label><br />
        <label><input type="checkbox" disabled={ro} checked={c.paminnelse} onChange={e => setC({ paminnelse: e.target.checked })} /> {tt("Minn meg på meldinger uten svar etter")}</label> <Tall v={c.ubesvartDager} set={n => setC({ ubesvartDager: n })} ro={ro} w={46} /> {tt("dager")}<br />
        {tt("E-post til ansatte går til")} <input disabled={ro} value={c.ansatteEpost} placeholder={tt("administratorene (tomt = alle)")} style={{ width: 260, display: 'inline-block' }} onChange={e => setC({ ansatteEpost: e.target.value })} /></div>}</div>
    {!ro ? <div className="toolbar"><button className="btn pri" disabled={busy || S.innstMangler} onClick={lagre}>{busy ? tt("Lagrer …") : tt("Lagre")}</button><button className="btn" disabled={busy || S.innstMangler} onClick={kjorNa}>{tt("Kjør nå")}</button></div> : <p className="small muted">{tt("Bare administrator eller forvalter kan endre dette.")}</p>}
  </div>;
}

export function InvestVarselKort() {
  useStore(); const ro = !isAdmin() && state.me?.rolle !== 'forvalter';
  const [c, setC0] = useState(renInvest(S.innst.investVarsel)); const [busy, setBusy] = useState(false);
  useEffect(() => setC0(renInvest(S.innst.investVarsel)), [JSON.stringify(S.innst.investVarsel)]);
  const setC = (x: Partial<ReturnType<typeof renInvest>>) => setC0(v => ({ ...v, ...x }));
  const lagre = async () => { setBusy(true); try { await saveInnst('investVarsel', renInvest(c)); toast(tt("Innstillingene er lagret")); } catch { } setBusy(false); };
  const kjorNa = async () => {
    if (!S.primarOrg || !confirm(tt("Kjøre nå? Du får investeringsoversikten på e-post og push med en gang."))) return; setBusy(true);
    try { await saveInnst('investVarsel', renInvest(c)); const r = await aoApi({ action: 'invest_varsel_na', org: S.primarOrg }); const x = (r.rapport || [])[0] || {};
      toast(tt("{0} systemer vurdert, {1} varsler og {2} e-poster sendt", x.poster || 0, x.push || 0, x.epost || 0)); } catch { } setBusy(false); };
  return <div className="card" style={{ maxWidth: 900, marginTop: 16 }}>
    <h2 style={{ marginTop: 0 }}>{tt("Investeringsvarsler")}</h2>
    <p className="small muted" style={{ marginTop: -4 }}>{tt("Første mandag i januar, april, juli og oktober får du én oversikt over utskiftinger de nærmeste årene, med kostnad og datahull. Du får også varsel med en gang noe passerer levetid eller får tilstandsgrad TG3. Av som standard.")}</p>
    <div className="pu-rad"><Bryter on={c.pa} set={b => setC({ pa: b })} ro={ro}><b>{tt("Send investeringsvarsler")}</b></Bryter>
      {c.pa && <div className="pu-under small">{tt("Se")} <Tall v={c.aar} set={n => setC({ aar: n })} ro={ro} w={46} /> {tt("år fram i oversikten")}<br />
        <label><input type="checkbox" disabled={ro} checked={c.haste} onChange={e => setC({ haste: e.target.checked })} /> {tt("Varsle med en gang ved etterslep eller TG3")}</label><br />
        {tt("E-post går til")} <input disabled={ro} value={c.epost} placeholder={tt("administratorene (tomt = alle)")} style={{ width: 260, display: 'inline-block' }} onChange={e => setC({ epost: e.target.value })} /></div>}</div>
    {!ro ? <div className="toolbar"><button className="btn pri" disabled={busy || S.innstMangler} onClick={lagre}>{busy ? tt("Lagrer …") : tt("Lagre")}</button><button className="btn" disabled={busy || S.innstMangler} onClick={kjorNa}>{tt("Kjør nå")}</button></div> : <p className="small muted">{tt("Bare administrator eller forvalter kan endre dette.")}</p>}
  </div>;
}

// ---------------- Purreliste: hvilke avvik som gjelder brukeren
const AKTIV = (a: Rec) => !AV_LUKKET.includes(a.status);
export function purreListe(dager = purrInnst().paLoggingDager) {
  const staff = canEdit();
  const mine = staff ? S.avvik.filter(AKTIV) : mineAo();
  const harFrist = mine.filter(a => a.frist && a.status !== 'Utført – til kontroll' && a.status !== 'Utsatt');
  const over = harFrist.filter(a => (dUntil(a.frist) as number) < 0).sort((x, y) => x.frist.localeCompare(y.frist));
  const snart = harFrist.filter(a => { const d = dUntil(a.frist) as number; return d >= 0 && d <= dager; }).sort((x, y) => x.frist.localeCompare(y.frist));
  const kontroll = staff ? S.avvik.filter(a => a.status === 'Utført – til kontroll') : [];
  return { over, snart, kontroll };
}
export const ansvarTekst = (a: Rec) => a.tildeltId ? (S.profiles.find(p => p.id === a.tildeltId)?.navn || 'Tildelt') : a.ansvar === 'Leietaker' ? 'Leietaker' : a.utbedresAv || a.ansvar || 'Eier';

export async function purrNa(id: string) {
  try { const r = await aoApi({ action: 'av_purr', avvik_id: id, lenkeBase: location.origin }); toast(r.sendt ? tt("Purring sendt til {0}", (r.til || []).join(', ')) : tt("Ingen purring sendt: {0}", r.grunn || 'ukjent årsak')); }
  catch (e: any) { toast(e.message); }
}

// ---------------- Skjermbilde ved pålogging
const nokkel = () => `ek-purring-vist:${state.me?.id || ''}`;
export function visPurringVedPalogging() {
  const c = purrInnst(); if (!c.paLogging || !state.me) return;
  try { if (localStorage.getItem(nokkel()) === today()) return; } catch { }
  const L = purreListe(c.paLoggingDager); const T = canEdit() ? svarfristSnart(14) : []; if (!L.over.length && !L.snart.length && !L.kontroll.length && !T.length) return;
  openModal({ wide: true, render: close => <PurreSkjerm close={close} /> });
}
function PurreSkjerm({ close }: { close: () => void }) {
  useStore(); const c = purrInnst(); const L = purreListe(c.paLoggingDager); const staff = canEdit(); const T = staff ? svarfristSnart(14) : [];
  const ferdig = (gaa?: string) => { try { localStorage.setItem(nokkel(), today()); } catch { } close(); if (gaa === 'avvik') { settFilter('avvik', { st: 'apne', e: '', a: '', k: '', an: '', q: '', fr: 'purring' }); location.hash = '#/avvik'; } else if (gaa) location.hash = gaa; };
  const Rad = ({ a, over }: { a: Rec; over?: boolean }) => { const d = dUntil(a.frist) as number;
    return <tr className="click" onClick={() => { ferdig(); editAvvik(a.id); }}>
      <td><b style={{ fontWeight: 600 }}>#{a.nr} {a.tittel}</b><div className="small muted">{eNavn(a.eiendomId)}</div></td>
      <td className="small">{a.alv}</td><td className="small">{ansvarTekst(a)}{a.purring?.sist ? <div className="muted">{tt("purret")} {fd(String(a.purring.sist).slice(0, 10))}{a.purring.antall ? tt(" ({0})", a.purring.antall) : ''}</div> : null}</td>
      <td className="small" style={{ color: over ? 'var(--red)' : undefined, whiteSpace: 'nowrap' }}>{fd(a.frist)}<div className={over ? '' : 'muted'}>{over ? tt("{0} d over", -d) : d === 0 ? tt("i dag") : tt("om {0} d", d)}</div></td>
      {staff && <td onClick={e => e.stopPropagation()}><button className="btn sm" title={tt("Send påminnelse til den som skal utbedre")} onClick={() => purrNa(a.id)}>{tt("Purr")}</button></td>}</tr>; };
  const Tab = ({ l, over }: { l: Rec[]; over?: boolean }) => <div className="tbl-wrap" style={{ maxHeight: 260 }}><table><thead><tr><th>{tt("Avvik")}</th><th>{tt("Alv.")}</th><th>{tt("Ansvarlig")}</th><th>{tt("Frist")}</th>{staff && <th />}</tr></thead><tbody>{l.slice(0, 40).map(a => <Rad key={a.id} a={a} over={over} />)}</tbody></table>{l.length > 40 && <p className="small muted">{tt("… og")} {l.length - 40} {tt("til")}</p>}</div>;
  return <ModalFrame title={<span>{tt("Avvik som trenger oppfølging")}<Hjelp id="side.avvik" /></span>} close={() => ferdig()}
    foot={<><span className="small muted" style={{ flex: 1 }}>{tt("Vises én gang per dag.")}{staff ? tt(" Kan slås av under Innstillinger → Purring på avvik.") : ''}</span>
      <button className="btn" onClick={() => ferdig()}>{tt("Lukk")}</button><button className="btn pri" onClick={() => ferdig(staff ? 'avvik' : '#/arbeidsordre')}>{tt("Gå til listen")}</button></>}>
    {T.length > 0 && <div className="note" style={{ marginBottom: 12, borderColor: 'var(--red)' }}><b>{tt("Svarfrist til myndigheten")}</b>
      {T.map(s => { const d = dUntil(s.svarfrist) as number; return <div key={s.key} className="small" style={{ marginTop: 4 }}>{s.myndighet}{s.ref ? ' · ' + s.ref : ''} – {eNavn(s.eiendomId)}: <b style={{ color: d < 0 ? 'var(--red)' : undefined }}>{fd(s.svarfrist)} {d < 0 ? tt("({0} d over)", -d) : d === 0 ? tt("(i dag)") : tt("(om {0} d)", d)}</b> · {s.apne} {tt("åpne forhold")}</div>; })}
      <button className="btn sm" style={{ marginTop: 8 }} onClick={() => ferdig('#/tilsyn')}>{tt("Åpne tilsynssaker")}</button></div>}
    {L.over.length > 0 && <><h3 style={{ margin: '0 0 6px', color: 'var(--red)' }}>{tt("Over frist (")}{L.over.length})</h3><Tab l={L.over} over /></>}
    {L.snart.length > 0 && <><h3 style={{ margin: '14px 0 6px' }}>{tt("Frist innen")} {c.paLoggingDager} {tt("dager (")}{L.snart.length})</h3><Tab l={L.snart} /></>}
    {L.kontroll.length > 0 && <><h3 style={{ margin: '14px 0 6px' }}>{tt("Utført – venter på din kontroll (")}{L.kontroll.length})</h3>
      <div className="tbl-wrap" style={{ maxHeight: 200 }}><table><tbody>{L.kontroll.slice(0, 20).map(a => <tr key={a.id} className="click" onClick={() => { ferdig(); editAvvik(a.id); }}><td><b style={{ fontWeight: 600 }}>#{a.nr} {a.tittel}</b><div className="small muted">{eNavn(a.eiendomId)}</div></td><td className="small">{a.utfort?.av || ''}{a.utfort?.t ? ' · ' + fd(String(a.utfort.t).slice(0, 10)) : ''}</td></tr>)}</tbody></table></div></>}
  </ModalFrame>;
}

// ---------------- Push-varsler på denne enheten (telefon/PC). Hver enhet melder seg på selv.
export function PushKort() {
  const stotte = pushStotte(); const [st, setSt] = useState<{ pa: boolean; typer: string[]; enheter: number } | null>(null); const [busy, setBusy] = useState(false);
  const last = () => pushStatus().then(setSt).catch(() => setSt({ pa: false, typer: [], enheter: 0 }));
  useEffect(() => { if (stotte) last(); }, []);
  const iosUinst = erIos() && !erInstallert();
  const kjor = async (f: () => Promise<any>) => { setBusy(true); try { await f(); await last(); } catch (e: any) { toast(tt(e?.message || 'Noe gikk galt')); } setBusy(false); };
  const slaPa = () => kjor(() => slaPaPush(['kritisk', 'melding', 'oversikt']).then(() => toast(tt("Varsler er slått på for denne enheten"))));
  const velg = (k: string, b: boolean) => { if (!st) return; const typer = b ? [...new Set([...st.typer, k])] : st.typer.filter(x => x !== k); setSt({ ...st, typer }); endreTyper(typer).catch(() => { }); };
  const test = () => kjor(async () => { const n = await testPush(); toast(n ? tt("Testvarsel sendt") : tt("Ingen varsel ble sendt. Slå varsler av og på igjen.")); });
  return <div className="card" style={{ maxWidth: 900, marginTop: 16 }} data-test="push-kort">
    <h2 style={{ marginTop: 0 }}>{tt("Varsler på denne enheten")}</h2>
    <p className="small muted" style={{ marginTop: -4 }}>{tt("Få et varsel på telefonen eller PC-en når noe haster, uten å ha appen åpen. Hver enhet slås på for seg, og du velger selv hvilke varsler som skal komme.")}</p>
    {!stotte ? <div className="note small">{iosUinst ? tt("På iPhone og iPad må appen først legges til på Hjem-skjermen: trykk Del-knappen i Safari, velg «Legg til på Hjem-skjerm», og åpne appen derfra. Da kan du slå på varsler her.") : tt("Denne nettleseren støtter ikke push-varsler. Prøv Chrome, Edge, Firefox eller Safari (iOS 16.4 eller nyere, med appen lagt til på Hjem-skjermen).")}</div>
      : !st ? <p className="small muted">{tt("Henter …")}</p>
      : !st.pa ? <div className="toolbar"><button className="btn pri" disabled={busy} onClick={slaPa}>{tt("Slå på varsler på denne enheten")}</button>{st.enheter > 0 && <span className="small muted">{tt("{0} annen enhet er slått på", st.enheter)}</span>}</div>
      : <>
        {PUSH_TYPER.map(x => <div className="pu-rad" key={x.k}><Bryter on={st.typer.includes(x.k)} set={b => velg(x.k, b)} ro={busy}><b>{tt(x.navn)}</b><br /><span className="small muted">{tt(x.hjelp)}</span></Bryter></div>)}
        <div className="toolbar"><button className="btn" disabled={busy} onClick={test}>{tt("Send testvarsel")}</button><button className="btn" disabled={busy} onClick={() => kjor(async () => { await slaAvPush(); toast(tt("Varsler er slått av for denne enheten")); })}>{tt("Slå av på denne enheten")}</button></div>
      </>}
  </div>;
}
