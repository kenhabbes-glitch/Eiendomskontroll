// Rapporter til oppfølging – serverdelen (kalles fra netlify/functions/arbeidsordre.ts, daglig kl. 06 UTC) og felles hjelpere.
// Servicerapporter som er mottatt (oppgaver.data.innrapport) og venter på godkjenning, gir én samlet påminnelse (push og e-post) etter N dager.
// Selve lesingen av PDF-en skjer i nettleseren (src/lib/rapportAuto.ts) og lagres som innrapport.lesing; påminnelsen tar med funnene derfra.
// Innstillinger: innstillinger.nokkel = 'rapportVarsel' (per organisasjon). Ingen databaseendring.
import type { SupabaseClient } from '@supabase/supabase-js';

export type RapportInnst = { pa: boolean; leseAuto: boolean; paminnDager: number; epost: string };
export const RAPPORT_STD: RapportInnst = { pa: false, leseAuto: true, paminnDager: 1, epost: '' };
const EPOST = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
const num = (v: any, min: number, max: number, std: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : std; };
export function renRapport(x: any): RapportInnst {
  const c = { ...RAPPORT_STD, ...(x || {}) };
  return { pa: !!c.pa, leseAuto: c.leseAuto !== false, paminnDager: num(c.paminnDager, 0, 14, 1), epost: String(c.epost || '').slice(0, 300) };
}
export type Lesing = { lest: string; n: number; hoy: boolean; ok: string; forslag: { t: string; a: string }[] };
const norm = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9æøå]+/g, ' ').trim();
/** Sammendrag av lesingen: forslag som firmaet allerede har oppgitt som avvik, tas ut (bare nye funn beholdes) */
export function oppsummerLesing(forslag: { tekst: string; alv: string }[], firmaAvvik: string[], ok: string, na: string): Lesing {
  const kjent = firmaAvvik.map(norm).filter(Boolean);
  const nye = forslag.filter(f => { const n = norm(f.tekst); return n && !kjent.some(k => k.includes(n) || n.includes(k)); }).slice(0, 20).map(f => ({ t: String(f.tekst).replace(/\s+/g, ' ').trim().slice(0, 300), a: f.alv || 'Middels' }));
  return { lest: na, n: nye.length, hoy: nye.some(f => f.a === 'Høy' || f.a === 'Kritisk'), ok: String(ok || '').slice(0, 120), forslag: nye };
}
const PDF_ELLER_BILDE = (f: any) => /pdf/i.test(f?.type || '') || /\.pdf$/i.test(f?.navn || f?.path || '');
/** Skal rapporten leses automatisk? Har PDF, ikke lest før */
export const trengerLesing = (ir: any) => !!ir && !ir.lesing && Array.isArray(ir.filer) && ir.filer.some(PDF_ELLER_BILDE);

type Ctx = {
  admin: SupabaseClient; body: any; json: (s: number, b: any) => Response; esc: (s: any) => string; erCron: boolean; hvem: () => Promise<any>;
  sendEpost: (til: string, emne: string, html: string, tekst: string, v?: any, svarTil?: string, o?: any) => Promise<any>;
  oppsettFor: (eid: string | null | undefined, org?: string | null) => Promise<any>;
  sprakFor: (eid?: string | null, overstyr?: string) => Promise<{ t: (s: any, ...a: any[]) => string }>;
  pushTilOrg: (admin: any, orgId: string, typer: string[], inn: { tittel: string; tekst: string; url?: string; tag?: string }, roller?: string[]) => Promise<number>;
  idag?: Date;
};

export async function rapportVarsel(x: Ctx): Promise<Response | null> {
  const { admin, body, json, esc } = x; const a = body.action;
  if (a !== 'rapport_paminn' && a !== 'rapport_paminn_na') return null;
  const na = a === 'rapport_paminn_na'; let naOrg = '';
  if (na) {
    const p = await x.hvem(); if (!p) return json(401, { error: 'Ikke innlogget' }); naOrg = String(body.org || '');
    const { data: mm } = await admin.from('org_medlem').select('rolle').eq('org_id', naOrg).eq('user_id', p.id).eq('aktiv', true).maybeSingle();
    if (!mm || !['admin', 'forvalter'].includes(mm.rolle)) return json(403, { error: 'Bare administrator eller forvalter kan kjøre dette' });
  } else if (!x.erCron) return json(403, { error: 'Ikke tillatt' });
  const nu = (x.idag || new Date()).getTime(); const base = (process.env.URL || '').replace(/\/+$/, '');
  const { data: innst0 } = await admin.from('innstillinger').select('org_id, data').eq('nokkel', 'rapportVarsel');
  const liste = na ? [{ org_id: naOrg, data: (innst0 || []).find((r: any) => r.org_id === naOrg)?.data || {} }] : (innst0 || []);
  const rapport: any[] = [];
  for (const r0 of liste) {
    const c = renRapport(r0.data); if (!c.pa && !na) continue;
    const { data: org } = await admin.from('organisasjoner').select('id, navn, aktiv').eq('id', r0.org_id).maybeSingle(); if (!org?.aktiv) continue;
    const { data: E } = await admin.from('eiendommer').select('id, data').eq('eier_org_id', org.id); const eids = (E || []).map((e: any) => e.id); if (!eids.length) continue;
    const eNavn: Record<string, string> = Object.fromEntries((E || []).map((e: any) => [e.id, e.data?.navn || e.data?.adresse || '']));
    const { data: O } = await admin.from('oppgaver').select('id, eiendom_id, data').in('eiendom_id', eids);
    const alle = (O || []).filter((o: any) => o.data?.innrapport && o.data?.aktiv !== false);
    const ventende = alle.filter((o: any) => { const ir = o.data.innrapport; const t = new Date(ir.mottatt || 0).getTime(); return t && (na || (!ir.paminnet && (nu - t) / 864e5 >= c.paminnDager - 0.05)); });
    if (!ventende.length) { rapport.push({ org: org.navn, ventende: 0, push: 0, epost: 0 }); continue; }
    const kritisk = ventende.filter((o: any) => o.data.innrapport.lesing?.hoy).length;
    const funn = (o: any) => { const ir = o.data.innrapport; return (ir.avvik || []).length + (ir.lesing?.n || 0); };
    const L = await x.sprakFor(null); const { t } = L;
    const tittel = ventende.length === 1 ? t('1 servicerapport venter på godkjenning') : t('{0} servicerapporter venter på godkjenning', ventende.length);
    const linjer = ventende.slice(0, 15).map((o: any) => { const ir = o.data.innrapport; return `${o.data.navn || ''} (${eNavn[o.eiendom_id] || ''}) – ${ir.firma || ir.epost || ''}, ${funn(o) ? t('{0} avvik', funn(o)) : t('ingen avvik')}${ir.lesing?.hoy ? ' · ' + t('høy alvorlighet') : ''}`; });
    const url = base ? base + '/#/oversikt' : '/';
    const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:620px;color:#1d2521"><h2>${esc(tittel)}</h2>${kritisk ? `<p><b>${esc(t('{0} har funn med høy alvorlighet', kritisk))}</b></p>` : ''}<ul>${linjer.map(l => `<li>${esc(l)}</li>`).join('')}</ul><p><a href="${esc(url)}" style="background:#1f6f5c;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">${esc(t('Åpne oversikten'))}</a></p></div>`;
    const tekst = [tittel, '', ...linjer.map(l => '- ' + l), '', url].join('\n');
    const egne = String(c.epost || '').split(/[,;\s]+/).map(v => v.trim().toLowerCase()).filter(v => EPOST.test(v));
    const til = egne.length ? egne : ((await admin.from('org_medlem').select('profiles(epost)').eq('org_id', org.id).eq('rolle', 'admin').eq('aktiv', true)).data || []).map((m: any) => String(m.profiles?.epost || '').toLowerCase()).filter((e: string) => EPOST.test(e));
    let epost = 0; for (const m of til) { const s = await x.sendEpost(m, tittel, html, tekst, undefined, undefined, await x.oppsettFor(null, org.id)).catch(() => ({ sendt: false })); if (s?.sendt) epost++; }
    const push = await x.pushTilOrg(admin, org.id, kritisk ? ['kritisk', 'oversikt'] : ['oversikt'], { tittel, tekst: kritisk ? t('{0} har funn med høy alvorlighet', kritisk) : linjer[0] || '', url, tag: 'rapport-paminn' }, ['admin', 'forvalter']).catch(() => 0);
    if (!na && (push || epost)) for (const o of ventende) await admin.from('oppgaver').update({ data: { ...o.data, innrapport: { ...o.data.innrapport, paminnet: new Date(nu).toISOString() } } }).eq('id', o.id);
    await admin.from('hendelseslogg').insert({ bruker_id: null, bruker: 'Rapportpåminnelse', tabell: 'hendelse', rad_id: null, eiendom_id: null, handling: 'rapport', tekst: `${tittel} (push ${push}, e-post ${epost})`.slice(0, 500) });
    rapport.push({ org: org.navn, ventende: ventende.length, push, epost });
  }
  return json(200, { ok: true, rapport });
}
