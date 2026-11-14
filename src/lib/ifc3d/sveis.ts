// «Sveiser» en 3D-modell: punkter som ligger på nøyaktig samme sted i samme bygningsdel slås sammen til ett.
// IFC-leseren gir hvert trekanthjørne sitt eget punkt (med egen retning for lyssetting). Lar vi lyssettingen regnes ut
// per flate i stedet, trengs verken retningene eller kopiene – modellen får typisk en femtedel så mange punkter,
// og bruker rundt en tredjedel av minnet. Trekantene og hvilke bygningsdeler de tilhører er uendret.
import type { Ek3dHode } from './konverter';

export type RaaModell = { hode: Ek3dHode & Record<string, any>; grupper: { pos: Float32Array; nor: Int8Array; idx: Uint32Array }[]; seg: Int32Array };
const pad4 = (n: number) => Math.ceil(n / 4) * 4;

/** Leser råformatet (versjon 1) som det kommer fra konverteringen. */
export function lesRaa(b: Uint8Array): RaaModell {
  const ab = b.byteOffset === 0 && b.byteLength === b.buffer.byteLength ? b.buffer as ArrayBuffer : b.slice().buffer as ArrayBuffer;
  const hl = new DataView(ab).getUint32(4, true); const hode = JSON.parse(new TextDecoder().decode(new Uint8Array(ab, 8, hl))); let o = 8 + pad4(hl);
  const grupper = hode.grupper.map((g: any) => { const pos = new Float32Array(ab, o, g.nv * 3); o += g.nv * 12; const nn = hode.flat ? 0 : g.nv * 3; const nor = new Int8Array(ab, o, nn); o += pad4(nn); const idx = new Uint32Array(ab, o, g.ni); o += g.ni * 4; return { pos, nor, idx }; });
  return { hode, grupper, seg: new Int32Array(ab, o, hode.nSeg * 7) };
}

/** Skriver råformatet (versjon 1). Modeller uten retninger («flat») får ingen retningsblokk. */
export function skrivRaa(m: RaaModell): Uint8Array {
  const flat = m.grupper.every(g => !g.nor.length); const { q: _q, ...rest } = m.hode as any; void _q;
  const hode = { ...rest, v: 1, flat: flat || undefined, grupper: m.hode.grupper.map((g, i) => ({ ...g, nv: m.grupper[i].pos.length / 3, ni: m.grupper[i].idx.length })), nSeg: m.seg.length / 7 };
  const hb = new TextEncoder().encode(JSON.stringify(hode)); let total = 8 + pad4(hb.length) + m.seg.length * 4;
  for (const g of m.grupper) total += g.pos.length * 4 + (flat ? 0 : pad4(g.pos.length)) + g.idx.length * 4;
  const ut = new Uint8Array(total); ut.set([0x45, 0x4b, 0x33, 0x44]); new DataView(ut.buffer).setUint32(4, hb.length, true); ut.set(hb, 8); let o = 8 + pad4(hb.length);
  const legg = (a: ArrayBufferView) => { ut.set(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), o); o += a.byteLength; };
  for (const g of m.grupper) { legg(g.pos); if (!flat) { legg(g.nor.length ? g.nor : new Int8Array(g.pos.length)); o += pad4(g.pos.length) - g.pos.length; } legg(g.idx); }
  legg(m.seg); return ut;
}

/** Slår sammen like punkter innenfor hvert trekantområde (bygningsdel) og fjerner retningene. */
export function sveis(m: RaaModell): RaaModell {
  const G = m.grupper.length; const nSeg = m.seg.length / 7;
  // områdene per gruppe, i den rekkefølgen de ligger (de er sammenhengende og overlapper ikke)
  const perG: number[][] = Array.from({ length: G }, () => []); for (let s = 0; s < nSeg; s++) perG[m.seg[s * 7 + 1]].push(s);
  const seg = new Int32Array(m.seg); const grupper: RaaModell['grupper'] = [];
  for (let gi = 0; gi < G; gi++) {
    const g = m.grupper[gi]; const bits = new Int32Array(g.pos.buffer, g.pos.byteOffset, g.pos.length);
    const pos = new Float32Array(g.pos.length); const idx = new Uint32Array(g.idx.length); let nv = 0, ni = 0;
    let tab = new Int32Array(1024), kart = new Int32Array(1024);
    for (const s of perG[gi].sort((a, b) => m.seg[a * 7 + 4] - m.seg[b * 7 + 4])) {
      const vf = m.seg[s * 7 + 2], vc = m.seg[s * 7 + 3], f = m.seg[s * 7 + 4], c = m.seg[s * 7 + 5];
      let kap = 1024; while (kap < vc * 2) kap *= 2; if (tab.length < kap) tab = new Int32Array(kap); tab.fill(-1, 0, kap); if (kart.length < vc) kart = new Int32Array(Math.max(vc, kart.length * 2));
      const v0 = nv, f0 = ni, maske = kap - 1;
      for (let v = 0; v < vc; v++) {
        const p = (vf + v) * 3; let a = bits[p], b = bits[p + 1], d = bits[p + 2]; if (a === -2147483648) a = 0; if (b === -2147483648) b = 0; if (d === -2147483648) d = 0; // −0 = 0
        let h = (Math.imul(a, 73856093) ^ Math.imul(b, 19349663) ^ Math.imul(d, 83492791)) & maske;
        for (;;) { const t = tab[h]; if (t < 0) { tab[h] = v; const n = nv++; pos[n * 3] = g.pos[p]; pos[n * 3 + 1] = g.pos[p + 1]; pos[n * 3 + 2] = g.pos[p + 2]; kart[v] = n; break; }
          const tp = (vf + t) * 3; if (g.pos[tp] === g.pos[p] && g.pos[tp + 1] === g.pos[p + 1] && g.pos[tp + 2] === g.pos[p + 2]) { kart[v] = kart[t]; break; } h = (h + 1) & maske; }
      }
      for (let i = 0; i < c; i++) idx[ni++] = kart[g.idx[f + i] - vf];
      seg[s * 7 + 2] = v0; seg[s * 7 + 3] = nv - v0; seg[s * 7 + 4] = f0; seg[s * 7 + 5] = c;
    }
    grupper.push({ pos: pos.slice(0, nv * 3), nor: new Int8Array(0), idx: ni === idx.length ? idx : idx.slice(0, ni) });
  }
  return { hode: { ...m.hode, flat: true, grupper: m.hode.grupper.map((g, i) => ({ ...g, nv: grupper[i].pos.length / 3, ni: grupper[i].idx.length })) }, grupper, seg };
}
