#!/usr/bin/env node
// Regelverkssjekk: sammenligner lovene og forskriftene appen viser til (regelverk/kilder.json) med gjeldende tekst hos
// Lovdata (åpne data, NLOD 2.0 – kilde: Lovdata). Kjøres ukentlig av GitHub Actions (.github/workflows/regelverk.yml).
//
//   node scripts/regelverkssjekk.mjs              sjekk og skriv rapport
//   node scripts/regelverkssjekk.mjs --godkjenn   appen er oppdatert: gjeldende tekst blir ny grunnlinje
//   node scripts/regelverkssjekk.mjs --lokal DIR  bruk allerede utpakkede Lovdata-filer i DIR (for testing)
//
// Utdata: regelverk/grunnlinje.json (tekst appen er kontrollert mot), public/regelverk-status.json (vises i appen),
// regelverk/rapport.md (til issue/e-post) og regelverk/varsel.json (sendes til serverfunksjonen når noe er nytt).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.lovdata.no/v1/publicData';
const DATASETT = ['gjeldende-lover.tar.bz2', 'gjeldende-sentrale-forskrifter.tar.bz2'];
const arg = process.argv.slice(2); const GODKJENN = arg.includes('--godkjenn'); const LOKAL = arg.includes('--lokal') ? arg[arg.indexOf('--lokal') + 1] : '';
const P = { kilder: join(ROT, 'regelverk/kilder.json'), grunn: join(ROT, 'regelverk/grunnlinje.json'), status: join(ROT, 'public/regelverk-status.json'), rapport: join(ROT, 'regelverk/rapport.md'), varsel: join(ROT, 'regelverk/varsel.json'), varslet: join(ROT, 'regelverk/varslet.json') };
const les = (f, d) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return d; } };
const skriv = (f, v) => { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, typeof v === 'string' ? v : JSON.stringify(v, null, 2) + '\n'); };
const hash = s => createHash('sha256').update(s).digest('hex').slice(0, 16);
const naa = new Date().toISOString();

// ---------- Hent og pakk ut datasettene
async function hent() {
  if (LOKAL) return { dir: LOKAL, meta: {} };
  const dir = mkdtempSync(join(tmpdir(), 'lovdata-')); const meta = {};
  try { const r = await fetch(`${API}/list`); if (r.ok) for (const x of await r.json()) meta[x.filename || x.name] = x.lastModified || x.last_modified || ''; } catch { /* listen er bare informasjon */ }
  for (const f of DATASETT) {
    const r = await fetch(`${API}/get/${f}`); if (!r.ok) throw new Error(`Lovdata svarte ${r.status} for ${f}`);
    const fil = join(dir, f); writeFileSync(fil, Buffer.from(await r.arrayBuffer()));
    const ut = join(dir, f.replace('.tar.bz2', '')); mkdirSync(ut, { recursive: true }); execFileSync('tar', ['-xjf', fil, '-C', ut]);
  }
  return { dir, meta };
}
function alleFiler(dir) { const ut = []; const gaa = d => { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? gaa(p) : /\.(xml|html?)$/i.test(n) && ut.push(p); } }; gaa(dir); return ut; }

// ---------- Tolking av Lovdata-dokument (robust mot små endringer i formatet)
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', sect: '§', aelig: 'æ', oslash: 'ø', aring: 'å', AElig: 'Æ', Oslash: 'Ø', Aring: 'Å', ndash: '–', mdash: '—' };
const tekst = s => s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>|<\/(p|li|h\d|div|dd|dt|tr)>/gi, '\n').replace(/<[^>]+>/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&(\w+);/g, (m, e) => ENT[e] ?? m)
  .replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{2,}/g, '\n').trim();
const normPar = s => s.replace(/\s+/g, ' ').replace(/§\s*/, '§ ').replace(/\.$/, '').trim();
function tolk(xml) {
  const tittel = tekst((xml.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || xml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [, ''])[1]).replace(/\s+/g, ' ');
  const T = tekst(xml);
  const felt = navn => { const m = T.match(new RegExp(navn + '\\s*:?\\s*\\n?([^\\n]{3,200})', 'i')); return m ? m[1].trim() : ''; };
  const meta = { sistEndret: felt('Sist endret'), ikraft: felt('Ikrafttredelse'), korttittel: felt('Korttittel'), id: felt('Dato') };
  // Paragrafer: 1) Lovdatas merking (legalArticleValue), 2) tekstoverskrifter «§ 5. Tittel»
  const par = {}; let metode = '';
  const merk = [...xml.matchAll(/class="[^"]*legalArticleValue[^"]*"[^>]*>([\s\S]*?)<\/span>/gi)];
  if (merk.length) { metode = 'merking';
    for (let i = 0; i < merk.length; i++) { const k = normPar(tekst(merk[i][1])); if (!/^§ /.test(k)) continue; const slutt = i + 1 < merk.length ? merk[i + 1].index : xml.length;
      const t = tekst(xml.slice(Math.max(0, xml.lastIndexOf('<', merk[i].index)), slutt)).replace(/\s+/g, ' ').trim(); if (!par[k]) par[k] = t; } }
  else { const re = /(?:^|\n)(§\s?\d+[a-zA-Z]?(?:-\d+[a-zA-Z]?)?)\.?\s+(?=[A-ZÆØÅ(])/g; const hits = [...T.matchAll(re)];
    if (hits.length) { metode = 'tekst'; for (let i = 0; i < hits.length; i++) { const k = normPar(hits[i][1]); const t = T.slice(hits[i].index, i + 1 < hits.length ? hits[i + 1].index : T.length).replace(/\s+/g, ' ').trim(); if (!par[k]) par[k] = t; } } }
  return { tittel, meta, par, metode, dokHash: hash(T.replace(/\s+/g, ' ')), lengde: T.length };
}
const idTilFil = id => { const m = String(id || '').match(/^(LOV|FOR)-(\d{4})-(\d{2})-(\d{2})-(\d+)$/i); return m ? new RegExp(`^${m[1].toUpperCase() === 'LOV' ? 'nl' : 'sf'}-${m[2]}${m[3]}${m[4]}-0*${+m[5]}\\.(xml|html?)$`, 'i') : null; };
const lenke = (k, fil) => k.id ? `https://lovdata.no/${/^LOV/i.test(k.id) ? 'lov' : 'forskrift'}/${k.id.replace(/^(LOV|FOR)-/i, '').toLowerCase()}` : fil ? `https://lovdata.no/dokument/${/^nl/.test(basename(fil)) ? 'NL/lov' : 'SF/forskrift'}/${basename(fil).replace(/\.\w+$/, '').replace(/^\w+-(\d{4})(\d{2})(\d{2})-0*(\d+)$/, '$1-$2-$3-$4')}` : 'https://lovdata.no';

// ---------- Henvisninger i koden som ikke overvåkes
function skannKode(kilder) {
  const navn = kilder.flatMap(k => [k.navn, k.tittel, k.key].filter(Boolean).map(s => s.toLowerCase().split(' (')[0]));
  const funn = {}; const re = /\b([A-ZÆØÅa-zæøå\-]{4,}(?:loven|lova|forskriften))\b/g;
  const gaa = d => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) gaa(p); else if (/\.(tsx?|json)$/.test(n)) for (const m of readFileSync(p, 'utf8').matchAll(re)) { const w = m[1].toLowerCase(); if (!navn.some(x => x.includes(w) || w.includes(x.split(' ')[0]))) (funn[w] ||= new Set()).add(p.replace(ROT + '/', '')); } } };
  gaa(join(ROT, 'src')); return Object.fromEntries(Object.entries(funn).map(([k, v]) => [k, [...v].slice(0, 5)]));
}

// ---------- Hovedløp
const { kilder } = les(P.kilder, { kilder: [] }); const grunn = les(P.grunn, null);
const { dir, meta } = await hent(); const filer = alleFiler(dir); console.log(`Lovdata: ${filer.length} dokumenter lest`);
const naaData = {}; const problemer = [];
for (const k of kilder) {
  let fil = filer.find(f => idTilFil(k.id)?.test(basename(f)));
  let d = fil ? tolk(readFileSync(fil, 'utf8')) : null;
  if (!d && k.tittel) { const t = k.tittel.toLowerCase(); fil = filer.find(f => { const s = readFileSync(f, 'utf8').slice(0, 4000).toLowerCase(); return s.includes(t); }); d = fil ? tolk(readFileSync(fil, 'utf8')) : null; }
  if (!d && k.sok) { // nøkkelord i tittelen, f.eks. «trykkpåkjent» + «håndtering»
    const ord = k.sok.map(x => x.toLowerCase()); const kand = filer.map(f => [f, (readFileSync(f, 'utf8').match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').toLowerCase()]).filter(([, t]) => ord.every(o => t.includes(o)));
    if (kand.length) { fil = kand[0][0]; d = tolk(readFileSync(fil, 'utf8')); if (kand.length > 1) problemer.push(`${k.navn}: flere treff på søkeordene (${kand.slice(0, 4).map(([f, t]) => basename(f) + ' «' + t.slice(0, 80) + '»').join('; ')}) – brukte ${basename(fil)}. Sett riktig id i kilder.json.`); }
    else { const delvis = filer.map(f => [f, (readFileSync(f, 'utf8').match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '')]).filter(([, t]) => t.toLowerCase().includes(ord[0])).slice(0, 5);
      if (delvis.length) problemer.push(`${k.navn}: mulige treff – ${delvis.map(([f, t]) => basename(f) + ' «' + tekst(t).slice(0, 90) + '»').join('; ')}`); }
  }
  if (d && !k.id && fil) problemer.push(`${k.navn}: funnet som ${basename(fil)} («${d.tittel.slice(0, 90)}») – sett id i kilder.json for sikker identifisering`);
  if (!d) { naaData[k.key] = { finnes: false }; problemer.push(`${k.navn}: fant ikke dokumentet blant gjeldende lover/forskrifter (opphevet, nytt navn eller feil ID)`); continue; }
  const valgt = Object.fromEntries(Object.entries(d.par).filter(([p]) => (k.paragrafer || []).includes(p) || (k.prefiks || []).some(x => p.startsWith(x))));
  for (const p of k.paragrafer || []) if (!d.par[p]) problemer.push(`${k.navn}: fant ikke ${p} i gjeldende tekst${d.metode ? '' : ' (paragrafene kunne ikke tolkes – bare hele dokumentet sammenlignes)'}`);
  naaData[k.key] = { finnes: true, fil: basename(fil), lenke: lenke(k, fil), tittel: d.tittel, meta: d.meta, dokHash: d.dokHash, metode: d.metode,
    par: Object.fromEntries(Object.entries(valgt).map(([p, t]) => [p, { hash: hash(t), tekst: t.slice(0, 6000) }])) };
}

if (GODKJENN || !grunn) {
  skriv(P.grunn, { kontrollert: naa, av: process.env.GITHUB_ACTOR || process.env.USER || '', kilde: 'Lovdata – gjeldende lover og sentrale forskrifter (NLOD 2.0)', datasett: meta, data: naaData });
  console.log(GODKJENN ? 'Grunnlinjen er oppdatert – appen er kontrollert mot gjeldende regelverk.' : 'Første kjøring: grunnlinje opprettet.');
}
const G = (GODKJENN || !grunn) ? naaData : grunn.data;

// Sammenlign med grunnlinjen
const endringer = [];
for (const k of kilder) {
  const a = G[k.key], b = naaData[k.key]; if (!b) continue;
  if (!a) { endringer.push({ key: k.key, navn: k.navn, type: 'ny', tekst: 'Ny kilde i kilder.json – kjør med --godkjenn for å ta den inn i grunnlinjen', brukesI: k.brukesI }); continue; }
  if (a.finnes && !b.finnes) { endringer.push({ key: k.key, navn: k.navn, type: 'opphevet', tekst: 'Finnes ikke lenger blant gjeldende lover/forskrifter – kan være opphevet eller erstattet', brukesI: k.brukesI }); continue; }
  if (!b.finnes) continue;
  const parE = [];
  for (const p of new Set([...Object.keys(a.par || {}), ...Object.keys(b.par || {})])) {
    const x = a.par?.[p], y = b.par?.[p];
    if (x && !y) parE.push({ p, type: 'fjernet', for: x.tekst.slice(0, 1500), etter: '' });
    else if (!x && y) parE.push({ p, type: 'ny', for: '', etter: y.tekst.slice(0, 1500) });
    else if (x.hash !== y.hash) parE.push({ p, type: 'endret', for: x.tekst.slice(0, 1500), etter: y.tekst.slice(0, 1500) });
  }
  const dokEndret = a.dokHash !== b.dokHash; const metaEndret = (a.meta?.sistEndret || '') !== (b.meta?.sistEndret || '');
  if (parE.length || metaEndret || (dokEndret && !Object.keys(b.par || {}).length))
    endringer.push({ key: k.key, navn: k.navn, type: parE.length ? 'paragraf' : 'dokument', lenke: b.lenke, sistEndretFor: a.meta?.sistEndret || '', sistEndret: b.meta?.sistEndret || '', paragrafer: parE, brukesI: k.brukesI,
      tekst: parE.length ? `${parE.length} paragraf(er) appen bygger på er endret: ${parE.map(x => x.p).join(', ')}` : metaEndret ? `Dokumentet er endret (sist endret: ${b.meta.sistEndret || 'ukjent'}). Paragrafene appen viser til ser uendret ut – kontroller likevel.` : 'Dokumentet er endret – paragrafnivå kunne ikke sammenlignes.' });
}
const ikkeOvervaket = skannKode(kilder);

// Status til appen (uten lovtekst – bare oversikt)
const status = { sjekket: naa, kontrollertMot: grunn?.kontrollert && !GODKJENN ? grunn.kontrollert : naa, kilde: 'Lovdata (NLOD 2.0)', antallKilder: kilder.length,
  endringer: endringer.map(e => ({ navn: e.navn, type: e.type, tekst: e.tekst, lenke: e.lenke, paragrafer: (e.paragrafer || []).map(x => x.p), sistEndret: e.sistEndret })),
  kilder: kilder.map(k => ({ navn: k.navn, lenke: naaData[k.key]?.lenke || '', sistEndret: naaData[k.key]?.meta?.sistEndret || '', finnes: naaData[k.key]?.finnes !== false })) };
skriv(P.status, status);

// Rapport til utvikler
const md = [`# Regelverkssjekk ${naa.slice(0, 10)}`, '', `Kontrollert mot grunnlinje fra ${String(status.kontrollertMot).slice(0, 10)}. Kilde: Lovdata, gjeldende lover og sentrale forskrifter (NLOD 2.0).`, '',
  endringer.length ? `## ${endringer.length} endring(er) som kan kreve oppdatering av appen` : '## Ingen endringer i regelverket appen viser til', '',
  ...endringer.flatMap(e => [`### ${e.navn}`, e.tekst, e.lenke ? `Lovdata: ${e.lenke}` : '', e.sistEndret ? `Sist endret: ${e.sistEndretFor || '–'} → ${e.sistEndret}` : '', `Brukes i appen: ${(e.brukesI || []).join('; ')}`, '',
    ...(e.paragrafer || []).flatMap(x => [`<details><summary>${x.p} – ${x.type}</summary>`, '', x.for ? '**Før:**\n\n> ' + x.for.replace(/\n/g, '\n> ') : '', '', x.etter ? '**Nå:**\n\n> ' + x.etter.replace(/\n/g, '\n> ') : '', '', '</details>', '']), '']),
  problemer.length ? '## Merknader' : '', ...problemer.map(x => '- ' + x), '',
  Object.keys(ikkeOvervaket).length ? '## Henvisninger i koden som ikke overvåkes' : '', ...Object.entries(ikkeOvervaket).map(([k, f]) => `- **${k}** (${f.join(', ')}) – legg til i regelverk/kilder.json om den er relevant`), '',
  '---', 'Når appen er oppdatert: kjør arbeidsflyten «Regelverkssjekk» manuelt med «godkjenn» = true, eller `node scripts/regelverkssjekk.mjs --godkjenn`, og commit grunnlinjen.'].filter((x, i, A) => !(x === '' && A[i - 1] === '')).join('\n');
skriv(P.rapport, md);

// Varsle bare når noe er nytt siden forrige varsel
const fingeravtrykk = hash(JSON.stringify(endringer.map(e => [e.key, e.type, (e.paragrafer || []).map(x => x.p + x.type), e.sistEndret])) + JSON.stringify(problemer));
const forrige = les(P.varslet, {});
const nytt = !GODKJENN && (endringer.length > 0 || problemer.length > 0) && forrige.fingeravtrykk !== fingeravtrykk;
const forsteGang = !grunn && !GODKJENN;
if (nytt || forsteGang || GODKJENN) {
  skriv(P.varsel, { type: GODKJENN ? 'godkjent' : forsteGang ? 'startet' : 'endringer', sjekket: naa, endringer: status.endringer, problemer, rapport: md.slice(0, 60000) });
  skriv(P.varslet, { fingeravtrykk: GODKJENN ? '' : fingeravtrykk, tid: naa });
}
console.log(endringer.length ? `${endringer.length} endringer funnet` : 'Ingen endringer', problemer.length ? `· ${problemer.length} merknader` : '', nytt ? '· nytt varsel' : '');
process.exitCode = 0;
