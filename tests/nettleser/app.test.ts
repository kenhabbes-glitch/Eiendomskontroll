// Skjermbildetester: appen kjøres i en ekte nettleser (Chromium) mot en etterligning av databasen.
// Fanger feil som brukeren selv ville merket: sider som ikke åpner, skjemaer som ikke lagrer, knapper som ikke virker.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stopp, aapne, grunndata, type Aapnet } from './hjelp.ts';

before(start); after(stopp);
const SIDER = ['oversikt', 'eiendommer', 'eiendom/e1', 'kontroller', 'runde', 'befaringer', 'tilsynsanalyser', 'avvik', 'tilsyn', 'arbeidsordre', 'leietakere', 'maalere', 'tfm', 'arealer', 'dokumenter', 'innboks', 'meldinger',
  'nokler', 'vedlikehold', 'prosjekter', 'handbok', 'regelverk', 'hjelp', 'profil', 'brukere', 'data', 'innstillinger', 'logg', 'arkiv'];
const tekst = async (a: Aapnet) => (await a.side.locator('#root').innerText()).trim();

async function gaaGjennom(a: Aapnet, sider: string[]) {
  const tomme: string[] = [];
  for (const s of sider) { await a.side.evaluate(h => { location.hash = '#/' + h; }, s); await a.side.waitForTimeout(350);
    if (a.feil.length) assert.fail(`Siden «${s}» ga feil: ${a.feil[0]}`);
    if ((await a.side.locator('#main').innerText()).trim().length < 15) tomme.push(s); }
  assert.deepEqual(tomme, [], 'sider som ble stående tomme');
}

test('alle sidene i menyen åpner uten feil (PC)', async () => { const a = await aapne('#/oversikt'); try { await gaaGjennom(a, SIDER); } finally { await a.lukk(); } });
test('alle sidene i menyen åpner uten feil (mobil)', async () => { const a = await aapne('#/oversikt', { mobil: true }); try { await gaaGjennom(a, SIDER); } finally { await a.lukk(); } });
test('alle sidene åpner også helt uten data (ny kunde)', async () => { const a = await aapne('#/oversikt', { data: {} }); try { await gaaGjennom(a, SIDER.filter(s => s !== 'eiendom/e1')); } finally { await a.lukk(); } });

test('alle fanene på en eiendom åpner uten feil', async () => {
  const a = await aapne('#/eiendom/e1'); try {
    const faner = a.side.locator('.tabs a, .tabs button'); const n = await faner.count(); assert.ok(n >= 8, 'forventet minst 8 faner, fant ' + n);
    for (let i = 0; i < n; i++) { const navn = (await faner.nth(i).innerText()).trim(); await faner.nth(i).click(); await a.side.waitForTimeout(400);
      if (a.feil.length) assert.fail(`Fanen «${navn}» ga feil: ${a.feil[0]}`); assert.ok((await tekst(a)).includes('Testgården'), `Fanen «${navn}» mistet eiendommen`); }
  } finally { await a.lukk(); }
});

test('registrere avvik: skjemaet lagrer, og avviket vises i listen', async () => {
  const a = await aapne('#/eiendom/e1'); try {
    await a.side.getByRole('button', { name: '+ Avvik' }).click();
    const modal = a.side.locator('.modal'); await modal.locator('input[type=text], input:not([type])').first().fill('Vannlekkasje i teknisk rom');
    await modal.getByRole('button', { name: 'Lagre' }).click(); await a.side.waitForTimeout(800);
    assert.equal(await a.side.locator('.modal').count(), 0, 'skjemaet lukket seg ikke'); assert.deepEqual(a.feil, []);
    const ny = (await a.db()).avvik.find(x => x.data.tittel === 'Vannlekkasje i teknisk rom'); assert.ok(ny, 'avviket ble ikke lagret');
    assert.equal(ny.eiendom_id, 'e1'); assert.equal(ny.data.status, 'Ny');
    await a.side.evaluate(() => { location.hash = '#/avvik'; }); await a.side.waitForTimeout(500);
    assert.ok((await tekst(a)).includes('Vannlekkasje i teknisk rom'), 'avviket vises ikke i avvikslisten');
  } finally { await a.lukk(); }
});

test('avvik uten tittel lagres ikke', async () => {
  const a = await aapne('#/eiendom/e1'); try {
    await a.side.getByRole('button', { name: '+ Avvik' }).click(); await a.side.locator('.modal').getByRole('button', { name: 'Lagre' }).click(); await a.side.waitForTimeout(500);
    assert.equal((await a.db()).avvik.length, 1); assert.equal(await a.side.locator('.modal').count(), 1, 'skjemaet skal stå åpent');
  } finally { await a.lukk(); }
});

test('innlogging: utlogget bruker ser bare innloggingssiden, og kommer inn etter innlogging', async () => {
  const a = await aapne('#/avvik', { lager: { mockLogout: '1' } }); try {
    assert.ok((await tekst(a)).includes('Logg inn for å fortsette')); assert.ok(!(await tekst(a)).includes('Løs himlingsplate'), 'data vises uten innlogging');
    await a.side.locator('input[type=email]').fill('test@example.no'); await a.side.locator('input[type=password]').fill('hemmelig'); await a.side.getByRole('button', { name: 'Logg inn' }).click();
    await a.side.waitForSelector('#nav'); await a.side.waitForTimeout(600); assert.ok((await tekst(a)).includes('Løs himlingsplate')); assert.deepEqual(a.feil, []);
  } finally { await a.lukk(); }
});

test('språk: appen kan brukes på engelsk', async () => {
  const a = await aapne('#/avvik', { lager: { 'ek.sprak': 'en' } }); try {
    const t = await tekst(a); assert.ok(t.includes('Properties') || t.includes('Overview'), 'menyen er ikke på engelsk'); assert.ok(!t.includes('Eiendommer'), 'norsk tekst i engelsk meny');
    await gaaGjennom(a, ['oversikt', 'eiendom/e1', 'kontroller', 'arealer', 'profil']);
  } finally { await a.lukk(); }
});

test('tegning på mobil: åpner i fullskjerm, kan zoomes, og låsen hindrer utilsiktet flytting', async () => {
  const a = await aapne('#/arealer', { mobil: true }); try {
    await a.side.getByRole('button', { name: /^Systemkart/ }).first().click(); await a.side.waitForSelector('.modal.plan.fs'); await a.side.waitForTimeout(800);
    const svg = a.side.locator('.pcanvas svg'); const vb0 = await svg.getAttribute('viewBox');
    await a.side.locator('.pzoom button').nth(0).tap(); await a.side.waitForTimeout(200); const vb1 = await svg.getAttribute('viewBox'); assert.notEqual(vb1, vb0, 'zoomknappen virket ikke');
    await a.side.locator('.pzoom button').nth(2).tap(); await a.side.waitForTimeout(200);
    const cdp = await a.kontekst.newCDPSession(a.side); const pos = async () => (await a.db()).systemer[0].data.pos;
    const dra = async () => { const b = (await a.side.locator('[data-m] rect').first().boundingBox())!; const x = b.x + b.width / 2, y = b.y + b.height / 2;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let k = 1; k < 8; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + k * 12, y: y + k * 8 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await a.side.waitForTimeout(1500); };
    await dra(); assert.deepEqual(await pos(), { tegningId: 't1', x: 400, y: 300 }, 'systemet flyttet seg selv om tegningen var låst');
    await a.side.locator('.pzoom button').nth(2).tap(); await a.side.waitForTimeout(200); // tilbake til hele tegningen
    await a.side.locator('.pzoom button').nth(3).tap(); await a.side.waitForTimeout(300); await dra(); // lås opp og dra
    const p = await pos(); assert.ok(p.x > 420 && p.y > 310, 'systemet lot seg ikke flytte etter opplåsing: ' + JSON.stringify(p));
    await a.side.getByRole('button', { name: /Lukk/ }).last().click(); await a.side.waitForTimeout(400); assert.equal(await a.side.locator('.modal.plan').count(), 0); assert.deepEqual(a.feil, []);
  } finally { await a.lukk(); }
});
