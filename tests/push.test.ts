// Push-varsler: påmelding, test, opprydding av døde enheter og varsel ved kritisk QR-melding.
import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { lagFalsk, type Db } from './falsk-supabase.ts';

let falsk: ReturnType<typeof lagFalsk>; let sendt: any[] = []; let svar: Record<string, number> = {};
mock.module('@supabase/supabase-js', { namedExports: { createClient: () => falsk.klient } });
mock.module('web-push', { namedExports: {
  generateVAPIDKeys: () => ({ publicKey: 'PUB', privateKey: 'PRIV' }),
  sendNotification: async (s: any, last: string, o: any) => { sendt.push({ endpoint: s.endpoint, last: JSON.parse(last), nokkel: o.vapidDetails.publicKey }); if (svar[s.endpoint]) throw Object.assign(new Error('x'), { statusCode: svar[s.endpoint] }); },
} });
process.env.SUPABASE_URL = 'http://test'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'test';
const { default: push } = await import('./.bygg/push.mjs');
const { default: qr } = await import('./.bygg/qr-meld.mjs');
const post = async (fn: any, body: any, token = 'tok-admin') => { const r = await fn(new Request('http://x/', { method: 'POST', headers: { authorization: 'Bearer ' + token }, body: JSON.stringify(body) })); return { status: r.status, ...(await r.json()) }; };
const ABO = { endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } };
let db: Db;
beforeEach(() => {
  sendt = []; svar = {};
  db = { eiendommer: [{ id: 'e1', eier_org_id: 'o1', data: { navn: 'Bygg 1' } }], org_medlem: [{ org_id: 'o1', user_id: 'u1', rolle: 'admin', aktiv: true }, { org_id: 'o1', user_id: 'u2', rolle: 'utforer', aktiv: true }],
    push_abonnement: [], push_noekler: [], avvik: [], hendelseslogg: [], profiles: [{ id: 'u1', aktiv: true, rolle: 'admin' }],
    qr_punkter: [{ id: 'q1', token: 'meldepunkt-token-0123456789', eiendom_id: 'e1', navn: 'Inngang A', data: {} }] };
  falsk = lagFalsk(db, { u1: { id: 'u1', email: 'a@b.no' } }, { 'tok-admin': 'u1' });
});

test('Push: krever innlogging, og nøkkelen lages én gang', async () => {
  assert.equal((await post(push, { action: 'nokkel' }, 'feil')).status, 401);
  const a = await post(push, { action: 'nokkel' }); const b = await post(push, { action: 'nokkel' });
  assert.equal(a.nokkel, 'PUB'); assert.equal(b.nokkel, 'PUB'); assert.equal(db.push_noekler.length, 1);
});
test('Push: påmelding, endring av typer, test og avmelding', async () => {
  assert.equal((await post(push, { action: 'abonner', abonnement: { endpoint: 'http://usikker', keys: ABO.keys } })).status, 400);
  await post(push, { action: 'abonner', abonnement: ABO, typer: ['kritisk', 'ugyldig'], enhet: 'PC' });
  assert.deepEqual(db.push_abonnement[0].typer, ['kritisk']);
  await post(push, { action: 'abonner', abonnement: ABO, typer: ['kritisk', 'melding'] }); assert.equal(db.push_abonnement.length, 1);
  assert.equal((await post(push, { action: 'test' })).sendt, 1); assert.equal(sendt[0].last.tekst, 'Varsler fungerer på denne enheten.');
  await post(push, { action: 'avslutt', endpoint: ABO.endpoint }); assert.equal(db.push_abonnement.length, 0);
});
test('Push: enheter som ikke finnes lenger fjernes', async () => {
  await post(push, { action: 'abonner', abonnement: ABO, typer: ['melding'] }); svar[ABO.endpoint] = 410;
  assert.equal((await post(push, { action: 'test' })).sendt, 0); assert.equal(db.push_abonnement.length, 0);
});
test('Push: kritisk QR-melding varsler administratorer som har slått på kritisk, andre ikke', async () => {
  await post(push, { action: 'abonner', abonnement: ABO, typer: ['kritisk'] });
  db.push_abonnement.push({ id: 'x', user_id: 'u2', endpoint: 'https://push.example/u2', p256dh: 'p', auth: 'a', typer: ['kritisk'] }); // utfører: skal ikke varsles
  const r = await post(qr, { t: 'meldepunkt-token-0123456789', action: 'meld', tittel: 'Det ryker fra tavlen', beskrivelse: '', alv: 'Lav' }, '');
  assert.equal(r.status, 200); assert.equal(sendt.length, 1); assert.equal(sendt[0].endpoint, ABO.endpoint); assert.match(sendt[0].last.tittel, /^KRITISK/);
  sendt = []; await post(qr, { t: 'meldepunkt-token-0123456789', action: 'meld', tittel: 'Pære er ødelagt', beskrivelse: '', alv: 'Lav' }, ''); assert.equal(sendt.length, 0); // bare «kritisk» er på
});
