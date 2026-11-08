#!/usr/bin/env node
// Regelverkssjekk for Mexico. Kildene er listen KILDER_MX i src/lib/land/mx.ts (samme liste som vises i appen).
//  - Normer (NOM): siden hos Secretaría de Economía (platiica.economia.gob.mx) leses for «Estado de la Norma»
//    (vigente / cancelada / en revisión) og datoer. Endret status eller ny dato gir varsel.
//  - Føderale lover: Cámara de Diputados, «Leyes Federales Vigentes» (LeyesBiblio) – datoen for siste reform (DOF).
//  - CDMX-regler (Gaceta Oficial) har ingen maskinlesbar endringsdato og står som «manuell kontroll».
//
//   node scripts/regelverkssjekk-mx.mjs              sjekk og skriv rapport
//   node scripts/regelverkssjekk-mx.mjs --godkjenn   appen er kontrollert: gjeldende status blir ny grunnlinje
//
// Utdata: regelverk/grunnlinje-mx.json, public/regelverk-status-mx.json (vises i appen), regelverk/rapport-mx.md og
// regelverk/varsel-mx.json (finnes bare når noe er nytt – brukes av workflowen til å opprette en GitHub-sak).
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GODKJENN = process.argv.includes('--godkjenn');
const P = { kilder: join(ROT, 'src/lib/land/mx.ts'), grunn: join(ROT, 'regelverk/grunnlinje-mx.json'), status: join(ROT, 'public/regelverk-status-mx.json'), rapport: join(ROT, 'regelverk/rapport-mx.md'), varsel: join(ROT, 'regelverk/varsel-mx.json') };
const les = (f, d) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return d; } };
const skriv = (f, v) => { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, typeof v === 'string' ? v : JSON.stringify(v, null, 2) + '\n'); };
const naa = new Date().toISOString();

// Kildene leses fra appens egen liste, så det bare finnes ett sted å vedlikeholde dem
const src = readFileSync(P.kilder, 'utf8'); const blokk = src.slice(src.indexOf('export const KILDER_MX'));
const KILDER = [...blokk.matchAll(/\{\s*navn:\s*'([^']+)',\s*lenke:\s*'([^']+)',\s*niva:\s*'([^']+)'\s*\}/g)].map(m => ({ navn: m[1], lenke: m[2], niva: m[3] }));
if (!KILDER.length) { console.error('Fant ingen kilder i KILDER_MX'); process.exit(1); }

const tekst = s => s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&aacute;/g, 'á').replace(/&eacute;/g, 'é').replace(/&iacute;/g, 'í').replace(/&oacute;/g, 'ó').replace(/&uacute;/g, 'ú').replace(/&ntilde;/g, 'ñ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
async function hent(url) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 30000);
  try { const r = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': 'regelverkssjekk (Eiendomskontroll)', 'Accept-Language': 'es-MX,es' } }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.text(); } finally { clearTimeout(t); }
}
const DATO = /(\d{1,2}[\/-]\d{1,2}[\/-]\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2} de [a-záéíóú]+ de \d{4})/i;

// platiica: «Estado de la Norma: Vigente», «Fecha de publicación …», evt. «Modificación»/«Aviso de cancelación»
function tolkNom(html) {
  const T = tekst(html);
  const estado = (T.match(/Estado(?: de la Norma)?\s*:?\s*(Vigente|Cancelad[ao]|En revisi[oó]n|Sin vigencia|Proyecto)/i) || [])[1] || '';
  const datoer = [...T.matchAll(new RegExp(DATO.source, 'gi'))].map(m => m[1]);
  const cancel = /aviso de cancelaci[oó]n|cancela (?:a )?la/i.test(T); const modif = /modificaci[oó]n a la norma|aclaraci[oó]n a la norma/i.test(T); const proyecto = /proyecto de (?:norma|modificaci[oó]n)|PROY-NOM/i.test(T);
  return { status: estado ? estado.toLowerCase() : 'ukjent', sistEndret: datoer.length ? datoer[datoer.length - 1] : '', antDatoer: datoer.length, flagg: [cancel && 'cancelación', modif && 'modificación', proyecto && 'proyecto'].filter(Boolean) };
}
// LeyesBiblio: tabell med lovens navn og «Última reforma publicada DOF dd-mm-aaaa»
let leyesHtml = null;
async function tolkLey(navn) {
  if (leyesHtml === null) leyesHtml = tekst(await hent('https://www.diputados.gob.mx/LeyesBiblio/index.htm'));
  const i = leyesHtml.toLowerCase().indexOf(navn.toLowerCase()); if (i < 0) return { status: 'ikke funnet', sistEndret: '' };
  const m = leyesHtml.slice(i, i + 600).match(/(?:Última reforma|Ultima reforma|Últ\. Reforma)[^0-9]{0,40}(\d{2}[-\/]\d{2}[-\/]\d{4})/i);
  return { status: 'vigente', sistEndret: m ? m[1] : '' };
}

const grunn = les(P.grunn, { kilder: {} }); const ut = []; const endringer = []; const feil = [];
for (const k of KILDER) {
  if (k.niva === 'CDMX') { ut.push({ ...k, status: 'manuell kontroll' }); continue; }
  try {
    const r = k.lenke.includes('platiica') ? tolkNom(await hent(k.lenke)) : await tolkLey(k.navn);
    const g = grunn.kilder[k.navn]; ut.push({ ...k, ...r });
    if (g && (g.status !== r.status || (r.sistEndret && g.sistEndret !== r.sistEndret) || String(g.flagg || []) !== String(r.flagg || [])))
      endringer.push({ navn: k.navn, lenke: k.lenke, tekst: [g.status !== r.status && `status ${g.status} → ${r.status}`, r.sistEndret && g.sistEndret !== r.sistEndret && `ny dato ${r.sistEndret} (var ${g.sistEndret || '–'})`, String(g.flagg || []) !== String(r.flagg || []) && `merknader: ${(r.flagg || []).join(', ') || 'ingen'}`].filter(Boolean).join('; ') });
    else if (!g) endringer.push({ navn: k.navn, lenke: k.lenke, tekst: `ny kilde – registrert med status ${r.status}${r.sistEndret ? ', ' + r.sistEndret : ''}`, ny: true });
    if (r.status === 'cancelada' || r.status === 'cancelado' || (r.flagg || []).includes('cancelación')) endringer.push({ navn: k.navn, lenke: k.lenke, tekst: 'normen er eller blir kansellert – maler som viser til den må oppdateres' });
  } catch (e) { feil.push(k.navn + ': ' + e.message); ut.push({ ...k, status: 'ikke nådd' }); }
}

const reelle = endringer.filter(e => !e.ny);
if (GODKJENN || !Object.keys(grunn.kilder).length) {
  skriv(P.grunn, { godkjent: naa, kilder: Object.fromEntries(ut.filter(k => k.niva !== 'CDMX' && k.status !== 'ikke nådd').map(k => [k.navn, { status: k.status, sistEndret: k.sistEndret || '', flagg: k.flagg || [] }])) });
}
const visEndr = GODKJENN || !Object.keys(grunn.kilder).length ? [] : reelle;
skriv(P.status, { sjekket: naa, kontrollertMot: (GODKJENN ? naa : grunn.godkjent) || naa, antallKilder: KILDER.length, endringer: visEndr, kilder: ut, feil });
const md = [`# Regelverkssjekk Mexico ${naa.slice(0, 10)}`, '',
  visEndr.length ? `**${visEndr.length} endring(er)** som kan kreve oppdatering av malene i \`src/lib/land/mx.ts\`:` : 'Ingen endringer i føderale normer og lover.', '',
  ...visEndr.map(e => `- [${e.navn}](${e.lenke}): ${e.tekst}`), '',
  '## Manuell kontroll (Gaceta Oficial CDMX)', ...ut.filter(k => k.niva === 'CDMX').map(k => `- [${k.navn}](${k.lenke})`), '',
  feil.length ? '## Ikke nådd\n' + feil.map(f => '- ' + f).join('\n') : '',
  '', 'Når malene er kontrollert: kjør workflowen med «godkjenn Mexico» for å lagre ny grunnlinje.'].join('\n');
skriv(P.rapport, md);
if (visEndr.length) skriv(P.varsel, { type: 'endring', land: 'MX', endringer: visEndr }); else rmSync(P.varsel, { force: true });
console.log(md);
if (feil.length === KILDER.filter(k => k.niva !== 'CDMX').length) { console.log('::warning::Ingen meksikanske kilder kunne nås'); }
