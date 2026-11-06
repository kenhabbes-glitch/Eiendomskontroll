// Leser et opplastet brannkonsept (PDF) i nettleseren og foreslår verdier til brannkortet.
// Ingen KI og ingen ekstern tjeneste: teksten hentes med pdf.js og tolkes med faste mønstre for begreper som går
// igjen i brannkonsepter etter TEK17 kap. 11 (risikoklasse, brannklasse, særskilt brannobjekt, personantall,
// brannalarmanlegg, rømning, brannceller …). Alle forslag vises med side og utdrag og må godkjennes felt for felt.
import React, { useEffect, useState } from 'react';
import { S, fileUrl, loggHendelse, save, toast } from './store';
import { byId, fd, sortBy, type Rec } from './utils';
import { bv, etasjeSett, editBrannkort, RISIKOKLASSER, BRANNKLASSER, type Sone } from './brannvern';
import { confirmBox, openModal } from '../components/ui';

export const BRANNKONSEPT = 'Brannkonsept/brannteknisk dokumentasjon';
export const brannkonsepter = (eid: string) => sortBy(S.dokumenter.filter(d => d.eiendomId === eid && !d.leietakerId && d.type === BRANNKONSEPT && /\.pdf$/i.test(d.fil?.navn || d.fil?.path || '')), d => d.dato || '').reverse();

// ---------------- PDF → tekst
let pdfjsP: Promise<any> | null = null;
const script = (src: string) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Kunne ikke laste PDF-leseren')); document.head.appendChild(s); });
function pdfjs() {
  if ((window as any).pdfjsLib) return Promise.resolve((window as any).pdfjsLib);
  if (!pdfjsP) pdfjsP = (async () => { const b = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/'; await script(b + 'pdf.min.js'); const L = (window as any).pdfjsLib; L.GlobalWorkerOptions.workerSrc = b + 'pdf.worker.min.js'; return L; })();
  pdfjsP.catch(() => { pdfjsP = null; }); return pdfjsP;
}
/** Tekst per side, satt sammen til linjer ut fra posisjon */
export async function pdfTekst(path: string, status?: (s: string) => void): Promise<string[]> {
  const L = await pdfjs(); const buf = await (await fetch(await fileUrl(path))).arrayBuffer();
  const doc = await L.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise; const ut: string[] = [];
  for (let i = 1; i <= Math.min(doc.numPages, 150); i++) {
    status?.(`Leser side ${i} av ${doc.numPages} …`);
    const tc = await (await doc.getPage(i)).getTextContent(); let linje = '', y: number | null = null; const linjer: string[] = [];
    for (const it of tc.items as any[]) {
      const yy = Math.round(it.transform?.[5] ?? 0);
      if (y !== null && Math.abs(yy - y) > 3) { linjer.push(linje); linje = ''; }
      linje += (linje && !linje.endsWith(' ') && !String(it.str).startsWith(' ') ? ' ' : '') + it.str; y = yy;
      if (it.hasEOL) { linjer.push(linje); linje = ''; y = null; }
    }
    if (linje) linjer.push(linje);
    ut.push(linjer.map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n'));
  }
  return ut;
}

// ---------------- tolkning
export type Funn = { verdi: string; side: number; utdrag: string };
export type Tolkning = {
  risikoklasse: Funn[]; brannklasse: Funn[]; saerskilt?: Funn & { ja: boolean }; maksPersoner: Funn[];
  alarm: Funn[]; brannsentral: Funn[]; oppstilling: Funn[]; forutsetninger: Funn[]; soner: (Sone & { kilde: Funn[] })[]; tegn: number;
};
const kutt = (s: string, n = 220) => s.length > n ? s.slice(0, n - 1).trim() + '…' : s;
/** Setninger per side (linjer som hører sammen slås sammen) */
function setninger(sider: string[]) {
  const ut: { s: string; side: number }[] = [];
  sider.forEach((t, i) => {
    let flat = t.replace(/-\n(?=[a-zæøå])/g, '').replace(/\n(?=[a-zæøå(])/g, ' ').replace(/\n/g, ' ¶ ');
    flat = flat.replace(/\b(iht|jf|ca|bl\.a|f\.eks|pkt|nr|kap|evt|inkl|min|maks|tab|fig|ref|stk|ift|mht)\./gi, '$1\u2024'); // forkortelser deler ikke setninger
    for (const del of flat.split(/(?<=[.!?;])\s+(?=[A-ZÆØÅ0-9•–-])|\s¶\s(?=[A-ZÆØÅ•–\-\d])/)) { const s = del.replace(/¶/g, ' ').replace(/\u2024/g, '.').replace(/\s+/g, ' ').trim(); if (s.length > 6) ut.push({ s, side: i + 1 }); }
  });
  return ut;
}
const ROM = /\b(kjeller|underetasje|sokkel|loft|plan\s*-?\d+|u\d|\d{1,2}\s*\.?\s*(?:og|[-–]|til)\s*\d{1,2}\s*\.?\s*(?:etasje|etg)|\d{1,2}\s*\.\s*(?:etasje|etg)|etasje\s*\d{1,2}|(?:øvrige|resterende|andre)\s+etasjer|alle\s+etasjer)\b/gi;
/** Etasjer nevnt i en tekst → «1», «2-5», «-1» (tom hvis ingen) */
export function etasjerI(s: string): string {
  const ut: string[] = []; let m: RegExpExecArray | null; ROM.lastIndex = 0;
  while ((m = ROM.exec(s))) {
    const t = m[1].toLowerCase();
    const r = t.match(/(\d{1,2})\s*\.?\s*(?:og|[-–]|til)\s*(\d{1,2})/); if (r) { ut.push(t.includes('og') ? `${r[1]}, ${r[2]}` : `${r[1]}-${r[2]}`); continue; }
    const n = t.match(/(\d{1,2})/); if (/kjeller|underetasje|sokkel|^u/.test(t)) ut.push(n && t.startsWith('u') ? '-' + n[1] : '-1');
    else if (/plan/.test(t)) { const p = t.match(/-?\d+/); if (p) ut.push(p[0]); }
    else if (n) ut.push(n[1]);
  }
  return [...new Set(ut)].join(', ');
}
const unike = (f: Funn[]) => { const sett = new Set<string>(); return f.filter(x => { const k = x.verdi + '|' + x.utdrag; if (sett.has(k)) return false; sett.add(k); return true; }); };

export function tolk(sider: string[]): Tolkning {
  const S_ = setninger(sider); const tegn = sider.join('').length;
  const finn = (re: RegExp, gruppe = 1) => unike(S_.flatMap(({ s, side }) => { const ut: Funn[] = []; const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'); let m; while ((m = r.exec(s))) ut.push({ verdi: m[gruppe], side, utdrag: kutt(s) }); return ut; }));
  const med = (re: RegExp, maks = 4) => unike(S_.filter(x => re.test(x.s)).map(x => ({ verdi: x.s, side: x.side, utdrag: kutt(x.s) }))).slice(0, maks);
  const risikoklasse = finn(/(?:risikoklasse|\bRKL?)\s*(?:\(\s*RK\s*\))?\s*(?:er|=|:|nr\.?)?\s*([1-6])\b(?!\s*[.,]\s*\d)/i);
  const brannklasse = finn(/(?:brannklasse|\bBKL)\s*(?:\(\s*BKL\s*\))?\s*(?:er|=|:|nr\.?)?\s*([1-4])\b(?!\s*[.,]\s*\d)/i);
  const sb = S_.find(x => /særskil(?:t|te)\s+brannobjekt/i.test(x.s));
  const saerskilt = sb ? { verdi: '', side: sb.side, utdrag: kutt(sb.s), ja: !/\b(ikke|ikkje|ingen)\b[^.]{0,40}særskil|særskil[^.]{0,40}\b(ikke|nei)\b/i.test(sb.s) } : undefined;
  const maksPersoner = finn(/(?:personbelastning|persontall|personantall|antall\s+personer|maks(?:imalt|\.)?\s*(?:antall\s+)?personer|dimensjonert\s+for)\D{0,40}?(\d{1,2}(?:[ .]\d{3})|\d{1,5})\s*(?:personer|pers\.?)?/i).map(f => ({ ...f, verdi: f.verdi.replace(/[ .]/g, '') })).filter(f => +f.verdi >= 2);
  const alarm = med(/brannalarm|alarmoverf|direktevarsl|110[- ]?sentral|alarmorganisering|talevarsl|forsinket alarm/i, 5);
  const brannsentral = med(/brannsentral|nøkkelboks|nøkkelsafe|brannvesenets?\s+(?:informasjonssentral|angrepsvei|innsats)|\bBIS\b|brannpanel/i, 3);
  const oppstilling = med(/oppstillingsplass|møteplass|samlingsplass|møtested\s+ved\s+evakuering/i, 3);
  const forutsetninger = med(/branncelle|brannseksjon|sprinkl|ledesystem|ledelys|rømningsvei|trapperom|brannbelastning|lagring|brannfarlig|røykventilasjon|brannventilasjon|røykluke|branndør|ikke\s+tillatt|forutsett|forutsetning|bruksendring|innredning/i, 12);
  // klasser per etasje / del: knytt hvert treff til etasjen nærmest treffet – først teksten etter («RK 5 for 1. etasje»),
  // ellers teksten foran («1. etasje er i RK 5») – avgrenset av nabotreffene i samme setning
  const per: Record<string, { rk?: Funn; bk?: Funn; navn: string; kilde: Funn[] }> = {};
  const KL = /(?:(risikoklasse|\bRKL?)|(brannklasse|\bBKL))\s*(?:\(\s*(?:RK|BKL)\s*\))?\s*(?:er|=|:|nr\.?)?\s*([1-6])\b(?!\s*[.,]\s*\d)/gi;
  const BRUK = /\b(handel|butikk|salgslokale|forretning|kontor|lager|bolig|leilighet|servering|restaurant|hotell|parkering|garasje|undervisning|barnehage|forsamling|industri|verksted)\w*/i;
  for (const { s: st, side } of S_) {
    const treff: { i: number; slutt: number; felt: 'rk' | 'bk'; verdi: string }[] = []; let m: RegExpExecArray | null; KL.lastIndex = 0;
    while ((m = KL.exec(st))) { const felt = m[1] ? 'rk' : 'bk'; if (felt === 'bk' && +m[3] > 4) continue; treff.push({ i: m.index, slutt: m.index + m[0].length, felt, verdi: m[3] }); }
    treff.forEach((t, j) => {
      const etter = st.slice(t.slutt, j + 1 < treff.length ? treff[j + 1].i : st.length).split(/\s(?:og|samt|mens|,)\s(?=.*(?:risikoklasse|RK|brannklasse|BKL))/i)[0].slice(0, 70);
      const foran = st.slice(j > 0 ? treff[j - 1].slutt : 0, t.i).slice(-70);
      const et = etasjerI(etter) || (() => { const all = etasjerI(foran).split(', ').filter(Boolean); return all.length ? all[all.length - 1] : ''; })();
      if (!et) return; const f: Funn = { verdi: t.verdi, side, utdrag: kutt(st) }; const p = per[et] || (per[et] = { navn: '', kilde: [] });
      if (!p[t.felt]) p[t.felt] = f; p.kilde.push(f);
      if (!p.navn) { const bruk = (etter.match(BRUK) || foran.match(BRUK)); p.navn = (et.startsWith('-') ? 'Kjeller' : /[-,]/.test(et) ? `Etasje ${et}` : `${et}. etasje`) + (bruk ? ' – ' + bruk[1].toLowerCase() : ''); }
    });
  }
  const eneBk = new Set(brannklasse.map(f => f.verdi)).size === 1 ? brannklasse[0].verdi : '';
  const harUlike = new Set(risikoklasse.map(f => f.verdi)).size > 1 || new Set(brannklasse.map(f => f.verdi)).size > 1;
  const soner = harUlike ? sortBy(Object.entries(per), ([et]) => etasjeSett(et)[0] ?? 99).map(([et, p]) => ({ id: crypto.randomUUID(), navn: p.navn, etasjer: et, risikoklasse: p.rk?.verdi || '', brannklasse: p.bk?.verdi || eneBk, maksPersoner: '' as const, merknad: '', kilde: p.kilde })) : [];
  return { risikoklasse, brannklasse, saerskilt, maksPersoner, alarm, brannsentral, oppstilling, forutsetninger, soner, tegn };
}
const flest = (f: Funn[]) => { const n: Record<string, number> = {}; f.forEach(x => n[x.verdi] = (n[x.verdi] || 0) + 1); return Object.entries(n).sort((a, b) => b[1] - a[1])[0]?.[0] || ''; };

// ---------------- dialog
export function lesBrannkonsept(eid: string, dokId?: string) {
  const D = brannkonsepter(eid);
  if (!D.length) { toast('Last opp brannkonseptet som PDF under Dokumenter (type «Brannkonsept/brannteknisk dokumentasjon») først'); return; }
  openModal({ wide: true, render: close => <Les eid={eid} start={dokId || D[0].id} close={close} /> });
}
/** Etter opplasting av et brannkonsept: tilby å hente opplysningene */
export async function tilbyLesing(eid: string, dokId: string) {
  if (await confirmBox('Brannkonseptet er lastet opp. Vil du at appen leser det og foreslår opplysninger til brannkortet (risikoklasse, brannklasse, alarm, forutsetninger …)?', 'Les brannkonseptet')) lesBrannkonsept(eid, dokId);
}

type Valg = { on: boolean; verdi: any };
function Les({ eid, start, close }: { eid: string; start: string; close: () => void }) {
  const e = byId('eiendommer', eid)!; const b = bv(e); const D = brannkonsepter(eid);
  const [dok, setDok] = useState(start); const [status, setStatus] = useState(''); const [T, setT] = useState<Tolkning | null>(null); const [feil, setFeil] = useState('');
  const [v, setV] = useState<Record<string, Valg>>({}); const [busy, setBusy] = useState(false);
  useEffect(() => {
    let on = true; setT(null); setFeil(''); const d = byId('dokumenter', dok); if (!d?.fil?.path) { setFeil('Dokumentet har ingen fil'); return; }
    pdfTekst(d.fil.path, s => on && setStatus(s)).then(sider => {
      if (!on) return; const t = tolk(sider); setT(t); setStatus('');
      const tom = (k: string) => !String(b[k] ?? '').trim();
      const ny: Record<string, Valg> = {};
      const sett = (k: string, verdi: any, ok: boolean) => { if (verdi !== '' && verdi != null && !(Array.isArray(verdi) && !verdi.length)) ny[k] = { on: ok, verdi }; };
      if (t.soner.length) sett('soner', t.soner, !(b.soner || []).length);
      else { sett('risikoklasse', flest(t.risikoklasse), tom('risikoklasse')); sett('brannklasse', flest(t.brannklasse), tom('brannklasse')); }
      if (t.saerskilt) sett('saerskilt', t.saerskilt.ja, !b.saerskilt);
      if (!t.soner.length) sett('maksPersoner', flest(t.maksPersoner), tom('maksPersoner'));
      sett('alarm', t.alarm.map(f => f.verdi).join('\n'), tom('alarm'));
      sett('brannsentral', t.brannsentral[0]?.verdi || '', tom('brannsentral'));
      sett('oppstilling', t.oppstilling[0]?.verdi || '', tom('oppstilling'));
      sett('forutsetninger', t.forutsetninger.map(f => f.verdi).join('\n'), tom('forutsetninger'));
      setV(ny);
    }).catch(err => { console.error(err); if (on) { setFeil('Kunne ikke lese PDF-en: ' + (err?.message || err)); setStatus(''); } });
    return () => { on = false; };
  }, [dok]);
  const upd = (k: string, p: Partial<Valg>) => setV(o => ({ ...o, [k]: { ...o[k], ...p } }));
  const antall = Object.values(v).filter(x => x.on).length;
  const bruk = async () => {
    setBusy(true);
    try {
      const ny: Rec = { ...b };
      for (const [k, x] of Object.entries(v)) if (x.on) ny[k] = k === 'soner' ? (x.verdi as any[]).map(({ kilde: _k, ...z }) => z) : k === 'maksPersoner' ? +x.verdi || '' : x.verdi;
      if (v.soner?.on) { ny.risikoklasse = ''; ny.brannklasse = ''; ny.maksPersoner = ''; }
      const d = byId('dokumenter', dok);
      ny.kilde = { dokId: dok, tittel: d?.tittel, tid: new Date().toISOString(), felt: Object.keys(v).filter(k => v[k].on) };
      await save('eiendommer', { ...e, brannvern: ny }); loggHendelse(`Brannkort fylt ut fra brannkonsept «${d?.tittel || ''}» (${antall} felt)`, eid, eid);
      close(); toast('Forslagene er lagt inn – kontroller brannkortet før du publiserer'); editBrannkort(eid);
    } finally { setBusy(false); }
  };
  const navn: Record<string, string> = { risikoklasse: 'Risikoklasse', brannklasse: 'Brannklasse', saerskilt: 'Særskilt brannobjekt', maksPersoner: 'Maks antall personer', alarm: 'Alarmorganisering', brannsentral: 'Brannsentral / nøkkelboks', oppstilling: 'Oppstillingsplass', forutsetninger: 'Forutsetninger for bruk', soner: 'Klasser per etasje / bygningsdel' };
  const kilder = (k: string): Funn[] => !T ? [] : k === 'saerskilt' ? (T.saerskilt ? [T.saerskilt] : []) : k === 'soner' ? T.soner.flatMap(z => z.kilde) : (T as any)[k] || [];
  const naa = (k: string) => { const x = b[k]; if (k === 'soner') return (b.soner || []).length ? `${b.soner.length} deler` : ''; if (k === 'saerskilt') return x ? 'Ja' : ''; return String(x ?? ''); };
  const inp = { border: '1px solid var(--line2)', borderRadius: 7, padding: '5px 7px', width: '100%' } as any;
  const felt = (k: string) => {
    const x = v[k]; if (!x) return null;
    if (k === 'risikoklasse' || k === 'brannklasse') return <select style={inp} value={x.verdi} onChange={ev => upd(k, { verdi: ev.target.value, on: true })}>{(k === 'risikoklasse' ? RISIKOKLASSER : BRANNKLASSER).map(([a, l]) => <option key={a} value={a}>{l}</option>)}</select>;
    if (k === 'saerskilt') return <select style={inp} value={x.verdi ? '1' : ''} onChange={ev => upd(k, { verdi: !!ev.target.value, on: true })}><option value="1">Ja – registrert som særskilt brannobjekt</option><option value="">Nei</option></select>;
    if (k === 'maksPersoner') return <input style={inp} value={x.verdi} inputMode="numeric" onChange={ev => upd(k, { verdi: ev.target.value.replace(/\D/g, ''), on: true })} />;
    if (k === 'soner') return <table className="small" style={{ width: '100%' }}><thead><tr><th style={{ textAlign: 'left' }}>Del</th><th style={{ textAlign: 'left' }}>Etasjer</th><th style={{ textAlign: 'left' }}>RK</th><th style={{ textAlign: 'left' }}>BKL</th></tr></thead><tbody>{(x.verdi as any[]).map((z, i) => {
      const s = (p: any) => upd('soner', { verdi: x.verdi.map((y: any, j: number) => j === i ? { ...y, ...p } : y), on: true });
      return <tr key={z.id}><td><input style={inp} value={z.navn} onChange={ev => s({ navn: ev.target.value })} /></td><td style={{ width: 80 }}><input style={inp} value={z.etasjer} onChange={ev => s({ etasjer: ev.target.value })} /></td>
        <td style={{ width: 70 }}><select style={inp} value={z.risikoklasse} onChange={ev => s({ risikoklasse: ev.target.value })}><option value="">–</option>{RISIKOKLASSER.map(([a]) => <option key={a} value={a}>{a}</option>)}</select></td>
        <td style={{ width: 70 }}><select style={inp} value={z.brannklasse} onChange={ev => s({ brannklasse: ev.target.value })}><option value="">–</option>{BRANNKLASSER.map(([a]) => <option key={a} value={a}>{a}</option>)}</select></td></tr>; })}</tbody></table>;
    return <textarea style={{ ...inp, minHeight: k === 'forutsetninger' ? 150 : 70 }} value={x.verdi} onChange={ev => upd(k, { verdi: ev.target.value, on: true })} />;
  };
  const rekkefolge = ['soner', 'risikoklasse', 'brannklasse', 'saerskilt', 'maksPersoner', 'alarm', 'brannsentral', 'oppstilling', 'forutsetninger'];
  const ikkeFunnet = T ? rekkefolge.filter(k => !v[k] && !(k === 'soner' || ((k === 'risikoklasse' || k === 'brannklasse' || k === 'maksPersoner') && T.soner.length))) : [];
  return <>
    <div className="mh"><h2>Hent opplysninger fra brannkonseptet</h2><button className="btn ghost sm" onClick={close}>✕</button></div>
    <div className="mb">
      {D.length > 1 && <div className="fld" style={{ marginBottom: 10 }}><label className="small">Dokument</label><select style={inp} value={dok} onChange={ev => setDok(ev.target.value)}>{D.map(d => <option key={d.id} value={d.id}>{d.tittel} ({fd(d.dato)})</option>)}</select></div>}
      <p className="small muted" style={{ marginTop: 0 }}>Teksten leses i nettleseren din og sendes ikke noe sted. Appen leter etter faste begreper fra TEK17 kap. 11 og foreslår verdier med side og utdrag. Kontroller hvert forslag mot brannkonseptet – rediger eller fjern haken der forslaget ikke stemmer. Felt som allerede er fylt ut, er ikke huket av.</p>
      {status && <p><b>{status}</b></p>}
      {feil && <div className="banner" style={{ background: 'var(--redbg)', color: 'var(--red)', borderColor: '#f3c1bb' }}>{feil}</div>}
      {T && T.tegn < 300 && <div className="banner">Fant nesten ingen tekst i PDF-en. Den er trolig skannet som bilde – da kan opplysningene ikke leses automatisk. Fyll ut brannkortet manuelt, eller last opp en tekstbasert PDF fra brannrådgiveren.</div>}
      {T && T.tegn >= 300 && <>
        {!Object.keys(v).length && <p className="muted">Fant ingen opplysninger appen kjenner igjen.</p>}
        {rekkefolge.filter(k => v[k]).map(k => <div key={k} className="card" style={{ padding: 12, marginBottom: 10, borderColor: v[k].on ? 'var(--acc, #1f6f5c)' : undefined }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 600, cursor: 'pointer' }}><input type="checkbox" checked={v[k].on} onChange={ev => upd(k, { on: ev.target.checked })} />{navn[k]}{naa(k) && <span className="small muted" style={{ fontWeight: 400 }}>· nå: {kutt(naa(k), 60)}</span>}</label>
          <div style={{ marginTop: 6 }}>{felt(k)}</div>
          {k === 'soner' && <div className="small muted" style={{ marginTop: 4 }}>Brannkonseptet ser ut til å ha ulike klasser i ulike deler. Kontroller etasjene – de kobles mot tegningene.</div>}
          {(k === 'risikoklasse' || k === 'brannklasse' || k === 'maksPersoner') && new Set(kilder(k).map(f => f.verdi)).size > 1 && <div className="small" style={{ color: 'var(--amber)', marginTop: 4 }}>Fant flere verdier: {[...new Set(kilder(k).map(f => f.verdi))].join(', ')} – foreslått er den som nevnes oftest.</div>}
          <details className="small" style={{ marginTop: 6 }}><summary className="muted">Kilde ({kilder(k).length} treff)</summary>{kilder(k).slice(0, 8).map((f, i) => <div key={i} style={{ margin: '4px 0' }}><b>s. {f.side}</b> <span className="muted">«{f.utdrag}»</span></div>)}</details>
        </div>)}
        {ikkeFunnet.length > 0 && <p className="small muted">Ikke funnet: {ikkeFunnet.map(k => navn[k].toLowerCase()).join(', ')}. Fyll inn manuelt i brannkortet.</p>}
      </>}
    </div>
    <div className="mf"><button className="btn" onClick={close}>Avbryt</button><span className="grow" /><button className="btn pri" disabled={!antall || busy} onClick={bruk}>{busy ? 'Lagrer …' : `Bruk ${antall} forslag og åpne brannkortet`}</button></div>
  </>;
}
