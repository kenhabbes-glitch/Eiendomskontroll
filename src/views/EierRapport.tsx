// Statusrapport til eier – visning, utskrift/PDF og lagring under Dokumenter
import React, { useMemo, useRef, useState } from 'react';
import { S, canEdit, kanDrifteE, save, state, toast, uploadFile, useStore } from '../lib/store';
import { openModal } from '../components/ui';
import { fd, sortBy, today } from '../lib/utils';
import { eierStatus, LYS_TEKST, type EierStatus, type Lys } from '../lib/eierRapport';
import { RAP_CSS, skrivUt } from './ProsjektRapport';

const FARGE: Record<Lys, string> = { green: '#2f7d4f', amber: '#b7791f', red: '#b42318', grey: '#9aa39d' };
const Dot = ({ l }: { l: Lys }) => <span className="dot" style={{ background: FARGE[l] }} />;
const St = ({ l, t }: { l: Lys; t?: string }) => <span style={{ whiteSpace: 'nowrap' }}><Dot l={l} />{t || LYS_TEKST[l]}</span>;
const EXTRA_CSS = `.rap .lys{display:flex;align-items:center;gap:10px;border:2px solid;border-radius:8px;padding:10px 14px;margin:10px 0}.rap .lys b{font-size:13pt}
.rap .omr{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:8px 0}.rap .omr>div{border:1px solid #e3e6e1;border-left:5px solid;border-radius:6px;padding:6px 10px;break-inside:avoid}.rap .omr b{display:block}
.rap .omr span{color:#6b736d;font-size:9pt}.rap .tiltak li{margin:3px 0}.rap .p1{color:#b42318;font-weight:600}.rap .hj{color:#6b736d;font-size:8.5pt}.rap .sk{page-break-before:always}
@media print{.rap .omr{grid-template-columns:repeat(3,1fr)}}`;

type Valg = { kontroller: boolean; dok: boolean; avvik: boolean; tilsyn: boolean; leietakere: boolean; kommende: boolean; tiltak: boolean; kun: boolean };
const STD: Valg = { kontroller: true, dok: true, avvik: true, tilsyn: true, leietakere: true, kommende: true, tiltak: true, kun: false };

function EnEiendom({ s, v, kommentar, ny }: { s: EierStatus; v: Valg; kommentar: string; ny?: boolean }) {
  const e = s.e; const K = v.kun ? s.kontroller.filter(k => k.lys !== 'green') : s.kontroller;
  return <div className={ny ? 'sk' : ''}>
    <div className="meta">{[e.adresse, e.poststed].filter(Boolean).join(', ')}{e.gnrbnr ? ' · gnr/bnr ' + e.gnrbnr : ''}{e.bta ? ` · BTA ${e.bta} m²` : ''}{e.kategori ? ' · ' + e.kategori : ''}</div>
    <h1>{e.navn}</h1>
    <div className="lys" style={{ borderColor: FARGE[s.lys] }}><Dot l={s.lys} /><div><b>Samlet status: {LYS_TEKST[s.lys]}</b><div className="muted">{s.tiltak.filter(t => t.pri === 1).length} tiltak med høy prioritet · status per {fd(s.dato)}</div></div></div>
    <div className="omr">{s.omrader.map(o => <div key={o.navn} style={{ borderLeftColor: FARGE[o.lys] }}><b>{o.navn}</b><St l={o.lys} /><br /><span>{o.tekst}</span></div>)}</div>
    {kommentar.trim() && <><h2>Kommentar fra forvalter</h2><p className="pre">{kommentar}</p></>}
    {v.tiltak && s.tiltak.length > 0 && <><h2>Prioriterte tiltak</h2><ol className="tiltak">{s.tiltak.map((t, i) => <li key={i} className={t.pri === 1 ? 'p1' : ''}>{t.tekst} <span className="muted">({t.omr}{t.pri === 1 ? ', høy prioritet' : t.pri === 2 ? ', middels' : ''})</span></li>)}</ol></>}
    {v.kontroller && <><h2>Eiers lovpålagte kontroller</h2>
      {K.length ? <table><thead><tr><th>Kontroll</th><th>System</th><th>Intervall</th><th>Sist utført</th><th>Neste frist</th><th>Status</th></tr></thead><tbody>
        {K.map((k, i) => <tr key={i}><td>{k.navn}{k.hjemmel && <div className="hj">{k.hjemmel}</div>}</td><td>{k.system}</td><td>{k.intervall}</td><td>{fd(k.sist)}</td><td>{fd(k.frist)}</td><td><St l={k.lys} t={k.status} /></td></tr>)}</tbody></table>
        : <p className="muted">{v.kun ? 'Alle lovpålagte kontroller er i rute.' : 'Ingen lovpålagte kontroller registrert.'}</p>}
      <p className="hj">Omfatter kontroller av typen lovpålagt og forsikringskrav der eier har ansvaret. «Ikke i kontrollplanen» betyr at appen forventer kontrollen ut fra eiendommen og registrerte systemer, men at den ikke er lagt inn.</p></>}
    {v.dok && <><h2>Dokumenter eier skal ha</h2><table><thead><tr><th>Dokument</th><th>Krav</th><th>Dato</th><th>Gyldig til</th><th>Status</th></tr></thead><tbody>
      {(v.kun ? s.dok.filter(d => d.lys !== 'green' && d.lys !== 'grey') : s.dok).map(d => <tr key={d.type}><td>{d.type}{d.tittel && d.tittel !== d.type && <div className="hj">{d.tittel}</div>}<div className="hj">{d.h}</div></td><td>{d.krav}</td><td>{fd(d.dato)}</td><td>{fd(d.gyldigTil)}</td><td><St l={d.lys} t={d.status} /></td></tr>)}</tbody></table></>}
    {v.avvik && <><h2>Åpne avvik</h2>{s.avvik.apne ? <><p>{s.avvik.apne} åpne avvik, hvorav {s.avvik.krit} kritiske/høye og {s.avvik.over} over utbedringsfristen.</p>
      <table><thead><tr><th>Nr</th><th>Avvik</th><th>Alvorlighet</th><th>Status</th><th>Frist</th></tr></thead><tbody>
        {s.avvik.liste.filter(a => !v.kun || a.alv === 'Kritisk' || a.alv === 'Høy' || (a.frist && a.frist < today())).slice(0, 40).map(a => <tr key={a.id}><td>{a.nr ? '#' + a.nr : ''}</td><td>{a.tittel}</td><td>{a.alv}</td><td>{a.status}</td><td style={{ color: a.frist && a.frist < today() ? FARGE.red : undefined }}>{fd(a.frist)}</td></tr>)}</tbody></table>
      {s.avvik.liste.length > 40 && <p className="hj">Viser 40 av {s.avvik.liste.length}.</p>}</> : <p className="muted">Ingen åpne avvik.</p>}</>}
    {v.tilsyn && s.tilsyn.length > 0 && <><h2>Tilsynssaker fra myndighetene</h2><table><thead><tr><th>Myndighet</th><th>Referanse</th><th>Åpne punkter</th><th>Svarfrist</th><th>Status</th></tr></thead><tbody>
      {s.tilsyn.map((t, i) => <tr key={i}><td>{t.navn}</td><td>{t.ref}</td><td>{t.apne}</td><td>{fd(t.svarfrist)}</td><td><St l={t.lys} t={t.status} /></td></tr>)}</tbody></table></>}
    {v.leietakere && <><h2>Brannvern og leietakernes internkontroll</h2>
      <p><St l={s.brannvern.lys} t={s.brannvern.tekst} /></p>
      {s.leietakere.length ? <table><thead><tr><th>Leietaker</th><th>Internkontroll og plikter</th><th>Brannverninformasjon</th><th>Brannansvarlig</th><th>Avtale til</th></tr></thead><tbody>
        {s.leietakere.map((l, i) => <tr key={i}><td>{l.navn}</td><td><St l={l.ik} t={l.plikter} /></td><td><St l={l.bvLys} t={l.bv} /></td><td>{l.ansvarlig ? 'Oppgitt' : <span style={{ color: FARGE.amber }}>Mangler</span>}</td><td>{fd(l.slutt)}</td></tr>)}</tbody></table>
        : <p className="muted">Ingen aktive leietakere.</p>}
      <p className="hj">Eier skal samordne brann- og HMS-arbeidet med leietakerne (internkontrollforskriften § 6) og informere om brannsikkerheten i bygget (forskrift om brannforebygging). Leietakerne bekrefter sine plikter i leietakerportalen.</p></>}
    {v.kommende && s.kommende.length > 0 && <><h2>Neste 90 dager</h2><table><thead><tr><th>Dato</th><th>Hva</th><th>Type</th></tr></thead><tbody>
      {s.kommende.map((k, i) => <tr key={i}><td>{fd(k.d)}</td><td>{k.t}</td><td>{k.type}</td></tr>)}</tbody></table></>}
  </div>;
}

function Rapport({ S2, v, kommentar }: { S2: EierStatus[]; v: Valg; kommentar: string }) {
  const flere = S2.length > 1;
  return <div className="rap"><style>{RAP_CSS + EXTRA_CSS}</style>
    <div className="meta">Statusrapport til eier · {fd(today())} · utarbeidet av {state.me?.navn || state.me?.epost || ''}</div>
    {flere && <><h1>Statusrapport – {S2.length} eiendommer</h1>
      <table><thead><tr><th>Eiendom</th>{S2[0].omrader.map(o => <th key={o.navn}>{o.navn}</th>)}<th>Samlet</th></tr></thead><tbody>
        {S2.map(s => <tr key={s.e.id}><td><b>{s.e.navn}</b></td>{s.omrader.map(o => <td key={o.navn}><Dot l={o.lys} /></td>)}<td><St l={s.lys} /></td></tr>)}</tbody></table>
      {kommentar.trim() && <><h2>Kommentar fra forvalter</h2><p className="pre">{kommentar}</p></>}</>}
    {S2.map((s, i) => <EnEiendom key={s.e.id} s={s} v={v} kommentar={flere ? '' : kommentar} ny={flere || i > 0} />)}
    <p className="hj" style={{ marginTop: 20 }}>Rapporten bygger på registreringene i Eiendomskontroll per {fd(today())}. Hjemmelshenvisningene er korte sammendrag – se «Regelverk og plikter» i appen for forklaring.</p>
  </div>;
}

// PDF for arkivet (pdf-lib), samme innhold i enklere form
async function lagPdf(S2: EierStatus[], v: Valg, kommentar: string) {
  const { ArkivDoc } = await import('../lib/prosjektArkiv'); const { hex } = await import('../lib/arealRapport');
  const F = (l: Lys) => hex(FARGE[l]); const d = await ArkivDoc.lag('Statusrapport til eier');
  for (const [i, s] of S2.entries()) {
    if (i) d.nyside(); d.t([`Status per ${fd(s.dato)}`, [s.e.adresse, s.e.poststed].filter(Boolean).join(', ')].filter(Boolean).join(' · '), 44, d.y - 8, 8, hex('#6b736d')); d.y -= 14; d.h1(s.e.navn);
    d.tekst(`Samlet status: ${LYS_TEKST[s.lys]} · ${s.tiltak.filter(t => t.pri === 1).length} tiltak med høy prioritet`, 11, F(s.lys));
    d.tab([['Område', 2.2], ['Status', 1.4], ['Detaljer', 4.4]], s.omrader.map(o => ({ c: [o.navn, LYS_TEKST[o.lys], o.tekst], farge: [undefined, F(o.lys), undefined] })));
    if (kommentar.trim() && (S2.length === 1 || i === 0)) { d.h2('Kommentar fra forvalter'); d.tekst(kommentar); }
    if (v.tiltak && s.tiltak.length) { d.h2('Prioriterte tiltak'); s.tiltak.forEach((t, j) => d.tekst(`${j + 1}. ${t.tekst} (${t.omr})`, 9, t.pri === 1 ? F('red') : undefined)); }
    if (v.kontroller) { d.h2('Eiers lovpålagte kontroller'); const K = v.kun ? s.kontroller.filter(k => k.lys !== 'green') : s.kontroller;
      d.tab([['Kontroll', 4], ['System', 2], ['Sist', 1.2], ['Frist', 1.2], ['Status', 1.8]], K.map(k => ({ c: [k.navn, k.system, fd(k.sist), fd(k.frist), k.status], farge: [undefined, undefined, undefined, undefined, F(k.lys)] }))); }
    if (v.dok) { d.h2('Dokumenter eier skal ha'); d.tab([['Dokument', 4], ['Krav', 1.3], ['Gyldig til', 1.3], ['Status', 1.5]], s.dok.filter(x => !v.kun || (x.lys !== 'green' && x.lys !== 'grey')).map(x => ({ c: [x.type, x.krav, fd(x.gyldigTil), x.status], farge: [undefined, undefined, undefined, F(x.lys)] }))); }
    if (v.avvik && s.avvik.apne) { d.h2(`Åpne avvik (${s.avvik.apne})`); d.tab([['Nr', 0.7], ['Avvik', 5], ['Alvorlighet', 1.3], ['Frist', 1.2]], s.avvik.liste.slice(0, 40).map(a => ({ c: [a.nr ? '#' + a.nr : '', a.tittel, a.alv, fd(a.frist)] }))); }
    if (v.tilsyn && s.tilsyn.length) { d.h2('Tilsynssaker'); d.tab([['Myndighet', 3], ['Ref.', 1.5], ['Svarfrist', 1.3], ['Status', 3]], s.tilsyn.map(t => ({ c: [t.navn, t.ref, fd(t.svarfrist), t.status], farge: [undefined, undefined, undefined, F(t.lys)] }))); }
    if (v.leietakere) { d.h2('Brannvern og leietakernes internkontroll'); d.tekst(s.brannvern.tekst);
      if (s.leietakere.length) d.tab([['Leietaker', 3], ['Plikter', 2.2], ['Brannvern', 2.6], ['Ansvarlig', 1.2]], s.leietakere.map(l => ({ c: [l.navn, l.plikter, l.bv, l.ansvarlig ? 'Oppgitt' : 'Mangler'], farge: [undefined, F(l.ik), F(l.bvLys), l.ansvarlig ? undefined : F('amber')] }))); }
    if (v.kommende && s.kommende.length) { d.h2('Neste 90 dager'); d.tab([['Dato', 1.2], ['Hva', 5], ['Type', 1.3]], s.kommende.map(k => ({ c: [fd(k.d), k.t, k.type] }))); }
  }
  return await d.pdf.save();
}

function Body({ eid, close }: { eid?: string; close: () => void }) {
  useStore();
  const E = sortBy(S.eiendommer, e => e.navn);
  const [valgt, setValgt] = useState(eid || (E.length === 1 ? E[0].id : '*')); const [v, setV] = useState<Valg>(STD); const [kommentar, setKommentar] = useState(''); const [busy, setBusy] = useState(false);
  const S2 = useMemo(() => (valgt === '*' ? E : E.filter(e => e.id === valgt)).map(e => eierStatus(e.id)), [valgt, S.oppgaver, S.dokumenter, S.avvik, S.leietakere, S.eiendommer]);
  const ref = useRef<HTMLDivElement>(null);
  const tittel = `Statusrapport ${valgt === '*' ? 'eiendommer' : S2[0]?.e.navn} ${fd(today())}`;
  const lagre = async () => { if (!S2.length) return; setBusy(true);
    try { const bytes = await lagPdf(S2, v, kommentar); let n = 0;
      for (const s of S2) { if (!kanDrifteE(s.e.id)) continue; const navn = `Statusrapport til eier – ${s.e.navn} – ${today()}.pdf`.replace(/[\/\\]/g, '-');
        const fil = await uploadFile(new Blob([bytes as any], { type: 'application/pdf' }) as any, s.e.id, undefined, navn, 'rapporter'); if (!fil) continue;
        await save('dokumenter', { eiendomId: s.e.id, leietakerId: '', type: 'Statusrapport til eier', tittel: `Statusrapport til eier ${fd(today())}`, dato: today(), fil, notat: kommentar.slice(0, 500) }); n++; if (S2.length > 1) break; }
      toast(n ? 'Rapporten er lagret under Dokumenter' + (S2.length > 1 ? ` (på ${S2[0].e.navn})` : '') : 'Kunne ikke lagre'); } catch (e: any) { toast('Feil: ' + (e?.message || e)); } finally { setBusy(false); } };
  const last = async () => { setBusy(true); try { const bytes = await lagPdf(S2, v, kommentar); const u = URL.createObjectURL(new Blob([bytes as any], { type: 'application/pdf' })); const a = document.createElement('a'); a.href = u; a.download = tittel + '.pdf'; a.click(); setTimeout(() => URL.revokeObjectURL(u), 5000); } finally { setBusy(false); } };
  const bryter = (k: keyof Valg, l: string) => <label className="small" style={{ display: 'inline-flex', gap: 4, marginRight: 12 }}><input type="checkbox" checked={v[k]} onChange={e => setV({ ...v, [k]: e.target.checked })} />{l}</label>;
  return <>
    <div className="mh"><h2>Statusrapport til eier</h2><button className="btn ghost sm" onClick={close}>✕</button></div>
    <div className="mb">
      <div className="pa-grid">
        <label className="pa-felt half"><span>Eiendom</span><select value={valgt} onChange={e => setValgt(e.target.value)}>{E.length > 1 && <option value="*">Alle eiendommer ({E.length})</option>}{E.map(e => <option key={e.id} value={e.id}>{e.navn}</option>)}</select></label>
        <div className="pa-felt half"><span>Innhold</span><div>{bryter('tiltak', 'Tiltak')}{bryter('kontroller', 'Kontroller')}{bryter('dok', 'Dokumenter')}{bryter('avvik', 'Avvik')}{bryter('tilsyn', 'Tilsyn')}{bryter('leietakere', 'Leietakere/brannvern')}{bryter('kommende', 'Neste 90 dager')}<br />{bryter('kun', 'Vis bare punkter som må følges opp')}</div></div>
        <label className="pa-felt"><span>Kommentar til eier (valgfritt)</span><textarea rows={3} value={kommentar} onChange={e => setKommentar(e.target.value)} placeholder="F.eks. status på pågående arbeid, budsjettbehov eller beslutninger eier må ta" /></label>
      </div>
      <div className="card" style={{ marginTop: 10, maxHeight: '58vh', overflow: 'auto', background: '#fff' }} ref={ref}><Rapport S2={S2} v={v} kommentar={kommentar} /></div>
    </div>
    <div className="mf"><button className="btn" onClick={close}>Lukk</button>
      <button className="btn" disabled={busy} onClick={() => skrivUt(ref.current, tittel)}>Skriv ut</button>
      <button className="btn" disabled={busy} onClick={last}>Last ned PDF</button>
      {canEdit() && <button className="btn pri" disabled={busy || !S2.length} onClick={lagre} title="Lagres som PDF under Dokumenter på eiendommen, så du har historikk over hva eier har fått">{busy ? 'Lager …' : 'Lagre i Dokumenter'}</button>}</div>
  </>;
}
export function eierRapport(eid?: string) { if (!S.eiendommer.length) return toast('Ingen eiendommer'); openModal({ wide: true, render: close => <Body eid={eid} close={close} /> }); }
