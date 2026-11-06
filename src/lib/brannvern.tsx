// Brannverninformasjon til leietakere.
//
// Hjemmel (forskrift om brannforebygging, FOR-2015-12-17-1710):
//  § 4  Eier skal kjenne kravene til brannsikkerhet for byggverket, gjøre den som har rett til å bruke det kjent med
//       kravene, og samordne bruken når flere har rett til å bruke byggverket.
//  § 5  Sikkerhetsinnretninger skal kontrolleres og vedlikeholdes (kontrollplanen).
//  § 9  Systematisk sikkerhetsarbeid: rutiner som sikrer etterlevelse og avdekker/retter mangler.
//  § 10 Eier skal dokumentere at pliktene i §§ 4–9 er oppfylt.
//  §§ 11–13 Brukerens (leietakers) plikter: brannsikker bruk, frie rømningsveier, melde fra til eier om endringer,
//       forfall og skader, egne rutiner for evakuering og opplæring, og dokumentasjon.
//  Brann- og eksplosjonsvernloven § 6 (eiers sikringsplikt) og § 13 (særskilte brannobjekter).
//
// Data: eiendom.brannvern = byggets brannkort (versjonert). leietaker.brannInfo = utsendinger, bekreftelser og
// brannvernansvarlig. Leietaker skriver bare gjennom databasefunksjonene i migrering 013.
import React, { useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import { S, canEdit, fileUrl, kanRedigereE, loggHendelse, save, sb, state, toast, feiltekst , uploadFile } from './store';
import { AV_LUKKET } from './catalog';
import { aNavn, addDays, byId, fd, kNavn, sortBy, taggerFor, today, type Rec } from './utils';
import { Doc, M, INK, MUTED, ACC, RED } from './arealRapport';
import { Chip, Empty, FileLink, confirmBox, formModal, showModal } from '../components/ui';
import { Hjelp } from '../components/Hjelp';
import { editAvvik, editOppgave } from './actions';

export const DOKTYPE_PAKKE = 'Brannvernpakke (informasjon til leietaker)';
export const RISIKOKLASSER: [string, string][] = [['1', 'RK 1 – lager, garasje o.l. med lite personopphold'], ['2', 'RK 2 – kontor, industri, lager med personopphold'], ['3', 'RK 3 – skole, barnehage'], ['4', 'RK 4 – bolig'], ['5', 'RK 5 – forsamlingslokale, salgslokale, kino'], ['6', 'RK 6 – hotell, sykehjem, overnatting']];
export const BRANNKLASSER: [string, string][] = [['1', 'BKL 1'], ['2', 'BKL 2'], ['3', 'BKL 3'], ['4', 'BKL 4']];
export const STD_REGLER = `Rømningsveier, korridorer og trapperom skal alltid være frie – ingen lagring, møbler eller avfall.
Branndører skal være lukket, eller stå på godkjent dørholder som slipper ved alarm. Ikke kil opp eller blokker dører.
Slokkeutstyr, manuelle brannmeldere og nødlys skal være synlige og tilgjengelige – ikke dekk dem til.
Varme arbeider (sveising, skjæring, takarbeid med åpen flamme) krever avtale med eier og sertifisert utførende.
Ombygging, nye vegger, endret bruk eller økt personbelastning skal avklares med eier på forhånd – det kan endre brannkonseptet.
Feil, skader eller forhold som svekker brannsikkerheten meldes straks til eier (meld avvik i portalen).
Ved brannalarm: varsle, redde/evakuere, slokke hvis det er trygt – og møt på oppstillingsplassen.`;

// Leietakers plikter slik de presenteres i pakken (egne ord – se Lovdata for ordlyd)
export const LEIETAKER_PLIKTER: [string, string][] = [
  ['FOB § 11', 'Bruke lokalene i tråd med kravene til brannsikkerhet og unngå unødig brannrisiko.'],
  ['FOB § 11', 'Sørge for at rømningsveiene fungerer og er farbare til enhver tid.'],
  ['FOB § 11', 'Informere eier om endringer, forfall og skader som kan påvirke brannsikkerheten.'],
  ['FOB § 11', 'Straks sette inn ekstraordinære tiltak hvis brannsikkerheten er vesentlig redusert (f.eks. brannvakt), og varsle eier.'],
  ['FOB § 12', 'Ha egne rutiner for varsling, evakuering og redning, og sørge for at de ansatte kan forebygge og slokke brann (opplæring og øvelser).'],
  ['FOB § 12', 'Gjøre alle som oppholder seg i lokalene kjent med brannsikkerheten – også nyansatte, vikarer og besøkende.'],
  ['FOB § 13', 'Dokumentere at pliktene er oppfylt.'],
];
export const HJEMMEL_TEKST: [string, string][] = [
  ['FOB § 4', 'Eier skal kjenne brannsikkerhetskravene for bygget, gjøre leietakerne kjent med dem og samordne bruken når flere leier i samme bygg.'],
  ['FOB § 5', 'Eier sørger for kontroll og vedlikehold av sikkerhetsinnretningene.'],
  ['FOB §§ 9–10', 'Eier skal ha systematisk sikkerhetsarbeid og dokumentere at pliktene er oppfylt – utsending og bekreftelse av denne pakken er en del av den dokumentasjonen.'],
  ['FOB §§ 11–13', 'Leietakers egne plikter (se over).'],
  ['Brann- og eksplosjonsvernloven § 6', 'Eier har ansvaret for nødvendige sikringstiltak for å forebygge og begrense brann.'],
];

// ---------------- data
export const bv = (e?: Rec): Rec => e?.brannvern || {};
export const bvVersjon = (e?: Rec) => +bv(e).versjon || 0;
/** Innholdet som inngår i en versjon – brukes til å se om brannkortet er endret siden sist publisering */
const INNHOLD = ['risikoklasse', 'brannklasse', 'saerskilt', 'saerskiltKat', 'forutsetninger', 'maksPersoner', 'alarm', 'brannsentral', 'oppstilling', 'eierAnsvarlig', 'eierTlf', 'regler', 'vedlegg'];
const hash = (b: Rec) => JSON.stringify(INNHOLD.map(k => b[k] ?? ''));
export const ulagretEndring = (e?: Rec) => { const b = bv(e); return !!b.versjon && b.publisertHash !== hash(b); };
export const aktiveMidl = (e?: Rec) => (bv(e).midlertidig || []).filter((m: Rec) => !m.avsluttet);

export const binfo = (l?: Rec): Rec => l?.brannInfo || {};
export const sisteKvittering = (l: Rec) => sortBy(binfo(l).kvitteringer || [], (k: Rec) => k.tid || '').pop() as Rec | undefined;
export const sisteSendt = (l: Rec) => sortBy(binfo(l).sendt || [], (k: Rec) => k.tid || '').pop() as Rec | undefined;

export type BvStatus = { c: 'green' | 'amber' | 'red' | 'blue' | ''; t: string; o: number; hint?: string };
/** Status for informasjonsplikten overfor én leietaker. o: 0 = ok, 1 = følg opp, 2 = mangler */
export function bvStatus(l: Rec): BvStatus {
  const e = byId('eiendommer', l.eiendomId); const v = bvVersjon(e);
  if (!v) return { c: '', t: 'Brannkort ikke publisert', o: 2, hint: 'Fyll ut og publiser brannkortet for eiendommen' };
  const k = sisteKvittering(l); const s = sisteSendt(l);
  if (k && +k.versjon === v) {
    const gammel = (k.tid || '').slice(0, 10) < addDays(today(), -365);
    return gammel ? { c: 'amber', t: 'Årlig bekreftelse forfalt', o: 1, hint: 'Sist bekreftet ' + fd(k.tid) } : { c: 'green', t: `Bekreftet v${v}`, o: 0, hint: fd(k.tid) + (k.navn ? ' av ' + k.navn : '') };
  }
  if (s && +s.versjon === v) return { c: 'blue', t: 'Sendt – venter på bekreftelse', o: 1, hint: 'Sendt ' + fd(s.tid) };
  if (k) return { c: 'amber', t: `Ny versjon (v${v}) ikke sendt`, o: 2, hint: `Bekreftet v${k.versjon} ${fd(k.tid)}` };
  return { c: 'red', t: 'Ikke informert', o: 2, hint: 'Brannvernpakken er ikke sendt' };
}
export const mangelAnsvarlig = (l: Rec) => !binfo(l).ansvarlig?.navn && !l.brannvernleder;
/** Leietakere med behov for oppfølging (for Oversikt) */
export const bvOppfolging = () => S.leietakere.filter(l => bvStatus(l).o >= 1 || mangelAnsvarlig(l));

function punktI(p: [number, number], poly: number[][]) {
  let inn = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) inn = !inn; }
  return inn;
}
const erBrann = (o: Rec, kind: 'a' | 'k') => taggerFor(o, kind).includes('Brann');
/** Brannsikringssystemer på eiendommen og brannkomponenter plassert innenfor leietakers arealer på tegningene */
export function brannInstallasjoner(eid: string, lid?: string) {
  const sys = sortBy(S.anlegg.filter(a => a.eiendomId === eid && !a.arkivert && erBrann(a, 'a')), a => aNavn(a.id));
  const soner: { tid: string; pts: number[][] }[] = [];
  if (lid) for (const t of S.tegninger.filter(t => t.eiendomId === eid)) for (const z of t.soner || []) if (z.kat === 'leie' && z.leietakerId === lid && (z.pts || []).length > 2) soner.push({ tid: t.id, pts: z.pts });
  const iAreal = (o: Rec) => !!o.pos && soner.some(z => z.tid === o.pos.tegningId && punktI([+o.pos.x, +o.pos.y], z.pts));
  const komp = lid ? S.komponenter.filter(k => k.eiendomId === eid && !k.arkivert && erBrann(k, 'k') && iAreal(k)) : [];
  const ansvar = (a: Rec) => { const o = S.oppgaver.find(o => o.anleggId === a.id && o.aktiv !== false && o.ansvar === 'Leietaker' && (!lid || o.leietakerId === lid)); return o ? 'Leietaker' : 'Eier'; };
  const sisteKontroll = (a: Rec) => sortBy(S.oppgaver.filter(o => o.anleggId === a.id && o.sistUtfort), o => o.sistUtfort).pop()?.sistUtfort;
  return { sys: sys.map(a => ({ a, ansvar: ansvar(a), sist: sisteKontroll(a) })), komp, harSoner: soner.length > 0 };
}
export const brannDokumenter = (eid: string) => S.dokumenter.filter(d => d.eiendomId === eid && !d.leietakerId && d.fil && /brann|rømning/i.test((d.type || '') + ' ' + (d.tittel || '')));
const ikkeUtfylt = (b: Rec) => ['alarm', 'oppstilling'].filter(k => !String(b[k] || '').trim());

// ---------------- eiers handlinger
export function editBrannkort(eid: string) {
  const e = byId('eiendommer', eid)!; const b = bv(e);
  const kandidater = brannDokumenter(eid);
  formModal({
    title: 'Brannkort – ' + e.navn, wide: true, saveTxt: 'Lagre utkast',
    top: <p className="small muted" style={{ marginTop: 0 }}>Opplysningene her blir innholdet i brannvernpakken til leietakerne (forskrift om brannforebygging § 4). Hent dem fra brannkonseptet / den branntekniske dokumentasjonen. Endringer sendes ikke før du publiserer en ny versjon.</p>,
    values: { regler: STD_REGLER, ...b },
    fields: [
      { k: 's1', label: 'Byggets brannsikkerhet', type: 'sec' },
      { k: 'risikoklasse', label: 'Risikoklasse', type: 'select', options: RISIKOKLASSER, empty: '–', half: true, hint: 'TEK17 § 11-2 – fra brannkonseptet' },
      { k: 'brannklasse', label: 'Brannklasse', type: 'select', options: BRANNKLASSER, empty: '–', half: true, hint: 'TEK17 § 11-3' },
      { k: 'saerskilt', label: 'Registrert som særskilt brannobjekt (brann- og eksplosjonsvernloven § 13)', type: 'checkbox', half: true },
      { k: 'saerskiltKat', label: 'Kategori / merknad', half: true, show: v => !!v.saerskilt, ph: 'F.eks. kategori A – tilsyn fra brannvesenet' },
      { k: 'maksPersoner', label: 'Maks antall personer (dimensjonerende)', type: 'number', half: true },
      { k: 'forutsetninger', label: 'Forutsetninger for bruk fra brannkonseptet', type: 'textarea', ph: 'F.eks. brannceller per leieareal, maks brannbelastning, ingen lagring av brannfarlig vare, rømning via to trapperom …', hint: 'Dette er forhold leietaker må respektere for at bygget skal være brannsikkert slik det er prosjektert.' },
      { k: 's2', label: 'Varsling og evakuering', type: 'sec' },
      { k: 'alarm', label: 'Alarmorganisering *', type: 'textarea', ph: 'F.eks. heldekkende brannalarmanlegg med direktevarsling til 110-sentralen. Alarm i hele bygget, ikke forsinket. Vaktselskap X rykker ut.' },
      { k: 'brannsentral', label: 'Brannsentral / brannvesenets nøkkelboks', half: true, ph: 'F.eks. hovedinngang, vindfang' },
      { k: 'oppstilling', label: 'Oppstillingsplass ved evakuering *', half: true, ph: 'F.eks. parkeringsplassen mot nord' },
      { k: 'eierAnsvarlig', label: 'Eiers kontaktperson for brannsikkerhet', half: true }, { k: 'eierTlf', label: 'Telefon', half: true },
      { k: 's3', label: 'Husregler og vedlegg', type: 'sec' },
      { k: 'regler', label: 'Husregler for brannsikkerhet (én per linje)', type: 'textarea' },
      { k: 'vedlegg', label: 'Rømningsplaner og branntegninger som legges ved pakken', type: 'custom', def: b.vedlegg || [], render: (v, set) => kandidater.length
        ? <div className="note small" style={{ color: 'var(--ink)' }}>{kandidater.map(d => { const on = (v.vedlegg || []).includes(d.id); return <label key={d.id} style={{ display: 'flex', gap: 8, margin: '3px 0', fontWeight: 400, cursor: 'pointer' }}><input type="checkbox" checked={on} onChange={() => set({ vedlegg: on ? v.vedlegg.filter((x: string) => x !== d.id) : [...(v.vedlegg || []), d.id] })} />{d.tittel} <span className="muted">· {d.type}{/\.(pdf|png|jpe?g)$/i.test(d.fil?.navn || '') ? '' : ' (bare PDF/PNG/JPG kan legges ved)'}</span></label>; })}</div>
        : <div className="small muted">Ingen branndokumenter med fil på eiendommen. Last opp «Branntegninger/rømningsplaner» under Dokumenter.</div> },
    ],
    onSave: async v => {
      const ny: Rec = { ...b }; for (const k of INNHOLD) ny[k] = v[k] ?? ''; ny.maksPersoner = v.maksPersoner === '' ? '' : +v.maksPersoner;
      await save('eiendommer', { ...e, brannvern: ny }); toast(ny.versjon ? 'Lagret – publiser ny versjon for å sende endringene til leietakerne' : 'Brannkortet er lagret – publiser det når det er klart');
    },
  });
}

export function publiser(eid: string) {
  const e = byId('eiendommer', eid)!; const b = bv(e); const v = bvVersjon(e) + 1;
  const mangler = ikkeUtfylt(b); if (mangler.length) { toast('Fyll ut alarmorganisering og oppstillingsplass før publisering'); editBrannkort(eid); return; }
  formModal({
    title: `Publiser versjon ${v} av brannverninformasjonen`, saveTxt: 'Publiser',
    top: <p className="small muted" style={{ marginTop: 0 }}>Når en ny versjon publiseres, må alle leietakerne på eiendommen få den og bekrefte på nytt. Det dokumenterer at endringer i bygget eller brannkonseptet er formidlet (FOB §§ 4 og 10).</p>,
    fields: [{ k: 'tekst', label: 'Hva er endret?', type: 'textarea', req: true, def: v === 1 ? 'Første versjon' : '', ph: 'F.eks. nytt brannkonsept etter ombygging av 2. etasje, ny oppstillingsplass' }],
    onSave: async x => {
      const logg = [...(b.logg || []), { versjon: v, tid: new Date().toISOString(), tekst: x.tekst, av: state.me?.navn || state.me?.epost }];
      await save('eiendommer', { ...e, brannvern: { ...b, versjon: v, versjonDato: today(), publisertHash: hash(b), logg } });
      loggHendelse(`Brannverninformasjon v${v} publisert: ${x.tekst}`, eid, eid);
      const L = S.leietakere.filter(l => l.eiendomId === eid);
      if (L.length && await confirmBox(`Versjon ${v} er publisert. Lage og sende brannvernpakken til ${L.length} leietaker${L.length === 1 ? '' : 'e'} nå?`, 'Send til alle')) await sendTilAlle(eid);
    },
  });
}

export async function lagPakkePdf(e: Rec, l: Rec): Promise<Uint8Array> {
  const b = bv(e); const v = bvVersjon(e); const dato = new Date().toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' });
  const D = await Doc.ny(`Brannverninformasjon – ${e.navn} – ${l.navn} – v${v}`);
  const linjer = (s: string, size = 9, c = INK) => String(s || '').split('\n').map(x => x.trim()).filter(Boolean).forEach(x => D.p(x, size, c));
  const pkt = (s: string) => D.p('•  ' + s, 9, INK);
  D.nyside();
  D.t('BRANNVERNINFORMASJON TIL LEIETAKER', M, D.y - 10, 8.5, ACC, true); D.y -= 18;
  D.t(e.navn || 'Eiendom', M, D.y - 20, 20, INK, true); D.y -= 28;
  D.p([[e.adresse, e.poststed].filter(Boolean).join(', '), 'Leietaker: ' + l.navn + (l.lokale ? ' – ' + l.lokale : ''), `Versjon ${v} (${fd(b.versjonDato)}) · laget ${dato}`].filter(Boolean).join('   ·   '), 9, MUTED);
  D.p('Som eier skal vi kjenne kravene til brannsikkerhet i bygget og gjøre dere som leietaker kjent med dem, og samordne brannvernet når flere virksomheter bruker bygget (forskrift om brannforebygging § 4). Dette dokumentet er den informasjonen. Les det, gjør innholdet kjent for alle ansatte, og bekreft at det er mottatt.', 9, INK);
  const midl = aktiveMidl(e);
  if (midl.length) { D.h2('Midlertidige tiltak nå'); midl.forEach((m: Rec) => D.p(`!  ${m.tekst}${m.fra ? ' (fra ' + fd(m.fra) + (m.til ? ' til ' + fd(m.til) : '') + ')' : ''}${m.tiltak ? ' – Tiltak: ' + m.tiltak : ''}`, 9, RED)); }
  D.h2('Byggets brannsikkerhet');
  D.nokkel([['Risikoklasse', b.risikoklasse ? 'RK ' + b.risikoklasse : '–'], ['Brannklasse', b.brannklasse ? 'BKL ' + b.brannklasse : '–'], ['Maks personer', b.maksPersoner ? String(b.maksPersoner) : '–'], ['Særskilt brannobjekt', b.saerskilt ? 'Ja' + (b.saerskiltKat ? ' – ' + b.saerskiltKat : '') : 'Nei']]);
  if (b.forutsetninger) { D.p('Forutsetninger for bruk fra brannkonseptet – dette må dere respektere:', 9, INK); linjer(b.forutsetninger); }
  D.h2('Varsling og evakuering');
  D.tabell([['', 1.2], ['', 3]], [{ c: ['Alarmorganisering', (b.alarm || '–').replace(/\n/g, ' ')] }, { c: ['Brannsentral / nøkkelboks', b.brannsentral || '–'] }, { c: ['Oppstillingsplass', b.oppstilling || '–'] }, { c: ['Eiers kontakt', [b.eierAnsvarlig, b.eierTlf].filter(Boolean).join(', ') || '–'] }, { c: ['Deres brannvernansvarlige', binfo(l).ansvarlig?.navn ? [binfo(l).ansvarlig.navn, binfo(l).ansvarlig.tlf].filter(Boolean).join(', ') : (l.brannvernleder || 'Ikke meldt – meld inn i portalen')] }]);
  const I = brannInstallasjoner(e.id, l.id);
  D.h2('Brannsikringsinstallasjoner');
  if (I.sys.length) D.tabell([['System', 3], ['Ansvar for kontroll og vedlikehold', 1.6], ['Sist kontrollert', 1, true]], I.sys.map(x => ({ c: [aNavn(x.a.id), x.ansvar === 'Eier' ? 'Eier (FOB § 5)' : 'Leietaker (iht. leieavtalen)', x.sist ? fd(x.sist) : '–'] })));
  else D.p('Ingen brannsikringssystemer registrert.', 9);
  if (I.komp.length) { D.p(`I deres leieareal (plassert på tegning): ${I.komp.length} komponenter`, 9, INK); D.tabell([['Komponent', 3], ['Plassering', 2]], I.komp.map(k => ({ c: [kNavn(k.id), k.plassering || k.rom || ''] }))); }
  D.h2('Husregler'); String(b.regler || STD_REGLER).split('\n').map(x => x.trim()).filter(Boolean).forEach(pkt);
  D.h2('Deres plikter som leietaker'); LEIETAKER_PLIKTER.forEach(([h, t]) => pkt(`${t} (${h})`));
  const egne = (l.plikter || []).filter((p: Rec) => !p.ikkeRelevant && /brann|romm/.test(p.key || ''));
  if (egne.length) { D.p('Dette følger vi opp med dere i appen:', 9, INK); D.tabell([['Plikt', 4], ['Sist bekreftet', 1, true]], egne.map((p: Rec) => ({ c: [p.navn, p.sist ? fd(p.sist) : '–'] }))); }
  D.h2('Hjemmel'); HJEMMEL_TEKST.forEach(([h, t]) => D.p(`${h}: ${t}`, 8, MUTED));
  D.h2('Bekreftelse');
  D.p('Bekreft i portalen (Mitt leieforhold → Brannsikkerhet), eller signer og returner denne siden:', 9, INK);
  D.p(`Vi bekrefter å ha mottatt brannverninformasjon versjon ${v} for ${e.navn}, og at innholdet er gjort kjent for de ansatte.`, 9, INK);
  D.y -= 26; D.page.drawLine({ start: { x: M, y: D.y }, end: { x: M + 220, y: D.y }, thickness: 0.6, color: MUTED }); D.page.drawLine({ start: { x: M + 260, y: D.y }, end: { x: M + 400, y: D.y }, thickness: 0.6, color: MUTED });
  D.t('Navn og signatur, ' + l.navn, M, D.y - 11, 7.5, MUTED); D.t('Dato', M + 260, D.y - 11, 7.5, MUTED); D.y -= 20;
  // vedlegg: rømningsplaner og branntegninger
  for (const id of b.vedlegg || []) {
    const d = byId('dokumenter', id); if (!d?.fil?.path) continue; const navn = (d.fil.navn || '').toLowerCase();
    try {
      const buf = await (await fetch(await fileUrl(d.fil.path))).arrayBuffer();
      if (navn.endsWith('.pdf')) { const src = await PDFDocument.load(buf, { ignoreEncryption: true }); (await D.pdf.copyPages(src, src.getPageIndices())).forEach(p => D.pdf.addPage(p)); }
      else if (/\.(png|jpe?g)$/.test(navn)) {
        const img = navn.endsWith('.png') ? await D.pdf.embedPng(buf) : await D.pdf.embedJpg(buf); const ligg = img.width > img.height;
        const pg = D.nyside(ligg); const W = pg.getWidth() - 2 * M, H = pg.getHeight() - 2 * M - 30; const s = Math.min(W / img.width, H / img.height);
        D.t('Vedlegg: ' + (d.tittel || d.type), M, D.y - 10, 10, INK, true);
        pg.drawImage(img, { x: M + (W - img.width * s) / 2, y: 46 + (H - img.height * s) / 2, width: img.width * s, height: img.height * s });
      }
    } catch (err) { console.error(err); toast('Kunne ikke legge ved ' + (d.tittel || 'vedlegg')); }
  }
  return D.pdf.save();
}

const lastNed = (bytes: Uint8Array, navn: string) => { const url = URL.createObjectURL(new Blob([bytes as any], { type: 'application/pdf' })); const a = document.createElement('a'); a.href = url; a.download = navn; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 20000); };
const filnavn = (e: Rec, l: Rec) => `Brannverninformasjon ${e.navn} - ${l.navn} v${bvVersjon(e)}.pdf`.replace(/[\\/:*?"<>|]/g, '_');

/** Lager pakken, legger den i leietakerens dokumenter (synlig i portalen) og registrerer utsendingen */
export async function sendPakke(lid: string, opt: { last?: boolean; stille?: boolean } = {}) {
  const l = byId('leietakere', lid)!; const e = byId('eiendommer', l.eiendomId)!; const v = bvVersjon(e);
  if (!v) { toast('Publiser brannkortet for eiendommen først'); return false; }
  const bytes = await lagPakkePdf(e, l); const navn = filnavn(e, l);
  const f = await uploadFile(new Blob([bytes as any], { type: 'application/pdf' }), e.id, l.id, navn); if (!f) return false;
  const dokId = await save('dokumenter', { eiendomId: e.id, leietakerId: l.id, type: DOKTYPE_PAKKE, tittel: `Brannverninformasjon v${v} – ${l.navn}`, dato: today(), fil: f, brannVersjon: v });
  const l2 = byId('leietakere', lid)!; const bi = binfo(l2);
  await save('leietakere', { ...l2, brannInfo: { ...bi, sendt: [...(bi.sendt || []), { versjon: v, tid: new Date().toISOString(), av: state.me?.navn || state.me?.epost, dokId }] } });
  loggHendelse(`Brannverninformasjon v${v} sendt til ${l.navn}`, lid, e.id);
  if (opt.last) lastNed(bytes, navn);
  if (!opt.stille) toast(l.epost || (S.profiles || []).some(p => p.leietaker_id === lid) ? 'Pakken ligger nå i leietakerens portal' : 'Pakken er lagret – leietakeren har ingen innlogging, så send PDF-en på e-post');
  return true;
}
export async function sendTilAlle(eid: string) {
  const L = S.leietakere.filter(l => l.eiendomId === eid && bvStatus(l).o >= 1 && !(sisteSendt(l) && +sisteSendt(l)!.versjon === bvVersjon(byId('eiendommer', eid)) && bvStatus(l).c === 'blue'));
  if (!L.length) { toast('Alle leietakere har fått gjeldende versjon'); return; }
  let n = 0; for (const l of L) { toast(`Lager pakke ${n + 1} av ${L.length} …`); if (await sendPakke(l.id, { stille: true })) n++; }
  toast(`Brannvernpakken er sendt til ${n} leietaker${n === 1 ? '' : 'e'}`);
}
export async function forhandsvis(lid: string) {
  const l = byId('leietakere', lid)!; const e = byId('eiendommer', l.eiendomId)!;
  if (!bvVersjon(e) && !bv(e).alarm) { toast('Fyll ut brannkortet først'); return; }
  try { lastNed(await lagPakkePdf(e, l), filnavn(e, l)); } catch (err: any) { toast('Kunne ikke lage PDF: ' + (err?.message || err)); }
}

/** Eier registrerer bekreftelse mottatt utenfor appen (signert papir, e-post) */
export function registrerKvittering(lid: string) {
  const l = byId('leietakere', lid)!; const e = byId('eiendommer', l.eiendomId)!; const v = bvVersjon(e);
  formModal({
    title: 'Registrer bekreftelse – ' + l.navn, saveTxt: 'Registrer',
    fields: [
      { k: 'versjon', label: 'Versjon', type: 'number', def: v, half: true }, { k: 'dato', label: 'Dato', type: 'date', def: today(), half: true },
      { k: 'navn', label: 'Bekreftet av (navn hos leietaker)', req: true, def: binfo(l).ansvarlig?.navn || l.kontakt || '' },
      { k: 'form', label: 'Form', type: 'select', options: ['Signert på papir', 'Bekreftet på e-post', 'Gjennomgått i møte'], def: 'Signert på papir' },
      { k: 'fil', label: 'Signert kopi / e-post (valgfritt)', type: 'file' }, { k: 'komm', label: 'Kommentar', type: 'textarea' }],
    onSave: async x => {
      let dokId: string | null = null;
      if (x.fil) { const f = await uploadFile(x.fil, e.id, lid); if (f) dokId = await save('dokumenter', { eiendomId: e.id, leietakerId: lid, type: DOKTYPE_PAKKE, tittel: `Bekreftelse brannverninformasjon v${x.versjon} – ${l.navn}`, dato: x.dato, fil: f }); }
      const l2 = byId('leietakere', lid)!; const bi = binfo(l2);
      await save('leietakere', { ...l2, brannInfo: { ...bi, kvitteringer: [...(bi.kvitteringer || []), { versjon: +x.versjon, tid: x.dato + 'T12:00:00', navn: x.navn, form: x.form + ' (registrert av ' + (state.me?.navn || state.me?.epost) + ')', komm: x.komm || '', dokId }] } });
      loggHendelse(`Bekreftelse på brannverninformasjon v${x.versjon} registrert for ${l.navn}`, lid, e.id);
    },
  });
}
export function editAnsvarlig(lid: string) {
  const l = byId('leietakere', lid)!; const a = binfo(l).ansvarlig || {};
  formModal({
    title: 'Brannvernansvarlig – ' + l.navn,
    fields: [{ k: 'navn', label: 'Navn', req: true, def: a.navn || l.brannvernleder || '' }, { k: 'tlf', label: 'Telefon', half: true, def: a.tlf }, { k: 'epost', label: 'E-post', type: 'email', half: true, def: a.epost }, { k: 'stedfortreder', label: 'Stedfortreder', def: a.stedfortreder }],
    onSave: async x => { const l2 = byId('leietakere', lid)!; await save('leietakere', { ...l2, brannvernleder: x.navn + (x.tlf ? ` (${x.tlf})` : ''), brannInfo: { ...binfo(l2), ansvarlig: { ...x, oppdatert: new Date().toISOString(), av: state.me?.navn || state.me?.epost } } }); },
  });
}

export function midlertidig(eid: string, mid?: string) {
  const e = byId('eiendommer', eid)!; const b = bv(e); const m: Rec = (b.midlertidig || []).find((x: Rec) => x.id === mid) || { fra: today() };
  const brannAvvik = S.avvik.filter(a => a.eiendomId === eid && !AV_LUKKET.includes(a.status) && (erBrann(byId('anlegg', a.anleggId) || {} as Rec, 'a') || /brann|alarm|sprinkler|nødlys|rømning|røyk/i.test(a.tittel || '')));
  formModal({
    title: mid ? 'Midlertidig tiltak' : 'Varsle leietakerne om redusert brannsikkerhet', saveTxt: mid ? 'Lagre' : 'Varsle leietakerne',
    top: <p className="small muted" style={{ marginTop: 0 }}>Bruk dette når brannsikkerheten er redusert – f.eks. alarmanlegget er ute av drift, en rømningsvei er stengt eller sprinkleren er frakoblet. Leietakerne ser varselet øverst i portalen og må bekrefte at de har lest det. Varselet tas også med i brannvernpakken.</p>,
    values: m,
    fields: [
      { k: 'tekst', label: 'Hva gjelder det?', req: true, ph: 'F.eks. Brannalarmanlegget i 2. etasje er ute av drift' },
      { k: 'tiltak', label: 'Kompenserende tiltak / hva leietaker må gjøre', type: 'textarea', ph: 'F.eks. Brannvakt runder hver time. Ved brann: ring 110 og varsle manuelt.' },
      { k: 'fra', label: 'Fra', type: 'date', half: true }, { k: 'til', label: 'Forventet til', type: 'date', half: true },
      { k: 'avvikId', label: 'Knyttet til avvik', type: 'select', options: brannAvvik.map(a => [a.id, `#${a.nr} ${a.tittel}`] as [string, string]), empty: '–' }],
    extraFoot: close => mid && !m.avsluttet ? <button className="btn" onClick={async () => { const nb = { ...b, midlertidig: (b.midlertidig || []).map((x: Rec) => x.id === mid ? { ...x, avsluttet: today() } : x) }; await save('eiendommer', { ...e, brannvern: nb }); loggHendelse('Midlertidig brannsikringstiltak avsluttet: ' + m.tekst, eid, eid); close(); }}>Avslutt – normal drift</button> : null,
    onSave: async x => {
      const ny = { ...m, ...x, id: m.id || crypto.randomUUID(), av: m.av || state.me?.navn || state.me?.epost, opprettet: m.opprettet || new Date().toISOString() };
      const liste = mid ? (b.midlertidig || []).map((y: Rec) => y.id === mid ? ny : y) : [...(b.midlertidig || []), ny];
      await save('eiendommer', { ...e, brannvern: { ...b, midlertidig: liste } });
      if (!mid) loggHendelse('Leietakere varslet om redusert brannsikkerhet: ' + x.tekst, eid, eid);
    },
  });
}

function kvitteringer(l: Rec) {
  const K = sortBy([...(binfo(l).kvitteringer || []).map((k: Rec) => ({ ...k, h: 'Bekreftet' })), ...(binfo(l).sendt || []).map((s: Rec) => ({ ...s, h: 'Sendt' }))], (x: Rec) => x.tid || '').reverse();
  showModal('Brannverninformasjon – historikk for ' + l.navn, () => K.length ? <div className="log">{K.map((k: Rec, i: number) => <div key={i}><span className="lt">{new Date(k.tid).toLocaleString('nb-NO', { dateStyle: 'short', timeStyle: 'short' })}</span> · <b>{k.h} v{k.versjon}</b>{k.h === 'Bekreftet' ? ` – ${k.navn || ''} · ${k.form || ''}` : ` av ${k.av || ''}`}{k.komm && <div className="small muted">{k.komm}</div>}{k.dokId && byId('dokumenter', k.dokId)?.fil && <div className="small"><FileLink fil={byId('dokumenter', k.dokId)!.fil} /></div>}</div>)}</div> : <p className="muted">Ingen utsendinger eller bekreftelser.</p>);
}

// ---------------- visning: fanen «Brannvern» på eiendommen
export function BrannvernSection({ eid }: { eid: string }) {
  const e = byId('eiendommer', eid)!; const b = bv(e); const v = bvVersjon(e); const ed = canEdit() && kanRedigereE(eid);
  const L = sortBy(S.leietakere.filter(l => l.eiendomId === eid), l => l.navn); const I = brannInstallasjoner(eid);
  const midl = b.midlertidig || []; const [visAvsl, setVisAvsl] = useState(false);
  const harKonsept = S.dokumenter.some(d => d.eiendomId === eid && d.type === 'Brannkonsept/brannteknisk dokumentasjon');
  const samordning = (l: Rec) => S.dokumenter.some(d => d.leietakerId === l.id && d.type === 'Samordningsavtale');
  const ovelse = (l: Rec) => (l.plikter || []).find((p: Rec) => p.key === 'brannovelse')?.sist;
  const felles = S.oppgaver.find(o => o.eiendomId === eid && o.aktiv !== false && /felles brannøvelse|samordningsmøte/i.test(o.navn || ''));
  const dl: [string, React.ReactNode][] = ([['Risikoklasse', b.risikoklasse ? 'RK ' + b.risikoklasse : ''], ['Brannklasse', b.brannklasse ? 'BKL ' + b.brannklasse : ''], ['Særskilt brannobjekt', b.saerskilt ? 'Ja' + (b.saerskiltKat ? ' – ' + b.saerskiltKat : '') : ''], ['Maks personer', b.maksPersoner ? String(b.maksPersoner) : ''],
    ['Alarmorganisering', b.alarm], ['Brannsentral', b.brannsentral], ['Oppstillingsplass', b.oppstilling], ['Eiers kontakt', [b.eierAnsvarlig, b.eierTlf].filter(Boolean).join(', ')], ['Vedlegg', (b.vedlegg || []).map((id: string) => byId('dokumenter', id)?.tittel).filter(Boolean).join(', ')]] as [string, React.ReactNode][]).filter(x => x[1]);
  return <>
    <div className="note small" style={{ color: 'var(--ink)', marginBottom: 12 }}>Eier skal kjenne kravene til brannsikkerhet i bygget, <b>gjøre leietakerne kjent med dem</b> og <b>samordne</b> brannvernet når flere bruker bygget (forskrift om brannforebygging § 4), og kunne <b>dokumentere</b> det (§ 10). Leietakerne har egne plikter etter §§ 11–13.<Hjelp id="side.brannvern" /></div>
    {midl.filter((m: Rec) => !m.avsluttet).map((m: Rec) => { const lest = L.filter(l => binfo(l).midlLest?.[m.id]).length; return <div key={m.id} className="banner" style={{ background: 'var(--redbg)', color: 'var(--red)', borderColor: '#f3c1bb', display: 'flex', gap: 10, alignItems: 'center' }}>
      <div style={{ flex: 1 }}><b>Redusert brannsikkerhet:</b> {m.tekst}{m.tiltak && <> – {m.tiltak}</>} <span className="small">({fd(m.fra)}{m.til ? '–' + fd(m.til) : ''} · lest av {lest} av {L.length} leietakere)</span></div>{ed && <button className="btn sm" onClick={() => midlertidig(eid, m.id)}>Endre / avslutt</button>}</div>; })}
    <div className="grid g2">
      <div className="card"><div className="toolbar" style={{ marginBottom: 6 }}><h2 style={{ margin: 0, flex: 1 }}>Brannkort {v ? <Chip c="green">v{v} · {fd(b.versjonDato)}</Chip> : <Chip c="amber">ikke publisert</Chip>}{ulagretEndring(e) && <> <Chip c="amber">endret – ikke publisert</Chip></>}</h2>
        {ed && <><button className="btn sm" onClick={() => editBrannkort(eid)}>Rediger</button><button className="btn sm pri" onClick={() => publiser(eid)} disabled={!!v && !ulagretEndring(e)} title={v && !ulagretEndring(e) ? 'Ingen endringer siden siste versjon' : ''}>Publiser{v ? ' ny versjon' : ''}</button></>}</div>
        {dl.length ? <dl className="dl">{dl.map(([k, x]) => <React.Fragment key={k}><dt>{k}</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{x}</dd></React.Fragment>)}</dl> : <p className="small muted">Brannkortet er ikke fylt ut. Hent opplysningene fra brannkonseptet.</p>}
        {!harKonsept && <p className="small" style={{ marginBottom: 0 }}><Chip c="amber">Brannkonsept / brannteknisk dokumentasjon mangler i dokumentarkivet</Chip></p>}
        {(b.logg || []).length > 0 && <details className="small" style={{ marginTop: 8 }}><summary>Versjonshistorikk ({b.logg.length})</summary>{b.logg.slice().reverse().map((x: Rec) => <div key={x.versjon}><b>v{x.versjon}</b> {fd(x.tid)} · {x.tekst} <span className="muted">({x.av})</span></div>)}</details>}
      </div>
      <div className="card"><h2>Brannsikringsinstallasjoner</h2>
        {I.sys.length ? <div className="list">{I.sys.map(x => <div key={x.a.id} className="li" style={{ cursor: 'default' }}><div className="grow"><div className="lt">{aNavn(x.a.id)}</div><div className="ls">Ansvar: {x.ansvar} · sist kontrollert {x.sist ? fd(x.sist) : '–'}</div></div></div>)}</div> : <p className="small muted">Ingen systemer med fagområde «Brann» registrert. Legg dem inn under Systemer og komponenter.</p>}
        <p className="small muted" style={{ marginBottom: 0 }}>Kontroll og vedlikehold følges opp i kontrollplanen (FOB § 5). Brannkomponenter som er plassert på tegning innenfor en leietakers areal, listes i pakken til den leietakeren.</p>
      </div>
    </div>
    <div className="sec"><div className="toolbar"><h2 style={{ margin: 0, flex: 1 }}>Informasjon til leietakerne</h2>
      {ed && <><button className="btn sm" onClick={() => midlertidig(eid)}>Varsle om redusert brannsikkerhet</button><button className="btn sm pri" disabled={!v} onClick={() => sendTilAlle(eid)}>Send til alle som mangler</button></>}</div>
      {L.length ? <div className="tbl-wrap"><table><thead><tr><th>Leietaker</th><th>Status</th><th>Brannvernansvarlig</th><th>Samordningsavtale</th><th>Siste brannøvelse</th><th /></tr></thead><tbody>
        {L.map(l => { const s = bvStatus(l); const a = binfo(l).ansvarlig; return <tr key={l.id}>
          <td><a href={'#/leietaker/' + l.id}>{l.navn}</a>{l.lokale && <div className="small muted">{l.lokale}</div>}</td>
          <td><Chip c={s.c}>{s.t}</Chip>{s.hint && <div className="small muted">{s.hint}</div>}</td>
          <td className="small">{a?.navn ? <>{a.navn}{a.tlf ? ', ' + a.tlf : ''}{a.stedfortreder && <div className="muted">Stedfortreder: {a.stedfortreder}</div>}</> : l.brannvernleder || <Chip c="amber">Ikke meldt</Chip>}</td>
          <td>{samordning(l) ? <Chip c="green">Registrert</Chip> : <Chip c="amber">Mangler</Chip>}</td>
          <td className="small">{ovelse(l) ? fd(ovelse(l)) : '–'}</td>
          <td style={{ whiteSpace: 'nowrap' }}>{ed && <>{v > 0 && <button className="btn sm" onClick={() => sendPakke(l.id)}>Send</button>}<button className="btn sm" onClick={() => forhandsvis(l.id)}>PDF</button><button className="btn sm" onClick={() => registrerKvittering(l.id)} title="Registrer signert papir eller bekreftelse på e-post">Registrer bekreftelse</button><button className="btn sm" onClick={() => editAnsvarlig(l.id)}>Ansvarlig</button></>}<button className="btn sm ghost" onClick={() => kvitteringer(l)}>Historikk</button></td>
        </tr>; })}</tbody></table></div> : <div className="tbl-wrap"><Empty t="Ingen leietakere">Legg til leietakere på eiendommen.</Empty></div>}
    </div>
    <div className="sec"><div className="toolbar"><h2 style={{ margin: 0, flex: 1 }}>Samordning (FOB § 4)</h2>{ed && !felles && <button className="btn sm" onClick={() => editOppgave(undefined, { eiendomId: eid, navn: 'Felles brannøvelse og samordningsmøte med leietakerne', kategori: 'Brann', type: 'Lovpålagt', ansvar: 'Eier', intervall: { n: 1, enhet: 'år' }, nesteFrist: addDays(today(), 60), hjemmel: 'Forskrift om brannforebygging § 4 (samordning), §§ 11–12; internkontrollforskriften § 6', notat: 'Gjennomgå alarmorganisering, rømningsveier og oppstillingsplass. Avklar ansvar ved brannalarm, felles evakuering og kontaktpersoner. Før deltakerliste og læringspunkter.' })}>+ Planlegg felles brannøvelse</button>}</div>
      <p className="small muted" style={{ marginTop: -6 }}>Når flere virksomheter leier i samme bygg, må brannvernet samordnes: én felles alarmorganisering, kjente kontaktpersoner hos hver leietaker, skriftlig samordningsavtale og gjerne felles øvelse.</p>
      <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
        <li>Brannvernansvarlig meldt: <b>{L.filter(l => !mangelAnsvarlig(l)).length} av {L.length}</b></li>
        <li>Samordningsavtale registrert: <b>{L.filter(samordning).length} av {L.length}</b></li>
        <li>Felles brannøvelse/samordningsmøte i kontrollplanen: {felles ? <b>neste {fd(felles.nesteFrist)}</b> : <Chip c="amber">ikke planlagt</Chip>}</li>
      </ul>
    </div>
    {midl.some((m: Rec) => m.avsluttet) && <div className="sec"><a href="#" className="small" onClick={ev => { ev.preventDefault(); setVisAvsl(!visAvsl); }}>{visAvsl ? 'Skjul' : 'Vis'} avsluttede midlertidige tiltak ({midl.filter((m: Rec) => m.avsluttet).length})</a>
      {visAvsl && <ul className="small">{midl.filter((m: Rec) => m.avsluttet).map((m: Rec) => <li key={m.id}>{fd(m.fra)}–{fd(m.avsluttet)}: {m.tekst}{m.avvikId && byId('avvik', m.avvikId) ? <> · <a href="#" onClick={ev => { ev.preventDefault(); editAvvik(m.avvikId); }}>avvik #{byId('avvik', m.avvikId)!.nr}</a></> : null}</li>)}</ul>}</div>}
  </>;
}

// ---------------- kort på leietakersiden
export function BrannvernKort({ l }: { l: Rec }) {
  const s = bvStatus(l); const e = byId('eiendommer', l.eiendomId); const v = bvVersjon(e); const k = sisteKvittering(l); const a = binfo(l).ansvarlig;
  return <div className="sec"><div className="toolbar"><h2 style={{ margin: 0, flex: 1 }}>Brannverninformasjon<Hjelp id="side.brannvern" /></h2>
    {v > 0 && <button className="btn sm pri" onClick={() => sendPakke(l.id)}>Send brannvernpakke v{v}</button>}<button className="btn sm" onClick={() => forhandsvis(l.id)}>Last ned PDF</button><button className="btn sm" onClick={() => registrerKvittering(l.id)}>Registrer bekreftelse</button><button className="btn sm" onClick={() => editAnsvarlig(l.id)}>Brannvernansvarlig</button><button className="btn sm ghost" onClick={() => kvitteringer(l)}>Historikk</button></div>
    <div className="card"><dl className="dl"><dt>Status</dt><dd><Chip c={s.c}>{s.t}</Chip>{s.hint && <span className="small muted"> {s.hint}</span>}</dd>
      <dt>Sist bekreftet</dt><dd>{k ? `v${k.versjon} ${fd(k.tid)} – ${k.navn || ''} (${k.form || ''})` : '–'}</dd>
      <dt>Brannvernansvarlig</dt><dd>{a?.navn ? [a.navn, a.tlf, a.epost].filter(Boolean).join(' · ') + (a.stedfortreder ? ' · stedfortreder ' + a.stedfortreder : '') : l.brannvernleder || <Chip c="amber">Ikke meldt</Chip>}</dd></dl>
      <p className="small muted" style={{ marginBottom: 0 }}>Brannkortet og utsending til alle leietakere finner du på eiendommen under fanen <a href={'#/eiendom/' + l.eiendomId}>Brannvern</a>.</p></div></div>;
}

// ---------------- leietakerportalen
async function rpc(fn: string, args: Record<string, any>) { const { error } = await sb.rpc(fn, args); if (error) { toast(feiltekst(error)); return false; } return true; }
export function PortalBrannvern({ l, refresh }: { l: Rec; refresh: () => Promise<void> }) {
  const e = byId('eiendommer', l.eiendomId) || ({} as Rec); const b = bv(e); const v = bvVersjon(e); const s = bvStatus(l); const a = binfo(l).ansvarlig;
  const pakke = sortBy(S.dokumenter.filter(d => d.leietakerId === l.id && d.type === DOKTYPE_PAKKE && d.brannVersjon), d => +d.brannVersjon).pop();
  const midl = aktiveMidl(e);
  const bekreft = () => formModal({
    title: `Bekreft brannverninformasjon v${v}`, saveTxt: 'Bekreft',
    top: <p className="small muted" style={{ marginTop: 0 }}>Ved å bekrefte sier dere at virksomheten har mottatt og lest brannverninformasjonen for {e.navn}, og at innholdet er gjort kjent for de ansatte. Utleier har plikt til å kunne dokumentere dette (forskrift om brannforebygging §§ 4 og 10).</p>,
    fields: [{ k: 'navn', label: 'Navn', req: true, def: state.me?.navn || '' }, { k: 'komm', label: 'Kommentar (valgfritt)', type: 'textarea', ph: 'F.eks. gjennomgått på personalmøte 12.11.' }],
    onSave: async x => { if (!await rpc('bekreft_brannvern', { p_versjon: v, p_navn: x.navn, p_kommentar: x.komm || '' })) return false; await refresh(); toast('Takk – bekreftelsen er sendt til utleier'); },
  });
  const ansvarlig = () => formModal({
    title: 'Meld brannvernansvarlig', saveTxt: 'Send til utleier',
    top: <p className="small muted" style={{ marginTop: 0 }}>Virksomheten skal ha en som har ansvaret for brannsikkerheten i lokalene, og utleier må vite hvem det er for å kunne samordne brannvernet i bygget.</p>,
    fields: [{ k: 'navn', label: 'Navn', req: true, def: a?.navn || '' }, { k: 'tlf', label: 'Telefon', half: true, def: a?.tlf || '' }, { k: 'epost', label: 'E-post', type: 'email', half: true, def: a?.epost || '' }, { k: 'stedfortreder', label: 'Stedfortreder', def: a?.stedfortreder || '' }],
    onSave: async x => { if (!await rpc('oppdater_brannvernansvarlig', { p_navn: x.navn, p_tlf: x.tlf || '', p_epost: x.epost || '', p_stedfortreder: x.stedfortreder || '' })) return false; await refresh(); toast('Brannvernansvarlig er oppdatert'); },
  });
  return <>
    {midl.map((m: Rec) => { const lest = binfo(l).midlLest?.[m.id]; return <div key={m.id} className="banner" style={{ background: 'var(--redbg)', color: 'var(--red)', borderColor: '#f3c1bb', display: 'flex', gap: 10, alignItems: 'center', marginTop: 12 }}>
      <div style={{ flex: 1 }}><b>Redusert brannsikkerhet:</b> {m.tekst}{m.tiltak && <><br /><b>Dette må dere gjøre:</b> {m.tiltak}</>}<div className="small">Fra {fd(m.fra)}{m.til ? ', forventet til ' + fd(m.til) : ''}</div></div>
      {lest ? <span className="small">Lest {fd(lest.tid)}</span> : <button className="btn sm pri" onClick={async () => { if (await rpc('bekreft_brann_midlertidig', { p_id: m.id })) { await refresh(); toast('Takk'); } }}>Vi har lest dette</button>}</div>; })}
    <div className="sec"><h2>Brannsikkerhet i bygget<Hjelp id="side.brannvern" /></h2>
      {!v ? <div className="card"><p className="muted small" style={{ margin: 0 }}>Utleier har ikke publisert brannverninformasjon for bygget ennå.</p></div> :
        <div className="grid g2">
          <div className="card"><div className="toolbar" style={{ marginBottom: 6 }}><h3 style={{ margin: 0, flex: 1 }}>Brannverninformasjon v{v}</h3><Chip c={s.c}>{s.t}</Chip></div>
            <dl className="dl">{([['Alarm', b.alarm], ['Oppstillingsplass', b.oppstilling], ['Brannsentral', b.brannsentral], ['Utleiers kontakt', [b.eierAnsvarlig, b.eierTlf].filter(Boolean).join(', ')]] as [string, string][]).filter(x => x[1]).map(([k, x]) => <React.Fragment key={k}><dt>{k}</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{x}</dd></React.Fragment>)}</dl>
            {b.forutsetninger && <><h3>Forutsetninger for bruk</h3><p className="small" style={{ whiteSpace: 'pre-wrap' }}>{b.forutsetninger}</p></>}
            <p style={{ marginBottom: 0, display: 'flex', gap: 8, flexWrap: 'wrap' }}>{pakke?.fil && <FileLink fil={pakke.fil}>Les hele brannvernpakken (PDF)</FileLink>}{s.o >= 1 && (+pakke?.brannVersjon === v ? <button className="btn sm pri" onClick={bekreft}>Bekreft at vi har lest og informert de ansatte</button> : <span className="small muted">Utleier sender dere oppdatert brannvernpakke (v{v}) – da kan dere bekrefte her.</span>)}</p></div>
          <div className="card"><h3 style={{ marginTop: 0 }}>Deres brannvernansvarlige</h3>
            {a?.navn || l.brannvernleder ? <p className="small">{a?.navn ? [a.navn, a.tlf, a.epost].filter(Boolean).join(' · ') : l.brannvernleder}{a?.stedfortreder && <><br />Stedfortreder: {a.stedfortreder}</>}</p> : <p className="small"><Chip c="amber">Ikke meldt</Chip></p>}
            <button className="btn sm" onClick={ansvarlig}>{a?.navn ? 'Endre' : 'Meld inn'}</button>
            <h3>Husregler</h3><ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{String(b.regler || STD_REGLER).split('\n').map(x => x.trim()).filter(Boolean).map((x, i) => <li key={i}>{x}</li>)}</ul></div>
        </div>}
    </div>
  </>;
}

