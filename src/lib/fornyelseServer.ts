// Automatisk fornyelse av utløpende dokumenter – serverdelen (kalles fra netlify/functions/arbeidsordre.ts).
// Finner dokumenter med «Gyldig til» som nærmer seg, og ber leietaker, leverandør eller eier om et nytt – én samlet e-post per mottaker.
// Innstillinger: innstillinger.nokkel = 'dokFornyelse' (per organisasjon). Status per dokument: dokumenter.data.fornyelse. Ingen databaseendring.
import type { SupabaseClient } from '@supabase/supabase-js';

export type FornyInnst = { pa: boolean; trinn: number[]; eierEpost: string; leietaker: boolean; leverandor: boolean };
export const FORNY_STD: FornyInnst = { pa: false, trinn: [90, 30, 0], eierEpost: '', leietaker: true, leverandor: true };
const EPOST = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const dagerMellom = (a: string, b: string) => Math.round((new Date(b + 'T00:00:00Z').getTime() - new Date(a + 'T00:00:00Z').getTime()) / 864e5);
/** Portal for eksisterende leietakerbruker, ellers gjenbrukes eller opprettes invitasjon (samme som i leietaker-runden) */
async function finnLenke(admin: SupabaseClient, l: any, til: string, base: string): Promise<string> {
  const { data: fins } = await admin.from('profiles').select('id, rolle, leietaker_id').eq('epost', til).maybeSingle();
  if (fins && fins.rolle === 'leietaker' && fins.leietaker_id === l.id) return `${base}/#/portal`;
  const { data: inv } = await admin.from('lt_invitasjon').select('token').eq('leietaker_id', l.id).eq('epost', til).is('brukt', null).order('opprettet', { ascending: false }).limit(1);
  if (inv?.[0]) return `${base}/#/lt/${inv[0].token}`;
  const { data: ny } = await admin.from('lt_invitasjon').insert({ leietaker_id: l.id, epost: til }).select('token').single();
  return ny ? `${base}/#/lt/${ny.token}` : `${base}/#/portal`;
}

export function renFornyInnst(x: any): FornyInnst {
  const c = { ...FORNY_STD, ...(x || {}) };
  const t = (Array.isArray(c.trinn) ? c.trinn : String(c.trinn || '').split(/[,;\s]+/)).map((n: any) => Math.round(Number(n))).filter((n: number) => Number.isFinite(n) && n >= 0 && n <= 730);
  const trinn = Array.from(new Set<number>(t)).sort((a, b) => b - a).slice(0, 6);
  return { pa: !!c.pa, trinn: trinn.length ? trinn : FORNY_STD.trinn, eierEpost: String(c.eierEpost || '').slice(0, 300), leietaker: c.leietaker !== false, leverandor: c.leverandor !== false };
}

/** Hvilket trinn skal sendes nå? Det laveste trinnet som er nådd og ikke sendt. Dokumenter som er utløpt for mer enn 30 dager siden, tas ikke med. */
export function trinnNa(trinn: number[], dagerTilUtlop: number, sendt: number[]): number | null {
  if (dagerTilUtlop < -30) return null;
  const nadd = trinn.filter(t => dagerTilUtlop <= t); if (!nadd.length) return null;
  const lavest = Math.min(...nadd); return sendt.includes(lavest) ? null : lavest;
}

/** Er dokumentet allerede fornyet? Et annet ikke-arkivert dokument av samme type og med samme tilknytning har senere (eller ingen) utløpsdato. */
export function erFornyet(d: any, alle: any[]): boolean {
  const k = (x: any) => [x.data?.type || '', x.data?.leietakerId || '', x.data?.anleggId || '', x.data?.oppgaveId || ''].join('|');
  return alle.some(o => o.id !== d.id && o.eiendom_id === d.eiendom_id && !o.data?.arkivert && k(o) === k(d) && (!o.data?.gyldigTil || o.data.gyldigTil > d.data.gyldigTil));
}

type Ctx = {
  admin: SupabaseClient; body: any; json: (s: number, b: any) => Response; esc: (s: any) => string; erCron: boolean;
  hvem: () => Promise<any>; sendEpost: (til: string, emne: string, html: string, tekst: string, v?: any, svarTil?: string, o?: any) => Promise<any>;
  oppsettFor: (eid: string | null | undefined, org?: string | null) => Promise<any>;
  sprakFor: (eid?: string | null, overstyr?: string) => Promise<{ t: (s: any, ...a: any[]) => string; dato: (d: string) => string }>;
};
type Rad = { doc: any; trinn: number; dg: number; eiendom: string; navn: string };

export async function dokumentFornyelse(x: Ctx): Promise<Response | null> {
  const { admin, body, json, esc } = x; const a = body.action;
  if (a !== 'dok_fornyelse' && a !== 'dok_fornyelse_na') return null;
  const na = a === 'dok_fornyelse_na'; let naOrg = '';
  if (na) {
    const p = await x.hvem(); if (!p) return json(401, { error: 'Ikke innlogget' }); naOrg = String(body.org || '');
    const { data: mm } = await admin.from('org_medlem').select('rolle').eq('org_id', naOrg).eq('user_id', p.id).eq('aktiv', true).maybeSingle();
    if (!mm || !['admin', 'forvalter'].includes(mm.rolle)) return json(403, { error: 'Bare administrator eller forvalter kan kjøre dette' });
  } else if (!x.erCron) return json(403, { error: 'Ikke tillatt' });
  const base = (process.env.URL || '').replace(/\/+$/, ''); const idag = iso(new Date()); const rapport: any[] = [];
  const { data: innst0 } = await admin.from('innstillinger').select('org_id, data').eq('nokkel', 'dokFornyelse');
  const innst = na ? (innst0 || []).filter((r: any) => r.org_id === naOrg).concat((innst0 || []).some((r: any) => r.org_id === naOrg) ? [] : [{ org_id: naOrg, data: {} }]) : (innst0 || []);
  for (const r0 of innst) {
    const c = renFornyInnst(r0.data); if (!c.pa && !na) continue;
    const { data: org } = await admin.from('organisasjoner').select('id, navn, aktiv').eq('id', r0.org_id).maybeSingle(); if (!org?.aktiv) continue;
    const { data: E } = await admin.from('eiendommer').select('id, data').eq('eier_org_id', org.id); const eids = (E || []).map((e: any) => e.id); if (!eids.length) continue;
    const eNavn: Record<string, string> = Object.fromEntries((E || []).map((e: any) => [e.id, e.data?.navn || e.data?.adresse || '']));
    const [{ data: D }, { data: LT }, { data: OP }, { data: SY }, { data: adm }] = await Promise.all([
      admin.from('dokumenter').select('id, eiendom_id, data').in('eiendom_id', eids), admin.from('leietakere').select('id, eiendom_id, data').in('eiendom_id', eids),
      admin.from('oppgaver').select('id, data').in('eiendom_id', eids), admin.from('systemer').select('id, data').in('eiendom_id', eids),
      admin.from('org_medlem').select('profiles(epost)').eq('org_id', org.id).eq('rolle', 'admin').eq('aktiv', true)]);
    const ltById = new Map((LT || []).map((l: any) => [l.id, l])); const opById = new Map((OP || []).map((o: any) => [o.id, o])); const syById = new Map((SY || []).map((s: any) => [s.id, s]));
    const eierAdr = String(c.eierEpost || '').split(/[,;\s]+/).map(v => v.trim().toLowerCase()).filter(v => EPOST.test(v));
    const eierTil = eierAdr.length ? eierAdr : (adm || []).map((m: any) => String(m.profiles?.epost || '').toLowerCase()).filter(Boolean);
    // Samle per mottaker
    const grupper = new Map<string, { til: string; type: 'leietaker' | 'leverandor' | 'eier'; lt?: any; rader: Rad[] }>();
    const legg = (til: string, type: 'leietaker' | 'leverandor' | 'eier', rad: Rad, lt?: any) => { const k = type + '|' + til; if (!grupper.has(k)) grupper.set(k, { til, type, lt, rader: [] }); grupper.get(k)!.rader.push(rad); };
    let sjekket = 0;
    for (const d of D || []) {
      const g = d.data || {}; if (!g.gyldigTil || g.arkivert) continue; sjekket++;
      const dg = dagerMellom(idag, g.gyldigTil); const tr = trinnNa(c.trinn, dg, g.fornyelse?.sendt || []); if (tr === null) continue;
      if (erFornyet(d, D || [])) continue;
      const rad: Rad = { doc: d, trinn: tr, dg, eiendom: eNavn[d.eiendom_id] || '', navn: g.tittel || g.type || 'Dokument' };
      const lt = g.leietakerId ? ltById.get(g.leietakerId) : null; const ltEp = String(lt?.data?.epost || '').trim().toLowerCase();
      const levEp = String(opById.get(g.oppgaveId)?.data?.ao?.epost || syById.get(g.anleggId)?.data?.leverandorEpost || '').trim().toLowerCase();
      if (lt && c.leietaker && EPOST.test(ltEp) && !(lt.data?.slutt && String(lt.data.slutt) < idag)) legg(ltEp, 'leietaker', rad, lt);
      else if (!lt && c.leverandor && EPOST.test(levEp)) legg(levEp, 'leverandor', rad);
      else for (const e of eierTil) legg(e, 'eier', rad);
    }
    const ut = { org: org.navn, sjekket, mottakere: 0, dokumenter: 0, holdt: 0 };
    for (const gr of grupper.values()) {
      const eid = gr.rader[0].doc.eiendom_id; const L = await x.sprakFor(eid); const { t } = L;
      const lenke = gr.type === 'leietaker' ? await finnLenke(admin, gr.lt, gr.til, base) : '';
      const emne = gr.rader.length === 1 ? t('Dokumentet «{0}» må fornyes', gr.rader[0].navn).slice(0, 170) : t('{0} dokumenter må fornyes', gr.rader.length);
      const linje = (r: Rad) => `${r.navn}${r.eiendom ? ' (' + r.eiendom + ')' : ''} – ${r.dg < 0 ? t('utløpt {0}', L.dato(r.doc.data.gyldigTil)) : r.dg === 0 ? t('utløper i dag') : t('utløper {0} (om {1} dager)', L.dato(r.doc.data.gyldigTil), r.dg)}`;
      const inn = gr.type === 'eier' ? t('Disse dokumentene utløper snart, og vi har ingen annen mottaker for fornyelsen.') : gr.type === 'leietaker' ? t('Vi ber om at dere sender oss nytt dokument for punktene under, slik at dokumentasjonen for lokalene holdes gyldig.') : t('Vi ber om at dere sender oss nytt dokument for punktene under, slik at dokumentasjonen for anlegget holdes gyldig.');
      const slutt = gr.type === 'leietaker' && lenke ? `${t('Logg inn og last opp her')}:\n${lenke}` : gr.type === 'leverandor' ? t('Svar på denne e-posten og legg ved det nye dokumentet.') : '';
      const tekst = [t('Hei,'), '', inn, '', ...gr.rader.map(r => '- ' + linje(r)), '', slutt, '', t('Dette er en automatisk melding fra utleier.')].join('\n');
      const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#1d2320"><h2 style="margin:0 0 10px">${esc(emne)}</h2><p>${esc(inn)}</p><ul>${gr.rader.map(r => `<li>${esc(linje(r))}</li>`).join('')}</ul>${gr.type === 'leietaker' && lenke ? `<p style="margin:20px 0"><a href="${esc(lenke)}" style="background:#1f6f5c;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">${esc(t('Åpne portalen'))}</a></p>` : gr.type === 'leverandor' ? `<p>${esc(slutt)}</p>` : `<p><a href="${base}/#/dokumenter">${esc(t('Åpne dokumentene'))}</a></p>`}<p style="font-size:12px;color:#6b736d">${esc(t('Dette er en automatisk melding fra utleier.'))}</p></div>`;
      const s = await x.sendEpost(gr.til, emne, html, tekst, undefined, eierTil[0], await x.oppsettFor(eid, org.id));
      if (!s.sendt) { ut.holdt++; continue; }
      ut.mottakere++;
      for (const r of gr.rader) {
        const { data: fr } = await admin.from('dokumenter').select('data').eq('id', r.doc.id).single(); const f = fr?.data?.fornyelse || {};
        const sendt = Array.from(new Set([...(f.sendt || []), ...c.trinn.filter(t2 => t2 >= r.trinn)]));
        await admin.from('dokumenter').update({ data: { ...(fr?.data || {}), fornyelse: { sendt, sist: new Date().toISOString(), til: gr.til } } }).eq('id', r.doc.id); ut.dokumenter++;
      }
      await admin.from('hendelseslogg').insert({ bruker_id: null, bruker: 'Fornyelse av dokumenter', tabell: 'hendelse', rad_id: null, eiendom_id: eid, org_id: org.id, handling: 'dokument', tekst: `Fornyelse: ${gr.rader.length} dokument(er) meldt til ${gr.til} (${gr.type}): ${gr.rader.map(r => r.navn).join(', ').slice(0, 300)}` });
    }
    rapport.push(ut);
  }
  return json(200, { ok: true, rapport });
}
