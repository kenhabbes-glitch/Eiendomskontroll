import { test } from 'node:test'; import assert from 'node:assert/strict';
import { iSesong, tilSesong, sesongTxt } from '../src/lib/sesong.ts';
const vinter = { fra: 11, til: 4 }, sommer = { fra: 5, til: 9 };
test('sesong over nyttår: november–april', () => {
  assert.ok(iSesong('2026-11-01', vinter)); assert.ok(iSesong('2027-01-15', vinter)); assert.ok(iSesong('2027-04-30', vinter));
  assert.ok(!iSesong('2027-05-01', vinter)); assert.ok(!iSesong('2026-10-31', vinter));
});
test('frist utenfor sesong flyttes til første dag i neste sesong', () => {
  assert.equal(tilSesong('2027-05-10', vinter), '2027-11-01'); assert.equal(tilSesong('2027-02-10', vinter), '2027-02-10');
  assert.equal(tilSesong('2026-10-10', sommer), '2027-05-01'); assert.equal(tilSesong('2026-02-10', sommer), '2026-05-01');
  assert.equal(tilSesong('2026-12-24', { fra: 12, til: 2 }), '2026-12-24'); assert.equal(tilSesong('2026-03-01', { fra: 12, til: 2 }), '2026-12-01');
});
test('uten sesong endres ingenting', () => { assert.equal(tilSesong('2027-07-01', undefined), '2027-07-01'); assert.ok(iSesong('2027-07-01', null)); assert.equal(sesongTxt(vinter), 'nov–apr'); assert.equal(sesongTxt(), ''); });
