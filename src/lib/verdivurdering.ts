// Enkel verdivurdering etter avkastningsmetoden: verdi ≈ normalisert netto leie / yield − fradrag (etterslep, ledighet).
// Internt anslag – ikke takst. Leie hentes fra leietakerne, areal fra tegninger/leieareal, capex fra vedlikeholdsplanen.
import { S } from './store';
import { YEAR, dUntil, leieAreal, today, type Rec } from './utils';
import { capex } from './capexRapport';

export type VerdiInn = {
  yield: number;            // markedsyield, %
  markedsleie: number;      // kr/m²/år for ledige arealer
  ledigAreal: number;       // m² ledig utleibart areal (i tillegg til det leietakerne leier)
  tilUtleie: number;        // måneder til ledige arealer er leid ut (fradrag)
  ledighet: number;         // langsiktig ledighetsrisiko, % av brutto leie
  eierkost: number;         // eierkostnader som ikke dekkes av leietaker, kr/år
  eierkostPst: number;      // alternativt % av brutto leie (brukes når eierkost = 0)
  capex: 'ingen' | 'etterslep' | 'fem';  // hva som trekkes fra for teknisk etterslep
  leieMarked: boolean;      // bruk markedsleie i stedet for kontraktsleie der kontrakten utløper innen 1 år
  notat: string;
};
export const STD_INN: VerdiInn = { yield: 6.5, markedsleie: 0, ledigAreal: 0, tilUtleie: 12, ledighet: 3, eierkost: 0, eierkostPst: 7, capex: 'etterslep', leieMarked: false, notat: '' };

/** Årlig leie: oppgitt per år, eller kr/m² × gjeldende leieareal */
export const aarsleie = (l: Rec, areal?: number) => l.leieEnhet === 'm2' ? Math.round((+l.leieM2 || 0) * (areal ?? (leieAreal(l).verdi || 0))) : (+l.leie || 0);
export const innFor = (e: Rec): VerdiInn => ({ ...STD_INN, ...(e?.verdi?.inn || {}) });

export function verdivurdering(e: Rec, inn: VerdiInn) {
  const nå = today();
  const L = S.leietakere.filter(l => l.eiendomId === e.id && (!l.slutt || l.slutt >= nå));
  const rader = L.map(l => { const a = leieAreal(l).verdi || 0; const leie = aarsleie(l, a); const rest = l.slutt ? Math.max(0, (dUntil(l.slutt) as number) / 365.25) : null;
    const brukMarked = inn.markedsleie > 0 && a > 0 && (!leie || (inn.leieMarked && rest !== null && rest < 1));
    return { l, navn: l.navn, areal: a, leie, m2: a ? leie / a : 0, slutt: l.slutt || '', rest, kpi: l.kpiAndel === '' || l.kpiAndel == null ? 100 : +l.kpiAndel, opsjon: l.opsjon || '', brukt: brukMarked ? inn.markedsleie * a : leie, marked: brukMarked }; });
  const kontraktsleie = rader.reduce((s, r) => s + r.leie, 0);
  const utleid = rader.reduce((s, r) => s + r.areal, 0);
  const arealMedLeie = rader.filter(r => r.leie).reduce((s, r) => s + r.areal, 0);
  const ledigLeie = inn.ledigAreal * inn.markedsleie;
  const brutto = rader.reduce((s, r) => s + r.brukt, 0) + ledigLeie;
  const ledighetsFradrag = brutto * inn.ledighet / 100;
  const eierkost = inn.eierkost > 0 ? inn.eierkost : brutto * inn.eierkostPst / 100;
  const netto = brutto - ledighetsFradrag - eierkost;
  const y = inn.yield / 100; const bruttoverdi = y > 0 ? netto / y : 0;
  // Fradrag
  const c = capex({ eid: e.id, fra: YEAR, aar: 5, pris: 'justert', leietaker: false });
  const capexFradrag = inn.capex === 'ingen' ? 0 : inn.capex === 'etterslep' ? c.ettSum : c.P.reduce((s, p) => s + p.nv, 0);
  const ledigFradrag = ledigLeie * inn.tilUtleie / 12;
  const verdi = Math.max(0, bruttoverdi - capexFradrag - ledigFradrag);
  const wault = kontraktsleie ? rader.filter(r => r.rest !== null).reduce((s, r) => s + r.leie * (r.rest || 0), 0) / Math.max(1, rader.filter(r => r.rest !== null).reduce((s, r) => s + r.leie, 0)) : 0;
  const bta = +e.bta || 0;
  const sens = [-0.5, -0.25, 0, 0.25, 0.5].map(d => { const yy = (inn.yield + d) / 100; return { y: inn.yield + d, v: yy > 0 ? Math.max(0, netto / yy - capexFradrag - ledigFradrag) : 0 }; });
  const utlop: { aar: number; leie: number }[] = []; for (let i = 0; i < 10; i++) utlop.push({ aar: YEAR + i, leie: rader.filter(r => r.slutt && +r.slutt.slice(0, 4) === YEAR + i).reduce((s, r) => s + r.leie, 0) });
  const mangler: string[] = [];
  if (!rader.length) mangler.push('Ingen aktive leietakere – legg inn leietakerne med leie.');
  const utenLeie = rader.filter(r => !r.leie); if (utenLeie.length) mangler.push(`${utenLeie.length} leietaker${utenLeie.length > 1 ? 'e' : ''} mangler årlig leie: ${utenLeie.slice(0, 3).map(r => r.navn).join(', ')}${inn.markedsleie ? ' – regnet med markedsleie' : ' – teller ikke med'}`);
  const utenAreal = rader.filter(r => !r.areal); if (utenAreal.length) mangler.push(`${utenAreal.length} leietaker${utenAreal.length > 1 ? 'e' : ''} mangler leieareal (tegn inn arealet eller overstyr på leietakeren)`);
  if (inn.ledigAreal && !inn.markedsleie) mangler.push('Ledig areal er oppgitt, men ikke markedsleie.');
  if (!bta) mangler.push('BTA mangler på eiendommen – verdi per m² kan ikke beregnes.');
  const utenKost = c.ute.utenKost.length + c.ute.utenAar.length; if (inn.capex !== 'ingen' && utenKost) mangler.push(`${utenKost} systemer mangler kostnad eller år i vedlikeholdsplanen – fradraget for etterslep kan være for lavt.`);
  const utlopSnart = rader.filter(r => r.rest !== null && r.rest < 1).reduce((s, r) => s + r.leie, 0);
  return { e, inn, rader, kontraktsleie, utleid, arealMedLeie, ledigLeie, brutto, ledighetsFradrag, eierkost, netto, bruttoverdi, capexFradrag, ett: c.ett, ledigFradrag, verdi,
    wault, bta, m2: bta ? verdi / bta : 0, sens, utlop, mangler, utlopSnart, ledighetPst: utleid + inn.ledigAreal ? inn.ledigAreal / (utleid + inn.ledigAreal) * 100 : 0 };
}
export type Verdi = ReturnType<typeof verdivurdering>;
export const kr = (n: number) => Math.round(n).toLocaleString('nb-NO') + ' kr';
export const mkr = (n: number) => (n / 1e6).toLocaleString('nb-NO', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' MNOK';
