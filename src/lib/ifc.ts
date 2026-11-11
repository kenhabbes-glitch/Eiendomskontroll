// Leser IFC-modeller (STEP-format, IFC2x3 og IFC4) direkte i nettleseren, uten å laste geometrien.
// Henter etasjer, bygningsdeler og utstyr med type, etasje, NS 3451-klassifisering og egenskaper (brannklasse, fabrikat, serienummer).
// Støtter .ifc og .ifczip (strømmer og pakker ut underveis, så store filer ikke havner i minnet på én gang).
import { Unzip, UnzipInflate } from 'fflate';

export type Tfm = { sys: string; lop: string; komp: string; klop: string; tekst: string };
export type IfcEl = { klasse: string; guid: string; navn: string; type: string; etasje: string; tag: string; ns: string; mengder: Record<string, number>; egenskaper: Record<string, string>;
  /** Fagsystem fra modellen (IfcSystem / IfcDistributionSystem), TFM-merking og produktdata når modellen har det */
  system?: string; tfm?: Tfm; fabrikat?: string; serienr?: string;
  /** Delene en samlet bygningsdel består av (glassfelt og profiler i en glassfasade, løp i en trapp) – de har geometrien i 3D */
  deler?: string[]; forelder?: string };
export type IfcModell = { filnavn: string; schema: string; program: string; byggNavn: string; etasjer: string[]; elementer: IfcEl[]; tellinger: Record<string, number> };

// Klasser som leses ut som enkeltobjekter (bygningsdeler og utstyr). Resten telles bare.
const ELEMENT = new Set(['IFCDOOR', 'IFCWINDOW', 'IFCCURTAINWALL', 'IFCSTAIR', 'IFCSTAIRFLIGHT', 'IFCRAMP', 'IFCRAILING', 'IFCCOVERING', 'IFCFURNISHINGELEMENT', 'IFCFURNITURE', 'IFCBUILDINGELEMENTPROXY', 'IFCTRANSPORTELEMENT',
  'IFCFLOWTERMINAL', 'IFCSANITARYTERMINAL', 'IFCFLOWSEGMENT', 'IFCFLOWFITTING', 'IFCFLOWCONTROLLER', 'IFCFLOWMOVINGDEVICE', 'IFCFLOWSTORAGEDEVICE', 'IFCFLOWTREATMENTDEVICE', 'IFCENERGYCONVERSIONDEVICE', 'IFCDISTRIBUTIONELEMENT', 'IFCDISTRIBUTIONCONTROLELEMENT',
  'IFCAIRTERMINAL', 'IFCPUMP', 'IFCFAN', 'IFCBOILER', 'IFCCHILLER', 'IFCVALVE', 'IFCDAMPER', 'IFCFILTER', 'IFCHEATEXCHANGER', 'IFCTANK', 'IFCLIGHTFIXTURE', 'IFCLAMP', 'IFCALARM', 'IFCSENSOR', 'IFCACTUATOR', 'IFCCONTROLLER', 'IFCFIRESUPPRESSIONTERMINAL', 'IFCELECTRICDISTRIBUTIONBOARD',
  'IFCELECTRICAPPLIANCE', 'IFCUNITARYEQUIPMENT', 'IFCSPACEHEATER', 'IFCCOOLINGTOWER', 'IFCCOMPRESSOR', 'IFCMOTORCONNECTION', 'IFCTRANSFORMER', 'IFCSWITCHINGDEVICE', 'IFCOUTLET', 'IFCJUNCTIONBOX', 'IFCCOMMUNICATIONSAPPLIANCE', 'IFCAUDIOVISUALAPPLIANCE', 'IFCSPACE']);
const TELL = new Set(['IFCWALL', 'IFCWALLSTANDARDCASE', 'IFCSLAB', 'IFCCOLUMN', 'IFCBEAM', 'IFCROOF', 'IFCMEMBER', 'IFCPLATE', 'IFCFOOTING', 'IFCPILE', 'IFCOPENINGELEMENT', ...ELEMENT]);
const LAGRE = new Set([...ELEMENT, 'IFCBUILDING', 'IFCBUILDINGSTOREY', 'IFCRELCONTAINEDINSPATIALSTRUCTURE', 'IFCRELAGGREGATES', 'IFCRELDEFINESBYTYPE', 'IFCRELDEFINESBYPROPERTIES', 'IFCPROPERTYSET', 'IFCPROPERTYSINGLEVALUE', 'IFCELEMENTQUANTITY',
  'IFCQUANTITYLENGTH', 'IFCQUANTITYAREA', 'IFCQUANTITYVOLUME', 'IFCQUANTITYCOUNT', 'IFCRELASSOCIATESCLASSIFICATION', 'IFCCLASSIFICATIONREFERENCE',
  'IFCMEMBER', 'IFCPLATE', 'IFCSLAB', 'IFCBUILDINGELEMENTPART', 'IFCRELASSIGNSTOGROUP', 'IFCSYSTEM', 'IFCDISTRIBUTIONSYSTEM', 'IFCBUILDINGSYSTEM', 'IFCDISTRIBUTIONCIRCUIT']);
const SYSTEM = new Set(['IFCSYSTEM', 'IFCDISTRIBUTIONSYSTEM', 'IFCBUILDINGSYSTEM', 'IFCDISTRIBUTIONCIRCUIT']);

type Ent = { k: string; a: string[] };

/** Deler en STEP-argumentliste på toppnivå (komma utenfor parenteser og tekst). */
function args(s: string): string[] {
  const ut: string[] = []; let d = 0, q = false, start = 0;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i);
    if (q) { if (c === 39) { if (s.charCodeAt(i + 1) === 39) i++; else q = false; } continue; }
    if (c === 39) q = true; else if (c === 40) d++; else if (c === 41) d--; else if (c === 44 && d === 0) { ut.push(s.slice(start, i).trim()); start = i + 1; } }
  ut.push(s.slice(start).trim()); return ut;
}
/** STEP-tekst → vanlig tekst (\X2\00E5\X0\ osv.) */
export function stepTekst(s: string): string {
  if (!s || s === '$' || s === '*') return ''; let t = s; if (t[0] === "'" && t[t.length - 1] === "'") t = t.slice(1, -1);
  return t.replace(/\\X2\\([0-9A-Fa-f]+)\\X0\\/g, (_, h: string) => (h.match(/.{4}/g) || []).map(x => String.fromCharCode(parseInt(x, 16))).join('')).replace(/\\X\\([0-9A-Fa-f]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16))).replace(/\\S\\(.)/g, (_, c: string) => String.fromCharCode(c.charCodeAt(0) + 128)).replace(/''/g, "'").replace(/\\\\/g, '\\');
}
function verdi(r: string): string {
  const m = /^IFC\w+\(([\s\S]*)\)$/.exec(r.trim()); const v = (m ? m[1] : r).trim();
  if (v === '.T.') return 'ja'; if (v === '.F.') return 'nei'; if (v === '$') return ''; return stepTekst(v);
}
const refs = (s: string) => (s.match(/#\d+/g) || []).map(x => +x.slice(1));
const nr = (s: string) => { const m = /#(\d+)/.exec(s); return m ? +m[1] : 0; };

/** Finner TFM-merking, f.eks. «=360.001-LV001», «+B1=320.002-JP002%T1» eller «433.01-FS003». */
const TFM_RE = /(?:^|[^\d])(\d{3})\.(\d{2,4})(?:\s*[-–.]?\s*([A-Z]{2,3})\s*(\d{1,4}))?/;
const TFM_FELT = /tfm|merke|merking|komponentn|komponentkode|systemkode|system code|tag|mark|kks|id[- ]?kode/i;
export function finnTfm(eg: Record<string, string>, tag: string, navn: string): Tfm | undefined {
  const kand = [...Object.entries(eg).filter(([k]) => TFM_FELT.test(k)).map(([, v]) => v), tag, navn];
  for (const v of kand) { if (!v) continue; const m = TFM_RE.exec(v.toUpperCase()); if (!m) continue; if (!/^[1-7]\d\d$/.test(m[1])) continue;
    // Bare kode uten «=»/komponentdel i et navn er for usikkert (kan være et mål, f.eks. 900.21)
    const sterk = !!m[3] || /=\s*\d{3}\./.test(v) || TFM_FELT.test(Object.keys(eg).find(k => eg[k] === v) || ''); if (!sterk) continue;
    return { sys: m[1], lop: m[2].padStart(3, '0').slice(-3), komp: m[3] || '', klop: m[4] ? m[4].padStart(3, '0') : '', tekst: m[0].replace(/^[^\d]/, '').trim() }; }
  return undefined;
}
const forst = (eg: Record<string, string>, ...k: string[]) => { for (const n of k) { const f = Object.keys(eg).find(x => x.toLowerCase() === n.toLowerCase()); if (f && eg[f]) return eg[f]; } return ''; };

class Leser {
  buf = ''; ent = new Map<number, Ent>(); tellinger: Record<string, number> = {}; schema = ''; program = '';
  push(tekst: string, slutt = false) {
    this.buf += tekst; const re = /;[ \t\r]*\n(?=\s*(?:#|ENDSEC))/g; let siste = 0, m: RegExpExecArray | null;
    while ((m = re.exec(this.buf))) { this.stmt(this.buf.slice(siste, m.index)); siste = m.index + m[0].length; }
    this.buf = this.buf.slice(siste); if (slutt && this.buf.trim()) { this.stmt(this.buf); this.buf = ''; }
  }
  stmt(s: string) {
    const i0 = s.indexOf('#'); if (i0 < 0) { if (!this.schema) { const m = /FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/.exec(s); if (m) this.schema = m[1]; const p = /FILE_NAME\s*\(([\s\S]*)\)/.exec(s); if (p) { const a = args(p[1]); this.program = stepTekst(a[5] || ''); } } return; }
    if (i0 > 2) { if (!this.schema) { const m = /FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/.exec(s); if (m) this.schema = m[1]; const p = /FILE_NAME\s*\(([\s\S]*)\)/.exec(s); if (p && !this.program) { const a = args(p[1]); this.program = stepTekst(a[5] || ''); } } }
    const eq = s.indexOf('=', i0); const par = s.indexOf('(', eq); if (eq < 0 || par < 0) return;
    const k = s.slice(eq + 1, par).trim().toUpperCase(); if (TELL.has(k)) this.tellinger[k] = (this.tellinger[k] || 0) + 1; if (!LAGRE.has(k)) return;
    const id = +s.slice(i0 + 1, eq); const slutt = s.lastIndexOf(')'); this.ent.set(id, { k, a: args(s.slice(par + 1, slutt)) });
  }
}

/** Leser en .ifc eller .ifczip og returnerer elementene med etasje, type, klassifisering og egenskaper. */
export async function lesIfc(fil: File, fremdrift?: (andel: number) => void): Promise<IfcModell> {
  const L = new Leser(); const dek = new TextDecoder('latin1'); const navn = fil.name.toLowerCase();
  if (navn.endsWith('.ifczip') || navn.endsWith('.zip')) {
    await new Promise<void>((ok, feil) => {
      const uz = new Unzip(); uz.register(UnzipInflate); let funnet = false;
      uz.onfile = f => { if (!/\.ifc$/i.test(f.name) || funnet) return; funnet = true; const d2 = new TextDecoder('latin1'); f.ondata = (e, data, final) => { if (e) return feil(e); L.push(d2.decode(data, { stream: !final }), final); if (final) ok(); }; f.start(); };
      (async () => { const r = fil.stream().getReader(); let lest = 0; for (;;) { const { done, value } = await r.read(); if (done) { uz.push(new Uint8Array(0), true); break; } lest += value.length; uz.push(value); fremdrift?.(Math.min(0.99, lest / fil.size)); if (lest % 4 === 0) await new Promise(x => setTimeout(x)); } if (!funnet) feil(new Error('Fant ingen .ifc-fil i arkivet')); })().catch(feil);
    });
  } else {
    const r = fil.stream().getReader(); let lest = 0;
    for (;;) { const { done, value } = await r.read(); if (done) { L.push(dek.decode(), true); break; } lest += value.length; L.push(dek.decode(value, { stream: true })); fremdrift?.(Math.min(0.99, lest / fil.size)); await new Promise(x => setTimeout(x)); }
  }
  return bygg(L, fil.name);
}

function bygg(L: Leser, filnavn: string): IfcModell {
  const E = L.ent; const get = (id: number) => E.get(id);
  const etasjer = new Map<number, string>(); let byggNavn = '';
  for (const [id, e] of E) { if (e.k === 'IFCBUILDINGSTOREY') etasjer.set(id, stepTekst(e.a[2])); else if (e.k === 'IFCBUILDING' && !byggNavn) byggNavn = stepTekst(e.a[2]); }
  const sysAv = new Map<number, string>(); const delerAv = new Map<number, number[]>(); const forelderAv = new Map<number, number>();
  const etasjeAv = new Map<number, string>(); const typeAv = new Map<number, string>(); const psetAv = new Map<number, number[]>(); const nsAv = new Map<number, string>();
  for (const [, e] of E) {
    if (e.k === 'IFCRELCONTAINEDINSPATIALSTRUCTURE' || e.k === 'IFCRELAGGREGATES') { const mål = nr(e.k === 'IFCRELAGGREGATES' ? e.a[4] : e.a[5]); const lst = e.k === 'IFCRELAGGREGATES' ? e.a[5] : e.a[4]; const et = etasjer.get(mål); if (et) refs(lst).forEach(x => etasjeAv.set(x, et));
      else if (e.k === 'IFCRELAGGREGATES' && ELEMENT.has(get(mål)?.k || '')) { const b = refs(lst); delerAv.set(mål, [...(delerAv.get(mål) || []), ...b]); b.forEach(x => forelderAv.set(x, mål)); } }
    else if (e.k === 'IFCRELDEFINESBYTYPE') { const t = get(nr(e.a[5])); if (t) refs(e.a[4]).forEach(x => typeAv.set(x, stepTekst(t.a[2]))); }
    else if (e.k === 'IFCRELDEFINESBYPROPERTIES') { const p = nr(e.a[5]); refs(e.a[4]).forEach(x => { const l = psetAv.get(x) || []; l.push(p); psetAv.set(x, l); }); }
    else if (e.k === 'IFCRELASSIGNSTOGROUP') { const g = get(nr(e.a[6])); if (g && SYSTEM.has(g.k)) { const n = stepTekst(g.a[5] || '') || stepTekst(g.a[2]) || stepTekst(g.a[4] || ''); if (n) refs(e.a[4]).forEach(x => { if (!sysAv.has(x)) sysAv.set(x, n); }); } }
    else if (e.k === 'IFCRELASSOCIATESCLASSIFICATION') { const r = get(nr(e.a[5])); if (r && r.k === 'IFCCLASSIFICATIONREFERENCE') { const kode = stepTekst(r.a[1]); if (/^\d{2,3}/.test(kode)) refs(e.a[4]).forEach(x => nsAv.set(x, kode)); } }
  }
  const egenskaper = (id: number) => { const eg: Record<string, string> = {}; const mg: Record<string, number> = {};
    for (const pid of psetAv.get(id) || []) { const p = get(pid); if (!p) continue;
      if (p.k === 'IFCPROPERTYSET') for (const x of refs(p.a[4])) { const q = get(x); if (q?.k === 'IFCPROPERTYSINGLEVALUE') { const v = verdi(q.a[2] || ''); const n = stepTekst(q.a[0]); if (v && n && v !== '0' && !(n in eg)) eg[n] = v; } }
      else if (p.k === 'IFCELEMENTQUANTITY') for (const x of refs(p.a[5])) { const q = get(x); if (q && q.k.startsWith('IFCQUANTITY')) { const v = parseFloat(q.a[3]); if (!isNaN(v)) mg[stepTekst(q.a[0])] = v; } } }
    return { eg, mg }; };
  const elementer: IfcEl[] = [];
  for (const [id, e] of E) {
    if (!ELEMENT.has(e.k)) continue; const { eg, mg } = egenskaper(id);
    const navn = stepTekst(e.a[2]), tag = stepTekst(e.a[7] || ''); if (!etasjeAv.has(id) && forelderAv.has(id)) { const f = etasjeAv.get(forelderAv.get(id)!); if (f) etasjeAv.set(id, f); }
    elementer.push({ klasse: e.k, guid: stepTekst(e.a[0]), navn, type: typeAv.get(id) || stepTekst(e.a[4]) || '', etasje: etasjeAv.get(id) || '', tag, ns: nsAv.get(id) || '', mengder: mg, egenskaper: eg,
      system: sysAv.get(id), tfm: finnTfm(eg, tag, navn), deler: delerAv.get(id)?.map(x => stepTekst(get(x)?.a[0] || '')).filter(Boolean), forelder: forelderAv.has(id) ? stepTekst(get(forelderAv.get(id)!)?.a[0] || '') : undefined, fabrikat: [forst(eg, 'Manufacturer', 'Produsent', 'Fabrikat', 'Leverandør'), forst(eg, 'ModelReference', 'ModelLabel', 'Modell', 'Model', 'Produkt', 'Produktnavn')].filter(Boolean).join(' '), serienr: forst(eg, 'SerialNumber', 'Serienummer', 'Serial Number') });
  }
  return { filnavn, schema: L.schema, program: L.program, byggNavn, etasjer: [...etasjer.values()], elementer, tellinger: L.tellinger };
}

// ---------- Fra modell til importtabell (brukes av systemimporten)
export type IfcKat = { id: string; navn: string; klasser: string[]; kode: string; type: string; standard: boolean; hint: string };
export const IFC_KAT: IfcKat[] = [
  { id: 'vindu', navn: 'Vinduer', klasser: ['IFCWINDOW'], kode: '234', type: 'vinduer', standard: true, hint: 'Bygningsdel 234, levetid 40 år' },
  { id: 'dor', navn: 'Dører', klasser: ['IFCDOOR'], kode: '244', type: '', standard: true, hint: 'Ytterdører og branndører får egen type når modellen oppgir det' },
  { id: 'fasade', navn: 'Glassfasade / systemfasade', klasser: ['IFCCURTAINWALL'], kode: '230', type: 'fasade_mur', standard: true, hint: 'Bygningsdel 230' },
  { id: 'trapp', navn: 'Trapper og ramper', klasser: ['IFCSTAIR', 'IFCSTAIRFLIGHT', 'IFCRAMP'], kode: '', type: '', standard: true, hint: 'Trenger kontroll av gelender og slitasje' },
  { id: 'rekkverk', navn: 'Rekkverk og gelendere', klasser: ['IFCRAILING'], kode: '', type: '', standard: true, hint: 'Personsikkerhet – kontroll av festepunkter' },
  { id: 'sanitar', navn: 'Sanitærutstyr / armaturer (foreslått)', klasser: ['IFCFLOWTERMINAL', 'IFCSANITARYTERMINAL'], kode: '313', type: 'sanitar', standard: true, hint: 'Arkitektmodeller har ofte bare sanitærutstyr, ikke tekniske anlegg' },
  { id: 'teknisk', navn: 'Tekniske komponenter (pumper, vifter, tavler …)', klasser: ['IFCPUMP', 'IFCFAN', 'IFCBOILER', 'IFCCHILLER', 'IFCVALVE', 'IFCDAMPER', 'IFCFILTER', 'IFCHEATEXCHANGER', 'IFCTANK', 'IFCLIGHTFIXTURE', 'IFCALARM', 'IFCSENSOR', 'IFCCONTROLLER', 'IFCELECTRICDISTRIBUTIONBOARD', 'IFCUNITARYEQUIPMENT', 'IFCAIRTERMINAL', 'IFCFIRESUPPRESSIONTERMINAL', 'IFCTRANSPORTELEMENT', 'IFCENERGYCONVERSIONDEVICE', 'IFCFLOWMOVINGDEVICE', 'IFCFLOWSTORAGEDEVICE', 'IFCFLOWTREATMENTDEVICE', 'IFCFLOWCONTROLLER', 'IFCDISTRIBUTIONELEMENT'], kode: '', type: '', standard: true, hint: 'Finnes i RIV/RIE-modeller' },
  { id: 'himling', navn: 'Himlinger og kledning', klasser: ['IFCCOVERING'], kode: '', type: '', standard: false, hint: 'Mange og små – vanligvis ikke egne systemer' },
  { id: 'innredning', navn: 'Innredning og møbler', klasser: ['IFCFURNISHINGELEMENT', 'IFCFURNITURE'], kode: '', type: '', standard: false, hint: 'Leietakers eller løst inventar – vanligvis ikke med' },
  { id: 'annet', navn: 'Uspesifiserte objekter (Proxy)', klasser: ['IFCBUILDINGELEMENTPROXY'], kode: '', type: '', standard: false, hint: 'Sjekk navnene før du tar dem med' },
];
export function ifcAntall(m: IfcModell): Record<string, number> { const o: Record<string, number> = {}; for (const k of IFC_KAT) o[k.id] = m.elementer.filter(e => k.klasser.includes(e.klasse)).length; return o; }

export type IfcKomp = { deler?: string[]; guid: string; navn: string; kode: string; lop: string; typekode: string; plassering: string; fabrikat: string; serienr: string; klasse: string; tag: string; etasje: string; brann: string };
const rensNavn = (n: string) => n.replace(/:\d{5,}$/, '').replace(/:/g, ' · ').replace(/[\s-]+$/, '').trim();
const ENTALL: Record<string, string> = { vindu: 'Vindu', dor: 'Dør', fasade: 'Glassfasade', trapp: 'Trapp', rekkverk: 'Rekkverk', sanitar: 'Sanitærutstyr', teknisk: 'Teknisk komponent', himling: 'Himling', innredning: 'Innredning', annet: 'Objekt' };
const brannAv = (e: IfcEl) => { const b = e.egenskaper.FireRating || e.egenskaper.Brannklasse || e.egenskaper.Brannmotstand || ''; return b && !/^(nei|0|-|ingen|none)$/i.test(b) ? b : ''; };

/** Lager en tabell (overskrift + rader) som kan kjøres gjennom den vanlige importen, en type per rad og bygningsdelene (komponentene) per rad.
 *  Gruppering: 1) TFM-merket system i modellen (=360.001 …) – ett system for hele bygget, 2) fagsystem i modellen (IfcSystem),
 *  3) ellers kategori per etasje (f.eks. «Branndører – 2. etasje» med hver dør som komponent). */
export function ifcTilTabell(m: IfcModell, valgt: Set<string>, perEtasje: boolean, sysType?: (kode: string) => string): { R: any[][]; typer: Record<number, string>; komp: Record<number, IfcKomp[]> } {
  const R: any[][] = [['Navn', 'Type', 'Kode', 'Plassering', 'Merknad', 'Løpenr']]; const typer: Record<number, string> = {}; const komp: Record<number, IfcKomp[]> = {};
  type G = { navn: string; kode: string; lop: string; type: string; etasje: string; areal: number; ex: string[]; kilde: string; el: { e: IfcEl; kompKode: string; ent: string }[] };
  const grp = new Map<string, G>();
  const klasseAvGuid = new Map(m.elementer.map(e => [e.guid, e.klasse]));
  for (const kat of IFC_KAT) { if (!valgt.has(kat.id)) continue;
    for (const e of m.elementer) { if (!kat.klasser.includes(e.klasse)) continue; if (e.forelder && kat.klasser.includes(klasseAvGuid.get(e.forelder) || '')) continue; // løp i en trapp som selv er med
      let navn = kat.navn.replace(/ \(foreslått\)| \(.*\)/, ''), kode = e.ns && /^\d{3}/.test(e.ns) ? e.ns.slice(0, 3) : kat.kode, type = kat.type;
      if (kat.id === 'dor') { const brann = brannAv(e); const ext = /^ja$/i.test(e.egenskaper.IsExternal || ''); if (brann) { navn = 'Branndører'; type = 'branndorer'; kode = e.ns?.slice(0, 3) || '244'; } else if (ext) { navn = 'Ytterdører'; type = 'ytterdorer'; kode = e.ns?.slice(0, 3) || '234'; } else { navn = 'Innvendige dører'; type = 'annet'; } }
      let key: string, g0: Omit<G, 'areal' | 'ex' | 'el'>;
      if (e.tfm) { const t = e.tfm; const ty = sysType?.(t.sys) || type; key = 'tfm|' + t.sys + '.' + t.lop; g0 = { navn: e.system || `${t.sys}.${t.lop} ${navn}`, kode: t.sys, lop: t.lop, type: ty, etasje: '', kilde: 'TFM-merking i modellen' }; }
      else if (e.system) { key = 'sys|' + e.system + '|' + kat.id; g0 = { navn: e.system, kode, lop: '', type, etasje: '', kilde: 'system i modellen' }; }
      else { const et = perEtasje ? e.etasje : ''; key = [kat.id, navn, et, e.klasse === 'IFCSTAIRFLIGHT' ? 'x' : ''].join('|'); g0 = { navn: `${navn}${et ? ' – ' + et : ''}`, kode, lop: '', type, etasje: et, kilde: '' }; }
      const g = grp.get(key) || { ...g0, areal: 0, ex: [], el: [] }; g.areal += e.mengder.Area || 0; if (g.ex.length < 4 && e.navn) g.ex.push(rensNavn(e.navn));
      g.el.push({ e, kompKode: e.tfm?.komp || '', ent: kat.id === 'dor' && navn === 'Branndører' ? 'Branndør' : kat.id === 'dor' && navn === 'Ytterdører' ? 'Ytterdør' : ENTALL[kat.id] || 'Objekt' }); grp.set(key, g); } }
  for (const g of grp.values()) { const rad = R.length + 1; const n = g.el.length;
    R.push([g.navn, g.navn, g.kode, g.etasje, `Fra IFC-modell ${m.filnavn}${g.kilde ? ` (${g.kilde})` : ''}: ${n} stk${g.areal ? `, ca. ${Math.round(g.areal)} m² samlet flate` : ''}. Eksempler: ${g.ex.join(', ')}`, g.lop]); typer[rad] = g.type;
    komp[rad] = g.el.map(({ e, kompKode, ent }) => { const b = brannAv(e); const ok = (x: string) => !!x && x.length >= 3 && !/^(obj\.?|objekt)?[\s.-]*\d*$/i.test(x) && !/^[A-ZÆØÅ]{1,2}-?$/i.test(x); const nv = [rensNavn(e.navn), rensNavn(e.type)].find(ok) || ent;
      return { guid: e.guid, ...(e.deler?.length ? { deler: e.deler } : {}), navn: nv + (b ? ` (${b})` : ''), kode: kompKode, lop: e.tfm?.klop || '', typekode: '', plassering: [e.etasje, e.egenskaper.Rom || e.egenskaper.Room || e.egenskaper.RoomName || ''].filter(Boolean).join(' · '), fabrikat: e.fabrikat || '', serienr: e.serienr || '', klasse: e.klasse, tag: e.tag, etasje: e.etasje, brann: b }; }); }
  return { R, typer, komp };
}
