// Tester inngangene i arbeidsordre-funksjonen (netlify/functions/arbeidsordre.ts): lenker som virker uten innlogging,
// og at innloggede bare kan sende arbeidsordre for eiendommer de har tilgang til.
import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { lagFalsk, type Db } from './falsk-supabase.ts';

let falsk: ReturnType<typeof lagFalsk>;
mock.module('@supabase/supabase-js', { namedExports: { createClient: () => falsk.klient } });
process.env.SUPABASE_URL = 'http://test'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-nokkel'; process.env.REGELVERK_TOKEN = 'x'.repeat(32);
const { default: ao } = await import('./.bygg/arbeidsordre.mjs');

const kall = async (body: any, hoder: Record<string, string> = {}) => { const r = await ao(new Request('http://x/', { method: 'POST', headers: hoder, body: JSON.stringify(body) })); return { status: r.status, ...(await r.json()) }; };
const inn = (token: string) => ({ authorization: 'Bearer ' + token });
const PW = 'Sterkt-Passord-123', SAM = { samtykke: true, personvernVersjon: '1.0' };
const omEnUke = new Date(Date.now() + 7 * 864e5).toISOString(), iGaar = new Date(Date.now() - 864e5).toISOString();
const T = { ok: '11111111-1111-4111-8111-111111111111', utlopt: '22222222-2222-4222-8222-222222222222', kvittert: '33333333-3333-4333-8333-333333333333', fins: '44444444-4444-4444-8444-444444444444',
  ko: '55555555-5555-4555-8555-555555555555', koSendt: '66666666-6666-4666-8666-666666666666', bb: 'brannbok-token-som-er-lang-nok-0001' };
let db: Db;

beforeEach(() => {
  db = {
    organisasjoner: [{ id: 'org1', navn: 'Eier AS', aktiv: true, type: 'eier' }],
    eiendommer: [{ id: 'e1', eier_org_id: 'org1', data: { navn: 'Bygg 1' } }, { id: 'e2', eier_org_id: 'org1', data: { navn: 'Bygg 2' } }],
    profiles: [{ id: 'ansatt', epost: 'ansatt@eier.no', navn: 'Ansatt', aktiv: true, rolle: 'tekniker' }, { id: 'ekstern', epost: 'finnes@firma.no', navn: 'Finnes', aktiv: true, rolle: 'utforer' }],
    org_medlem: [{ org_id: 'org1', user_id: 'ansatt', rolle: 'tekniker', aktiv: true }],
    avvik: [{ id: 'a1', nr: 7, eiendom_id: 'e1', tildelt_id: null, data: { tittel: 'Lekkasje', status: 'Ny', logg: [] } }, { id: 'a2', nr: 8, eiendom_id: 'e2', tildelt_id: null, data: { tittel: 'Annet bygg', status: 'Ny' } }],
    ao_invitasjon: [
      { token: T.ok, avvik_id: 'a1', epost: 'ny@firma.no', utloper: omEnUke }, { token: T.utlopt, avvik_id: 'a1', epost: 'ny@firma.no', utloper: iGaar },
      { token: T.kvittert, avvik_id: 'a1', epost: 'ny@firma.no', utloper: omEnUke, kvittert: iGaar }, { token: T.fins, avvik_id: 'a1', epost: 'finnes@firma.no', utloper: omEnUke },
    ],
    ko_invitasjon: [{ token: T.ko, oppgave_id: 'o1', eiendom_id: 'e1', epost: 'service@firma.no', utloper: omEnUke }, { token: T.koSendt, oppgave_id: 'o1', eiendom_id: 'e1', epost: 'service@firma.no', utloper: omEnUke, innsendt: iGaar }],
    brannbok_lenker: [{ id: 'l1', token: T.bb, eiendom_id: 'e1', data: { pdfPath: 'e1/brannbok/bok.pdf', innhold: { vedlegg: [{ path: 'e1/brannbok/plan.pdf' }] } } }],
    oppgaver: [{ id: 'o1', eiendom_id: 'e1', data: { navn: 'Årskontroll' } }], prosjekter: [], hendelseslogg: [], epost_oppsett: [], systemer: [], komponenter: [], innstillinger: [], leietakere: [], lt_invitasjon: [],
  };
  falsk = lagFalsk(db, { ansatt: { id: 'ansatt', email: 'ansatt@eier.no' }, ekstern: { id: 'ekstern', email: 'finnes@firma.no' } }, { 'tok-ansatt': 'ansatt', 'tok-ekstern': 'ekstern' },
    { niva: { ansatt: { e1: 'drift' } }, filer: { 'e1/ko/o1': 0 } });
});
const gjort = (hva: string) => falsk.kall.filter(k => k.hva === hva);

test('lenke til arbeidsordre: ukjent og utløpt lenke avvises', async () => {
  assert.equal((await kall({ action: 'info', token: '99999999-9999-4999-8999-999999999999' })).status, 404);
  assert.equal((await kall({ action: 'info', token: T.utlopt })).status, 410);
  assert.equal((await kall({ action: 'registrer', token: T.utlopt, passord: PW, ...SAM })).status, 410);
  assert.equal((await kall({ action: 'ao_opplasting', token: T.utlopt, navn: 'bilde.jpg' })).status, 410);
});

test('opprette bruker via lenke krever samtykke og sterkt passord', async () => {
  assert.equal((await kall({ action: 'registrer', token: T.ok, passord: PW })).status, 400);
  assert.equal((await kall({ action: 'registrer', token: T.ok, passord: 'svakt', ...SAM })).status, 400);
  assert.equal(gjort('createUser').length, 0);
});

test('lenken kan ikke brukes til å overta en bruker som finnes fra før', async () => {
  const r = await kall({ action: 'registrer', token: T.fins, passord: PW, navn: 'Angriper', ...SAM });
  assert.equal(r.status, 409); assert.equal(gjort('createUser').length, 0); assert.equal(gjort('updateUserById').length, 0);
});

test('ny ekstern bruker opprettes med e-posten fra invitasjonen og får bare det ene avviket', async () => {
  const r = await kall({ action: 'registrer', token: T.ok, passord: PW, navn: 'Ola', firma: 'Rør AS', epost: 'annen@adresse.no', ...SAM });
  assert.equal(r.status, 200); assert.equal(gjort('createUser')[0].arg.email, 'ny@firma.no');
  const ny = db.profiles.find(p => p.epost === 'ny@firma.no'); assert.equal(ny.rolle, 'utforer');
  assert.equal(db.avvik.find(a => a.id === 'a1').tildelt_id, ny.id); assert.equal(db.avvik.find(a => a.id === 'a2').tildelt_id, null);
});

test('aksepter: krever innlogging, og lenken virker bare for den den ble sendt til', async () => {
  assert.equal((await kall({ action: 'aksepter', token: T.fins })).status, 401);
  assert.equal((await kall({ action: 'aksepter', token: T.fins }, inn('tok-ansatt'))).status, 403);
  assert.equal(db.avvik.find(a => a.id === 'a1').tildelt_id, null);
  assert.equal((await kall({ action: 'aksepter', token: T.fins }, inn('tok-ekstern'))).status, 200);
  assert.equal(db.avvik.find(a => a.id === 'a1').tildelt_id, 'ekstern');
});

test('sende arbeidsordre: krever innlogging og tilgang til eiendommen', async () => {
  assert.equal((await kall({ action: 'inviter', avvik_id: 'a1', epost: 'x@y.no' })).status, 401);
  assert.equal((await kall({ action: 'inviter', avvik_id: 'a2', epost: 'x@y.no' }, inn('tok-ansatt'))).status, 403); // ansatt har ikke tilgang til Bygg 2
  assert.equal((await kall({ action: 'inviter', avvik_id: 'a1', epost: 'x@y.no' }, inn('tok-ekstern'))).status, 403); // ekstern har ingen eiendommer
  assert.equal(db.ao_invitasjon.length, 4);
});

test('kvittering via lenke: bare én gang, og opplasting har en øvre grense', async () => {
  assert.equal((await kall({ action: 'ao_kvitter', token: T.kvittert, navn: 'Ola', komm: 'Ferdig', ...SAM })).status, 409);
  const r = await kall({ action: 'ao_opplasting', token: T.ok, navn: 'bilde æøå.jpg' });
  assert.equal(r.status, 200); assert.ok(r.path.startsWith('e1/ao/a1/'));
  falsk = lagFalsk(db, {}, {}, { filer: { 'e1/ao/a1': 61 } });
  assert.equal((await kall({ action: 'ao_opplasting', token: T.ok, navn: 'en-til.jpg' })).status, 429);
});

test('kontroll-lenke: opplasting havner i kontrollens egen mappe, og sendt rapport kan ikke endres', async () => {
  const r = await kall({ action: 'ko_opplasting', token: T.ko, navn: '../../annet/rapport.pdf' });
  assert.equal(r.status, 200); assert.ok(r.path.startsWith('e1/ko/o1/')); assert.ok(!r.path.slice('e1/ko/o1/'.length).includes('/'));
  assert.equal((await kall({ action: 'ko_opplasting', token: T.koSendt, navn: 'x.pdf' })).status, 403);
  assert.equal((await kall({ action: 'ko_innsend', token: T.koSendt, ...SAM })).status, 409);
  assert.equal((await kall({ action: 'ko_info', token: "x' or 1=1" })).status, 404);
});

test('brannbok-lenke gir bare filene som hører til brannboken', async () => {
  assert.equal((await kall({ action: 'bb_fil', token: T.bb, path: 'e1/brannbok/plan.pdf' })).status, 200);
  assert.equal((await kall({ action: 'bb_fil', token: T.bb, path: 'e1/leietaker/leieavtale.pdf' })).status, 403);
  assert.equal((await kall({ action: 'bb_fil', token: 'kort', path: 'e1/brannbok/plan.pdf' })).status, 404);
  assert.equal(gjort('signertLenke').length, 1);
});

test('planlagte jobber og regelverksvarsel kan ikke startes utenfra', async () => {
  assert.equal((await kall({ action: 'ko_auto' })).status, 403);
  assert.equal((await kall({ action: 'ko_auto' }, { 'x-ek-cron': 'gjett' })).status, 403);
  assert.equal((await kall({ action: 'av_purring' })).status, 403);
  assert.equal((await kall({ action: 'regelverk_varsel' }, { 'x-regelverk-token': 'y'.repeat(32) })).status, 403);
});

test('e-postoppsett kan bare leses og endres av administrator', async () => {
  assert.equal((await kall({ action: 'epost_hent' })).status, 403);
  assert.equal((await kall({ action: 'epost_lagre', org_id: 'org1', data: { metode: 'smtp' }, hemmelig: 'x' }, inn('tok-ansatt'))).status, 403);
  assert.equal(db.epost_oppsett.length, 0);
});

test('prosjektrapport og signering: ugyldige lenker avvises', async () => {
  assert.equal((await kall({ action: 'pr_info', token: 'a'.repeat(48) })).status, 404);
  assert.equal((await kall({ action: 'pr_svar', token: 'kort', beslutning: 'Godkjent', navn: 'X' })).status, 404);
  assert.equal((await kall({ action: 'bef_sign_info', token: 'finnes-ikke' })).status, 404);
});
