// Prosjektmodul: faser, oppgaver, økonomi (budsjett, forpliktet, påløpt, prognose), regnskapsklassifisering, FDV,
// og utskiftingsprosjekt der nytt system erstatter det gamle ved ferdigstillelse.
import { S, save, state, toast } from './store';
import { addDays, addInt, byId, today, kNavn, aNavn, type Rec } from './utils';
import { KOMP, MALER, AV_LUKKET } from './catalog';

export const PTYPER = ['Utskifting av system', 'Vedlikehold', 'Rehabilitering', 'Ombygging / leietakertilpasning', 'Energitiltak', 'Nybygg / tilbygg', 'Annet'];
export const PSTATUS = ['Idé', 'Planlagt', 'Pågår', 'Ferdigstilt', 'Avbrutt'];
export const FASER: [string, string][] = [
  ['ide', 'Behov og idé'], ['plan', 'Planlegging og prosjektering'], ['anbud', 'Anbud og kontrahering'], ['utf', 'Utførelse'], ['over', 'Overlevering og ferdigstillelse'], ['garanti', 'Garantiperiode'],
];
/** Standardoppgaver per fase (kan slettes/endres i prosjektet) */
const STD: Record<string, string[]> = {
  ide: ['Beskriv behov og mål for prosjektet', 'Grovt kostnadsoverslag', 'Avklar finansiering / budsjettramme'],
  plan: ['Tilstandsvurdering / registrering', 'Vurder søknadsplikt etter plan- og bygningsloven', 'Avklar konsekvenser for leietakere og varsle dem', 'Byggherreforskriften: SHA-plan og koordinator (ved behov)', 'Prosjektering / beskrivelse', 'Detaljert kostnadskalkyle og fremdriftsplan'],
  anbud: ['Konkurransegrunnlag', 'Innhent tilbud', 'Evaluer tilbud', 'Kontrakt signert (f.eks. NS 8405 / 8406 / 8407)'],
  utf: ['Oppstartsmøte', 'Byggemøter / oppfølging av fremdrift', 'Endringsmeldinger og tillegg behandlet', 'HMS / SHA fulgt opp'],
  over: ['Overtakelsesforretning gjennomført', 'Mangelliste lukket', 'FDV-dokumentasjon mottatt', 'Samsvarserklæringer / ferdigattest', 'Opplæring av driftspersonell', 'Oppdater tegninger, systemer og kontrollplan'],
  garanti: ['Ettårsbefaring', 'Reklamasjoner fulgt opp', 'Garantitid utløper (normalt 5 år)'],
};
/** Regnskapsmessig klassifisering – kontroller med regnskapsfører (skille vedlikehold/påkostning) */
export const KLASSER: [string, string][] = [
  ['vedl', 'Vedlikehold – kostnadsføres (6600)'], ['pak', 'Påkostning – aktiveres (11xx)'], ['nybygg', 'Nybygg / tilbygg – aktiveres (11xx)'],
  ['rad', 'Rådgivning / prosjektering (6700)'], ['lt', 'Leietakertilpasning (avtales: aktiveres eller viderefaktureres)'], ['annet', 'Annet / avklares'],
];
export const KONTO: [string, string][] = [['1100', 'Bygninger'], ['1120', 'Tekniske installasjoner i bygg'], ['1130', 'Anlegg under utførelse'], ['6600', 'Reparasjon og vedlikehold bygninger'], ['6620', 'Reparasjon og vedlikehold utstyr'], ['6700', 'Fremmedtjenester (rådgivning)'], ['6790', 'Annen fremmed tjeneste']];
export const FDV_KRAV = ['FDV-dokumentasjon', 'Samsvarserklæring / dokumentasjon av produkter', 'Garantibevis', 'Tegninger «som bygget»', 'Brukerveiledning / driftsinstruks', 'Serviceavtale (ved lovkrav)'];

export const uid = () => crypto.randomUUID();
const n = (v: any) => +String(v ?? '').replace(/\s/g, '').replace(',', '.') || 0;

export function nyttProsjektData(p: Partial<Rec> = {}): Rec {
  const fase = FASER.map(([k, l]) => ({ k, navn: l, start: '', slutt: '' }));
  const oppgaver = FASER.flatMap(([k]) => (STD[k] || []).map(t => ({ id: uid(), fase: k, tittel: t, status: 'Ikke startet', ansvarlig: '', frist: '' })));
  return { navn: '', type: 'Vedlikehold', status: 'Planlagt', fase: 'ide', beskrivelse: '', leder: state.me?.navn || '', start: today(), slutt: '', faser: fase, oppgaver,
    budsjett: [], kostnader: [], fdv: FDV_KRAV.map(t => ({ id: uid(), tittel: t, mottatt: false, dokId: '' })), logg: [{ t: new Date().toISOString(), k: 'Prosjekt opprettet', av: state.me?.navn }], ...p };
}

/** Økonomi: per budsjettpost og totalt. Forpliktet = bestilt/kontrahert, påløpt = fakturert/betalt. */
export function okonomi(p: Rec) {
  const B: Rec[] = p.budsjett || []; const K: Rec[] = p.kostnader || [];
  const poster = B.map(b => { const k = K.filter(x => x.post === b.id); const pal = k.filter(x => x.status !== 'Bestilt').reduce((s, x) => s + n(x.belop), 0);
    const forp = k.reduce((s, x) => s + n(x.belop), 0); const prog = b.prognose !== '' && b.prognose != null ? n(b.prognose) : Math.max(n(b.belop), forp);
    return { b, budsjett: n(b.belop), forpliktet: forp, palopt: pal, prognose: prog }; });
  const uten = K.filter(x => !B.some(b => b.id === x.post)); const utenSum = uten.reduce((s, x) => s + n(x.belop), 0);
  const sum = (f: 'budsjett' | 'forpliktet' | 'palopt' | 'prognose') => poster.reduce((s, x) => s + x[f], 0);
  const palopt = sum('palopt') + uten.filter(x => x.status !== 'Bestilt').reduce((s, x) => s + n(x.belop), 0);
  const tot = { budsjett: sum('budsjett'), forpliktet: sum('forpliktet') + utenSum, palopt, prognose: sum('prognose') + utenSum };
  const perKlasse: Record<string, { budsjett: number; palopt: number }> = {};
  for (const x of poster) { const k = x.b.klasse || 'annet'; (perKlasse[k] ||= { budsjett: 0, palopt: 0 }); perKlasse[k].budsjett += x.budsjett; perKlasse[k].palopt += x.palopt; }
  for (const x of uten) { const k = x.klasse || 'annet'; (perKlasse[k] ||= { budsjett: 0, palopt: 0 }); if (x.status !== 'Bestilt') perKlasse[k].palopt += n(x.belop); }
  return { poster, uten, tot, perKlasse, avvik: tot.prognose - tot.budsjett };
}
export function fremdrift(p: Rec) { const O: Rec[] = p.oppgaver || []; if (!O.length) return 0; return Math.round(O.filter(o => o.status === 'Ferdig').length / O.filter(o => o.status !== 'Ikke relevant').length * 100) || 0; }

// ---------------- Utskiftingsprosjekt
export const aktivtProsjektFor = (aid: string) => S.prosjekter.find(p => p.gammeltSystemId === aid && !['Ferdigstilt', 'Avbrutt'].includes(p.status));

/** Opprett utskiftingsprosjekt for et system. Returnerer prosjektets id. */
export async function opprettUtskifting(aid: string): Promise<string | null> {
  const a = byId('anlegg', aid); if (!a) return null;
  const finnes = aktivtProsjektFor(aid); if (finnes) return finnes.id;
  const kost = n(a.kost); const aar = +a.planAar || new Date().getFullYear();
  const data = nyttProsjektData({ navn: `Utskifting: ${aNavn(aid)}`, type: 'Utskifting av system', gammeltSystemId: aid, eiendomId: a.eiendomId, slutt: `${aar}-12-31`,
    beskrivelse: `Utskifting av ${a.navn || KOMP[a.type]?.n || 'systemet'}${a.aar ? ` (installert ${a.aar})` : ''}.${a.tg ? ` Tilstand ${a.tg}.` : ''}`,
    budsjett: kost ? [{ id: uid(), post: 'Utskifting ' + (a.navn || KOMP[a.type]?.n || ''), bygningsdel: a.tfmSys || '', klasse: 'pak', konto: '1120', belop: kost, prognose: '' }] : [],
    nyttSystem: { type: a.type || '', navn: a.navn || '', fabrikat: '', levetid: a.levetid || KOMP[a.type]?.l || '', kost: a.kost || '', aar: '' } });
  const pid = await save('prosjekter', data);
  await save('anlegg', { ...a, utskiftProsjektId: pid });
  return pid;
}

/**
 * Ferdigstill prosjekt. For utskifting: nytt system opprettes med samme TFM-merking, det gamle (med komponenter og kontroller)
 * arkiveres, nye kontroller kobles til det nye systemet.
 */
export async function ferdigstill(pid: string, opt: { lukkAvvik: boolean; dato?: string }) {
  const p = byId('prosjekter', pid); if (!p) return;
  const dato = opt.dato || today(); const logg = [...(p.logg || [])]; const av = state.me?.navn || state.me?.epost || '';
  let nid = '';
  const gml = p.gammeltSystemId ? byId('anlegg', p.gammeltSystemId) : null;
  if (gml && !gml.arkivert) {
    const ns = p.nyttSystem || {}; const type = ns.type || gml.type || '';
    const { id: _i, arkivert: _a, utskiftProsjektId: _u, tg: _tg, kg: _kg, tgdato: _td, tgKomm: _tk, tgForslag: _tf, kostKilde: _kk, levetidKilde: _lk, planAar: _pa, ...arv } = gml;
    nid = await save('anlegg', { ...arv, type, navn: ns.navn || gml.navn || '', fabrikat: ns.fabrikat || '', aar: +String(ns.aar || dato.slice(0, 4)), levetid: ns.levetid || KOMP[type]?.l || '',
      kost: ns.kost || gml.kost || '', kostAar: new Date().getFullYear(), tg: 'TG0', tgdato: dato, tgKomm: `Nytt system fra prosjekt «${p.navn}»`, tfmSys: gml.tfmSys, tfmLop: gml.tfmLop,
      erstatter: gml.id, prosjektId: pid, notat: ns.notat || '' });
    const arkivert = { dato, prosjektId: pid, erstattetAv: nid, av, grunn: `Erstattet i prosjekt «${p.navn}»` };
    // Kontroller: arkiver de gamle, lag nye for det nye systemet
    const gamleK = S.oppgaver.filter(o => o.anleggId === gml.id);
    const nyeMal = new Set<string>(KOMP[type]?.m || []);
    for (const o of gamleK) {
      await save('oppgaver', { ...o, aktiv: false, arkivert });
      if (o.malKey && !nyeMal.has(o.malKey) && type !== gml.type) continue; // katalogkontroll som ikke gjelder ny type
      const { id: _o, historikk: _h, sistUtfort: _s, runde: _r, innrapport: _ir, aoSendt: _as, arkivert: _ak, komponentId: _k, ...rest } = o;
      await save('oppgaver', { ...rest, anleggId: nid, komponentId: '', aktiv: true, historikk: [], nesteFrist: addInt(dato, o.intervall || { n: 1, enhet: 'år' }), fraProsjekt: pid });
      if (o.malKey) nyeMal.delete(o.malKey);
    }
    for (const k of nyeMal) { const m = MALER[k]; if (!m) continue;
      await save('oppgaver', { malKey: k, eiendomId: gml.eiendomId, anleggId: nid, navn: m.n, kategori: m.k, type: m.t, hjemmel: m.h, intervall: { n: m.i[0], enhet: m.i[1] }, utfores: m.u, ansvar: gml.ansvar === 'Leietaker' ? 'Leietaker' : 'Eier', leietakerId: gml.leietakerId || '', nesteFrist: addInt(dato, { n: m.i[0], enhet: m.i[1] }), aktiv: true, historikk: [], fraProsjekt: pid }); }
    for (const k of S.komponenter.filter(k => k.anleggId === gml.id)) await save('komponenter', { ...k, arkivert });
    if (opt.lukkAvvik) for (const a of S.avvik.filter(a => a.anleggId === gml.id && !AV_LUKKET.includes(a.status)))
      await save('avvik', { ...a, status: 'Lukket', lukket: dato, logg: [...(a.logg || []), { t: new Date().toISOString(), s: 'Lukket', k: `Systemet er erstattet i prosjekt «${p.navn}»`, av }] });
    // Prosjektets dokumenter knyttes til det nye systemet
    for (const d of S.dokumenter.filter(d => d.prosjektId === pid && !d.anleggId)) await save('dokumenter', { ...d, anleggId: nid });
    await save('anlegg', { ...byId('anlegg', gml.id)!, arkivert, utskiftProsjektId: pid });
    logg.push({ t: new Date().toISOString(), k: `Nytt system ${aNavn(nid)} erstatter det gamle. Gammelt system, ${gamleK.length} kontroller og komponenter er arkivert.`, av });
  }
  logg.push({ t: new Date().toISOString(), k: 'Prosjekt ferdigstilt', av });
  await save('prosjekter', { ...byId('prosjekter', pid)!, status: 'Ferdigstilt', fase: 'garanti', fullfort: dato, nyttSystemId: nid || p.nyttSystemId || '', logg,
    garantiTil: p.garantiTil || addDays(dato, 365 * 5) });
  toast(nid ? 'Prosjektet er ferdigstilt – nytt system erstatter det gamle' : 'Prosjektet er ferdigstilt');
  return nid;
}
export const kNavnSikker = (id?: string) => kNavn(id);
