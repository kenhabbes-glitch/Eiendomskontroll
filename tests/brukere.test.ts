// Tester tilgangskontrollen i brukeradministrasjonen (netlify/functions/brukere.ts).
// Viktigst: en administrator i én organisasjon skal aldri kunne overta en bruker som også tilhører andre.
import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { lagFalsk, type Db } from './falsk-supabase.ts';

let falsk: ReturnType<typeof lagFalsk>;
mock.module('@supabase/supabase-js', { namedExports: { createClient: () => falsk.klient } });
process.env.SUPABASE_URL = 'http://test'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'test';
const { default: brukere } = await import('../netlify/functions/brukere.ts');

const kall = async (token: string, body: any) => { const r = await brukere(new Request('http://x/', { method: 'POST', headers: { authorization: 'Bearer ' + token }, body: JSON.stringify(body) })); return { status: r.status, ...(await r.json()) }; };
const PW = 'Sterkt-Passord-123';

beforeEach(() => {
  const db: Db = {
    organisasjoner: [{ id: 'org1', navn: 'Angriper AS', aktiv: true }, { id: 'org2', navn: 'Offer AS', aktiv: true }],
    profiles: [
      { id: 'admin1', epost: 'admin@org1.no', navn: 'Admin 1', aktiv: true, plattform_admin: false, rolle: 'ingen' },
      { id: 'tekniker1', epost: 'tekniker@org1.no', navn: 'Tekniker 1', aktiv: true, plattform_admin: false, rolle: 'ingen' },
      { id: 'offer', epost: 'offer@org2.no', navn: 'Offer', aktiv: true, plattform_admin: false, rolle: 'ingen' },
      { id: 'sjef', epost: 'sjef@plattform.no', navn: 'Plattform', aktiv: true, plattform_admin: true, rolle: 'ingen' },
      { id: 'test1', epost: 'test@org1.no', navn: 'Test', aktiv: true, plattform_admin: false, rolle: 'ingen' },
      { id: 'test2', epost: 'test2@begge.no', navn: 'Test i to', aktiv: true, plattform_admin: false, rolle: 'ingen' },
    ],
    org_medlem: [
      { org_id: 'org1', user_id: 'admin1', rolle: 'admin', aktiv: true }, { org_id: 'org1', user_id: 'tekniker1', rolle: 'tekniker', aktiv: true },
      { org_id: 'org2', user_id: 'offer', rolle: 'admin', aktiv: true },
      { org_id: 'org1', user_id: 'test1', rolle: 'leser', aktiv: true },
      { org_id: 'org1', user_id: 'test2', rolle: 'leser', aktiv: true }, { org_id: 'org2', user_id: 'test2', rolle: 'leser', aktiv: true },
    ],
    epost_oppsett: [{ data: { testmodus: false } }], hendelseslogg: [], eiendom_tilgang: [], leietakere: [],
  };
  const B = (id: string, email: string, x: any = {}) => ({ id, email, ...x });
  falsk = lagFalsk(db, {
    admin1: B('admin1', 'admin@org1.no'), tekniker1: B('tekniker1', 'tekniker@org1.no'), offer: B('offer', 'offer@org2.no', { faktorer: ['f1'] }),
    sjef: B('sjef', 'sjef@plattform.no', { faktorer: ['f2'] }), test1: B('test1', 'test@org1.no', { user_metadata: { test: true }, faktorer: ['f3'] }),
    test2: B('test2', 'test2@begge.no', { user_metadata: { test: true } }),
  }, { 'tok-admin1': 'admin1', 'tok-tekniker1': 'tekniker1', 'tok-sjef': 'sjef' });
});
const passordEndret = () => falsk.kall.filter(k => k.hva === 'updateUserById' && k.arg.password);

test('uten innlogging: 401', async () => { assert.equal((await kall('feil', { action: 'inviter' })).status, 401); });

test('vanlig medlem kan ikke legge til brukere', async () => {
  const r = await kall('tok-tekniker1', { action: 'inviter', org_id: 'org1', epost: 'ny@x.no', rolle: 'leser' });
  assert.equal(r.status, 403); assert.equal(falsk.kall.length, 0);
});

test('administrator kan ikke legge til brukere i en annen organisasjon', async () => {
  const r = await kall('tok-admin1', { action: 'inviter', org_id: 'org2', epost: 'ny@x.no', rolle: 'admin' });
  assert.equal(r.status, 403);
});

test('KONTOOVERTAKELSE: passordet til en bruker i en annen organisasjon endres ikke', async () => {
  const r = await kall('tok-admin1', { action: 'testbruker', org_id: 'org1', epost: 'offer@org2.no', rolle: 'leser', passord: PW });
  assert.equal(r.status, 200); assert.equal(r.passordUendret, true); assert.equal(passordEndret().length, 0);
});

test('KONTOOVERTAKELSE: passordet til plattformadministrator endres ikke', async () => {
  const r = await kall('tok-admin1', { action: 'testbruker', org_id: 'org1', epost: 'sjef@plattform.no', rolle: 'leser', passord: PW });
  assert.equal(r.passordUendret, true); assert.equal(passordEndret().length, 0);
});

test('passordet til en vanlig (ikke-test) bruker i egen organisasjon endres heller ikke', async () => {
  const r = await kall('tok-admin1', { action: 'testbruker', org_id: 'org1', epost: 'tekniker@org1.no', rolle: 'tekniker', passord: PW });
  assert.equal(r.passordUendret, true); assert.equal(passordEndret().length, 0);
});

test('testbruker som bare finnes i egen organisasjon kan få nytt passord', async () => {
  const r = await kall('tok-admin1', { action: 'testbruker', org_id: 'org1', epost: 'test@org1.no', rolle: 'leser', passord: PW });
  assert.equal(r.status, 200); assert.equal(r.passordUendret, undefined); assert.equal(passordEndret().length, 1); assert.equal(passordEndret()[0].arg.id, 'test1');
});

test('testbruker som også er i en annen organisasjon får ikke nytt passord', async () => {
  const r = await kall('tok-admin1', { action: 'testbruker', org_id: 'org1', epost: 'test2@begge.no', rolle: 'leser', passord: PW });
  assert.equal(r.passordUendret, true); assert.equal(passordEndret().length, 0);
});

test('ny testbruker opprettes med passord, og svakt passord avvises', async () => {
  assert.equal((await kall('tok-admin1', { action: 'testbruker', org_id: 'org1', epost: 'ny@org1.no', rolle: 'leser', passord: 'kort' })).status, 400);
  const r = await kall('tok-admin1', { action: 'testbruker', org_id: 'org1', epost: 'ny@org1.no', rolle: 'leser', passord: PW });
  assert.equal(r.ny, true); assert.equal(falsk.kall.filter(k => k.hva === 'createUser').length, 1);
});

test('invitasjon av ny bruker sender e-post og gir medlemskap', async () => {
  const r = await kall('tok-admin1', { action: 'inviter', org_id: 'org1', epost: 'kollega@org1.no', navn: 'Kollega', rolle: 'tekniker' });
  assert.equal(r.status, 200); assert.equal(r.ny, true); assert.equal(falsk.kall.filter(k => k.hva === 'inviteUserByEmail').length, 1);
});

test('TOFAKTOR: kan ikke nullstilles for bruker som ikke er medlem', async () => {
  const r = await kall('tok-admin1', { action: 'mfa_nullstill', org_id: 'org1', user_id: 'offer' });
  assert.equal(r.status, 403); assert.equal(falsk.kall.filter(k => k.hva === 'deleteFactor').length, 0);
});

test('TOFAKTOR: kan ikke nullstilles av én organisasjon når brukeren tilhører flere', async () => {
  await kall('tok-admin1', { action: 'inviter', org_id: 'org1', epost: 'offer@org2.no', rolle: 'leser' }); // angriperen melder først offeret inn hos seg
  const r = await kall('tok-admin1', { action: 'mfa_nullstill', org_id: 'org1', user_id: 'offer' });
  assert.equal(r.status, 403); assert.equal(falsk.kall.filter(k => k.hva === 'deleteFactor').length, 0);
});

test('TOFAKTOR: administrator kan nullstille for medlem som bare er i egen organisasjon', async () => {
  const r = await kall('tok-admin1', { action: 'mfa_nullstill', org_id: 'org1', user_id: 'test1' });
  assert.equal(r.status, 200); assert.equal(r.fjernet, 1);
});

test('TOFAKTOR: plattformadministrator kan nullstille for alle', async () => {
  const r = await kall('tok-sjef', { action: 'mfa_nullstill', user_id: 'offer' });
  assert.equal(r.status, 200); assert.equal(r.fjernet, 1);
});

test('bare plattformadministrator kan slette brukere og opprette organisasjoner', async () => {
  assert.equal((await kall('tok-admin1', { action: 'slett', user_id: 'offer' })).status, 403);
  assert.equal((await kall('tok-admin1', { action: 'ny_org', navn: 'X', admin_epost: 'a@b.no' })).status, 403);
});
