// Lager (konverterer og pakker) og leser 3D-modeller. Filformat .ek3d: 'EK3D', hodelengde, JSON-hode, så binærdata (se konverter.ts).
import type { Ek3dHode } from './konverter';
import type { IfcModell } from '../ifc';

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

/** Leser en lagret modell (gzip) til typede arrays klare for three.js. */
export async function lesModell(gz: ArrayBuffer): Promise<Modell> {
  const rå = new Uint8Array(await new Response(new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  if (rå[0] !== 0x45 || rå[1] !== 0x4b || rå[2] !== 0x33) throw new Error('Ukjent modellformat');
  const hode = lesHode(rå); const hl = new DataView(rå.buffer).getUint32(4, true); let o = 8 + Math.ceil(hl / 4) * 4; const grupper: Modell['grupper'] = [];
  for (const g of hode.grupper) { const pos = new Float32Array(rå.buffer, o, g.nv * 3); o += g.nv * 12; const nor = new Int8Array(rå.buffer, o, g.nv * 3); o += Math.ceil(g.nv * 3 / 4) * 4; const idx = new Uint32Array(rå.buffer, o, g.ni); o += g.ni * 4; grupper.push({ pos, nor, idx }); }
  return { hode, grupper, seg: new Int32Array(rå.buffer, o, hode.nSeg * 7) };
}
