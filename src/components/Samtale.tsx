// Samtale mellom utleier, leietaker og koblede ressurser (vaktmester, servicefirma o.l.), enten generelt eller knyttet til et avvik.
// Utleiersiden velger per melding målgruppe: alle (også leietaker), utleier og ressurser, eller internt (bare utleier).
// Samtalen kan overføres til en arbeidsordre (avvik).
import { useCallback, useEffect, useState } from 'react';
import { S, isTenant, kanDrifteE, save, sb, state, toast, uploadFile, useStore, type Fil } from '../lib/store';
import { FileLink, formModal, useFileUrl } from './ui';
import { addDays, byId, today } from '../lib/utils';
import { tt, lokale } from '../lib/i18n';

export type Mal = 'alle' | 'ressurs' | 'intern';
export type Melding = { id: string; eiendom_id: string; leietaker_id: string | null; avvik_id: string | null; created_at: string; data: { tekst: string; rolle: 'utleier' | 'leietaker' | 'ressurs'; av?: string; synlig?: boolean; til?: Mal; lest?: boolean; vedlegg?: Fil[] } };
export type Deltaker = { id: string; bruker_id: string; eiendom_id: string; leietaker_id: string | null; avvik_id: string | null };
export const malAv = (m: Melding): Mal => m.data.til || (m.data.synlig === false ? 'intern' : 'alle');
const SIST_SETT = 'ek_samtale_sett_';
const MAKS_FILER = 5, MAKS_MB = 25;
const erBilde = (f: Fil) => /^image\//.test(f.type || '') || /\.(jpe?g|png|webp|gif|heic)$/i.test(f.navn || '');
function Vedlegg({ f }: { f: Fil }) {
  const u = useFileUrl(erBilde(f) ? f.path : undefined);
  return <div style={{ marginTop: 4 }}>{erBilde(f) && u && <a href={u} target="_blank" rel="noopener noreferrer"><img src={u} alt="" style={{ maxWidth: 220, maxHeight: 160, borderRadius: 6, display: 'block', marginBottom: 2 }} /></a>}<span className="small">📎 <FileLink fil={f}>{f.navn}</FileLink></span></div>;
}
const brukerNavn = (id: string) => { const p = S.profiles.find(x => x.id === id); return p ? (p.navn || p.epost) : tt("Bruker"); };
/** Brukere som kan kobles på: ansatte, teknikere og eksterne utførende (servicefirma). */
const ressursBrukere = () => S.profiles.filter(p => p.aktiv && ['admin', 'forvalter', 'tekniker', 'utforer'].includes(p.rolle) && p.id !== state.me?.id);

export function Samtale({ eiendomId, leietakerId, avvikId }: { eiendomId: string; leietakerId?: string; avvikId?: string }) {
  useStore();
  const leietaker = isTenant(); const utleier = !leietaker && kanDrifteE(eiendomId); const ressurs = !leietaker && !utleier;
  const [M, setM] = useState<Melding[] | null>(null); const [D, setD] = useState<Deltaker[]>([]); const [tekst, setTekst] = useState(''); const [mal, setMal] = useState<Mal>(leietakerId ? 'alle' : 'ressurs');
  const [busy, setBusy] = useState(false); const [filer, setFiler] = useState<File[]>([]);
  const nokkel = SIST_SETT + (leietakerId || '') + (avvikId || '');
  const last = useCallback(async () => {
    let q = sb.from('meldinger').select('*').order('created_at', { ascending: true }).limit(500);
    q = avvikId ? q.eq('avvik_id', avvikId) : q.eq('leietaker_id', leietakerId || '');
    const { data, error } = await q; if (error) { setM([]); return; }
    const L = ((data as Melding[]) || []).filter(m => avvikId ? true : !m.avvik_id); setM(L);
    if (utleier) {
      const { data: d } = await sb.from('meldingsdeltakere').select('*').eq('eiendom_id', eiendomId); setD(((d as Deltaker[]) || []).filter(x => (avvikId ? x.avvik_id === avvikId : !x.avvik_id && x.leietaker_id === (leietakerId || null))));
      const ul = L.filter(m => m.data.rolle !== 'utleier' && !m.data.lest);
      for (const m of ul) await sb.from('meldinger').update({ data: { ...m.data, lest: true } }).eq('id', m.id);
      if (ul.length) window.dispatchEvent(new Event('ek-meldinger'));
    } else { try { localStorage.setItem(nokkel, String(Date.now())); } catch { } }
  }, [leietakerId, avvikId, utleier, nokkel, eiendomId]);
  useEffect(() => { last(); const t = setInterval(last, 30000); return () => clearInterval(t); }, [last]);
  const velg = (L: FileList | null) => {
    if (!L) return; const ny = [...filer]; for (const f of Array.from(L)) { if (f.size > MAKS_MB * 1e6) { toast(tt("«{0}» er over {1} MB", f.name, MAKS_MB)); continue; } if (ny.length >= MAKS_FILER) { toast(tt("Maks {0} filer per melding", MAKS_FILER)); break; } ny.push(f); } setFiler(ny);
  };
  const send = async () => {
    const t = tekst.trim(); if (!t && !filer.length) return; setBusy(true);
    const til: Mal = leietaker ? 'alle' : ressurs ? 'ressurs' : mal; const vedlegg: Fil[] = [];
    for (const f of filer) {
      // Filer som leietakeren ikke skal se, lagres utenfor leietakerens mappe
      const skjult = til !== 'alle';
      const o = await uploadFile(f, eiendomId, skjult ? undefined : leietakerId, undefined, skjult ? 'intern/' + (leietakerId || avvikId || 'felles') : undefined);
      if (!o) { setBusy(false); return; } vedlegg.push(o);
    }
    const { error } = await sb.from('meldinger').insert({ eiendom_id: eiendomId, leietaker_id: leietakerId || null, avvik_id: avvikId || null,
      data: { tekst: (t || tt("(vedlegg)")).slice(0, 4000), ...(vedlegg.length ? { vedlegg } : {}), rolle: leietaker ? 'leietaker' : ressurs ? 'ressurs' : 'utleier', av: state.me?.navn || state.me?.epost, til, synlig: til === 'alle', lest: !leietaker && !ressurs } });
    setBusy(false); if (error) return toast(tt("Meldingen ble ikke sendt: {0}", error.message));
    setTekst(''); setFiler([]); await last(); window.dispatchEvent(new Event('ek-meldinger'));
  };
  const slett = async (m: Melding) => { const { error } = await sb.from('meldinger').delete().eq('id', m.id); if (error) return toast(error.message); last(); };
  const koble = () => {
    const ok = new Set(D.map(d => d.bruker_id)); const opts = ressursBrukere().filter(p => !ok.has(p.id)).map(p => [p.id, (p.navn || p.epost) + (p.rolle === 'utforer' ? tt(" (ekstern)") : '')] as [string, string]);
    formModal({ title: tt("Koble på ressurs"), saveTxt: tt("Koble på"),
      top: <p className="small muted" style={{ marginTop: 0 }}>{tt("Ressursen ser meldinger du sender til «utleier og ressurser» eller «alle», og kan svare i samtalen. Interne notater ser de ikke. Finnes ikke ressursen som bruker (f.eks. et servicefirma), overfør samtalen til en arbeidsordre og send den på e-post.")}</p>,
      fields: [{ k: 'bruker', label: tt("Vaktmester, servicefirma eller annen bruker"), type: 'select', options: opts, req: true }], values: { bruker: '' },
      onSave: async v => { const { error } = await sb.from('meldingsdeltakere').insert({ eiendom_id: eiendomId, leietaker_id: leietakerId || null, avvik_id: avvikId || null, bruker_id: v.bruker }); if (error) { toast(error.message); return false; } await last(); } });
  };
  const fjern = async (d: Deltaker) => { const { error } = await sb.from('meldingsdeltakere').delete().eq('id', d.id); if (error) return toast(error.message); last(); };
  const overfor = () => {
    const kandidater = (M || []).filter(m => !avvikId); const lt = leietakerId ? byId('leietakere', leietakerId) : null;
    const forste = kandidater[0]?.data.tekst || '';
    formModal({ title: tt("Overfør til arbeidsordre"), saveTxt: tt("Opprett arbeidsordre"), wide: true,
      top: <p className="small muted" style={{ marginTop: 0 }}>{tt("Oppretter et avvik/arbeidsordre og flytter de valgte meldingene (med vedlegg) dit. Etterpå kan du tildele en bruker eller sende arbeidsordren på e-post til et servicefirma.")}</p>,
      fields: [{ k: 'tittel', label: tt("Tittel på arbeidsordren"), req: true }, { k: 'alv', label: tt("Alvorlighet"), type: 'select', options: [['Kritisk', 'Kritisk'], ['Høy', 'Høy'], ['Middels', 'Middels'], ['Lav', 'Lav']], half: true },
        { k: 'tildelt', label: tt("Tildel bruker (valgfritt)"), type: 'select', options: ressursBrukere().map(p => [p.id, (p.navn || p.epost) + (p.rolle === 'utforer' ? tt(" (ekstern)") : '')] as [string, string]), empty: tt("– ikke tildelt –"), half: true },
        { k: 'valgte', type: 'custom', label: tt("Meldinger som flyttes"), def: kandidater.map(m => m.id), render: (v: any, set: any) => <div className="note small" style={{ color: 'var(--ink)', maxHeight: 220, overflow: 'auto' }}>{kandidater.map(m => { const on = (v.valgte || []).includes(m.id);
          return <label key={m.id} style={{ display: 'flex', gap: 8, alignItems: 'start', margin: '3px 0', cursor: 'pointer', fontWeight: 400 }}><input type="checkbox" checked={on} onChange={() => set({ valgte: on ? v.valgte.filter((x: string) => x !== m.id) : [...(v.valgte || []), m.id] })} style={{ marginTop: 3 }} /><span><b>{m.data.av || m.data.rolle}</b>: {m.data.tekst.slice(0, 140)}{(m.data.vedlegg || []).length ? ' 📎' : ''}</span></label>; })}</div> } as any],
      values: { tittel: forste.slice(0, 80), alv: 'Middels', tildelt: '' },
      onSave: async v => {
        const valgte = kandidater.filter(m => (v.valgte || kandidater.map(x => x.id)).includes(m.id)); const vedl = valgte.flatMap(m => m.data.vedlegg || []);
        const av = state.me?.navn || state.me?.epost; const id = crypto.randomUUID();
        await save('avvik', { id, tittel: v.tittel, beskrivelse: valgte.map(m => `${m.data.av || ''}: ${m.data.tekst}`).join('\n\n').slice(0, 4000), eiendomId, leietakerId: leietakerId || undefined, alv: v.alv, status: 'Ny', kilde: lt ? 'Leietaker' : 'Eier/drift', ansvar: 'Eier',
          meldtAv: lt?.navn || av, oppdaget: today(), frist: addDays(today(), ({ Kritisk: 7, 'Høy': 30, Middels: 90, Lav: 365 } as any)[v.alv]), tildeltId: v.tildelt || undefined, ...(vedl.length ? { vedlegg: vedl } : {}),
          logg: [{ t: new Date().toISOString(), s: 'Ny', k: `Opprettet fra samtale (${valgte.length} meldinger)`, av }] });
        for (const m of valgte) await sb.from('meldinger').update({ avvik_id: id }).eq('id', m.id);
        toast(tt("Arbeidsordre opprettet")); await last(); window.dispatchEvent(new Event('ek-meldinger'));
        import('../lib/actions').then(a => a.editAvvik(id));
      } });
  };
  const malTekst: Record<Mal, string> = { alle: leietakerId ? tt("Alle (også leietaker)") : tt("Alle på saken"), ressurs: tt("Utleier og ressurser"), intern: tt("Internt (bare utleier)") };
  return <div>
    {utleier && <div className="small" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
      <span className="muted">{tt("Ressurser:")}</span>
      {D.length ? D.map(d => <span key={d.id} className="chip">{brukerNavn(d.bruker_id)} <a href="#" onClick={e => { e.preventDefault(); fjern(d); }} aria-label={tt("Fjern")}>✕</a></span>) : <span className="muted">{tt("ingen")}</span>}
      <button className="btn sm" onClick={koble}>{tt("+ Koble på ressurs")}</button>
      {!avvikId && !!M?.length && <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={overfor}>{tt("Overfør til arbeidsordre")}</button>}
    </div>}
    {M === null ? <p className="muted small">{tt("Laster …")}</p> : M.length ? <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '45vh', overflow: 'auto', marginBottom: 10 }}>
      {M.map(m => { const egen = m.data.rolle === (leietaker ? 'leietaker' : ressurs ? 'ressurs' : 'utleier'); const ml = malAv(m);
        return <div key={m.id} style={{ alignSelf: egen ? 'flex-end' : 'flex-start', maxWidth: '85%', background: ml === 'intern' ? 'var(--amber-bg, #fff4d6)' : ml === 'ressurs' ? 'var(--blue-bg, #e6eefb)' : egen ? 'var(--accent-bg, #e3f1ec)' : 'var(--panel2, #f1f1f1)', borderRadius: 10, padding: '7px 11px' }}>
          <div className="small muted">{m.data.av || (m.data.rolle === 'utleier' ? tt("Utleier") : m.data.rolle === 'leietaker' ? tt("Leietaker") : tt("Ressurs"))} · {new Date(m.created_at).toLocaleString(lokale(), { dateStyle: 'short', timeStyle: 'short' })}{ml !== 'alle' && <b> · {ml === 'intern' ? tt("Internt – skjult for leietaker") : tt("Ikke synlig for leietaker")}</b>}</div>
          <div style={{ whiteSpace: 'pre-wrap' }}>{m.data.tekst}</div>
          {(m.data.vedlegg || []).map((f, i) => <Vedlegg key={i} f={f} />)}
          {utleier && <button className="btn sm ghost" style={{ padding: 0, fontSize: 11 }} onClick={() => slett(m)}>{tt("Slett")}</button>}
        </div>; })}
    </div> : <p className="muted small">{tt("Ingen meldinger ennå.")}</p>}
    {(leietaker || utleier || ressurs) && <>
      <textarea style={{ width: '100%' }} rows={3} maxLength={4000} value={tekst} onChange={e => setTekst(e.target.value)} placeholder={leietaker ? tt("Skriv en melding til utleier …") : tt("Skriv en melding …")} />
      {filer.length > 0 && <div className="small" style={{ marginTop: 4 }}>{filer.map((f, i) => <span key={i} className="chip" style={{ marginRight: 4 }}>📎 {f.name} <a href="#" onClick={e => { e.preventDefault(); setFiler(filer.filter((_, j) => j !== i)); }} aria-label={tt("Fjern")}>✕</a></span>)}</div>}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
        <label className="btn sm">{tt("Legg ved fil")}<input type="file" multiple accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt" style={{ display: 'none' }} onChange={e => velg(e.target.files)} /></label>
        <label className="btn sm">{tt("Ta bilde")}<input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => velg(e.target.files)} /></label>
        {utleier && <label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>{tt("Synlig for")}
          <select value={mal} onChange={e => setMal(e.target.value as Mal)}>{(leietakerId ? ['alle', 'ressurs', 'intern'] : ['alle', 'intern'] as Mal[]).map(k => <option key={k} value={k}>{malTekst[k as Mal]}</option>)}</select></label>}
        {ressurs && <span className="small muted">{tt("Synlig for utleier og andre ressurser")}</span>}
        <button className="btn pri" style={{ marginLeft: 'auto' }} disabled={busy || (!tekst.trim() && !filer.length)} onClick={send}>{tt("Send")}</button>
      </div></>}
  </div>;
}

/** Antall uleste meldinger: nye fra leietaker/ressurser (utleier), nye fra utleier (leietaker og ressurser). */
export function useUlesteMeldinger(): number {
  const [n, setN] = useState(0); const leietaker = isTenant(); const uid = state.me?.id;
  useEffect(() => {
    if (!uid) return; let on = true;
    const hent = async () => {
      const { data } = await sb.from('meldinger').select('*').order('created_at', { ascending: false }).limit(300);
      if (!on) return; const L = (data as Melding[]) || [];
      const seen = (m: Melding) => +(localStorage.getItem(SIST_SETT + (m.leietaker_id || '') + (m.avvik_id || '')) || 0);
      setN(L.filter(m => kanDrifteE(m.eiendom_id) ? m.data.rolle !== 'utleier' && !m.data.lest : m.data.rolle === 'utleier' && new Date(m.created_at).getTime() > seen(m)).length);
    };
    hent(); const t = setInterval(hent, 60000); window.addEventListener('ek-meldinger', hent);
    return () => { on = false; clearInterval(t); window.removeEventListener('ek-meldinger', hent); };
  }, [uid, leietaker]);
  return n;
}
