// Automatisk leietaker-runde – serverdelen (kalles fra netlify/functions/arbeidsordre.ts).
// Sender egenkontroll/sjekkliste til alle leietakere på et fast tidspunkt, purrer de som ikke har svart og eskalerer til slutt til eier.
// Innstillinger: innstillinger.nokkel = 'ltRunde' (per organisasjon). Status per leietaker: leietakere.data.runde. Ingen databaseendring.
import type { SupabaseClient } from '@supabase/supabase-js';

export type RundeInnst = {
  pa: boolean; intervall: 'aar' | 'halvaar'; dato: string; aktivert: string; frist: number;
  purrEtter: number; purrGjenta: number; purrMaks: number; eskaler: boolean; eskalerEpost: string; melding: string;
};
export const RUNDE_STD: RundeInnst = { pa: false, intervall: 'aar', dato: '01-15', aktivert: '', frist: 14, purrEtter: 7, purrGjenta: 7, purrMaks: 3, eskaler: true, eskalerEpost: '', melding: '' };
export type RundeStatus = { start: string; sendt?: string; til?: string; frist?: string; purret?: number; sistPurret?: string; eskalert?: string; besvart?: string };

const EPOST = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const num = (v: any, min: number, max: number, std: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : std; };

export function renRundeInnst(x: any): RundeInnst {
  const c = { ...RUNDE_STD, ...(x || {}) };
  const m = /^(\d{2})-(\d{2})$/.exec(String(c.dato || '')); const mnd = m ? +m[1] : 1, dag = m ? +m[2] : 15;
  return { pa: !!c.pa, intervall: c.intervall === 'halvaar' ? 'halvaar' : 'aar', dato: (mnd >= 1 && mnd <= 12 && dag >= 1 && dag <= 28) ? m![0] : RUNDE_STD.dato,
    aktivert: /^\d{4}-\d{2}-\d{2}$/.test(String(c.aktivert || '')) ? c.aktivert : '', frist: num(c.frist, 1, 120, 14), purrEtter: num(c.purrEtter, 1, 90, 7),
    purrGjenta: num(c.purrGjenta, 1, 90, 7), purrMaks: num(c.purrMaks, 0, 10, 3), eskaler: c.eskaler !== false, eskalerEpost: String(c.eskalerEpost || '').slice(0, 300), melding: String(c.melding || '').slice(0, 1500) };
}

export const dagerMellom = (a: string, b: string) => Math.round((new Date(b + 'T00:00:00Z').getTime() - new Date(a + 'T00:00:00Z').getTime()) / 864e5);
export const leggTilDager = (d: string, n: number) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return iso(x); };

/** Siste planlagte rundestart som er nådd (årlig: dato hvert år, halvårlig: dato og seks måneder senere) */
export function periodeStart(c: Pick<RundeInnst, 'intervall' | 'dato'>, idag: string): string | null {
  const [mm, dd] = c.dato.split('-').map(Number); const y = +idag.slice(0, 4); const kand: string[] = [];
  for (const yy of [y - 1, y]) for (const m of c.intervall === 'halvaar' ? [mm, ((mm + 5) % 12) + 1] : [mm]) kand.push(`${yy}-${String(m).padStart(2, '0')}-${String(dd).padStart(2, '0')}`);
  return kand.filter(d => d <= idag).sort().pop() || null;
}

/** Skal en ny runde startes for denne leietakeren i dag? Runder som er planlagt før funksjonen ble slått på, hoppes over. */
export function skalStarte(c: RundeInnst, r: RundeStatus | undefined, idag: string, tving = false): boolean {
  if (tving) return !r || r.start !== idag;
  const ps = periodeStart(c, idag); if (!ps) return false;
  if (c.aktivert && ps <= c.aktivert) return false;
  return !r?.start || r.start < ps;
}

/** Besvart: alle relevante plikter er bekreftet etter rundens start, eller sendt inn til godkjenning */
export function erBesvart(plikter: any[], start: string): boolean {
  const pl = (plikter || []).filter((p: any) => !p.ikkeRelevant); if (!pl.length) return true;
  return pl.every((p: any) => p.status === 'til_godkjenning' || (!!p.sist && String(p.sist) >= start));
}
export const manglerPlikter = (plikter: any[], start: string) => (plikter || []).filter((p: any) => !p.ikkeRelevant && !(p.status === 'til_godkjenning' || (p.sist && String(p.sist) >= start)));

/** Neste steg for en leietaker som har fått rundens utsending, men ikke svart */
export function nesteSteg(c: RundeInnst, r: RundeStatus, idag: string): 'ingen' | 'purr' | 'eskaler' {
  if (!r.sendt || r.besvart) return 'ingen';
  const sendtDato = r.sendt.slice(0, 10); const ant = r.purret || 0;
  const sist = r.sistPurret ? r.sistPurret.slice(0, 10) : sendtDato;
  const ventet = dagerMellom(sendtDato, idag), siden = dagerMellom(sist, idag);
  if (ant < c.purrMaks) return (ant === 0 ? ventet >= c.purrEtter : siden >= c.purrGjenta) ? 'purr' : 'ingen';
  if (c.eskaler && !r.eskalert && siden >= c.purrGjenta) return 'eskaler';
  return 'ingen';
}

type Ctx = {
  admin: SupabaseClient; body: any; json: (s: number, b: any) => Response; esc: (s: any) => string; erCron: boolean;
  hvem: () => Promise<any>; sendEpost: (til: string, emne: string, html: string, tekst: string, v?: any, svarTil?: string, o?: any) => Promise<any>;
  oppsettFor: (eid: string | null | undefined, org?: string | null) => Promise<any>;
  sprakFor: (eid?: string | null, overstyr?: string) => Promise<{ t: (s: any, ...a: any[]) => string; dato: (d: string) => string }>;
};

export async function leietakerRunde(x: Ctx): Promise<Response | null> {
  const { admin, body, json, esc } = x; const a = body.action;
  if (a !== 'lt_runde' && a !== 'lt_runde_na') return null;
  const na = a === 'lt_runde_na'; let naOrg = '';
  if (na) {
    const p = await x.hvem(); if (!p) return json(401, { error: 'Ikke innlogget' }); naOrg = String(body.org || '');
    const { data: mm } = await admin.from('org_medlem').select('rolle').eq('org_id', naOrg).eq('user_id', p.id).eq('aktiv', true).maybeSingle();
    if (!mm || !['admin', 'forvalter'].includes(mm.rolle)) return json(403, { error: 'Bare administrator eller forvalter kan starte en runde' });
  } else if (!x.erCron) return json(403, { error: 'Ikke tillatt' });
  const base = (process.env.URL || '').replace(/\/+$/, ''); const idag = iso(new Date()); const rapport: any[] = [];
  const { data: innst0 } = await admin.from('innstillinger').select('org_id, data').eq('nokkel', 'ltRunde');
  const innst = na ? (innst0 || []).filter((r: any) => r.org_id === naOrg).concat((innst0 || []).some((r: any) => r.org_id === naOrg) ? [] : [{ org_id: naOrg, data: {} }]) : (innst0 || []);
  for (const r0 of innst) {
    const c = renRundeInnst(r0.data); if (!c.pa && !na) continue;
    const { data: org } = await admin.from('organisasjoner').select('id, navn, aktiv').eq('id', r0.org_id).maybeSingle(); if (!org?.aktiv) continue;
    const { data: E } = await admin.from('eiendommer').select('id, data').eq('eier_org_id', org.id); const eids = (E || []).map((e: any) => e.id); if (!eids.length) continue;
    const eNavn: Record<string, string> = Object.fromEntries((E || []).map((e: any) => [e.id, e.data?.navn || e.data?.adresse || '']));
    const { data: LT } = await admin.from('leietakere').select('id, eiendom_id, data').in('eiendom_id', eids);
    const rad = { org: org.navn, startet: 0, purret: 0, eskalert: 0, besvart: 0, uten_epost: 0, holdt: 0 }; const eskListe: { lt: string; eiendom: string; mangler: string[]; til: string }[] = [];
    for (const l of LT || []) {
      const d = l.data || {}; if (d.slutt && String(d.slutt) < idag) continue;
      const pl = (d.plikter || []).filter((p: any) => !p.ikkeRelevant); if (!pl.length) continue;
      let r: RundeStatus | undefined = d.runde;
      // Besvart? Registreres første gang vi ser det, slik at vi slutter å purre
      if (r?.sendt && !r.besvart && erBesvart(d.plikter, r.start)) { r = { ...r, besvart: idag }; await lagreRunde(admin, l.id, r); rad.besvart++; await logg(admin, org.id, l, `Leietaker-runde: ${d.navn || ''} har svart på alle punktene`); continue; }
      const til = String(d.epost || '').trim().toLowerCase(); const Lg = await x.sprakFor(l.eiendom_id); const { t } = Lg;
      const start = !r || skalStarte(c, r, idag, na);
      if (start) {
        if (!EPOST.test(til)) { rad.uten_epost++; continue; }
        const nyr: RundeStatus = { start: idag, frist: leggTilDager(idag, c.frist) };
        const lenke = await finnLenke(admin, l, til, base);
        const m = bygg(esc, t, Lg, { pur: 0, c, d, eiendom: eNavn[l.eiendom_id] || '', lenke, frist: nyr.frist!, pl, start: idag });
        const s = await x.sendEpost(til, m.emne, m.html, m.tekst, undefined, undefined, await x.oppsettFor(l.eiendom_id, org.id));
        if (s.sendt) { nyr.sendt = new Date().toISOString(); nyr.til = til; nyr.purret = 0; await lagreRunde(admin, l.id, nyr); rad.startet++; await logg(admin, org.id, l, `Leietaker-runde: sjekkliste sendt til ${til} (${d.navn || ''}), frist ${nyr.frist}`); }
        else { rad.holdt++; await logg(admin, org.id, l, `Leietaker-runde: sjekkliste til ${til} ble ikke sendt – ${String(s.grunn || '').slice(0, 200)}`); }
        continue;
      }
      if (!r) continue;
      const steg = nesteSteg(c, r, idag);
      if (steg === 'purr') {
        if (!EPOST.test(til)) continue;
        const lenke = await finnLenke(admin, l, til, base); const igjen = manglerPlikter(d.plikter, r.start);
        const m = bygg(esc, t, Lg, { pur: (r.purret || 0) + 1, c, d, eiendom: eNavn[l.eiendom_id] || '', lenke, frist: r.frist || '', pl: igjen, start: r.start });
        const s = await x.sendEpost(til, m.emne, m.html, m.tekst, undefined, undefined, await x.oppsettFor(l.eiendom_id, org.id));
        if (s.sendt) { await lagreRunde(admin, l.id, { ...r, purret: (r.purret || 0) + 1, sistPurret: new Date().toISOString() }); rad.purret++; await logg(admin, org.id, l, `Leietaker-runde: purring ${(r.purret || 0) + 1} sendt til ${til} (${d.navn || ''})`); }
      } else if (steg === 'eskaler') {
        eskListe.push({ lt: d.navn || '', eiendom: eNavn[l.eiendom_id] || '', mangler: manglerPlikter(d.plikter, r.start).map((p: any) => p.navn || p.key), til: r.til || til });
        await lagreRunde(admin, l.id, { ...r, eskalert: new Date().toISOString() }); rad.eskalert++;
      }
    }
    if (eskListe.length) {
      const adr = String(c.eskalerEpost || '').split(/[,;\s]+/).map(v => v.trim().toLowerCase()).filter(v => EPOST.test(v));
      const til = adr.length ? adr : (await admin.from('org_medlem').select('profiles(epost)').eq('org_id', org.id).eq('rolle', 'admin').eq('aktiv', true)).data?.map((m: any) => m.profiles?.epost).filter(Boolean) || [];
      const Lo = await x.sprakFor(null); const to = Lo.t; const emne = to('{0} leietakere har ikke svart på sjekklisten etter purring', eskListe.length);
      const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:760px"><h2>${esc(emne)}</h2><table style="border-collapse:collapse;font-size:13px;width:100%"><tr style="background:#f4f5f2"><th align="left" style="padding:4px">${esc(to('Leietaker'))}</th><th align="left" style="padding:4px">${esc(to('Eiendom'))}</th><th align="left" style="padding:4px">${esc(to('Mangler'))}</th></tr>${eskListe.map(e => `<tr><td style="padding:4px;border-top:1px solid #e3e6df">${esc(e.lt)}</td><td style="padding:4px;border-top:1px solid #e3e6df">${esc(e.eiendom)}</td><td style="padding:4px;border-top:1px solid #e3e6df">${esc(e.mangler.join(', '))}</td></tr>`).join('')}</table><p><a href="${base}/#/leietakere">${esc(to('Åpne leietakere'))}</a></p></div>`;
      const tekst = [emne, '', ...eskListe.map(e => `- ${e.lt} (${e.eiendom}): ${e.mangler.join(', ')}`)].join('\n');
      const o = await x.oppsettFor(null, org.id); for (const m of til) await x.sendEpost(m, emne, html, tekst, undefined, undefined, o);
      await admin.from('hendelseslogg').insert({ bruker_id: null, bruker: 'Leietaker-runde', tabell: 'hendelse', rad_id: null, eiendom_id: null, org_id: org.id, handling: 'sjekkliste', tekst: `Eskalering: ${eskListe.length} leietakere har ikke svart etter purring` });
    }
    rapport.push(rad);
  }
  return json(200, { ok: true, rapport });
}

async function lagreRunde(admin: SupabaseClient, id: string, runde: RundeStatus) {
  const { data: fr } = await admin.from('leietakere').select('data').eq('id', id).single();
  await admin.from('leietakere').update({ data: { ...(fr?.data || {}), runde } }).eq('id', id);
}
const logg = (admin: SupabaseClient, org: string, l: any, tekst: string) => admin.from('hendelseslogg').insert({ bruker_id: null, bruker: 'Leietaker-runde', tabell: 'hendelse', rad_id: l.id, eiendom_id: l.eiendom_id, org_id: org, handling: 'sjekkliste', tekst });

/** Innlogging for eksisterende leietakerbruker, ellers gjenbrukes eller opprettes invitasjon */
async function finnLenke(admin: SupabaseClient, l: any, til: string, base: string): Promise<string> {
  const { data: fins } = await admin.from('profiles').select('id, rolle, leietaker_id').eq('epost', til).maybeSingle();
  if (fins && fins.rolle === 'leietaker' && fins.leietaker_id === l.id) return `${base}/#/portal`;
  const { data: inv } = await admin.from('lt_invitasjon').select('token').eq('leietaker_id', l.id).eq('epost', til).is('brukt', null).order('opprettet', { ascending: false }).limit(1);
  if (inv?.[0]) return `${base}/#/lt/${inv[0].token}`;
  const { data: ny } = await admin.from('lt_invitasjon').insert({ leietaker_id: l.id, epost: til }).select('token').single();
  return ny ? `${base}/#/lt/${ny.token}` : `${base}/#/portal`;
}

function bygg(esc: (s: any) => string, t: (s: any, ...a: any[]) => string, L: { dato: (d: string) => string }, o: { pur: number; c: RundeInnst; d: any; eiendom: string; lenke: string; frist: string; pl: any[]; start: string }) {
  const navn = o.d.navn || ''; const frist = o.frist ? L.dato(o.frist) : '';
  const emne = `${o.pur ? (o.pur > 1 ? t('{0}. purring', o.pur) : t('Purring')) + ': ' : ''}${t('Sjekkliste brann og internkontroll')} – ${navn}${o.eiendom ? ' (' + o.eiendom + ')' : ''}`.slice(0, 180);
  const inn = o.pur ? t('Vi har ikke mottatt svar på sjekklisten for {0}. Punktene under mangler fortsatt.', o.eiendom || t('bygget'))
    : (o.c.melding || t('Som utleier følger vi opp at leietakerne i {0} ivaretar sine plikter innen brannsikkerhet og HMS. Vi ber dere fylle ut sjekklisten og legge ved dokumentasjon.', o.eiendom || t('bygget')));
  const punkter = o.pl.map((p: any) => t(p.navn || p.key));
  const tekst = [t('Hei,'), '', inn, frist ? `\n${t('Frist')}: ${frist}` : '', '', t('Punkter:'), ...punkter.map(p => '- ' + p), '', `${t('Fyll ut her')}:\n${o.lenke}`, '', t('Dette er en automatisk melding fra utleier.')].join('\n');
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#1d2320"><p style="font-size:12px;color:#6b736d;margin:0">${esc(o.pur ? t('PURRING') : t('SJEKKLISTE'))}</p><h2 style="margin:4px 0 12px">${esc(t('Brann og internkontroll'))} – ${esc(navn)}</h2>
    <p>${esc(inn).replace(/\n/g, '<br>')}</p>${frist ? `<p><b>${esc(t('Frist'))}: ${esc(frist)}</b></p>` : ''}<ul>${punkter.map(p => `<li>${esc(p)}</li>`).join('')}</ul>
    <p style="margin:20px 0"><a href="${esc(o.lenke)}" style="background:#1f6f5c;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">${esc(t('Åpne sjekklisten'))}</a></p>
    <p style="font-size:12px;color:#6b736d">${esc(t('Via lenken logger du inn (eller oppretter bruker), krysser av for dokumentasjonen og laster opp filer. Utleier går gjennom og godkjenner.'))} ${esc(t('Dette er en automatisk melding fra utleier.'))}</p></div>`;
  return { emne, html, tekst };
}
