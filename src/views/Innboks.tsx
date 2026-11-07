// Dokumentinnboks: slipp inn mange filer, appen tolker dem i nettleseren og foreslår hvor de hører hjemme.
// Køen lagres i nettleseren (IndexedDB) til dokumentene er arkivert – ingenting lastes opp før du trykker «Arkiver».
import React, { useEffect, useRef, useState } from 'react';
import { S, canEdit, kanDrifteE, save, state, toast, uploadFile, useStore } from '../lib/store';
import { DOK_TYPER } from '../lib/catalog';
import { aNavn, fd, sortBy, today } from '../lib/utils';
import { Empty } from '../components/ui';
import { KONFIDENSIELLE, kontrollerFor, laerArkivering, lesTekst, tolk, type Tolkning } from '../lib/innboks';
import { ocrLinjer } from '../lib/rapportLesing';
import { utfor } from '../lib/actions';

type Post = { id: string; navn: string; mime: string; str: number; blob: Blob; lagt: string; status: 'ny' | 'leser' | 'klar' | 'ocr' | 'feil';
  linjer?: string[]; tom?: boolean; kanOcr?: boolean; ocrBrukt?: boolean; t?: Tolkning; v?: Partial<Tolkning> & { notat?: string; kontrollId?: string }; feil?: string; ocrP?: number };

// ---------- IndexedDB (per bruker, i denne nettleseren)
const DB = 'ek-innboks';
const dbP = () => new Promise<IDBDatabase>((ok, feil) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore('poster', { keyPath: 'id' }); r.onsuccess = () => ok(r.result); r.onerror = () => feil(r.error); });
const tx = async <T,>(m: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>) => { const d = await dbP(); return new Promise<T>((ok, feil) => { const q = f(d.transaction('poster', m).objectStore('poster')); q.onsuccess = () => ok(q.result); q.onerror = () => feil(q.error); }); };
const eier = () => state.me?.id || 'x';
const lagre = (p: Post) => tx('readwrite', s => s.put({ ...p, eier: eier(), ocrP: undefined, status: p.status === 'leser' || p.status === 'ocr' ? 'ny' : p.status })).catch(() => null);
const slett = (id: string) => tx('readwrite', s => s.delete(id)).catch(() => null);
const hentAlle = async () => ((await tx<any[]>('readonly', s => s.getAll()).catch(() => [])) || []).filter(p => p.eier === eier()) as Post[];

// Teller for menyen
let ANTALL = 0; const lyttere = new Set<() => void>();
const settAntall = (n: number) => { ANTALL = n; lyttere.forEach(f => f()); };
export function useInnboksAntall() { const [, s] = useState(0); const uid = state.me?.id;
  useEffect(() => { const f = () => s(x => x + 1); lyttere.add(f); return () => { lyttere.delete(f); }; }, []);
  useEffect(() => { if (uid && typeof indexedDB !== 'undefined') hentAlle().then(L => settAntall(L.length)); }, [uid]); return ANTALL; }

const TYPER_MED_SYSTEM = ['FDV-dokumentasjon', 'Servicerapport', 'Egenkontrollskjema', 'Serviceavtale', 'Samsvarserklæring el-anlegg', 'Tilstandsrapport'];
const kb = (n: number) => n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1e3)) + ' kB';

export function Innboks() {
  useStore();
  const [P, setP0] = useState<Post[]>([]); const [lastet, setLastet] = useState(false); const [drag, setDrag] = useState(false); const [valgtE, setValgtE] = useState('');
  const ref = useRef<Post[]>([]); const setP = (f: (p: Post[]) => Post[]) => { ref.current = f(ref.current); setP0(ref.current); settAntall(ref.current.length); };
  const oppd = (id: string, x: Partial<Post>, persist = true) => setP(L => L.map(p => { if (p.id !== id) return p; const n = { ...p, ...x }; if (persist) lagre(n); return n; }));
  const filInput = useRef<HTMLInputElement>(null);

  const analyser = async (p: Post) => {
    oppd(p.id, { status: 'leser' }, false);
    try { const r = await lesTekst(p.navn, p.mime, await p.blob.arrayBuffer()); const t = tolk(p.navn, r.linjer, valgtE);
      oppd(p.id, { status: 'klar', linjer: r.linjer, tom: r.tom, kanOcr: r.kanOcr, t, v: { ...t } }); }
    catch (e: any) { const t = tolk(p.navn, [], valgtE); oppd(p.id, { status: 'klar', feil: 'Kunne ikke lese innholdet (' + (e?.message || e) + ') – forslag ut fra filnavnet', t, v: { ...t } }); }
  };
  useEffect(() => { hentAlle().then(L => { ref.current = L.sort((a, b) => a.lagt.localeCompare(b.lagt)); setP0(ref.current); settAntall(L.length); setLastet(true); L.filter(p => !p.t).forEach(analyser); }); }, []);

  const leggTil = async (files: FileList | File[]) => {
    const nye: Post[] = [...files].filter(f => f.size > 0).map(f => ({ id: crypto.randomUUID(), navn: f.name, mime: f.type, str: f.size, blob: f, lagt: new Date().toISOString(), status: 'ny' }));
    const store = nye.filter(p => p.str > 50e6); if (store.length) toast(`${store.length} fil(er) er over 50 MB og ble hoppet over`);
    const ok = nye.filter(p => p.str <= 50e6); setP(L => [...L, ...ok]); for (const p of ok) { await lagre(p); }
    for (const p of ok) await analyser(p); // én og én – skånsomt for nettleseren
  };
  const kjorOcr = async (p: Post) => {
    oppd(p.id, { status: 'ocr', ocrP: 0 }, false);
    try { const L = await ocrLinjer(await p.blob.arrayBuffer(), /pdf/i.test(p.mime) || /\.pdf$/i.test(p.navn), (x) => { if (x >= 0) oppd(p.id, { ocrP: x }, false); }, 6);
      const t = tolk(p.navn, L, valgtE); oppd(p.id, { status: 'klar', linjer: L, tom: L.join('').length < 30, ocrBrukt: true, t, v: { ...t } }); }
    catch (e: any) { toast('Tekstgjenkjenning feilet: ' + (e?.message || e)); oppd(p.id, { status: 'klar' }, false); }
  };
  const fjern = async (id: string) => { await slett(id); setP(L => L.filter(p => p.id !== id)); };

  const arkiver = async (p: Post, stille = false): Promise<boolean> => {
    const v = p.v || {}; if (!v.eiendomId) { toast('Velg eiendom'); return false; } if (!kanDrifteE(v.eiendomId)) { toast('Du har ikke skrivetilgang til eiendommen'); return false; }
    const type = v.type || 'Annet'; const kontroll = ['Servicerapport', 'Egenkontrollskjema'].includes(type) ? valgtKontroll(p) : null;
    const fil = await uploadFile(new File([p.blob], p.navn, { type: p.mime }), v.eiendomId, KONFIDENSIELLE.includes(type) && v.leietakerId ? v.leietakerId : undefined); if (!fil) return false;
    laerArkivering(v.leverandor || p.t?.leverandor || '', type, v.anleggId || '');
    if (kontroll && !stille) { await fjern(p.id); utfor(kontroll.id, { filer: [fil], kilde: 'innboks', dato: v.dato && v.dato <= today() ? v.dato : today(), av: v.leverandor?.startsWith('orgnr') ? '' : v.leverandor || undefined }); return true; }
    const id = await save('dokumenter', { eiendomId: v.eiendomId, leietakerId: KONFIDENSIELLE.includes(type) ? v.leietakerId || '' : '', type, tittel: v.tittel || type, dato: v.dato || today(), gyldigTil: v.gyldigTil || '',
      anleggId: v.anleggId || '', anleggIds: v.anleggId ? [v.anleggId] : [], fil, notat: v.notat || '', kilde: 'innboks' });
    await fjern(p.id);
    if (!stille) { toast('Arkivert: ' + (v.tittel || type)); if (type === 'Brannkonsept/brannteknisk dokumentasjon' && /\.pdf$/i.test(p.navn)) setTimeout(() => import('../lib/brannkonseptLes').then(m => m.tilbyLesing(v.eiendomId!, id)), 300);
      if (type === 'Tilsynsrapport') setTimeout(() => import('./Tilsyn').then(m => m.registrerTilsyn()), 300); }
    return true;
  };
  const klare = P.filter(p => p.status === 'klar' && p.v?.eiendomId && p.v?.type && p.v.type !== 'Annet' && (p.t?.typeScore || 0) >= 0.7 && !['Servicerapport', 'Egenkontrollskjema', 'Tilsynsrapport'].includes(p.v.type) && !(KONFIDENSIELLE.includes(p.v.type) && !p.v.leietakerId && p.v.type !== 'Forsikringspolise'));
  const arkiverKlare = async () => { let n = 0; for (const p of klare) if (await arkiver(p, true)) n++; toast(`${n} dokumenter arkivert`); };

  if (!canEdit() && !S.eiendommer.some(e => kanDrifteE(e.id))) return <><h1>Dokumentinnboks</h1><div className="card"><Empty t="Du har ikke tilgang til å arkivere dokumenter" /></div></>;
  return <>
    <div className="head"><div className="grow"><h1>Dokumentinnboks</h1><p className="sub">Slipp inn dokumenter – appen leser dem og foreslår type, bygg og system. Du godkjenner før noe arkiveres.</p></div>
      {S.eiendommer.length > 1 && <select value={valgtE} onChange={e => setValgtE(e.target.value)} title="Brukes når dokumentet ikke sier hvilket bygg det gjelder"><option value="">Eiendom: finn automatisk</option>{sortBy(S.eiendommer, e => e.navn).map(e => <option key={e.id} value={e.id}>{e.navn}</option>)}</select>}</div>
    <div className={'card ib-slipp' + (drag ? ' drag' : '')} onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files?.length) leggTil(e.dataTransfer.files); }} onClick={() => filInput.current?.click()}>
      <input ref={filInput} type="file" multiple hidden onChange={e => { if (e.target.files?.length) leggTil(e.target.files); e.target.value = ''; }} />
      <b>Slipp filer her eller klikk for å velge</b>
      <div className="small muted">PDF, bilder (skannet/fotografert), Word, tekst og tegninger. Dokumentene leses her i nettleseren og sendes ikke til noen AI-tjeneste. Filen lastes opp til appens lagring først når du arkiverer.</div>
    </div>
    {lastet && !P.length && <div className="card"><Empty t="Innboksen er tom" /></div>}
    {P.length > 0 && <div className="toolbar" style={{ margin: '14px 0 8px' }}><h2 style={{ margin: 0, flex: 1 }}>{P.length} dokument{P.length === 1 ? '' : 'er'} venter</h2>
      {klare.length > 1 && <button className="btn pri" onClick={arkiverKlare} title="Dokumenter der appen er sikker på type og eiendom (ikke servicerapporter og tilsyn, som åpner egne skjema)">Arkiver {klare.length} sikre forslag</button>}</div>}
    {P.map(p => <PostKort key={p.id} p={p} oppd={x => oppd(p.id, { v: { ...p.v, ...x } })} arkiver={() => arkiver(p)} fjern={() => fjern(p.id)} ocr={() => kjorOcr(p)} />)}
  </>;
}

const kontrollListe = (p: Post) => ['Servicerapport', 'Egenkontrollskjema'].includes(p.v?.type || '') ? kontrollerFor(p.v?.anleggId || '', p.v!.type!, p.linjer, p.navn, p.v?.dato) : [];
/** Valgt kontroll: brukerens valg (også «ingen»), ellers beste forslag */
function valgtKontroll(p: Post) { const L = kontrollListe(p); const k = p.v?.kontrollId; if (k === '-') return null; return (k && L.find(x => x.o.id === k)?.o) || L[0]?.o || null; }
function PostKort({ p, oppd, arkiver, fjern, ocr }: { p: Post; oppd: (x: Partial<Tolkning> & { notat?: string; kontrollId?: string }) => void; arkiver: () => Promise<boolean>; fjern: () => void; ocr: () => void }) {
  const [url, setUrl] = useState(''); const [vis, setVis] = useState(false); const [busy, setBusy] = useState(false);
  useEffect(() => { const u = URL.createObjectURL(p.blob); setUrl(u); return () => URL.revokeObjectURL(u); }, [p.blob]);
  const v = p.v || {}; const t = p.t;
  const sys = sortBy(S.anlegg.filter(a => !a.arkivert && a.eiendomId === v.eiendomId), a => aNavn(a.id));
  const lt = sortBy(S.leietakere.filter(l => l.eiendomId === v.eiendomId), l => l.navn);
  const KL = kontrollListe(p); const kontroll = valgtKontroll(p); const forslag = KL[0];
  const sikker = (s: number) => <span className={'chip ' + (s >= 0.75 ? 'green' : s >= 0.5 ? 'amber' : 'plain')} style={{ fontSize: 11 }}>{Math.round(s * 100)} %</span>;
  const g = (s?: string) => s ? <span className="small muted"> · {s}</span> : null;
  const visSys = TYPER_MED_SYSTEM.includes(v.type || '') || !!v.anleggId; const visLt = KONFIDENSIELLE.includes(v.type || '') && v.type !== 'Forsikringspolise';
  const knapp = kontroll ? 'Arkiver og registrer kontrollen' : v.type === 'Tilsynsrapport' ? 'Arkiver og registrer tilsynssak' : 'Arkiver';
  return <div className="card ib-post">
    <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
      <b style={{ flex: 1, wordBreak: 'break-all' }}>{p.navn}</b><span className="small muted">{kb(p.str)}</span>
      {url && <a className="small" href={url} target="_blank" rel="noreferrer">Åpne</a>}
      <button className="btn ghost sm" onClick={fjern} title="Fjern fra innboksen uten å arkivere">✕</button></div>
    {(p.status === 'ny' || p.status === 'leser') && <p className="small muted">Leser dokumentet …</p>}
    {p.status === 'ocr' && <div className="small" style={{ margin: '6px 0' }}>Tekstgjenkjenning … {Math.round((p.ocrP || 0) * 100)} %<div style={{ height: 5, background: 'var(--line)', borderRadius: 3, marginTop: 4 }}><div style={{ width: `${Math.round((p.ocrP || 0) * 100)}%`, height: 5, background: 'var(--acc)', borderRadius: 3 }} /></div></div>}
    {p.status === 'klar' && t && <>
      {p.feil && <div className="note small">{p.feil}</div>}
      {p.tom && p.kanOcr && !p.ocrBrukt && <div className="note small" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span style={{ flex: 1 }}>Dokumentet er et bilde/skann uten tekst. Forslagene bygger bare på filnavnet.</span><button className="btn sm pri" onClick={ocr}>Les med tekstgjenkjenning</button></div>}
      {p.tom && !p.kanOcr && <div className="note small">Appen kan ikke lese innholdet i denne filtypen – fyll inn feltene selv.</div>}
      <div className="pa-grid" style={{ marginTop: 6 }}>
        <label className="pa-felt half"><span>Dokumenttype {t.type === v.type && t.typeScore > 0 && sikker(t.typeScore)}{t.type === v.type && t.typeGrunn.length > 0 && g('fant «' + t.typeGrunn.slice(0, 3).join('», «') + '»')}</span>
          <select value={v.type} onChange={e => oppd({ type: e.target.value })}>{DOK_TYPER.map(x => <option key={x}>{x}</option>)}</select>
          {t.alt.length > 0 && t.type === v.type && t.typeScore < 0.75 && <span className="small">Eller: {t.alt.map(([a]) => <a key={a} href="#" onClick={e => { e.preventDefault(); oppd({ type: a }); }} style={{ marginRight: 8 }}>{a}</a>)}</span>}</label>
        <label className="pa-felt half"><span>Eiendom{t.eiendomId === v.eiendomId && g(t.eGrunn)}</span>
          <select value={v.eiendomId || ''} onChange={e => oppd({ eiendomId: e.target.value, anleggId: '', leietakerId: '' })}><option value="">– velg –</option>{sortBy(S.eiendommer.filter(e => kanDrifteE(e.id)), e => e.navn).map(e => <option key={e.id} value={e.id}>{e.navn}</option>)}</select></label>
        {(visSys || sys.length > 0) && <label className="pa-felt half"><span>System{t.anleggId && t.anleggId === v.anleggId && g(t.aGrunn)}{t.tfm.length > 0 && !v.anleggId && g('fant kode ' + t.tfm.join(', ') + ' – finnes ikke i TFM-registeret')}</span>
          <select value={v.anleggId || ''} onChange={e => oppd({ anleggId: e.target.value, kontrollId: '' })}><option value="">– ingen –</option>{sys.map(a => <option key={a.id} value={a.id}>{aNavn(a.id)}</option>)}</select></label>}
        {visLt && <label className="pa-felt half"><span>Leietaker{t.leietakerId === v.leietakerId && g(t.lGrunn)}</span>
          <select value={v.leietakerId || ''} onChange={e => oppd({ leietakerId: e.target.value })}><option value="">– felles for bygget –</option>{lt.map(l => <option key={l.id} value={l.id}>{l.navn}</option>)}</select></label>}
        <label className="pa-felt"><span>Tittel</span><input value={v.tittel || ''} onChange={e => oppd({ tittel: e.target.value })} /></label>
        <label className="pa-felt half"><span>Dokumentdato{t.dato && t.dato === v.dato && g('lest fra dokumentet')}</span><input type="date" value={v.dato || ''} onChange={e => oppd({ dato: e.target.value })} /></label>
        <label className="pa-felt half"><span>Gyldig til / revideres{t.gyldigTil && t.gyldigTil === v.gyldigTil && g(v.type === 'Energiattest' ? '10 år' : '5 år')}</span><input type="date" value={v.gyldigTil || ''} onChange={e => oppd({ gyldigTil: e.target.value })} /></label>
      </div>
      {t.leverandor && <p className="small muted" style={{ margin: '2px 0' }}>Avsender/leverandør: {t.leverandor}</p>}
      {KL.length > 0 && <div className="note small" style={{ color: 'var(--ink)' }}>
        <label className="pa-felt" style={{ margin: 0 }}><span>Kontroll rapporten gjelder{kontroll && forslag && kontroll.id === forslag.o.id && !v.kontrollId && (forslag.grunn ? <span className="muted"> · forslag: {forslag.grunn}</span> : <span className="muted"> · usikkert forslag – kontroller</span>)}</span>
          <select value={v.kontrollId || kontroll?.id || '-'} onChange={e => oppd({ kontrollId: e.target.value })}>
            {KL.map(({ o }) => <option key={o.id} value={o.id}>{o.navn}{o.nesteFrist ? ` – frist ${fd(o.nesteFrist)}` : ''}</option>)}
            <option value="-">Ingen av disse – arkiver bare som dokument</option></select></label>
        {kontroll ? <span className="muted">«Arkiver» åpner utkvitteringen av kontrollen med rapporten vedlagt – der kan du trykke «Les avvik fra rapporten».</span> : <span className="muted">Rapporten arkiveres som dokument på systemet uten å kvittere ut en kontroll.</span>}</div>}
      {['Servicerapport', 'Egenkontrollskjema'].includes(v.type || '') && !KL.length && <div className="note small">{v.anleggId ? 'Systemet har ingen aktive kontroller – rapporten arkiveres som dokument på systemet.' : 'Velg systemet for å koble rapporten til en kontroll og lese avvik. Uten system arkiveres den som et vanlig dokument.'}</div>}
      {v.type === 'Tegninger (plan/snitt/fasade)' && <p className="small muted">Plantegninger med målestokk kan i tillegg lastes inn under «Tegninger og arealer» for arealberegning og plassering av komponenter.</p>}
      {KONFIDENSIELLE.includes(v.type || '') && <p className="small muted">Fortrolig dokumenttype – vises ikke for teknikere og servicefirma.</p>}
      <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
        <button className="btn pri sm" disabled={busy || !v.eiendomId} onClick={async () => { setBusy(true); await arkiver(); setBusy(false); }}>{busy ? 'Arkiverer …' : knapp}</button>
        {p.linjer && p.linjer.length > 0 && <a href="#" className="small" onClick={e => { e.preventDefault(); setVis(!vis); }}>{vis ? 'Skjul' : 'Vis'} tekst ({p.linjer.length} linjer{p.ocrBrukt ? ', tekstgjenkjent' : ''})</a>}</div>
      {vis && <pre className="small" style={{ whiteSpace: 'pre-wrap', maxHeight: 220, overflow: 'auto', background: 'var(--surface2)', padding: 8, borderRadius: 6 }}>{p.linjer!.slice(0, 200).join('\n')}</pre>}
    </>}
  </div>;
}
