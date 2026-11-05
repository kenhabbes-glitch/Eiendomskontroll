// Prosjektmodul: liste og prosjektside (oversikt, faser og oppgaver, økonomi, FDV, systembytte, logg).
import React, { useState } from 'react';
import { Hjelp } from '../components/Hjelp';
import { S, save, removeDoc, toast, useStore, kanRedigereE, uploadFile, state } from '../lib/store';
import { byId, fd, today, sortBy, eNavn, aNavn, nok, toCsv, type Rec } from '../lib/utils';
import { Chip, Empty, confirmBox, formModal, openModal, ModalFrame, FileLink, TgChip } from '../components/ui';
import { editAnlegg } from '../lib/actions';
import { KOMP } from '../lib/catalog';
import { BETALER, DELER, delFor, delNavn, FAG, FASER, KLASSER, KONTO, PSTATUS, PTYPER, ferdigstill, fremdrift, nyttProsjektData, okonomi, uid } from '../lib/prosjekt';
import { lNavn } from '../lib/utils';
import { NsVelger, nsNavn } from '../components/NsVelger';
import { Sel, eiendomOpts, useFilter } from './common';
import { aapneOppgave, nyOppgave } from './ProsjektArbeid';
import { lagRapport, Rapporter, StatusChip } from './ProsjektRapport';
import { Gantt, GanttForklaring } from '../components/Gantt';
import { faseGodkjent, ganttRader, krevGodkjenning, sisteBeslutning } from '../lib/prosjektArbeid';
import { addDays } from '../lib/utils';

const go = (p: string) => { location.hash = '#/' + p; };
const kr = (v: number) => nok(Math.round(v));
const stFarge = (s: string) => ({ 'Idé': '', Planlagt: 'blue', 'Pågår': 'amber', Ferdigstilt: 'green', Avbrutt: '' } as any)[s] || '';
const faseNavn = (k: string) => FASER.find(f => f[0] === k)?.[1] || k;
const klasseNavn = (k: string) => KLASSER.find(x => x[0] === k)?.[1] || 'Annet / avklares';
const kanP = (p: Rec) => kanRedigereE(p.eiendomId);
const erLt = (t?: string) => /leietaker/i.test(t || '');
const fagValg = (p: Rec) => [...new Set([...(p.fag || []).map((f: Rec) => f.fag), ...FAG])].map(f => [f, f] as [string, string]);
const FagVelger = ({ v, set }: { v: string[]; set: (x: string[]) => void }) => <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: '2px 10px', maxHeight: 190, overflow: 'auto', border: '1px solid var(--line)', borderRadius: 8, padding: '6px 8px' }}>
  {FAG.map(f => <label key={f} className="small" style={{ display: 'flex', gap: 6, fontWeight: 400 }}><input type="checkbox" style={{ width: 'auto' }} checked={v.includes(f)} onChange={e => set(e.target.checked ? [...v, f] : v.filter(x => x !== f))} />{f}</label>)}</div>;

async function oppdater(pid: string, patch: Rec, loggTekst?: string) {
  const p = byId('prosjekter', pid)!;
  await save('prosjekter', { ...p, ...patch, logg: loggTekst ? [...(p.logg || []), { t: new Date().toISOString(), k: loggTekst, av: state.me?.navn || state.me?.epost }] : p.logg });
}

export function nyttProsjekt(preset: Rec = {}) {
  const E = S.eiendommer.filter(e => kanRedigereE(e.id));
  if (!E.length) return toast('Du må ha skrivetilgang til en eiendom for å opprette prosjekter');
  formModal({ title: 'Nytt prosjekt', saveTxt: 'Opprett prosjekt', values: { eiendomId: preset.eiendomId || E[0].id, type: 'Vedlikehold', start: today(), ...preset }, fields: [
    { k: 'navn', label: 'Prosjektnavn', req: true, ph: 'F.eks. Rehabilitering av tak' },
    { k: 'eiendomId', label: 'Eiendom', type: 'select', req: true, options: sortBy(E, e => e.navn).map(e => [e.id, e.navn] as [string, string]), half: true },
    { k: 'type', label: 'Type', type: 'select', options: PTYPER, half: true },
    { k: 'start', label: 'Planlagt start', type: 'date', half: true }, { k: 'slutt', label: 'Planlagt ferdig', type: 'date', half: true },
    { k: 'ramme', label: 'Budsjettramme (kr eks. mva)', type: 'number', half: true }, { k: 'leder', label: 'Prosjektleder', half: true, def: state.me?.navn || '' },
    { k: 'leietakerId', label: 'Leietaker', type: 'select', half: true, empty: '– ny / ikke valgt –', show: x => erLt(x.type), options: (v: any) => sortBy(S.leietakere.filter(l => l.eiendomId === v?.eiendomId), l => l.navn).map(l => [l.id, l.navn] as [string, string]) },
    { k: 'lokale', label: 'Lokale / areal', half: true, show: x => erLt(x.type), ph: 'F.eks. 2. etg øst, ca. 450 m²' },
    { k: 'fagValgt', type: 'custom', label: 'Fag som inngår (kan endres senere)', def: [], render: (v, set) => <FagVelger v={v.fagValgt || []} set={x => set({ fagValgt: x })} /> },
    { k: 'beskrivelse', label: 'Beskrivelse / mål', type: 'textarea' }],
    onSave: async x => { const ramme = +x.ramme || 0; const fv: string[] = x.fagValgt || []; delete x.ramme; delete x.fagValgt; const lt = erLt(x.type);
      const klasse = x.type === 'Vedlikehold' ? 'vedl' : lt ? 'lt' : 'pak'; const konto = x.type === 'Vedlikehold' ? '6600' : '1100';
      const id = await save('prosjekter', nyttProsjektData({ ...x, fag: fv.map(f => ({ id: uid(), fag: f, entreprenor: '', kontakt: '', epost: '', telefon: '', kontrakt: '', kontraktsum: '' })),
        budsjett: ramme ? [{ id: uid(), post: 'Budsjettramme', bygningsdel: '', fag: '', klasse, konto, belop: ramme, prognose: '', betaler: 'eier' }] : [] }));
      toast('Prosjekt opprettet'); go('prosjekt/' + id); } });
}

export function Prosjekter() {
  useStore();
  const [f, setF] = useFilter('prosjekter', { e: '', s: 'aktive', q: '' });
  let L = S.prosjekter.slice(); if (f.e) L = L.filter(p => p.eiendomId === f.e);
  if (f.s === 'aktive') L = L.filter(p => !['Ferdigstilt', 'Avbrutt'].includes(p.status)); else if (f.s) L = L.filter(p => p.status === f.s);
  if (f.q) { const q = f.q.toLowerCase(); L = L.filter(p => (p.navn + ' ' + (p.beskrivelse || '') + ' ' + eNavn(p.eiendomId)).toLowerCase().includes(q)); }
  L = sortBy(L, p => (p.slutt || '9999') + p.navn);
  const sum = L.reduce((s, p) => { const o = okonomi(p); return { b: s.b + o.tot.budsjett, pr: s.pr + o.tot.prognose, pa: s.pa + o.tot.palopt }; }, { b: 0, pr: 0, pa: 0 });
  return <>
    <div className="head"><div className="grow"><h1>Prosjekter<Hjelp id="side.prosjekter" /></h1><p className="sub">Fra små vedlikeholdsjobber til store rehabiliteringer – faser, oppgaver, økonomi og FDV.</p></div>
      {S.eiendommer.some(e => kanRedigereE(e.id)) && <button className="btn pri" onClick={() => nyttProsjekt()}>+ Nytt prosjekt</button>}</div>
    <div className="toolbar"><input placeholder="Søk …" value={f.q} onChange={e => setF({ q: e.target.value })} style={{ border: '1px solid var(--line2)', borderRadius: 8, padding: '7px 9px' }} />
      <Sel value={f.e} onChange={e => setF({ e })} opts={eiendomOpts()} empty="Alle eiendommer" />
      <Sel value={f.s} onChange={s => setF({ s })} opts={[['aktive', 'Aktive'], ...PSTATUS.map(s => [s, s] as [string, string])]} empty="Alle statuser" />
      <span className="small muted">{L.length} prosjekter · budsjett {kr(sum.b)} · prognose {kr(sum.pr)} · påløpt {kr(sum.pa)}</span></div>
    {!L.length ? <div className="card"><Empty t="Ingen prosjekter">Opprett et prosjekt, eller trykk «Opprett utskiftingsprosjekt» på et system som er modent for utskifting.</Empty></div> :
      <div className="tbl-wrap"><table><thead><tr><th>Prosjekt</th><th>Eiendom</th><th>Status / fase</th><th>Fremdrift</th><th className="num">Budsjett</th><th className="num">Prognose</th><th className="num">Påløpt</th><th>Ferdig</th></tr></thead><tbody>
        {L.map(p => { const o = okonomi(p); const fr = fremdrift(p); const sen = p.slutt && p.slutt < today() && !['Ferdigstilt', 'Avbrutt'].includes(p.status);
          return <tr key={p.id} className="click" onClick={() => go('prosjekt/' + p.id)}>
            <td><b style={{ fontWeight: 600 }}>{p.navn}</b><div className="small muted">{p.type}{p.leder ? ' · ' + p.leder : ''}</div></td><td className="small">{eNavn(p.eiendomId)}</td>
            <td><Chip c={stFarge(p.status)}>{p.status}</Chip><div className="small muted">{faseNavn(p.fase)}</div></td>
            <td style={{ minWidth: 90 }}><div className="rk-fremdrift" style={{ margin: 0 }}><div style={{ width: fr + '%' }} /></div><span className="small muted">{fr} %</span></td>
            <td className="num mono small">{kr(o.tot.budsjett)}</td><td className="num mono small" style={{ color: o.avvik > 0 ? 'var(--red)' : undefined }}>{kr(o.tot.prognose)}</td><td className="num mono small">{kr(o.tot.palopt)}</td>
            <td className="small" style={{ color: sen ? 'var(--red)' : undefined }}>{p.fullfort ? fd(p.fullfort) : p.slutt ? fd(p.slutt) : '–'}</td></tr>; })}
      </tbody></table></div>}
  </>;
}

// ---------------- prosjektside
export function ProsjektSide({ id }: { id: string }) {
  useStore();
  const p = byId('prosjekter', id); const [fane, setFane] = useState('oversikt');
  if (!p) return <div className="card"><Empty t="Fant ikke prosjektet">Det kan være slettet, eller du mangler tilgang.</Empty></div>;
  const kan = kanP(p); const ferdig = p.status === 'Ferdigstilt'; const o = okonomi(p); const fr = fremdrift(p);
  const tabs: [string, string][] = [['oversikt', 'Oversikt'], ['oppgaver', `Faser og oppgaver (${(p.oppgaver || []).filter((x: Rec) => x.status !== 'Ferdig').length})`], ['fag', `Fag og entrepriser (${(p.fag || []).length})`], ['plan', 'Fremdriftsplan'], ['okonomi', 'Økonomi'], ['rapporter', `Rapporter og godkjenning${(p.rapporter || []).filter((r: Rec) => r.status === 'Sendt').length ? ' (' + (p.rapporter || []).filter((r: Rec) => r.status === 'Sendt').length + ' venter)' : ''}`], ['fdv', 'Dokumenter og FDV'], ['system', p.gammeltSystemId ? 'Systembytte og nye systemer' : `Nye systemer (${(p.nyeSystemer || []).length})`], ['logg', 'Logg']];
  return <>
    <div className="head"><div className="grow"><p className="small" style={{ margin: 0 }}><a href="#/prosjekter">← Prosjekter</a> · {eNavn(p.eiendomId)}</p>
      <h1>{p.navn} <Chip c={stFarge(p.status)}>{p.status}</Chip></h1><p className="sub">{p.type}{p.leder ? ` · prosjektleder ${p.leder}` : ''}{p.start ? ` · ${fd(p.start)}–${p.slutt ? fd(p.slutt) : '?'}` : ''}</p></div>
      {kan && <button className="btn" onClick={() => lagRapport(id, 'status')}>Statusrapport</button>}
      {kan && !ferdig && <button className="btn" onClick={() => redigerProsjekt(id)}>Rediger</button>}
      {kan && !ferdig && p.status !== 'Avbrutt' && <button className="btn pri" onClick={() => ferdigstillDialog(id)}>Ferdigstill prosjekt</button>}</div>
    <div className="tabs">{tabs.map(([k, l]) => <a key={k} className={fane === k ? 'on' : ''} onClick={() => setFane(k)}>{l}</a>)}</div>
    {fane === 'oversikt' && <Oversikt p={p} o={o} fr={fr} kan={kan} />}
    {fane === 'oppgaver' && <Oppgaver p={p} kan={kan && !ferdig} />}
    {fane === 'fag' && <Fag p={p} kan={kan} />}
    {fane === 'okonomi' && <Okonomi p={p} kan={kan} />}
    {fane === 'plan' && <Fremdriftsplan p={p} kan={kan && !ferdig} />}
    {fane === 'rapporter' && <Rapporter p={p} kan={kan} />}
    {fane === 'fdv' && <Fdv p={p} kan={kan} />}
    {fane === 'system' && <Systembytte p={p} kan={kan} />}
    {fane === 'logg' && <div className="card"><div className="log">{(p.logg || []).slice().reverse().map((l: Rec, i: number) => <div key={i}><span className="lt">{fd(String(l.t).slice(0, 10))}</span> {l.k}{l.av ? <span className="muted"> · {l.av}</span> : null}</div>)}</div></div>}
  </>;
}

function redigerProsjekt(id: string) {
  const p = byId('prosjekter', id)!;
  formModal({ title: 'Rediger prosjekt', values: p, fields: [
    { k: 'navn', label: 'Prosjektnavn', req: true }, { k: 'type', label: 'Type', type: 'select', options: PTYPER, half: true },
    { k: 'status', label: 'Status', type: 'select', options: PSTATUS.filter(s => s !== 'Ferdigstilt'), half: true, hint: 'Bruk «Ferdigstill prosjekt» for å avslutte' },
    { k: 'fase', label: 'Gjeldende fase', type: 'select', options: FASER, half: true }, { k: 'leder', label: 'Prosjektleder', half: true },
    { k: 'start', label: 'Start', type: 'date', half: true }, { k: 'slutt', label: 'Planlagt ferdig', type: 'date', half: true },
    { k: 'leietakerId', label: 'Leietaker', type: 'select', half: true, empty: '–', show: x => erLt(x.type), options: () => sortBy(S.leietakere.filter(l => l.eiendomId === p.eiendomId), l => l.navn).map(l => [l.id, l.navn] as [string, string]) },
    { k: 'lokale', label: 'Lokale / areal', half: true, show: x => erLt(x.type) },
    { k: 'entreprenor', label: 'Hovedentreprenør / leverandør', half: true }, { k: 'kontrakt', label: 'Kontraktsform', half: true, ph: 'F.eks. NS 8405 / 8407', dl: [['NS 8405', 'Utførelsesentreprise'], ['NS 8406', 'Forenklet utførelsesentreprise'], ['NS 8407', 'Totalentreprise'], ['NS 8402', 'Rådgivning']] },
    { k: 'berorte', label: 'Berørte systemer (valgfritt)', type: 'custom', render: (v, set) => { const A = sortBy(S.anlegg.filter(a => a.eiendomId === p.eiendomId), a => aNavn(a.id)); const L: string[] = v.berorte || [];
      return <div style={{ maxHeight: 140, overflow: 'auto', border: '1px solid var(--line)', borderRadius: 8, padding: '4px 8px' }}>{A.map(a => <label key={a.id} className="small" style={{ display: 'flex', gap: 6, fontWeight: 400 }}><input type="checkbox" style={{ width: 'auto' }} checked={L.includes(a.id)} onChange={e => set({ berorte: e.target.checked ? [...L, a.id] : L.filter(x => x !== a.id) })} />{aNavn(a.id)}</label>)}</div>; } },
    { k: 'beskrivelse', label: 'Beskrivelse / mål', type: 'textarea' }],
    extraFoot: close => <button className="btn danger" onClick={async () => { if (!(await confirmBox(`Slette prosjektet «${p.navn}»? Dette kan ikke angres. Avbrutte prosjekter kan i stedet settes til status «Avbrutt».`))) return;
      const a = p.gammeltSystemId ? byId('anlegg', p.gammeltSystemId) : null; if (a && a.utskiftProsjektId === p.id && !a.arkivert) await save('anlegg', { ...a, utskiftProsjektId: undefined });
      await removeDoc('prosjekter', id); close(); go('prosjekter'); }}>Slett</button>,
    onSave: async x => { const end = x.status !== p.status ? `Status: ${p.status} → ${x.status}` : x.fase !== p.fase ? `Fase: ${faseNavn(x.fase)}` : 'Prosjektet er endret';
      if (x.status === 'Avbrutt' && p.gammeltSystemId) { const a = byId('anlegg', p.gammeltSystemId); if (a && a.utskiftProsjektId === p.id) await save('anlegg', { ...a, utskiftProsjektId: undefined }); }
      await oppdater(id, x, end); } });
}

function Kpi({ t, v, s, c }: { t: string; v: string; s?: string; c?: string }) { return <div className="card" style={{ padding: '10px 14px', flex: 1, minWidth: 150 }}><div className="small muted">{t}</div><div style={{ fontSize: 20, fontWeight: 700, color: c }}>{v}</div>{s && <div className="small muted">{s}</div>}</div>; }

async function byttFase(p: Rec, k: string) {
  const ny = FASER.findIndex(f => f[0] === k), naa = FASER.findIndex(f => f[0] === p.fase);
  if (ny > naa) { const mangler = FASER.slice(naa, ny).filter(([fk]) => krevGodkjenning(p, fk) && !faseGodkjent(p, fk));
    if (mangler.length && !(await confirmBox(`${mangler.map(f => `«${f[1]}»`).join(', ')} er ikke godkjent av eier. Lag et beslutningsnotat under fasen, eller gå videre likevel?`, 'Gå videre likevel'))) return; }
  await oppdater(p.id, { fase: k, status: p.status === 'Planlagt' && ny >= 3 ? 'Pågår' : p.status }, `Fase: ${FASER[ny][1]}`);
}

function Oversikt({ p, o, fr, kan }: { p: Rec; o: ReturnType<typeof okonomi>; fr: number; kan: boolean }) {
  const fi = FASER.findIndex(f => f[0] === p.fase); const gml = p.gammeltSystemId ? byId('anlegg', p.gammeltSystemId) : null; const ny = p.nyttSystemId ? byId('anlegg', p.nyttSystemId) : null;
  const forsinket = (p.oppgaver || []).filter((x: Rec) => x.frist && x.frist < today() && !['Ferdig', 'Ikke relevant'].includes(x.status));
  return <>
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
      <Kpi t="Budsjett" v={kr(o.tot.budsjett)} /><Kpi t="Prognose" v={kr(o.tot.prognose)} s={o.avvik ? `${o.avvik > 0 ? '+' : ''}${kr(o.avvik)} mot budsjett` : 'I tråd med budsjett'} c={o.avvik > 0 ? 'var(--red)' : undefined} />
      <Kpi t="Forpliktet / påløpt" v={kr(o.tot.palopt)} s={`forpliktet ${kr(o.tot.forpliktet)}`} /><Kpi t="Fremdrift" v={fr + ' %'} s={forsinket.length ? `${forsinket.length} oppgaver forsinket` : 'av oppgavene'} c={forsinket.length ? 'var(--amber)' : undefined} />
    </div>
    <div className="card" style={{ marginBottom: 12 }}><b>Faser</b>
      <div className="pf-faser">{FASER.map(([k, l], i) => <button key={k} disabled={!kan || p.status === 'Ferdigstilt'} className={'pf-fase' + (i < fi ? ' ferdig' : i === fi ? ' naa' : '')} onClick={() => byttFase(p, k)}>
        <span>{i + 1}</span>{l}</button>)}</div>
      <p className="small muted" style={{ margin: '8px 0 0' }}>{FASER.filter(([k]) => krevGodkjenning(p, k)).map(([k, l]) => { const b = sisteBeslutning(p, k); return <span key={k} style={{ marginRight: 14 }}>◆ {l}: {b ? <StatusChip s={b.status} /> : <span>ikke sendt</span>}</span>; })}</p>
      {ganttRader(p).some(r => r.start) && <div style={{ marginTop: 10 }}><Gantt rader={ganttRader(p).filter(r => r.nivaa === 0 || r.id.startsWith('bp:'))} onKlikk={id => { if (id.startsWith('bp:')) lagRapport(p.id, 'fase', id.slice(3)); }} bredde={760} /></div>}
    </div>
    <div className="grid g2">
      <div className="card"><b>Om prosjektet</b><p style={{ whiteSpace: 'pre-wrap' }}>{p.beskrivelse || [p.arbeid?.beskrivelse?.bakgrunn, p.arbeid?.beskrivelse?.mal].filter(Boolean).join('\n\n') || <span className="muted">Ingen beskrivelse.</span>}</p>
        <dl className="dl small">{([['Leietaker', p.leietakerId ? lNavn(p.leietakerId) : ''], ['Lokale', p.lokale], ['Fag', (p.fag || []).map((f: Rec) => f.fag).join(', ')], ['Entreprenør', p.entreprenor], ['Kontraktsform', p.kontrakt], ['Ferdigstilt', p.fullfort ? fd(p.fullfort) : ''], ['Garanti til', p.garantiTil ? fd(p.garantiTil) : '']] as [string, string][]).filter(x => x[1]).map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}</dl></div>
      <div className="card"><b>Systemer</b>
        {gml && <p className="small">{gml.arkivert ? 'Erstattet (arkivert): ' : 'Skal skiftes ut: '}<a href="#" onClick={e => { e.preventDefault(); if (!gml.arkivert) editAnlegg(gml.id); else go('arkiv'); }}>{aNavn(gml.id)}</a> {gml.tg && <TgChip t={gml.tg} />}</p>}
        {ny && <p className="small">Nytt system: <a href="#" onClick={e => { e.preventDefault(); editAnlegg(ny.id); }}>{aNavn(ny.id)}</a></p>}
        {(p.berorte || []).map((a: string) => <p key={a} className="small">Berørt: <a href="#" onClick={e => { e.preventDefault(); editAnlegg(a); }}>{aNavn(a) || 'arkivert system'}</a></p>)}
        {!gml && !(p.berorte || []).length && <p className="small muted">Ingen systemer koblet. Legg til under «Rediger».</p>}</div>
    </div>
  </>;
}

function Oppgaver({ p, kan }: { p: Rec; kan: boolean }) {
  const [fagF, setFagF] = useState('');
  const O: Rec[] = (p.oppgaver || []).filter((o: Rec) => !fagF || o.fag === fagF);
  const settO = (oid: string, patch: Rec) => oppdater(p.id, { oppgaver: (byId('prosjekter', p.id)!.oppgaver || []).map((x: Rec) => x.id === oid ? { ...x, ...patch } : x) }, patch.status === 'Ferdig' ? `Ferdig: ${O.find(x => x.id === oid)?.tittel}` : undefined);
  const settFase = (k: string, patch: Rec) => oppdater(p.id, { faser: FASER.map(([fk, fl]) => { const f = (byId('prosjekter', p.id)!.faser || []).find((x: Rec) => x.k === fk) || { k: fk, navn: fl, start: '', slutt: '' }; return fk === k ? { ...f, ...patch } : f; }) });
  const redOppg = (o?: Rec, fase?: string) => formModal({ title: o ? 'Rediger oppgave' : 'Ny oppgave', values: o || { fase: fase || p.fase, status: 'Ikke startet' }, fields: [
    { k: 'tittel', label: 'Oppgave', req: true }, { k: 'fase', label: 'Fase', type: 'select', options: FASER, half: true }, { k: 'status', label: 'Status', type: 'select', options: ['Ikke startet', 'Pågår', 'Ferdig', 'Ikke relevant'], half: true },
    { k: 'fag', label: 'Fag', type: 'select', options: fagValg(p), empty: '– ingen / felles –', half: true }, { k: 'ansvarlig', label: 'Ansvarlig', half: true },
    { k: 'frist', label: 'Frist', type: 'date', half: true }, { k: 'notat', label: 'Notat', type: 'textarea' }],
    extraFoot: close => o ? <button className="btn danger" onClick={async () => { await oppdater(p.id, { oppgaver: (byId('prosjekter', p.id)!.oppgaver || []).filter((x: Rec) => x.id !== o.id) }); close(); }}>Slett</button> : null,
    onSave: async x => { const L: Rec[] = byId('prosjekter', p.id)!.oppgaver || []; await oppdater(p.id, { oppgaver: o ? L.map(y => y.id === o.id ? { ...y, ...x } : y) : [...L, { id: uid(), ...x }] }, o ? undefined : `Ny oppgave: ${x.tittel}`); } });
  const brukteFag = [...new Set((p.oppgaver || []).map((o: Rec) => o.fag).filter(Boolean))] as string[];
  return <>{brukteFag.length > 0 && <div className="toolbar"><select value={fagF} onChange={e => setFagF(e.target.value)}><option value="">Alle fag</option>{brukteFag.map(f => <option key={f}>{f}</option>)}</select></div>}
    {FASER.map(([k, l], i) => { const f = (p.faser || []).find((x: Rec) => x.k === k) || {}; const L = O.filter(o => o.fase === k); const ferdig = L.filter(o => o.status === 'Ferdig').length;
    return <div key={k} className="card" style={{ marginBottom: 10, borderLeft: k === p.fase ? '4px solid var(--amber)' : undefined }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><b style={{ flex: 1, minWidth: 200 }}>{i + 1}. {l} <span className="small muted">{ferdig}/{L.length}</span></b>
        <input type="date" disabled={!kan} value={f.start || ''} onChange={e => settFase(k, { start: e.target.value })} title="Start" /><span>–</span><input type="date" disabled={!kan} value={f.slutt || ''} onChange={e => settFase(k, { slutt: e.target.value })} title="Slutt" />
        {kan && <button className="btn sm" onClick={() => nyOppgave(p.id, k)}>+ Oppgave</button>}</div>
      <div className="pf-gate">
        <label className="small"><input type="checkbox" style={{ width: 'auto' }} disabled={!kan} checked={krevGodkjenning(p, k)} onChange={e => oppdater(p.id, { godkjenning: { ...(p.godkjenning ?? { ide: true, plan: true, anbud: true, utf: false, over: true, garanti: false }), [k]: e.target.checked } })} /> Eier godkjenner før neste fase</label>
        {(() => { const b = sisteBeslutning(p, k); return b ? <span className="small">Beslutningsnotat: <StatusChip s={b.status} />{b.svar ? ` ${b.svar.navn} ${fd(String(b.svar.t).slice(0, 10))}` : b.sendt ? ` sendt ${fd(String(b.sendt).slice(0, 10))}` : ''}</span> : null; })()}
        {kan && (krevGodkjenning(p, k) || sisteBeslutning(p, k)) && <button className="btn sm" onClick={() => lagRapport(p.id, 'fase', k)}>{sisteBeslutning(p, k) ? 'Nytt beslutningsnotat' : 'Lag beslutningsnotat'}</button>}
      </div>
      {L.map(o => { const sen = o.frist && o.frist < today() && !['Ferdig', 'Ikke relevant'].includes(o.status);
        return <div key={o.id} className="rk-rad" style={{ opacity: o.status === 'Ikke relevant' ? .5 : 1 }}>
          <input type="checkbox" style={{ width: 'auto' }} disabled={!kan} checked={o.status === 'Ferdig'} onChange={e => settO(o.id, { status: e.target.checked ? 'Ferdig' : 'Pågår', ferdig: e.target.checked ? today() : '' })} />
          <span style={{ flex: 1, minWidth: 180, textDecoration: o.status === 'Ferdig' ? 'line-through' : undefined, cursor: 'pointer' }} onClick={() => kan ? aapneOppgave(p.id, o.id) : redOppg(o)}>{o.tittel}{o.notat && <span className="small muted"> – {o.notat}</span>}</span>
          {o.fag && <Chip>{o.fag}</Chip>}{kan && <button className="btn ghost sm" title="Åpne arbeidsflaten" onClick={() => aapneOppgave(p.id, o.id)}>Åpne ›</button>}<span className="small muted">{o.ansvarlig}</span><span className="small" style={{ color: sen ? 'var(--red)' : 'var(--muted)' }}>{o.frist ? fd(o.frist) : ''}</span>
          {o.status === 'Pågår' && <Chip c="amber">Pågår</Chip>}</div>; })}
    </div>; })}</>;
}

function Okonomi({ p, kan }: { p: Rec; kan: boolean }) {
  const o = okonomi(p);
  const redPost = (b?: Rec) => formModal({ title: b ? 'Rediger budsjettpost' : 'Ny budsjettpost', values: b || { klasse: p.type === 'Vedlikehold' ? 'vedl' : 'pak', konto: p.type === 'Vedlikehold' ? '6600' : '1100' }, fields: [
    { k: 'post', label: 'Post', req: true, ph: 'F.eks. Rive gammelt aggregat' }, { k: 'fag', label: 'Fag', type: 'select', options: fagValg(p), empty: '– felles –', half: true },
    { k: 'bygningsdel', label: 'Bygningsdel (NS 3451)', type: 'custom', render: (v, set) => <NsVelger value={v.bygningsdel} set={k => set({ bygningsdel: k })} fag={v.fag} /> },
    { k: 'del', label: 'Bygg / teknisk (avskrivning)', type: 'select', half: true, def: 'auto', options: [['auto', 'Automatisk fra bygningsdel'], ...DELER.map(d => [d[0], `${d[1]} – ${d[2]}`] as [string, string])],
      hint: 'Utledes av NS 3451: 2 = bygg, 3–6 = tekniske installasjoner, 7 = utendørs' },
    { k: 'betaler', label: 'Betales av', type: 'select', options: BETALER, half: true, def: 'eier' }, { k: 'andelLt', label: 'Leietakers andel (%)', type: 'number', half: true, show: x => x.betaler === 'delt' },
    { k: 'klasse', label: 'Regnskapsklassifisering', type: 'select', options: KLASSER, half: true }, { k: 'konto', label: 'Konto', half: true, dl: KONTO },
    { k: 'belop', label: 'Budsjett (kr eks. mva)', type: 'number', half: true }, { k: 'prognose', label: 'Prognose (tom = beregnes)', type: 'number', half: true }],
    extraFoot: close => b ? <button className="btn danger" onClick={async () => { await oppdater(p.id, { budsjett: (byId('prosjekter', p.id)!.budsjett || []).filter((x: Rec) => x.id !== b.id) }); close(); }}>Slett</button> : null,
    onSave: async x => { const L: Rec[] = byId('prosjekter', p.id)!.budsjett || []; await oppdater(p.id, { budsjett: b ? L.map(y => y.id === b.id ? { ...y, ...x } : y) : [...L, { id: uid(), ...x }] }, b ? undefined : `Budsjettpost: ${x.post}`); } });
  const redKost = (k?: Rec) => formModal({ title: k ? 'Rediger kostnad' : 'Registrer kostnad / bestilling', values: k || { dato: today(), status: 'Fakturert', post: p.budsjett?.[0]?.id || '' }, fields: [
    { k: 'dato', label: 'Dato', type: 'date', half: true }, { k: 'status', label: 'Status', type: 'select', options: ['Bestilt', 'Fakturert', 'Betalt'], half: true, hint: 'Bestilt = forpliktet, ikke påløpt ennå' },
    { k: 'leverandor', label: 'Leverandør', half: true }, { k: 'faktura', label: 'Fakturanr. / ordre', half: true, mono: true },
    { k: 'beskrivelse', label: 'Beskrivelse' }, { k: 'post', label: 'Budsjettpost', type: 'select', options: (p.budsjett || []).map((b: Rec) => [b.id, b.post + (b.fag ? ` (${b.fag})` : '')] as [string, string]), empty: '– ingen –', half: true },
    { k: 'fag', label: 'Fag (tom = som posten)', type: 'select', options: fagValg(p), empty: '– som budsjettposten –', half: true },
    { k: 'endring', label: 'Endringsordre / tillegg', type: 'checkbox', half: true },
    { k: 'klasse', label: 'Klassifisering (tom = som posten)', type: 'select', options: KLASSER, empty: '– som budsjettposten –', half: true }, { k: 'konto', label: 'Konto (tom = som posten)', half: true, dl: KONTO },
    { k: 'belop', label: 'Beløp (kr eks. mva)', type: 'number', req: true, half: true }],
    extraFoot: close => k ? <button className="btn danger" onClick={async () => { await oppdater(p.id, { kostnader: (byId('prosjekter', p.id)!.kostnader || []).filter((x: Rec) => x.id !== k.id) }); close(); }}>Slett</button> : null,
    onSave: async x => { const L: Rec[] = byId('prosjekter', p.id)!.kostnader || []; await oppdater(p.id, { kostnader: k ? L.map(y => y.id === k.id ? { ...y, ...x } : y) : [...L, { id: uid(), ...x }] }, k ? undefined : `Kostnad: ${x.leverandor || x.beskrivelse || ''} ${kr(+x.belop || 0)}`); } });
  const post = (id: string) => (p.budsjett || []).find((b: Rec) => b.id === id);
  const klasseFor = (k: Rec) => k.klasse || post(k.post)?.klasse || 'annet'; const kontoFor = (k: Rec) => k.konto || post(k.post)?.konto || '';
  const eksport = () => { const rader: (string | number)[][] = [['Dato', 'Prosjekt', 'Eiendom', 'Leverandør', 'Faktura/ordre', 'Beskrivelse', 'Budsjettpost', 'Fag', 'Bygningsdel', 'Klassifisering', 'Bygg/teknisk', 'Konto', 'Betales av', 'Leietakers andel %', 'Status', 'Beløp eks. mva']];
    for (const k of p.kostnader || []) { const b = post(k.post); rader.push([k.dato, p.navn, eNavn(p.eiendomId), k.leverandor || '', k.faktura || '', k.beskrivelse || '', b?.post || '', o.fagF(k), b?.bygningsdel ? `${b.bygningsdel} ${nsNavn(b.bygningsdel)}` : '', klasseNavn(klasseFor(k)), delNavn(b ? delFor(b) : 'felles'), kontoFor(k), BETALER.find(x => x[0] === (b?.betaler || 'eier'))?.[1] || 'Eier', b?.betaler === 'leietaker' ? 100 : b?.betaler === 'delt' ? +b.andelLt || 0 : 0, k.status, +k.belop || 0]); }
    const b = new Blob(['﻿' + toCsv(rader)], { type: 'text/csv;charset=utf-8' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = `kostnader-${p.navn}.csv`.replace(/[^\wæøåÆØÅ.\- ]/g, ''); a.click(); setTimeout(() => URL.revokeObjectURL(u), 1000); };
  return <>
    <div className="sec"><div className="toolbar"><h2 style={{ margin: 0, flex: 1 }}>Budsjett og prognose</h2>{kan && <button className="btn" onClick={() => redPost()}>+ Budsjettpost</button>}</div>
      <div className="tbl-wrap"><table><thead><tr><th>Post</th><th>Fag</th><th>Klassifisering</th><th className="num">Budsjett</th><th className="num">Forpliktet</th><th className="num">Påløpt</th><th className="num">Prognose</th><th className="num">Avvik</th></tr></thead><tbody>
        {o.poster.map(x => <tr key={x.b.id} className={kan ? 'click' : ''} onClick={() => kan && redPost(x.b)}><td>{x.b.post}{x.b.bygningsdel && <span className="small muted"> · <span className="mono">{x.b.bygningsdel}</span> {nsNavn(x.b.bygningsdel)}</span>}{x.b.betaler && x.b.betaler !== 'eier' && <div className="small" style={{ color: 'var(--blue)' }}>{x.b.betaler === 'delt' ? `Delt – leietaker ${x.b.andelLt || 0} %` : 'Betales av leietaker'}</div>}</td><td className="small">{x.b.fag || '–'}</td><td className="small">{klasseNavn(x.b.klasse)}{x.b.konto ? ` · ${x.b.konto}` : ''}<div className="muted">{delNavn(delFor(x.b))}</div></td>
          <td className="num mono">{kr(x.budsjett)}</td><td className="num mono">{kr(x.forpliktet)}</td><td className="num mono">{kr(x.palopt)}</td><td className="num mono">{kr(x.prognose)}</td><td className="num mono" style={{ color: x.prognose > x.budsjett ? 'var(--red)' : undefined }}>{kr(x.prognose - x.budsjett)}</td></tr>)}
        {o.uten.length > 0 && <tr><td className="muted">Uten budsjettpost</td><td /><td /><td className="num mono">–</td><td className="num mono">{kr(o.uten.reduce((s, x) => s + (+x.belop || 0), 0))}</td><td /><td /><td /></tr>}
        <tr style={{ fontWeight: 700 }}><td>Sum</td><td /><td /><td className="num mono">{kr(o.tot.budsjett)}</td><td className="num mono">{kr(o.tot.forpliktet)}</td><td className="num mono">{kr(o.tot.palopt)}</td><td className="num mono">{kr(o.tot.prognose)}</td><td className="num mono" style={{ color: o.avvik > 0 ? 'var(--red)' : undefined }}>{kr(o.avvik)}</td></tr>
      </tbody></table></div></div>
    <div className="sec"><div className="toolbar"><h2 style={{ margin: 0, flex: 1 }}>Kostnader og bestillinger</h2><button className="btn" onClick={eksport}>Eksporter til regnskap (CSV)</button>{kan && <button className="btn pri" onClick={() => redKost()}>+ Kostnad</button>}</div>
      {(p.kostnader || []).length ? <div className="tbl-wrap"><table><thead><tr><th>Dato</th><th>Leverandør</th><th>Beskrivelse</th><th>Post / fag</th><th>Klassifisering</th><th>Status</th><th className="num">Beløp</th></tr></thead><tbody>
        {sortBy(p.kostnader || [], (k: Rec) => k.dato).reverse().map((k: Rec) => <tr key={k.id} className={kan ? 'click' : ''} onClick={() => kan && redKost(k)}><td className="small">{fd(k.dato)}</td><td>{k.leverandor}{k.faktura && <div className="small muted mono">{k.faktura}</div>}</td>
          <td className="small">{k.beskrivelse}{k.endring && <> <Chip c="orange">Endring</Chip></>}</td><td className="small">{post(k.post)?.post || '–'}{o.fagF(k) && <div className="muted">{o.fagF(k)}</div>}</td><td className="small">{klasseNavn(klasseFor(k))}{kontoFor(k) ? ' · ' + kontoFor(k) : ''}</td>
          <td><Chip c={k.status === 'Bestilt' ? 'blue' : k.status === 'Betalt' ? 'green' : 'amber'}>{k.status}</Chip></td><td className="num mono">{kr(+k.belop || 0)}</td></tr>)}</tbody></table></div>
        : <p className="muted small">Ingen kostnader registrert. Registrer bestillinger (forpliktet) og fakturaer (påløpt).</p>}</div>
    {Object.keys(o.perFag).some(f => f) && <div className="sec"><h2>Per fag</h2><div className="tbl-wrap"><table><thead><tr><th>Fag</th><th className="num">Budsjett</th><th className="num">Forpliktet</th><th className="num">Påløpt</th><th className="num">Prognose</th></tr></thead><tbody>
      {Object.entries(o.perFag).sort((a, b) => b[1].prognose - a[1].prognose).map(([f, v]) => <tr key={f}><td>{f || <span className="muted">Felles / uten fag</span>}</td><td className="num mono">{kr(v.budsjett)}</td><td className="num mono">{kr(v.forpliktet)}</td><td className="num mono">{kr(v.palopt)}</td><td className="num mono">{kr(v.prognose)}</td></tr>)}</tbody></table></div></div>}
    {(erLt(p.type) || o.fordeling.leietaker > 0) && <div className="sec"><h2>Fordeling eier / leietaker</h2>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}><Kpi t="Eier" v={kr(o.fordeling.eier)} s="av prognosen" /><Kpi t={'Leietaker' + (p.leietakerId ? ' – ' + lNavn(p.leietakerId) : '')} v={kr(o.fordeling.leietaker)} s="grunnlag for viderefakturering" /></div>
      <p className="small muted">Fordelingen settes per budsjettpost med «Betales av» (eier, leietaker eller delt med prosentandel). Kontroller mot leieavtalen og avtalt tilpasningsbidrag.</p></div>}
    <div className="sec"><h2>Per regnskapsklassifisering – bygg og tekniske installasjoner</h2>
      {(() => { const D = DELER.filter(d => Object.values(o.matrise).some(r => r[d[0]])); const kl = Object.keys(o.matrise);
        const sumD = (d: string) => kl.reduce((s0, k) => s0 + (o.matrise[k][d]?.prognose || 0), 0);
        return <div className="tbl-wrap"><table><thead><tr><th>Klassifisering</th>{D.map(d => <th key={d[0]} className="num" title={d[2]}>{d[1]}<div className="muted" style={{ fontWeight: 400, textTransform: 'none' }}>{d[2]}</div></th>)}<th className="num">Sum</th></tr></thead><tbody>
          {kl.map(k => { const r = o.matrise[k]; const sum = Object.values(r).reduce((s0, v) => s0 + v.prognose, 0);
            return <tr key={k}><td>{klasseNavn(k)}</td>{D.map(d => <td key={d[0]} className="num mono">{r[d[0]] ? <>{kr(r[d[0]].prognose)}{r[d[0]].palopt ? <div className="small muted">påløpt {kr(r[d[0]].palopt)}</div> : null}</> : '–'}</td>)}<td className="num mono"><b>{kr(sum)}</b></td></tr>; })}
          <tr style={{ fontWeight: 700 }}><td>Sum</td>{D.map(d => <td key={d[0]} className="num mono">{kr(sumD(d[0]))}</td>)}<td className="num mono">{kr(o.tot.prognose)}</td></tr>
        </tbody></table></div>; })()}
      <p className="small muted">Beløp er prognose (påløpt under). For aktiverte kostnader (påkostning, nybygg) skal bygg og faste tekniske installasjoner føres på hver sin saldo: bygg i saldogruppe h (4 %) eller i for forretningsbygg (2 %), og tekniske installasjoner (VVS, elektro, kjøling, heis o.l.) i saldogruppe j (10 %). Fordelingen utledes av bygningsdel (NS 3451) og kan overstyres per post. Felles kostnader, som rigg og prosjektledelse, fordeles normalt forholdsmessig. Skillet mellom vedlikehold og påkostning, og grensen mot driftsmidler, avklares med regnskapsfører.</p></div>
  </>;
}

function Fremdriftsplan({ p, kan }: { p: Rec; kan: boolean }) {
  const [skala, setSkala] = useState<'auto' | 'uke' | 'mnd' | 'kvartal'>('auto'); const [kunFaser, setKunFaser] = useState(false);
  const R = ganttRader(p).filter(r => !kunFaser || r.nivaa === 0 || r.id.startsWith('bp:'));
  const uten = (p.oppgaver || []).filter((o: Rec) => !o.start && !o.frist && o.status !== 'Ikke relevant' && o.fase !== 'garanti');
  const endre = async (id: string, start: string, slutt: string) => {
    const P = byId('prosjekter', p.id)!;
    if (id.startsWith('fase:')) { const k = id.slice(5); await oppdater(p.id, { faser: FASER.map(([fk, fl]) => { const f = (P.faser || []).find((x: Rec) => x.k === fk) || { k: fk, navn: fl, start: '', slutt: '' }; return fk === k ? { ...f, start, slutt } : f; }) }); }
    else await oppdater(p.id, { oppgaver: (P.oppgaver || []).map((o: Rec) => o.id === id ? { ...o, start, frist: slutt } : o) });
  };
  const fordel = async () => {
    const P = byId('prosjekter', p.id)!; let faser = FASER.map(([fk, fl]) => (P.faser || []).find((x: Rec) => x.k === fk) || { k: fk, navn: fl, start: '', slutt: '' });
    const vekt: Record<string, number> = { ide: 1, plan: 3, anbud: 2, utf: 6, over: 1.5 };
    if (faser.slice(0, 5).some(f => !f.start || !f.slutt)) {
      if (!P.start || !P.slutt) return toast('Sett planlagt start og ferdig på prosjektet (Rediger), eller datoer på fasene først');
      const tot = (Date.parse(P.slutt) - Date.parse(P.start)) / 864e5; const sv = Object.values(vekt).reduce((a, b) => a + b, 0); let t = P.start;
      faser = faser.map(f => { if (!(f.k in vekt)) return f; const len = Math.max(1, Math.round(tot * vekt[f.k] / sv)); const s0 = t; t = addDays(t, len); return f.start && f.slutt ? f : { ...f, start: s0, slutt: addDays(s0, len - 1) }; });
    }
    let n0 = 0;
    const oppgaver = (P.oppgaver || []).map((o: Rec) => o);
    for (const f of faser) { if (!f.start || !f.slutt) continue; const L = oppgaver.filter((o: Rec) => o.fase === f.k && !o.start && !o.frist && o.status !== 'Ikke relevant'); if (!L.length) continue;
      const dager = Math.max(1, (Date.parse(f.slutt) - Date.parse(f.start)) / 864e5 + 1); const steg = dager / L.length;
      L.forEach((o: Rec, i: number) => { const s0 = addDays(f.start, Math.floor(i * steg)); const e0 = addDays(f.start, Math.max(Math.floor(i * steg), Math.floor((i + 1) * steg) - 1)); const j = oppgaver.indexOf(o); oppgaver[j] = { ...o, start: s0, frist: e0 }; n0++; }); }
    await oppdater(p.id, { faser, oppgaver }, `Fremdriftsplan: datoer fordelt på ${n0} oppgaver`); toast(n0 ? `Datoer satt på ${n0} oppgaver` : 'Fasedatoer satt');
  };
  return <>
    <div className="toolbar"><h2 style={{ margin: 0, flex: 1 }}>Fremdriftsplan</h2>
      <label className="small"><input type="checkbox" style={{ width: 'auto' }} checked={kunFaser} onChange={e => setKunFaser(e.target.checked)} /> Bare faser</label>
      <div className="seg">{([['auto', 'Tilpass'], ['uke', 'Uke'], ['mnd', 'Måned'], ['kvartal', 'Kvartal']] as const).map(([k, l]) => <button key={k} className={'btn sm' + (skala === k ? ' pri' : '')} onClick={() => setSkala(k)}>{l}</button>)}</div>
      {kan && uten.length > 0 && <button className="btn" onClick={fordel}>Fordel datoer på {uten.length} oppgaver</button>}
      <button className="btn" onClick={() => lagRapport(p.id, 'status')}>Statusrapport</button></div>
    <div className="card"><Gantt rader={R} skala={skala} onEndre={kan ? endre : undefined} onKlikk={id => { if (id.startsWith('bp:')) lagRapport(p.id, 'fase', id.slice(3)); else if (!id.startsWith('fase:')) aapneOppgave(p.id, id); }} />
      <GanttForklaring />
      <p className="small muted" style={{ marginBottom: 0 }}>{kan ? 'Dra en stolpe for å flytte den, eller dra i endene for å endre start og slutt. Klikk for å åpne oppgaven. ' : ''}Fasestolper uten egne datoer beregnes fra oppgavene (lysere). ◆ = beslutningspunkt der eier godkjenner før neste fase.</p></div>
    {uten.length > 0 && <p className="small muted">{uten.length} oppgaver mangler datoer og vises ikke{kan ? ' – bruk «Fordel datoer», eller sett start og frist i oppgaven' : ''}.</p>}
  </>;
}

function Fag({ p, kan }: { p: Rec; kan: boolean }) {
  const o = okonomi(p); const F: Rec[] = p.fag || [];
  const red = (f?: Rec) => formModal({ title: f ? f.fag : 'Legg til fag', values: f || {}, fields: [
    { k: 'fag', label: 'Fag', req: true, dl: FAG.map(x => [x, ''] as [string, string]), ph: 'F.eks. Elektro' },
    { k: 'entreprenor', label: 'Entreprenør / leverandør', half: true }, { k: 'kontrakt', label: 'Kontraktsform', half: true, dl: [['NS 8405', 'Utførelsesentreprise'], ['NS 8406', 'Forenklet utførelsesentreprise'], ['NS 8407', 'Totalentreprise'], ['NS 8402', 'Rådgivning'], ['Regning', 'Regningsarbeid']] },
    { k: 'kontakt', label: 'Kontaktperson', half: true }, { k: 'telefon', label: 'Telefon', half: true }, { k: 'epost', label: 'E-post', type: 'email', half: true },
    { k: 'kontraktsum', label: 'Kontraktssum (kr eks. mva)', type: 'number', half: true }, { k: 'notat', label: 'Omfang / grensesnitt mot andre fag', type: 'textarea' }],
    extraFoot: close => f ? <button className="btn danger" onClick={async () => { if (!(await confirmBox(`Fjerne faget «${f.fag}»? Poster, kostnader og oppgaver beholder fagnavnet.`))) return; await oppdater(p.id, { fag: (byId('prosjekter', p.id)!.fag || []).filter((x: Rec) => x.id !== f.id) }); close(); }}>Fjern</button> : null,
    onSave: async x => { const L: Rec[] = byId('prosjekter', p.id)!.fag || []; await oppdater(p.id, { fag: f ? L.map(y => y.id === f.id ? { ...y, ...x } : y) : [...L, { id: uid(), ...x }] }, f ? undefined : `Fag lagt til: ${x.fag}`); } });
  const nyePoster = async () => { const P: Rec[] = byId('prosjekter', p.id)!.budsjett || []; const mangler = F.filter(f => !P.some(b => b.fag === f.fag));
    if (!mangler.length) return toast('Alle fag har budsjettpost');
    await oppdater(p.id, { budsjett: [...P, ...mangler.map(f => ({ id: uid(), post: f.fag, fag: f.fag, bygningsdel: '', klasse: erLt(p.type) ? 'lt' : p.type === 'Vedlikehold' ? 'vedl' : 'pak', konto: p.type === 'Vedlikehold' ? '6600' : '1100', belop: +f.kontraktsum || 0, prognose: '', betaler: 'eier' }))] }, `Budsjettposter opprettet for ${mangler.length} fag`);
    toast(`Budsjettpost opprettet for ${mangler.length} fag – se Økonomi`); };
  return <div className="sec">
    <div className="toolbar"><h2 style={{ margin: 0, flex: 1 }}>Fag og entrepriser</h2>{kan && F.length > 0 && <button className="btn" onClick={nyePoster}>Lag budsjettpost per fag</button>}{kan && <button className="btn pri" onClick={() => red()}>+ Fag</button>}</div>
    {!F.length ? <div className="card"><Empty t="Ingen fag lagt til">Legg til fagene som inngår, f.eks. bygningsarbeider, elektro, rør, ventilasjon og maler. Hvert fag kan ha egen entreprenør, kontrakt, budsjett, kostnader og oppgaver.</Empty></div> :
      <div className="tbl-wrap"><table><thead><tr><th>Fag</th><th>Entreprenør</th><th>Kontrakt</th><th className="num">Kontraktssum</th><th className="num">Prognose</th><th className="num">Påløpt</th><th>Oppgaver</th></tr></thead><tbody>
        {F.map(f => { const v = o.perFag[f.fag] || { budsjett: 0, forpliktet: 0, palopt: 0, prognose: 0 }; const O = (p.oppgaver || []).filter((x: Rec) => x.fag === f.fag); const aapne = O.filter((x: Rec) => !['Ferdig', 'Ikke relevant'].includes(x.status)).length;
          return <tr key={f.id} className={kan ? 'click' : ''} onClick={() => kan && red(f)}><td><b style={{ fontWeight: 600 }}>{f.fag}</b>{f.notat && <div className="small muted">{f.notat.slice(0, 90)}</div>}</td>
            <td className="small">{f.entreprenor || <span className="muted">Ikke valgt</span>}{f.kontakt && <div className="muted">{f.kontakt}{f.telefon ? ' · ' + f.telefon : ''}</div>}</td><td className="small">{f.kontrakt || '–'}</td>
            <td className="num mono small">{f.kontraktsum ? kr(+f.kontraktsum) : '–'}</td><td className="num mono small">{kr(v.prognose)}</td><td className="num mono small">{kr(v.palopt)}</td>
            <td className="small">{O.length ? `${aapne} åpne av ${O.length}` : '–'}</td></tr>; })}</tbody></table></div>}
    <p className="small muted">Fag kobles til budsjettposter, kostnader og oppgaver. Da ser du økonomi og fremdrift per fag. «Lag budsjettpost per fag» oppretter en post for hvert fag med kontraktssummen som budsjett.</p>
  </div>;
}

function Fdv({ p, kan }: { p: Rec; kan: boolean }) {
  const D = S.dokumenter.filter(d => d.prosjektId === p.id);
  const lastOpp = async (f: File, krav?: Rec) => {
    const fil = await uploadFile(f, p.eiendomId); if (!fil) return;
    const did = await save('dokumenter', { eiendomId: p.eiendomId, leietakerId: '', prosjektId: p.id, anleggId: p.nyttSystemId || '', type: krav ? (/samsvar/i.test(krav.tittel) ? 'Samsvarserklæring el-anlegg' : /serviceavtale/i.test(krav.tittel) ? 'Serviceavtale' : 'FDV-dokumentasjon') : 'Annet', tittel: (krav?.tittel || f.name) + ' – ' + p.navn, dato: today(), fil });
    if (krav) await oppdater(p.id, { fdv: (byId('prosjekter', p.id)!.fdv || []).map((x: Rec) => x.id === krav.id ? { ...x, mottatt: true, dokId: did } : x) }, `FDV mottatt: ${krav.tittel}`);
    toast('Dokument lastet opp');
  };
  const F: Rec[] = p.fdv || [];
  return <>
    <div className="card" style={{ marginBottom: 12 }}><b>FDV og sluttdokumentasjon</b> <span className="small muted">{F.filter(x => x.mottatt).length} av {F.length} mottatt</span>
      {F.map(x => { const d = x.dokId ? byId('dokumenter', x.dokId) : null; return <div key={x.id} className="rk-rad">
        <input type="checkbox" style={{ width: 'auto' }} disabled={!kan} checked={!!x.mottatt} onChange={e => oppdater(p.id, { fdv: F.map(y => y.id === x.id ? { ...y, mottatt: e.target.checked } : y) })} />
        <span style={{ flex: 1 }}>{x.tittel}{d?.fil && <span className="small"> · <FileLink fil={d.fil} /></span>}</span>
        {kan && <label className="btn sm">Last opp<input type="file" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) lastOpp(f, x); e.target.value = ''; }} /></label>}</div>; })}
      {kan && <p style={{ marginBottom: 0 }}><button className="btn sm" onClick={() => formModal({ title: 'Nytt FDV-krav', fields: [{ k: 't', label: 'Dokument', req: true }], onSave: async v => oppdater(p.id, { fdv: [...F, { id: uid(), tittel: v.t, mottatt: false }] }) })}>+ Krav</button></p>}
      <p className="small muted">Dokumentene lagres under Dokumenter på eiendommen{p.nyttSystemId ? ' og er koblet til det nye systemet' : ''}. Ved ferdigstilling kobles de til det nye systemet.</p></div>
    <div className="card"><div style={{ display: 'flex', alignItems: 'center' }}><b style={{ flex: 1 }}>Alle dokumenter i prosjektet</b>{kan && <label className="btn sm">+ Last opp<input type="file" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) lastOpp(f); e.target.value = ''; }} /></label>}</div>
      {D.length ? D.map(d => <div key={d.id} className="small" style={{ padding: '4px 0' }}><FileLink fil={d.fil}>{d.tittel}</FileLink> <span className="muted">· {d.type} · {fd(d.dato)}</span></div>) : <p className="small muted">Ingen dokumenter ennå (tilbud, kontrakt, tegninger, møtereferater …).</p>}</div>
  </>;
}

const typeOpts = () => sortBy(Object.entries(KOMP), ([, v]) => v.g + v.n).map(([k, v]) => [k, `${v.g.split(' ')[0]} · ${v.n}`] as [string, string]);

function NyeSystemer({ p, kan }: { p: Rec; kan: boolean }) {
  const L: Rec[] = p.nyeSystemer || []; const ferdig = p.status === 'Ferdigstilt';
  const red = (x?: Rec) => formModal({ title: x ? 'Nytt system i prosjektet' : 'Legg til nytt system', values: x || { ansvar: 'Eier' }, fields: [
    { k: 'type', label: 'Type system', type: 'select', options: typeOpts(), empty: '– annet –', req: true }, { k: 'navn', label: 'Betegnelse / plassering', half: true, ph: 'F.eks. Kjøling 2. etg øst' },
    { k: 'fabrikat', label: 'Fabrikat / modell', half: true }, { k: 'tfmSys', label: 'TFM systemkode (tom = fra typen)', half: true, mono: true },
    { k: 'ansvar', label: 'Ansvar for drift', type: 'select', options: ['Eier', 'Leietaker', 'Delt'], half: true },
    { k: 'levetid', label: 'Forventet levetid (år, tom = katalog)', type: 'number', half: true }, { k: 'kost', label: 'Fremtidig utskiftingskostnad (kr)', type: 'number', half: true }, { k: 'notat', label: 'Notat', type: 'textarea' }],
    extraFoot: close => x ? <button className="btn danger" onClick={async () => { await oppdater(p.id, { nyeSystemer: (byId('prosjekter', p.id)!.nyeSystemer || []).filter((y: Rec) => y.id !== x.id) }); close(); }}>Fjern</button> : null,
    onSave: async v => { const A: Rec[] = byId('prosjekter', p.id)!.nyeSystemer || []; await oppdater(p.id, { nyeSystemer: x ? A.map(y => y.id === x.id ? { ...y, ...v } : y) : [...A, { id: uid(), ...v }] }, x ? undefined : `Nytt system planlagt: ${KOMP[v.type]?.n || v.navn || ''}`); } });
  return <div className="card" style={{ marginTop: 12 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><b style={{ flex: 1 }}>Nye systemer i prosjektet</b>{kan && !ferdig && <button className="btn sm" onClick={() => red()}>+ Nytt system</button>}</div>
    {L.length ? L.map(x => <div key={x.id} className="rk-rad" style={{ cursor: kan && !x.opprettetId ? 'pointer' : undefined }} onClick={() => kan && !x.opprettetId && red(x)}>
      <span style={{ flex: 1 }}><b>{KOMP[x.type]?.n || 'Annet system'}</b>{x.navn ? ' – ' + x.navn : ''}<span className="small muted">{x.fabrikat ? ' · ' + x.fabrikat : ''}{x.ansvar && x.ansvar !== 'Eier' ? ' · drift: ' + x.ansvar : ''}</span></span>
      {x.opprettetId ? <a className="small" href="#" onClick={e => { e.preventDefault(); e.stopPropagation(); editAnlegg(x.opprettetId); }}>Registrert: {aNavn(x.opprettetId)}</a> : <Chip>Registreres ved ferdigstilling</Chip>}</div>)
      : <p className="small muted">Ingen nye systemer. Legg til systemer som installeres i prosjektet, f.eks. kjøleanlegg, ventilasjon eller adgangskontroll.</p>}
    <p className="small muted" style={{ marginBottom: 0 }}>Ved ferdigstilling registreres systemene i TFM-registeret med neste ledige løpenummer, tilstand TG0 og kontroller fra katalogen. Prosjektets dokumenter finner du under Dokumenter og FDV.</p>
  </div>;
}

function Systembytte({ p, kan }: { p: Rec; kan: boolean }) {
  if (!p.gammeltSystemId) return <NyeSystemer p={p} kan={kan} />;
  return <><SystembytteGml p={p} kan={kan} /><NyeSystemer p={p} kan={kan} /></>;
}
function SystembytteGml({ p, kan }: { p: Rec; kan: boolean }) {
  const gml = byId('anlegg', p.gammeltSystemId); const ns = p.nyttSystem || {}; const ferdig = p.status === 'Ferdigstilt';
  const nK = gml ? (gml.arkivert ? [] : S.oppgaver.filter(o => o.anleggId === gml.id)) : []; const nAv = gml ? S.avvik.filter(a => a.anleggId === gml.id && !['Lukket', 'Utført'].includes(a.status)) : [];
  if (!gml) return <div className="card"><Empty t="Systemet finnes ikke lenger" /></div>;
  const red = () => formModal({ title: 'Det nye systemet', values: { type: gml.type, ...ns }, fields: [
    { k: 'type', label: 'Type system', type: 'select', options: typeOpts(), empty: '– annet –' },
    { k: 'navn', label: 'Betegnelse', half: true }, { k: 'fabrikat', label: 'Fabrikat / modell', half: true }, { k: 'aar', label: 'Installert år (tom = ferdigstillelsesår)', type: 'number', half: true },
    { k: 'levetid', label: 'Forventet levetid (år)', type: 'number', half: true }, { k: 'kost', label: 'Fremtidig utskiftingskostnad (kr)', type: 'number', half: true }, { k: 'notat', label: 'Notat', type: 'textarea' }],
    onSave: async x => oppdater(p.id, { nyttSystem: x }, 'Data for nytt system oppdatert') });
  return <div className="grid g2">
    <div className="card"><b>{ferdig ? 'Gammelt system (arkivert)' : 'Systemet som skiftes ut'}</b>
      <dl className="dl small"><dt>TFM</dt><dd className="mono">{aNavn(gml.id)}</dd><dt>Type</dt><dd>{KOMP[gml.type]?.n || '–'}</dd><dt>Installert</dt><dd>{gml.aar || '–'}</dd><dt>Tilstand</dt><dd>{gml.tg ? <TgChip t={gml.tg} /> : '–'}</dd>
        {!ferdig && <><dt>Kontroller</dt><dd>{nK.length} – arkiveres og opprettes på nytt for det nye systemet</dd><dt>Åpne avvik</dt><dd>{nAv.length}</dd></>}
        {gml.arkivert && <><dt>Arkivert</dt><dd>{fd(gml.arkivert.dato)}</dd></>}</dl>
      {!ferdig && <button className="btn sm" onClick={() => editAnlegg(gml.id)}>Åpne systemet</button>}</div>
    <div className="card"><b>Nytt system</b>
      <dl className="dl small"><dt>TFM</dt><dd className="mono">Samme som det gamle ({aNavn(gml.id).split(' ')[0]})</dd><dt>Type</dt><dd>{KOMP[ns.type || gml.type]?.n || '–'}</dd><dt>Betegnelse</dt><dd>{ns.navn || gml.navn || '–'}</dd>
        <dt>Fabrikat</dt><dd>{ns.fabrikat || '–'}</dd><dt>Levetid</dt><dd>{ns.levetid ? ns.levetid + ' år' : '–'}</dd><dt>Utskiftingskost</dt><dd>{ns.kost ? kr(+ns.kost) : '–'}</dd></dl>
      {p.nyttSystemId ? <button className="btn sm" onClick={() => editAnlegg(p.nyttSystemId)}>Åpne det nye systemet</button> : kan && <button className="btn sm" onClick={red}>Rediger data for nytt system</button>}
      {!ferdig && <p className="small muted">Ved ferdigstilling opprettes det nye systemet med samme TFM-merking og plassering. Det gamle systemet med komponenter og kontroller arkiveres og kan søkes fram under Arkiv. Kontrollene opprettes på nytt for det nye systemet.</p>}</div>
  </div>;
}

export function ferdigstillDialog(pid: string) {
  const p = byId('prosjekter', pid)!; const gml = p.gammeltSystemId ? byId('anlegg', p.gammeltSystemId) : null;
  const apneO = (p.oppgaver || []).filter((o: Rec) => !['Ferdig', 'Ikke relevant'].includes(o.status)).length;
  const nAv = gml ? S.avvik.filter(a => a.anleggId === gml.id && !['Lukket', 'Utført'].includes(a.status)).length : 0;
  formModal({ title: 'Ferdigstill prosjekt', saveTxt: gml ? 'Ferdigstill og bytt system' : 'Ferdigstill', values: { dato: today(), lukk: true }, fields: [
    { k: 'info', type: 'custom', render: () => <div className="note small" style={{ color: 'var(--ink)' }}>
      {apneO > 0 && <p style={{ marginTop: 0, color: 'var(--amber)' }}>⚠ {apneO} oppgaver er ikke ferdige.</p>}
      {gml ? <>Dette skjer når du ferdigstiller:<ul style={{ margin: '4px 0', paddingLeft: 18 }}>
        <li>Nytt system opprettes med samme TFM-merking ({aNavn(gml.id).split(' ')[0]}), plassering og ansvar.</li>
        <li>Det gamle systemet, komponentene og {S.oppgaver.filter(o => o.anleggId === gml.id).length} kontroller arkiveres. De finnes under <b>Arkiv</b>.</li>
        <li>Kontrollene opprettes på nytt for det nye systemet, med første frist ut fra datoen under.</li>
        <li>Prosjektets dokumenter kobles til det nye systemet. Status settes til «Ferdigstilt», og garantitiden (5 år) startes.</li></ul></> : 'Status settes til «Ferdigstilt», og garantitiden (5 år) startes.'}
      {(p.nyeSystemer || []).filter((x: Rec) => !x.opprettetId).length > 0 && <p style={{ marginBottom: 0 }}>{(p.nyeSystemer || []).filter((x: Rec) => !x.opprettetId).length} nye systemer registreres i TFM-registeret med kontroller fra katalogen.</p>}</div> },
    { k: 'dato', label: 'Ferdigstilt dato (overtakelse)', type: 'date', req: true, half: true },
    ...(gml && nAv ? [{ k: 'lukk', label: `Lukk ${nAv} åpne avvik på det gamle systemet`, type: 'checkbox', half: true } as any] : [])],
    onSave: async x => { await ferdigstill(pid, { lukkAvvik: !!x.lukk, dato: x.dato }); } });
}
