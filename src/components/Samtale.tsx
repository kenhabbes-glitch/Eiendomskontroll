// Toveis samtale mellom utleier og leietaker, enten generelt eller knyttet til et avvik.
// Utleiersiden velger per melding om leietakeren skal se den (ellers er den et internt notat).
import { useCallback, useEffect, useState } from 'react';
import { isTenant, kanDrifteE, sb, state, toast, useStore } from '../lib/store';
import { byId } from '../lib/utils';
import { tt, lokale } from '../lib/i18n';

export type Melding = { id: string; eiendom_id: string; leietaker_id: string; avvik_id: string | null; created_at: string; data: { tekst: string; rolle: 'utleier' | 'leietaker'; av?: string; synlig?: boolean; lest?: boolean } };
const SIST_SETT = 'ek_samtale_sett_';

export function Samtale({ eiendomId, leietakerId, avvikId }: { eiendomId: string; leietakerId: string; avvikId?: string }) {
  useStore();
  const leietaker = isTenant(); const kanSkrive = leietaker || kanDrifteE(eiendomId);
  const [M, setM] = useState<Melding[] | null>(null); const [tekst, setTekst] = useState(''); const [synlig, setSynlig] = useState(true); const [busy, setBusy] = useState(false);
  const last = useCallback(async () => {
    const { data, error } = await sb.from('meldinger').select('*').eq('leietaker_id', leietakerId).order('created_at', { ascending: true }).limit(500);
    if (error) { setM([]); return; }
    const L = ((data as Melding[]) || []).filter(m => (avvikId ? m.avvik_id === avvikId : !m.avvik_id)); setM(L);
    if (leietaker) { try { localStorage.setItem(SIST_SETT + leietakerId + (avvikId || ''), String(Date.now())); } catch { } }
    else { // utleier har sett meldingene fra leietaker
      const ul = L.filter(m => m.data.rolle === 'leietaker' && !m.data.lest);
      for (const m of ul) await sb.from('meldinger').update({ data: { ...m.data, lest: true } }).eq('id', m.id);
      if (ul.length) window.dispatchEvent(new Event('ek-meldinger'));
    }
  }, [leietakerId, avvikId, leietaker]);
  useEffect(() => { last(); const t = setInterval(last, 30000); return () => clearInterval(t); }, [last]);
  const send = async () => {
    const t = tekst.trim(); if (!t) return; setBusy(true);
    const { error } = await sb.from('meldinger').insert({ eiendom_id: eiendomId, leietaker_id: leietakerId, avvik_id: avvikId || null,
      data: { tekst: t.slice(0, 4000), rolle: leietaker ? 'leietaker' : 'utleier', av: state.me?.navn || state.me?.epost, synlig: leietaker ? true : synlig, lest: !leietaker ? true : false } });
    setBusy(false); if (error) return toast(tt("Meldingen ble ikke sendt: {0}", error.message));
    setTekst(''); await last(); window.dispatchEvent(new Event('ek-meldinger'));
  };
  const slett = async (m: Melding) => { const { error } = await sb.from('meldinger').delete().eq('id', m.id); if (error) return toast(error.message); last(); };
  return <div>
    {M === null ? <p className="muted small">{tt("Laster …")}</p> : M.length ? <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '45vh', overflow: 'auto', marginBottom: 10 }}>
      {M.map(m => { const mine = leietaker ? m.data.rolle === 'leietaker' : m.data.rolle === 'utleier'; const skjult = m.data.synlig === false;
        return <div key={m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '85%', background: skjult ? 'var(--amber-bg, #fff4d6)' : mine ? 'var(--accent-bg, #e3f1ec)' : 'var(--panel2, #f1f1f1)', borderRadius: 10, padding: '7px 11px' }}>
          <div className="small muted">{m.data.av || (m.data.rolle === 'utleier' ? tt("Utleier") : tt("Leietaker"))} · {new Date(m.created_at).toLocaleString(lokale(), { dateStyle: 'short', timeStyle: 'short' })}{skjult && <b> · {tt("Internt – skjult for leietaker")}</b>}</div>
          <div style={{ whiteSpace: 'pre-wrap' }}>{m.data.tekst}</div>
          {!leietaker && kanSkrive && <button className="btn sm ghost" style={{ padding: 0, fontSize: 11 }} onClick={() => slett(m)}>{tt("Slett")}</button>}
        </div>; })}
    </div> : <p className="muted small">{tt("Ingen meldinger ennå.")}</p>}
    {kanSkrive && <>
      <textarea style={{ width: '100%' }} rows={3} maxLength={4000} value={tekst} onChange={e => setTekst(e.target.value)} placeholder={leietaker ? tt("Skriv en melding til utleier …") : tt("Skriv en melding …")} />
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
        {!leietaker && <label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={synlig} onChange={e => setSynlig(e.target.checked)} />{tt("Vis for leietaker")}</label>}
        {!leietaker && !synlig && <span className="small muted">{tt("Lagres som internt notat. Leietakeren ser det ikke.")}</span>}
        <button className="btn pri" style={{ marginLeft: 'auto' }} disabled={busy || !tekst.trim()} onClick={send}>{tt("Send")}</button>
      </div></>}
  </div>;
}

/** Antall uleste meldinger fra leietakere (utleiersiden) eller nye svar fra utleier (leietakersiden). */
export function useUlesteMeldinger(): number {
  const [n, setN] = useState(0); const leietaker = isTenant(); const uid = state.me?.id;
  useEffect(() => {
    if (!uid) return; let on = true;
    const hent = async () => {
      const { data } = await sb.from('meldinger').select('*').order('created_at', { ascending: false }).limit(300);
      if (!on) return; const L = (data as Melding[]) || [];
      if (leietaker) setN(L.filter(m => m.data.rolle === 'utleier' && new Date(m.created_at).getTime() > +(localStorage.getItem(SIST_SETT + m.leietaker_id + (m.avvik_id || '')) || 0)).length);
      else setN(L.filter(m => m.data.rolle === 'leietaker' && !m.data.lest && kanDrifteE(m.eiendom_id)).length);
    };
    hent(); const t = setInterval(hent, 60000); window.addEventListener('ek-meldinger', hent);
    return () => { on = false; clearInterval(t); window.removeEventListener('ek-meldinger', hent); };
  }, [uid, leietaker]);
  return n;
}
export const leietakerNavn = (id: string) => byId('leietakere', id)?.navn || '';
