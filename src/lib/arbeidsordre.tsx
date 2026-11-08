// Arbeidsordre: avvik med plassering på tegning, tildeling, e-post, PDF og utkvittering.
import React, { useEffect, useState } from 'react';
import { KOMP } from './catalog';
import { S, aoApi, canEdit, fileUrl, isStaff, loggHendelse, save, sb, state, toast, uploadFile, useStore, type Fil } from './store';
import { byId, fd, sortBy, tfmKomp, tfmSys, today, type Rec } from './utils';
import { openModal, useFileUrl } from '../components/ui';
import { Doc, INK, MUTED, RED, LINE } from './arealRapport';
import { openPlan } from '../views/Arealer';

const navnPaa = (id?: string) => { if (!id) return ''; if (id === state.me?.id) return state.me?.navn || state.me?.epost || ''; const p = S.profiles.find(x => x.id === id); return p ? p.navn || p.epost : ''; };
export const tildeltNavn = navnPaa;
const meg = () => state.me?.navn || state.me?.epost || '';
const nyLogg = (a: Rec, k: string, status?: string) => [...(a.logg || []), { t: new Date().toISOString(), s: status || a.status, k, av: meg() }];

/** Fryser stedsinformasjon på avviket, så eksterne ser den uten tilgang til eiendomsdata */
export function aoSnapshot(a: Rec) {
  const e = byId('eiendommer', a.eiendomId); const kc = a.komponentId ? byId('komponenter', a.komponentId) : null;
  const sys = byId('anlegg', kc?.anleggId || a.anleggId) as any; const t = a.pos ? byId('tegninger', a.pos.tegningId) : null;
  return { eiendom: e?.navn || a.ao?.eiendom || '', adresse: [e?.adresse, e?.poststed].filter(Boolean).join(', ') || a.ao?.adresse || '',
    system: sys ? `${tfmSys(sys, true)} ${sys.navn || KOMP[sys.type]?.n || ''}`.trim() : a.ao?.system || '', komponent: kc ? `${tfmKomp(kc, true)} ${kc.navn || ''}`.trim() : a.ao?.komponent || '',
    tegning: t?.navn || a.ao?.tegning || '', plassering: a.plassering || kc?.plassering || a.ao?.plassering || '' };
}
async function lagreAvvik(id: string, endr: (a: Rec) => Rec) { const a = byId('avvik', id)!; const n = endr({ ...a }); n.ao = aoSnapshot(n); await save('avvik', n); return n; }

export async function tildel(id: string, uid: string) {
  const a = byId('avvik', id)!; if ((a.tildeltId || '') === uid) return;
  await lagreAvvik(id, x => ({ ...x, tildeltId: uid || '', logg: nyLogg(x, uid ? `Tildelt ${navnPaa(uid)}` : `Tildeling fjernet (${navnPaa(a.tildeltId)})`) }));
  toast(uid ? 'Tildelt ' + navnPaa(uid) : 'Tildeling fjernet');
}
export async function settStatus(id: string, status: string, k: string, ekstra: any = {}) {
  await lagreAvvik(id, x => ({ ...x, ...ekstra, status, logg: nyLogg(x, k, status) }));
}
export async function lastOppAo(id: string, filer: FileList | File[]) {
  const a = byId('avvik', id)!; const nye: Fil[] = [];
  for (const f of Array.from(filer)) { const r = await uploadFile(f, a.eiendomId, undefined, undefined, 'ao/' + a.id); if (r) nye.push(r); }
  if (!nye.length) return [];
  await lagreAvvik(id, x => ({ ...x, vedlegg: [...(x.vedlegg || []), ...nye], logg: nyLogg(x, `Lastet opp ${nye.length} fil${nye.length > 1 ? 'er' : ''}: ${nye.map(f => f.navn).join(', ')}`) }));
  toast(`${nye.length} fil${nye.length > 1 ? 'er' : ''} lastet opp`); return nye;
}
export const aoLenke = (id: string) => `${location.origin}/#/arbeidsordre/${id}`;

// ---------------- Tegningsutsnitt (SVG, brukes i appen)
export function AoKart({ a, h = 260 }: { a: Rec; h?: number }) {
  const t = a.pos ? byId('tegninger', a.pos.tegningId) : null; const u = useFileUrl(t?.fil?.path);
  if (!a.pos) return <div className="note small muted">Avviket er ikke plassert på tegning.{a.ao?.plassering ? ' Plassering: ' + a.ao.plassering : ''}</div>;
  if (!t) return <div className="note small muted">Plassert på {a.ao?.tegning || 'tegning'} (tegningen er ikke tilgjengelig).</div>;
  const W = t.w || 1000, H = t.h || 800; const s = Math.max(W, H) * 0.32; const x0 = Math.max(0, Math.min(W - s, a.pos.x - s / 2)), y0 = Math.max(0, Math.min(H - s * 0.6, a.pos.y - s * 0.3)); const R0 = s / 38;
  return <div style={{ position: 'relative', border: '1px solid var(--line2)', borderRadius: 8, overflow: 'hidden', background: '#fff', cursor: 'zoom-in' }} onClick={() => openPlan(t.id, { mode: 'tfm', focus: a.id })} title="Åpne hele tegningen">
    <svg viewBox={`${x0} ${y0} ${s} ${s * 0.6}`} style={{ width: '100%', height: h, display: 'block' }} preserveAspectRatio="xMidYMid meet">
      {u && <image href={u} x={0} y={0} width={W} height={H} />}
      <circle cx={a.pos.x} cy={a.pos.y} r={R0 * 3.2} fill="#b42318" fillOpacity={.15} />
      <path d={`M${a.pos.x} ${a.pos.y - R0 * 1.25} L${a.pos.x + R0 * 1.15} ${a.pos.y + R0 * .75} L${a.pos.x - R0 * 1.15} ${a.pos.y + R0 * .75} Z`} fill="#b42318" stroke="#fff" strokeWidth={R0 * .2} />
    </svg>
    <div className="small" style={{ position: 'absolute', left: 8, bottom: 6, background: 'rgba(255,255,255,.9)', padding: '2px 8px', borderRadius: 6 }}>{t.navn} · klikk for hele tegningen</div>
  </div>;
}

// ---------------- Tegningsutsnitt (JPEG, brukes i PDF)
async function tegnUtsnitt(t: Rec, pos: { x: number; y: number }, zoom: boolean) {
  const url = await fileUrl(t.fil.path); const r = await fetch(url); if (!r.ok) throw new Error('Kunne ikke hente tegningen'); const bmp = await createImageBitmap(await r.blob());
  const W0 = t.w || bmp.width, H0 = t.h || bmp.height;
  let sx = 0, sy = 0, sw = W0, sh = H0;
  if (zoom) { sw = Math.max(W0, H0) * 0.45; sh = sw * 0.6; sx = Math.max(0, Math.min(W0 - sw, pos.x - sw / 2)); sy = Math.max(0, Math.min(H0 - sh, pos.y - sh / 2)); }
  const sc = Math.min(1800 / sw, 1800 / sh, zoom ? 4 : 1); const cw = Math.round(sw * sc), ch = Math.round(sh * sc);
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch; const g = cv.getContext('2d')!;
  g.fillStyle = '#fff'; g.fillRect(0, 0, cw, ch); const kx = bmp.width / W0, ky = bmp.height / H0;
  g.drawImage(bmp, sx * kx, sy * ky, sw * kx, sh * ky, 0, 0, cw, ch);
  const px = (pos.x - sx) * sc, py = (pos.y - sy) * sc; const R0 = Math.max(cw, ch) / (zoom ? 32 : 55);
  g.fillStyle = 'rgba(180,35,24,.16)'; g.beginPath(); g.arc(px, py, R0 * 3, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(px, py - R0 * 1.25); g.lineTo(px + R0 * 1.15, py + R0 * .75); g.lineTo(px - R0 * 1.15, py + R0 * .75); g.closePath(); g.fillStyle = '#b42318'; g.fill(); g.lineWidth = R0 * .18; g.strokeStyle = '#fff'; g.stroke();
  g.fillStyle = '#fff'; g.font = `bold ${R0 * 1.2}px Helvetica, Arial`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('!', px, py + R0 * .05);
  const blob: Blob = await new Promise((res, rej) => cv.toBlob(b => b ? res(b) : rej(new Error('bilde')), 'image/jpeg', 0.86));
  return { data: new Uint8Array(await blob.arrayBuffer()), w: cw, h: ch };
}

// ---------------- Arbeidsordre som PDF
export async function aoPdf(id: string) {
  const a = byId('avvik', id)!; const ao = aoSnapshot(a); const t = a.pos ? byId('tegninger', a.pos.tegningId) : null;
  const D = await Doc.ny(`Arbeidsordre – avvik #${a.nr}`); D.nyside(); const W = D.page.getWidth(); const M = 44;
  D.t('ARBEIDSORDRE', M, D.y - 10, 8.5, RED, true); D.y -= 18;
  D.t(D.fit(`Avvik #${a.nr}: ${a.tittel || ''}`, W - 2 * M, 17, true), M, D.y - 17, 17, INK, true); D.y -= 30;
  const rader: [string, string][] = [['Eiendom', [ao.eiendom, ao.adresse].filter(Boolean).join(', ')], ['System', ao.system], ['Komponent', ao.komponent], ['Plassering', [ao.tegning, ao.plassering].filter(Boolean).join(' – ')],
    ['Alvorlighet', a.alv || ''], ['Status', a.status || ''], ['Frist', a.frist ? fd(a.frist) : ''], ['Utbedres av', a.ansvar === 'Leverandør/entreprenør' ? a.utbedresAv || 'Leverandør' : a.ansvar === 'Leietaker' ? 'Leietaker' : a.ansvar === 'Felles' ? 'Felles (eier og leietaker)' : 'Eier / drift'],
    ['Tildelt', navnPaa(a.tildeltId)], ['Oppdaget', a.oppdaget ? fd(a.oppdaget) : ''], ['Meldt av / kilde', [a.meldtAv, a.kilde].filter(Boolean).join(' · ')]];
  D.tabell([['Detaljer', 1.3], ['', 4]], rader.filter(r => r[1]).map(r => ({ c: [r[0], r[1]] })));
  if (a.beskrivelse) { D.h2('Beskrivelse og tiltak'); D.p(a.beskrivelse, 9.5, INK); }
  if (t) {
    try {
      const z = await tegnUtsnitt(t, a.pos, true); const o = await tegnUtsnitt(t, a.pos, false);
      D.h2('Plassering på tegning – ' + t.navn);
      const zi = await D.pdf.embedJpg(z.data); const zw = W - 2 * M; const zh = zw * z.h / z.w; D.plass(zh + 10);
      D.page.drawImage(zi, { x: M, y: D.y - zh, width: zw, height: zh }); D.page.drawRectangle({ x: M, y: D.y - zh, width: zw, height: zh, borderColor: LINE, borderWidth: 0.6 }); D.y -= zh + 8;
      const oi = await D.pdf.embedJpg(o.data); const ow = (W - 2 * M) * 0.55; const oh = ow * o.h / o.w; D.plass(oh + 24);
      D.t('Oversikt', M, D.y - 9, 8.5, MUTED, true); D.y -= 13;
      D.page.drawImage(oi, { x: M, y: D.y - oh, width: ow, height: oh }); D.page.drawRectangle({ x: M, y: D.y - oh, width: ow, height: oh, borderColor: LINE, borderWidth: 0.6 }); D.y -= oh + 8;
    } catch { D.p('Tegningen kunne ikke hentes.', 9, RED); }
  }
  D.h2('Utført');
  D.p(`Kvitter ut digitalt (med bilder og dokumentasjon) via lenken: ${aoLenke(a.id)}`, 9, INK);
  D.plass(70); ['Utført dato', 'Utført av', 'Kommentar'].forEach((l, i) => { const y = D.y - 22 - i * 22; D.t(l, M, y + 4, 8.5, MUTED); D.page.drawLine({ start: { x: M + 90, y }, end: { x: W - M, y }, thickness: 0.5, color: LINE }); }); D.y -= 80;
  return await D.pdf.save();
}
export async function lastNedAoPdf(id: string) {
  const a = byId('avvik', id)!; toast('Lager arbeidsordre …');
  try { const b = await aoPdf(id); const u = URL.createObjectURL(new Blob([b as any], { type: 'application/pdf' })); const el = document.createElement('a'); el.href = u; el.download = `Arbeidsordre avvik ${a.nr}.pdf`; document.body.appendChild(el); el.click(); el.remove(); setTimeout(() => URL.revokeObjectURL(u), 20000);
    await loggHendelse(`Arbeidsordre (PDF) for avvik #${a.nr} lastet ned`, a.id, a.eiendomId); }
  catch (e: any) { toast('Kunne ikke lage PDF: ' + (e?.message || e)); }
}
const tilBase64 = (b: Uint8Array) => { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };

// ---------------- Send arbeidsordre på e-post
export function sendAo(id: string, varsle = false, epost = '') { openModal({ render: close => <SendAo id={id} varsle={varsle} epost={epost} close={close} /> }); }
function SendAo({ id, varsle, epost = '', close }: { id: string; varsle: boolean; epost?: string; close: () => void }) {
  const a = byId('avvik', id)!; const tp = a.tildeltId ? S.profiles.find(p => p.id === a.tildeltId) : null;
  const [ep, setEp] = useState(varsle ? tp?.epost || '' : epost); const [m, setM] = useState(''); const [pdf, setPdf] = useState(true); const [busy, setBusy] = useState(false); const [res, setRes] = useState<any>(null);
  const send = async () => {
    setBusy(true);
    try {
      await lagreAvvik(id, x => x); // oppdater stedsinformasjonen før sending
      const pdfB = pdf ? tilBase64(await aoPdf(id)) : undefined;
      const r = await aoApi({ action: varsle ? 'varsle' : 'inviter', avvik_id: id, epost: ep, melding: m, pdf: pdfB, lenkeBase: location.origin });
      setRes(r); if (r.sendt) toast('Arbeidsordren er sendt til ' + r.til);
    } catch (e: any) { toast(e.message || 'Feil'); }
    setBusy(false);
  };
  const mailto = res && !res.sendt ? `mailto:${encodeURIComponent(res.til)}?subject=${encodeURIComponent(res.emne)}&body=${encodeURIComponent(res.tekst)}` : '';
  const inp = { border: '1px solid var(--line2)', borderRadius: 8, padding: '7px 10px', width: '100%' } as any;
  return <>
    <div className="mh"><h2>{varsle ? 'Varsle tildelt på e-post' : 'Send arbeidsordre på e-post'} – avvik #{a.nr}</h2><button className="btn ghost sm" onClick={close}>✕</button></div>
    <div className="mb">
      {!res ? <>
        <p className="small" style={{ marginTop: 0 }}>{varsle ? 'Mottakeren får en e-post med lenke til arbeidsordren i appen.' : 'Mottakeren får arbeidsordren med lokasjon og en lenke. Via lenken kan vedkommende opprette bruker (eller logge inn), se plasseringen på tegningen, kvittere ut og laste opp bilder og dokumentasjon. Avviket tildeles mottakeren når lenken tas i bruk.'}</p>
        <div className="form"><div className="fld"><label>Til (e-post)</label><input style={inp} type="email" value={ep} onChange={e => setEp(e.target.value)} placeholder="tekniker@firma.no" readOnly={varsle} /></div>
          <div className="fld"><label>Melding (valgfritt)</label><textarea style={{ ...inp, minHeight: 80 }} value={m} onChange={e => setM(e.target.value)} placeholder="F.eks. Nøkkel hentes i resepsjonen. Ring Kari på 900 00 000 ved ankomst." /></div></div>
        <label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={pdf} onChange={e => setPdf(e.target.checked)} />Legg ved arbeidsordren som PDF (med tegningsutsnitt)</label>
        {!a.pos && <p className="small" style={{ color: 'var(--amber)' }}>Avviket er ikke plassert på tegning. Plasser det først om lokasjonen skal vises.</p>}
        {!a.anleggId && !a.komponentId && <p className="small" style={{ color: 'var(--amber)' }}>Avviket er ikke koblet til et system.</p>}
      </> : res.sendt ? <div className="note">E-posten er sendt til <b>{res.til}</b> og ført i loggen.</div>
        : <div className="note small" style={{ color: 'var(--ink)' }}><b>Appen har ikke e-posttjeneste satt opp ennå.</b> Arbeidsordren og lenken er laget. Klikk under for å åpne den i ditt eget e-postprogram (PDF-en må da legges ved manuelt – last den ned først).<br /><br />
          <a className="btn pri" href={mailto} onClick={() => { loggHendelse(`Arbeidsordre for avvik #${a.nr} åpnet i e-postprogram til ${res.til}`, a.id, a.eiendomId); lagreAvvik(id, x => ({ ...x, logg: nyLogg(x, `Arbeidsordre sendt fra e-postprogram til ${res.til}`) })); }}>Åpne i e-postprogram</a>{' '}
          <button className="btn" onClick={() => lastNedAoPdf(id)}>Last ned PDF</button>
          <div style={{ marginTop: 10 }}>Lenke: <span className="mono" style={{ wordBreak: 'break-all' }}>{res.lenke}</span></div>
          <div className="muted" style={{ marginTop: 8 }}>{res.grunn}. Se README for oppsett av Resend.</div></div>}
    </div>
    <div className="mf"><button className="btn" onClick={close}>{res ? 'Lukk' : 'Avbryt'}</button>{!res && <button className="btn pri" disabled={busy || !/^\S+@\S+\.\S+$/.test(ep)} onClick={send}>{busy ? 'Sender …' : 'Send'}</button>}</div>
  </>;
}

// ---------------- Arbeidsordre-panel i avviksskjemaet (ansatte)
export function AoPanel({ id, lukk }: { id: string; lukk: () => void }) {
  useStore(); const a0 = byId('avvik', id); const [tid0, setTid] = useState(''); if (!a0) return null; const a = a0; const ed = canEdit(); const staff = isStaff();
  const T = sortBy(S.tegninger.filter(t => t.eiendomId === a.eiendomId), t => +t.etasje || 0); const tid = tid0 || a.pos?.tegningId || T[0]?.id || '';
  const brukere = sortBy(S.profiles.filter(p => p.aktiv && ['admin', 'forvalter', 'tekniker', 'utforer'].includes(p.rolle)), p => (p.rolle === 'utforer' ? '1' : '0') + (p.navn || p.epost));
  const t = a.pos ? byId('tegninger', a.pos.tegningId) : null;
  return <div className="card" style={{ marginTop: 14, background: 'var(--bg2, #f6f6f4)' }}>
    <h3 style={{ marginTop: 0 }}>Arbeidsordre</h3>
    <div className="grid g2" style={{ gap: 14 }}>
      <div>
        <label className="small" style={{ fontWeight: 600 }}>Plassering på tegning</label>
        {T.length ? <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 4 }}>
          {t ? <span className="small">På <b>{t.navn}</b></span> : <span className="small muted">Ikke plassert</span>}
          {t && <button type="button" className="btn sm" onClick={() => { lukk(); openPlan(t.id, { mode: 'tfm', focus: id }); }}>Vis</button>}
          {staff && <>{T.length > 1 && <select value={tid} onChange={e => setTid(e.target.value)} style={{ border: '1px solid var(--line2)', borderRadius: 7, padding: '5px 6px', width: 'auto' }}>{T.map(x => <option key={x.id} value={x.id}>{x.navn}</option>)}</select>}
            <button type="button" className="btn sm" onClick={() => { lukk(); openPlan(tid, { mode: 'tfm', placeId: id }); }}>{t ? 'Flytt' : 'Plasser på tegning'}</button></>}
        </div> : <div className="small muted">Ingen tegninger for eiendommen.</div>}
        {a.pos && <div style={{ marginTop: 8 }}><AoKart a={a} h={150} /></div>}
      </div>
      <div>
        <label className="small" style={{ fontWeight: 600 }}>Tildelt</label>
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          <select value={a.tildeltId || ''} disabled={!staff} onChange={e => tildel(id, e.target.value)} style={{ border: '1px solid var(--line2)', borderRadius: 7, padding: '6px 8px', flex: 1 }}>
            <option value="">– ikke tildelt –</option>{brukere.map(p => <option key={p.id} value={p.id}>{(p.navn || p.epost) + (p.rolle === 'utforer' ? ' (ekstern)' : '')}</option>)}
            {a.tildeltId && !brukere.some(p => p.id === a.tildeltId) && <option value={a.tildeltId}>{navnPaa(a.tildeltId) || 'Annen bruker'}</option>}</select></div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          {staff && <button type="button" className="btn sm pri" onClick={() => sendAo(id)}>Send på e-post</button>}
          {staff && a.tildeltId && <button type="button" className="btn sm" onClick={() => sendAo(id, true)}>Varsle tildelt</button>}
          <button type="button" className="btn sm" onClick={() => lastNedAoPdf(id)}>Arbeidsordre (PDF)</button>
          <button type="button" className="btn sm" onClick={() => { lukk(); location.hash = '#/arbeidsordre/' + id; }}>Åpne arbeidsordre</button></div>
        {a.utfort && <div className="note small" style={{ marginTop: 8, color: 'var(--ink)' }}><b>Kvittert utført</b> {new Date(a.utfort.t).toLocaleString('nb-NO', { dateStyle: 'short', timeStyle: 'short' })} av {a.utfort.av}{a.utfort.komm ? ': ' + a.utfort.komm : ''}
          {ed && a.status === 'Utført – til kontroll' && <div style={{ marginTop: 6 }}><button type="button" className="btn sm pri" onClick={async () => { await settStatus(id, 'Rettet', 'Utført arbeid kontrollert og godkjent', { lukket: today() }); toast('Avviket er lukket som rettet'); }}>Godkjenn og lukk</button>{' '}
            <button type="button" className="btn sm" onClick={async () => { const k = prompt('Hva mangler? (sendes tilbake til utførende)'); if (k) await settStatus(id, 'Under utbedring', 'Sendt tilbake: ' + k); }}>Send tilbake</button></div>}</div>}
      </div>
    </div>
  </div>;
}

// ---------------- Endringslogg fra databasen
export function HendelseListe({ radId, max = 100 }: { radId: string; max?: number }) {
  const [L, setL] = useState<any[] | null>(null);
  useEffect(() => { let on = true; (async () => { try { const { data } = await sb.from('hendelseslogg').select('*').eq('rad_id', radId).order('tid', { ascending: false }).limit(max); if (on) setL(data || []); } catch { if (on) setL([]); } })(); return () => { on = false; }; }, [radId]);
  if (!L) return <p className="small muted">Laster …</p>;
  if (!L.length) return <p className="small muted">Ingen hendelser i databaseloggen ennå (krever at 003_arbeidsordre.sql er kjørt).</p>;
  return <div className="log">{L.map(h => <div key={h.id}><span className="lt">{new Date(h.tid).toLocaleString('nb-NO', { dateStyle: 'short', timeStyle: 'short' })}{h.bruker ? ' · ' + h.bruker : ''}</span> · {hendelseTekst(h)}</div>)}</div>;
}
const FELT: Record<string, string> = { status: 'status', tildelt_id: 'tildelt', pos: 'plassering', vedlegg: 'vedlegg', logg: 'logg', tittel: 'tittel', alv: 'alvorlighet', frist: 'frist', beskrivelse: 'beskrivelse', ansvar: 'ansvar', utfort: 'utført', ao: 'arbeidsordre', anleggId: 'system', komponentId: 'komponent' };
export function hendelseTekst(h: any) {
  if (h.tabell === 'hendelse') return h.tekst;
  if (h.handling !== 'endret' || !h.endringer) return `${h.handling}${h.tekst ? ' «' + h.tekst + '»' : ''}`;
  const e = h.endringer; const deler = Object.keys(e).filter(k => !['logg', 'ao'].includes(k)).map(k => { const v = e[k]; const n = FELT[k] || k;
    if (k === 'status' && v.til) return `status ${v.fra || '–'} → ${v.til}`; if (k === 'tildelt_id') return v.til ? 'tildelt ' + (navnPaa(v.til) || 'bruker') : 'tildeling fjernet';
    if (k === 'pos') return v.til ? 'plassert på tegning' : 'fjernet fra tegning'; if (k === 'vedlegg') return 'vedlegg endret';
    if (v.endret) return n + ' endret'; const f = (x: any) => x == null || x === '' ? '–' : typeof x === 'object' ? '…' : String(x).slice(0, 40); return `${n}: ${f(v.fra)} → ${f(v.til)}`; });
  return deler.length ? deler.join(', ') : 'logg oppdatert';
}
