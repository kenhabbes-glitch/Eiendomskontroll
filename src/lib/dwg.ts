// DWG/DXF → plantegning med automatisk målestokk.
// Selve lesingen gjøres av LibreDWG (GPLv3) i en egen Web Worker (public/dwg/), som
// lastes bare når en DWG/DXF åpnes. Her på hovedtråden gjøres SVG-en om til et bilde.

export const ENHETER: [string, string, number][] = [['auto', 'Automatisk (fra filen)', 0], ['mm', 'Millimeter', 0.001], ['cm', 'Centimeter', 0.01], ['m', 'Meter', 1], ['in', 'Tommer', 0.0254], ['ft', 'Fot', 0.3048]];
const INSUNITS: Record<number, [string, number]> = { 1: ['in', 0.0254], 2: ['ft', 0.3048], 4: ['mm', 0.001], 5: ['cm', 0.01], 6: ['m', 1], 14: ['dm', 0.1] };

function lesFil(f: File, type: 'dwg' | 'dxf'): Promise<{ svg: string; insunits: number | null; ukjente?: Record<string, number>; xref?: string[] }> {
  return new Promise(async (ok, feil) => {
    const w = new Worker('/dwg/dwg-worker.js', { type: 'module' });
    const t = setTimeout(() => { w.terminate(); feil(new Error('Tidsavbrudd – tegningen er for stor eller kunne ikke leses')); }, 120000);
    w.onmessage = e => { clearTimeout(t); w.terminate(); e.data.ok ? ok(e.data) : feil(new Error(e.data.error || 'Kunne ikke lese filen')); };
    w.onerror = e => { clearTimeout(t); w.terminate(); feil(new Error('Kunne ikke starte DWG-leseren: ' + (e.message || ''))); };
    const buf = await f.arrayBuffer(); w.postMessage({ data: buf, type, base: '/dwg' }, [buf]);
  });
}

/** Finner utstrekningen til tegningen og ser bort fra enkeltelementer langt utenfor (typisk feil eller hjelpelinjer) */
function robustUtstrekning(svg: SVGSVGElement) {
  const ctm = svg.getScreenCTM(); if (!ctm) return null; const inv = ctm.inverse(); const pt = svg.createSVGPoint();
  const tilBruker = (x: number, y: number) => { pt.x = x; pt.y = y; const p = pt.matrixTransform(inv); return [p.x, p.y]; };
  const el = Array.from(svg.querySelectorAll(':scope > g line, :scope > g polyline, :scope > g polygon, :scope > g path, :scope > g circle, :scope > g ellipse, :scope > g text, :scope > g use, :scope > g rect'));
  const steg = Math.max(1, Math.floor(el.length / 40000)); const bokser: number[][] = [];
  for (let i = 0; i < el.length; i += steg) { const r = (el[i] as Element).getBoundingClientRect(); if (!r.width && !r.height) continue; const [x0, y0] = tilBruker(r.left, r.top), [x1, y1] = tilBruker(r.right, r.bottom); bokser.push([Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)]); }
  if (!bokser.length) return null;
  const cx = bokser.map(b => (b[0] + b[2]) / 2).sort((a, b) => a - b), cy = bokser.map(b => (b[1] + b[3]) / 2).sort((a, b) => a - b);
  const q = (a: number[], p: number) => a[Math.min(a.length - 1, Math.max(0, Math.floor((a.length - 1) * p)))];
  // Kvartilgrenser (IQR) på sentrene: alt som ligger langt utenfor hovedtyngden regnes som støy
  const fence = (a: number[]) => { const q1 = q(a, 0.25), q3 = q(a, 0.75), iqr = Math.max(q3 - q1, (q(a, 0.98) - q(a, 0.02)) * 0.1, 1e-9); return [q1 - 3 * iqr, q3 + 3 * iqr]; };
  const [lx, hx] = fence(cx), [ly, hy] = fence(cy);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  bokser.forEach(b => { const c = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; if (c[0] < lx || c[0] > hx || c[1] < ly || c[1] > hy) return; if (b[2] - b[0] > (hx - lx) * 1.5 || b[3] - b[1] > (hy - ly) * 1.5) return; x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]); });
  return isFinite(x0) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

/** Lager stilark for visning: skjulte lag, og skravur som omriss om ønsket */
export function lagStil(skjult: string[] = [], omriss = false) {
  const esc = (n: string) => n.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return (skjult.length ? skjult.map(n => n === '0' ? `svg > g [data-l="0"]` : `[data-l="${esc(n)}"]`).join(',') + '{display:none!important}' : '') + (omriss ? '[data-h]{fill:none!important;stroke:#1d2320!important}' : '');
}

/** Gjør SVG-teksten (fra lesDwg) om til PNG med gitt utsnitt og størrelse */
export async function rasteriser(svgTekst: string, vb: { x: number; y: number; w: number; h: number }, W: number, H: number, skjult: string[] = [], omriss = false) {
  const doc = new DOMParser().parseFromString(svgTekst, 'image/svg+xml'); const svg = doc.documentElement;
  const stil = doc.createElementNS('http://www.w3.org/2000/svg', 'style'); stil.textContent = lagStil(skjult, omriss); svg.appendChild(stil);
  svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`); svg.setAttribute('width', String(W)); svg.setAttribute('height', String(H)); svg.setAttribute('preserveAspectRatio', 'none');
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
  try {
    const img = new Image(); await new Promise((ok, feil) => { img.onload = ok; img.onerror = () => feil(new Error('Kunne ikke tegne opp DWG-en')); img.src = url; });
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.drawImage(img, 0, 0, W, H);
    return await new Promise<Blob>((ok, feil) => cv.toBlob(b => b ? ok(b) : feil(new Error('Kunne ikke lage bilde')), 'image/png'));
  } finally { URL.revokeObjectURL(url); }
}

export async function dwgTilBilde(f: File, enhet = 'auto', maks = 6000) {
  const type = /\.dxf$/i.test(f.name) ? 'dxf' : 'dwg';
  const r = await lesFil(f, type);
  // Svart strek på hvit bakgrunn (CAD-farger er laget for svart bakgrunn), og fast strektykkelse
  const svgTekst = r.svg.replace(/stroke-width="0\.1%"/g, 'stroke-width="1.6"');
  const doc = new DOMParser().parseFromString(svgTekst, 'image/svg+xml'); const svg = doc.documentElement as unknown as SVGSVGElement;
  if (svg.nodeName !== 'svg') throw new Error('Tegningen kunne ikke tolkes');
  const stil = doc.createElementNS('http://www.w3.org/2000/svg', 'style');
  stil.textContent = '*{vector-effect:non-scaling-stroke}g,line,polyline,polygon,path,circle,ellipse,rect{stroke:#1d2320!important}text{fill:#1d2320!important;stroke:none!important}[data-stor]{fill:#e9ebe7!important;fill-opacity:1!important}';
  svg.insertBefore(stil, svg.firstChild);
  // Mål opp i DOM-en for å finne fornuftige yttergrenser
  const holder = document.createElement('div'); holder.style.cssText = 'position:fixed;left:-20000px;top:0;width:2000px;height:2000px;visibility:hidden';
  svg.setAttribute('width', '2000'); svg.setAttribute('height', '2000'); holder.appendChild(document.importNode(svg, true)); document.body.appendChild(holder);
  let vb: { x: number; y: number; w: number; h: number } | null = null;
  try {
    const live = holder.firstElementChild as SVGSVGElement;
    vb = robustUtstrekning(live);
    // Store heltrukne skravurer (typisk arealmarkering) tegnes lyst, så de ikke dekker tegningen
    const total = live.getBoundingClientRect(); const flate = Math.max(1, total.width * total.height);
    const liveH = Array.from(live.querySelectorAll(':scope > g [data-h="s"]')); const docH = Array.from(svg.querySelectorAll(':scope > g [data-h="s"]'));
    if (liveH.length === docH.length) liveH.forEach((el, i) => { const b = (el as Element).getBoundingClientRect(); if (b.width * b.height > flate * 0.004) docH[i].setAttribute('data-stor', '1'); });
  } finally { holder.remove(); }
  if (!vb || !(vb.w > 0) || !(vb.h > 0)) { const v = (svg.getAttribute('viewBox') || '0 0 0 0').split(/\s+/).map(Number); vb = { x: v[0], y: v[1], w: v[2], h: v[3] }; }
  if (!(vb.w > 0 && vb.h > 0)) throw new Error('Fant ingen tegningselementer i modellområdet');
  const marg = Math.max(vb.w, vb.h) * 0.02; vb = { x: vb.x - marg, y: vb.y - marg, w: vb.w + 2 * marg, h: vb.h + 2 * marg };
  const W = vb.w >= vb.h ? maks : Math.round(maks * vb.w / vb.h), H = vb.w >= vb.h ? Math.round(maks * vb.h / vb.w) : maks;
  const ferdigSvg = new XMLSerializer().serializeToString(svg);
  const blob = await rasteriser(ferdigSvg, vb, W, H);
  // Lag med antall objekter
  const tell: Record<string, number> = {}; for (const m of ferdigSvg.matchAll(/data-l="([^"]*)"/g)) { const n = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'); tell[n] = (tell[n] || 0) + 1; }
  const lag = Object.entries(tell).sort((a, b) => a[0].localeCompare(b[0], 'nb')).map(([navn, antall]) => ({ navn, antall }));
  // Enhet → meter per piksel
  let enhetNavn = '', perEnhet = 0;
  if (enhet !== 'auto') { const e = ENHETER.find(x => x[0] === enhet)!; enhetNavn = e[0]; perEnhet = e[2]; }
  else if (r.insunits && INSUNITS[r.insunits]) { [enhetNavn, perEnhet] = INSUNITS[r.insunits]; }
  else { const s = Math.max(vb.w, vb.h); [enhetNavn, perEnhet] = s > 2000 ? ['mm', 0.001] : ['m', 1]; enhetNavn += ' (gjettet)'; }
  // Advarsler om innhold som ikke kan vises
  const NAVN: Record<string, string> = { ACAD_PROXY_ENTITY: 'proxy-objekter (f.eks. vegger/dører fra AutoCAD Architecture, MagiCAD eller Revit-eksport)', '3DSOLID': '3D-solider', REGION: 'regioner', BODY: 'BODY-objekter', MESH: 'mesh' };
  const advarsler: string[] = [];
  Object.entries(r.ukjente || {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 4).forEach(([t, n]) => advarsler.push(`${n} ${NAVN[t] || t}`));
  if (r.xref?.length) advarsler.unshift(`${r.xref.length} ekstern referanse (xref): ${r.xref.slice(0, 3).join(', ')}`);
  return { blob, w: W, h: H, mpp: vb.w / W * perEnhet, enhet: enhetNavn, bredde: vb.w * perEnhet, hoyde: vb.h * perEnhet, advarsler, svg: ferdigSvg, vb, lag };
}
