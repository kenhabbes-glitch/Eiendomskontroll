// Import av datainnsamlingsfil for systemer (Excel, ark «Data»): NS 3451-kode, løpenummer, beskrivelse, mengde, kost, TG, år.
// Filen leses i nettleseren – ingenting sendes til tredjepart.
import JSZip from 'jszip';
import { KOMP, TFM_DEF } from './catalog';
import { S } from './store';
import { pad, type Rec } from './utils';

// ---------- minimal xlsx-leser (delte strenger, tall, boolske, datoer som serienummer)
export async function lesXlsx(fil: Blob): Promise<Record<string, any[][]>> {
  const z = await JSZip.loadAsync(fil); const dp = new DOMParser();
  const xml = async (p: string) => { const f = z.file(p); return f ? dp.parseFromString(await f.async('string'), 'application/xml') : null; };
  const ss: string[] = []; const sst = await xml('xl/sharedStrings.xml');
  sst?.querySelectorAll('si').forEach(si => ss.push(Array.from(si.getElementsByTagName('t')).map(t => t.textContent || '').join('')));
  const wb = await xml('xl/workbook.xml'); const rels = await xml('xl/_rels/workbook.xml.rels'); const ut: Record<string, any[][]> = {};
  const relMap: Record<string, string> = {}; rels?.querySelectorAll('Relationship').forEach(r => { relMap[r.getAttribute('Id') || ''] = r.getAttribute('Target') || ''; });
  for (const sh of Array.from(wb?.getElementsByTagName('sheet') || [])) {
    const rid = sh.getAttribute('r:id') || sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || '';
    let t = relMap[rid] || ''; if (!t) continue; t = t.startsWith('/') ? t.slice(1) : 'xl/' + t.replace(/^\.\//, '');
    const doc = await xml(t); if (!doc) continue; const rader: any[][] = [];
    for (const row of Array.from(doc.getElementsByTagName('row'))) {
      const r = +(row.getAttribute('r') || rader.length + 1) - 1; const cells: any[] = [];
      for (const c of Array.from(row.getElementsByTagName('c'))) {
        const ref = c.getAttribute('r') || ''; const kol = ref.replace(/\d+/g, '').split('').reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1;
        const typ = c.getAttribute('t'); const v = c.getElementsByTagName('v')[0]?.textContent ?? null;
        let val: any = v;
        if (typ === 's') val = v != null ? ss[+v] : null; else if (typ === 'b') val = v === '1'; else if (typ === 'inlineStr') val = Array.from(c.getElementsByTagName('t')).map(x => x.textContent).join('');
        else if (typ === 'str' || typ === 'e') val = v; else if (v != null && v !== '' && isFinite(+v)) val = +v;
        cells[kol] = val;
      }
      rader[r] = cells;
    }
    ut[sh.getAttribute('name') || t] = rader;
  }
  return ut;
}
const serieDato = (n: any) => typeof n === 'number' && n > 20000 && n < 80000 ? new Date(Date.UTC(1899, 11, 30) + n * 864e5).toISOString().slice(0, 10) : typeof n === 'string' && /^\d{4}-\d{2}-\d{2}/.test(n) ? n.slice(0, 10) : '';
const tallV = (v: any) => typeof v === 'number' ? v : typeof v === 'string' && v.trim() && isFinite(+v.replace(',', '.').replace(/\s/g, '')) ? +v.replace(',', '.').replace(/\s/g, '') : null;
const midt = (v: any) => { if (typeof v === 'number') return v; const m = String(v || '').match(/(\d+)\s*[-–]\s*(\d+)/); return m ? Math.round((+m[1] + +m[2]) / 2) : tallV(v); };

export type ImportRad = { rad: number; kode: string; gruppe: string; del: string; lop: string; navn: string; type: string; antall: number | null; enhet: string; enhetskost: number | null; kost: number | null; kostAar: number | null;
  tg: string; levetid: number | null; aar: number | null; planAar: number | null; service: string; komm: string; finnes?: Rec | null; ta: boolean };

/** Finn katalogtype ut fra NS 3451-kode og beskrivelse */
export function gjettType(kode: string, tekst: string): string {
  const t = tekst.toLowerCase(); const kand = Object.entries(TFM_DEF).filter(([, d]) => d[0] === kode).map(([k]) => k).filter(k => KOMP[k]);
  const ord: [RegExp, string][] = [[/pvc|folie|membran|protan/, 'tak_folie'], [/papp|asfalt/, 'tak_asfalt'], [/stein|plate/, 'tak_stein'], [/heis/, 'heis'], [/rulletrapp|rullebånd/, 'rulletrapp'], [/løftebord|plattform/, 'loft'],
    [/kanal/, 'kanaler'], [/spjeld/, 'brannspjeld'], [/varmepumpe/, 'varmepumpe'], [/fjernvarme/, 'fjernvarme'], [/fjernkjøl/, 'fjernkjoling'], [/kjøl/, 'kjole'], [/kjel|fyring/, 'kjel'], [/radiator/, 'radiator'],
    [/nødlys|ledelys/, 'nodlys'], [/brannalarm|brannsentral/, 'brannalarm'], [/sprinkler/, 'sprinkler'], [/belysning|lys|led/, 'belysning'], [/energimerk|energiattest/, 'dok_miljo'], [/slokker/, 'slokkere'], [/røykluke/, 'roykluker']];
  // Nøkkelord vinner når typen hører til samme bygningsdelsgruppe (f.eks. «Personheis» i gruppe 62 → heis, ikke løftebord)
  for (const [re, k] of ord) if (re.test(t) && KOMP[k] && (kand.includes(k) || (TFM_DEF[k]?.[0] || '').startsWith(kode.slice(0, 2)))) return k;
  if (kand.length) return kand[0];
  for (const [re, k] of ord) if (re.test(t) && KOMP[k]) return k;
  return '';
}

/** Les arket «Data» og lag forslag til systemer for en eiendom */
export function tolkData(ark: Record<string, any[][]>, eid: string): { rader: ImportRad[]; feil: string } {
  const navn = Object.keys(ark).find(n => n.toLowerCase() === 'data') || Object.keys(ark).find(n => (ark[n][0] || []).some((h: any) => /bygningsdel/i.test(String(h || ''))));
  if (!navn) return { rader: [], feil: 'Fant ikke arket «Data» med kolonnene Hoveddel / Bygningsdelsgruppe / Bygningsdel.' };
  const R = ark[navn]; const hdr = (R[0] || []).map((h: any) => String(h || '').replace(/\s+/g, ' ').trim().toLowerCase());
  const kol = (...navnRe: RegExp[]) => hdr.findIndex(h => navnRe.some(re => re.test(h)));
  const K = { hoved: kol(/^hoveddel/), gruppe: kol(/^bygningsdelsgruppe/), del: kol(/^bygningsdel$/), id: kol(/^unik id/), beskr: kol(/^beskrivelse/), tek: kol(/^teknisk levetid/), antall: kol(/^antall/), enhet: kol(/^enhet$/),
    ek: kol(/^enhetskost/), kost: kol(/^kost$/), tg: kol(/tilstandsgrad/), lev: kol(/vurdert levetid/), service: kol(/servicerapport/), komm: kol(/begrunnelse|kommentar/), akt: kol(/aktuelt for bygg/),
    aar: kol(/^installasjonsår/), plan: kol(/^planlagt investeringsår/), just: kol(/^justering/), revAar: kol(/^rev år/), kostNaa: kol(/^estimat kost nåtid/) };
  if (K.gruppe < 0) return { rader: [], feil: 'Arket mangler kolonnen «Bygningsdelsgruppe».' };
  const v = (r: any[], i: number) => i >= 0 ? r[i] : null; const ut: ImportRad[] = []; const brukt: Record<string, number> = {}; const tatt = new Set<string>();
  R.forEach((r, i) => {
    if (!r || i === 0) return;
    const akt = K.akt >= 0 ? v(r, K.akt) : true; if (akt !== true && String(akt).toLowerCase() !== 'true' && String(akt).toLowerCase() !== 'ja') return;
    const del = String(v(r, K.del) || '').trim(); const gruppe = String(v(r, K.gruppe) || '').trim(); const beskr = String(v(r, K.beskr) || '').trim(); const id = v(r, K.id);
    const kode = (del.match(/^(\d{2,3})/) || gruppe.match(/^(\d{2,3})/) || [])[1] || ''; if (!kode) return;
    const idTxt = id == null ? '' : String(typeof id === 'number' ? pad(id) : id).trim(); const lopNum = /^\d{1,3}$/.test(idTxt) ? pad(idTxt) : '';
    const tekst = [beskr, lopNum ? '' : idTxt, del.replace(/^\d+\s*-\s*/, ''), gruppe.replace(/^\d+\s*-\s*/, '')].filter(Boolean).join(' ');
    let type = gjettType(kode.length === 3 ? kode : kode + '0', tekst); if (!type) type = gjettType(kode, tekst);
    const tfm = kode.length === 3 ? kode : (TFM_DEF[type]?.[0] || kode + '0');
    const rNavn = beskr || (lopNum ? '' : idTxt) || del.replace(/^\d+\s*-\s*/, '') || gruppe.replace(/^\d+\s*-\s*/, '');
    // løpenummer: fra filen; ellers et tidligere importert system med samme kode og navn; ellers neste ledige
    const nk = tfm; let lop = lopNum;
    if (!lop) { const tidl = S.anlegg.find(a => a.eiendomId === eid && a.tfmSys === nk && !tatt.has(a.id) && (a.navn || '') === rNavn && a.importKilde); if (tidl) lop = pad(tidl.tfmLop); }
    if (!lop) { const fra = Math.max(0, ...S.anlegg.filter(a => a.eiendomId === eid && a.tfmSys === nk).map(a => +a.tfmLop || 0), brukt[nk] || 0); lop = pad(fra + 1); }
    brukt[nk] = Math.max(brukt[nk] || 0, +lop);
    const lev = tallV(v(r, K.lev)); const plan = tallV(v(r, K.just)) || tallV(v(r, K.plan));
    const finnes = S.anlegg.find(a => a.eiendomId === eid && a.tfmSys === tfm && pad(a.tfmLop) === lop) || null; if (finnes) tatt.add(finnes.id);
    ut.push({ rad: i + 1, kode: tfm, gruppe, del, lop, navn: rNavn, type,
      antall: tallV(v(r, K.antall)), enhet: String(v(r, K.enhet) || '').trim(), enhetskost: tallV(v(r, K.ek)), kost: tallV(v(r, K.kostNaa)) ?? tallV(v(r, K.kost)), kostAar: tallV(v(r, K.revAar)),
      tg: /^TG[0-3]$/i.test(String(v(r, K.tg) || '').trim()) ? String(v(r, K.tg)).trim().toUpperCase() : '',
      levetid: lev != null && lev > 0 && lev < 200 ? lev : midt(v(r, K.tek)), aar: tallV(v(r, K.aar)), planAar: plan && plan > 1900 ? plan : (lev && lev > 1900 ? lev : null),
      service: serieDato(v(r, K.service)), komm: String(v(r, K.komm) || '').trim(), finnes, ta: true });
  });
  return { rader: ut, feil: ut.length ? '' : 'Fant ingen rader merket «Aktuelt for bygg».' };
}

/** Gjør en importrad om til systemdata */
export function tilSystem(r: ImportRad, eid: string, eks?: Rec | null): Rec {
  const m2 = /^m(2|²)$/i.test(r.enhet) && r.antall && r.enhetskost;
  const notat = [r.antall && !m2 ? `Antall: ${r.antall.toLocaleString('nb-NO')} ${r.enhet || 'stk'}${r.enhetskost ? ` à ${r.enhetskost.toLocaleString('nb-NO')} kr` : ''}` : '', r.service ? `Siste servicerapport: ${r.service.split('-').reverse().join('.')}` : '', r.komm].filter(Boolean).join('\n');
  const ny: Rec = { ...(eks || {}), eiendomId: eid, type: r.type || eks?.type || '', tfmSys: r.kode, tfmLop: r.lop, navn: r.navn || eks?.navn || '',
    ...(r.aar ? { aar: r.aar } : {}), ...(r.levetid ? { levetid: r.levetid } : {}), ...(r.planAar ? { planAar: r.planAar } : {}),
    ...(r.tg ? { tg: r.tg, tgdato: eks?.tg === r.tg ? eks.tgdato : new Date().toISOString().slice(0, 10), tgKomm: r.komm || eks?.tgKomm || '' } : {}),
    ...(m2 ? { kostMetode: 'm2', mengde: r.antall, m2pris: r.enhetskost, kost: Math.round(r.antall! * r.enhetskost!), kostAar: r.kostAar || new Date().getFullYear() }
      : r.kost ? { kostMetode: 'fast', kost: r.kost, kostAar: r.kostAar || new Date().getFullYear() } : {}),
    ...(notat ? { notat: eks?.notat && !eks.notat.includes(notat) ? eks.notat + '\n' + notat : notat } : {}),
    importKilde: { dato: new Date().toISOString().slice(0, 10), rad: r.rad } } as any;
  return ny;
}
