// Prosjektarkiv ved ferdigstillelse: kontroll av hva som mangler, låste PDF-er av prosjektets arbeidsdokumenter
// (sluttrapport, SHA-plan, tilbud/kontrakt, referater, endringer, overtakelse, beslutninger), oppbevaringstid per dokument
// og kobling av FDV til riktig system.
import { rgb } from 'pdf-lib';
import { S, save, state, uploadFile } from './store';
import { aNavn, addDays, byId, eNavn, fd, today, type Rec } from './utils';
import { Doc, A4, M, INK, MUTED, LINE, SOFT, safe } from './arealRapport';
import { FASER, okonomi, fremdrift, delFor, delNavn, KLASSER, BETALER } from './prosjekt';
import { GODKJENT, kalkSum, linjeSum, n, tilbudScore } from './prosjektArbeid';
import { lokale } from './i18n';

const kr = (v: any) => new Intl.NumberFormat(lokale(), { maximumFractionDigits: 0 }).format(Math.round(+v || 0)) + ' kr';
const RED = rgb(0.71, 0.14, 0.09), AMBER = rgb(0.72, 0.47, 0.12), GREEN = rgb(0.18, 0.49, 0.31);

// ---------------- Oppbevaring
export type Regler = { reklamasjonAar: number; regnskapAar: number; shaMnd: number; personMnd: number };
export const STD_REGLER: Regler = { reklamasjonAar: 6, regnskapAar: 5, shaMnd: 6, personMnd: 6 };
export const ARKIVKLASSER: Record<string, { navn: string; slett: boolean; hint: string }> = {
  levetid: { navn: 'Byggets levetid', slett: false, hint: 'FDV, dokumentasjon for fremtidig arbeid (byggherreforskriften § 12), samsvarserklæringer, tegninger «som bygget»' },
  reklamasjon: { navn: 'Reklamasjonstiden', slett: false, hint: 'Kontrakt, endringer, overtakelse, mangler, referater, beslutninger. NS 8405/8406/8407 har normalt 5 års reklamasjonsfrist fra overtakelse – legg til litt margin.' },
  regnskap: { navn: 'Regnskap', slett: false, hint: 'Fakturaer og annen primærdokumentasjon – avklar med regnskapsfører.' },
  sha: { navn: 'SHA', slett: false, hint: 'SHA-planen skal oppbevares i minst seks måneder etter ferdigstillelse (byggherreforskriften § 7).' },
  person: { navn: 'Personopplysninger', slett: true, hint: 'Oversiktslister over arbeidstakere (byggherreforskriften § 15) skal oppbevares i seks måneder etter ferdigstillelse – deretter bør de slettes.' },
};
export function minstTil(klasse: string, dato: string, r: Regler) {
  const y = +dato.slice(0, 4);
  return klasse === 'levetid' ? '' : klasse === 'reklamasjon' ? addDays(dato, Math.round(365.25 * r.reklamasjonAar)) : klasse === 'regnskap' ? `${y + r.regnskapAar}-12-31`
    : klasse === 'sha' ? addDays(dato, Math.round(30.44 * r.shaMnd)) : addDays(dato, Math.round(30.44 * r.personMnd));
}
export function klasseFor(d: Rec, p?: Rec): string {
  const t = (d.type + ' ' + d.tittel).toLowerCase();
  if (/oversiktsliste|mannskapsliste|personalliste/.test(t)) return 'person';
  if (/faktura|bilag|kvittering/.test(t)) return 'regnskap';
  if (/sha-plan/.test(t)) return 'sha';
  if (/fdv|samsvar|som bygget|brukerveiledning|driftsinstruks|garantibevis|produktdatablad|§ 12|fremtidig arbeid|serviceavtale|branntegning|brannkonsept|ferdigattest|brukstillatelse/.test(t)) return 'levetid';
  if (p && (p.fdv || []).some((x: Rec) => x.dokId === d.id)) return 'levetid';
  return 'reklamasjon';
}
export const arkivStatus = (d: Rec) => { const a = d.arkiv; if (!a?.minstTil) return a ? 'levetid' : ''; return a.minstTil < today() ? (ARKIVKLASSER[a.klasse]?.slett ? 'slett' : 'vurder') : 'oppbevar'; };

// ---------------- Dokumenter per system
export const dokForSystem = (aid: string) => S.dokumenter.filter(d => d.anleggId === aid || (d.anleggIds || []).includes(aid));
/** Systemvalg for FDV i prosjektet: eksisterende systemer på eiendommen + nye systemer som registreres ved ferdigstilling */
export function systemValg(p: Rec): [string, string][] {
  const ut: [string, string][] = [];
  if (p.gammeltSystemId && !p.nyttSystemId) ut.push(['ny:utskift', `Nytt system som erstatter ${aNavn(p.gammeltSystemId)} (registreres ved ferdigstilling)`]);
  for (const x of p.nyeSystemer || []) ut.push([x.opprettetId || 'ny:' + x.id, x.opprettetId ? aNavn(x.opprettetId) : `Nytt: ${x.navn || x.type || 'system'} (registreres ved ferdigstilling)`]);
  for (const a of S.anlegg.filter(a => a.eiendomId === p.eiendomId && !a.arkivert)) if (!ut.some(u => u[0] === a.id)) ut.push([a.id, aNavn(a.id)]);
  return ut;
}
/** Foreløpig referanse (ny:…) → faktisk system når det er registrert */
export const normRef = (p: Rec, ref?: string) => !ref || !ref.startsWith('ny:') ? ref || '' : ref === 'ny:utskift' ? (p.nyttSystemId || ref) : ((p.nyeSystemer || []).find((x: Rec) => 'ny:' + x.id === ref)?.opprettetId || ref);
export const sysNavn = (p: Rec, ref?: string) => { const r = normRef(p, ref); return !r ? '' : r.startsWith('ny:') ? (systemValg(p).find(x => x[0] === r)?.[1] || 'Nytt system') : aNavn(r); };
export const stdSystem = (p: Rec) => p.nyttSystemId || (p.gammeltSystemId ? 'ny:utskift' : (p.nyeSystemer || []).length === 1 ? ((p.nyeSystemer[0].opprettetId) || 'ny:' + p.nyeSystemer[0].id) : '');
/** Kobler dokumenter med foreløpig systemreferanse (ny:…) til de faktiske systemene etter ferdigstilling */
export async function kobleNyeSystemer(pid: string, nid: string, nyeS: Rec[]) {
  for (const d of S.dokumenter.filter(d => d.prosjektId === pid && d.nySysRef)) {
    const ref = d.nySysRef as string; const til = ref === 'ny:utskift' ? nid : nyeS.find(x => 'ny:' + x.id === ref)?.opprettetId;
    if (til) { const { nySysRef: _r, ...rest } = d; await save('dokumenter', { ...rest, anleggId: til }); }
  }
}

// ---------------- Kontroll før ferdigstilling
export type Mangel = { t: string; niva: 'rod' | 'gul'; hvor?: string };
export function kontrollFerdigstill(p: Rec): Mangel[] {
  const M: Mangel[] = []; const A: Rec = p.arbeid || {};
  const F: Rec[] = p.fdv || []; const ikkeF = F.filter(x => !x.mottatt);
  if (ikkeF.length) M.push({ t: `${ikkeF.length} FDV-dokumenter er ikke mottatt: ${ikkeF.slice(0, 4).map(x => x.tittel).join(', ')}${ikkeF.length > 4 ? ' …' : ''}`, niva: 'rod', hvor: 'fdv' });
  const utenSys = F.filter(x => x.mottatt && !normRef(p, x.system) && systemValg(p).length);
  if (utenSys.length) M.push({ t: `${utenSys.length} FDV-dokumenter er ikke koblet til et system`, niva: 'gul', hvor: 'fdv' });
  if (!F.some(x => /fremtidig|§ 12/i.test(x.tittel)) && A.sha) M.push({ t: 'Dokumentasjon for fremtidig drift og vedlikehold (byggherreforskriften § 12) er ikke registrert som FDV-krav', niva: 'gul', hvor: 'fdv' });
  const apneM = (A.mangler?.liste || []).filter((x: Rec) => x.status !== 'Lukket'); if (apneM.length) M.push({ t: `${apneM.length} mangler fra overtakelsen er ikke lukket`, niva: 'gul', hvor: 'oppgaver' });
  const venter = (p.rapporter || []).filter((r: Rec) => r.type === 'fase' && r.status === 'Sendt'); if (venter.length) M.push({ t: `${venter.length} beslutningsnotat venter på svar fra eier`, niva: 'gul', hvor: 'rapporter' });
  const em = (A.endringer?.liste || []).filter((x: Rec) => ['Varslet', 'Under behandling'].includes(x.status)); if (em.length) M.push({ t: `${em.length} endringsmeldinger er ikke avklart (${kr(em.reduce((s: number, x: Rec) => s + n(x.belop), 0))})`, niva: 'gul', hvor: 'oppgaver' });
  const ikkeO = (p.oppgaver || []).filter((o: Rec) => o.fase !== 'garanti' && !['Ferdig', 'Ikke relevant'].includes(o.status)); if (ikkeO.length) M.push({ t: `${ikkeO.length} oppgaver (før garantiperioden) er ikke ferdige`, niva: 'gul', hvor: 'oppgaver' });
  const bestilt = (p.kostnader || []).filter((c: Rec) => c.status === 'Bestilt'); if (bestilt.length) M.push({ t: `${bestilt.length} kostnader står fortsatt som bestilt (ikke fakturert)`, niva: 'gul', hvor: 'okonomi' });
  return M;
}

// ---------------- PDF med brytning av lange tekster i tabeller og avsnitt
export class ArkivDoc extends Doc {
  static async lag(tittel: string) { const d = Object.assign(new ArkivDoc(), await Doc.ny(tittel)) as ArkivDoc; (d.pdf as any).__doc = d; d.nyside(); return d; }
  linjer(s: any, max: number, size = 8.5, bold = false) { const ut: string[] = []; for (const avs of safe(s).split('\n')) { let l = ''; for (const o of avs.split(' ')) { const nn = l ? l + ' ' + o : o; if (this.w(nn, size, bold) > max && l) { ut.push(l); l = o; } else l = nn; } ut.push(l); } return ut; }
  tekst(s: any, size = 9, color = INK) { if (!String(s ?? '').trim()) return; const L = this.linjer(s, this.page.getWidth() - 2 * M, size); for (const l of L) { this.plass(size + 4); this.t(l, M, this.y - size, size, color); this.y -= size + 3.5; } this.y -= 4; }
  kv(rader: [string, any][]) { const W = this.page.getWidth() - 2 * M; for (const [k, v] of rader.filter(r => r[1] !== '' && r[1] != null)) { const L = this.linjer(v, W * 0.64, 8.8); const h = L.length * 12 + 4; this.plass(h); this.t(k, M, this.y - 10, 8.5, MUTED); L.forEach((l, i) => this.t(l, M + W * 0.34, this.y - 10 - i * 12, 8.8)); this.y -= h; this.page.drawLine({ start: { x: M, y: this.y + 1 }, end: { x: M + W, y: this.y + 1 }, thickness: 0.3, color: LINE }); } this.y -= 8; }
  /** Tabell der lange tekster brytes på flere linjer. cols: [tittel, andel, høyrejustert] */
  tab(cols: [string, number, boolean?][], rows: { c: any[]; bold?: boolean; farge?: any[] }[]) {
    const W = this.page.getWidth() - 2 * M; const tot = cols.reduce((s, c) => s + c[1], 0); const ws = cols.map(c => c[1] / tot * W);
    const hode = () => { this.plass(30); this.page.drawRectangle({ x: M, y: this.y - 15, width: W, height: 15, color: SOFT }); let x = M; cols.forEach((c, i) => { this.t(this.fit(c[0].toUpperCase(), ws[i] - 6, 6.6, true), c[2] ? x + ws[i] - 3 - this.w(this.fit(c[0].toUpperCase(), ws[i] - 6, 6.6, true), 6.6, true) : x + 3, this.y - 10.5, 6.6, MUTED, true); x += ws[i]; }); this.y -= 15; };
    hode();
    for (const r of rows) {
      const L = r.c.map((v, i) => this.linjer(v ?? '', ws[i] - 6, 8, r.bold)); const h = Math.max(...L.map(l => l.length)) * 10.5 + 5;
      if (this.y - h < 46) { this.nyside(); hode(); }
      let x = M; L.forEach((ls, i) => { ls.forEach((l, j) => this.t(l, cols[i][2] ? x + ws[i] - 3 - this.w(l, 8, r.bold) : x + 3, this.y - 10 - j * 10.5, 8, r.farge?.[i] || INK, r.bold)); x += ws[i]; });
      this.y -= h; this.page.drawLine({ start: { x: M, y: this.y }, end: { x: M + W, y: this.y }, thickness: 0.4, color: LINE });
    }
    this.y -= 10;
  }
  hode(p: Rec, under: string) { this.t(`${eNavn(p.eiendomId)} · ${p.navn}`, M, this.y - 8, 8, MUTED); this.y -= 14; this.h1(this.tittel); this.t(under, M, this.y - 4, 8, MUTED); this.y -= 18; }
}

const stempel = (p: Rec) => `Låst arkivkopi laget ${fd(today())} av ${state.me?.navn || state.me?.epost || ''} ved ferdigstillelse av prosjektet${p.fullfort ? ` (overtakelse ${fd(p.fullfort)})` : ''}.`;
const risiko = (r: Rec) => { const v = ['Lav', 'Middels', 'Høy']; return (v.indexOf(r.s ?? r.sannsynlighet) + 1) * (v.indexOf(r.k ?? r.konsekvens) + 1); };

async function sluttrapport(p: Rec, erfaringer: string) {
  const d = await ArkivDoc.lag('Sluttrapport'); const o = okonomi(p); d.hode(p, stempel(p));
  d.nokkel([['Budsjett', kr(o.tot.budsjett)], ['Påløpt', kr(o.tot.palopt)], ['Prognose / sluttkost', kr(o.tot.prognose), o.avvik > 0 ? RED : undefined], ['Fremdrift', fremdrift(p) + ' %']]);
  d.kv([['Prosjekttype', p.type], ['Prosjektleder', p.leder || ''], ['Periode', p.start ? `${fd(p.start)} – ${fd(p.fullfort || p.slutt)}` : ''], ['Entreprenør / kontrakt', [p.entreprenor, p.kontrakt].filter(Boolean).join(' · ')],
    ['Garantitid til', p.garantiTil ? fd(p.garantiTil) : ''], ['Erstattet system', p.gammeltSystemId ? aNavn(p.gammeltSystemId) : ''], ['Nytt system', p.nyttSystemId ? aNavn(p.nyttSystemId) : ''],
    ['Nye systemer', (p.nyeSystemer || []).map((x: Rec) => x.opprettetId ? aNavn(x.opprettetId) : x.navn).join(', ')]]);
  const B = p.arbeid?.beskrivelse; if (p.beskrivelse || B?.mal) { d.h2('Mål og omfang'); d.tekst([B?.mal, B?.omfang, p.beskrivelse].filter(Boolean).join('\n\n')); }
  d.h2('Økonomi per post');
  d.tab([['Post', 3], ['Bygg/teknisk', 1.6], ['Budsjett', 1.3, true], ['Påløpt', 1.3, true], ['Prognose', 1.3, true], ['Avvik', 1.2, true]],
    [...o.poster.map(x => ({ c: [x.b.post + (x.b.fag ? ` (${x.b.fag})` : ''), delNavn(delFor(x.b)), kr(x.budsjett), kr(x.palopt), kr(x.prognose), kr(x.prognose - x.budsjett)], farge: [, , , , , x.prognose > x.budsjett ? RED : undefined] })),
      ...(o.uten.length ? [{ c: ['Kostnader uten budsjettpost', '', '', kr(o.uten.reduce((s, x) => s + n(x.belop), 0)), '', ''] }] : []),
      { c: ['Sum', '', kr(o.tot.budsjett), kr(o.tot.palopt), kr(o.tot.prognose), kr(o.avvik)], bold: true }]);
  const D = [...new Set(Object.values(o.matrise).flatMap(r => Object.keys(r)))];
  if (D.length) { d.h2('Regnskapsklassifisering – bygg og tekniske installasjoner (påløpt)');
    d.tab([['Klassifisering', 3], ...D.map(x => [delNavn(x), 1.6, true] as [string, number, boolean])], Object.entries(o.matrise).map(([k, r]) => ({ c: [KLASSER.find(x => x[0] === k)?.[1] || k, ...D.map(x => r[x] ? kr(r[x].palopt) : '–')] })));
    d.tekst('Aktiverte kostnader føres på egen saldo for bygg (saldogruppe h/i) og faste tekniske installasjoner (saldogruppe j). Fordelingen bygger på NS 3451-bygningsdel per post og avklares med regnskapsfører.', 7.5, MUTED); }
  if (o.fordeling?.leietaker) d.kv([['Fordeling eier', kr(o.fordeling.eier)], ['Fordeling leietaker', kr(o.fordeling.leietaker)]]);
  d.h2('Faser og beslutninger');
  d.tab([['Fase', 3], ['Periode', 2], ['Beslutning', 3]], FASER.map(([k, l]) => { const f = (p.faser || []).find((x: Rec) => x.k === k) || {}; const b = (p.rapporter || []).filter((r: Rec) => r.type === 'fase' && r.fase === k).slice(-1)[0];
    return { c: [l, f.start ? `${fd(f.start)} – ${fd(f.slutt)}` : '–', b ? `${b.status}${b.svar ? ` – ${b.svar.navn} ${fd(String(b.svar.t).slice(0, 10))}` : ''}` : '–'] }; }));
  const E: Rec[] = p.arbeid?.endringer?.liste || []; if (E.length) d.kv([['Endringer', `${E.length} registrert, godkjent ${kr(E.filter(x => x.status === 'Godkjent').reduce((s, x) => s + n(x.belop), 0))}`]]);
  if (erfaringer.trim()) { d.h2('Erfaringer og læringspunkter'); d.tekst(erfaringer); }
  return d;
}
async function shaDok(p: Rec) {
  const v: Rec = p.arbeid?.sha; if (!v) return null; const O = v.org || {}; const R: Rec[] = v.risiko || [];
  const d = await ArkivDoc.lag('SHA-plan og risikovurdering'); d.hode(p, stempel(p) + ' Byggherreforskriften §§ 5–8.');
  const V = v.vurdering || {};
  d.h2('Vurdering av plikter'); d.kv([['Rutinemessig / mindre vedlikehold', V.vedlikehold || '–'], ['Flere prosjekterende', V.flereP ?? V.flere ?? '–'], ['Flere utførende', V.flereU ?? V.flere ?? '–'],
    ['Varighet / dagsverk', [V.dager && `${V.dager} virkedager`, (n(V.dagsverk) || (n(V.dager) * n(V.personer))) && `${n(V.dagsverk) || n(V.dager) * n(V.personer)} dagsverk`].filter(Boolean).join(', ')], ['Forhåndsmelding sendt', V.forhandsmeldt ? fd(V.forhandsmeldt) : ''], ['Begrunnelse', V.notat || '']]);
  d.h2('Organisering'); d.kv([['Byggherre', O.byggherre || ''], ['Byggherrens representant', O.bhr || p.leder || ''], ['Koordinator prosjektering (KP)', O.kp || ''], ['Koordinator utførelse (KU)', O.ku || ''], ['Koordinatoravtale', O.avtale ? fd(O.avtale) : ''], ['Verneombud / hovedbedrift', O.vo || ''],
    ...(O.aktorer || []).map((a: Rec) => [a.rolle || 'Virksomhet', [a.virksomhet, a.kontakt, a.tlf].filter(Boolean).join(' – ')] as [string, string])]);
  d.h2('Risikoforhold og tiltak');
  if (R.length) d.tab([['Arbeidsoperasjon', 2], ['Fare', 3], ['Risiko', 0.8, true], ['Tiltak', 3.4], ['Ansvar', 1.3]], [...R].sort((a, b) => risiko(b) - risiko(a)).map(r => ({ c: [`${r.aktivitet}\n${r.fase || ''}`, r.fare, String(risiko(r)), r.tiltak, r.ansvar], farge: [, , risiko(r) >= 6 ? RED : risiko(r) >= 3 ? AMBER : GREEN] })));
  else d.tekst('Ingen risikoforhold registrert.', 9, MUTED);
  if (v.plan?.tiltak) { d.h2('Forebyggende tiltak på plassen (§ 9)'); d.tekst(v.plan.tiltak); }
  d.h2('Avvik og varsling'); d.tekst(v.plan?.avvik || 'Avvik og uønskede hendelser meldes straks til KU og byggherre.'); d.tekst(v.plan?.varsling || 'Ved ulykke: 113 / 110 / 112, deretter anleggsleder, KU og byggherre.');
  return d;
}
async function tilbudDok(p: Rec) {
  const A = p.arbeid || {}; const T: Rec[] = A.tilbud?.liste || []; const K: Rec = A.kontrakt; if (!T.length && !K) return null;
  const d = await ArkivDoc.lag('Tilbudsevaluering og kontrakt'); d.hode(p, stempel(p));
  if (T.length) { const v = A.tilbud.vekt || { pris: 60, kvalitet: 30, fremdrift: 10 }; d.h2('Tilbud');
    d.tab([['Leverandør', 2.4], ['Fag', 1.6], ['Pris eks. mva', 1.5, true], ['Pris', 0.7, true], ['Kval.', 0.7, true], ['Fremdr.', 0.8, true], ['Poeng', 0.8, true], ['Forbehold', 2.4]],
      tilbudScore(T, v).sort((a, b) => b.tot - a.tot).map(t => ({ c: [t.leverandor + (t.valgt ? ' (anbefalt)' : ''), t.fag, kr(t.pris), t.ps, t.kvalitet, t.fremdrift, t.tot, t.forbehold], bold: !!t.valgt })));
    d.tekst(`Vekting: pris ${v.pris} %, kvalitet ${v.kvalitet} %, fremdrift ${v.fremdrift} %. Laveste pris gir 10 prispoeng.`, 7.5, MUTED); if (A.tilbud.begrunnelse) { d.h2('Begrunnelse'); d.tekst(A.tilbud.begrunnelse); } }
  if (K) { d.h2('Kontrakt'); d.kv([['Kontraktspart', K.part], ['Kontraktsform', K.form], ['Kontraktssum eks. mva', K.sum ? kr(K.sum) : ''], ['Fag', K.fag], ['Signert', K.signert ? fd(K.signert) : ''], ['Avtalt ferdig', K.ferdig ? fd(K.ferdig) : ''], ['Dagmulkt', K.dagmulkt], ['Sikkerhetsstillelse', K.sikkerhet]]); }
  return d;
}
async function moteDok(p: Rec) {
  const L: Rec[] = p.arbeid?.moter?.liste || []; if (!L.length) return null;
  const d = await ArkivDoc.lag('Møtereferater'); d.hode(p, stempel(p));
  for (const m of [...L].sort((a, b) => String(a.dato).localeCompare(String(b.dato)))) { d.h2(`${m.type || 'Møte'} ${fd(m.dato)}`); d.kv([['Deltakere', m.deltakere || '']]); d.tekst(m.referat);
    if ((m.saker || []).length) d.tab([['Sak', 4], ['Ansvar', 1.5], ['Frist', 1.1], ['Status', 1]], m.saker.map((s: Rec) => ({ c: [s.tekst, s.ansvar, s.frist ? fd(s.frist) : '', s.status] }))); }
  return d;
}
async function endringDok(p: Rec) {
  const L: Rec[] = p.arbeid?.endringer?.liste || []; if (!L.length) return null;
  const d = await ArkivDoc.lag('Endringsmeldinger og tillegg'); d.hode(p, stempel(p));
  d.tab([['Nr', 0.5], ['Dato', 1], ['Endring', 3.4], ['Fag', 1.4], ['Fra', 1.4], ['Beløp', 1.3, true], ['Dager', 0.7, true], ['Status', 1.3]], L.map(x => ({ c: [x.nr, x.dato ? fd(x.dato) : '', x.tittel, x.fag, x.leverandor, kr(x.belop), x.dager, x.status] })));
  const sum = (s: string[]) => L.filter(x => s.includes(x.status)).reduce((a, x) => a + n(x.belop), 0);
  d.kv([['Godkjent', kr(sum(['Godkjent']))], ['Avvist', kr(sum(['Avvist']))], ['Ikke avklart ved ferdigstillelse', kr(sum(['Varslet', 'Under behandling']))]]);
  return d;
}
async function overtakelseDok(p: Rec) {
  const v: Rec = p.arbeid?.mangler; if (!v || (!v.dato && !(v.liste || []).length)) return null;
  const d = await ArkivDoc.lag('Overtakelsesprotokoll og mangelliste'); d.hode(p, stempel(p));
  d.kv([['Overtakelsesforretning', v.dato ? fd(v.dato) : ''], ['Deltakere', v.deltakere || ''], ['Merknader', v.merknad || '']]);
  if ((v.liste || []).length) d.tab([['Nr', 0.5], ['Mangel', 4], ['Fag', 1.4], ['Ansvar', 1.4], ['Frist', 1], ['Status', 1]], v.liste.map((x: Rec) => ({ c: [x.nr, x.beskrivelse, x.fag, x.ansvar, x.frist ? fd(x.frist) : '', x.status] })));
  return d;
}
async function beskrivelseDok(p: Rec) {
  const A = p.arbeid || {}; const B = A.beskrivelse; const ov = kalkSum(A.kalkyle?.linjer?.length ? A.kalkyle : A.overslag); if (!B && !ov.L.length && !(A.risiko || []).length) return null;
  const d = await ArkivDoc.lag('Prosjektbeskrivelse, kalkyle og risiko'); d.hode(p, stempel(p));
  if (B) for (const [k, l] of [['bakgrunn', 'Bakgrunn og behov'], ['mal', 'Mål'], ['omfang', 'Omfang'], ['avgrensning', 'Avgrensning'], ['alternativer', 'Alternativer vurdert'], ['konsekvens', 'Konsekvens uten tiltak'], ['gevinst', 'Gevinster'], ['berorte', 'Berørte leietakere og drift']]) if (B[k]) { d.h2(l); d.tekst(B[k]); }
  if (ov.L.length) { d.h2(A.kalkyle?.linjer?.length ? 'Kostnadskalkyle' : 'Grovt kostnadsoverslag');
    d.tab([['Post', 3], ['Bygningsdel', 1.2], ['Mengde', 1, true], ['Enhetspris', 1.2, true], ['Sum', 1.3, true]], [...ov.L.map(l => ({ c: [l.post, l.bygningsdel || '', n(l.mengde) ? `${l.mengde} ${l.enhet || ''}` : '', n(l.mengde) ? kr(l.pris) : '', kr(linjeSum(l))] })),
      ...ov.pa.filter(x => x.belop).map(x => ({ c: [`${x.navn} (${x.pst} %)`, '', '', '', kr(x.belop)] })), { c: ['Totalt eks. mva', '', '', '', kr(ov.tot)], bold: true }]); }
  if ((A.risiko || []).length) { d.h2('Prosjektrisiko'); d.tab([['Risiko', 3], ['Sanns.', 1], ['Kons.', 1], ['Tiltak', 3], ['Status', 1]], A.risiko.map((r: Rec) => ({ c: [r.risiko, r.sannsynlighet, r.konsekvens, r.tiltak, r.status] }))); }
  return d;
}
async function beslutningDok(p: Rec) {
  const R: Rec[] = p.rapporter || []; if (!R.length) return null;
  const d = await ArkivDoc.lag('Beslutninger og rapporter til eier'); d.hode(p, stempel(p) + ' Fullstendige rapporter ligger i prosjektet.');
  for (const r of [...R].sort((a, b) => String(a.opprettet).localeCompare(String(b.opprettet)))) { const s = r.snap || {};
    d.h2(r.tittel); d.kv([['Laget', `${fd(String(r.opprettet).slice(0, 10))} av ${r.av || ''}`], ['Sendt til', r.sendtTil ? `${r.sendtTil.navn || ''} ${r.sendtTil.epost} ${fd(String(r.sendt).slice(0, 10))}` : 'Ikke sendt'], ['Status', r.status || 'Utkast'],
      ['Det ble bedt om', s.beslutning || ''], ['Anbefaling', s.anbefaling || s.statusTekst || ''], ['Budsjett / prognose', s.okonomi ? `${kr(s.okonomi.tot?.budsjett)} / ${kr(s.okonomi.tot?.prognose)}` : ''],
      ['Svar', r.svar ? `${r.svar.beslutning} – ${r.svar.navn}${r.svar.epost ? ` (${r.svar.epost})` : ''} ${fd(String(r.svar.t).slice(0, 10))}, ${r.svar.via === 'manuelt' ? 'registrert manuelt' : 'via lenke'}` : ''], ['Kommentar', r.svar?.komm || ''],
      ...(r.kommentarer || []).map((k: Rec) => ['Kommentar ' + fd(String(k.t).slice(0, 10)), `${k.navn}: ${k.komm}`] as [string, string])]); }
  return d;
}

/** Lager arkivkopiene, lagrer dem som dokumenter og setter oppbevaringstid på alle prosjektets dokumenter */
export async function lagProsjektarkiv(pid: string, o: { regler: Regler; erfaringer: string; dato: string }, status: (s: string) => void) {
  const p = byId('prosjekter', pid)!; const sys = p.nyttSystemId || (p.nyeSystemer || []).find((x: Rec) => x.opprettetId)?.opprettetId || '';
  const lagd: string[] = [];
  const jobber: [string, string, () => Promise<ArkivDoc | null>][] = [
    ['Sluttrapport', 'reklamasjon', () => sluttrapport(p, o.erfaringer)], ['SHA-plan og risikovurdering', 'sha', () => shaDok(p)], ['Prosjektbeskrivelse, kalkyle og risiko', 'reklamasjon', () => beskrivelseDok(p)],
    ['Tilbudsevaluering og kontrakt', 'reklamasjon', () => tilbudDok(p)], ['Møtereferater', 'reklamasjon', () => moteDok(p)], ['Endringsmeldinger og tillegg', 'reklamasjon', () => endringDok(p)],
    ['Overtakelsesprotokoll og mangelliste', 'reklamasjon', () => overtakelseDok(p)], ['Beslutninger og rapporter til eier', 'reklamasjon', () => beslutningDok(p)]];
  for (const [navn, klasse, f] of jobber) {
    status(`Lager ${navn.toLowerCase()} …`); const d = await f(); if (!d) continue;
    const bytes = await d.pdf.save(); const filnavn = `${navn} – ${p.navn}.pdf`.replace(/[\/\\]/g, '-');
    const fil = await uploadFile(new Blob([bytes as any], { type: 'application/pdf' }) as any, p.eiendomId, undefined, filnavn, `prosjekt/${pid}`); if (!fil) throw new Error('Opplasting feilet for ' + navn);
    const id = await save('dokumenter', { eiendomId: p.eiendomId, leietakerId: '', prosjektId: pid, anleggId: navn === 'SHA-plan og risikovurdering' || navn === 'Sluttrapport' ? sys : '', type: navn.startsWith('SHA') ? 'SHA-plan' : 'Prosjektdokumentasjon',
      tittel: `${navn} – ${p.navn}`, dato: o.dato, fil, laast: true, arkiv: { klasse, minstTil: minstTil(klasse, o.dato, o.regler), prosjektId: pid, laget: new Date().toISOString(), av: state.me?.navn || state.me?.epost } });
    lagd.push(id);
  }
  status('Setter oppbevaringstid på prosjektets dokumenter …');
  for (const d of S.dokumenter.filter(d => d.prosjektId === pid && !lagd.includes(d.id) && !d.arkiv)) { const k = klasseFor(d, p); await save('dokumenter', { ...d, arkiv: { klasse: k, minstTil: minstTil(k, o.dato, o.regler), prosjektId: pid } }); }
  return lagd;
}
export { A4, BETALER };
