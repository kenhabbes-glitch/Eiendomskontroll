// Prosjektmodul: liste og prosjektside (oversikt, faser og oppgaver, økonomi, FDV, systembytte, logg).
import React, { useState } from 'react';
import { Hjelp } from '../components/Hjelp';
import { S, save, removeDoc, toast, useStore, kanRedigereE, uploadFile, state } from '../lib/store';
import { byId, fd, today, sortBy, eNavn, aNavn, nok, toCsv, type Rec } from '../lib/utils';
import { Chip, Empty, confirmBox, formModal, openModal, ModalFrame, FileLink, TgChip } from '../components/ui';
import { editAnlegg } from '../lib/actions';
import { KOMP } from '../lib/catalog';
import { FASER, KLASSER, KONTO, PSTATUS, PTYPER, ferdigstill, fremdrift, nyttProsjektData, okonomi, uid } from '../lib/prosjekt';
import { Sel, eiendomOpts, useFilter } from './common';

const go = (p: string) => { location.hash = '#/' + p; };
const kr = (v: number) => nok(Math.round(v));
const stFarge = (s: string) => ({ 'Idé': '', Planlagt: 'blue', 'Pågår': 'amber', Ferdigstilt: 'green', Avbrutt: '' } as any)[s] || '';
const faseNavn = (k: string) => FASER.find(f => f[0] === k)?.[1] || k;
const klasseNavn = (k: string) => KLASSER.find(x => x[0] === k)?.[1] || 'Annet / avklares';
const kanP = (p: Rec) => kanRedigereE(p.eiendomId);

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
    { k: 'beskrivelse', label: 'Beskrivelse / mål', type: 'textarea' }],
    onSave: async x => { const ramme = +x.ramme || 0; delete x.ramme;
      const id = await save('prosjekter', nyttProsjektData({ ...x, budsjett: ramme ? [{ id: uid(), post: 'Budsjettramme', bygningsdel: '', klasse: x.type === 'Vedlikehold' ? 'vedl' : 'pak', konto: x.type === 'Vedlikehold' ? '6600' : '1100', belop: ramme, prognose: '' }] : [] }));
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
  const tabs: [string, string][] = [['oversikt', 'Oversikt'], ['oppgaver', `Faser og oppgaver (${(p.oppgaver || []).filter((x: Rec) => x.status !== 'Ferdig').length})`], ['okonomi', 'Økonomi'], ['fdv', 'Dokumenter og FDV'], ...(p.gammeltSystemId ? [['system', 'Systembytte'] as [string, string]] : []), ['logg', 'Logg']];
  return <>
    <div className="head"><div className="grow"><p className="small" style={{ margin: 0 }}><a href="#/prosjekter">← Prosjekter</a> · {eNavn(p.eiendomId)}</p>
      <h1>{p.navn} <Chip c={stFarge(p.status)}>{p.status}</Chip></h1><p className="sub">{p.type}{p.leder ? ` · prosjektleder ${p.leder}` : ''}{p.start ? ` · ${fd(p.start)}–${p.slutt ? fd(p.slutt) : '?'}` : ''}</p></div>
      {kan && !ferdig && <button className="btn" onClick={() => redigerProsjekt(id)}>Rediger</button>}
      {kan && !ferdig && p.status !== 'Avbrutt' && <button className="btn pri" onClick={() => ferdigstillDialog(id)}>Ferdigstill prosjekt</button>}</div>
    <div className="tabs">{tabs.map(([k, l]) => <a key={k} className={fane === k ? 'on' : ''} onClick={() => setFane(k)}>{l}</a>)}</div>
    {fane === 'oversikt' && <Oversikt p={p} o={o} fr={fr} kan={kan} />}
    {fane === 'oppgaver' && <Oppgaver p={p} kan={kan && !ferdig} />}
    {fane === 'okonomi' && <Okonomi p={p} kan={kan} />}
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
    { k: 'entreprenor', label: 'Entreprenør / leverandør', half: true }, { k: 'kontrakt', label: 'Kontraktsform', half: true, ph: 'F.eks. NS 8405 / 8407', dl: [['NS 8405', 'Utførelsesentreprise'], ['NS 8406', 'Forenklet utførelsesentreprise'], ['NS 8407', 'Totalentreprise'], ['NS 8402', 'Rådgivning']] },
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

function Oversikt({ p, o, fr, kan }: { p: Rec; o: ReturnType<typeof okonomi>; fr: number; kan: boolean }) {
  const fi = FASER.findIndex(f => f[0] === p.fase); const gml = p.gammeltSystemId ? byId('anlegg', p.gammeltSystemId) : null; const ny = p.nyttSystemId ? byId('anlegg', p.nyttSystemId) : null;
  const F: Rec[] = (p.faser || []).filter((f: Rec) => f.start && f.slutt); const t0 = F.length ? Math.min(...F.map(f => Date.parse(f.start))) : 0, t1 = F.length ? Math.max(...F.map(f => Date.parse(f.slutt))) : 0;
  const forsinket = (p.oppgaver || []).filter((x: Rec) => x.frist && x.frist < today() && !['Ferdig', 'Ikke relevant'].includes(x.status));
  return <>
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
      <Kpi t="Budsjett" v={kr(o.tot.budsjett)} /><Kpi t="Prognose" v={kr(o.tot.prognose)} s={o.avvik ? `${o.avvik > 0 ? '+' : ''}${kr(o.avvik)} mot budsjett` : 'I tråd med budsjett'} c={o.avvik > 0 ? 'var(--red)' : undefined} />
      <Kpi t="Forpliktet / påløpt" v={kr(o.tot.palopt)} s={`forpliktet ${kr(o.tot.forpliktet)}`} /><Kpi t="Fremdrift" v={fr + ' %'} s={forsinket.length ? `${forsinket.length} oppgaver forsinket` : 'av oppgavene'} c={forsinket.length ? 'var(--amber)' : undefined} />
    </div>
    <div className="card" style={{ marginBottom: 12 }}><b>Faser</b>
      <div className="pf-faser">{FASER.map(([k, l], i) => <button key={k} disabled={!kan || p.status === 'Ferdigstilt'} className={'pf-fase' + (i < fi ? ' ferdig' : i === fi ? ' naa' : '')} onClick={() => oppdater(p.id, { fase: k, status: p.status === 'Planlagt' && i >= 3 ? 'Pågår' : p.status }, `Fase: ${l}`)}>
        <span>{i + 1}</span>{l}</button>)}</div>
      {F.length > 0 && <div style={{ marginTop: 10 }}>{(p.faser || []).filter((f: Rec) => f.start && f.slutt).map((f: Rec) => { const l = (Date.parse(f.start) - t0) / (t1 - t0 || 1) * 100, w = Math.max(2, (Date.parse(f.slutt) - Date.parse(f.start)) / (t1 - t0 || 1) * 100);
        return <div key={f.k} style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '3px 0' }}><span className="small" style={{ width: 190, flex: 'none' }}>{f.navn}</span>
          <div style={{ flex: 1, position: 'relative', height: 14, background: 'var(--surface2)', borderRadius: 4 }}><div title={`${fd(f.start)}–${fd(f.slutt)}`} style={{ position: 'absolute', left: l + '%', width: w + '%', top: 0, bottom: 0, borderRadius: 4, background: f.k === p.fase ? 'var(--amber)' : 'var(--acc)', opacity: f.k === p.fase ? 1 : .6 }} /></div>
          <span className="small muted" style={{ width: 130, flex: 'none' }}>{fd(f.start)}–{fd(f.slutt)}</span></div>; })}
        {Date.now() >= t0 && Date.now() <= t1 && <p className="small muted" style={{ margin: '2px 0 0' }}>Datoene settes per fase under «Faser og oppgaver».</p>}</div>}
    </div>
    <div className="grid g2">
      <div className="card"><b>Om prosjektet</b><p style={{ whiteSpace: 'pre-wrap' }}>{p.beskrivelse || <span className="muted">Ingen beskrivelse.</span>}</p>
        <dl className="dl small">{([['Entreprenør', p.entreprenor], ['Kontraktsform', p.kontrakt], ['Ferdigstilt', p.fullfort ? fd(p.fullfort) : ''], ['Garanti til', p.garantiTil ? fd(p.garantiTil) : '']] as [string, string][]).filter(x => x[1]).map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}</dl></div>
      <div className="card"><b>Systemer</b>
        {gml && <p className="small">{gml.arkivert ? 'Erstattet (arkivert): ' : 'Skal skiftes ut: '}<a href="#" onClick={e => { e.preventDefault(); if (!gml.arkivert) editAnlegg(gml.id); else go('arkiv'); }}>{aNavn(gml.id)}</a> {gml.tg && <TgChip t={gml.tg} />}</p>}
        {ny && <p className="small">Nytt system: <a href="#" onClick={e => { e.preventDefault(); editAnlegg(ny.id); }}>{aNavn(ny.id)}</a></p>}
        {(p.berorte || []).map((a: string) => <p key={a} className="small">Berørt: <a href="#" onClick={e => { e.preventDefault(); editAnlegg(a); }}>{aNavn(a) || 'arkivert system'}</a></p>)}
        {!gml && !(p.berorte || []).length && <p className="small muted">Ingen systemer koblet. Legg til under «Rediger».</p>}</div>
    </div>
  </>;
}

function Oppgaver({ p, kan }: { p: Rec; kan: boolean }) {
  const O: Rec[] = p.oppgaver || [];
  const settO = (oid: string, patch: Rec) => oppdater(p.id, { oppgaver: (byId('prosjekter', p.id)!.oppgaver || []).map((x: Rec) => x.id === oid ? { ...x, ...patch } : x) }, patch.status === 'Ferdig' ? `Ferdig: ${O.find(x => x.id === oid)?.tittel}` : undefined);
  const settFase = (k: string, patch: Rec) => oppdater(p.id, { faser: FASER.map(([fk, fl]) => { const f = (byId('prosjekter', p.id)!.faser || []).find((x: Rec) => x.k === fk) || { k: fk, navn: fl, start: '', slutt: '' }; return fk === k ? { ...f, ...patch } : f; }) });
  const redOppg = (o?: Rec, fase?: string) => formModal({ title: o ? 'Rediger oppgave' : 'Ny oppgave', values: o || { fase: fase || p.fase, status: 'Ikke startet' }, fields: [
    { k: 'tittel', label: 'Oppgave', req: true }, { k: 'fase', label: 'Fase', type: 'select', options: FASER, half: true }, { k: 'status', label: 'Status', type: 'select', options: ['Ikke startet', 'Pågår', 'Ferdig', 'Ikke relevant'], half: true },
    { k: 'ansvarlig', label: 'Ansvarlig', half: true }, { k: 'frist', label: 'Frist', type: 'date', half: true }, { k: 'notat', label: 'Notat', type: 'textarea' }],
    extraFoot: close => o ? <button className="btn danger" onClick={async () => { await oppdater(p.id, { oppgaver: (byId('prosjekter', p.id)!.oppgaver || []).filter((x: Rec) => x.id !== o.id) }); close(); }}>Slett</button> : null,
    onSave: async x => { const L: Rec[] = byId('prosjekter', p.id)!.oppgaver || []; await oppdater(p.id, { oppgaver: o ? L.map(y => y.id === o.id ? { ...y, ...x } : y) : [...L, { id: uid(), ...x }] }, o ? undefined : `Ny oppgave: ${x.tittel}`); } });
  return <>{FASER.map(([k, l], i) => { const f = (p.faser || []).find((x: Rec) => x.k === k) || {}; const L = O.filter(o => o.fase === k); const ferdig = L.filter(o => o.status === 'Ferdig').length;
    return <div key={k} className="card" style={{ marginBottom: 10, borderLeft: k === p.fase ? '4px solid var(--amber)' : undefined }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><b style={{ flex: 1, minWidth: 200 }}>{i + 1}. {l} <span className="small muted">{ferdig}/{L.length}</span></b>
        <input type="date" disabled={!kan} value={f.start || ''} onChange={e => settFase(k, { start: e.target.value })} title="Start" /><span>–</span><input type="date" disabled={!kan} value={f.slutt || ''} onChange={e => settFase(k, { slutt: e.target.value })} title="Slutt" />
        {kan && <button className="btn sm" onClick={() => redOppg(undefined, k)}>+ Oppgave</button>}</div>
      {L.map(o => { const sen = o.frist && o.frist < today() && !['Ferdig', 'Ikke relevant'].includes(o.status);
        return <div key={o.id} className="rk-rad" style={{ opacity: o.status === 'Ikke relevant' ? .5 : 1 }}>
          <input type="checkbox" style={{ width: 'auto' }} disabled={!kan} checked={o.status === 'Ferdig'} onChange={e => settO(o.id, { status: e.target.checked ? 'Ferdig' : 'Pågår', ferdig: e.target.checked ? today() : '' })} />
          <span style={{ flex: 1, minWidth: 180, textDecoration: o.status === 'Ferdig' ? 'line-through' : undefined, cursor: kan ? 'pointer' : undefined }} onClick={() => kan && redOppg(o)}>{o.tittel}{o.notat && <span className="small muted"> – {o.notat}</span>}</span>
          <span className="small muted">{o.ansvarlig}</span><span className="small" style={{ color: sen ? 'var(--red)' : 'var(--muted)' }}>{o.frist ? fd(o.frist) : ''}</span>
          {o.status === 'Pågår' && <Chip c="amber">Pågår</Chip>}</div>; })}
    </div>; })}</>;
}

function Okonomi({ p, kan }: { p: Rec; kan: boolean }) {
  const o = okonomi(p);
  const redPost = (b?: Rec) => formModal({ title: b ? 'Rediger budsjettpost' : 'Ny budsjettpost', values: b || { klasse: p.type === 'Vedlikehold' ? 'vedl' : 'pak', konto: p.type === 'Vedlikehold' ? '6600' : '1100' }, fields: [
    { k: 'post', label: 'Post', req: true, ph: 'F.eks. Rive gammelt aggregat' }, { k: 'bygningsdel', label: 'Bygningsdel (NS 3451)', half: true, mono: true, ph: '360' },
    { k: 'klasse', label: 'Regnskapsklassifisering', type: 'select', options: KLASSER, half: true }, { k: 'konto', label: 'Konto', half: true, dl: KONTO },
    { k: 'belop', label: 'Budsjett (kr eks. mva)', type: 'number', half: true }, { k: 'prognose', label: 'Prognose (tom = beregnes)', type: 'number', half: true }],
    extraFoot: close => b ? <button className="btn danger" onClick={async () => { await oppdater(p.id, { budsjett: (byId('prosjekter', p.id)!.budsjett || []).filter((x: Rec) => x.id !== b.id) }); close(); }}>Slett</button> : null,
    onSave: async x => { const L: Rec[] = byId('prosjekter', p.id)!.budsjett || []; await oppdater(p.id, { budsjett: b ? L.map(y => y.id === b.id ? { ...y, ...x } : y) : [...L, { id: uid(), ...x }] }, b ? undefined : `Budsjettpost: ${x.post}`); } });
  const redKost = (k?: Rec) => formModal({ title: k ? 'Rediger kostnad' : 'Registrer kostnad / bestilling', values: k || { dato: today(), status: 'Fakturert', post: p.budsjett?.[0]?.id || '' }, fields: [
    { k: 'dato', label: 'Dato', type: 'date', half: true }, { k: 'status', label: 'Status', type: 'select', options: ['Bestilt', 'Fakturert', 'Betalt'], half: true, hint: 'Bestilt = forpliktet, ikke påløpt ennå' },
    { k: 'leverandor', label: 'Leverandør', half: true }, { k: 'faktura', label: 'Fakturanr. / ordre', half: true, mono: true },
    { k: 'beskrivelse', label: 'Beskrivelse' }, { k: 'post', label: 'Budsjettpost', type: 'select', options: (p.budsjett || []).map((b: Rec) => [b.id, b.post] as [string, string]), empty: '– ingen –', half: true },
    { k: 'endring', label: 'Endringsordre / tillegg', type: 'checkbox', half: true },
    { k: 'klasse', label: 'Klassifisering (tom = som posten)', type: 'select', options: KLASSER, empty: '– som budsjettposten –', half: true }, { k: 'konto', label: 'Konto (tom = som posten)', half: true, dl: KONTO },
    { k: 'belop', label: 'Beløp (kr eks. mva)', type: 'number', req: true, half: true }],
    extraFoot: close => k ? <button className="btn danger" onClick={async () => { await oppdater(p.id, { kostnader: (byId('prosjekter', p.id)!.kostnader || []).filter((x: Rec) => x.id !== k.id) }); close(); }}>Slett</button> : null,
    onSave: async x => { const L: Rec[] = byId('prosjekter', p.id)!.kostnader || []; await oppdater(p.id, { kostnader: k ? L.map(y => y.id === k.id ? { ...y, ...x } : y) : [...L, { id: uid(), ...x }] }, k ? undefined : `Kostnad: ${x.leverandor || x.beskrivelse || ''} ${kr(+x.belop || 0)}`); } });
  const post = (id: string) => (p.budsjett || []).find((b: Rec) => b.id === id);
  const klasseFor = (k: Rec) => k.klasse || post(k.post)?.klasse || 'annet'; const kontoFor = (k: Rec) => k.konto || post(k.post)?.konto || '';
  const eksport = () => { const rader: (string | number)[][] = [['Dato', 'Prosjekt', 'Eiendom', 'Leverandør', 'Faktura/ordre', 'Beskrivelse', 'Budsjettpost', 'Bygningsdel', 'Klassifisering', 'Konto', 'Status', 'Beløp eks. mva']];
    for (const k of p.kostnader || []) rader.push([k.dato, p.navn, eNavn(p.eiendomId), k.leverandor || '', k.faktura || '', k.beskrivelse || '', post(k.post)?.post || '', post(k.post)?.bygningsdel || '', klasseNavn(klasseFor(k)), kontoFor(k), k.status, +k.belop || 0]);
    const b = new Blob(['﻿' + toCsv(rader)], { type: 'text/csv;charset=utf-8' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = `kostnader-${p.navn}.csv`.replace(/[^\wæøåÆØÅ.\- ]/g, ''); a.click(); setTimeout(() => URL.revokeObjectURL(u), 1000); };
  return <>
    <div className="sec"><div className="toolbar"><h2 style={{ margin: 0, flex: 1 }}>Budsjett og prognose</h2>{kan && <button className="btn" onClick={() => redPost()}>+ Budsjettpost</button>}</div>
      <div className="tbl-wrap"><table><thead><tr><th>Post</th><th>Klassifisering</th><th className="num">Budsjett</th><th className="num">Forpliktet</th><th className="num">Påløpt</th><th className="num">Prognose</th><th className="num">Avvik</th></tr></thead><tbody>
        {o.poster.map(x => <tr key={x.b.id} className={kan ? 'click' : ''} onClick={() => kan && redPost(x.b)}><td>{x.b.post}{x.b.bygningsdel && <span className="small muted mono"> · {x.b.bygningsdel}</span>}</td><td className="small">{klasseNavn(x.b.klasse)}{x.b.konto ? ` · ${x.b.konto}` : ''}</td>
          <td className="num mono">{kr(x.budsjett)}</td><td className="num mono">{kr(x.forpliktet)}</td><td className="num mono">{kr(x.palopt)}</td><td className="num mono">{kr(x.prognose)}</td><td className="num mono" style={{ color: x.prognose > x.budsjett ? 'var(--red)' : undefined }}>{kr(x.prognose - x.budsjett)}</td></tr>)}
        {o.uten.length > 0 && <tr><td className="muted">Uten budsjettpost</td><td /><td className="num mono">–</td><td className="num mono">{kr(o.uten.reduce((s, x) => s + (+x.belop || 0), 0))}</td><td /><td /><td /></tr>}
        <tr style={{ fontWeight: 700 }}><td>Sum</td><td /><td className="num mono">{kr(o.tot.budsjett)}</td><td className="num mono">{kr(o.tot.forpliktet)}</td><td className="num mono">{kr(o.tot.palopt)}</td><td className="num mono">{kr(o.tot.prognose)}</td><td className="num mono" style={{ color: o.avvik > 0 ? 'var(--red)' : undefined }}>{kr(o.avvik)}</td></tr>
      </tbody></table></div></div>
    <div className="sec"><div className="toolbar"><h2 style={{ margin: 0, flex: 1 }}>Kostnader og bestillinger</h2><button className="btn" onClick={eksport}>Eksporter til regnskap (CSV)</button>{kan && <button className="btn pri" onClick={() => redKost()}>+ Kostnad</button>}</div>
      {(p.kostnader || []).length ? <div className="tbl-wrap"><table><thead><tr><th>Dato</th><th>Leverandør</th><th>Beskrivelse</th><th>Post</th><th>Klassifisering</th><th>Status</th><th className="num">Beløp</th></tr></thead><tbody>
        {sortBy(p.kostnader || [], (k: Rec) => k.dato).reverse().map((k: Rec) => <tr key={k.id} className={kan ? 'click' : ''} onClick={() => kan && redKost(k)}><td className="small">{fd(k.dato)}</td><td>{k.leverandor}{k.faktura && <div className="small muted mono">{k.faktura}</div>}</td>
          <td className="small">{k.beskrivelse}{k.endring && <> <Chip c="orange">Endring</Chip></>}</td><td className="small">{post(k.post)?.post || '–'}</td><td className="small">{klasseNavn(klasseFor(k))}{kontoFor(k) ? ' · ' + kontoFor(k) : ''}</td>
          <td><Chip c={k.status === 'Bestilt' ? 'blue' : k.status === 'Betalt' ? 'green' : 'amber'}>{k.status}</Chip></td><td className="num mono">{kr(+k.belop || 0)}</td></tr>)}</tbody></table></div>
        : <p className="muted small">Ingen kostnader registrert. Registrer bestillinger (forpliktet) og fakturaer (påløpt).</p>}</div>
    <div className="sec"><h2>Per regnskapsklassifisering</h2><div className="tbl-wrap"><table><thead><tr><th>Klassifisering</th><th className="num">Budsjett</th><th className="num">Påløpt</th></tr></thead><tbody>
      {Object.entries(o.perKlasse).map(([k, v]) => <tr key={k}><td>{klasseNavn(k)}</td><td className="num mono">{kr(v.budsjett)}</td><td className="num mono">{kr(v.palopt)}</td></tr>)}</tbody></table></div>
      <p className="small muted">Skillet mellom vedlikehold (kostnadsføres) og påkostning (aktiveres) har skattemessig betydning. Kontroller klassifiseringen med regnskapsfører. Kontoene følger NS 4102 og kan endres per post.</p></div>
  </>;
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

function Systembytte({ p, kan }: { p: Rec; kan: boolean }) {
  const gml = byId('anlegg', p.gammeltSystemId); const ns = p.nyttSystem || {}; const ferdig = p.status === 'Ferdigstilt';
  const nK = gml ? (gml.arkivert ? [] : S.oppgaver.filter(o => o.anleggId === gml.id)) : []; const nAv = gml ? S.avvik.filter(a => a.anleggId === gml.id && !['Lukket', 'Utført'].includes(a.status)) : [];
  if (!gml) return <div className="card"><Empty t="Systemet finnes ikke lenger" /></div>;
  const red = () => formModal({ title: 'Det nye systemet', values: { type: gml.type, ...ns }, fields: [
    { k: 'type', label: 'Type system', type: 'select', options: sortBy(Object.entries(KOMP), ([, v]) => v.g + v.n).map(([k, v]) => [k, `${v.g.split(' ')[0]} · ${v.n}`] as [string, string]), empty: '– annet –' },
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
        <li>Prosjektets dokumenter kobles til det nye systemet. Status settes til «Ferdigstilt», og garantitiden (5 år) startes.</li></ul></> : 'Status settes til «Ferdigstilt», og garantitiden (5 år) startes.'}</div> },
    { k: 'dato', label: 'Ferdigstilt dato (overtakelse)', type: 'date', req: true, half: true },
    ...(gml && nAv ? [{ k: 'lukk', label: `Lukk ${nAv} åpne avvik på det gamle systemet`, type: 'checkbox', half: true } as any] : [])],
    onSave: async x => { await ferdigstill(pid, { lukkAvvik: !!x.lukk, dato: x.dato }); } });
}
