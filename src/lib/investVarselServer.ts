// Levetidsvarsler og investeringsplan – serverdelen (kalles fra netlify/functions/arbeidsordre.ts, daglig kl. 06 UTC).
// 1) Første mandag i januar/april/juli/oktober: én samlet e-post og push med utskiftinger de nærmeste årene, kostnad (KPI-justert) og datahull.
// 2) Hver dag: push med en gang noe nytt har passert levetid (etterslep) eller får tilstandsgrad TG3, én gang per post.
// Innstillinger: innstillinger.nokkel = 'investVarsel' (per organisasjon). Tilstand: data.investHaste på systemet/komponenten. Ingen databaseendring.
import type { SupabaseClient } from '@supabase/supabase-js';

export type InvestInnst = { pa: boolean; aar: number; haste: boolean; epost: string; sistKvartal: string };
export const INVEST_STD: InvestInnst = { pa: false, aar: 2, haste: true, epost: '', sistKvartal: '' };
const EPOST = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
const num = (v: any, min: number, max: number, std: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : std; };
export function renInvest(x: any): InvestInnst {
  const c = { ...INVEST_STD, ...(x || {}) };
  return { pa: !!c.pa, aar: num(c.aar, 1, 5, 2), haste: c.haste !== false, epost: String(c.epost || '').slice(0, 300), sistKvartal: String(c.sistKvartal || '').slice(0, 10) };
}
/** Kvartalsnøkkel hvis datoen er første mandag i januar, april, juli eller oktober, ellers null */
export function kvartalsDag(d: Date): string | null {
  const m = d.getUTCMonth(); if (m % 3 !== 0 || d.getUTCDay() !== 1 || d.getUTCDate() > 7) return null; return `${d.getUTCFullYear()}-K${m / 3 + 1}`;
}
export const kpiFaktor = (kpi: any, fra: number, til: number) => {
  let f = 1; const fast = kpi?.fast === '' || kpi?.fast == null || isNaN(+kpi.fast) ? 3 : +kpi.fast;
  for (let y = fra + 1; y <= til; y++) { const v = kpi?.modus === 'aar' ? kpi?.aar?.[String(y)] : undefined; f *= 1 + (v !== undefined && v !== null && String(v) !== '' && !isNaN(+v) ? +v : fast) / 100; } return f;
};

export type Post = { id: string; tabell: 'systemer' | 'komponenter'; navn: string; eiendom: string; y: number | null; kost: number; tg: string; etterslep: boolean; haste: string | null; data: any };
export type Gap = { utenAar: number; utenKost: number; utenTg: number };

/** Bygger postene: systemet med komponenter uten egen levetid, og komponenter med egen levetid for seg */
export function byggPoster(systemer: any[], komponenter: any[], eNavn: Record<string, string>, kpi: any, aar: number, levetidFor: (type: string) => number): { poster: Post[]; hull: Gap } {
  const lev = (d: any) => +d.levetid || levetidFor(d.type) || 0; const egen = (d: any) => !!(+d.planAar || (+d.aar && +d.levetid));
  const aarFor = (d: any): number | null => d.planAar ? +d.planAar : (+d.aar && lev(d)) ? +d.aar + lev(d) : null;
  const just = (d: any, y: number | null) => { const k = +d.kost || 0; if (!k) return 0; return k * kpiFaktor(kpi, +d.kostAar || aar, Math.max(y ?? aar, aar)); };
  const poster: Post[] = []; const hull: Gap = { utenAar: 0, utenKost: 0, utenTg: 0 };
  for (const s of systemer.filter(x => !x.data?.arkivert)) {
    const d = s.data || {}; const y = aarFor(d); const mine = komponenter.filter(k => k.system_id === s.id && !k.data?.arkivert);
    const tg = d.tg || ''; let kost = just(d, y); for (const k of mine) if (!egen(k.data || {})) kost += just(k.data || {}, y);
    if (y === null) hull.utenAar++; if (!kost) hull.utenKost++; if (!tg) hull.utenTg++;
    poster.push({ id: s.id, tabell: 'systemer', navn: d.navn || d.type || 'System', eiendom: eNavn[s.eiendom_id] || '', y, kost: Math.round(kost), tg, etterslep: y !== null && y < aar, haste: d.investHaste || null, data: d });
    for (const k of mine.filter(k => egen(k.data || {}))) { const kd = k.data || {}; const ky = aarFor(kd); if (ky === null || (y !== null && ky >= y)) continue;
      poster.push({ id: k.id, tabell: 'komponenter', navn: `${kd.navn || kd.type || 'Komponent'} (${d.navn || d.type || 'system'})`, eiendom: eNavn[s.eiendom_id] || '', y: ky, kost: Math.round(just(kd, ky)), tg: kd.tg || '', etterslep: ky < aar, haste: kd.investHaste || null, data: kd }); }
  }
  return { poster, hull };
}
/** Poster som skal med i kvartalsoversikten: TG3, etterslep og alt som skal skiftes innen horisonten */
export const iHorisont = (p: Post, aar: number, n: number) => p.tg === 'TG3' || p.etterslep || (p.y !== null && p.y < aar + n);
/** Poster som skal varsles med en gang: nytt etterslep eller ny TG3 som ikke er varslet før */
export const nyeHaster = (poster: Post[]) => poster.map(p => ({ p, kode: p.tg === 'TG3' ? 'TG3' : p.etterslep ? 'etterslep' : '' })).filter(x => x.kode && x.p.haste !== x.kode);

type Ctx = {
  admin: SupabaseClient; body: any; json: (s: number, b: any) => Response; esc: (s: any) => string; erCron: boolean; hvem: () => Promise<any>;
  sendEpost: (til: string, emne: string, html: string, tekst: string, v?: any, svarTil?: string, o?: any) => Promise<any>;
  oppsettFor: (eid: string | null | undefined, org?: string | null) => Promise<any>;
  sprakFor: (eid?: string | null, overstyr?: string) => Promise<{ t: (s: any, ...a: any[]) => string }>;
  pushTilOrg: (admin: any, orgId: string, typer: string[], inn: { tittel: string; tekst: string; url?: string; tag?: string }, roller?: string[]) => Promise<number>;
  levetidFor: (type: string) => number; idag?: Date;
};
const kr = (v: number) => new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 }).format(Math.round(v)) + ' kr';

export async function investVarsel(x: Ctx): Promise<Response | null> {
  const { admin, body, json, esc } = x; const a = body.action;
  if (a !== 'invest_varsel' && a !== 'invest_varsel_na') return null;
  const na = a === 'invest_varsel_na'; let naOrg = '';
  if (na) {
    const p = await x.hvem(); if (!p) return json(401, { error: 'Ikke innlogget' }); naOrg = String(body.org || '');
    const { data: mm } = await admin.from('org_medlem').select('rolle').eq('org_id', naOrg).eq('user_id', p.id).eq('aktiv', true).maybeSingle();
    if (!mm || !['admin', 'forvalter'].includes(mm.rolle)) return json(403, { error: 'Bare administrator eller forvalter kan kjøre dette' });
  } else if (!x.erCron) return json(403, { error: 'Ikke tillatt' });
  const idag = x.idag || new Date(); const aar = idag.getUTCFullYear(); const kvartal = kvartalsDag(idag); const base = (process.env.URL || '').replace(/\/+$/, '');
  const { data: innst0 } = await admin.from('innstillinger').select('org_id, data').eq('nokkel', 'investVarsel');
  const liste = na ? [{ org_id: naOrg, data: (innst0 || []).find((r: any) => r.org_id === naOrg)?.data || {} }] : (innst0 || []);
  const rapport: any[] = [];
  for (const r0 of liste) {
    const c = renInvest(r0.data); if (!c.pa && !na) continue;
    const { data: org } = await admin.from('organisasjoner').select('id, navn, aktiv').eq('id', r0.org_id).maybeSingle(); if (!org?.aktiv) continue;
    const { data: E } = await admin.from('eiendommer').select('id, data').eq('eier_org_id', org.id); const eids = (E || []).map((e: any) => e.id); if (!eids.length) continue;
    const eNavn: Record<string, string> = Object.fromEntries((E || []).map((e: any) => [e.id, e.data?.navn || e.data?.adresse || '']));
    const [{ data: S }, { data: K }, { data: kp }] = await Promise.all([admin.from('systemer').select('id, eiendom_id, data').in('eiendom_id', eids), admin.from('komponenter').select('id, eiendom_id, system_id, data').in('eiendom_id', eids), admin.from('innstillinger').select('data').eq('org_id', org.id).eq('nokkel', 'kpi').maybeSingle()]);
    const { poster, hull } = byggPoster(S || [], K || [], eNavn, kp?.data || {}, aar, x.levetidFor);
    const rad: any = { org: org.navn, poster: poster.length, haste: 0, kvartal: false, push: 0, epost: 0 };
    const url = base ? base + '/#/vedlikehold' : '/';
    // a) Haste: nytt etterslep eller ny TG3
    const haster = nyeHaster(poster);
    if (haster.length && (c.haste || na)) {
      const tittel = haster.length === 1 ? `${haster[0].p.navn}: ${haster[0].kode === 'TG3' ? 'tilstandsgrad TG3' : 'passert levetid'}` : `${haster.length} systemer trenger utskifting`;
      rad.push += await x.pushTilOrg(admin, org.id, ['oversikt'], { tittel: tittel.slice(0, 90), tekst: haster.slice(0, 3).map(h => `${h.p.navn}${h.p.eiendom ? ' (' + h.p.eiendom + ')' : ''}`).join(' · ').slice(0, 160), url, tag: 'invest-haste' }, ['admin', 'forvalter']).catch(() => 0); rad.haste = haster.length;
      if (!na) for (const h of haster) await admin.from(h.p.tabell).update({ data: { ...h.p.data, investHaste: h.kode } }).eq('id', h.p.id);
    }
    // b) Kvartalsoversikt
    if (na || (kvartal && c.pa && c.sistKvartal !== kvartal)) {
      const med = poster.filter(p => iHorisont(p, aar, c.aar)).sort((p, q) => (p.y ?? 0) - (q.y ?? 0)); const sum = med.reduce((s, p) => s + p.kost, 0); rad.kvartal = true;
      const perAar = new Map<number, number>(); med.forEach(p => { const y = Math.max(p.y ?? aar, aar); perAar.set(y, (perAar.get(y) || 0) + p.kost); });
      const L = await x.sprakFor(null); const { t } = L; const tittel = med.length ? t('Investeringsplan: {0} utskiftinger de nærmeste {1} årene', med.length, c.aar) : t('Investeringsplan: ingen utskiftinger de nærmeste {0} årene', c.aar);
      const linjer = med.slice(0, 20).map(p => `${p.y !== null && p.y < aar ? t('Etterslep') : p.tg === 'TG3' ? 'TG3' : p.y}: ${p.navn}${p.eiendom ? ' (' + p.eiendom + ')' : ''} – ${p.kost ? kr(p.kost) : t('uten kostnad')}`);
      const aarL = [...perAar].sort((p, q) => p[0] - q[0]).map(([y, v]) => `${y}: ${kr(v)}`);
      const hullL = [hull.utenAar ? t('{0} systemer mangler installasjonsår eller levetid', hull.utenAar) : '', hull.utenKost ? t('{0} systemer mangler kostnad', hull.utenKost) : '', hull.utenTg ? t('{0} systemer mangler tilstandsgrad', hull.utenTg) : ''].filter(Boolean);
      const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:640px;color:#1d2521"><h2>${esc(tittel)}</h2>${med.length ? `<p><b>${esc(t('Samlet'))}: ${esc(kr(sum))}</b> (${esc(aarL.join(' · '))})</p><ul>${linjer.map(l => `<li>${esc(l)}</li>`).join('')}</ul>${med.length > 20 ? `<p>${esc(t('… og {0} til', med.length - 20))}</p>` : ''}` : ''}${hullL.length ? `<p><b>${esc(t('Datahull som svekker planen'))}</b></p><ul>${hullL.map(l => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}<p><a href="${esc(url)}" style="background:#1f6f5c;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">${esc(t('Åpne vedlikeholdsplanen'))}</a></p></div>`;
      const tekst = [tittel, med.length ? `${t('Samlet')}: ${kr(sum)} (${aarL.join(' · ')})` : '', ...linjer.map(l => '- ' + l), ...(hullL.length ? ['', ...hullL.map(l => '- ' + l)] : []), '', url].filter((v, i) => v !== '' || i > 0).join('\n');
      const egne = String(c.epost || '').split(/[,;\s]+/).map(v => v.trim().toLowerCase()).filter(v => EPOST.test(v));
      const til = egne.length ? egne : ((await admin.from('org_medlem').select('profiles(epost)').eq('org_id', org.id).eq('rolle', 'admin').eq('aktiv', true)).data || []).map((m: any) => String(m.profiles?.epost || '').toLowerCase()).filter((e: string) => EPOST.test(e));
      for (const m of til) { const s = await x.sendEpost(m, tittel, html, tekst, undefined, undefined, await x.oppsettFor(null, org.id)).catch(() => ({ sendt: false })); if (s?.sendt) rad.epost++; }
      rad.push += await x.pushTilOrg(admin, org.id, ['oversikt'], { tittel: tittel.slice(0, 90), tekst: med.length ? `${t('Samlet')} ${kr(sum)}` : t('Ingen utskiftinger planlagt'), url, tag: 'invest-kvartal' }, ['admin', 'forvalter']).catch(() => 0);
      if (!na) await admin.from('innstillinger').update({ data: { ...(r0.data || {}), sistKvartal: kvartal } }).eq('org_id', org.id).eq('nokkel', 'investVarsel');
    }
    if (rad.haste || rad.kvartal) await admin.from('hendelseslogg').insert({ bruker_id: null, bruker: 'Investeringsvarsler', tabell: 'hendelse', rad_id: null, eiendom_id: null, handling: 'invest', tekst: `Haste ${rad.haste}, kvartalsoversikt ${rad.kvartal ? 'ja' : 'nei'} (push ${rad.push}, e-post ${rad.epost})`.slice(0, 500) });
    rapport.push(rad);
  }
  return json(200, { ok: true, rapport });
}
