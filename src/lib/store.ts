import { flett, koSett, koNokkel, rens, lokaleFiler, byttFiler, erNettfeil } from './synk';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { useSyncExternalStore } from 'react';
import { sprak, tt } from './i18n';

// Tåler at adressen er limt inn med /rest/v1, /auth/v1 eller skråstrek til slutt
const rensUrl = (u?: string) => (u || '').trim().replace(/\/(rest|auth|storage)\/v1.*$/i, '').replace(/\/+$/, '');
const URL_ = rensUrl(import.meta.env.VITE_SUPABASE_URL as string | undefined) || undefined;
const KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();
export const configured = !!(URL_ && KEY);
// Må leses før Supabase-klienten fjerner token fra adressen
const FRA_LENKE = /type=(recovery|invite)/.test(location.hash + location.search) && !/token_hash=/.test(location.hash + location.search);
// Nyere lenker i e-post har engangskoden i adressen (#token_hash=…) og brukes først når brukeren trykker på knappen,
// slik at e-postprogrammer som forhåndsåpner lenker ikke bruker opp koden. Feil fra gamle lenker (#error=…) vises også.
const _lh = new URLSearchParams(location.hash.replace(/^#\/?/, '')); const _ls = new URLSearchParams(location.search);
const _th = _lh.get('token_hash') || _ls.get('token_hash'); const _lt = _lh.get('type') || _ls.get('type');
export const LENKE = { token: _th && (_lt === 'recovery' || _lt === 'invite') ? _th : '', type: (_lt === 'invite' ? 'invite' : 'recovery') as 'invite' | 'recovery', feil: _lh.get('error_description') || _lh.get('error_code') || '' };
export const sb: SupabaseClient = createClient(URL_ || 'http://localhost', KEY || 'mangler', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export type Rolle = 'admin' | 'forvalter' | 'tekniker' | 'leietaker' | 'utforer' | 'ingen';
export const ROLLER: [Rolle, string, string][] = [
  ['admin', 'Administrator', 'Ser og endrer alt. Administrerer brukere, roller og eiendommer.'],
  ['forvalter', 'Forvalter / driftsleder', 'Full drift av tildelte eiendommer: kontroller, avvik, dokumenter, leietakere, arealer og vedlikeholdsplan.'],
  ['tekniker', 'Driftstekniker / serviceleverandør', 'Ser kontrollplan, systemer og avvik på tildelte eiendommer. Registrerer utførte kontroller og avvik. Ser ikke leietakere, leieavtaler eller økonomi.'],
  ['leietaker', 'Leietaker', 'Ser eget leieforhold. Melder avvik, bekrefter internkontrollplikter og laster opp dokumentasjon.'],
  ['utforer', 'Utførende (ekstern)', 'Ser bare arbeidsordre (avvik) som er tildelt dem, med plassering på tegning. Kan starte jobben, kvittere ut og laste opp bilder og dokumentasjon.'],
  ['ingen', 'Ingen tilgang', 'Venter på at en administrator tildeler rolle.'],
];
export const rolleNavn = (r?: string) => ROLLER.find(x => x[0] === r)?.[1] || r || '';

// ---- Tabeller: app-navn → databasetabell og kolonner utenfor data-jsonb
type ColMap = Record<string, string>;
export const TABLES = {
  eiendommer: { table: 'eiendommer', cols: { eierOrgId: 'eier_org_id', portefoljeId: 'portefolje_id' } as ColMap },
  leietakere: { table: 'leietakere', cols: { eiendomId: 'eiendom_id' } as ColMap },
  anlegg: { table: 'systemer', cols: { eiendomId: 'eiendom_id' } as ColMap },
  komponenter: { table: 'komponenter', cols: { eiendomId: 'eiendom_id', anleggId: 'system_id' } as ColMap },
  oppgaver: { table: 'oppgaver', cols: { eiendomId: 'eiendom_id' } as ColMap },
  avvik: { table: 'avvik', cols: { eiendomId: 'eiendom_id', leietakerId: 'leietaker_id', tildeltId: 'tildelt_id' } as ColMap },
  dokumenter: { table: 'dokumenter', cols: { eiendomId: 'eiendom_id', leietakerId: 'leietaker_id' } as ColMap },
  tegninger: { table: 'tegninger', cols: { eiendomId: 'eiendom_id' } as ColMap },
  avlesninger: { table: 'avlesninger', cols: { eiendomId: 'eiendom_id', komponentId: 'komponent_id' } as ColMap },
  prosjekter: { table: 'prosjekter', cols: { eiendomId: 'eiendom_id' } as ColMap },
  befaringer: { table: 'befaringer', cols: { eiendomId: 'eiendom_id' } as ColMap },
};
/** Arkiverte rader (data.arkivert) holdes utenfor de vanlige listene, men finnes for oppslag og arkivsøk */
export const ARKIV: Record<'anlegg' | 'komponenter' | 'oppgaver', any[]> = { anlegg: [], komponenter: [], oppgaver: [] };
const ARK_COLS = ['anlegg', 'komponenter', 'oppgaver'] as const;
const VALGFRIE = ['avlesninger', 'prosjekter', 'befaringer'];
export type Col = keyof typeof TABLES;
export const COLS = Object.keys(TABLES) as Col[];

export type Niva = 'skriv' | 'drift' | 'les' | 'service';
export const S: Record<Col, any[]> & { profiles: any[]; tilganger: any[]; innst: Record<string, any>; innstMangler: boolean; orgs: any[]; medlemmer: any[]; portefoljer: any[]; oppdrag: any[]; niva: Record<string, Niva>; primarOrg: string; fullTilgang: boolean } = {
  eiendommer: [], leietakere: [], anlegg: [], komponenter: [], oppgaver: [], avvik: [], dokumenter: [], tegninger: [], avlesninger: [], prosjekter: [], befaringer: [], profiles: [], tilganger: [], innst: {}, innstMangler: false,
  orgs: [], medlemmer: [], portefoljer: [], oppdrag: [], niva: {}, primarOrg: '', fullTilgang: false,
};

export type Me = { id: string; epost: string; navn: string; rolle: Rolle; leietakerId?: string | null; aktiv: boolean; plattform?: boolean };
export const state = { me: null as Me | null, ready: false, loading: false, error: '', offline: false, recovery: false, version: 0, mfa: '' as '' | 'verifiser' | 'oppsett', mfaEpost: '' };
if (FRA_LENKE) state.recovery = true;

// ---- enkel global butikk med abonnement
const subs = new Set<() => void>();
let raf = 0;
export function bump() { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; state.version++; subs.forEach(f => f()); }); }
export function useStore() { return useSyncExternalStore(cb => { subs.add(cb); return () => subs.delete(cb); }, () => state.version); }

function fromRow(col: Col, r: any) {
  const o: any = { ...(r.data || {}), id: r.id, opprettet: r.created_at, endret: r.updated_at, opprettetAv: r.created_by };
  const cols = TABLES[col].cols; for (const k in cols) { if (k === 'tildeltId' && !(cols[k] in r)) continue; o[k] = r[cols[k]] ?? ''; } // tildelt_id finnes først etter 003-migreringen
  if (col === 'avvik') o.nr = r.nr;
  return o;
}
function toRow(col: Col, o: any) {
  const { id, opprettet, endret, opprettetAv, nr, ...rest } = o;
  const row: any = { id }; const cols = TABLES[col].cols;
  for (const k in cols) { if (k === 'tildeltId' && !(k in rest)) continue; row[cols[k]] = rest[k] || null; delete rest[k]; }
  row.data = JSON.parse(JSON.stringify(rest));
  return row;
}
function apply(col: Col | 'profiles' | 'tilganger', type: 'upsert' | 'delete', o: any) {
  if ((ARK_COLS as readonly string[]).includes(col)) { // arkiverte flyttes mellom vanlig liste og arkiv
    const c = col as typeof ARK_COLS[number]; S[c] = S[c].filter(x => x.id !== o.id); ARKIV[c] = ARKIV[c].filter(x => x.id !== o.id);
    if (type === 'upsert') (o.arkivert ? ARKIV[c] : S[c]).push(o); bump(); return;
  }
  const arr = S[col] as any[]; const key = col === 'tilganger' ? (x: any) => x.user_id + '|' + x.eiendom_id : (x: any) => x.id;
  const i = arr.findIndex(x => key(x) === key(o));
  if (type === 'delete') { if (i >= 0) arr.splice(i, 1); }
  else if (i >= 0) arr[i] = o; else arr.push(o);
  bump();
}

// ---- varsler i appen (vises som banner og i nettleservarsel hvis tillatt)
export const varsler: { t: string; lenke?: string; tid: number }[] = [];
export function varsle(t: string, lenke?: string) {
  varsler.unshift({ t, lenke, tid: Date.now() }); toast(t);
  try { if ('Notification' in window && Notification.permission === 'granted' && document.hidden) new Notification('Eiendomskontroll', { body: t }); } catch { }
  bump();
}

// ---- arbeidsordre (Netlify-funksjon)
export async function aoApi(body: any, medInnlogging = true) {
  const headers: any = { 'Content-Type': 'application/json' };
  if (medInnlogging) { const { data: { session } } = await sb.auth.getSession(); if (session) headers.Authorization = 'Bearer ' + session.access_token; }
  const r = await fetch('/.netlify/functions/arbeidsordre', { method: 'POST', headers, body: JSON.stringify({ sprak: sprak(), ...body }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error ? tt(j.error) : tt('Feil {0}', r.status)), j, { status: r.status });
  return j;
}
/** Fører en egen hendelse i hendelsesloggen (i tillegg til de automatiske) */
export async function loggHendelse(tekst: string, radId?: string, eiendomId?: string) {
  try { await sb.from('hendelseslogg').insert({ bruker_id: state.me?.id, bruker: state.me?.navn || state.me?.epost, tabell: 'hendelse', rad_id: radId || null, eiendom_id: eiendomId || null, handling: 'hendelse', tekst }); } catch { }
}

// ---- toast
export const toasts = { msg: '', t: 0 };
export function toast(m: string) { toasts.msg = m; toasts.t = Date.now(); bump(); setTimeout(() => { if (Date.now() - toasts.t >= 2900) { toasts.msg = ''; bump(); } }, 3000); }

// ---- lagring
export async function save(col: Col, obj: any): Promise<string> {
  const o = { ...obj };
  const exists = !!o.id && ((S[col] as any[]).some(x => x.id === o.id) || ((ARK_COLS as readonly string[]).includes(col) && ARKIV[col as typeof ARK_COLS[number]].some(x => x.id === o.id)));
  // Uten nett: endringen lagres på enheten og sendes automatisk når nettet er tilbake
  if (utenNett()) return iKo(col, o, exists);
  if (!o.id) o.id = crypto.randomUUID();
  const row = toRow(col, o); const t = TABLES[col].table;
  const res = exists
    ? await sb.from(t).update({ ...row, id: undefined }).eq('id', o.id).select().single()
    : col === 'eiendommer'
      // Ny eiendom: tilgangen opprettes av en trigger i samme operasjon og er ikke synlig for RETURNING – lagre først, hent etterpå
      ? await (async () => { const r: any = await sb.from(t).insert(row); return r.error ? r : await sb.from(t).select().eq('id', o.id).single(); })()
      : await sb.from(t).insert(row).select().single();
  if (res.error && erNettfeil(res.error)) return iKo(col, o, exists); // nettet falt ut underveis
  if (res.error) { toast('Lagring feilet: ' + feiltekst(res.error)); throw res.error; }
  apply(col, 'upsert', fromRow(col, res.data));
  return o.id;
}
const utenNett = () => typeof navigator !== 'undefined' && navigator.onLine === false;
const finnRad = (col: Col, id: string) => (S[col] as any[]).find(x => x.id === id) || ((ARK_COLS as readonly string[]).includes(col) ? ARKIV[col as typeof ARK_COLS[number]].find(x => x.id === id) : undefined);
/** Antall endringer som venter på å bli sendt, og de som serveren har avvist */
export const ko = { antall: 0, feil: [] as { key: string; col: string; navn: string; feil: string }[] };
async function tellKo() { try { const { koAlle } = await import('./offline'); const K = await koAlle(); ko.antall = K.length;
  ko.feil = K.filter(x => x.v.feil).map(x => ({ key: x.key, col: x.v.col, navn: x.v.obj.navn || x.v.obj.tittel || x.v.col, feil: x.v.feil! })); bump(); } catch { } }
async function iKo(col: Col, o: any, exists: boolean): Promise<string> {
  if (!o.id) o.id = crypto.randomUUID();
  const { koHent, koLegg, koSlett } = await import('./offline'); const key = koNokkel(col, o.id);
  let gml = await koHent(key); if (!gml) { gml = await koHent(o.id); if (gml) await koSlett(o.id); } // eldre kø brukte bare id som nøkkel
  const naa = exists ? finnRad(col, o.id) : null;
  await koLegg(key, koSett(gml, { col, obj: rens(o), tid: Date.now(), base: naa ? rens(naa) : null }));
  apply(col, 'upsert', { ...o, usynket: true }); lagreKopi(); tellKo();
  toast(tt("Ingen nett – lagret på enheten og sendes når du er på nett igjen")); return o.id;
}
/** Legger ventende endringer oppå data som nettopp er lastet, så de ikke forsvinner fra skjermen før de er sendt. */
async function leggPaaKo() { try { const { koAlle } = await import('./offline'); const K = (await koAlle()).sort((a, b) => a.v.tid - b.v.tid);
  for (const { v } of K) if (TABLES[v.col as Col]) apply(v.col as Col, 'upsert', { ...(finnRad(v.col as Col, v.obj.id) || {}), ...v.obj, usynket: true }); await tellKo(); } catch { } }
/** Forkaster en endring som ikke lot seg sende, og henter raden slik den er på serveren. */
export async function forkastKo(key: string) { const { koHent, koSlett } = await import('./offline'); const p = await koHent(key); await koSlett(key);
  if (p && TABLES[p.col as Col]) { apply(p.col as Col, 'delete', { id: p.obj.id }); await refetch(p.col as Col, p.obj.id).catch(() => { }); } await tellKo(); }
/** Lagrer mange nye rader i én operasjon per 500 (import). Returnerer id-ene. */
export async function saveMange(col: Col, objs: any[], fremdrift?: (n: number) => void): Promise<string[]> {
  const ider: string[] = [];
  for (let i = 0; i < objs.length; i += 500) {
    const del = objs.slice(i, i + 500).map(o => { const x = { ...o, id: o.id || crypto.randomUUID() }; ider.push(x.id); return x; });
    const { data, error } = await sb.from(TABLES[col].table).insert(del.map(o => toRow(col, o))).select();
    if (error) { toast('Lagring feilet: ' + feiltekst(error)); throw error; }
    for (const r of data || []) apply(col, 'upsert', fromRow(col, r)); fremdrift?.(Math.min(objs.length, i + 500));
  }
  return ider;
}
/** Hent én rad på nytt fra databasen (f.eks. etter at en serverfunksjon har endret den) */
export async function refetch(col: Col, id: string) { const { data } = await sb.from(TABLES[col].table).select('*').eq('id', id).maybeSingle(); if (data) apply(col, 'upsert', fromRow(col, data)); }
export async function removeDoc(col: Col, id: string) {
  if (utenNett()) { toast(tt("Sletting krever nett")); throw new Error('uten nett'); }
  const { error } = await sb.from(TABLES[col].table).delete().eq('id', id);
  if (error) { toast('Sletting feilet: ' + feiltekst(error)); throw error; }
  apply(col, 'delete', { id });
}
/** Sletter mange rader i en operasjon (i biter), og fjerner dem fra visningen. */
export async function removeMange(col: Col, ids: string[], fremdrift?: (n: number) => void) {
  if (utenNett()) { toast(tt("Sletting krever nett")); throw new Error('uten nett'); }
  for (let i = 0; i < ids.length; i += 200) {
    const del = ids.slice(i, i + 200); const { error } = await sb.from(TABLES[col].table).delete().in('id', del);
    if (error) { toast('Sletting feilet: ' + feiltekst(error)); throw error; }
    del.forEach(id => apply(col, 'delete', { id })); fremdrift?.(Math.min(ids.length, i + 200));
  }
}
export function feiltekst(e: any) {
  const m = String(e?.message || e || '');
  if (/row-level security|permission denied|violates row-level/i.test(m)) return 'Du har ikke tilgang til å gjøre dette';
  return m;
}

// ---- lasting og sanntid
async function loadAll(table: string) {
  const out: any[] = []; for (let i = 0; ; i += 1000) {
    const { data, error } = await sb.from(table).select('*').range(i, i + 999);
    if (error) throw error; out.push(...(data || [])); if (!data || data.length < 1000) break;
  }
  return out;
}
let channel: any = null;
async function loadInnst() {
  const { data, error } = await sb.from('innstillinger').select('*');
  if (error) { S.innstMangler = true; S.innst = {}; return; }
  S.innstMangler = false; S.innst = Object.fromEntries((data || []).map((r: any) => [r.nokkel, r.data]));
}
export async function saveInnst(nokkel: string, data: any) {
  const { error } = await sb.from('innstillinger').upsert({ nokkel, data, ...(S.primarOrg ? { org_id: S.primarOrg } : {}) });
  if (error) { toast('Lagring feilet: ' + feiltekst(error)); throw error; }
  S.innst[nokkel] = data; bump();
}
export async function loadData() {
  state.loading = true; state.error = ''; bump();
  try {
    // avlesninger er nyere enn de andre tabellene – mangler den (før migrering), lastes resten likevel
    await Promise.all(COLS.map(async c => { try { S[c] = (await loadAll(TABLES[c].table)).map(r => fromRow(c, r)); } catch (e) { if (VALGFRIE.includes(c)) S[c] = []; else throw e; } }));
    for (const c of ARK_COLS) { const alle = S[c]; S[c] = alle.filter(x => !x.arkivert); ARKIV[c] = alle.filter(x => x.arkivert); }
    if (state.me && ['admin', 'forvalter', 'tekniker'].includes(state.me.rolle)) {
      await loadInnst();
      S.profiles = await loadAll('profiles');
      S.tilganger = await loadAll('eiendom_tilgang');
    }
    if (state.me && state.me.rolle !== 'leietaker') await loadOrg();
    state.offline = false; await leggPaaKo(); lagreKopi();
  } catch (e: any) {
    // Uten nett: bruk kopien fra sist appen var på nett (bare til visning og befaringer)
    if (!navigator.onLine && await hentKopi()) { state.offline = true; state.error = ''; await leggPaaKo(); }
    else state.error = 'Kunne ikke laste data: ' + feiltekst(e);
  }
  state.loading = false; bump();
  if (state.offline) return;
  if (channel) sb.removeChannel(channel);
  channel = sb.channel('endringer');
  COLS.forEach(c => channel.on('postgres_changes', { event: '*', schema: 'public', table: TABLES[c].table }, (p: any) => {
    if (p.eventType === 'DELETE') { apply(c, 'delete', { id: p.old.id }); return; }
    const ny = fromRow(c, p.new);
    if (c === 'avvik' && state.me && ny.tildeltId === state.me.id) { const gml = S.avvik.find(x => x.id === ny.id); if (!gml || gml.tildeltId !== state.me.id) varsle(`Du er tildelt arbeidsordre: avvik #${ny.nr} ${ny.tittel || ''}`, 'arbeidsordre/' + ny.id); }
    apply(c, 'upsert', ny);
  }));
  channel.on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, (p: any) => {
    if (p.eventType === 'DELETE') apply('profiles', 'delete', { id: p.old.id }); else { apply('profiles', 'upsert', p.new); if (p.new.id === state.me?.id) setMe(p.new); }
  });
  channel.on('postgres_changes', { event: '*', schema: 'public', table: 'eiendom_tilgang' }, () => { reloadTilgang(); });
  ['organisasjoner', 'org_medlem', 'portefoljer', 'oppdrag'].forEach(t => channel.on('postgres_changes', { event: '*', schema: 'public', table: t }, () => reloadOrg()));
  if (!S.innstMangler) channel.on('postgres_changes', { event: '*', schema: 'public', table: 'innstillinger' }, (p: any) => { if (p.new?.nokkel) { S.innst[p.new.nokkel] = p.new.data; bump(); } });
  channel.subscribe();
}
// ---- kopi av data for oppstart uten nett (IndexedDB på enheten)
let kopiT: any = 0;
function lagreKopi() { clearTimeout(kopiT); kopiT = setTimeout(async () => { try { const { lagreSnap } = await import('./offline'); const v: any = { me: state.me, niva: S.niva, primarOrg: S.primarOrg, orgs: S.orgs, medlemmer: S.medlemmer, portefoljer: S.portefoljer, innst: S.innst, profiles: S.profiles.map(p => ({ id: p.id, navn: p.navn, epost: p.epost, rolle: p.rolle, aktiv: p.aktiv })), arkiv: ARKIV };
  COLS.forEach(c => v[c] = S[c]); await lagreSnap(v); try { localStorage.setItem('ek.me', JSON.stringify(state.me)); } catch { } } catch { } }, 2500); }
async function hentKopi(): Promise<boolean> {
  try { const { hentSnap } = await import('./offline'); const k = await hentSnap(); if (!k?.v || k.v.me?.id !== state.me?.id) return false; const v = k.v;
    COLS.forEach(c => { S[c] = v[c] || []; }); Object.assign(ARKIV, v.arkiv || {}); S.niva = v.niva || {}; S.primarOrg = v.primarOrg || ''; S.orgs = v.orgs || []; S.medlemmer = v.medlemmer || []; S.portefoljer = v.portefoljer || []; S.innst = v.innst || {}; S.profiles = v.profiles || [];
    (state as any).kopiTid = k.t; return true; } catch { return false; }
}
// Tilbake på nett: last på nytt og synk befaringer som er gjort uten nett
if (typeof window !== 'undefined') window.addEventListener('offline', () => bump());
// Dårlig dekning: prøv å sende køen igjen hvert minutt så lenge noe venter
if (typeof window !== 'undefined') setInterval(() => { if (ko.antall > ko.feil.length && navigator.onLine) sendKo(); }, 60000);
if (typeof window !== 'undefined') window.addEventListener('online', () => { bump(); if (state.offline) { loadedFor = ''; loadMe(); } setTimeout(() => import('./befaring').then(m => m.synkAlle()), 1500); setTimeout(() => sendKo(), 2500); });
/** Sender endringer som ble gjort uten nett, i den rekkefølgen de ble gjort. Filer lastes opp først. Endringer på rader andre
 *  har rørt i mellomtiden flettes felt for felt (se synk.ts). Det serveren avviser blir liggende med feilmelding til brukeren har tatt stilling. */
let sender = false;
export async function sendKo(ogsaaFeilede = false) {
  if (!state.me || utenNett() || sender) return; sender = true;
  try {
    const off = await import('./offline'); const K = (await off.koAlle()).sort((a, b) => a.v.tid - b.v.tid); let n = 0, avvist = 0;
    for (const { key, v } of K) {
      const col = v.col as Col; if (!TABLES[col]) { await off.koSlett(key); continue; }
      if (v.feil && !ogsaaFeilede) { avvist++; continue; }
      try {
        // 1) filer som ligger på enheten
        const opp: Record<string, any> = {};
        for (const k of lokaleFiler(v.obj)) { let f = await off.opplastetSom(k);
          if (!f) { const blob = await off.hentLokalFil(k); const m = (await off.lokalFilMeta(k)) || {}; if (!blob) continue;
            f = await lastOpp(blob, m.eiendomId || v.obj.eiendomId || 'felles', m.leietakerId, m.navn, m.mappe); await off.merkOpplastet(k, f); }
          opp[k] = f; }
        const o = byttFiler(rens(v.obj), opp); const t = TABLES[col].table;
        // 2) selve raden
        if (v.base) {
          const cur: any = await sb.from(t).select('*').eq('id', o.id).maybeSingle(); if (cur.error) throw cur.error;
          if (!cur.data) throw new Error(tt("Raden finnes ikke lenger på serveren"));
          const m = flett(byttFiler(v.base, opp), o, fromRow(col, cur.data));
          const r: any = await sb.from(t).update({ ...toRow(col, m), id: undefined }).eq('id', o.id).select().single(); if (r.error) throw r.error;
          apply(col, 'upsert', fromRow(col, r.data));
        } else {
          const r: any = await sb.from(t).insert(toRow(col, o)).select().single();
          if (r.error && !/duplicate key/i.test(r.error.message)) throw r.error;
          if (r.data) apply(col, 'upsert', fromRow(col, r.data)); else await refetch(col, o.id);
        }
        await off.koSlett(key); n++;
      } catch (e: any) {
        if (erNettfeil(e) || utenNett()) break; // fortsatt ikke kontakt: prøv senere, behold rekkefølgen
        await off.koLegg(key, { ...v, feil: feiltekst(e), forsok: (v.forsok || 0) + 1 }); avvist++;
      }
    }
    await tellKo(); if (n) lagreKopi();
    if (n) toast(tt("{0} endringer gjort uten nett er nå sendt", n) + (avvist ? ' · ' + tt("{0} ble avvist", avvist) : ''));
  } finally { sender = false; }
}
let tilgT: any = 0;
function reloadTilgang() { clearTimeout(tilgT); tilgT = setTimeout(async () => { const prev = S.tilganger.filter(t => t.user_id === state.me?.id).length; S.tilganger = await loadAll('eiendom_tilgang'); const now = S.tilganger.filter(t => t.user_id === state.me?.id).length; if (prev !== now && state.me?.rolle !== 'admin') loadData(); else bump(); }, 400); }
// ---- organisasjoner, porteføljer, oppdrag og tilgangsnivå per eiendom
async function loadOrg() {
  const tryLoad = async (t: string) => { try { return await loadAll(t); } catch { return []; } };
  const [orgs, med, port, opp] = await Promise.all(['organisasjoner', 'org_medlem', 'portefoljer', 'oppdrag'].map(tryLoad));
  S.orgs = orgs; S.medlemmer = med; S.portefoljer = port; S.oppdrag = opp;
  const { data: niv } = await sb.rpc('mine_tilganger'); S.niva = Object.fromEntries((niv || []).map((r: any) => [r.eiendom_id, r.niva]));
  const { data: po } = await sb.rpc('min_primar_org'); S.primarOrg = po || '';
  if (state.me?.plattform) { try { const { data: ft } = await sb.rpc('full_tilgang', { p_uid: state.me.id }); S.fullTilgang = ft === true; } catch { S.fullTilgang = false; } } else S.fullTilgang = false;
  try { const { lastModuler, lastPriser } = await import('./moduler'); await lastModuler(); lastPriser(); } catch { /* ikke tilgjengelig */ }
}
export async function oppdaterNiva() { const { data: niv } = await sb.rpc('mine_tilganger'); S.niva = Object.fromEntries((niv || []).map((r: any) => [r.eiendom_id, r.niva])); bump(); }
let orgT: any = 0;
export function reloadOrg() { clearTimeout(orgT); orgT = setTimeout(async () => { const før = JSON.stringify(S.niva); await loadOrg(); if (JSON.stringify(S.niva) !== før) loadData(); else bump(); }, 400); }
function setMe(p: any) {
  const prevRolle = state.me?.rolle;
  state.me = { id: p.id, epost: p.epost, navn: p.navn, rolle: p.aktiv ? p.rolle : 'ingen', leietakerId: p.leietaker_id, aktiv: p.aktiv, plattform: !!p.plattform_admin };
  bump(); if (prevRolle && prevRolle !== state.me.rolle) loadData();
}
let loadedFor = '';
async function mfaSjekk(): Promise<'' | 'verifiser' | 'oppsett'> {
  try {
    const { data: a } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (a && a.nextLevel === 'aal2' && a.currentLevel !== 'aal2') return 'verifiser';
    if (a?.currentLevel === 'aal2') return '';
    const { data: s, error } = await sb.rpc('mfa_status');
    if (!error && s?.kreves) return 'oppsett';
  } catch { /* eldre klient eller midlertidig feil – databasen håndhever */ }
  return '';
}
export async function loadMe() {
  const { data: { session } } = await sb.auth.getSession().catch(() => ({ data: { session: null } } as any));
  if (!session && !navigator.onLine) { // uten nett: bruk sist innloggede bruker på denne enheten (data er låst til samme bruker)
    let m: any = null; try { m = JSON.parse(localStorage.getItem('ek.me') || 'null'); } catch { }
    if (m?.id) { state.me = m; state.ready = true; bump(); if (loadedFor !== m.id + m.rolle) { loadedFor = m.id + m.rolle; loadData(); } return; }
  }
  if (!session) { state.me = null; state.mfa = ''; state.ready = true; bump(); return; }
  // Tofaktor: kode ved innlogging, eller påkrevd oppsett for administratorer/forvaltere. Databasen stenger data uansett.
  const mfa = await mfaSjekk();
  if (mfa) { state.mfa = mfa; state.mfaEpost = session.user.email || ''; state.me = null; state.ready = true; bump(); return; }
  state.mfa = '';
  // Språket lagres på brukeren, så e-post fra innloggingen (tilbakestill passord o.l.) kan sendes på samme språk
  if (navigator.onLine && session.user.user_metadata?.sprak !== sprak()) sb.auth.updateUser({ data: { sprak: sprak() } }).catch(() => null);
  const { data, error } = await sb.from('profiles').select('*').eq('id', session.user.id).single();
  let kopi: any = null; if ((error || !data) && !navigator.onLine) { try { kopi = JSON.parse(localStorage.getItem('ek.me') || 'null'); } catch { } }
  if (kopi?.id === session.user.id) state.me = kopi;
  else if (error || !data) { state.me = { id: session.user.id, epost: session.user.email || '', navn: '', rolle: 'ingen', aktiv: false }; }
  else setMe(data);
  state.ready = true; bump();
  if (state.me && (state.me.rolle !== 'ingen' || state.me.plattform) && loadedFor !== state.me.id + state.me.rolle) { loadedFor = state.me.id + state.me.rolle; loadData(); }
}
export function initAuth() {
  if (!configured) { state.ready = true; bump(); return; }
  sb.auth.onAuthStateChange((ev) => {
    if (ev === 'PASSWORD_RECOVERY') { state.recovery = true; bump(); }
    if (ev === 'SIGNED_IN' || ev === 'SIGNED_OUT' || ev === 'USER_UPDATED') setTimeout(loadMe, 0);
  });
  loadMe();
}
export async function signOut() {
  try { // usynkede befaringer på enheten slettes ved utlogging – synk først, og spør hvis noe fortsatt ikke er lagret
    await sendKo(); await tellKo();
    if (ko.antall) { const { confirmBox } = await import('../components/ui'); if (!(await confirmBox(tt("{0} endringer på denne enheten er ikke sendt til serveren ennå. Logger du ut nå, går de tapt.", ko.antall), tt("Logg ut likevel")))) return;
      const { koAlle, koSlett } = await import('./offline'); for (const x of await koAlle()) await koSlett(x.key); ko.antall = 0; ko.feil = []; }
    const B = await import('./befaring'); await B.synkAlle(); const n = await B.antallUsynket();
    if (n) { const { confirmBox } = await import('../components/ui'); if (!(await confirmBox(`${n} befaring${n > 1 ? 'er' : ''} på denne enheten er ikke lagret på serveren ennå${navigator.onLine ? '' : ' (du er uten nett)'}. Logger du ut nå, går endringene tapt.`, 'Logg ut likevel'))) return; }
  } catch { }
  if (channel) sb.removeChannel(channel); try { localStorage.removeItem('ek.me'); const { tomAlt } = await import('./offline'); await tomAlt(); } catch { } await sb.auth.signOut(); COLS.forEach(c => S[c] = []); S.profiles = []; S.tilganger = []; S.orgs = []; S.medlemmer = []; S.portefoljer = []; S.oppdrag = []; S.niva = {}; S.primarOrg = ''; state.me = null; state.mfa = ''; loadedFor = ''; bump(); location.hash = ''; }

// ---- roller (styrer hva som vises; databasen håndhever tilgangen)
export const role = () => state.me?.rolle || 'ingen';
export const isAdmin = () => role() === 'admin' || !!state.me?.plattform;
export const isPlattform = () => !!state.me?.plattform;
// Har redigeringstilgang til minst én eiendom (eller er admin/forvalter i en eierorganisasjon og kan opprette)
export const canEdit = () => ((role() === 'admin' || role() === 'forvalter') && (Object.values(S.niva).includes('skriv') || mineOrg(['admin', 'forvalter']).some(o => o.type === 'eier') || !Object.keys(S.niva).length))
  || (gardeierOppretter() && Object.values(S.niva).includes('skriv'));
/** Organisasjoner der jeg er gårdeier og administrator har slått på at gårdeiere kan opprette egne bygg */
export const gardeierOrg = (): any[] => mineOrg(['gardeier']).filter(o => o.gardeier_oppretter);
export const gardeierOppretter = () => gardeierOrg().length > 0;
/** Organisasjoner jeg kan opprette bygg i (administrator/forvalter, eller gårdeier når valget er på) */
export const opprettOrg = (): any[] => { const a = mineOrg(['admin', 'forvalter']); return [...a, ...gardeierOrg().filter(o => !a.some(x => x.id === o.id))]; };
export const isStaff = () => ['admin', 'forvalter', 'tekniker'].includes(role());
// Tilgangsnivå på en konkret eiendom (databasen håndhever det samme)
export const nivaE = (eid?: string): Niva | '' => (eid && S.niva[eid]) || '';
export const kanRedigereE = (eid?: string) => nivaE(eid) === 'skriv';
export const kanDrifteE = (eid?: string) => ['skriv', 'drift'].includes(nivaE(eid));
// Mine organisasjoner (med min rolle)
export const mineOrg = (roller?: string[]): any[] => S.fullTilgang && state.me?.plattform
  ? S.orgs.filter(o => o.aktiv !== false).map(o => { const m = S.medlemmer.find(x => x.org_id === o.id && x.user_id === state.me?.id && x.aktiv); return { ...o, minRolle: 'admin', alleBygg: true, ekteRolle: m?.rolle || '' }; })
  : S.medlemmer.filter(m => m.user_id === state.me?.id && m.aktiv && (!roller || roller.includes(m.rolle))).map(m => ({ ...(S.orgs.find(o => o.id === m.org_id) || { id: m.org_id, navn: '?' }), minRolle: m.rolle, alleBygg: m.alle_bygg })).filter(o => o.aktiv !== false);
export const orgNavn = (id?: string) => S.orgs.find(o => o.id === id)?.navn || '';
/** Gårdeier: bare lesetilgang til tildelte bygg, ingen annen rolle i noen organisasjon */
export const erGardeier = () => { if (state.me?.plattform) return false; const m = mineOrg(); return m.length > 0 && m.every(o => o.minRolle === 'gardeier'); };
/** Gårdeier som kan redigere egne bygg (valget er på og vedkommende har opprettet minst ett bygg) – får full meny */
export const gardeierRedigerer = () => erGardeier() && canEdit();
export const rolleVis = () => erGardeier() ? 'Gårdeier' : rolleNavn(state.me?.rolle);
export const isTenant = () => role() === 'leietaker';
export const isUtforer = () => role() === 'utforer';

// ---- filer (privat bøtte «filer»)
const MIME: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', txt: 'text/plain', csv: 'text/csv', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', doc: 'application/msword', xls: 'application/vnd.ms-excel', dwg: 'application/acad', msg: 'application/vnd.ms-outlook', eml: 'message/rfc822' };
export type Fil = { path: string; navn: string; type?: string; str?: number; /** Ligger bare på enheten ennå (lagt til uten nett) */ lokal?: string };
export async function uploadFile(file: Blob & { name?: string }, eiendomId: string, leietakerId?: string, navn?: string, mappe?: string, direkte = false): Promise<Fil | null> {
  const name = navn || file.name || 'fil';
  const ext = (name.split('.').pop() || '').toLowerCase();
  // Lagringen godtar bare ASCII i filbanen – æøå og aksenter gjøres om (originalnavnet beholdes i «navn»)
  const safe = name.replace(/[æÆ]/g, m => m === 'æ' ? 'ae' : 'Ae').replace(/[øØ]/g, m => m === 'ø' ? 'o' : 'O').replace(/[åÅ]/g, m => m === 'å' ? 'a' : 'A')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/_+/g, '_').slice(-80) || 'fil';
  const path = `${eiendomId}/${mappe ? mappe : leietakerId ? 'leietaker/' + leietakerId : 'felles'}/${crypto.randomUUID()}-${safe}`;
  // Uten nett: filen legges på enheten og lastes opp sammen med raden den hører til (se sendKo)
  const lokalt = async () => { const { lagreLokalFil } = await import('./offline'); const l = await lagreLokalFil(file, name, { eiendomId, leietakerId, navn, mappe });
    return { path: 'lokal:' + l.lokal, lokal: l.lokal, navn: name, type: file.type || MIME[ext], str: file.size } as Fil; };
  if (utenNett() && !direkte) return lokalt();
  const { error } = await sb.storage.from('filer').upload(path, file, { contentType: file.type || MIME[ext] || 'application/octet-stream', upsert: false });
  if (error && direkte) throw error;
  if (error && erNettfeil(error)) return lokalt();
  if (error) { toast('Opplasting feilet: ' + feiltekst(error)); return null; }
  return { path, navn: name, type: file.type || MIME[ext], str: file.size };
}
const lastOpp = (file: Blob, eiendomId: string, leietakerId?: string, navn?: string, mappe?: string) => uploadFile(file, eiendomId, leietakerId, navn, mappe, true) as Promise<Fil>;
export async function deleteFile(f?: Fil) { if (f?.path && !f.lokal) await sb.storage.from('filer').remove([f.path]); }
const urlCache: Record<string, { u: string; t: number }> = {};
export async function fileUrl(path: string) {
  if (path.startsWith('lokal:')) { const { lokalUrl } = await import('./offline'); return lokalUrl(path.slice(6)); }
  const c = urlCache[path]; if (c && Date.now() - c.t < 50 * 60 * 1000) return c.u;
  const { data, error } = await sb.storage.from('filer').createSignedUrl(path, 3600);
  if (error || !data) return '';
  urlCache[path] = { u: data.signedUrl, t: Date.now() }; return data.signedUrl;
}

// ---- brukeradministrasjon (Netlify-funksjon med service-nøkkel)
export async function adminApi(body: any) {
  const { data: { session } } = await sb.auth.getSession();
  const r = await fetch('/.netlify/functions/brukere', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (session?.access_token || '') }, body: JSON.stringify({ sprak: sprak(), ...body }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error ? tt(j.error) : tt('Feil {0}', r.status)), j, { status: r.status });
  return j;
}
export async function reloadAdmin() { S.profiles = await loadAll('profiles'); S.tilganger = await loadAll('eiendom_tilgang'); await loadOrg(); bump(); }
