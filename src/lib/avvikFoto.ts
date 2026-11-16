// Forslag til avvik ut fra tekst (lest fra bilde, filnavn og det brukeren har skrevet). Ingen AI-tjeneste – bare ordlister.
export type AlvForslag = { alv: 'Kritisk' | 'Høy' | 'Middels' | 'Lav'; ord: string[] };

const KRITISK = /brann|røyk|brennbar|gasslekkasje|gasslukt|strømførende|blottlagt|åpne ledninger|blokkert rømning|rømningsvei.{0,20}blokkert|låst rømning|rasfare|kollaps|fare for liv/i;
const HOY = /lekkasje|lekker|vannskade|fuktskade|utløpt|utgått|forfalt|ute av drift|virker ikke|fungerer ikke|defekt|feilmelding|mugg|soppskade|korrosjon|sprekk|mangler slokker|slokker mangler|lukker ikke|ikke lukke/i;
const LAV = /kosmetisk|maling|riper|slitasje|løs list|flekk|smuss|skitten|pynt/i;
const FEIL: [RegExp, string][] = [[/lekkasje|lekker|drypp/i, 'lekkasje'], [/vannskade|fuktskade|fukt/i, 'fuktskade'], [/mugg|soppskade/i, 'mugg/sopp'], [/sprekk/i, 'sprekk'], [/korrosjon|rust/i, 'korrosjon'],
  [/ute av drift|virker ikke|fungerer ikke|defekt|feilmelding/i, 'defekt'], [/utløpt|utgått|forfalt/i, 'utløpt kontroll/dato'], [/mangler/i, 'mangler'], [/skadet|skade/i, 'skade'], [/blokkert|sperret/i, 'blokkert'], [/løs\b|løse/i, 'løs'], [/tett\b|tilstoppet/i, 'tett'], [/støy|lyd/i, 'støy'], [/lukt/i, 'lukt']];

export function alvorlighetFra(tekst: string): AlvForslag {
  const t = tekst || ''; const ord = (re: RegExp) => [...new Set((t.match(new RegExp(re.source, 'gi')) || []).map(x => x.toLowerCase()))].slice(0, 3);
  if (KRITISK.test(t)) return { alv: 'Kritisk', ord: ord(KRITISK) };
  if (HOY.test(t)) return { alv: 'Høy', ord: ord(HOY) };
  if (LAV.test(t)) return { alv: 'Lav', ord: ord(LAV) };
  return { alv: 'Middels', ord: [] };
}
export const feilFra = (tekst: string): string => FEIL.find(([re]) => re.test(tekst || ''))?.[1] || '';

/** Rom/etasje som står på skilt eller i filnavn, f.eks. «Rom 2.14», «3. etg» */
export function plasseringFra(tekst: string): string {
  const rom = tekst.match(/\brom\s*([A-Za-z]?\d{1,3}(?:[.\-]\d{1,3})?)/i); const etg = tekst.match(/\b(\d{1,2})\.?\s*(?:etg|etasje)\b/i) || tekst.match(/\b(?:etg|etasje)\.?\s*(\d{1,2})\b/i);
  return [etg ? etg[1] + '. etg' : '', rom ? 'rom ' + rom[1] : ''].filter(Boolean).join(', ');
}

export type AvvikForslag = { tittel: string; alv: AlvForslag; plassering: string; feil: string };
export function foreslaAvvik(tekst: string, systemNavn = ''): AvvikForslag {
  const feil = feilFra(tekst); const alv = alvorlighetFra(tekst);
  const tittel = systemNavn ? `${systemNavn}${feil ? ': ' + feil : ''}` : feil ? feil.replace(/^./, c => c.toUpperCase()) : '';
  return { tittel, alv, plassering: plasseringFra(tekst), feil };
}
