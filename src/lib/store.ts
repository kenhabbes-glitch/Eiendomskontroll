import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { useSyncExternalStore } from 'react';

// Tåler at adressen er limt inn med /rest/v1, /auth/v1 eller skråstrek til slutt
const rensUrl = (u?: string) => (u || '').trim().replace(/\/(rest|auth|storage)\/v1.*$/i, '').replace(/\/+$/, '');
const URL_ = rensUrl(import.meta.env.VITE_SUPABASE_URL as string | undefined) || undefined;
const KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();
export const configured = !!(URL_ && KEY);
// Må leses før Supabase-klienten fjerner token fra adressen
const FRA_LENKE = /type=(recovery|invite)/.test(location.hash + location.search);
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
};
/** Arkiverte rader (data.arkivert) holdes utenfor de vanlige listene, men finnes for oppslag og arkivsøk */
export const ARKIV: Record<'anlegg' | 'komponenter' | 'oppgaver', any[]> = { anlegg: [], komponenter: [], oppgaver: [] };
const ARK_COLS = ['anlegg', 'komponenter', 'oppgaver'] as const;
const VALGFRIE = ['avlesninger', 'prosjekter'];
export type Col = keyof typeof TABLES;
export const COLS = Object.keys(TABLES) as Col[];

export type Niva = 'skriv' | 'drift' | 'les' | 'service';
export const S: Record<Col, any[]> & { profiles: any[]; tilganger: any[]; innst: Record<string, any>; innstMangler: boolean; orgs: any[]; medlemmer: any[]; portefoljer: any[]; oppdrag: any[]; niva: Record<string, Niva>; primarOrg: string } = {
  eiendommer: [], leietakere: [], anlegg: [], komponenter: [], oppgaver: [], avvik: [], dokumenter: [], tegninger: [], avlesninger: [], prosjekter: [], profiles: [], tilganger: [], innst: {}, innstMangler: false,
  orgs: [], medlemmer: [], portefoljer: [], oppdrag: [], niva: {}, primarOrg: '',
};

export type Me = { id: string; epost: string; navn: string; rolle: Rolle; leietakerId?: string | null; aktiv: boolean; plattform?: boolean };
export const state = { me: null as Me | null, ready: false, loading: false, error: '', recovery: false, version: 0, mfa: '' as '' | 'verifiser' | 'oppsett', mfaEpost: '' };
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
  const r = await fetch('/.netlify/functions/arbeidsordre', { method: 'POST', headers, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Feil ' + r.status);
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
  const o = { ...obj }; const exists = !!o.id && ((S[col] as any[]).some(x => x.id === o.id) || ((ARK_COLS as readonly string[]).includes(col) && ARKIV[col as typeof ARK_COLS[number]].some(x => x.id === o.id)));
  if (!o.id) o.id = crypto.randomUUID();
  const row = toRow(col, o); const t = TABLES[col].table;
  const res = exists
    ? await sb.from(t).update({ ...row, id: undefined }).eq('id', o.id).select().single()
    : col === 'eiendommer'
      // Ny eiendom: tilgangen opprettes av en trigger i samme operasjon og er ikke synlig for RETURNING – lagre først, hent etterpå
      ? await (async () => { const r: any = await sb.from(t).insert(row); return r.error ? r : await sb.from(t).select().eq('id', o.id).single(); })()
      : await sb.from(t).insert(row).select().single();
  if (res.error) { toast('Lagring feilet: ' + feiltekst(res.error)); throw res.error; }
  apply(col, 'upsert', fromRow(col, res.data));
  return o.id;
}
/** Hent én rad på nytt fra databasen (f.eks. etter at en serverfunksjon har endret den) */
export async function refetch(col: Col, id: string) { const { data } = await sb.from(TABLES[col].table).select('*').eq('id', id).maybeSingle(); if (data) apply(col, 'upsert', fromRow(col, data)); }
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
  } catch (e: any) { state.error = 'Kunne ikke laste data: ' + feiltekst(e); }
  state.loading = false; bump();
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
let tilgT: any = 0;
function reloadTilgang() { clearTimeout(tilgT); tilgT = setTimeout(async () => { const prev = S.tilganger.filter(t => t.user_id === state.me?.id).length; S.tilganger = await loadAll('eiendom_tilgang'); const now = S.tilganger.filter(t => t.user_id === state.me?.id).length; if (prev !== now && state.me?.rolle !== 'admin') loadData(); else bump(); }, 400); }
// ---- organisasjoner, porteføljer, oppdrag og tilgangsnivå per eiendom
async function loadOrg() {
  const tryLoad = async (t: string) => { try { return await loadAll(t); } catch { return []; } };
  const [orgs, med, port, opp] = await Promise.all(['organisasjoner', 'org_medlem', 'portefoljer', 'oppdrag'].map(tryLoad));
  S.orgs = orgs; S.medlemmer = med; S.portefoljer = port; S.oppdrag = opp;
  const { data: niv } = await sb.rpc('mine_tilganger'); S.niva = Object.fromEntries((niv || []).map((r: any) => [r.eiendom_id, r.niva]));
  const { data: po } = await sb.rpc('min_primar_org'); S.primarOrg = po || '';
  try { const { lastModuler } = await import('./moduler'); await lastModuler(); } catch { /* ikke tilgjengelig */ }
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
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { state.me = null; state.mfa = ''; state.ready = true; bump(); return; }
  // Tofaktor: kode ved innlogging, eller påkrevd oppsett for administratorer/forvaltere. Databasen stenger data uansett.
  const mfa = await mfaSjekk();
  if (mfa) { state.mfa = mfa; state.mfaEpost = session.user.email || ''; state.me = null; state.ready = true; bump(); return; }
  state.mfa = '';
  const { data, error } = await sb.from('profiles').select('*').eq('id', session.user.id).single();
  if (error || !data) { state.me = { id: session.user.id, epost: session.user.email || '', navn: '', rolle: 'ingen', aktiv: false }; }
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
export async function signOut() { if (channel) sb.removeChannel(channel); await sb.auth.signOut(); COLS.forEach(c => S[c] = []); S.profiles = []; S.tilganger = []; S.orgs = []; S.medlemmer = []; S.portefoljer = []; S.oppdrag = []; S.niva = {}; S.primarOrg = ''; state.me = null; state.mfa = ''; loadedFor = ''; bump(); location.hash = ''; }

// ---- roller (styrer hva som vises; databasen håndhever tilgangen)
export const role = () => state.me?.rolle || 'ingen';
export const isAdmin = () => role() === 'admin' || !!state.me?.plattform;
export const isPlattform = () => !!state.me?.plattform;
// Har redigeringstilgang til minst én eiendom (eller er admin/forvalter i en eierorganisasjon og kan opprette)
export const canEdit = () => (role() === 'admin' || role() === 'forvalter') && (Object.values(S.niva).includes('skriv') || mineOrg(['admin', 'forvalter']).some(o => o.type === 'eier') || !Object.keys(S.niva).length);
export const isStaff = () => ['admin', 'forvalter', 'tekniker'].includes(role());
// Tilgangsnivå på en konkret eiendom (databasen håndhever det samme)
export const nivaE = (eid?: string): Niva | '' => (eid && S.niva[eid]) || '';
export const kanRedigereE = (eid?: string) => nivaE(eid) === 'skriv';
export const kanDrifteE = (eid?: string) => ['skriv', 'drift'].includes(nivaE(eid));
// Mine organisasjoner (med min rolle)
export const mineOrg = (roller?: string[]) => S.medlemmer.filter(m => m.user_id === state.me?.id && m.aktiv && (!roller || roller.includes(m.rolle))).map(m => ({ ...(S.orgs.find(o => o.id === m.org_id) || { id: m.org_id, navn: '?' }), minRolle: m.rolle, alleBygg: m.alle_bygg })).filter(o => o.aktiv !== false);
export const orgNavn = (id?: string) => S.orgs.find(o => o.id === id)?.navn || '';
export const isTenant = () => role() === 'leietaker';
export const isUtforer = () => role() === 'utforer';

// ---- filer (privat bøtte «filer»)
const MIME: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', txt: 'text/plain', csv: 'text/csv', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', doc: 'application/msword', xls: 'application/vnd.ms-excel', dwg: 'application/acad', msg: 'application/vnd.ms-outlook', eml: 'message/rfc822' };
export type Fil = { path: string; navn: string; type?: string; str?: number };
export async function uploadFile(file: Blob & { name?: string }, eiendomId: string, leietakerId?: string, navn?: string, mappe?: string): Promise<Fil | null> {
  const name = navn || file.name || 'fil';
  const ext = (name.split('.').pop() || '').toLowerCase();
  // Lagringen godtar bare ASCII i filbanen – æøå og aksenter gjøres om (originalnavnet beholdes i «navn»)
  const safe = name.replace(/[æÆ]/g, m => m === 'æ' ? 'ae' : 'Ae').replace(/[øØ]/g, m => m === 'ø' ? 'o' : 'O').replace(/[åÅ]/g, m => m === 'å' ? 'a' : 'A')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/_+/g, '_').slice(-80) || 'fil';
  const path = `${eiendomId}/${mappe ? mappe : leietakerId ? 'leietaker/' + leietakerId : 'felles'}/${crypto.randomUUID()}-${safe}`;
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
export async function reloadAdmin() { S.profiles = await loadAll('profiles'); S.tilganger = await loadAll('eiendom_tilgang'); await loadOrg(); bump(); }
