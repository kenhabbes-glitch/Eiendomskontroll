import React, { useEffect, useRef, useState } from 'react';
import { sokAdresse, sokEnhet, matrikkelTekst, enhetStatus, type Adresse, type Enhet } from '../lib/oppslag';
import { Chip } from './ui';

function useSok<T>(fn: (q: string) => Promise<T[]>) {
  const [q, setQ] = useState(''); const [res, setRes] = useState<T[]>([]); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [open, setOpen] = useState(false);
  const seq = useRef(0);
  useEffect(() => {
    if (q.trim().length < 3) { setRes([]); setErr(''); return; }
    const my = ++seq.current; setBusy(true);
    const t = setTimeout(async () => {
      try { const r = await fn(q); if (my === seq.current) { setRes(r); setErr(r.length ? '' : 'Ingen treff'); setOpen(true); } }
      catch { if (my === seq.current) setErr('Oppslaget feilet – prøv igjen'); }
      finally { if (my === seq.current) setBusy(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [q]);
  return { q, setQ, res, busy, err, open, setOpen };
}

const box: React.CSSProperties = { position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 4, background: '#fff', border: '1px solid var(--line2)', borderRadius: 8, boxShadow: 'var(--shadow)', zIndex: 20, maxHeight: 300, overflow: 'auto' };
const item: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid var(--line)', cursor: 'pointer' };

export function AdresseSok({ onPick }: { onPick: (a: Adresse) => void }) {
  const s = useSok(sokAdresse);
  return <div style={{ position: 'relative' }}>
    <input placeholder="Søk adresse (Storgata 12 Oslo) eller gnr/bnr (Oslo 207/123)" value={s.q} onChange={e => s.setQ(e.target.value)} onFocus={() => s.setOpen(true)} onBlur={() => setTimeout(() => s.setOpen(false), 200)} />
    <div className="hint">{s.busy ? 'Søker i Kartverkets adresseregister …' : s.err || 'Fyller ut adresse, postnummer, kommune og gnr/bnr fra Kartverket (matrikkelen)'}</div>
    {s.open && s.res.length > 0 && <div style={box}>{s.res.map((a, i) => <div key={i} style={item} onMouseDown={e => e.preventDefault()} onClick={() => { onPick(a); s.setOpen(false); s.setQ(''); }}>
      <b style={{ fontWeight: 500 }}>{a.adressetekst}</b>, {a.postnummer} {a.poststed}<div className="small muted">{a.kommunenavn} kommune ({a.kommunenummer}) · gnr/bnr {matrikkelTekst(a) || '–'}</div></div>)}</div>}
  </div>;
}

export function EnhetSok({ onPick, ph = 'Søk firmanavn eller org.nr. i Brønnøysundregistrene' }: { onPick: (e: Enhet) => void; ph?: string }) {
  const s = useSok(sokEnhet);
  return <div style={{ position: 'relative' }}>
    <input placeholder={ph} value={s.q} onChange={e => s.setQ(e.target.value)} onFocus={() => s.setOpen(true)} onBlur={() => setTimeout(() => s.setOpen(false), 200)} />
    <div className="hint">{s.busy ? 'Søker i Enhetsregisteret …' : s.err || 'Henter org.nr., adresse, bransje, daglig leder og status fra Brønnøysundregistrene'}</div>
    {s.open && s.res.length > 0 && <div style={box}>{s.res.map(e => { const st = enhetStatus(e); return <div key={e.orgnr} style={item} onMouseDown={ev => ev.preventDefault()} onClick={() => { onPick(e); s.setOpen(false); s.setQ(''); }}>
      <b style={{ fontWeight: 500 }}>{e.navn}</b> <span className="mono small muted">{e.orgnr}</span> {st.c !== 'green' && <Chip c={st.c}>{st.t}</Chip>}
      <div className="small muted">{[e.orgform, e.naering, e.adresse].filter(Boolean).join(' · ')}</div></div>; })}</div>}
  </div>;
}
