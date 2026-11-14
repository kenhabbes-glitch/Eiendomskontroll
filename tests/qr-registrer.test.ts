// Tester de to åpne inngangene som ikke krever innlogging i det hele tatt:
// melding via QR-kode (netlify/functions/qr-meld.ts) og registrering av ny kunde (netlify/functions/registrer.ts).
import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { lagFalsk, type Db } from './falsk-supabase.ts';

let falsk: ReturnType<typeof lagFalsk>;
mock.module('@supabase/supabase-js', { namedExports: { createClient: () => falsk.klient } });
process.env.SUPABASE_URL = 'http://test'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'test';
const { default: qr } = await import('../netlify/functions/qr-meld.ts');
const { default: registrer } = await import('../netlify/functions/registrer.ts');
const post = async (fn: any, body: any) => { const r = await fn(new Request('http://x/', { method: 'POST', body: JSON.stringify(body) })); return { status: r.status, ...(await r.json()) }; };

const TOK = 'meldepunkt-token-0123456789', AV = 'avslaatt-token-0123456789abc'; let db: Db; const naa = () => new Date().toISOString();
const gjort = (hva: string) => falsk.kall.filter(k => k.hva === hva);
let brreg: any; const ekteFetch = globalThis.fetch;
beforeEach(() => {
  db = {
    eiendommer: [{ id: 'e1', data: { navn: 'Bygg 1' } }],
    qr_punkter: [{ id: 'q1', token: TOK, eiendom_id: 'e1', navn: 'Inngang A', data: { sted: '1. etasje', systemId: 's1' } }, { id: 'q2', token: AV, eiendom_id: 'e1', navn: 'Gammel', data: { aktiv: false } }],
    avvik: [], organisasjoner: [{ id: 'o1', navn: 'Finnes AS', orgnr: '111111111', aktiv: true, data: {} }], profiles: [{ id: 'u1', epost: 'finnes@firma.no' }], org_medlem: [], org_modul: [], hendelseslogg: [],
  };
  falsk = lagFalsk(db, {}, {});
  brreg = { status: 200, body: { navn: 'NYTT FIRMA AS', organisasjonsform: { beskrivelse: 'Aksjeselskap' } } };
  globalThis.fetch = (async (u: any) => String(u).includes('brreg.no') ? new Response(JSON.stringify(brreg.body), { status: brreg.status }) : ekteFetch(u)) as any;
  process.env.SELVREGISTRERING = 'på';
});

// ---------------- QR-melding
test('QR: ukjent, feilformet og avslått meldepunkt gir ingenting', async () => {
  assert.equal((await post(qr, { t: 'kort', action: 'info' })).status, 404);
  assert.equal((await post(qr, { t: "x' or '1'='1-0123456789abcd", action: 'info' })).status, 404);
  assert.equal((await post(qr, { t: 'finnes-ikke-0123456789abcdef', action: 'meld', tittel: 'Hei hei' })).status, 404);
  assert.equal((await post(qr, { t: AV, action: 'meld', tittel: 'Hei hei' })).status, 404);
  assert.equal(db.avvik.length, 0);
});

test('QR: info gir bare navn på eiendom og sted', async () => {
  const r = await post(qr, { t: TOK, action: 'info' }); assert.deepEqual(r, { status: 200, eiendom: 'Bygg 1', navn: 'Inngang A', sted: '1. etasje' });
});

test('QR: melding blir et vanlig avvik med status Ny, og lange tekster kuttes', async () => {
  const r = await post(qr, { t: TOK, action: 'meld', tittel: 'Lekkasje ' + 'x'.repeat(500), beskrivelse: 'y'.repeat(5000), alv: 'Finnes ikke', navn: 'Kari', kontakt: '99999999', status: 'Lukket', eiendom_id: 'annen' });
  assert.equal(r.status, 200); const a = db.avvik[0];
  assert.equal(a.eiendom_id, 'e1'); assert.equal(a.data.status, 'Ny'); assert.equal(a.data.kilde, 'QR-melding'); assert.equal(a.data.alv, 'Middels'); assert.equal(a.data.qrId, 'q1'); assert.equal(a.data.anleggId, 's1');
  assert.equal(a.data.tittel.length, 150); assert.ok(a.data.beskrivelse.length <= 2000 + 40); assert.equal(a.data.meldtAv, 'Kari');
});

test('QR: for kort tittel avvises, og roboter (skjult felt utfylt) får «ok» uten at noe lagres', async () => {
  assert.equal((await post(qr, { t: TOK, action: 'meld', tittel: 'a' })).status, 400);
  const r = await post(qr, { t: TOK, action: 'meld', tittel: 'Kjøp billige klokker', nettside: 'http://spam' });
  assert.equal(r.status, 200); assert.equal(db.avvik.length, 0);
});

test('QR: bare bilder under 4 MB kan legges ved, og de havner i eiendommens egen mappe', async () => {
  const b64 = (n: number) => Buffer.alloc(n, 1).toString('base64');
  assert.equal((await post(qr, { t: TOK, action: 'meld', tittel: 'Med fil', fil: { type: 'application/pdf', b64: b64(100) } })).status, 400);
  assert.equal((await post(qr, { t: TOK, action: 'meld', tittel: 'Med fil', fil: { type: 'text/html', b64: b64(100) } })).status, 400);
  assert.equal((await post(qr, { t: TOK, action: 'meld', tittel: 'For stort', fil: { type: 'image/jpeg', b64: b64(4_100_000) } })).status, 400);
  assert.equal(gjort('opplasting').length, 0); assert.equal(db.avvik.length, 0);
  const r = await post(qr, { t: TOK, action: 'meld', tittel: 'Med bilde', fil: { type: 'image/png', b64: b64(2000), navn: '../../../etc/passwd' } });
  assert.equal(r.status, 200); const o = gjort('opplasting')[0].arg; assert.match(o.path, /^e1\/qr\/[0-9a-f-]{36}\.png$/); assert.equal(db.avvik[0].data.vedlegg[0].path, o.path);
});

test('QR: maks 15 meldinger i timen fra samme meldepunkt', async () => {
  for (let i = 0; i < 15; i++) db.avvik.push({ id: 'a' + i, eiendom_id: 'e1', created_at: naa(), data: { qrId: 'q1', kilde: 'QR-melding' } });
  assert.equal((await post(qr, { t: TOK, action: 'meld', tittel: 'En til' })).status, 429); assert.equal(db.avvik.length, 15);
  db.avvik.forEach(a => { a.created_at = new Date(Date.now() - 2 * 3600e3).toISOString(); }); // eldre enn en time teller ikke
  assert.equal((await post(qr, { t: TOK, action: 'meld', tittel: 'En til' })).status, 200);
});

// ---------------- Registrering av ny kunde
const NY = { orgnr: '999 888 777', navn: 'Ola Nordmann', epost: 'Ola@Nytt.no', samtykke: true, type: 'eier' };

test('registrering: avslått når den ikke er åpnet', async () => {
  process.env.SELVREGISTRERING = ''; assert.equal((await post(registrer, NY)).status, 503); assert.equal(db.organisasjoner.length, 1);
});

test('registrering: krever gyldig org.nr., navn, e-post og samtykke', async () => {
  assert.equal((await post(registrer, { ...NY, orgnr: '12345' })).status, 400);
  assert.equal((await post(registrer, { ...NY, navn: '' })).status, 400);
  assert.equal((await post(registrer, { ...NY, epost: 'ikke-epost' })).status, 400);
  assert.equal((await post(registrer, { ...NY, samtykke: 'true' })).status, 400);
  assert.equal(db.organisasjoner.length, 1); assert.equal(gjort('inviteUserByEmail').length, 0);
});

test('registrering: org.nr. må finnes i Enhetsregisteret og ikke være konkurs', async () => {
  brreg = { status: 404, body: {} }; assert.equal((await post(registrer, NY)).status, 400);
  brreg = { status: 200, body: { navn: 'KONK AS', konkurs: true } }; assert.equal((await post(registrer, NY)).status, 400);
  brreg = { status: 500, body: {} }; assert.equal((await post(registrer, NY)).status, 503);
  assert.equal(db.organisasjoner.length, 1);
});

test('registrering: organisasjon eller e-post som finnes fra før kan ikke registreres på nytt', async () => {
  assert.equal((await post(registrer, { ...NY, orgnr: '111111111' })).status, 409);
  assert.equal((await post(registrer, { ...NY, epost: 'finnes@firma.no' })).status, 409);
  assert.equal(db.organisasjoner.length, 1); assert.equal(gjort('inviteUserByEmail').length, 0);
});

test('registrering: ny kunde får organisasjon med navn fra Enhetsregisteret, invitasjon på e-post og administratorrolle', async () => {
  const r = await post(registrer, { ...NY, firma: 'Falskt Navn AS', rolle: 'plattform', plattform_admin: true, redirectTo: 'https://ond.side/steal?x=1' });
  assert.equal(r.status, 200); assert.equal(r.firmanavn, 'NYTT FIRMA AS');
  const o = db.organisasjoner[1]; assert.equal(o.orgnr, '999888777'); assert.equal(o.navn, 'NYTT FIRMA AS'); assert.equal(o.data.selvregistrert, true);
  const inv = gjort('inviteUserByEmail')[0].arg; assert.equal(inv.epost, 'ola@nytt.no'); assert.equal(inv.redirectTo, undefined); // bare rene https-adresser uten sti godtas
  const p = db.profiles.find(x => x.epost === 'ola@nytt.no'); assert.equal(p.rolle, 'ingen'); assert.equal(p.plattform_admin, undefined);
  const m = db.org_medlem[0]; assert.equal(m.org_id, o.id); assert.equal(m.user_id, p.id); assert.equal(m.rolle, 'admin');
});

test('registrering: feiler e-postutsendingen, ryddes organisasjonen bort igjen', async () => {
  falsk = lagFalsk(db, {}, {}, { invitasjonFeiler: { status: 500, message: 'smtp nede' } });
  const r = await post(registrer, NY); assert.equal(r.status, 502); assert.equal(db.organisasjoner.length, 1); assert.equal(db.org_medlem.length, 0);
});

test('registrering: maks 10 nye kunder i timen, og roboter får «ok» uten at noe opprettes', async () => {
  assert.equal((await post(registrer, { ...NY, nettside: 'spam' })).status, 200); assert.equal(db.organisasjoner.length, 1);
  for (let i = 0; i < 10; i++) db.organisasjoner.push({ id: 'n' + i, orgnr: '2000000' + (10 + i), opprettet: naa(), data: { selvregistrert: true } });
  assert.equal((await post(registrer, NY)).status, 429); assert.equal(gjort('inviteUserByEmail').length, 0);
});
