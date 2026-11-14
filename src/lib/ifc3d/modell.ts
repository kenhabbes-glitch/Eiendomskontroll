// Lager (konverterer og pakker) og leser 3D-modeller. Filformat .ek3d: 'EK3D', hodelengde, JSON-hode, så binærdata (se konverter.ts).
import type { Ek3dHode } from './konverter';
import type { IfcModell } from '../ifc';
import { pakkV2 } from './pakk';

export type Ek3dEgenskaper = Record<string, { ns?: string; type?: string; mengder?: Record<string, number>; egenskaper?: Record<string, string> }>;
export type Ek3dFull = Ek3dHode & { egenskaper?: Ek3dEgenskaper };
export type Modell = { hode: Ek3dFull; grupper: { pos: Float32Array; nor: Int8Array; idx: Uint32Array }[]; seg: Int32Array };

/** IFC → .ek3d (komprimert). Kjører konverteringen i en worker slik at siden ikke fryser. */
export async function lagModell(file: File, fremdrift: (p: number, t: string) => void, props?: IfcModell | null): Promise<{ blob: Blob; hode: Ek3dFull }> {
  const buf = await file.arrayBuffer();
  const rå: ArrayBuffer = await new Promise((ok, feil) => {
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = ev => { const d = ev.data; if (d.feil) { w.terminate(); feil(new Error(d.feil)); } else if (d.ferdig) { w.terminate(); ok(d.ferdig); } else fremdrift(d.p, d.t); };
    w.onerror = e => { w.terminate(); feil(new Error(e.message || 'Konverteringen feilet')); };
    w.postMessage({ buf, navn: file.name }, [buf]);
  });
  let ut: Uint8Array = new Uint8Array(rå);
  if (props) ut = medEgenskaper(ut, props);
  fremdrift(0.96, 'Pakker'); ut = pakkV2(ut);
  fremdrift(0.97, 'Komprimerer');
  const gz = await new Response(new Blob([ut as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'))).blob();
  return { blob: gz, hode: lesHode(ut) };
}

const lesHode = (b: Uint8Array): Ek3dFull => JSON.parse(new TextDecoder().decode(b.subarray(8, 8 + new DataView(b.buffer, b.byteOffset).getUint32(4, true))));

/** Legger egenskaper (NS 3451, fabrikat, serienummer, mengder) fra IFC-leseren inn i hodet, pr. GUID. */
function medEgenskaper(b: Uint8Array, m: IfcModell): Uint8Array {
  const dv = new DataView(b.buffer, b.byteOffset); const hl = dv.getUint32(4, true); const hode = lesHode(b);
  const eg: Ek3dEgenskaper = {}; for (const e of m.elementer) if (e.guid && (Object.keys(e.egenskaper).length || e.ns || Object.keys(e.mengder).length)) eg[e.guid] = { ns: e.ns, type: e.type, mengder: e.mengder, egenskaper: e.egenskaper };
  const nytt = new TextEncoder().encode(JSON.stringify({ ...hode, egenskaper: eg, program: m.program }));
  const gammelLen = Math.ceil(hl / 4) * 4, nyLen = Math.ceil(nytt.length / 4) * 4;
  const ut = new Uint8Array(8 + nyLen + (b.length - 8 - gammelLen)); ut.set(b.subarray(0, 4), 0); new DataView(ut.buffer).setUint32(4, nytt.length, true); ut.set(nytt, 8); ut.set(b.subarray(8 + gammelLen), 8 + nyLen); return ut;
}

/** Leser nøyaktig n byte om gangen fra en strøm, uten å holde mer enn det som trengs i minnet. */
function byteLeser(strom: ReadableStream<Uint8Array>) {
  const r = strom.getReader(); let rest: Uint8Array | null = null;
  return async (n: number, hopp = false): Promise<Uint8Array> => {
    const ut = hopp ? TOM : new Uint8Array(n); let o = 0;
    while (o < n) {
      if (!rest || !rest.length) { const { value, done } = await r.read(); if (done) throw new Error('Modellfilen er ufullstendig'); rest = value!; continue; }
      const k = Math.min(rest.length, n - o); if (!hopp) ut.set(rest.subarray(0, k), o); o += k; rest = rest.subarray(k);
    }
    return ut;
  };
}
const TOM = new Uint8Array(0);
const pad4 = (n: number) => Math.ceil(n / 4) * 4;

/**
 * Leser en lagret modell (gzip) til typede arrays klare for three.js – bit for bit.
 * Den utpakkede filen holdes aldri samlet i minnet: hver gruppe pakkes ut, gjøres om til ferdige arrays og slippes,
 * før neste leses. Det halverer omtrent minnebruken ved åpning av store modeller (viktig på mobil).
 * Med «behold» kan deler av modellen (f.eks. etasjer) hoppes over: de tar da ikke plass i minnet i det hele tatt.
 */
export async function lesModellStrom(gz: ReadableStream<Uint8Array>, behold?: (g: Ek3dHode['grupper'][number], hode: Ek3dFull) => boolean): Promise<Modell> {
  const les = byteLeser(gz.pipeThrough(new DecompressionStream('gzip') as any) as ReadableStream<Uint8Array>);
  const start = await les(8);
  if (start[0] !== 0x45 || start[1] !== 0x4b || start[2] !== 0x33) throw new Error('Ukjent modellformat');
  const hl = new DataView(start.buffer).getUint32(4, true);
  const hode: Ek3dFull = JSON.parse(new TextDecoder().decode((await les(pad4(hl))).subarray(0, hl)));
  const grupper: Modell['grupper'] = []; const utelatt = new Set<number>();
  for (let gi = 0; gi < hode.grupper.length; gi++) {
    const g = hode.grupper[gi]; const n = g.nv, ni = g.ni;
    if (behold && !behold(g, hode)) { await les(hode.v === 2 ? pad4(n * 6) + pad4(n * 3) + ni * 4 : n * 12 + pad4(n * 3) + ni * 4, true); utelatt.add(gi); grupper.push({ pos: new Float32Array(0), nor: new Int8Array(0), idx: new Uint32Array(0) }); continue; }
    if (hode.v === 2) {
      const q = hode.q![gi]; const pq = await les(pad4(n * 6)); const pos = new Float32Array(n * 3);
      for (let a = 0; a < 3; a++) { let v = 0; const lo = a * 2 * n, hi = lo + n; for (let i = 0; i < n; i++) { v = (v + (pq[lo + i] | (pq[hi + i] << 8))) & 0xffff; pos[i * 3 + a] = q[a] + v * q[3 + a]; } }
      const nq = await les(pad4(n * 3)); const nor = new Int8Array(n * 3); nor.set(new Int8Array(nq.buffer, 0, n * 3));
      const iq = await les(ni * 4); const idx = new Uint32Array(ni); let v = 0;
      for (let i = 0; i < ni; i++) { v = (v + (iq[i] | (iq[ni + i] << 8) | (iq[2 * ni + i] << 16) | (iq[3 * ni + i] << 24))) >>> 0; idx[i] = v; }
      grupper.push({ pos, nor, idx });
    } else {
      const pos = new Float32Array((await les(n * 12)).buffer); const nb = await les(pad4(n * 3)); const nor = new Int8Array(n * 3); nor.set(new Int8Array(nb.buffer, 0, n * 3));
      grupper.push({ pos, nor, idx: new Uint32Array((await les(ni * 4)).buffer) });
    }
  }
  let seg = new Int32Array((await les(hode.nSeg * 28)).buffer);
  if (utelatt.size) { // fjern det som peker inn i utelatte grupper, så resten av appen ser en mindre, men hel, modell
    let n = 0; for (let i = 0; i < hode.nSeg; i++) if (!utelatt.has(seg[i * 7 + 1])) n++;
    const ny = new Int32Array(n * 7); let o = 0; for (let i = 0; i < hode.nSeg; i++) if (!utelatt.has(seg[i * 7 + 1])) { ny.set(seg.subarray(i * 7, i * 7 + 7), o); o += 7; }
    seg = ny; hode.nSeg = n; hode.grupper = hode.grupper.map((g, gi) => utelatt.has(gi) ? { ...g, nv: 0, ni: 0 } : g);
  }
  return { hode, grupper, seg };
}
/** Som lesModellStrom, for en fil som allerede ligger i minnet. */
export const lesModell = (gz: ArrayBuffer): Promise<Modell> => lesModellStrom(new Blob([gz]).stream() as ReadableStream<Uint8Array>);

/** Henter delene av en modell etter hverandre og gir dem som én sammenhengende strøm (uten å samle filen i minnet først). */
export function delStrom(deler: string[], hent: (sti: string) => Promise<Response>): ReadableStream<Uint8Array> {
  let i = 0; let r: ReadableStreamDefaultReader<Uint8Array> | null = null;
  return new ReadableStream<Uint8Array>({
    async pull(c) {
      for (;;) {
        if (!r) { if (i >= deler.length) { c.close(); return; } const x = await hent(deler[i++]); if (!x.ok || !x.body) throw new Error('HTTP ' + x.status); r = x.body.getReader(); }
        const { value, done } = await r.read(); if (done) { r = null; continue; } if (value?.length) { c.enqueue(value); return; }
      }
    },
    cancel() { r?.cancel().catch(() => { }); },
  });
}

/** Største bit som lagres i én fil (lagringen tar maks 50 MB pr. fil). */
export const DELSTR = 45 * 1024 * 1024;
export const delOpp = (b: Blob): Blob[] => { const ut: Blob[] = []; for (let i = 0; i < b.size; i += DELSTR) ut.push(b.slice(i, Math.min(b.size, i + DELSTR))); return ut; };
