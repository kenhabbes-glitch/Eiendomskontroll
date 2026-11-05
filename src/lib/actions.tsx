// Skjemaer og handlinger (opprett/rediger/slett) som brukes fra flere visninger.
import { Hjelp } from '../components/Hjelp';
import React, { useState } from 'react';
import { SERVICEAVTALE, TG_DEF, KG_DEF, NS_DOK } from './catalog';
import { levetidRef, midt, spenn } from './ns3451';
import { MALER, KOMP, TFM_DEF, NS3451, TFM_KODER, PROP_MALER, KATEGORIER, KATS, TYPER, ENH, AV_ALV, AV_STATUS, AV_KILDE, AV_FRIST, AV_LUKKET, DOK_TYPER, PLIKTER, STD_PLIKTER } from './catalog';
import { S, save, removeDoc, toast, uploadFile, deleteFile, canEdit, isStaff, state, sb, useStore, kanRedigereE, kanDrifteE, mineOrg, oppdaterNiva } from './store';
import { leieAreal, m2, FELLES_AVTALE } from './utils';
import { TgKgVelger, tgAvviker, tgTekst } from '../components/TgKg';
import { PosVelger, BildeVelger, VedleggGalleri } from '../components/PosVelger';
import { ServiceHistorikk } from '../views/Servicehistorikk';
import { alleSjekkmaler } from '../views/Sjekkmaler';
import { sysSjekkFor, sysSjekkAvvik } from './komponentsjekk';
import { SysSjekkVelger, SysSjekkKort } from '../components/SysSjekk';
import { alleMaler, finnMal, kopi, kontraktKey, fordeling, pliktKeysFor, OMR, ANS_VALG } from './kontrakt';
import { YEAR, beregnetAar, kostJustert, kpiFor, kpiInnst, knok, nok, kostNaa, compYear, egetAar, naaverdi, renteInnst, standardTagger, taggerFor } from './utils';
import { ikDekning } from './utils';
import { addDays, addInt, aNavn, byId, eNavn, fd, intTxt, kNavn, lNavn, nextKompLop, nextSysLop, openAvvik, pad, pliktStatus, sortBy, taskFromMal, tfmSys, today, activeTasks, dUntil, saStatus, type Rec } from './utils';
import { AdresseSok, EnhetSok } from '../components/Oppslag';
import { openPlan, plasserteFor } from '../views/Arealer';
import { AoPanel, HendelseListe, aoSnapshot } from './arbeidsordre';
import { adresseFelter, brregData, enhetStatus, seEiendomUrl, virksomhetFraNaering, rensOrgnr } from './oppslag';
import { confirmBox, formModal, showModal, openModal, copyText, FileLink, StChip, DueChip, TaggChips, TaggVelger, Chip, type Field } from '../components/ui';

const go = (p: string) => { location.hash = '#/' + p; };
const eOpts = () => sortBy(S.eiendommer, e => e.navn).map(e => [e.id, e.navn] as [string, string]);
// Eiendommer brukeren kan redigere (for skjema som oppretter nye poster)
const eOptsDrift = () => sortBy(S.eiendommer.filter(e => kanDrifteE(e.id)), e => e.navn).map(e => [e.id, e.navn] as [string, string]);
const eOptsSkriv = () => sortBy(S.eiendommer.filter(e => kanRedigereE(e.id)), e => e.navn).map(e => [e.id, e.navn] as [string, string]);
export const UTBEDRER: [string, string][] = [['Eier', 'Eier / drift'], ['Leietaker', 'Leietaker'], ['Felles', 'Felles (eier og leietaker)'], ['Leverandør/entreprenør', 'Serviceselskap / leverandør']];
const TG_OPTS: [string, string][] = [['', 'Ikke vurdert'], ...TG_DEF.map(t => [t[0], `${t[0]} – ${t[1].toLowerCase()}`] as [string, string])];
// Felles felt for tilstandsvurdering etter NS 3424 (system og komponent)
const tgFelt = (): Field[] => [
  { k: 'tg', label: 'Tilstandsgrad (NS 3424)', type: 'select', options: TG_OPTS, half: true },
  { k: 'tgdato', label: 'Tilstand vurdert dato', type: 'date', half: true },
  { k: 'tgInfo', type: 'custom', render: v => { const d = TG_DEF.find(t => t[0] === v.tg); return d ? <div className="note small" style={{ color: 'var(--ink)', marginTop: -4 }}><b>{d[0]} – {d[1]}:</b> {d[2]}</div> : null; } },
  { k: 'kg', label: 'Konsekvensgrad (KG)', type: 'select', options: [['', '–'], ...KG_DEF.map(k => [k[0], `${k[0]} – ${k[1].toLowerCase()}`] as [string, string])], half: true, show: x => ['TG2', 'TG3', 'TGIU'].includes(x.tg), hint: 'For TG2, TG3 og TGIU: konsekvens for sikkerhet, helse, miljø eller økonomi' },
  { k: 'tgVurdertAv', label: 'Vurdert av', half: true, show: x => !!x.tg, ph: 'Navn / firma' },
  { k: 'tgKomm', label: 'Tilstandsbeskrivelse / begrunnelse', type: 'textarea', show: x => !!x.tg, ph: 'Hva er observert, årsak og anbefalt tiltak' },
  { k: 'tgForslagInfo', type: 'custom', show: x => !!x.tgForslag?.tg, render: (x, set) => { const f = x.tgForslag;
    return <div className="note small" style={{ color: 'var(--ink)', borderColor: 'var(--amber)' }}>
      <b>Forslag til endret tilstand: {tgTekst(f)}</b> <span className="muted">(registrert: {tgTekst(f.fra || { tg: x.tg, kg: x.kg })})</span><br />
      Fra {f.av || 'utførende'}{f.dato ? ' ' + fd(f.dato) : ''}{f.kilde ? ' · ' + f.kilde : ''}{f.komm && <><br /><i>{f.komm}</i></>}
      {canEdit() && <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        <button type="button" className="btn sm pri" onClick={() => set({ tg: f.tg, kg: f.kg || '', tgdato: f.dato || today(), tgVurdertAv: f.av || '', tgKomm: f.komm || x.tgKomm || '', tgForslag: null })}>Godta forslaget</button>
        <button type="button" className="btn sm" onClick={() => set({ tgForslag: null })}>Avvis</button><span className="muted" style={{ alignSelf: 'center' }}>Trykk Lagre for å bekrefte.</span></div>}</div>; } },
];

// ================= EIENDOM =================
export function editEiendom(id?: string) {
  const eierOrg = mineOrg(['admin', 'forvalter']);
  const e = id ? byId('eiendommer', id)! : { eierOrgId: (eierOrg.find(o => o.id === S.primarOrg) || eierOrg.find(o => o.type === 'eier') || eierOrg[0])?.id } as Rec;
  if (!id && !eierOrg.length) { toast('Du må være administrator eller forvalter i en organisasjon for å opprette eiendommer'); return; }
  const kanEie = id ? mineOrg(['admin']).some(o => o.id === e.eierOrgId) : true;
  const fields: Field[] = [
    ...(!id && eierOrg.length > 1 ? [{ k: 'eierOrgId', label: 'Eier (organisasjon)', type: 'select', options: eierOrg.map(o => [o.id, o.navn] as [string, string]), req: true } as Field] : []),
    { k: 'portefoljeId', label: 'Portefølje', type: 'select', options: () => sortBy(S.portefoljer.filter(p => p.eier_org_id === (e.eierOrgId || '')), p => p.navn).map(p => [p.id, p.navn] as [string, string]), empty: '(ingen portefølje)', help: 'portefolje', show: () => S.portefoljer.some(p => p.eier_org_id === e.eierOrgId) || !!id },
    { k: 'sokAdr', type: 'custom', label: 'Hent fra Kartverket', render: (v, set) => <AdresseSok onPick={a => set({ ...adresseFelter(a), navn: v.navn || a.adressetekst })} /> },
    { k: 'navn', label: 'Navn på eiendom/bygg', req: true },
    { k: 'adresse', label: 'Adresse', half: true }, { k: 'poststed', label: 'Postnr. og sted', half: true },
    { k: 'kommune', label: 'Kommune', half: true }, { k: 'gnrbnr', label: 'Gnr./bnr. (/fnr/snr)', half: true, ph: '12/345' },
    { k: 'matInfo', type: 'custom', show: v => !!v.kommunenummer, render: v => <div className="small muted">Kommunenr. {v.kommunenummer}{v.matrikkelSjekket ? ` · hentet fra matrikkelen ${fd(v.matrikkelSjekket)}` : ''}{seEiendomUrl(v) && <> · <a href={seEiendomUrl(v)} target="_blank" rel="noopener noreferrer">Åpne i Se eiendom</a></>}</div> },
    { k: 'tfmBygg', label: 'TFM byggnummer / lokaliseringskode', half: true, mono: true, ph: '01', hint: 'Brukes som +kode foran systemkoden, f.eks. +01=360.001' },
    { k: 'kategori', label: 'Kategori', type: 'select', options: KATEGORIER, half: true, empty: '–' },
    { k: 'bta', label: 'BTA (m²)', type: 'number', half: true }, { k: 'byggeaar', label: 'Byggeår', type: 'number', half: true },
    { k: 'rehabaar', label: 'Sist totalrehabilitert (år)', type: 'number', half: true }, { k: 'etasjer', label: 'Antall etasjer', type: 'number', half: true },
    { k: 'risikoklasse', label: 'Risikoklasse (TEK)', type: 'select', options: ['', '1', '2', '3', '4', '5', '6'], half: true },
    { k: 'brannklasse', label: 'Brannklasse', type: 'select', options: ['', '1', '2', '3', '4'], half: true },
    { k: 'energimerke', label: 'Energikarakter', type: 'select', options: ['', 'A', 'B', 'C', 'D', 'E', 'F', 'G'], half: true },
    { k: 'tilsyn', label: 'Tilsynsobjekt hos brannvesenet', type: 'select', options: ['', 'Ja', 'Nei', 'Ukjent'], half: true },
    { k: 's0', label: 'Eier (hjemmelshaver)', type: 'sec' },
    { k: 'sokEier', type: 'custom', render: (v, set) => <EnhetSok ph="Søk eierselskap (navn eller org.nr.) i Brønnøysund" onPick={async en => { set({ eierNavn: en.navn, eierOrgnr: en.orgnr, eierAdresse: en.adresse || '' }); const b = await brregData(en.orgnr).catch(() => null); if (b) set({ eierBrreg: b }); }} /> },
    { k: 'eierNavn', label: 'Eier / hjemmelshaver', half: true }, { k: 'eierOrgnr', label: 'Eiers org.nr.', half: true, mono: true },
    { k: 'avsenderNavn', label: 'Avsendernavn på e-post', half: true, ph: 'Tom = eier/hjemmelshaver', hint: 'Navnet mottakeren ser når arbeidsordre, kontrolloppdrag og sjekklister sendes for denne eiendommen.' },
    { k: 'eierInfo', type: 'custom', render: v => <div className="small muted">{v.eierBrreg ? <>{[v.eierBrreg.orgform, v.eierBrreg.adresse, v.eierBrreg.dagligLeder ? 'Daglig leder: ' + v.eierBrreg.dagligLeder : '', v.eierBrreg.styreleder ? 'Styreleder: ' + v.eierBrreg.styreleder : ''].filter(Boolean).join(' · ')}. </> : null}
      Tinglyst hjemmelshaver finnes ikke i noe åpent API{seEiendomUrl(v) ? <> – kontroller den i <a href={seEiendomUrl(v)} target="_blank" rel="noopener noreferrer">Se eiendom</a> (innlogging med ID-porten).</> : ' – søk opp adressen over for å få lenke til Se eiendom.'}</div> },
    { k: 's1', label: 'Ansvar og kontakter', type: 'sec' },
    { k: 'driftsansvarlig', label: 'Driftsansvarlig / driftstekniker', half: true }, { k: 'brannansvarlig', label: 'Eiers ansvarlige for brannsikkerhet', half: true },
    { k: 'forsikring', label: 'Forsikringsselskap / polise', half: true }, { k: 'kontaktLeietaker', label: 'Kontakt for leietakere (navn, tlf, e-post)', half: true },
    { k: 'notat', label: 'Notater', type: 'textarea' }];
  formModal({
    title: id ? 'Rediger eiendom' : 'Ny eiendom', fields, values: e,
    extraFoot: close => id && kanEie ? <button className="btn danger" onClick={async () => {
      if (await confirmBox(`Slette «${e.navn}» med ALLE tilknyttede systemer, kontroller, avvik, dokumenter, leietakere og tegninger? Dette kan ikke angres.`)) { await removeDoc('eiendommer', id); close(); go('eiendommer'); }
    }}>Slett</button> : null,
    onSave: async v => {
      delete v.sokAdr; delete v.sokEier; delete v.matInfo; delete v.eierInfo;
      const m = String(v.gnrbnr || '').match(/^\s*(\d+)\s*\/\s*(\d+)(?:\s*\/\s*(\d+))?(?:\s*\/\s*(\d+))?/);
      if (m) Object.assign(v, { gnr: +m[1], bnr: +m[2], fnr: m[3] ? +m[3] : '', snr: m[4] ? +m[4] : '' });
      if (v.eierOrgnr && rensOrgnr(v.eierOrgnr).length === 9 && v.eierBrreg?.orgnr !== rensOrgnr(v.eierOrgnr)) { const b = await brregData(v.eierOrgnr).catch(() => null); if (b) { v.eierBrreg = b; if (!v.eierNavn) v.eierNavn = b.navn; } }
      const nid = await save('eiendommer', { ...e, ...v }); toast('Eiendom lagret'); if (!id) { await oppdaterNiva(); go('eiendom/' + nid); setTimeout(() => generatePlan(nid, true), 300); } },
  });
}

// ================= SYSTEM / BYGNINGSDEL =================

// ---------- Kostnad per m² med areal målt på tegning
const m2Kost = (v: any) => { const a = +String(v.mengde ?? '').replace(',', '.'), p = +String(v.m2pris ?? '').replace(',', '.'), f = +String(v.faktor ?? '1').replace(',', '.') || 1; return a > 0 && p > 0 ? Math.round(a * p * f) : null; };
function m2Patch(k: string, v: any) {
  if (!['mengde', 'm2pris', 'faktor', 'kostMetode'].includes(k) || v.kostMetode !== 'm2') return {};
  const kost = m2Kost(v); return kost != null ? { kost, kostKilde: undefined, kostAar: v.kostAar || YEAR } : {};
}
function m2Felter(eid: (v: any) => string | undefined, navn: (v: any) => string): Field[] {
  const vis = (x: any) => x.kostMetode === 'm2';
  return [
    { k: 'kostMetode', label: 'Hvordan beregnes kostnaden?', type: 'select', options: [['fast', 'Fast beløp'], ['m2', 'Areal × pris per m² (areal kan måles på tegning)']], help: 'kost.m2' },
    { k: 'mengde', label: 'Areal (m²)', type: 'number', half: true, show: vis },
    { k: 'm2pris', label: 'Pris per m² (kr)', type: 'number', half: true, show: vis, hint: 'Utskifting inkl. riving, materialer og montasje' },
    { k: 'faktor', label: 'Faktor / påslag', type: 'number', half: true, show: vis, ph: '1', hint: 'F.eks. 1,15 for takvinkel, svinn eller rigg. Tomt = 1' },
    { k: 'maalKnapp', type: 'custom', show: vis, render: (v, set) => {
      const e = eid(v); const T = sortBy(S.tegninger.filter(t => t.eiendomId === e), t => +t.etasje || 0); const am = v.arealMaaling; const valgt = v._maalT || am?.tegningId || T[0]?.id || '';
      const kost = m2Kost(v);
      return <div className="note small" style={{ color: 'var(--ink)' }}>
        {T.length ? <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={valgt} onChange={x => set({ _maalT: x.target.value })} style={{ border: '1px solid var(--line2)', borderRadius: 6, padding: '4px 6px' }}>{T.map(t => <option key={t.id} value={t.id}>{t.navn}{t.skala ? '' : ' (mangler målestokk)'}</option>)}</select>
          <button type="button" className="btn sm" onClick={() => openPlan(valgt, { maal: { tittel: 'Areal for ' + navn(v), flater: am?.tegningId === valgt ? am.flater : [], onFerdig: r => { const nv = { ...v, mengde: r.m2 }; set({ arealMaaling: r, mengde: r.m2, ...(m2Kost(nv) != null ? { kost: m2Kost(nv), kostKilde: undefined, kostAar: v.kostAar || YEAR } : {}) }); toast(`Målt ${m2(r.m2)} – husk å lagre`); } } })}>📐 {am ? 'Endre måling på tegning' : 'Mål areal på tegning'}</button>
          {am && <span className="muted">Målt {m2(am.m2)} på {byId('tegninger', am.tegningId)?.navn || 'tegning'} ({am.flater.length} flate{am.flater.length === 1 ? '' : 'r'})</span>}
        </div> : <span className="muted">Ingen tegninger på eiendommen – skriv inn arealet, eller last opp en tegning under «Tegninger og arealer» for å måle.</span>}
        {kost != null && <div style={{ marginTop: 6 }}>Utskiftingskostnad: <b>{(+v.mengde).toLocaleString('nb-NO')} m² × {nok(+String(v.m2pris).replace(',', '.'))}/m²{+String(v.faktor || 1).replace(',', '.') !== 1 ? ' × ' + v.faktor : ''} = {nok(kost)}</b> <span className="muted">– settes i kostnadsfeltet</span></div>}
      </div>; } },
  ];
}

// ---------- Levetid: ledetråd fra NS 3451 og oppslag hos leverandør
function LevetidHjelp({ v, set, sysKode, typeLev }: { v: any; set: (x: any) => void; sysKode?: string; typeLev?: number }) {
  const r = levetidRef(sysKode); const ed = canEdit(); const t = midt(r?.tek || null), f = midt(r?.fun || null);
  const kilde = v.levetidKilde as string | undefined;
  return <div className="note small" style={{ color: 'var(--ink)', marginTop: -4 }}>
    {r ? <><b>Ledetråd NS 3451<Hjelp id="levetid" size={15} /></b> <span className="muted">({r.kode} {r.navn})</span>: teknisk levetid <b>{spenn(r.tek)}</b>, funksjonell <b>{spenn(r.fun)}</b>.
      {ed && <span style={{ display: 'inline-flex', gap: 6, marginLeft: 6, flexWrap: 'wrap' }}>{t && <button type="button" className="btn sm" onClick={() => set({ levetid: t, levetidKilde: `NS 3451 ${r.kode} teknisk` })}>Bruk teknisk ({t} år)</button>}{f && <button type="button" className="btn sm" onClick={() => set({ levetid: f, levetidKilde: `NS 3451 ${r.kode} funksjonell` })}>Bruk funksjonell ({f} år)</button>}</span>}</>
      : <span className="muted">Ingen NS 3451-referanse for {sysKode ? 'koden ' + sysKode : 'systemet (mangler TFM-kode)'}.</span>}
    {typeLev ? <span className="muted"> · Veiledende for typen: {typeLev} år.</span> : null}
    {v.levetid && kilde ? <div style={{ marginTop: 4 }}><span className="chip" style={{ background: '#eef4ff', color: '#2457a6', borderRadius: 9, padding: '0 7px' }}>Forslag: {kilde}</span> <span className="muted">– kan endres i feltet over.</span></div> : null}
  </div>;
}

function LeverandorSok({ v, set, kind, sysKode }: { v: any; set: (x: any) => void; kind: 'a' | 'k'; sysKode?: string }) {
  const [busy, setBusy] = useState(false); const [sek, setSek] = useState(0); const [res, setRes] = useState<any>(v.leverandorData || null); const [err, setErr] = useState('');
  if (!canEdit()) return null;
  const r = levetidRef(sysKode); const sys = kind === 'k' ? byId('anlegg', v.anleggId) : v;
  const sok = async () => {
    setBusy(true); setErr(''); setSek(0); const t0 = Date.now(); const tm = setInterval(() => setSek(Math.round((Date.now() - t0) / 1000)), 1000);
    try {
      const { data, error } = await (sb as any).functions.invoke('leverandor-oppslag', { body: {
        fabrikat: v.fabrikat, betegnelse: v.navn || '', systemtype: KOMP[sys?.type]?.n || '', komponent: kind === 'k' ? (TFM_KODER.find(c => c[0] === String(v.kode || '').toUpperCase())?.[1] || v.kode || '') : '',
        nsKode: r?.kode || sysKode || '', nsNavn: r?.navn || '', aar: v.aar || '', kostAar: YEAR } });
      if (error) {
        const st = error.context?.status; let m = '';
        try { const t = await error.context?.text?.(); try { m = JSON.parse(t)?.error || ''; } catch { m = ''; } } catch { }
        if (!m) m = st === 546 || st === 504 ? 'Søket tok for lang tid og ble avbrutt. Prøv igjen.' : st === 401 ? 'Du er ikke innlogget lenger. Last siden på nytt.' : `Søket feilet (${st || error.message}).`;
        throw new Error(m);
      }
      if (data?.error) throw new Error(data.error);
      const d = { ...data, dato: today() }; setRes(d); set({ leverandorData: d });
    } catch (e: any) { setErr(e.message || String(e)); }
    clearInterval(tm); setBusy(false);
  };
  const L = res?.resultat?.levetid, U = res?.resultat?.utskifting, RF = res?.resultat?.retrofit;
  const kr = (n: any) => Math.round(+n).toLocaleString('nb-NO') + ' kr';
  const brukKost = (o: any, type: string) => set({ kost: Math.round(+o.belop_nok), kostAar: YEAR, kostKilde: { type: 'forslag', hva: type, kilde: o.kilde_url || '', omfang: o.omfang || '', dato: today(), belop: Math.round(+o.belop_nok) } });
  return <div className="note small" style={{ color: 'var(--ink)' }}>
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><b>Leverandørdata fra nett<Hjelp id="leverandorsok" size={15} /></b>
      <button type="button" className="btn sm" disabled={busy || !String(v.fabrikat || '').trim()} onClick={sok}>{busy ? `Søker med Google … ${sek} s` : res ? 'Søk på nytt' : 'Søk etter levetid og kostnad'}</button>
      {!String(v.fabrikat || '').trim() && <span className="muted">Fyll inn fabrikat/modell først.</span>}
      {busy && <span className="muted">Vanligvis 10–40 sekunder. Du kan fortsette å fylle ut skjemaet.</span>}</div>
    {err && <div style={{ color: 'var(--red)', marginTop: 4 }}>{err}</div>}
    {res?.resultat && <div style={{ marginTop: 6 }}>
      {res.utenSok && <div style={{ color: '#9a5b00', marginBottom: 4 }}>⚠ Google-søk var ikke tilgjengelig (gratisnivået) eller tok for lang tid. Tallene er modellens generelle kunnskap, ikke leverandørens egne data. Bruk dem med ekstra forsiktighet.</div>}
      {res.resultat.produkt && <div className="muted">Tolket som: {res.resultat.produkt}{res.dato ? ` · søkt ${fd(res.dato)}` : ''}{res.motor ? ` · ${res.motor}` : ''}</div>}
      <div style={{ marginTop: 4 }}>Levetid: {L?.aar || L?.min ? <><b>{L.aar || `${L.min}–${L.max}`} år</b>{L.type ? ` (${L.type})` : ''}{L.kilde_url && <> · <a href={L.kilde_url} target="_blank" rel="noopener noreferrer">kilde</a></>}{L.kommentar && <span className="muted"> – {L.kommentar}</span>}
        {' '}<button type="button" className="btn sm" onClick={() => set({ levetid: L.aar || Math.round((L.min + L.max) / 2), levetidKilde: `leverandør (${res.resultat.produkt || v.fabrikat})` })}>Bruk</button></> : <span className="muted">ikke funnet</span>}</div>
      {[['Utskifting', U], ['Retrofit/oppgradering', RF]].filter(x => x[1]?.belop_nok).map(([lab, o]: any) => <div key={lab} style={{ marginTop: 4 }}>
        <span style={{ background: '#fff4e5', color: '#9a5b00', borderRadius: 9, padding: '0 7px', fontWeight: 600 }}>FORSLAG</span> {lab}: <b>{kr(o.belop_nok)}</b>{o.omfang && <span className="muted"> – {o.omfang}</span>}{o.kilde_url && <> · <a href={o.kilde_url} target="_blank" rel="noopener noreferrer">kilde</a></>}
        {' '}<button type="button" className="btn sm" onClick={() => brukKost(o, lab)}>Bruk som kostnadsforslag</button></div>)}
      {!U?.belop_nok && !RF?.belop_nok && <div className="muted" style={{ marginTop: 4 }}>Fant ingen kostnad.</div>}
      {Array.isArray(res.resultat.vedlikehold) && res.resultat.vedlikehold.length > 0 && <div style={{ marginTop: 8 }}>
        <b>Leverandørens anbefalte vedlikehold</b><Hjelp id="kontroller.leverandor" size={14} /><div className="muted">Kryss av for å opprette som kontroller når du lagrer{kind === 'k' ? ' (knyttes til systemet)' : ''}.</div>
        {res.resultat.vedlikehold.map((o: any, j: number) => { const sel = (v.levMk || []).some((x: any) => x.oppgave === o.oppgave); const fins = S.oppgaver.some(t => t.anleggId === (kind === 'k' ? v.anleggId : v.id) && t.navn === (kind === 'k' && v.kode ? `${o.oppgave} (-${v.kode}${pad(v.lop)})` : o.oppgave));
          return <label key={j} style={{ display: 'flex', gap: 8, alignItems: 'start', margin: '4px 0', fontWeight: 400, cursor: fins ? 'default' : 'pointer' }}>
            {fins ? <span style={{ color: 'var(--green)', fontWeight: 700, width: 14 }}>✓</span> : <input type="checkbox" checked={sel} style={{ marginTop: 3 }} onChange={() => set({ levMk: sel ? (v.levMk || []).filter((x: any) => x.oppgave !== o.oppgave) : [...(v.levMk || []), { ...o, oppgave: kind === 'k' && v.kode ? `${o.oppgave} (-${v.kode}${pad(v.lop)})` : o.oppgave, produkt: res.resultat.produkt }] })} />}
            <span>{o.oppgave} <span className="muted">· {intTxt({ n: +o.intervall_n || 1, enhet: o.intervall_enhet || 'år' })}{o.utfores ? ' · ' + o.utfores : ''}{fins ? ' · finnes allerede' : ''}</span>{o.kilde_url && <> · <a href={o.kilde_url} target="_blank" rel="noopener noreferrer">kilde</a></>}</span></label>; })}
      </div>}
      {res.resultat.usikkerhet && <div className="muted" style={{ marginTop: 4 }}>Usikkerhet: {res.resultat.usikkerhet}. {res.resultat.notat || ''}</div>}
      {res.kilder?.length > 0 && <details style={{ marginTop: 4 }}><summary>Kilder ({res.kilder.length})</summary>{res.kilder.slice(0, 8).map((k: any, i: number) => <div key={i}><a href={k.url} target="_blank" rel="noopener noreferrer">{k.title || k.url}</a></div>)}</details>}
    </div>}
  </div>;
}

// Kontroll basert på leverandørens anbefalte vedlikehold (fra nettsøket)
export function levTask(o: any, eiendomId: string, anleggId: string, frist: string) {
  const enh = ['uke', 'mnd', 'år'].includes(o.intervall_enhet) ? o.intervall_enhet : 'år';
  return { eiendomId, anleggId, navn: o.oppgave, kategori: o.kategori || 'Leverandør', type: 'Leverandøranbefaling', hjemmel: 'Leverandørens anbefaling' + (o.produkt ? ' – ' + o.produkt : '') + (o.kilde_url ? ' (' + o.kilde_url + ')' : ''), intervall: { n: Math.max(1, +o.intervall_n || 1), enhet: enh }, utfores: o.utfores || 'Servicefirma', ansvar: 'Eier', nesteFrist: frist, aktiv: true, historikk: [], kilde: 'leverandor' };
}

function KostFlagg({ v }: { v: any }) {
  const k = v.kostKilde; if (!k || k.type !== 'forslag' || +v.kost !== +k.belop) return null;
  return <div className="small" style={{ marginTop: -4, color: '#9a5b00' }}><span style={{ background: '#fff4e5', borderRadius: 9, padding: '0 7px', fontWeight: 600 }}>FORSLAG</span><Hjelp id="forslag" size={14} /> Kostnaden er et anslag fra nettsøk ({k.hva?.toLowerCase()}{k.omfang ? ': ' + k.omfang : ''}, {fd(k.dato)}){k.kilde && <> · <a href={k.kilde} target="_blank" rel="noopener noreferrer">kilde</a></>}. Kontroller mot tilbud. Endrer du beløpet, fjernes merket.</div>;
}

// Plassering av system/komponent på tegning
function PlasseringFelt({ kind, id, eiendomId, close }: { kind: 'a' | 'k'; id?: string; eiendomId: string; close: () => void }) {
  const o = id ? byId(kind === 'a' ? 'anlegg' : 'komponenter', id) : null; const T = sortBy(S.tegninger.filter(t => t.eiendomId === eiendomId), t => +t.etasje || 0);
  const [tid, setTid] = React.useState(o?.pos?.tegningId || T[0]?.id || '');
  if (!id) return <div className="small muted">Lagre først – deretter kan du plassere den på en tegning.</div>;
  if (!T.length) return <div className="small muted">Ingen tegninger for eiendommen. Last opp under «Tegninger og arealer».</div>;
  const t = o?.pos ? byId('tegninger', o.pos.tegningId) : null;
  return <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
    {t ? <span className="small">Plassert på <b>{t.navn}</b></span> : <span className="small muted">Ikke plassert</span>}
    {t && <button type="button" className="btn sm" onClick={() => { close(); openPlan(t.id, { mode: 'tfm', focus: id }); }}>Vis på tegning</button>}
    {canEdit() && <>{T.length > 1 && <select value={tid} onChange={e => setTid(e.target.value)} style={{ border: '1px solid var(--line2)', borderRadius: 7, padding: '5px 6px', width: 'auto' }}>{T.map(x => <option key={x.id} value={x.id}>{x.navn}</option>)}</select>}
      <button type="button" className="btn sm" onClick={() => { close(); openPlan(tid, { mode: 'tfm', placeId: id }); }}>{t ? 'Flytt' : 'Plasser på tegning'}</button></>}
  </div>;
}

// Viser beregnet utskiftingsår og prisjustert kostnad live i skjemaet
function UtskiftNote({ v, typeLevetid, sysId, kompAv }: { v: any; typeLevetid?: number; sysId?: string; kompAv?: string }) {
  const lev = +v.levetid || typeLevetid || 0; const ber = +v.aar && lev ? +v.aar + lev : null;
  const k = kpiInnst();
  if (kompAv && !egetAar(v)) { const s = byId('anlegg', kompAv); const sy = s ? compYear(s) : null; return <div className="note small" style={{ color: 'var(--ink)' }}>Uten egen levetid følger komponenten systemets utskiftingsår{sy ? <>: <b className="mono">{sy}</b></> : ' (systemet mangler år)'}.
    {+v.kost > 0 && sy && <><br />Prisjustert kostnad i {Math.max(sy, YEAR)}: <b className="mono">{nok(kostJustert(v, sy))}</b> · nåverdi <b className="mono">{nok(naaverdi(kostJustert(v, sy), Math.max(sy, YEAR)))}</b> – inngår i systemets totale utskiftingskostnad.</>}</div>; }
  const aar = +v.planAar || ber;
  const ks = sysId ? S.komponenter.filter(c => c.anleggId === sysId && +c.kost > 0) : [];
  const kNaa = ks.reduce((s, c) => s + kostNaa(c), 0); const sNaa = +v.kost > 0 ? (+v.kostAar && +v.kostAar < YEAR ? kostNaa(v) : +v.kost) : 0;
  const kJ = aar ? ks.reduce((s, c) => s + kostJustert(c, aar), 0) : 0; const sJ = +v.kost > 0 && aar ? kostJustert(v, aar) : 0;
  return <div className="note small" style={{ color: 'var(--ink)' }}>
    {ber ? <>Beregnet utskiftingsår: <b className="mono">{ber}</b> <span className="muted">({v.aar} + {lev} år{!v.levetid && typeLevetid ? ', veiledende levetid' : ''})</span>{+v.planAar && +v.planAar !== ber ? <> · <b>overstyrt til {v.planAar}</b></> : null}</>
      : +v.planAar ? <>Utskiftingsår: <b className="mono">{v.planAar}</b> (satt manuelt)</> : <span className="muted">Fyll inn installert år og levetid, så beregnes utskiftingsåret.</span>}
    {ks.length > 0 && <><br />Kostnad i dag for hele systemet: <b className="mono">{nok(sNaa + kNaa)}</b> <span className="muted">= sentralkost {nok(sNaa)} + {ks.length} komponenter {nok(kNaa)}</span>
      {aar && <><br />Prisjustert totalkostnad i {Math.max(aar, YEAR)}: <b className="mono">{nok(sJ + kJ)}</b></>}</>}
    {aar && ks.length > 0 && (sJ + kJ) > 0 && <><br />Nåverdi i dag<Hjelp id="naaverdi" size={14} />: <b className="mono">{nok(naaverdi(sJ + kJ, Math.max(aar, YEAR)))}</b> <span className="muted">(diskontert {Math.max(aar - YEAR, 0)} år med {renteInnst().toLocaleString('nb-NO')} % kalkulasjonsrente)</span></>}
    {!ks.length && sysId !== undefined && <><br /><span className="muted">Komponentkostnader du legger inn på komponentene, summeres automatisk med sentralkosten.</span></>}
    {+v.kost > 0 && aar && !ks.length && <><br />Prisjustert kostnad i {Math.max(aar, YEAR)}: <b className="mono">{nok(kostJustert(v, aar))}</b> <span className="muted">(fra {nok(v.kost)} i {+v.kostAar || YEAR}-kroner, KPI {k.modus === 'fast' ? k.fast.toLocaleString('nb-NO') + ' %/år' : 'per år fra innstillinger'}{aar < YEAR ? ' · etterslep regnet til i år' : ''})</span></>}
    {+v.kost > 0 && aar && !ks.length && <><br />Nåverdi i dag<Hjelp id="naaverdi" size={14} />: <b className="mono">{nok(naaverdi(kostJustert(v, aar), Math.max(aar, YEAR)))}</b> <span className="muted">({renteInnst().toLocaleString('nb-NO')} % kalkulasjonsrente)</span></>}
  </div>;
}

const kompGroups = () => { const g: Record<string, [string, string][]> = {}; Object.entries(KOMP).forEach(([k, v]) => { (g[v.g] = g[v.g] || []).push([k, v.n]); }); return Object.entries(g) as [string, [string, string][]][]; };
/** Åpne en tegning i modusen «Legg til komponenter» for systemet */
export function kompFraTegning(aid: string, lukk?: () => void) {
  const a = byId('anlegg', aid); if (!a) return;
  const T = sortBy(S.tegninger.filter(t => t.eiendomId === a.eiendomId), t => t.navn || '');
  if (!T.length) { toast('Eiendommen har ingen tegninger ennå – last opp under Tegninger og arealer'); return; }
  const aapne = (tid: string) => { lukk?.(); openPlan(tid, { mode: 'tfm', nyKomp: aid, fokus: S.komponenter.filter(k => k.anleggId === aid && k.pos?.tegningId === tid).map(k => k.id) }); };
  if (T.length === 1) return aapne(T[0].id);
  showModal('Velg tegning', close => <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{T.map(t => { const n = S.komponenter.filter(k => k.anleggId === aid && k.pos?.tegningId === t.id).length;
    return <button key={t.id} className="btn" style={{ justifyContent: 'space-between' }} onClick={() => { close(); aapne(t.id); }}><span>{t.navn}</span><span className="small muted">{n ? n + ' komponenter her' : ''}</span></button>; })}</div>);
}
export function editAnlegg(id?: string, eiendomId?: string) {
  const a: Rec = id ? byId('anlegg', id)! : { eiendomId: eiendomId || S.eiendommer.find(e => kanRedigereE(e.id))?.id, type: 'ventilasjon', ansvar: 'Eier' } as any;
  const ro = !kanRedigereE(a.eiendomId);
  if (!id) { a.tfmSys = TFM_DEF[a.type][0]; a.tfmLop = nextSysLop(a.eiendomId, a.tfmSys); a.mk = KOMP[a.type]?.m || []; a.forste = addDays(today(), 30); }
  const touched: Record<string, boolean> = {};
  const fields: Field[] = [
    { k: 'eiendomId', label: 'Eiendom', type: 'select', options: eOptsSkriv, req: true },
    { k: 'type', label: 'Type system / bygningsdel', type: 'select', groups: kompGroups },
    { k: 'tagger', type: 'custom', label: 'Tagger (fag)', render: (v, set) => <div><TaggVelger value={Array.isArray(v.tagger) ? v.tagger : standardTagger(v)} onChange={t => set({ tagger: t })} disabled={!canEdit()} />
      <div className="hint">{Array.isArray(v.tagger) ? <>Egne tagger. {canEdit() && <a href="#" onClick={e => { e.preventDefault(); set({ tagger: undefined }); }}>Bruk standard for typen</a>}</> : 'Standard ut fra typen. Komponentene arver taggene.'}</div></div> },
    { k: 'tfmSys', label: 'TFM systemkode (NS 3451)', half: true, mono: true, dl: NS3451, ph: '360', hint: '3 siffer etter NS 3451 (2 siffer for dokumentasjon, 10–19)' },
    { k: 'tfmLop', label: 'Systemløpenummer', half: true, mono: true, ph: '001' },
    { k: 'prev', type: 'custom', render: v => { const e = byId('eiendommer', v.eiendomId); return <div className="note mono" style={{ fontSize: 14, color: 'var(--ink)' }}>{v.tfmSys ? `${e?.tfmBygg ? '+' + e.tfmBygg : ''}=${v.tfmSys}.${pad(v.tfmLop || 1)}` : '(ingen TFM-kode)'}</div>; } },
    { k: 'navn', label: 'Betegnelse / plassering', half: true, ph: 'F.eks. Ventilasjon kontorfløy' }, { k: 'fabrikat', label: 'Fabrikat / modell', half: true },
    { k: 'aar', label: 'Installert/utskiftet år', type: 'number', half: true }, { k: 'levetid', label: 'Forventet levetid (år)', type: 'number', half: true, hint: 'Tomt = veiledende levetid for typen' },
    { k: 'levHjelp', type: 'custom', render: (v, set) => <LevetidHjelp v={v} set={set} sysKode={v.tfmSys} typeLev={KOMP[v.type]?.l} /> },
    { k: 'planAar', label: 'Overstyr utskiftingsår (valgfritt)', type: 'number', half: true, hint: 'La stå tom for å bruke beregnet år' },
    ...(isStaff() && canEdit() ? m2Felter(v => v.eiendomId, v => v.navn || KOMP[v.type]?.n || 'systemet') : []),
    ...(isStaff() && canEdit() ? [{ k: 'kost', label: 'Sentralkost på systemnivå (kr)', type: 'number', half: true, hint: 'F.eks. sentral, styring, kabling. Komponentene summeres i tillegg.' } as Field, { k: 'kostAar', label: 'Kostnad vurdert (prisnivå år)', type: 'number', half: true, def: YEAR, hint: 'Året beløpet er anslått i' } as Field] : []),
    { k: 'kostFlagg', type: 'custom', render: v => <KostFlagg v={v} /> },
    { k: 'levSok', type: 'custom', render: (v, set) => <LeverandorSok v={v} set={set} kind="a" sysKode={v.tfmSys} /> },
    { k: 'beregn', type: 'custom', render: v => <UtskiftNote v={v} typeLevetid={KOMP[v.type]?.l} sysId={id || ''} /> },
    { k: 'secTg', label: 'Tilstand', type: 'sec' }, ...tgFelt(),
    { k: 'secDrift', label: 'Drift', type: 'sec' },
    { k: 'ansvar', label: 'Ansvar for drift og vedlikehold', type: 'select', options: ['Eier', 'Leietaker', 'Delt'], half: true },
    { k: 'utskiftAnsvar', label: 'Ansvar for utskifting', type: 'select', options: ['Eier', 'Leietaker', 'Delt'], empty: 'Som drift', half: true },
    { k: 'leietakerId', label: 'Betjener leietaker', type: 'select', options: (v?: any) => S.leietakere.filter(l => l.eiendomId === (v?.eiendomId ?? a.eiendomId)).map(l => [l.id, l.navn] as [string, string]), empty: '– Felles / hele bygget', half: true, hint: 'Systemer som bare betjener ett leieobjekt følger den leietakerens kontrakt' },
    { k: 'leverandor', label: 'Serviceleverandør / avtale', half: true },
    { k: 'leverandorEpost', label: 'E-post til servicefirma', type: 'email', half: true, hint: 'Brukes som mottaker når arbeidsordre for systemets kontroller sendes' },
    { k: 'saInfo', type: 'custom', render: v => { const kr = SERVICEAVTALE[v.type]; if (!kr) return null; const st = id ? saStatus({ ...a, id }, kr) : { s: kr.n === 'lov' ? 'no' : 'anb', d: null };
      return <div className="note small" style={{ color: 'var(--ink)' }}><b>Serviceavtale: {kr.n === 'lov' ? 'lovkrav' : 'anbefalt'}</b> – <span className="muted">{kr.h}.</span><br />
        {st.s === 'na' ? 'Markert som ikke relevant.' : st.d ? <>Registrert: <b>{st.d.tittel}</b>{st.d.gyldigTil ? ` · gyldig til ${fd(st.d.gyldigTil)}` : ''}{st.s === 'exp' && <b style={{ color: 'var(--red)' }}> · UTLØPT</b>}</> : <span style={{ color: kr.n === 'lov' ? 'var(--red)' : undefined }}>Ingen serviceavtale registrert.</span>}
        {!st.d && id && canEdit() && <> <button type="button" className="btn sm" onClick={() => { closeRef.c?.(); editDok(undefined, { eiendomId: v.eiendomId, type: 'Serviceavtale', anleggId: id, tittel: 'Serviceavtale – ' + (v.navn || KOMP[v.type]?.n) + (v.leverandor ? ' (' + v.leverandor + ')' : '') }); }}>Registrer avtale</button></>}
        {!id && <span className="muted"> Lagre systemet først, deretter kan avtalen registreres her eller under Dokumenter.</span>}</div>; } },
    { k: 'plass', type: 'custom', label: 'Plassering på tegning', render: v => <PlasseringFelt kind="a" id={id} eiendomId={v.eiendomId} close={() => closeRef.c?.()} /> },
    { k: 'notat', label: 'Notater', type: 'textarea' },
  ];
  // Eksisterende system: vis standardkontroller for typen og hvilke som mangler
  if (id && !ro) fields.push({ k: 'mkNy', type: 'custom', label: 'Standardkontroller for denne typen', help: 'kontroller.system', def: [], render: (v, set) => {
    const ms = KOMP[v.type]?.m || []; if (!ms.length) return <div className="muted small">Ingen standardkontroller for denne typen.</div>;
    return <div className="checks">{ms.map(k => { const fins = S.oppgaver.find(o => o.anleggId === id && o.malKey === k && o.aktiv !== false);
      return <label key={k} style={{ opacity: fins ? .75 : 1 }}>{fins ? <span style={{ color: 'var(--green)', fontWeight: 700, width: 16, display: 'inline-block' }}>✓</span> : <input type="checkbox" checked={(v.mkNy || []).includes(k)} onChange={e => set({ mkNy: e.target.checked ? [...(v.mkNy || []), k] : (v.mkNy || []).filter((x: string) => x !== k) })} />}
        <span><span className="ct">{MALER[k].n}</span><br /><span className="cs">{fins ? `Finnes – neste frist ${fd(fins.nesteFrist)}` : 'Mangler – kryss av for å opprette'} · {MALER[k].t} · {intTxt({ n: MALER[k].i[0], enhet: MALER[k].i[1] })} · {MALER[k].h}</span></span></label>; })}</div>; } });
  if (!id) fields.push(
    { k: 'mk', type: 'custom', label: 'Kontroller som opprettes for dette systemet', hint: 'Du kan justere hver kontroll senere.', render: (v, set) => { const ms = KOMP[v.type]?.m || []; return ms.length ? <div className="checks">{ms.map(k => <label key={k}><input type="checkbox" checked={(v.mk || []).includes(k)} onChange={e => set({ mk: e.target.checked ? [...(v.mk || []), k] : (v.mk || []).filter((x: string) => x !== k) })} /><span><span className="ct">{MALER[k].n}</span><br /><span className="cs">{MALER[k].t} · {intTxt({ n: MALER[k].i[0], enhet: MALER[k].i[1] })} · {MALER[k].h}</span></span></label>)}</div> : <div className="muted small">Ingen standardkontroller for denne typen.</div>; } },
    { k: 'forste', label: 'Første frist for nye kontroller', type: 'date', half: true });
  const closeRef: { c?: () => void } = {};
  closeRef.c = formModal({
    title: ro ? aNavn(id) : id ? 'Rediger system / bygningsdel' : 'Nytt system / bygningsdel', fields, values: a, readOnly: ro, wide: !!id,
    bottom: () => id ? <ServiceHistorikk anleggId={id} /> : null,
    onChange: (k, v, prev) => {
      if (k === 'tfmSys') touched.sys = true; if (k === 'tfmLop') touched.lop = true;
      const p: any = { ...m2Patch(k, v) };
      if (k === 'type' && !id && !v.mengde) p.kostMetode = KOMP[v.type]?.enh === 'm2' ? 'm2' : 'fast';
      if (k === 'levetid') p.levetidKilde = undefined;
      if ((k === 'type' || k === 'tfmSys') && !id && !touched.lev) { const r = levetidRef(k === 'type' ? (TFM_DEF[v.type]?.[0] || v.tfmSys) : v.tfmSys); const t = midt(r?.tek || null); if (t) { p.levetid = t; p.levetidKilde = `NS 3451 ${r!.kode} teknisk`; } }
      if (k === 'levetid') touched.lev = true;
      if (k === 'type' && !id) { if (!touched.sys) p.tfmSys = TFM_DEF[v.type]?.[0] || ''; p.mk = KOMP[v.type]?.m || []; }
      if ((k === 'type' || k === 'tfmSys' || k === 'eiendomId') && !touched.lop && !id) p.tfmLop = nextSysLop(v.eiendomId, p.tfmSys ?? v.tfmSys);
      return p;
    },
    extraFoot: close => id && !ro ? <><button className="btn danger" onClick={async () => {
      const kc = S.komponenter.filter(k => k.anleggId === id);
      if (await confirmBox(`Slette systemet${kc.length ? ` og ${kc.length} komponenter` : ''}? Tilknyttede kontroller beholdes, men mister koblingen.`)) { await removeDoc('anlegg', id); close(); }
    }}>Slett</button><button className="btn" title="Klikk rundt på en tegning og marker f.eks. hver branndør" onClick={() => kompFraTegning(id, close)}>+ Komponenter fra tegning</button></> : null,
    onSave: async v => {
      const mk: string[] = [...(v.mk || []), ...(v.mkNy || [])]; const forste = v.forste || addDays(today(), 30); const levMk: any[] = v.levMk || []; delete v.mk; delete v.mkNy; delete v.levMk; delete v.forste; delete v.prev; delete v.beregn;
      if (v.kost && !v.kostAar) v.kostAar = YEAR;
      v.tfmSys = String(v.tfmSys || '').replace(/\D/g, ''); v.tfmLop = v.tfmSys ? pad(String(v.tfmLop || '1').replace(/\D/g, '') || 1) : '';
      const dup = v.tfmSys && S.anlegg.find(x => x.id !== id && x.eiendomId === v.eiendomId && x.tfmSys === v.tfmSys && pad(x.tfmLop) === v.tfmLop);
      if (dup) { toast(`TFM-koden =${v.tfmSys}.${v.tfmLop} er allerede brukt på «${dup.navn || KOMP[dup.type]?.n}»`); return false; }
      delete v.maalKnapp; delete v._maalT; delete v.plass; delete v.saInfo; delete v.tgInfo; delete v.secTg; delete v.secDrift; delete v.levHjelp; delete v.levSok; delete v.kostFlagg; if (v.kostKilde && +v.kost !== +v.kostKilde.belop) v.kostKilde = undefined; const fersk = id ? byId('anlegg', id) : null;
      const nid = await save('anlegg', { ...a, ...v, pos: fersk ? fersk.pos ?? null : a.pos ?? null, mk: undefined, forste: undefined });
      for (const k of mk) await save('oppgaver', taskFromMal(k, MALER, v.eiendomId, nid, forste));
      for (const o of levMk) await save('oppgaver', levTask(o, v.eiendomId, nid, forste));
      const n = mk.length + levMk.length; toast(n ? `Lagret og opprettet ${n} kontroller` : 'Lagret');
    },
  });
}
export function editKomponent(id?: string, anleggId?: string) {
  const k: Rec = id ? byId('komponenter', id)! : { anleggId } as any;
  const sys = byId('anlegg', k.anleggId) || ({} as Rec); const ro = !kanRedigereE(sys.eiendomId);
  if (!id) { k.kode = TFM_DEF[sys.type]?.[1] || ''; k.lop = nextKompLop(k.anleggId, k.kode); k.eiendomId = sys.eiendomId; }
  const touched: Record<string, boolean> = {};
  const fields: Field[] = [
    { k: 'anleggId', label: 'System', type: 'select', options: () => sortBy(S.anlegg.filter(a => a.eiendomId === sys.eiendomId), a => aNavn(a.id)).map(a => [a.id, aNavn(a.id)] as [string, string]), req: true },
    { k: 'kode', label: 'TFM komponentkode', half: true, mono: true, dl: TFM_KODER, ph: 'JV', req: true, hint: '2 bokstaver, f.eks. JV vifte, JP pumpe, RT temperaturgiver' },
    { k: 'lop', label: 'Komponentløpenummer', half: true, mono: true, ph: '001' },
    { k: 'typekode', label: 'Typekode (valgfritt, etter %)', half: true, mono: true }, { k: 'navn', label: 'Betegnelse', half: true, ph: 'F.eks. Tilluftsvifte' },
    { k: 'tagger', type: 'custom', label: 'Tagger (fag)', render: (v, set) => { const arv = taggerFor(byId('anlegg', v.anleggId), 'a'); const egne = Array.isArray(v.tagger);
      return <div>{egne ? <TaggVelger value={v.tagger} onChange={t => set({ tagger: t })} disabled={!canEdit()} /> : <span className="small">Arver fra systemet: {arv.length ? <TaggChips t={arv} /> : <span className="muted">ingen</span>}</span>}
        {canEdit() && <div className="hint">{egne ? <a href="#" onClick={e => { e.preventDefault(); set({ tagger: undefined }); }}>Arv systemets tagger igjen</a> : <a href="#" onClick={e => { e.preventDefault(); set({ tagger: [...arv] }); }}>Endre tagger for denne komponenten</a>}</div>}</div>; } },
    { k: 'prev', type: 'custom', render: v => { const a = byId('anlegg', v.anleggId); return <div className="note mono" style={{ fontSize: 14, color: 'var(--ink)' }}>{`${a ? tfmSys(a, true) : ''}-${String(v.kode || '').toUpperCase()}${pad(v.lop || 1)}${v.typekode ? '%' + v.typekode : ''}`}</div>; } },
    { k: 'plassering', label: 'Plassering (rom/etasje)', half: true }, { k: 'fabrikat', label: 'Fabrikat / modell', half: true },
    { k: 'serienr', label: 'Serienummer', half: true }, { k: 'aar', label: 'Installert år', type: 'number', half: true },
    { k: 'levetid', label: 'Forventet levetid (år)', type: 'number', half: true, hint: 'Tomt = skiftes sammen med systemet' }, { k: 'planAar', label: 'Overstyr utskiftingsår (valgfritt)', type: 'number', half: true },
    { k: 'levHjelp', type: 'custom', render: (v, set) => <LevetidHjelp v={v} set={set} sysKode={byId('anlegg', v.anleggId)?.tfmSys} /> },
    { k: 'plass', type: 'custom', label: 'Plassering på tegning', render: v => <PlasseringFelt kind="k" id={id} eiendomId={byId('anlegg', v.anleggId)?.eiendomId || k.eiendomId} close={() => closeRefK.c?.()} /> },
    ...(canEdit() ? m2Felter(v => byId('anlegg', v.anleggId)?.eiendomId, v => v.navn || 'komponenten') : []),
    ...(canEdit() ? [{ k: 'kost', label: 'Utskiftingskostnad (kr)', type: 'number', half: true } as Field, { k: 'kostAar', label: 'Kostnad vurdert (prisnivå år)', type: 'number', half: true, def: YEAR } as Field] : []),
    { k: 'kostFlagg', type: 'custom', render: v => <KostFlagg v={v} /> },
    { k: 'levSok', type: 'custom', render: (v, set) => <LeverandorSok v={v} set={set} kind="k" sysKode={byId('anlegg', v.anleggId)?.tfmSys} /> },
    { k: 'beregn', type: 'custom', render: v => <UtskiftNote v={v} kompAv={v.anleggId} /> },
    { k: 'secTg', label: 'Tilstand', type: 'sec' }, ...tgFelt(),
    { k: 'notat', label: 'Notater', type: 'textarea' }];
  const closeRefK: { c?: () => void } = {};
  closeRefK.c = formModal({
    title: ro ? kNavn(id) : id ? 'Rediger komponent' : 'Ny komponent', fields, values: k, readOnly: ro, wide: !!id,
    bottom: () => id ? <ServiceHistorikk komponentId={id} /> : null,
    onChange: (key, v) => { if (key === 'levetid') return { levetidKilde: undefined }; const mp = m2Patch(key, v); if (Object.keys(mp).length) return mp; if (key === 'lop') touched.lop = true; if ((key === 'kode' || key === 'anleggId') && !touched.lop && !id) return { lop: nextKompLop(v.anleggId, v.kode) }; },
    extraFoot: close => id && !ro ? <button className="btn danger" onClick={async () => { if (await confirmBox('Slette komponenten?')) { await removeDoc('komponenter', id); close(); } }}>Slett</button> : null,
    onSave: async x => {
      delete x.prev; delete x.beregn; if (x.kost && !x.kostAar) x.kostAar = YEAR; x.kode = String(x.kode || '').toUpperCase().replace(/[^A-ZÆØÅ]/g, ''); x.lop = pad(String(x.lop || '1').replace(/\D/g, '') || 1);
      if (!x.navn) x.navn = TFM_KODER.find(c => c[0] === x.kode)?.[1] || '';
      const dup = S.komponenter.find(z => z.id !== id && z.anleggId === x.anleggId && String(z.kode || '').toUpperCase() === x.kode && pad(z.lop) === x.lop);
      if (dup) { toast('Komponentkoden er allerede brukt i dette systemet'); return false; }
      const levMk: any[] = x.levMk || []; delete x.levMk; delete x.maalKnapp; delete x._maalT; delete x.plass; delete x.tgInfo; delete x.secTg; delete x.levHjelp; delete x.levSok; delete x.kostFlagg; if (x.kostKilde && +x.kost !== +x.kostKilde.belop) x.kostKilde = undefined; const fersk = id ? byId('komponenter', id) : null;
      { const sy = byId('anlegg', x.anleggId); for (const o of levMk) if (sy) await save('oppgaver', levTask(o, sy.eiendomId, sy.id, addDays(today(), 30))); } if (levMk.length) toast(`Opprettet ${levMk.length} kontroller fra leverandørens anbefaling`);
      const a = byId('anlegg', x.anleggId); await save('komponenter', { ...k, ...x, pos: fersk ? fersk.pos ?? null : k.pos ?? null, eiendomId: a ? a.eiendomId : k.eiendomId }); toast('Komponent lagret');
    },
  });
}
export async function autoTfm(eid: string) {
  const L = S.anlegg.filter(a => a.eiendomId === eid && !a.tfmSys); const used: Record<string, number> = {};
  for (const a of L) { const sys = TFM_DEF[a.type]?.[0]; if (!sys) continue; const base = +nextSysLop(eid, sys) - 1; used[sys] = (used[sys] ?? base) + 1; await save('anlegg', { ...a, tfmSys: sys, tfmLop: pad(used[sys]) }); }
  toast('TFM-koder tildelt');
}
const TFM_RE = /^\s*(?:\+([A-Za-z0-9]+))?\s*=\s*(\d{2,4})\.(\d{1,4})(?:\s*[-–]\s*([A-Za-zÆØÅæøå]{2,3})\s*(\d{1,4}))?(?:\s*%\s*(\S+))?\s*[;\t,]?\s*(.*)$/;
function parseTfm(txt: string) {
  const out: any[] = []; let bad = 0;
  txt.split(/\r?\n/).forEach(l => { if (!l.trim()) return; const x = l.match(TFM_RE); if (!x) { bad++; return; } const rest = x[7].split(/[;\t]/).map(z => z.trim()); out.push({ sys: x[2], lop: pad(x[3]), kode: x[4] ? x[4].toUpperCase() : '', klop: x[5] ? pad(x[5]) : '', type: x[6] || '', navn: rest[0] || '', fab: rest[1] || '', aar: +rest[2] || '' }); });
  return { out, bad };
}
function ImportTfmBody({ eid, close }: { eid: string; close: () => void }) {
  const [t, setT] = useState(''); const [busy, setBusy] = useState(''); const p = parseTfm(t);
  const sy = new Set(p.out.map(x => x.sys + '.' + x.lop));
  const run = async () => {
    setBusy('Importerer …'); let ns = 0, nk = 0; const map: Record<string, string> = {};
    S.anlegg.filter(a => a.eiendomId === eid && a.tfmSys).forEach(a => map[a.tfmSys + '.' + pad(a.tfmLop)] = a.id);
    for (const r of p.out) {
      const key = r.sys + '.' + r.lop;
      if (!map[key]) {
        const type = (Object.entries(TFM_DEF).find(([, v]) => v[0] === r.sys) || Object.entries(TFM_DEF).find(([, v]) => v[0] && v[0].slice(0, 2) === r.sys.slice(0, 2)) || ['annet'])[0];
        const grp = (NS3451.find(g => g[0] === r.sys) || NS3451.find(g => g[0] === r.sys.slice(0, 2)) || ['', ''])[1];
        map[key] = await save('anlegg', { eiendomId: eid, type, tfmSys: r.sys, tfmLop: r.lop, navn: r.kode ? grp : (r.navn || grp), fabrikat: r.kode ? '' : r.fab, aar: r.kode ? '' : r.aar, ansvar: 'Eier' }); ns++;
      } else if (!r.kode && r.navn) { const a = byId('anlegg', map[key]); if (a && !a.navn) await save('anlegg', { ...a, navn: r.navn }); }
      if (r.kode) {
        const ex = S.komponenter.find(k => k.anleggId === map[key] && k.kode === r.kode && pad(k.lop) === r.klop);
        await save('komponenter', { ...(ex || {}), anleggId: map[key], eiendomId: eid, kode: r.kode, lop: r.klop, typekode: r.type, navn: r.navn || TFM_KODER.find(c => c[0] === r.kode)?.[1] || '', fabrikat: r.fab || ex?.fabrikat || '', aar: r.aar || ex?.aar || '' }); nk++;
      }
      setBusy(`Importerer … ${ns + nk}`);
    }
    close(); toast(`Importert: ${ns} nye systemer, ${nk} komponenter. Bruk «Generer kontrollplan» for kontroller.`);
  };
  return <>
    <div className="mh"><h2>Importer TFM-liste – {eNavn(eid)}</h2><button className="btn ghost sm" onClick={close}>✕</button></div>
    <div className="mb"><p className="small" style={{ marginTop: 0 }}>Lim inn en liste fra FDV-dokumentasjon, merkeliste eller regneark – én kode per linje. Etter koden kan du ha <b>betegnelse; fabrikat; installert år</b> skilt med semikolon eller tabulator.</p>
      <pre className="letter small" style={{ marginBottom: 10 }}>{'=360.001 Ventilasjon kontorfløy; Systemair; 2012\n=360.001-JV001 Tilluftsvifte; Systemair; 2012\n+01=360.001-LX001 Roterende gjenvinner\n=542.001-OS001 Brannsentral; Autronica; 2016'}</pre>
      <textarea className="codebox" style={{ minHeight: 180 }} value={t} onChange={e => setT(e.target.value)} />
      <div className="small muted" style={{ marginTop: 6 }}>{p.out.length ? `Fant ${sy.size} systemer og ${p.out.filter(x => x.kode).length} komponenter${p.bad ? ` · ${p.bad} linjer uten gyldig TFM-kode hoppes over` : ''}.` : p.bad ? `${p.bad} linjer uten gyldig TFM-kode.` : ''}</div></div>
    <div className="mf"><button className="btn" onClick={close}>Avbryt</button><button className="btn pri" disabled={!p.out.length || !!busy} onClick={run}>{busy || 'Importer'}</button></div>
  </>;
}
export function importTfm(eid: string) { openModal({ wide: true, render: close => <ImportTfmBody eid={eid} close={close} /> }); }

// ================= KONTROLLPLAN =================
function GenPlanBody({ eid, isNew, close }: { eid: string; isNew?: boolean; close: () => void }) {
  const e = byId('eiendommer', eid) || ({} as Rec); const ex = S.oppgaver.filter(o => o.eiendomId === eid);
  const has = (k: string, a: string) => ex.some(o => o.malKey === k && (o.anleggId || '') === (a || ''));
  const rows: { k: string; a: string; def: boolean }[] = [];
  PROP_MALER.forEach(k => { if (!has(k, '')) rows.push({ k, a: '', def: !(k === 'energiattest' && +e.bta && +e.bta < 1000) && k !== 'radon' }); });
  S.anlegg.filter(a => a.eiendomId === eid).forEach(a => (KOMP[a.type]?.m || []).forEach(k => { if (!has(k, a.id)) rows.push({ k, a: a.id, def: true }); }));
  const [sel, setSel] = useState(() => rows.map(r => r.def)); const [d, setD] = useState(addDays(today(), 30)); const [busy, setBusy] = useState(false);
  const run = async () => { setBusy(true); const L = rows.filter((_, i) => sel[i]); for (const r of L) await save('oppgaver', taskFromMal(r.k, MALER, eid, r.a, d || today())); close(); toast(`${L.length} kontroller opprettet`); };
  return <>
    <div className="mh"><h2>Kontrollplan – {e.navn}</h2><button className="btn ghost sm" onClick={close}>✕</button></div>
    <div className="mb">
      <p className="muted" style={{ marginTop: 0 }}>{isNew ? 'Eiendommen er opprettet. Her er de faste kontrollene som gjelder alle næringseiendommer. Kontroller for tekniske anlegg legges til når du registrerer systemene.' : 'Forslag basert på eiendommen og registrerte systemer. Kontroller som allerede finnes, vises ikke.'}</p>
      {rows.length ? <>
        <div className="checks">{rows.map((r, i) => { const m = MALER[r.k]; return <label key={r.k + r.a}><input type="checkbox" checked={sel[i]} onChange={ev => setSel(s => s.map((x, j) => j === i ? ev.target.checked : x))} /><span><span className="ct">{m.n}{r.a && <> <span className="tag">{aNavn(r.a)}</span></>}</span><br /><span className="cs">{m.t} · {intTxt({ n: m.i[0], enhet: m.i[1] })} · {m.h}</span></span></label>; })}</div>
        <div className="form" style={{ marginTop: 14 }}><div className="fld half"><label>Første frist</label><input type="date" value={d} onChange={ev => setD(ev.target.value)} /></div><div className="fld half"><label>&nbsp;</label><div className="hint">Har du dato for sist utførte kontroll, registrer den etterpå med «Utført», så beregnes neste frist automatisk.</div></div></div>
      </> : <div className="empty"><b>Ingen nye forslag</b>Alle standardkontroller finnes allerede.</div>}
    </div>
    <div className="mf"><button className="btn" onClick={close}>{rows.length ? 'Hopp over' : 'Lukk'}</button>{rows.length > 0 && <button className="btn pri" disabled={busy} onClick={run}>Opprett valgte</button>}</div>
  </>;
}
export function generatePlan(eid: string, isNew?: boolean) { openModal({ wide: true, render: close => <GenPlanBody eid={eid} isNew={isNew} close={close} /> }); }

export function editOppgave(id?: string, preset: any = {}) {
  const o: Rec = id ? byId('oppgaver', id)! : { aktiv: true, ansvar: 'Eier', type: 'Egenkontroll', kategori: 'Bygg', intervall: { n: 1, enhet: 'år' }, nesteFrist: addDays(today(), 30), eiendomId: S.eiendommer[0]?.id, ...preset } as any;
  const v = { ...o, in: o.intervall?.n || 1, ie: o.intervall?.enhet || 'år' };
  const fields: Field[] = [
    { k: 'navn', label: 'Kontroll / oppgave', req: true },
    { k: 'eiendomId', label: 'Eiendom', type: 'select', options: eOptsSkriv, req: true, half: true },
    { k: 'anleggId', label: 'System', type: 'select', options: () => S.anlegg.filter(a => !v.eiendomId || a.eiendomId === (v as any).eiendomId).map(a => [a.id, eNavn(a.eiendomId) + ' – ' + aNavn(a.id)] as [string, string]), empty: '(Hele eiendommen)', half: true },
    { k: 'kategori', label: 'Fagområde', type: 'select', options: KATS, half: true }, { k: 'type', label: 'Type', type: 'select', options: TYPER, half: true },
    { k: 'in', label: 'Intervall', type: 'number', half: true }, { k: 'ie', label: 'Enhet', type: 'select', options: ENH, half: true },
    { k: 'nesteFrist', label: 'Neste frist', type: 'date', req: true, half: true }, { k: 'utfores', label: 'Utføres av / leverandør', half: true },
    { k: 'ansvar', label: 'Ansvarlig part', type: 'select', options: ['Eier', 'Leietaker'], half: true },
    { k: 'leietakerId', label: 'Leietaker', type: 'select', options: () => S.leietakere.map(l => [l.id, l.navn] as [string, string]), empty: '–', half: true, show: x => x.ansvar === 'Leietaker' },
    { k: 'hjemmel', label: 'Hjemmel / krav', hint: 'Lov, forskrift, standard eller avtale som utløser kontrollen' },
    { k: 'aktiv', label: 'Aktiv (vises i kontrollplanen)', type: 'checkbox' },
    { k: 'notat', label: 'Notater / sjekkpunkter', type: 'textarea', hint: 'Tas med i arbeidsordren til servicefirmaet' },
    { k: 'kompSjekk', label: 'Sjekkliste ved utkvittering', type: 'select', def: 'auto', show: x => !!x.anleggId && !x.komponentId,
      options: [['auto', 'Automatisk – per komponent (branndører, nødlys) eller for hele systemet (ventilasjon, heis …)'], ['pa', 'Per komponent – én sjekkliste for hver komponent i systemet'], ['av', 'Ingen sjekkliste – vanlig utkvittering']],
      hint: 'Malene ligger under Dokumenter → Sjekklistemaler og kan redigeres.' },
    { k: 'secAo', label: 'Arbeidsordre til servicefirma', type: 'sec', help: 'ko.arbeidsordre' },
    { k: 'aoEpost', label: 'E-post til servicefirma', type: 'email', half: true, ph: 'service@firma.no' },
    { k: 'aoAuto', label: 'Send automatisk før frist', type: 'checkbox', half: true },
    { k: 'aoDager', label: 'Antall dager før frist', type: 'number', half: true, show: x => !!x.aoAuto },
    { k: 'aoInfo', type: 'custom', show: x => !!x.aoAuto, render: x => { const e = String(x.aoEpost || '').trim(); const fr = x.nesteFrist; const sd = fr ? addDays(fr, -(+x.aoDager || 0)) : '';
      return <div className="note small" style={{ color: 'var(--ink)' }}>{!/^\S+@\S+\.\S+$/.test(e) ? 'Fyll inn e-post for å sende automatisk.' : fr ? <>Arbeidsordren sendes til <b>{e}</b> om morgenen <b>{fd(sd < today() ? today() : sd)}</b>{sd < today() ? ' (neste kjøring – fristen er nær)' : ''}, og deretter automatisk før hver ny frist.</> : 'Sett neste frist.'}</div>; } },
    { k: 'aoMelding', label: 'Fast melding i arbeidsordren (valgfritt)', type: 'textarea', show: x => !!x.aoAuto, ph: 'F.eks. Nøkkel i resepsjonen. Avtal tidspunkt med driftsleder Ola, tlf. 900 00 000.' }];
  const sysE = byId('anlegg', o.anleggId);
  Object.assign(v, { aoEpost: o.ao?.epost || sysE?.leverandorEpost || '', aoAuto: !!o.ao?.auto, aoDager: o.ao?.dager ?? 14, aoMelding: o.ao?.melding || '' });
  formModal({
    title: id ? 'Rediger kontroll' : 'Ny kontroll/oppgave', fields, values: v,
    extraFoot: close => id ? <button className="btn danger" onClick={async () => { if (await confirmBox('Slette kontrollen med historikk?')) { await removeDoc('oppgaver', id); close(); } }}>Slett</button> : null,
    onSave: async x => { x.intervall = { n: +x.in || 1, enhet: x.ie }; delete x.in; delete x.ie;
      const ep = String(x.aoEpost || '').trim(); if (x.aoAuto && !/^\S+@\S+\.\S+$/.test(ep)) { toast('Fyll inn gyldig e-post til servicefirmaet for automatisk sending'); return false; }
      x.ao = { epost: ep, auto: !!x.aoAuto, dager: Math.max(0, Math.min(365, +x.aoDager || 0)), melding: x.aoMelding || '' }; delete x.aoEpost; delete x.aoAuto; delete x.aoDager; delete x.aoMelding; delete x.aoInfo; if (x.anleggId) { const a = byId('anlegg', x.anleggId); if (a) x.eiendomId = a.eiendomId; } const kid = await save('oppgaver', { ...o, ...x }); toast('Kontroll lagret'); if (x.ao?.epost) import('../views/KontrollAo').then(m => m.sikreLokasjonsbilder(kid)); },
  });
}
export type UtforPreset = { sjekk?: any; fraRunde?: boolean; dato?: string; av?: string; res?: string; komm?: string; avs?: string[]; nyFrist?: string; filer?: any[]; kilde?: string; tilstand?: { tg?: string; kg?: string; komm?: string } | null };
export function utfor(id: string, pre?: UtforPreset) {
  const o = byId('oppgaver', id); if (!o) return;
  // Systemer med flere like komponenter (branndører, nødlys …): kvitteres komponent for komponent
  if (!pre?.fraRunde && !pre?.kilde && RundeRef.start(id)) return;
  const R: any = o.runde?.kp && Object.keys(o.runde.kp).length ? o.runde : null;
  const rAvvik = R ? Object.entries(R.kp).filter(([, s]: any) => (s.avvik || []).length) as [string, any][] : [];
  // Sjekkliste for hele systemet (ventilasjon, heis, sprinkler …) – fra mal, eller utfylt av servicefirmaet
  const SJ0 = !R ? (pre?.sjekk || sysSjekkFor(alleSjekkmaler(), o, o.anleggId ? byId('anlegg', o.anleggId)?.type : '')) : null;
  const tgMaal = o.komponentId ? byId('komponenter', o.komponentId) : o.anleggId ? byId('anlegg', o.anleggId) : null;
  const lt = sortBy(S.leietakere.filter(l => l.eiendomId === o.eiendomId), l => l.navn);
  const nyRad = () => ({ t: '', a: 'Middels', k: '', an: o.ansvar === 'Leietaker' ? 'Leietaker' : 'Eier', l: o.leietakerId || (lt.length === 1 ? lt[0].id : ''), u: o.ansvar === 'Leietaker' ? '' : '' });
  const fields: Field[] = [
    { k: 'dato', label: 'Utført dato', type: 'date', def: pre?.dato || today(), req: true, half: true }, { k: 'av', label: 'Utført av', def: pre?.av ?? (o.utfores && state.me?.rolle !== 'tekniker' ? o.utfores : (state.me?.navn || o.utfores || '')), half: true },
    { k: 'res', label: 'Resultat', type: 'select', options: ['OK – ingen avvik', 'Avvik funnet', 'Ikke utført / utsatt'], def: pre?.res || 'OK – ingen avvik', half: true },
    { k: 'nyFrist', label: 'Ny frist (beregnes automatisk)', type: 'date', def: pre?.nyFrist || '', half: true, hint: 'La stå tom for automatisk beregning ut fra intervallet' },
    ...(SJ0 ? [{ k: 'sjekk', type: 'custom', def: SJ0, show: (x: any) => x.res !== 'Ikke utført / utsatt',
      render: (x: any, set: any) => <SysSjekkVelger v={x.sjekk} set={sj => set({ sjekk: sj, ...(sysSjekkAvvik(sj).length && x.res === 'OK – ingen avvik' ? { res: 'Avvik funnet', avs: [] } : {}) })} /> } as Field] : []),
    { k: 'avs', type: 'custom', label: SJ0 ? 'Andre avvik (punkter med avvik i sjekklisten registreres automatisk)' : 'Avvik fra kontrollen – ett avvik per linje', show: x => x.res === 'Avvik funnet', def: pre?.avs?.length ? pre.avs.map(t => ({ ...nyRad(), t, an: 'Eier' })) : [nyRad()], hint: 'Hver linje blir et eget avvik i avvikslisten, med kobling til denne kontrollen. Velg hvem som skal rette avviket. Bruk kommentarfeltet bare til utfyllende informasjon.',
      render: (v, set) => { const L: any[] = v.avs || []; const kc = S.komponenter.filter(k => o.anleggId && k.anleggId === o.anleggId); const upd = (i: number, p: any) => set({ avs: L.map((x, j) => j === i ? { ...x, ...p } : x) });
        const sel = { border: '1px solid var(--line2)', borderRadius: 8, padding: 7 } as React.CSSProperties;
        return <>{L.map((r, i) => <div key={i} className="avrad">
          <div className="arow"><input placeholder={`Avvik ${i + 1}: beskriv hva som er feil`} value={r.t} autoFocus={i === L.length - 1 && i > 0} onChange={e => upd(i, { t: e.target.value })} />
            <select value={r.a} onChange={e => upd(i, { a: e.target.value })} title="Alvorlighet">{AV_ALV.map(a => <option key={a}>{a}</option>)}</select>
            {L.length > 1 && <button type="button" className="btn ghost sm" title="Fjern linjen" onClick={() => set({ avs: L.filter((_, j) => j !== i) })}>✕</button>}</div>
          <div className="arow sub"><span className="small muted">Utbedres av</span>
            <select value={r.an} onChange={e => upd(i, { an: e.target.value })}>{UTBEDRER.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            {r.an === 'Leietaker' && lt.length > 0 && <select value={r.l} onChange={e => upd(i, { l: e.target.value })}><option value="">– velg leietaker –</option>{lt.map(l => <option key={l.id} value={l.id}>{l.navn}</option>)}</select>}
            {r.an === 'Leverandør/entreprenør' && <input placeholder="Firma (f.eks. servicefirmaet)" value={r.u} onChange={e => upd(i, { u: e.target.value })} />}
            {kc.length > 0 && <select value={r.k} onChange={e => upd(i, { k: e.target.value })} title="Komponent"><option value="">Komponent –</option>{kc.map(k => <option key={k.id} value={k.id}>{'-' + k.kode + pad(k.lop)} {k.navn}</option>)}</select>}
          </div></div>)}
          <button type="button" className="btn sm" onClick={() => set({ avs: [...L, nyRad()] })}>+ Legg til avvik</button></>; } },
    ...(R ? [{ k: 'rundeInfo', type: 'custom', label: 'Sjekkliste per komponent', render: () => <RundeRef.Oppsummering r={R} /> } as Field] : []),
    { k: 'komm', label: 'Kommentar', type: 'textarea', def: pre?.komm || '' },
    ...(tgMaal ? [{ k: 'tl', type: 'custom', def: pre?.tilstand || {}, render: (x: any, set: any) => <>
      <TgKgVelger v={x.tl || {}} set={t => set({ tl: t })} naa={{ tg: tgMaal.tg, kg: tgMaal.kg }} hva={(o.komponentId ? kNavn(o.komponentId) : aNavn(o.anleggId))} intern />
      {tgAvviker(x.tl, tgMaal) && <label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={x.tlBruk !== false} onChange={e => set({ tlBruk: e.target.checked })} style={{ width: 'auto' }} />Oppdater tilstanden på {o.komponentId ? 'komponenten' : 'systemet'} til {tgTekst(x.tl)}</label>}</> } as Field] : []),
    ...(pre?.filer?.length ? [{ k: 'filerInfo', type: 'custom', label: 'Rapport og vedlegg fra servicefirmaet', render: () => <div className="small">{pre.filer!.map((f: any) => <div key={f.path}><FileLink fil={f} /></div>)}<div className="muted">Lagres som dokumenter på kontrollen.</div></div> } as Field] : []),
    { k: 'fil', label: pre?.filer?.length ? 'Ekstra rapport / sjekkliste (valgfritt)' : 'Rapport / sjekkliste', type: 'file' },
  ];
  formModal({
    title: (pre?.kilde ? 'Godkjenn rapport: ' : 'Registrer utført: ') + o.navn, fields, saveTxt: pre?.kilde ? 'Godkjenn og registrer' : 'Registrer',
    onSave: async x => {
      const avs = x.res === 'Avvik funnet' ? (x.avs || []).filter((a: any) => a.t.trim()) : [];
      if (avs.some((a: any) => a.an === 'Leietaker' && lt.length > 0 && !a.l)) { toast('Velg hvilken leietaker som skal rette avviket'); return false; }
      const sj = x.res !== 'Ikke utført / utsatt' && x.sjekk && Object.keys(x.sjekk.svar || {}).length ? x.sjekk : null;
      if (sj && sj.punkter.some((pt: any) => !sj.svar[pt.id])) { toast('Svar på alle punktene i sjekklisten (OK, Avvik eller I.R.)'); return false; }
      const sjAv = sysSjekkAvvik(sj);
      if (sjAv.length && x.res === 'OK – ingen avvik') x.res = 'Avvik funnet';
      if (x.res === 'Avvik funnet' && !avs.length && !rAvvik.length && !sjAv.length) { toast('Skriv inn avvikene i feltene under «Avvik fra kontrollen» – én linje per avvik'); return false; }
      let dokId = '';
      if (x.fil) { const f = await uploadFile(x.fil, o.eiendomId); if (f) dokId = await save('dokumenter', { eiendomId: o.eiendomId, leietakerId: '', type: o.type === 'Egenkontroll' ? 'Egenkontrollskjema' : 'Servicerapport', tittel: o.navn + ' – ' + fd(x.dato), dato: x.dato, fil: f, oppgaveId: o.id }); }
      const dokIds: string[] = [];
      for (const f of pre?.filer || []) dokIds.push(await save('dokumenter', { eiendomId: o.eiendomId, leietakerId: '', type: o.type === 'Egenkontroll' ? 'Egenkontrollskjema' : 'Servicerapport', tittel: o.navn + ' – ' + fd(x.dato) + (pre!.filer!.length > 1 ? ' – ' + f.navn : ''), dato: x.dato, fil: f, oppgaveId: o.id, anleggIds: o.anleggId ? [o.anleggId] : [] }));
      if (!dokId && dokIds.length) dokId = dokIds[0];
      const ids: string[] = [];
      for (const t of sjAv) avs.push({ ...nyRad(), t, l: o.ansvar === 'Leietaker' ? (o.leietakerId || nyRad().l) : '' });
      for (const a of avs) ids.push(await save('avvik', { tittel: a.t.trim(), eiendomId: o.eiendomId, anleggId: o.anleggId || '', komponentId: a.k || '', alv: a.a, status: 'Ny', kilde: o.type === 'Egenkontroll' ? 'Egenkontroll' : 'Servicerapport', oppgaveId: o.id, ansvar: a.an || 'Eier', leietakerId: a.an === 'Leietaker' ? (a.l || '') : '', utbedresAv: a.an === 'Leverandør/entreprenør' ? (a.u || '') : '', oppdaget: x.dato, frist: addDays(x.dato, AV_FRIST[a.a]), logg: [{ t: new Date().toISOString(), s: 'Ny', k: 'Registrert fra kontroll: ' + o.navn, av: state.me?.navn }] }));
      // Avvik fra komponentsjekklisten: de som er registrert i appen finnes allerede, de fra servicefirmaets lenke opprettes nå
      const kpNy: Record<string, any> = R ? { ...R.kp } : {};
      for (const [kid, s] of rAvvik) {
        if (s.avvikIds?.length) { ids.push(...s.avvikIds); continue; }
        const k = byId('komponenter', kid); const kl = k ? kNavn(kid) : 'Komponent';
        const aid = await save('avvik', { tittel: `${kl}: ${s.avvik.join('; ')}`.slice(0, 200), eiendomId: o.eiendomId, anleggId: o.anleggId || '', komponentId: k ? kid : '', alv: 'Middels', status: 'Ny', kilde: 'Servicerapport', oppgaveId: o.id,
          ansvar: o.ansvar === 'Leietaker' ? 'Leietaker' : 'Eier', leietakerId: o.ansvar === 'Leietaker' ? (o.leietakerId || '') : '', beskrivelse: s.avvik.map((t: string) => '• ' + t).join('\n') + (s.komm ? '\n\n' + s.komm : ''),
          plassering: k?.plassering || '', pos: k?.pos?.tegningId ? k.pos : null, vedlegg: s.filer || [], oppdaget: x.dato, frist: addDays(x.dato, AV_FRIST.Middels),
          logg: [{ t: new Date().toISOString(), s: 'Ny', k: `Registrert fra komponentkontroll: ${o.navn}${s.av ? ' (' + s.av + (s.firma ? ', ' + s.firma : '') + ')' : ''}`, av: state.me?.navn }] });
        ids.push(aid); kpNy[kid] = { ...s, avvikIds: [aid] };
      }
      const h = [{ dato: x.dato, av: x.av, res: x.res, komm: x.komm, dokId, dokIds: dokIds.length ? dokIds : undefined, avvik: ids, regAv: state.me?.id, kilde: pre?.kilde, runde: R ? { ...R, kp: kpNy } : undefined, sjekk: sj || undefined }, ...(o.historikk || [])].slice(0, 80);
      const upd: Rec = { ...byId('oppgaver', id)!, historikk: h };
      if (R) delete upd.runde;
      if (pre?.kilde) delete upd.innrapport;
      if (x.res !== 'Ikke utført / utsatt') { upd.sistUtfort = x.dato; upd.nesteFrist = x.nyFrist || addInt(x.dato, o.intervall); } else if (x.nyFrist) upd.nesteFrist = x.nyFrist;
      await save('oppgaver', upd);
      // Tilstand: oppdater systemet/komponenten hvis vurderingen avviker og brukeren har valgt det
      if (tgMaal && x.tl?.tg && tgAvviker(x.tl, tgMaal) && x.tlBruk !== false && kanRedigereE(o.eiendomId)) {
        const m = byId(o.komponentId ? 'komponenter' : 'anlegg', tgMaal.id)!; const n: Rec = { ...m, tg: x.tl.tg, kg: x.tl.kg || '', tgdato: x.dato, tgVurdertAv: x.av || '', tgKomm: x.tl.komm || m.tgKomm || '' };
        if (n.tgForslag) delete n.tgForslag; await save(o.komponentId ? 'komponenter' : 'anlegg', n);
      } else if (tgMaal && x.tl?.tg && !tgAvviker(x.tl, tgMaal) && kanRedigereE(o.eiendomId)) {
        const m = byId(o.komponentId ? 'komponenter' : 'anlegg', tgMaal.id)!; await save(o.komponentId ? 'komponenter' : 'anlegg', { ...m, tgdato: x.dato, tgVurdertAv: x.av || m.tgVurdertAv || '' });
      }
      toast(avs.length ? `Registrert med ${avs.length} avvik` : 'Registrert – neste frist ' + fd(upd.nesteFrist));
    },
  });
}
// Settes av views/KomponentRunde (unngår sirkulær import)
export const RundeRef: { start: (id: string) => boolean; Oppsummering: (p: { r: any }) => any } = { start: () => false, Oppsummering: () => null };
// Settes av views/KontrollAo for å unngå sirkulær import
export const KoPanelRef: { C: (p: { o: Rec; close: () => void }) => any } = { C: () => null };
// Settes av views/Sjekkliste for å unngå sirkulær import
export const vurderPliktRef: { f?: (lid: string, idx: number) => void } = {};
// Underpunkt per leietaker for eierkontroller som er koblet til leietakernes plikter
function IkUnderpunkter({ o, close }: { o: Rec; close: () => void }) {
  useStore();
  const d = ikDekning(o, MALER); if (!d) return null;
  return <>
    <h3 style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 4 }}>Leietakernes dokumentasjon<Hjelp id="ik.underpunkt" size={15} />{o.malKey === 'brannovelse_bygg' && <Hjelp id="brannovelse" size={15} />}
      <span className="grow" /><Chip c={d.n && d.nOk === d.n ? 'green' : d.nOk ? 'amber' : 'red'}>{d.nOk} av {d.n} leietakere</Chip></h3>
    <p className="small muted" style={{ marginTop: -4 }}>Gjelder dokumentasjon bekreftet {d.fra ? 'fra ' + fd(d.fra) : 'i perioden'}. Kontrollen kvitteres ut automatisk når alle leietakere er dokumentert.</p>
    {d.n ? <div className="tbl-wrap"><table><thead><tr><th>Leietaker</th><th>Plikter</th><th /></tr></thead><tbody>
      {d.rader.map(r => <tr key={r.l.id}>
        <td style={{ verticalAlign: 'top', whiteSpace: 'nowrap' }}><span style={{ color: r.ok ? 'var(--green)' : 'var(--red)', fontWeight: 700, marginRight: 6 }}>{r.ok ? '✓' : '○'}</span><a href={'#/leietaker/' + r.l.id} onClick={() => close()}>{r.l.navn}</a>
          <div className="small muted" style={{ paddingLeft: 18 }}>{r.pl.filter(x => x.ok).length} av {r.pl.length} dokumentert</div></td>
        <td>{r.pl.length ? r.pl.map(x => <div key={x.idx} className="small" style={{ display: 'flex', gap: 6, alignItems: 'baseline', marginBottom: 3 }}>
          <span style={{ color: x.ok ? 'var(--green)' : 'var(--muted)' }}>{x.ok ? '✓' : '○'}</span>
          <a href="#" onClick={e => { e.preventDefault(); x.p.status === 'til_godkjenning' && x.p.innsendt ? vurderPliktRef.f?.(r.l.id, x.idx) : bekreftPlikt(r.l.id, x.idx); }} style={{ color: 'inherit' }}>{x.p.navn}</a>{x.p.status === 'til_godkjenning' && x.p.innsendt && <Chip c="blue">til godkjenning</Chip>}
          <span className="muted" style={{ whiteSpace: 'nowrap' }}>{x.p.sist ? fd(x.p.sist) + (!x.ok && x.s.o === 0 ? ' · forrige periode' : x.s.o === 2 ? ' · forfalt' : '') : 'mangler'}</span></div>)
          : <span className="small muted">Ingen relevante plikter registrert – <a href={'#/leietaker/' + r.l.id} onClick={() => close()}>legg til</a></span>}</td>
        <td style={{ verticalAlign: 'top' }}>{canEdit() && r.pl.some(x => !x.ok) && <button className="btn sm" onClick={() => { const f = r.pl.find(x => !x.ok)!; bekreftPlikt(r.l.id, f.idx); }}>Registrer</button>}</td></tr>)}
    </tbody></table></div> : <p className="muted small">Ingen aktive leietakere på eiendommen.</p>}
  </>;
}

// Kvitter ut eierkontroller automatisk når alle leietakere har dokumentert de koblede pliktene i perioden
let autoKjorer = false;
export async function autoKvitterIK() {
  if (autoKjorer || !canEdit()) return; autoKjorer = true;
  try {
    for (const o of S.oppgaver) {
      if (o.aktiv === false || !MALER[o.malKey]?.pl) continue;
      const d = ikDekning(o, MALER); if (!d || !d.n || d.nOk < d.n) continue;
      const dato = d.rader.flatMap(r => r.pl.map(x => x.p.sist)).filter(Boolean).sort().pop() || today();
      const komm = `Kvittert ut automatisk: alle ${d.n} leietakere har dokumentert (${d.rader.map(r => r.l.navn).join(', ')}).`;
      const h = [{ dato, av: 'Automatisk', res: 'OK – ingen avvik', komm, auto: true }, ...(o.historikk || [])].slice(0, 80);
      await save('oppgaver', { ...o, historikk: h, sistUtfort: dato, nesteFrist: addInt(dato, o.intervall) });
      toast(`«${o.navn}» er kvittert ut automatisk – alle leietakere har dokumentert`);
    }
  } finally { autoKjorer = false; }
}

/** Rediger eller slett en registrert utførelse i kontrollens historikk */
export function redigerHistorikk(oid: string, idx: number) {
  const o = byId('oppgaver', oid); const h = o?.historikk?.[idx]; if (!o || !h) return;
  formModal({
    title: 'Rediger utført – ' + o.navn, saveTxt: 'Lagre',
    fields: [{ k: 'dato', label: 'Utført dato', type: 'date', req: true, half: true }, { k: 'av', label: 'Utført av', half: true },
      { k: 'res', label: 'Resultat', type: 'select', options: ['OK – ingen avvik', 'Avvik funnet', 'Ikke utført / utsatt'], half: true },
      ...(idx === 0 ? [{ k: 'nyFrist', label: 'Beregn neste frist på nytt fra denne datoen', type: 'checkbox', half: true } as Field] : []),
      { k: 'komm', label: 'Kommentar', type: 'textarea' }],
    values: { dato: h.dato, av: h.av || '', res: h.res || 'OK – ingen avvik', komm: h.komm || '', nyFrist: false },
    extraFoot: close => <button className="btn danger" onClick={async () => { if (!await confirmBox('Slette denne registreringen fra historikken? Rapporter og avvik beholdes.', 'Slett')) return;
      const f = byId('oppgaver', oid)!; const L = (f.historikk || []).filter((_: any, j: number) => j !== idx); const sist = L.find((x: any) => x.res !== 'Ikke utført / utsatt');
      await save('oppgaver', { ...f, historikk: L, sistUtfort: sist?.dato || '' }); toast('Registreringen er slettet'); close(); }}>Slett</button>,
    onSave: async x => {
      const f = byId('oppgaver', oid)!; const L = (f.historikk || []).slice(); L[idx] = { ...L[idx], dato: x.dato, av: x.av, res: x.res, komm: x.komm, endret: { t: new Date().toISOString(), av: state.me?.navn || state.me?.epost } };
      L.sort((a: any, b: any) => String(b.dato).localeCompare(String(a.dato)));
      const sist = L.find((y: any) => y.res !== 'Ikke utført / utsatt'); const upd: Rec = { ...f, historikk: L, sistUtfort: sist?.dato || '' };
      if (x.nyFrist && sist) upd.nesteFrist = addInt(sist.dato, f.intervall);
      await save('oppgaver', upd); toast(x.nyFrist ? 'Lagret – ny frist ' + fd(upd.nesteFrist) : 'Lagret');
    },
  });
}
export function visOppgave(id: string) {
  const o = byId('oppgaver', id); if (!o) return;
  showModal(o.navn, close => <>
    <dl className="dl"><dt>Eiendom</dt><dd>{eNavn(o.eiendomId)}</dd>{o.anleggId && <><dt>System</dt><dd>{aNavn(o.anleggId)}</dd></>}<dt>Type</dt><dd>{o.type} · {o.kategori}</dd><dt>Intervall</dt><dd>{intTxt(o.intervall)}</dd><dt>Neste frist</dt><dd><DueChip s={o.nesteFrist} /></dd><dt>Utføres av</dt><dd>{o.utfores || '–'}</dd><dt>Ansvar</dt><dd>{o.ansvar || 'Eier'}{o.leietakerId ? ' – ' + lNavn(o.leietakerId) : ''}</dd><dt>Hjemmel</dt><dd>{o.hjemmel || '–'}</dd>{o.notat && <><dt>Notater</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{o.notat}</dd></>}</dl>
    <KoPanelRef.C o={o} close={close} />
    <IkUnderpunkter o={o} close={close} />
    <h3 style={{ marginTop: 18 }}>Historikk</h3>
    {(o.historikk || []).length ? <div className="log">{o.historikk.map((h: any, i: number) => { const d = h.dokId && byId('dokumenter', h.dokId); return <div key={i}><span className="lt">{fd(h.dato)}</span> · <b>{h.res}</b>{h.av ? ' · ' + h.av : ''}{kanDrifteE(o.eiendomId) && <> · <a href="#" className="small" onClick={e => { e.preventDefault(); redigerHistorikk(o.id, i); }}>rediger</a></>}{h.komm && <><br />{h.komm}</>}{h.runde && <div style={{ marginTop: 4 }}><RundeRef.Oppsummering r={h.runde} /></div>}{h.sjekk && <SysSjekkKort s={h.sjekk} />}{d?.fil && <><br /><FileLink fil={d.fil} /></>}{(() => { const n = Math.max((h.avvik || []).length, S.avvik.filter(a => a.oppgaveId === o.id && a.oppdaget === h.dato).length); return n > 0 ? <><br /><span className="muted small">{n} avvik registrert</span></> : null; })()}{!(h.avvik || []).length && !S.avvik.some(a => a.oppgaveId === o.id && a.oppdaget === h.dato) && h.res === 'Avvik funnet' && <><br /><a href="#" className="small" onClick={e => { e.preventDefault(); close(); editAvvik(undefined, { eiendomId: o.eiendomId, anleggId: o.anleggId || '', kilde: o.type === 'Egenkontroll' ? 'Egenkontroll' : 'Servicerapport', oppgaveId: o.id, oppdaget: h.dato, beskrivelse: h.komm || '', ansvar: o.ansvar || 'Eier', leietakerId: o.leietakerId || '' }); }}>Ingen avvik ble opprettet – registrer avvik fra denne kontrollen</a></>}</div>; })}</div> : <p className="muted">Ikke registrert utført ennå.</p>}
  </>, { foot: close => <>{canEdit() && <button className="btn" onClick={() => { close(); editOppgave(id); }}>Rediger</button>}<span className="grow" /><button className="btn pri" onClick={() => { close(); utfor(id); }}>Registrer utført</button></> });
}

// ================= AVVIK =================
export function editAvvik(id?: string, preset: any = {}) {
  const a: Rec = id ? byId('avvik', id)! : { status: 'Ny', alv: 'Middels', kilde: 'Eier/drift', ansvar: 'Eier', oppdaget: today(), eiendomId: S.eiendommer[0]?.id, ...preset } as any;
  const staff = isStaff();
  const fields: Field[] = [
    { k: 'tittel', label: 'Avvik (kort beskrivelse)', req: true },
    { k: 'eiendomId', label: 'Eiendom', type: 'select', options: eOptsDrift, req: true, half: true },
    { k: 'anleggId', label: 'System', type: 'select', options: () => S.anlegg.map(x => [x.id, eNavn(x.eiendomId) + ' – ' + aNavn(x.id)] as [string, string]), empty: '–', half: true, hint: 'Hovedsystemet avviket gjelder – følger med i arbeidsordren' },
    { k: 'komponentId', label: 'Komponent (TFM)', type: 'select', options: () => sortBy(S.komponenter, c => kNavn(c.id)).map(c => [c.id, eNavn(c.eiendomId) + ' – ' + kNavn(c.id)] as [string, string]), empty: '–' },
    { k: 'alv', label: 'Alvorlighet', type: 'select', options: AV_ALV, half: true }, { k: 'status', label: 'Status', type: 'select', options: AV_STATUS, half: true },
    { k: 'kilde', label: 'Kilde', type: 'select', options: AV_KILDE, half: true }, { k: 'meldtAv', label: 'Meldt av / referanse', half: true, ph: 'Navn, rapportnr., tilsynsref.' },
    { k: 'ansvar', label: 'Ansvarlig for utbedring', type: 'select', options: UTBEDRER, half: true },
    { k: 'utbedresAv', label: 'Serviceselskap / leverandør', half: true, show: x => x.ansvar === 'Leverandør/entreprenør', ph: 'Firma som skal rette avviket' },
    ...(canEdit() ? [{ k: 'leietakerId', label: 'Leietaker', type: 'select', options: (v?: any) => S.leietakere.filter(l => !v?.eiendomId || l.eiendomId === v.eiendomId).map(l => [l.id, l.navn] as [string, string]), empty: '–', half: true, show: (x: any) => ['Leietaker', 'Felles'].includes(x.ansvar) || !!x.leietakerId, hint: 'Leietakeren som skal utbedre, eller som deler ansvaret' } as Field] : []),
    { k: 'oppdaget', label: 'Oppdaget dato', type: 'date', half: true }, { k: 'frist', label: 'Frist for utbedring', type: 'date', half: true, hint: id ? '' : 'Tom = foreslått frist ut fra alvorlighet' },
    { k: 'planlagt', label: 'Planlagt utbedret', type: 'date', half: true, show: x => ['Planlagt', 'Under utbedring', 'Utsatt'].includes(x.status) },
    ...(canEdit() ? [{ k: 'kost', label: 'Estimert kostnad (kr)', type: 'number', half: true } as Field] : []),
    { k: 'beskrivelse', label: 'Beskrivelse av avviket og tiltak', type: 'textarea', ph: 'Hva er feil, hvor, omfang og anbefalt tiltak' },
    { k: 'secPos', label: 'Plassering på etasjeplan', type: 'sec' },
    { k: 'pos', type: 'custom', render: (v, set) => v.eiendomId ? <PosVelger eiendomId={v.eiendomId} value={v.pos || null} set={p => set({ pos: p })} ro={!staff}
        merker={(() => { const r = v.komponentId ? byId('komponenter', v.komponentId) : v.anleggId ? byId('anlegg', v.anleggId) : null; return r ? plasserteFor(r).map(x => ({ ...x.pos, t: x.navn || '' })) : []; })()} /> : <div className="small muted">Velg eiendom først.</div> },
    { k: 'plassering', label: 'Plassering i tekst (valgfritt)', ph: 'F.eks. 2. etg, korridor ved trapp B, i himling' },
    { k: 'secFoto', label: 'Bilder og vedlegg', type: 'sec' },
    { k: 'bilder', type: 'custom', def: [], render: (v, set) => <BildeVelger filer={v.bilder || []} set={f => set({ bilder: f })} /> },
    { k: 'komm', label: id ? 'Kommentar til denne endringen (legges i loggen)' : 'Kommentar', type: 'textarea', ph: id ? 'F.eks. hvorfor avviket utsettes eller avvises' : '' }];
  let touchedFrist = false; const lukkRef: { c?: () => void } = {};
  lukkRef.c = formModal({
    title: id ? `Avvik #${a.nr || ''}` : 'Nytt avvik', fields, values: { ...a, komm: '', bilder: [] }, wide: true, readOnly: !staff,
    onChange: (k, v) => { if (k === 'frist') touchedFrist = true; if (k === 'komponentId' && v.komponentId) { const c = byId('komponenter', v.komponentId); if (c) return { anleggId: c.anleggId, eiendomId: c.eiendomId }; } if (!id && !touchedFrist && (k === 'alv' || k === 'oppdaget')) return { frist: addDays(v.oppdaget || today(), AV_FRIST[v.alv]) }; },
    bottom: () => <>
      {id && staff && <AoPanel id={id} lukk={() => lukkRef.c?.()} />}
      {!id && <p className="small muted" style={{ marginTop: 12 }}>Etter lagring kan avviket tildeles en bruker eller sendes som arbeidsordre på e-post.</p>}
      {a.oppgaveId && byId('oppgaver', a.oppgaveId) && <p className="small muted" style={{ marginTop: 12 }}>Registrert fra kontroll: <a href="#" onClick={e => { e.preventDefault(); visOppgave(a.oppgaveId); }}>{byId('oppgaver', a.oppgaveId)!.navn}</a></p>}
      {((id && byId('avvik', id)) || a).vedlegg?.length > 0 && <><h3 style={{ marginTop: 14 }}>Registrerte bilder og vedlegg</h3><VedleggGalleri filer={((id && byId('avvik', id)) || a).vedlegg} /></>}
      {id && ((byId('avvik', id) || a).logg || []).length > 0 && <><h3 style={{ marginTop: 18 }}>Logg</h3><div className="log">{(byId('avvik', id) || a).logg.slice().reverse().map((l: any, i: number) => <div key={i}><span className="lt">{new Date(l.t).toLocaleString('nb-NO', { dateStyle: 'short', timeStyle: 'short' })}{l.av ? ' · ' + l.av : ''}</span> · <StChip s={l.s} />{l.k && <><br />{l.k}</>}</div>)}</div></>}
      {id && staff && <details style={{ marginTop: 10 }}><summary className="small">Full endringslogg fra databasen</summary><div style={{ marginTop: 8 }}><HendelseListe radId={id} /></div></details>}
    </>,
    extraFoot: close => id && canEdit() ? <button className="btn danger" onClick={async () => { if (await confirmBox('Slette avviket permanent? Vanligvis bør avvik heller settes til «Avvist» eller «Lukket» slik at historikken bevares.')) { await removeDoc('avvik', id); close(); } }}>Slett</button> : null,
    onSave: async x => {
      const komm = x.komm; const bilder: File[] = x.bilder || []; delete x.komm; delete x.bilder; delete x.secPos; delete x.secFoto;
      if (x.ansvar !== 'Leietaker' && x.ansvar !== 'Felles' && !canEdit()) delete x.leietakerId;
      if (x.komponentId) { const kc = byId('komponenter', x.komponentId); if (kc) { x.anleggId = kc.anleggId; x.eiendomId = kc.eiendomId; } }
      const base: Rec = id ? { ...(byId('avvik', id) || a) } : a; // ferske felt (plassering, tildeling, vedlegg, logg) kan være endret mens skjemaet var åpent
      const o: Rec = { ...base, ...x }; if (!o.frist) o.frist = addDays(o.oppdaget || today(), AV_FRIST[o.alv]);
      if (!o.id) o.id = crypto.randomUUID();
      const nye: any[] = []; for (const f of bilder) { const r = await uploadFile(f, o.eiendomId, undefined, undefined, 'ao/' + (o.id || 'ny')); if (r) nye.push(r); }
      if (nye.length) o.vedlegg = [...(base.vedlegg || []), ...nye];
      if (x.pos === '') o.pos = base.pos || null;
      o.logg = (base.logg || []).slice(); const av = state.me?.navn || state.me?.epost;
      if (nye.length && id) o.logg.push({ t: new Date().toISOString(), s: o.status, k: `La til ${nye.length} bilde${nye.length > 1 ? 'r' : ''}/vedlegg`, av });
      if (id && JSON.stringify(o.pos || null) !== JSON.stringify(base.pos || null)) o.logg.push({ t: new Date().toISOString(), s: o.status, k: o.pos ? 'Plassert på ' + (byId('tegninger', o.pos.tegningId)?.navn || 'tegning') : 'Plassering fjernet', av });
      if (!id) o.logg.push({ t: new Date().toISOString(), s: o.status, k: komm || 'Registrert', av });
      else if (o.status !== base.status || komm) o.logg.push({ t: new Date().toISOString(), s: o.status, k: (o.status !== base.status ? `Status: ${base.status} → ${o.status}` : '') + (komm ? (o.status !== base.status ? '. ' : '') + komm : ''), av });
      if (AV_LUKKET.includes(o.status) && !AV_LUKKET.includes(base.status)) o.lukket = today();
      if (o.anleggId || o.komponentId || o.ao) o.ao = aoSnapshot(o);
      if (!AV_LUKKET.includes(o.status)) delete o.lukket;
      await save('avvik', o); toast('Avvik lagret');
    },
  });
}

// ================= DOKUMENT =================
export function editDok(id?: string, preset: any = {}) {
  const d: Rec = id ? byId('dokumenter', id)! : { dato: today(), type: 'Annet', eiendomId: S.eiendommer[0]?.id, ...preset } as any;
  const ro = !!id && !canEdit();
  const fields: Field[] = [
    { k: 'tittel', label: 'Tittel', req: true },
    { k: 'type', label: 'Dokumenttype', type: 'select', options: canEdit() ? DOK_TYPER : DOK_TYPER.filter(t => !['Leieavtale', 'Forsikringspolise', 'Samordningsavtale', 'Leietakers IK-dokumentasjon'].includes(t)), half: true },
    { k: 'ns', label: 'NS 3451 dokumentgruppe', type: 'select', half: true, options: () => Object.entries(NS_DOK).map(([k, n]) => [k, k + ' ' + n] as [string, string]), empty: '(automatisk ut fra type)', help: 'ns.dok' },
    { k: 'eiendomId', label: 'Eiendom', type: 'select', options: eOptsDrift, req: true, half: true },
    ...(canEdit() ? [{ k: 'leietakerId', label: 'Leietaker (valgfritt)', type: 'select', options: () => S.leietakere.map(l => [l.id, l.navn] as [string, string]), empty: '–', half: true } as Field] : []),
    { k: 'anleggId', label: 'System (valgfritt)', type: 'select', options: () => S.anlegg.map(x => [x.id, eNavn(x.eiendomId) + ' – ' + aNavn(x.id)] as [string, string]), empty: '–', half: true },
    { k: 'anleggIds', type: 'custom', label: 'Avtalen gjelder også disse systemene', render: (v, set) => { if (v.type !== 'Serviceavtale') return null; const L = sortBy(S.anlegg.filter(x => x.eiendomId === v.eiendomId && x.id !== v.anleggId), x => aNavn(x.id)); const sel: string[] = v.anleggIds || [];
      return L.length ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 14px' }}>{L.map(x => <label key={x.id} className="small" style={{ display: 'flex', gap: 5, alignItems: 'center' }}><input type="checkbox" checked={sel.includes(x.id)} onChange={ev => set({ anleggIds: ev.target.checked ? [...sel, x.id] : sel.filter(i => i !== x.id) })} />{aNavn(x.id)}{SERVICEAVTALE[x.type]?.n === 'lov' && <span style={{ color: 'var(--blue)' }}>●</span>}</label>)}</div> : <span className="small muted">Ingen andre systemer på eiendommen.</span>; } },
    { k: 'dato', label: 'Dokumentdato', type: 'date', half: true }, { k: 'gyldigTil', label: 'Gyldig til / revideres', type: 'date', half: true },
    { k: 'plassering', label: 'Plassering / lenke', ph: 'F.eks. Arkiv perm 3, SharePoint, FDV-portal', hint: 'Brukes om dokumentet ligger et annet sted' },
    ...(!ro ? [{ k: 'fil', label: d.fil ? 'Erstatt fil' : 'Last opp fil (maks 50 MB)', type: 'file' } as Field] : []),
    { k: 'notat', label: 'Notat', type: 'textarea' }];
  formModal({
    title: ro ? d.tittel : id ? 'Rediger dokument' : 'Nytt dokument', fields, values: { ...d, fil: null }, readOnly: ro,
    top: d.fil ? <p style={{ marginTop: 0 }}>Fil: <FileLink fil={d.fil} /></p> : undefined,
    extraFoot: close => id && canEdit() ? <button className="btn danger" onClick={async () => { if (await confirmBox('Slette dokumentet? Filen fjernes permanent.')) { await deleteFile(d.fil); await removeDoc('dokumenter', id); close(); } }}>Slett</button> : null,
    onSave: async x => {
      const fil = x.fil; delete x.fil; const o: Rec = { ...d, ...x };
      if (fil) { const f = await uploadFile(fil, o.eiendomId, o.leietakerId || undefined); if (!f) return false; if (d.fil) await deleteFile(d.fil); o.fil = f; }
      if (!o.tittel) o.tittel = o.type; await save('dokumenter', o); toast('Dokument lagret');
    },
  });
}
export async function toggleDokNA(eid: string, type: string) { const e = byId('eiendommer', eid)!; const na = (e.dokNA || []).slice(); const i = na.indexOf(type); if (i >= 0) na.splice(i, 1); else na.push(type); await save('eiendommer', { ...e, dokNA: na }); }

// ================= LEIETAKER =================
export function editLeietaker(id?: string, preset: any = {}) {
  const l: Rec = id ? byId('leietakere', id)! : { varsel: 12, eiendomId: S.eiendommer[0]?.id, ...preset } as any;
  const fields: Field[] = [
    { k: 'sokLt', type: 'custom', label: 'Hent fra Brønnøysundregistrene', render: (v, set) => <EnhetSok onPick={async en => {
      set({ navn: en.navn, orgnr: en.orgnr, virksomhet: v.virksomhet || virksomhetFraNaering(en.naeringKode), epost: v.epost || en.epost || '', tlf: v.tlf || en.telefon || '' });
      const b = await brregData(en.orgnr).catch(() => null); if (b) set({ brreg: b, ...(!v.kontakt && b.dagligLeder ? { kontakt: b.dagligLeder } : {}) }); }} /> },
    { k: 'brregInfo', type: 'custom', show: v => !!v.brreg, render: v => { const st = enhetStatus(v.brreg); return <div className="note small"><b>{v.brreg.navn}</b> {st.t && <span style={{ color: st.c === 'green' ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>· {st.t}</span>}<br />{[v.brreg.orgform, v.brreg.naering, v.brreg.ansatte != null ? v.brreg.ansatte + ' ansatte' : '', v.brreg.adresse].filter(Boolean).join(' · ')}{v.brreg.dagligLeder && <><br />Daglig leder: {v.brreg.dagligLeder}{v.brreg.styreleder ? ' · Styreleder: ' + v.brreg.styreleder : ''}</>}</div>; } },
    { k: 'navn', label: 'Leietaker (firma)', req: true, half: true }, { k: 'orgnr', label: 'Org.nr.', half: true, mono: true },
    { k: 'eiendomId', label: 'Eiendom', type: 'select', options: eOptsSkriv, req: true, half: true }, { k: 'lokale', label: 'Leieobjekt / etasje', half: true },
    { k: 'arealOverstyrt', label: 'Overstyr leieareal (m²)', type: 'number', half: true, hint: 'La stå tom for å bruke arealet fra tegningene' },
    { k: 'virksomhet', label: 'Type virksomhet', type: 'select', options: ['Kontor', 'Butikk/handel', 'Servering', 'Lager/logistikk', 'Industri/verksted', 'Helse/omsorg', 'Undervisning', 'Annet'], empty: '–', half: true },
    { k: 'fellesAvtale', label: 'Kontraktfestet fellesareal', type: 'select', options: FELLES_AVTALE, half: true },
    { k: 'fellesAvtaleVerdi', label: 'Avtalt verdi (m² eller %)', type: 'number', half: true, hint: 'Brukes i stedet for målt andel fellesareal' },
    { k: 'arealInfo', type: 'custom', render: v => { const i = leieAreal({ ...l, id: l.id || '_ny', eiendomId: v.eiendomId, arealOverstyrt: v.arealOverstyrt, fellesAvtale: v.fellesAvtale, fellesAvtaleVerdi: v.fellesAvtaleVerdi }); const p: any = i.p;
      return <div className="note small" style={{ color: 'var(--ink)' }}>{p ? <>Leieareal fra tegninger: <b className="mono">{m2(p.tot)}</b> <span className="muted">= eksklusivt {m2(p.eks)} + {p.avtale ? <>avtalt fellesareal {m2(p.felles)}</> : <>andel felles etasje {m2(p.fe)} + andel felles bygg {m2(p.fb)}</>}{p.etg?.length ? ` · ${p.etg.join(', ')}` : ''}</span>
        {p.avtale && <><br />Målt andel fellesareal er {m2(p.fellesBer)}. Avtalen gir <b style={{ color: p.diff < 0 ? 'var(--red)' : 'var(--green)' }}>{p.diff >= 0 ? 'overdekning' : 'underdekning'} på {m2(Math.abs(p.diff))}</b>{p.diff < 0 ? ' som eier ikke får fakturert.' : ' i eiers favør.'}</>}</> : <span className="muted">Ingen arealer er tegnet for denne leietakeren ennå (Tegninger og arealer).</span>}
        {i.kilde === 'overstyrt' && p && Math.abs(i.verdi! - p.tot) >= 0.1 && <><br /><b>Overstyrt til {m2(i.verdi)}</b> <span className="muted">({i.verdi! - p.tot > 0 ? '+' : ''}{(i.verdi! - p.tot).toLocaleString('nb-NO', { maximumFractionDigits: 1 })} m² mot oppmålt)</span></>}
        {leieAreal({ ...l, eiendomId: v.eiendomId, arealOverstyrt: '' }).adv.map((a, j) => <div key={j} style={{ color: 'var(--amber)', marginTop: 4 }}>⚠ {a}</div>)}</div>; } },
    { k: 'sec', label: 'Leieavtale', type: 'sec' },
    { k: 'start', label: 'Avtalestart', type: 'date', half: true }, { k: 'slutt', label: 'Avtaleutløp', type: 'date', half: true },
    { k: 'kontrakt', label: 'Kontraktstype', type: 'select', options: () => alleMaler().map(m => [m.key, m.n] as [string, string]), def: kontraktKey(l), help: 'kontrakt.type',
      hint: 'Styrer ansvarsfordelingen og hvilke plikter leietakeren får. Kan justeres punkt for punkt etter kontrakten.' },
    { k: 'heleBygget', label: 'Leietaker leier hele bygget (alle systemer omfattes av kontrakten)', type: 'checkbox' },
    { k: 'avtaletype', label: 'Avtalemal / dokument', half: true, ph: 'F.eks. Norsk Eiendom bare hus 2023' },
    { k: 'varsel', label: 'Varslingsfrist fornyelse (mnd før utløp)', type: 'number', half: true },
    { k: 'sec2', label: 'Kontakt', type: 'sec' },
    { k: 'kontakt', label: 'Kontaktperson', half: true }, { k: 'brannvernleder', label: 'Leietakers brannvernleder', half: true },
    { k: 'epost', label: 'E-post', type: 'email', half: true }, { k: 'tlf', label: 'Telefon', half: true },
    { k: 'notat', label: 'Notater (vises ikke for leietaker)', type: 'textarea' }];
  formModal({
    title: id ? 'Rediger leietaker' : 'Ny leietaker', fields, values: { ...l, arealOverstyrt: l.arealOverstyrt ?? (!leieAreal({ ...l, arealOverstyrt: '' }).p && +l.areal ? +l.areal : '') },
    extraFoot: close => id ? <button className="btn danger" onClick={async () => { if (await confirmBox(`Slette leietaker «${l.navn}»? Brukere koblet til leietakeren mister tilgangen.`)) { await removeDoc('leietakere', id); close(); go('leietakere'); } }}>Slett</button> : null,
    onSave: async x => {
      delete x.sokLt; delete x.brregInfo; delete x.arealInfo; x.areal = null;
      if (x.orgnr && rensOrgnr(x.orgnr).length === 9 && x.brreg?.orgnr !== rensOrgnr(x.orgnr)) { const b = await brregData(x.orgnr).catch(() => null); if (b) { x.brreg = b; if (!x.virksomhet) x.virksomhet = virksomhetFraNaering(b.naeringKode); } }
      const o: Rec = { ...l, ...x };
      if (!id) {
        o.ansvar = kopi(finnMal(o.kontrakt).f);
        o.plikter = pliktKeysFor(o).map(k => ({ key: k, navn: PLIKTER[k].n, hjemmel: PLIKTER[k].h, frekvens: { n: 1, enhet: 'år' }, sist: '' }));
      } else if (o.kontrakt !== kontraktKey(l)) {
        if (await confirmBox(`Kontraktstypen er endret til «${finnMal(o.kontrakt).n}». Erstatte ansvarsfordelingen med malen? Justeringer du har gjort per punkt blir overskrevet.`, 'Bruk malen')) o.ansvar = kopi(finnMal(o.kontrakt).f);
        else o.ansvar = fordeling(l);
        (o as any)._etter = true;
      }
      const etter = (o as any)._etter; delete (o as any)._etter;
      const nid = await save('leietakere', o); toast('Leietaker lagret'); if (!id) go('leietaker/' + nid);
      if (etter && id) setTimeout(() => import('../views/Kontrakt').then(m => m.oppdaterEtterKontrakt(id)), 200);
    },
  });
}
export function bekreftPlikt(lid: string, idx: number) {
  const l = byId('leietakere', lid)!; const p = (l.plikter || [])[idx]; if (!p) return;
  const dok = PLIKTER[p.key]?.dok || [];
  const fields: Field[] = [
    ...(dok.length ? [{ k: 'sjekk', type: 'custom', label: 'Sjekkliste – dokumentasjon som skal innhentes', def: p.sjekk || [], help: 'ik.sjekkliste',
      render: (v: any, set: any) => <div className="note small" style={{ color: 'var(--ink)' }}>{dok.map(t => { const on = (v.sjekk || []).includes(t); return <label key={t} style={{ display: 'flex', gap: 8, alignItems: 'start', margin: '3px 0', cursor: 'pointer', fontWeight: 400 }}>
        <input type="checkbox" checked={on} onChange={() => set({ sjekk: on ? v.sjekk.filter((x: string) => x !== t) : [...(v.sjekk || []), t] })} style={{ marginTop: 3 }} />{t}</label>; })}
        <div className="muted" style={{ marginTop: 4 }}>{(v.sjekk || []).length} av {dok.length} punkter mottatt</div></div> } as Field] : []),
    { k: 'sist', label: 'Bekreftet / dokumentert dato', type: 'date', def: today(), half: true },
    { k: 'form', label: 'Form', type: 'select', options: ['Skriftlig bekreftelse', 'Dokumentasjon mottatt', 'Kontrollert på befaring', 'Muntlig'], def: 'Skriftlig bekreftelse', half: true },
    { k: 'komm', label: 'Kommentar', type: 'textarea', def: p.komm || '' }, { k: 'fil', label: 'Dokumentasjon fra leietaker', type: 'file' },
    { k: 'in', label: 'Frekvens', type: 'number', def: p.frekvens?.n || 1, half: true }, { k: 'ie', label: 'Enhet', type: 'select', options: ENH, def: p.frekvens?.enhet || 'år', half: true },
    { k: 'ikkeRelevant', label: 'Ikke relevant for denne leietakeren', type: 'checkbox', def: !!p.ikkeRelevant }];
  formModal({
    title: p.navn, fields, top: <p className="muted small" style={{ marginTop: 0 }}>{p.hjemmel}{p.bekreftetAvLeietaker ? ` · Sist bekreftet av leietaker ${fd(p.sist)}` : ''}</p>,
    extraFoot: close => <button className="btn danger" onClick={async () => { if (await confirmBox('Fjerne denne plikten fra leietakeren?', 'Fjern')) { const pl = l.plikter.slice(); pl.splice(idx, 1); await save('leietakere', { ...l, plikter: pl }); close(); } }}>Fjern plikt</button>,
    onSave: async x => {
      if (dok.length && !x.ikkeRelevant && (x.sjekk || []).length < dok.length && !(await confirmBox(`Bare ${(x.sjekk || []).length} av ${dok.length} punkter i sjekklisten er krysset av. Registrere plikten som dokumentert likevel?`, 'Registrer'))) return false;
      const pl = l.plikter.slice(); const np: Rec = { ...p, sist: x.sist, form: x.form, komm: x.komm, sjekk: x.sjekk || [], frekvens: { n: +x.in || 1, enhet: x.ie }, ikkeRelevant: x.ikkeRelevant, bekreftetAvLeietaker: false };
      if (x.fil) { const f = await uploadFile(x.fil, l.eiendomId, l.id); if (f) np.dokId = await save('dokumenter', { eiendomId: l.eiendomId, leietakerId: l.id, type: 'Leietakers IK-dokumentasjon', tittel: p.navn + ' – ' + l.navn, dato: x.sist, fil: f }); }
      pl[idx] = np; await save('leietakere', { ...l, plikter: pl }); toast('Bekreftelse registrert'); setTimeout(autoKvitterIK, 300);
    },
  });
}
export async function leggTilStandardPlikter(lid: string) {
  const l = byId('leietakere', lid)!; const have = (l.plikter || []).map((p: any) => p.key);
  const nye = pliktKeysFor(l).filter(k => !have.includes(k)).map(k => ({ key: k, navn: PLIKTER[k].n, hjemmel: PLIKTER[k].h, frekvens: { n: 1, enhet: 'år' }, sist: '' }));
  // Oppdater også hjemmel/tekst på eksisterende standardplikter
  const oppd = (l.plikter || []).map((p: any) => PLIKTER[p.key] ? { ...p, navn: PLIKTER[p.key].n, hjemmel: PLIKTER[p.key].h } : p);
  await save('leietakere', { ...l, plikter: [...oppd, ...nye] }); toast(nye.length ? `La til ${nye.length} plikter: ${nye.map(p => p.navn.split(' ')[0]).join(', ')}` : 'Pliktene er oppdatert – ingen manglet');
}
export function nyPlikt(lid: string) {
  const l = byId('leietakere', lid)!; const have = (l.plikter || []).map((p: any) => p.key);
  formModal({
    title: 'Legg til plikt for ' + l.navn,
    fields: [{ k: 'key', label: 'Velg fra standardlisten', type: 'select', options: Object.entries(PLIKTER).filter(([k]) => !have.includes(k)).map(([k, v]) => [k, v.n] as [string, string]), empty: '(Egendefinert plikt)' },
      { k: 'navn', label: 'Egendefinert plikt', show: x => !x.key }, { k: 'hjemmel', label: 'Hjemmel / avtalepunkt', show: x => !x.key }],
    onSave: async x => {
      const p: Rec = x.key ? { key: x.key, navn: PLIKTER[x.key].n, hjemmel: PLIKTER[x.key].h } as any : { key: crypto.randomUUID(), navn: x.navn, hjemmel: x.hjemmel } as any;
      if (!p.navn) { toast('Skriv inn plikten'); return false; }
      p.frekvens = { n: 1, enhet: 'år' }; p.sist = ''; await save('leietakere', { ...l, plikter: [...(l.plikter || []), p] });
    },
  });
}
export async function setMatrise(lid: string, k: string, val: string) { const l = byId('leietakere', lid)!; await save('leietakere', { ...l, matrise: { ...(l.matrise || {}), [k]: val } }); toast('Vedlikeholdsansvar oppdatert'); }
export function brev(lid: string) {
  const l = byId('leietakere', lid)!; const e = byId('eiendommer', l.eiendomId) || ({} as Rec);
  const pl = (l.plikter || []).map((p: any) => ({ p, s: pliktStatus(p) })).filter((x: any) => x.s.o > 0);
  const av = openAvvik().filter(a => a.leietakerId === l.id && a.ansvar === 'Leietaker');
  const oppg = activeTasks().filter(o => o.ansvar === 'Leietaker' && o.leietakerId === l.id && (dUntil(o.nesteFrist) as number) <= 60);
  const fo = fordeling(l); const lt = OMR.filter(o => fo[o.k].v === 'Leietaker' || fo[o.k].u === 'Leietaker').map(o => o.n + (fo[o.k].v === 'Leietaker' && fo[o.k].u === 'Leietaker' ? ' (vedlikehold og utskifting)' : fo[o.k].v === 'Leietaker' ? ' (drift og vedlikehold)' : ' (utskifting)'));
  const frist = fd(addDays(today(), 30));
  let t = `Emne: Oppfølging av internkontroll og vedlikehold – ${l.lokale ? l.lokale + ', ' : ''}${e.navn || ''}\n\nHei${l.kontakt ? ' ' + l.kontakt : ''},\n\nSom eier av ${e.navn || 'eiendommen'}${e.adresse ? ' (' + e.adresse + ')' : ''} følger vi opp brannsikkerhet, internkontroll og vedlikehold i samarbeid med leietakerne, jf. internkontrollforskriften § 6, forskrift om brannforebygging og leieavtalen.\n\n`;
  if (pl.length) { t += `Vi ber om bekreftelse og eventuell dokumentasjon på følgende innen ${frist}:\n`; pl.forEach(({ p }: any) => { t += `• ${p.navn}${p.sist ? ` (sist bekreftet ${fd(p.sist)})` : ''}\n`; }); t += `\nDere kan bekrefte og laste opp dokumentasjon direkte i Eiendomskontroll når dere er logget inn.\n\n`; }
  if (oppg.length) { t += 'Kontroller dere har ansvar for som forfaller snart:\n'; oppg.forEach(o => t += `• ${o.navn} – frist ${fd(o.nesteFrist)}\n`); t += '\n'; }
  if (av.length) { t += 'Åpne avvik der dere er ansvarlige for utbedring:\n'; av.forEach(a => t += `• #${a.nr} ${a.tittel} – frist ${fd(a.frist)}\n`); t += 'Gi oss beskjed når avvikene er utbedret, gjerne med bilde eller dokumentasjon.\n\n'; }
  if (lt.length) { t += 'Til påminnelse har dere etter leieavtalen ansvar for:\n'; lt.forEach(k => t += `• ${k}\n`); t += '\n'; }
  t += `Feil, skader eller avvik i bygget eller tekniske anlegg skal meldes til oss så snart de oppdages.\n\nMed vennlig hilsen\n${state.me?.navn || ''}\n`;
  showModal('Oppfølgingsbrev til ' + l.navn, () => <><p className="muted small" style={{ marginTop: 0 }}>Generert fra status i appen. Kopier inn i e-post{l.epost ? ` til ${l.epost}` : ''} og juster ved behov.</p><pre className="letter">{t}</pre></>,
    { wide: true, foot: close => <><button className="btn" onClick={close}>Lukk</button><button className="btn pri" onClick={() => copyText(t)}>Kopier tekst</button></> });
}
