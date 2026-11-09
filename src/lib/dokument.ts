// Felles dokumentmal (variant A, petrol) for alt som skrives ut eller lagres som PDF fra nettleseren:
// kvitteringer, skjemaer, arbeidsordre og rapporter. Gir samme topptekst, bunntekst, typografi og farger overalt.
// Bruk: skrivDok({ type, nr, eiendomId, tittel, innhold: [seksjon(...), tabell(...), ...] })
import { byId } from './utils';
import { orgNavn, toast } from './store';
import { tt } from './i18n';

export const DOK_FARGE = { band: '#1E4D57', linje: '#C9A66B', undertekst: '#CFE0E3', tone: '#EEF3F4', flate: '#F3F6F7', strek: '#C9D2D5', strekLys: '#DDE3E5', tekst: '#1A1F2B', dempet: '#566170' };
const F = DOK_FARGE;

export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as Record<string, string>)[c]);
export const datoNo = (d?: string) => d ? d.slice(0, 10).split('-').reverse().join('.') : '';

/** Seksjonsoverskrift (små versaler i profilfargen) med innhold under. */
export const seksjon = (tittel: string, innhold: string) => `<section class="sek"><h2>${esc(tittel)}</h2>${innhold}</section>`;
/** Faktaboks med etikett/verdi-par. Verdier er tekst (escapes). */
export const fakta = (tittel: string, rader: [string, unknown][]) => `<div class="boks"><h2>${esc(tittel)}</h2><dl>${rader.filter(r => r[1] != null && r[1] !== '').map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl></div>`;
/** To faktabokser side om side. */
export const faktaPar = (a: string, b: string) => `<div class="par">${a}${b}</div>`;
/** Tabell. `hoyre` = kolonneindekser som høyrestilles (tall). Celler er rå HTML – bruk esc() på tekst. */
export const tabell = (hode: string[], rader: string[][], hoyre: number[] = []) => `<table><thead><tr>${hode.map((h, i) => `<th${hoyre.includes(i) ? ' class="h"' : ''}>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rader.map(r => `<tr>${r.map((c, i) => `<td${hoyre.includes(i) ? ' class="h"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
/** Nummerert liste i tonet boks (regler, vilkår). */
export const regler = (tittel: string, linjer: string[]) => `<div class="regler"><h2>${esc(tittel)}</h2><ol>${linjer.filter(Boolean).map(l => `<li>${esc(l)}</li>`).join('')}</ol></div>`;
/** Signaturlinjer. */
export const signatur = (felt: string[]) => `<div class="sig" style="grid-template-columns:repeat(${felt.length},1fr)">${felt.map(f => `<div>${esc(f)}</div>`).join('')}</div>`;
/** Stiplet felt som fylles ut for hånd (retur, utført arbeid). */
export const utfylling = (tittel: string, innhold: string) => `<div class="fyll"><h2>${esc(tittel)}</h2>${innhold}</div>`;
export const avsnitt = (t: string) => `<p>${esc(t)}</p>`;
/** Statusmerke med prikk. Farge er bare støtte – teksten bærer betydningen. */
export const merke = (tekst: string, farge = F.dempet) => `<span class="merke"><i style="background:${farge}"></i>${esc(tekst)}</span>`;

export type DokOpts = { type: string; nr?: string | number; eiendomId?: string; tittel: string; undertittel?: string; innhold: string[]; filnavn?: string };

function topp(o: DokOpts) {
  const e = o.eiendomId ? byId('eiendommer', o.eiendomId) : null;
  const eier = (e && orgNavn(e.eierOrgId)) || e?.navn || '';
  const adr = [e?.navn !== eier ? e?.navn : '', [e?.adresse, [e?.postnr, e?.poststed].filter(Boolean).join(' ')].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
  return `<header class="band"><div><div class="eier">${esc(eier)}</div>${adr ? `<div class="adr">${esc(adr)}</div>` : ''}</div><div class="hoyre"><div class="type">${esc(o.type)}</div>${o.nr != null && o.nr !== '' ? `<div class="nr">${esc(tt("Nr."))} ${esc(o.nr)}</div>` : ''}</div></header><div class="linje"></div>`;
}

export function dokHtml(o: DokOpts) {
  const laget = new Date(); const lagetTxt = `${datoNo(laget.toISOString())} ${laget.toTimeString().slice(0, 5)}`;
  const fot = `Eiendomskontroll · ${tt("Laget")} ${lagetTxt}`; const fotH = `${o.type}${o.nr != null && o.nr !== '' ? ' ' + tt("nr.") + ' ' + o.nr : ''}`;
  return `<!doctype html><html lang="nb"><head><meta charset="utf-8"><title>${esc(o.filnavn || `${o.type} ${o.nr ?? ''}`.trim())}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Source+Serif+4:opsz,wght@8..60,600&display=swap" rel="stylesheet">
<style>
@page{size:A4;margin:14mm 0 16mm 0;@bottom-left{content:"${fot.replace(/"/g, '')}";font:9px Inter,Arial,sans-serif;color:${F.dempet};margin-left:15mm}@bottom-right{content:"${fotH.replace(/"/g, '')} · ${tt("Side")} " counter(page) " ${tt("av")} " counter(pages);font:9px Inter,Arial,sans-serif;color:${F.dempet};margin-right:15mm}}
@page:first{margin-top:0}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
html,body{margin:0;background:#fff}
body{font:12px/1.45 Inter,system-ui,Arial,sans-serif;color:${F.tekst}}
.side{max-width:210mm;margin:0 auto}
.band{background:${F.band};color:#fff;padding:30px 15mm 24px;display:flex;justify-content:space-between;align-items:flex-end;gap:20px}
.eier{font:600 21px/1.2 'Source Serif 4',Georgia,serif}.adr{font-size:11px;color:${F.undertekst};margin-top:3px}
.hoyre{text-align:right;white-space:nowrap}.type{font-size:10px;font-weight:600;letter-spacing:1.4px;text-transform:uppercase;color:${F.undertekst}}.nr{font-size:19px;font-weight:700;margin-top:2px}
.linje{height:4px;background:${F.linje}}
main{padding:0 15mm}
h1{font:600 25px/1.2 'Source Serif 4',Georgia,serif;margin:24px 0 3px}.under{margin:0 0 18px;color:${F.dempet}}
h2{margin:0 0 8px;font-size:10px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:${F.band}}
.sek{margin-top:20px}.sek>h2{margin-bottom:8px}
.par{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:4px}
.boks{border:1px solid ${F.strek};border-radius:4px;padding:12px 14px;break-inside:avoid}
dl{display:grid;grid-template-columns:max-content 1fr;gap:5px 14px;margin:0}dt{color:${F.dempet}}dd{margin:0}
table{width:100%;border-collapse:collapse;font-size:11.5px}th{text-align:left;background:${F.tone};padding:7px 9px;border-bottom:1px solid #8E9AA0;font-weight:600}td{padding:7px 9px;border-bottom:1px solid ${F.strekLys};vertical-align:top}.h{text-align:right}tr{break-inside:avoid}
.regler{margin-top:20px;background:${F.flate};border-radius:4px;padding:12px 16px;break-inside:avoid}.regler ol{margin:0;padding-left:18px}.regler li{margin:3px 0;font-size:11.5px}
p{margin:0 0 8px;max-width:165mm}
.sig{display:grid;gap:26px;margin-top:42px;break-inside:avoid}.sig div{border-top:1px solid ${F.tekst};padding-top:5px;font-size:10.5px;color:${F.dempet}}
.fyll{margin-top:26px;border:1px dashed #8E9AA0;border-radius:4px;padding:12px 16px;break-inside:avoid}.fyll h2{color:${F.dempet}}.fyll .sig{margin-top:26px}.fyll .sig div{border-color:#8E9AA0}
.merke{display:inline-flex;align-items:center;gap:6px;padding:2px 9px;border:1px solid ${F.strek};border-radius:99px;font-size:11px;margin-right:6px}.merke i{width:7px;height:7px;border-radius:50%;display:inline-block}
.verktoy{position:fixed;right:16px;top:16px;display:flex;gap:8px}.verktoy button{font:600 13px Inter,sans-serif;padding:9px 14px;border-radius:6px;border:1px solid ${F.band};background:${F.band};color:#fff;cursor:pointer}.verktoy button.s{background:#fff;color:${F.band}}
@media screen{body{background:#E9EDEF;padding:24px 0}.side{background:#fff;box-shadow:0 1px 6px rgba(0,0,0,.12);min-height:297mm;padding-bottom:20mm}}
@media print{.verktoy{display:none}}
</style></head><body><div class="verktoy"><button onclick="print()">${esc(tt("Skriv ut / lagre PDF"))}</button><button class="s" onclick="close()">${esc(tt("Lukk"))}</button></div>
<div class="side">${topp(o)}<main><h1>${esc(o.tittel)}</h1>${o.undertittel ? `<p class="under">${esc(o.undertittel)}</p>` : ''}${o.innhold.join('')}</main></div>
<script>(document.fonts&&document.fonts.ready||Promise.resolve()).then(function(){setTimeout(function(){print()},250)})</script></body></html>`;
}

/** Åpner dokumentet i et nytt vindu og starter utskrift (brukeren kan velge «Lagre som PDF»). */
export function skrivDok(o: DokOpts) {
  const w = window.open('', '_blank'); if (!w) { toast(tt("Nettleseren blokkerte utskriftsvinduet")); return; }
  w.document.write(dokHtml(o)); w.document.close();
}
