// Dokumentinnboks: tolker opplastede dokumenter lokalt i nettleseren og foreslår type, eiendom, system,
// leietaker, dato og gyldighet. Ingenting sendes til AI-tjenester – filen lastes først opp når brukeren arkiverer.
import { S, saveInnst } from './store';
import { KOMP } from './catalog';
import type { Rec } from './utils';
import { pad } from './utils';
import { finnLeverandor, norm, pdfLinjer } from './rapportLesing';

export type Tolkning = {
  type: string; typeScore: number; typeGrunn: string[]; alt: [string, number][];
  eiendomId: string; eGrunn: string; anleggId: string; aGrunn: string; leietakerId: string; lGrunn: string;
  dato: string; gyldigTil: string; tittel: string; leverandor: string; tfm: string[];
};

// Ord og fraser per dokumenttype (vekt). Filnavnet teller dobbelt.
const R: [string, [string, number][]][] = [
  ['Ferdigattest/brukstillatelse', [['ferdigattest', 5], ['midlertidig brukstillatelse', 5], ['brukstillatelse', 4], ['pbl § 21-10', 4], ['§ 21-10', 3]]],
  ['Brannkonsept/brannteknisk dokumentasjon', [['brannkonsept', 5], ['brannteknisk', 4], ['risikoklasse', 3], ['brannklasse', 3], ['brannceller', 2], ['brannseksjon', 2], ['preaksepterte ytelser', 3]]],
  ['Branntegninger/rømningsplaner', [['rømningsplan', 5], ['branntegning', 5], ['rømningsvei', 1], ['du er her', 3], ['brannslukker', 1], ['møteplass', 2]]],
  ['FDV-dokumentasjon', [['fdv', 4], ['forvaltning, drift og vedlikehold', 5], ['drift- og vedlikeholdsinstruks', 5], ['driftsinstruks', 4], ['vedlikeholdsinstruks', 4], ['produktdatablad', 4], ['produktblad', 3], ['monteringsanvisning', 3], ['brukerveiledning', 3], ['bruksanvisning', 3], ['som bygget', 3], ['nobb', 2], ['teknisk datablad', 4]]],
  ['Energiattest', [['energiattest', 6], ['energimerke', 4], ['energikarakter', 4], ['oppvarmingskarakter', 4]]],
  ['Samsvarserklæring el-anlegg', [['samsvarserklæring', 6], ['fel § 12', 3], ['installasjonsforetak', 2], ['elektriske lavspenningsanlegg', 2]]],
  ['Tilstandsrapport', [['tilstandsrapport', 5], ['tilstandsgrad', 4], ['ns 3424', 4], ['tilstandsanalyse', 4], ['tg 2', 1], ['tg 3', 1]]],
  ['Miljøkartlegging (asbest/PCB)', [['miljøkartlegging', 5], ['miljøsanering', 5], ['asbest', 3], ['pcb', 3], ['farlig avfall', 2], ['blyholdig', 2]]],
  ['Forsikringspolise', [['forsikringsbevis', 5], ['polise', 4], ['forsikringssum', 4], ['egenandel', 2], ['forsikringstaker', 3]]],
  ['Tegninger (plan/snitt/fasade)', [['plantegning', 4], ['målestokk', 3], ['1:100', 3], ['1:50', 3], ['1:200', 3], ['fasade', 2], ['snitt', 2], ['tegningsnr', 3], ['tegning nr', 3], ['rev.', 1]]],
  ['Radonmåling', [['radon', 5], ['bq/m', 4], ['sporfilm', 3], ['årsmiddel', 2]]],
  ['Tilsynsrapport', [['tilsynsrapport', 5], ['varsel om pålegg', 5], ['pålegg', 3], ['tilsyn', 2], ['brann- og redningsvesen', 2], ['arbeidstilsynet', 2], ['el-tilsyn', 3], ['dlE', 2], ['forhåndsvarsel', 3], ['frist for tilbakemelding', 3]]],
  ['Servicerapport', [['servicerapport', 6], ['serviceprotokoll', 5], ['kontrollrapport', 4], ['service utført', 4], ['utført service', 4], ['årskontroll', 3], ['servicebesøk', 3], ['neste service', 3], ['avvik', 1], ['tekniker', 1], ['kontrollpunkter', 2]]],
  ['Egenkontrollskjema', [['egenkontroll', 5], ['egenkontrollskjema', 6], ['månedlig kontroll', 3], ['ukentlig kontroll', 3], ['kontrollert av', 1]]],
  ['Serviceavtale', [['serviceavtale', 6], ['vedlikeholdsavtale', 5], ['avtalens varighet', 3], ['oppsigelse', 1], ['årlig pris', 2], ['avtaleperiode', 3]]],
  ['Leieavtale', [['leieavtale', 6], ['leiekontrakt', 6], ['husleie', 4], ['leieobjekt', 4], ['utleier', 2], ['leietaker', 1], ['leieforholdet', 3], ['husleieloven', 3], ['depositum', 2]]],
  ['Samordningsavtale', [['samordningsavtale', 6], ['samordning', 3], ['brannforebygging § 4', 3]]],
  ['Leietakers IK-dokumentasjon', [['internkontroll', 3], ['hms-håndbok', 4], ['risikovurdering', 2], ['ik-hms', 4], ['verneombud', 2]]],
  ['SHA-plan', [['sha-plan', 6], ['sikkerhet, helse og arbeidsmiljø', 5], ['byggherreforskriften', 4], ['koordinator for prosjekteringsfasen', 3]]],
  ['Kontrakt / tilbud', [['tilbud', 3], ['ns 8405', 4], ['ns 8406', 4], ['ns 8407', 4], ['kontraktssum', 4], ['tilbudssum', 4], ['totalentreprise', 3], ['pristilbud', 4]]],
];
const harOrd = (t: string, o: string) => { const w = norm(o); if (w.length <= 4) return new RegExp(`(^|[^\\p{L}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}]|$)`, 'u').test(t); return t.includes(w); };

// Lært av tidligere arkiveringer i organisasjonen: leverandør → type og system
type Laer = Record<string, { type: string; anleggId: string; n: number }>;
const laerte = (): Laer => S.innst.innboksLaering || {};
export async function laerArkivering(lev: string, type: string, anleggId: string) {
  if (!lev) return; const L = { ...laerte() }; const k = norm(lev).slice(0, 60); const f = L[k];
  L[k] = { type, anleggId, n: f && f.type === type ? f.n + 1 : 1 }; const keys = Object.keys(L); if (keys.length > 500) delete L[keys[0]];
  await saveInnst('innboksLaering', L).catch(() => null);
}

const DATO = /\b(\d{1,2})[./](\d{1,2})[./](\d{4}|\d{2})\b/g;
const MND = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
function finnDato(tekst: string): string {
  const iDag = new Date(); const maks = new Date(iDag.getFullYear() + 1, 11, 31); const f: string[] = [];
  for (const m of tekst.matchAll(DATO)) { const y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; const d = new Date(y, +m[2] - 1, +m[1]);
    if (+m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1 && +m[1] <= 31 && y > 1950 && d <= maks) f.push(`${y}-${pad(m[2], 2)}-${pad(m[1], 2)}`); if (f.length > 3) break; }
  if (!f.length) { const m = tekst.match(new RegExp(`\\b(\\d{1,2})\\.?\\s+(${MND.join('|')})\\s+(\\d{4})\\b`)); if (m) f.push(`${m[3]}-${pad(MND.indexOf(m[2]) + 1, 2)}-${pad(m[1], 2)}`); }
  return f[0] || '';
}
const plussAar = (d: string, n: number) => d ? (+d.slice(0, 4) + n) + d.slice(4) : '';

/** Tekst fra en fil. PDF: pdf.js. Word: document.xml. Tekst/CSV: direkte. Bilder: tom (OCR på forespørsel). */
export async function lesTekst(navn: string, type: string, data: ArrayBuffer): Promise<{ linjer: string[]; tom: boolean; kanOcr: boolean }> {
  const n = navn.toLowerCase();
  if (/pdf/.test(type) || n.endsWith('.pdf')) { const r = await pdfLinjer(data); return { linjer: r.linjer, tom: r.tomTekst, kanOcr: true }; }
  if (/^image\//.test(type) || /\.(jpe?g|png|webp|bmp|tiff?)$/.test(n)) return { linjer: [], tom: true, kanOcr: true };
  if (n.endsWith('.docx')) { const JSZip = (await import('jszip')).default; const z = await JSZip.loadAsync(data); const x = await z.file('word/document.xml')?.async('string') || '';
    const linjer = x.split(/<\/w:p>/).map(p => p.replace(/<w:tab\/>/g, ' ').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim()).filter(Boolean);
    return { linjer, tom: !linjer.length, kanOcr: false }; }
  if (/^text\//.test(type) || /\.(txt|csv|md)$/.test(n)) { const t = new TextDecoder().decode(data); const linjer = t.split(/\r?\n/).map(l => l.trim()).filter(Boolean); return { linjer, tom: !linjer.length, kanOcr: false }; }
  return { linjer: [], tom: true, kanOcr: false };
}

export function tolk(filnavn: string, linjer: string[], valgtEiendom = ''): Tolkning {
  const fn = norm(filnavn.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' '));
  const tekst = norm(linjer.slice(0, 400).join(' \n ')); const topp = norm(linjer.slice(0, 15).join(' '));
  const lev = finnLeverandor(linjer).replace(/^(leverand[oø]r|avsender|fra|utført av)\s*:\s*/i, ''); const laert = lev ? laerte()[norm(lev).slice(0, 60)] : undefined;

  // 1) Type
  const sc: Record<string, { s: number; g: string[] }> = {};
  for (const [t, ord] of R) for (const [o, v] of ord) {
    let s = 0; if (harOrd(fn, o)) s += v * 2; if (harOrd(topp, o)) s += v * 1.5; else if (harOrd(tekst, o)) s += v;
    if (s) { const x = sc[t] ||= { s: 0, g: [] }; x.s += s; if (x.g.length < 4) x.g.push(o); } }
  if (/\.(dwg|dxf|ifc)$/i.test(filnavn)) (sc['Tegninger (plan/snitt/fasade)'] ||= { s: 0, g: [] }).s += 10;
  if (laert?.type) { const x = sc[laert.type] ||= { s: 0, g: [] }; x.s += 3 + Math.min(laert.n, 5); x.g.push('tidligere fra samme leverandør'); }
  const rang = Object.entries(sc).sort((a, b) => b[1].s - a[1].s);
  const [type, best] = rang[0] || ['Annet', { s: 0, g: [] }]; const nest = rang[1]?.[1].s || 0;
  const typeScore = best.s ? Math.min(0.97, 0.35 + Math.min(best.s, 16) / 32 + (best.s - nest) / Math.max(best.s, 1) * 0.15) : 0;

  // 2) System via TFM-kode (=360.001) – sterkeste signal, gir også eiendom
  const tfm = [...new Set([...(filnavn + ' ' + linjer.slice(0, 200).join(' ')).matchAll(/(?:\+\w+)?=?\b(\d{3})\.(\d{3})\b/g)].map(m => m[1] + '.' + m[2]))].slice(0, 6);
  let anleggId = '', aGrunn = '', eiendomId = '', eGrunn = '';
  const A = S.anlegg.filter(a => !a.arkivert);
  for (const k of tfm) { const [sys, lop] = k.split('.'); const T = A.filter(a => a.tfmSys === sys && pad(a.tfmLop || 1) === lop);
    const a = T.find(x => x.eiendomId === valgtEiendom) || (T.length === 1 ? T[0] : null); if (a) { anleggId = a.id; aGrunn = 'TFM-kode =' + k; eiendomId = a.eiendomId; eGrunn = 'fra systemet'; break; } }

  // 3) Eiendom: navn, adresse, gnr/bnr, eier – eller den eneste
  if (!eiendomId) { let bestE = 0;
    for (const e of S.eiendommer) { let s = 0; const g: string[] = [];
      if (e.navn && norm(e.navn).length >= 4 && (tekst.includes(norm(e.navn)) || fn.includes(norm(e.navn)))) { s += 5; g.push('navn'); }
      if (e.adresse && norm(e.adresse).length >= 5 && tekst.includes(norm(e.adresse))) { s += 6; g.push('adresse'); }
      if (e.gnrbnr) { const [gn, bn] = String(e.gnrbnr).split('/'); if (gn && bn && new RegExp(`(gnr\\.?\\s*${gn}\\D{1,12}bnr\\.?\\s*${bn}\\b|\\b${gn}\\s*/\\s*${bn}\\b)`).test(tekst)) { s += 6; g.push('gnr/bnr'); } }
      if (e.id === valgtEiendom) s += 0.5;
      if (s > bestE) { bestE = s; eiendomId = e.id; eGrunn = g.join(', ') || 'valgt eiendom'; } }
    if (!eiendomId && S.eiendommer.length === 1) { eiendomId = S.eiendommer[0].id; eGrunn = 'eneste eiendom'; }
    if (!eiendomId && valgtEiendom) { eiendomId = valgtEiendom; eGrunn = 'valgt eiendom'; } }

  // 4) System uten TFM-kode: lært fra leverandøren, systemnavn, leverandør på systemet, eller systemtype som bare finnes én gang
  if (!anleggId && eiendomId) { const E = A.filter(a => a.eiendomId === eiendomId); let bestA = 0;
    for (const a of E) { let s = 0; let g = '';
      if (laert?.anleggId === a.id) { s += 4; g = 'tidligere fra samme leverandør'; }
      if (a.navn && norm(a.navn).length >= 4 && (tekst.includes(norm(a.navn)) || fn.includes(norm(a.navn)))) { s += 4; g ||= 'systemnavn'; }
      if (a.leverandor && norm(a.leverandor).length >= 4 && tekst.includes(norm(a.leverandor).replace(/\s+(as|asa)$/, ''))) { s += 3; g ||= 'leverandør på systemet'; }
      const kn = norm(KOMP[a.type]?.n || ''); const kord = kn.split(/[ /,()-]+/).filter(w => w.length >= 6);
      if (kord.some(w => tekst.includes(w) || fn.includes(w))) { s += E.filter(b => b.type === a.type).length === 1 ? 3 : 1; g ||= 'systemtype «' + KOMP[a.type]?.n + '»'; }
      if (s > bestA) { bestA = s; anleggId = a.id; aGrunn = g; } }
    if (bestA < 3) { anleggId = ''; aGrunn = ''; } }

  // 5) Leietaker
  let leietakerId = '', lGrunn = '';
  for (const l of S.leietakere.filter(l => !eiendomId || l.eiendomId === eiendomId)) {
    if (l.orgnr && tekst.replace(/\s/g, '').includes(String(l.orgnr).replace(/\s/g, ''))) { leietakerId = l.id; lGrunn = 'org.nr'; break; }
    if (l.navn && norm(l.navn).length >= 4 && tekst.includes(norm(l.navn))) { leietakerId = l.id; lGrunn = 'navn'; } }
  if (!['Leieavtale', 'Leietakers IK-dokumentasjon', 'Samordningsavtale'].includes(type) && lGrunn !== 'org.nr') { leietakerId = ''; lGrunn = ''; }

  const dato = finnDato(linjer.slice(0, 60).join(' ').toLowerCase());
  const gyldigTil = type === 'Energiattest' ? plussAar(dato, 10) : type === 'Radonmåling' ? plussAar(dato, 5) : '';
  const a = anleggId ? S.anlegg.find(x => x.id === anleggId) : null;
  const pent = filnavn.replace(/\.[a-z0-9]+$/i, '').replace(/[_]+/g, ' ').replace(/^\d{6,}[-\s]*/, '').trim();
  const tittel = (pent.length >= 6 && !/^(scan|skann|img|dok|document|file)\w*\s*\d*$/i.test(pent) ? pent : type + (a ? ' – ' + (a.navn || KOMP[a.type]?.n || '') : '')) + (dato && !/\d{4}/.test(pent) ? ' ' + dato.slice(0, 4) : '');
  return { type: best.s ? type : 'Annet', typeScore, typeGrunn: best.g, alt: rang.slice(1, 4).map(([t, x]) => [t, x.s]), eiendomId, eGrunn, anleggId, aGrunn, leietakerId, lGrunn, dato, gyldigTil, tittel: tittel.slice(0, 140), leverandor: lev, tfm };
}

/** Kontroll som en servicerapport sannsynligvis hører til (aktiv kontroll på systemet, nærmeste frist) */
export function kontrollFor(anleggId: string, type: string): Rec | null {
  if (!anleggId) return null;
  const K = S.oppgaver.filter(o => o.anleggId === anleggId && o.aktiv !== false && (type === 'Egenkontrollskjema' ? o.type === 'Egenkontroll' : o.type !== 'Egenkontroll'));
  return K.sort((a, b) => String(a.nesteFrist || '9').localeCompare(String(b.nesteFrist || '9')))[0] || (type === 'Servicerapport' ? S.oppgaver.filter(o => o.anleggId === anleggId && o.aktiv !== false)[0] || null : null);
}
export const KONFIDENSIELLE = ['Leieavtale', 'Forsikringspolise', 'Samordningsavtale', 'Leietakers IK-dokumentasjon'];
