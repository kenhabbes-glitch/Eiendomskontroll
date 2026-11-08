// Befaringsmodul: typer, sjekkpunkter, funn og synkronisering (også etter arbeid uten nett).
// Funn av typen «avvik» blir vanlige avvik (avvik.befaringId) – ansvar, frist, status og arbeidsordre følges opp der.
// Funn av typen «system» blir systemer i TFM-registeret. «Tilpasning» og «merknad» blir stående i befaringen.
import { useEffect, useRef, useState } from 'react';
import { S, save, uploadFile, state, toast, bump, refetch, aoApi, type Fil } from './store';
import { byId, today, addDays, uid, sortBy, nextSysLop, type Rec } from './utils';
import { AV_FRIST, AV_LUKKET } from './catalog';
import { OMR, fordeling, leietakerHar } from './kontrakt';
import { alleUtkast, hentUtkast, lagreUtkast, paaNett, hentLokalFil, slettUtkast, merkOpplastet, opplastetSom, type LokalFil } from './offline';
import { tt, lokale } from './i18n';

export type BFil = Fil | LokalFil;
export const erLokal = (f: any): f is LokalFil => !!f?.lokal;
export type Svar = '' | 'ok' | 'avvik' | 'ia' | 'merk';
export type Punkt = { id: string; gruppe: string; tekst: string; svar: Svar; komm?: string; bilder?: BFil[]; ref?: { svar?: Svar; komm?: string; dato?: string }; hjelp?: string; omr?: string };
export type Art = 'avvik' | 'merknad' | 'tilpasning' | 'system' | 'energi';
export type Funn = {
  id: string; art: Art; punktId?: string; tittel: string; beskrivelse?: string; alv?: string; ansvar?: string; utbedresAv?: string; leietakerId?: string;
  frist?: string; pos?: { tegningId: string; x: number; y: number } | null; plassering?: string; bilder?: BFil[]; avvikId?: string; anleggId?: string; komponentId?: string;
  kost?: number | ''; betaler?: string; besparelse?: number | ''; sys?: { tfmSys?: string; type?: string; navn?: string; fabrikat?: string; aar?: string }; nyAnleggId?: string;
  endret?: number; synket?: number;
};
export type Shape = { id: string; t: 'maal' | 'areal' | 'fri' | 'tekst' | 'pil' | 'rekt'; pts: number[][]; tekst?: string; farge?: string };
export type Deltaker = { id: string; navn: string; rolle: string; firma?: string; epost?: string; tlf?: string; signerer?: boolean };

export const ROLLER_DELT = ['Eier', 'Forvalter', 'Drift', 'Leietaker', 'Servicefirma', 'Entreprenør', 'Rådgiver', 'Verneombud', 'Annet'];
export const BSTATUS = ['Planlagt', 'Pågår', 'Fullført', 'Til signering', 'Signert', 'Avbrutt'];
export const ART_NAVN: Record<Art, string> = { avvik: 'Avvik', merknad: 'Merknad', tilpasning: 'Leietakertilpasning', system: 'System registrert', energi: 'Energityv' };

// ---------- sjekkpunkter
const g = (gruppe: string, ...p: (string | [string, string])[]) => p.map(x => ({ gruppe, tekst: Array.isArray(x) ? x[0] : x, hjelp: Array.isArray(x) ? x[1] : undefined }));
export const ROM_PUNKTER = ['Vegger', 'Gulv', 'Himling', 'Dører, karmer og låser', 'Vinduer og solskjerming', 'Stikkontakter, brytere og belysning', 'Ventilasjon (ventiler, luftmengde)', 'Varme / kjøling (radiatorer, termostater)', 'Sanitær (hvis aktuelt)', 'Renhold og rydding', 'Skader og merknader'];
const rom = (navn: string) => g(navn, ...ROM_PUNKTER);
const FELLES_LEIE = [
  ...g('Generelt', 'Leieobjektet samsvarer med tegning / arealoppgave', 'Rømningsveier frie og merket', 'Brannslukkere og nødlys på plass', 'Universell utforming / adkomst'),
];
type Ptpl = { gruppe: string; tekst: string; hjelp?: string };
export type BType = { k: string; navn: string; kort: string; beskr: string; leie?: boolean; rom?: boolean; maalere?: boolean; nokler?: boolean; energi?: boolean; system?: boolean; garanti?: boolean; vplikt?: boolean; tilpasning?: boolean; punkter: () => Ptpl[] };
export const BTYPER: BType[] = [
  { k: 'forbefaring', navn: tt("Forbefaring (før leieavtale)"), kort: tt("Forbefaring"), leie: true, rom: true, beskr: tt("Gjennomgang av lokalet med mulig leietaker før avtalen signeres: tilstand, behov og ønskede tilpasninger."),
    punkter: () => [...FELLES_LEIE, ...g('Behov og ønsker', 'Ønsket planløsning / antall arbeidsplasser', 'Behov for tilpasninger (vegger, el, IT, ventilasjon)', 'Krav til kjøling, sikring og adgangskontroll', 'Parkering, sykkel og varemottak'), ...rom('Lokalet')] },
  { k: 'overtakelse', navn: tt("Overtakelse / innflytting"), kort: tt("Overtakelse"), leie: true, rom: true, maalere: true, nokler: true, beskr: tt("Protokoll ved overlevering til leietaker: tilstand per rom, målerstander, nøkler og mangler som skal rettes."),
    punkter: () => [...FELLES_LEIE, ...g('Dokumentasjon', 'Brukerveiledning / FDV for leieobjektet overlevert', 'Brannverninformasjon og rømningsplan gjennomgått', 'Kontaktinformasjon drift og vakt'), ...rom('Lokalet')] },
  { k: 'tilpasning', navn: tt("Leietakertilpasning"), kort: tt("Tilpasning"), leie: true, tilpasning: true, beskr: tt("Registrering av tilpasninger for leietaker: hva som er utført, avvik fra avtale, og hvem som betaler."),
    punkter: () => [...g('Avtalte arbeider', 'Arbeidene er utført som avtalt / beskrevet', 'Materialvalg og utførelse som avtalt', 'Endringer i forhold til tegning er dokumentert', 'Kostnadsfordeling eier / leietaker er avklart'), ...g('Teknisk', 'El-arbeider samsvarserklært', 'Ventilasjon innregulert etter ny planløsning', 'Brannceller og gjennomføringer tettet', 'Sprinkler / brannalarm tilpasset ny planløsning'), ...g('Dokumentasjon', 'Som bygget-tegninger mottatt', 'FDV-dokumentasjon mottatt')] },
  { k: 'vplikt', navn: tt("Leietakers vedlikeholdsplikt"), kort: tt("Vedlikeholdsplikt"), leie: true, vplikt: true, beskr: tt("Kontroll av at leietaker ivaretar vedlikeholdet leieavtalen pålegger dem. Sjekkpunktene hentes fra ansvarsfordelingen i leieavtalen."),
    punkter: () => [] },
  { k: 'tilbakelevering', navn: tt("Tilbakelevering"), kort: tt("Tilbakelevering"), leie: true, rom: true, maalere: true, nokler: true, beskr: tt("Sluttbefaring når leieforholdet avsluttes. Sammenlignes med overtakelsen, og mangler leietaker må utbedre eller betale registreres."),
    punkter: () => [...FELLES_LEIE, ...g('Tilbakeføring', 'Leietakers egne installasjoner er fjernet', 'Tilpasninger tilbakeført der avtalen krever det', 'Lokalet er ryddet og rengjort', 'Skilting og merking fjernet'), ...rom('Lokalet')] },
  { k: 'energi', navn: tt("Fang energityven"), kort: tt("Energityven"), energi: true, beskr: tt("Runde for å finne unødvendig energibruk: drift utenfor brukstid, samtidig varme og kjøling, lekkasjer og feilinnstillinger."),
    punkter: () => [...g('Ventilasjon', ['Ventilasjon går bare i brukstid', 'Sjekk driftstider i SD-anlegget mot faktisk bruk'], 'Varmegjenvinner fungerer (temperaturvirkningsgrad)', 'Filtre ikke tette (trykkfall)', 'Behovsstyring (CO₂ / tilstedeværelse) virker'),
      ...g('Varme og kjøling', ['Ikke samtidig varme og kjøling', 'Radiatorer/varmebatterier og kjøling motarbeider hverandre'], 'Settpunkter romtemperatur fornuftige', 'Nattsenking og helgesenking aktiv', 'Varmekabler/snøsmelting styrt av temperatur og fukt', 'Isolasjon på rør og ventiler'),
      ...g('Belysning og utstyr', 'Lys slukker automatisk i tomme rom', 'Utebelysning styrt av lys/klokke', 'Utstyr og maskiner av utenom brukstid', 'Varmtvannsbereder: temperatur og tidsstyring'),
      ...g('Bygningskropp', 'Dører og porter lukkes (dørpumper, porter)', 'Trekk / utette vinduer og dører', 'Lekkasjer vann (toaletter, kraner)'),
      ...g('Måling og oppfølging', 'Energimålere avleses og følges opp', 'Avvik i forbruk sammenlignet med i fjor')] },
  { k: 'tilfeldig', navn: tt("Tilfeldig befaring / runde"), kort: tt("Runde"), beskr: tt("Rundgang i bygget for å fange opp avvik. Ingen faste sjekkpunkter – registrer funn direkte på tegningen."), punkter: () => [] },
  { k: 'system', navn: tt("Systemregistrering (nytt bygg)"), kort: tt("Systemregistrering"), system: true, beskr: tt("Registrering av tekniske systemer og komponenter ved etablering av et bygg. Hvert registrert system legges i TFM-registeret med plassering på tegning."),
    punkter: () => g('Dokumentasjon', 'FDV-dokumentasjon mottatt', 'Som bygget-tegninger mottatt', 'TFM-merking utført på anlegg', 'Opplæring av drift gjennomført') },
  { k: 'hms', navn: tt("HMS-befaring / vernerunde"), kort: tt("HMS-befaring"), beskr: tt("Vernerunde med fokus på helse, miljø og sikkerhet for brukere og ansatte."),
    punkter: () => [...g('Brann og rømning', 'Rømningsveier frie og merket', 'Nødlys og ledelys virker', 'Brannslukkere og brannslanger kontrollert', 'Branndører lukker og er ikke blokkert'),
      ...g('Arbeidsmiljø', 'Orden og ryddighet', 'Inneklima (temperatur, trekk, luftkvalitet)', 'Belysning på arbeidsplasser', 'Støy', 'Ergonomi'),
      ...g('Sikkerhet', 'Fallsikring, rekkverk og trapper', 'Kjemikalier merket og lagret riktig (stoffkartotek)', 'El-tavler lukket og tilgjengelige', 'Førstehjelpsutstyr og hjertestarter'),
      ...g('Utomhus', 'Gangveier, belysning og glatt føre', 'Avfallshåndtering')] },
  { k: 'garanti', navn: tt("Garantibefaring"), kort: tt("Garantibefaring"), garanti: true, beskr: tt("Ettårsbefaring eller garantibefaring etter entreprise (NS 8407 / 8405). Mangler meldes entreprenøren med frist."),
    punkter: () => [...g('Generelt', 'Mangler fra overtakelsen er utbedret', 'Nye mangler oppstått i garantitiden', 'FDV-dokumentasjon komplett'), ...g('Bygg', 'Sprekker, setninger og fuktskader', 'Tak og fasader tette', 'Dører, vinduer og beslag'), ...g('Tekniske anlegg', 'Ventilasjon innregulert og fungerer', 'Varme og kjøling fungerer', 'El og belysning', 'Sanitær uten lekkasjer', 'SD-anlegg og alarmer')] },
  { k: 'annen', navn: tt("Annen befaring"), kort: tt("Befaring"), beskr: tt("Egendefinert befaring – legg til egne sjekkpunkter."), punkter: () => [] },
];
export const btype = (k?: string) => BTYPER.find(t => t.k === k) || BTYPER[BTYPER.length - 1];
/** Rekkefølgen i et leieforhold */
export const LEIEFORLOP = ['forbefaring', 'overtakelse', 'tilpasning', 'vplikt', 'tilbakelevering'];

const nyP = (p: Ptpl): Punkt => ({ id: uid(), gruppe: p.gruppe, tekst: p.tekst, hjelp: p.hjelp, svar: '' });
/** Sjekkpunkter for vedlikeholdsplikten, ut fra ansvarsfordelingen i leieavtalen */
export function vpliktPunkter(lid?: string): Punkt[] {
  const l = lid ? byId('leietakere', lid) : null; if (!l) return [nyP({ gruppe: 'Vedlikeholdsplikt', tekst: tt("Velg leietaker for å hente pliktene fra leieavtalen") })];
  const f = fordeling(l); const L: Punkt[] = [];
  OMR.forEach(o => { const c = f[o.k]; if (!c || !leietakerHar(c.v)) return;
    L.push({ ...nyP({ gruppe: 'Vedlikeholdsplikt etter leieavtalen', tekst: o.n, hjelp: `Leietaker har ${c.v === 'Delt' ? 'delt ' : ''}ansvar for drift og vedlikehold${c.p ? ' – ' + c.p : ''}` }), omr: o.k });
    if (o.tek) L.push({ ...nyP({ gruppe: 'Vedlikeholdsplikt etter leieavtalen', tekst: tt("{0}: service og kontroller dokumentert", o.n) }), omr: o.k }); });
  if (!L.length) L.push(nyP({ gruppe: 'Vedlikeholdsplikt etter leieavtalen', tekst: tt("Leieavtalen gir leietaker ingen vedlikeholdsplikter (eier har alt) – kontroller ansvarsfordelingen") }));
  L.push(...['Internkontroll (IK-bygg) dokumentert av leietaker', 'Avvik fra forrige befaring er utbedret'].map(t => nyP({ gruppe: 'Oppfølging', tekst: t })));
  return L;
}
/** Siste befaring av en type for en leietaker (f.eks. overtakelsen ved tilbakelevering) */
export const sisteFor = (lid: string, type: string, unntatt?: string) => sortBy(S.befaringer.filter(b => b.leietakerId === lid && b.type === type && b.id !== unntatt && b.status !== 'Avbrutt'), b => b.dato || '').pop();

export function nyBefaring(eid: string, type: string, x: Record<string, any> = {}): Rec {
  const T = btype(type); let punkter: Punkt[] = T.vplikt ? vpliktPunkter(x.leietakerId) : T.punkter().map(nyP);
  let forrigeId: string | undefined;
  if (type === 'tilbakelevering' && x.leietakerId) { // ta med rommene og svarene fra overtakelsen
    const o = sisteFor(x.leietakerId, 'overtakelse'); if (o) { forrigeId = o.id;
      const romG = [...new Set((o.punkter || []).map((p: Punkt) => p.gruppe))].filter(gr => !punkter.some(p => p.gruppe === gr));
      punkter = [...punkter.filter(p => p.gruppe !== 'Lokalet' || !romG.length), ...((o.punkter || []) as Punkt[]).filter(p => romG.includes(p.gruppe)).map(p => ({ ...nyP(p), ref: { svar: p.svar, komm: p.komm, dato: o.dato } }))];
      punkter.forEach(p => { const m = (o.punkter || []).find((q: Punkt) => q.gruppe === p.gruppe && q.tekst === p.tekst); if (m && !p.ref) p.ref = { svar: m.svar, komm: m.komm, dato: o.dato }; }); } }
  if (type === 'vplikt' && x.leietakerId) { const f = sisteFor(x.leietakerId, 'vplikt'); if (f) forrigeId = f.id; }
  const l = x.leietakerId ? byId('leietakere', x.leietakerId) : null;
  const deltakere: Deltaker[] = [{ id: uid(), navn: state.me?.navn || state.me?.epost || '', rolle: 'Forvalter', epost: state.me?.epost || '', signerer: !!T.leie }];
  if (l) deltakere.push({ id: uid(), navn: l.kontakt || '', firma: l.navn, rolle: 'Leietaker', epost: l.epost || '', tlf: l.telefon || '', signerer: true });
  return { id: '', eiendomId: eid, type, tittel: `${T.kort}${l ? ' – ' + l.navn : ''}`, dato: today(), status: 'Pågår', punkter, funn: [], tegn: {}, deltakere, maalere: [], nokler: [], forrigeId, lokale: l?.lokale || '', ...x, logg: [{ t: new Date().toISOString(), k: 'Befaring opprettet', av: state.me?.navn || state.me?.epost }] };
}

// ---------- status for funn (avvik følges i avviksregisteret)
export function funnStatus(f: Funn): { s: string; c: string; a?: Rec } {
  if (f.art !== 'avvik' && f.art !== 'energi') return { s: f.art === 'system' ? (f.nyAnleggId && byId('anlegg', f.nyAnleggId) ? 'Registrert i TFM' : 'Registreres ved synk') : ART_NAVN[f.art], c: '' };
  const a = f.avvikId ? byId('avvik', f.avvikId) : null;
  if (!a) return { s: 'Ikke synket', c: 'amber' };
  return { s: a.status, c: AV_LUKKET.includes(a.status) ? 'green' : a.frist && a.frist < today() ? 'red' : 'blue', a };
}
export const tellFunn = (b: Rec) => { const F: Funn[] = b.funn || []; const av = F.filter(f => f.art === 'avvik' || f.art === 'energi'); const apne = av.filter(f => { const a = f.avvikId && byId('avvik', f.avvikId); return !a || !AV_LUKKET.includes(a.status); }).length; return { n: F.length, avvik: av.length, apne }; };

// ---------- synkronisering
const synker = new Set<string>(); export const synkStatus: Record<string, { usynket: boolean; feil?: string; t?: number }> = {};
async function lastOpp(f: BFil | undefined, eid: string, bid: string): Promise<BFil | undefined> {
  if (!f || !erLokal(f)) return f; const før = await opplastetSom(f.lokal); if (før) return før;
  const b = await hentLokalFil(f.lokal); if (!b) return undefined;
  const r = await uploadFile(b, eid, undefined, f.navn, 'befaring/' + bid); if (r) await merkOpplastet(f.lokal, r); return r || f;
}
async function lastOppAlle(L: BFil[] | undefined, eid: string, bid: string) { if (!L?.length) return L; const out: BFil[] = []; for (const f of L) { const r = await lastOpp(f, eid, bid); if (r) out.push(r); } return out; }
const kunFil = (L?: BFil[]) => (L || []).filter(f => !erLokal(f)) as Fil[];

async function synkFunn(b: Rec, f: Funn): Promise<Funn> {
  const av = state.me?.navn || state.me?.epost; const T = btype(b.type);
  if ((f.art === 'avvik' || f.art === 'energi') && (!f.synket || (f.endret || 0) > f.synket || !f.avvikId || !byId('avvik', f.avvikId))) {
    const gml = f.avvikId ? byId('avvik', f.avvikId) : null;
    const besk = [f.beskrivelse, f.art === 'energi' && f.besparelse ? `Anslått besparelse: ${(+f.besparelse).toLocaleString(lokale())} kWh/år` : ''].filter(Boolean).join('\n');
    const o: Rec = { ...(gml || { status: 'Ny', kilde: 'Befaring', oppdaget: b.dato || today(), logg: [{ t: new Date().toISOString(), s: 'Ny', k: `Registrert under ${T.kort.toLowerCase()} ${b.dato ? b.dato.split('-').reverse().join('.') : ''}`, av }] }),
      id: f.avvikId || (f.avvikId = uid()), eiendomId: b.eiendomId, tittel: f.tittel, beskrivelse: besk, alv: f.alv || 'Middels', ansvar: f.ansvar || 'Eier', utbedresAv: f.utbedresAv || '', leietakerId: f.leietakerId || b.leietakerId || '',
      frist: f.frist || addDays(b.dato || today(), AV_FRIST[f.alv || 'Middels'] || 90), pos: f.pos || null, plassering: f.plassering || '', anleggId: f.anleggId || '', komponentId: f.komponentId || '', kost: f.kost || '',
      vedlegg: kunFil(f.bilder), befaringId: b.id, meldtAv: `${T.kort} ${b.dato ? b.dato.split('-').reverse().join('.') : ''}`.trim() };
    if (gml) o.logg = [...(gml.logg || [])];
    const id = await save('avvik', o); return { ...f, avvikId: id, synket: Date.now() };
  }
  if (f.art === 'system' && f.sys?.tfmSys && !(f.nyAnleggId && byId('anlegg', f.nyAnleggId))) {
    const s = f.sys; const id = await save('anlegg', { id: f.nyAnleggId || uid(), eiendomId: b.eiendomId, type: s.type || '', tfmSys: s.tfmSys, tfmLop: nextSysLop(b.eiendomId, s.tfmSys!), navn: s.navn || f.tittel, fabrikat: s.fabrikat || '', aar: s.aar || '', pos: f.pos || null, plassering: f.plassering || '', merknad: f.beskrivelse || '', fraBefaring: b.id, bilder: kunFil(f.bilder) });
    return { ...f, nyAnleggId: id, synket: Date.now() };
  }
  return f;
}

/** Laster opp bilder, lager/oppdaterer avvik og systemer og lagrer befaringen. Kaster ikke – feil lagres i status. */
export async function synkBefaring(id: string): Promise<boolean> {
  if (synker.has(id) || !paaNett() || !state.me) return false; synker.add(id);
  try {
    const u = await hentUtkast(id); if (!u?.usynket) { synker.delete(id); return true; }
    let b: Rec = JSON.parse(JSON.stringify(u.rec)); const eid = b.eiendomId;
    b.punkter = await Promise.all((b.punkter || []).map(async (p: Punkt) => ({ ...p, bilder: await lastOppAlle(p.bilder, eid, id) })));
    const F: Funn[] = []; for (const f of (b.funn || []) as Funn[]) { const f2 = { ...f, bilder: await lastOppAlle(f.bilder, eid, id) }; F.push(await synkFunn(b, f2)); }
    b.funn = F;
    if (b.rapport?.fil && erLokal(b.rapport.fil)) { const r = await lastOpp(b.rapport.fil, eid, id); if (r && !erLokal(r)) b.rapport = { ...b.rapport, fil: r }; }
    // Signeringen styres av serveren – ta alltid med den ferskeste
    if (byId('befaringer', id)) await refetch('befaringer', id).catch(() => { });
    const srv = byId('befaringer', id); if (srv?.signering) { b.signering = srv.signering; if (['Til signering', 'Signert'].includes(srv.status) && !(b.gjenapnet && b.gjenapnet > (srv.signering.sendt || ''))) b.status = srv.status; }
    const stedSign: Rec[] = b.stedSign || []; delete b.stedSign;
    await save('befaringer', { ...b, stedSign: stedSign.length ? stedSign : undefined });
    // Signaturer gitt på stedet uten nett registreres hos serveren nå
    const igjen: Rec[] = [];
    for (const s of stedSign) { if (!b.rapport?.fil || erLokal(b.rapport.fil) || s.dokHash !== b.rapport.hash) { if (s.dokHash === b.rapport?.hash) igjen.push(s); continue; }
      try { await aoApi({ action: 'bef_sign_sted', befaring_id: id, ...s, parter: (b.deltakere || []).filter((d: Rec) => d.signerer).map((d: Rec) => ({ id: d.id, navn: d.navn, epost: d.epost || '', rolle: d.rolle, firma: d.firma || '' })) }); }
      catch { igjen.push(s); } }
    if (stedSign.length) { await refetch('befaringer', id); const fersk = byId('befaringer', id); if (fersk) await save('befaringer', { ...fersk, stedSign: igjen.length ? igjen : undefined }); }
    // Ble noe endret lokalt mens vi synket? Behold i så fall som usynket.
    const naa = await hentUtkast(id); const endretUnderveis = naa && naa.endret !== u.endret;
    const lagret = byId('befaringer', id) || b;
    if (endretUnderveis) { const m = mergeEtterSynk(naa!.rec, lagret); await lagreUtkast(id, { ...naa!, rec: m, usynket: true }); }
    else await lagreUtkast(id, { rec: lagret, usynket: false, endret: u.endret });
    synkStatus[id] = { usynket: !!endretUnderveis, t: Date.now() }; bump(); synker.delete(id);
    try { window.dispatchEvent(new CustomEvent('bef-synket', { detail: { id, rec: lagret } })); } catch { }
    if (endretUnderveis) setTimeout(() => synkBefaring(id), 500);
    return true;
  } catch (e: any) {
    synkStatus[id] = { usynket: true, feil: String(e?.message || e) }; bump(); synker.delete(id); return false;
  }
}
// Etter synk: legg inn id-er fra serveren (avvikId, opplastede filer) i den lokale versjonen
function mergeEtterSynk(lokal: Rec, srv: Rec): Rec {
  const fm = new Map<string, Funn>((srv.funn || []).map((f: Funn) => [f.id, f]));
  const pm = new Map<string, Punkt>((srv.punkter || []).map((p: Punkt) => [p.id, p]));
  const filer = (lok?: BFil[], s?: BFil[]) => (lok || []).map(f => erLokal(f) ? (s || []).find(x => (x as Fil).navn === f.navn && !erLokal(x)) || f : f);
  const rapport = lokal.rapport && srv.rapport?.hash === lokal.rapport.hash ? srv.rapport : lokal.rapport;
  const status = ['Til signering', 'Signert'].includes(srv.status) && !(lokal.gjenapnet && lokal.gjenapnet > (srv.signering?.sendt || '')) ? srv.status : lokal.status;
  return { ...lokal, rapport, status, stedSign: srv.stedSign, endret: srv.endret, signering: srv.signering, funn: (lokal.funn || []).map((f: Funn) => { const s = fm.get(f.id); return s ? { ...f, avvikId: f.avvikId || s.avvikId, nyAnleggId: f.nyAnleggId || s.nyAnleggId, synket: s.synket, bilder: filer(f.bilder, s.bilder) } : f; }),
    punkter: (lokal.punkter || []).map((p: Punkt) => { const s = pm.get(p.id); return s ? { ...p, bilder: filer(p.bilder, s.bilder) } : p; }) };
}

let synkT: Record<string, any> = {};
/** Lagre lokalt med én gang, synk til serveren litt etter (når på nett) */
export async function lagreBefaring(rec: Rec) {
  if (!rec.id) rec.id = uid();
  await lagreUtkast(rec.id, { rec, usynket: true, endret: Date.now() });
  synkStatus[rec.id] = { ...(synkStatus[rec.id] || {}), usynket: true }; bump();
  clearTimeout(synkT[rec.id]); synkT[rec.id] = setTimeout(() => synkBefaring(rec.id), 1200);
  return rec.id as string;
}
export async function synkAlle() {
  if (!paaNett() || !state.me) return; const L = await alleUtkast(); let n = 0;
  for (const { key, v } of L) if (v.usynket) { if (await synkBefaring(key)) n++; }
  if (n) toast(tt("{0} befaring{1} synket", n, n > 1 ? 'er' : ''));
}
export async function antallUsynket() { return (await alleUtkast()).filter(x => x.v.usynket).length; }
export async function forkastUtkast(id: string) { await slettUtkast(id); delete synkStatus[id]; if (byId('befaringer', id)) await refetch('befaringer', id); bump(); }

/** Befaringer som bare finnes på enheten (opprettet uten nett) – vises i listene */
export const lokaleBefaringer: Record<string, Rec> = {};
export async function lastLokale() {
  const L = await alleUtkast(); for (const k in lokaleBefaringer) delete lokaleBefaringer[k];
  L.forEach(({ key, v }) => { if (v.usynket) { lokaleBefaringer[key] = v.rec; synkStatus[key] = { ...(synkStatus[key] || {}), usynket: true }; } }); bump();
}
export const alleBefaringer = (): Rec[] => { const m = new Map<string, Rec>(S.befaringer.map(b => [b.id, b])); Object.values(lokaleBefaringer).forEach(b => m.set(b.id, { ...m.get(b.id), ...b, _lokal: true })); return [...m.values()]; };

/** Arbeidskopi av én befaring: lokal versjon om den har usynkede endringer, ellers serverens */
export function useBefaring(id: string): [Rec | null, (f: (b: Rec) => Rec) => void, boolean] {
  const [rec, setRec] = useState<Rec | null>(null); const [lastet, setLastet] = useState(false); const ref = useRef<Rec | null>(null);
  const srv = byId('befaringer', id);
  useEffect(() => { let on = true; (async () => {
    const u = await hentUtkast(id); const s = byId('befaringer', id);
    const r = u?.usynket ? u.rec : s || u?.rec || null; if (!on) return; ref.current = r; setRec(r); setLastet(true);
    if (u?.usynket) { synkStatus[id] = { ...(synkStatus[id] || {}), usynket: true }; if (paaNett()) synkBefaring(id); }
  })(); return () => { on = false; }; }, [id]);
  // Endringer fra serveren (sanntid, signering) når vi ikke har lokale endringer
  useEffect(() => { if (srv && ref.current && !synkStatus[id]?.usynket && srv.endret !== ref.current.endret) { ref.current = srv; setRec(srv); } }, [srv?.endret]);
  // Etter synk: legg id-er fra serveren (avvik, systemer, opplastede bilder) inn i arbeidskopien
  useEffect(() => { const h = (e: any) => { if (e.detail?.id !== id || !ref.current) return; ref.current = mergeEtterSynk(ref.current, e.detail.rec); setRec(ref.current); };
    window.addEventListener('bef-synket', h); return () => window.removeEventListener('bef-synket', h); }, [id]);
  const oppdater = (f: (b: Rec) => Rec) => { if (!ref.current) return; const n = f(ref.current); ref.current = n; setRec(n); lagreBefaring(n); lokaleBefaringer[n.id] = n; };
  return [rec, oppdater, lastet];
}

export const loggB = (b: Rec, k: string): Rec => ({ ...b, logg: [...(b.logg || []), { t: new Date().toISOString(), k, av: state.me?.navn || state.me?.epost }] });
