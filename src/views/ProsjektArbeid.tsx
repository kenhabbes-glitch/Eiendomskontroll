// Arbeidsflate for en oppgave i prosjektet: åpnes ved klikk på oppgaven under «Faser og oppgaver».
import React, { useState } from 'react';
import { S, save, toast, useStore, uploadFile } from '../lib/store';
import { byId, fd, today, nok, type Rec } from '../lib/utils';
import { openModal, ModalFrame, confirmBox, FileLink, Chip } from '../components/ui';
import { NsVelger, nsNavn } from '../components/NsVelger';
import { FASER, FAG, KLASSER, uid } from '../lib/prosjekt';
import { OTYPER, PASLAG, kalkSum, linjeSum, n, oppgaveType, oppdaterP, rettSjekk, standardSjekk, tilbudScore, type Linje } from '../lib/prosjektArbeid';
import { Hjelp } from '../components/LovHjelp';
import { hjelpFor, verktoyFor } from '../lib/lovhjelp';
import { Sha, shaAvkrysning, type ShaFane } from './ShaVerktoy';

const kr = (v: number) => nok(Math.round(v));
type Kol = { k: string; l: string; w?: number | string; type?: 'text' | 'number' | 'date' | 'select' | 'check' | 'area'; opts?: string[]; ph?: string; dl?: string[] };

/** Enkel radredigering (tabell) brukt i flere arbeidsflater */
export function Rader({ v, set, kol, ny, tom, sum, sumL = 'Sum' }: { v: Rec[]; set: (x: Rec[]) => void; kol: Kol[]; ny: () => Rec; tom?: string; sum?: (r: Rec) => React.ReactNode; sumL?: string }) {
  const endre = (i: number, p: Rec) => set(v.map((r, j) => j === i ? { ...r, ...p } : r));
  return <div className="pa-rader">
    {v.length ? <div className="tbl-wrap"><table className="pa-tbl"><thead><tr>{kol.map(c => <th key={c.k} style={{ width: c.w }}>{c.l}</th>)}{sum && <th className="num">{sumL}</th>}<th style={{ width: 30 }} /></tr></thead><tbody>
      {v.map((r, i) => <tr key={r.id || i}>{kol.map(c => <td key={c.k}>
        {c.type === 'select' ? <select value={r[c.k] || ''} onChange={e => endre(i, { [c.k]: e.target.value })}><option value="">–</option>{(c.opts || []).map(o => <option key={o}>{o}</option>)}</select>
          : c.type === 'check' ? <input type="checkbox" style={{ width: 'auto' }} checked={!!r[c.k]} onChange={e => endre(i, { [c.k]: e.target.checked })} />
          : c.type === 'area' ? <textarea rows={2} value={r[c.k] || ''} placeholder={c.ph} onChange={e => endre(i, { [c.k]: e.target.value })} />
          : <input type={c.type || 'text'} value={r[c.k] ?? ''} placeholder={c.ph} list={c.dl ? 'dl-' + c.k : undefined} className={c.type === 'number' ? 'num' : undefined} onChange={e => endre(i, { [c.k]: e.target.value })} />}
        {c.dl && i === 0 && <datalist id={'dl-' + c.k}>{c.dl.map(x => <option key={x} value={x} />)}</datalist>}</td>)}
        {sum && <td className="num mono">{sum(r)}</td>}
        <td><button type="button" className="btn ghost sm" title="Fjern rad" onClick={() => set(v.filter((_, j) => j !== i))}>✕</button></td></tr>)}
    </tbody></table></div> : <p className="small muted">{tom || 'Ingen rader ennå.'}</p>}
    <button type="button" className="btn sm" onClick={() => set([...v, { id: uid(), ...ny() }])}>+ Legg til</button>
  </div>;
}
const Felt = ({ l, children, half, hint }: { l: React.ReactNode; children: React.ReactNode; half?: boolean; hint?: string }) => <label className={'pa-felt' + (half ? ' half' : '')}><span>{l}</span>{children}{hint && <small className="muted">{hint}</small>}</label>;
const Tekst = ({ v, set, k, l, rows = 3, ph }: { v: Rec; set: (p: Rec) => void; k: string; l: string; rows?: number; ph?: string }) => <Felt l={l}><textarea rows={rows} value={v[k] || ''} placeholder={ph} onChange={e => set({ [k]: e.target.value })} /></Felt>;

export function aapneOppgave(pid: string, oid: string) { openModal({ wide: true, render: close => <Arbeidsflate pid={pid} oid={oid} close={close} /> }); }
export function nyOppgave(pid: string, fase: string) {
  const p = byId('prosjekter', pid)!; const id = uid();
  oppdaterP(pid, { oppgaver: [...(p.oppgaver || []), { id, fase, tittel: 'Ny oppgave', status: 'Ikke startet', ansvarlig: '', frist: '', fag: '' }] }).then(() => aapneOppgave(pid, id));
}

function Arbeidsflate({ pid, oid, close }: { pid: string; oid: string; close: () => void }) {
  useStore();
  const p = byId('prosjekter', pid); const o0 = (p?.oppgaver || []).find((x: Rec) => x.id === oid);
  const [f, setF0] = useState<Rec>(() => ({ ...o0, sjekk: o0?.sjekk?.length ? rettSjekk(o0.sjekk) : standardSjekk(o0 || {}) }));
  const type = oppgaveType(f);
  const [A, setA0] = useState<Rec>({}); // bare endrede deler; resten leses fra prosjektet
  const [shaFane, setShaFane] = useState<ShaFane>('vurdering');
  const [busy, setBusy] = useState(false);
  if (!p || !o0) return <ModalFrame title="Oppgave" close={close}><p>Fant ikke oppgaven.</p></ModalFrame>;
  const setF = (x: Rec) => setF0(v => ({ ...v, ...x }));
  const PA: Rec = p.arbeid || {}; const get = (k: string) => A[k] ?? PA[k];
  const a: Rec = get(type) || {}; const setA = (x: Rec) => setA0(v => ({ ...v, [type]: { ...((v[type] ?? PA[type]) || {}), ...x } }));
  const lagre = async (ferdig?: boolean) => {
    setBusy(true);
    const P = byId('prosjekter', pid)!; const sha = A.sha ?? P.arbeid?.sha;
    const sjekk = type === 'sha' && sha ? (f.sjekk || []).map((x: Rec) => x.ok || !shaAvkrysning(x.t, sha, P) ? x : { ...x, ok: true }) : f.sjekk;
    const ny = { ...f, sjekk, ...(ferdig ? { status: 'Ferdig', ferdig: today() } : f.status === 'Ferdig' && !f.ferdig ? { ferdig: today() } : {}) };
    await oppdaterP(pid, { oppgaver: (P.oppgaver || []).map((x: Rec) => x.id === oid ? ny : x), arbeid: { ...(P.arbeid || {}), ...A } }, ferdig || (ny.status === 'Ferdig' && o0.status !== 'Ferdig') ? `Ferdig: ${ny.tittel}` : undefined);
    setBusy(false); toast('Lagret'); close();
  };
  const slett = async () => { if (!(await confirmBox(`Slette oppgaven «${f.tittel}»?`))) return; const P = byId('prosjekter', pid)!; await oppdaterP(pid, { oppgaver: (P.oppgaver || []).filter((x: Rec) => x.id !== oid) }, `Oppgave slettet: ${f.tittel}`); close(); };
  const D = S.dokumenter.filter(d => d.prosjektId === pid && d.oppgaveId === oid);
  const lastOpp = async (fil: File) => { const r = await uploadFile(fil, p.eiendomId); if (!r) return; await save('dokumenter', { eiendomId: p.eiendomId, leietakerId: '', prosjektId: pid, oppgaveId: oid, anleggId: '', type: 'Annet', tittel: `${fil.name} – ${f.tittel}`, dato: today(), fil: r }); toast('Lastet opp'); };
  const fagL = [...new Set([...(p.fag || []).map((x: Rec) => x.fag), ...FAG])];

  return <ModalFrame title={<span>{f.tittel}<Hjelp k={hjelpFor(f.tittel || '')} /> <span className="small muted" style={{ fontWeight: 400 }}>· {FASER.find(x => x[0] === f.fase)?.[1]}</span></span>} close={close}
    foot={<><button className="btn danger" onClick={slett}>Slett</button><span style={{ flex: 1 }} /><button className="btn" onClick={close}>Avbryt</button>
      <button className="btn" disabled={busy} onClick={() => lagre()}>Lagre</button>{f.status !== 'Ferdig' && <button className="btn pri" disabled={busy} onClick={() => lagre(true)}>Lagre og marker ferdig</button>}</>}>
    <div className="pa-grid">
      <Felt l="Oppgave"><input value={f.tittel || ''} onChange={e => setF({ tittel: e.target.value })} /></Felt>
      <Felt l="Status" half><select value={f.status} onChange={e => setF({ status: e.target.value })}>{['Ikke startet', 'Pågår', 'Ferdig', 'Ikke relevant'].map(s => <option key={s}>{s}</option>)}</select></Felt>
      <Felt l="Fase" half><select value={f.fase} onChange={e => setF({ fase: e.target.value })}>{FASER.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Felt>
      <Felt l="Ansvarlig" half><input value={f.ansvarlig || ''} onChange={e => setF({ ansvarlig: e.target.value })} /></Felt>
      <Felt l="Fag" half><select value={f.fag || ''} onChange={e => setF({ fag: e.target.value })}><option value="">– felles –</option>{fagL.map(x => <option key={x}>{x}</option>)}</select></Felt>
      <Felt l="Start" half><input type="date" value={f.start || ''} onChange={e => setF({ start: e.target.value })} /></Felt>
      <Felt l="Frist / slutt" half><input type="date" value={f.frist || ''} onChange={e => setF({ frist: e.target.value })} /></Felt>
      <Felt l="Arbeidsflate" half><select value={f.type || 'auto'} onChange={e => setF({ type: e.target.value })}><option value="auto">Automatisk ({OTYPER.find(x => x[0] === oppgaveType({ ...f, type: '' }))?.[1].split(' (')[0]})</option>{OTYPER.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Felt>
      <label className="pa-felt half" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><input type="checkbox" style={{ width: 'auto' }} checked={!!f.milepael} onChange={e => setF({ milepael: e.target.checked })} /> Vis som milepæl i fremdriftsplanen</label>
    </div>

    <div className="pa-seksjon">
      {type === 'beskrivelse' && <Beskrivelse v={a} set={setA} risiko={get('risiko') || []} setRisiko={r => setA0(v => ({ ...v, risiko: r }))} p={p} />}
      {(type === 'overslag' || type === 'kalkyle') && <Kalkyle v={a} set={setA} p={p} type={type} fraOverslag={get('overslag')} />}
      {type === 'ramme' && <Ramme v={a} set={setA} overslag={get('overslag')} kalkyle={get('kalkyle')} />}
      {type === 'tilbud' && <Tilbud v={a} set={setA} fagL={fagL} />}
      {type === 'kontrakt' && <Kontrakt v={a} set={setA} tilbud={get('tilbud')} p={p} />}
      {type === 'moter' && <Moter v={a} set={setA} />}
      {type === 'endringer' && <Endringer v={a} set={setA} fagL={fagL} p={p} />}
      {type === 'mangler' && <Mangler v={a} set={setA} fagL={fagL} />}
      {(type === 'sjekk' || type === 'generell' || type === 'sha' || (f.sjekk || []).length > 0) && <Sjekk v={f.sjekk || []} set={s => setF({ sjekk: s })} tittel={type === 'sjekk' || type === 'sha' ? 'Sjekkliste' : 'Sjekkpunkter'}
        verktoy={type === 'sha' ? (t: string) => { const vk = verktoyFor(t); return vk ? { tekst: vk === 'risiko' ? 'Lag risikovurdering' : vk === 'vurdering' ? 'Vurder' : vk === 'org' ? 'Registrer' : 'Lag SHA-plan', apne: () => { setShaFane(vk); setTimeout(() => document.getElementById('sha-verktoy')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); }, ferdig: shaAvkrysning(t, get('sha') || {}, p) } : null; } : undefined} />}
      {type === 'sha' && <div id="sha-verktoy" className="pa-seksjon"><Sha v={get('sha') || {}} set={x => setA0(v => ({ ...v, sha: { ...((v.sha ?? PA.sha) || {}), ...x } }))} p={p} fane={shaFane} setFane={setShaFane} /></div>}
    </div>
    <Felt l="Notat"><textarea rows={3} value={f.notat || ''} onChange={e => setF({ notat: e.target.value })} placeholder="Vurderinger, avklaringer, hvem som er kontaktet …" /></Felt>
    <div className="pa-seksjon"><b>Vedlegg</b> <label className="btn sm" style={{ marginLeft: 8 }}>+ Last opp<input type="file" multiple style={{ display: 'none' }} onChange={async e => { for (const x of Array.from(e.target.files || [])) await lastOpp(x); e.target.value = ''; }} /></label>
      {D.length ? D.map(d => <div key={d.id} className="small" style={{ padding: '3px 0' }}><FileLink fil={d.fil}>{d.tittel}</FileLink> <span className="muted">· {fd(d.dato)}</span></div>) : <p className="small muted" style={{ margin: '4px 0 0' }}>Tilbud, tegninger, referater, bilder … Lagres også under prosjektets dokumenter.</p>}</div>
    {['beskrivelse', 'overslag', 'ramme', 'kalkyle', 'tilbud'].includes(type) && <p className="small muted">Innholdet tas med i beslutningsnotatet for fasen. Lag notatet med «Beslutningsnotat» på fasen når oppgavene er klare.</p>}
  </ModalFrame>;
}

function Sjekk({ v, set, tittel, verktoy }: { v: Rec[]; set: (x: Rec[]) => void; tittel: string; verktoy?: (t: string) => { tekst: string; apne: () => void; ferdig: boolean } | null }) {
  const [ny, setNy] = useState('');
  return <div><b>{tittel}</b> <span className="small muted">{v.filter(x => x.ok).length}/{v.length}</span>
    {v.map((x, i) => { const vk = verktoy?.(x.t); return <div key={x.id} className="rk-rad"><input type="checkbox" style={{ width: 'auto' }} checked={!!x.ok} onChange={e => set(v.map((y, j) => j === i ? { ...y, ok: e.target.checked } : y))} />
      <span style={{ flex: 1 }}><span style={{ textDecoration: x.ok ? 'line-through' : undefined }}>{x.t}</span><Hjelp k={hjelpFor(x.t)} />{vk?.ferdig && !x.ok && <span className="small" style={{ color: 'var(--green)', marginLeft: 8 }}>✓ utfylt – krysses av når du lagrer</span>}</span>
      {vk && <button type="button" className="btn sm" onClick={vk.apne}>{vk.tekst} ›</button>}
      <button type="button" className="btn ghost sm" onClick={() => set(v.filter((_, j) => j !== i))}>✕</button></div>; })}
    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}><input value={ny} placeholder="Nytt sjekkpunkt" onChange={e => setNy(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && ny.trim()) { e.preventDefault(); set([...v, { id: uid(), t: ny.trim(), ok: false }]); setNy(''); } }} />
      <button type="button" className="btn sm" onClick={() => { if (ny.trim()) { set([...v, { id: uid(), t: ny.trim(), ok: false }]); setNy(''); } }}>Legg til</button></div></div>;
}

const SANNS = ['Lav', 'Middels', 'Høy'];
export const risikoNivaa = (r: Rec) => (SANNS.indexOf(r.sannsynlighet) + 1) * (SANNS.indexOf(r.konsekvens) + 1);
function Beskrivelse({ v, set, risiko, setRisiko, p }: { v: Rec; set: (x: Rec) => void; risiko: Rec[]; setRisiko: (r: Rec[]) => void; p: Rec }) {
  return <>
    <h3 className="pa-h">Prosjektbeskrivelse</h3>
    <Tekst v={v} set={set} k="bakgrunn" l="Bakgrunn og behov" ph={p.beskrivelse || 'Hvorfor skal prosjektet gjennomføres? Tilstand, krav, leietakerbehov …'} />
    <Tekst v={v} set={set} k="mal" l="Mål og ønsket resultat" ph="Hva skal være oppnådd når prosjektet er ferdig? Målbare mål der det er mulig." />
    <div className="pa-grid"><div className="half"><Tekst v={v} set={set} k="omfang" l="Omfang – hva inngår" /></div><div className="half"><Tekst v={v} set={set} k="avgrensning" l="Avgrensning – hva inngår ikke" /></div></div>
    <Tekst v={v} set={set} k="alternativer" l="Alternativer som er vurdert" rows={2} ph="F.eks. reparere / skifte / utsette – med kort begrunnelse for valgt løsning" />
    <div className="pa-grid"><div className="half"><Tekst v={v} set={set} k="konsekvens" l="Konsekvens hvis prosjektet ikke gjennomføres" rows={2} /></div><div className="half"><Tekst v={v} set={set} k="gevinst" l="Gevinster (energi, leieinntekt, risiko, verdi)" rows={2} /></div></div>
    <Tekst v={v} set={set} k="berorte" l="Berørte leietakere og drift" rows={2} />
    <h3 className="pa-h">Risiko</h3>
    <Rader v={risiko} set={setRisiko} tom="Ingen risikoer registrert." ny={() => ({ risiko: '', sannsynlighet: 'Middels', konsekvens: 'Middels', tiltak: '', ansvar: '', status: 'Åpen' })}
      kol={[{ k: 'risiko', l: 'Risiko / usikkerhet', w: '28%' }, { k: 'sannsynlighet', l: 'Sannsynlighet', type: 'select', opts: SANNS }, { k: 'konsekvens', l: 'Konsekvens', type: 'select', opts: SANNS }, { k: 'tiltak', l: 'Tiltak', w: '28%' }, { k: 'ansvar', l: 'Ansvar' }, { k: 'status', l: 'Status', type: 'select', opts: ['Åpen', 'Lukket'] }]}
      sum={r => { const x = risikoNivaa(r); return <Chip c={x >= 6 ? 'red' : x >= 3 ? 'amber' : 'green'}>{x || '–'}</Chip>; }} />
  </>;
}

function Kalkyle({ v, set, p, type, fraOverslag }: { v: Rec; set: (x: Rec) => void; p: Rec; type: string; fraOverslag?: Rec }) {
  const k = kalkSum(v); const L: Linje[] = v.linjer || [];
  const setL = (i: number, x: Rec) => set({ linjer: L.map((l, j) => j === i ? { ...l, ...x } : l) });
  const overfor = async () => {
    if (!k.tot) return toast('Ingen beløp å overføre');
    const P = byId('prosjekter', p.id)!; const B: Rec[] = P.budsjett || [];
    const fjernes = B.filter(b => ['overslag', 'kalkyle'].includes(b.kilde) || (b.post === 'Budsjettramme' && !(P.kostnader || []).some((c: Rec) => c.post === b.id)));
    if (!(await confirmBox(`Overføre ${type === 'kalkyle' ? 'kalkylen' : 'overslaget'} (${kr(k.tot)}) til budsjettet?${fjernes.length ? ` ${fjernes.length} budsjettposter fra tidligere overslag/ramme erstattes.` : ''} Poster med registrerte kostnader beholdes.`, 'Overfør'))) return;
    const klasse = p.type === 'Vedlikehold' ? 'vedl' : /leietaker/i.test(p.type) ? 'lt' : 'pak'; const konto = p.type === 'Vedlikehold' ? '6600' : '1100';
    const nye = [...L.filter(l => linjeSum(l)).map(l => ({ id: uid(), kilde: type, post: l.post || 'Post', bygningsdel: l.bygningsdel || '', fag: l.fag || '', klasse, konto: String(l.bygningsdel || '')[0] && '3456'.includes(String(l.bygningsdel)[0]) && konto === '1100' ? '1120' : konto, belop: Math.round(linjeSum(l)), prognose: '', betaler: 'eier' })),
      ...k.pa.filter(x => x.belop).map(x => ({ id: uid(), kilde: type, post: x.navn, bygningsdel: '', fag: x.id === 'prosj' ? 'Prosjektledelse / byggherre' : '', klasse: x.id === 'prosj' && klasse === 'vedl' ? 'rad' : klasse, konto: x.id === 'prosj' && klasse === 'vedl' ? '6700' : konto, belop: Math.round(x.belop), prognose: '', betaler: 'eier' }))];
    await oppdaterP(p.id, { budsjett: [...B.filter(b => !fjernes.includes(b)), ...nye] }, `${type === 'kalkyle' ? 'Kalkyle' : 'Grovt overslag'} overført til budsjett: ${kr(k.tot)}`);
    toast('Overført til budsjettet');
  };
  return <>
    <h3 className="pa-h">{type === 'kalkyle' ? 'Detaljert kostnadskalkyle' : 'Grovt kostnadsoverslag'} <span className="small muted" style={{ fontWeight: 400 }}>kr eks. mva</span></h3>
    {type === 'kalkyle' && !L.length && fraOverslag?.linjer?.length > 0 && <p><button type="button" className="btn sm" onClick={() => set({ linjer: fraOverslag.linjer.map((l: Linje) => ({ ...l, id: uid() })), paslag: fraOverslag.paslag })}>Start med linjene fra grovt overslag</button></p>}
    <div className="tbl-wrap"><table className="pa-tbl"><thead><tr><th style={{ width: '26%' }}>Post</th><th style={{ width: '24%' }}>Bygningsdel (NS 3451)</th><th className="num">Mengde</th><th>Enhet</th><th className="num">Enhetspris</th><th className="num">Sum</th><th /></tr></thead><tbody>
      {L.map((l, i) => <tr key={l.id}>
        <td><input value={l.post || ''} onChange={e => setL(i, { post: e.target.value })} placeholder="F.eks. Nytt aggregat" /></td>
        <td><NsVelger value={l.bygningsdel} set={x => setL(i, { bygningsdel: x })} fag={l.fag} /></td>
        <td><input className="num" value={l.mengde ?? ''} onChange={e => setL(i, { mengde: e.target.value })} style={{ width: 70 }} /></td>
        <td><input value={l.enhet || ''} list="dl-enh" onChange={e => setL(i, { enhet: e.target.value })} style={{ width: 60 }} /></td>
        <td>{l.mengde !== '' && l.mengde != null && n(l.mengde) ? <input className="num" value={l.pris ?? ''} onChange={e => setL(i, { pris: e.target.value })} style={{ width: 100 }} /> : <input className="num" value={l.belop ?? ''} placeholder="sum" onChange={e => setL(i, { belop: e.target.value })} style={{ width: 100 }} title="Uten mengde: skriv sum direkte" />}</td>
        <td className="num mono">{kr(linjeSum(l))}</td><td><button type="button" className="btn ghost sm" onClick={() => set({ linjer: L.filter((_, j) => j !== i) })}>✕</button></td></tr>)}
      <tr><td colSpan={5}><button type="button" className="btn sm" onClick={() => set({ linjer: [...L, { id: uid(), post: '', mengde: '', enhet: 'stk', pris: '', belop: '' }] })}>+ Linje</button></td><td className="num mono"><b>{kr(k.sum)}</b></td><td /></tr>
      {k.pa.map(x => <tr key={x.id}><td colSpan={4} className="small">{x.navn}</td><td><input className="num" value={v.paslag?.[x.id] ?? PASLAG.find(z => z[0] === x.id)![2]} onChange={e => set({ paslag: { ...(v.paslag || {}), [x.id]: e.target.value } })} style={{ width: 60 }} /> %</td><td className="num mono">{kr(x.belop)}</td><td /></tr>)}
      <tr style={{ fontWeight: 700 }}><td colSpan={5}>Totalt eks. mva</td><td className="num mono">{kr(k.tot)}</td><td /></tr>
    </tbody></table></div>
    <datalist id="dl-enh">{['stk', 'm²', 'm', 'lm', 'm³', 'timer', 'RS', 'kg'].map(x => <option key={x} value={x} />)}</datalist>
    <Tekst v={v} set={set} k="notat" l="Forutsetninger og usikkerhet" rows={2} ph="Grunnlag (erfaringstall, tilbud, rådgiver), nøyaktighet (f.eks. ±30 %), hva som ikke er med" />
    <p><button type="button" className="btn" onClick={overfor}>Overfør til budsjett</button> <span className="small muted">Lager budsjettposter med bygningsdel, slik at fordelingen bygg/teknisk følger med.</span></p>
  </>;
}

const KILDER = ['Egenkapital / drift', 'Vedlikeholdsfond / avsetning', 'Lån', 'Leietakers bidrag', 'Tilskudd (f.eks. Enova)', 'Forsikringsoppgjør', 'Annet'];
function Ramme({ v, set, overslag, kalkyle }: { v: Rec; set: (x: Rec) => void; overslag?: Rec; kalkyle?: Rec }) {
  const ov = kalkSum(overslag).tot, ka = kalkSum(kalkyle).tot; const F: Rec[] = v.finansiering || []; const fs = F.reduce((s, x) => s + n(x.belop), 0); const r = n(v.ramme);
  return <>
    <h3 className="pa-h">Finansiering og budsjettramme</h3>
    <div className="pa-grid">
      <Felt l="Foreslått budsjettramme (kr eks. mva)" half hint={ov || ka ? `${ka ? 'Kalkyle' : 'Grovt overslag'}: ${kr(ka || ov)}` : 'Lag gjerne grovt overslag først'}><input className="num" value={v.ramme ?? ''} onChange={e => set({ ramme: e.target.value })} /></Felt>
      <Felt l="Herav reserve / uforutsett (kr)" half><input className="num" value={v.reserve ?? ''} onChange={e => set({ reserve: e.target.value })} /></Felt>
      {(ov || ka) > 0 && !v.ramme && <p className="small" style={{ gridColumn: '1/-1', margin: 0 }}><button type="button" className="btn sm" onClick={() => set({ ramme: Math.round(ka || ov) })}>Bruk {ka ? 'kalkylen' : 'overslaget'} som ramme</button></p>}
    </div>
    <b className="small">Finansiering</b>
    <Rader v={F} set={x => set({ finansiering: x })} tom="Hvordan skal prosjektet finansieres?" ny={() => ({ kilde: '', belop: '' })} kol={[{ k: 'kilde', l: 'Kilde', dl: KILDER, w: '45%' }, { k: 'belop', l: 'Beløp (kr)', type: 'number' }, { k: 'merknad', l: 'Merknad' }]} />
    {F.length > 0 && <p className="small" style={{ color: r && Math.abs(fs - r) > 1 ? 'var(--red)' : undefined }}>Sum finansiering {kr(fs)}{r ? ` – ramme ${kr(r)}${Math.abs(fs - r) > 1 ? ` (differanse ${kr(fs - r)})` : ' ✓'}` : ''}</p>}
    <Tekst v={v} set={set} k="notat" l="Kommentar" rows={2} ph="F.eks. forutsetninger for leietakers bidrag, budsjettår, behov for styrevedtak" />
  </>;
}

function Tilbud({ v, set, fagL }: { v: Rec; set: (x: Rec) => void; fagL: string[] }) {
  const T: Rec[] = v.liste || []; const vekt = v.vekt || { pris: 60, kvalitet: 30, fremdrift: 10 }; const sc = tilbudScore(T, vekt); const best = sc.length ? Math.max(...sc.map(x => x.tot)) : 0;
  return <>
    <h3 className="pa-h">Tilbud og evaluering</h3>
    <div className="pa-grid">{(['pris', 'kvalitet', 'fremdrift'] as const).map(k => <Felt key={k} l={`Vekt ${k} (%)`} half><input className="num" value={vekt[k]} onChange={e => set({ vekt: { ...vekt, [k]: e.target.value } })} /></Felt>)}</div>
    <Rader v={T} set={x => set({ liste: x })} tom="Registrer mottatte tilbud." ny={() => ({ leverandor: '', fag: '', pris: '', kvalitet: '', fremdrift: '', forbehold: '', valgt: false })}
      kol={[{ k: 'leverandor', l: 'Leverandør', w: '20%' }, { k: 'fag', l: 'Fag', dl: fagL }, { k: 'pris', l: 'Pris eks. mva', type: 'number' }, { k: 'kvalitet', l: 'Kvalitet 0–10', type: 'number', w: 70 }, { k: 'fremdrift', l: 'Fremdrift 0–10', type: 'number', w: 70 }, { k: 'forbehold', l: 'Forbehold / merknad', w: '22%' }, { k: 'valgt', l: 'Anbefalt', type: 'check', w: 60 }]}
      sum={r => { const s = sc.find(x => x.id === r.id); return s ? <span style={{ fontWeight: s.tot === best && best > 0 ? 700 : 400 }}>{s.tot}</span> : '–'; }} />
    <p className="small muted">Prispoeng: laveste pris får 10, de øvrige forholdsmessig. Sum er vektet poengsum. Kryss av for anbefalt leverandør – den tas med i beslutningsnotatet og som grunnlag for kontrakten.</p>
    <Tekst v={v} set={set} k="begrunnelse" l="Begrunnelse for anbefaling" rows={2} />
  </>;
}

function Kontrakt({ v, set, tilbud, p }: { v: Rec; set: (x: Rec) => void; tilbud?: Rec; p: Rec }) {
  const valgt = (tilbud?.liste || []).find((t: Rec) => t.valgt);
  const reg = async () => {
    if (!n(v.sum)) return toast('Fyll inn kontraktssum');
    const P = byId('prosjekter', p.id)!; if (v.kostId && (P.kostnader || []).some((c: Rec) => c.id === v.kostId)) return toast('Kontrakten er allerede registrert som forpliktet kostnad');
    const id = uid(); const post = (P.budsjett || []).find((b: Rec) => b.fag && b.fag === v.fag)?.id || '';
    await oppdaterP(p.id, { kostnader: [...(P.kostnader || []), { id, dato: v.signert || today(), status: 'Bestilt', leverandor: v.part, beskrivelse: `Kontrakt ${v.form || ''}`.trim(), post, fag: v.fag || '', belop: n(v.sum) }], entreprenor: P.entreprenor || v.part, kontrakt: P.kontrakt || v.form,
      arbeid: { ...(P.arbeid || {}), kontrakt: { ...v, kostId: id } } }, `Kontrakt med ${v.part} registrert som forpliktet: ${kr(n(v.sum))}`);
    set({ kostId: id }); toast('Registrert som forpliktet kostnad');
  };
  return <>
    <h3 className="pa-h">Kontrakt</h3>
    {valgt && !v.part && <p><button type="button" className="btn sm" onClick={() => set({ part: valgt.leverandor, sum: valgt.pris, fag: valgt.fag })}>Hent fra anbefalt tilbud ({valgt.leverandor}, {kr(n(valgt.pris))})</button></p>}
    <div className="pa-grid">
      <Felt l="Kontraktspart" half><input value={v.part || ''} onChange={e => set({ part: e.target.value })} /></Felt>
      <Felt l={<>Kontraktsform <Hjelp k="ns84" /></>} half><input value={v.form || ''} list="dl-ns84" onChange={e => set({ form: e.target.value })} /></Felt>
      <Felt l="Kontraktssum (kr eks. mva)" half><input className="num" value={v.sum ?? ''} onChange={e => set({ sum: e.target.value })} /></Felt>
      <Felt l="Fag" half><input value={v.fag || ''} onChange={e => set({ fag: e.target.value })} /></Felt>
      <Felt l="Signert dato" half><input type="date" value={v.signert || ''} onChange={e => set({ signert: e.target.value })} /></Felt>
      <Felt l="Avtalt ferdigstillelse" half><input type="date" value={v.ferdig || ''} onChange={e => set({ ferdig: e.target.value })} /></Felt>
      <Felt l="Dagmulkt" half><input value={v.dagmulkt || ''} placeholder="F.eks. 1 promille per dag" onChange={e => set({ dagmulkt: e.target.value })} /></Felt>
      <Felt l="Sikkerhetsstillelse" half><input value={v.sikkerhet || ''} placeholder="F.eks. 10 % i utførelsen, 3 % i reklamasjonstiden" onChange={e => set({ sikkerhet: e.target.value })} /></Felt>
    </div>
    <datalist id="dl-ns84">{['NS 8405 Utførelsesentreprise', 'NS 8406 Forenklet utførelsesentreprise', 'NS 8407 Totalentreprise', 'NS 8402 Rådgivning', 'NS 8403 Byggeledelse', 'Bestilling / ordrebekreftelse'].map(x => <option key={x} value={x} />)}</datalist>
    <p>{v.kostId ? <Chip c="green">Registrert som forpliktet kostnad</Chip> : <button type="button" className="btn" onClick={reg}>Registrer som forpliktet kostnad</button>}</p>
  </>;
}

function Moter({ v, set }: { v: Rec; set: (x: Rec) => void }) {
  const M: Rec[] = v.liste || []; const [apen, setApen] = useState<string>(M[M.length - 1]?.id || '');
  const setM = (i: number, x: Rec) => set({ liste: M.map((m, j) => j === i ? { ...m, ...x } : m) });
  const apneSaker = M.flatMap(m => (m.saker || []).filter((s: Rec) => s.status !== 'Lukket').map((s: Rec) => ({ ...s, mote: m })));
  return <>
    <h3 className="pa-h">Møter og referater</h3>
    {apneSaker.length > 0 && <p className="small"><b>{apneSaker.length} åpne saker</b> fra tidligere møter.</p>}
    {M.map((m, i) => <details key={m.id} open={apen === m.id} className="pa-mote" onToggle={e => (e.target as HTMLDetailsElement).open && setApen(m.id)}>
      <summary><b>{m.type || 'Møte'}</b> {fd(m.dato)} <span className="small muted">· {(m.saker || []).filter((s: Rec) => s.status !== 'Lukket').length} åpne saker</span></summary>
      <div className="pa-grid">
        <Felt l="Dato" half><input type="date" value={m.dato || ''} onChange={e => setM(i, { dato: e.target.value })} /></Felt>
        <Felt l="Type" half><select value={m.type || ''} onChange={e => setM(i, { type: e.target.value })}>{['Oppstartsmøte', 'Byggemøte', 'Befaring', 'Prosjekteringsmøte', 'Ettårsbefaring', 'Annet'].map(x => <option key={x}>{x}</option>)}</select></Felt>
        <Felt l="Deltakere"><input value={m.deltakere || ''} onChange={e => setM(i, { deltakere: e.target.value })} /></Felt>
      </div>
      <Tekst v={m} set={x => setM(i, x)} k="referat" l="Referat" rows={4} />
      <b className="small">Saker / aksjoner</b>
      <Rader v={m.saker || []} set={x => setM(i, { saker: x })} ny={() => ({ tekst: '', ansvar: '', frist: '', status: 'Åpen' })} kol={[{ k: 'tekst', l: 'Sak', w: '45%' }, { k: 'ansvar', l: 'Ansvar' }, { k: 'frist', l: 'Frist', type: 'date' }, { k: 'status', l: 'Status', type: 'select', opts: ['Åpen', 'Lukket'] }]} />
      <p style={{ textAlign: 'right', margin: '4px 0' }}><button type="button" className="btn ghost sm" onClick={() => set({ liste: M.filter((_, j) => j !== i) })}>Slett møtet</button></p>
    </details>)}
    <button type="button" className="btn sm" onClick={() => { const id = uid(); set({ liste: [...M, { id, dato: today(), type: M.length ? 'Byggemøte' : 'Oppstartsmøte', deltakere: M[M.length - 1]?.deltakere || '', referat: '', saker: apneSaker.map(s => ({ id: uid(), tekst: s.tekst, ansvar: s.ansvar, frist: s.frist, status: 'Åpen' })) }] }); setApen(id); }}>+ Nytt møte{apneSaker.length ? ' (tar med åpne saker)' : ''}</button>
  </>;
}

function Endringer({ v, set, fagL, p }: { v: Rec; set: (x: Rec) => void; fagL: string[]; p: Rec }) {
  const E: Rec[] = v.liste || []; const sum = (s: string[]) => E.filter(x => s.includes(x.status)).reduce((a, x) => a + n(x.belop), 0);
  const tilKost = async (i: number) => { const x = E[i]; const P = byId('prosjekter', p.id)!; const id = uid(); const post = (P.budsjett || []).find((b: Rec) => b.fag && b.fag === x.fag)?.id || '';
    await oppdaterP(p.id, { kostnader: [...(P.kostnader || []), { id, dato: x.dato || today(), status: 'Bestilt', leverandor: x.leverandor || '', beskrivelse: `EM ${x.nr}: ${x.tittel}`, post, fag: x.fag || '', endring: true, belop: n(x.belop) }],
      arbeid: { ...(P.arbeid || {}), endringer: { ...v, liste: E.map((y, j) => j === i ? { ...y, kostId: id } : y) } } }, `Endring ${x.nr} godkjent og registrert som forpliktet: ${kr(n(x.belop))}`);
    set({ liste: E.map((y, j) => j === i ? { ...y, kostId: id } : y) }); toast('Registrert som forpliktet kostnad'); };
  return <>
    <h3 className="pa-h">Endringsmeldinger og tillegg</h3>
    <Rader v={E} set={x => set({ liste: x })} tom="Ingen endringer registrert." ny={() => ({ nr: String(E.length + 1), dato: today(), tittel: '', fag: '', leverandor: '', belop: '', dager: '', status: 'Varslet' })}
      kol={[{ k: 'nr', l: 'Nr', w: 44 }, { k: 'dato', l: 'Dato', type: 'date' }, { k: 'tittel', l: 'Endring', w: '25%' }, { k: 'fag', l: 'Fag', dl: fagL }, { k: 'leverandor', l: 'Fra' }, { k: 'belop', l: 'Beløp', type: 'number' }, { k: 'dager', l: 'Dager +/-', type: 'number', w: 60 }, { k: 'status', l: 'Status', type: 'select', opts: ['Varslet', 'Under behandling', 'Godkjent', 'Avvist'] }]}
      sum={r => { const i = E.findIndex(x => x.id === r.id); return r.status === 'Godkjent' ? (r.kostId ? <Chip c="green">Kostnad</Chip> : <button type="button" className="btn sm" onClick={() => tilKost(i)}>→ kostnad</button>) : '–'; }} />
    <p className="small">Godkjent {kr(sum(['Godkjent']))} · til behandling {kr(sum(['Varslet', 'Under behandling']))} · avvist {kr(sum(['Avvist']))}</p>
  </>;
}

function Mangler({ v, set, fagL }: { v: Rec; set: (x: Rec) => void; fagL: string[] }) {
  const M: Rec[] = v.liste || [];
  return <>
    <h3 className="pa-h">Overtakelse og mangler</h3>
    <div className="pa-grid">
      <Felt l="Overtakelsesforretning dato" half><input type="date" value={v.dato || ''} onChange={e => set({ dato: e.target.value })} /></Felt>
      <Felt l="Deltakere" half><input value={v.deltakere || ''} onChange={e => set({ deltakere: e.target.value })} /></Felt>
    </div>
    <Rader v={M} set={x => set({ liste: x })} tom="Ingen mangler registrert." ny={() => ({ nr: String(M.length + 1), beskrivelse: '', fag: '', ansvar: '', frist: '', status: 'Åpen' })}
      kol={[{ k: 'nr', l: 'Nr', w: 44 }, { k: 'beskrivelse', l: 'Mangel', w: '38%' }, { k: 'fag', l: 'Fag', dl: fagL }, { k: 'ansvar', l: 'Ansvar' }, { k: 'frist', l: 'Frist', type: 'date' }, { k: 'status', l: 'Status', type: 'select', opts: ['Åpen', 'Utbedret', 'Lukket'] }]} />
    <p className="small">{M.filter(x => x.status !== 'Lukket').length} åpne av {M.length} mangler.</p>
    <Tekst v={v} set={set} k="merknad" l="Merknader i protokollen" rows={2} />
  </>;
}
export { KLASSER, nsNavn };
