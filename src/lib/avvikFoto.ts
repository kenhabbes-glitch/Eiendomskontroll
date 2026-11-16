// Forslag til avvik ut fra tekst (lest fra bilde, filnavn og det brukeren har skrevet). Ingen AI-tjeneste – bare ordlister.
export type AlvForslag = { alv: 'Kritisk' | 'Høy' | 'Middels' | 'Lav'; ord: string[] };

const KRITISK = /brann|røyk|brennbar|gasslekkasje|gasslukt|strømførende|blottlagt|åpne ledninger|blokkert rømning|rømningsvei.{0,20}blokkert|låst rømning|rasfare|kollaps|fare for liv/i;
const HOY = /lekkasje|lekker|vannskade|fuktskade|utløpt|utgått|forfalt|ute av drift|virker ikke|fungerer ikke|defekt|feilmelding|mugg|soppskade|korrosjon|sprekk|mangler slokker|slokker mangler|lukker ikke|ikke lukke/i;
const LAV = /kosmetisk|maling|\bripe|slitasje|løs list|løs gulvlist|løs gulvlist|flekk|smuss|skitten|\bhakk|bulk|\bslag i|riss|avskalling|misfarging|slitt/i;
const FEIL: [RegExp, string][] = [[/lekkasje|lekker|drypp/i, 'lekkasje'], [/vannskade|fuktskade|fukt/i, 'fuktskade'], [/mugg|soppskade/i, 'mugg/sopp'], [/sprekk/i, 'sprekk'], [/\briss?\b/i, 'riss'], [/korrosjon|rust/i, 'korrosjon'],
  [/ute av drift|virker ikke|fungerer ikke|defekt|feilmelding/i, 'defekt'], [/utløpt|utgått|forfalt/i, 'utløpt kontroll/dato'], [/\bhull\b/i, 'hull'], [/\bhakk/i, 'hakk'], [/\bbulk|\bslag i/i, 'slagskade'], [/\bripe/i, 'riper'], [/flekk|misfarging/i, 'flekk'], [/avskalling|flass|løsner.{0,12}maling|maling.{0,12}løsner/i, 'avskalling'],
  [/løs gulvlist|løs list|løse lister|løsnet|\bløs\b|løse\b/i, 'løs'], [/mangler/i, 'mangler'], [/skadet|skade/i, 'skade'], [/blokkert|sperret/i, 'blokkert'], [/tett\b|tilstoppet/i, 'tett'], [/støy|lyd/i, 'støy'], [/lukt/i, 'lukt'], [/slitt|slitasje/i, 'slitasje'], [/smuss|skitten/i, 'smuss']];
// Byggedel som nevnes – brukes i tittelen og til å finne et passende system (f.eks. innvendige overflater)
export const DEL: [RegExp, string, string[]][] = [[/gulvlist|\blist(?:er|verk)?\b|sokkellist/i, 'list', ['innv']], [/himling|\btak\b|takplate|undertak/i, 'tak', ['innv', 'tak_asfalt', 'tak_folie', 'tak_stein']], [/\bvegg|veggen|vegger/i, 'vegg', ['innv']], [/\bgulv/i, 'gulv', ['gulv', 'innv']],
  [/branndør|branndor/i, 'branndør', ['branndorer']], [/\bdør|\bdora\b|døra|dører/i, 'dør', ['ytterdorer', 'branndorer']], [/vindu/i, 'vindu', ['vinduer']], [/fasade/i, 'fasade', ['fasade_tre', 'fasade_mur', 'fasade_plate']], [/trapp/i, 'trapp', []], [/rekkverk/i, 'rekkverk', []]];
export const delFra = (tekst: string): { del: string; typer: string[] } | null => { const m = DEL.find(([re]) => re.test(tekst || '')); return m ? { del: m[1], typer: m[2] } : null; };

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

export type AvvikForslag = { tittel: string; alv: AlvForslag; plassering: string; feil: string; del: string; typer: string[]; merknad: string };
export function foreslaAvvik(tekst: string, systemNavn = ''): AvvikForslag {
  const feil = feilFra(tekst); const alv = alvorlighetFra(tekst); const d = delFra(tekst); const t = tekst || '';
  const stor = (x: string) => x.replace(/^./, c => c.toUpperCase());
  let tittel = d && feil === 'løs' ? `Løs ${d.del}` : d && feil === 'mangler' ? `${stor(d.del)} mangler` : d && feil ? `${stor(feil)} i ${d.del}` : systemNavn ? `${systemNavn}${feil ? ': ' + feil : ''}` : feil ? stor(feil) : '';
  let merknad = ''; if (/flekk|misfarging|fukt/i.test(t) && /himling|\btak\b|undertak|takplate/i.test(t) && alv.alv !== 'Kritisk' && alv.alv !== 'Høy') { merknad = 'Flekk i tak eller himling kan være tegn på lekkasje eller fukt. Se etter vannkilde (rør, tak, ventilasjon) og vurder å sette alvorlighet til Høy.'; }
  return { tittel, alv, plassering: plasseringFra(t), feil, del: d?.del || '', typer: d?.typer || [], merknad };
}

// ---- Automatisk heving av alvorlighet på meldinger fra leietakere/QR. Hever bare opp, aldri ned, og bruker snevre ord for å unngå falske alarmer
// (f.eks. «brannslukker utløpt» skal ikke bli Kritisk).
const HAST_KRITISK = /\bdet brenner\b|brann i |brenner i |røykutvikling|røyk fra|det ryker|lukter brent|brent lukt|brannlukt|gnist|gasslukt|gasslekkasje|strømførende|blottlagte ledninger|elektrisk støt|fare for liv|personskade|skadet person|vann fra taket|vann i tavle|oversvømmelse|rømningsvei.{0,25}(blokkert|sperret|låst)/i;
const HAST_HOY = /lekkasje|lekker|vannskade|nødlys.{0,20}(lyser ikke|virker ikke|dødt)|brannalarm.{0,20}(feil|virker ikke|ute av drift|piper)|heis.{0,20}(står|stopp|fast|ute av drift)|innestengt|ingen varme|strømbrudd|sprinkler.{0,20}(lekk|utløst)|branndør.{0,20}(står åpen|lukker ikke)|kokende vann/i;
const RANG: Record<string, number> = { Lav: 0, Middels: 1, 'Høy': 2, Kritisk: 3 };
export function hevAlvorlighet(tekst: string, valgt: string): { alv: string; ord: string } | null {
  const t = tekst || ''; const k = t.match(HAST_KRITISK); if (k && (RANG[valgt] ?? 1) < 3) return { alv: 'Kritisk', ord: k[0].trim().toLowerCase() };
  const h = t.match(HAST_HOY); if (h && (RANG[valgt] ?? 1) < 2) return { alv: 'Høy', ord: h[0].trim().toLowerCase() };
  return null;
}
