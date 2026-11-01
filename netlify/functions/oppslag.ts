// Mellomledd for oppslag i åpne registre (Kartverket, Brønnøysund) når nettleseren
// ikke kan kalle dem direkte. Kun forhåndsdefinerte oppslag, kun for innloggede brukere.
import { createClient } from '@supabase/supabase-js';
import ws from 'ws'; // Node < 22 mangler innebygd WebSocket, som supabase-js krever

const json = (status: number, body: any) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=300' } });
const rens = (u?: string) => (u || '').trim().replace(/\/(rest|auth|storage)\/v1.*$/i, '').replace(/\/+$/, '');

export default async (req: Request) => {
  const url = rens(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
  const anon = (process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!url || !anon || !token) return json(401, { error: 'Ikke innlogget' });
  const sb = createClient(url, anon, { auth: { persistSession: false }, realtime: { transport: ws as any } });
  const { data: u } = await sb.auth.getUser(token);
  if (!u?.user) return json(401, { error: 'Ikke innlogget' });

  const q = new URL(req.url).searchParams; const type = q.get('type');
  let target = '';
  if (type === 'adresse') {
    const p = new URLSearchParams(q.get('p') || '');
    const ok = new URLSearchParams();
    for (const k of ['sok', 'gardsnummer', 'bruksnummer', 'festenummer', 'seksjonsnummer', 'kommunenavn', 'kommunenummer', 'treffPerSide', 'utkoordsys']) { const v = p.get(k); if (v) ok.set(k, v.slice(0, 100)); }
    target = 'https://ws.geonorge.no/adresser/v1/sok?' + ok.toString();
  } else if (type === 'enheter') {
    target = 'https://data.brreg.no/enhetsregisteret/api/enheter?size=10&navn=' + encodeURIComponent((q.get('navn') || '').slice(0, 100));
  } else if (type === 'enhet' || type === 'roller') {
    const nr = (q.get('orgnr') || '').replace(/\D/g, '');
    if (nr.length !== 9) return json(400, { error: 'Ugyldig organisasjonsnummer' });
    target = `https://data.brreg.no/enhetsregisteret/api/enheter/${nr}${type === 'roller' ? '/roller' : ''}`;
  } else return json(400, { error: 'Ukjent oppslag' });

  const r = await fetch(target, { headers: { Accept: 'application/json' } });
  const body = await r.text();
  return new Response(body, { status: r.status, headers: { 'Content-Type': 'application/json' } });
};
