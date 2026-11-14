// Tester regnestykkene som flytter systemer, komponenter og arealer når en tegning byttes ut.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bruk, likhet, fraCad, skalafaktor, rotasjonGrader } from '../src/lib/planRef.ts';

test('to punktpar gir en avbildning som treffer begge punktene', () => {
  const m = likhet([100, 100], [500, 100], [220, 340], [220, 1140])!; // dobbelt så stor og rotert 90°
  assert.deepEqual(bruk(m, [100, 100]), [220, 340]); assert.deepEqual(bruk(m, [500, 100]), [220, 1140]);
  assert.ok(Math.abs(skalafaktor(m) - 2) < 1e-9); assert.ok(Math.abs(rotasjonGrader(m) - 90) < 1e-9);
});
test('samme punkter gir uendret tegning', () => {
  const m = likhet([10, 20], [300, 400], [10, 20], [300, 400])!; assert.deepEqual(bruk(m, [123, 456]), [123, 456]);
});
test('to like punkter kan ikke brukes som referanse', () => { assert.equal(likhet([5, 5], [5, 5], [0, 0], [10, 10]), null); });
test('DWG-tegninger med samme koordinatsystem: et punkt havner på samme sted i bygget', () => {
  const gml = { vb: { x: 0, y: 0, w: 100, h: 50 }, w: 1000, h: 500 }, ny = { vb: { x: -20, y: -10, w: 200, h: 100 }, w: 4000, h: 2000 };
  const cad = (p: number[], r: typeof gml) => [r.vb.x + p[0] / r.w * r.vb.w, r.vb.y + p[1] / r.h * r.vb.h];
  const p = [640, 210], q = bruk(fraCad(gml, ny), p); const a = cad(p, gml), b = cad(q, ny);
  assert.ok(Math.abs(a[0] - b[0]) < 0.01 && Math.abs(a[1] - b[1]) < 0.01);
});
