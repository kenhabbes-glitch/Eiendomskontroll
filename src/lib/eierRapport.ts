// Statusrapport til eier: eiers lov- og forskriftsfestede oppgaver, påkrevde dokumenter, avvik, tilsyn,
// leietakeroppfølging og brannvern – med trafikklys og prioriterte tiltak.
import { S } from './store';
import { AV_LUKKET, DOK_PAAKREVD, KOMP, MALER, PROP_MALER } from './catalog';
import { aNavn, addDays, dUntil, docCoverage, fd, intTxt, pliktStatus, sortBy, today, type Rec } from './utils';
import { bvStatus, bvVersjon, aktiveMidl, mangelAnsvarlig } from './brannvern';
import { tilsynssaker } from '../views/Tilsyn';
import { harModul } from './moduler';
import { tt } from './i18n';

export type Lys = 'green' | 'amber' | 'red' | 'grey';
export const LYS_TEKST: Record<Lys, string> = { green: 'I orden', amber: 'Følg opp', red: 'Krever tiltak', grey: 'Ikke vurdert' };
const verst = (...l: Lys[]): Lys => l.includes('red') ? 'red' : l.includes('amber') ? 'amber' : l.includes('green') ? 'green' : 'grey';

// Grunnlag for dokumentkravene (kort – utfyllende forklaring ligger i Regelverk og plikter)
export const DOK_GRUNNLAG: Record<string, { h: string; krav: 'lov' | 'tiltak' | 'anbefalt' | 'avtale' }> = {
  'Ferdigattest/brukstillatelse': { h: 'Plan- og bygningsloven § 21-10 – ferdigattest (eller midlertidig brukstillatelse) for lovlig bruk', krav: 'lov' },
  'Brannkonsept/brannteknisk dokumentasjon': { h: 'Forskrift om brannforebygging §§ 4–5 – eier skal ha og holde oppdatert dokumentasjon av brannsikkerheten', krav: 'lov' },
  'Branntegninger/rømningsplaner': { h: 'Forskrift om brannforebygging §§ 4–5 – del av den branntekniske dokumentasjonen', krav: 'lov' },
  'FDV-dokumentasjon': { h: 'TEK17 § 4-1 – dokumentasjon for forvaltning, drift og vedlikehold skal foreligge og holdes oppdatert', krav: 'lov' },
  'Energiattest': { h: 'Energimerkeforskriften – yrkesbygg over 1000 m² skal ha gyldig energiattest synlig oppslått (gyldig i 10 år)', krav: 'lov' },
  'Samsvarserklæring el-anlegg': { h: 'Forskrift om elektriske lavspenningsanlegg § 12 – samsvarserklæring for nye og endrede installasjoner', krav: 'lov' },
  'Tilstandsrapport': { h: 'Anbefalt (NS 3424) – grunnlag for vedlikeholdsplan; byggverk skal holdes i forsvarlig stand (pbl. § 31-3)', krav: 'anbefalt' },
  'Miljøkartlegging (asbest/PCB)': { h: 'TEK17 § 9-7 – påkrevd før rehabilitering og riving', krav: 'tiltak' },
  'Forsikringspolise': { h: 'Forsikringsvilkår / lånevilkår – ikke lovkrav', krav: 'avtale' },
};
export const KRAV_TEKST = { lov: 'Lovkrav', tiltak: 'Ved tiltak', anbefalt: 'Anbefalt', avtale: 'Avtale' };

export type KontrollRad = { navn: string; system: string; hjemmel: string; intervall: string; sist: string; frist: string; lys: Lys; status: string; type: string; mangler?: boolean; id?: string };
export type DokRad = { type: string; h: string; krav: string; lys: Lys; status: string; dato: string; gyldigTil: string; tittel: string };
export type Tiltak = { pri: 1 | 2 | 3; tekst: string; omr: string };
export type EierStatus = {
  harBv: boolean; harTs: boolean;
  e: Rec; dato: string; lys: Lys;
  omrader: { navn: string; lys: Lys; tekst: string }[];
  kontroller: KontrollRad[]; dok: DokRad[];
  avvik: { apne: number; krit: number; over: number; liste: Rec[] };
  tilsyn: { navn: string; ref: string; svarfrist: string; apne: number; lys: Lys; status: string }[];
  leietakere: { navn: string; plikter: string; ik: Lys; bv: string; bvLys: Lys; ansvarlig: boolean; slutt: string }[];
  brannvern: { versjon: number; midl: number; lys: Lys; tekst: string };
  kommende: { d: string; t: string; type: string }[];
  tiltak: Tiltak[];
};

const LOVTYPER = ['Lovpålagt', 'Forsikringskrav'];
function kontrollLys(o: Rec): [Lys, string] {
  const d = dUntil(o.nesteFrist); if (d === null) return ['amber', 'Mangler frist'];
  if (d < 0) return ['red', `Forfalt (${-d} d)`]; if (d <= 30) return ['amber', `Forfaller om ${d} d`]; return ['green', 'I rute'];
}

export function eierStatus(eid: string): EierStatus {
  const e = S.eiendommer.find(x => x.id === eid)!; const nå = today();
  const T = S.oppgaver.filter(o => o.eiendomId === eid && o.aktiv !== false);
  const tiltak: Tiltak[] = [];

  // ---- Eiers lovpålagte kontroller (registrerte + forventede som mangler i kontrollplanen)
  const kontroller: KontrollRad[] = sortBy(T.filter(o => LOVTYPER.includes(o.type) && (o.ansvar || 'Eier') !== 'Leietaker'), o => o.nesteFrist || '').map(o => {
    const [lys, status] = kontrollLys(o); const h = (o.historikk || []).slice(-1)[0];
    return { id: o.id, navn: o.navn, system: o.anleggId ? aNavn(o.anleggId) : 'Eiendommen', hjemmel: o.hjemmel || MALER[o.malKey]?.h || '', intervall: intTxt(o.intervall), sist: o.sistUtfort || h?.dato || '', frist: o.nesteFrist || '', lys, status, type: o.type };
  });
  const har = (k: string, a: string) => S.oppgaver.some(o => o.eiendomId === eid && o.malKey === k && (o.anleggId || '') === a && o.aktiv !== false);
  const forventet: [string, string][] = [
    ...PROP_MALER.filter(k => LOVTYPER.includes(MALER[k]?.t) && !(k === 'energiattest' && +e.bta && +e.bta < 1000)).map(k => [k, ''] as [string, string]),
    ...S.anlegg.filter(a => a.eiendomId === eid && !a.arkivert).flatMap(a => (KOMP[a.type]?.m || []).filter(k => LOVTYPER.includes(MALER[k]?.t)).map(k => [k, a.id] as [string, string])),
  ];
  for (const [k, a] of forventet) if (!har(k, a)) { const m = MALER[k];
    kontroller.push({ navn: m.n, system: a ? aNavn(a) : 'Eiendommen', hjemmel: m.h, intervall: intTxt({ n: m.i[0], enhet: m.i[1] }), sist: '', frist: '', lys: 'red', status: 'Ikke i kontrollplanen', type: m.t, mangler: true }); }
  const kForf = kontroller.filter(k => k.lys === 'red' && !k.mangler); const kMangl = kontroller.filter(k => k.mangler); const kSnart = kontroller.filter(k => k.lys === 'amber');
  kForf.forEach(k => tiltak.push({ pri: 1, omr: 'Kontroller', tekst: tt("Gjennomfør «{0}»{1} – frist var {2}", k.navn, k.system !== 'Eiendommen' ? ` (${k.system})` : '', fd(k.frist)) }));
  if (kMangl.length) tiltak.push({ pri: 1, omr: 'Kontroller', tekst: tt("Legg inn {0} lovpålagt{1} kontroll{2} som mangler i kontrollplanen: {3}{4}", kMangl.length, kMangl.length > 1 ? 'e' : '', kMangl.length > 1 ? 'er' : '', kMangl.slice(0, 3).map(k => '«' + k.navn + '»').join(', '), kMangl.length > 3 ? ' …' : '') });
  const kLys = verst(kForf.length || kMangl.length ? 'red' : 'green', kSnart.length ? 'amber' : 'green');

  // ---- Dokumenter eier skal ha
  const dok: DokRad[] = docCoverage(e, DOK_PAAKREVD).map((c: any) => { const g = DOK_GRUNNLAG[c.t] || { h: '', krav: 'anbefalt' as const };
    const d = c.d as Rec | undefined; const krav = KRAV_TEKST[g.krav];
    const [lys, status]: [Lys, string] = c.s === 'na' ? ['grey', 'Ikke relevant'] : c.s === 'ok' ? ['green', 'Foreligger'] : c.s === 'soon' ? ['amber', 'Utløper snart'] : c.s === 'exp' ? [g.krav === 'lov' ? 'red' : 'amber', 'Utløpt'] : [g.krav === 'lov' ? 'red' : 'amber', 'Mangler'];
    return { type: c.t, h: g.h, krav, lys, status, dato: d?.dato || '', gyldigTil: d?.gyldigTil || '', tittel: d?.tittel || '' }; });
  const liste = (L: DokRad[]) => L.map(d => d.type).join(', ');
  const mangl = dok.filter(d => d.lys === 'red' && d.status === 'Mangler'); const utl = dok.filter(d => d.lys === 'red' && d.status === 'Utløpt');
  if (mangl.length) tiltak.push({ pri: 1, omr: 'Dokumenter', tekst: tt("Skaff {0}: {1}", mangl.length === 1 ? 'lovpålagt dokument' : mangl.length + ' lovpålagte dokumenter', liste(mangl)) });
  if (utl.length) tiltak.push({ pri: 1, omr: 'Dokumenter', tekst: tt("Forny utløpt{0}: {1}", utl.length > 1 ? 'e' : '', liste(utl)) });
  dok.filter(d => d.status === 'Utløper snart').forEach(d => tiltak.push({ pri: 2, omr: 'Dokumenter', tekst: tt("Forny {0} før {1}", d.type, fd(d.gyldigTil)) }));
  const vurd = dok.filter(d => d.lys === 'amber' && d.status !== 'Utløper snart');
  if (vurd.length) tiltak.push({ pri: 3, omr: 'Dokumenter', tekst: tt("Vurder behovet for: {0}", vurd.map(d => `${d.type} (${d.krav.toLowerCase()})`).join(', ')) });
  const dLys = verst(...dok.filter(d => d.lys !== 'grey').map(d => d.lys));

  // ---- Avvik
  const A = S.avvik.filter(a => a.eiendomId === eid && !AV_LUKKET.includes(a.status));
  const krit = A.filter(a => a.alv === 'Kritisk' || a.alv === 'Høy'); const over = A.filter(a => a.frist && (dUntil(a.frist) as number) < 0);
  if (A.filter(a => a.alv === 'Kritisk').length) tiltak.push({ pri: 1, omr: 'Avvik', tekst: tt("Lukk {0} kritiske avvik", A.filter(a => a.alv === 'Kritisk').length) });
  if (over.length) tiltak.push({ pri: over.some(a => a.alv === 'Kritisk' || a.alv === 'Høy') ? 1 : 2, omr: 'Avvik', tekst: tt("{0} avvik har passert utbedringsfristen", over.length) });
  const aLys: Lys = A.some(a => a.alv === 'Kritisk') || over.some(a => a.alv === 'Høy') ? 'red' : krit.length || over.length ? 'amber' : 'green';

  // ---- Tilsyn
  const harTs = harModul('tilsyn', eid); const harBv = harModul('brannvern', eid);
  const tilsyn = tilsynssaker().filter(s => harTs && s.eiendomId === eid && !s.lukket).map(s => {
    const d = dUntil(s.svarfrist); const [lys, status]: [Lys, string] = s.svarSendt ? ['amber', 'Svar sendt ' + fd(s.svarSendt) + ' – venter på lukking'] : d !== null && d < 0 ? ['red', 'Svarfristen er passert'] : d !== null && d <= 14 ? ['amber', `Svarfrist om ${d} d`] : ['amber', 'Under oppfølging'];
    if (lys === 'red') tiltak.push({ pri: 1, omr: 'Tilsyn', tekst: tt("Svar {0}{1} – svarfristen {2} er passert", s.myndighet, s.ref ? ' (' + s.ref + ')' : '', fd(s.svarfrist)) });
    return { navn: s.myndighet, ref: s.ref, svarfrist: s.svarfrist, apne: s.apne, lys, status }; });
  const tLys = tilsyn.length ? verst(...tilsyn.map(t => t.lys)) : 'green';

  // ---- Leietakere: internkontroll/plikter og brannverninformasjon (eier skal samordne og følge opp)
  const L = S.leietakere.filter(l => l.eiendomId === eid && (!l.slutt || l.slutt >= nå));
  const leietakere = sortBy(L, l => l.navn).map(l => {
    const ps = (l.plikter || []).map(pliktStatus).filter((s: Rec) => s.t !== 'Ikke relevant'); const ok = ps.filter((s: Rec) => s.o === 0).length; const forf = ps.filter((s: Rec) => s.o >= 2).length;
    const ik: Lys = !ps.length ? 'grey' : forf ? (forf >= Math.ceil(ps.length / 2) ? 'red' : 'amber') : ps.some((s: Rec) => s.o === 1) ? 'amber' : 'green';
    const b = bvStatus(l); const bvLys: Lys = b.o === 0 ? 'green' : b.o === 1 ? 'amber' : 'red';
    if (forf) tiltak.push({ pri: 2, omr: 'Leietakere', tekst: tt("Følg opp {0}: {1} plikt{2} ikke bekreftet/forfalt", l.navn, forf, forf > 1 ? 'er' : '') });
    if (harBv && b.o >= 2 && bvVersjon(e)) tiltak.push({ pri: 2, omr: 'Brannvern', tekst: tt("Send brannverninformasjon til {0}", l.navn) });
    if (harBv && mangelAnsvarlig(l)) tiltak.push({ pri: 2, omr: 'Brannvern', tekst: tt("Få oppgitt brannansvarlig hos {0}", l.navn) });
    return { navn: l.navn, plikter: ps.length ? `${ok} av ${ps.length} i orden` : 'Ingen plikter registrert', ik, bv: b.t, bvLys, ansvarlig: !mangelAnsvarlig(l), slutt: l.slutt || '' }; });
  const lLys = leietakere.length ? verst(...leietakere.map(l => l.ik === 'grey' ? 'amber' : l.ik), ...(harBv ? leietakere.map(l => l.bvLys) : []), ...(harBv ? leietakere.map(l => l.ansvarlig ? 'green' : 'amber' as Lys) : [])) : 'grey';

  // ---- Brannvern (eiers brannkort / informasjon)
  const v = bvVersjon(e); const midl = aktiveMidl(e).length;
  const brannvern = { versjon: v, midl, lys: (!v ? 'red' : midl ? 'amber' : 'green') as Lys, tekst: !v ? tt("Brannkort/brannvernpakke for eiendommen er ikke publisert") : tt("Brannkort versjon {0} publisert{1}", v, midl ? ` · ${midl} aktivt varsel om redusert brannsikkerhet` : '') };
  if (harBv && !v) tiltak.push({ pri: 1, omr: 'Brannvern', tekst: tt("Fyll ut og publiser brannkortet for eiendommen, og send det til leietakerne") });
  if (harBv && midl) tiltak.push({ pri: 1, omr: 'Brannvern', tekst: tt("{0} varsel om redusert brannsikkerhet er aktivt – sørg for kompenserende tiltak og avslutning", midl) });

  // ---- Neste 90 dager
  const grense = addDays(nå, 90);
  const kommende = sortBy([
    ...T.filter(o => o.nesteFrist && o.nesteFrist >= nå && o.nesteFrist <= grense && LOVTYPER.includes(o.type)).map(o => ({ d: o.nesteFrist, t: o.navn + (o.anleggId ? ' – ' + aNavn(o.anleggId) : ''), type: 'Kontroll' })),
    ...S.dokumenter.filter(d => d.eiendomId === eid && d.gyldigTil && d.gyldigTil >= nå && d.gyldigTil <= grense).map(d => ({ d: d.gyldigTil, t: (d.tittel || d.type) + ' utløper', type: 'Dokument' })),
    ...tilsyn.filter(t => t.svarfrist && t.svarfrist >= nå && t.svarfrist <= grense).map(t => ({ d: t.svarfrist, t: 'Svarfrist tilsyn – ' + t.navn, type: 'Tilsyn' })),
    ...L.filter(l => l.slutt && l.slutt <= addDays(nå, 365)).map(l => ({ d: l.slutt, t: 'Leieavtale utløper – ' + l.navn, type: 'Leie' })),
  ], x => x.d);

  const omrader = [
    { navn: tt("Lovpålagte kontroller"), lys: kLys, tekst: tt("{0} registrert · {1} forfalt · {2} mangler i planen", kontroller.filter(k => !k.mangler).length, kForf.length, kMangl.length) },
    { navn: tt("Påkrevde dokumenter"), lys: dLys, tekst: tt("{0} av {1} foreligger", dok.filter(d => d.lys === 'green').length, dok.filter(d => d.lys !== 'grey').length) },
    { navn: tt("Avvik"), lys: aLys, tekst: tt("{0} åpne · {1} kritiske/høye · {2} over frist", A.length, krit.length, over.length) },
    ...(harTs ? [{ navn: tt("Tilsynssaker"), lys: tLys, tekst: tilsyn.length ? tt("{0} åpne saker", tilsyn.length) : tt("Ingen åpne saker") }] : []),
    ...(harBv ? [{ navn: tt("Brannvern"), lys: brannvern.lys, tekst: brannvern.tekst }] : []),
    { navn: tt("Leietakers internkontroll"), lys: lLys, tekst: leietakere.length ? tt("{0} av {1} leietakere i orden", leietakere.filter(l => l.ik === 'green').length, leietakere.length) : tt("Ingen aktive leietakere") },
  ];
  return { harBv, harTs, e, dato: nå, lys: verst(...omrader.map(o => o.lys)), omrader, kontroller, dok, avvik: { apne: A.length, krit: krit.length, over: over.length, liste: sortBy(A, a => ['Kritisk', 'Høy', 'Middels', 'Lav'].indexOf(a.alv) * 1e4 + (a.nr || 0)) },
    tilsyn, leietakere, brannvern, kommende, tiltak: sortBy(tiltak, t => t.pri) };
}
