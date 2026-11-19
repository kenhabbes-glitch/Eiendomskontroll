// Brannvernopplæring: lenker uten innlogging, fasit som aldri lekker, invitasjon og purring bare for leder etter fullført kurs,
// og eier/forvalter får bare tall (ingen navn eller e-post).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lagFalsk, type Db } from './falsk-supabase.ts';
import { opplaering, renInnhold } from '../src/lib/opplaeringServer.ts';

const innhold = { tittel: 'Kurs', steg: [
  { id: 's1', tittel: 'Ett', tekst: ['a'], spm: { id: 'q1', q: 'Nummer?', valg: ['112', '110'], riktig: 1, forklaring: 'Riktig 110', tips: 'ikke politi' } },
  { id: 's2', tittel: 'To', tekst: ['b'], spm: { id: 'q2', q: 'Ja?', valg: ['ja', 'nei'], riktig: 0, forklaring: 'Ja' } }] };

function oppsett() {
  const db: Db = { leietakere: [{ id: 'l1', eiendom_id: 'e1', data: { navn: 'Firma AS' } }], eiendommer: [{ id: 'e1', data: { navn: 'Bygg 1' } }], opplaering_kurs: [], opplaering_deltakere: [], hendelseslogg: [] };
  const falsk = lagFalsk(db, {}, {});
  const sendt: any[] = []; let bruker: any = { id: 'u1', navn: 'Eier', epost: 'eier@x.no' };
  const kjor = async (body: any) => { const r = await opplaering({ admin: falsk.klient as any, body: { lenkeBase: 'https://app.test', ...body }, json: (s, b) => new Response(JSON.stringify(b), { status: s }), esc: x => String(x),
    hvem: async () => bruker, kanRedigere: async () => true, harEiendom: async () => true, sendEpost: async (til, emne) => { sendt.push({ til, emne }); return { sendt: true }; },
    oppsettFor: async () => ({}), minOrg: async () => 'org1', sprakFor: async () => ({ t: (s: any, ...a: any[]) => a.reduce((r: string, v, i) => r.split('{' + i + '}').join(String(v)), String(s)) }) });
    return { status: r!.status, j: await r!.json() }; };
  return { db, kjor, sendt, utlogget: () => { bruker = null; } };
}
const tokenFra = (lenke: string) => lenke.split('/#/op/')[1];

test('renInnhold avviser ugyldig fasit og duplikate id-er', () => {
  assert.ok(renInnhold(innhold));
  assert.equal(renInnhold({ steg: [{ id: 'a', tittel: '', tekst: [], spm: { id: 'q', q: '', valg: ['x', 'y'], riktig: 5 } }] }), null);
  assert.equal(renInnhold({ steg: [{ id: 'a', tittel: '', tekst: [] }, { id: 'a', tittel: '', tekst: [] }] }), null);
  assert.equal(renInnhold({ steg: [] }), null);
});

test('hele løpet: leder gjennomfører, inviterer, ansatt gjennomfører, eier ser bare prosent', async () => {
  const { kjor, sendt, db } = oppsett();
  const s = await kjor({ action: 'opl_start', leietaker_id: 'l1', innhold, versjon: 2, navn: 'Lise Leder', epost: 'lise@firma.no' });
  assert.equal(s.status, 200); assert.equal(sendt.length, 1); const tl = tokenFra(s.j.lenke);
  // info: ingen fasit
  const i = await kjor({ action: 'opl_info', token: tl }); assert.equal(i.status, 200);
  assert.ok(!JSON.stringify(i.j).includes('"riktig"') && !JSON.stringify(i.j).includes('Riktig 110'), 'fasit og forklaring skal ikke følge med før svar');
  // leder kan ikke invitere før kurset er tatt
  assert.equal((await kjor({ action: 'opl_inviter', token: tl, personer: [{ navn: 'A', epost: 'a@firma.no' }] })).status, 403);
  // feil svar, så riktig
  assert.equal((await kjor({ action: 'opl_sjekk', token: tl, spm: 'q1', valg: 0 })).j.riktig, false);
  assert.equal((await kjor({ action: 'opl_ferdig', token: tl })).status, 409);
  assert.equal((await kjor({ action: 'opl_sjekk', token: tl, spm: 'q1', valg: 1 })).j.riktig, true);
  assert.equal((await kjor({ action: 'opl_sjekk', token: tl, spm: 'q2', valg: 0 })).j.riktig, true);
  assert.equal((await kjor({ action: 'opl_ferdig', token: tl })).status, 200);
  // invitere: to nye, én duplikat, én ugyldig
  const inv = await kjor({ action: 'opl_inviter', token: tl, personer: [{ navn: 'Ola', epost: 'ola@firma.no' }, { navn: 'Kari', epost: 'kari@firma.no' }, { navn: 'Ola2', epost: 'OLA@firma.no' }, { navn: 'X', epost: 'ugyldig' }] });
  assert.equal(inv.status, 200); assert.equal(inv.j.resultat.filter((x: any) => x.sendt).length, 2); assert.equal(inv.j.resultat.filter((x: any) => x.feil).length, 2);
  const ov = await kjor({ action: 'opl_oversikt', token: tl }); assert.equal(ov.j.ansatte.length, 2);
  // ansatt kan ikke bruke leder-handlinger
  const ola = db.opplaering_deltakere.find(x => x.epost === 'ola@firma.no'); const to = ola.token;
  assert.equal((await kjor({ action: 'opl_oversikt', token: to })).status, 403);
  await kjor({ action: 'opl_sjekk', token: to, spm: 'q1', valg: 1 }); await kjor({ action: 'opl_sjekk', token: to, spm: 'q2', valg: 0 });
  assert.equal((await kjor({ action: 'opl_ferdig', token: to })).status, 200);
  // purring: bare Kari mangler, og ikke to ganger samme døgn
  const p1 = await kjor({ action: 'opl_purr', token: tl }); assert.equal(p1.j.sendt, 1); assert.equal(p1.j.ferdige, 1);
  const p2 = await kjor({ action: 'opl_purr', token: tl }); assert.equal(p2.j.sendt, 0); assert.equal(p2.j.ventet, 1);
  // eier: bare tall – lederen og Ola er ferdige, Kari ikke → 2 av 3
  const st = await kjor({ action: 'opl_status', eiendom_id: 'e1' });
  assert.deepEqual(st.j.status, [{ leietaker_id: 'l1', versjon: 2, invitert: 3, fullfort: 2 }]);
  assert.ok(!JSON.stringify(st.j).includes('@'));
});

test('ugyldig token og utlogget eier avvises', async () => {
  const o = oppsett();
  assert.equal((await o.kjor({ action: 'opl_info', token: 'x' })).status, 404);
  assert.equal((await o.kjor({ action: 'opl_info', token: 'a'.repeat(48) })).status, 404);
  o.utlogget(); assert.equal((await o.kjor({ action: 'opl_start', leietaker_id: 'l1', innhold, navn: 'A', epost: 'a@b.no' })).status, 401);
  assert.equal((await o.kjor({ action: 'opl_status', eiendom_id: 'e1' })).status, 401);
});
