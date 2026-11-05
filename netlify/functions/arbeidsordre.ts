// Netlify-funksjon for arbeidsordre: sende på e-post, invitere eksterne utførende
// og la dem opprette bruker. Kjører med Supabase service-nøkkel på serveren.
//
// E-post sendes via SMTP (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS – f.eks. Gmail med app-passord)
// eller Resend (RESEND_API_KEY). Avsender settes i EPOST_FRA. Svar går til den som sendte (eller EPOST_SVAR).
// Uten nøkkel returneres teksten, og appen åpner brukerens eget e-postprogram.
import { createClient } from '@supabase/supabase-js';
import { kompForKontroll, nyRunde, malIRunde, renKompSvar, sjekkMaler, punkterFor, sysSjekkFor, renSysSjekk, sysSjekkAvvik } from '../../src/lib/komponentsjekk';
import ws from 'ws'; // Node < 22 mangler innebygd WebSocket, som supabase-js krever

const svakt = (pw: string) => pw.length < 10 || !/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/\d/.test(pw);
const aalFra = (t: string) => { try { return JSON.parse(Buffer.from(t.split('.')[1] || '', 'base64url').toString()).aal || ''; } catch { return ''; } };
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
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { transport: ws as any } });
  let body: any; try { body = await req.json(); } catch { return json(400, { error: 'Ugyldig forespørsel' }); }

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const hvem = async () => {
    if (!token) return null; const { data } = await admin.auth.getUser(token); if (!data?.user) return null;
    // Tofaktor: samme regel som i databasen (token er verifisert av getUser, så aal-feltet er til å stole på)
    const { data: mok } = await admin.rpc('mfa_ok_for', { p_uid: data.user.id, p_aal: aalFra(token) }); if (mok === false) return null;
    const { data: p } = await admin.from('profiles').select('*').eq('id', data.user.id).single(); return p ? { ...p, epost: (p.epost || data.user.email || '').toLowerCase() } : null;
  };
  // Tilgang avgjøres av databasens tilgangsfunksjon (organisasjon, oppdrag og tildeling)
  const niva = async (p: any, eid: string) => { if (!p || !p.aktiv) return null; const { data } = await admin.rpc('niva_for', { p_uid: p.id, eid }); return data as string | null; };
  const harEiendom = async (p: any, eid: string) => ['skriv', 'drift'].includes((await niva(p, eid)) || '');
  const kanRedigere = async (p: any, eid: string) => (await niva(p, eid)) === 'skriv';
  // Organisasjonen e-post sendes på vegne av: den som sender sin primære organisasjon
  const minOrg = async (p: any): Promise<string | null> => {
    const { data } = await admin.from('org_medlem').select('org_id, rolle, opprettet, organisasjoner!inner(type, aktiv)').eq('user_id', p.id).eq('aktiv', true);
    const L = (data || []).filter((m: any) => m.organisasjoner?.aktiv).sort((a: any, b: any) => (b.rolle === 'admin' ? 1 : 0) - (a.rolle === 'admin' ? 1 : 0) || (b.organisasjoner.type === 'eier' ? 1 : 0) - (a.organisasjoner.type === 'eier' ? 1 : 0) || String(a.opprettet).localeCompare(String(b.opprettet)));
    return L[0]?.org_id || null;
  };;
  const logg_ = (a: any, hvem: string, tekst: string) => admin.from('hendelseslogg').insert({ bruker_id: null, bruker: hvem, tabell: 'hendelse', rad_id: a.id, eiendom_id: a.eiendom_id, handling: 'arbeidsordre', tekst });
  const logg = (p: any, a: any, tekst: string) => admin.from('hendelseslogg').insert({ bruker_id: p?.id || null, bruker: p ? (p.navn || p.epost) : 'System', tabell: 'hendelse', rad_id: a.id, eiendom_id: a.eiendom_id, handling: 'arbeidsordre', tekst });
  const leggTilAvvikLogg = async (a: any, k: string, av: string) => { const d = a.data || {}; const l = [...(d.logg || []), { t: new Date().toISOString(), s: d.status, k, av }]; await admin.from('avvik').update({ data: { ...d, logg: l } }).eq('id', a.id); };
  const hentAvvik = async (id: string) => { const { data } = await admin.from('avvik').select('*').eq('id', id).single(); return data; };
  // Personvern: bekreftelse kreves før eksterne sender inn opplysninger eller oppretter bruker
  const samtykke = (b: any) => b?.samtykke === true && typeof b?.personvernVersjon === 'string' ? { versjon: String(b.personvernVersjon).slice(0, 40), tid: new Date().toISOString() } : null;
  const SAMTYKKE_MANGLER = 'Du må lese og godta personvernerklæringen før du fortsetter.';
  const utlopt = (inv: any) => !!inv?.utloper && new Date(inv.utloper).getTime() < Date.now();
  const UTLOPT = 'Lenken er utløpt. Be oppdragsgiveren om å sende arbeidsordren på nytt.';
  // ---------- Tilstand (TG/KG) fra utførende: forslag til endring på systemet/komponenten
  const TG_OK = ['TG0', 'TG1', 'TG2', 'TG3', 'TGIU'], KG_OK = ['KG0', 'KG1', 'KG2', 'KG3'];
  const renTilstand = (t: any) => t && TG_OK.includes(t.tg) ? { tg: t.tg, kg: KG_OK.includes(t.kg) ? t.kg : '', komm: String(t.komm || '').slice(0, 2000) } : null;
  const tgMaal = async (komponentId?: string, anleggId?: string) => {
    if (komponentId) { const { data } = await admin.from('komponenter').select('*').eq('id', komponentId).maybeSingle(); if (data) return { tabell: 'komponenter', rad: data }; }
    if (anleggId) { const { data } = await admin.from('systemer').select('*').eq('id', anleggId).maybeSingle(); if (data) return { tabell: 'systemer', rad: data }; }
    return null;
  };
  const tgNaa = (m: any) => m ? { tg: m.rad.data?.tg || '', kg: m.rad.data?.kg || '', navn: m.rad.data?.navn || '', kode: m.tabell === 'komponenter' ? '-' + (m.rad.data?.kode || '') + String(m.rad.data?.lop || 1).padStart(3, '0') : (m.rad.data?.tfmSys ? '=' + m.rad.data.tfmSys + '.' + String(m.rad.data.tfmLop || 1).padStart(3, '0') : '') } : null;
  const lagTgForslag = async (m: any, t: any, av: string, kilde: string, ref: any) => {
    if (!m || !t) return false; const d = m.rad.data || {};
    if (t.tg === (d.tg || '') && (!t.kg || t.kg === (d.kg || ''))) return false; // samme som registrert – ikke noe forslag
    const forslag = { ...t, av: av.slice(0, 200), dato: new Date().toISOString().slice(0, 10), mottatt: new Date().toISOString(), kilde: kilde.slice(0, 200), ...ref, fra: { tg: d.tg || '', kg: d.kg || '' } };
    await admin.from(m.tabell).update({ data: { ...d, tgForslag: forslag } }).eq('id', m.rad.id);
    await admin.from('hendelseslogg').insert({ bruker_id: null, bruker: av, tabell: 'hendelse', rad_id: m.rad.id, eiendom_id: m.rad.eiendom_id, handling: 'tilstand', tekst: `Forslag til endret tilstand ${d.tg || 'ikke vurdert'}${d.kg ? '/' + d.kg : ''} → ${t.tg}${t.kg ? '/' + t.kg : ''} (${kilde})` });
    return true;
  };
  const orgNavnFor = async (eid: string) => { const { data: e } = await admin.from('eiendommer').select('eier_org_id').eq('id', eid).maybeSingle(); if (!e?.eier_org_id) return ''; const { data: o } = await admin.from('organisasjoner').select('navn').eq('id', e.eier_org_id).maybeSingle(); return o?.navn || ''; };

  // E-postoppsett: fra appens Innstillinger (tabellen epost_oppsett), ellers miljøvariabler i Netlify.
  type Oppsett = { metode: 'smtp' | 'resend' | ''; fraNavn: string; fraEpost: string; svarTil: string; smtpHost: string; smtpPort: number; smtpUser: string; passord: string; kilde: string };
  const hentOppsett = async (org?: string | null): Promise<Oppsett> => {
    const env = (k: string) => (process.env[k] || '').trim();
    const { data: r } = org ? await admin.from('epost_oppsett').select('*').eq('org_id', org).maybeSingle() : { data: null as any };
    const d = r?.data || {};
    if (d.metode && r?.hemmelig) return { metode: d.metode, fraNavn: d.fraNavn || '', fraEpost: d.fraEpost || d.smtpUser || '', svarTil: d.svarTil || '', smtpHost: d.smtpHost || 'smtp.gmail.com', smtpPort: +d.smtpPort || 465, smtpUser: d.smtpUser || '', passord: r.hemmelig, kilde: 'app' };
    const parse = (f: string) => { const m = f.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/); return m ? [m[1].trim(), m[2].trim()] : ['', f.trim()]; };
    const [n, e] = parse(env('EPOST_FRA'));
    if (env('SMTP_USER') && env('SMTP_PASS')) return { metode: 'smtp', fraNavn: d.fraNavn || n || 'Eiendomskontroll', fraEpost: e || env('SMTP_USER'), svarTil: d.svarTil || env('EPOST_SVAR'), smtpHost: env('SMTP_HOST') || 'smtp.gmail.com', smtpPort: +(env('SMTP_PORT') || 465), smtpUser: env('SMTP_USER'), passord: env('SMTP_PASS'), kilde: 'netlify' };
    if (env('RESEND_API_KEY')) return { metode: 'resend', fraNavn: d.fraNavn || n || 'Eiendomskontroll', fraEpost: e || 'onboarding@resend.dev', svarTil: d.svarTil || env('EPOST_SVAR'), smtpHost: '', smtpPort: 0, smtpUser: '', passord: env('RESEND_API_KEY'), kilde: 'netlify' };
    return { metode: '', fraNavn: d.fraNavn || '', fraEpost: '', svarTil: d.svarTil || '', smtpHost: '', smtpPort: 0, smtpUser: '', passord: '', kilde: '' };
  };
  // Avsendernavn følger eiendommen: eget avsendernavn på eiendommen → eier/hjemmelshaver → organisasjonens oppsett
  const oppsettFor = async (eid: string | null | undefined, org?: string | null): Promise<Oppsett> => {
    const { data: e } = eid ? await admin.from('eiendommer').select('eier_org_id, data').eq('id', eid).maybeSingle() : { data: null as any };
    const o = await hentOppsett(org || e?.eier_org_id || null);
    const navn = String(e?.data?.avsenderNavn || e?.data?.eierNavn || '').trim();
    return navn ? { ...o, fraNavn: navn.slice(0, 120) } : o;
  };
  type Vedlegg = { navn: string; base64: string; type?: string; cid?: string };
  const sendEpost = async (til: string, emne: string, html: string, tekst: string, vedlegg0?: Vedlegg | Vedlegg[], svarTil?: string, o0?: Oppsett) => {
    const vedlegg = vedlegg0 ? (Array.isArray(vedlegg0) ? vedlegg0 : [vedlegg0]) : [];
    const o = o0 || await hentOppsett();
    if (!o.metode) return { sendt: false, grunn: 'E-post er ikke satt opp (Innstillinger → E-post for arbeidsordre)' };
    const fra = o.fraNavn ? `"${o.fraNavn.replace(/"/g, '')}" <${o.fraEpost}>` : o.fraEpost; const replyTo = o.svarTil || svarTil || undefined;
    if (o.metode === 'smtp') {
      try {
        const nm: any = await import('nodemailer'); const nodemailer = nm.default || nm; // lastes først når det trengs
        const t = nodemailer.createTransport({ host: o.smtpHost, port: o.smtpPort, secure: o.smtpPort === 465, auth: { user: o.smtpUser, pass: o.passord.replace(/\s+/g, '') }, connectionTimeout: 7000, greetingTimeout: 5000, socketTimeout: 8000 });
        await t.sendMail({ from: fra, to: til, replyTo, subject: emne, text: tekst, html, attachments: vedlegg.length ? vedlegg.map(v => ({ filename: v.navn, content: v.base64, encoding: 'base64', contentType: v.type || 'application/pdf', ...(v.cid ? { cid: v.cid } : {}) })) : undefined });
        return { sendt: true };
      } catch (e: any) {
        const m = String(e?.response || e?.message || e);
        const hint = /5\.7\.9|Application-specific password/i.test(m) ? ' – Gmail krever et app-passord, ikke det vanlige passordet. Slå på totrinnsbekreftelse og lag et app-passord på myaccount.google.com/apppasswords, og lim det inn i passordfeltet.'
          : /5\.7\.8|BadCredentials|Username and Password not accepted/i.test(m) ? ' – Brukernavn eller app-passord er feil. Lag et nytt app-passord og lim det inn på nytt (uten mellomrom).' : '';
        return { sendt: false, grunn: 'E-post feilet (SMTP): ' + m + hint };
      }
    }
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + o.passord, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: fra, to: [til], subject: emne, html, text: tekst, ...(replyTo ? { reply_to: replyTo } : {}), ...(vedlegg.length ? { attachments: vedlegg.map(v => ({ filename: v.navn, content: v.base64, ...(v.cid ? { content_id: v.cid } : {}) })) } : {}) }) });
    if (!r.ok) { const j = await r.json().catch(() => ({})); return { sendt: false, grunn: 'E-post feilet (Resend): ' + (j.message || r.status) }; }
    return { sendt: true };
  };

  // ---------- E-postoppsett (bare administrator)
  if (body.action === 'epost_hent' || body.action === 'epost_lagre' || body.action === 'epost_test') {
    const p = await hvem(); if (!p || !p.aktiv) return json(403, { error: 'Ikke innlogget' });
    const org = String(body.org_id || '') || await minOrg(p);
    const { data: mm } = org ? await admin.from('org_medlem').select('rolle, aktiv').eq('org_id', org).eq('user_id', p.id).maybeSingle() : { data: null as any };
    if (!mm || !mm.aktiv || mm.rolle !== 'admin') return json(403, { error: 'Bare administrator i organisasjonen kan endre e-postoppsettet' });
    if (body.action === 'epost_hent') {
      const { data: r, error } = await admin.from('epost_oppsett').select('*').eq('org_id', org).maybeSingle();
      if (error) return json(500, { error: 'Tabellen epost_oppsett mangler – kjør 004_epost.sql i Supabase' });
      const o = await hentOppsett(org);
      return json(200, { data: r?.data || {}, harHemmelig: !!r?.hemmelig, aktiv: { metode: o.metode, kilde: o.kilde, fra: o.fraEpost } });
    }
    if (body.action === 'epost_lagre') {
      const d = body.data || {}; const ren = { metode: ['smtp', 'resend'].includes(d.metode) ? d.metode : '', fraNavn: String(d.fraNavn || '').slice(0, 120), fraEpost: String(d.fraEpost || '').trim().slice(0, 200), svarTil: String(d.svarTil || '').trim().slice(0, 200), smtpHost: String(d.smtpHost || '').trim(), smtpPort: +d.smtpPort || 465, smtpUser: String(d.smtpUser || '').trim() };
      const { data: gml } = await admin.from('epost_oppsett').select('hemmelig').eq('org_id', org).maybeSingle();
      const hemmelig = typeof body.hemmelig === 'string' && body.hemmelig.trim() ? body.hemmelig.trim() : body.slettHemmelig ? null : gml?.hemmelig ?? null;
      const { error } = await admin.from('epost_oppsett').upsert({ org_id: org, data: ren, hemmelig, endret: new Date().toISOString(), endret_av: p.id });
      if (error) return json(500, { error: 'Kunne ikke lagre: ' + error.message });
      await admin.from('hendelseslogg').insert({ bruker_id: p.id, bruker: p.navn || p.epost, tabell: 'hendelse', handling: 'innstilling', org_id: org, tekst: `E-postoppsett endret (${ren.metode || 'av'}, avsender ${ren.fraNavn} <${ren.fraEpost}>)${typeof body.hemmelig === 'string' && body.hemmelig.trim() ? ', nytt passord/nøkkel' : ''}` });
      return json(200, { ok: true });
    }
    const o = await hentOppsett(org);
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
      const fr = a.data?.frist ? new Date(a.data.frist + 'T00:00:00Z').getTime() + 45 * 864e5 : 0;
      const { data: inv, error } = await admin.from('ao_invitasjon').insert({ avvik_id: a.id, epost: til, opprettet_av: p.id, utloper: new Date(Math.max(Date.now() + 60 * 864e5, fr)).toISOString() }).select().single();
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
    const r = await sendEpost(til, m.emne, m.html, m.tekst, vedlegg, p.epost || undefined, await oppsettFor(a.eiendom_id, await minOrg(p)));
    const hva = body.action === 'inviter' ? `Arbeidsordre ${r.sendt ? 'sendt' : 'klargjort'} på e-post til ${til}` : `Varsel om tildeling ${r.sendt ? 'sendt' : 'klargjort'} på e-post til ${til}`;
    await logg(p, a, hva); if (r.sendt) await leggTilAvvikLogg(a, hva, p.navn || p.epost);
    return json(200, { ...r, til, lenke, emne: m.emne, tekst: m.tekst });
  }

  // ---------- Mottaker åpner lenken (ikke innlogget)
  if (body.action === 'info') {
    const { data: inv } = await admin.from('ao_invitasjon').select('*').eq('token', body.token).maybeSingle();
    if (!inv) return json(404, { error: 'Lenken er ugyldig eller avviket er slettet' });
    if (utlopt(inv)) return json(410, { error: UTLOPT });
    const a = await hentAvvik(inv.avvik_id); const d = a?.data || {}; const ao = d.ao || {};
    const { data: fins } = await admin.from('profiles').select('id').eq('epost', inv.epost).maybeSingle();
    return json(200, { epost: inv.epost, nr: a?.nr, tittel: d.tittel, eiendom: ao.eiendom || '', adresse: ao.adresse || '', system: ao.system || '', komponent: ao.komponent || '', plassering: [ao.tegning, ao.plassering].filter(Boolean).join(' – '),
      beskrivelse: d.beskrivelse || '', alv: d.alv || '', frist: d.frist || '', status: d.status || '', tilstand: a ? tgNaa(await tgMaal(d.komponentId, d.anleggId)) : null, oppdragsgiver: a ? await orgNavnFor(a.eiendom_id) : '', utloper: inv.utloper, kvittert: inv.kvittert || (d.status === 'Utført – til kontroll' ? d.utfort?.t : null), brukt: !!inv.brukt, finnes: !!fins });
  }

  // ---------- Mottaker oppretter bruker via lenken
  if (body.action === 'registrer') {
    const { data: inv } = await admin.from('ao_invitasjon').select('*').eq('token', body.token).maybeSingle();
    if (!inv) return json(404, { error: 'Lenken er ugyldig' });
    if (utlopt(inv)) return json(410, { error: UTLOPT });
    const sam = samtykke(body); if (!sam) return json(400, { error: SAMTYKKE_MANGLER });
    const passord = String(body.passord || ''); if (svakt(passord)) return json(400, { error: 'Passordet må ha minst 10 tegn, med store og små bokstaver og tall' });
    const { data: fins } = await admin.from('profiles').select('id').eq('epost', inv.epost).maybeSingle();
    if (fins) return json(409, { error: 'Det finnes allerede en bruker med denne e-posten. Logg inn i stedet.' });
    const { data: u, error } = await admin.auth.admin.createUser({ email: inv.epost, password: passord, email_confirm: true, user_metadata: { navn: body.navn || '' } });
    if (error || !u?.user) return json(400, { error: error?.message || 'Kunne ikke opprette bruker' });
    const navn = String(body.navn || '').trim() || inv.epost; const firma = String(body.firma || '').trim();
    await admin.from('profiles').upsert({ id: u.user.id, epost: inv.epost, navn: firma ? `${navn} (${firma})` : navn, rolle: 'utforer', aktiv: true, samtykke: sam });
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
    if (utlopt(inv) && !inv.brukt) return json(410, { error: UTLOPT });
    if (inv.epost.toLowerCase() !== p.epost) return json(403, { error: `Lenken ble sendt til ${inv.epost}. Logg inn med den adressen.` });
    const a = await hentAvvik(inv.avvik_id); if (!a) return json(404, { error: 'Avviket finnes ikke lenger' });
    if (p.rolle === 'ingen') await admin.from('profiles').update({ rolle: 'utforer', aktiv: true }).eq('id', p.id);
    if (a.tildelt_id !== p.id) { await admin.from('avvik').update({ tildelt_id: p.id }).eq('id', a.id); await leggTilAvvikLogg(a, `Arbeidsordren akseptert av ${p.navn || p.epost}`, p.navn || p.epost); await logg(p, a, `Arbeidsordre akseptert av ${p.epost}`); }
    if (!inv.brukt) await admin.from('ao_invitasjon').update({ brukt: new Date().toISOString(), bruker_id: p.id }).eq('token', inv.token);
    return json(200, { ok: true, avvik_id: a.id });
  }

  // ---------- Innlogget utførende foreslår tilstand ved utkvittering av avvik
  if (body.action === 'tg_forslag') {
    const p = await hvem(); if (!p || !p.aktiv) return json(401, { error: 'Ikke innlogget' });
    const a = await hentAvvik(body.avvik_id); if (!a) return json(404, { error: 'Fant ikke avviket' });
    if (a.tildelt_id !== p.id && !(await harEiendom(p, a.eiendom_id))) return json(403, { error: 'Ingen tilgang' });
    const tl = renTilstand(body.tilstand); if (!tl) return json(400, { error: 'Ugyldig tilstandsgrad' });
    const ok = await lagTgForslag(await tgMaal(a.data?.komponentId, a.data?.anleggId), tl, p.navn || p.epost, `Avvik #${a.nr} kvittert ut`, { avvikId: a.id });
    return json(200, { ok: true, forslag: ok });
  }

  // ---------- Kvittere ut avvik uten bruker (midlertidig tilgang via lenken)
  if (body.action === 'ao_opplasting' || body.action === 'ao_kvitter') {
    const { data: inv } = await admin.from('ao_invitasjon').select('*').eq('token', body.token).maybeSingle();
    if (!inv) return json(404, { error: 'Lenken er ugyldig' });
    if (utlopt(inv)) return json(410, { error: UTLOPT });
    if (inv.kvittert) return json(409, { error: 'Arbeidsordren er allerede kvittert ut via denne lenken' });
    const a = await hentAvvik(inv.avvik_id); if (!a) return json(404, { error: 'Avviket finnes ikke lenger' });
    if (body.action === 'ao_opplasting') {
      const navn = String(body.navn || 'fil').replace(/[^\w.\-æøåÆØÅ]+/g, '_').slice(-80);
      const path = `${a.eiendom_id}/ao/${a.id}/${crypto.randomUUID()}-${navn}`;
      const { data, error } = await admin.storage.from('filer').createSignedUploadUrl(path);
      if (error) return json(500, { error: 'Kunne ikke klargjøre opplasting: ' + error.message });
      return json(200, { path, token: data.token });
    }
    const sam = samtykke(body); if (!sam) return json(400, { error: SAMTYKKE_MANGLER });
    const navn = String(body.navn || '').trim().slice(0, 120); if (!navn) return json(400, { error: 'Skriv navnet ditt' });
    const firma = String(body.firma || '').trim().slice(0, 120); const komm = String(body.komm || '').trim().slice(0, 4000);
    if (!komm) return json(400, { error: 'Beskriv hva som er gjort' });
    const pre = `${a.eiendom_id}/ao/${a.id}/`;
    const filer = (Array.isArray(body.filer) ? body.filer : []).slice(0, 20).filter((f: any) => typeof f?.path === 'string' && f.path.startsWith(pre) && !f.path.includes('..'))
      .map((f: any) => ({ path: f.path, navn: String(f.navn || '').slice(0, 120), type: String(f.type || '').slice(0, 80), str: +f.str || 0 }));
    const av = `${navn}${firma ? ' (' + firma + ')' : ''}`; const t = new Date().toISOString(); const d = a.data || {};
    const logg = [...(d.logg || [])]; if (filer.length) logg.push({ t, s: d.status, k: `Lastet opp ${filer.length} fil${filer.length > 1 ? 'er' : ''}: ${filer.map((f: any) => f.navn).join(', ')}`, av });
    logg.push({ t, s: 'Utført – til kontroll', k: `Kvittert utført via lenke (uten bruker) av ${av} <${inv.epost}>: ${komm}`, av });
    await admin.from('avvik').update({ data: { ...d, status: 'Utført – til kontroll', utfort: { t, av, komm, epost: inv.epost, eksternt: true }, vedlegg: [...(d.vedlegg || []), ...filer], logg } }).eq('id', a.id);
    const tl = renTilstand(body.tilstand);
    const nyttForslag = await lagTgForslag(await tgMaal(d.komponentId, d.anleggId), tl, av, `Avvik #${a.nr} kvittert ut`, { avvikId: a.id });
    await admin.from('ao_invitasjon').update({ kvittert: t, svar: { navn, firma, komm, filer, samtykke: sam, tilstand: tl, nyttForslag } }).eq('token', inv.token);
    await logg_(a, av, `Arbeidsordre for avvik #${a.nr} kvittert ut via lenke av ${av} <${inv.epost}> – til kontroll`);
    if (inv.opprettet_av) { const { data: avs } = await admin.from('profiles').select('epost').eq('id', inv.opprettet_av).maybeSingle();
      if (avs?.epost) await sendEpost(avs.epost, `Utført: avvik #${a.nr} ${d.tittel || ''}`, `<p>${esc(av)} har kvittert ut avvik <b>#${a.nr} ${esc(d.tittel)}</b> som utført:</p><p>${esc(komm).replace(/\n/g, '<br>')}</p><p>${filer.length} vedlegg. Avviket står som «Utført – til kontroll» i Eiendomskontroll.</p>`, `${av} har kvittert ut avvik #${a.nr} ${d.tittel || ''} som utført: ${komm}`, undefined, undefined, await oppsettFor(a.eiendom_id)); }
    return json(200, { ok: true });
  }

  // ================= Sjekkliste til leietaker =================
  const hentLt = async (id: string) => { const { data } = await admin.from('leietakere').select('*').eq('id', id).maybeSingle(); return data; };
  const ltLogg = (p: any, l: any, tekst: string) => admin.from('hendelseslogg').insert({ bruker_id: p?.id || null, bruker: p ? (p.navn || p.epost) : 'System', tabell: 'hendelse', rad_id: l.id, eiendom_id: l.eiendom_id, handling: 'sjekkliste', tekst });

  // Eier/forvalter sender sjekklisten til leietaker på e-post (lenke til portalen, evt. med registrering)
  if (body.action === 'lt_send') {
    const p = await hvem(); if (!p) return json(401, { error: 'Ikke innlogget' });
    const l = await hentLt(body.leietaker_id); if (!l) return json(404, { error: 'Fant ikke leietakeren' });
    if (!(await kanRedigere(p, l.eiendom_id))) return json(403, { error: 'Du har ikke redigeringstilgang til eiendommen' });
    const til = String(body.epost || '').trim().toLowerCase(); if (!/^\S+@\S+\.\S+$/.test(til)) return json(400, { error: 'Ugyldig e-postadresse' });
    const base = typeof body.lenkeBase === 'string' && /^https?:\/\//.test(body.lenkeBase) ? body.lenkeBase.replace(/\/+$/, '') : '';
    const { data: fins } = await admin.from('profiles').select('id, rolle, leietaker_id').eq('epost', til).maybeSingle();
    const maate = ['fil', 'begge'].includes(body.maate) ? body.maate : 'lenke';
    let lenke = `${base}/#/portal`;
    if (maate === 'fil') lenke = '';
    else if (!(fins && fins.rolle === 'leietaker' && fins.leietaker_id === l.id)) {
      const { data: inv, error } = await admin.from('lt_invitasjon').insert({ leietaker_id: l.id, epost: til, opprettet_av: p.id }).select().single();
      if (error) return json(500, { error: 'Kunne ikke lage invitasjon (er 005_sjekkliste.sql kjørt?): ' + error.message });
      lenke = `${base}/#/lt/${inv.token}`;
    }
    const d = l.data || {}; const { data: e } = await admin.from('eiendommer').select('data').eq('id', l.eiendom_id).maybeSingle(); const en = e?.data?.navn || '';
    const pl = (d.plikter || []).filter((x: any) => !x.ikkeRelevant);
    const frist = body.frist ? String(body.frist).split('-').reverse().join('.') : '';
    const melding = String(body.melding || ''); const avs = p.navn || p.epost;
    const emne = `Sjekkliste brann og internkontroll – ${d.navn || ''}${en ? ' (' + en + ')' : ''}`;
    const filTekst = 'Vedlagt ligger en ZIP-fil med sjekklisten (Excel) og én mappe per punkt. Fyll ut Excel-arket, legg dokumentasjonen i riktig mappe, zip mappen og send den tilbake som svar på denne e-posten.';
    const tekst = [`Hei,`, '', melding || `Som utleier følger vi opp at leietakerne i ${en || 'bygget'} ivaretar sine plikter etter forskrift om brannforebygging og internkontrollforskriften. Vi ber dere fylle ut sjekklisten og legge ved dokumentasjon.`, frist ? `\nFrist: ${frist}` : '', '', 'Punkter:', ...pl.map((x: any) => '- ' + x.navn), '', maate !== 'lenke' ? filTekst : '', lenke ? `${maate === 'begge' ? 'Eller fyll ut på nett' : 'Fyll ut her'}:\n${lenke}` : '', '', `Hilsen ${avs}`].filter(x => x !== null).join('\n');
    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#1d2320"><p style="font-size:12px;color:#6b736d;margin:0">SJEKKLISTE</p><h2 style="margin:4px 0 12px">Brann og internkontroll – ${esc(d.navn)}</h2>
      <p>${esc(melding || `Som utleier følger vi opp at leietakerne i ${en || 'bygget'} ivaretar sine plikter etter forskrift om brannforebygging og internkontrollforskriften. Vi ber dere fylle ut sjekklisten og laste opp dokumentasjon.`).replace(/\n/g, '<br>')}</p>
      ${frist ? `<p><b>Frist: ${esc(frist)}</b></p>` : ''}<ul>${pl.map((x: any) => `<li>${esc(x.navn)}</li>`).join('')}</ul>
      ${maate !== 'lenke' ? `<p style="background:#fff8e1;padding:10px 12px;border-radius:8px"><b>Vedlagt sjekkliste (ZIP):</b> ${esc(filTekst)}</p>` : ''}
      ${lenke ? `<p style="margin:20px 0"><a href="${esc(lenke)}" style="background:#1f6f5c;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">${maate === 'begge' ? 'Eller fyll ut på nett' : 'Åpne sjekklisten'}</a></p>
      <p style="font-size:12px;color:#6b736d">Via lenken oppretter du bruker (eller logger inn), krysser av for dokumentasjonen og laster opp filer. Utleier går gjennom og godkjenner.</p>` : ''}<p style="font-size:12px;color:#6b736d">Sendt av ${esc(avs)}.</p></div>`;
    const vedlegg = maate !== 'lenke' && body.vedlegg && typeof body.vedlegg.base64 === 'string' && body.vedlegg.base64.length < 4_000_000 ? { navn: String(body.vedlegg.navn || 'Sjekkliste.zip').slice(0, 120), base64: body.vedlegg.base64, type: 'application/zip' } : undefined;
    const r = await sendEpost(til, emne, html, tekst, vedlegg, p.epost || undefined, await oppsettFor(l.eiendom_id, await minOrg(p)));
    await ltLogg(p, l, `Sjekkliste (${maate === 'fil' ? 'Excel-pakke' : maate === 'begge' ? 'lenke og Excel-pakke' : 'lenke'}) ${r.sendt ? 'sendt' : 'klargjort'} til ${til} (${d.navn || ''})`);
    await admin.from('leietakere').update({ data: { ...d, sjekklisteSendt: { tid: new Date().toISOString(), til, av: avs, frist: body.frist || '' } } }).eq('id', l.id);
    return json(200, { ...r, til, lenke, emne, tekst });
  }

  // Leietaker åpner lenken (ikke innlogget)
  if (body.action === 'lt_info') {
    const { data: inv } = await admin.from('lt_invitasjon').select('*').eq('token', body.token).maybeSingle();
    if (!inv) return json(404, { error: 'Lenken er ugyldig eller utløpt' });
    if (utlopt(inv) && !inv.brukt) return json(410, { error: 'Lenken er utløpt. Be utleier sende sjekklisten på nytt.' });
    const l = await hentLt(inv.leietaker_id); const { data: fins } = await admin.from('profiles').select('id').eq('epost', inv.epost).maybeSingle();
    return json(200, { epost: inv.epost, leietaker: l?.data?.navn || '', brukt: !!inv.brukt, finnes: !!fins });
  }

  // Leietaker oppretter bruker via lenken
  if (body.action === 'lt_registrer') {
    const { data: inv } = await admin.from('lt_invitasjon').select('*').eq('token', body.token).maybeSingle();
    if (!inv) return json(404, { error: 'Lenken er ugyldig' });
    if (utlopt(inv)) return json(410, { error: 'Lenken er utløpt. Be utleier sende sjekklisten på nytt.' });
    const sam = samtykke(body); if (!sam) return json(400, { error: SAMTYKKE_MANGLER });
    const passord = String(body.passord || ''); if (svakt(passord)) return json(400, { error: 'Passordet må ha minst 10 tegn, med store og små bokstaver og tall' });
    const { data: fins } = await admin.from('profiles').select('id').eq('epost', inv.epost).maybeSingle();
    if (fins) return json(409, { error: 'Det finnes allerede en bruker med denne e-posten. Logg inn i stedet.' });
    const { data: u, error } = await admin.auth.admin.createUser({ email: inv.epost, password: passord, email_confirm: true, user_metadata: { navn: body.navn || '' } });
    if (error || !u?.user) return json(400, { error: error?.message || 'Kunne ikke opprette bruker' });
    const navn = String(body.navn || '').trim() || inv.epost;
    await admin.from('profiles').upsert({ id: u.user.id, epost: inv.epost, navn, rolle: 'leietaker', leietaker_id: inv.leietaker_id, aktiv: true, samtykke: sam });
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


  // ================= Arbeidsordre for kontroller/service (oppgaver) =================
  const hentOppg = async (id: string) => { const { data } = await admin.from('oppgaver').select('*').eq('id', id).maybeSingle(); return data; };
  const datoNo = (d?: string) => d ? String(d).split('-').reverse().join('.') : '';
  const koLogg = (p: any, o: any, tekst: string, org?: string | null) => admin.from('hendelseslogg').insert({ bruker_id: p?.id || null, bruker: p ? (p.navn || p.epost) : 'Automatisk', tabell: 'hendelse', rad_id: o.id, eiendom_id: o.eiendom_id, org_id: org || null, handling: 'arbeidsordre', tekst });
  // Komponentvis sjekkliste (branndører, nødlys …): komponentene og runden for kontrollen
  const malerFor = async (eid: string) => {
    const { data: e } = await admin.from('eiendommer').select('eier_org_id').eq('id', eid).maybeSingle();
    const { data: ins } = e?.eier_org_id ? await admin.from('innstillinger').select('data').eq('org_id', e.eier_org_id).eq('nokkel', 'sjekkmaler').limit(1).maybeSingle() : { data: null as any };
    return sjekkMaler(ins?.data);
  };
  // Sjekkliste for hele systemet (når kontrollen ikke kvitteres komponentvis)
  const koSysSjekk = async (o: any) => {
    const d = o.data || {}; if (!d.anleggId || d.komponentId) return null;
    if (await koRunde(o)) return null;
    const { data: sy } = await admin.from('systemer').select('data').eq('id', d.anleggId).maybeSingle();
    return sysSjekkFor(await malerFor(o.eiendom_id), d, sy?.data?.type);
  };
  const koRunde = async (o: any) => {
    const d = o.data || {}; if (d.komponentId || !d.anleggId || d.kompSjekk === 'av') return null;
    const { data: kr } = await admin.from('komponenter').select('id, data').eq('system_id', d.anleggId);
    const K = (kr || []).map((r: any) => ({ ...(r.data || {}), id: r.id, anleggId: d.anleggId }));
    if (!K.length) return null;
    const maler = await malerFor(o.eiendom_id);
    const KK = kompForKontroll(d, K, maler); if (!KK.length) return null;
    const runde = d.runde?.kp ? { ...d.runde } : nyRunde(KK, maler, new Date().toISOString().slice(0, 10));
    for (const k of KK) if (!runde.malId?.[k.id]) { const nr = nyRunde([k], maler, runde.start); runde.malId = { ...(runde.malId || {}), ...nr.malId }; runde.maler = { ...runde.maler, ...nr.maler }; }
    return { K: KK, runde, d };
  };
  const kLabel = (k: any) => `-${String(k.kode || '').toUpperCase()}${String(k.lop || 1).padStart(3, '0')} ${k.navn || ''}`.trim();

  const koSnapshot = async (o: any) => {
    const d = o.data || {};
    const { data: e } = await admin.from('eiendommer').select('data, eier_org_id').eq('id', o.eiendom_id).maybeSingle();
    const { data: sy } = d.anleggId ? await admin.from('systemer').select('data').eq('id', d.anleggId).maybeSingle() : { data: null as any };
    const { data: org } = e?.eier_org_id ? await admin.from('organisasjoner').select('navn').eq('id', e.eier_org_id).maybeSingle() : { data: null as any };
    const ed = e?.data || {}; const sd = sy?.data || {};
    const sys = sy ? `${ed.tfmBygg ? '+' + ed.tfmBygg : ''}${sd.tfmSys ? '=' + sd.tfmSys + '.' + String(sd.tfmLop || 1).padStart(3, '0') : ''} ${sd.navn || ''}${sd.fabrikat ? ' (' + sd.fabrikat + ')' : ''}`.trim() : '';
    const kr = await koRunde(o).catch(() => null); const sj = kr ? null : await koSysSjekk(o).catch(() => null);
    return { sjekkN: sj?.punkter.length || 0, sjekkNavn: sj?.navn || '', komp: kr?.K.length || 0, org: e?.eier_org_id || null, orgNavn: org?.navn || '', eiendom: ed.navn || '', adresse: [ed.adresse, [ed.postnr, ed.poststed].filter(Boolean).join(' ')].filter(Boolean).join(', '), system: sys, kontakt: ed.kontaktLeverandor || ed.driftsansvarlig || '' };
  };
  const koTekst = (o: any, sn: any, lenke: string, melding: string, avsender: string, bilder = false) => {
    const d = o.data || {}; const b = d.aoBilder;
    const rader: [string, string][] = [['Eiendom', [sn.eiendom, sn.adresse].filter(Boolean).join(', ')], ['System', sn.system], ['Oppdrag', d.navn], ['Sjekkliste', sn.komp ? `${sn.komp} komponenter – kontrolleres og kvitteres ut én og én i lenken` : sn.sjekkN ? `${sn.sjekkNavn} – ${sn.sjekkN} punkter fylles ut i lenken` : ''], ['Type', [d.type, d.kategori].filter(Boolean).join(' · ')], ['Planlagt / frist', datoNo(d.nesteFrist)], ['Grunnlag', d.hjemmel || ''], ['Kontakt på stedet', sn.kontakt]];
    const tekst = [`Arbeidsordre – ${d.navn}`, '', melding ? melding + '\n' : '', ...rader.filter(r => r[1]).map(r => `${r[0]}: ${r[1]}`), d.notat ? '\nSjekkpunkter / merknader:\n' + d.notat : '', bilder && b ? `\nLokasjon: se vedlagte bilder fra tegningen ${b.tegning}.` : '', '',
      `Når jobben er utført: registrer dato, resultat og last opp servicerapport her (ingen innlogging):\n${lenke}`, '', `Sendt av ${avsender}`].filter(x => x !== '').join('\n');
    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#1d2320">
      <p style="font-size:12px;color:#6b736d;margin:0">ARBEIDSORDRE – ${esc((d.type || 'kontroll').toUpperCase())}</p><h2 style="margin:4px 0 12px">${esc(d.navn)}</h2>
      ${melding ? `<p>${esc(melding).replace(/\n/g, '<br>')}</p>` : ''}
      <table style="border-collapse:collapse;font-size:14px">${rader.filter(r => r[1]).map(r => `<tr><td style="padding:3px 14px 3px 0;color:#6b736d;vertical-align:top">${r[0]}</td><td style="padding:3px 0">${esc(r[1])}</td></tr>`).join('')}</table>
      ${d.notat ? `<p style="margin-top:12px"><b>Sjekkpunkter / merknader</b><br>${esc(d.notat).replace(/\n/g, '<br>')}</p>` : ''}
      ${bilder && b ? `<p style="margin:16px 0 4px"><b>Lokasjon – ${esc(b.tegning)}</b>${b.andre?.length ? ` <span style="color:#6b736d">(også plassert på ${esc(b.andre.join(', '))})</span>` : ''}</p>
        <p style="margin:4px 0"><img src="cid:lokasjon-zoom" alt="Lokasjon (zoom)" style="max-width:100%;border:1px solid #d9ddd8;border-radius:6px"></p>
        <p style="margin:4px 0"><img src="cid:lokasjon-oversikt" alt="Lokasjon (oversikt)" style="max-width:100%;border:1px solid #d9ddd8;border-radius:6px"></p>
        <p style="font-size:12px;color:#6b736d;margin:2px 0 0">Grønn markering viser plasseringen. Rød stiplet ramme i oversikten viser utsnittet. Bildene ligger også som vedlegg.</p>` : ''}
      <p style="margin:20px 0"><a href="${esc(lenke)}" style="background:#1f6f5c;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">Registrer utført og last opp rapport</a></p>
      <p style="font-size:12px;color:#6b736d">Lenken krever ingen innlogging. Oppdragsgiver går gjennom rapporten før kontrollen registreres som utført.<br>Sendt av ${esc(avsender)}.</p></div>`;
    return { emne: `Arbeidsordre: ${d.navn}${sn.eiendom ? ' – ' + sn.eiendom : ''}${d.nesteFrist ? ' (' + datoNo(d.nesteFrist) + ')' : ''}`, tekst, html };
  };
  // Lager lenke, sender e-post og merker kontrollen som sendt for gjeldende frist
  const koSend = async (o: any, til: string, melding: string, base: string, p: any | null) => {
    const d = o.data || {}; const sn = await koSnapshot(o);
    const frMs = d.nesteFrist ? new Date(d.nesteFrist + 'T00:00:00Z').getTime() + 45 * 864e5 : 0;
    const { data: inv, error } = await admin.from('ko_invitasjon').insert({ oppgave_id: o.id, eiendom_id: o.eiendom_id, epost: til, frist: d.nesteFrist || null, opprettet_av: p?.id || null, auto: !p, utloper: new Date(Math.max(Date.now() + 30 * 864e5, frMs)).toISOString() }).select().single();
    if (error) return { sendt: false, grunn: 'Kunne ikke lage lenke (er 008_kontroll_arbeidsordre.sql kjørt?): ' + error.message };
    const lenke = `${base}/#/ko/${inv.token}`;
    const avsender = p ? `${p.navn || p.epost}${sn.orgNavn ? ', ' + sn.orgNavn : ''}` : (sn.orgNavn || 'Eiendomskontroll');
    // Lokasjonsbilder fra tegningen (laget i appen og lagret på kontrollen)
    const vedl: Vedlegg[] = [];
    for (const [k, cid, navn] of [['zoom', 'lokasjon-zoom', 'Lokasjon - zoom.jpg'], ['oversikt', 'lokasjon-oversikt', 'Lokasjon - oversikt.jpg']] as const) {
      const path = d.aoBilder?.[k]?.path; if (!path || !String(path).startsWith(o.eiendom_id + '/')) continue;
      const { data: bl } = await admin.storage.from('filer').download(path); if (bl) vedl.push({ navn, base64: Buffer.from(await bl.arrayBuffer()).toString('base64'), type: 'image/jpeg', cid });
    }
    const m = koTekst(o, sn, lenke, melding, avsender, vedl.length === 2);
    const r = await sendEpost(til, m.emne, m.html, m.tekst, vedl, p?.epost || undefined, await oppsettFor(o.eiendom_id, sn.org || (p ? await minOrg(p) : null)));
    const fersk = (await hentOppg(o.id))?.data || d;
    if (r.sendt) await admin.from('oppgaver').update({ data: { ...fersk, aoSendt: { frist: d.nesteFrist || '', dato: new Date().toISOString(), til, auto: !p, av: p ? (p.navn || p.epost) : 'Automatisk' } } }).eq('id', o.id);
    await koLogg(p, o, `Arbeidsordre «${d.navn}» ${r.sendt ? 'sendt' : 'klargjort'}${!p ? ' automatisk' : ''} til ${til}${d.nesteFrist ? ' (frist ' + datoNo(d.nesteFrist) + ')' : ''}${r.sendt ? '' : ' – ' + (r as any).grunn}`, sn.org);
    return { ...r, til, lenke, emne: m.emne, tekst: m.tekst };
  };

  if (body.action === 'ko_send') {
    const p = await hvem(); if (!p) return json(401, { error: 'Ikke innlogget' });
    const o = await hentOppg(body.oppgave_id); if (!o) return json(404, { error: 'Fant ikke kontrollen' });
    if (!(await harEiendom(p, o.eiendom_id))) return json(403, { error: 'Du har ikke tilgang til eiendommen' });
    const til = String(body.epost || '').trim().toLowerCase(); if (!/^\S+@\S+\.\S+$/.test(til)) return json(400, { error: 'Ugyldig e-postadresse' });
    const base = typeof body.lenkeBase === 'string' && /^https?:\/\//.test(body.lenkeBase) ? body.lenkeBase.replace(/\/+$/, '') : (process.env.URL || '');
    return json(200, await koSend(o, til, String(body.melding || '').slice(0, 2000), base, p));
  }

  // Daglig automatisk utsending (kalles av den planlagte funksjonen ko-auto)
  if (body.action === 'ko_auto') {
    const forventet = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('ko-auto:' + key)).then(b => Buffer.from(b).toString('hex'));
    if (req.headers.get('x-ek-cron') !== forventet) return json(403, { error: 'Ikke tillatt' });
    const base = (process.env.URL || '').replace(/\/+$/, '');
    const { data: L } = await admin.from('oppgaver').select('*').eq('data->ao->>auto', 'true');
    const idag = new Date(); idag.setUTCHours(0, 0, 0, 0); const ut: any[] = [];
    for (const o of L || []) {
      const d = o.data || {}; const ao = d.ao || {};
      if (d.aktiv === false || !d.nesteFrist || !/^\S+@\S+\.\S+$/.test(ao.epost || '')) continue;
      if (d.aoSendt?.frist === d.nesteFrist) continue; // allerede sendt for denne fristen
      const send = new Date(d.nesteFrist + 'T00:00:00Z'); send.setUTCDate(send.getUTCDate() - Math.max(0, Math.min(365, +ao.dager || 14)));
      if (send > idag) continue;
      const { data: e } = await admin.from('eiendommer').select('eier_org_id, organisasjoner!inner(aktiv)').eq('id', o.eiendom_id).maybeSingle();
      if (!(e as any)?.organisasjoner?.aktiv) continue;
      const r = await koSend(o, String(ao.epost).toLowerCase(), String(ao.melding || ''), base, null);
      ut.push({ id: o.id, til: ao.epost, sendt: r.sendt, grunn: (r as any).grunn });
    }
    return json(200, { ok: true, behandlet: ut.length, ut });
  }

  // Servicefirmaet åpner lenken (ingen innlogging)
  const hentKo = async (token: string) => { if (!/^[0-9a-f-]{36}$/i.test(String(token || ''))) return null; const { data } = await admin.from('ko_invitasjon').select('*').eq('token', token).maybeSingle(); return data; };
  if (body.action === 'ko_info') {
    const inv = await hentKo(body.token); if (!inv) return json(404, { error: 'Lenken er ugyldig eller kontrollen er slettet' });
    if (utlopt(inv) && !inv.innsendt) return json(410, { error: UTLOPT });
    const o = await hentOppg(inv.oppgave_id); if (!o) return json(404, { error: 'Kontrollen finnes ikke lenger' });
    const d = o.data || {}; const sn = await koSnapshot(o);
    const bilder: any[] = [];
    for (const [k, tittel] of [['zoom', 'Zoom på lokasjonen'], ['oversikt', 'Oversikt over tegningen']] as const) {
      const path = d.aoBilder?.[k]?.path; if (!path || !String(path).startsWith(o.eiendom_id + '/')) continue;
      const { data: su } = await admin.storage.from('filer').createSignedUrl(path, 24 * 3600); if (su?.signedUrl) bilder.push({ tittel, url: su.signedUrl });
    }
    const tilstand = tgNaa(await tgMaal(d.komponentId, d.anleggId));
    const kr = await koRunde(o);
    const komp = kr ? kr.K.map((k: any) => ({ id: k.id, label: kLabel(k), plassering: k.plassering || '' })) : null;
    const runde = kr ? { maler: kr.runde.maler, malId: kr.runde.malId, kp: Object.fromEntries(Object.entries(kr.runde.kp || {}).map(([k, v]: any) => [k, { t: v.t, av: v.av, firma: v.firma, svar: v.svar, komm: v.komm, avvik: v.avvik, laast: !!v.avvikIds?.length }])) } : null;
    const sjekk = kr ? null : await koSysSjekk(o);
    return json(200, { sjekk, komp, runde, intervall: d.intervall || null, bilder, tilstand, tegning: d.aoBilder?.tegning || '', navn: d.navn, type: d.type, kategori: d.kategori, frist: inv.frist || d.nesteFrist, hjemmel: d.hjemmel || '', notat: d.notat || '', eiendom: sn.eiendom, adresse: sn.adresse, system: sn.system, kontakt: sn.kontakt, oppdragsgiver: sn.orgNavn, epost: inv.epost, innsendt: inv.innsendt, utloper: inv.utloper, utdatert: !!(inv.frist && d.nesteFrist && inv.frist !== d.nesteFrist && !inv.innsendt) });
  }
  if (body.action === 'ko_opplasting') {
    const inv = await hentKo(body.token); if (!inv || inv.innsendt) return json(403, { error: 'Lenken er ugyldig eller allerede brukt' });
    if (utlopt(inv)) return json(410, { error: UTLOPT });
    const navn = String(body.navn || 'fil').replace(/[^\w.\-æøåÆØÅ]+/g, '_').slice(-80);
    const path = `${inv.eiendom_id}/ko/${inv.oppgave_id}/${crypto.randomUUID()}-${navn}`;
    const { data, error } = await admin.storage.from('filer').createSignedUploadUrl(path);
    if (error) return json(500, { error: 'Kunne ikke klargjøre opplasting: ' + error.message });
    return json(200, { path, token: data.token });
  }
  if (body.action === 'ko_komp') {
    const inv = await hentKo(body.token); if (!inv || inv.innsendt) return json(403, { error: 'Lenken er ugyldig eller rapporten er allerede sendt inn' });
    if (utlopt(inv)) return json(410, { error: UTLOPT });
    const o = await hentOppg(inv.oppgave_id); if (!o) return json(404, { error: 'Kontrollen finnes ikke lenger' });
    const kr = await koRunde(o); if (!kr) return json(400, { error: 'Kontrollen har ikke sjekkliste per komponent' });
    if (!samtykke(body)) return json(400, { error: SAMTYKKE_MANGLER });
    const kid = String(body.komponentId || ''); if (!kr.K.some((k: any) => k.id === kid)) return json(400, { error: 'Ukjent komponent' });
    if (kr.runde.kp?.[kid]?.avvikIds?.length) return json(409, { error: 'Oppdragsgiver har allerede registrert avvik på denne komponenten' });
    const mal = malIRunde(kr.runde, kid); const sv = renKompSvar(body.svar, mal, kr.d.intervall);
    if (!sv || !punkterFor(mal, kr.d.intervall).every(p => sv.svar[p.id])) return json(400, { error: 'Svar på alle sjekkpunktene' });
    const pre = `${inv.eiendom_id}/ko/${inv.oppgave_id}/`;
    const filer = (Array.isArray(body.filer) ? body.filer : []).slice(0, 10).filter((f: any) => typeof f?.path === 'string' && f.path.startsWith(pre) && !f.path.includes('..'))
      .map((f: any) => ({ path: f.path, navn: String(f.navn || '').slice(0, 120), type: String(f.type || '').slice(0, 80), str: +f.str || 0 }));
    const fersk = (await hentOppg(o.id))!.data || {};
    const rr = { ...kr.runde, kp: { ...(fersk.runde?.kp || kr.runde.kp || {}), [kid]: { ...sv, filer, kilde: 'ekstern', epost: inv.epost } } };
    await admin.from('oppgaver').update({ data: { ...fersk, runde: rr } }).eq('id', o.id);
    return json(200, { ok: true });
  }
  if (body.action === 'ko_innsend') {
    const inv = await hentKo(body.token); if (!inv) return json(404, { error: 'Lenken er ugyldig' });
    if (inv.innsendt) return json(409, { error: 'Rapporten er allerede sendt inn via denne lenken' });
    if (utlopt(inv)) return json(410, { error: UTLOPT });
    const sam = samtykke(body); if (!sam) return json(400, { error: SAMTYKKE_MANGLER });
    const o = await hentOppg(inv.oppgave_id); if (!o) return json(404, { error: 'Kontrollen finnes ikke lenger' });
    const pre = `${inv.eiendom_id}/ko/${inv.oppgave_id}/`;
    const filer = (Array.isArray(body.filer) ? body.filer : []).slice(0, 20).filter((f: any) => typeof f?.path === 'string' && f.path.startsWith(pre) && !f.path.includes('..'))
      .map((f: any) => ({ path: f.path, navn: String(f.navn || '').slice(0, 120), type: String(f.type || '').slice(0, 80), str: +f.str || 0 }));
    const dato = /^\d{4}-\d{2}-\d{2}$/.test(body.dato) ? body.dato : new Date().toISOString().slice(0, 10);
    const res = ['OK – ingen avvik', 'Avvik funnet', 'Ikke utført / utsatt'].includes(body.res) ? body.res : 'OK – ingen avvik';
    const rapport = { token: inv.token, mottatt: new Date().toISOString(), dato, av: String(body.av || '').slice(0, 160), firma: String(body.firma || '').slice(0, 160), epost: inv.epost, res, komm: String(body.komm || '').slice(0, 4000),
      avvik: (Array.isArray(body.avvik) ? body.avvik : []).map((x: any) => String(x || '').trim().slice(0, 300)).filter(Boolean).slice(0, 30), nesteDato: /^\d{4}-\d{2}-\d{2}$/.test(body.nesteDato || '') ? body.nesteDato : '', filer, samtykke: sam, tilstand: renTilstand(body.tilstand) } as any;
    const fersk = (await hentOppg(o.id))!.data || {};
    const sjMal = await koSysSjekk(o);
    if (sjMal && body.sjekk) { rapport.sjekk = renSysSjekk(body.sjekk, sjMal); if (sysSjekkAvvik(rapport.sjekk).length && rapport.res === 'OK – ingen avvik') rapport.res = 'Avvik funnet'; }
    if (fersk.runde?.kp) { const V = Object.values(fersk.runde.kp) as any[]; const nAv = V.filter(v => (v.avvik || []).length).length;
      rapport.runde = { kontrollert: V.length, avvik: nAv }; if (nAv && rapport.res === 'OK – ingen avvik') rapport.res = 'Avvik funnet'; }
    rapport.nyttForslag = await lagTgForslag(await tgMaal(fersk.komponentId, fersk.anleggId), rapport.tilstand, `${rapport.av || inv.epost}${rapport.firma ? ' (' + rapport.firma + ')' : ''}`, `Kontroll «${fersk.navn}»`, { oppgaveId: o.id });
    await admin.from('oppgaver').update({ data: { ...fersk, innrapport: rapport } }).eq('id', o.id);
    await admin.from('ko_invitasjon').update({ innsendt: rapport.mottatt, svar: rapport }).eq('token', inv.token);
    const sn = await koSnapshot(o);
    await koLogg({ id: null, navn: `${rapport.av || inv.epost}${rapport.firma ? ' (' + rapport.firma + ')' : ''}` }, o, `Servicerapport mottatt for «${fersk.navn}»: ${res}${rapport.avvik.length ? `, ${rapport.avvik.length} avvik` : ''}, ${filer.length} vedlegg – venter på godkjenning`, sn.org);
    // Varsle den som sendte arbeidsordren (eller ingen, hvis automatisk og uten mottaker)
    if (inv.opprettet_av) { const { data: av } = await admin.from('profiles').select('epost').eq('id', inv.opprettet_av).maybeSingle();
      if (av?.epost) await sendEpost(av.epost, `Rapport mottatt: ${fersk.navn} – ${sn.eiendom}`, `<p>${esc(rapport.av || inv.epost)}${rapport.firma ? ' (' + esc(rapport.firma) + ')' : ''} har registrert <b>${esc(fersk.navn)}</b> på ${esc(sn.eiendom)} som utført ${esc(datoNo(dato))}: ${esc(res)}.</p><p>Gå til kontrollen i Eiendomskontroll for å godkjenne.</p>`, `${rapport.av || inv.epost} har registrert ${fersk.navn} på ${sn.eiendom} som utført ${datoNo(dato)}: ${res}. Gå til kontrollen i Eiendomskontroll for å godkjenne.`, undefined, undefined, await oppsettFor(o.eiendom_id, sn.org)); }
    return json(200, { ok: true });
  }

  return json(400, { error: 'Ukjent handling' });
};
