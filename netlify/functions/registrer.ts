// Selvbetjent registrering av ny kunde (organisasjon) med prøveperiode.
// Offentlig endepunkt: krever ikke innlogging, men
//  * må slås på med miljøvariabelen SELVREGISTRERING=på i Netlify,
//  * sjekker organisasjonsnummeret i Enhetsregisteret (må finnes, ikke være slettet/konkurs),
//  * én organisasjon per org.nr, og en øvre grense for antall registreringer per time,
//  * brukeren får en invitasjon på e-post og setter passord selv (bekrefter at e-posten er ekte).
// Prøveperioden (30 dager på alle moduler) gis av databasen (migrasjon 015).
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

const json = (status: number, body: any) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const TYPER = ['eier', 'forvalter', 'drift', 'service'];
const VILKAR_VERSJON = '1.0 (november 2026)';
const MAKS_PER_TIME = 10;

export default async (req: Request) => {
  try { return await handler(req); }
  catch (e: any) { console.error('registrer-feil', e); return json(500, { error: 'Noe gikk galt. Prøv igjen senere.' }); }
};

const handler = async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'Bare POST' });
  if (!/^(på|pa|on|true|1|ja)$/i.test((process.env.SELVREGISTRERING || '').trim())) return json(503, { error: 'Registrering av nye kunder er ikke åpnet ennå. Ta kontakt for å få tilgang.' });
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim().replace(/\/(rest|auth|storage)\/v1.*$/i, '').replace(/\/+$/, '');
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) return json(500, { error: 'Serveren er ikke satt opp' });
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { transport: ws as any } });

  let b: any; try { b = await req.json(); } catch { return json(400, { error: 'Ugyldig forespørsel' }); }
  if (b.nettside) return json(200, { ok: true }); // honningkrukke: feltet er skjult for mennesker
  const orgnr = String(b.orgnr || '').replace(/\D/g, ''); const navn = String(b.navn || '').trim().slice(0, 120);
  const epost = String(b.epost || '').trim().toLowerCase(); const type = TYPER.includes(b.type) ? b.type : 'eier';
  if (orgnr.length !== 9) return json(400, { error: 'Organisasjonsnummeret må ha 9 siffer' });
  if (navn.length < 2) return json(400, { error: 'Skriv inn navnet ditt' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(epost) || epost.length > 200) return json(400, { error: 'Ugyldig e-postadresse' });
  if (b.samtykke !== true) return json(400, { error: 'Du må godta vilkårene for å registrere' });
  const redirectTo = typeof b.redirectTo === 'string' && /^https:\/\/[^/]+\/?$/.test(b.redirectTo) ? b.redirectTo : undefined;

  // Grense per time (mot misbruk)
  const enTime = new Date(Date.now() - 3600e3).toISOString();
  const { count } = await admin.from('organisasjoner').select('id', { count: 'exact', head: true }).gte('opprettet', enTime).contains('data', { selvregistrert: true });
  if ((count || 0) >= MAKS_PER_TIME) return json(429, { error: 'Mange registreringer akkurat nå. Prøv igjen om en time.' });

  // Enhetsregisteret
  let enhet: any = null;
  try { const r = await fetch(`https://data.brreg.no/enhetsregisteret/api/enheter/${orgnr}`, { headers: { Accept: 'application/json' } }); if (r.ok) enhet = await r.json(); else if (r.status !== 404 && r.status !== 410) return json(503, { error: 'Fikk ikke kontakt med Enhetsregisteret. Prøv igjen litt senere.' }); }
  catch { return json(503, { error: 'Fikk ikke kontakt med Enhetsregisteret. Prøv igjen litt senere.' }); }
  if (!enhet || enhet.slettedato || enhet._slettet) return json(400, { error: 'Fant ikke organisasjonsnummeret i Enhetsregisteret' });
  if (enhet.konkurs || enhet.underAvvikling || enhet.underTvangsavviklingEllerTvangsopplosning) return json(400, { error: 'Organisasjonen er registrert som konkurs eller under avvikling' });
  const firmanavn = String(enhet.navn || '').trim();

  // Finnes fra før?
  const { data: finsOrg } = await admin.from('organisasjoner').select('id').eq('orgnr', orgnr).maybeSingle();
  if (finsOrg) return json(409, { error: `${firmanavn} er allerede registrert. Be administratoren i organisasjonen om å invitere deg.` });
  const { data: finsBruker } = await admin.from('profiles').select('id').eq('epost', epost).maybeSingle();
  if (finsBruker) return json(409, { error: 'E-postadressen har allerede en bruker. Logg inn, eller bruk «Glemt passord?».' });

  // Opprett organisasjon (gir 30 dagers prøve på alle moduler via trigger i databasen)
  const { data: org, error: oe } = await admin.from('organisasjoner').insert({ navn: firmanavn, orgnr, type, aktiv: true,
    data: { selvregistrert: true, registrert: new Date().toISOString(), registrertAv: { navn, epost }, vilkaar: VILKAR_VERSJON, orgform: enhet.organisasjonsform?.beskrivelse || '', adresse: enhet.forretningsadresse || null } }).select().single();
  if (oe || !org) return json(500, { error: 'Kunne ikke opprette organisasjonen' });

  // Invitasjon på e-post – brukeren setter passord selv
  const inv = await admin.auth.admin.inviteUserByEmail(epost, { data: { navn }, redirectTo });
  if (inv.error || !inv.data?.user) { await admin.from('organisasjoner').delete().eq('id', org.id); return json(400, { error: 'Kunne ikke sende invitasjon: ' + (inv.error?.message || 'ukjent feil') }); }
  const uid = inv.data.user.id;
  await admin.from('profiles').upsert({ id: uid, epost, navn, rolle: 'ingen', aktiv: true });
  const { error: me } = await admin.from('org_medlem').upsert({ org_id: org.id, user_id: uid, rolle: 'admin', alle_bygg: true, aktiv: true });
  if (me) { await admin.from('organisasjoner').delete().eq('id', org.id); return json(500, { error: 'Kunne ikke opprette administrator' }); }
  await admin.from('hendelseslogg').insert({ bruker_id: uid, bruker: navn, tabell: 'hendelse', handling: 'registrering', org_id: org.id, tekst: `Ny kunde registrert: ${firmanavn} (${orgnr}), administrator ${navn} <${epost}>. Vilkår ${VILKAR_VERSJON} godtatt. Prøveperiode 30 dager.` });
  return json(200, { ok: true, firmanavn });
};
