// Brannopplæring på autopilot – serverdelen (kalles fra netlify/functions/arbeidsordre.ts, daglig kl. 06 UTC).
// 1) Purrer brannvernledere og ansatte som ikke har gjennomført, 2) starter årlig repetisjon med nye personlige lenker,
// 3) gir eier én samlet e-post med prosent (aldri navn eller e-post til ansatte) når purringene er brukt opp og for få har gjennomført.
// Innstillinger: innstillinger.nokkel = 'oplAuto' (per organisasjon). Ingen databaseendring.
import type { SupabaseClient } from '@supabase/supabase-js';

export type OplAutoInnst = { pa: boolean; purrEtter: number; purrGjenta: number; purrMaks: number; aarlig: boolean; aarligMnd: number; terskel: number; eierEpost: string };
export const OPLAUTO_STD: OplAutoInnst = { pa: false, purrEtter: 5, purrGjenta: 5, purrMaks: 3, aarlig: true, aarligMnd: 12, terskel: 50, eierEpost: '' };
const EPOST = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
const MAKS_PER_KJORING = 200, MAKS_ANSATTE = 300;
const num = (v: any, min: number, max: number, std: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : std; };

export function renOplAuto(x: any): OplAutoInnst {
  const c = { ...OPLAUTO_STD, ...(x || {}) };
  return { pa: !!c.pa, purrEtter: num(c.purrEtter, 1, 60, 5), purrGjenta: num(c.purrGjenta, 1, 60, 5), purrMaks: num(c.purrMaks, 0, 10, 3), aarlig: c.aarlig !== false, aarligMnd: num(c.aarligMnd, 6, 36, 12), terskel: num(c.terskel, 0, 100, 50), eierEpost: String(c.eierEpost || '').slice(0, 300) };
}
export const dagerSiden = (iso: string, na: number) => (na - new Date(iso).getTime()) / 864e5;
/** Skal denne deltakeren purres nå? (ikke ferdig, sendt, og ventetiden er gått) */
export function skalPurres(c: OplAutoInnst, d: { fullfort_tid?: string | null; sendt_tid?: string | null; purret_tid?: string | null; purret_ant?: number | null }, na: number): boolean {
  if (d.fullfort_tid || !d.sendt_tid) return false; const ant = d.purret_ant || 0; if (ant >= c.purrMaks) return false;
  return ant === 0 ? dagerSiden(d.sendt_tid, na) >= c.purrEtter - 0.1 : dagerSiden(d.purret_tid || d.sendt_tid, na) >= c.purrGjenta - 0.1;
}
/** Er det tid for årlig repetisjon? Lederen har gjennomført for mer enn N måneder siden. */
export function trengerRepetisjon(c: OplAutoInnst, lederFullfort: string | null | undefined, na: number): boolean {
  if (!c.aarlig || !lederFullfort) return false; return dagerSiden(lederFullfort, na) >= c.aarligMnd * 30.44;
}
/** Prosent som har gjennomført, og om alle som mangler har brukt opp purringene */
export function status(c: OplAutoInnst, deltakere: { fullfort_tid?: string | null; sendt_tid?: string | null; purret_tid?: string | null; purret_ant?: number | null }[], na: number) {
  const n = deltakere.length, f = deltakere.filter(d => d.fullfort_tid).length; const igjen = deltakere.filter(d => !d.fullfort_tid);
  return { invitert: n, fullfort: f, prosent: n ? Math.round((f / n) * 100) : 0, ferdigPurret: igjen.length > 0 && igjen.every(d => !!d.sendt_tid && (d.purret_ant || 0) >= c.purrMaks && dagerSiden((d.purret_tid || d.sendt_tid)!, na) >= c.purrGjenta - 0.1) };
}

type Ctx = {
  admin: SupabaseClient; body: any; json: (s: number, b: any) => Response; esc: (s: any) => string; erCron: boolean; hvem: () => Promise<any>;
  sendEpost: (til: string, emne: string, html: string, tekst: string, v?: any, svarTil?: string, o?: any) => Promise<any>;
  oppsettFor: (eid: string | null | undefined, org?: string | null) => Promise<any>;
  sprakFor: (eid?: string | null, overstyr?: string) => Promise<{ t: (s: any, ...a: any[]) => string }>;
};

export async function brannAuto(x: Ctx): Promise<Response | null> {
  const { admin, body, json, esc } = x; const a = body.action;
  if (a !== 'brannauto' && a !== 'brannauto_na') return null;
  const na = a === 'brannauto_na'; let naOrg = '';
  if (na) {
    const p = await x.hvem(); if (!p) return json(401, { error: 'Ikke innlogget' }); naOrg = String(body.org || '');
    const { data: mm } = await admin.from('org_medlem').select('rolle').eq('org_id', naOrg).eq('user_id', p.id).eq('aktiv', true).maybeSingle();
    if (!mm || !['admin', 'forvalter'].includes(mm.rolle)) return json(403, { error: 'Bare administrator eller forvalter kan kjøre dette' });
  } else if (!x.erCron) return json(403, { error: 'Ikke tillatt' });
  const nyttToken = () => Array.from(crypto.getRandomValues(new Uint8Array(24))).map(b => b.toString(16).padStart(2, '0')).join('');
  const base = (process.env.URL || '').replace(/\/+$/, ''); const lenke = (tok: string) => `${base}/#/op/${tok}`; const nu = Date.now(); const rapport: any[] = [];
  const { data: innst0 } = await admin.from('innstillinger').select('org_id, data').eq('nokkel', 'oplAuto');
  const innst = na ? (innst0 || []).filter((r: any) => r.org_id === naOrg).concat((innst0 || []).some((r: any) => r.org_id === naOrg) ? [] : [{ org_id: naOrg, data: {} }]) : (innst0 || []);
  for (const r0 of innst) {
    const c = renOplAuto(r0.data); if (!c.pa && !na) continue;
    const { data: org } = await admin.from('organisasjoner').select('id, navn, aktiv').eq('id', r0.org_id).maybeSingle(); if (!org?.aktiv) continue;
    const { data: E } = await admin.from('eiendommer').select('id, data').eq('eier_org_id', org.id); const eids = (E || []).map((e: any) => e.id); if (!eids.length) continue;
    const eNavn: Record<string, string> = Object.fromEntries((E || []).map((e: any) => [e.id, e.data?.navn || e.data?.adresse || '']));
    const [{ data: K }, { data: D }, { data: LT }] = await Promise.all([admin.from('opplaering_kurs').select('*').in('eiendom_id', eids).order('created_at', { ascending: false }),
      admin.from('opplaering_deltakere').select('*').in('eiendom_id', eids), admin.from('leietakere').select('id, data').in('eiendom_id', eids)]);
    const lt = new Map((LT || []).map((l: any) => [l.id, l.data || {}])); const siste = new Map<string, any>(); (K || []).forEach((k: any) => { if (!siste.has(k.leietaker_id)) siste.set(k.leietaker_id, k); });
    const ut = { org: org.navn, purret: 0, repetert: 0, eskalert: 0, holdt: 0 }; let brukt = 0; const eskListe: { lt: string; eiendom: string; prosent: number; invitert: number; fullfort: number }[] = [];
    const mail = async (d: any, kurs: any, type: 'inviter' | 'repeter' | 'purr') => {
      const L = await x.sprakFor(d.eiendom_id); const { t } = L; const ltn = lt.get(d.leietaker_id)?.navn || ''; const en = eNavn[d.eiendom_id] || ''; const l = lenke(d.token);
      const emne = type === 'purr' ? t('Påminnelse: brannvernopplæring i {0}', en) : type === 'repeter' ? t('Årlig repetisjon: brannvernopplæring i {0}', en) : t('Brannvernopplæring i {0}', en);
      const avs = type === 'purr' ? [t('Hei {0},', d.navn), t('Vi minner om at du ikke har gjennomført brannvernopplæringen for {0} ennå. Det tar omtrent 10 minutter.', ltn || en)]
        : [t('Hei {0},', d.navn), type === 'repeter' ? t('Det er på tide med den årlige repetisjonen av brannvernopplæringen for {0}. Det tar omtrent 10 minutter og har noen enkle spørsmål underveis.', ltn || en) : t('Du er bedt om å gjennomgå en kort opplæring i brannsikkerheten i {0}. Det tar omtrent 10 minutter.', en)];
      const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:600px;color:#1d2521"><h2 style="margin:0 0 10px">${esc(emne)}</h2>${avs.map(v => `<p>${esc(v)}</p>`).join('')}<p style="margin:20px 0"><a href="${esc(l)}" style="background:#1f6f5c;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">${esc(t('Start opplæringen'))}</a></p><p style="font-size:12px;color:#6b736d">${esc(t('Lenken er personlig. Du trenger ikke bruker i appen.'))}</p></div>`;
      const tekst = `${avs.join('\n\n')}\n\n${t('Start opplæringen')}: ${l}`;
      return x.sendEpost(d.epost, emne, html, tekst, undefined, undefined, await x.oppsettFor(d.eiendom_id, org.id)).catch((e: any) => ({ sendt: false, grunn: String(e?.message || e) }));
    };
    for (const [ltId, kurs] of siste) {
      const ldata = lt.get(ltId); if (!ldata || (ldata.slutt && String(ldata.slutt) < new Date(nu).toISOString().slice(0, 10))) continue;
      const mine: any[] = (D || []).filter((d: any) => d.kurs_id === kurs.id); const leder = mine.find((d: any) => d.rolle === 'leder');
      // a) Invitasjoner som ikke ble sendt (f.eks. e-post var holdt tilbake), og purring
      for (const d of mine) {
        if (brukt >= MAKS_PER_KJORING) break;
        if (!d.sendt_tid && EPOST.test(d.epost)) { brukt++; const r = await mail(d, kurs, 'inviter'); if (r.sendt) await admin.from('opplaering_deltakere').update({ sendt_tid: new Date().toISOString() }).eq('id', d.id); else ut.holdt++; continue; }
        if (skalPurres(c, d, nu) && EPOST.test(d.epost)) { brukt++; const r = await mail(d, kurs, 'purr'); if (r.sendt) { const ant = (d.purret_ant || 0) + 1; const tid = new Date().toISOString(); await admin.from('opplaering_deltakere').update({ purret_tid: tid, purret_ant: ant }).eq('id', d.id); d.purret_ant = ant; d.purret_tid = tid; ut.purret++; } else ut.holdt++; }
      }
      // b) Årlig repetisjon: ny runde til leder og tidligere ansatte
      if (leder && trengerRepetisjon(c, leder.fullfort_tid, nu) && EPOST.test(leder.epost) && mine.length <= MAKS_ANSATTE) {
        const { data: nk, error } = await admin.from('opplaering_kurs').insert({ eiendom_id: kurs.eiendom_id, leietaker_id: kurs.leietaker_id, versjon: kurs.versjon, innhold: kurs.innhold }).select().single();
        if (!error && nk) {
          const mk = (p: any, rolle: string, invitertAv: string | null) => ({ kurs_id: nk.id, eiendom_id: p.eiendom_id, leietaker_id: p.leietaker_id, token: nyttToken(), rolle, navn: p.navn, epost: p.epost, invitert_av: invitertAv });
          const { data: nl } = await admin.from('opplaering_deltakere').insert(mk(leder, 'leder', null)).select().single();
          if (nl) {
            const ansatte = mine.filter((d: any) => d.rolle === 'ansatt' && EPOST.test(d.epost)); const nyeD: any[] = [nl];
            for (const p of ansatte) { const { data: na2 } = await admin.from('opplaering_deltakere').insert(mk(p, 'ansatt', nl.id)).select().single(); if (na2) nyeD.push(na2); }
            for (const d of nyeD) { const r = await mail(d, nk, 'repeter'); if (r.sendt) await admin.from('opplaering_deltakere').update({ sendt_tid: new Date().toISOString() }).eq('id', d.id); else ut.holdt++; }
            ut.repetert++;
            await admin.from('hendelseslogg').insert({ bruker_id: null, bruker: 'Brannopplæring', tabell: 'hendelse', rad_id: kurs.leietaker_id, eiendom_id: kurs.eiendom_id, org_id: org.id, handling: 'brannopplaering', tekst: `Årlig repetisjon startet for ${ldata.navn || ''}: ${nyeD.length} personer` });
            continue;
          }
        }
      }
      // c) Eskalering til eier: purringene er brukt opp, og for få har gjennomført
      const st = status(c, mine, nu);
      if (st.ferdigPurret && st.prosent < c.terskel && !kurs.innhold?._eskalert) {
        eskListe.push({ lt: ldata.navn || '', eiendom: eNavn[kurs.eiendom_id] || '', prosent: st.prosent, invitert: st.invitert, fullfort: st.fullfort });
        await admin.from('opplaering_kurs').update({ innhold: { ...(kurs.innhold || {}), _eskalert: new Date().toISOString() } }).eq('id', kurs.id); ut.eskalert++;
      }
    }
    if (eskListe.length) {
      const adr = String(c.eierEpost || '').split(/[,;\s]+/).map(v => v.trim().toLowerCase()).filter(v => EPOST.test(v));
      const til = adr.length ? adr : ((await admin.from('org_medlem').select('profiles(epost)').eq('org_id', org.id).eq('rolle', 'admin').eq('aktiv', true)).data || []).map((m: any) => m.profiles?.epost).filter(Boolean);
      const { t } = await x.sprakFor(null); const emne = t('Brannopplæring: {0} leietakere har lav gjennomføring etter purring', eskListe.length);
      const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:640px"><h2>${esc(emne)}</h2><ul>${eskListe.map(e => `<li>${esc(e.lt)} (${esc(e.eiendom)}): ${e.prosent} % (${e.fullfort} av ${e.invitert})</li>`).join('')}</ul></div>`;
      const tekst = [emne, '', ...eskListe.map(e => `- ${e.lt} (${e.eiendom}): ${e.prosent} % (${e.fullfort} av ${e.invitert})`)].join('\n'); const o = await x.oppsettFor(null, org.id);
      for (const m of til) await x.sendEpost(m, emne, html, tekst, undefined, undefined, o);
    }
    rapport.push(ut);
  }
  return json(200, { ok: true, rapport });
}
