// Netlify-funksjon for brukeradministrasjon i organisasjonsmodellen. Kjører på serveren med
// Supabase service-nøkkel (som aldri sendes til nettleseren). Hver handling sjekker at den som
// kaller er administrator i riktig organisasjon (eller plattformadministrator).
import { createClient } from '@supabase/supabase-js';
import ws from 'ws'; // Node < 22 mangler innebygd WebSocket, som supabase-js krever

const svakt = (pw: string) => pw.length < 10 || !/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/\d/.test(pw);
const aalFra = (t: string) => { try { return JSON.parse(Buffer.from(t.split('.')[1] || '', 'base64url').toString()).aal || ''; } catch { return ''; } };
const json = (status: number, body: any) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const ORG_ROLLER = ['admin', 'forvalter', 'tekniker', 'leser'];
const ORG_TYPER = ['eier', 'forvalter', 'drift', 'service', 'annet'];

export default async (req: Request) => {
  try { return await handler(req); }
  catch (e: any) { console.error('brukere-feil', e); return json(500, { error: 'Serverfeil: ' + (e?.message || String(e)) }); }
};

const handler = async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'Bare POST' });
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim().replace(/\/(rest|auth|storage)\/v1.*$/i, '').replace(/\/+$/, '');
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) return json(500, { error: 'Serveren mangler SUPABASE_URL eller SUPABASE_SERVICE_ROLE_KEY' });
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { transport: ws as any } });

  // Hvem kaller?
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: u, error: ue } = await admin.auth.getUser(token);
  if (ue || !u?.user) return json(401, { error: 'Ikke innlogget' });
  const { data: mok } = await admin.rpc('mfa_ok_for', { p_uid: u.user.id, p_aal: aalFra(token) });
  if (mok === false) return json(403, { error: 'Tofaktorinnlogging kreves. Logg ut og inn igjen med kode.' });
  const { data: me } = await admin.from('profiles').select('id, rolle, aktiv, plattform_admin, navn, epost').eq('id', u.user.id).single();
  if (!me || !me.aktiv) return json(403, { error: 'Brukeren er ikke aktiv' });
  const plattform = !!me.plattform_admin;
  // Full tilgang (utviklermodus): plattformadmin med tofaktor regnes som administrator i alle organisasjoner
  const gud = plattform && aalFra(token) === 'aal2' && (await admin.rpc('full_tilgang', { p_uid: me.id })).data === true;
  const erOrgAdmin = async (org: string) => {
    if (!org) return false;
    if (gud) { const { data: o } = await admin.from('organisasjoner').select('aktiv').eq('id', org).maybeSingle(); return !!o?.aktiv; }
    const { data } = await admin.from('org_medlem').select('rolle, aktiv, organisasjoner!inner(aktiv)').eq('org_id', org).eq('user_id', me.id).maybeSingle();
    return !!(data && data.aktiv && data.rolle === 'admin' && (data as any).organisasjoner?.aktiv);
  };
  const niva = async (eid: string) => { const { data } = await admin.rpc('niva_for', { p_uid: me.id, eid }); return data as string | null; };
  const logg = (org: string | null, tekst: string) => admin.from('hendelseslogg').insert({ bruker_id: me.id, bruker: me.navn || me.epost, tabell: 'hendelse', handling: 'bruker', org_id: org, tekst });

  const SPRAK_OK = ['nb', 'en', 'sv', 'da', 'es-MX', 'es-ES'];
  let body: any; try { body = await req.json(); } catch { return json(400, { error: 'Ugyldig forespørsel' }); }
  const redirectTo = typeof body.redirectTo === 'string' && /^https?:\/\//.test(body.redirectTo) ? body.redirectTo : undefined;

  // Testmodus (samme innstilling som e-post i arbeidsordre.ts): invitasjoner på e-post sendes bare til tillatte adresser
  const kanSendeTil = async (epost: string) => {
    const { data: rader } = await admin.from('epost_oppsett').select('data');
    const R = (rader || []).map((r: any) => r.data || {}); const av = R.length > 0 && R.every((d: any) => d.testmodus === false);
    if (av) return true;
    const ok = new Set([...R.flatMap((d: any) => Array.isArray(d.tillatt) ? d.tillatt : []), me.epost, ...(process.env.UTVIKLER_EPOST || '').split(/[,;\s]+/)].map((x: any) => String(x || '').trim().toLowerCase()).filter(Boolean));
    if (ok.has(epost.toLowerCase())) return true;
    await admin.from('hendelseslogg').insert({ bruker_id: me.id, bruker: me.navn || me.epost, tabell: 'hendelse', handling: 'epost', tekst: `Testmodus: invitasjon til ${epost} ble holdt tilbake` });
    return false;
  };
  // Finn eller opprett bruker. Finnes e-posten fra før, gjenbrukes brukeren (kan være medlem i flere organisasjoner).
  const finnEllerOpprett = async (epost: string, navn: string, passord?: string): Promise<{ id: string; ny: boolean }> => {
    const { data: p } = await admin.from('profiles').select('id').eq('epost', epost).maybeSingle();
    if (p) { if (passord) await admin.auth.admin.updateUserById(p.id, { password: passord }); return { id: p.id, ny: false }; }
    if (!passord && !(await kanSendeTil(epost))) throw new Error(`Testmodus for e-post er på – invitasjon til ${epost} ble ikke sendt. Opprett brukeren med passord (testbruker), legg adressen til i listen over tillatte mottakere eller slå av testmodus under Innstillinger → E-post.`);
    const r = passord
      ? await admin.auth.admin.createUser({ email: epost, password: passord, email_confirm: true, user_metadata: { navn, test: true } })
      : await admin.auth.admin.inviteUserByEmail(epost, { data: { navn, sprak: SPRAK_OK.includes(body.sprak) ? body.sprak : 'nb' }, redirectTo });
    if (r.error) throw new Error(r.error.message);
    const id = r.data.user!.id;
    await admin.from('profiles').upsert({ id, epost, navn: navn || epost, rolle: 'ingen', aktiv: true });
    return { id, ny: true };
  };

  // Legg til/oppdater medlem i organisasjon med evt. tildelinger
  const settMedlem = async (org: string, uid: string, rolle: string, alleBygg: boolean, tildel: any[]) => {
    const { error } = await admin.from('org_medlem').upsert({ org_id: org, user_id: uid, rolle, alle_bygg: alleBygg, aktiv: true });
    if (error) throw new Error(error.message);
    const rader = (Array.isArray(tildel) ? tildel : []).map(t => ({ user_id: uid, org_id: org, eiendom_id: t.eiendom_id || null, portefolje_id: t.eiendom_id ? null : t.portefolje_id || null })).filter(t => t.eiendom_id || t.portefolje_id);
    for (const t of rader) {
      const { data: ok } = await admin.rpc('org_har', { p_org: org, p_eid: t.eiendom_id, p_pid: t.portefolje_id });
      if (!ok) throw new Error('Organisasjonen har ikke tilgang til et av byggene/porteføljene');
      const { error: te } = await admin.from('eiendom_tilgang').insert(t); if (te && te.code !== '23505') throw new Error(te.message);
    }
  };

  // ---------- Slett organisasjon (plattformadministrator). Stopper hvis den eier eiendommer.
  if (body.action === 'slett_org') {
    if (!plattform) return json(403, { error: 'Bare plattformadministrator kan slette organisasjoner' });
    const id = String(body.org_id || ''); const { data: org } = await admin.from('organisasjoner').select('id, navn, orgnr').eq('id', id).maybeSingle();
    if (!org) return json(404, { error: 'Fant ikke organisasjonen' });
    const { count: ne } = await admin.from('eiendommer').select('id', { count: 'exact', head: true }).eq('eier_org_id', id);
    if (ne) return json(409, { error: `«${org.navn}» eier ${ne} eiendom${ne > 1 ? 'mer' : ''}. Slett eller flytt eiendommene først, eller sperr kunden i stedet.` });
    const { data: med } = await admin.from('org_medlem').select('user_id').eq('org_id', id);
    if ((med || []).some((m: any) => m.user_id === me.id)) return json(400, { error: 'Du er selv medlem av organisasjonen – meld deg ut først, så du ikke sletter din egen tilgang' });
    const { error } = await admin.from('organisasjoner').delete().eq('id', id); if (error) return json(500, { error: error.message });
    let brukere = 0;
    for (const m of med || []) { // fjern brukere som ikke lenger hører til noe sted
      const { count: andre } = await admin.from('org_medlem').select('org_id', { count: 'exact', head: true }).eq('user_id', m.user_id);
      const { data: p } = await admin.from('profiles').select('rolle, plattform_admin, leietaker_id').eq('id', m.user_id).maybeSingle();
      if (!andre && p && !p.plattform_admin && !p.leietaker_id && (p.rolle === 'ingen' || !p.rolle)) { const { error: de } = await admin.auth.admin.deleteUser(m.user_id); if (!de) { await admin.from('profiles').delete().eq('id', m.user_id); brukere++; } }
    }
    await logg(null, `Organisasjon «${org.navn}» (${org.orgnr || 'uten org.nr.'}) slettet av plattformadministrator. ${brukere} bruker(e) fjernet.`);
    return json(200, { ok: true, brukere });
  }

  // ---------- Ny organisasjon (plattformadministrator)
  if (body.action === 'ny_org') {
    if (!plattform) return json(403, { error: 'Bare plattformadministrator kan opprette organisasjoner' });
    const navn = String(body.navn || '').trim(); const type = ORG_TYPER.includes(body.type) ? body.type : 'eier';
    const epost = String(body.admin_epost || '').trim().toLowerCase();
    if (!navn) return json(400, { error: 'Mangler navn' });
    if (!/^\S+@\S+\.\S+$/.test(epost)) return json(400, { error: 'Ugyldig e-post for administrator' });
    const { data: org, error } = await admin.from('organisasjoner').insert({ navn, type, orgnr: String(body.orgnr || '').replace(/\s/g, '') || null }).select().single();
    if (error) return json(500, { error: error.message });
    try { const b = await finnEllerOpprett(epost, String(body.admin_navn || ''), body.passord ? String(body.passord) : undefined); await settMedlem(org.id, b.id, 'admin', true, []); }
    catch (e: any) { await admin.from('organisasjoner').delete().eq('id', org.id); return json(400, { error: e.message }); }
    await logg(org.id, `Organisasjon «${navn}» opprettet med administrator ${epost}`);
    return json(200, { ok: true, org_id: org.id });
  }

  // ---------- Inviter/legg til medlem i organisasjon (org-admin) eller leietakerbruker (forvalter med redigeringstilgang)
  if (body.action === 'inviter' || body.action === 'testbruker') {
    const epost = String(body.epost || '').trim().toLowerCase(); const navn = String(body.navn || '');
    if (!/^\S+@\S+\.\S+$/.test(epost)) return json(400, { error: 'Ugyldig e-postadresse' });
    const passord = body.action === 'testbruker' ? String(body.passord || '') : undefined;
    if (passord !== undefined && svakt(passord)) return json(400, { error: 'Passordet må ha minst 10 tegn, med store og små bokstaver og tall' });

    if (body.rolle === 'leietaker') {
      const { data: lt } = await admin.from('leietakere').select('id, eiendom_id').eq('id', body.leietaker_id).maybeSingle();
      if (!lt) return json(400, { error: 'Fant ikke leietakeren' });
      if ((await niva(lt.eiendom_id)) !== 'skriv') return json(403, { error: 'Du har ikke redigeringstilgang til leietakerens eiendom' });
      const { data: fins } = await admin.from('profiles').select('id, rolle').eq('epost', epost).maybeSingle();
      if (fins && fins.rolle !== 'leietaker' && fins.rolle !== 'ingen') return json(409, { error: 'E-posten tilhører en ansatt-bruker og kan ikke gjøres til leietaker' });
      try { const b = await finnEllerOpprett(epost, navn, passord); await admin.from('profiles').update({ rolle: 'leietaker', leietaker_id: lt.id, aktiv: true }).eq('id', b.id); await logg(null, `Leietakerbruker ${epost} lagt til`); return json(200, { ok: true, id: b.id, ny: b.ny }); }
      catch (e: any) { return json(400, { error: e.message }); }
    }

    const org = String(body.org_id || '');
    if (!(await erOrgAdmin(org)) && !plattform) return json(403, { error: 'Bare administrator i organisasjonen kan legge til brukere' });
    const rolle = ORG_ROLLER.includes(body.rolle) ? body.rolle : '';
    if (!rolle) return json(400, { error: 'Ugyldig rolle' });
    const { data: fins } = await admin.from('profiles').select('id, rolle').eq('epost', epost).maybeSingle();
    if (fins && fins.rolle === 'leietaker') return json(409, { error: 'E-posten brukes av en leietakerbruker' });
    let oppgradert: { fra: number; til: number } | null = null;
    { // Antall brukerlisenser: er alle i bruk, må administratoren bekrefte at abonnementet økes med én bruker
      const { data: o } = await admin.from('organisasjoner').select('lisenser').eq('id', org).maybeSingle(); const lis = (o as any)?.lisenser;
      if (lis) {
        const { data: fm } = await admin.from('profiles').select('id').eq('epost', epost).maybeSingle();
        const { count } = await admin.from('org_medlem').select('user_id', { count: 'exact', head: true }).eq('org_id', org).eq('aktiv', true).neq('user_id', fm?.id || '00000000-0000-0000-0000-000000000000');
        if ((count || 0) >= lis) {
          if (body.oppgrader !== true) return json(409, { error: `Abonnementet har ${lis} bruker${lis === 1 ? '' : 'e'}, og alle er i bruk.`, kanOppgradere: true, lisenser: lis, aktive: count || 0 });
          const til = Math.min(1000, (count || 0) + 1);
          const { error: le } = await admin.from('organisasjoner').update({ lisenser: til }).eq('id', org); if (le) return json(500, { error: 'Kunne ikke øke antall brukere: ' + le.message });
          oppgradert = { fra: lis, til };
          await logg(org, `Antall brukerlisenser økt automatisk fra ${lis} til ${til} da ${epost} ble lagt til`);
        }
      }
    }
    try {
      const b = await finnEllerOpprett(epost, navn, passord);
      await settMedlem(org, b.id, rolle, !!body.alle_bygg, body.tildelinger || []);
      await logg(org, `${b.ny ? 'Ny bruker' : 'Eksisterende bruker'} ${epost} lagt til som ${rolle}${body.alle_bygg ? ' (alle bygg)' : ''}`);
      return json(200, { ok: true, id: b.id, ny: b.ny, oppgradert });
    } catch (e: any) { return json(400, { error: e.message }); }
  }

  // ---------- Nullstill tofaktor (mistet telefon): org-admin for medlemmer i egen organisasjon, eller plattformadministrator
  if (body.action === 'mfa_nullstill') {
    const uid = String(body.user_id || ''); const org = String(body.org_id || '');
    if (!uid) return json(400, { error: 'Mangler bruker' });
    if (!plattform) {
      if (!(await erOrgAdmin(org))) return json(403, { error: 'Bare administrator i organisasjonen kan nullstille tofaktor' });
      const { data: m } = await admin.from('org_medlem').select('user_id').eq('org_id', org).eq('user_id', uid).maybeSingle();
      if (!m) return json(403, { error: 'Brukeren er ikke medlem i organisasjonen' });
    }
    const { data: l, error: le } = await admin.auth.admin.mfa.listFactors({ userId: uid });
    if (le) return json(400, { error: le.message });
    let n = 0; for (const f of l?.factors || []) { const { error } = await admin.auth.admin.mfa.deleteFactor({ id: f.id, userId: uid }); if (!error) n++; }
    const { data: pr } = await admin.from('profiles').select('epost').eq('id', uid).maybeSingle();
    await logg(org || null, `Tofaktor nullstilt for ${pr?.epost || uid} (${n} faktor${n === 1 ? '' : 'er'} fjernet)`);
    return json(200, { ok: true, fjernet: n });
  }

  // ---------- Slett bruker helt (bare plattformadministrator). Organisasjoner fjerner medlemmer i appen.
  if (body.action === 'slett') {
    if (!plattform) return json(403, { error: 'Bare plattformadministrator kan slette brukere. Fjern brukeren fra organisasjonen i stedet.' });
    if (!body.user_id || body.user_id === me.id) return json(400, { error: 'Du kan ikke slette deg selv' });
    const { error } = await admin.auth.admin.deleteUser(body.user_id);
    if (error) return json(400, { error: error.message });
    await logg(null, `Bruker ${body.user_id} slettet`);
    return json(200, { ok: true });
  }

  return json(400, { error: 'Ukjent handling' });
};
