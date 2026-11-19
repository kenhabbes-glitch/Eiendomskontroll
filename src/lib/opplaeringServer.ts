// Interaktiv brannvernopplæring for leietaker – serverdelen (kalles fra netlify/functions/arbeidsordre.ts).
// Lenker uten innlogging (token). Fasit til spørsmålene forlater aldri serveren før et svar er gitt.
// Eier/forvalter får bare antall invitert og antall gjennomført (opl_status) – aldri navn eller e-post til ansatte.
import type { SupabaseClient } from '@supabase/supabase-js';

export type OplSpm = { id: string; q: string; valg: string[]; riktig: number; forklaring: string; tips?: string };
export type OplSteg = { id: string; tittel: string; tekst: string[]; spm?: OplSpm };
export type OplInnhold = { tittel: string; steg: OplSteg[] };

type Ctx = {
  admin: SupabaseClient; body: any; json: (s: number, b: any) => Response; esc: (s: any) => string;
  hvem: () => Promise<any>; kanRedigere: (p: any, eid: string) => Promise<boolean>; harEiendom: (p: any, eid: string) => Promise<boolean>;
  sendEpost: (til: string, emne: string, html: string, tekst: string, v?: any, svarTil?: string, o?: any) => Promise<any>;
  oppsettFor: (eid: string | null | undefined, org?: string | null) => Promise<any>; minOrg: (p: any) => Promise<string | null>;
  sprakFor: (eid?: string | null, overstyr?: string) => Promise<{ t: (s: any, ...a: any[]) => string }>;
};

const MAKS_ANSATTE = 300, MAKS_PER_KALL = 60, PURRE_PAUSE_T = 20;
const EPOST = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
const TOK = /^[0-9a-f]{48}$/;

/** Rensker innholdet fra nettleseren: lengder, antall og at fasit peker på et gyldig valg */
export function renInnhold(x: any): OplInnhold | null {
  if (!x || !Array.isArray(x.steg) || !x.steg.length || x.steg.length > 20) return null;
  const s = (v: any, n: number) => String(v ?? '').slice(0, n); const ids = new Set<string>(); const steg: OplSteg[] = [];
  for (const st of x.steg) {
    const id = s(st.id, 40); if (!id || ids.has(id)) return null; ids.add(id);
    const o: OplSteg = { id, tittel: s(st.tittel, 140), tekst: (Array.isArray(st.tekst) ? st.tekst : []).slice(0, 30).map((t: any) => s(t, 1200)).filter(Boolean) };
    if (st.spm) {
      const v = (Array.isArray(st.spm.valg) ? st.spm.valg : []).slice(0, 6).map((t: any) => s(t, 300));
      const r = Number(st.spm.riktig); if (v.length < 2 || !Number.isInteger(r) || r < 0 || r >= v.length) return null;
      const sid = s(st.spm.id, 40); if (!sid || ids.has(sid)) return null; ids.add(sid);
      o.spm = { id: sid, q: s(st.spm.q, 300), valg: v, riktig: r, forklaring: s(st.spm.forklaring, 800), ...(st.spm.tips ? { tips: s(st.spm.tips, 400) } : {}) };
    }
    steg.push(o);
  }
  return { tittel: s(x.tittel, 160), steg };
}
const spmListe = (k: OplInnhold) => k.steg.map(s => s.spm).filter(Boolean) as OplSpm[];
/** Innhold uten fasit – det nettleseren får se */
const utenFasit = (k: OplInnhold) => ({ tittel: k.tittel, steg: k.steg.map(s => ({ id: s.id, tittel: s.tittel, tekst: s.tekst, spm: s.spm ? { id: s.spm.id, q: s.spm.q, valg: s.spm.valg } : undefined })) });

export async function opplaering(c: Ctx): Promise<Response | null> {
  const { admin, body, json, esc } = c; const a = String(body.action || '');
  if (!a.startsWith('opl_')) return null;
  const { randomBytes } = await import('node:crypto');
  const nyttToken = () => randomBytes(24).toString('hex');
  const baseFra = () => typeof body.lenkeBase === 'string' && /^https?:\/\//.test(body.lenkeBase) ? body.lenkeBase.replace(/\/+$/, '') : (process.env.URL || '');
  const lenkeFor = (tok: string) => `${baseFra()}/#/op/${tok}`;

  const hent = async (tok: any) => {
    if (!TOK.test(String(tok || ''))) return null;
    const { data: d } = await admin.from('opplaering_deltakere').select('*').eq('token', tok).maybeSingle(); if (!d) return null;
    const { data: kurs } = await admin.from('opplaering_kurs').select('*').eq('id', d.kurs_id).maybeSingle(); if (!kurs) return null;
    const [{ data: lt }, { data: e }] = await Promise.all([admin.from('leietakere').select('data').eq('id', d.leietaker_id).maybeSingle(), admin.from('eiendommer').select('data').eq('id', d.eiendom_id).maybeSingle()]);
    return { d, kurs, innhold: kurs.innhold as OplInnhold, leietaker: lt?.data?.navn || '', eiendom: e?.data?.navn || '' };
  };
  const mailHtml = (tittel: string, avsnitt: string[], knapp: string, lenke: string, bunn: string) => `<div style="font-family:system-ui,Arial,sans-serif;max-width:600px;color:#1d2521"><h2 style="margin:0 0 10px">${esc(tittel)}</h2>${avsnitt.map(x => `<p>${esc(x).replace(/\n/g, '<br>')}</p>`).join('')}<p style="margin:20px 0"><a href="${esc(lenke)}" style="background:#1f6f5c;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">${esc(knapp)}</a></p><p style="font-size:12px;color:#6b736d">${esc(bunn)}</p></div>`;

  // ---------- Eier sender opplæringen til leietakerens brannvernleder/hovedkontakt (innlogget)
  if (a === 'opl_start') {
    const u = await c.hvem(); if (!u) return json(401, { error: 'Ikke innlogget' });
    const { data: lt } = await admin.from('leietakere').select('*').eq('id', body.leietaker_id).maybeSingle(); if (!lt) return json(404, { error: 'Fant ikke leietakeren' });
    if (!(await c.kanRedigere(u, lt.eiendom_id))) return json(403, { error: 'Du har ikke redigeringstilgang til eiendommen' });
    const inn = renInnhold(body.innhold); if (!inn) return json(400, { error: 'Opplæringen er ufullstendig. Fyll ut brannkortet og prøv igjen.' });
    const til = String(body.epost || '').trim().toLowerCase(); if (!EPOST.test(til)) return json(400, { error: 'Ugyldig e-postadresse' });
    const navn = String(body.navn || '').trim().slice(0, 80); if (!navn) return json(400, { error: 'Skriv navnet på mottakeren' });
    const versjon = Math.max(0, Math.floor(+body.versjon || 0));
    let { data: kurs } = await admin.from('opplaering_kurs').select('*').eq('leietaker_id', lt.id).eq('versjon', versjon).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (kurs) { await admin.from('opplaering_kurs').update({ innhold: inn }).eq('id', kurs.id); }
    else { const r = await admin.from('opplaering_kurs').insert({ eiendom_id: lt.eiendom_id, leietaker_id: lt.id, versjon, innhold: inn, created_by: u.id }).select().single(); if (r.error) return json(500, { error: 'Kunne ikke lagre opplæringen (er 030_brannopplaering.sql kjørt?): ' + r.error.message }); kurs = r.data; }
    const { data: fins } = await admin.from('opplaering_deltakere').select('*').eq('kurs_id', kurs!.id).eq('rolle', 'leder').eq('epost', til).maybeSingle();
    let tok = fins?.token || nyttToken();
    if (!fins) { const r = await admin.from('opplaering_deltakere').insert({ kurs_id: kurs!.id, eiendom_id: lt.eiendom_id, leietaker_id: lt.id, token: tok, rolle: 'leder', navn, epost: til, sendt_tid: new Date().toISOString() }); if (r.error) return json(500, { error: 'Kunne ikke lage invitasjon: ' + r.error.message }); }
    else await admin.from('opplaering_deltakere').update({ navn, sendt_tid: new Date().toISOString() }).eq('id', fins.id);
    const { data: e } = await admin.from('eiendommer').select('data').eq('id', lt.eiendom_id).maybeSingle(); const en = e?.data?.navn || ''; const ln = lt.data?.navn || '';
    const { t } = await c.sprakFor(lt.eiendom_id, body.mottakerSprak); const lenke = lenkeFor(tok);
    const emne = t('Brannvernopplæring for {0} – {1}', ln, en);
    const mld = String(body.melding || '').trim().slice(0, 1500);
    const html = mailHtml(t('Brannvernopplæring'), [t('Hei {0},', navn), t('{0} ber deg gjennomgå en kort opplæring i brannsikkerheten i {1}. Det tar omtrent 10 minutter og har noen enkle spørsmål underveis.', u.navn || u.epost, en), ...(mld ? [mld] : []), t('Når du er ferdig, kan du invitere de ansatte i {0} til samme opplæring og følge med på hvem som har gjennomført den.', ln)], t('Start opplæringen'), lenke, t('Lenken er personlig. Du trenger ikke bruker i appen.'));
    const tekst = `${t('Hei {0},', navn)}\n\n${t('{0} ber deg gjennomgå en kort opplæring i brannsikkerheten i {1}. Det tar omtrent 10 minutter og har noen enkle spørsmål underveis.', u.navn || u.epost, en)}\n\n${mld ? mld + '\n\n' : ''}${t('Start opplæringen')}: ${lenke}`;
    const res = await c.sendEpost(til, emne, html, tekst, undefined, u.epost || undefined, await c.oppsettFor(lt.eiendom_id, await c.minOrg(u)));
    await admin.from('hendelseslogg').insert({ bruker_id: u.id, bruker: u.navn || u.epost, tabell: 'hendelse', rad_id: lt.id, eiendom_id: lt.eiendom_id, handling: 'brannopplaering', tekst: `Brannvernopplæring v${versjon} ${res.sendt ? 'sendt' : 'klargjort'} til ${navn} (${til}) for ${ln}` });
    return json(200, { ...res, til, lenke });
  }

  // ---------- Prosent per leietaker (innlogget, tilgang til eiendommen). Ingen navn, ingen e-post.
  if (a === 'opl_status') {
    const u = await c.hvem(); if (!u) return json(401, { error: 'Ikke innlogget' });
    const eid = String(body.eiendom_id || ''); if (!(await c.harEiendom(u, eid))) return json(403, { error: 'Ingen tilgang til eiendommen' });
    const { data: kurs } = await admin.from('opplaering_kurs').select('id, leietaker_id, versjon, created_at').eq('eiendom_id', eid).order('created_at', { ascending: false });
    const siste: Record<string, any> = {}; (kurs || []).forEach((k: any) => { if (!siste[k.leietaker_id]) siste[k.leietaker_id] = k; });
    const { data: D } = await admin.from('opplaering_deltakere').select('kurs_id, leietaker_id, fullfort_tid').eq('eiendom_id', eid);
    const ut = Object.values(siste).map((k: any) => { const m = (D || []).filter((x: any) => x.kurs_id === k.id); return { leietaker_id: k.leietaker_id, versjon: k.versjon, invitert: m.length, fullfort: m.filter((x: any) => x.fullfort_tid).length }; });
    return json(200, { status: ut });
  }

  // ---------- Fra og med her: lenke med token, ingen innlogging
  const f = await hent(body.token); if (!f) return json(404, { error: 'Lenken er ugyldig' });
  const { d, innhold } = f; const spm = spmListe(innhold);
  if (a === 'opl_info') {
    if (!d.startet_tid) await admin.from('opplaering_deltakere').update({ startet_tid: new Date().toISOString() }).eq('id', d.id);
    return json(200, { rolle: d.rolle, navn: d.navn, leietaker: f.leietaker, eiendom: f.eiendom, innhold: utenFasit(innhold), riktige: d.riktige || [], fullfort: d.fullfort_tid || null });
  }
  if (a === 'opl_sjekk') {
    const s = spm.find(x => x.id === String(body.spm || '')); if (!s) return json(400, { error: 'Ukjent spørsmål' });
    const valg = Number(body.valg); if (!Number.isInteger(valg) || valg < 0 || valg >= s.valg.length) return json(400, { error: 'Ugyldig valg' });
    if (valg === s.riktig) {
      const r = Array.from(new Set([...(d.riktige || []), s.id])); await admin.from('opplaering_deltakere').update({ riktige: r }).eq('id', d.id);
      return json(200, { riktig: true, forklaring: s.forklaring, riktige: r });
    }
    await admin.from('opplaering_deltakere').update({ forsok: (d.forsok || 0) + 1 }).eq('id', d.id);
    return json(200, { riktig: false, tips: s.tips || '' });
  }
  if (a === 'opl_ferdig') {
    const r: string[] = d.riktige || []; if (spm.some(s => !r.includes(s.id))) return json(409, { error: 'Alle spørsmålene må besvares riktig først' });
    const tid = d.fullfort_tid || new Date().toISOString(); if (!d.fullfort_tid) await admin.from('opplaering_deltakere').update({ fullfort_tid: tid }).eq('id', d.id);
    return json(200, { ok: true, fullfort: tid });
  }

  // ---------- Brannvernleder/hovedkontakt: oversikt, invitere og purre (etter at egen opplæring er gjennomført)
  if (!['opl_oversikt', 'opl_inviter', 'opl_purr'].includes(a)) return json(400, { error: 'Ukjent handling' });
  if (d.rolle !== 'leder') return json(403, { error: 'Bare brannvernleder eller hovedkontakt kan invitere ansatte' });
  if (!d.fullfort_tid) return json(403, { error: 'Gjennomfør opplæringen selv først' });
  const { data: alle } = await admin.from('opplaering_deltakere').select('*').eq('kurs_id', d.kurs_id).eq('rolle', 'ansatt').order('created_at');
  const mine = (alle || []).filter((x: any) => x.invitert_av === d.id);
  const rad = (x: any) => ({ id: x.id, navn: x.navn, epost: x.epost, sendt: x.sendt_tid, purret: x.purret_tid, purretAnt: x.purret_ant || 0, startet: x.startet_tid, fullfort: x.fullfort_tid });
  if (a === 'opl_oversikt') return json(200, { ansatte: mine.map(rad) });

  const { t } = await c.sprakFor(d.eiendom_id, body.mottakerSprak);
  const tilAnsatt = async (x: any, purring: boolean) => {
    const lenke = lenkeFor(x.token);
    const emne = purring ? t('Påminnelse: brannvernopplæring i {0}', f.eiendom) : t('Brannvernopplæring i {0}', f.eiendom);
    const avs = purring ? [t('Hei {0},', x.navn), t('{0} minner om at du ikke har gjennomført brannvernopplæringen for {1} ennå. Det tar omtrent 10 minutter.', d.navn, f.leietaker)] : [t('Hei {0},', x.navn), t('{0} ber deg gjennomgå en kort opplæring i brannsikkerheten i {1} ({2}). Det tar omtrent 10 minutter og har noen enkle spørsmål underveis.', d.navn, f.eiendom, f.leietaker)];
    const html = mailHtml(emne, avs, t('Start opplæringen'), lenke, t('Lenken er personlig. Du trenger ikke bruker i appen.'));
    const tekst = `${avs.join('\n\n')}\n\n${t('Start opplæringen')}: ${lenke}`;
    return c.sendEpost(x.epost, emne, html, tekst, undefined, d.epost, await c.oppsettFor(d.eiendom_id, null));
  };
  if (a === 'opl_inviter') {
    const P = (Array.isArray(body.personer) ? body.personer : []).slice(0, MAKS_PER_KALL); if (!P.length) return json(400, { error: 'Legg inn minst én person' });
    const har = new Set((alle || []).map((x: any) => String(x.epost).toLowerCase())); const ut: any[] = []; let nye = 0;
    if ((alle || []).length + P.length > MAKS_ANSATTE) return json(400, { error: `Maks ${MAKS_ANSATTE} ansatte per leietaker` });
    for (const p of P) {
      const navn = String(p.navn || '').trim().slice(0, 80); const ep = String(p.epost || '').trim().toLowerCase();
      if (!navn || !EPOST.test(ep)) { ut.push({ navn, epost: ep, feil: 'Mangler navn eller gyldig e-post' }); continue; }
      if (har.has(ep)) { ut.push({ navn, epost: ep, feil: 'Er allerede invitert' }); continue; }
      har.add(ep); const tok = nyttToken(); const nu = new Date().toISOString();
      const r = await admin.from('opplaering_deltakere').insert({ kurs_id: d.kurs_id, eiendom_id: d.eiendom_id, leietaker_id: d.leietaker_id, token: tok, rolle: 'ansatt', navn, epost: ep, invitert_av: d.id, sendt_tid: nu }).select().single();
      if (r.error) { ut.push({ navn, epost: ep, feil: 'Kunne ikke lagre' }); continue; }
      const m = await tilAnsatt(r.data, false).catch((e: any) => ({ sendt: false, grunn: String(e?.message || e) })); nye++;
      ut.push({ navn, epost: ep, sendt: !!m.sendt, grunn: m.sendt ? '' : m.grunn || '', lenke: m.sendt ? undefined : lenkeFor(tok) });
    }
    await admin.from('hendelseslogg').insert({ bruker_id: null, bruker: d.navn, tabell: 'hendelse', rad_id: d.leietaker_id, eiendom_id: d.eiendom_id, handling: 'brannopplaering', tekst: `${d.navn} (${f.leietaker}) inviterte ${nye} ansatte til brannvernopplæring` });
    return json(200, { resultat: ut });
  }
  // opl_purr: enten én (id) eller alle som ikke er ferdige. Maks én påminnelse per person per døgn.
  const mal = body.id ? mine.filter((x: any) => x.id === body.id) : mine;
  const ikkeFerdig = mal.filter((x: any) => !x.fullfort_tid); const grense = Date.now() - PURRE_PAUSE_T * 3600e3;
  const klare = ikkeFerdig.filter((x: any) => !x.purret_tid || new Date(x.purret_tid).getTime() < grense);
  let sendt = 0; const feil: string[] = [];
  for (const x of klare.slice(0, 100)) {
    const m = await tilAnsatt(x, true).catch((e: any) => ({ sendt: false, grunn: String(e?.message || e) }));
    if (m.sendt) { sendt++; await admin.from('opplaering_deltakere').update({ purret_tid: new Date().toISOString(), purret_ant: (x.purret_ant || 0) + 1 }).eq('id', x.id); }
    else feil.push(`${x.navn}: ${m.grunn || 'ikke sendt'}`);
  }
  return json(200, { sendt, ventet: ikkeFerdig.length - klare.length, ferdige: mal.length - ikkeFerdig.length, feil });
}
