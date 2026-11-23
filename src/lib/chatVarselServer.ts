// Chat-varsler – serverdelen (kalles fra netlify/functions/arbeidsordre.ts).
// 1) 'chat_varsel': klienten melder fra rett etter at en melding er sendt. Leietakers melding gir push (og evt. e-post) til ansatte,
//    utleiers melding gir e-post til leietaker, «utleier og ressurser» gir push til de som er koblet på. Interne notater varsler ingen.
//    Maks ett varsel per samtale per 30 minutter, så en lang samtale ikke gir en strøm av varsler.
// 2) 'chat_varsel_dag' (daglig): én samlet påminnelse om leietakermeldinger uten svar etter N dager, én gang per melding.
// Innstillinger: innstillinger.nokkel = 'chatVarsel' (per organisasjon). Ingen databaseendring; tilstand ligger i meldinger.data (varslet, paminnet).
import type { SupabaseClient } from '@supabase/supabase-js';

export type ChatInnst = { pa: boolean; tilLeietaker: boolean; tilAnsatte: boolean; ansatteEpost: string; ubesvartDager: number; paminnelse: boolean };
export const CHAT_STD: ChatInnst = { pa: false, tilLeietaker: true, tilAnsatte: true, ansatteEpost: '', ubesvartDager: 2, paminnelse: true };
const EPOST = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
export const PAUSE_MIN = 30, VINDU_MIN = 10, MAKS_ALDER_DAGER = 30;
const num = (v: any, min: number, max: number, std: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : std; };

export function renChatInnst(x: any): ChatInnst {
  const c = { ...CHAT_STD, ...(x || {}) };
  return { pa: !!c.pa, tilLeietaker: c.tilLeietaker !== false, tilAnsatte: c.tilAnsatte !== false, ansatteEpost: String(c.ansatteEpost || '').slice(0, 300), ubesvartDager: num(c.ubesvartDager, 1, 14, 2), paminnelse: c.paminnelse !== false };
}
export const epostListe = (s: string) => String(s || '').split(/[,;\s]+/).map(v => v.trim().toLowerCase()).filter(v => EPOST.test(v));

type Mld = { id: string; eiendom_id: string; leietaker_id: string; avvik_id?: string | null; created_at: string; data: any };
const min = (iso: string, na: number) => (na - new Date(iso).getTime()) / 6e4;

/** Hvem skal varsles om de nye, ikke-varslede meldingene i en samtale? */
export function velgVarsler(meldinger: Mld[], na: number): { nye: Mld[]; dempet: boolean; tilAnsatte: Mld[]; tilLeietaker: Mld[]; tilRessurs: Mld[] } {
  const nye = meldinger.filter(m => !m.data?.varslet && min(m.created_at, na) <= VINDU_MIN);
  const sist = Math.max(0, ...meldinger.filter(m => m.data?.varslet && m.data.varslet !== 'dempet' && m.data.varslet !== 'av').map(m => new Date(m.data.varslet).getTime() || 0));
  const dempet = sist > 0 && (na - sist) / 6e4 < PAUSE_MIN;
  const synlig = (m: Mld) => m.data?.til !== 'intern';
  return { nye, dempet,
    tilAnsatte: nye.filter(m => m.data?.rolle === 'leietaker'),
    tilLeietaker: nye.filter(m => m.data?.rolle !== 'leietaker' && (m.data?.til === 'alle' || (m.data?.til === undefined && m.data?.synlig))),
    tilRessurs: nye.filter(m => m.data?.rolle !== 'ressurs' && m.data?.til === 'ressurs' && synlig(m)) };
}

/** Leietakermeldinger som har ventet minst N dager uten svar, ikke påminnet før */
export function ubesvarte(meldinger: Mld[], na: number, dager: number): Mld[] {
  const svar = (m: Mld) => meldinger.some(s => s.leietaker_id === m.leietaker_id && (s.avvik_id || null) === (m.avvik_id || null) && s.data?.rolle !== 'leietaker' && s.data?.til !== 'intern' && s.created_at > m.created_at);
  return meldinger.filter(m => m.data?.rolle === 'leietaker' && !m.data?.paminnet && (na - new Date(m.created_at).getTime()) / 864e5 >= dager - 0.05 && (na - new Date(m.created_at).getTime()) / 864e5 <= MAKS_ALDER_DAGER && !svar(m));
}

type Ctx = {
  admin: SupabaseClient; body: any; json: (s: number, b: any) => Response; esc: (s: any) => string; erCron: boolean; hvem: () => Promise<any>;
  harEiendom: (p: any, eid: string) => Promise<boolean>;
  sendEpost: (til: string, emne: string, html: string, tekst: string, v?: any, svarTil?: string, o?: any) => Promise<any>;
  oppsettFor: (eid: string | null | undefined, org?: string | null) => Promise<any>;
  sprakFor: (eid?: string | null, overstyr?: string) => Promise<{ t: (s: any, ...a: any[]) => string }>;
  pushTilOrg: (admin: any, orgId: string, typer: string[], inn: { tittel: string; tekst: string; url?: string; tag?: string }, roller?: string[], eiendomId?: string) => Promise<number>;
  pushTilBrukere: (admin: any, ids: string[], typer: string[], inn: { tittel: string; tekst: string; url?: string; tag?: string }) => Promise<number>;
};

const brev = (esc: (s: any) => string, tittel: string, linjer: string[], lenke: string, knapp: string) =>
  `<div style="font-family:system-ui,Arial,sans-serif;max-width:600px;color:#1d2521"><h2 style="margin:0 0 10px">${esc(tittel)}</h2>${linjer.map(l => `<p>${esc(l)}</p>`).join('')}<p style="margin:20px 0"><a href="${esc(lenke)}" style="background:#1f6f5c;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">${esc(knapp)}</a></p></div>`;

async function ansatteEpost(admin: SupabaseClient, orgId: string, c: ChatInnst): Promise<string[]> {
  const egne = epostListe(c.ansatteEpost); if (egne.length) return egne;
  const { data } = await admin.from('org_medlem').select('profiles(epost)').eq('org_id', orgId).eq('rolle', 'admin').eq('aktiv', true);
  return (data || []).map((m: any) => String(m.profiles?.epost || '').toLowerCase()).filter((e: string) => EPOST.test(e));
}

export async function chatVarsel(x: Ctx): Promise<Response | null> {
  const { admin, body, json, esc } = x; const a = body.action;
  if (a !== 'chat_varsel' && a !== 'chat_varsel_dag' && a !== 'chat_varsel_na') return null;
  const base = (process.env.URL || '').replace(/\/+$/, ''); const nu = Date.now();

  // ---- 1) Rett etter at en melding er sendt
  if (a === 'chat_varsel') {
    const p = await x.hvem(); if (!p || !p.aktiv) return json(401, { error: 'Ikke innlogget' });
    const eid = String(body.eiendom_id || ''), lid = String(body.leietaker_id || ''); if (!eid || !lid) return json(400, { error: 'Mangler eiendom eller leietaker' });
    if (p.rolle === 'leietaker') { if (p.leietaker_id !== lid) return json(403, { error: 'Ikke tillatt' }); } else if (!(await x.harEiendom(p, eid))) {
      const { data: d } = await admin.from('meldingsdeltakere').select('id').eq('bruker_id', p.id).eq('eiendom_id', eid).eq('leietaker_id', lid).limit(1); if (!d?.length) return json(403, { error: 'Ikke tillatt' });
    }
    const { data: e } = await admin.from('eiendommer').select('eier_org_id, data').eq('id', eid).maybeSingle(); if (!e?.eier_org_id) return json(200, { sendt: 0 });
    const { data: ir } = await admin.from('innstillinger').select('data').eq('org_id', e.eier_org_id).eq('nokkel', 'chatVarsel').maybeSingle(); const c = renChatInnst(ir?.data);
    const { data: M } = await admin.from('meldinger').select('id, eiendom_id, leietaker_id, avvik_id, created_at, data').eq('eiendom_id', eid).eq('leietaker_id', lid).gte('created_at', new Date(nu - 24 * 36e5).toISOString()).order('created_at', { ascending: true }).limit(200);
    const v = velgVarsler((M || []) as Mld[], nu); if (!v.nye.length) return json(200, { sendt: 0 });
    const tid = new Date().toISOString(); const merk = async (verdi: string) => { for (const m of v.nye) await admin.from('meldinger').update({ data: { ...m.data, varslet: verdi } }).eq('id', m.id); };
    if (!c.pa) { await merk('av'); return json(200, { sendt: 0 }); }
    if (v.dempet) { await merk('dempet'); return json(200, { sendt: 0, dempet: true }); }
    const { data: l } = await admin.from('leietakere').select('id, data').eq('id', lid).maybeSingle(); const ltn = l?.data?.navn || ''; const en = e.data?.navn || e.data?.adresse || '';
    let push = 0, epost = 0;
    if (v.tilAnsatte.length && c.tilAnsatte) {
      push += await x.pushTilOrg(admin, e.eier_org_id, ['melding'], { tittel: `Ny melding fra ${ltn || 'leietaker'}`.slice(0, 80), tekst: [en, v.tilAnsatte.length > 1 ? `${v.tilAnsatte.length} nye meldinger` : 'Ny melding i chatten'].filter(Boolean).join(' · '), url: base ? base + '/#/meldinger' : '/', tag: 'chat-' + lid }, ['admin', 'forvalter', 'gardeier'], eid).catch(() => 0);
      const til = await ansatteEpost(admin, e.eier_org_id, c); const L = await x.sprakFor(eid); const { t } = L; const emne = t('Ny melding fra {0}', ltn || t('leietaker'));
      for (const m of til) { const s = await x.sendEpost(m, emne, brev(esc, emne, [en, t('Du har fått en ny melding i chatten. Logg inn for å lese og svare.')].filter(Boolean), base + '/#/meldinger', t('Åpne meldinger')), `${emne}\n${en}\n${base}/#/meldinger`, undefined, undefined, await x.oppsettFor(eid, e.eier_org_id)).catch(() => ({ sendt: false })); if (s?.sendt) epost++; }
    }
    if (v.tilLeietaker.length && c.tilLeietaker) {
      const til = new Set<string>(); if (EPOST.test(String(l?.data?.epost || '').toLowerCase())) til.add(String(l!.data.epost).toLowerCase());
      const { data: pr } = await admin.from('profiles').select('epost').eq('leietaker_id', lid).eq('rolle', 'leietaker').eq('aktiv', true); (pr || []).forEach((q: any) => { if (EPOST.test(String(q.epost || ''))) til.add(String(q.epost).toLowerCase()); });
      const L = await x.sprakFor(eid); const { t } = L; const emne = t('Ny melding fra utleier: {0}', en || ''); const lenke = base + '/#/portal';
      for (const m of til) { const s = await x.sendEpost(m, emne, brev(esc, emne, [t('Du har fått en ny melding i leietakerportalen. Logg inn for å lese og svare.')], lenke, t('Åpne portalen')), `${emne}\n${lenke}`, undefined, undefined, await x.oppsettFor(eid, e.eier_org_id)).catch(() => ({ sendt: false })); if (s?.sendt) epost++; }
    }
    if (v.tilRessurs.length) {
      const { data: D } = await admin.from('meldingsdeltakere').select('bruker_id').eq('eiendom_id', eid).eq('leietaker_id', lid); const ider = [...new Set((D || []).map((d: any) => d.bruker_id).filter((i: string) => i && i !== p.id))];
      if (ider.length) push += await x.pushTilBrukere(admin, ider as string[], ['melding'], { tittel: `Ny melding: ${ltn || en}`.slice(0, 80), tekst: en || 'Ny melding i chatten', url: base ? base + '/#/meldinger' : '/', tag: 'chat-' + lid }).catch(() => 0);
    }
    await merk(tid);
    return json(200, { sendt: push + epost, push, epost });
  }

  // ---- 2) Daglig påminnelse om ubesvarte leietakermeldinger (cron, eller «Kjør nå» fra innstillinger)
  const na = a === 'chat_varsel_na'; let naOrg = '';
  if (na) {
    const p = await x.hvem(); if (!p) return json(401, { error: 'Ikke innlogget' }); naOrg = String(body.org || '');
    const { data: mm } = await admin.from('org_medlem').select('rolle').eq('org_id', naOrg).eq('user_id', p.id).eq('aktiv', true).maybeSingle();
    if (!mm || !['admin', 'forvalter'].includes(mm.rolle)) return json(403, { error: 'Bare administrator eller forvalter kan kjøre dette' });
  } else if (!x.erCron) return json(403, { error: 'Ikke tillatt' });
  const { data: innst0 } = await admin.from('innstillinger').select('org_id, data').eq('nokkel', 'chatVarsel');
  const liste = na ? [{ org_id: naOrg, data: (innst0 || []).find((r: any) => r.org_id === naOrg)?.data || {} }] : (innst0 || []);
  const rapport: any[] = [];
  for (const r0 of liste) {
    const c = renChatInnst(r0.data); if ((!c.pa && !na) || !c.paminnelse) continue;
    const { data: org } = await admin.from('organisasjoner').select('id, navn, aktiv').eq('id', r0.org_id).maybeSingle(); if (!org?.aktiv) continue;
    const { data: E } = await admin.from('eiendommer').select('id, data').eq('eier_org_id', org.id); const eids = (E || []).map((e: any) => e.id); if (!eids.length) continue;
    const eNavn: Record<string, string> = Object.fromEntries((E || []).map((e: any) => [e.id, e.data?.navn || e.data?.adresse || '']));
    const { data: M } = await admin.from('meldinger').select('id, eiendom_id, leietaker_id, avvik_id, created_at, data').in('eiendom_id', eids).gte('created_at', new Date(nu - (MAKS_ALDER_DAGER + 1) * 864e5).toISOString()).order('created_at', { ascending: true }).limit(3000);
    const uten = ubesvarte((M || []) as Mld[], nu, c.ubesvartDager); if (!uten.length) { rapport.push({ org: org.navn, ubesvarte: 0 }); continue; }
    const { data: LT } = await admin.from('leietakere').select('id, data').in('id', [...new Set(uten.map(m => m.leietaker_id))]); const ltn = new Map((LT || []).map((l: any) => [l.id, l.data?.navn || '']));
    const per = new Map<string, number>(); uten.forEach(m => per.set(m.leietaker_id, (per.get(m.leietaker_id) || 0) + 1));
    const linjer = [...per].slice(0, 15).map(([id, n]) => `${ltn.get(id) || 'Leietaker'} (${eNavn[uten.find(m => m.leietaker_id === id)!.eiendom_id] || ''}): ${n}`);
    const tittel = uten.length === 1 ? '1 leietakermelding har ikke fått svar' : `${uten.length} leietakermeldinger har ikke fått svar`;
    let push = 0, epost = 0;
    if (c.tilAnsatte) push = await x.pushTilOrg(admin, org.id, ['melding'], { tittel, tekst: `Ventet i over ${c.ubesvartDager} ${c.ubesvartDager === 1 ? 'dag' : 'dager'}`, url: base ? base + '/#/meldinger' : '/', tag: 'chat-ubesvart' }, ['admin', 'forvalter']).catch(() => 0);
    const L = await x.sprakFor(null); const { t } = L;
    for (const m of await ansatteEpost(admin, org.id, c)) { const s = await x.sendEpost(m, tittel, brev(esc, tittel, linjer, base + '/#/meldinger', t('Åpne meldinger')), `${tittel}\n\n${linjer.join('\n')}\n\n${base}/#/meldinger`, undefined, undefined, await x.oppsettFor(null, org.id)).catch(() => ({ sendt: false })); if (s?.sendt) epost++; }
    if (push || epost) for (const m of uten) await admin.from('meldinger').update({ data: { ...m.data, paminnet: new Date().toISOString() } }).eq('id', m.id);
    await admin.from('hendelseslogg').insert({ bruker_id: null, bruker: 'Chat-varsler', tabell: 'hendelse', rad_id: null, eiendom_id: null, handling: 'chat', tekst: `${tittel} (push ${push}, e-post ${epost})`.slice(0, 500) });
    rapport.push({ org: org.navn, ubesvarte: uten.length, push, epost });
  }
  return json(200, { ok: true, rapport });
}
