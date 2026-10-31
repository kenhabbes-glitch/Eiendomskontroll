// Arealrapport som PDF: arealoppgave, dekning av fellesareal og plantegninger med arealer.
import React, { useState } from 'react';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { S, fileUrl, toast } from './store';
import { AREAL_KAT, KAT_FARGE, arealCalc, avtaleTekst, byId, centroid, lNavn, ltColor, mpp, sortBy, zoneArea, type Rec } from './utils';
import { openModal } from '../components/ui';

// ---------- dialog
export function arealRapport(eid: string) { openModal({ wide: true, render: close => <RapportValg eid={eid} close={close} /> }); }

function RapportValg({ eid, close }: { eid: string; close: () => void }) {
  const e = byId('eiendommer', eid)!; const C = arealCalc(eid);
  const T = sortBy(S.tegninger.filter(t => t.eiendomId === eid), t => +t.etasje || 0);
  const keys = Object.keys(C.per).sort((a, b) => (+a.startsWith('_') - +b.startsWith('_')) || navn(a).localeCompare(navn(b)));
  const [tv, setTv] = useState<Record<string, boolean>>(() => Object.fromEntries(T.map(t => [t.id, true])));
  const [lv, setLv] = useState<Record<string, boolean>>(() => Object.fromEntries(keys.map(k => [k, true])));
  const [medTegn, setMedTegn] = useState(true); const [medDek, setMedDek] = useState(true);
  const [kost, setKost] = useState(''); const [busy, setBusy] = useState('');
  const alle = (o: Record<string, boolean>, v: boolean) => Object.fromEntries(Object.keys(o).map(k => [k, v]));
  const lag = async () => {
    const tids = T.filter(t => tv[t.id]).map(t => t.id); const lids = keys.filter(k => lv[k]);
    if (!tids.length && !lids.length) { toast('Velg minst én etasje eller leietaker'); return; }
    setBusy('Lager rapport …');
    try {
      const bytes = await byggPdf(eid, { tids, lids, medTegn, medDek, kost: +kost.replace(',', '.') || 0 }, setBusy);
      const blob = new Blob([bytes as any], { type: 'application/pdf' }); const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `Arealrapport ${e.navn} ${new Date().toISOString().slice(0, 10)}.pdf`; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 20000); toast('Arealrapport lastet ned'); close();
    } catch (err: any) { console.error(err); toast('Kunne ikke lage rapporten: ' + (err?.message || err)); }
    setBusy('');
  };
  const box = { display: 'flex', gap: 8, alignItems: 'center', padding: '3px 0' } as any;
  return <>
    <div className="mh"><h2>Arealrapport (PDF) – {e.navn}</h2><button className="btn ghost sm" onClick={close}>✕</button></div>
    <div className="mb">
      <div className="grid g2" style={{ gap: 16 }}>
        <div><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><b style={{ flex: 1 }}>Etasjer / tegninger</b><a href="#" className="small" onClick={ev => { ev.preventDefault(); setTv(alle(tv, true)); }}>alle</a><a href="#" className="small" onClick={ev => { ev.preventDefault(); setTv(alle(tv, false)); }}>ingen</a></div>
          {T.length ? T.map(t => <label key={t.id} className="small" style={box}><input type="checkbox" checked={!!tv[t.id]} onChange={ev => setTv({ ...tv, [t.id]: ev.target.checked })} />{t.navn}{!mpp(t) && <span style={{ color: 'var(--amber)' }}> (mangler målestokk)</span>}</label>) : <p className="small muted">Ingen tegninger.</p>}</div>
        <div><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><b style={{ flex: 1 }}>Leietakere</b><a href="#" className="small" onClick={ev => { ev.preventDefault(); setLv(alle(lv, true)); }}>alle</a><a href="#" className="small" onClick={ev => { ev.preventDefault(); setLv(alle(lv, false)); }}>ingen</a></div>
          {keys.length ? keys.map(k => { const l = byId('leietakere', k); return <label key={k} className="small" style={box}><input type="checkbox" checked={!!lv[k]} onChange={ev => setLv({ ...lv, [k]: ev.target.checked })} /><span className="sw" style={{ background: k === '_ledig' ? KAT_FARGE.ledig : ltColor(eid, k) }} />{navn(k)}{l?.fellesAvtale && <span className="muted"> · {avtaleTekst(l)}</span>}</label>; }) : <p className="small muted">Ingen oppmålte leiearealer.</p>}</div>
      </div>
      <hr />
      <label className="small" style={box}><input type="checkbox" checked={medTegn} onChange={ev => setMedTegn(ev.target.checked)} />Ta med plantegninger med arealene tegnet inn (én side per etasje)</label>
      <label className="small" style={box}><input type="checkbox" checked={medDek} onChange={ev => setMedDek(ev.target.checked)} />Ta med dekning av fellesareal (over-/underdekning mot kontraktfestet fellesareal)</label>
      {medDek && <div className="form" style={{ maxWidth: 420, marginTop: 6 }}><div className="fld"><label>Felleskostnad per m² per år (kr, valgfritt)</label><input value={kost} onChange={ev => setKost(ev.target.value)} inputMode="decimal" placeholder="F.eks. 350" style={{ border: '1px solid var(--line2)', borderRadius: 8, padding: '7px 10px' }} /><div className="hint">Fylles ut for å vise over-/underdekning i kroner.</div></div></div>}
      <p className="small muted">Fellesarealet fordeles alltid ut fra hele bygget. Valgene bestemmer bare hva som vises i rapporten. Leietakere som ikke er valgt, vises grått og uten navn på tegningene.</p>
    </div>
    <div className="mf"><button className="btn" onClick={close}>Avbryt</button><button className="btn pri" disabled={!!busy} onClick={lag}>{busy || 'Last ned PDF'}</button></div>
  </>;
}
const navn = (k: string) => k === '_ledig' ? 'Ledig areal' : k === '_ukjent' ? 'Leieareal uten leietaker' : lNavn(k) || 'Ukjent leietaker';

// ---------- PDF
type Opt = { tids: string[]; lids: string[]; medTegn: boolean; medDek: boolean; kost: number };
export const A4 = [595.28, 841.89]; export const M = 44;
export const INK = rgb(0.11, 0.14, 0.13), MUTED = rgb(0.42, 0.45, 0.43), LINE = rgb(0.85, 0.86, 0.84), ACC = rgb(0.12, 0.44, 0.36), RED = rgb(0.71, 0.14, 0.09), GREEN = rgb(0.12, 0.44, 0.36), SOFT = rgb(0.96, 0.96, 0.95);
export const hex = (h: string) => { const n = parseInt(h.replace('#', ''), 16); return rgb((n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255); };
/** Bare tegn som standardfontene (WinAnsi) kan vise */
export const safe = (s: any) => String(s ?? '').replace(/−/g, '-').replace(/[   ]/g, ' ').replace(/[^\x20-\x7E -ÿ–—‘’“”•…€]/g, '');
const nm2 = (v: number) => (Math.round(v * 10) / 10).toLocaleString('nb-NO', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' m²';
const sgn = (v: number) => (v >= 0.05 ? '+' : v <= -0.05 ? '-' : '') + nm2(Math.abs(v));
const kr = (v: number) => Math.round(v).toLocaleString('nb-NO') + ' kr';
const pst = (v: number) => (v * 100).toLocaleString('nb-NO', { maximumFractionDigits: 1 }) + ' %';

export class Doc {
  pdf!: PDFDocument; f!: PDFFont; b!: PDFFont; page!: PDFPage; y = 0; side = 0; tittel = '';
  static async ny(tittel: string) { const d = new Doc(); d.pdf = await PDFDocument.create(); d.f = await d.pdf.embedFont(StandardFonts.Helvetica); d.b = await d.pdf.embedFont(StandardFonts.HelveticaBold); d.tittel = tittel; d.pdf.setTitle(tittel); d.pdf.setCreator('Eiendomskontroll'); return d; }
  nyside(liggende = false) { this.page = this.pdf.addPage(liggende ? [A4[1], A4[0]] : [A4[0], A4[1]]); this.side++; this.y = this.page.getHeight() - M; this.fot(); return this.page; }
  fot() { const p = this.page; p.drawLine({ start: { x: M, y: 30 }, end: { x: p.getWidth() - M, y: 30 }, thickness: 0.5, color: LINE }); this.t(this.tittel, M, 18, 7.5, MUTED); const s = 'Side ' + this.side; this.t(s, p.getWidth() - M - this.f.widthOfTextAtSize(s, 7.5), 18, 7.5, MUTED); }
  t(s: any, x: number, y: number, size = 9, color = INK, bold = false) { this.page.drawText(safe(s), { x, y, size, font: bold ? this.b : this.f, color }); }
  w(s: any, size = 9, bold = false) { return (bold ? this.b : this.f).widthOfTextAtSize(safe(s), size); }
  fit(s: any, max: number, size = 9, bold = false) { let x = safe(s); if (this.w(x, size, bold) <= max) return x; while (x.length > 1 && this.w(x + '…', size, bold) > max) x = x.slice(0, -1); return x + '…'; }
  plass(h: number) { if (this.y - h < 46) this.nyside(); }
  h1(s: string) { this.plass(40); this.t(s, M, this.y - 16, 16, INK, true); this.y -= 28; }
  h2(s: string) { this.plass(60); this.y -= 6; this.t(s, M, this.y - 11, 11.5, ACC, true); this.y -= 20; }
  p(s: string, size = 8.5, color = MUTED) { const max = this.page.getWidth() - 2 * M; const ord = safe(s).split(' '); let l = ''; const lines: string[] = []; ord.forEach(o => { const n = l ? l + ' ' + o : o; if (this.w(n, size) > max) { lines.push(l); l = o; } else l = n; }); if (l) lines.push(l); lines.forEach(x => { this.plass(size + 4); this.t(x, M, this.y - size, size, color); this.y -= size + 3.5; }); this.y -= 3; }
  /** Tabell. cols: [tittel, bredde(andel), høyrejustert] */
  tabell(cols: [string, number, boolean?][], rows: { c: string[]; bold?: boolean; fill?: boolean; farge?: (any | undefined)[]; sw?: string }[]) {
    const W = this.page.getWidth() - 2 * M; const tot = cols.reduce((s, c) => s + c[1], 0); const ws = cols.map(c => c[1] / tot * W); const rh = 16;
    const hode = () => { this.plass(rh * 2); this.page.drawRectangle({ x: M, y: this.y - rh, width: W, height: rh, color: SOFT }); let x = M; cols.forEach((c, i) => { const s = this.fit(c[0].toUpperCase(), ws[i] - 8, 6.8, true); this.t(s, c[2] ? x + ws[i] - 4 - this.w(s, 6.8, true) : x + 4, this.y - 10.5, 6.8, MUTED, true); x += ws[i]; }); this.y -= rh; };
    hode();
    rows.forEach(r => {
      if (this.y - rh < 46) { this.nyside(); hode(); }
      if (r.fill) this.page.drawRectangle({ x: M, y: this.y - rh, width: W, height: rh, color: SOFT });
      let x = M; r.c.forEach((v, i) => { let xx = x + 4; if (i === 0 && r.sw) { this.page.drawRectangle({ x: xx, y: this.y - 11.5, width: 7, height: 7, color: hex(r.sw) }); xx += 11; }
        const s = this.fit(v, ws[i] - 8 - (xx - x - 4), 8.2, r.bold); this.t(s, cols[i][2] ? x + ws[i] - 4 - this.w(s, 8.2, r.bold) : xx, this.y - 11, 8.2, r.farge?.[i] || INK, r.bold); x += ws[i]; });
      this.page.drawLine({ start: { x: M, y: this.y - rh }, end: { x: M + W, y: this.y - rh }, thickness: 0.4, color: LINE }); this.y -= rh;
    });
    this.y -= 8;
  }
  nokkel(items: [string, string, any?][]) {
    this.plass(52); const W = this.page.getWidth() - 2 * M; const n = items.length; const bw = (W - (n - 1) * 8) / n;
    items.forEach(([l, v, c], i) => { const x = M + i * (bw + 8); this.page.drawRectangle({ x, y: this.y - 44, width: bw, height: 44, color: SOFT, borderColor: LINE, borderWidth: 0.5 }); this.t(this.fit(l.toUpperCase(), bw - 12, 6.5, true), x + 7, this.y - 13, 6.5, MUTED, true); this.t(this.fit(v, bw - 12, 13, true), x + 7, this.y - 33, 13, c || INK, true); });
    this.y -= 54;
  }
}

async function byggPdf(eid: string, o: Opt, status: (s: string) => void) {
  const e = byId('eiendommer', eid)!; const C: any = arealCalc(eid); const d = C.dekning;
  const dato = new Date().toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' });
  const D = await Doc.ny('Arealrapport – ' + e.navn + ' – ' + dato);
  const T = sortBy(S.tegninger.filter(t => o.tids.includes(t.id)), t => +t.etasje || 0);
  const L = o.lids.filter(k => C.per[k]);
  const delvis = o.lids.length < Object.keys(C.per).length;

  // ----- forside / sammendrag
  D.nyside();
  D.t('AREALRAPPORT', M, D.y - 10, 8.5, ACC, true); D.y -= 18;
  D.t(e.navn || 'Eiendom', M, D.y - 22, 22, INK, true); D.y -= 32;
  const info = [[e.adresse, e.poststed].filter(Boolean).join(', '), [e.gnrbnr && 'Gnr./bnr. ' + e.gnrbnr, e.kommune].filter(Boolean).join(' · '), e.eierNavn && 'Eier: ' + e.eierNavn + (e.eierOrgnr ? ' (org.nr. ' + e.eierOrgnr + ')' : ''), e.bta && 'BTA ' + e.bta + ' m²', 'Dato: ' + dato].filter(Boolean) as string[];
  info.forEach(s => { D.t(s, M, D.y - 10, 10, MUTED); D.y -= 15; }); D.y -= 10;
  const sumOpp = C.etg.reduce((s: number, x: any) => s + (x.ok ? Object.values(x.sum as Record<string, number>).reduce((a, b) => a + b, 0) : 0), 0);
  const ikke = C.etg.reduce((s: number, x: any) => s + (x.ok ? x.sum.ikke || 0 : 0), 0);
  D.nokkel([['Sum oppmålt', nm2(sumOpp)], ['Utleibart inkl. felles', nm2(C.totLeie)], ['Fellesareal', nm2(d.F)], ['Ikke utleibart', nm2(ikke)]]);
  if (d.F > 0) D.nokkel([['Fellesareal fakturert', nm2(d.fakturert)], ['Dekningsgrad', pst(d.grad)], [d.netto < -0.05 ? 'Underdekning' : 'Overdekning', sgn(d.netto), d.netto < -0.05 ? RED : GREEN], ...(o.kost ? [['Per år', (d.netto < 0 ? '-' : '') + kr(Math.abs(d.netto) * o.kost), d.netto < -0.05 ? RED : GREEN] as [string, string, any]] : [])]);
  D.p(`Rapporten omfatter ${T.length} etasje(r)/tegning(er) og ${L.length} leieareal(er)${delvis ? ' (utvalg)' : ''}. Arealene er målt fra plantegninger med målestokk og er veiledende. En formell arealoppgave etter NS 3940 bør kontrollmåles. Fellesareal i etasjen fordeles forholdsmessig på leiearealene i etasjen, og fellesareal for bygget fordeles på alle leiearealer, med mindre leietakeren har kontraktfestet fellesareal.`);
  if (C.unscaled) D.p(`${C.unscaled} tegning(er) mangler målestokk og er ikke regnet med.`, 8.5, RED);

  // ----- arealoppgave
  if (L.length) {
    D.h2('Arealoppgave per leietaker' + (delvis ? ' (utvalg)' : ''));
    const har = L.some(k => C.per[k].avtale);
    const rows: any[] = L.map(k => { const p = C.per[k]; const l = byId('leietakere', k);
      return { sw: k === '_ledig' ? KAT_FARGE.ledig : ltColor(eid, k), c: [navn(k) + (l?.lokale ? ' – ' + l.lokale : ''), p.etg.join(', '), nm2(p.eks), nm2(p.fe), nm2(p.fb), ...(har ? [p.avtale ? nm2(p.felles) : '–'] : []), nm2(p.tot), C.totLeie ? pst(p.tot / C.totLeie) : '–'] }; });
    const s = (f: (p: any) => number) => L.reduce((a, k) => a + f(C.per[k]), 0);
    rows.push({ bold: true, fill: true, sw: undefined as any, c: ['Sum' + (delvis ? ' utvalg' : ''), '', nm2(s(p => p.eks)), nm2(s(p => p.fe)), nm2(s(p => p.fb)), ...(har ? [''] : []), nm2(s(p => p.tot)), C.totLeie ? pst(s(p => p.tot) / C.totLeie) : ''] });
    D.tabell([['Leietaker', 3.2], ['Etasje', 1.6], ['Eksklusivt', 1.2, true], ['Felles etg.', 1.2, true], ['Felles bygg', 1.2, true], ...(har ? [['Avtalt', 1.2, true] as [string, number, boolean]] : []), ['Leieareal', 1.2, true], ['Andel', 0.9, true]], rows);
    if (har) D.p('«Avtalt felles» er kontraktfestet fellesareal som erstatter målt andel (felles etasje + felles bygg) i leiearealet.');
  }

  // ----- per etasje
  const TS = T.filter(t => mpp(t));
  if (TS.length) {
    D.h2('Oppmålt per etasje');
    const kat = ['leie', 'ledig', 'felles_etg', 'felles_bygg', 'ikke'];
    const rows = TS.map(t => { const x = C.etg.find((y: any) => y.t.id === t.id); const sum = x.sum; return { c: [t.navn, ...kat.map(k => nm2(sum[k] || 0)), nm2(kat.reduce((a, k) => a + (sum[k] || 0), 0))] }; });
    D.tabell([['Etasje', 2.2], ['Leieareal', 1.1, true], ['Ledig', 1.1, true], ['Felles etg.', 1.1, true], ['Felles bygg', 1.1, true], ['Ikke utleib.', 1.1, true], ['Sum', 1.1, true]], rows);
    // leietakere per etasje
    TS.forEach(t => {
      const own: Record<string, number> = {}; (t.soner || []).forEach((z: Rec) => { if (z.kat !== 'leie' && z.kat !== 'ledig') return; const k = z.kat === 'ledig' ? '_ledig' : (z.leietakerId || '_ukjent'); if (!L.includes(k)) return; own[k] = (own[k] || 0) + (zoneArea(t, z) || 0); });
      const ks = Object.keys(own); if (!ks.length) return;
      D.plass(70); D.t(t.navn, M, D.y - 9, 9, INK, true); D.y -= 14;
      D.tabell([['Leietaker', 4], ['Eksklusivt areal i etasjen', 2, true]], ks.map(k => ({ sw: k === '_ledig' ? KAT_FARGE.ledig : ltColor(eid, k), c: [navn(k), nm2(own[k])] })));
    });
  }

  // ----- dekning av fellesareal
  if (o.medDek && d.F > 0) {
    D.h2('Dekning av fellesareal');
    D.p('Viser hvor mye av byggets fellesareal som faktisk faktureres leietakerne. Leietakere med kontraktfestet fellesareal (fast m², % av fellesarealet eller % påslag) betaler for det avtalte arealet i stedet for målt andel. Differansen, sammen med andelen som faller på ledig areal, er over- eller underdekning for eier.');
    const LT = Object.keys(C.per).filter(k => !k.startsWith('_') && (!delvis || L.includes(k)));
    const rows = LT.map(k => { const p = C.per[k]; const l = byId('leietakere', k); const c = p.diff < -0.05 ? RED : p.diff > 0.05 ? GREEN : INK;
      return { sw: ltColor(eid, k), farge: [, , , , c, c], c: [navn(k), p.avtale ? avtaleTekst(l!) : 'Målt andel', nm2(p.fellesBer), nm2(p.felles), p.avtale ? sgn(p.diff) : '–', ...(o.kost ? [p.avtale ? (p.diff < 0 ? '-' : '+') + kr(Math.abs(p.diff) * o.kost) : '–'] : [])] }; });
    const cols: [string, number, boolean?][] = [['Leietaker', 3], ['Avtale', 2.2], ['Målt andel', 1.2, true], ['Fakturert', 1.2, true], ['Over/under', 1.2, true], ...(o.kost ? [['Kr per år', 1.3, true] as [string, number, boolean]] : [])];
    D.tabell(cols, rows);
    const lin: [string, number][] = [['Fellesareal totalt', d.F], ['Fakturert leietakere', d.fakturert], ['Avvik fra kontraktfestet fellesareal', d.avvik]];
    if (d.ledig > 0.05) lin.push(['Andel som faller på ledig areal (eier)', -d.ledig]);
    if (d.ukjent > 0.05) lin.push(['Andel på leieareal uten leietaker (eier)', -d.ukjent]);
    if (d.ikkeFordelt > 0.05) lin.push(['Ikke fordelt (ingen leieareal i etasjen)', -d.ikkeFordelt]);
    const rows2: any[] = lin.map(([l, v], i) => ({ c: [l, i < 2 ? nm2(v) : sgn(v), ...(o.kost ? [i < 2 ? kr(v * o.kost) : (v < 0 ? '-' : '+') + kr(Math.abs(v) * o.kost)] : [])], farge: [, i >= 2 && v < -0.05 ? RED : undefined, i >= 2 && v < -0.05 ? RED : undefined] }));
    const neg = d.netto < -0.05;
    rows2.push({ bold: true, fill: true, c: ['Netto ' + (neg ? 'underdekning – eier bærer' : 'overdekning'), sgn(d.netto), ...(o.kost ? [(d.netto < 0 ? '-' : '+') + kr(Math.abs(d.netto) * o.kost)] : [])], farge: [, neg ? RED : GREEN, neg ? RED : GREEN] });
    D.tabell([['Hele bygget', 4], ['Areal', 1.4, true], ...(o.kost ? [['Kr per år', 1.4, true] as [string, number, boolean]] : [])], rows2 as any);
    D.p(`Dekningsgrad ${pst(d.grad)}.${o.kost ? ` Kronebeløp er beregnet med felleskostnad ${kr(o.kost)} per m² per år.` : ''}${delvis ? ' Totalene gjelder hele bygget, også leietakere som ikke er tatt med i tabellen over.' : ''}`);
  }

  // ----- tegninger
  if (o.medTegn) for (const t of T) {
    status('Tegner ' + t.navn + ' …');
    let img: { data: Uint8Array; w: number; h: number } | null = null;
    try { img = await tegnPlan(eid, t, L); } catch (err) { console.warn(err); }
    const p = D.nyside(true); const PW = p.getWidth(), PH = p.getHeight();
    D.t(t.navn, M, PH - M - 12, 14, INK, true); D.t(e.navn, M, PH - M - 26, 8.5, MUTED);
    const LW = 190; const ax = M, ay = 44, aw = PW - 2 * M - LW - 14, ah = PH - M - 36 - ay;
    if (img) { const j = await D.pdf.embedJpg(img.data); const s = Math.min(aw / img.w, ah / img.h); const w = img.w * s, h = img.h * s; p.drawImage(j, { x: ax + (aw - w) / 2, y: ay + (ah - h) / 2, width: w, height: h }); p.drawRectangle({ x: ax + (aw - w) / 2, y: ay + (ah - h) / 2, width: w, height: h, borderColor: LINE, borderWidth: 0.6 }); }
    else D.t('Tegningen kunne ikke lastes.', ax, ay + ah / 2, 10, RED);
    // tegnforklaring
    let ly = PH - M - 50; const lx = PW - M - LW;
    D.t('TEGNFORKLARING', lx, ly, 7, MUTED, true); ly -= 14;
    const own: Record<string, number> = {}; const kats: Record<string, number> = {};
    (t.soner || []).forEach((z: Rec) => { const a = zoneArea(t, z) || 0; if (z.kat === 'leie' || z.kat === 'ledig') { const k = z.kat === 'ledig' ? '_ledig' : (z.leietakerId || '_ukjent'); if (L.includes(k)) own[k] = (own[k] || 0) + a; else kats._andre = (kats._andre || 0) + a; } else kats[z.kat] = (kats[z.kat] || 0) + a; });
    const rad = (farge: string, tekst: string, v: number | null) => { if (ly < 50) return; p.drawRectangle({ x: lx, y: ly - 1, width: 8, height: 8, color: hex(farge), opacity: 0.75 }); D.t(D.fit(tekst, LW - 70, 8), lx + 13, ly, 8); if (v !== null && mpp(t)) { const s = nm2(v); D.t(s, lx + LW - D.w(s, 8), ly, 8, MUTED); } ly -= 13; };
    Object.keys(own).sort((a, b) => navn(a).localeCompare(navn(b))).forEach(k => rad(k === '_ledig' ? KAT_FARGE.ledig : ltColor(eid, k), navn(k), own[k]));
    if (kats._andre) rad('#c9ccc8', 'Andre leietakere', kats._andre);
    AREAL_KAT.filter(([k]) => k !== 'leie' && k !== 'ledig' && kats[k]).forEach(([k, l]) => rad(KAT_FARGE[k], l, kats[k]));
    if (!mpp(t)) { ly -= 6; D.t('Tegningen mangler målestokk –', lx, ly, 8, RED); D.t('arealer er ikke beregnet.', lx, ly - 11, 8, RED); }
  }
  status('Lagrer …');
  return await D.pdf.save();
}

/** Tegner plantegningen med arealene på et lerret og returnerer JPEG */
async function tegnPlan(eid: string, t: Rec, L: string[]) {
  const url = await fileUrl(t.fil.path); const r = await fetch(url); if (!r.ok) throw new Error('Kunne ikke hente tegningen'); const bmp = await createImageBitmap(await r.blob());
  const W0 = t.w || bmp.width, H0 = t.h || bmp.height; const sc = Math.min(1, 2600 / Math.max(W0, H0)); const W = Math.round(W0 * sc), H = Math.round(H0 * sc);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d')!;
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.drawImage(bmp, 0, 0, W, H);
  const k = sc; // punktene er i tegningens koordinater (t.w × t.h)
  const fs = Math.max(14, Math.round(Math.max(W, H) / 62));
  const soner = (t.soner || []).filter((z: Rec) => z.pts?.length > 2);
  const farge = (z: Rec) => { if (z.kat === 'leie' || z.kat === 'ledig') { const key = z.kat === 'ledig' ? '_ledig' : (z.leietakerId || '_ukjent'); if (!L.includes(key)) return null; return key === '_ledig' ? KAT_FARGE.ledig : ltColor(eid, key); } return KAT_FARGE[z.kat] || '#6b736d'; };
  soner.forEach((z: Rec) => { const c = farge(z) || '#c9ccc8'; g.beginPath(); z.pts.forEach(([x, y]: number[], i: number) => i ? g.lineTo(x * k, y * k) : g.moveTo(x * k, y * k)); g.closePath(); g.globalAlpha = farge(z) ? 0.32 : 0.22; g.fillStyle = c; g.fill(); g.globalAlpha = 1; g.lineWidth = Math.max(1.5, fs / 7); g.strokeStyle = c; g.stroke(); });
  g.textAlign = 'center'; g.textBaseline = 'middle';
  soner.forEach((z: Rec) => { const c = farge(z); if (!c) return; const [cx, cy] = centroid(z.pts); const a = zoneArea(t, z);
    const katNavn = (AREAL_KAT.find(x => x[0] === z.kat)?.[1] || '').replace(/ \(.*$/, '').replace(' – fordeles i etasjen', ' (etasje)').replace(' – fordeles på hele bygget', ' (bygg)');
    const egen = z.navn && !/^Areal \d+$/.test(z.navn) ? z.navn : '';
    const l1 = z.kat === 'leie' ? (lNavn(z.leietakerId) || 'Uten leietaker') : egen || katNavn; const l2 = a ? nm2(a) : '';
    const lin = [z.kat === 'leie' && egen && egen !== l1 ? egen : '', l1, l2].filter(Boolean);
    lin.forEach((s, i) => { const y = cy * k + (i - (lin.length - 1) / 2) * fs * 1.2; g.font = `${i === lin.length - 1 && l2 ? 'normal' : '600'} ${fs}px Helvetica, Arial, sans-serif`; g.lineWidth = fs / 3.2; g.strokeStyle = 'rgba(255,255,255,.92)'; g.strokeText(s, cx * k, y); g.fillStyle = '#1d2320'; g.fillText(s, cx * k, y); }); });
  const blob: Blob = await new Promise((res, rej) => cv.toBlob(b => b ? res(b) : rej(new Error('Kunne ikke lage bilde')), 'image/jpeg', 0.86));
  return { data: new Uint8Array(await blob.arrayBuffer()), w: W, h: H };
}
