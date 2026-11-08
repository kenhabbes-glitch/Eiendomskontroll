// Melding av avvik via QR-kode, uten innlogging.
// Offentlig endepunkt. Et meldepunkt (tabellen qr_punkter) har en lang tilfeldig token. Funksjonen
//  * action «info»: gir navnet på eiendommen og stedet (ingenting annet),
//  * action «meld»: oppretter et vanlig avvik (kilde «QR-melding», status «Ny») med valgfritt bilde.
// Misbruksvern: honningkrukkefelt, lengdebegrensninger, bare bilder (maks 4 MB), og grenser per
// meldepunkt og per eiendom per time. Service-nøkkelen brukes bare her på serveren.
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

const json = (status: number, body: any) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const MAKS_PUNKT = 15, MAKS_EIENDOM = 60, MAKS_BILDE = 4e6;
const FRIST: Record<string, number> = { Kritisk: 7, 'Høy': 30, Middels: 90, Lav: 365 };
const MIME_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic' };

export default async (req: Request) => {
  try { return await handler(req); }
  catch (e: any) { console.error('qr-meld-feil', e); return json(500, { error: 'Noe gikk galt. Prøv igjen senere.' }); }
};

const handler = async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'Bare POST' });
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim().replace(/\/(rest|auth|storage)\/v1.*$/i, '').replace(/\/+$/, '');
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) return json(500, { error: 'Serveren er ikke satt opp' });
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { transport: ws as any } });

  let b: any; try { b = await req.json(); } catch { return json(400, { error: 'Ugyldig forespørsel' }); }
  const token = String(b.t || '');
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return json(404, { error: 'Ukjent meldepunkt' });
  const { data: p } = await admin.from('qr_punkter').select('*').eq('token', token).maybeSingle();
  if (!p || p.data?.aktiv === false) return json(404, { error: 'Dette meldepunktet er ikke lenger i bruk' });
  const { data: e } = await admin.from('eiendommer').select('id, data').eq('id', p.eiendom_id).maybeSingle();
  if (!e) return json(404, { error: 'Ukjent meldepunkt' });
  const eNavn = e.data?.navn || 'Eiendommen';

  if (b.action === 'info') return json(200, { eiendom: eNavn, navn: p.navn, sted: p.data?.sted || '' });
  if (b.action !== 'meld') return json(400, { error: 'Ukjent handling' });

  if (b.nettside) return json(200, { ok: true }); // honningkrukke
  const tittel = String(b.tittel || '').trim().slice(0, 150); const beskr = String(b.beskrivelse || '').trim().slice(0, 2000);
  const alv = FRIST[b.alv] ? String(b.alv) : 'Middels';
  const navn = String(b.navn || '').trim().slice(0, 80); const kontakt = String(b.kontakt || '').trim().slice(0, 120);
  if (tittel.length < 3) return json(400, { error: 'Skriv kort hva som er galt' });

  const enTime = new Date(Date.now() - 3600e3).toISOString();
  const { count: nP } = await admin.from('avvik').select('id', { count: 'exact', head: true }).eq('eiendom_id', p.eiendom_id).gte('created_at', enTime).contains('data', { qrId: p.id });
  if ((nP || 0) >= MAKS_PUNKT) return json(429, { error: 'Det er sendt mange meldinger fra dette stedet nå. Prøv igjen senere, eller ring driftsansvarlig.' });
  const { count: nE } = await admin.from('avvik').select('id', { count: 'exact', head: true }).eq('eiendom_id', p.eiendom_id).gte('created_at', enTime).contains('data', { kilde: 'QR-melding' });
  if ((nE || 0) >= MAKS_EIENDOM) return json(429, { error: 'Mange meldinger akkurat nå. Prøv igjen senere.' });

  let vedlegg: any[] = [];
  if (b.fil?.b64) {
    const mime = String(b.fil.type || '').toLowerCase(); const ext = MIME_EXT[mime];
    if (!ext) return json(400, { error: 'Bare bilder (JPEG, PNG, WebP) kan legges ved' });
    const buf = Buffer.from(String(b.fil.b64), 'base64');
    if (!buf.length || buf.length > MAKS_BILDE) return json(400, { error: 'Bildet er for stort (maks 4 MB)' });
    const path = `${p.eiendom_id}/qr/${crypto.randomUUID()}.${ext}`;
    const { error } = await admin.storage.from('filer').upload(path, buf, { contentType: mime, upsert: false });
    if (error) return json(500, { error: 'Bildet kunne ikke lagres. Send meldingen uten bilde, eller prøv igjen.' });
    vedlegg = [{ path, navn: 'bilde.' + ext, type: mime, str: buf.length }];
  }

  const idag = new Date().toISOString().slice(0, 10);
  const fr = new Date(Date.now() + FRIST[alv] * 864e5).toISOString().slice(0, 10);
  const av = navn || 'Anonym (QR-melding)';
  const sted = [p.navn, p.data?.sted].filter(Boolean).join(' – ');
  const data: any = {
    tittel, beskrivelse: [beskr, sted ? 'Sted: ' + sted : ''].filter(Boolean).join('\n'), alv, status: 'Ny', kilde: 'QR-melding', ansvar: 'Eier',
    meldtAv: av, meldtKontakt: kontakt || undefined, qrId: p.id, oppdaget: idag, frist: fr,
    anleggId: p.data?.systemId || '', komponentId: '', ...(vedlegg.length ? { vedlegg } : {}),
    logg: [{ t: new Date().toISOString(), s: 'Ny', k: `Meldt via QR-kode (${p.navn})`, av }],
  };
  const { data: ny, error } = await admin.from('avvik').insert({ eiendom_id: p.eiendom_id, data }).select('id, nr').single();
  if (error) { console.error('qr-avvik', error); return json(500, { error: 'Meldingen kunne ikke lagres. Prøv igjen.' }); }
  return json(200, { ok: true, nr: ny.nr });
};
