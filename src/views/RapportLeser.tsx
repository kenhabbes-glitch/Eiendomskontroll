// «Les avvik fra rapporten»: forslag fra PDF-teksten som brukeren godtar, retter eller forkaster – og som appen lærer av.
import React, { useEffect, useState } from 'react';
import { S, sb, isAdmin, state, toast, useStore } from '../lib/store';
import type { Rec } from '../lib/utils';
import { AV_ALV } from '../lib/catalog';
import { openModal, ModalFrame, Chip, confirmBox } from '../components/ui';
import { Hjelp } from '../components/Hjelp';
import { hentEnhet } from '../lib/oppslag';
import { MALTYPER, ORD_TYPER, STD_ORD, alleOrd, brukMal, delFellesMal, hentFelles, hentFellesMal, orgnrFraLev, settFelles, finnLeverandor, foreslaMal, kontekster, laer, laeringsOversikt, lagreMal, lagreOrd, lesInnst, levNokkel, nullstillLaering, ocrLinjer, pdfLinjer, vurder, type Forslag, type Mal, type Ord, type OrdType } from '../lib/rapportLesing';
import { tt } from '../lib/i18n';

type Kilde = { navn: string; pdf: boolean; hent: () => Promise<ArrayBuffer> };
const erPdf = (n: string, t = '') => /pdf/i.test(t) || /\.pdf$/i.test(n); const erBilde = (n: string, t = '') => /^image\//i.test(t) || /\.(jpe?g|png|webp|bmp|tiff?)$/i.test(n);
export const pdfKilder = (fil?: File | null, filer?: Rec[]): Kilde[] => [
  ...(fil && (erPdf(fil.name, fil.type) || erBilde(fil.name, fil.type)) ? [{ navn: fil.name, pdf: erPdf(fil.name, fil.type), hent: () => fil.arrayBuffer() }] : []),
  ...(filer || []).filter(f => erPdf(f.navn || f.path || '', f.type) || erBilde(f.navn || f.path || '', f.type)).map(f => ({ navn: f.navn || String(f.path).split('/').pop(), pdf: erPdf(f.navn || f.path || '', f.type), hent: async () => { const { data, error } = await sb.storage.from('filer').download(f.path); if (error || !data) throw new Error('Kunne ikke hente filen'); return data.arrayBuffer(); } })),
];

export function lesRapport(o: Rec, kilder: Kilde[], onBruk: (avs: { t: string; a: string }[], ok: boolean) => void) {
  openModal({ wide: true, render: close => <Leser o={o} kilder={kilder} close={close} onBruk={onBruk} /> });
}

function Leser({ o, kilder, close, onBruk }: { o: Rec; kilder: Kilde[]; close: () => void; onBruk: (avs: { t: string; a: string }[], ok: boolean) => void }) {
  useStore();
  const [i, setI] = useState(0); const [st, setSt] = useState<'laster' | 'klar' | 'feil'>('laster'); const [feil, setFeil] = useState('');
  const [linjer, setLinjer] = useState<string[]>([]); const [tom, setTom] = useState(false); const [lev, setLev] = useState('');
  const [F, setF] = useState<Forslag[]>([]); const [ok, setOk] = useState(''); const [ign, setIgn] = useState<Set<string>>(new Set()); const [busy, setBusy] = useState(false);
  const [sek, setSek] = useState(''); const [malBrukt, setMalBrukt] = useState(''); const [ocr, setOcr] = useState<{ p: number; t: string } | null>(null); const [erOcr, setErOcr] = useState(false);
  const ctx = kontekster(o, lev);
  const analyser = async (L: string[], l: string) => {
    await hentFelles(kontekster(o, l));
    const m = lesInnst().maler[levNokkel(l)] || await hentFellesMal(l); const mf = m ? brukMal(L, m) : [];
    const v = vurder(L, kontekster(o, l)); setOk(v.okFunnet); setSek(v.seksjonNavn);
    if (mf.length) { setF(mf); setMalBrukt(m!.navn || 'Mal for leverandøren'); } else { setF(v.forslag); setMalBrukt(m ? '' : ''); }
  };
  const kjorOcr = async (buf?: ArrayBuffer) => {
    setOcr({ p: 0, t: 'Starter tekstgjenkjenning …' });
    try { const L = await ocrLinjer(buf || await kilder[i].hent(), kilder[i].pdf, (p, t) => setOcr(x => ({ p: p < 0 ? (x?.p || 0) : p, t: t || x?.t || '' })));
      setLinjer(L); setTom(L.join('').length < 30); setErOcr(true); const l = finnLeverandor(L) || lev || o.utfores || ''; setLev(l); analyser(L, l); }
    catch (e: any) { toast(e?.message || String(e)); } finally { setOcr(null); }
  };
  useEffect(() => { let av = false; setSt('laster'); setErOcr(false);
    (async () => { try { const buf = await kilder[i].hent(); if (!kilder[i].pdf) { if (av) return; setSt('klar'); setLinjer([]); setTom(true); await kjorOcr(buf); return; }
      const r = await pdfLinjer(buf); if (av) return; setLinjer(r.linjer); setTom(r.tomTekst); const l = finnLeverandor(r.linjer) || o.utfores || ''; setLev(l);
      analyser(r.linjer, l); setSt('klar'); } catch (e: any) { if (!av) { setFeil(e?.message || String(e)); setSt('feil'); } } })();
    return () => { av = true; }; }, [i]);
  const omvurder = (l: string) => { setLev(l); analyser(linjer, l); };
  const upd = (id: string, p: Partial<Forslag>) => setF(L => L.map(f => f.id === id ? { ...f, ...p } : f));
  const valgte = F.filter(f => f.valgt && !ign.has(f.id));
  const bruk = async (somOk = false) => {
    setBusy(true);
    try { await laer(ctx, F, new Set(valgte.map(f => f.id)), ign); } catch { /* læring er ikke kritisk */ }
    setBusy(false); onBruk(somOk ? [] : valgte.map(f => ({ t: f.tekst, a: f.alv })), somOk); close();
    toast(somOk ? tt("Resultat satt til OK") : tt("{0} avvik lagt inn – appen har lært av valgene", valgte.length));
  };
  const mark = (t: string, treff: string[]) => { let h = t.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' } as any)[c]);
    for (const w of treff.filter(w => w !== '§seksjon').sort((a, b) => b.length - a.length)) h = h.replace(new RegExp(`(${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'), '<mark>$1</mark>'); return h; };
  return <ModalFrame title={<span>{tt("Les avvik fra rapporten")}<Hjelp tittel="Lesing av rapporter" tekst={'Teksten i PDF-en leses her i nettleseren – rapporten sendes ikke ut av appen.\n\nAppen foreslår linjer som ser ut som avvik ut fra ordlisten (Innstillinger → Lesing av rapporter) og det den har lært av tidligere rapporter fra samme leverandør og samme type anlegg. Kryss av det som er riktige avvik, rett teksten om nødvendig, og velg «Ignorer» for tekst som går igjen i alle rapporter fra leverandøren (f.eks. tegnforklaring). Neste rapport blir bedre.\n\nSkannede rapporter (bilder) har ingen tekst som kan leses.'} /></span>} close={close}
    foot={st === 'klar' ? <><span className="small muted" style={{ flex: 1 }}>{valgte.length} {tt("av")} {F.length} {tt("forslag valgt")}</span><button className="btn" onClick={close}>{tt("Avbryt")}</button>
      {ok && !valgte.length && <button className="btn" disabled={busy} onClick={() => bruk(true)}>{tt("Sett resultat til OK")}</button>}
      <button className="btn pri" disabled={busy || !valgte.length} onClick={() => bruk()}>{tt("Legg til")} {valgte.length} {tt("avvik")}</button></> : <button className="btn" onClick={close}>{tt("Lukk")}</button>}>
    {kilder.length > 1 && <div className="seg" style={{ marginBottom: 10 }}>{kilder.map((k, j) => <button key={j} className={'btn sm' + (j === i ? ' pri' : '')} onClick={() => setI(j)}>{k.navn}</button>)}</div>}
    {st === 'laster' && <p>{tt("Leser")} {kilder[i]?.navn} …</p>}
    {st === 'feil' && <p style={{ color: 'var(--red)' }}>{tt("Kunne ikke lese PDF-en:")} {feil}</p>}
    {st === 'klar' && <>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <span className="small">{tt("Leverandør (lærer per leverandør):")}</span><input value={lev} onChange={e => setLev(e.target.value)} onBlur={e => omvurder(e.target.value)} style={{ width: 260, padding: '4px 8px' }} placeholder={tt("Firma eller org.nr.")} />
        <span className="small muted">{linjer.length} {tt("linjer lest ·")} {lesInnst().laering['lev:' + lev.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 60)]?.n || 0} {tt("tidligere rapporter fra leverandøren")}</span></div>
      {ocr ? <div className="note small" style={{ marginBottom: 10 }}><b>{ocr.t}</b><div style={{ height: 6, background: 'var(--line)', borderRadius: 3, marginTop: 6 }}><div style={{ width: `${Math.round(ocr.p * 100)}%`, height: 6, background: 'var(--acc)', borderRadius: 3, transition: 'width .3s' }} /></div><span className="muted">{tt("Teksten gjenkjennes her i nettleseren – rapporten sendes ikke ut. Første gang lastes norsk språkdata (ca. 10 MB).")}</span></div>
        : tom && !erOcr ? <div className="note small" style={{ marginBottom: 10, display: 'flex', gap: 10, alignItems: 'center' }}><span style={{ flex: 1 }}>{kilder[i].pdf ? tt("PDF-en ser ut til å være skannet (bilde uten tekst).") : tt("Filen er et bilde.")} {tt("Appen kan lese teksten med tekstgjenkjenning (OCR) – det tar fra noen sekunder til et minutt per side.")}</span><button className="btn sm pri" onClick={() => kjorOcr()}>{tt("Les med tekstgjenkjenning")}</button></div>
        : tom ? <div className="note small" style={{ marginBottom: 10 }}>{tt("Fant ingen lesbar tekst. Avvikene må føres inn for hånd.")}</div> : null}
      {erOcr && !ocr && linjer.length > 0 && <div className="note small" style={{ marginBottom: 10 }}>{tt("Teksten er lest med tekstgjenkjenning – kontroller forslagene ekstra nøye (skrivefeil kan forekomme).")}</div>}
      {malBrukt && <div className="note small" style={{ marginBottom: 10, color: 'var(--ink)' }}>{tt("✓ Fast mal for leverandøren er brukt:")} <b>{malBrukt}</b></div>}
      {ok && <div className="note small" style={{ marginBottom: 10, color: 'var(--green)' }}>{tt("Rapporten inneholder «")}{ok.slice(0, 120)}»{F.length ? '' : tt(" – den ser ut til å være uten avvik.")}</div>}
      {!F.length && !tom ? <p className="small muted">{tt("Fant ingen linjer som ser ut som avvik. Legg til ord som leverandøren bruker under Innstillinger → Lesing av rapporter, så finner appen dem neste gang.")}</p>
        : <div className="tbl-wrap" style={{ maxHeight: '52vh' }}><table className="pa-tbl"><thead><tr><th style={{ width: 30 }} /><th>{tt("Forslag (kan rettes)")}</th><th style={{ width: 110 }}>{tt("Alvorlighet")}</th><th style={{ width: 70 }} title={tt("Hvor sikker appen er")}>{tt("Sikker")}</th><th style={{ width: 90 }} title={tt("Ikke foreslå denne teksten igjen fra denne leverandøren")}>{tt("Ignorer")}</th></tr></thead><tbody>
          {F.map(f => <tr key={f.id} style={{ opacity: ign.has(f.id) ? 0.45 : 1 }}>
            <td><input type="checkbox" style={{ width: 'auto' }} checked={f.valgt && !ign.has(f.id)} disabled={ign.has(f.id)} onChange={e => upd(f.id, { valgt: e.target.checked })} /></td>
            <td><textarea rows={Math.min(4, Math.ceil(f.tekst.length / 90))} value={f.tekst} onChange={e => upd(f.id, { tekst: e.target.value })} />
              <div className="small muted" dangerouslySetInnerHTML={{ __html: `Linje ${f.linje + 1}${f.treff.includes('§seksjon') ? ' · under avviksoverskrift' : ''}${f.treff.filter(t => t !== '§seksjon').length ? ' · ' + mark(f.treff.filter(t => t !== '§seksjon').join(', '), f.treff) : ''}` }} /></td>
            <td><select value={f.alv} onChange={e => upd(f.id, { alv: e.target.value })}>{AV_ALV.map(a => <option key={a}>{a}</option>)}</select></td>
            <td><Chip c={f.score >= 0.65 ? 'green' : f.score >= 0.45 ? 'amber' : ''}>{Math.round(f.score * 100)} %</Chip></td>
            <td style={{ textAlign: 'center' }}><input type="checkbox" style={{ width: 'auto' }} checked={ign.has(f.id)} onChange={e => setIgn(s => { const n = new Set(s); e.target.checked ? n.add(f.id) : n.delete(f.id); return n; })} /></td></tr>)}
        </tbody></table></div>}
      {linjer.length > 0 && lev && <MalPanel lev={lev} linjer={linjer} valgte={valgte} sek={sek} etter={() => analyser(linjer, lev)} />}
      <details style={{ marginTop: 10 }}><summary className="small">{tt("Vis all tekst fra rapporten")}</summary><pre className="small" style={{ whiteSpace: 'pre-wrap', maxHeight: 260, overflow: 'auto', background: 'var(--surface2)', padding: 8, borderRadius: 6 }}>{linjer.map((l, j) => `${String(j + 1).padStart(3)}  ${l}`).join('\n')}</pre></details>
    </>}
  </ModalFrame>;
}

// ---------------- Fast mal for leverandøren
function MalPanel({ lev, linjer, valgte, sek, etter }: { lev: string; linjer: string[]; valgte: Forslag[]; sek: string; etter: () => void }) {
  useStore(); const k = levNokkel(lev); const eks = lesInnst().maler[k];
  const tom = (): Mal => ({ type: 'status', avvik: ['Avvik'], ok: ['OK'], start: '', slutt: '', prefiks: '', navn: lev, laget: new Date().toISOString().slice(0, 10), kilde: 'egen' });
  const [apen, setApen] = useState(false); const [m, setM] = useState<Mal>(eks || tom()); const [del, setDel] = useState(false); const [kanDele, setKanDele] = useState<'' | 'ja' | 'enk' | 'nei'>('');
  const nr = orgnrFraLev(lev);
  useEffect(() => { if (!apen || !nr || !lesInnst().felles.del) return; let av = false; hentEnhet(nr).then(e => { if (av) return; const f = String((e as any)?.orgform || (e as any)?.organisasjonsform || '');
    setKanDele(!e ? 'nei' : /ENK|enkeltperson/i.test(f) ? 'enk' : 'ja'); }).catch(() => !av && setKanDele('nei')); return () => { av = true; }; }, [apen, nr]);
  const set = (x: Partial<Mal>) => setM(v => ({ ...v, ...x })); const treff = brukMal(linjer, m);
  const lagre = async () => { const ny = { ...m, kilde: 'egen' as const, laget: new Date().toISOString().slice(0, 10) }; await lagreMal(k, ny);
    if (del && kanDele === 'ja') { try { await delFellesMal(lev, ny); toast(tt("Malen er lagret og delt anonymt")); } catch (e: any) { toast(tt("Malen er lagret, men ble ikke delt: ") + (e?.message || e)); } }
    else toast(tt("Malen er lagret – den brukes neste gang en rapport fra leverandøren leses")); setApen(false); etter(); };
  const liste = (a: string[]) => a.join(', '); const fra = (t: string) => t.split(',').map(x => x.trim()).filter(Boolean);
  if (!apen) return <p className="small" style={{ margin: '10px 0 0' }}>{eks ? <>{tt("Fast mal for")} <b>{lev}</b>: {MALTYPER.find(t => t[0] === eks.type)?.[1]}. <a href="#" onClick={e => { e.preventDefault(); setM(eks); setApen(true); }}>{tt("Endre")}</a> · <a href="#" onClick={async e => { e.preventDefault(); await lagreMal(k, null); toast(tt("Malen er slettet")); etter(); }}>{tt("Slett")}</a></>
    : <>{tt("Har rapportene fra")} <b>{lev}</b> {tt("alltid samme oppsett?")} <a href="#" onClick={e => { e.preventDefault(); const f = foreslaMal(linjer, valgte, sek); setM({ ...tom(), ...(f || {}) }); setApen(true); }}>{tt("Lag fast mal")}</a> {tt("– da blir treffsikkerheten nesten 100 %.")}</>}</p>;
  return <div className="card" style={{ marginTop: 10, background: 'var(--surface2)' }}>
    <b>{tt("Fast mal for")} {lev}</b>
    <div className="seg" style={{ margin: '8px 0' }}>{MALTYPER.map(([t, l]) => <button key={t} type="button" className={'btn sm' + (m.type === t ? ' pri' : '')} onClick={() => set({ type: t })}>{l}</button>)}</div>
    <p className="small muted" style={{ marginTop: 0 }}>{MALTYPER.find(t => t[0] === m.type)?.[2]}</p>
    <div className="pa-grid">
      {m.type === 'status' && <><label className="pa-felt half"><span>{tt("Status som betyr avvik (kommaseparert)")}</span><input value={liste(m.avvik)} onChange={e => set({ avvik: fra(e.target.value) })} placeholder={tt("Avvik, X, Ikke OK, TG2")} /></label>
        <label className="pa-felt half"><span>{tt("Status som betyr OK")}</span><input value={liste(m.ok)} onChange={e => set({ ok: fra(e.target.value) })} placeholder={tt("OK, Godkjent, I.R.")} /></label></>}
      {m.type === 'seksjon' && <><label className="pa-felt half"><span>{tt("Overskrift der avvikene starter")}</span><input value={m.start} onChange={e => set({ start: e.target.value })} placeholder={tt("Registrerte avvik")} /></label>
        <label className="pa-felt half"><span>{tt("Overskrift der avvikene slutter (valgfritt)")}</span><input value={m.slutt} onChange={e => set({ slutt: e.target.value })} placeholder={tt("Signatur")} /></label></>}
      {m.type === 'prefiks' && <label className="pa-felt half"><span>{tt("Linjer som starter med")}</span><input value={m.prefiks} onChange={e => set({ prefiks: e.target.value })} placeholder={tt("AV-")} /></label>}
    </div>
    <p className="small" style={{ margin: '4px 0' }}>{tt("Malen finner")} <b>{treff.length}</b> {tt("avvik i denne rapporten")}{treff.length ? ': ' + treff.slice(0, 3).map(f => '«' + f.tekst.slice(0, 50) + '»').join(', ') + (treff.length > 3 ? ' …' : '') : ''}.</p>
    {nr && lesInnst().felles.del && <label className="small" style={{ display: 'flex', gap: 6, alignItems: 'flex-start', margin: '6px 0' }}>
      <input type="checkbox" checked={del} disabled={kanDele !== 'ja'} onChange={e => setDel(e.target.checked)} style={{ marginTop: 2 }} />
      <span>{tt("Del malen med andre brukere av appen. Det som deles er bare leverandørens org.nr og selve malen (type og overskrifter/statusord) – ingen rapporttekst, eiendom eller person.")}
        {kanDele === '' && <span className="muted"> {tt("Sjekker leverandøren i Enhetsregisteret …")}</span>}{kanDele === 'enk' && <b> {tt("Kan ikke deles: leverandøren er et enkeltpersonforetak (personopplysning).")}</b>}{kanDele === 'nei' && <span className="muted"> {tt("Fant ikke leverandøren i Enhetsregisteret – malen deles ikke.")}</span>}</span></label>}
    <div style={{ display: 'flex', gap: 6 }}><button type="button" className="btn sm pri" disabled={!treff.length} onClick={lagre}>{tt("Lagre mal")}</button><button type="button" className="btn sm" onClick={() => setApen(false)}>{tt("Avbryt")}</button></div>
  </div>;
}

// ---------------- Innstillinger: ordliste og læring
export function RapportLesingKort() {
  useStore(); const ro = !isAdmin() && state.me?.rolle !== 'forvalter'; const I = lesInnst(); const O = alleOrd(I);
  const [ny, setNy] = useState<Record<string, string>>({}); const [vis, setVis] = useState(false);
  const leggTil = async (t: OrdType) => { const o = (ny[t] || '').trim().toLowerCase(); if (!o) return; if (O.some(x => x.t === t && x.o === o)) return toast(tt("Ordet finnes allerede"));
    await lagreOrd([...I.ord, { o, t, kilde: 'egen' }], I.fjernet.filter(f => f !== t + ':' + o)); setNy({ ...ny, [t]: '' }); };
  const fjern = async (x: Ord) => x.kilde === 'standard' ? lagreOrd(I.ord, [...I.fjernet, x.t + ':' + x.o]) : lagreOrd(I.ord.filter(y => !(y.t === x.t && y.o === x.o)), I.fjernet);
  const LO = laeringsOversikt(I);
  return <div className="card" style={{ maxWidth: 900, marginTop: 16 }}>
    <h2 style={{ marginTop: 0 }}>{tt("Lesing av rapporter")}</h2>
    <p className="small muted" style={{ marginTop: -4 }}>{tt("Ord appen ser etter når den foreslår avvik fra PDF-rapporter. Rapportene leses i nettleseren og sendes ikke ut av appen. Appen lærer i tillegg av hvilke forslag dere godtar og forkaster, per leverandør og type anlegg.")}</p>
    {ORD_TYPER.map(([t, l, h]) => <div key={t} className="pu-rad"><b className="small">{l}</b> <span className="small muted">– {h}</span>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>{O.filter(x => x.t === t).map(x => <span key={x.o} className={'chip plain ' + (x.kilde === 'egen' ? 'blue' : '')} style={{ gap: 4 }}>{x.o}{!ro && <button type="button" onClick={() => fjern(x)} style={{ border: 0, background: 'none', cursor: 'pointer', padding: 0, color: 'inherit' }} title={tt("Fjern")}>×</button>}</span>)}
        {!ro && <span style={{ display: 'inline-flex', gap: 4 }}><input value={ny[t] || ''} onChange={e => setNy({ ...ny, [t]: e.target.value })} onKeyDown={e => e.key === 'Enter' && leggTil(t)} placeholder={tt("nytt ord")} style={{ width: 130, padding: '2px 6px' }} /><button type="button" className="btn sm" onClick={() => leggTil(t)}>+</button></span>}</div></div>)}
    {!ro && I.fjernet.length > 0 && <p className="small"><a href="#" onClick={e => { e.preventDefault(); lagreOrd(I.ord, []); }}>{tt("Gjenopprett")} {I.fjernet.length} {tt("fjernede standardord")}</a></p>}
    <p className="small" style={{ marginBottom: 0 }}><a href="#" onClick={e => { e.preventDefault(); setVis(!vis); }}>{vis ? tt("Skjul") : tt("Vis")} {tt("hva appen har lært (")}{LO.length} {tt("leverandører/anleggstyper)")}</a></p>
    {vis && <>{LO.length ? <div className="tbl-wrap" style={{ marginTop: 6 }}><table><thead><tr><th>{tt("Gjelder")}</th><th className="num">{tt("Rapporter")}</th><th>{tt("Ord (godtatt / forkastet)")}</th><th className="num">{tt("Ignorerte linjer")}</th></tr></thead><tbody>
      {LO.map(x => <tr key={x.k}><td className="small">{x.navn}</td><td className="num">{x.rapporter}</td><td className="small">{x.beste.map(b => `${b.m} ${b.g}/${b.a}`).join(' · ')}</td><td className="num">{x.ignorert}</td></tr>)}</tbody></table></div>
      : <p className="small muted">{tt("Ingenting lært ennå. Læringen starter første gang noen bruker «Les avvik fra rapporten».")}</p>}
      {!ro && LO.length > 0 && <button className="btn sm" onClick={async () => { if (await confirmBox(tt("Nullstille alt appen har lært? Ordlisten beholdes."), tt("Nullstill"))) { await nullstillLaering(); toast(tt("Læringen er nullstilt")); } }}>{tt("Nullstill læring")}</button>}</>}
    {Object.keys(I.maler || {}).length > 0 && <div className="pu-rad"><b className="small">{tt("Faste maler per leverandør")}</b>
      {Object.entries(I.maler).map(([k, m]) => <div key={k} className="small" style={{ display: 'flex', gap: 8, padding: '3px 0' }}><span style={{ flex: 1 }}>{m.navn || k.slice(4)} – {MALTYPER.find(t => t[0] === m.type)?.[1]}: {m.type === 'status' ? m.avvik.join(', ') : m.type === 'prefiks' ? m.prefiks : tt("{0}{1}", m.start, m.slutt ? ' → ' + m.slutt : '')}{m.kilde === 'felles' ? tt(" (felles)") : ''}</span>
        {!ro && <a href="#" onClick={async e => { e.preventDefault(); await lagreMal(k, null); }}>{tt("Slett")}</a>}</div>)}</div>}
    <div className="pu-rad"><b className="small">{tt("Felles læring på tvers av brukere")}</b> <span className="small muted">{tt("– av som standard")}</span>
      <p className="small muted" style={{ margin: '4px 0' }}>{tt("Det som deles: hvor ofte appens")} <i>{tt("standardord")}</i> {tt("ble godtatt eller forkastet per type anlegg/kontroll (f.eks. «ventilasjon: lekkasje 12/1»). Det som")} <b>{tt("aldri")}</b> {tt("deles: rapporttekst, egne ord, eiendom, adresse, leietaker, personer, leverandørnavn eller hvem som bidro. Faste maler deles bare når dere krysser av for det på malen.")}</p>
      <label className="small" style={{ display: 'flex', gap: 6 }}><input type="checkbox" disabled={ro} checked={I.felles.del} onChange={e => settFelles({ del: e.target.checked })} /> {tt("Del anonymisert læring")}</label>
      <label className="small" style={{ display: 'flex', gap: 6 }}><input type="checkbox" disabled={ro} checked={I.felles.bruk} onChange={e => settFelles({ bruk: e.target.checked })} /> {tt("Bruk felles læring og felles maler (teller mindre enn deres egen læring)")}</label></div>
    <p className="small muted">{tt("Standardord:")} {STD_ORD.length}{tt(". Egne ord vises i blått.")}</p>
  </div>;
}
