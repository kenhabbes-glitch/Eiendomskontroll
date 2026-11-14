// Tester lesingen av 3D-modeller bit for bit (src/lib/ifc3d/modell.ts): resultatet skal være likt uansett hvordan
// filen kommer inn – i ett stykke, i små biter eller delt på flere filer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore – bygges av «pretest»
import { lesModell, lesModellStrom, delStrom, delOpp } from './.bygg/modell.mjs';
// @ts-ignore
import { pakkV2, lesV2 } from './.bygg/pakk.mjs';

const pad4 = (n: number) => Math.ceil(n / 4) * 4;
// En liten modell i råformatet (versjon 1): to grupper med tilfeldige, men faste, tall
function lagRaa() {
  let frø = 12345; const rnd = () => (frø = (frø * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const G = [{ nv: 1000, ni: 2997 }, { nv: 37, ni: 90 }]; const nSeg = 5;
  const hode = { v: 1, bbox: [0, 0, 0, 60, 20, 40], fokus: [0, 0, 0, 60, 20, 40], etasjer: [{ navn: '1. etasje', kote: 0 }], grupper: G.map(g => ({ ...g, etasje: 0, glass: false })), elementer: [{ n: 'Vegg', e: 0 }], nSeg };
  const hb = new TextEncoder().encode(JSON.stringify(hode));
  const str = 8 + pad4(hb.length) + G.reduce((s, g) => s + g.nv * 12 + pad4(g.nv * 3) + g.ni * 4, 0) + nSeg * 28;
  const b = new Uint8Array(str); b.set([0x45, 0x4b, 0x33, 0x44]); const dv = new DataView(b.buffer); dv.setUint32(4, hb.length, true); b.set(hb, 8);
  let o = 8 + pad4(hb.length); const fasit: { pos: number[]; nor: number[]; idx: number[] }[] = [];
  for (const g of G) { const f = { pos: [] as number[], nor: [] as number[], idx: [] as number[] };
    for (let i = 0; i < g.nv * 3; i++) { const v = Math.fround(rnd() * 60 - 5); dv.setFloat32(o + i * 4, v, true); f.pos.push(v); } o += g.nv * 12;
    for (let i = 0; i < g.nv * 3; i++) { const v = Math.round(rnd() * 254 - 127) | 0; dv.setInt8(o + i, v); f.nor.push(v); } o += pad4(g.nv * 3);
    for (let i = 0; i < g.ni; i++) { const v = Math.floor(rnd() * g.nv); dv.setUint32(o + i * 4, v, true); f.idx.push(v); } o += g.ni * 4; fasit.push(f); }
  const seg: number[] = []; for (let i = 0; i < nSeg * 7; i++) { const v = i % 7 === 1 ? Math.floor(rnd() * 2) : Math.floor(rnd() * 1000) - 3; dv.setInt32(o + i * 4, v, true); seg.push(v); }
  return { b, fasit, seg, hode };
}
const gzip = async (b: Uint8Array) => new Uint8Array(await new Response(new Blob([b]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
const iBiter = (b: Uint8Array, n: number) => new ReadableStream<Uint8Array>({ start(c) { for (let i = 0; i < b.length; i += n) c.enqueue(b.slice(i, i + n)); c.close(); } });
const lik = (m: any, R: ReturnType<typeof lagRaa>, toleranse: number) => {
  assert.equal(m.grupper.length, R.fasit.length);
  R.fasit.forEach((f, gi) => { const g = m.grupper[gi];
    assert.equal(g.pos.length, f.pos.length); for (let i = 0; i < f.pos.length; i++) assert.ok(Math.abs(g.pos[i] - f.pos[i]) <= toleranse, `posisjon ${gi}/${i}: ${g.pos[i]} mot ${f.pos[i]}`);
    assert.deepEqual([...g.nor], f.nor); assert.deepEqual([...g.idx], f.idx); });
  assert.deepEqual([...m.seg], R.seg);
};

test('gammelt format (versjon 1) leses nøyaktig', async () => { const R = lagRaa(); lik(await lesModell((await gzip(R.b)).buffer), R, 0); });

test('pakket format (versjon 2) gir samme modell innenfor 1 mm', async () => {
  const R = lagRaa(); const m = await lesModell((await gzip(pakkV2(R.b))).buffer);
  assert.equal(m.hode.v, 2); lik(m, R, 0.001);
});

test('lesing i små biter gir nøyaktig samme resultat som lesing i ett stykke', async () => {
  const R = lagRaa(); const gz = await gzip(pakkV2(R.b)); const hel = await lesModell(gz.buffer);
  for (const n of [1, 7, 1000]) { const m = await lesModellStrom(iBiter(gz, n));
    m.grupper.forEach((g: any, i: number) => { assert.deepEqual(g.pos, hel.grupper[i].pos); assert.deepEqual(g.nor, hel.grupper[i].nor); assert.deepEqual(g.idx, hel.grupper[i].idx); }); assert.deepEqual(m.seg, hel.seg); }
});

test('strømlesingen gir det samme som den gamle lesemåten (hele filen i minnet)', async () => {
  const R = lagRaa(); const v2 = pakkV2(R.b); const hl = new DataView(v2.buffer).getUint32(4, true); const hode = JSON.parse(new TextDecoder().decode(v2.subarray(8, 8 + hl)));
  const gml = lesV2(v2, hode, 8 + pad4(hl)); const ny = await lesModell((await gzip(v2)).buffer);
  gml.grupper.forEach((g: any, i: number) => { assert.deepEqual(ny.grupper[i].pos, g.pos); assert.deepEqual([...ny.grupper[i].nor], [...g.nor]); assert.deepEqual(ny.grupper[i].idx, g.idx); }); assert.deepEqual(ny.seg, gml.seg);
});

test('modell som er delt på flere filer hentes i rekkefølge og settes sammen', async () => {
  const R = lagRaa(); const gz = await gzip(pakkV2(R.b)); const k = Math.floor(gz.length / 3) + 1; const filer: Record<string, Uint8Array> = { a: gz.slice(0, k), b: gz.slice(k, 2 * k), c: gz.slice(2 * k) };
  const hentet: string[] = []; const m = await lesModellStrom(delStrom(['a', 'b', 'c'], async p => { hentet.push(p); return new Response(filer[p]); }));
  assert.deepEqual(hentet, ['a', 'b', 'c']); lik(m, R, 0.001);
  assert.equal(delOpp(new Blob([new Uint8Array(10)])).length, 1);
});

test('avkuttet fil, feil filtype og fil som ikke finnes gir feilmelding i stedet for en ødelagt modell', async () => {
  const R = lagRaa(); const raa = pakkV2(R.b);
  await assert.rejects(async () => lesModell((await gzip(raa.slice(0, raa.length - 50))).buffer), /ufullstendig/);
  await assert.rejects(async () => lesModell((await gzip(new TextEncoder().encode('{"error":"ikke tilgang"}          '))).buffer), /Ukjent modellformat/);
  await assert.rejects(() => lesModellStrom(delStrom(['x'], async () => new Response('nei', { status: 400 }))));
});

test('lett visning: utelatte grupper tar ikke plass, og resten av modellen er uendret', async () => {
  const R = lagRaa(); const gz = await gzip(pakkV2(R.b)); const hel = await lesModell(gz.buffer);
  let nr = 0; const m = await lesModellStrom(iBiter(gz, 500), () => nr++ === 1); // behold bare gruppe 2
  assert.equal(m.grupper[0].pos.length, 0); assert.equal(m.hode.grupper[0].nv, 0); assert.equal(m.hode.grupper[0].ni, 0);
  assert.deepEqual(m.grupper[1].pos, hel.grupper[1].pos); assert.deepEqual(m.grupper[1].idx, hel.grupper[1].idx);
  const forventet: number[] = []; for (let i = 0; i < hel.hode.nSeg; i++) if (hel.seg[i * 7 + 1] === 1) forventet.push(...hel.seg.subarray(i * 7, i * 7 + 7));
  assert.deepEqual([...m.seg], forventet); assert.equal(m.hode.nSeg, forventet.length / 7);
  for (let i = 0; i < m.hode.nSeg; i++) assert.equal(m.seg[i * 7 + 1], 1);
});
