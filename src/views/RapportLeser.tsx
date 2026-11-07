// «Les avvik fra rapporten»: forslag fra PDF-teksten som brukeren godtar, retter eller forkaster – og som appen lærer av.
import React, { useEffect, useState } from 'react';
import { S, sb, isAdmin, state, toast, useStore } from '../lib/store';
import type { Rec } from '../lib/utils';
import { AV_ALV } from '../lib/catalog';
import { openModal, ModalFrame, Chip, confirmBox } from '../components/ui';
import { Hjelp } from '../components/Hjelp';
import { ORD_TYPER, STD_ORD, alleOrd, finnLeverandor, kontekster, laer, laeringsOversikt, lagreOrd, lesInnst, nullstillLaering, pdfLinjer, vurder, type Forslag, type Ord, type OrdType } from '../lib/rapportLesing';

type Kilde = { navn: string; hent: () => Promise<ArrayBuffer> };
export const pdfKilder = (fil?: File | null, filer?: Rec[]): Kilde[] => [
  ...(fil && /pdf/i.test(fil.type || fil.name) ? [{ navn: fil.name, hent: () => fil.arrayBuffer() }] : []),
  ...(filer || []).filter(f => /\.pdf$/i.test(f.navn || f.path || '') || /pdf/i.test(f.type || '')).map(f => ({ navn: f.navn || String(f.path).split('/').pop(), hent: async () => { const { data, error } = await sb.storage.from('filer').download(f.path); if (error || !data) throw new Error('Kunne ikke hente filen'); return data.arrayBuffer(); } })),
];

export function lesRapport(o: Rec, kilder: Kilde[], onBruk: (avs: { t: string; a: string }[], ok: boolean) => void) {
  openModal({ wide: true, render: close => <Leser o={o} kilder={kilder} close={close} onBruk={onBruk} /> });
}

function Leser({ o, kilder, close, onBruk }: { o: Rec; kilder: Kilde[]; close: () => void; onBruk: (avs: { t: string; a: string }[], ok: boolean) => void }) {
  useStore();
  const [i, setI] = useState(0); const [st, setSt] = useState<'laster' | 'klar' | 'feil'>('laster'); const [feil, setFeil] = useState('');
  const [linjer, setLinjer] = useState<string[]>([]); const [tom, setTom] = useState(false); const [lev, setLev] = useState('');
  const [F, setF] = useState<Forslag[]>([]); const [ok, setOk] = useState(''); const [ign, setIgn] = useState<Set<string>>(new Set()); const [busy, setBusy] = useState(false);
  const ctx = kontekster(o, lev);
  useEffect(() => { let av = false; setSt('laster');
    (async () => { try { const r = await pdfLinjer(await kilder[i].hent()); if (av) return; setLinjer(r.linjer); setTom(r.tomTekst); const l = finnLeverandor(r.linjer) || o.utfores || ''; setLev(l);
      const v = vurder(r.linjer, kontekster(o, l)); setF(v.forslag); setOk(v.okFunnet); setSt('klar'); } catch (e: any) { if (!av) { setFeil(e?.message || String(e)); setSt('feil'); } } })();
    return () => { av = true; }; }, [i]);
  const omvurder = (l: string) => { setLev(l); const v = vurder(linjer, kontekster(o, l)); setF(v.forslag); setOk(v.okFunnet); };
  const upd = (id: string, p: Partial<Forslag>) => setF(L => L.map(f => f.id === id ? { ...f, ...p } : f));
  const valgte = F.filter(f => f.valgt && !ign.has(f.id));
  const bruk = async (somOk = false) => {
    setBusy(true);
    try { await laer(ctx, F, new Set(valgte.map(f => f.id)), ign); } catch { /* læring er ikke kritisk */ }
    setBusy(false); onBruk(somOk ? [] : valgte.map(f => ({ t: f.tekst, a: f.alv })), somOk); close();
    toast(somOk ? 'Resultat satt til OK' : `${valgte.length} avvik lagt inn – appen har lært av valgene`);
  };
  const mark = (t: string, treff: string[]) => { let h = t.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' } as any)[c]);
    for (const w of treff.filter(w => w !== '§seksjon').sort((a, b) => b.length - a.length)) h = h.replace(new RegExp(`(${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'), '<mark>$1</mark>'); return h; };
  return <ModalFrame title={<span>Les avvik fra rapporten<Hjelp tittel="Lesing av rapporter" tekst={'Teksten i PDF-en leses her i nettleseren – rapporten sendes ikke ut av appen.\n\nAppen foreslår linjer som ser ut som avvik ut fra ordlisten (Innstillinger → Lesing av rapporter) og det den har lært av tidligere rapporter fra samme leverandør og samme type anlegg. Kryss av det som er riktige avvik, rett teksten om nødvendig, og velg «Ignorer» for tekst som går igjen i alle rapporter fra leverandøren (f.eks. tegnforklaring). Neste rapport blir bedre.\n\nSkannede rapporter (bilder) har ingen tekst som kan leses.'} /></span>} close={close}
    foot={st === 'klar' ? <><span className="small muted" style={{ flex: 1 }}>{valgte.length} av {F.length} forslag valgt</span><button className="btn" onClick={close}>Avbryt</button>
      {ok && !valgte.length && <button className="btn" disabled={busy} onClick={() => bruk(true)}>Sett resultat til OK</button>}
      <button className="btn pri" disabled={busy || !valgte.length} onClick={() => bruk()}>Legg til {valgte.length} avvik</button></> : <button className="btn" onClick={close}>Lukk</button>}>
    {kilder.length > 1 && <div className="seg" style={{ marginBottom: 10 }}>{kilder.map((k, j) => <button key={j} className={'btn sm' + (j === i ? ' pri' : '')} onClick={() => setI(j)}>{k.navn}</button>)}</div>}
    {st === 'laster' && <p>Leser {kilder[i]?.navn} …</p>}
    {st === 'feil' && <p style={{ color: 'var(--red)' }}>Kunne ikke lese PDF-en: {feil}</p>}
    {st === 'klar' && <>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <span className="small">Leverandør (lærer per leverandør):</span><input value={lev} onChange={e => setLev(e.target.value)} onBlur={e => omvurder(e.target.value)} style={{ width: 260, padding: '4px 8px' }} placeholder="Firma eller org.nr." />
        <span className="small muted">{linjer.length} linjer lest · {lesInnst().laering['lev:' + lev.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 60)]?.n || 0} tidligere rapporter fra leverandøren</span></div>
      {tom && <div className="note small" style={{ marginBottom: 10 }}>PDF-en ser ut til å være skannet (bilde uten tekst). Avvikene må føres inn for hånd.</div>}
      {ok && <div className="note small" style={{ marginBottom: 10, color: 'var(--green)' }}>Rapporten inneholder «{ok.slice(0, 120)}»{F.length ? '' : ' – den ser ut til å være uten avvik.'}</div>}
      {!F.length && !tom ? <p className="small muted">Fant ingen linjer som ser ut som avvik. Legg til ord som leverandøren bruker under Innstillinger → Lesing av rapporter, så finner appen dem neste gang.</p>
        : <div className="tbl-wrap" style={{ maxHeight: '52vh' }}><table className="pa-tbl"><thead><tr><th style={{ width: 30 }} /><th>Forslag (kan rettes)</th><th style={{ width: 110 }}>Alvorlighet</th><th style={{ width: 70 }} title="Hvor sikker appen er">Sikker</th><th style={{ width: 90 }} title="Ikke foreslå denne teksten igjen fra denne leverandøren">Ignorer</th></tr></thead><tbody>
          {F.map(f => <tr key={f.id} style={{ opacity: ign.has(f.id) ? 0.45 : 1 }}>
            <td><input type="checkbox" style={{ width: 'auto' }} checked={f.valgt && !ign.has(f.id)} disabled={ign.has(f.id)} onChange={e => upd(f.id, { valgt: e.target.checked })} /></td>
            <td><textarea rows={Math.min(4, Math.ceil(f.tekst.length / 90))} value={f.tekst} onChange={e => upd(f.id, { tekst: e.target.value })} />
              <div className="small muted" dangerouslySetInnerHTML={{ __html: `Linje ${f.linje + 1}${f.treff.includes('§seksjon') ? ' · under avviksoverskrift' : ''}${f.treff.filter(t => t !== '§seksjon').length ? ' · ' + mark(f.treff.filter(t => t !== '§seksjon').join(', '), f.treff) : ''}` }} /></td>
            <td><select value={f.alv} onChange={e => upd(f.id, { alv: e.target.value })}>{AV_ALV.map(a => <option key={a}>{a}</option>)}</select></td>
            <td><Chip c={f.score >= 0.65 ? 'green' : f.score >= 0.45 ? 'amber' : ''}>{Math.round(f.score * 100)} %</Chip></td>
            <td style={{ textAlign: 'center' }}><input type="checkbox" style={{ width: 'auto' }} checked={ign.has(f.id)} onChange={e => setIgn(s => { const n = new Set(s); e.target.checked ? n.add(f.id) : n.delete(f.id); return n; })} /></td></tr>)}
        </tbody></table></div>}
      <details style={{ marginTop: 10 }}><summary className="small">Vis all tekst fra rapporten</summary><pre className="small" style={{ whiteSpace: 'pre-wrap', maxHeight: 260, overflow: 'auto', background: 'var(--surface2)', padding: 8, borderRadius: 6 }}>{linjer.map((l, j) => `${String(j + 1).padStart(3)}  ${l}`).join('\n')}</pre></details>
    </>}
  </ModalFrame>;
}

// ---------------- Innstillinger: ordliste og læring
export function RapportLesingKort() {
  useStore(); const ro = !isAdmin() && state.me?.rolle !== 'forvalter'; const I = lesInnst(); const O = alleOrd(I);
  const [ny, setNy] = useState<Record<string, string>>({}); const [vis, setVis] = useState(false);
  const leggTil = async (t: OrdType) => { const o = (ny[t] || '').trim().toLowerCase(); if (!o) return; if (O.some(x => x.t === t && x.o === o)) return toast('Ordet finnes allerede');
    await lagreOrd([...I.ord, { o, t, kilde: 'egen' }], I.fjernet.filter(f => f !== t + ':' + o)); setNy({ ...ny, [t]: '' }); };
  const fjern = async (x: Ord) => x.kilde === 'standard' ? lagreOrd(I.ord, [...I.fjernet, x.t + ':' + x.o]) : lagreOrd(I.ord.filter(y => !(y.t === x.t && y.o === x.o)), I.fjernet);
  const LO = laeringsOversikt(I);
  return <div className="card" style={{ maxWidth: 900, marginTop: 16 }}>
    <h2 style={{ marginTop: 0 }}>Lesing av rapporter</h2>
    <p className="small muted" style={{ marginTop: -4 }}>Ord appen ser etter når den foreslår avvik fra PDF-rapporter. Rapportene leses i nettleseren og sendes ikke ut av appen. Appen lærer i tillegg av hvilke forslag dere godtar og forkaster, per leverandør og type anlegg.</p>
    {ORD_TYPER.map(([t, l, h]) => <div key={t} className="pu-rad"><b className="small">{l}</b> <span className="small muted">– {h}</span>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>{O.filter(x => x.t === t).map(x => <span key={x.o} className={'chip plain ' + (x.kilde === 'egen' ? 'blue' : '')} style={{ gap: 4 }}>{x.o}{!ro && <button type="button" onClick={() => fjern(x)} style={{ border: 0, background: 'none', cursor: 'pointer', padding: 0, color: 'inherit' }} title="Fjern">×</button>}</span>)}
        {!ro && <span style={{ display: 'inline-flex', gap: 4 }}><input value={ny[t] || ''} onChange={e => setNy({ ...ny, [t]: e.target.value })} onKeyDown={e => e.key === 'Enter' && leggTil(t)} placeholder="nytt ord" style={{ width: 130, padding: '2px 6px' }} /><button type="button" className="btn sm" onClick={() => leggTil(t)}>+</button></span>}</div></div>)}
    {!ro && I.fjernet.length > 0 && <p className="small"><a href="#" onClick={e => { e.preventDefault(); lagreOrd(I.ord, []); }}>Gjenopprett {I.fjernet.length} fjernede standardord</a></p>}
    <p className="small" style={{ marginBottom: 0 }}><a href="#" onClick={e => { e.preventDefault(); setVis(!vis); }}>{vis ? 'Skjul' : 'Vis'} hva appen har lært ({LO.length} leverandører/anleggstyper)</a></p>
    {vis && <>{LO.length ? <div className="tbl-wrap" style={{ marginTop: 6 }}><table><thead><tr><th>Gjelder</th><th className="num">Rapporter</th><th>Ord (godtatt / forkastet)</th><th className="num">Ignorerte linjer</th></tr></thead><tbody>
      {LO.map(x => <tr key={x.k}><td className="small">{x.navn}</td><td className="num">{x.rapporter}</td><td className="small">{x.beste.map(b => `${b.m} ${b.g}/${b.a}`).join(' · ')}</td><td className="num">{x.ignorert}</td></tr>)}</tbody></table></div>
      : <p className="small muted">Ingenting lært ennå. Læringen starter første gang noen bruker «Les avvik fra rapporten».</p>}
      {!ro && LO.length > 0 && <button className="btn sm" onClick={async () => { if (await confirmBox('Nullstille alt appen har lært? Ordlisten beholdes.', 'Nullstill')) { await nullstillLaering(); toast('Læringen er nullstilt'); } }}>Nullstill læring</button>}</>}
    <p className="small muted">Standardord: {STD_ORD.length}. Egne ord vises i blått.</p>
  </div>;
}
