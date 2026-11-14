// Skjermbildetester for arbeidsordre – hele veien: skjermbildet i nettleseren kaller den ekte serverfunksjonen
// (netlify/functions/arbeidsordre.ts), som her jobber mot en etterligning av databasen.
import { test, mock, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { lagFalsk, type Db } from '../falsk-supabase.ts';
import { start, stopp, aapne, grunndata } from './hjelp.ts';

let falsk: ReturnType<typeof lagFalsk>; let db: Db;
mock.module('@supabase/supabase-js', { namedExports: { createClient: () => falsk.klient } });
process.env.SUPABASE_URL = 'http://test'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'k';
// @ts-ignore – bygges av «pretest»
const { default: ao } = await import('../.bygg/arbeidsordre.mjs');
before(() => start({ arbeidsordre: ao })); after(stopp);

const OK = '11111111-1111-4111-8111-111111111111', UTLOPT = '22222222-2222-4222-8222-222222222222';
const dager = (n: number) => new Date(Date.now() + n * 864e5).toISOString();
beforeEach(() => {
  db = { organisasjoner: [{ id: 'org1', navn: 'Eier AS', aktiv: true }], eiendommer: [{ id: 'e1', eier_org_id: 'org1', data: { navn: 'Testgården', adresse: 'Storgata 1' } }, { id: 'e2', eier_org_id: 'org1', data: { navn: 'Annet bygg' } }],
    profiles: [{ id: 'u-me', epost: 'test@example.no', navn: 'Test Bruker', aktiv: true, rolle: 'admin' }], org_medlem: [],
    avvik: [{ id: 'a1', nr: 7, eiendom_id: 'e1', tildelt_id: null, data: { tittel: 'Lekkasje i teknisk rom', status: 'Ny', alv: 'Høy', beskrivelse: 'Drypp fra rør', logg: [] } }],
    ao_invitasjon: [{ token: OK, avvik_id: 'a1', epost: 'ror@firma.no', utloper: dager(7), opprettet_av: 'u-me' }, { token: UTLOPT, avvik_id: 'a1', epost: 'ror@firma.no', utloper: dager(-1), opprettet_av: 'u-me' }],
    hendelseslogg: [], epost_oppsett: [], systemer: [], komponenter: [], innstillinger: [], tegninger: [] };
  falsk = lagFalsk(db, { 'u-me': { id: 'u-me', email: 'test@example.no' } }, { x: 'u-me' }, { niva: { 'u-me': { e1: 'skriv' } } });
});
const utlogget = { lager: { mockLogout: '1' }, data: {} };
const tekst = (a: any) => a.side.locator('#root').innerText();

test('ekstern utfører åpner lenken, ser arbeidsordren og kvitterer ut uten bruker', async () => {
  const a = await aapne('#/ao/' + OK, utlogget); try {
    await a.side.waitForSelector('text=Avvik #7: Lekkasje i teknisk rom'); const t = await tekst(a);
    assert.ok(t.includes('Eier AS') && t.includes('Drypp fra rør')); assert.ok(!t.includes('Annet bygg'));
    const knapp = a.side.getByRole('button', { name: /Kvitter ut/ }); assert.equal(await knapp.isDisabled(), true, 'kan ikke kvittere før personvern er godtatt');
    await a.side.locator('form input').nth(0).fill('Ola Rørlegger'); await a.side.locator('form textarea').fill('Byttet pakning og trykktestet.');
    await a.side.locator('form input[type=checkbox]').check(); await knapp.click(); await a.side.waitForSelector('text=Takk – arbeidsordren er kvittert ut.');
    const av = db.avvik[0]; assert.equal(av.data.status, 'Utført – til kontroll'); assert.equal(av.data.utfort.av, 'Ola Rørlegger'); assert.equal(av.data.utfort.komm, 'Byttet pakning og trykktestet.');
    assert.ok(db.ao_invitasjon[0].kvittert, 'invitasjonen er ikke merket kvittert'); assert.deepEqual(a.feil, []);
  } finally { await a.lukk(); }
});

test('lenke som allerede er kvittert viser takk, og kan ikke kvitteres en gang til', async () => {
  db.ao_invitasjon[0].kvittert = dager(-1);
  const a = await aapne('#/ao/' + OK, utlogget); try {
    await a.side.waitForSelector('text=Takk – arbeidsordren er kvittert ut.'); assert.equal(await a.side.getByRole('button', { name: /Kvitter ut/ }).count(), 0);
  } finally { await a.lukk(); }
});

test('utløpt og ukjent lenke: «Lenken virker ikke», og ingenting om avviket vises', async () => {
  for (const tok of [UTLOPT, '99999999-9999-4999-8999-999999999999']) { const a = await aapne('#/ao/' + tok, utlogget); try {
    await a.side.waitForSelector('text=Lenken virker ikke'); assert.ok(!(await tekst(a)).includes('Lekkasje'), 'avviket vises på en ugyldig lenke');
  } finally { await a.lukk(); } }
});

test('ekstern utfører kan opprette bruker fra lenken, med krav til passord', async () => {
  const a = await aapne('#/ao/' + OK, utlogget); try {
    await a.side.waitForSelector('text=Avvik #7'); await a.side.getByRole('link', { name: 'Opprett bruker' }).click();
    const f = a.side.locator('form'); assert.equal(await f.locator('input[readonly]').inputValue(), 'ror@firma.no', 'e-posten skal være låst til invitasjonen');
    await f.locator('input').nth(1).fill('Ola Rørlegger'); await f.locator('input[type=password]').nth(0).fill('kort'); await f.locator('input[type=password]').nth(1).fill('kort');
    await f.locator('input[type=checkbox]').check(); await f.getByRole('button', { name: /Opprett bruker/ }).click(); await a.side.waitForTimeout(500);
    assert.equal(falsk.kall.filter(k => k.hva === 'createUser').length, 0, 'svakt passord ble godtatt');
    await f.locator('input[type=password]').nth(0).fill('Sterkt-Passord-123'); await f.locator('input[type=password]').nth(1).fill('Sterkt-Passord-123');
    await f.getByRole('button', { name: /Opprett bruker/ }).click(); await a.side.waitForTimeout(1200);
    const laget = falsk.kall.filter(k => k.hva === 'createUser'); assert.equal(laget.length, 1); assert.equal(laget[0].arg.email, 'ror@firma.no');
    const ny = db.profiles.find(p => p.epost === 'ror@firma.no'); assert.equal(ny.rolle, 'utforer'); assert.equal(db.avvik[0].tildelt_id, ny.id);
  } finally { await a.lukk(); }
});

test('sende arbeidsordre fra et avvik – og mottakeren kan åpne lenken som blir laget', async () => {
  db.ao_invitasjon = []; const d = grunndata(); d.avvik[0].nr = 7;
  const a = await aapne('#/avvik', { data: d }); let lenke = ''; try {
    await a.side.locator('text=Løs himlingsplate').first().click(); await a.side.getByRole('button', { name: 'Send på e-post' }).click();
    await a.side.waitForSelector('text=Send arbeidsordre på e-post'); const m = a.side.locator('.modal').last(); await m.locator('input[type=email]').fill('ror@firma.no'); await m.getByRole('button', { name: 'Send' }).click();
    await a.side.waitForSelector('text=Lenke:'); const t = await a.side.locator('.modal').last().innerText();
    lenke = (t.match(/#\/ao\/[0-9a-f-]{36}/) || [''])[0]; assert.ok(lenke, 'fant ingen lenke i svaret: ' + t.slice(0, 200));
    assert.equal(db.ao_invitasjon.length, 1); assert.equal(db.ao_invitasjon[0].epost, 'ror@firma.no'); assert.equal(db.ao_invitasjon[0].avvik_id, 'a1'); assert.equal(db.ao_invitasjon[0].opprettet_av, 'u-me');
    assert.ok(new Date(db.ao_invitasjon[0].utloper).getTime() > Date.now(), 'invitasjonen har ingen utløpsdato fram i tid'); assert.deepEqual(a.feil, []);
  } finally { await a.lukk(); }
  const b = await aapne(lenke, utlogget); try { await b.side.waitForSelector('text=Avvik #7: Lekkasje i teknisk rom'); } finally { await b.lukk(); }
});

test('arbeidsordre kan ikke sendes for en eiendom brukeren ikke har tilgang til', async () => {
  db.ao_invitasjon = []; db.avvik.push({ id: 'a9', nr: 9, eiendom_id: 'e2', data: { tittel: 'Annet bygg', status: 'Ny' } });
  const d = grunndata(); d.avvik = [{ ...d.avvik[0], id: 'a9', nr: 9 }];
  const a = await aapne('#/avvik', { data: d }); try {
    await a.side.locator('text=Løs himlingsplate').first().click(); await a.side.getByRole('button', { name: 'Send på e-post' }).click();
    await a.side.waitForSelector('text=Send arbeidsordre på e-post'); const m = a.side.locator('.modal').last(); await m.locator('input[type=email]').fill('ror@firma.no'); await m.getByRole('button', { name: 'Send' }).click(); await a.side.waitForTimeout(1200);
    assert.equal(db.ao_invitasjon.length, 0, 'serveren laget en invitasjon uten tilgang'); assert.ok(!(await a.side.locator('body').innerText()).includes('Lenke: http'));
  } finally { await a.lukk(); }
});
