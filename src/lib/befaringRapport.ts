// Befaringsrapport som PDF (lages i nettleseren, også uten nett). Fingeravtrykket (SHA-256) brukes ved signering.
import { Doc, M, INK, MUTED, RED, GREEN, LINE, ACC, profilFor } from './arealRapport';
import { fileUrl } from './store';
import { byId, fd, lNavn, type Rec } from './utils';
import { btype, erLokal, funnStatus, ART_NAVN, type Funn, type Punkt, type BFil } from './befaring';
import { hentLokalFil } from './offline';
import { tegningSomBilde } from '../components/BefTegning';
import { lokale, tt } from './i18n';

const SVAR: Record<string, string> = { ok: 'OK', avvik: 'Avvik', ia: 'Ikke aktuelt', merk: 'Merknad', '': 'Ikke kontrollert' }; // oversettes ved bruk (tt)
const ANSV: Record<string, string> = { Eier: 'Eier / drift', Leietaker: 'Leietaker', Felles: 'Felles', 'Leverandør/entreprenør': 'Leverandør' };
async function bildeJpg(f: BFil, maks = 900): Promise<{ data: Uint8Array; w: number; h: number } | null> {
  try {
    let b: Blob | null = null;
    if (erLokal(f)) b = await hentLokalFil(f.lokal); else { if (!/^image\//.test(f.type || '') && !/\.(jpe?g|png|webp|gif)$/i.test(f.navn || '')) return null; const u = await fileUrl(f.path); if (!u) return null; const r = await fetch(u); if (!r.ok) return null; b = await r.blob(); }
    if (!b || !/^image\//.test(b.type || 'image/')) return null;
    const bmp = await createImageBitmap(b); const s = Math.min(1, maks / Math.max(bmp.width, bmp.height)); const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * s); cv.height = Math.round(bmp.height * s);
    const g = cv.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(bmp, 0, 0, cv.width, cv.height);
    const j: Blob = await new Promise((res, rej) => cv.toBlob(x => x ? res(x) : rej(new Error('bilde')), 'image/jpeg', 0.8));
    return { data: new Uint8Array(await j.arrayBuffer()), w: cv.width, h: cv.height };
  } catch { return null; }
}
export async function sha256(b: Uint8Array) { const h = await crypto.subtle.digest('SHA-256', b as any); return [...new Uint8Array(h)].map(x => x.toString(16).padStart(2, '0')).join(''); }

export async function befaringPdf(b: Rec, status: (s: string) => void = () => { }): Promise<Uint8Array> {
  const T = btype(b.type); const e = byId('eiendommer', b.eiendomId); const F: Funn[] = b.funn || []; const P: Punkt[] = b.punkter || [];
  const D = await Doc.ny(`${T.navn} – ${e?.navn || ''} – ${fd(b.dato)}`); D.profil = profilFor(b.eiendomId, T.navn); D.nyside(); const W = D.page.getWidth();
  D.t(tt('BEFARINGSRAPPORT'), M, D.y - 10, 8.5, ACC, true); D.y -= 18;
  D.t(D.fit(b.tittel || T.navn, W - 2 * M, 20, true), M, D.y - 20, 20, INK, true); D.y -= 30;
  const info = [T.navn, [e?.navn, e?.adresse, e?.poststed].filter(Boolean).join(', '), b.leietakerId ? tt('Leietaker') + ': ' + lNavn(b.leietakerId) + (b.lokale ? ' – ' + b.lokale : '') : '', tt('Dato') + ': ' + fd(b.dato) + (b.tid ? ' · ' + b.tid : ''), b.status ? tt('Status') + ': ' + tt(b.status) : ''].filter(Boolean);
  info.forEach(s => { D.t(D.fit(s, W - 2 * M, 10), M, D.y - 10, 10, MUTED); D.y -= 15; }); D.y -= 8;
  const n = { ok: P.filter(p => p.svar === 'ok').length, av: P.filter(p => p.svar === 'avvik').length, ia: P.filter(p => p.svar === 'ia').length, ik: P.filter(p => !p.svar).length };
  const avF = F.filter(f => f.art === 'avvik' || f.art === 'energi');
  D.nokkel([[tt('Sjekkpunkter'), String(P.length)], ['OK', String(n.ok), GREEN], [tt('Avvik'), String(n.av), n.av ? RED : INK], [tt('Ikke kontrollert'), String(n.ik)], [tt('Funn'), String(F.length)], [tt('Avvik registrert'), String(avF.length), avF.length ? RED : INK]]);

  if ((b.deltakere || []).length) { D.h2(tt('Deltakere'));
    D.tabell([[tt('Navn'), 2.2], [tt('Rolle'), 1.3], [tt('Firma'), 2], [tt('E-post') + ' / ' + tt('Telefon'), 2.4]], b.deltakere.map((d: Rec) => ({ c: [d.navn || '', tt(d.rolle || ''), d.firma || '', [d.epost, d.tlf].filter(Boolean).join(' · ')] }))); }
  if (b.oppsummering) { D.h2(tt('Oppsummering')); D.p(b.oppsummering, 9.5, INK); }

  // Sjekkpunkter per gruppe
  if (P.length) {
    D.h2(tt('Sjekkpunkter')); const grupper = [...new Set(P.map(p => p.gruppe))]; const ref = P.some(p => p.ref);
    for (const gr of grupper) { D.plass(40); D.t(tt(gr), M, D.y - 9, 9.5, INK, true); D.y -= 14;
      D.tabell([[tt('Punkt'), 3.2], [tt('Resultat'), 1.1], ...(ref ? [[tt('Ved overtakelse'), 1.4] as [string, number]] : []), [tt('Kommentar'), 3.2]], P.filter(p => p.gruppe === gr).map(p => ({ c: [tt(p.tekst), tt(SVAR[p.svar || '']), ...(ref ? [p.ref ? tt(SVAR[p.ref.svar || '']) + (p.ref.komm ? ': ' + p.ref.komm : '') : ''] : []), p.komm || ''],
        farge: [undefined, p.svar === 'avvik' ? RED : p.svar === 'ok' ? GREEN : p.svar ? INK : MUTED] }))); }
  }

  // Funn
  if (F.length) {
    D.h2(tt('Funn')); status('…');
    D.tabell([[tt('Nr'), .5], [tt('Funn'), 3.4], [tt('Type'), 1.3], [tt('Alvorlighet'), 1], [tt('Ansvar'), 1.3], [tt('Frist'), 1], [tt('Status'), 1.3]], F.map((f, i) => ({ c: [String(i + 1), f.tittel, tt(ART_NAVN[f.art]), f.art === 'avvik' || f.art === 'energi' ? tt(f.alv || '') : '', f.art === 'avvik' || f.art === 'energi' ? (f.ansvar === 'Leverandør/entreprenør' ? f.utbedresAv || 'Leverandør' : tt(ANSV[f.ansvar || ''] || f.ansvar || '')) : f.art === 'tilpasning' ? tt(f.betaler || '') : '', (f.avvikId && byId('avvik', f.avvikId)?.frist) || f.frist ? fd((f.avvikId && byId('avvik', f.avvikId)?.frist) || f.frist) : '', tt(funnStatus(f).s)],
      farge: [undefined, undefined, undefined, f.alv === 'Kritisk' || f.alv === 'Høy' ? RED : undefined] })));
    for (let i = 0; i < F.length; i++) { const f = F[i]; const bilder = (f.bilder || []).slice(0, 4);
      const tekst = [f.beskrivelse, f.plassering ? tt('Plassering') + ': ' + f.plassering : '', f.pos ? tt('Plassert på') + ' ' + (byId('tegninger', f.pos.tegningId)?.navn || tt('tegning')) + ` (${tt('Nr')} ${i + 1})` : '', f.art === 'tilpasning' && f.kost ? `${tt('Kostnad')} ${(+f.kost).toLocaleString(lokale())} kr, ${tt('Betales av').toLowerCase()} ${tt(f.betaler || 'Ikke avklart')}` : '', f.art === 'energi' && f.besparelse ? `${tt('Anslått besparelse (kWh/år)')}: ${(+f.besparelse).toLocaleString(lokale())}` : '',
        f.art === 'system' && f.sys ? `${tt('System')} ${f.sys.tfmSys || ''} ${f.sys.navn || ''}${f.sys.fabrikat ? ', ' + f.sys.fabrikat : ''}${f.sys.aar ? ', ' + f.sys.aar : ''}` : '', f.avvikId && byId('avvik', f.avvikId) ? `${tt('Avvik #{0}', byId('avvik', f.avvikId)!.nr)}` : ''].filter(Boolean).join('. ');
      if (!tekst && !bilder.length) continue;
      D.plass(50); D.t(D.fit(`${i + 1}. ${f.tittel}`, W - 2 * M, 9.5, true), M, D.y - 9, 9.5, INK, true); D.y -= 14; if (tekst) D.p(tekst, 8.5, MUTED);
      if (bilder.length) { const bw = (W - 2 * M - 3 * 8) / 4; let x = M; let mh = 0; const imgs: { data: Uint8Array; w: number; h: number }[] = []; for (const fb of bilder) { const j = await bildeJpg(fb); if (j) imgs.push(j); }
        if (imgs.length) { const hs = imgs.map(j => bw * j.h / j.w); mh = Math.min(Math.max(...hs), bw * 1.3); D.plass(mh + 8);
          for (const j of imgs) { const im = await D.pdf.embedJpg(j.data); const h = Math.min(bw * j.h / j.w, mh); const w = h * j.w / j.h; D.page.drawImage(im, { x, y: D.y - h, width: w, height: h }); D.page.drawRectangle({ x, y: D.y - h, width: w, height: h, borderColor: LINE, borderWidth: .5 }); x += bw + 8; }
          D.y -= mh + 10; } }
    }
    const tilp = F.filter(f => f.art === 'tilpasning' && f.kost); if (tilp.length) { const sum = (bet: string) => tilp.filter(f => (f.betaler || '') === bet).reduce((s, f) => s + (+f.kost! || 0), 0);
      D.p(`${tt('Leietakertilpasning')}: ${tilp.length} · ${tt('Sum')} ${tilp.reduce((s, f) => s + (+f.kost! || 0), 0).toLocaleString(lokale())} kr (${tt('Leietaker')} ${sum('Leietaker').toLocaleString(lokale())} kr, ${tt('Eier')} ${sum('Eier').toLocaleString(lokale())} kr).`, 9, INK); }
    const en = F.filter(f => f.art === 'energi' && f.besparelse); if (en.length) D.p(`${tt('Anslått besparelse (kWh/år)')}: ${en.reduce((s, f) => s + (+f.besparelse! || 0), 0).toLocaleString(lokale())} (${en.length} ${tt('tiltak')}).`, 9, INK);
  }

  // Tegninger med markeringer
  const tids = [...new Set([...Object.keys(b.tegn || {}).filter(k => (b.tegn[k] || []).length), ...F.filter(f => f.pos).map(f => f.pos!.tegningId)])];
  for (const tid of tids) { const t = byId('tegninger', tid); if (!t?.fil?.path) continue; status(t.navn + ' …');
    try { const j = await tegningSomBilde(t, b.tegn?.[tid] || [], F.filter(f => f.pos?.tegningId === tid), F, b.skala?.[tid]); if (!j) continue;
      D.nyside(); D.h2(tt('Tegning') + ' – ' + t.navn); const im = await D.pdf.embedJpg(j.data); const mw = W - 2 * M, mh = D.y - 60; const s = Math.min(mw / j.w, mh / j.h); const w = j.w * s, h = j.h * s;
      D.page.drawImage(im, { x: M, y: D.y - h, width: w, height: h }); D.page.drawRectangle({ x: M, y: D.y - h, width: w, height: h, borderColor: LINE, borderWidth: .6 }); D.y -= h + 10;
      D.p(tt('Nummererte punkter viser funn (se listen over). Mål og arealer er målt på tegningen og er veiledende.'), 8, MUTED);
    } catch { D.p(tt('Tegningen {0} kunne ikke tas med.', t.navn), 8.5, RED); } }

  if ((b.maalere || []).length) { D.h2(tt('Målerstander')); D.tabell([[tt('Måler'), 3], [tt('Målernummer'), 2], [tt('Avlest verdi'), 1.5, true], [tt('Enhet'), 1]], b.maalere.map((m: Rec) => ({ c: [m.navn || '', m.nr || '', String(m.verdi ?? ''), m.enhet || ''] }))); }
  if ((b.nokler || []).length) { D.h2(tt('Nøkler og adgangskort')); D.tabell([[tt('Type'), 3], [tt('Antall'), 1, true], [tt('Merknad'), 4]], b.nokler.map((k: Rec) => ({ c: [k.type || '', String(k.antall ?? ''), k.merknad || ''] }))); }

  // Signatur
  const sig = (b.deltakere || []).filter((d: Rec) => d.signerer); if (sig.length) { D.h2(tt('Signatur'));
    D.p(tt('Partene bekrefter at rapporten gir et riktig bilde av befaringen. Signeres elektronisk med e-postbekreftelse, eller på stedet. Signeringsside med tidspunkt og dokumentets fingeravtrykk legges ved når alle har signert.'), 8.5, MUTED);
    for (const d of sig) { D.plass(46); D.page.drawLine({ start: { x: M, y: D.y - 30 }, end: { x: M + 230, y: D.y - 30 }, thickness: .5, color: LINE }); D.t(`${d.navn || ''}${d.rolle ? ' – ' + tt(d.rolle) : ''}${d.firma ? ', ' + d.firma : ''}`, M, D.y - 42, 8.5, INK); D.y -= 50; } }
  return await D.pdf.save();
}
