// Arbeidsflater per oppgave i prosjektet (beskrivelse, overslag, ramme, tilbud, møter, endringer, mangler …),
// beslutningspunkter mellom faser og grunnlag (øyeblikksbilde) for faserapport og statusrapport.
import { S, save, state } from './store';
import { byId, today, eNavn, aNavn, lNavn, addDays, type Rec } from './utils';
import { FASER, okonomi, fremdrift, delFor, delNavn, KLASSER, uid } from './prosjekt';

export const n = (v: any) => +String(v ?? '').replace(/\s/g, '').replace(',', '.') || 0;

/** Hvilken arbeidsflate en oppgave får. Eksplisitt o.type vinner, ellers utledes fra tittelen. */
export const OTYPER: [string, string][] = [
  ['generell', 'Generell oppgave (notat, sjekkpunkter, vedlegg)'], ['beskrivelse', 'Prosjektbeskrivelse (behov, mål, omfang, risiko)'], ['overslag', 'Grovt kostnadsoverslag'],
  ['ramme', 'Finansiering og budsjettramme'], ['kalkyle', 'Detaljert kostnadskalkyle'], ['sjekk', 'Sjekkliste'], ['sha', 'SHA: vurdering, risiko, koordinatorer og SHA-plan'], ['tilbud', 'Tilbud og evaluering'], ['kontrakt', 'Kontrakt'],
  ['moter', 'Møter og referater'], ['endringer', 'Endringsmeldinger og tillegg'], ['mangler', 'Overtakelse og mangelliste'],
];
export function oppgaveType(o: Rec): string {
  if (o.type && o.type !== 'auto') return o.type;
  const t = String(o.tittel || '').toLowerCase();
  if (/beskriv behov|behov og romprogram|behov og mål/.test(t)) return 'beskrivelse';
  if (/grovt kostnadsoverslag|kostnadsoverslag/.test(t)) return 'overslag';
  if (/finansiering|budsjettramme/.test(t)) return 'ramme';
  if (/detaljert kostnadskalkyle|kalkyle/.test(t)) return 'kalkyle';
  if (/innhent tilbud|evaluer tilbud|tilbudsevaluering/.test(t)) return 'tilbud';
  if (/kontrakt signert|kontrakt/.test(t)) return 'kontrakt';
  if (/oppstartsmøte|byggemøte|befaring|ettårsbefaring/.test(t)) return 'moter';
  if (/endringsmelding|tillegg/.test(t)) return 'endringer';
  if (/byggherreforskrift|sha-plan|\bsha\b/.test(t)) return 'sha';
  if (/mangel|overtakelse/.test(t)) return 'mangler';
  if (SJEKK_FOR(t)) return 'sjekk';
  return 'generell';
}
export const FORHMELD = 'Forhåndsmelding til Arbeidstilsynet (ved over 15 virkedager eller 250 dagsverk)';
/** Retter sjekkpunkttekster som er lagret med eldre ordlyd */
export const rettSjekk = (L: Rec[] = []) => L.map(x => /^Forhåndsmelding til Arbeidstilsynet \(ved over 30 dager/.test(x.t) ? { ...x, t: FORHMELD } : x);
/** Forhåndsdefinerte sjekkpunkter for kjente oppgaver */
const SJEKKLISTER: [RegExp, string[]][] = [
  [/søknadsplikt/, ['Er tiltaket søknadspliktig etter pbl. § 20-1?', 'Unntak etter pbl. § 20-5 / SAK10 § 4-1 vurdert', 'Behov for ansvarlig søker og ansvarsrett avklart', 'Nabovarsel sendt (ved søknad)', 'Dispensasjon nødvendig?', 'Tillatelse mottatt / søknad ikke nødvendig – begrunnelse dokumentert']],
  [/byggherreforskrift|sha-plan og koordinator/, ['Risikovurdering av arbeidet gjort', 'Behov for SHA-plan vurdert (flere virksomheter / risikofylt arbeid)', 'Koordinator for prosjektering (KP) utpekt', 'Koordinator for utførelse (KU) utpekt', FORHMELD, 'SHA-plan del av konkurransegrunnlaget', 'Dokumentasjon for fremtidig drift og vedlikehold planlagt (§ 12)']],
  [/hms \/ sha fulgt opp|sha fulgt opp/, ['SHA-plan oppdatert etter kontrahering og gjort kjent', 'Koordinator for utførelse (KU) følger opp', 'Vernerunder gjennomført jevnlig', 'Oversiktslister føres (§ 15)', 'Forhåndsmelding oppdatert og hengt opp på byggeplassen', 'Uønskede hendelser og avvik fulgt opp']],
  [/leietakere og varsle|konsekvenser for leietaker/, ['Berørte leietakere identifisert', 'Konsekvens for drift og adkomst vurdert', 'Leietakere varslet skriftlig med tidsplan', 'Behov for midlertidige løsninger avklart', 'Leieavtalens bestemmelser om arbeider i bygget vurdert']],
  [/tilstandsvurdering|registrering/, ['Befaring gjennomført', 'Tilstandsgrad (TG) og konsekvensgrad (KG) satt for berørte systemer', 'Bilder og målinger dokumentert', 'Miljøkartlegging (asbest, PCB o.l.) vurdert', 'Anbefalte tiltak beskrevet']],
  [/konkurransegrunnlag/, ['Beskrivelse og mengder', 'Tegninger', 'Kontraktsbestemmelser (NS 8405/8406/8407)', 'SHA-plan', 'Fremdriftskrav og frister', 'Tildelingskriterier og vekting', 'Tilbudsfrist og befaring']],
  [/fdv-dokumentasjon/, ['FDV-perm / digitalt FDV mottatt', 'Produktdatablad', 'Drifts- og vedlikeholdsinstrukser', 'Tegninger «som bygget»']],
  [/opplæring/, ['Opplæring gjennomført for driftspersonell', 'Deltakerliste signert', 'Driftsinstruks overlevert']],
  [/oppdater tegninger|kontrollplan/, ['Tegninger oppdatert', 'Systemer og komponenter registrert i appen', 'Lovpålagte kontroller lagt inn', 'Brannplaner / rømningsplaner oppdatert']],
];
function SJEKK_FOR(t: string) { return SJEKKLISTER.find(([r]) => r.test(t))?.[1]; }
export function standardSjekk(o: Rec): { id: string; t: string; ok: boolean }[] { return (SJEKK_FOR(String(o.tittel || '').toLowerCase()) || []).map(t => ({ id: uid(), t, ok: false })); }

// ---------------- Overslag / kalkyle
export type Linje = { id: string; post: string; bygningsdel?: string; fag?: string; mengde?: any; enhet?: string; pris?: any; belop?: any };
export const linjeSum = (l: Linje) => (l.mengde !== '' && l.mengde != null && n(l.mengde) && n(l.pris)) ? n(l.mengde) * n(l.pris) : n(l.belop);
export const PASLAG: [string, string, number][] = [['rigg', 'Rigg og drift', 8], ['prosj', 'Prosjektering og byggeledelse', 10], ['uforutsett', 'Uforutsett / usikkerhet', 15]];
export function kalkSum(k: Rec | undefined) {
  const L: Linje[] = k?.linjer || []; const sum = L.reduce((s, l) => s + linjeSum(l), 0);
  const pa = PASLAG.map(([id, navn, def]) => { const pst = k?.paslag?.[id] ?? def; return { id, navn, pst: n(pst), belop: sum * n(pst) / 100 }; });
  const tot = sum + pa.reduce((s, x) => s + x.belop, 0);
  return { L, sum, pa, tot };
}

// ---------------- Tilbud
export function tilbudScore(T: Rec[], v: Rec = {}) {
  const wp = n(v.pris ?? 60), wk = n(v.kvalitet ?? 30), wf = n(v.fremdrift ?? 10); const W = wp + wk + wf || 1;
  const priser = T.map(t => n(t.pris)).filter(x => x > 0); const min = priser.length ? Math.min(...priser) : 0;
  return T.map(t => { const ps = n(t.pris) > 0 && min ? (min / n(t.pris)) * 10 : 0; const tot = (ps * wp + n(t.kvalitet) * wk + n(t.fremdrift) * wf) / W; return { ...t, ps: Math.round(ps * 10) / 10, tot: Math.round(tot * 10) / 10 }; });
}

// ---------------- Beslutningspunkter
/** Faser som krever eiers godkjenning før neste fase (beslutningspunkt). Standard: idé, planlegging og anbud. */
export const krevGodkjenning = (p: Rec, k: string) => (p.godkjenning ?? { ide: true, plan: true, anbud: true, utf: false, over: true, garanti: false })[k] === true;
export const GODKJENT = ['Godkjent', 'Godkjent med merknader'];
export const sisteBeslutning = (p: Rec, fase: string) => (p.rapporter || []).filter((r: Rec) => r.type === 'fase' && r.fase === fase).sort((a: Rec, b: Rec) => String(b.opprettet).localeCompare(String(a.opprettet)))[0];
export const faseGodkjent = (p: Rec, fase: string) => GODKJENT.includes(sisteBeslutning(p, fase)?.status);
export const BESLUTNING_TEKST: Record<string, (p: Rec, s: Rec) => string> = {
  ide: (_p, s) => `Prosjektet videreføres til planlegging og prosjektering${s.ramme ? ` innenfor en budsjettramme på ${kr0(s.ramme)} eks. mva` : ''}.`,
  plan: (_p, s) => `Konkurranse lyses ut på grunnlag av beskrivelse og kalkyle${s.kalkyle?.tot ? ` på ${kr0(s.kalkyle.tot)} eks. mva` : ''}, og fremdriftsplanen legges til grunn.`,
  anbud: (_p, s) => { const v = (s.tilbud || []).find((t: Rec) => t.valgt); return v ? `Kontrakt inngås med ${v.leverandor} for ${kr0(n(v.pris))} eks. mva${v.fag ? ` (${v.fag})` : ''}.` : 'Kontrakt inngås med anbefalt leverandør.'; },
  utf: () => 'Utførelsen godkjennes, og prosjektet går videre til overtakelse.',
  over: () => 'Arbeidene overtas, og prosjektet avsluttes og går over i garantiperioden.',
  garanti: () => 'Garantiperioden avsluttes, og eventuelle sikkerhetsstillelser frigis.',
};
const kr0 = (v: number) => new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 }).format(Math.round(v)) + ' kr';

// ---------------- Gantt-data
export type GRad = { id: string; navn: string; nivaa: 0 | 1; start: string; slutt: string; status?: string; fase: string; milepael?: boolean; avledet?: boolean; ansvarlig?: string };
export function ganttRader(p: Rec): GRad[] {
  const R: GRad[] = [];
  for (const [k, l] of FASER) {
    const f = (p.faser || []).find((x: Rec) => x.k === k) || {};
    const O = (p.oppgaver || []).filter((o: Rec) => o.fase === k && o.status !== 'Ikke relevant');
    const ob = O.map((o: Rec) => ({ o, s: o.start || o.frist || '', e: o.frist || o.start || '' })).filter((x: any) => x.s);
    let fs = f.start || '', fe = f.slutt || ''; const avl = !fs || !fe;
    if (!fs && ob.length) fs = ob.map((x: any) => x.s).sort()[0]; if (!fe && ob.length) fe = ob.map((x: any) => x.e).sort().slice(-1)[0];
    if (fs && !fe) fe = fs; if (fe && !fs) fs = fe;
    const ferdig = O.length > 0 && O.every((o: Rec) => o.status === 'Ferdig');
    R.push({ id: 'fase:' + k, navn: l, nivaa: 0, start: fs, slutt: fe, fase: k, avledet: avl, status: ferdig ? 'Ferdig' : k === p.fase ? 'Pågår' : '' });
    for (const o of O) R.push({ id: o.id, navn: o.tittel, nivaa: 1, start: o.start || o.frist || '', slutt: o.frist || o.start || '', status: o.status, fase: k, ansvarlig: o.ansvarlig, milepael: !!o.frist && (!o.start || o.start === o.frist) && !!o.milepael });
    if (krevGodkjenning(p, k) && fe) { const b = sisteBeslutning(p, k); R.push({ id: 'bp:' + k, navn: `Beslutningspunkt: ${l}`, nivaa: 1, start: fe, slutt: fe, fase: k, milepael: true, status: b?.status || 'Venter' }); }
  }
  return R;
}

// ---------------- Rapportgrunnlag
export function snapshot(p: Rec, type: 'fase' | 'status', opt: Rec = {}): Rec {
  const o = okonomi(p); const e = byId('eiendommer', p.eiendomId); const fk = opt.fase || p.fase; const fi = FASER.findIndex(f => f[0] === fk);
  const A: Rec = p.arbeid || {}; const ov = kalkSum(A.overslag); const ka = kalkSum(A.kalkyle);
  const fra = opt.fra || ''; const til = opt.til || today();
  const O: Rec[] = (p.oppgaver || []).filter((x: Rec) => x.status !== 'Ikke relevant');
  const ferdigIPer = O.filter(x => x.status === 'Ferdig' && x.ferdig && (!fra || x.ferdig >= fra) && x.ferdig <= til);
  const forsinket = O.filter(x => x.frist && x.frist < today() && x.status !== 'Ferdig');
  const kommende = O.filter(x => x.status !== 'Ferdig' && x.frist && x.frist >= today() && x.frist <= addDays(today(), 42)).sort((a, b) => a.frist.localeCompare(b.frist));
  const E: Rec[] = A.endringer || []; const endr = { antall: E.length, godkjent: E.filter(x => x.status === 'Godkjent').reduce((s, x) => s + n(x.belop), 0), behandling: E.filter(x => ['Varslet', 'Under behandling'].includes(x.status)).reduce((s, x) => s + n(x.belop), 0), liste: E.slice(-15) };
  const M: Rec[] = A.mangler || [];
  return {
    type, versjon: 1, laget: new Date().toISOString(), av: state.me?.navn || state.me?.epost || '', avEpost: state.me?.epost || '',
    tittel: type === 'fase' ? `Beslutningsnotat – ${FASER[fi]?.[1] || ''}` : `Statusrapport – fremdrift og økonomi`,
    prosjekt: { navn: p.navn, type: p.type, status: p.status, eiendom: eNavn(p.eiendomId), adresse: e?.adresse || '', leder: p.leder || '', start: p.start || '', slutt: p.slutt || '',
      beskrivelse: p.beskrivelse || '', leietaker: p.leietakerId ? lNavn(p.leietakerId) : '', lokale: p.lokale || '', system: p.gammeltSystemId ? aNavn(p.gammeltSystemId) : '', kontrakt: p.kontrakt || '', entreprenor: p.entreprenor || '' },
    fase: { k: fk, navn: FASER[fi]?.[1] || '', nr: fi + 1 }, neste: FASER[fi + 1] ? { k: FASER[fi + 1][0], navn: FASER[fi + 1][1] } : null,
    periode: type === 'status' ? { fra, til } : null,
    beskrivelse: A.beskrivelse || null, risiko: (A.risiko || []).filter((r: Rec) => r.status !== 'Lukket'),
    overslag: ov.L.length ? { linjer: ov.L.map(l => ({ post: l.post, bygningsdel: l.bygningsdel, mengde: l.mengde, enhet: l.enhet, pris: l.pris, sum: linjeSum(l) })), sum: ov.sum, pa: ov.pa, tot: ov.tot, notat: A.overslag?.notat || '' } : null,
    kalkyle: ka.L.length ? { linjer: ka.L.map(l => ({ post: l.post, bygningsdel: l.bygningsdel, mengde: l.mengde, enhet: l.enhet, pris: l.pris, sum: linjeSum(l) })), sum: ka.sum, pa: ka.pa, tot: ka.tot, notat: A.kalkyle?.notat || '' } : null,
    ramme: n(A.ramme?.ramme) || n(p.ramme) || 0, finansiering: A.ramme?.finansiering || [], rammeNotat: A.ramme?.notat || '',
    tilbud: A.tilbud?.liste?.length ? tilbudScore(A.tilbud.liste, A.tilbud.vekt) : null, tilbudVekt: A.tilbud?.vekt || null, kontraktData: A.kontrakt || null,
    oppgaverFase: O.filter(x => x.fase === fk).map(x => ({ tittel: x.tittel, status: x.status, ansvarlig: x.ansvarlig, frist: x.frist, ferdig: x.ferdig })),
    faser: FASER.map(([k, l], i) => { const L = O.filter(x => x.fase === k); const f = (p.faser || []).find((x: Rec) => x.k === k) || {}; const b = sisteBeslutning(p, k);
      return { k, navn: l, nr: i + 1, ferdig: L.filter(x => x.status === 'Ferdig').length, antall: L.length, start: f.start || '', slutt: f.slutt || '', naa: k === p.fase, beslutning: b ? { status: b.status, dato: b.svar?.t || b.sendt || '' } : null, krever: krevGodkjenning(p, k) }; }),
    fremdrift: fremdrift(p), ferdigIPer: ferdigIPer.map(x => ({ tittel: x.tittel, ferdig: x.ferdig })), forsinket: forsinket.map(x => ({ tittel: x.tittel, frist: x.frist, ansvarlig: x.ansvarlig })),
    kommende: kommende.slice(0, 12).map(x => ({ tittel: x.tittel, frist: x.frist, ansvarlig: x.ansvarlig })),
    okonomi: { tot: o.tot, avvik: o.avvik, poster: o.poster.map(x => ({ post: x.b.post, fag: x.b.fag || '', del: delNavn(delFor(x.b)), budsjett: x.budsjett, forpliktet: x.forpliktet, palopt: x.palopt, prognose: x.prognose })),
      matrise: Object.entries(o.matrise).map(([k, r]) => ({ klasse: KLASSER.find(x => x[0] === k)?.[1] || k, r: Object.fromEntries(Object.entries(r).map(([d, v]) => [delNavn(d), v.prognose])) })), fordeling: o.fordeling },
    endringer: endr, mangler: { apne: M.filter(x => x.status !== 'Lukket').length, totalt: M.length, liste: M.filter(x => x.status !== 'Lukket').slice(0, 20) },
    gantt: ganttRader(p).filter(r => r.start),
    ...opt.tekst,
  };
}
export const trafikklysForslag = (s: Rec) => ({
  fremdrift: s.forsinket?.length > 3 ? 'rod' : s.forsinket?.length ? 'gul' : 'gronn',
  okonomi: s.okonomi?.tot?.budsjett ? (s.okonomi.avvik / s.okonomi.tot.budsjett > 0.05 ? 'rod' : s.okonomi.avvik > 0 ? 'gul' : 'gronn') : 'gul',
  kvalitet: s.mangler?.apne > 5 ? 'gul' : 'gronn',
});

export async function sha256(t: string) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
export const ARBEID_VIA_PROSJEKT = ['sha', 'beskrivelse', 'overslag', 'ramme', 'kalkyle', 'tilbud', 'kontrakt', 'moter', 'endringer', 'mangler'];
export async function oppdaterP(pid: string, patch: Rec, loggTekst?: string) {
  const p = byId('prosjekter', pid)!;
  await save('prosjekter', { ...p, ...patch, logg: loggTekst ? [...(p.logg || []), { t: new Date().toISOString(), k: loggTekst, av: state.me?.navn || state.me?.epost }] : p.logg });
}
export { S };
