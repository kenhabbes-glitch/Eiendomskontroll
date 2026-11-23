// Push-varsler: enhetene melder seg på/av her, og appen kan be om et varsel til organisasjonens ansatte.
// Alle kall krever innlogging. Nøklene (VAPID) lages automatisk og ligger bare i databasen.
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import { vapid, pushTilBrukere, pushTilOrg } from '../../src/lib/serverPush';

const json = (status: number, body: any) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const aalFra = (t: string) => { try { return JSON.parse(Buffer.from(t.split('.')[1] || '', 'base64url').toString()).aal || ''; } catch { return ''; } };
export const TYPER = ['melding', 'kritisk', 'oversikt', 'drift'];

export default async (req: Request) => {
  try { return await handler(req); } catch (e: any) { console.error('push-feil', e); return json(500, { error: 'Serverfeil' }); }
};
const handler = async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'Bare POST' });
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim().replace(/\/(rest|auth|storage)\/v1.*$/i, '').replace(/\/+$/, '');
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) return json(500, { error: 'Serveren er ikke satt opp' });
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { transport: ws as any } });
  let b: any; try { b = await req.json(); } catch { return json(400, { error: 'Ugyldig forespørsel' }); }
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return json(401, { error: 'Ikke innlogget' });
  const { data: u } = await admin.auth.getUser(token); if (!u?.user) return json(401, { error: 'Ikke innlogget' });
  const { data: mok } = await admin.rpc('mfa_ok_for', { p_uid: u.user.id, p_aal: aalFra(token) }); if (mok === false) return json(401, { error: 'Ikke innlogget' });
  const uid = u.user.id;
  const rens = (t: any) => (Array.isArray(t) ? t : []).filter((x: any) => TYPER.includes(x));

  if (b.action === 'nokkel') { const k = await vapid(admin); if (!k) return json(500, { error: 'Nøkkel mangler' }); return json(200, { nokkel: k.offentlig }); }

  if (b.action === 'status') {
    const { data } = await admin.from('push_abonnement').select('endpoint, typer').eq('user_id', uid);
    return json(200, { enheter: (data || []).length, abonnement: (data || []).find((s: any) => s.endpoint === b.endpoint) || null });
  }

  if (b.action === 'abonner') {
    const s = b.abonnement || {}; const endpoint = String(s.endpoint || ''); const p256dh = String(s.keys?.p256dh || ''); const auth = String(s.keys?.auth || '');
    if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !p256dh || !auth) return json(400, { error: 'Ugyldig abonnement' });
    const typer = rens(b.typer);
    const { data: fins } = await admin.from('push_abonnement').select('id').eq('endpoint', endpoint).maybeSingle();
    const rad = { user_id: uid, endpoint, p256dh, auth, typer, enhet: String(b.enhet || '').slice(0, 100) };
    if (fins) await admin.from('push_abonnement').update(rad).eq('id', fins.id); else await admin.from('push_abonnement').insert(rad);
    return json(200, { ok: true });
  }

  if (b.action === 'typer') {
    await admin.from('push_abonnement').update({ typer: rens(b.typer) }).eq('user_id', uid).eq('endpoint', String(b.endpoint || '')); return json(200, { ok: true });
  }

  if (b.action === 'avslutt') {
    await admin.from('push_abonnement').delete().eq('user_id', uid).eq('endpoint', String(b.endpoint || '')); return json(200, { ok: true });
  }

  if (b.action === 'test') {
    const n = await pushTilBrukere(admin, [uid], TYPER, { tittel: 'Eiendomskontroll', tekst: 'Varsler fungerer på denne enheten.', url: '/', tag: 'test' });
    return json(200, { sendt: n });
  }

  // Ny sak fra leietaker (innlogget i portalen): varsler eiendommens ansatte
  if (b.action === 'melding') {
    const { data: a } = await admin.from('avvik').select('id, eiendom_id, data').eq('id', String(b.avvik_id || '')).maybeSingle(); if (!a) return json(404, { error: 'Fant ikke saken' });
    const { data: p } = await admin.from('profiles').select('rolle, leietaker_id, aktiv').eq('id', uid).maybeSingle();
    if (!p?.aktiv || p.rolle !== 'leietaker' || a.data?.leietakerId !== p.leietaker_id) return json(403, { error: 'Ikke tillatt' });
    if (a.data?.pushSendt) return json(200, { sendt: 0 });
    const { data: e } = await admin.from('eiendommer').select('eier_org_id, data').eq('id', a.eiendom_id).maybeSingle(); if (!e?.eier_org_id) return json(200, { sendt: 0 });
    const kritisk = a.data?.alv === 'Kritisk';
    const n = await pushTilOrg(admin, e.eier_org_id, kritisk ? ['kritisk', 'melding'] : ['melding'], { tittel: (kritisk ? 'KRITISK sak: ' : 'Ny sak: ') + String(a.data?.tittel || '').slice(0, 80), tekst: [e.data?.navn || e.data?.adresse, 'Meldt av leietaker'].filter(Boolean).join(' – '), url: '/#/avvik', tag: 'avvik-' + a.id }, undefined, a.eiendom_id);
    await admin.from('avvik').update({ data: { ...a.data, pushSendt: true } }).eq('id', a.id);
    return json(200, { sendt: n });
  }
  return json(400, { error: 'Ukjent handling' });
};
