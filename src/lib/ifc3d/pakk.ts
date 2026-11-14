// Tett pakking av .ek3d (versjon 2) før gzip: posisjoner kvantiseres til 16 bit pr. gruppe (≈1–2 mm i et vanlig bygg),
// og tall lagres som differanser med bytene sortert i plan. Det gjør filen 2–3 ganger mindre etter gzip enn versjon 1.
// Versjon 1-filer (lastet opp før endringen) leses som før.

const hodeLen = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset).getUint32(4, true);
const pad4 = (n: number) => Math.ceil(n / 4) * 4;

/** Rå .ek3d v1 (Float32-posisjoner, Uint32-indekser) → v2. */
export function pakkV2(b: Uint8Array): Uint8Array {
  const hl = hodeLen(b); const hode = JSON.parse(new TextDecoder().decode(b.subarray(8, 8 + hl)));
  if (hode.v === 2) return b;
  let o = 8 + pad4(hl); const deler: Uint8Array[] = []; const q: number[][] = [];
  const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.length);
  for (const g of hode.grupper) {
    const pos = new Float32Array(ab, o, g.nv * 3); o += g.nv * 12;
    const nn = hode.flat ? 0 : g.nv * 3; const nor = new Uint8Array(ab, o, nn); o += pad4(nn);
    const idx = new Uint32Array(ab, o, g.ni); o += g.ni * 4;
    // kvantiser posisjoner pr. akse
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pos.length; i++) { const a = i % 3, v = pos[i]; if (v < min[a]) min[a] = v; if (v > max[a]) max[a] = v; }
    const st = [0, 1, 2].map(a => g.nv ? Math.max((max[a] - min[a]) / 65535, 1e-6) : 1); q.push([...min.map(v => isFinite(v) ? v : 0), ...st]);
    const pq = new Uint8Array(pad4(g.nv * 6)); const n = g.nv;
    for (let a = 0; a < 3; a++) { let prev = 0; for (let i = 0; i < n; i++) { const v = Math.round((pos[i * 3 + a] - min[a]) / st[a]); const d = (v - prev) & 0xffff; prev = v; pq[a * 2 * n + i] = d & 0xff; pq[a * 2 * n + n + i] = d >> 8; } }
    // indekser som differanser, bytene i fire plan
    const iq = new Uint8Array(g.ni * 4); let prev = 0; const ni = g.ni;
    for (let i = 0; i < ni; i++) { const d = (idx[i] - prev) | 0; prev = idx[i]; iq[i] = d & 0xff; iq[ni + i] = (d >>> 8) & 0xff; iq[2 * ni + i] = (d >>> 16) & 0xff; iq[3 * ni + i] = (d >>> 24) & 0xff; }
    const nq = new Uint8Array(pad4(nor.length)); nq.set(nor);
    deler.push(pq, nq, iq);
  }
  deler.push(new Uint8Array(ab, o, hode.nSeg * 28).slice());
  const nyttHode = new TextEncoder().encode(JSON.stringify({ ...hode, v: 2, q }));
  const total = 8 + pad4(nyttHode.length) + deler.reduce((s, d) => s + d.length, 0);
  const ut = new Uint8Array(total); ut.set(b.subarray(0, 4), 0); new DataView(ut.buffer).setUint32(4, nyttHode.length, true); ut.set(nyttHode, 8);
  let p = 8 + pad4(nyttHode.length); for (const d of deler) { ut.set(d, p); p += d.length; }
  return ut;
}

/** Leser grupper fra v2 til samme typede arrays som v1. */
export function lesV2(rå: Uint8Array, hode: any, start: number) {
  let o = start; const grupper: { pos: Float32Array; nor: Int8Array; idx: Uint32Array }[] = [];
  hode.grupper.forEach((g: any, gi: number) => {
    const n = g.nv, ni = g.ni, q = hode.q[gi]; const pos = new Float32Array(n * 3);
    for (let a = 0; a < 3; a++) { let v = 0; const lo = o + a * 2 * n, hi = lo + n; for (let i = 0; i < n; i++) { v = (v + (rå[lo + i] | (rå[hi + i] << 8))) & 0xffff; pos[i * 3 + a] = q[a] + v * q[3 + a]; } }
    o += pad4(n * 6);
    const nn = hode.flat ? 0 : n * 3; const nor = new Int8Array(rå.buffer, rå.byteOffset + o, nn); o += pad4(nn);
    const idx = new Uint32Array(ni); let v = 0;
    for (let i = 0; i < ni; i++) { v = (v + (rå[o + i] | (rå[o + ni + i] << 8) | (rå[o + 2 * ni + i] << 16) | (rå[o + 3 * ni + i] << 24))) >>> 0; idx[i] = v; }
    o += ni * 4; grupper.push({ pos, nor, idx });
  });
  return { grupper, seg: new Int32Array(rå.buffer.slice(rå.byteOffset + o, rå.byteOffset + o + hode.nSeg * 28)) };
}
