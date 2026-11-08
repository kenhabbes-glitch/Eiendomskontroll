#!/usr/bin/env node
// Regelverkssjekk for landpakker uten egen tilpasset sjekk (Sverige og Danmark).
// Kildene leses fra appens egen liste (PAKKE_<LAND>.kilder i src/lib/land/<land>.ts), så det bare finnes ett sted å
// vedlikeholde dem. Hver kilde med sjekk:'side' hentes og sammenlignes med grunnlinjen:
//  - Riksdagen (SFS): «Ändrad: t.o.m. SFS åååå:nnn» – ny ändringsförfattning gir varsel.
//  - Retsinformation (DK): status «Gældende/Historisk» og listen «Senere ændringer til forskriften».
//  - Andre sider (Boverket, MSB, EUR-Lex, bygningsreglementet.dk): fingeravtrykk av hovedteksten.
// Kilder med sjekk:'manuell' listes bare i rapporten.
//
//   node scripts/regelverkssjekk-land.mjs se|dk [--godkjenn]
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROT = join(dirname(fileURLToPath(import.meta.url)), '..');
const land = (process.argv[2] || '').toLowerCase(); if (!/^(se|dk)$/.test(land)) { console.error('Bruk: regelverkssjekk-land.mjs se|dk'); process.exit(1); }
const GODKJENN = process.argv.includes('--godkjenn');
const P = { kilder: join(ROT, `src/lib/land/${land}.ts`), grunn: join(ROT, `regelverk/grunnlinje-${land}.json`), status: join(ROT, `public/regelverk-status-${land}.json`), rapport: join(ROT, `regelverk/rapport-${land}.md`), varsel: join(ROT, `regelverk/varsel-${land}.json`) };
const les = (f, d) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return d; } };
const skriv = (f, v) => { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, typeof v === 'string' ? v : JSON.stringify(v, null, 2) + '\n'); };
const naa = new Date().toISOString();

const src = readFileSync(P.kilder, 'utf8'); const blokk = src.slice(src.indexOf('kilder: ['), src.indexOf('],', src.indexOf('kilder: [')));
const KILDER = [...blokk.matchAll(/\{\s*navn:\s*'([^']+)',\s*lenke:\s*'([^']+)',\s*niva:\s*'([^']+)'(?:,\s*sjekk:\s*'([^']+)')?\s*\}/g)].map(m => ({ navn: m[1], lenke: m[2], niva: m[3], sjekk: m[4] || 'side' }));
if (!KILDER.length) { console.error('Fant ingen kilder'); process.exit(1); }

const tekst = s => s.replace(/<(script|style|nav|header|footer)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
const hash = s => createHash('sha256').update(s).digest('hex').slice(0, 16);
async function hent(url) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 30000);
  try { const r = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': 'regelverkssjekk (Eiendomskontroll)' } }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.text(); } finally { clearTimeout(t); }
}
function tolk(url, html) {
  const T = tekst(html);
  if (url.includes('riksdagen.se')) { const m = T.match(/Ändrad:?\s*t\.?\s*o\.?\s*m\.?\s*SFS\s*(\d{4}:\d+)/i); return { status: /Upphävd/i.test(T.slice(0, 4000)) ? 'upphävd' : 'gällande', sistEndret: m ? 'SFS ' + m[1] : '', fp: m ? m[1] : hash(T.slice(0, 20000)) }; }
  if (url.includes('retsinformation.dk')) { const st = (T.match(/\((Gældende|Historisk)\)/) || [])[1] || ''; const i = T.indexOf('Senere ændringer'); const ae = i >= 0 ? [...T.slice(i, i + 600).matchAll(/(?:BEK|LOV|LBK) nr \d+ af \d{2}\/\d{2}\/\d{4}/g)].map(m => m[0]) : []; return { status: st ? st.toLowerCase() : 'ukjent', sistEndret: ae[ae.length - 1] || '', fp: st + '|' + ae.join(',') }; }
  return { status: 'hentet', sistEndret: '', fp: hash(T.replace(/\d{1,2}[.:]\d{2}/g, '').slice(0, 40000)) };
}

const grunn = les(P.grunn, { kilder: {} }); const ut = []; const endringer = []; const feil = [];
for (const k of KILDER) {
  if (k.sjekk === 'manuell') { ut.push({ ...k, status: 'manuell kontroll' }); continue; }
  try {
    const r = tolk(k.lenke, await hent(k.lenke)); const g = grunn.kilder[k.navn]; ut.push({ navn: k.navn, lenke: k.lenke, niva: k.niva, sjekk: k.sjekk, status: r.status, sistEndret: r.sistEndret, fp: r.fp });
    if (g && g.fp !== r.fp) endringer.push({ navn: k.navn, lenke: k.lenke, tekst: [g.status !== r.status && `status ${g.status} → ${r.status}`, r.sistEndret && g.sistEndret !== r.sistEndret ? `ny endring ${r.sistEndret} (var ${g.sistEndret || '–'})` : 'innholdet på siden er endret'].filter(Boolean).join('; ') });
    if (/upphävd|historisk/.test(r.status)) endringer.push({ navn: k.navn, lenke: k.lenke, tekst: 'regelverket er opphevet/historisk – malene må oppdateres' });
  } catch (e) { feil.push(k.navn + ': ' + e.message); ut.push({ ...k, status: 'ikke nådd' }); }
}
const forste = !Object.keys(grunn.kilder).length;
if (GODKJENN || forste) skriv(P.grunn, { godkjent: naa, kilder: Object.fromEntries(ut.filter(k => k.fp).map(k => [k.navn, { status: k.status, sistEndret: k.sistEndret, fp: k.fp }])) });
const vis = GODKJENN || forste ? [] : endringer;
skriv(P.status, { sjekket: naa, kontrollertMot: (GODKJENN ? naa : grunn.godkjent) || naa, antallKilder: KILDER.length, endringer: vis, kilder: ut.map(({ fp, ...k }) => k), feil });
const md = [`# Regelverkssjekk ${land.toUpperCase()} ${naa.slice(0, 10)}`, '', vis.length ? `**${vis.length} endring(er)** som kan kreve oppdatering av \`src/lib/land/${land}.ts\`:` : 'Ingen endringer.', '', ...vis.map(e => `- [${e.navn}](${e.lenke}): ${e.tekst}`), '',
  '## Manuell kontroll', ...ut.filter(k => k.sjekk === 'manuell').map(k => `- [${k.navn}](${k.lenke})`), '', feil.length ? '## Ikke nådd\n' + feil.map(f => '- ' + f).join('\n') : '',
  '', `Når malene er kontrollert: kjør workflowen med «godkjenn ${land.toUpperCase()}» for å lagre ny grunnlinje.`].join('\n');
skriv(P.rapport, md);
if (vis.length) skriv(P.varsel, { type: 'endring', land: land.toUpperCase(), endringer: vis }); else rmSync(P.varsel, { force: true });
console.log(md);
