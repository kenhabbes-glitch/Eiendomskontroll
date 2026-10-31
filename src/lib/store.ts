import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { useSyncExternalStore } from 'react';

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const configured = !!(URL_ && KEY);
// Må leses før Supabase-klienten fjerner token fra adressen
const FRA_LENKE = /type=(recovery|invite)/.test(location.hash + location.search);
export const sb: SupabaseClient = createClient(URL_ || 'http://localhost', KEY || 'mangler', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export type Rolle = 'admin' | 'forvalter' | 'tekniker' | 'leietaker' | 'ingen';
export const ROLLER: [Rolle, string, string][] = [
  ['admin', 'Administrator', 'Ser og endrer alt. Administrerer brukere, roller og eiendommer.'],
  ['forvalter', 'Forvalter / driftsleder', 'Full drift av tildelte eiendommer: kontroller, avvik, dokumenter, leietakere, arealer og vedlikeholdsplan.'],
  ['tekniker', 'Driftstekniker / serviceleverandør', 'Ser kontrollplan, systemer og avvik på tildelte eiendommer. Registrerer utførte kontroller og avvik. Ser ikke leietakere, leieavtaler eller økonomi.'],
  ['leietaker', 'Leietaker', 'Ser eget leieforhold. Melder avvik, bekrefter internkontrollplikter og laster opp dokumentasjon.'],
  ['ingen', 'Ingen tilgang', 'Venter på at en administrator tildeler rolle.'],
];
export const rolleNavn = (r?: string) => ROLLER.find(x => x[0] === r)?.[1] || r || '';

// ---- Tabeller: app-navn → databasetabell og kolonner utenfor data-jsonb
type ColMap = Record<string, string>;
export const TABLES = {
  eiendommer: { table: 'eiendommer', cols: {} as ColMap },
  leietakere: { table: 'leietakere', cols: { eiendomId: 'eiendom_id' } as ColMap },
  anlegg: { table: 'systemer', cols: { eiendomId: 'eiendom_id' } as ColMap },
  komponenter: { table: 'komponenter', cols: { eiendomId: 'eiendom_id', anleggId: 'system_id' } as ColMap },
  oppgaver: { table: 'oppgaver', cols: { eiendomId: 'eiendom_id' } as ColMap },
  avvik: { table: 'avvik', cols: { eiendomId: 'eiendom_id', leietakerId: 'leietaker_id' } as ColMap },
  dokumenter: { table: 'dokumenter', cols: { eiendomId: 'eiendom_id', leietakerId: 'leietaker_id' } as ColMap },
  tegninger: { table: 'tegninger', cols: { eiendomId: 'eiendom_id' } as ColMap },
};
export type Col = keyof typeof TABLES;
export const COLS = Object.keys(TABLES) as Col[];

export const S: Record<Col, any[]> & { profiles: any[]; tilganger: any[] } = {
  eiendommer: [], leietakere: [], anlegg: [], komponenter: [], oppgaver: [], avvik: [], dokumenter: [], tegninger: [], profiles: [], tilganger: [],
};

export type Me = { id: string; epost: string; navn: string; rolle: Rolle; leietakerId?: string | null; aktiv: boolean };
export const state = { me: null as Me | null, ready: false, loading: false, error: '', recovery: false, version: 0 };
if (FRA_LENKE) state.recovery = true;

// ---- enkel global butikk med abonnement
const subs = new Set<() => void>();
let raf = 0;
export function bump() { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; state.version++; subs.forEach(f => f()); }); }
export function useStore() { return useSyncExternalStore(cb => { subs.add(cb); return () => subs.delete(cb); }, () => state.version); }

function fromRow(col: Col, r: any) {
  const o: any = { ...(r.data || {}), id: r.id, opprettet: r.created_at, endret: r.updated_at, opprettetAv: r.created_by };
  const cols = TABLES[col].cols; for (const k in cols) o[k] = r[cols[k]] ?? '';
  if (col === 'avvik') o.nr = r.nr;
  return o;
}
function toRow(col: Col, o: any) {
  const { id, opprettet, endret, opprettetAv, nr, ...rest } = o;
  const row: any = { id }; const cols = TABLES[col].cols;
  for (const k in cols) { row[cols[k]] = rest[k] || null; delete rest[k]; }
  row.data = JSON.parse(JSON.stringify(rest));
  return row;
}
function apply(col: Col | 'profiles' | 'tilganger', type: 'upsert' | 'delete', o: any) {
  const arr = S[col] as any[]; const key = col === 'tilganger' ? (x: any) => x.user_id + '|' + x.eiendom_id : (x: any) => x.id;
  const i = arr.findIndex(x => key(x) === key(o));
  if (type === 'delete') { if (i >= 0) arr.splice(i, 1); }
  else if (i >= 0) arr[i] = o; else arr.push(o);
  bump();
}

// ---- toast
export const toasts = { msg: '', t: 0 };
export function toast(m: string) { toasts.msg = m; toasts.t = Date.now(); bump(); setTimeout(() => { if (Date.now() - toasts.t >= 2900) { toasts.msg = ''; bump(); } }, 3000); }

// ---- lagring
export async function save(col: Col, obj: any): Promise<string> {
  const o = { ...obj }; const exists = !!o.id && (S[col] as any[]).some(x => x.id === o.id);
  if (!o.id) o.id = crypto.randomUUID();
  const row = toRow(col, o); const t = TABLES[col].table;
  const res = exists
    ? await sb.from(t).update({ ...row, id: undefined }).eq('id', o.id).select().single()
    : await sb.from(t).insert(row).select().single();
  if (res.error) { toast('Lagring feilet: ' + feiltekst(res.error)); throw res.error; }
  apply(col, 'upsert', fromRow(col, res.data));
  return o.id;
}
export async function removeDoc(col: Col, id: string) {
  const { error } = await sb.from(TABLES[col].table).delete().eq('id', id);
  if (error) { toast('Sletting feilet: ' + feiltekst(error)); throw error; }
  apply(col, 'delete', { id });
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
export async function loadData() {
  state.loading = true; state.error = ''; bump();
  try {
    await Promise.all(COLS.map(async c => { S[c] = (await loadAll(TABLES[c].table)).map(r => fromRow(c, r)); }));
    if (state.me && state.me.rolle !== 'leietaker') {
      S.profiles = await loadAll('profiles');
      S.tilganger = await loadAll('eiendom_tilgang');
    }
  } catch (e: any) { state.error = 'Kunne ikke laste data: ' + feiltekst(e); }
  state.loading = false; bump();
  if (channel) sb.removeChannel(channel);
  channel = sb.channel('endringer');
  COLS.forEach(c => channel.on('postgres_changes', { event: '*', schema: 'public', table: TABLES[c].table }, (p: any) => {
    if (p.eventType === 'DELETE') apply(c, 'delete', { id: p.old.id }); else apply(c, 'upsert', fromRow(c, p.new));
  }));
  channel.on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, (p: any) => {
    if (p.eventType === 'DELETE') apply('profiles', 'delete', { id: p.old.id }); else { apply('profiles', 'upsert', p.new); if (p.new.id === state.me?.id) setMe(p.new); }
  });
  channel.on('postgres_changes', { event: '*', schema: 'public', table: 'eiendom_tilgang' }, () => { reloadTilgang(); });
  channel.subscribe();
}
let tilgT: any = 0;
function reloadTilgang() { clearTimeout(tilgT); tilgT = setTimeout(async () => { const prev = S.tilganger.filter(t => t.user_id === state.me?.id).length; S.tilganger = await loadAll('eiendom_tilgang'); const now = S.tilganger.filter(t => t.user_id === state.me?.id).length; if (prev !== now && state.me?.rolle !== 'admin') loadData(); else bump(); }, 400); }
function setMe(p: any) {
  const prevRolle = state.me?.rolle;
  state.me = { id: p.id, epost: p.epost, navn: p.navn, rolle: p.aktiv ? p.rolle : 'ingen', leietakerId: p.leietaker_id, aktiv: p.aktiv };
  bump(); if (prevRolle && prevRolle !== state.me.rolle) loadData();
}
let loadedFor = '';
export async function loadMe() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { state.me = null; state.ready = true; bump(); return; }
  const { data, error } = await sb.from('profiles').select('*').eq('id', session.user.id).single();
  if (error || !data) { state.me = { id: session.user.id, epost: session.user.email || '', navn: '', rolle: 'ingen', aktiv: false }; }
  else setMe(data);
  state.ready = true; bump();
  if (state.me && state.me.rolle !== 'ingen' && loadedFor !== state.me.id + state.me.rolle) { loadedFor = state.me.id + state.me.rolle; loadData(); }
}
export function initAuth() {
  if (!configured) { state.ready = true; bump(); return; }
  sb.auth.onAuthStateChange((ev) => {
    if (ev === 'PASSWORD_RECOVERY') { state.recovery = true; bump(); }
    if (ev === 'SIGNED_IN' || ev === 'SIGNED_OUT' || ev === 'USER_UPDATED') setTimeout(loadMe, 0);
  });
  loadMe();
}
export async function signOut() { if (channel) sb.removeChannel(channel); await sb.auth.signOut(); COLS.forEach(c => S[c] = []); S.profiles = []; S.tilganger = []; state.me = null; loadedFor = ''; bump(); location.hash = ''; }

// ---- roller (styrer hva som vises; databasen håndhever tilgangen)
export const role = () => state.me?.rolle || 'ingen';
export const isAdmin = () => role() === 'admin';
export const canEdit = () => role() === 'admin' || role() === 'forvalter';
export const isStaff = () => ['admin', 'forvalter', 'tekniker'].includes(role());
export const isTenant = () => role() === 'leietaker';

// ---- filer (privat bøtte «filer»)
const MIME: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', txt: 'text/plain', csv: 'text/csv', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', doc: 'application/msword', xls: 'application/vnd.ms-excel', dwg: 'application/acad', msg: 'application/vnd.ms-outlook', eml: 'message/rfc822' };
export type Fil = { path: string; navn: string; type?: string; str?: number };
export async function uploadFile(file: Blob & { name?: string }, eiendomId: string, leietakerId?: string, navn?: string): Promise<Fil | null> {
  const name = navn || file.name || 'fil';
  const ext = (name.split('.').pop() || '').toLowerCase();
  const safe = name.replace(/[^\w.\-æøåÆØÅ]+/g, '_').slice(-80);
  const path = `${eiendomId}/${leietakerId ? 'leietaker/' + leietakerId : 'felles'}/${crypto.randomUUID()}-${safe}`;
  const { error } = await sb.storage.from('filer').upload(path, file, { contentType: file.type || MIME[ext] || 'application/octet-stream', upsert: false });
  if (error) { toast('Opplasting feilet: ' + feiltekst(error)); return null; }
  return { path, navn: name, type: file.type || MIME[ext], str: file.size };
}
export async function deleteFile(f?: Fil) { if (f?.path) await sb.storage.from('filer').remove([f.path]); }
const urlCache: Record<string, { u: string; t: number }> = {};
export async function fileUrl(path: string) {
  const c = urlCache[path]; if (c && Date.now() - c.t < 50 * 60 * 1000) return c.u;
  const { data, error } = await sb.storage.from('filer').createSignedUrl(path, 3600);
  if (error || !data) return '';
  urlCache[path] = { u: data.signedUrl, t: Date.now() }; return data.signedUrl;
}

// ---- brukeradministrasjon (Netlify-funksjon med service-nøkkel)
export async function adminApi(body: any) {
  const { data: { session } } = await sb.auth.getSession();
  const r = await fetch('/.netlify/functions/brukere', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (session?.access_token || '') }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Feil ' + r.status);
  return j;
}
export async function reloadAdmin() { S.profiles = await loadAll('profiles'); S.tilganger = await loadAll('eiendom_tilgang'); bump(); }
