// Netlify-funksjon for arbeidsordre: sende på e-post, invitere eksterne utførende
// og la dem opprette bruker. Kjører med Supabase service-nøkkel på serveren.
//
// E-post sendes via SMTP (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS – f.eks. Gmail med app-passord)
// eller Resend (RESEND_API_KEY). Avsender settes i EPOST_FRA. Svar går til den som sendte (eller EPOST_SVAR).
// Uten nøkkel returneres teksten, og appen åpner brukerens eget e-postprogram.
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

const json = (status: number, body: any) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[c]);

export default async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'Bare POST' });
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim().replace(/\/(rest|auth|storage)\/v1.*$/i, '').replace(/\/+$/, '');
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) return json(500, { error: 'Serveren mangler SUPABASE_URL eller SUPABASE_SERVICE_ROLE_KEY' });
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  let body: any; try { body = await req.json(); } catch { return json(400, { error: 'Ugyldig forespørsel' }); }

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const hvem = async () => {
    if (!token) return null; const { data } = await admin.auth.getUser(token); if (!data?.user) return null;
    const { data: p } = await admin.from('profiles').select('*').eq('id', data.user.id).single(); return p ? { ...p, epost: (p.epost || data.user.email || '').toLowerCase() } : null;
  };
  const harEiendom = async (p: any, eid: string) => {
    if (!p || !p.aktiv) return false; if (p.rolle === 'admin') return true;
    if (!['forvalter', 'tekniker'].includes(p.rolle)) return false;
    const { data } = await admin.from('eiendom_tilgang').select('eiendom_id').eq('user_id', p.id).eq('eiendom_id', eid); return !!data?.length;
  };
  const logg = (p: any, a: any, tekst: string) => admin.from('hendelseslogg').insert({ bruker_id: p?.id || null, bruker: p ? (p.navn || p.epost) : 'System', tabell: 'hendelse', rad_id: a.id, eiendom_id: a.eiendom_id, handling: 'arbeidsordre', tekst });
  const leggTilAvvikLogg = async (a: any, k: string, av: string) => { const d = a.data || {}; const l = [...(d.logg || []), { t: new Date().toISOString(), s: d.status, k, av }]; await admin.from('avvik').update({ data: { ...d, logg: l } }).eq('id', a.id); };
  const hentAvvik = async (id: string) => { const { data } = await admin.from('avvik').select('*').eq('id', id).single(); return data; };

  // E-post: SMTP (f.eks. Gmail eller kundens e-postserver) brukes hvis SMTP_* er satt, ellers Resend, ellers ingen.
  const sendEpost = async (til: string, emne: string, html: string, tekst: string, vedlegg?: { navn: string; base64: string }, svarTil?: string) => {
    const env = (k: string) => (process.env[k] || '').trim();
    const replyTo = env('EPOST_SVAR') || svarTil || undefined;
    if (env('SMTP_USER') && env('SMTP_PASS')) {
      const port = +(env('SMTP_PORT') || 465);
      const fra = env('EPOST_FRA') || `Eiendomskontroll <${env('SMTP_USER')}>`;
      try {
        const t = nodemailer.createTransport({ host: env('SMTP_HOST') || 'smtp.gmail.com', port, secure: port === 465, auth: { user: env('SMTP_USER'), pass: env('SMTP_PASS').replace(/\s+/g, '') } });
        await t.sendMail({ from: fra, to: til, replyTo, subject: emne, text: tekst, html, attachments: vedlegg ? [{ filename: vedlegg.navn, content: vedlegg.base64, encoding: 'base64', contentType: 'application/pdf' }] : undefined });
        return { sendt: true };
      } catch (e: any) { return { sendt: false, grunn: 'E-post feilet (SMTP): ' + (e?.response || e?.message || e) }; }
    }
    const rk = env('RESEND_API_KEY'); const fra = env('EPOST_FRA') || 'Eiendomskontroll <onboarding@resend.dev>';
    if (!rk) return { sendt: false, grunn: 'E-posttjeneste er ikke satt opp (SMTP_USER/SMTP_PASS eller RESEND_API_KEY mangler)' };
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + rk, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: fra, to: [til], subject: emne, html, text: tekst, ...(replyTo ? { reply_to: replyTo } : {}), ...(vedlegg ? { attachments: [{ filename: vedlegg.navn, content: vedlegg.base64 }] } : {}) }) });
    if (!r.ok) { const j = await r.json().catch(() => ({})); return { sendt: false, grunn: 'E-post feilet: ' + (j.message || r.status) }; }
    return { sendt: true };
  };
  const aoTekst = (a: any, lenke: string, melding: string, avsender: string) => {
    const d = a.data || {}; const ao = d.ao || {};
    const linjer = [
      `Arbeidsordre – avvik #${a.nr}: ${d.tittel || ''}`, '',
      melding ? melding + '\n' : '',
      `Eiendom: ${ao.eiendom || ''}${ao.adresse ? ', ' + ao.adresse : ''}`,
      ao.system ? `System: ${ao.system}` : '', ao.komponent ? `Komponent: ${ao.komponent}` : '',
      ao.tegning ? `Plassering: ${ao.tegning}${ao.plassering ? ' – ' + ao.plassering : ''} (se markering på tegning i lenken/vedlegget)` : ao.plassering ? `Plassering: ${ao.plassering}` : '',
      `Alvorlighet: ${d.alv || ''}${d.frist ? ' · Frist: ' + d.frist.split('-').reverse().join('.') : ''}`,
      d.beskrivelse ? '\nBeskrivelse:\n' + d.beskrivelse : '', '',
      `Åpne arbeidsordren, kvitter ut og last opp bilder/dokumentasjon her:\n${lenke}`, '',
      `Sendt av ${avsender}`].filter(x => x !== '');
    const tekst = linjer.join('\n');
    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#1d2320">
      <p style="font-size:12px;color:#6b736d;margin:0">ARBEIDSORDRE</p><h2 style="margin:4px 0 12px">Avvik #${a.nr}: ${esc(d.tittel)}</h2>
      ${melding ? `<p>${esc(melding).replace(/\n/g, '<br>')}</p>` : ''}
      <table style="border-collapse:collapse;font-size:14px">${[['Eiendom', (ao.eiendom || '') + (ao.adresse ? ', ' + ao.adresse : '')], ['System', ao.system], ['Komponent', ao.komponent], ['Plassering', [ao.tegning, ao.plassering].filter(Boolean).join(' – ')], ['Alvorlighet', d.alv], ['Frist', d.frist ? d.frist.split('-').reverse().join('.') : '']].filter(r => r[1]).map(r => `<tr><td style="padding:3px 14px 3px 0;color:#6b736d">${r[0]}</td><td style="padding:3px 0">${esc(r[1])}</td></tr>`).join('')}</table>
      ${d.beskrivelse ? `<p style="margin-top:12px"><b>Beskrivelse</b><br>${esc(d.beskrivelse).replace(/\n/g, '<br>')}</p>` : ''}
      <p style="margin:20px 0"><a href="${esc(lenke)}" style="background:#1f6f5c;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">Åpne arbeidsordren</a></p>
      <p style="font-size:12px;color:#6b736d">Via lenken kan du opprette bruker (eller logge inn), se plasseringen på tegningen, kvittere ut jobben og laste opp bilder og dokumentasjon.<br>Sendt av ${esc(avsender)}.</p></div>`;
    return { emne: `Arbeidsordre – avvik #${a.nr}: ${d.tittel || ''}`, tekst, html };
  };

  // ---------- Ansatt sender arbeidsordre til e-post (inviterer)
  if (body.action === 'inviter' || body.action === 'varsle') {
    const p = await hvem(); if (!p) return json(401, { error: 'Ikke innlogget' });
    const a = await hentAvvik(body.avvik_id); if (!a) return json(404, { error: 'Fant ikke avviket' });
    if (!(await harEiendom(p, a.eiendom_id))) return json(403, { error: 'Du har ikke tilgang til eiendommen' });
    const base = typeof body.lenkeBase === 'string' && /^https?:\/\//.test(body.lenkeBase) ? body.lenkeBase.replace(/\/+$/, '') : '';
    let til = String(body.epost || '').trim().toLowerCase(); let lenke = '';
    if (body.action === 'inviter') {
      if (!/^\S+@\S+\.\S+$/.test(til)) return json(400, { error: 'Ugyldig e-postadresse' });
      const { data: inv, error } = await admin.from('ao_invitasjon').insert({ avvik_id: a.id, epost: til, opprettet_av: p.id }).select().single();
      if (error) return json(500, { error: 'Kunne ikke lage invitasjon: ' + error.message });
      lenke = `${base}/#/ao/${inv.token}`;
    } else {
      if (!a.tildelt_id) return json(400, { error: 'Avviket er ikke tildelt noen' });
      const { data: t } = await admin.from('profiles').select('epost, navn').eq('id', a.tildelt_id).single(); til = (t?.epost || '').toLowerCase();
      if (!til) return json(400, { error: 'Mottakeren mangler e-post' });
      lenke = `${base}/#/arbeidsordre/${a.id}`;
    }
    const m = aoTekst(a, lenke, String(body.melding || ''), p.navn || p.epost);
    const vedlegg = typeof body.pdf === 'string' && body.pdf.length < 8_000_000 ? { navn: `Arbeidsordre avvik ${a.nr}.pdf`, base64: body.pdf } : undefined;
    const r = await sendEpost(til, m.emne, m.html, m.tekst, vedlegg, p.epost || undefined);
    const hva = body.action === 'inviter' ? `Arbeidsordre ${r.sendt ? 'sendt' : 'klargjort'} på e-post til ${til}` : `Varsel om tildeling ${r.sendt ? 'sendt' : 'klargjort'} på e-post til ${til}`;
    await logg(p, a, hva); if (r.sendt) await leggTilAvvikLogg(a, hva, p.navn || p.epost);
    return json(200, { ...r, til, lenke, emne: m.emne, tekst: m.tekst });
  }

  // ---------- Mottaker åpner lenken (ikke innlogget)
  if (body.action === 'info') {
    const { data: inv } = await admin.from('ao_invitasjon').select('*').eq('token', body.token).maybeSingle();
    if (!inv) return json(404, { error: 'Lenken er ugyldig eller avviket er slettet' });
    const a = await hentAvvik(inv.avvik_id); const d = a?.data || {};
    const { data: fins } = await admin.from('profiles').select('id').eq('epost', inv.epost).maybeSingle();
    return json(200, { epost: inv.epost, nr: a?.nr, tittel: d.tittel, eiendom: d.ao?.eiendom || '', brukt: !!inv.brukt, finnes: !!fins });
  }

  // ---------- Mottaker oppretter bruker via lenken
  if (body.action === 'registrer') {
    const { data: inv } = await admin.from('ao_invitasjon').select('*').eq('token', body.token).maybeSingle();
    if (!inv) return json(404, { error: 'Lenken er ugyldig' });
    const passord = String(body.passord || ''); if (passord.length < 8) return json(400, { error: 'Passordet må ha minst 8 tegn' });
    const { data: fins } = await admin.from('profiles').select('id').eq('epost', inv.epost).maybeSingle();
    if (fins) return json(409, { error: 'Det finnes allerede en bruker med denne e-posten. Logg inn i stedet.' });
    const { data: u, error } = await admin.auth.admin.createUser({ email: inv.epost, password: passord, email_confirm: true, user_metadata: { navn: body.navn || '' } });
    if (error || !u?.user) return json(400, { error: error?.message || 'Kunne ikke opprette bruker' });
    const navn = String(body.navn || '').trim() || inv.epost; const firma = String(body.firma || '').trim();
    await admin.from('profiles').upsert({ id: u.user.id, epost: inv.epost, navn: firma ? `${navn} (${firma})` : navn, rolle: 'utforer', aktiv: true });
    const a = await hentAvvik(inv.avvik_id);
    if (a) { await admin.from('avvik').update({ tildelt_id: u.user.id }).eq('id', a.id); await leggTilAvvikLogg(a, `Bruker opprettet og arbeidsordren akseptert av ${navn}`, navn); await logg({ id: u.user.id, navn }, a, `Ekstern bruker ${inv.epost} opprettet via arbeidsordre og tildelt avviket`); }
    await admin.from('ao_invitasjon').update({ brukt: new Date().toISOString(), bruker_id: u.user.id }).eq('token', inv.token);
    return json(200, { ok: true, epost: inv.epost, avvik_id: inv.avvik_id });
  }

  // ---------- Innlogget mottaker aksepterer lenken
  if (body.action === 'aksepter') {
    const p = await hvem(); if (!p) return json(401, { error: 'Ikke innlogget' });
    const { data: inv } = await admin.from('ao_invitasjon').select('*').eq('token', body.token).maybeSingle();
    if (!inv) return json(404, { error: 'Lenken er ugyldig' });
    if (inv.epost.toLowerCase() !== p.epost) return json(403, { error: `Lenken ble sendt til ${inv.epost}. Logg inn med den adressen.` });
    const a = await hentAvvik(inv.avvik_id); if (!a) return json(404, { error: 'Avviket finnes ikke lenger' });
    if (p.rolle === 'ingen') await admin.from('profiles').update({ rolle: 'utforer', aktiv: true }).eq('id', p.id);
    if (a.tildelt_id !== p.id) { await admin.from('avvik').update({ tildelt_id: p.id }).eq('id', a.id); await leggTilAvvikLogg(a, `Arbeidsordren akseptert av ${p.navn || p.epost}`, p.navn || p.epost); await logg(p, a, `Arbeidsordre akseptert av ${p.epost}`); }
    if (!inv.brukt) await admin.from('ao_invitasjon').update({ brukt: new Date().toISOString(), bruker_id: p.id }).eq('token', inv.token);
    return json(200, { ok: true, avvik_id: a.id });
  }

  return json(400, { error: 'Ukjent handling' });
};
