// Skjermbildetester: appen kjøres i en ekte nettleser (Chromium) mot en etterligning av databasen.
// Fanger feil som brukeren selv ville merket: sider som ikke åpner, skjemaer som ikke lagrer, knapper som ikke virker.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stopp, aapne, grunndata, NAA, type Aapnet } from './hjelp.ts';

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

test('avvik med knapper: «Hva er feil / Hvor» setter tittel og alvorlighet, og skriver ikke over egen tekst', async () => {
  const a = await aapne('#/eiendom/e1'); try {
    await a.side.getByRole('button', { name: '+ Avvik' }).click(); const modal = a.side.locator('.modal');
    await modal.getByRole('button', { name: 'Lekkasje', exact: true }).click(); await modal.getByRole('button', { name: 'Tak/himling' }).click();
    const tittel = modal.locator('input[type=text], input:not([type])').first(); assert.equal(await tittel.inputValue(), 'Lekkasje i tak');
    assert.equal(await modal.locator('select').filter({ hasText: 'Høy' }).count() > 0, true, 'alvorlighet ble ikke satt til Høy');
    await modal.getByRole('button', { name: 'Flekk', exact: true }).click(); assert.equal(await tittel.inputValue(), 'Flekk i tak', 'tittel som appen selv satte skal følge valget');
    assert.ok((await modal.innerText()).includes('lekkasje eller fukt'), 'merknad om flekk i tak mangler');
    await tittel.fill('Min egen tittel'); await modal.getByRole('button', { name: 'Vegg', exact: true }).click(); assert.equal(await tittel.inputValue(), 'Min egen tittel', 'egen tekst ble overskrevet');
    await modal.locator('input[capture]').setInputFiles({ name: 'rom 2.14.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') });
    assert.equal(await modal.getByRole('button', { name: /Les tekst på bildet/ }).count(), 1, 'knappen for tekst på bildet skal vises med bilde');
    await modal.getByRole('button', { name: 'Lagre' }).click(); await a.side.waitForTimeout(800);
    const ny = (await a.db()).avvik.find(x => x.data.tittel === 'Min egen tittel'); assert.ok(ny, 'avviket ble ikke lagret'); assert.deepEqual(a.feil, []);
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

test('samsvar: forsiden og eiendomssiden viser trafikklys og hva som mangler etter lov og forskrift', async () => {
  const a = await aapne('#/oversikt'); try {
    const rad = a.side.locator('tr', { hasText: 'Testgården' });
    await rad.locator('.chip', { hasText: 'Krever tiltak' }).waitFor();
    assert.ok(await rad.locator('.lysp').count() >= 4, 'ett lys per område');
    assert.ok(+(await a.side.locator('.kpi', { hasText: 'Lovpålagte kontroller mangler i planen' }).locator('.v').innerText()) > 0);
    await a.side.locator('.kpi', { hasText: 'Lovpålagte kontroller mangler i planen' }).click();
    const kort = a.side.locator('.samsvar'); await kort.waitFor();
    assert.match(await kort.innerText(), /Lovpålagte kontroller[\s\S]*mangler i planen[\s\S]*Dette må gjøres/);
    if (process.env.EK_BILDE) await a.side.screenshot({ path: process.env.EK_BILDE, fullPage: true });
    await kort.locator('button', { hasText: 'manglende lovpålagte kontroller' }).click();
    await a.side.locator('.modal').last().waitFor();
    assert.deepEqual(a.feil, []);
  } finally { await a.lukk(); }
});

test('lovkrav: manglende kontroll kan legges inn eller merkes «ikke aktuelt» med begrunnelse, og utførelse uten rapport flagges', async () => {
  const data = grunndata();
  data.oppgaver = [{ id: 'o1', eiendom_id: 'e1', created_at: NAA, data: { eiendomId: 'e1', anleggId: 's1', malKey: 'brannalarm_aar', navn: 'Brannalarmanlegg – årlig kontroll og service', type: 'Lovpålagt', ansvar: 'Eier', aktiv: true,
    intervall: { n: 1, enhet: 'år' }, nesteFrist: '2099-01-01', sistUtfort: '2026-06-01', historikk: [{ dato: '2026-06-01', av: 'Ola', res: 'OK – ingen avvik' }] } }];
  // Energiattest lagt ved da kontrollen ble kvittert skal telle som dokumentet «Energiattest»
  data.oppgaver.push({ id: 'o2', eiendom_id: 'e1', created_at: NAA, data: { eiendomId: 'e1', malKey: 'energiattest', navn: 'Energiattest – fornyelse', type: 'Lovpålagt', ansvar: 'Eier', aktiv: true, intervall: { n: 10, enhet: 'år' }, nesteFrist: '2099-01-01', sistUtfort: '2026-06-01', historikk: [{ dato: '2026-06-01', res: 'OK', dokId: 'd1' }] } });
  data.dokumenter = [{ id: 'd1', eiendom_id: 'e1', created_at: NAA, data: { eiendomId: 'e1', type: 'Servicerapport', tittel: 'Energiattest kontordel', dato: '2026-06-01', oppgaveId: 'o2' } }];
  const a = await aapne('#/eiendom/e1', { data }); try {
    await a.side.locator('.tabs a, .tabs button', { hasText: 'Lovkrav' }).click();
    assert.match(await a.side.locator('table.krav tr', { hasText: 'energiattest ved utleie' }).last().innerText(), /Foreligger[\s\S]*Energiattest kontordel[\s\S]*\+ Flere/);
    const utfort = a.side.locator('table.krav tr', { hasText: 'Brannalarmanlegg – årlig kontroll' });
    assert.match(await utfort.innerText(), /I rute[\s\S]*Ingen rapport eller dokumentasjon vedlagt/);
    // Ikke aktuelt krever begrunnelse
    const rad = a.side.locator('table.krav tr', { hasText: 'Eiers internkontroll' }).first();
    await rad.locator('button', { hasText: 'Ikke aktuelt' }).click();
    const m = a.side.locator('.modal').last(); await m.locator('textarea').fill('Dekkes av konsernets felles internkontroll');
    await m.locator('button', { hasText: 'Lagre vurderingen' }).click(); await m.waitFor({ state: 'detached' });
    await a.side.locator('table.krav tr', { hasText: 'Dekkes av konsernets felles internkontroll' }).waitFor();
    const e = (await a.db()).eiendommer[0].data; assert.equal(e.kontrollNA.length, 1); assert.equal(e.kontrollNA[0].grunn, 'Dekkes av konsernets felles internkontroll');
    // Legg inn direkte
    const for_ = (await a.db()).oppgaver.length;
    await a.side.locator('table.krav tr', { hasText: 'Ikke i kontrollplanen' }).first().locator('button', { hasText: 'Legg inn' }).click();
    await a.side.waitForFunction((n: number) => JSON.parse(localStorage.getItem('mockdb') || '{}').oppgaver.length === n + 1, for_);
    if (process.env.EK_BILDE) await a.side.screenshot({ path: process.env.EK_BILDE, fullPage: true });
    assert.deepEqual(a.feil, []);
  } finally { await a.lukk(); }
});

test('veiviser: «Hva finnes i bygget?» registrerer systemer og foreslår de lovpålagte kontrollene', async () => {
  const a = await aapne('#/eiendom/e1'); try {
    await a.side.locator('.tabs a, .tabs button', { hasText: 'Lovkrav' }).click();
    await a.side.locator('button', { hasText: 'Hva finnes i bygget?' }).click();
    const m = a.side.locator('.modal').last();
    assert.match(await m.locator('label', { hasText: 'Brannalarmanlegg' }).innerText(), /Allerede registrert/);
    await m.locator('label', { hasText: /^Heis/ }).first().locator('input').check();
    await m.locator('button', { hasText: 'Registrer 1 og vis kontrollene' }).click();
    await a.side.locator('.modal h2', { hasText: 'Kontrollplan –' }).waitFor();
    const d = await a.db(); assert.equal(d.systemer.length, 2); assert.equal(d.systemer[1].data.type, 'heis'); assert.ok(d.systemer[1].data.tfmSys, 'TFM-kode satt');
    assert.match(await a.side.locator('.modal').last().innerText(), /[Hh]eis/);
    if (process.env.EK_BILDE) await a.side.screenshot({ path: process.env.EK_BILDE });
    assert.deepEqual(a.feil, []);
  } finally { await a.lukk(); }
});

test('uten nett: nytt avvik og endring lagres på enheten, sendes når nettet er tilbake, og overskriver ikke kollegaens endring', async () => {
  const a = await aapne('#/avvik'); try {
    await a.kontekst.setOffline(true); await a.side.waitForTimeout(200);
    // nytt avvik uten nett
    await a.side.getByRole('button', { name: /Meld avvik|Nytt avvik|\+ Avvik/ }).first().click();
    let m = a.side.locator('.modal'); await m.locator('input[type=text], input:not([type])').first().fill('Knust rute i trapp');
    await m.getByRole('button', { name: 'Lagre' }).click(); await m.waitFor({ state: 'detached' });
    await a.side.locator('tr', { hasText: 'Knust rute i trapp' }).locator('.chip', { hasText: 'Ikke sendt' }).waitFor();
    // endre et eksisterende avvik uten nett
    await a.side.locator('tr', { hasText: 'Løs himlingsplate' }).click();
    m = a.side.locator('.modal'); await m.locator('input[type=text], input:not([type])').first().fill('Løs himlingsplate ved heis');
    await m.getByRole('button', { name: 'Lagre' }).click(); await m.waitFor({ state: 'detached' });
    assert.match(await a.side.locator('.offline-band').first().innerText(), /2 endringer venter/);
    let d = await a.db(); assert.equal(d.avvik.length, 1, 'ingenting skal være sendt ennå'); assert.equal(d.avvik[0].data.tittel, 'Løs himlingsplate');
    // i mellomtiden har en kollega endret alvorlighetsgraden på serveren
    await a.side.evaluate(() => { (window as any).__mockdb.avvik[0].data.alv = 'Høy'; });
    await a.kontekst.setOffline(false);
    await a.side.waitForFunction(() => JSON.parse(localStorage.getItem('mockdb') || '{}').avvik.length === 2, null, { timeout: 15000 });
    await a.side.waitForFunction(() => !document.querySelector('.offline-band'), null, { timeout: 8000 });
    d = await a.db(); const gml = d.avvik.find(x => x.id === 'a1')!.data;
    assert.equal(gml.tittel, 'Løs himlingsplate ved heis', 'min endring ble sendt'); assert.equal(gml.alv, 'Høy', 'kollegaens endring ble beholdt');
    assert.equal(d.avvik.find(x => x.id !== 'a1')!.data.tittel, 'Knust rute i trapp'); assert.ok(!('usynket' in gml));
    assert.equal(await a.side.locator('.chip', { hasText: 'Ikke sendt' }).count(), 0); assert.deepEqual(a.feil, []);
  } finally { await a.lukk(); }
});

test('uten nett: kontroll kvitteres med bilde av rapporten, og alt lastes opp når nettet er tilbake', async () => {
  const data = grunndata();
  data.oppgaver = [{ id: 'o1', eiendom_id: 'e1', created_at: NAA, data: { eiendomId: 'e1', anleggId: 's1', malKey: 'brannalarm_aar', navn: 'Brannalarmanlegg – årlig kontroll og service', type: 'Lovpålagt', ansvar: 'Eier', aktiv: true, intervall: { n: 1, enhet: 'år' }, nesteFrist: '2026-01-01', historikk: [] } }];
  data.dokumenter = [];
  const a = await aapne('#/kontroller', { data }); try {
    await a.kontekst.setOffline(true); await a.side.waitForTimeout(200);
    await a.side.locator('tr', { hasText: 'Brannalarmanlegg – årlig kontroll' }).first().click();
    await a.side.locator('.modal').last().getByRole('button', { name: 'Registrer utført' }).click();
    const m = a.side.locator('.modal').last();
    await m.locator('input[type=file]').first().setInputFiles({ name: 'rapport.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') });
    // bilde tatt med kameraet under kontrollen
    await m.locator('input[capture]').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') });
    await m.locator('img').first().waitFor();
    await m.locator('.mf button.pri, .mf .btn.pri').last().click(); await m.waitFor({ state: 'detached', timeout: 8000 });
    let d = await a.db(); assert.equal(d.dokumenter.length, 0); assert.equal(d.oppgaver[0].data.historikk.length, 0, 'ingenting sendt uten nett');
    await a.kontekst.setOffline(false);
    await a.side.waitForFunction(() => { const x = JSON.parse(localStorage.getItem('mockdb') || '{}'); return x.dokumenter.length === 1 && x.oppgaver[0].data.historikk.length === 1; }, null, { timeout: 15000 });
    d = await a.db(); const dok = d.dokumenter[0].data, o = d.oppgaver[0].data;
    assert.ok(dok.fil.path && !dok.fil.path.startsWith('lokal:') && !dok.fil.lokal, 'filen skal være lastet opp: ' + JSON.stringify(dok.fil));
    assert.equal(o.historikk[0].bilder.length, 1); assert.ok(o.historikk[0].bilder[0].path && !o.historikk[0].bilder[0].lokal, 'bildet skal være lastet opp');
    assert.equal(o.historikk[0].dokId, d.dokumenter[0].id); assert.ok(o.nesteFrist > '2026-06-01', 'neste frist flyttet'); assert.deepEqual(a.feil, []);
  } finally { await a.lukk(); }
});

test('Innstillinger viser kortet for push-varsler', async () => {
  const a = await aapne('#/innstillinger'); try {
    await a.side.waitForTimeout(600); if (a.feil.length) assert.fail(a.feil[0]);
    assert.ok((await tekst(a)).includes('Varsler på denne enheten'), 'kortet for push-varsler mangler');
  } finally { await a.lukk(); }
});

test('mobil: bunnmeny med fem knapper, Mer-siden med søk og fliser', async () => {
  const a = await aapne('#/oversikt', { mobil: true }); try {
    await a.side.waitForTimeout(500);
    assert.equal(await a.side.locator('#bunnmeny .bm').count(), 5, 'forventet fem knapper i bunnmenyen');
    assert.ok(await a.side.locator('#bunnmeny').isVisible(), 'bunnmenyen er skjult');
    assert.ok(!(await a.side.locator('#side').isVisible()), 'sidemenyen skal være skjult på mobil');
    assert.ok(await a.side.locator('.mob-snarvei .ms').first().isVisible(), 'snarveiknappene mangler på forsiden');
    await a.side.locator('#bunnmeny a[href="#/mer"]').click(); await a.side.waitForTimeout(400);
    assert.ok(await a.side.locator('.mer-flis').count() >= 4, 'Mer-siden mangler fliser');
    await a.side.locator('.mer-sok').fill('måler'); await a.side.waitForTimeout(200);
    assert.ok(await a.side.locator('.mer-flis', { hasText: 'Målere' }).count() === 1, 'søk etter «måler» fant ikke Målere');
    await a.side.locator('.mer-flis', { hasText: 'Målere' }).first().click(); await a.side.waitForTimeout(400);
    assert.ok((await a.side.evaluate(() => location.hash)).includes('maalere'), 'flisen åpnet ikke Målere');
    if (a.feil.length) assert.fail(a.feil[0]);
  } finally { await a.lukk(); }
});
test('PC: sidemenyen vises og bunnmenyen er skjult', async () => {
  const a = await aapne('#/oversikt'); try {
    await a.side.waitForTimeout(400);
    assert.ok(await a.side.locator('#side').isVisible()); assert.ok(!(await a.side.locator('#bunnmeny').isVisible()));
  } finally { await a.lukk(); }
});

test('lenke fra e-post (nytt passord): knapp først, koden brukes først ved trykk', async () => {
  const a = await aapne('#token_hash=abc123&type=recovery'); try {
    await a.side.waitForTimeout(500);
    assert.ok(await a.side.getByRole('button', { name: 'Fortsett' }).isVisible(), 'knappen «Fortsett» mangler');
    assert.ok((await tekst(a)).includes('Nytt passord'));
    if (a.feil.length) assert.fail(a.feil[0]);
  } finally { await a.lukk(); }
});

test('gårdeier: egen meny uten redigering, rollenavn vises, mobilmeny uten «Nytt avvik»-knapper', async () => {
  const a = await aapne('#/oversikt', { lager: { mockRolle: 'gardeier' }, mobil: true }); try {
    await a.side.waitForTimeout(600); if (a.feil.length) assert.fail(a.feil[0]);
    const knapper = (await a.side.locator('#bunnmeny .bm-tekst').allInnerTexts()).join('|');
    assert.equal(knapper, 'Oversikt|Avvik|Kontroll|Dokumenter|Mer', 'feil knapper i gårdeierens bunnmeny: ' + knapper);
    assert.equal(await a.side.locator('.mob-snarvei').count(), 0, 'gårdeier skal ikke ha snarveier for å registrere');
    await a.side.evaluate(() => { location.hash = '#/profil'; }); await a.side.waitForTimeout(500);
    const t = await tekst(a); assert.ok(t.includes('Gårdeier'), 'rollen «Gårdeier» vises ikke i profilen');
    assert.ok(t.includes('Varsler på denne enheten'), 'varselkortet mangler i profilen');
  } finally { await a.lukk(); }
});

test('diktering: mikrofonknapper i avviksskjemaet legger talt tekst inn i feltene', async () => {
  const a = await aapne('#/avvik'); try {
    await a.side.evaluate(() => {
      (window as any).SpeechRecognition = class { lang = ''; onresult: any; onend: any; onerror: any;
        start() { setTimeout(() => { this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: 'hull i veggen ved trapp' }], { isFinal: true })] }); }, 30); }
        stop() { setTimeout(() => this.onend?.(), 10); } };
    });
    await a.side.getByRole('button', { name: /Meld avvik|Nytt avvik|\+ Avvik/ }).first().click();
    const m = a.side.locator('.modal'); await m.locator('button.diktat').first().waitFor({ timeout: 8000 });
    assert.equal(await m.locator('button.diktat').count(), 4, 'forventet dikteringsknapp ved kort beskrivelse, beskrivelse, plassering og kommentar');
    await m.locator('button.diktat').first().click(); await a.side.waitForTimeout(600);
    assert.equal(await m.locator('input[type=text], input:not([type])').first().inputValue(), 'Hull i veggen ved trapp');
    await m.locator('button.diktat').nth(1).click(); await a.side.waitForTimeout(600);
    assert.ok((await m.locator('textarea').first().inputValue()).toLowerCase().includes('hull i veggen ved trapp'));
    if (a.feil.length) assert.fail(a.feil[0]);
  } finally { await a.lukk(); }
});

test('beredskap: fanen viser plan, standardrisikoer og lagrer en vurdering', async () => {
  const a = await aapne('#/eiendom/e1'); try {
    await a.side.locator('.tabs a', { hasText: 'Beredskap' }).click();
    await a.side.getByRole('button', { name: /Legg til standardrisikoer/ }).click();
    await a.side.waitForTimeout(600);
    assert.ok(await a.side.locator('tbody tr', { hasText: 'Vannlekkasje' }).count() >= 1, 'standardrisikoene mangler');
    await a.side.locator('tbody tr', { hasText: 'Vannlekkasje' }).getByRole('button', { name: /Rediger/ }).click();
    const m = a.side.locator('.modal');
    await m.locator('select').nth(1).selectOption('4'); await m.locator('select').nth(2).selectOption('4');
    await m.getByRole('button', { name: /Lagre/ }).click(); await a.side.waitForTimeout(600);
    assert.ok(await a.side.locator('tbody tr', { hasText: 'Vannlekkasje' }).getByText(/Høy 16/).count() >= 1, 'forventet høy risiko 16');
    if (a.feil.length) assert.fail(a.feil[0]);
  } finally { await a.lukk(); }
});

test('gårdeier: «+ Ny eiendom» vises bare når administrator har slått på valget', async () => {
  const uten = await aapne('#/eiendommer', { lager: { mockRolle: 'gardeier' } }); try {
    assert.equal(await uten.side.getByRole('button', { name: /\+ Ny eiendom/ }).count(), 0, 'gårdeier uten valget skal ikke kunne opprette bygg');
  } finally { await uten.lukk(); }
  const med = await aapne('#/eiendommer', { lager: { mockRolle: 'gardeier', mockGardeierOpprett: '1' } }); try {
    assert.equal(await med.side.getByRole('button', { name: /\+ Ny eiendom/ }).count(), 1, 'gårdeier med valget skal få «+ Ny eiendom»');
    if (med.feil.length) assert.fail(med.feil[0]);
  } finally { await med.lukk(); }
});

test('gårdeier som kan opprette bygg: full meny med snarveier og redigering', async () => {
  const a = await aapne('#/oversikt', { lager: { mockRolle: 'gardeier', mockGardeierOpprett: '1' }, mobil: true }); try {
    const knapper = (await a.side.locator('#bunnmeny .bm').allInnerTexts()).map(t => t.trim().split('\n')[0]).join('|');
    assert.equal(knapper, 'Oversikt|Kontroll|Avvik|Eiendommer|Mer', 'feil knapper: ' + knapper);
    assert.ok(await a.side.locator('.mob-snarvei').count() >= 1, 'forventet snarveier for gårdeier med byggrett');
    await a.side.goto(a.side.url().split('#')[0] + '#/mer'); await a.side.waitForTimeout(500);
    assert.ok(await a.side.locator('a[href="#/leietakere"]').count() >= 1, 'Leietakere mangler i menyen');
    assert.equal(await a.side.locator('a[href="#/innstillinger"]').count(), 0, 'Innstillinger skal ikke vises for gårdeier');
    if (a.feil.length) assert.fail(a.feil[0]);
  } finally { await a.lukk(); }
});

test('dokumenter: flere filer lastes opp samtidig, og flere dokumenter kan ligge under samme type', async () => {
  const a = await aapne('#/dokumenter'); try {
    await a.side.getByRole('button', { name: /Last opp flere filer/ }).click();
    const m = a.side.locator('.modal');
    await m.locator('select').first().selectOption({ label: 'Testgården' });
    await m.locator('select').nth(1).selectOption('Annet');
    const f = (navn: string) => ({ name: navn, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 ' + navn) });
    await m.locator('input[type=file]').setInputFiles([f('Brannrapport_2026.pdf'), f('Tegning 1.pdf'), f('Tegning 2.pdf')]);
    assert.equal(await m.locator('tbody tr').count(), 3, 'alle tre filene skal stå i listen');
    assert.equal(await m.locator('tbody input').first().inputValue(), 'Brannrapport 2026', 'tittelen foreslås fra filnavnet');
    await m.getByRole('button', { name: /Last opp 3 filer/ }).click();
    await m.getByText('Lagret', { exact: true }).nth(2).waitFor({ timeout: 8000 });
    assert.equal(await m.getByText('Lagret', { exact: true }).count(), 3);
    await m.getByRole('button', { name: /^Ferdig$/ }).click(); await a.side.waitForTimeout(400);
    for (const t of ['Brannrapport 2026', 'Tegning 1', 'Tegning 2']) assert.ok(await a.side.locator('#main').getByText(t).count() >= 1, `«${t}» mangler i dokumentlisten`);
    if (a.feil.length) assert.fail(a.feil[0]);
  } finally { await a.lukk(); }
});

test('dokumentdekning: «+ flere» legger til flere dokumenter av samme type, og cellen viser antallet', async () => {
  const a = await aapne('#/dokumenter'); try {
    await a.side.locator('.matrix a', { hasText: '+ flere' }).first().click();
    const m = a.side.locator('.modal');
    assert.ok((await m.locator('select').first().inputValue()) !== '', 'eiendommen skal være valgt på forhånd');
    const f = (navn: string) => ({ name: navn, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 ' + navn) });
    await m.locator('input[type=file]').setInputFiles([f('Ferdigattest del 1.pdf'), f('Ferdigattest del 2.pdf')]);
    await m.getByRole('button', { name: /Last opp 2 filer/ }).click();
    await m.getByText('Lagret', { exact: true }).nth(1).waitFor({ timeout: 8000 });
    await m.getByRole('button', { name: /^Ferdig$/ }).click(); await a.side.waitForTimeout(400);
    assert.ok(await a.side.locator('.matrix').getByText('×2').count() >= 1, 'cellen skal vise ×2');
    await a.side.locator('.matrix td', { hasText: '×2' }).locator('.dot').click(); await a.side.waitForTimeout(300);
    const l = a.side.locator('.modal');
    assert.ok(await l.getByText('Ferdigattest del 1', { exact: true }).count() === 1 && await l.getByText('Ferdigattest del 2', { exact: true }).count() === 1, 'listen skal vise begge dokumentene');
    if (a.feil.length) assert.fail(a.feil[0]);
  } finally { await a.lukk(); }
});

test('chat: ny samtale er intern som standard, og «Fellesmelding» kan åpnes', async () => {
  const data = grunndata(); data.leietakere = [{ id: 'l1', eiendom_id: 'e1', created_at: NAA, data: { eiendomId: 'e1', navn: 'Firma AS' } }];
  const a = await aapne('#/meldinger', { data }); try {
    await a.side.getByRole('button', { name: 'Ny samtale' }).click();
    const m = a.side.locator('.modal'); await m.locator('#f_lt').selectOption('l1', { force: true });
    await m.getByRole('button', { name: /Åpne samtale/ }).click(); await a.side.waitForTimeout(500);
    const s = a.side.locator('.modal').last();
    assert.ok(await s.getByText(/Bare internt – leietaker ser ikke denne meldingen/).count() === 1, 'standardvalget skal være intern');
    assert.equal(await s.locator('select').first().inputValue(), 'intern');
    await a.side.keyboard.press('Escape'); await a.side.waitForTimeout(200);
    await a.side.getByRole('button', { name: 'Fellesmelding', exact: true }).click(); await a.side.waitForTimeout(400);
    assert.ok(await a.side.locator('.modal').getByText('Fellesmelding til leietakere').count() >= 1);
    if (a.feil.length) assert.fail(a.feil[0]);
  } finally { await a.lukk(); }
});

test('chat: «Ny samtale» med flere leietakere starter på «Velg leietaker», og valget blir med', async () => {
  const data = grunndata(); data.leietakere = [
    { id: 'l1', eiendom_id: 'e1', created_at: NAA, data: { eiendomId: 'e1', navn: 'Firma AS' } },
    { id: 'l2', eiendom_id: 'e1', created_at: NAA, data: { eiendomId: 'e1', navn: 'Bedrift AS' } }];
  const a = await aapne('#/meldinger', { data }); try {
    await a.side.getByRole('button', { name: 'Ny samtale' }).click();
    const m = a.side.locator('.modal');
    assert.equal(await m.locator('#f_lt').inputValue(), '', 'ingen leietaker skal se valgt ut før man velger');
    assert.equal(await m.locator('#f_lt option:checked').textContent(), 'Velg leietaker …');
    await m.locator('#f_lt').selectOption('l1', { force: true });
    await m.getByRole('button', { name: /Åpne samtale/ }).click(); await a.side.waitForTimeout(500);
    assert.ok(await a.side.locator('.modal').last().getByText(/Bare internt/).count() === 1, 'samtalen skal åpnes');
    if (a.feil.length) assert.fail(a.feil[0]);
  } finally { await a.lukk(); }
});

test('brannvern: «Forhåndsvis pakke» viser PDF-en i et vindu i appen', async () => {
  const data = grunndata(); data.eiendommer[0].data.brannvern = { versjon: 1, alarm: 'Heldekkende brannalarm', oppstilling: 'Parkeringen' };
  data.leietakere = [{ id: 'l1', eiendom_id: 'e1', created_at: NAA, data: { eiendomId: 'e1', navn: 'Firma AS' } }];
  const a = await aapne('#/leietaker/l1', { data }); try {
    await a.side.getByRole('button', { name: /Forhåndsvis pakke/ }).click();
    await a.side.locator('.modal iframe').waitFor({ timeout: 15000 });
    assert.match(await a.side.locator('.modal iframe').getAttribute('src') || '', /^blob:/);
    assert.ok(await a.side.locator('.modal').getByText('Åpne i ny fane').count() >= 1);
    if (a.feil.length) assert.fail(a.feil[0]);
  } finally { await a.lukk(); }
});

test('Hjelp: systemkartet vises, og bryteren slår automatikk av og på i innstillingene', async () => {
  const a = await aapne('#/hjelp'); try {
    await a.side.waitForTimeout(500); assert.ok((await tekst(a)).includes('Slik henger appen sammen'), 'kartet vises ikke');
    const br = a.side.getByRole('switch', { name: 'Chat-varsler' }); assert.equal(await br.getAttribute('aria-checked'), 'false');
    await br.click(); await a.side.waitForTimeout(600); assert.equal(await br.getAttribute('aria-checked'), 'true');
    assert.equal((await a.db()).innstillinger.find((x: any) => x.nokkel === 'chatVarsel')?.data.pa, true, 'innstillingen ble ikke lagret');
    await br.click(); await a.side.waitForTimeout(600); assert.equal(await br.getAttribute('aria-checked'), 'false'); assert.deepEqual(a.feil, []);
  } finally { await a.lukk(); }
});

test('Dokumenter og eiendom åpner når FDV-dokumentasjonen bare dekker noen av systemene (status «delvis»)', async () => {
  const d: any = grunndata(); d.systemer.push({ id: 's2', eiendom_id: 'e1', created_at: NAA, data: { eiendomId: 'e1', navn: 'Ventilasjon', type: 'ventilasjon' } });
  d.dokumenter = [{ id: 'd1', eiendom_id: 'e1', created_at: NAA, data: { eiendomId: 'e1', type: 'FDV-dokumentasjon', tittel: 'FDV brann', anleggId: 's1' } }];
  const a = await aapne('#/eiendom/e1', { data: d }); try {
    await gaaGjennom(a, ['eiendom/e1', 'dokumenter', 'eiendommer']); assert.ok((await tekst(a)).length > 50);
  } finally { await a.lukk(); }
});

test('Organisasjon og tilgang: «Testleietakere» åpner dialogen for testbrukere', async () => {
  const a = await aapne('#/brukere'); try {
    await a.side.getByRole('button', { name: 'Testleietakere' }).click(); await a.side.waitForTimeout(400);
    const t = await tekst(a); assert.ok(t.includes('Oppretter tre leietakerbrukere') && t.includes('Opprett testbrukere'), 'dialogen mangler'); assert.deepEqual(a.feil, []);
  } finally { await a.lukk(); }
});
