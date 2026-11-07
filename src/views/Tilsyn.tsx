// Tilsynssaker: avvik/pålegg fra brannvesen, Arbeidstilsynet, el-tilsyn og forsikring, gruppert per tilsyn.
// Registrer en hel tilsynsrapport på én gang, følg svarfristen, lag tilbakemeldingsbrev (PDF) og marker sendt/lukket.
import React, { useState } from 'react';
import { S, save, state, toast, uploadFile, useStore, canEdit } from '../lib/store';
import { addDays, byId, eNavn, fd, today, dUntil, sortBy, type Rec } from '../lib/utils';
import { AV_ALV, AV_FRIST, AV_LUKKET } from '../lib/catalog';
import { Chip, Empty, FileLink, ModalFrame, confirmBox, openModal, StChip, DueChip } from '../components/ui';
import { Hjelp } from '../components/Hjelp';
import { Hjelp as LovHjelp } from '../components/LovHjelp';
import { editAvvik } from '../lib/actions';
import { ArkivDoc } from '../lib/prosjektArkiv';
import { MUTED, M } from '../lib/arealRapport';
import { formModal } from '../components/ui';
import { Sel, eiendomOpts, useFilter } from './common';

import { TILSYN_KILDER, TS_TYPER, MYND } from '../lib/tilsyn';
export { TILSYN_KILDER, TS_TYPER };
export const erTilsyn = (a: Rec) => TILSYN_KILDER.includes(a.kilde) || !!a.tsType;
export const sakNokkel = (a: Rec) => `${a.eiendomId}|${a.tsRef || ''}|${a.tsDato || (a.tsRef ? '' : a.oppdaget || '')}|${a.kilde}`;

export type Sak = { key: string; eiendomId: string; kilde: string; myndighet: string; ref: string; dato: string; svarfrist: string; svarSendt: string; lukket: string; svarDokId: string; avvik: Rec[]; apne: number };
export function tilsynssaker(): Sak[] {
  const g: Record<string, Sak> = {};
  for (const a of S.avvik.filter(erTilsyn)) { const k = sakNokkel(a);
    const s = (g[k] ||= { key: k, eiendomId: a.eiendomId, kilde: a.kilde, myndighet: a.tsMyndighet || MYND[a.kilde] || a.kilde, ref: a.tsRef || '', dato: a.tsDato || a.oppdaget || '', svarfrist: '', svarSendt: '', lukket: '', svarDokId: '', avvik: [], apne: 0 });
    s.avvik.push(a); if (!AV_LUKKET.includes(a.status)) s.apne++;
    if (a.tsSvarfrist && (!s.svarfrist || a.tsSvarfrist < s.svarfrist)) s.svarfrist = a.tsSvarfrist;
    if (a.tsSvarSendt) s.svarSendt = a.tsSvarSendt; if (a.tsLukket) s.lukket = a.tsLukket; if (a.tsSvarDokId) s.svarDokId = a.tsSvarDokId; if (a.tsMyndighet) s.myndighet = a.tsMyndighet; }
  return Object.values(g).sort((x, y) => (+!!x.lukket - +!!y.lukket) || String(x.svarfrist || x.dato || '9').localeCompare(String(y.svarfrist || y.dato || '9')));
}
/** Saker der tilbakemelding til myndigheten ikke er sendt og fristen nærmer seg (til purreoversikten) */
export const svarfristSnart = (dager = 14) => tilsynssaker().filter(s => s.svarfrist && !s.svarSendt && !s.lukket && (dUntil(s.svarfrist) as number) <= dager);

async function oppdaterSak(s: Sak, patch: Rec, loggTekst: string) {
  for (const a of s.avvik) { const f = byId('avvik', a.id)!; await save('avvik', { ...f, ...patch, logg: [...(f.logg || []), { t: new Date().toISOString(), s: f.status, k: loggTekst, av: state.me?.navn }] }); }
}

// ---------------- Side
export function TilsynView() {
  useStore(); const [f, setF] = useFilter('tilsyn', { e: '', vis: 'apne' });
  let L = tilsynssaker(); if (f.e) L = L.filter(s => s.eiendomId === f.e); if (f.vis === 'apne') L = L.filter(s => !s.lukket);
  const ed = canEdit();
  return <>
    <div className="head"><div className="grow"><h1>Tilsynssaker<Hjelp tittel="Tilsynssaker" tekst={'Avvik og pålegg fra brannvesen, Arbeidstilsynet, el-tilsyn og forsikring samles per tilsyn. Registrer hele tilsynsrapporten på én gang, legg inn tiltak per avvik, lag tilbakemeldingsbrev til myndigheten før svarfristen, og marker saken som lukket når myndigheten har bekreftet.\n\nEt pålegg er et vedtak med frist. Klarer dere ikke fristen, må dere skriftlig be om utsettelse før den går ut.'} /></h1>
      <p className="sub">{L.filter(s => !s.lukket).length} åpne saker · {L.filter(s => s.svarfrist && !s.svarSendt && !s.lukket && (dUntil(s.svarfrist) as number) < 0).length} med passert svarfrist</p></div>
      {ed && <button className="btn pri" onClick={() => registrerTilsyn()}>+ Registrer tilsyn</button>}</div>
    <div className="toolbar"><Sel value={f.e} onChange={e => setF({ e })} opts={eiendomOpts()} empty="Alle eiendommer" /><Sel value={f.vis} onChange={vis => setF({ vis })} opts={[['apne', 'Åpne saker'], ['alle', 'Alle saker']]} /></div>
    {!L.length ? <div className="card"><Empty t="Ingen tilsynssaker">Registrer en tilsynsrapport med «+ Registrer tilsyn», eller sett kilde til brannvesen, Arbeidstilsynet, el-tilsyn eller forsikring på et avvik.</Empty></div>
      : L.map(s => <SakKort key={s.key} s={s} ed={ed} />)}
  </>;
}

function SakKort({ s, ed }: { s: Sak; ed: boolean }) {
  const dg = s.svarfrist ? dUntil(s.svarfrist) as number : null; const dok = s.svarDokId ? byId('dokumenter', s.svarDokId) : null;
  const tr = s.avvik[0]?.tsRapportDokId ? byId('dokumenter', s.avvik[0].tsRapportDokId) : null;
  return <div className="card" style={{ marginBottom: 12, borderLeft: `4px solid ${s.lukket ? 'var(--green)' : dg != null && dg < 0 && !s.svarSendt ? 'var(--red)' : 'var(--amber)'}` }}>
    <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
      <b style={{ flex: 1, fontSize: 15 }}>{s.myndighet}{s.ref ? ` · ${s.ref}` : ''} <span className="muted" style={{ fontWeight: 400 }}>· {eNavn(s.eiendomId)} · tilsyn {fd(s.dato)}</span></b>
      {s.lukket ? <Chip c="green">Lukket av myndigheten {fd(s.lukket)}</Chip> : s.svarSendt ? <Chip c="blue">Tilbakemelding sendt {fd(s.svarSendt)}</Chip> : s.svarfrist ? <span className="small">Svarfrist <DueChip s={s.svarfrist} /></span> : <span className="small muted">Ingen svarfrist registrert</span>}</div>
    {tr?.fil && <div className="small" style={{ marginTop: 4 }}>Tilsynsrapport: <FileLink fil={tr.fil}>{tr.tittel}</FileLink></div>}
    <div className="tbl-wrap" style={{ marginTop: 8 }}><table><thead><tr><th className="num">Nr</th><th>Type</th><th>Avvik</th><th>Tiltak</th><th>Status</th><th>Frist</th></tr></thead><tbody>
      {sortBy(s.avvik, a => (TS_TYPER.indexOf(a.tsType) + 9) + String(a.nr).padStart(6, '0')).map(a => <tr key={a.id} className="click" onClick={() => editAvvik(a.id)}>
        <td className="num muted">{a.nr}</td><td>{a.tsType ? <Chip c={a.tsType === 'Pålegg' ? 'red' : a.tsType === 'Avvik' ? 'orange' : ''}>{a.tsType}</Chip> : '–'}</td>
        <td><b style={{ fontWeight: 500 }}>{a.tittel}</b>{a.tsPunkt && <div className="small muted">Punkt {a.tsPunkt}</div>}</td>
        <td className="small">{a.tsTiltak || <span className="muted">Ikke beskrevet</span>}</td><td><StChip s={a.status} /></td>
        <td>{AV_LUKKET.includes(a.status) ? <span className="small muted">{a.lukket ? fd(a.lukket) : '–'}</span> : <DueChip s={a.frist} />}</td></tr>)}</tbody></table></div>
    {ed && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4, alignItems: 'center' }}>
      <button className="btn sm pri" onClick={() => tilbakemelding(s)}>{dok ? 'Ny tilbakemelding (PDF)' : 'Lag tilbakemelding (PDF)'}</button>
      {dok?.fil && <span className="small">Siste: <FileLink fil={dok.fil}>{dok.tittel}</FileLink></span>}
      {!s.svarSendt && <button className="btn sm" onClick={() => formModal({ title: 'Tilbakemelding sendt', values: { d: today() }, fields: [{ k: 'd', label: `Dato tilbakemeldingen ble sendt til ${s.myndighet}`, type: 'date', req: true }], saveTxt: 'Marker sendt', onSave: async x => { await oppdaterSak(s, { tsSvarSendt: x.d }, `Tilbakemelding til ${s.myndighet} sendt ${fd(x.d)}`); toast('Markert som sendt'); } })}>Marker tilbakemelding sendt</button>}
      {!s.lukket && <button className="btn sm" onClick={async () => { if (!(await confirmBox(`Har ${s.myndighet} bekreftet at saken er lukket? Åpne avvik i saken settes også til «Lukket».`, 'Lukk saken'))) return;
        for (const a of s.avvik) { const f = byId('avvik', a.id)!; await save('avvik', { ...f, tsLukket: today(), ...(AV_LUKKET.includes(f.status) ? {} : { status: 'Lukket', lukket: today() }), logg: [...(f.logg || []), { t: new Date().toISOString(), s: 'Lukket', k: `Tilsynssaken er lukket av ${s.myndighet}`, av: state.me?.navn }] }); }
        toast('Saken er lukket'); }}>Myndigheten har lukket saken</button>}
      <button className="btn sm ghost" onClick={() => registrerTilsyn(s)}>+ Legg til avvik i saken</button></div>}
  </div>;
}

// ---------------- Registrer tilsyn (flere avvik på én gang)
type Rad = { id: string; type: string; punkt: string; t: string; alv: string; frist: string; tiltak: string };
export function registrerTilsyn(sak?: Sak) { openModal({ wide: true, render: close => <RegistrerTilsyn close={close} sak={sak} /> }); }
function RegistrerTilsyn({ close, sak }: { close: () => void; sak?: Sak }) {
  useStore(); const ny = (): Rad => ({ id: Math.random().toString(36).slice(2), type: 'Avvik', punkt: '', t: '', alv: 'Høy', frist: '', tiltak: '' });
  const [h, setH0] = useState<Rec>(() => sak ? { eiendomId: sak.eiendomId, kilde: sak.kilde, myndighet: sak.myndighet, ref: sak.ref, dato: sak.dato, svarfrist: sak.svarfrist } : { eiendomId: S.eiendommer[0]?.id || '', kilde: 'Brannvesen/tilsyn', myndighet: MYND['Brannvesen/tilsyn'], ref: '', dato: today(), svarfrist: '' });
  const setH = (x: Rec) => setH0(v => ({ ...v, ...x }));
  const [R, setR] = useState<Rad[]>([ny()]); const [fil, setFil] = useState<File | null>(null); const [busy, setBusy] = useState(false);
  const setRad = (i: number, x: Partial<Rad>) => setR(L => L.map((r, j) => j === i ? { ...r, ...x } : r));
  const lagre = async () => {
    const rader = R.filter(r => r.t.trim()); if (!h.eiendomId) return toast('Velg eiendom'); if (!rader.length) return toast('Skriv inn minst ett avvik');
    setBusy(true);
    try {
      let rapportId = sak?.avvik[0]?.tsRapportDokId || '';
      if (fil) { const f = await uploadFile(fil, h.eiendomId); if (f) rapportId = await save('dokumenter', { eiendomId: h.eiendomId, leietakerId: '', type: 'Tilsynsrapport', tittel: `Tilsynsrapport ${h.myndighet}${h.ref ? ' ' + h.ref : ''} – ${fd(h.dato)}`, dato: h.dato, fil: f }); }
      for (const r of rader) await save('avvik', { tittel: r.t.trim(), eiendomId: h.eiendomId, anleggId: '', komponentId: '', alv: r.alv, status: 'Ny', kilde: h.kilde, meldtAv: [h.myndighet, h.ref].filter(Boolean).join(' '), ansvar: 'Eier',
        oppdaget: h.dato, frist: r.frist || addDays(h.dato, (AV_FRIST as any)[r.alv] || 30), tsType: r.type, tsPunkt: r.punkt, tsTiltak: r.tiltak, tsRef: h.ref, tsDato: h.dato, tsMyndighet: h.myndighet, tsSvarfrist: h.svarfrist, tsRapportDokId: rapportId, dokId: rapportId,
        logg: [{ t: new Date().toISOString(), s: 'Ny', k: `Registrert fra tilsyn: ${h.myndighet}${h.ref ? ' ' + h.ref : ''} ${fd(h.dato)}`, av: state.me?.navn }] });
      toast(`${rader.length} avvik registrert`); close(); location.hash = '#/tilsyn';
    } finally { setBusy(false); }
  };
  return <ModalFrame title={sak ? 'Legg til avvik i tilsynssaken' : 'Registrer tilsyn'} close={close}
    foot={<><button className="btn" onClick={close}>Avbryt</button><button className="btn pri" disabled={busy} onClick={lagre}>{busy ? 'Lagrer …' : `Registrer ${R.filter(r => r.t.trim()).length || ''} avvik`}</button></>}>
    <div className="pa-grid">
      <label className="pa-felt half"><span>Eiendom</span><select value={h.eiendomId} disabled={!!sak} onChange={e => setH({ eiendomId: e.target.value })}>{eiendomOpts().map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <label className="pa-felt half"><span>Type tilsyn</span><select value={h.kilde} disabled={!!sak} onChange={e => setH({ kilde: e.target.value, myndighet: MYND[e.target.value] })}>{TILSYN_KILDER.map(k => <option key={k}>{k}</option>)}</select></label>
      <label className="pa-felt half"><span>Myndighet / avdeling</span><input value={h.myndighet} onChange={e => setH({ myndighet: e.target.value })} /></label>
      <label className="pa-felt half"><span>Saksnummer / referanse</span><input value={h.ref} disabled={!!sak} onChange={e => setH({ ref: e.target.value })} placeholder="F.eks. 2026/1234" /></label>
      <label className="pa-felt half"><span>Tilsynsdato</span><input type="date" value={h.dato} disabled={!!sak} onChange={e => setH({ dato: e.target.value })} /></label>
      <label className="pa-felt half"><span>Frist for tilbakemelding til myndigheten</span><input type="date" value={h.svarfrist} onChange={e => setH({ svarfrist: e.target.value })} /></label>
      {!sak?.avvik[0]?.tsRapportDokId && <label className="pa-felt"><span>Tilsynsrapporten (PDF) – valgfritt</span><input type="file" accept=".pdf,image/*" onChange={e => setFil(e.target.files?.[0] || null)} /></label>}
    </div>
    <b className="small">Avvik og pålegg i rapporten</b>
    <div className="tbl-wrap"><table className="pa-tbl"><thead><tr><th style={{ width: 120 }}>Type</th><th style={{ width: 60 }}>Punkt</th><th>Beskrivelse</th><th style={{ width: 96 }}>Alvorlighet</th><th style={{ width: 130 }}>Frist</th><th>Planlagt tiltak</th><th /></tr></thead><tbody>
      {R.map((r, i) => <tr key={r.id}>
        <td><select value={r.type} onChange={e => setRad(i, { type: e.target.value, alv: e.target.value === 'Pålegg' ? 'Høy' : r.alv })}>{TS_TYPER.map(t => <option key={t}>{t}</option>)}</select></td>
        <td><input value={r.punkt} onChange={e => setRad(i, { punkt: e.target.value })} placeholder="1" /></td>
        <td><textarea rows={2} value={r.t} onChange={e => setRad(i, { t: e.target.value })} placeholder="Slik det står i rapporten" /></td>
        <td><select value={r.alv} onChange={e => setRad(i, { alv: e.target.value })}>{AV_ALV.map(t => <option key={t}>{t}</option>)}</select></td>
        <td><input type="date" value={r.frist} onChange={e => setRad(i, { frist: e.target.value })} /></td>
        <td><textarea rows={2} value={r.tiltak} onChange={e => setRad(i, { tiltak: e.target.value })} /></td>
        <td><button type="button" className="btn ghost sm" onClick={() => setR(L => L.filter((_, j) => j !== i))}>✕</button></td></tr>)}</tbody></table></div>
    <button type="button" className="btn sm" onClick={() => setR(L => [...L, ny()])}>+ Legg til avvik</button>
    <p className="small muted">Frist tom = foreslått ut fra alvorlighet. Fristen myndigheten har satt for et pålegg skal føres inn. Planlagt tiltak tas med i tilbakemeldingen og kan endres senere i avviket.</p>
  </ModalFrame>;
}

// ---------------- Tilbakemelding (PDF)
function tilbakemelding(s: Sak) { openModal({ wide: true, render: close => <Tilbakemelding s={s} close={close} /> }); }
function Tilbakemelding({ s, close }: { s: Sak; close: () => void }) {
  const e = byId('eiendommer', s.eiendomId);
  const [v, setV0] = useState<Rec>(() => ({ avsender: e?.eierNavn || '', kontakt: [state.me?.navn, state.me?.epost].filter(Boolean).join(', '), mottaker: s.myndighet,
    innledning: `Vi viser til ${s.kilde === 'Forsikring' ? 'besiktigelse' : 'tilsyn'} ${fd(s.dato)}${s.ref ? ` (deres ref. ${s.ref})` : ''} ved ${eNavn(s.eiendomId)}${e?.adresse ? ', ' + e.adresse : ''}. Nedenfor følger status og tiltak for forholdene som ble påpekt.`,
    avslutning: 'Vi ber om at saken avsluttes for de forholdene som er utbedret. Ta gjerne kontakt dersom dere har spørsmål eller trenger ytterligere dokumentasjon.', med: Object.fromEntries(s.avvik.map(a => [a.id, true])) }));
  const setV = (x: Rec) => setV0(p => ({ ...p, ...x })); const [busy, setBusy] = useState(false);
  const statusTekst = (a: Rec) => AV_LUKKET.includes(a.status) || a.status === 'Utført – til kontroll' ? `Utbedret${a.utfort?.t ? ' ' + fd(String(a.utfort.t).slice(0, 10)) : a.lukket ? ' ' + fd(a.lukket) : ''}` : a.status === 'Utsatt' ? `Utsatt til ${fd(a.planlagt)}` : `Planlagt utbedret innen ${fd(a.planlagt || a.frist)}`;
  const lag = async () => {
    const A = s.avvik.filter(a => v.med[a.id]); if (!A.length) return toast('Velg minst ett avvik');
    setBusy(true);
    try {
      const d = await ArkivDoc.lag('Tilbakemelding på tilsyn');
      d.t(v.avsender || eNavn(s.eiendomId), M, d.y - 8, 9, MUTED, true); d.y -= 14;
      d.kv([['Til', v.mottaker], ['Deres referanse', s.ref], ['Dato', fd(today())], ['Eiendom', [eNavn(s.eiendomId), e?.adresse].filter(Boolean).join(', ')], ['Tilsynsdato', fd(s.dato)]]);
      d.h1('Tilbakemelding på tilsyn'); d.tekst(v.innledning);
      d.tab([['Pkt', 0.6], ['Type', 1.1], ['Forhold', 3.2], ['Tiltak', 3.2], ['Status', 1.7]], A.map(a => ({ c: [a.tsPunkt || String(a.nr), a.tsType || '', a.tittel, a.tsTiltak || a.beskrivelse || '', statusTekst(a)] })));
      const vedl = A.flatMap(a => (a.vedlegg || []).map((f: Rec) => `${a.tsPunkt ? 'Pkt ' + a.tsPunkt : '#' + a.nr}: ${f.navn || f.path?.split('/').pop()}`));
      if (vedl.length) { d.h2('Dokumentasjon'); d.tekst(vedl.join('\n') + '\n\nBilder og dokumentasjon kan ettersendes på forespørsel.', 8.5); }
      d.tekst(v.avslutning); d.y -= 10; d.tekst(`Med vennlig hilsen\n${v.kontakt}${v.avsender ? '\n' + v.avsender : ''}`);
      const bytes = await d.pdf.save(); const navn = `Tilbakemelding ${s.myndighet}${s.ref ? ' ' + s.ref : ''} – ${eNavn(s.eiendomId)}.pdf`.replace(/[\/\\]/g, '-');
      const fil = await uploadFile(new Blob([bytes as any], { type: 'application/pdf' }) as any, s.eiendomId, undefined, navn, 'tilsyn'); if (!fil) throw new Error('Opplasting feilet');
      const did = await save('dokumenter', { eiendomId: s.eiendomId, leietakerId: '', type: 'Tilsynsrapport', tittel: `Tilbakemelding til ${s.myndighet}${s.ref ? ' ' + s.ref : ''} – ${fd(today())}`, dato: today(), fil, anleggIds: [...new Set(A.map(a => a.anleggId).filter(Boolean))] });
      await oppdaterSak({ ...s, avvik: A }, { tsSvarDokId: did }, `Tilbakemelding til ${s.myndighet} laget (PDF)`);
      toast('Tilbakemeldingen er lagret under Dokumenter'); close();
      const { data } = await (await import('../lib/store')).sb.storage.from('filer').createSignedUrl(fil.path, 600); if (data?.signedUrl) window.open(data.signedUrl, '_blank');
    } catch (err: any) { toast(err?.message || String(err)); } finally { setBusy(false); }
  };
  return <ModalFrame title="Tilbakemelding til myndigheten" close={close} foot={<><button className="btn" onClick={close}>Avbryt</button><button className="btn pri" disabled={busy} onClick={lag}>{busy ? 'Lager …' : 'Lag PDF'}</button></>}>
    <div className="pa-grid">
      <label className="pa-felt half"><span>Avsender (eier)</span><input value={v.avsender} onChange={x => setV({ avsender: x.target.value })} /></label>
      <label className="pa-felt half"><span>Mottaker</span><input value={v.mottaker} onChange={x => setV({ mottaker: x.target.value })} /></label>
      <label className="pa-felt"><span>Innledning</span><textarea rows={3} value={v.innledning} onChange={x => setV({ innledning: x.target.value })} /></label>
    </div>
    <b className="small">Forhold som tas med</b>
    {s.avvik.map(a => <label key={a.id} className="rk-rad" style={{ cursor: 'pointer' }}><input type="checkbox" style={{ width: 'auto' }} checked={!!v.med[a.id]} onChange={x => setV({ med: { ...v.med, [a.id]: x.target.checked } })} />
      <span style={{ flex: 1 }}><b style={{ fontWeight: 500 }}>{a.tsPunkt ? `Pkt ${a.tsPunkt}: ` : ''}{a.tittel}</b><div className="small muted">{a.tsTiltak ? 'Tiltak: ' + a.tsTiltak : 'Tiltak ikke beskrevet – legg det inn i avviket'} · {statusTekst(a)}</div></span></label>)}
    <div className="pa-grid" style={{ marginTop: 8 }}>
      <label className="pa-felt"><span>Avslutning</span><textarea rows={2} value={v.avslutning} onChange={x => setV({ avslutning: x.target.value })} /></label>
      <label className="pa-felt"><span>Kontaktperson (signatur)</span><input value={v.kontakt} onChange={x => setV({ kontakt: x.target.value })} /></label>
    </div>
    <p className="small muted">PDF-en lagres under Dokumenter og kobles til avvikene. Send den til myndigheten på vanlig måte (e-post eller deres skjema), og trykk deretter «Marker tilbakemelding sendt».</p>
  </ModalFrame>;
}
export { LovHjelp };
