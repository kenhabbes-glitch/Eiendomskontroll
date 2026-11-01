// Netlify-funksjon for arbeidsordre: sende på e-post, invitere eksterne utførende
// og la dem opprette bruker. Kjører med Supabase service-nøkkel på serveren.
//
// E-post sendes via SMTP (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS – f.eks. Gmail med app-passord)
// eller Resend (RESEND_API_KEY). Avsender settes i EPOST_FRA. Svar går til den som sendte (eller EPOST_SVAR).
// Uten nøkkel returneres teksten, og appen åpner brukerens eget e-postprogram.
import { createClient } from '@supabase/supabase-js';

const json = (status: number, body: any) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[c]);

export default async (req: Request) => {
  try { return await handler(req); }
  catch (e: any) { console.error('arbeidsordre-feil', e); return json(500, { error: 'Serverfeil: ' + (e?.message || String(e)) }); }
};

const handler = async (req: Request) => {
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

  // E-postoppsett: fra appens Innstillinger (tabellen epost_oppsett), ellers miljøvariabler i Netlify.
  type Oppsett = { metode: 'smtp' | 'resend' | ''; fraNavn: string; fraEpost: string; svarTil: string; smtpHost: string; smtpPort: number; smtpUser: string; passord: string; kilde: string };
  const hentOppsett = async (): Promise<Oppsett> => {
    const env = (k: string) => (process.env[k] || '').trim();
    const { data: r } = await admin.from('epost_oppsett').select('*').eq('id', 1).maybeSingle();
    const d = r?.data || {};
    if (d.metode && r?.hemmelig) return { metode: d.metode, fraNavn: d.fraNavn || '', fraEpost: d.fraEpost || d.smtpUser || '', svarTil: d.svarTil || '', smtpHost: d.smtpHost || 'smtp.gmail.com', smtpPort: +d.smtpPort || 465, smtpUser: d.smtpUser || '', passord: r.hemmelig, kilde: 'app' };
    const parse = (f: string) => { const m = f.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/); return m ? [m[1].trim(), m[2].trim()] : ['', f.trim()]; };
    const [n, e] = parse(env('EPOST_FRA'));
    if (env('SMTP_USER') && env('SMTP_PASS')) return { metode: 'smtp', fraNavn: d.fraNavn || n || 'Eiendomskontroll', fraEpost: e || env('SMTP_USER'), svarTil: d.svarTil || env('EPOST_SVAR'), smtpHost: env('SMTP_HOST') || 'smtp.gmail.com', smtpPort: +(env('SMTP_PORT') || 465), smtpUser: env('SMTP_USER'), passord: env('SMTP_PASS'), kilde: 'netlify' };
    if (env('RESEND_API_KEY')) return { metode: 'resend', fraNavn: d.fraNavn || n || 'Eiendomskontroll', fraEpost: e || 'onboarding@resend.dev', svarTil: d.svarTil || env('EPOST_SVAR'), smtpHost: '', smtpPort: 0, smtpUser: '', passord: env('RESEND_API_KEY'), kilde: 'netlify' };
    return { metode: '', fraNavn: d.fraNavn || '', fraEpost: '', svarTil: d.svarTil || '', smtpHost: '', smtpPort: 0, smtpUser: '', passord: '', kilde: '' };
  };
  const sendEpost = async (til: string, emne: string, html: string, tekst: string, vedlegg?: { navn: string; base64: string }, svarTil?: string, o0?: Oppsett) => {
    const o = o0 || await hentOppsett();
    if (!o.metode) return { sendt: false, grunn: 'E-post er ikke satt opp (Innstillinger → E-post for arbeidsordre)' };
    const fra = o.fraNavn ? `"${o.fraNavn.replace(/"/g, '')}" <${o.fraEpost}>` : o.fraEpost; const replyTo = o.svarTil || svarTil || undefined;
    if (o.metode === 'smtp') {
      try {
        const nm: any = await import('nodemailer'); const nodemailer = nm.default || nm; // lastes først når det trengs
        const t = nodemailer.createTransport({ host: o.smtpHost, port: o.smtpPort, secure: o.smtpPort === 465, auth: { user: o.smtpUser, pass: o.passord.replace(/\s+/g, '') }, connectionTimeout: 7000, greetingTimeout: 5000, socketTimeout: 8000 });
        await t.sendMail({ from: fra, to: til, replyTo, subject: emne, text: tekst, html, attachments: vedlegg ? [{ filename: vedlegg.navn, content: vedlegg.base64, encoding: 'base64', contentType: 'application/pdf' }] : undefined });
        return { sendt: true };
      } catch (e: any) { return { sendt: false, grunn: 'E-post feilet (SMTP): ' + (e?.response || e?.message || e) }; }
    }
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + o.passord, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: fra, to: [til], subject: emne, html, text: tekst, ...(replyTo ? { reply_to: replyTo } : {}), ...(vedlegg ? { attachments: [{ filename: vedlegg.navn, content: vedlegg.base64 }] } : {}) }) });
    if (!r.ok) { const j = await r.json().catch(() => ({})); return { sendt: false, grunn: 'E-post feilet (Resend): ' + (j.message || r.status) }; }
    return { sendt: true };
  };

  // ---------- E-postoppsett (bare administrator)
  if (body.action === 'epost_hent' || body.action === 'epost_lagre' || body.action === 'epost_test') {
    const p = await hvem(); if (!p || p.rolle !== 'admin' || !p.aktiv) return json(403, { error: 'Bare administrator kan endre e-postoppsettet' });
    if (body.action === 'epost_hent') {
      const { data: r, error } = await admin.from('epost_oppsett').select('*').eq('id', 1).maybeSingle();
      if (error) return json(500, { error: 'Tabellen epost_oppsett mangler – kjør 004_epost.sql i Supabase' });
      const o = await hentOppsett();
      return json(200, { data: r?.data || {}, harHemmelig: !!r?.hemmelig, aktiv: { metode: o.metode, kilde: o.kilde, fra: o.fraEpost } });
    }
    if (body.action === 'epost_lagre') {
      const d = body.data || {}; const ren = { metode: ['smtp', 'resend'].includes(d.metode) ? d.metode : '', fraNavn: String(d.fraNavn || '').slice(0, 120), fraEpost: String(d.fraEpost || '').trim().slice(0, 200), svarTil: String(d.svarTil || '').trim().slice(0, 200), smtpHost: String(d.smtpHost || '').trim(), smtpPort: +d.smtpPort || 465, smtpUser: String(d.smtpUser || '').trim() };
      const { data: gml } = await admin.from('epost_oppsett').select('hemmelig').eq('id', 1).maybeSingle();
      const hemmelig = typeof body.hemmelig === 'string' && body.hemmelig.trim() ? body.hemmelig.trim() : body.slettHemmelig ? null : gml?.hemmelig ?? null;
      const { error } = await admin.from('epost_oppsett').upsert({ id: 1, data: ren, hemmelig, endret: new Date().toISOString(), endret_av: p.id });
      if (error) return json(500, { error: 'Kunne ikke lagre: ' + error.message });
      await admin.from('hendelseslogg').insert({ bruker_id: p.id, bruker: p.navn || p.epost, tabell: 'hendelse', handling: 'innstilling', tekst: `E-postoppsett endret (${ren.metode || 'av'}, avsender ${ren.fraNavn} <${ren.fraEpost}>)${typeof body.hemmelig === 'string' && body.hemmelig.trim() ? ', nytt passord/nøkkel' : ''}` });
      return json(200, { ok: true });
    }
    const o = await hentOppsett();
    const r = await sendEpost(p.epost, 'Test fra Eiendomskontroll', `<p>Dette er en test av e-postoppsettet.</p><p>Avsender: ${esc(o.fraNavn)} &lt;${esc(o.fraEpost)}&gt;<br>Svar går til: ${esc(o.svarTil || p.epost)}</p>`, `Dette er en test av e-postoppsettet.\nAvsender: ${o.fraNavn} <${o.fraEpost}>`, undefined, p.epost, o);
    return json(200, { ...r, til: p.epost });
  }

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

  // ================= Sjekkliste til leietaker =================
  const hentLt = async (id: string) => { const { data } = await admin.from('leietakere').select('*').eq('id', id).maybeSingle(); return data; };
  const ltLogg = (p: any, l: any, tekst: string) => admin.from('hendelseslogg').insert({ bruker_id: p?.id || null, bruker: p ? (p.navn || p.epost) : 'System', tabell: 'hendelse', rad_id: l.id, eiendom_id: l.eiendom_id, handling: 'sjekkliste', tekst });

  // Eier/forvalter sender sjekklisten til leietaker på e-post (lenke til portalen, evt. med registrering)
  if (body.action === 'lt_send') {
    const p = await hvem(); if (!p || !['admin', 'forvalter'].includes(p.rolle)) return json(403, { error: 'Bare administrator/forvalter kan sende sjekklisten' });
    const l = await hentLt(body.leietaker_id); if (!l) return json(404, { error: 'Fant ikke leietakeren' });
    if (!(await harEiendom(p, l.eiendom_id))) return json(403, { error: 'Du har ikke tilgang til eiendommen' });
    const til = String(body.epost || '').trim().toLowerCase(); if (!/^\S+@\S+\.\S+$/.test(til)) return json(400, { error: 'Ugyldig e-postadresse' });
    const base = typeof body.lenkeBase === 'string' && /^https?:\/\//.test(body.lenkeBase) ? body.lenkeBase.replace(/\/+$/, '') : '';
    const { data: fins } = await admin.from('profiles').select('id, rolle, leietaker_id').eq('epost', til).maybeSingle();
    let lenke = `${base}/#/portal`;
    if (!(fins && fins.rolle === 'leietaker' && fins.leietaker_id === l.id)) {
      const { data: inv, error } = await admin.from('lt_invitasjon').insert({ leietaker_id: l.id, epost: til, opprettet_av: p.id }).select().single();
      if (error) return json(500, { error: 'Kunne ikke lage invitasjon (er 005_sjekkliste.sql kjørt?): ' + error.message });
      lenke = `${base}/#/lt/${inv.token}`;
    }
    const d = l.data || {}; const { data: e } = await admin.from('eiendommer').select('data').eq('id', l.eiendom_id).maybeSingle(); const en = e?.data?.navn || '';
    const pl = (d.plikter || []).filter((x: any) => !x.ikkeRelevant);
    const frist = body.frist ? String(body.frist).split('-').reverse().join('.') : '';
    const melding = String(body.melding || ''); const avs = p.navn || p.epost;
    const emne = `Sjekkliste brann og internkontroll – ${d.navn || ''}${en ? ' (' + en + ')' : ''}`;
    const tekst = [`Hei,`, '', melding || `Som utleier følger vi opp at leietakerne i ${en || 'bygget'} ivaretar sine plikter etter forskrift om brannforebygging og internkontrollforskriften. Vi ber dere fylle ut sjekklisten og laste opp dokumentasjon.`, frist ? `\nFrist: ${frist}` : '', '', 'Punkter:', ...pl.map((x: any) => '- ' + x.navn), '', `Fyll ut her:\n${lenke}`, '', `Hilsen ${avs}`].filter(x => x !== null).join('\n');
    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#1d2320"><p style="font-size:12px;color:#6b736d;margin:0">SJEKKLISTE</p><h2 style="margin:4px 0 12px">Brann og internkontroll – ${esc(d.navn)}</h2>
      <p>${esc(melding || `Som utleier følger vi opp at leietakerne i ${en || 'bygget'} ivaretar sine plikter etter forskrift om brannforebygging og internkontrollforskriften. Vi ber dere fylle ut sjekklisten og laste opp dokumentasjon.`).replace(/\n/g, '<br>')}</p>
      ${frist ? `<p><b>Frist: ${esc(frist)}</b></p>` : ''}<ul>${pl.map((x: any) => `<li>${esc(x.navn)}</li>`).join('')}</ul>
      <p style="margin:20px 0"><a href="${esc(lenke)}" style="background:#1f6f5c;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">Åpne sjekklisten</a></p>
      <p style="font-size:12px;color:#6b736d">Via lenken oppretter du bruker (eller logger inn), krysser av for dokumentasjonen og laster opp filer. Utleier går gjennom og godkjenner.<br>Sendt av ${esc(avs)}.</p></div>`;
    const r = await sendEpost(til, emne, html, tekst, undefined, p.epost || undefined);
    await ltLogg(p, l, `Sjekkliste ${r.sendt ? 'sendt' : 'klargjort'} til ${til} (${d.navn || ''})`);
    await admin.from('leietakere').update({ data: { ...d, sjekklisteSendt: { tid: new Date().toISOString(), til, av: avs, frist: body.frist || '' } } }).eq('id', l.id);
    return json(200, { ...r, til, lenke, emne, tekst });
  }

  // Leietaker åpner lenken (ikke innlogget)
  if (body.action === 'lt_info') {
    const { data: inv } = await admin.from('lt_invitasjon').select('*').eq('token', body.token).maybeSingle();
    if (!inv) return json(404, { error: 'Lenken er ugyldig eller utløpt' });
    const l = await hentLt(inv.leietaker_id); const { data: fins } = await admin.from('profiles').select('id').eq('epost', inv.epost).maybeSingle();
    return json(200, { epost: inv.epost, leietaker: l?.data?.navn || '', brukt: !!inv.brukt, finnes: !!fins });
  }

  // Leietaker oppretter bruker via lenken
  if (body.action === 'lt_registrer') {
    const { data: inv } = await admin.from('lt_invitasjon').select('*').eq('token', body.token).maybeSingle();
    if (!inv) return json(404, { error: 'Lenken er ugyldig' });
    const passord = String(body.passord || ''); if (passord.length < 8) return json(400, { error: 'Passordet må ha minst 8 tegn' });
    const { data: fins } = await admin.from('profiles').select('id').eq('epost', inv.epost).maybeSingle();
    if (fins) return json(409, { error: 'Det finnes allerede en bruker med denne e-posten. Logg inn i stedet.' });
    const { data: u, error } = await admin.auth.admin.createUser({ email: inv.epost, password: passord, email_confirm: true, user_metadata: { navn: body.navn || '' } });
    if (error || !u?.user) return json(400, { error: error?.message || 'Kunne ikke opprette bruker' });
    const navn = String(body.navn || '').trim() || inv.epost;
    await admin.from('profiles').upsert({ id: u.user.id, epost: inv.epost, navn, rolle: 'leietaker', leietaker_id: inv.leietaker_id, aktiv: true });
    await admin.from('lt_invitasjon').update({ brukt: new Date().toISOString(), bruker_id: u.user.id }).eq('token', inv.token);
    const l = await hentLt(inv.leietaker_id); if (l) await ltLogg({ id: u.user.id, navn }, l, `Leietakerbruker ${inv.epost} opprettet via sjekkliste-lenke`);
    return json(200, { ok: true, epost: inv.epost });
  }

  // Innlogget bruker aksepterer lenken (kobles til leietakeren)
  if (body.action === 'lt_aksepter') {
    const p = await hvem(); if (!p) return json(401, { error: 'Ikke innlogget' });
    const { data: inv } = await admin.from('lt_invitasjon').select('*').eq('token', body.token).maybeSingle();
    if (!inv) return json(404, { error: 'Lenken er ugyldig' });
    if (inv.epost.toLowerCase() !== p.epost) return json(403, { error: `Lenken ble sendt til ${inv.epost}. Logg inn med den adressen.` });
    if (['admin', 'forvalter', 'tekniker'].includes(p.rolle)) return json(200, { ok: true, ansatt: true, leietaker_id: inv.leietaker_id });
    if (p.rolle === 'leietaker' && p.leietaker_id && p.leietaker_id !== inv.leietaker_id) return json(409, { error: 'Brukeren din er allerede koblet til en annen leietaker. Kontakt utleier.' });
    await admin.from('profiles').update({ rolle: 'leietaker', leietaker_id: inv.leietaker_id, aktiv: true }).eq('id', p.id);
    if (!inv.brukt) await admin.from('lt_invitasjon').update({ brukt: new Date().toISOString(), bruker_id: p.id }).eq('token', inv.token);
    return json(200, { ok: true });
  }

  return json(400, { error: 'Ukjent handling' });
};
