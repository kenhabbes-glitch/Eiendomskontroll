// Netlify-funksjon for arbeidsordre: sende på e-post, invitere eksterne utførende
// og la dem opprette bruker. Kjører med Supabase service-nøkkel på serveren.
//
// E-post sendes via SMTP (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS – f.eks. Gmail med app-passord)
// eller Resend (RESEND_API_KEY). Avsender settes i EPOST_FRA. Svar går til den som sendte (eller EPOST_SVAR).
// Uten nøkkel returneres teksten, og appen åpner brukerens eget e-postprogram.
import { createClient } from '@supabase/supabase-js';
import { kompForKontroll, nyRunde, malIRunde, renKompSvar, sjekkMaler, punkterFor, sysSjekkFor, renSysSjekk, sysSjekkAvvik } from '../../src/lib/komponentsjekk';
import enOrd from '../../src/i18n/en.json';
import svOrd from '../../src/i18n/sv.json';
import daOrd from '../../src/i18n/da.json';
import esMxOrd from '../../src/i18n/es-MX.json';
import esEsOrd from '../../src/i18n/es-ES.json';
import ws from 'ws'; // Node < 22 mangler innebygd WebSocket, som supabase-js krever
// Lagringen godtar bare ASCII i filbanen
const asciiNavn = (n: any) => String(n || 'fil').replace(/[æÆ]/g, m => m === 'æ' ? 'ae' : 'Ae').replace(/[øØ]/g, m => m === 'ø' ? 'o' : 'O').replace(/[åÅ]/g, m => m === 'å' ? 'a' : 'A')
  .normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/_+/g, '_').slice(-80) || 'fil';

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
  const egne: string[] = []; // innlogget bruker – alltid tillatt mottaker i testmodus
  const hvem = async () => {
    if (!token) return null; const { data } = await admin.auth.getUser(token); if (!data?.user) return null;
    // Tofaktor: samme regel som i databasen (token er verifisert av getUser, så aal-feltet er til å stole på)
    const { data: mok } = await admin.rpc('mfa_ok_for', { p_uid: data.user.id, p_aal: aalFra(token) }); if (mok === false) return null;
    const { data: p } = await admin.from('profiles').select('*').eq('id', data.user.id).single(); if (p) egne.push((p.epost || data.user.email || '').toLowerCase()); return p ? { ...p, epost: (p.epost || data.user.email || '').toLowerCase() } : null;
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
  // Lenker uten innlogging kan laste opp vedlegg. En øvre grense per arbeidsordre hindrer at en lenke brukes til å fylle disken.
  const MAKS_OPPLASTET = 60;
  const forMangeFiler = async (mappe: string) => { const { data } = await admin.storage.from('filer').list(mappe, { limit: MAKS_OPPLASTET + 1 }); return (data || []).length > MAKS_OPPLASTET; };
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
  // ---------- Språk i e-post: eiendommens valg (data.epostSprak), ellers ut fra landet. Samme ordbøker som appen.
  const ORDBOK: Record<string, any> = { en: enOrd, sv: svOrd, da: daOrd, 'es-MX': esMxOrd, 'es-ES': esEsOrd };
  const ordbok = async (sp: string) => ORDBOK[sp] || null;
  const SPRAK_OK = ['nb', 'en', 'sv', 'da', 'es-MX', 'es-ES'];
  const LAND_SPRAK: Record<string, string> = { SE: 'sv', DK: 'da', MX: 'es-MX' };
  const LOKALE: Record<string, string> = { nb: 'nb-NO', en: 'en-GB', sv: 'sv-SE', da: 'da-DK', 'es-MX': 'es-MX', 'es-ES': 'es-ES' };
  const VALUTA: Record<string, string> = { NO: 'kr', SE: 'kr', DK: 'kr.', MX: '$' };
  const lagSp = async (sp0: string, land = 'NO') => {
    const sp = SPRAK_OK.includes(sp0) ? sp0 : 'nb'; const d = await ordbok(sp);
    const t = (s0: any, ...a: any[]) => { const s1 = String(s0 ?? ''); let r = (d && s1 && (d[s1] || d[s1.replace(/\s+/g, ' ').trim()])) || s1; a.forEach((v, i) => { r = r.split('{' + i + '}').join(String(v ?? '')); }); return r; };
    const dato = (x?: string) => { if (!x) return ''; const [y, m, dd] = String(x).slice(0, 10).split('-'); return sp === 'sv' ? `${y}-${m}-${dd}` : sp === 'nb' || sp === 'da' ? `${dd}.${m}.${y}` : `${dd}/${m}/${y}`; };
    const kr = (v: any) => { const n = new Intl.NumberFormat(LOKALE[sp], { maximumFractionDigits: 0 }).format(Math.round(+v || 0)); return land === 'MX' ? '$' + n : n + ' ' + (VALUTA[land] || 'kr'); };
    const tz = ({ SE: 'Europe/Stockholm', DK: 'Europe/Copenhagen', MX: 'America/Mexico_City' } as any)[land] || 'Europe/Oslo';
    const tid = (x: any) => new Date(x).toLocaleString(LOKALE[sp], { timeZone: tz });
    return { t, sp, lok: LOKALE[sp], dato, kr, tid };
  };
  type Sp = Awaited<ReturnType<typeof lagSp>>;
  const spCache: Record<string, Sp> = {};
  const sprakFor = async (eid?: string | null, overstyr?: string): Promise<Sp> => {
    const k = (eid || '') + '|' + (overstyr || ''); if (spCache[k]) return spCache[k];
    const { data: e } = eid ? await admin.from('eiendommer').select('data').eq('id', eid).maybeSingle() : { data: null as any };
    const land = e?.data?.land || 'NO'; const sp = (overstyr && SPRAK_OK.includes(overstyr) ? overstyr : '') || e?.data?.epostSprak || LAND_SPRAK[land] || 'nb';
    return (spCache[k] = await lagSp(sp, land));
  };
  /** Språk for e-post til en bruker av appen: brukerens eget språk (user_metadata.sprak), ellers eiendommens */
  const sprakForBruker = async (uid?: string | null, eid?: string | null, epost?: string): Promise<Sp> => {
    let id = uid || ''; if (!id && epost) { const { data: pr } = await admin.from('profiles').select('id').eq('epost', String(epost).toLowerCase()).maybeSingle(); id = pr?.id || ''; }
    const s = id ? (await admin.auth.admin.getUserById(id).catch(() => null as any))?.data?.user?.user_metadata?.sprak : '';
    if (!SPRAK_OK.includes(s)) return sprakFor(eid);
    const { data: e } = eid ? await admin.from('eiendommer').select('data').eq('id', eid).maybeSingle() : { data: null as any };
    return lagSp(s, e?.data?.land || 'NO');
  };
  /** Språk for organisasjonen (purringer og varsler til eier): det vanligste blant eiendommene */
  const sprakForOrg = async (org: string, overstyr?: string): Promise<Sp> => {
    if (overstyr && SPRAK_OK.includes(overstyr)) return lagSp(overstyr);
    const { data: E } = await admin.from('eiendommer').select('data').eq('eier_org_id', org); const n: Record<string, number> = {};
    (E || []).forEach((e: any) => { const sp = e.data?.epostSprak || LAND_SPRAK[e.data?.land] || 'nb'; n[sp] = (n[sp] || 0) + 1; });
    return lagSp(Object.entries(n).sort((a, b) => b[1] - a[1])[0]?.[0] || 'nb');
  };
  const orgNavnFor = async (eid: string) => { const { data: e } = await admin.from('eiendommer').select('eier_org_id').eq('id', eid).maybeSingle(); if (!e?.eier_org_id) return ''; const { data: o } = await admin.from('organisasjoner').select('navn').eq('id', e.eier_org_id).maybeSingle(); return o?.navn || ''; };

  // E-postoppsett: fra appens Innstillinger (tabellen epost_oppsett), ellers miljøvariabler i Netlify.
  type Oppsett = { metode: 'smtp' | 'resend' | ''; fraNavn: string; fraEpost: string; svarTil: string; smtpHost: string; smtpPort: number; smtpUser: string; passord: string; kilde: string; testmodus?: boolean; tillatt?: string[] };
  // Testmodus (standard PÅ til den slås av i Innstillinger): e-post sendes bare til adresser på listen over tillatte,
  // til den innloggede brukeren selv og til utvikleradressen. Alt annet holdes tilbake og logges.
  const tmFra = (d: any) => ({ testmodus: d?.testmodus !== false, tillatt: Array.isArray(d?.tillatt) ? d.tillatt.map((x: any) => String(x).trim().toLowerCase()).filter(Boolean) : [] });
  const hentOppsett = async (org?: string | null): Promise<Oppsett> => ({ ...(await hentOppsett0(org)), ...tmFra(await epostData(org)) });
  const epostData = async (org?: string | null) => { if (org) { const { data: r } = await admin.from('epost_oppsett').select('data').eq('org_id', org).maybeSingle(); if (r) return r.data || {}; } const { data: alle } = await admin.from('epost_oppsett').select('data'); return (alle || []).some((r: any) => r.data?.testmodus === false) && (alle || []).every((r: any) => r.data?.testmodus === false) ? { testmodus: false } : {}; };
  const hentOppsett0 = async (org?: string | null): Promise<Oppsett> => {
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
    if (o.testmodus !== false) {
      const ok = new Set([...(o.tillatt || []), ...egne, ...(process.env.UTVIKLER_EPOST || '').split(/[,;\s]+/)].map(x => x.trim().toLowerCase()).filter(Boolean));
      if (!ok.has(String(til).trim().toLowerCase())) {
        await admin.from('hendelseslogg').insert({ bruker_id: null, bruker: 'E-post (testmodus)', tabell: 'hendelse', handling: 'epost', tekst: `Testmodus: e-post til ${til} ble holdt tilbake – «${String(emne).slice(0, 200)}»` });
        return { sendt: false, holdt: true, grunn: `Testmodus er på – e-posten til ${til} ble IKKE sendt. Legg adressen til i listen over tillatte mottakere (Innstillinger → E-post) eller slå av testmodus for å sende.` };
      }
    }
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
      return json(200, { data: r?.data || {}, harHemmelig: !!r?.hemmelig, aktiv: { metode: o.metode, kilde: o.kilde, fra: o.fraEpost, testmodus: o.testmodus !== false, tillatt: o.tillatt || [] } });
    }
    if (body.action === 'epost_lagre') {
      const d = body.data || {}; const ren = { metode: ['smtp', 'resend'].includes(d.metode) ? d.metode : '', fraNavn: String(d.fraNavn || '').slice(0, 120), fraEpost: String(d.fraEpost || '').trim().slice(0, 200), svarTil: String(d.svarTil || '').trim().slice(0, 200), smtpHost: String(d.smtpHost || '').trim(), smtpPort: +d.smtpPort || 465, smtpUser: String(d.smtpUser || '').trim(), testmodus: d.testmodus !== false, tillatt: (Array.isArray(d.tillatt) ? d.tillatt : String(d.tillatt || '').split(/[,;\s]+/)).map((x: any) => String(x).trim().toLowerCase()).filter((x: string) => /^\S+@\S+\.\S+$/.test(x)).slice(0, 50) };
      const { data: gml } = await admin.from('epost_oppsett').select('hemmelig').eq('org_id', org).maybeSingle();
      const hemmelig = typeof body.hemmelig === 'string' && body.hemmelig.trim() ? body.hemmelig.trim() : body.slettHemmelig ? null : gml?.hemmelig ?? null;
      const { error } = await admin.from('epost_oppsett').upsert({ org_id: org, data: ren, hemmelig, endret: new Date().toISOString(), endret_av: p.id });
      if (error) return json(500, { error: 'Kunne ikke lagre: ' + error.message });
      await admin.from('hendelseslogg').insert({ bruker_id: p.id, bruker: p.navn || p.epost, tabell: 'hendelse', handling: 'innstilling', org_id: org, tekst: `E-postoppsett endret (${ren.metode || 'av'}, avsender ${ren.fraNavn} <${ren.fraEpost}>, testmodus ${ren.testmodus ? 'PÅ' : 'AV'}${ren.tillatt.length ? ', tillatt: ' + ren.tillatt.join(', ') : ''})${typeof body.hemmelig === 'string' && body.hemmelig.trim() ? ', nytt passord/nøkkel' : ''}` });
      return json(200, { ok: true });
    }
    const o = await hentOppsett(org);
    const { t } = await sprakForOrg(org || '', body.sprak);
    const r = await sendEpost(p.epost, t('Test fra Eiendomskontroll'), `<p>${esc(t('Dette er en test av e-postoppsettet.'))}</p><p>${esc(t('Avsender'))}: ${esc(o.fraNavn)} &lt;${esc(o.fraEpost)}&gt;<br>${esc(t('Svar går til'))}: ${esc(o.svarTil || p.epost)}</p>`, `${t('Dette er en test av e-postoppsettet.')}\n${t('Avsender')}: ${o.fraNavn} <${o.fraEpost}>`, undefined, p.epost, o);
    return json(200, { ...r, til: p.epost });
  }

  const aoTekst = (a: any, lenke: string, melding: string, avsender: string, L: Sp) => {
    const { t } = L; const d = a.data || {}; const ao = d.ao || {}; const frist = d.frist ? L.dato(d.frist) : '';
    const linjer = [
      t('Arbeidsordre – avvik #{0}: {1}', a.nr, d.tittel || ''), '',
      melding ? melding + '\n' : '',
      `${t('Eiendom')}: ${ao.eiendom || ''}${ao.adresse ? ', ' + ao.adresse : ''}`,
      ao.system ? `${t('System')}: ${ao.system}` : '', ao.komponent ? `${t('Komponent')}: ${ao.komponent}` : '',
      ao.tegning ? `${t('Plassering')}: ${ao.tegning}${ao.plassering ? ' – ' + ao.plassering : ''} (${t('se markering på tegning i lenken/vedlegget')})` : ao.plassering ? `${t('Plassering')}: ${ao.plassering}` : '',
      `${t('Alvorlighet')}: ${t(d.alv || '')}${frist ? ' · ' + t('Frist') + ': ' + frist : ''}`,
      d.beskrivelse ? '\n' + t('Beskrivelse') + ':\n' + d.beskrivelse : '', '',
      `${t('Åpne arbeidsordren, kvitter ut og last opp bilder/dokumentasjon her:')}\n${lenke}`, '',
      t('Sendt av {0}', avsender)].filter(x => x !== '');
    const tekst = linjer.join('\n');
    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#1d2320">
      <p style="font-size:12px;color:#6b736d;margin:0">${esc(t('ARBEIDSORDRE'))}</p><h2 style="margin:4px 0 12px">${esc(t('Avvik #{0}: {1}', a.nr, d.tittel || ''))}</h2>
      ${melding ? `<p>${esc(melding).replace(/\n/g, '<br>')}</p>` : ''}
      <table style="border-collapse:collapse;font-size:14px">${[['Eiendom', (ao.eiendom || '') + (ao.adresse ? ', ' + ao.adresse : '')], ['System', ao.system], ['Komponent', ao.komponent], ['Plassering', [ao.tegning, ao.plassering].filter(Boolean).join(' – ')], ['Alvorlighet', t(d.alv || '')], ['Frist', frist]].filter(r => r[1]).map(r => `<tr><td style="padding:3px 14px 3px 0;color:#6b736d">${esc(t(r[0]))}</td><td style="padding:3px 0">${esc(r[1])}</td></tr>`).join('')}</table>
      ${d.beskrivelse ? `<p style="margin-top:12px"><b>${esc(t('Beskrivelse'))}</b><br>${esc(d.beskrivelse).replace(/\n/g, '<br>')}</p>` : ''}
      <p style="margin:20px 0"><a href="${esc(lenke)}" style="background:#1f6f5c;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">${esc(t('Åpne arbeidsordren'))}</a></p>
      <p style="font-size:12px;color:#6b736d">${esc(t('Via lenken kan du opprette bruker (eller logge inn), se plasseringen på tegningen, kvittere ut jobben og laste opp bilder og dokumentasjon.'))}<br>${esc(t('Sendt av {0}.', avsender))}</p></div>`;
    return { emne: t('Arbeidsordre – avvik #{0}: {1}', a.nr, d.tittel || ''), tekst, html };
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
    const m = aoTekst(a, lenke, String(body.melding || ''), p.navn || p.epost, await sprakFor(a.eiendom_id, body.mottakerSprak));
    const vedlegg = typeof body.pdf === 'string' && body.pdf.length < 8_000_000 ? { navn: (await sprakFor(a.eiendom_id, body.mottakerSprak)).t('Arbeidsordre avvik {0}.pdf', a.nr), base64: body.pdf } : undefined;
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
      const navn = asciiNavn(body.navn);
      if (await forMangeFiler(`${a.eiendom_id}/ao/${a.id}`)) return json(429, { error: 'Det er lastet opp for mange filer på denne arbeidsordren. Kontakt oppdragsgiveren.' });
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
      if (avs?.epost) { const { t } = await sprakForBruker(inv.opprettet_av, a.eiendom_id); await sendEpost(avs.epost, t('Utført: avvik #{0} {1}', a.nr, d.tittel || ''), `<p>${esc(t('{0} har kvittert ut avvik #{1} {2} som utført:', av, a.nr, d.tittel || ''))}</p><p>${esc(komm).replace(/\n/g, '<br>')}</p><p>${esc(t('{0} vedlegg. Avviket står som «Utført – til kontroll» i Eiendomskontroll.', filer.length))}</p>`, `${t('{0} har kvittert ut avvik #{1} {2} som utført:', av, a.nr, d.tittel || '')} ${komm}`, undefined, undefined, await oppsettFor(a.eiendom_id)); } }
    return json(200, { ok: true });
  }

  // ================= Sjekkliste til leietaker =================
  const hentLt = async (id: string) => { const { data } = await admin.from('leietakere').select('*').eq('id', id).maybeSingle(); return data; };
  const ltLogg = (p: any, l: any, tekst: string) => admin.from('hendelseslogg').insert({ bruker_id: p?.id || null, bruker: p ? (p.navn || p.epost) : 'System', tabell: 'hendelse', rad_id: l.id, eiendom_id: l.eiendom_id, handling: 'sjekkliste', tekst });

  // Eier/forvalter sender sjekklisten til leietaker på e-post (lenke til portalen, evt. med registrering)
  // ---------- Brannbok delt med brannvesenet (lenke uten innlogging, bare lesing + merknader)
  if (['bb_hent', 'bb_fil', 'bb_merknad'].includes(body.action)) {
    const tok = String(body.token || ''); if (tok.length < 20) return json(404, { error: 'Ugyldig lenke' });
    const { data: L } = await admin.from('brannbok_lenker').select('*').eq('token', tok).maybeSingle();
    const d = L?.data || {}; const idag = new Date().toISOString().slice(0, 10);
    if (!L || d.trukket) return json(404, { error: 'Lenken finnes ikke eller er trukket tilbake' });
    if (d.utloper && String(d.utloper) < idag) return json(410, { error: 'Lenken er utløpt. Be eier om en ny lenke.' });
    const inn = d.innhold || {};
    if (body.action === 'bb_hent') {
      await admin.from('brannbok_lenker').update({ data: { ...d, apnet: [...(d.apnet || []), { tid: new Date().toISOString() }].slice(-100) } }).eq('id', L.id);
      const { data: M } = await admin.from('brannbok_merknader').select('id, seksjon, data, created_at').eq('lenke_id', L.id).order('created_at');
      return json(200, { innhold: inn, lenke: { til: d.til || '', utloper: d.utloper || '', merknader: d.merknader !== false, oppdatert: d.oppdatert || L.created_at, pdf: d.pdfPath || '' }, merknader: (M || []).map((m: any) => ({ id: m.id, seksjon: m.seksjon, tid: m.created_at, tekst: m.data?.tekst, navn: m.data?.navn, etat: m.data?.etat, status: m.data?.status || 'ny', svar: m.data?.svar, svarAv: m.data?.svarAv, svarTid: m.data?.svarTid })) });
    }
    if (body.action === 'bb_fil') {
      const path = String(body.path || ''); const lov = new Set([d.pdfPath, ...((inn.vedlegg || []).map((v: any) => v.path))].filter(Boolean));
      if (!lov.has(path)) return json(403, { error: 'Filen er ikke en del av brannboken' });
      const { data: u, error } = await admin.storage.from('filer').createSignedUrl(path, 600); if (error || !u) return json(404, { error: 'Fant ikke filen' });
      return json(200, { url: u.signedUrl });
    }
    // bb_merknad
    if (d.merknader === false) return json(403, { error: 'Merknader er ikke slått på for denne lenken' });
    const tekst = String(body.tekst || '').trim().slice(0, 5000); const navn = String(body.navn || '').trim().slice(0, 120); const etat = String(body.etat || '').trim().slice(0, 160);
    const seksjon = String(body.seksjon || 'samlet'); const sek = (inn.sek || []).find((x: any) => x.key === seksjon);
    if (!tekst || !navn) return json(400, { error: 'Skriv inn navn og merknad' });
    if (seksjon !== 'samlet' && !sek) return json(400, { error: 'Ukjent seksjon' });
    const { count } = await admin.from('brannbok_merknader').select('id', { count: 'exact', head: true }).eq('lenke_id', L.id); if ((count || 0) >= 300) return json(429, { error: 'Grensen for antall merknader på lenken er nådd' });
    const epost = String(body.epost || '').trim().slice(0, 160);
    const { data: m, error } = await admin.from('brannbok_merknader').insert({ eiendom_id: L.eiendom_id, lenke_id: L.id, seksjon, data: { tekst, navn, etat, epost, status: 'ny' } }).select().single();
    if (error) return json(500, { error: error.message });
    const hvor = seksjon === 'samlet' ? 'samlet merknad' : `«${sek?.tittel || seksjon}»`;
    await admin.from('hendelseslogg').insert({ bruker_id: null, bruker: `${navn}${etat ? ' (' + etat + ')' : ''}`, tabell: 'hendelse', rad_id: L.id, eiendom_id: L.eiendom_id, handling: 'brannbok', tekst: `Merknad på brannboken (${hvor}): ${tekst.slice(0, 300)}` });
    if (d.opprettetAvEpost) { try { const en = inn.eiendom?.navn || ''; await sendEpost(d.opprettetAvEpost, `Ny merknad på brannboken${en ? ' – ' + en : ''}`, `<div style="font-family:Arial,sans-serif;font-size:14px"><p><b>${esc(navn)}</b>${etat ? ' (' + esc(etat) + ')' : ''} har lagt inn en merknad på brannboken${en ? ' for ' + esc(en) : ''} (${esc(hvor)}):</p><blockquote style="border-left:3px solid #C9A66B;margin:0;padding:6px 12px">${esc(tekst).replace(/\n/g, '<br>')}</blockquote><p style="font-size:12px;color:#566170">Svar på merknaden i appen under Brannbok.</p></div>`, `${navn}${etat ? ' (' + etat + ')' : ''} har lagt inn en merknad på brannboken (${hvor}):\n\n${tekst}`, undefined, undefined, await oppsettFor(L.eiendom_id, null)); } catch { /* varsling er ikke kritisk */ } }
    return json(200, { ok: true, merknad: { id: m.id, seksjon, tid: m.created_at, tekst, navn, etat, status: 'ny' } });
  }
  if (body.action === 'bb_send') {
    const p = await hvem(); if (!p) return json(401, { error: 'Ikke innlogget' });
    const { data: L } = await admin.from('brannbok_lenker').select('*').eq('id', String(body.lenke_id || '')).maybeSingle(); if (!L) return json(404, { error: 'Fant ikke lenken' });
    if (!(await harEiendom(p, L.eiendom_id))) return json(403, { error: 'Du har ikke tilgang til eiendommen' });
    const til = String(body.epost || '').trim().toLowerCase(); if (!/^\S+@\S+\.\S+$/.test(til)) return json(400, { error: 'Ugyldig e-postadresse' });
    const base = typeof body.lenkeBase === 'string' && /^https?:\/\//.test(body.lenkeBase) ? body.lenkeBase.replace(/\/+$/, '') : '';
    const d = L.data || {}; const en = d.innhold?.eiendom?.navn || ''; const lenke = `${base}/#/bb/${L.token}`; const avs = p.navn || p.epost;
    const utl = d.utloper ? String(d.utloper).split('-').reverse().join('.') : '';
    const melding = String(body.melding || '').slice(0, 4000) || `Vedlagt lenke til brannboken for ${en || 'bygget'} til gjennomgang.`;
    const emne = `Brannbok${en ? ' – ' + en : ''}`;
    const tekst = ['Hei,', '', melding, '', `Åpne brannboken: ${lenke}`, utl ? `Lenken gjelder til ${utl}.` : '', d.merknader !== false ? 'Dere kan legge inn merknader per kapittel eller samlet nederst i brannboken.' : '', '', `Hilsen ${avs}`].filter(x => x !== '').join('\n');
    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#1A1F2B"><div style="background:#1E4D57;color:#fff;padding:14px 18px;border-bottom:3px solid #C9A66B"><div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#CFE0E3">Brannbok</div><div style="font-size:18px;font-weight:bold">${esc(en)}</div></div>
      <div style="padding:16px 4px"><p>Hei,</p><p>${esc(melding).replace(/\n/g, '<br>')}</p><p style="margin:20px 0"><a href="${esc(lenke)}" style="background:#1E4D57;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block">Åpne brannboken</a></p>
      <p style="font-size:12px;color:#566170">${utl ? `Lenken gjelder til ${esc(utl)}. ` : ''}${d.merknader !== false ? 'Dere kan legge inn merknader per kapittel eller samlet nederst. ' : ''}Ingen innlogging er nødvendig.</p><p style="font-size:12px;color:#566170">Sendt av ${esc(avs)}.</p></div></div>`;
    const r = await sendEpost(til, emne, html, tekst, undefined, p.epost || undefined, await oppsettFor(L.eiendom_id, await minOrg(p)));
    await admin.from('brannbok_lenker').update({ data: { ...d, sendt: [...(d.sendt || []), { tid: new Date().toISOString(), til, av: avs, sendt: !!r.sendt }] } }).eq('id', L.id);
    await admin.from('hendelseslogg').insert({ bruker_id: p.id, bruker: avs, tabell: 'hendelse', rad_id: L.id, eiendom_id: L.eiendom_id, handling: 'brannbok', tekst: `Lenke til brannboken ${r.sendt ? 'sendt' : 'klargjort'} til ${til}` });
    return json(200, { ...r, til, emne, tekst, lenke });
  }

  // Nøkkelkvittering sendt på nytt (f.eks. når mottakeren har mistet skjemaet). Vedleggene lages i nettleseren.
  if (body.action === 'nokkel_send') {
    const p = await hvem(); if (!p) return json(401, { error: 'Ikke innlogget' });
    const { data: u } = await admin.from('nokkelutkvitteringer').select('*').eq('id', String(body.utkvittering_id || '')).maybeSingle(); if (!u) return json(404, { error: 'Fant ikke utkvitteringen' });
    if (!(await harEiendom(p, u.eiendom_id))) return json(403, { error: 'Du har ikke tilgang til eiendommen' });
    const til = String(body.epost || '').trim().toLowerCase(); if (!/^\S+@\S+\.\S+$/.test(til)) return json(400, { error: 'Ugyldig e-postadresse' });
    const V = (Array.isArray(body.vedlegg) ? body.vedlegg : []).filter((v: any) => v && typeof v.base64 === 'string').slice(0, 6);
    if (V.reduce((s: number, v: any) => s + v.base64.length, 0) > 5_500_000) return json(413, { error: 'Vedleggene er for store til å sendes på e-post' });
    const vedlegg = V.map((v: any) => ({ navn: String(v.navn || 'vedlegg.pdf').slice(0, 120), base64: v.base64, type: String(v.type || 'application/pdf') }));
    const { data: e } = await admin.from('eiendommer').select('data').eq('id', u.eiendom_id).maybeSingle(); const en = e?.data?.navn || '';
    const { t } = await sprakFor(u.eiendom_id, body.mottakerSprak); const d = u.data || {}; const avs = p.navn || p.epost;
    const nokler = (d.nokler || []).map((k: any) => `${k.type} ${k.lopenr}`).join(', ');
    const emne = `${t('Nøkkelkvittering nr {0}', u.nr)}${en ? ' – ' + en : ''}`;
    const melding = String(body.melding || '').slice(0, 4000);
    const standard = t('Vedlagt er kopi av kvitteringen for nøklene du har fått utlevert.');
    const tekst = [t('Hei {0},', d.person?.navn || ''), '', melding || standard, '', `${t('Nøkkelsystem')}: ${d.systemNavn || ''}`, `${t('Nøkler')}: ${nokler}`, `${t('Utlevert')}: ${String(d.dato || '').split('-').reverse().join('.')}`, '', t('Hilsen {0}', avs)].join('\n');
    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#1A1F2B"><div style="background:#1E4D57;color:#fff;padding:14px 18px;border-bottom:3px solid #C9A66B"><div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#CFE0E3">${esc(t('Nøkkelkvittering'))}</div><div style="font-size:18px;font-weight:bold">${esc(t('Nr.'))} ${esc(u.nr)}${en ? ' · ' + esc(en) : ''}</div></div>
      <div style="padding:16px 4px"><p>${esc(t('Hei {0},', d.person?.navn || ''))}</p><p>${esc(melding || standard).replace(/\n/g, '<br>')}</p>
      <table style="border-collapse:collapse;font-size:13px"><tr><td style="color:#566170;padding:3px 14px 3px 0">${esc(t('Nøkkelsystem'))}</td><td>${esc(d.systemNavn || '')}</td></tr><tr><td style="color:#566170;padding:3px 14px 3px 0">${esc(t('Nøkler'))}</td><td><b>${esc(nokler)}</b></td></tr><tr><td style="color:#566170;padding:3px 14px 3px 0">${esc(t('Utlevert'))}</td><td>${esc(String(d.dato || '').split('-').reverse().join('.'))}</td></tr></table>
      ${vedlegg.length ? `<p style="font-size:12px;color:#566170">${esc(t('Vedlegg: {0}', vedlegg.map((v: any) => v.navn).join(', ')))}</p>` : ''}<p style="font-size:12px;color:#566170">${esc(t('Sendt av {0}.', avs))}</p></div></div>`;
    const r = await sendEpost(til, emne, html, tekst, vedlegg, p.epost || undefined, await oppsettFor(u.eiendom_id, await minOrg(p)));
    await admin.from('hendelseslogg').insert({ bruker_id: p.id, bruker: avs, tabell: 'hendelse', rad_id: u.id, eiendom_id: u.eiendom_id, handling: 'nokler', tekst: `Nøkkelkvittering nr ${u.nr} ${r.sendt ? 'sendt' : 'klargjort'} på e-post til ${til}${vedlegg.length ? ' (' + vedlegg.map((v: any) => v.navn).join(', ') + ')' : ''}` });
    await admin.from('nokkelutkvitteringer').update({ data: { ...d, sendt: [...(d.sendt || []), { tid: new Date().toISOString(), til, av: avs, sendt: !!r.sendt }] } }).eq('id', u.id);
    return json(200, { ...r, til, emne, tekst });
  }

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
    const L = await sprakFor(l.eiendom_id, body.mottakerSprak); const { t } = L; const erNO = (e?.data?.land || 'NO') === 'NO';
    const frist = body.frist ? L.dato(String(body.frist)) : '';
    const melding = String(body.melding || ''); const avs = p.navn || p.epost; const bygg = en || t('bygget');
    const emne = `${t('Sjekkliste brann og internkontroll')} – ${d.navn || ''}${en ? ' (' + en + ')' : ''}`;
    const filTekst = t('Vedlagt ligger en ZIP-fil med sjekklisten (Excel) og én mappe per punkt. Fyll ut Excel-arket, legg dokumentasjonen i riktig mappe, zip mappen og send den tilbake som svar på denne e-posten.');
    const standard = erNO ? t('Som utleier følger vi opp at leietakerne i {0} ivaretar sine plikter etter forskrift om brannforebygging og internkontrollforskriften. Vi ber dere fylle ut sjekklisten og legge ved dokumentasjon.', bygg)
      : t('Som utleier følger vi opp at leietakerne i {0} ivaretar sine plikter innen brannsikkerhet og HMS. Vi ber dere fylle ut sjekklisten og legge ved dokumentasjon.', bygg);
    const tekst = [t('Hei,'), '', melding || standard, frist ? `\n${t('Frist')}: ${frist}` : '', '', t('Punkter:'), ...pl.map((x: any) => '- ' + t(x.navn)), '', maate !== 'lenke' ? filTekst : '', lenke ? `${maate === 'begge' ? t('Eller fyll ut på nett') : t('Fyll ut her')}:\n${lenke}` : '', '', t('Hilsen {0}', avs)].filter(x => x !== null).join('\n');
    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#1d2320"><p style="font-size:12px;color:#6b736d;margin:0">${esc(t('SJEKKLISTE'))}</p><h2 style="margin:4px 0 12px">${esc(t('Brann og internkontroll'))} – ${esc(d.navn)}</h2>
      <p>${esc(melding || standard).replace(/\n/g, '<br>')}</p>
      ${frist ? `<p><b>${esc(t('Frist'))}: ${esc(frist)}</b></p>` : ''}<ul>${pl.map((x: any) => `<li>${esc(t(x.navn))}</li>`).join('')}</ul>
      ${maate !== 'lenke' ? `<p style="background:#fff8e1;padding:10px 12px;border-radius:8px"><b>${esc(t('Vedlagt sjekkliste (ZIP):'))}</b> ${esc(filTekst)}</p>` : ''}
      ${lenke ? `<p style="margin:20px 0"><a href="${esc(lenke)}" style="background:#1f6f5c;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">${esc(maate === 'begge' ? t('Eller fyll ut på nett') : t('Åpne sjekklisten'))}</a></p>
      <p style="font-size:12px;color:#6b736d">${esc(t('Via lenken oppretter du bruker (eller logger inn), krysser av for dokumentasjonen og laster opp filer. Utleier går gjennom og godkjenner.'))}</p>` : ''}<p style="font-size:12px;color:#6b736d">${esc(t('Sendt av {0}.', avs))}</p></div>`;
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
  // Målere på systemet/komponenten – servicefirmaet kan registrere avlesninger i lenken (lagres når oppdragsgiver godkjenner)
  const koMaalere = async (o: any) => {
    const d = o.data || {};
    const q = d.komponentId ? admin.from('komponenter').select('id, data').eq('id', d.komponentId) : d.anleggId ? admin.from('komponenter').select('id, data').eq('system_id', d.anleggId) : null;
    if (!q) return [];
    const { data: kr } = await q; const M = (kr || []).filter((r: any) => r.data?.mType);
    const ut: any[] = [];
    for (const r of M) {
      const { data: av } = await admin.from('avlesninger').select('data').eq('komponent_id', r.id).order('created_at', { ascending: false }).limit(20);
      const siste = (av || []).map((a: any) => a.data).filter((x: any) => x?.dato).sort((a: any, b: any) => String(b.dato).localeCompare(String(a.dato)))[0];
      const k = r.data; const enh = k.mEnhet || ({ vann: 'm³', el: 'kWh', fjernvarme: 'kWh', fjernkjoling: 'kWh', varme: 'kWh', kjoling: 'kWh', gass: 'm³', olje: 'l', trykk: 'bar', temperatur: '°C', timer: 't' } as any)[k.mMedium] || '';
      ut.push({ id: r.id, label: kLabel(k), plassering: k.plassering || '', type: k.mType, enhet: enh, nr: k.mNr || '', min: k.mMin ?? null, max: k.mMax ?? null, forrige: siste ? { verdi: siste.verdi, dato: siste.dato } : null });
    }
    return ut;
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
  const koTekst = (o: any, sn: any, lenke: string, melding: string, avsender: string, bilder = false, L: Sp) => {
    const { t } = L; const d = o.data || {}; const b = d.aoBilder; const navn = t(d.navn || '');
    const rader: [string, string][] = [['Eiendom', [sn.eiendom, sn.adresse].filter(Boolean).join(', ')], ['System', sn.system], ['Oppdrag', navn], ['Sjekkliste', sn.komp ? t('{0} komponenter – kontrolleres og kvitteres ut én og én i lenken', sn.komp) : sn.sjekkN ? t('{0} – {1} punkter fylles ut i lenken', t(sn.sjekkNavn), sn.sjekkN) : ''], ['Type', [t(d.type || ''), t(d.kategori || '')].filter(Boolean).join(' · ')], ['Planlagt / frist', L.dato(d.nesteFrist)], ['Grunnlag', t(d.hjemmel || '')], ['Kontakt på stedet', sn.kontakt]];
    const tekst = [`${t('Arbeidsordre')} – ${navn}`, '', melding ? melding + '\n' : '', ...rader.filter(r => r[1]).map(r => `${t(r[0])}: ${r[1]}`), d.notat ? '\n' + t('Sjekkpunkter / merknader') + ':\n' + d.notat : '', bilder && b ? '\n' + t('Lokasjon: se vedlagte bilder fra tegningen {0}.', b.tegning) : '', '',
      `${t('Når jobben er utført: registrer dato, resultat og last opp servicerapport her (ingen innlogging):')}\n${lenke}`, '', t('Sendt av {0}', avsender)].filter(x => x !== '').join('\n');
    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#1d2320">
      <p style="font-size:12px;color:#6b736d;margin:0">${esc(t('ARBEIDSORDRE'))} – ${esc(t(d.type || 'kontroll').toUpperCase())}</p><h2 style="margin:4px 0 12px">${esc(navn)}</h2>
      ${melding ? `<p>${esc(melding).replace(/\n/g, '<br>')}</p>` : ''}
      <table style="border-collapse:collapse;font-size:14px">${rader.filter(r => r[1]).map(r => `<tr><td style="padding:3px 14px 3px 0;color:#6b736d;vertical-align:top">${esc(t(r[0]))}</td><td style="padding:3px 0">${esc(r[1])}</td></tr>`).join('')}</table>
      ${d.notat ? `<p style="margin-top:12px"><b>${esc(t('Sjekkpunkter / merknader'))}</b><br>${esc(d.notat).replace(/\n/g, '<br>')}</p>` : ''}
      ${bilder && b ? `<p style="margin:16px 0 4px"><b>${esc(t('Lokasjon'))} – ${esc(b.tegning)}</b>${b.andre?.length ? ` <span style="color:#6b736d">(${esc(t('også plassert på {0}', b.andre.join(', ')))})</span>` : ''}</p>
        <p style="margin:4px 0"><img src="cid:lokasjon-zoom" alt="${esc(t('Lokasjon (zoom)'))}" style="max-width:100%;border:1px solid #d9ddd8;border-radius:6px"></p>
        <p style="margin:4px 0"><img src="cid:lokasjon-oversikt" alt="${esc(t('Lokasjon (oversikt)'))}" style="max-width:100%;border:1px solid #d9ddd8;border-radius:6px"></p>
        <p style="font-size:12px;color:#6b736d;margin:2px 0 0">${esc(t('Grønn markering viser plasseringen. Rød stiplet ramme i oversikten viser utsnittet. Bildene ligger også som vedlegg.'))}</p>` : ''}
      <p style="margin:20px 0"><a href="${esc(lenke)}" style="background:#1f6f5c;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">${esc(t('Registrer utført og last opp rapport'))}</a></p>
      <p style="font-size:12px;color:#6b736d">${esc(t('Lenken krever ingen innlogging. Oppdragsgiver går gjennom rapporten før kontrollen registreres som utført.'))}<br>${esc(t('Sendt av {0}.', avsender))}</p></div>`;
    return { emne: `${t('Arbeidsordre')}: ${navn}${sn.eiendom ? ' – ' + sn.eiendom : ''}${d.nesteFrist ? ' (' + L.dato(d.nesteFrist) + ')' : ''}`, tekst, html };
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
    for (const [k, cid, navn] of [['zoom', 'lokasjon-zoom', 'Lokasjon - zoom.jpg'], ['oversikt', 'lokasjon-oversikt', 'Lokasjon - oversikt.jpg']] as const) { // filnavn holdes ASCII/norsk
      const path = d.aoBilder?.[k]?.path; if (!path || !String(path).startsWith(o.eiendom_id + '/')) continue;
      const { data: bl } = await admin.storage.from('filer').download(path); if (bl) vedl.push({ navn, base64: Buffer.from(await bl.arrayBuffer()).toString('base64'), type: 'image/jpeg', cid });
    }
    const L = await sprakFor(o.eiendom_id, (o as any)._sprak || d.ao?.sprak); const m = koTekst(o, sn, lenke, melding, avsender, vedl.length === 2, L);
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
    (o as any)._sprak = body.mottakerSprak; return json(200, await koSend(o, til, String(body.melding || '').slice(0, 2000), base, p));
  }

  // Regelverkssjekk mot Lovdata (kalles ukentlig av GitHub Actions med REGELVERK_TOKEN)
  if (body.action === 'regelverk_varsel') {
    const forv = (process.env.REGELVERK_TOKEN || '').trim(); const fikk = (req.headers.get('x-regelverk-token') || '').trim();
    const { timingSafeEqual } = await import('node:crypto');
    if (!forv) return json(503, { error: 'REGELVERK_TOKEN er ikke satt i Netlify (eller siden er ikke deployet på nytt etter at variabelen ble lagt inn)' });
    if (forv.length < 24) return json(503, { error: 'REGELVERK_TOKEN i Netlify er for kort – bruk minst 24 tegn' });
    if (fikk.length !== forv.length || !timingSafeEqual(Buffer.from(fikk), Buffer.from(forv))) return json(403, { error: 'Ikke tillatt' });
    const v = body.varsel || {}; const E: any[] = Array.isArray(v.endringer) ? v.endringer.slice(0, 50) : []; const PR: string[] = Array.isArray(v.problemer) ? v.problemer.slice(0, 50).map(String) : [];
    const type = ['startet', 'endringer', 'godkjent', 'test'].includes(v.type) ? v.type : 'endringer';
    const kort = type === 'test' ? `Regelverk: testvarsel – oppsettet for regelverkssjekken virker. ${E.length ? E.length + ' endring(er) venter.' : 'Ingen endringer siden grunnlinjen.'}` : type === 'godkjent' ? 'Regelverk: appen er kontrollert og oppdatert mot gjeldende lover og forskrifter (Lovdata).'
      : type === 'startet' ? `Regelverk: overvåking av ${body.antall || ''} lover og forskrifter mot Lovdata er startet.`
      : `Regelverk: ${E.length} endring(er) hos Lovdata i regelverk appen viser til – ${E.map(e => e.navn).slice(0, 6).join(', ')}. Tekster i appen oppdateres i en programoppdatering.`;
    // Hendelseslogg: én rad per organisasjon, synlig for administratorene
    const { data: orger } = await admin.from('organisasjoner').select('id');
    const rader = (orger || []).map((o: any) => ({ bruker_id: null, bruker: 'Regelverkssjekk (Lovdata)', tabell: 'hendelse', rad_id: null, eiendom_id: null, org_id: o.id, handling: 'regelverk', tekst: kort.slice(0, 1000),
      endringer: { type, sjekket: v.sjekket || new Date().toISOString(), endringer: E.map(e => ({ navn: String(e.navn || ''), tekst: String(e.tekst || '').slice(0, 500), lenke: String(e.lenke || ''), paragrafer: (e.paragrafer || []).slice(0, 30) })), issue: String(body.issue || '') } }));
    if (rader.length) { const { error } = await admin.from('hendelseslogg').insert(rader); if (error) console.error('regelverk logg', error.message); }
    // E-post til utvikler
    const til = (process.env.UTVIKLER_EPOST || process.env.EPOST_SVAR || '').split(/[,;\s]+/).filter(x => /^\S+@\S+\.\S+$/.test(x));
    let sendt = 0; const grunner: string[] = [];
    if (til.length && type !== 'godkjent') {
      const { data: op } = await admin.from('epost_oppsett').select('org_id').not('hemmelig', 'is', null).limit(1);
      const oppsett = await hentOppsett((process.env.REGELVERK_ORG || '').trim() || op?.[0]?.org_id || null);
      const emne = type === 'test' ? 'Eiendomskontroll: testvarsel fra regelverkssjekken' : type === 'startet' ? 'Eiendomskontroll: regelverksovervåking startet' : `Eiendomskontroll: ${E.length} regelverksendring(er) må vurderes i appen`;
      const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:720px;color:#1d2521"><h2 style="margin:0 0 8px">${esc(emne)}</h2><p>${esc(kort)}</p>
        ${E.length ? `<ul>${E.map(e => `<li><b>${esc(e.navn)}</b> – ${esc(e.tekst)}${e.lenke ? ` (<a href="${esc(e.lenke)}">Lovdata</a>)` : ''}</li>`).join('')}</ul>` : ''}
        ${PR.length ? `<p><b>Merknader:</b></p><ul>${PR.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        ${body.issue ? `<p><a href="${esc(String(body.issue))}">Se detaljer med før/etter-tekst i GitHub-saken</a></p>` : ''}
        <p style="font-size:12px;color:#6b736d">Når appen er oppdatert: kjør arbeidsflyten «Regelverkssjekk» med «godkjenn», så blir gjeldende tekst ny grunnlinje. Kilde: Lovdata (NLOD 2.0).</p></div>`;
      for (const t of til) { const r = await sendEpost(t, emne, html, `${emne}\n\n${kort}\n\n${String(v.rapport || '').slice(0, 20000)}`, undefined, undefined, oppsett).catch((e: any) => ({ sendt: false, grunn: e?.message }));
        if ((r as any).sendt) sendt++; else grunner.push((r as any).grunn || 'ukjent'); }
    } else if (!til.length) grunner.push('UTVIKLER_EPOST er ikke satt i Netlify');
    return json(200, { ok: true, logget: rader.length, sendt, grunner });
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

  // ---------- Purring på avvik (frist nær eller passert). Innstillinger per organisasjon: innstillinger.nokkel = 'avvikPurring'
  const PURR_STD = { ansvarlig: false, ansvarligFor: 3, ansvarligGjenta: 7, ansvarligMaks: 3, eier: false, eierEtter: 14, eierEpost: '', ukentlig: false, ukentligEpost: '' };
  const AV_LUKKET_S = ['Rettet', 'Avvist', 'Lukket'];
  const dagerTil = (d: string) => { const t = new Date(); t.setUTCHours(0, 0, 0, 0); return Math.round((new Date(d + 'T00:00:00Z').getTime() - t.getTime()) / 864e5); };
  const fdN = (d?: string) => d ? d.split('-').reverse().join('.') : '';
  const epostListe = (s0: string) => String(s0 || '').split(/[,;\s]+/).map(x => x.trim().toLowerCase()).filter(x => /^\S+@\S+\.\S+$/.test(x));
  /** Hvem som skal ha purringen: tildelt bruker → leverandør med åpen arbeidsordre-lenke → leietakers portalbrukere/kontakt */
  const purreMottakere = async (a: any, base: string) => {
    const d = a.data || {}; const ut: { epost: string; navn: string; lenke: string; hvem: string }[] = [];
    if (a.tildelt_id) { const { data: t } = await admin.from('profiles').select('epost, navn').eq('id', a.tildelt_id).maybeSingle(); if (t?.epost) ut.push({ epost: t.epost.toLowerCase(), navn: t.navn || '', lenke: `${base}/#/arbeidsordre/${a.id}`, hvem: 'tildelt' }); }
    if (!ut.length) { const { data: inv } = await admin.from('ao_invitasjon').select('token, epost, utloper, brukt').eq('avvik_id', a.id).order('opprettet', { ascending: false }).limit(1);
      const i = inv?.[0]; if (i && !i.brukt && (!i.utloper || new Date(i.utloper).getTime() > Date.now())) ut.push({ epost: i.epost.toLowerCase(), navn: '', lenke: `${base}/#/ao/${i.token}`, hvem: 'leverandør' }); }
    if (!ut.length && d.ansvar === 'Leietaker' && d.leietakerId) {
      const { data: pb } = await admin.from('profiles').select('epost, navn').eq('leietaker_id', d.leietakerId).eq('rolle', 'leietaker');
      for (const x of pb || []) if (x.epost) ut.push({ epost: x.epost.toLowerCase(), navn: x.navn || '', lenke: `${base}/#/portal`, hvem: 'leietaker' });
      if (!ut.length) { const { data: l } = await admin.from('leietakere').select('data').eq('id', d.leietakerId).maybeSingle(); const e = String(l?.data?.epost || '').toLowerCase(); if (/^\S+@\S+\.\S+$/.test(e)) ut.push({ epost: e, navn: l?.data?.kontakt || '', lenke: '', hvem: 'leietaker' }); }
    }
    return ut;
  };
  const purreTekst = (a: any, m: { navn: string; lenke: string }, etter: boolean, nr: number, L: Sp) => {
    const { t } = L; const d = a.data || {}; const ao = d.ao || {}; const dg = d.frist ? dagerTil(d.frist) : 0;
    const emne = `${etter ? (nr > 1 ? t('{0}. purring', nr) : t('Purring')) : t('Påminnelse')}: ${t('avvik #{0} {1}', a.nr, d.tittel || '')}${d.frist ? ` – ${t('frist {0}', L.dato(d.frist))}` : ''}`.slice(0, 180);
    const linje = etter ? t('Fristen for å utbedre avviket gikk ut {0} ({1} dager siden), og avviket er ikke meldt utført.', L.dato(d.frist), -dg) : t('Fristen for å utbedre avviket er {0} (om {1} dager).', L.dato(d.frist), dg);
    const rader = [['Eiendom', [ao.eiendom, ao.adresse].filter(Boolean).join(', ')], ['System', ao.system], ['Komponent', ao.komponent], ['Plassering', d.plassering], ['Alvorlighet', t(d.alv || '')], ['Status', t(d.status || '')]].filter(x => x[1]).map(x => [t(x[0]), x[1]]);
    const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:620px;color:#1d2521"><h2 style="margin:0 0 8px">${esc(emne)}</h2>${m.navn ? `<p>${esc(t('Hei {0},', m.navn))}</p>` : ''}<p>${esc(linje)}</p>
      <table style="border-collapse:collapse;font-size:14px">${rader.map(x => `<tr><td style="padding:3px 14px 3px 0;color:#6b736d">${esc(x[0])}</td><td>${esc(x[1])}</td></tr>`).join('')}</table>
      ${d.beskrivelse ? `<p style="margin-top:12px"><b>${esc(t('Beskrivelse'))}</b><br>${esc(d.beskrivelse).replace(/\n/g, '<br>')}</p>` : ''}
      ${m.lenke ? `<p style="margin:20px 0"><a href="${esc(m.lenke)}" style="background:#1f6f5c;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">${esc(t('Åpne avviket og kvitter ut'))}</a></p>` : `<p>${esc(t('Gi beskjed til eier når avviket er utbedret.'))}</p>`}
      <p style="font-size:12px;color:#6b736d">${esc(t('Er avviket allerede utbedret, kvitter det ut via lenken, så stopper påminnelsene. Ta kontakt dersom fristen ikke kan holdes.'))}</p></div>`;
    return { emne, html, tekst: `${emne}\n\n${linje}\n${rader.map(x => x[0] + ': ' + x[1]).join('\n')}\n\n${m.lenke ? t('Åpne') + ': ' + m.lenke : ''}` };
  };
  const SYS = { id: null, navn: 'Automatisk purring' };
  async function purrEn(a: any, base: string, etter: boolean, manuelt?: any) {
    const M = await purreMottakere(a, base); if (!M.length) return { sendt: 0, grunn: 'ingen mottaker (ikke tildelt, ingen åpen arbeidsordre-lenke eller leietakerkontakt)' };
    const d = a.data || {}; const pu = d.purring || {}; const nr = etter ? (pu.antall || 0) + 1 : 0; const o = await oppsettFor(a.eiendom_id, null);
    let sendt = 0; const til: string[] = [];
    const Lp = await sprakFor(a.eiendom_id); for (const m of M) { const t = purreTekst(a, m, etter, nr, Lp); const r = await sendEpost(m.epost, t.emne, t.html, t.tekst, undefined, undefined, o).catch(() => ({ sendt: false })); if ((r as any).sendt) { sendt++; til.push(m.epost); } }
    if (sendt) { const tid = new Date().toISOString(); const k = `${manuelt ? 'Purring sendt manuelt' : etter ? `Purring ${nr} sendt automatisk` : 'Påminnelse før frist sendt automatisk'} til ${til.join(', ')}`;
      const { data: fersk } = await admin.from('avvik').select('data').eq('id', a.id).single(); const fd0 = fersk?.data || d;
      await admin.from('avvik').update({ data: { ...fd0, purring: { ...(fd0.purring || {}), sist: tid, ...(etter ? { antall: (fd0.purring?.antall || 0) + 1 } : { forFrist: d.frist }), til }, logg: [...(fd0.logg || []), { t: tid, s: fd0.status, k, av: manuelt?.navn || SYS.navn }] } }).eq('id', a.id);
      await logg(manuelt || SYS, a, k); }
    return { sendt, til };
  }
  // Varsel til kundens administratorer når abonnementet endres (flere brukere eller nytt bygg)
  if (body.action === 'abonnement_varsel') {
    const p = await hvem(); if (!p) return json(401, { error: 'Ikke innlogget' }); const org = String(body.org_id || ''); if (!org) return json(400, { error: 'Mangler organisasjon' });
    const { data: med } = await admin.from('org_medlem').select('user_id, rolle, aktiv').eq('org_id', org);
    const erAdm = (med || []).some((m: any) => m.user_id === p.id && m.aktiv && ['admin', 'forvalter'].includes(m.rolle)) || !!(p as any).plattform_admin;
    if (!erAdm) return json(403, { error: 'Ingen tilgang' });
    const { data: o } = await admin.from('organisasjoner').select('navn, lisenser').eq('id', org).maybeSingle();
    const { count: bygg } = await admin.from('eiendommer').select('id', { count: 'exact', head: true }).eq('eier_org_id', org);
    const L = await sprakForOrg(org, body.sprak); const { t } = L; const kr = (v: number) => Math.round(v).toLocaleString(L.lok) + ' kr';
    const hva = body.type === 'bygg' ? (body.navn ? t('Et nytt bygg er lagt til («{0}»).', String(body.navn).slice(0, 120)) : t('Et nytt bygg er lagt til.'))
      : body.navn ? t('Antall brukere er økt fra {0} til {1} fordi {2} ble lagt til.', +body.fra || '?', o?.lisenser ?? '?', String(body.navn).slice(0, 120)) : t('Antall brukere er økt fra {0} til {1}.', +body.fra || '?', o?.lisenser ?? '?');
    const pris = Number.isFinite(+body.ny) && +body.ny > 0 ? t('Ny månedspris for aktive moduler er {0} eks. mva.', kr(+body.ny)) + (Number.isFinite(+body.gml) && +body.gml > 0 ? ' ' + t('(før: {0}).', kr(+body.gml)) : '') : '';
    const tekst = `${hva}\n\n${t('Abonnementet for {0} er justert i henhold til antall bygg og brukere: nå {1} bygg og {2} brukere.', o?.navn || t('organisasjonen'), bygg ?? '?', o?.lisenser ?? '?')} ${pris}\n\n${t('Endringen ble gjort av {0}. Du ser abonnementet under Organisasjon og tilgang → Abonnement.', p?.navn || p?.epost || t('en administrator'))}`;
    const html = tekst.split('\n\n').map(x => `<p>${x.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' } as any)[c])}</p>`).join('');
    const adm = (med || []).filter((m: any) => m.aktiv && m.rolle === 'admin').map((m: any) => m.user_id);
    const { data: prof } = adm.length ? await admin.from('profiles').select('epost').in('id', adm) : { data: [] as any[] };
    const opps = await hentOppsett(org); let sendt = 0; const feil: string[] = [];
    for (const r of prof || []) { if (!r.epost) continue; const res: any = await sendEpost(r.epost, `${t('Abonnementet er justert')} – ${o?.navn || ''}`.trim(), html, tekst, undefined, undefined, opps); if (res.sendt) sendt++; else if (res.grunn) feil.push(res.grunn); }
    await admin.from('hendelseslogg').insert({ bruker_id: p.id, bruker: p?.navn || p?.epost, tabell: 'hendelse', handling: 'abonnement', org_id: org, tekst: hva + ' ' + pris + ` Varsel sendt til ${sendt} administrator(er).` });
    return json(200, { ok: true, sendt, feil: feil.slice(0, 1) });
  }

  // Manuell purring fra appen («Send purring nå»)
  if (body.action === 'av_purr') {
    const p = await hvem(); if (!p) return json(401, { error: 'Ikke innlogget' });
    const a = await hentAvvik(body.avvik_id); if (!a) return json(404, { error: 'Fant ikke avviket' });
    if (!(await harEiendom(p, a.eiendom_id))) return json(403, { error: 'Du har ikke tilgang til eiendommen' });
    const base = typeof body.lenkeBase === 'string' && /^https?:\/\//.test(body.lenkeBase) ? body.lenkeBase.replace(/\/+$/, '') : (process.env.URL || '');
    const r = await purrEn(a, base, !!a.data?.frist && dagerTil(a.data.frist) < 0, p);
    return json(200, r);
  }
  // Daglig kjøring (fra den planlagte funksjonen ko-auto)
  if (body.action === 'av_purring') {
    const forventet = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('ko-auto:' + key)).then(b => Buffer.from(b).toString('hex'));
    if (req.headers.get('x-ek-cron') !== forventet) return json(403, { error: 'Ikke tillatt' });
    const base = (process.env.URL || '').replace(/\/+$/, ''); const rapport: any[] = [];
    const { data: innst } = await admin.from('innstillinger').select('org_id, data').eq('nokkel', 'avvikPurring');
    const mandag = new Date().getUTCDay() === 1;
    for (const r0 of innst || []) {
      const c = { ...PURR_STD, ...(r0.data || {}) }; if (!c.ansvarlig && !c.eier && !c.ukentlig) continue;
      const { data: org } = await admin.from('organisasjoner').select('id, navn, aktiv').eq('id', r0.org_id).maybeSingle(); if (!org?.aktiv) continue;
      const { data: E } = await admin.from('eiendommer').select('id, data').eq('eier_org_id', org.id); const eids = (E || []).map((e: any) => e.id); if (!eids.length) continue;
      const { data: A } = await admin.from('avvik').select('*').in('eiendom_id', eids);
      const apne = (A || []).filter((a: any) => !AV_LUKKET_S.includes(a.data?.status) && a.data?.frist);
      const ventende = apne.filter((a: any) => a.data?.status !== 'Utført – til kontroll' && a.data?.status !== 'Utsatt');
      let n = 0;
      if (c.ansvarlig) for (const a of ventende) {
        const d = a.data; const dg = dagerTil(d.frist); const pu = d.purring || {};
        const forFrist = dg >= 0 && dg <= Math.max(0, +c.ansvarligFor || 0) && pu.forFrist !== d.frist;
        const sidenSist = pu.sist ? (Date.now() - new Date(pu.sist).getTime()) / 864e5 : 1e9;
        const etter = dg < 0 && (pu.antall || 0) < Math.max(0, +c.ansvarligMaks || 0) && sidenSist >= Math.max(1, +c.ansvarligGjenta || 7) - 0.1;
        if (forFrist || etter) { const r = await purrEn(a, base, etter); if (r.sendt) n++; }
      }
      // Eskalering til eier (bare når bryteren er på): én samlet e-post med avvik som har passert fristen med X dager
      const adminEpost = async () => { const { data: m } = await admin.from('org_medlem').select('rolle, profiles(epost)').eq('org_id', org.id).eq('rolle', 'admin').eq('aktiv', true); return (m || []).map((x: any) => x.profiles?.epost).filter(Boolean); };
      const Lo = await sprakForOrg(org.id); const to = Lo.t;
      const tabell = (L: any[]) => `<table style="border-collapse:collapse;font-size:13px;width:100%"><tr style="background:#f4f5f2">${['Avvik', 'Eiendom', 'Ansvar', 'Frist', 'Status'].map((h, i) => `<th align="left"${i ? '' : ' style="padding:4px"'}>${esc(to(h))}</th>`).join('')}</tr>${L.map((a: any) => `<tr><td style="padding:4px;border-top:1px solid #e3e6e1">#${a.nr} ${esc(a.data.tittel)}</td><td style="border-top:1px solid #e3e6e1">${esc(a.data.ao?.eiendom || (E || []).find((e: any) => e.id === a.eiendom_id)?.data?.navn || '')}</td><td style="border-top:1px solid #e3e6e1">${esc(to(a.data.ansvar || 'Eier'))}</td><td style="border-top:1px solid #e3e6e1;color:${dagerTil(a.data.frist) < 0 ? '#c0392b' : '#1d2521'}">${Lo.dato(a.data.frist)}${dagerTil(a.data.frist) < 0 ? ` (${esc(to('{0} d over', -dagerTil(a.data.frist)))})` : ''}</td><td style="border-top:1px solid #e3e6e1">${esc(to(a.data.status))}</td></tr>`).join('')}</table>`;
      if (c.eier) {
        const L = ventende.filter((a: any) => dagerTil(a.data.frist) <= -Math.max(0, +c.eierEtter || 0) && !a.data.purring?.eierSendt);
        const til = epostListe(c.eierEpost).length ? epostListe(c.eierEpost) : await adminEpost();
        if (L.length && til.length) { const o = await oppsettFor(null, org.id); const emne = to('{0} avvik har passert fristen med mer enn {1} dager', L.length, c.eierEtter);
          for (const t of til) await sendEpost(t, emne, `<div style="font-family:system-ui,Arial,sans-serif;max-width:760px"><h2>${esc(emne)}</h2><p>${esc(to('Avvikene er ikke meldt utført, og ansvarlig er purret der det finnes en mottaker.'))}</p>${tabell(L)}<p><a href="${base}/#/avvik">${esc(to('Åpne avvikslisten'))}</a></p></div>`, `${emne}\n\n${L.map((a: any) => `#${a.nr} ${a.data.tittel} – ${to('frist {0}', Lo.dato(a.data.frist))}`).join('\n')}`, undefined, undefined, o).catch(() => null);
          for (const a of L) { const { data: fr } = await admin.from('avvik').select('data').eq('id', a.id).single(); await admin.from('avvik').update({ data: { ...fr!.data, purring: { ...(fr!.data.purring || {}), eierSendt: new Date().toISOString() } } }).eq('id', a.id); }
          await admin.from('hendelseslogg').insert({ bruker_id: null, bruker: SYS.navn, tabell: 'hendelse', rad_id: null, eiendom_id: null, org_id: org.id, handling: 'purring', tekst: `Eskalering til eier: ${L.length} avvik over frist sendt til ${til.join(', ')}` }); }
      }
      // Ukentlig oppsummering (mandager)
      if (c.ukentlig && mandag) {
        const L = apne.filter((a: any) => dagerTil(a.data.frist) <= 14).sort((x: any, y: any) => x.data.frist.localeCompare(y.data.frist));
        const til = epostListe(c.ukentligEpost).length ? epostListe(c.ukentligEpost) : await adminEpost();
        if (L.length && til.length) { const o = await oppsettFor(null, org.id); const over = L.filter((a: any) => dagerTil(a.data.frist) < 0).length; const emne = to('Ukeoversikt avvik: {0} over frist, {1} med frist innen 14 dager', over, L.length - over);
          for (const t of til) await sendEpost(t, emne, `<div style="font-family:system-ui,Arial,sans-serif;max-width:760px"><h2>${esc(emne)}</h2>${tabell(L)}<p><a href="${base}/#/avvik">${esc(to('Åpne avvikslisten'))}</a></p></div>`, emne, undefined, undefined, o).catch(() => null); }
      }
      rapport.push({ org: org.navn, purret: n });
    }
    return json(200, { ok: true, rapport });
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
    const sjekk = kr ? null : await koSysSjekk(o); const maalere = await koMaalere(o).catch(() => []);
    return json(200, { maalere, sjekk, komp, runde, intervall: d.intervall || null, bilder, tilstand, tegning: d.aoBilder?.tegning || '', navn: d.navn, type: d.type, kategori: d.kategori, frist: inv.frist || d.nesteFrist, hjemmel: d.hjemmel || '', notat: d.notat || '', eiendom: sn.eiendom, adresse: sn.adresse, system: sn.system, kontakt: sn.kontakt, oppdragsgiver: sn.orgNavn, epost: inv.epost, innsendt: inv.innsendt, utloper: inv.utloper, utdatert: !!(inv.frist && d.nesteFrist && inv.frist !== d.nesteFrist && !inv.innsendt) });
  }
  if (body.action === 'ko_opplasting') {
    const inv = await hentKo(body.token); if (!inv || inv.innsendt) return json(403, { error: 'Lenken er ugyldig eller allerede brukt' });
    if (utlopt(inv)) return json(410, { error: UTLOPT });
    const navn = asciiNavn(body.navn);
    if (await forMangeFiler(`${inv.eiendom_id}/ko/${inv.oppgave_id}`)) return json(429, { error: 'Det er lastet opp for mange filer på denne kontrollen. Kontakt oppdragsgiveren.' });
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
    const MM = await koMaalere(o).catch(() => [] as any[]);
    if (body.avl && typeof body.avl === 'object') { const avl: Record<string, number> = {};
      for (const m of MM) { const v = body.avl[m.id]; const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.')); if (isFinite(n)) avl[m.id] = n; }
      if (Object.keys(avl).length) rapport.avl = avl; }
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
      if (av?.epost) { const L2 = await sprakForBruker(inv.opprettet_av, o.eiendom_id); const { t } = L2; const hvemR = `${rapport.av || inv.epost}${rapport.firma ? ' (' + rapport.firma + ')' : ''}`; const linje = t('{0} har registrert {1} på {2} som utført {3}: {4}.', hvemR, t(fersk.navn), sn.eiendom, L2.dato(dato), t(res)) + ' ' + t('Gå til kontrollen i Eiendomskontroll for å godkjenne.');
        await sendEpost(av.epost, `${t('Rapport mottatt')}: ${t(fersk.navn)} – ${sn.eiendom}`, `<p>${esc(linje)}</p>`, linje, undefined, undefined, await oppsettFor(o.eiendom_id, sn.org)); } }
    return json(200, { ok: true });
  }

  // ---------- Prosjektrapporter til eier: beslutningsnotat (godkjenning før neste fase) og statusrapport
  const FASENAVN: Record<string, string> = { ide: 'Behov og idé', plan: 'Planlegging og prosjektering', anbud: 'Anbud og kontrahering', utf: 'Utførelse', over: 'Overlevering og ferdigstillelse', garanti: 'Garantiperiode' };
  const FASEREKKE = ['ide', 'plan', 'anbud', 'utf', 'over', 'garanti'];
  const sha = async (t: string) => { const { createHash } = await import('node:crypto'); return createHash('sha256').update(t).digest('hex'); };
  const krN = (v: any) => new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 }).format(Math.round(+v || 0)) + ' kr';
  const hentPr = async (tok: string) => {
    if (!/^[0-9a-f]{48}$/i.test(String(tok || ''))) return null; const h = await sha(tok);
    const { data } = await admin.from('prosjekter').select('*').contains('data', { rapporter: [{ tokenHash: h }] }).limit(1);
    const p = data?.[0]; if (!p) return null; const r = (p.data?.rapporter || []).find((x: any) => x.tokenHash === h); return r ? { p, r } : null;
  };
  if (body.action === 'pr_send') {
    const u = await hvem(); if (!u) return json(401, { error: 'Ikke innlogget' });
    const { data: p } = await admin.from('prosjekter').select('*').eq('id', body.prosjekt_id).maybeSingle(); if (!p) return json(404, { error: 'Fant ikke prosjektet' });
    if (!(await kanRedigere(u, p.eiendom_id))) return json(403, { error: 'Du har ikke skrivetilgang til eiendommen' });
    { const { data: harM, error: mErr } = await admin.rpc('eiendom_har_modul', { p_eid: p.eiendom_id, p_modul: 'prosjekter' }); if (!mErr && harM === false) return json(403, { error: 'Prosjektmodulen er ikke aktivert for eieren av eiendommen' }); }
    const d = p.data || {}; const r = (d.rapporter || []).find((x: any) => x.id === body.rapport_id); if (!r) return json(404, { error: 'Fant ikke rapporten' });
    const til = String(body.epost || '').trim().toLowerCase(); if (!/^\S+@\S+\.\S+$/.test(til)) return json(400, { error: 'Ugyldig e-postadresse' });
    const navn = String(body.navn || '').slice(0, 120); const melding = String(body.melding || '').slice(0, 4000);
    const base = typeof body.lenkeBase === 'string' && /^https?:\/\//.test(body.lenkeBase) ? body.lenkeBase.replace(/\/+$/, '') : (process.env.URL || '');
    const { randomBytes } = await import('node:crypto'); const tok = randomBytes(24).toString('hex'); const lenke = `${base}/#/pr/${tok}`;
    const s = r.snap || {}; const fase = r.type === 'fase'; const L = await sprakFor(p.eiendom_id, body.mottakerSprak); const { t: tr } = L;
    const fNavn = tr(s.fase?.navn || '');
    const emne = fase ? `${tr('Til godkjenning')}: ${s.prosjekt?.navn} – ${fNavn}` : `${tr('Statusrapport')}: ${s.prosjekt?.navn}${s.periode?.til ? ' ' + tr('per {0}', L.dato(s.periode.til)) : ''}`;
    const rader: [string, string][] = [['Eiendom', s.prosjekt?.eiendom || ''], ['Prosjekt', s.prosjekt?.navn || ''], ['Fase', fNavn], ['Budsjett', L.kr(s.okonomi?.tot?.budsjett)], ['Prognose', L.kr(s.okonomi?.tot?.prognose)], ['Fremdrift', (s.fremdrift ?? 0) + ' %']];
    if (fase && s.beslutning) rader.push(['Det bes om', s.beslutning]);
    const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:620px;color:#1d2521">
      <h2 style="margin:0 0 6px">${esc(s.tittel ? tr(s.tittel) : emne)}</h2><p style="color:#6b736d;margin:0 0 14px">${esc(s.prosjekt?.navn)} · ${esc(s.prosjekt?.eiendom)}</p>
      ${navn ? `<p>${esc(tr('Hei {0},', navn))}</p>` : ''}${melding ? `<p>${esc(melding).replace(/\n/g, '<br>')}</p>` : ''}
      <table style="border-collapse:collapse;font-size:14px">${rader.filter(x => x[1]).map(x => `<tr><td style="padding:3px 14px 3px 0;color:#6b736d;vertical-align:top">${esc(tr(x[0]))}</td><td style="padding:3px 0">${esc(x[1])}</td></tr>`).join('')}</table>
      <p style="margin:20px 0"><a href="${esc(lenke)}" style="background:#1f6f5c;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">${esc(fase ? tr('Les notatet og gi svar') : tr('Åpne rapporten'))}</a></p>
      <p style="font-size:12px;color:#6b736d">${esc(tr('Lenken er personlig og gjelder i 90 dager. Du trenger ikke bruker i appen.'))}<br>${esc(tr('Sendt av {0}.', u.navn || u.epost))}</p></div>`;
    const tekst = `${s.tittel ? tr(s.tittel) : emne}\n${s.prosjekt?.navn} – ${s.prosjekt?.eiendom}\n\n${melding ? melding + '\n\n' : ''}${rader.map(x => tr(x[0]) + ': ' + x[1]).join('\n')}\n\n${tr('Åpne')}: ${lenke}`;
    const res = await sendEpost(til, emne, html, tekst, undefined, u.epost || undefined, await oppsettFor(p.eiendom_id, await minOrg(u)));
    const t = new Date().toISOString(); const ny = { ...r, tokenHash: await sha(tok), utloper: new Date(Date.now() + 90 * 864e5).toISOString(), sendtTil: { navn, epost: til }, sendt: t, sendtAv: u.navn || u.epost, sendtAvEpost: u.epost,
      status: fase ? 'Sendt' : 'Til orientering', svar: null };
    const logg = [...(d.logg || []), { t, k: `${fase ? 'Beslutningsnotat' : 'Statusrapport'} ${res.sendt ? 'sendt' : 'klargjort'} til ${navn || til}${navn ? ' (' + til + ')' : ''}`, av: u.navn || u.epost }];
    await admin.from('prosjekter').update({ data: { ...d, rapporter: (d.rapporter || []).map((x: any) => x.id === r.id ? ny : x), eierKontakt: { navn, epost: til }, logg } }).eq('id', p.id);
    return json(200, { ...res, til, lenke, emne, tekst });
  }
  if (body.action === 'pr_info') {
    const f = await hentPr(body.token); if (!f) return json(404, { error: 'Lenken er ugyldig, eller rapporten er trukket tilbake' });
    if (f.r.utloper && new Date(f.r.utloper).getTime() < Date.now()) return json(410, { error: 'Lenken er utløpt. Be prosjektlederen sende rapporten på nytt.' });
    // Merk som lest første gang
    if (!f.r.lest) { const d = f.p.data; await admin.from('prosjekter').update({ data: { ...d, rapporter: d.rapporter.map((x: any) => x.id === f.r.id ? { ...x, lest: new Date().toISOString() } : x) } }).eq('id', f.p.id); }
    return json(200, { type: f.r.type, fase: f.r.fase, status: f.r.status, svar: f.r.svar || null, snap: f.r.snap, sendtTil: f.r.sendtTil, sendt: f.r.sendt, sendtAv: f.r.sendtAv, gjeldende: f.p.data?.fase === f.r.fase });
  }
  if (body.action === 'pr_svar') {
    const f = await hentPr(body.token); if (!f) return json(404, { error: 'Lenken er ugyldig' });
    if (f.r.utloper && new Date(f.r.utloper).getTime() < Date.now()) return json(410, { error: 'Lenken er utløpt' });
    const B = ['Godkjent', 'Godkjent med merknader', 'Avvist', 'Kommentar'];
    const beslutning = String(body.beslutning || ''); if (!B.includes(beslutning)) return json(400, { error: 'Ugyldig svar' });
    if (f.r.type !== 'fase' && beslutning !== 'Kommentar') return json(400, { error: 'Statusrapporter kan bare kommenteres' });
    if (f.r.type === 'fase' && beslutning !== 'Kommentar' && ['Godkjent', 'Godkjent med merknader', 'Avvist'].includes(f.r.status)) return json(409, { error: `Notatet er allerede besvart (${f.r.status.toLowerCase()})` });
    const navn = String(body.navn || '').trim().slice(0, 120); if (!navn) return json(400, { error: 'Skriv navnet ditt' });
    const komm = String(body.komm || '').slice(0, 4000); if (['Avvist', 'Godkjent med merknader', 'Kommentar'].includes(beslutning) && !komm.trim()) return json(400, { error: 'Skriv en kommentar' });
    const t = new Date().toISOString(); const d = f.p.data || {}; const svar = { navn, komm, t, via: 'lenke', beslutning, epost: f.r.sendtTil?.epost || '' };
    const kommentarer = beslutning === 'Kommentar' ? [...(f.r.kommentarer || []), svar] : f.r.kommentarer;
    const status = beslutning === 'Kommentar' ? f.r.status : beslutning;
    const logg = [...(d.logg || []), { t, k: `${f.r.type === 'fase' ? `Beslutningsnotat «${FASENAVN[f.r.fase] || ''}»` : 'Statusrapport'}: ${beslutning.toLowerCase()} av ${navn}${komm ? ` – «${komm.slice(0, 200)}»` : ''}`, av: navn }];
    let fase = d.fase; let status2 = d.status;
    if (f.r.type === 'fase' && ['Godkjent', 'Godkjent med merknader'].includes(beslutning) && d.fase === f.r.fase) {
      const i = FASEREKKE.indexOf(f.r.fase); if (i >= 0 && i < FASEREKKE.length - 1) { fase = FASEREKKE[i + 1]; if (status2 === 'Idé' || (status2 === 'Planlagt' && i + 1 >= 3)) status2 = i + 1 >= 3 ? 'Pågår' : 'Planlagt';
        logg.push({ t, k: `Fase: ${FASENAVN[fase]} (etter godkjenning)`, av: navn }); }
    }
    await admin.from('prosjekter').update({ data: { ...d, fase, status: status2, logg, rapporter: d.rapporter.map((x: any) => x.id === f.r.id ? { ...x, status, svar: beslutning === 'Kommentar' ? x.svar : svar, kommentarer } : x) } }).eq('id', f.p.id);
    await admin.from('hendelseslogg').insert({ bruker_id: null, bruker: navn, tabell: 'hendelse', rad_id: f.p.id, eiendom_id: f.p.eiendom_id, handling: 'prosjekt', tekst: logg[logg.length - (fase !== d.fase ? 2 : 1)].k });
    if (f.r.sendtAvEpost) { const { t: tr } = await sprakForBruker(null, f.p.eiendom_id, f.r.sendtAvEpost); const fn = (k: string) => tr(FASENAVN[k] || '');
      const linje = f.r.type === 'fase' ? tr('{0} har svart på beslutningsnotatet for {1}: {2}.', navn, d.navn, tr(beslutning)) : tr('{0} har svart på statusrapporten for {1}: {2}.', navn, d.navn, tr(beslutning));
      await sendEpost(f.r.sendtAvEpost, `${tr(beslutning)}: ${d.navn}${f.r.type === 'fase' ? ' – ' + fn(f.r.fase) : ''}`,
      `<p>${esc(linje)}</p>${komm ? `<p>${esc(komm).replace(/\n/g, '<br>')}</p>` : ''}${fase !== d.fase ? `<p>${esc(tr('Prosjektet er flyttet til fasen «{0}».', fn(fase)))}</p>` : ''}`,
      `${linje}\n${komm}`, undefined, undefined, await oppsettFor(f.p.eiendom_id, null)).catch(() => null); }
    return json(200, { ok: true, status, nyFase: fase !== d.fase ? FASENAVN[fase] : null });
  }

  // ================= Befaring: signering av rapport =================
  // Enkel elektronisk signatur: personlig lenke på e-post + engangskode til samme adresse. Signaturene skrives
  // bare her (tabellen bef_signatur er skrivebeskyttet for innloggede), med tid, IP, nettleser og SHA-256 av PDF-en.
  const BTYPE: Record<string, string> = { forbefaring: 'Forbefaring', overtakelse: 'Overtakelse / innflytting', tilpasning: 'Leietakertilpasning', vplikt: 'Leietakers vedlikeholdsplikt', tilbakelevering: 'Tilbakelevering', energi: 'Fang energityven', tilfeldig: 'Befaring', system: 'Systemregistrering', hms: 'HMS-befaring', garanti: 'Garantibefaring', annen: 'Befaring' };
  const ip = () => (req.headers.get('x-nf-client-connection-ip') || req.headers.get('x-forwarded-for') || '').split(',')[0].trim().slice(0, 60);
  const ua = () => String(req.headers.get('user-agent') || '').slice(0, 300);
  const hentBef = async (id: string) => { const { data } = await admin.from('befaringer').select('*').eq('id', id).maybeSingle(); return data as any; };
  const befTok = async (tok: string) => {
    if (!/^[0-9a-f]{48}$/i.test(String(tok || ''))) return null; const h = await sha(tok);
    const { data } = await admin.from('befaringer').select('*').contains('data', { signering: { parter: [{ tokenHash: h }] } }).limit(1);
    const b = data?.[0]; if (!b) return null; const part = (b.data?.signering?.parter || []).find((x: any) => x.tokenHash === h); return part ? { b, part } : null;
  };
  const renPart = (x: any) => ({ id: String(x?.id || '').slice(0, 60), navn: String(x?.navn || '').slice(0, 120), epost: String(x?.epost || '').trim().toLowerCase().slice(0, 200), rolle: String(x?.rolle || '').slice(0, 60), firma: String(x?.firma || '').slice(0, 120) });
  const renSig = (v: any) => typeof v === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(v) && v.length < 400_000 ? v : null;
  const lastRapport = async (b: any) => { const r = b.data?.rapport; if (!r?.fil?.path) return null; const { data } = await admin.storage.from('filer').download(r.fil.path); if (!data) return null; const buf = new Uint8Array(await data.arrayBuffer()); const { createHash } = await import('node:crypto'); return { buf, hash: createHash('sha256').update(buf).digest('hex'), r }; };
  const eiendomInfo = async (eid: string) => { const { data } = await admin.from('eiendommer').select('data').eq('id', eid).maybeSingle(); return { navn: data?.data?.navn || '', adresse: [data?.data?.adresse, data?.data?.poststed].filter(Boolean).join(', ') }; };
  const befLogg = async (b: any, hvem: string, tekst: string, uid?: string | null) => admin.from('hendelseslogg').insert({ bruker_id: uid || null, bruker: hvem, tabell: 'hendelse', rad_id: b.id, eiendom_id: b.eiendom_id, handling: 'befaring', tekst });
  const oppdaterSignering = async (bid: string, f: (d: any) => any) => { const b = await hentBef(bid); const d = b.data || {}; const nd = f(d); await admin.from('befaringer').update({ data: nd }).eq('id', bid); return { ...b, data: nd }; };
  const registrer = async (b: any, part: any, navn: string, metode: string, signatur: string | null, forbehold: string, dokHash: string) => {
    await admin.from('bef_signatur').insert({ befaring_id: b.id, eiendom_id: b.eiendom_id, part_id: part.id, navn, epost: part.epost || null, rolle: part.rolle || null, dok_hash: dokHash, metode, ip: ip() || null, nettleser: ua() || null, signatur_bilde: signatur });
    const t = new Date().toISOString();
    const nb = await oppdaterSignering(b.id, d => ({ ...d, signering: { ...d.signering, parter: (d.signering?.parter || []).map((x: any) => x.id === part.id ? { ...x, signert: { t, navn, metode, forbehold }, kodeHash: undefined } : x) },
      logg: [...(d.logg || []), { t, k: `Signert av ${navn} (${part.rolle || 'part'})${metode === 'epost_kode' ? ' med e-postkode' : ' ' + metode}${forbehold ? ` – forbehold: «${forbehold.slice(0, 200)}»` : ''}`, av: navn }] }));
    await befLogg(b, navn, `Befaringsrapport signert av ${navn} (${part.rolle || 'part'}) – ${metode}`);
    const alle = (nb.data.signering?.parter || []).every((x: any) => x.signert);
    if (alle) await ferdigstillSignering(nb);
    return alle;
  };
  const ferdigstillSignering = async (b: any) => {
    const R = await lastRapport(b); if (!R || R.hash !== b.data.signering.dokHash) return;
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
    const pdf = await PDFDocument.load(R.buf); const f = await pdf.embedFont(StandardFonts.Helvetica); const fb = await pdf.embedFont(StandardFonts.HelveticaBold);
    const safe = (x: any) => String(x ?? '').replace(/[^\x20-\x7E -ÿ–—‘’“”•…€]/g, '');
    const { data: S } = await admin.from('bef_signatur').select('*').eq('befaring_id', b.id).eq('dok_hash', R.hash).order('signert_at');
    const L = await sprakFor(b.eiendom_id); const tr = L.t; const tittel = b.data.tittel || tr('Befaringsrapport');
    let pg = pdf.addPage([595.28, 841.89]); let y = 790; const M = 44; const INK = rgb(.11, .14, .13), MUT = rgb(.42, .45, .43);
    const t = (s: string, x: number, yy: number, z = 9, bold = false, c = INK) => pg.drawText(safe(s), { x, y: yy, size: z, font: bold ? fb : f, color: c });
    t(tr('SIGNERINGSSIDE'), M, y, 8.5, true, rgb(.12, .44, .36)); y -= 22; t(tittel, M, y, 16, true); y -= 18;
    t(tr('Dokumentets fingeravtrykk (SHA-256): {0}', R.hash), M, y, 7.5, false, MUT); y -= 12; t(tr('Rapportversjon {0}, laget {1}', R.r.versjon || 1, R.r.laget ? L.tid(R.r.laget) : ''), M, y, 7.5, false, MUT); y -= 24;
    const sist = new Map<string, any>(); (S || []).forEach((x: any) => sist.set(x.part_id, x));
    for (const p of b.data.signering.parter || []) { const x = sist.get(p.id); if (!x) continue;
      if (y < 160) { pg = pdf.addPage([595.28, 841.89]); y = 790; }
      pg.drawRectangle({ x: M, y: y - 104, width: 595.28 - 2 * M, height: 104, borderColor: rgb(.85, .86, .84), borderWidth: .6 });
      t(`${x.navn} – ${x.rolle || ''}${p.firma ? ', ' + p.firma : ''}`, M + 10, y - 16, 10.5, true);
      const forb = p.signert?.forbehold ? tr('Forbehold') + ': ' + p.signert.forbehold : tr('Uten forbehold');
      [tr('Signert {0}', L.tid(x.signert_at)), x.metode === 'epost_kode' ? tr('Metode: personlig lenke og engangskode til {0}', x.epost || '') : tr('Metode: {0}', x.metode), x.ip ? tr('IP-adresse: {0}', x.ip) : '', forb.slice(0, 110)].filter(Boolean).forEach((l, i) => t(l, M + 10, y - 32 - i * 12, 8.2, false, MUT));
      if (x.signatur_bilde) { try { const im = await pdf.embedPng(Buffer.from(x.signatur_bilde.split(',')[1], 'base64')); const h = 60, w = Math.min(190, h * im.width / im.height); pg.drawImage(im, { x: 595.28 - M - w - 10, y: y - 90, width: w, height: h }); } catch { } }
      y -= 116; }
    t(tr('Signeringen er gjort i Eiendomskontroll. Signaturene er knyttet til fingeravtrykket over – endres dokumentet, stemmer det ikke lenger.'), M, 50, 7.5, false, MUT);
    const ut = await pdf.save(); const navn = `${tr('Befaringsrapport signert')} ${(b.data.dato || '').slice(0, 10)}.pdf`;
    const path = `${b.eiendom_id}/befaring/${b.id}/${Date.now()}-${asciiNavn(navn)}`;
    const { error: ue } = await admin.storage.from('filer').upload(path, ut, { contentType: 'application/pdf', upsert: false }); if (ue) { console.error('signert pdf', ue); return; }
    const fil = { path, navn, type: 'application/pdf', str: ut.length }; const tid = new Date().toISOString();
    const { createHash } = await import('node:crypto'); const sluttHash = createHash('sha256').update(ut).digest('hex');
    await admin.from('dokumenter').insert({ eiendom_id: b.eiendom_id, leietaker_id: b.data.leietakerId || null, data: { tittel: `${b.data.tittel || 'Befaringsrapport'} (signert)`, type: 'Befaringsrapport', dato: tid.slice(0, 10), fil, befaringId: b.id } });
    await oppdaterSignering(b.id, d => ({ ...d, status: 'Signert', signering: { ...d.signering, ferdig: { t: tid, fil, hash: sluttHash } }, logg: [...(d.logg || []), { t: tid, k: 'Alle parter har signert – signert rapport lagret under Dokumenter', av: 'System' }] }));
    await befLogg(b, 'System', 'Befaringsrapporten er signert av alle parter');
    const o = await oppsettFor(b.eiendom_id, null); const e = await eiendomInfo(b.eiendom_id); const b64 = ut.length < 9_000_000 ? Buffer.from(ut).toString('base64') : null;
    for (const p of b.data.signering.parter || []) { if (!p.epost) continue;
      await sendEpost(p.epost, `${tr('Signert')}: ${tittel}`, `<div style="font-family:system-ui,Arial,sans-serif;max-width:620px"><p>${esc(tr('Alle parter har signert befaringsrapporten for {0}.', e.navn))}</p><p>${esc(b64 ? tr('Den signerte rapporten med signeringsside ligger vedlagt.') : tr('Den signerte rapporten med signeringsside kan hentes via lenken du fikk tidligere.'))}</p></div>`, tr('Alle parter har signert befaringsrapporten for {0}.', e.navn), b64 ? { navn, base64: b64, type: 'application/pdf' } : undefined, undefined, o).catch(() => null); }
  };

  if (body.action === 'bef_sign_send') {
    const u = await hvem(); if (!u) return json(401, { error: 'Ikke innlogget' });
    const b = await hentBef(String(body.befaring_id || '')); if (!b) return json(404, { error: 'Fant ikke befaringen – vent til den er lagret på serveren' });
    if (!(await harEiendom(u, b.eiendom_id))) return json(403, { error: 'Ingen tilgang til eiendommen' });
    { const { data: harM, error: mErr } = await admin.rpc('eiendom_har_modul', { p_eid: b.eiendom_id, p_modul: 'befaring' }); if (!mErr && harM === false) return json(403, { error: 'Befaringsmodulen er ikke aktivert for eieren av eiendommen' }); }
    const R = await lastRapport(b); if (!R) return json(400, { error: 'Lag rapporten først' });
    if (R.hash !== R.r.hash) return json(409, { error: 'Rapportfilen stemmer ikke med fingeravtrykket – lag rapporten på nytt' });
    const P = (Array.isArray(body.parter) ? body.parter : []).map(renPart).filter((x: any) => x.id).slice(0, 20); const send: string[] = (Array.isArray(body.send) ? body.send : []).map(String);
    if (!P.length) return json(400, { error: 'Ingen parter' });
    const gml = b.data?.signering?.dokHash === R.hash ? b.data.signering : null; // samme dokument: behold signaturer og lenker
    const base = typeof body.lenkeBase === 'string' && /^https?:\/\//.test(body.lenkeBase) ? body.lenkeBase.replace(/\/+$/, '') : (process.env.URL || '');
    const { randomBytes } = await import('node:crypto'); const t = new Date().toISOString(); const melding = String(body.melding || '').slice(0, 3000);
    const e = await eiendomInfo(b.eiendom_id); const o = await oppsettFor(b.eiendom_id, await minOrg(u)); let sendt = 0; let grunn = ''; const lenker: any[] = [];
    const parter: any[] = [];
    for (const p of P) { const g = gml?.parter?.find((x: any) => x.id === p.id); let ny = { ...(g || {}), ...p, signert: g?.signert || null };
      if (send.includes(p.id) && !ny.signert && /^\S+@\S+\.\S+$/.test(p.epost)) {
        const tok = randomBytes(24).toString('hex'); const lenke = `${base}/#/sg/${tok}`; ny = { ...ny, tokenHash: await sha(tok), utloper: new Date(Date.now() + 30 * 864e5).toISOString(), sendt: t, lest: null, kodeHash: undefined, koder: [] };
        const L = await sprakFor(b.eiendom_id, body.mottakerSprak); const tr = L.t; const tittel = b.data?.tittel || tr('Befaringsrapport');
        const emne = `${tr('Til signering')}: ${tittel} – ${e.navn}`;
        const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:620px;color:#1d2521"><h2 style="margin:0 0 6px">${esc(tittel)}</h2><p style="color:#6b736d;margin:0 0 14px">${esc(tr(BTYPE[b.data?.type] || 'Befaring'))} · ${esc(e.navn)} · ${esc(L.dato(b.data?.dato))}</p>
          ${p.navn ? `<p>${esc(tr('Hei {0},', p.navn))}</p>` : ''}<p>${esc(tr('Du er bedt om å signere befaringsrapporten som {0}.', tr(p.rolle || 'part')))}</p>${melding ? `<p>${esc(melding).replace(/\n/g, '<br>')}</p>` : ''}
          <p style="margin:20px 0"><a href="${esc(lenke)}" style="background:#1f6f5c;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">${esc(tr('Les og signer rapporten'))}</a></p>
          <p style="font-size:12px;color:#6b736d">${esc(tr('Lenken er personlig og gjelder i 30 dager. Du bekrefter signaturen med en engangskode som sendes til denne e-postadressen. Du trenger ikke bruker i appen.'))}<br>${esc(tr('Sendt av {0}.', u.navn || u.epost))}</p></div>`;
        const res = await sendEpost(p.epost, emne, html, `${emne}\n\n${melding ? melding + '\n\n' : ''}${tr('Les og signer')}: ${lenke}\n\n${tr('Lenken gjelder i 30 dager.')}`, undefined, u.epost || undefined, o);
        if (res.sendt) sendt++; else { grunn = res.grunn || grunn; lenker.push({ navn: p.navn || p.epost, lenke }); } }
      parter.push(ny); }
    await oppdaterSignering(b.id, d => ({ ...d, status: d.status === 'Signert' && gml ? d.status : 'Til signering', signering: { dokHash: R.hash, rapportPath: R.r.fil.path, versjon: R.r.versjon || 1, sendt: t, sendtAv: u.navn || u.epost, parter, ferdig: gml?.ferdig || null },
      logg: [...(d.logg || []), { t, k: `Rapport v${R.r.versjon || 1} sendt til signering (${send.length} ${send.length === 1 ? 'part' : 'parter'})`, av: u.navn || u.epost }] }));
    await befLogg(b, u.navn || u.epost, `Befaringsrapport sendt til signering`, u.id);
    return json(200, { ok: true, sendt, grunn, lenker });
  }
  if (body.action === 'bef_sign_info') {
    const f = await befTok(body.token); if (!f) return json(404, { error: 'Lenken er ugyldig, eller signeringen er trukket tilbake' });
    if (f.part.utloper && new Date(f.part.utloper).getTime() < Date.now()) return json(410, { error: 'Lenken er utløpt. Be avsenderen sende rapporten på nytt.' });
    const d = f.b.data || {}; const sg = d.signering;
    if (!f.part.lest) await oppdaterSignering(f.b.id, x => ({ ...x, signering: { ...x.signering, parter: x.signering.parter.map((p: any) => p.id === f.part.id ? { ...p, lest: new Date().toISOString() } : p) } }));
    const { data: u1 } = await admin.storage.from('filer').createSignedUrl(sg.rapportPath, 3600);
    const { data: u2 } = sg.ferdig?.fil?.path ? await admin.storage.from('filer').createSignedUrl(sg.ferdig.fil.path, 3600) : { data: null as any };
    const e = await eiendomInfo(f.b.eiendom_id);
    return json(200, { tittel: d.tittel || 'Befaringsrapport', type: BTYPE[d.type] || 'Befaring', dato: d.dato, eiendom: e.navn, adresse: e.adresse, dokHash: sg.dokHash, pdfUrl: u1?.signedUrl || '', ferdigUrl: u2?.signedUrl || '',
      part: { navn: f.part.navn, rolle: f.part.rolle, signert: f.part.signert?.t || null }, parter: (sg.parter || []).map((p: any) => ({ navn: p.navn, rolle: p.rolle, firma: p.firma, signert: p.signert?.t || null })) });
  }
  if (body.action === 'bef_sign_kode') {
    const f = await befTok(body.token); if (!f) return json(404, { error: 'Lenken er ugyldig' });
    if (f.part.utloper && new Date(f.part.utloper).getTime() < Date.now()) return json(410, { error: 'Lenken er utløpt' });
    if (f.part.signert) return json(409, { error: 'Du har allerede signert' });
    const naa = Date.now(); const koder = (f.part.koder || []).filter((t: number) => naa - t < 3600e3); if (koder.length >= 5) return json(429, { error: 'For mange koder på kort tid. Prøv igjen om en time.' });
    const { randomInt } = await import('node:crypto'); const kode = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await oppdaterSignering(f.b.id, x => ({ ...x, signering: { ...x.signering, parter: x.signering.parter.map((p: any) => p.id === f.part.id ? { ...p, kodeHash: null, koder: [...koder, naa] } : p) } }));
    const kh = await sha(String(body.token) + ':' + kode);
    await oppdaterSignering(f.b.id, x => ({ ...x, signering: { ...x.signering, parter: x.signering.parter.map((p: any) => p.id === f.part.id ? { ...p, kodeHash: kh, kodeUtloper: naa + 10 * 60e3, forsok: 0 } : p) } }));
    const { t: tr } = await sprakFor(f.b.eiendom_id, body.sprak); const res = await sendEpost(f.part.epost, `${tr('Engangskode for signering')}: ${kode}`, `<div style="font-family:system-ui,Arial,sans-serif"><p>${esc(tr('Koden for å signere befaringsrapporten er:'))}</p><p style="font-size:28px;font-weight:700;letter-spacing:4px;font-family:monospace">${kode}</p><p style="font-size:12px;color:#6b736d">${esc(tr('Koden gjelder i 10 minutter. Har du ikke bedt om den, kan du se bort fra e-posten.'))}</p></div>`, tr('Koden for å signere befaringsrapporten er {0}. Den gjelder i 10 minutter.', kode), undefined, undefined, await oppsettFor(f.b.eiendom_id, null));
    if (!res.sendt) return json(503, { error: 'Kunne ikke sende koden på e-post' + (res.holdt ? ' (e-post er i testmodus hos avsenderen)' : '') + '. Kontakt den som sendte rapporten.' });
    const [a, dom] = String(f.part.epost).split('@'); return json(200, { ok: true, til: `${a.slice(0, 2)}…@${dom}` });
  }
  if (body.action === 'bef_sign_signer') {
    const f = await befTok(body.token); if (!f) return json(404, { error: 'Lenken er ugyldig' });
    if (f.part.utloper && new Date(f.part.utloper).getTime() < Date.now()) return json(410, { error: 'Lenken er utløpt' });
    if (f.part.signert) return json(409, { error: 'Du har allerede signert' });
    if (!f.part.kodeHash || !f.part.kodeUtloper || f.part.kodeUtloper < Date.now()) return json(400, { error: 'Koden er utløpt – be om en ny' });
    if ((f.part.forsok || 0) >= 5) return json(429, { error: 'For mange feil forsøk – be om en ny kode' });
    const riktig = (await sha(String(body.token) + ':' + String(body.kode || '').trim())) === f.part.kodeHash;
    if (!riktig) { await oppdaterSignering(f.b.id, x => ({ ...x, signering: { ...x.signering, parter: x.signering.parter.map((p: any) => p.id === f.part.id ? { ...p, forsok: (p.forsok || 0) + 1 } : p) } })); return json(400, { error: 'Feil kode' }); }
    const navn = String(body.navn || '').trim().slice(0, 120); if (navn.length < 2) return json(400, { error: 'Skriv navnet ditt' });
    const R = await lastRapport(f.b); if (!R || R.hash !== f.b.data.signering.dokHash) return json(409, { error: 'Rapporten er endret etter at den ble sendt. Be avsenderen sende den nye versjonen.' });
    const alle = await registrer(f.b, f.part, navn, 'epost_kode', renSig(body.signatur), String(body.forbehold || '').slice(0, 1000), R.hash);
    return json(200, { ok: true, alle });
  }
  if (body.action === 'bef_sign_sted') {
    const u = await hvem(); if (!u) return json(401, { error: 'Ikke innlogget' });
    const b = await hentBef(String(body.befaring_id || '')); if (!b) return json(404, { error: 'Fant ikke befaringen' });
    if (!(await harEiendom(u, b.eiendom_id))) return json(403, { error: 'Ingen tilgang til eiendommen' });
    const R = await lastRapport(b); if (!R) return json(400, { error: 'Rapporten er ikke lastet opp' });
    if (String(body.dokHash || '') !== R.hash) return json(409, { error: 'Signaturen gjelder en annen versjon av rapporten' });
    const navn = String(body.navn || '').trim().slice(0, 120); const sig = renSig(body.signatur); if (navn.length < 2 || !sig) return json(400, { error: 'Navn og signatur mangler' });
    // Opprett signeringen for denne versjonen hvis den ikke finnes
    let bb = b; if (b.data?.signering?.dokHash !== R.hash) { const P = (Array.isArray(body.parter) ? body.parter : []).map(renPart).filter((x: any) => x.id).slice(0, 20);
      bb = await oppdaterSignering(b.id, d => ({ ...d, status: 'Til signering', signering: { dokHash: R.hash, rapportPath: R.r.fil.path, versjon: R.r.versjon || 1, sendt: new Date().toISOString(), sendtAv: u.navn || u.epost, parter: P.map((p: any) => ({ ...p, signert: null })), ferdig: null } })); }
    let part = bb.data.signering.parter.find((x: any) => x.id === String(body.partId)); if (!part) { part = { ...renPart({ id: body.partId, navn, epost: body.epost, rolle: body.rolle, firma: body.firma }), signert: null };
      bb = await oppdaterSignering(b.id, d => ({ ...d, signering: { ...d.signering, parter: [...d.signering.parter, part] } })); }
    if (part.signert) return json(409, { error: 'Parten har allerede signert' });
    const alle = await registrer(bb, part, navn, `på stedet (bekreftet av ${String(u.navn || u.epost).slice(0, 80)})`, sig, String(body.forbehold || '').slice(0, 1000), R.hash);
    return json(200, { ok: true, alle });
  }

  return json(400, { error: 'Ukjent handling' });
};
