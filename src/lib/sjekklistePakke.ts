// Sjekklistepakke for leietakere uten tilgang til appen:
// ZIP med Sjekkliste.xlsx (én rad per dokumentasjonspunkt, Ja/Nei-nedtrekk) + én mappe per plikt for filer.
// Leietaker fyller ut, legger filer i mappene, zipper og sender tilbake. Eier importerer pakken.
import JSZip from 'jszip';
import { PLIKTER } from './catalog';
import { byId, fdU, today, type Rec } from './utils';
import { tu } from './i18n';
// Tekstene i pakken går gjennom tu(), så pakken følger mottakerens språk når den lages i medUtSprak().
// Innlesingen kjenner igjen arkene og mappene uansett språk (arknummer, «NN »-prefiks og skjult nøkkelkolonne).

const x = (s: any) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[c]);
const col = (i: number) => String.fromCharCode(65 + i);
const mappeNavn = (i: number, navn: string) => String(i + 1).padStart(2, '0') + ' ' + tu(navn).replace(/[\\/]/g, '-').replace(/[:*?"<>|]/g, '').replace(/\s*\(.*?\)\s*/g, ' ').trim().slice(0, 60);

export function pakkePlikter(l: Rec) { return (l.plikter || []).filter((p: any) => !p.ikkeRelevant); }

// ---------- Lag xlsx (minimal OOXML med inline-tekst, stil, nedtrekk og skjult nøkkelkolonne)
function lagXlsx(l: Rec, frist: string): Promise<Blob> {
  const e = byId('eiendommer', l.eiendomId) || ({} as Rec); const pl = pakkePlikter(l);
  const JA = tu('Ja'), NEI = tu('Nei');
  const hode = [tu('Nr'), tu('Plikt'), tu('Dokumentasjon som skal legges ved'), tu('På plass? ({0}/{1})', JA, NEI), tu('Dato (gjennomført)'), tu('Kommentar'), tu('Mappe for filer'), 'nøkkel'];
  const rader: { v: any[]; s?: number }[] = [{ v: hode, s: 1 }];
  pl.forEach((p: any, i: number) => {
    const dok = PLIKTER[p.key]?.dok?.length ? PLIKTER[p.key].dok! : ['Bekreftelse / dokumentasjon'];
    dok.forEach((d, j) => rader.push({ v: [j === 0 ? i + 1 : '', j === 0 ? tu(p.navn) : '', tu(d), '', '', '', j === 0 ? mappeNavn(i, p.navn) : '', p.key + '|' + j], s: j === 0 ? 2 : 0 }));
  });
  const celle = (v: any, r: number, c: number, s = 0) => `<c r="${col(c)}${r}" t="inlineStr"${s ? ` s="${s}"` : ''}><is><t xml:space="preserve">${x(v)}</t></is></c>`;
  const ark1 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols><col min="1" max="1" width="5" customWidth="1"/><col min="2" max="2" width="38" customWidth="1"/><col min="3" max="3" width="52" customWidth="1"/><col min="4" max="4" width="16" customWidth="1"/><col min="5" max="5" width="16" customWidth="1"/><col min="6" max="6" width="40" customWidth="1"/><col min="7" max="7" width="34" customWidth="1"/><col min="8" max="8" width="10" hidden="1" customWidth="1"/></cols>
<sheetData>${rader.map((r, ri) => `<row r="${ri + 1}">${r.v.map((v, ci) => celle(v, ri + 1, ci, ri === 0 ? 1 : ci <= 2 ? (r.s === 2 ? 2 : 3) : ci >= 3 && ci <= 5 ? 4 : 3)).join('')}</row>`).join('')}</sheetData>
<dataValidations count="1"><dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="D2:D${rader.length}"><formula1>"${x(JA)},${x(NEI)}"</formula1></dataValidation></dataValidations>
</worksheet>`;
  const ARK = tu('Sjekkliste'); const SLIK = tu('Slik gjør du');
  const info: [string, string][] = [[tu('Sjekkliste – brann og internkontroll'), ''], [tu('Leietaker'), l.navn || ''], [tu('Eiendom'), [e.navn, e.adresse].filter(Boolean).join(', ')], [tu('Utarbeidet'), fdU(today())], [tu('Svarfrist'), frist ? fdU(frist) : ''], ['', ''],
    [SLIK, ''], ['1.', tu('Fyll ut arket «{0}»: velg {1}/{2} for hvert punkt, skriv dato og eventuell kommentar.', ARK, JA, NEI)], ['2.', tu('Legg dokumentasjonen (PDF, bilder, Word, Excel) i riktig mappe – mappenavnet står i kolonnen «{0}».', tu('Mappe for filer'))], ['3.', tu('Zip hele mappen (høyreklikk → Komprimer / Send til → Komprimert mappe) og send den tilbake på e-post.')], ['', ''], [tu('Referanse (ikke endre)'), 'LT:' + l.id]];
  const ark2 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="1" width="24" customWidth="1"/><col min="2" max="2" width="100" customWidth="1"/></cols>
<sheetData>${info.map((r, i) => `<row r="${i + 1}">${celle(r[0], i + 1, 0, i === 0 || r[0] === SLIK ? 1 : 0)}${celle(r[1], i + 1, 1, 0)}</row>`).join('')}</sheetData></worksheet>`;
  const stil = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE5F1EC"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF8E1"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD3D6CC"/></left><right style="thin"><color rgb="FFD3D6CC"/></right><top style="thin"><color rgb="FFD3D6CC"/></top><bottom style="thin"><color rgb="FFD3D6CC"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
  const z = new JSZip();
  z.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`);
  z.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  z.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${x(ARK.slice(0, 31))}" sheetId="1" r:id="rId1"/><sheet name="${x(tu('Info').slice(0, 31))}" sheetId="2" r:id="rId2"/></sheets></workbook>`);
  z.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  z.file('xl/worksheets/sheet1.xml', ark1); z.file('xl/worksheets/sheet2.xml', ark2); z.file('xl/styles.xml', stil);
  return z.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export function pakkeNavn(l: Rec) { return `${tu('Sjekkliste')} ${String(l.navn || 'leietaker').replace(/[\\/:*?"<>|]/g, '')} ${today()}`; }

// ---------- Lag hele pakken (ZIP)
export async function lagPakke(l: Rec, frist: string): Promise<Blob> {
  const z = new JSZip(); const rot = z.folder(pakkeNavn(l))!; const pl = pakkePlikter(l);
  rot.file(tu('Sjekkliste') + '.xlsx', await lagXlsx(l, frist));
  const ARK = tu('Sjekkliste');
  rot.file(tu('LES MEG') + '.txt', [tu('Sjekkliste – brann og internkontroll for {0}', l.navn || ''), '', tu('1. Åpne {0}.xlsx og fyll ut: {1}/{2} for hvert punkt, dato og kommentar.', ARK, tu('Ja'), tu('Nei')), tu('2. Legg dokumentasjonen i riktig mappe (se kolonnen «{0}»).', tu('Mappe for filer')), tu('3. Zip hele mappen og send den tilbake på e-post.'), frist ? '\n' + tu('Svarfrist: {0}', fdU(frist)) : '', '', tu('Ikke endre nummeret foran mappenavnene, og ikke slett arkene i regnearket – de brukes når pakken leses inn igjen.')].join('\r\n'));
  pl.forEach((p: any, i: number) => {
    const m = rot.folder(mappeNavn(i, p.navn))!;
    m.file('_' + tu('Hva skal ligge her') + '.txt', [tu(p.navn), p.hjemmel ? tu('Hjemmel') + ': ' + p.hjemmel : '', '', tu('Legg ved:'), ...(PLIKTER[p.key]?.dok || ['Bekreftelse / dokumentasjon']).map(d => '- ' + tu(d))].join('\r\n'));
  });
  return z.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

// ---------- Les xlsx (tåler både inline-tekst og delte strenger slik Excel lagrer)
async function lesArk(xlsx: JSZip, navn: string): Promise<Record<string, string>[] | null> {
  const P = new DOMParser(); const les = async (f: string) => { const t = await xlsx.file(f)?.async('string'); return t ? P.parseFromString(t, 'application/xml') : null; };
  const wb = await les('xl/workbook.xml'); const rels = await les('xl/_rels/workbook.xml.rels'); if (!wb || !rels) return null;
  const sh = [...wb.getElementsByTagName('sheet')].find(s => s.getAttribute('name') === navn) || (navn === 'Sjekkliste' ? wb.getElementsByTagName('sheet')[0] : navn === 'Info' ? wb.getElementsByTagName('sheet')[1] : null); if (!sh) return null;
  const rid = sh.getAttribute('r:id') || sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
  const mål = [...rels.getElementsByTagName('Relationship')].find(r => r.getAttribute('Id') === rid)?.getAttribute('Target') || ''; const sti = mål.startsWith('/') ? mål.slice(1) : 'xl/' + mål;
  const ss = await les('xl/sharedStrings.xml'); const delte = ss ? [...ss.getElementsByTagName('si')].map(si => [...si.getElementsByTagName('t')].map(t => t.textContent || '').join('')) : [];
  const ark = await les(sti); if (!ark) return null;
  return [...ark.getElementsByTagName('row')].map(r => { const o: Record<string, string> = {};
    [...r.getElementsByTagName('c')].forEach(c => { const ref = (c.getAttribute('r') || '').replace(/\d+/g, ''); const t = c.getAttribute('t'); const v = c.getElementsByTagName('v')[0]?.textContent ?? '';
      o[ref] = t === 's' ? delte[+v] ?? '' : t === 'inlineStr' ? [...c.getElementsByTagName('t')].map(x => x.textContent || '').join('') : v; });
    return o; });
}
function tilDato(s: string): string {
  s = String(s || '').trim(); if (!s) return '';
  if (/^\d{4,5}(\.\d+)?$/.test(s) && +s > 20000) { const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(+s) * 864e5); return d.toISOString().slice(0, 10); }
  let m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/); if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[0] : '';
}

// Regnearket kjennes igjen på navnet på alle språk (pakken kan være laget på mottakerens språk)
const ARKNAVN = /(sjekkliste|checklist|checklista|tjekliste|lista de verificaci[oó]n)[^/]*\.xlsx$/i;
export type ImportPlikt = { key: string; navn: string; idx: number; sjekk: string[]; antall: number; dato: string; komm: string; filer: File[] };
export type ImportResultat = { leietakerId: string; plikter: ImportPlikt[]; advarsler: string[]; ukjenteFiler: string[] };

// ---------- Les pakken: ZIP (med xlsx og mapper), eller en løs xlsx + løse filer
export async function lesPakke(l: Rec, filer: File[]): Promise<ImportResultat> {
  const adv: string[] = []; const pl = pakkePlikter(l); const alle = l.plikter || [];
  let xlsx: JSZip | null = null; const løse: { sti: string; fil: File }[] = [];
  for (const f of filer) {
    if (/\.zip$/i.test(f.name)) {
      const z = await JSZip.loadAsync(f);
      for (const [sti, ent] of Object.entries(z.files)) {
        const del = sti.split('/').filter(Boolean); const fn = del[del.length - 1] || '';
        // hopp over systemfiler, «_Hva skal ligge her.txt» i mappene og LES MEG-filen i rotmappen (navnene er oversatt)
        if (ent.dir || /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db)/i.test(sti) || /^_.*\.txt$/i.test(fn) || (del.length <= 2 && /\.txt$/i.test(fn))) continue;
        if (ARKNAVN.test(sti) || (!xlsx && /\.xlsx$/i.test(sti) && !/\/\d{2} [^/]+\//.test(sti))) { xlsx = await JSZip.loadAsync(await ent.async('arraybuffer')); continue; }
        const b = await ent.async('blob'); løse.push({ sti, fil: new File([b], sti.split('/').pop()!, { type: mime(sti) }) });
      }
    } else if (ARKNAVN.test(f.name) && !xlsx) xlsx = await JSZip.loadAsync(f);
    else løse.push({ sti: f.name, fil: f });
  }
  const res: Record<string, ImportPlikt> = {};
  const finn = (key: string) => { const idx = alle.findIndex((p: any) => p.key === key); return idx >= 0 ? { p: alle[idx], idx } : null; };
  const sikre = (key: string) => { if (!res[key]) { const f = finn(key); if (!f) return null; res[key] = { key, navn: f.p.navn, idx: f.idx, sjekk: [], antall: (PLIKTER[key]?.dok || ['x']).length, dato: '', komm: '', filer: [] }; } return res[key]; };
  if (xlsx) {
    const info = await lesArk(xlsx, 'Info'); const ref = info?.flatMap(r => Object.values(r)).find(v => /^LT:/.test(v));
    if (ref && ref.slice(3) !== l.id) adv.push('Sjekklisten ser ut til å være laget for en annen leietaker. Kontroller før du godkjenner.');
    const rader = (await lesArk(xlsx, 'Sjekkliste')) || []; const komm: Record<string, string[]> = {};
    rader.slice(1).forEach(r => {
      const [key, j] = String(r.H || '').split('|'); if (!key) return; const o = sikre(key); if (!o) return;
      const dok = PLIKTER[key]?.dok || ['Bekreftelse / dokumentasjon']; const ja = /^\s*(ja|j|x|yes|y|sí|si|s|✓|true|1)\s*$/i.test(r.D || '');
      if (ja && dok[+j]) o.sjekk.push(dok[+j]); const d = tilDato(r.E); if (d && !o.dato) o.dato = d;
      if ((r.F || '').trim()) (komm[key] ||= []).push(((r.C ? r.C + ': ' : '') + r.F.trim()));
    });
    Object.entries(komm).forEach(([k, v]) => { if (res[k]) res[k].komm = v.join('\n'); });
  } else adv.push('Fant ikke Sjekkliste.xlsx – bare filene leses inn.');
  const ukjente: string[] = [];
  løse.forEach(({ sti, fil }) => { const m = sti.match(/(?:^|\/)(\d{2}) [^/]*\//); const i = m ? +m[1] - 1 : -1; const p = i >= 0 ? pl[i] : null; const o = p && sikre(p.key); if (o) o.filer.push(fil); else ukjente.push(sti); });
  if (ukjente.length) adv.push(`${ukjente.length} filer lå ikke i en plikt-mappe og blir ikke lest inn.`);
  return { leietakerId: l.id, plikter: Object.values(res).filter(o => o.sjekk.length || o.filer.length || o.dato || o.komm), advarsler: adv, ukjenteFiler: ukjente };
}
const mime = (n: string) => /\.pdf$/i.test(n) ? 'application/pdf' : /\.(jpe?g)$/i.test(n) ? 'image/jpeg' : /\.png$/i.test(n) ? 'image/png' : /\.docx$/i.test(n) ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : /\.xlsx$/i.test(n) ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/octet-stream';

export async function blobTilBase64(b: Blob): Promise<string> { const buf = new Uint8Array(await b.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000)); return btoa(s); }
