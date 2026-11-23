// Leieavtale-vakt – serverdelen (kalles fra netlify/functions/arbeidsordre.ts).
// Varsler eier om avtaleutløp, siste oppsigelsesdato og kommende indeksregulering. Sender aldri noe til leietaker.
// Innstillinger: innstillinger.nokkel = 'leieVakt' (per organisasjon). Status per leietaker: leietakere.data.vakt. Ingen databaseendring.
import type { SupabaseClient } from '@supabase/supabase-js';

// ---- Felles regler for server (varsler) og nettleser (utkast til indeksregulering)
export type VaktInnst = { pa: boolean; utlopMnd: number[]; oppsigDager: number[]; regulerDager: number; epost: string };
export const VAKT_STD: VaktInnst = { pa: false, utlopMnd: [12, 6, 3], oppsigDager: [60, 30], regulerDager: 60, epost: '' };
const iso = (d: Date) => d.toISOString().slice(0, 10);
const liste = (v: any, std: number[], maks: number) => { const t = (Array.isArray(v) ? v : String(v ?? '').split(/[,;\s]+/)).map((n: any) => Math.round(Number(n))).filter((n: number) => Number.isFinite(n) && n >= 0 && n <= maks); const u = Array.from(new Set<number>(t)).sort((a, b) => b - a).slice(0, 6); return u.length ? u : std; };
export function renVaktInnst(x: any): VaktInnst {
  const c = { ...VAKT_STD, ...(x || {}) }; const rd = Math.round(Number(c.regulerDager));
  return { pa: !!c.pa, utlopMnd: liste(c.utlopMnd, VAKT_STD.utlopMnd, 60), oppsigDager: liste(c.oppsigDager, VAKT_STD.oppsigDager, 365), regulerDager: Number.isFinite(rd) ? Math.max(7, Math.min(180, rd)) : 60, epost: String(c.epost || '').slice(0, 300) };
}
export const dagerTil = (fra: string, til: string) => Math.round((new Date(til + 'T00:00:00Z').getTime() - new Date(fra + 'T00:00:00Z').getTime()) / 864e5);

/** «15.03» → { d: 15, m: 3 } */
export function parseDagMnd(s: any): { d: number; m: number } | null {
  const m = /^\s*(\d{1,2})\.(\d{1,2})\.?\s*$/.exec(String(s ?? '')); if (!m) return null; const d = +m[1], mm = +m[2];
  return d >= 1 && d <= 31 && mm >= 1 && mm <= 12 ? { d, m: mm } : null;
}
const dato = (y: number, m: number, d: number) => { const dim = new Date(Date.UTC(y, m, 0)).getUTCDate(); return `${y}-${String(m).padStart(2, '0')}-${String(Math.min(d, dim)).padStart(2, '0')}`; };

/** Neste reguleringsdato (i dag eller senere). Bruker «reguleringDag» (dd.mm), ellers årsdagen for avtalestart. Ingen regulering etter avtaleutløp. */
export function nesteRegulering(l: { reguleringDag?: string; start?: string; slutt?: string }, idag: string): string | null {
  const pd = parseDagMnd(l.reguleringDag) || (/^\d{4}-\d{2}-\d{2}$/.test(String(l.start || '')) ? { d: +String(l.start).slice(8, 10), m: +String(l.start).slice(5, 7) } : null); if (!pd) return null;
  const y = +idag.slice(0, 4); let n = dato(y, pd.m, pd.d); if (n < idag) n = dato(y + 1, pd.m, pd.d);
  if (l.start && n <= l.start) return null; if (l.slutt && n > l.slutt) return null; return n;
}
/** Siste dato leietaker eller utleier kan si opp: avtaleutløp minus oppsigelsesfristen i hele måneder */
export function sisteOppsigDato(l: { slutt?: string; oppsigMnd?: any }): string | null {
  const mnd = Math.round(Number(l.oppsigMnd)); if (!/^\d{4}-\d{2}-\d{2}$/.test(String(l.slutt || '')) || !Number.isFinite(mnd) || mnd <= 0) return null;
  const y = +l.slutt!.slice(0, 4), m = +l.slutt!.slice(5, 7), d = +l.slutt!.slice(8, 10); const t = m - mnd; const yy = y + Math.floor((t - 1) / 12); const mm = ((t - 1) % 12 + 12) % 12 + 1; return dato(yy, mm, d);
}
/** Laveste trinn (antall dager før) som er nådd og ikke sendt. Datoer som er passert, gir ingen varsel. */
export function trinnDager(trinn: number[], dagerIgjen: number, sendt: number[]): number | null {
  if (dagerIgjen < 0) return null; const nadd = trinn.filter(t => dagerIgjen <= t); if (!nadd.length) return null; const lav = Math.min(...nadd); return sendt.includes(lav) ? null : lav;
}
export const mndTilDager = (m: number) => Math.round(m * 30.44);

/** Utkast til indeksregulering: ny leie = dagens leie × (1 + KPI-endring × andel). Avrundet til hele kroner. */
export function reguleringUtkast(gammel: number, kpiProsent: number, andelProsent = 100) {
  const g = Math.max(0, Number(gammel) || 0); const k = Number(kpiProsent) || 0; const a = Number.isFinite(Number(andelProsent)) ? Number(andelProsent) : 100;
  const ny = Math.round(g * (1 + (k * a) / 10000)); return { gammel: g, ny, endring: ny - g, prosent: g ? Math.round(((ny - g) / g) * 10000) / 100 : 0 };
}
export { iso };


const EPOST = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
type Ctx = {
  admin: SupabaseClient; body: any; json: (s: number, b: any) => Response; esc: (s: any) => string; erCron: boolean;
  hvem: () => Promise<any>; sendEpost: (til: string, emne: string, html: string, tekst: string, v?: any, svarTil?: string, o?: any) => Promise<any>;
  oppsettFor: (eid: string | null | undefined, org?: string | null) => Promise<any>;
  sprakFor: (eid?: string | null, overstyr?: string) => Promise<{ t: (s: any, ...a: any[]) => string; dato: (d: string) => string }>;
};
type Hendelse = { type: 'utlop' | 'oppsig' | 'regul'; lt: any; eiendom: string; dato: string; dager: number; trinn: number };

export async function leieVakt(x: Ctx): Promise<Response | null> {
  const { admin, body, json, esc } = x; const a = body.action;
  if (a !== 'leie_vakt' && a !== 'leie_vakt_na') return null;
  const na = a === 'leie_vakt_na'; let naOrg = '';
  if (na) {
    const p = await x.hvem(); if (!p) return json(401, { error: 'Ikke innlogget' }); naOrg = String(body.org || '');
    const { data: mm } = await admin.from('org_medlem').select('rolle').eq('org_id', naOrg).eq('user_id', p.id).eq('aktiv', true).maybeSingle();
    if (!mm || !['admin', 'forvalter'].includes(mm.rolle)) return json(403, { error: 'Bare administrator eller forvalter kan kjøre dette' });
  } else if (!x.erCron) return json(403, { error: 'Ikke tillatt' });
  const base = (process.env.URL || '').replace(/\/+$/, ''); const idag = iso(new Date()); const rapport: any[] = [];
  const { data: innst0 } = await admin.from('innstillinger').select('org_id, data').eq('nokkel', 'leieVakt');
  const innst = na ? (innst0 || []).filter((r: any) => r.org_id === naOrg).concat((innst0 || []).some((r: any) => r.org_id === naOrg) ? [] : [{ org_id: naOrg, data: {} }]) : (innst0 || []);
  for (const r0 of innst) {
    const c = renVaktInnst(r0.data); if (!c.pa && !na) continue;
    const { data: org } = await admin.from('organisasjoner').select('id, navn, aktiv').eq('id', r0.org_id).maybeSingle(); if (!org?.aktiv) continue;
    const { data: E } = await admin.from('eiendommer').select('id, data').eq('eier_org_id', org.id); const eids = (E || []).map((e: any) => e.id); if (!eids.length) continue;
    const eNavn: Record<string, string> = Object.fromEntries((E || []).map((e: any) => [e.id, e.data?.navn || e.data?.adresse || '']));
    const { data: LT } = await admin.from('leietakere').select('id, eiendom_id, data').in('eiendom_id', eids);
    const { data: adm } = await admin.from('org_medlem').select('profiles(epost)').eq('org_id', org.id).eq('rolle', 'admin').eq('aktiv', true);
    const adr = String(c.epost || '').split(/[,;\s]+/).map(v => v.trim().toLowerCase()).filter(v => EPOST.test(v));
    const til = adr.length ? adr : (adm || []).map((m: any) => String(m.profiles?.epost || '').toLowerCase()).filter(Boolean);
    const H: Hendelse[] = []; const ut = { org: org.navn, hendelser: 0, sendt: 0, uten_mottaker: !til.length };
    for (const l of LT || []) {
      const d = l.data || {}; if (d.slutt && String(d.slutt) < idag) continue;
      const v = d.vakt || {}; const same = v.slutt === (d.slutt || '');
      const ele = { id: l.id, navn: d.navn || '', eid: l.eiendom_id, slutt: d.slutt || '' };
      if (d.slutt) {
        const dg = dagerTil(idag, d.slutt); const tr = trinnDager(c.utlopMnd.map(mndTilDager), dg, same ? v.utlop || [] : []);
        if (tr !== null) H.push({ type: 'utlop', lt: ele, eiendom: eNavn[l.eiendom_id] || '', dato: d.slutt, dager: dg, trinn: tr });
        const so = sisteOppsigDato(d);
        if (so) { const dgo = dagerTil(idag, so); const to = trinnDager(c.oppsigDager, dgo, same ? v.oppsig || [] : []); if (to !== null) H.push({ type: 'oppsig', lt: ele, eiendom: eNavn[l.eiendom_id] || '', dato: so, dager: dgo, trinn: to }); }
      }
      const nr = nesteRegulering(d, idag);
      if (nr) { const dgr = dagerTil(idag, nr); if (dgr <= c.regulerDager && v.regul !== nr) H.push({ type: 'regul', lt: ele, eiendom: eNavn[l.eiendom_id] || '', dato: nr, dager: dgr, trinn: 0 }); }
    }
    ut.hendelser = H.length;
    if (H.length && til.length) {
      const L = await x.sprakFor(null); const { t } = L;
      const navnType = { utlop: t('Avtaleutløp'), oppsig: t('Siste oppsigelsesdato'), regul: t('Indeksregulering') };
      const emne = t('Leieavtaler: {0} frister som nærmer seg', H.length);
      const linje = (h: Hendelse) => `${navnType[h.type]}: ${h.lt.navn}${h.eiendom ? ' (' + h.eiendom + ')' : ''} – ${L.dato(h.dato)} (${h.dager === 0 ? t('i dag') : t('om {0} dager', h.dager)})`;
      const sortert = H.slice().sort((p, q) => p.dato.localeCompare(q.dato));
      const tekst = [emne, '', ...sortert.map(h => '- ' + linje(h)), '', `${t('Åpne leietakeren for utkast til regulering')}: ${base}/#/leietakere`].join('\n');
      const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:760px"><h2>${esc(emne)}</h2><ul>${sortert.map(h => `<li><a href="${base}/#/leietaker/${h.lt.id}">${esc(linje(h))}</a></li>`).join('')}</ul><p style="font-size:12px;color:#6b736d">${esc(t('Indeksreguleringen er bare et utkast. Du godkjenner selv, og leietaker får ingenting automatisk.'))}</p></div>`;
      const o = await x.oppsettFor(null, org.id); let ok = false; for (const m of til) { const s = await x.sendEpost(m, emne, html, tekst, undefined, undefined, o); ok = ok || !!s.sendt; }
      if (ok) {
        ut.sendt = H.length;
        for (const h of H) {
          const { data: fr } = await admin.from('leietakere').select('data').eq('id', h.lt.id).single(); const dd = fr?.data || {}; const v = dd.vakt || {}; const same = v.slutt === (dd.slutt || '');
          const nv: any = { ...v, slutt: dd.slutt || '', utlop: same ? v.utlop || [] : [], oppsig: same ? v.oppsig || [] : [] };
          if (h.type === 'utlop') nv.utlop = Array.from(new Set([...nv.utlop, ...c.utlopMnd.map(mndTilDager).filter(t2 => t2 >= h.trinn)]));
          if (h.type === 'oppsig') nv.oppsig = Array.from(new Set([...nv.oppsig, ...c.oppsigDager.filter(t2 => t2 >= h.trinn)]));
          if (h.type === 'regul') nv.regul = h.dato;
          await admin.from('leietakere').update({ data: { ...dd, vakt: nv } }).eq('id', h.lt.id);
        }
        await admin.from('hendelseslogg').insert({ bruker_id: null, bruker: 'Leieavtale-vakt', tabell: 'hendelse', rad_id: null, eiendom_id: null, org_id: org.id, handling: 'leieavtale', tekst: `Varsel om ${H.length} leieavtale-frister sendt til ${til.join(', ')}` });
      }
    }
    rapport.push(ut);
  }
  return json(200, { ok: true, rapport });
}
