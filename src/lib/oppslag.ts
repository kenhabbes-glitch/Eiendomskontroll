// Oppslag i åpne offentlige registre:
//  - Kartverket Adresse-API (ws.geonorge.no) – adresse, postnr, kommune, gnr/bnr, koordinater
//  - Brønnøysundregistrene Enhetsregisteret (data.brreg.no) – selskap, næring, roller, status
// Kalles direkte fra nettleseren; faller tilbake til Netlify-funksjonen «oppslag» hvis det blokkeres.
import { sb } from './store';

async function getJson(direct: string, viaFn: string): Promise<any> {
  try {
    const r = await fetch(direct, { headers: { Accept: 'application/json' } });
    if (r.ok) return await r.json();
    if (r.status === 404 || r.status === 410) return r.status === 410 ? { _slettet: true, ...(await r.json().catch(() => ({}))) } : null;
    if (r.status === 400) return null;
  } catch { /* faller tilbake til serverfunksjonen */ }
  const { data: { session } } = await sb.auth.getSession();
  const r = await fetch('/.netlify/functions/oppslag?' + viaFn, { headers: { Authorization: 'Bearer ' + (session?.access_token || '') } });
  if (r.status === 404) return null;
  if (r.status === 410) return { _slettet: true };
  if (!r.ok) throw new Error('Oppslaget feilet (' + r.status + ')');
  return r.json();
}
const enc = encodeURIComponent;

// ---------------- Kartverket
export type Adresse = {
  adressetekst: string; postnummer: string; poststed: string; kommunenavn: string; kommunenummer: string;
  gardsnummer?: number; bruksnummer?: number; festenummer?: number; seksjonsnummer?: number; lat?: number; lon?: number;
};
export function matrikkelTekst(a: { gardsnummer?: number; bruksnummer?: number; festenummer?: number; seksjonsnummer?: number }) {
  if (!a.gardsnummer) return '';
  let t = `${a.gardsnummer}/${a.bruksnummer ?? 0}`;
  if (a.festenummer || a.seksjonsnummer) t += `/${a.festenummer || 0}`;
  if (a.seksjonsnummer) t += `/${a.seksjonsnummer}`;
  return t;
}
const tittel = (s: string) => (s || '').toLowerCase().replace(/(^|[\s\-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
export async function sokAdresse(q: string): Promise<Adresse[]> {
  q = q.trim(); if (q.length < 3) return [];
  let params: string;
  const m = q.match(/^([^\d/]*?)\s*(\d+)\s*\/\s*(\d+)(?:\s*\/\s*(\d+))?(?:\s*\/\s*(\d+))?\s*([^\d/]*)$/);
  if (m) {
    const kommune = (m[1] || m[6] || '').replace(/[,]/g, '').trim();
    params = `gardsnummer=${m[2]}&bruksnummer=${m[3]}${m[4] ? '&festenummer=' + m[4] : ''}${m[5] ? '&seksjonsnummer=' + m[5] : ''}${kommune ? '&kommunenavn=' + enc(kommune) : ''}`;
  } else params = `sok=${enc(q)}`;
  params += '&treffPerSide=10&utkoordsys=4258';
  const j = await getJson(`https://ws.geonorge.no/adresser/v1/sok?${params}`, 'type=adresse&p=' + enc(params));
  return (j?.adresser || []).map((a: any) => ({
    adressetekst: a.adressetekst, postnummer: a.postnummer, poststed: tittel(a.poststed), kommunenavn: tittel(a.kommunenavn), kommunenummer: a.kommunenummer,
    gardsnummer: a.gardsnummer, bruksnummer: a.bruksnummer, festenummer: a.festenummer, seksjonsnummer: a.seksjonsnummer,
    lat: a.representasjonspunkt?.lat, lon: a.representasjonspunkt?.lon,
  }));
}
/** Lenke til eiendommen i Kartverkets «Se eiendom» (hjemmelshaver vises der etter innlogging med ID-porten) */
export function seEiendomUrl(e: any) {
  if (!e?.kommunenummer || !e?.gnr) return '';
  return `https://seeiendom.kartverket.no/eiendom/${e.kommunenummer}/${e.gnr}/${e.bnr || 0}/${e.fnr || 0}/${e.snr || 0}`;
}
export function kartUrl(e: any) { return e?.lat && e?.lon ? `https://www.google.com/maps/search/?api=1&query=${e.lat},${e.lon}` : ''; }
export function adresseFelter(a: Adresse) {
  return {
    adresse: a.adressetekst, poststed: `${a.postnummer} ${a.poststed}`.trim(), postnummer: a.postnummer, kommune: a.kommunenavn, kommunenummer: a.kommunenummer,
    gnrbnr: matrikkelTekst(a), gnr: a.gardsnummer ?? '', bnr: a.bruksnummer ?? '', fnr: a.festenummer ?? '', snr: a.seksjonsnummer ?? '', lat: a.lat ?? '', lon: a.lon ?? '',
    matrikkelSjekket: new Date().toISOString().slice(0, 10),
  };
}

// ---------------- Brønnøysund
export type Enhet = {
  orgnr: string; navn: string; orgform?: string; naering?: string; naeringKode?: string; ansatte?: number | null;
  adresse?: string; postadresse?: string; kommune?: string; epost?: string; telefon?: string; hjemmeside?: string;
  konkurs?: boolean; avvikling?: boolean; tvangsavvikling?: boolean; slettet?: boolean; stiftet?: string;
};
const adr = (a: any) => a ? [(a.adresse || []).join(', '), [a.postnummer, tittel(a.poststed || '')].filter(Boolean).join(' ')].filter(Boolean).join(', ') : '';
function mapEnhet(u: any): Enhet {
  return {
    orgnr: u.organisasjonsnummer, navn: u.navn, orgform: u.organisasjonsform?.beskrivelse, naering: u.naeringskode1?.beskrivelse, naeringKode: u.naeringskode1?.kode,
    ansatte: u.antallAnsatte ?? null, adresse: adr(u.forretningsadresse || u.beliggenhetsadresse), postadresse: adr(u.postadresse), kommune: tittel(u.forretningsadresse?.kommune || ''),
    epost: u.epostadresse, telefon: u.telefon || u.mobil, hjemmeside: u.hjemmeside,
    konkurs: !!u.konkurs, avvikling: !!u.underAvvikling, tvangsavvikling: !!u.underTvangsavviklingEllerTvangsopplosning, slettet: !!u.slettedato, stiftet: u.stiftelsesdato,
  };
}
export const rensOrgnr = (s: string) => (s || '').replace(/\D/g, '');
export async function sokEnhet(q: string): Promise<Enhet[]> {
  q = q.trim(); const nr = rensOrgnr(q);
  if (nr.length === 9) { const e = await hentEnhet(nr); return e ? [e] : []; }
  if (q.length < 3) return [];
  const j = await getJson(`https://data.brreg.no/enhetsregisteret/api/enheter?navn=${enc(q)}&size=10`, 'type=enheter&navn=' + enc(q));
  return (j?._embedded?.enheter || []).map(mapEnhet);
}
export async function hentEnhet(orgnr: string): Promise<Enhet | null> {
  const nr = rensOrgnr(orgnr); if (nr.length !== 9) return null;
  const j = await getJson(`https://data.brreg.no/enhetsregisteret/api/enheter/${nr}`, 'type=enhet&orgnr=' + nr);
  if (!j) return null;
  if (j._slettet) return { orgnr: nr, navn: j.navn || '', slettet: true };
  return mapEnhet(j);
}
export type Rolle = { type: string; kode: string; navn: string };
export async function hentRoller(orgnr: string): Promise<Rolle[]> {
  const nr = rensOrgnr(orgnr); if (nr.length !== 9) return [];
  const j = await getJson(`https://data.brreg.no/enhetsregisteret/api/enheter/${nr}/roller`, 'type=roller&orgnr=' + nr);
  const out: Rolle[] = [];
  (j?.rollegrupper || []).forEach((g: any) => (g.roller || []).forEach((r: any) => {
    if (r.fratraadt || r.avregistrert) return;
    const p = r.person?.navn; const navn = p ? [p.fornavn, p.mellomnavn, p.etternavn].filter(Boolean).join(' ') : (r.enhet?.navn || []).join(' ');
    out.push({ type: r.type?.beskrivelse || '', kode: r.type?.kode || '', navn: tittel(navn) });
  }));
  return out;
}
/** Foreslår type virksomhet ut fra næringskode (SN2007/SN2025) */
export function virksomhetFraNaering(kode?: string): string {
  if (!kode) return ''; const n = parseInt(kode.slice(0, 2), 10);
  if (n === 56 || n === 55) return 'Servering';
  if (n === 47 || n === 45 || n === 46) return 'Butikk/handel';
  if (n === 52 || n === 49 || n === 53) return 'Lager/logistikk';
  if (n >= 10 && n <= 33) return 'Industri/verksted';
  if (n >= 86 && n <= 88) return 'Helse/omsorg';
  if (n === 85) return 'Undervisning';
  if ((n >= 58 && n <= 75) || (n >= 77 && n <= 82) || n === 84 || n === 64) return 'Kontor';
  return 'Annet';
}
export function enhetStatus(e?: Partial<Enhet> | null): { c: string; t: string } {
  if (!e) return { c: '', t: '' };
  if (e.slettet) return { c: 'red', t: 'Slettet i Enhetsregisteret' };
  if (e.konkurs) return { c: 'red', t: 'Konkurs' };
  if (e.tvangsavvikling) return { c: 'red', t: 'Under tvangsavvikling' };
  if (e.avvikling) return { c: 'orange', t: 'Under avvikling' };
  return { c: 'green', t: 'Aktiv' };
}
export async function brregData(orgnr: string) {
  const [e, r] = await Promise.all([hentEnhet(orgnr), hentRoller(orgnr).catch(() => [])]);
  if (!e) return null;
  const dl = r.find(x => x.kode === 'DAGL'); const leder = r.find(x => x.kode === 'LEDE');
  return { ...e, dagligLeder: dl?.navn || '', styreleder: leder?.navn || '', roller: r.slice(0, 12), sjekket: new Date().toISOString().slice(0, 10) };
}
