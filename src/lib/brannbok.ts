// Brannbok: samlet dokumentasjon av brannsikkerheten for én eiendom (forskrift om brannforebygging §§ 4–13).
// Bygges av data som allerede finnes i appen (brannkort, installasjoner, kontrollplan, avvik, leietakere, dokumenter),
// slik at ingenting føres to ganger. Samme modell brukes på eiers side, i lenken til brannvesenet og i PDF-en.
import { S, orgNavn } from './store';
import { byId, sortBy, today, addDays, dUntil, intTxt, aNavn, type Rec } from './utils';
import { tt } from './i18n';
import { AV_LUKKET } from './catalog';
import { bv, bvVersjon, bvStatus, binfo, brannInstallasjoner, klasseTekst, aktiveMidl } from './brannvern';

export type BbStatus = 'ok' | 'folg' | 'mangler' | 'info';
export type BbTabell = { tittel?: string; hode: string[]; rader: string[][] };
export type BbSek = { key: string; tittel: string; hjemmel: string; status: BbStatus; statusTekst: string; tekst?: string; fakta?: [string, string][]; tabeller?: BbTabell[]; punkter?: string[]; vedlegg?: string[] };
export type BbVedlegg = { id: string; navn: string; type: string; path: string; mime?: string; dato?: string };
export type Brannbok = { v: 1; laget: string; eiendom: { id: string; navn: string; eier: string; adresse: string; gnrbnr: string; kontakt: string }; sek: BbSek[]; vedlegg: BbVedlegg[]; pdfPath?: string };

export const STATUS_TEKST: Record<BbStatus, string> = { ok: 'I orden', folg: 'Følg opp', mangler: 'Mangler', info: 'Til orientering' };
const d = (s?: string) => s ? s.slice(0, 10).split('-').reverse().join('.') : '–';
const verst = (...x: BbStatus[]): BbStatus => x.includes('mangler') ? 'mangler' : x.includes('folg') ? 'folg' : x.includes('ok') ? 'ok' : 'info';
const brannAvvik = (a: Rec, sysIds: Set<string>) => a.kilde === 'Brannvesen/tilsyn' || sysIds.has(a.anleggId) || /brann|rømning|nødlys|sprinkl|røykvent|branndør|slokk/i.test(`${a.tittel || ''} ${a.kategori || ''}`);

export function byggBrannbok(eid: string): Brannbok {
  const e = byId('eiendommer', eid)!; const b = bv(e); const v = bvVersjon(e); const L = sortBy(S.leietakere.filter(l => l.eiendomId === eid && !l.arkivert), l => l.navn || '');
  const docs = S.dokumenter.filter(x => x.eiendomId === eid && !x.leietakerId && x.fil?.path);
  const vedlegg: BbVedlegg[] = []; const vedl = (x: Rec) => { if (!x?.fil?.path) return ''; if (!vedlegg.some(y => y.id === x.id)) vedlegg.push({ id: x.id, navn: x.tittel || x.fil.navn, type: x.type || '', path: x.fil.path, mime: x.fil.type, dato: x.dato || x.created_at?.slice(0, 10) }); return x.id; };
  const sek: BbSek[] = [];

  // 1 Organisering og ansvar
  const ltRader = L.map(l => { const a = binfo(l).ansvarlig; const samo = S.dokumenter.find(x => x.leietakerId === l.id && x.type === 'Samordningsavtale');
    return [l.navn || '', l.lokale || '', a?.navn ? `${a.navn}${a.tlf ? ', ' + a.tlf : ''}` : l.brannvernleder || tt("Mangler"), samo ? tt("Ja") + (samo.dato ? ' (' + d(samo.dato) + ')' : '') : tt("Mangler")]; });
  const manglerAnsv = ltRader.filter(r => r[2] === tt("Mangler")).length, manglerSamo = ltRader.filter(r => r[3] === tt("Mangler")).length;
  const harKontakt = !!(b.eierAnsvarlig || '').trim();
  sek.push({ key: 'org', tittel: tt("Organisering og ansvar"), hjemmel: 'FOB §§ 4 og 9',
    status: !harKontakt ? 'mangler' : (manglerAnsv || manglerSamo) ? 'folg' : 'ok',
    statusTekst: !harKontakt ? tt("Eiers kontaktperson for brannsikkerhet er ikke registrert") : (manglerAnsv || manglerSamo) ? tt("{0} leietakere mangler brannvernansvarlig, {1} mangler samordningsavtale", manglerAnsv, manglerSamo) : tt("Ansvar og samordning er dokumentert"),
    fakta: [[tt("Eier"), orgNavn(e.eierOrgId) || ''], [tt("Eiers kontaktperson"), [b.eierAnsvarlig, b.eierTlf].filter(Boolean).join(', ') || tt("Mangler")], [tt("Antall leietakere"), String(L.length)]],
    tabeller: L.length ? [{ tittel: tt("Leietakere og samordning"), hode: [tt("Leietaker"), tt("Lokale"), tt("Brannvernansvarlig"), tt("Samordningsavtale")], rader: ltRader }] : [],
    vedlegg: S.dokumenter.filter(x => x.eiendomId === eid && x.type === 'Samordningsavtale' && x.fil?.path).map(vedl).filter(Boolean) });

  // 2 Byggets brannsikkerhet
  const konsept = docs.filter(x => x.type === 'Brannkonsept/brannteknisk dokumentasjon'); const tegn = [...docs.filter(x => x.type === 'Branntegninger/rømningsplaner'), ...(b.vedlegg || []).map((id: string) => byId('dokumenter', id)).filter((x: Rec) => x?.fil?.path && x.type !== 'Branntegninger/rømningsplaner')];
  const aar = +e.byggeaar || 0; const gammel = aar && aar < 1985;
  const mByg: string[] = []; if (!konsept.length) mByg.push(tt("brannkonsept")); if (!(b.alarm || '').trim()) mByg.push(tt("alarmorganisering")); if (!(b.oppstilling || '').trim()) mByg.push(tt("oppstillingsplass")); if (!tegn.length) mByg.push(tt("rømningsplaner"));
  sek.push({ key: 'bygg', tittel: tt("Byggets brannsikkerhet"), hjemmel: 'FOB §§ 4 og 8, TEK17 kap. 11',
    status: mByg.length > 1 || !konsept.length ? 'mangler' : (mByg.length || !v) ? 'folg' : 'ok',
    statusTekst: mByg.length ? tt("Mangler: {0}", mByg.join(', ')) : !v ? tt("Brannkortet er ikke publisert til leietakerne") : tt("Brannkonsept, brannkort og rømningsplaner foreligger"),
    fakta: [[tt("Risikoklasse og brannklasse"), klasseTekst(e) || tt("Ikke registrert")], [tt("Særskilt brannobjekt"), b.saerskilt ? tt("Ja") + (b.saerskiltKat ? ' – ' + b.saerskiltKat : '') : tt("Nei")], [tt("Byggeår"), aar ? String(aar) : '–'],
      [tt("Alarmorganisering"), b.alarm || tt("Mangler")], [tt("Brannsentral / nøkkelboks"), b.brannsentral || '–'], [tt("Oppstillingsplass"), b.oppstilling || tt("Mangler")], [tt("Brannkort"), v ? tt("Versjon {0}, {1}", v, d(b.versjonDato)) : tt("Ikke publisert")]],
    tekst: b.forutsetninger ? `${tt("Forutsetninger for bruk:")} ${b.forutsetninger}` : undefined,
    punkter: gammel ? [tt("Bygget er fra {0}. Eier skal vurdere oppgradering til minst nivået i byggeforskriftene 1985 (FOB § 8).", aar)] : undefined,
    vedlegg: [...konsept, ...tegn].map(vedl).filter(Boolean) });

  // 3 Brannsikringsinstallasjoner
  const I = brannInstallasjoner(eid); const sysIds = new Set(I.sys.map(x => x.a.id));
  const nesteFor = (aid: string) => sortBy(S.oppgaver.filter(o => o.anleggId === aid && o.aktiv !== false && o.nesteFrist), o => o.nesteFrist)[0];
  const instRader = I.sys.map(x => { const n = nesteFor(x.a.id); const dd = n ? dUntil(n.nesteFrist) : null; return [aNavn(x.a.id), tt(x.ansvar), d(x.sist), n ? d(n.nesteFrist) + (dd != null && dd < 0 ? ' (' + tt("forfalt") + ')' : '') : tt("Ingen kontroll planlagt"), n?.utfores || '']; });
  const utenKontroll = instRader.filter(r => r[3] === tt("Ingen kontroll planlagt")).length; const forfaltInst = instRader.filter(r => r[3].includes(tt("forfalt"))).length;
  sek.push({ key: 'inst', tittel: tt("Brannsikringsinstallasjoner"), hjemmel: 'FOB § 5',
    status: !I.sys.length ? 'mangler' : (utenKontroll || forfaltInst) ? 'folg' : 'ok',
    statusTekst: !I.sys.length ? tt("Ingen brannsikringsinstallasjoner er registrert") : (utenKontroll || forfaltInst) ? tt("{0} uten planlagt kontroll, {1} med forfalt kontroll", utenKontroll, forfaltInst) : tt("{0} installasjoner med planlagt kontroll", I.sys.length),
    tabeller: I.sys.length ? [{ hode: [tt("Installasjon"), tt("Ansvar"), tt("Siste kontroll"), tt("Neste kontroll"), tt("Utføres av")], rader: instRader }] : [] });

  // 4 Kontroll og vedlikehold
  const kontroller = sortBy(S.oppgaver.filter(o => o.eiendomId === eid && o.aktiv !== false && (o.kategori === 'Brann' || sysIds.has(o.anleggId)) && o.malKey !== 'fyring'), o => o.nesteFrist || '9');
  const kRader = kontroller.map(o => { const h = (o.historikk || [])[0]; const dd = dUntil(o.nesteFrist); return [o.navn || '', intTxt(o.intervall), o.hjemmel || '', h ? `${d(h.dato)}${h.res ? ' – ' + h.res : ''}` : tt("Ikke utført"), d(o.nesteFrist), dd == null ? '–' : dd < 0 ? tt("Forfalt") : dd <= 30 ? tt("Snart") : tt("OK")]; });
  const forfalt = kRader.filter(r => r[5] === tt("Forfalt")).length;
  sek.push({ key: 'kontroll', tittel: tt("Kontroll og vedlikehold"), hjemmel: 'FOB §§ 5 og 9',
    status: !kontroller.length ? 'mangler' : forfalt ? 'folg' : 'ok',
    statusTekst: !kontroller.length ? tt("Ingen brannkontroller i kontrollplanen") : forfalt ? tt("{0} av {1} kontroller er forfalt", forfalt, kontroller.length) : tt("{0} kontroller, ingen forfalt", kontroller.length),
    tabeller: kontroller.length ? [{ hode: [tt("Kontroll"), tt("Intervall"), tt("Hjemmel"), tt("Sist utført"), tt("Neste frist"), tt("Status")], rader: kRader }] : [] });

  // 5 Avvik, tilsyn og redusert brannsikkerhet
  const av = sortBy(S.avvik.filter(a => a.eiendomId === eid && !AV_LUKKET.includes(a.status) && brannAvvik(a, sysIds)), a => a.frist || '9');
  const avForfalt = av.filter(a => a.frist && (dUntil(a.frist) as number) < 0).length; const krit = av.filter(a => a.alv === 'Kritisk').length;
  const midl = aktiveMidl(e); const tilsyn = sortBy(docs.filter(x => x.type === 'Tilsynsrapport'), x => x.dato || '').reverse().slice(0, 3);
  const nylig = S.avvik.filter(a => a.eiendomId === eid && AV_LUKKET.includes(a.status) && a.kilde === 'Brannvesen/tilsyn' && (a.lukket || a.updated_at || '').slice(0, 10) >= addDays(today(), -730));
  sek.push({ key: 'avvik', tittel: tt("Avvik, tilsyn og redusert brannsikkerhet"), hjemmel: 'FOB §§ 9 og 11',
    status: (avForfalt || krit || midl.length) ? 'mangler' : av.length ? 'folg' : 'ok',
    statusTekst: midl.length ? tt("Redusert brannsikkerhet pågår") : av.length ? tt("{0} åpne brannavvik ({1} med passert frist)", av.length, avForfalt) : tt("Ingen åpne brannavvik"),
    tabeller: [...(midl.length ? [{ tittel: tt("Pågående redusert brannsikkerhet"), hode: [tt("Fra"), tt("Til"), tt("Beskrivelse"), tt("Kompenserende tiltak")], rader: midl.map((m: Rec) => [d(m.fra), m.til ? d(m.til) : tt("Til videre"), m.tekst || '', m.tiltak || '']) }] : []),
      ...(av.length ? [{ tittel: tt("Åpne avvik"), hode: [tt("Nr"), tt("Avvik"), tt("Kilde"), tt("Alvorlighet"), tt("Status"), tt("Frist")], rader: av.map(a => [String(a.nr || ''), a.tittel || '', tt(a.kilde || ''), tt(a.alv || ''), tt(a.status || ''), d(a.frist)]) }] : []),
      ...(nylig.length ? [{ tittel: tt("Lukkede avvik fra brannvesenets tilsyn (siste 2 år)"), hode: [tt("Nr"), tt("Avvik"), tt("Lukket")], rader: nylig.map(a => [String(a.nr || ''), a.tittel || '', d(a.lukket || a.updated_at)]) }] : [])],
    vedlegg: tilsyn.map(vedl).filter(Boolean) });

  // 6 Leietakernes brannvern
  const ltS = L.map(l => { const s = bvStatus(l); const ov = (l.plikter || []).find((p: Rec) => p.key === 'brannovelse')?.sist; const ik = (l.plikter || []).filter((p: Rec) => !p.ikkeRelevant && /brann|romm/.test(p.key || '')); const ikOk = ik.filter((p: Rec) => p.sist && p.sist >= addDays(today(), -365)).length;
    return { s, rad: [l.navn || '', tt(s.t), ov ? d(ov) : tt("Ikke registrert"), ik.length ? `${ikOk}/${ik.length}` : '–'], ovGammel: !ov || ov < addDays(today(), -365) }; });
  const ikkeInf = ltS.filter(x => x.s.o >= 2).length, folgL = ltS.filter(x => x.s.o >= 1 || x.ovGammel).length;
  sek.push({ key: 'leietakere', tittel: tt("Leietakernes brannvern"), hjemmel: 'FOB §§ 11–13',
    status: !L.length ? 'info' : ikkeInf ? 'mangler' : folgL ? 'folg' : 'ok',
    statusTekst: !L.length ? tt("Ingen leietakere registrert") : ikkeInf ? tt("{0} leietakere har ikke fått brannverninformasjonen", ikkeInf) : folgL ? tt("{0} leietakere må følges opp (bekreftelse eller brannøvelse)", folgL) : tt("Alle leietakere er informert og har øvd siste år"),
    tabeller: L.length ? [{ hode: [tt("Leietaker"), tt("Brannverninformasjon"), tt("Siste brannøvelse"), tt("Brannplikter dokumentert siste år")], rader: ltS.map(x => x.rad) }] : [] });

  // 7 Fyringsanlegg
  const fyr = S.oppgaver.filter(o => o.eiendomId === eid && o.aktiv !== false && o.malKey === 'fyring');
  if (fyr.length || S.anlegg.some(a => a.eiendomId === eid && !a.arkivert && a.type === 'kjel')) {
    const fr = fyr.map(o => { const h = (o.historikk || [])[0]; return [o.navn || '', h ? d(h.dato) : tt("Ikke utført"), d(o.nesteFrist), (dUntil(o.nesteFrist) as number) < 0 ? tt("Forfalt") : tt("OK")]; });
    sek.push({ key: 'fyring', tittel: tt("Fyringsanlegg"), hjemmel: 'FOB § 6', status: !fyr.length ? 'mangler' : fr.some(r => r[3] === tt("Forfalt")) ? 'folg' : 'ok',
      statusTekst: !fyr.length ? tt("Fyringsanlegg er registrert, men uten kontroll i kontrollplanen") : tt("{0} kontroller av fyringsanlegg", fyr.length),
      tabeller: fr.length ? [{ hode: [tt("Kontroll"), tt("Sist utført"), tt("Neste frist"), tt("Status")], rader: fr }] : [] });
  }

  // 8 Årlig gjennomgang og endringer
  const G = sortBy((b.gjennomgang || []) as Rec[], g => g.dato).reverse(); const sist = G[0];
  sek.push({ key: 'gjennomgang', tittel: tt("Årlig gjennomgang og endringer"), hjemmel: 'FOB § 9',
    status: !sist ? 'mangler' : sist.dato < addDays(today(), -365) ? 'folg' : 'ok',
    statusTekst: !sist ? tt("Ingen gjennomgang av brannsikkerheten er registrert") : tt("Sist gjennomgått {0} av {1}", d(sist.dato), sist.av || '?'),
    tabeller: [...(G.length ? [{ tittel: tt("Gjennomganger"), hode: [tt("Dato"), tt("Utført av"), tt("Merknad")], rader: G.slice(0, 10).map(g => [d(g.dato), g.av || '', g.merknad || '']) }] : []),
      ...((b.logg || []).length ? [{ tittel: tt("Versjoner av brannkortet"), hode: [tt("Versjon"), tt("Dato"), tt("Endring")], rader: (b.logg as Rec[]).slice().reverse().slice(0, 10).map(x => ['v' + x.versjon, d(x.tid), x.tekst || '']) }] : [])] });

  const adr = [e.adresse, [e.postnr, e.poststed].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return { v: 1, laget: new Date().toISOString(), eiendom: { id: eid, navn: e.navn || '', eier: orgNavn(e.eierOrgId) || '', adresse: adr, gnrbnr: e.gnr || e.bnr ? `${e.gnr || '?'}/${e.bnr || '?'}` : '', kontakt: [b.eierAnsvarlig, b.eierTlf].filter(Boolean).join(', ') }, sek, vedlegg };
}
export const samletStatus = (bb: Brannbok) => verst(...bb.sek.map(s => s.status));

export type BbMerknad = { id: string; seksjon: string; tid: string; tekst: string; navn: string; etat?: string; status: string; svar?: string; svarAv?: string; svarTid?: string };

/** PDF av brannboken i felles dokumentmal. Vedlegg (PDF og bilder) kan legges bakerst. */
export async function brannbokPdf(bb: Brannbok, opt: { merknader?: BbMerknad[]; vedlegg?: (v: BbVedlegg) => Promise<ArrayBuffer | null> } = {}): Promise<Uint8Array> {
  const { ArkivDoc } = await import('./prosjektArkiv'); const { Doc, profilFor, M, RED, MUTED, INK } = await import('./arealRapport') as any;
  const { PDFDocument, rgb } = await import('pdf-lib');
  const D: any = Object.assign(new ArkivDoc(), await Doc.ny(`${tt("Brannbok")} – ${bb.eiendom.navn}`)); (D.pdf as any).__doc = D; D.profil = profilFor(bb.eiendom.id, tt("Brannbok")); D.nyside();
  const farge: Record<BbStatus, any> = { ok: rgb(0.17, 0.45, 0.3), folg: rgb(0.72, 0.5, 0.1), mangler: RED, info: MUTED };
  D.tittelSerif(tt("Brannbok"), 22); D.t(tt("Dokumentasjon av brannsikkerheten etter forskrift om brannforebygging"), M, D.y - 4, 9.5, MUTED); D.y -= 22;
  D.faktaPar([tt("Eiendom"), [[tt("Navn"), bb.eiendom.navn], [tt("Adresse"), bb.eiendom.adresse], [tt("Gnr./bnr."), bb.eiendom.gnrbnr], [tt("Eier"), bb.eiendom.eier]]],
    [tt("Brannboken"), [[tt("Utarbeidet"), d(bb.laget)], [tt("Kontaktperson"), bb.eiendom.kontakt], [tt("Samlet status"), tt(STATUS_TEKST[samletStatus(bb)])]]]);
  D.h2(tt("Status per kapittel"));
  D.tab([[tt("Kapittel"), 2.2], [tt("Hjemmel"), 1.4], [tt("Status"), 1], [tt("Kommentar"), 3.6]], bb.sek.map((s, i) => ({ c: [`${i + 1}. ${s.tittel}`, s.hjemmel, tt(STATUS_TEKST[s.status]), s.statusTekst] })));
  const M0 = opt.merknader || [];
  bb.sek.forEach((s, i) => {
    D.h2(`${i + 1}. ${s.tittel}`);
    D.plass(18); D.page.drawCircle({ x: M + 4, y: D.y - 6, size: 3.2, color: farge[s.status] }); D.t(`${tt(STATUS_TEKST[s.status])} – ${s.statusTekst}`, M + 12, D.y - 9, 9, INK, true); D.t(s.hjemmel, D.page.getWidth() - M - D.w(s.hjemmel, 8), D.y - 9, 8, MUTED); D.y -= 18;
    if (s.fakta?.length) D.kv(s.fakta);
    if (s.tekst) D.tekst(s.tekst, 9, INK);
    (s.punkter || []).forEach(p => D.tekst('• ' + p, 9, INK));
    (s.tabeller || []).forEach(t => { if (t.tittel) { D.plass(20); D.t(t.tittel, M, D.y - 10, 9, MUTED, true); D.y -= 16; } D.tab(t.hode.map(h => [h, 1]), t.rader.map(r => ({ c: r }))); });
    const ved = (s.vedlegg || []).map(id => bb.vedlegg.find(v => v.id === id)).filter(Boolean) as BbVedlegg[];
    if (ved.length) D.tekst(`${tt("Vedlegg:")} ${ved.map(v => v.navn).join(', ')}`, 8.5, MUTED);
    const mk = M0.filter(m => m.seksjon === s.key); if (mk.length) { D.plass(20); D.t(tt("Merknader fra brannvesenet"), M, D.y - 10, 9, MUTED, true); D.y -= 16; mk.forEach(m => { D.tekst(`${d(m.tid)} ${m.navn}${m.etat ? ' (' + m.etat + ')' : ''}: ${m.tekst}`, 9, INK); if (m.svar) D.tekst(`${tt("Svar fra eier")} (${d(m.svarTid)}): ${m.svar}`, 9, MUTED); }); }
  });
  const sam = M0.filter(m => m.seksjon === 'samlet'); if (sam.length) { D.h2(tt("Samlede merknader fra brannvesenet")); sam.forEach(m => { D.tekst(`${d(m.tid)} ${m.navn}${m.etat ? ' (' + m.etat + ')' : ''}: ${m.tekst}`, 9, INK); if (m.svar) D.tekst(`${tt("Svar fra eier")} (${d(m.svarTid)}): ${m.svar}`, 9, MUTED); }); }
  if (bb.vedlegg.length) { D.h2(tt("Vedlegg")); D.tab([[tt("Dokument"), 3], [tt("Type"), 2], [tt("Dato"), 1]], bb.vedlegg.map(v => ({ c: [v.navn, tt(v.type), d(v.dato)] }))); }
  if (opt.vedlegg) for (const v of bb.vedlegg) { const buf = await opt.vedlegg(v).catch(() => null); if (!buf) continue;
    try { if (/pdf/i.test(v.mime || '') || /\.pdf$/i.test(v.path)) { const src = await PDFDocument.load(buf, { ignoreEncryption: true }); (await D.pdf.copyPages(src, src.getPageIndices())).forEach((p: any) => D.pdf.addPage(p)); }
      else if (/\.(jpe?g|png)$/i.test(v.path)) { const img = /\.png$/i.test(v.path) ? await D.pdf.embedPng(buf) : await D.pdf.embedJpg(buf); D.nyside(img.width > img.height); const pg = D.page; D.t(`${tt("Vedlegg")}: ${v.navn}`, M, D.y - 10, 10, INK, true); const W = pg.getWidth() - 2 * M, H = D.y - 26 - 46; const sk = Math.min(W / img.width, H / img.height); pg.drawImage(img, { x: M + (W - img.width * sk) / 2, y: 46 + (H - img.height * sk) / 2, width: img.width * sk, height: img.height * sk }); }
    } catch (err) { console.error('vedlegg', v.navn, err); } }
  return await D.pdf.save() as Uint8Array;
}
