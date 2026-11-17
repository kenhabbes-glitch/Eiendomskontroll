import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore – bygges av «pretest»
import { planRydding } from './.bygg/ifcRydd.mjs';

const E = 'e1';
const sys = (id: string, o: any = {}) => ({ id, eiendomId: E, navn: id, importKilde: { rad: 1 }, ifcGuider: ['g'], notat: 'Fra IFC-modell x.ifc: 3 stk', ...o });
const komp = (id: string, anleggId: string, o: any = {}) => ({ id, eiendomId: E, anleggId, navn: id, importKilde: { ifc: 'x.ifc' }, ...o });

test('rydding: fjerner det importen opprettet, og beholder alt med avvik, dokumenter, utførte kontroller og egne data', () => {
  const d = {
    anlegg: [sys('ren'), sys('medAvvik'), sys('medDok'), sys('utfort'), sys('egenKomp'), sys('excel', { ifcGuider: [], notat: '' }), sys('annetBygg', { eiendomId: 'x' }), sys('arkivert', { arkivert: true }), sys('manuell', { importKilde: undefined })],
    komponenter: [komp('k1', 'ren'), komp('k2', 'ren'), komp('k3', 'medAvvik'), komp('k4', 'medDok'), komp('k5', 'utfort'), komp('k6', 'egenKomp'), { id: 'egen', eiendomId: E, anleggId: 'egenKomp', navn: 'min' }, komp('kAvvik', 'ren'), komp('ann', 'annetBygg', { eiendomId: 'x' })],
    avvik: [{ id: 'a1', eiendomId: E, anleggId: 'medAvvik' }, { id: 'a2', eiendomId: E, komponentId: 'kAvvik', anleggId: 'ren' }],
    dokumenter: [{ id: 'd1', eiendomId: E, anleggId: 'medDok' }],
    oppgaver: [{ id: 'o1', eiendomId: E, anleggId: 'ren' }, { id: 'o2', eiendomId: E, anleggId: 'utfort', historikk: [{ dato: '2026-01-01' }] }, { id: 'o3', eiendomId: E, anleggId: 'ren', historikk: [{ dato: '2026-01-01' }] }],
  };
  const p = planRydding(d, E);
  assert.deepEqual(p.komponenter.map((k: any) => k.id).sort(), ['k1', 'k2', 'k3', 'k4', 'k5', 'k6'], 'kAvvik har avvik og beholdes; andre byggs og egne komponenter røres ikke');
  // «ren» har en komponent med avvik igjen (kAvvik), så den beholdes. Systemer uten annet innhold slettes.
  assert.deepEqual(p.systemer.map((a: any) => a.id).sort(), [], 'ingen system er helt tomme her');
  const p2 = planRydding({ ...d, komponenter: d.komponenter.filter((k: any) => k.id !== 'kAvvik'), avvik: [d.avvik[0]], oppgaver: d.oppgaver.filter((o: any) => o.id !== 'o3') }, E);
  assert.deepEqual(p2.systemer.map((a: any) => a.id).sort(), ['ren'], 'bare systemet uten avvik, dokumenter, utførte kontroller og egne komponenter slettes');
  assert.deepEqual(p2.kontroller.map((o: any) => o.id), ['o1'], 'bare uutførte kontroller for slettede systemer fjernes');
  assert.ok(planRydding(d, E).beholdtSys.some((x: any) => x.navn === 'ren' && /kontroller|komponenter/.test(x.grunn)), 'utført kontroll eller komponent med avvik stopper slettingen av systemet');
  assert.ok(p2.beholdtSys.some((x: any) => x.navn === 'medAvvik' && /avvik/.test(x.grunn)));
  assert.ok(p2.beholdtSys.some((x: any) => x.navn === 'egenKomp'));
  assert.equal(p2.beholdtSys.length, 4, 'medAvvik, medDok, utfort, egenKomp');
});
