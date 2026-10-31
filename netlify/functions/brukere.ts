// Netlify-funksjon for brukeradministrasjon. Kjører på serveren med Supabase
// service-nøkkel (som aldri sendes til nettleseren). Kun aktive administratorer
// kan kalle den.
import { createClient } from '@supabase/supabase-js';

const json = (status: number, body: any) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export default async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'Bare POST' });
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim().replace(/\/(rest|auth|storage)\/v1.*$/i, '').replace(/\/+$/, '');
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) return json(500, { error: 'Serveren mangler SUPABASE_URL eller SUPABASE_SERVICE_ROLE_KEY' });
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // Hvem kaller?
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: u, error: ue } = await admin.auth.getUser(token);
  if (ue || !u?.user) return json(401, { error: 'Ikke innlogget' });
  const { data: me } = await admin.from('profiles').select('rolle, aktiv').eq('id', u.user.id).single();
  if (!me || me.rolle !== 'admin' || !me.aktiv) return json(403, { error: 'Bare administratorer kan administrere brukere' });

  let body: any; try { body = await req.json(); } catch { return json(400, { error: 'Ugyldig forespørsel' }); }

  if (body.action === 'inviter') {
    const epost = String(body.epost || '').trim().toLowerCase();
    const rolle = String(body.rolle || '');
    if (!/^\S+@\S+\.\S+$/.test(epost)) return json(400, { error: 'Ugyldig e-postadresse' });
    if (!['admin', 'forvalter', 'tekniker', 'leietaker'].includes(rolle)) return json(400, { error: 'Ugyldig rolle' });
    if (rolle === 'leietaker' && !body.leietaker_id) return json(400, { error: 'Leietaker mangler' });
    const redirectTo = typeof body.redirectTo === 'string' && /^https?:\/\//.test(body.redirectTo) ? body.redirectTo : undefined;
    const { data, error } = await admin.auth.admin.inviteUserByEmail(epost, { data: { navn: body.navn || '' }, redirectTo });
    if (error) {
      if (/already|registered|exists/i.test(error.message)) return json(409, { error: 'Det finnes allerede en bruker med denne e-posten. Endre rollen i brukerlisten i stedet.' });
      return json(400, { error: error.message });
    }
    const id = data.user!.id;
    const { error: pe } = await admin.from('profiles').upsert({ id, epost, navn: body.navn || epost, rolle, leietaker_id: rolle === 'leietaker' ? body.leietaker_id : null, aktiv: true });
    if (pe) return json(500, { error: 'Bruker opprettet, men profilen kunne ikke lagres: ' + pe.message });
    const eiendommer: string[] = Array.isArray(body.eiendommer) ? body.eiendommer : [];
    if (eiendommer.length && ['forvalter', 'tekniker'].includes(rolle)) await admin.from('eiendom_tilgang').upsert(eiendommer.map(e => ({ user_id: id, eiendom_id: e })));
    return json(200, { ok: true, id });
  }

  // Testbruker med passord (ingen e-post sendes, e-posten regnes som bekreftet)
  if (body.action === 'testbruker') {
    const epost = String(body.epost || '').trim().toLowerCase(); const rolle = String(body.rolle || ''); const passord = String(body.passord || '');
    if (!/^\S+@\S+\.\S+$/.test(epost)) return json(400, { error: 'Ugyldig e-postadresse' });
    if (!['admin', 'forvalter', 'tekniker', 'leietaker'].includes(rolle)) return json(400, { error: 'Ugyldig rolle' });
    if (passord.length < 8) return json(400, { error: 'Passordet må ha minst 8 tegn' });
    let id = '';
    const { data, error } = await admin.auth.admin.createUser({ email: epost, password: passord, email_confirm: true, user_metadata: { navn: body.navn || '', test: true } });
    if (error) {
      if (!/already|registered|exists/i.test(error.message)) return json(400, { error: error.message });
      const { data: p } = await admin.from('profiles').select('id').eq('epost', epost).maybeSingle();
      if (!p) return json(409, { error: 'E-posten finnes allerede, men uten profil' });
      id = p.id; await admin.auth.admin.updateUserById(id, { password: passord });
    } else id = data.user!.id;
    const { error: pe } = await admin.from('profiles').upsert({ id, epost, navn: body.navn || epost, rolle, leietaker_id: rolle === 'leietaker' ? body.leietaker_id || null : null, aktiv: true });
    if (pe) return json(500, { error: 'Profilen kunne ikke lagres: ' + pe.message });
    await admin.from('eiendom_tilgang').delete().eq('user_id', id);
    const eiendommer: string[] = Array.isArray(body.eiendommer) ? body.eiendommer : [];
    if (eiendommer.length && ['forvalter', 'tekniker'].includes(rolle)) await admin.from('eiendom_tilgang').insert(eiendommer.map(e => ({ user_id: id, eiendom_id: e })));
    return json(200, { ok: true, id });
  }

  if (body.action === 'slett') {
    if (!body.user_id || body.user_id === u.user.id) return json(400, { error: 'Du kan ikke slette deg selv' });
    const { error } = await admin.auth.admin.deleteUser(body.user_id);
    if (error) return json(400, { error: error.message });
    return json(200, { ok: true });
  }

  return json(400, { error: 'Ukjent handling' });
};
