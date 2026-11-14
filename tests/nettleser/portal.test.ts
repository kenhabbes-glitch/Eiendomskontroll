// Skjermbildetester for leietakerportalen: en leietaker skal bare se sitt eget leieforhold og kunne melde saker.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stopp, aapne, grunndata, NAA } from './hjelp.ts';
before(() => start()); after(stopp);

const data = () => { const d = grunndata();
  d.leietakere = [{ id: 'l1', eiendom_id: 'e1', created_at: NAA, data: { eiendomId: 'e1', navn: 'Kaffebaren AS', areal: 120 } }, { id: 'l2', eiendom_id: 'e1', created_at: NAA, data: { eiendomId: 'e1', navn: 'Naboen Frisør AS' } }];
  d.avvik.push({ id: 'a2', nr: 2, eiendom_id: 'e1', leietaker_id: 'l1', created_at: NAA, data: { eiendomId: 'e1', leietakerId: 'l1', tittel: 'Dør i klem', status: 'Ny', alv: 'Lav' } },
    { id: 'a3', nr: 3, eiendom_id: 'e1', leietaker_id: 'l2', created_at: NAA, data: { eiendomId: 'e1', leietakerId: 'l2', tittel: 'Naboens lekkasje', status: 'Ny', alv: 'Høy' } });
  return d; };
const somLeietaker = { lager: { mockRolle: 'leietaker', mockLt: 'l1' } };

test('leietaker lander i portalen og har bare sin egen meny', async () => {
  const a = await aapne('#/', { data: data(), ...somLeietaker }); try {
    await a.side.waitForSelector('text=Kaffebaren AS'); assert.deepEqual(await a.side.locator('#nav a').allInnerTexts(), ['Mitt leieforhold', 'Plikter og regelverk', 'Hjelp']);
    const t = await a.side.locator('#root').innerText(); assert.ok(t.includes('Dør i klem'), 'egen sak vises ikke');
    assert.ok(!t.includes('Løs himlingsplate'), 'utleiers avvik vises for leietaker'); assert.ok(!t.includes('Naboens lekkasje') && !t.includes('Naboen Frisør'), 'en annen leietakers sak vises');
    assert.deepEqual(a.feil, []);
  } finally { await a.lukk(); }
});

test('leietaker som går rett til utleiers sider, havner i portalen', async () => {
  const a = await aapne('#/', { data: data(), ...somLeietaker }); try {
    for (const s of ['eiendommer', 'eiendom/e1', 'avvik', 'brukere', 'innstillinger', 'leietakere', 'leietaker/l2', 'tfm', 'arealer', 'dokumenter', 'data', 'logg', 'nokler']) {
      await a.side.evaluate(h => { location.hash = '#/' + h; }, s); await a.side.waitForTimeout(300); const t = await a.side.locator('#main').innerText();
      assert.ok(t.includes('Kaffebaren AS'), `«${s}» viste ikke portalen`); assert.ok(!t.includes('Løs himlingsplate') && !t.includes('Naboen') && !t.includes('Brannalarmanlegg'), `«${s}» viste utleiers data til leietaker`);
      assert.deepEqual(a.feil, [], `«${s}» ga feil`); }
  } finally { await a.lukk(); }
});

test('leietaker melder en ny sak: den lagres på eget leieforhold med status Ny', async () => {
  const a = await aapne('#/', { data: data(), ...somLeietaker }); try {
    await a.side.getByRole('button', { name: '+ Meld ny sak' }).first().click(); const m = a.side.locator('.modal');
    await m.locator('input[type=text], input:not([type])').first().fill('Lyset i gangen virker ikke'); await m.getByRole('button', { name: /Send|Lagre|Meld/ }).last().click(); await a.side.waitForTimeout(900);
    const ny = (await a.db()).avvik.find(x => x.data.tittel === 'Lyset i gangen virker ikke'); assert.ok(ny, 'saken ble ikke lagret');
    assert.equal(ny.leietaker_id, 'l1'); assert.equal(ny.eiendom_id, 'e1'); assert.equal(ny.data.status, 'Ny');
    assert.ok((await a.side.locator('#main').innerText()).includes('Lyset i gangen virker ikke'), 'saken vises ikke i «Mine saker»'); assert.deepEqual(a.feil, []);
  } finally { await a.lukk(); }
});

test('portalen virker på mobil', async () => {
  const a = await aapne('#/', { data: data(), mobil: true, ...somLeietaker }); try {
    await a.side.waitForSelector('text=Kaffebaren AS'); assert.ok((await a.side.locator('#main').innerText()).includes('Dør i klem')); assert.deepEqual(a.feil, []);
  } finally { await a.lukk(); }
});
