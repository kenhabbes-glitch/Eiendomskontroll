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

export const PURR_STD = { paLogging: true, paLoggingDager: 7, ansvarlig: false, ansvarligFor: 3, ansvarligGjenta: 7, ansvarligMaks: 3, eier: false, eierEtter: 14, eierEpost: '', ukentlig: false, ukentligEpost: '' };
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
  const lagre = async () => { setBusy(true); try { await saveInnst('avvikPurring', c); toast('Purreinnstillinger lagret'); } catch { } setBusy(false); };
  return <div className="card" style={{ maxWidth: 900, marginTop: 16 }}>
    <h2 style={{ marginTop: 0 }}>Purring på avvik</h2>
    <p className="small muted" style={{ marginTop: -4 }}>Ingen e-post sendes automatisk før du slår det på her. Purringer og eskaleringer føres i avvikets logg og i hendelsesloggen.</p>
    <div className="pu-rad"><Bryter on={c.paLogging} set={b => setC({ paLogging: b })} ro={ro}><b>Vis purreoversikt ved pålogging</b><br /><span className="small muted">Et skjermbilde med avvik over frist og med frist som nærmer seg, med snarvei til listen. Vises én gang per dag.</span></Bryter>
      {c.paLogging && <div className="pu-under small">Ta med avvik med frist innen <Tall v={c.paLoggingDager} set={n => setC({ paLoggingDager: n })} ro={ro} w={46} /> dager</div>}</div>
    <div className="pu-rad"><Bryter on={c.ansvarlig} set={b => setC({ ansvarlig: b })} ro={ro}><b>Automatisk påminnelse og purring til den som skal utbedre</b><br />
      <span className="small muted">Går til tildelt bruker, leverandør med arbeidsordre-lenke eller leietaker. Avvik som står som «Utført – til kontroll» eller «Utsatt», purres ikke.</span></Bryter>
      {c.ansvarlig && <div className="pu-under small">Påminnelse <Tall v={c.ansvarligFor} set={n => setC({ ansvarligFor: n })} ro={ro} w={46} /> dager før frist · etter frist: purring hver <Tall v={c.ansvarligGjenta} set={n => setC({ ansvarligGjenta: n })} ro={ro} w={46} />. dag, maks <Tall v={c.ansvarligMaks} set={n => setC({ ansvarligMaks: n })} ro={ro} w={46} /> purringer</div>}</div>
    <div className="pu-rad"><Bryter on={c.eier} set={b => setC({ eier: b })} ro={ro}><b>Eskalering til eier på e-post</b><br /><span className="small muted">Én samlet e-post når avvik har passert fristen med et antall dager. Av som standard.</span></Bryter>
      {c.eier && <div className="pu-under small">Når fristen er passert med <Tall v={c.eierEtter} set={n => setC({ eierEtter: n })} ro={ro} w={46} /> dager, til <input disabled={ro} value={c.eierEpost} placeholder="e-post (tom = organisasjonens administratorer)" style={{ width: 300, display: 'inline-block', padding: '3px 6px' }} onChange={e => setC({ eierEpost: e.target.value })} /></div>}</div>
    <div className="pu-rad"><Bryter on={c.ukentlig} set={b => setC({ ukentlig: b })} ro={ro}><b>Ukentlig oversikt på e-post (mandager)</b><br /><span className="small muted">Avvik over frist og med frist innen 14 dager.</span></Bryter>
      {c.ukentlig && <div className="pu-under small">Til <input disabled={ro} value={c.ukentligEpost} placeholder="e-post (tom = organisasjonens administratorer)" style={{ width: 300, display: 'inline-block', padding: '3px 6px' }} onChange={e => setC({ ukentligEpost: e.target.value })} /></div>}</div>
    {!ro ? <button className="btn pri" disabled={busy || S.innstMangler} onClick={lagre}>{busy ? 'Lagrer …' : 'Lagre purreinnstillinger'}</button> : <p className="small muted">Bare administrator eller forvalter kan endre dette.</p>}
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
  try { const r = await aoApi({ action: 'av_purr', avvik_id: id, lenkeBase: location.origin }); toast(r.sendt ? `Purring sendt til ${(r.til || []).join(', ')}` : `Ingen purring sendt: ${r.grunn || 'ukjent årsak'}`); }
  catch (e: any) { toast(e.message); }
}

// ---------------- Skjermbilde ved pålogging
const nokkel = () => `ek-purring-vist:${state.me?.id || ''}`;
export function visPurringVedPalogging() {
  const c = purrInnst(); if (!c.paLogging || !state.me) return;
  try { if (localStorage.getItem(nokkel()) === today()) return; } catch { }
  const L = purreListe(c.paLoggingDager); if (!L.over.length && !L.snart.length && !L.kontroll.length) return;
  openModal({ wide: true, render: close => <PurreSkjerm close={close} /> });
}
function PurreSkjerm({ close }: { close: () => void }) {
  useStore(); const c = purrInnst(); const L = purreListe(c.paLoggingDager); const staff = canEdit();
  const ferdig = (gaa?: string) => { try { localStorage.setItem(nokkel(), today()); } catch { } close(); if (gaa === 'avvik') { settFilter('avvik', { st: 'apne', e: '', a: '', k: '', an: '', q: '', fr: 'purring' }); location.hash = '#/avvik'; } else if (gaa) location.hash = gaa; };
  const Rad = ({ a, over }: { a: Rec; over?: boolean }) => { const d = dUntil(a.frist) as number;
    return <tr className="click" onClick={() => { ferdig(); editAvvik(a.id); }}>
      <td><b style={{ fontWeight: 600 }}>#{a.nr} {a.tittel}</b><div className="small muted">{eNavn(a.eiendomId)}</div></td>
      <td className="small">{a.alv}</td><td className="small">{ansvarTekst(a)}{a.purring?.sist ? <div className="muted">purret {fd(String(a.purring.sist).slice(0, 10))}{a.purring.antall ? ` (${a.purring.antall})` : ''}</div> : null}</td>
      <td className="small" style={{ color: over ? 'var(--red)' : undefined, whiteSpace: 'nowrap' }}>{fd(a.frist)}<div className={over ? '' : 'muted'}>{over ? `${-d} d over` : d === 0 ? 'i dag' : `om ${d} d`}</div></td>
      {staff && <td onClick={e => e.stopPropagation()}><button className="btn sm" title="Send påminnelse til den som skal utbedre" onClick={() => purrNa(a.id)}>Purr</button></td>}</tr>; };
  const Tab = ({ l, over }: { l: Rec[]; over?: boolean }) => <div className="tbl-wrap" style={{ maxHeight: 260 }}><table><thead><tr><th>Avvik</th><th>Alv.</th><th>Ansvarlig</th><th>Frist</th>{staff && <th />}</tr></thead><tbody>{l.slice(0, 40).map(a => <Rad key={a.id} a={a} over={over} />)}</tbody></table>{l.length > 40 && <p className="small muted">… og {l.length - 40} til</p>}</div>;
  return <ModalFrame title={<span>Avvik som trenger oppfølging<Hjelp id="side.avvik" /></span>} close={() => ferdig()}
    foot={<><span className="small muted" style={{ flex: 1 }}>Vises én gang per dag.{staff ? ' Kan slås av under Innstillinger → Purring på avvik.' : ''}</span>
      <button className="btn" onClick={() => ferdig()}>Lukk</button><button className="btn pri" onClick={() => ferdig(staff ? 'avvik' : '#/arbeidsordre')}>Gå til listen</button></>}>
    {L.over.length > 0 && <><h3 style={{ margin: '0 0 6px', color: 'var(--red)' }}>Over frist ({L.over.length})</h3><Tab l={L.over} over /></>}
    {L.snart.length > 0 && <><h3 style={{ margin: '14px 0 6px' }}>Frist innen {c.paLoggingDager} dager ({L.snart.length})</h3><Tab l={L.snart} /></>}
    {L.kontroll.length > 0 && <><h3 style={{ margin: '14px 0 6px' }}>Utført – venter på din kontroll ({L.kontroll.length})</h3>
      <div className="tbl-wrap" style={{ maxHeight: 200 }}><table><tbody>{L.kontroll.slice(0, 20).map(a => <tr key={a.id} className="click" onClick={() => { ferdig(); editAvvik(a.id); }}><td><b style={{ fontWeight: 600 }}>#{a.nr} {a.tittel}</b><div className="small muted">{eNavn(a.eiendomId)}</div></td><td className="small">{a.utfort?.av || ''}{a.utfort?.t ? ' · ' + fd(String(a.utfort.t).slice(0, 10)) : ''}</td></tr>)}</tbody></table></div></>}
  </ModalFrame>;
}
