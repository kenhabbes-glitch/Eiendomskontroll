const mfaS = () => { try { return JSON.parse(localStorage.getItem('mockMfa') || '') } catch { return { factors: [], aal: 'aal1', kreves: false }; } }; const mfaW = M => localStorage.setItem('mockMfa', JSON.stringify(M));
// Etterligning av Supabase-klienten for skjermbildetestene (tests/nettleser). Data ligger i nettleserens localStorage («mockdb»).
// Ingen tilgangsregler: testene her gjelder skjermbildene, ikke sikkerheten (den testes i tests/*.test.ts).
const saved = JSON.parse(localStorage.getItem('mockdb') || 'null');
const db = saved || { profiles: [], eiendom_tilgang: [] }; let nr = +(localStorage.getItem('mocknr') || 0);
const persist = () => { localStorage.setItem('mockdb', JSON.stringify(db)); localStorage.setItem('mocknr', nr); }; const files = {};
const now = () => new Date().toISOString();
const ROLE = localStorage.getItem('mockRolle') || 'admin';
const me = { id: 'u-me', epost: 'test@example.no', navn: 'Test Bruker', rolle: ROLE, aktiv: true, leietaker_id: localStorage.getItem('mockLt') || null, created_at: now() };
db.profiles = db.profiles.filter(p => p.id !== me.id); db.profiles.push({ ...me, plattform_admin: ROLE === 'admin' });
if (!db.organisasjoner) { db.organisasjoner = [{ id: 'org-eier', navn: 'Testeier AS', type: 'eier', aktiv: true, opprettet: now() }, { id: 'org-fv', navn: 'Forvalter AS', type: 'forvalter', orgnr: '999888777', aktiv: true, opprettet: now() }]; }
if (!db.org_medlem) { db.org_medlem = ROLE === 'admin' || ROLE === 'forvalter' ? [{ org_id: 'org-eier', user_id: me.id, rolle: ROLE === 'admin' ? 'admin' : 'forvalter', alle_bygg: true, aktiv: true }] : []; }
db.portefoljer = db.portefoljer || []; db.oppdrag = db.oppdrag || [];
let session = localStorage.getItem('mockLogout') ? null : { user: { id: me.id, email: me.epost }, access_token: 'x' };
const listeners = [];
class Q {
  constructor(t) { this.t = t; this.op = 'select'; this.f = []; this.row = null; this.one = false; }
  select() { return this; } insert(r) { this.op = 'insert'; this.row = r; return this; } update(r) { this.op = 'update'; this.row = r; return this; }
  delete() { this.op = 'delete'; return this; } upsert(r) { this.op = 'upsert'; this.row = r; return this; }
  eq(k, v) { this.f.push(x => x[k] === v); return this; } in(k, a) { this.f.push(x => a.includes(x[k])); return this; }
  range() { return this; } limit() { return this; } single() { this.one = true; return this; } maybeSingle() { this.one = true; return this; } order() { return this; }
  then(res, rej) { try { const r = this.exec(); persist(); res(r); } catch (e) { rej(e); } }
  exec() {
    const T = db[this.t] = db[this.t] || [];
    const m = x => this.f.every(f => f(x));
    const clean = r => { const o = {}; for (const k in r) if (r[k] !== undefined) o[k] = r[k]; return o; };
    if (this.op === 'select') { const d = T.filter(m); return { data: this.one ? d[0] || null : d, error: this.one && !d[0] ? { message: 'not found' } : null }; }
    if (this.op === 'insert' || this.op === 'upsert') {
      const rows = (Array.isArray(this.row) ? this.row : [this.row]).map(r => { const o = { created_at: now(), updated_at: now(), ...clean(r) }; if (!o.id && this.t !== 'eiendom_tilgang' && this.t !== 'innstillinger') o.id = crypto.randomUUID(); if (this.t === 'avvik' && !o.nr) o.nr = ++nr; return o; });
      rows.forEach(o => { const i = this.t === 'eiendom_tilgang' ? -1 : this.t === 'innstillinger' ? T.findIndex(x => x.nokkel === o.nokkel) : T.findIndex(x => x.id === o.id); if (i >= 0) T[i] = { ...T[i], ...o }; else T.push(o); });
      return { data: this.one ? rows[0] : rows, error: null };
    }
    if (this.op === 'update') { const d = T.filter(m); d.forEach(x => Object.assign(x, clean(this.row), { updated_at: now() })); return { data: this.one ? d[0] : d, error: null }; }
    if (this.op === 'delete') { const keep = T.filter(x => !m(x)); db[this.t] = keep; return { data: null, error: null }; }
  }
}
export function createClient() {
  return {
    from: t => new Q(t),
    functions: { invoke: async (n, o) => { await new Promise(r => setTimeout(r, 300)); return { data: { resultat: { produkt: 'Eaton CEAG ZB-S 24', levetid: { aar: 20, min: null, max: null, type: 'teknisk', kilde_url: 'https://example.com/datablad', kommentar: 'Sentral; batterier 4–5 år' }, utskifting: { belop_nok: 185000, omfang: 'Ny sentral inkl. montasje', kilde_url: 'https://example.com/pris', kommentar: '' }, retrofit: { belop_nok: 45000, omfang: 'Batteribytte + ny styring', kilde_url: null, kommentar: '' }, vedlikehold: [{ oppgave: 'Filterbytte tilluft/avtrekk', intervall_n: 6, intervall_enhet: 'mnd', utfores: 'Ventilasjonsfirma', kilde_url: 'https://example.com/fdv' }, { oppgave: 'Rengjøring og kontroll av rotorgjenvinner', intervall_n: 1, intervall_enhet: 'år', utfores: 'Ventilasjonsfirma', kilde_url: null }], usikkerhet: 'middels', notat: 'Kontroller mot tilbud.' }, kilder: [{ url: 'https://example.com/datablad', title: 'Datablad ZB-S' }] }, error: null }; } },
    rpc: async (name, a) => {
      if (name === 'bekreft_plikt') { const l = db.leietakere.find(x => x.id === me.leietaker_id); const p = (l.data.plikter || []).find(p => p.key === a.p_key); persist; Object.assign(p, { sist: a.p_dato, komm: a.p_kommentar, form: 'Bekreftet av leietaker', dokId: a.p_dok, bekreftetAvLeietaker: true }); persist(); }
      if (name === 'send_inn_plikt') { const l = db.leietakere.find(x => x.id === me.leietaker_id); const p = (l.data.plikter || []).find(p => p.key === a.p_key); Object.assign(p, { status: 'til_godkjenning', innsendt: { dato: a.p_dato, komm: a.p_kommentar, dokId: a.p_dok, sjekk: a.p_sjekk, tid: now(), av: me.navn }, tilbakemelding: null }); persist(); }
      if (name === 'nokkel_utkvitter') { const N = db.nokler.filter(n => a.p_nokler.includes(n.id)); if (N.length !== a.p_nokler.length || N.some(n => n.status !== 'inne')) return { data: null, error: { message: 'En eller flere av nøklene er ikke lenger ledige. Last siden på nytt.' } };
        db.nokkelutkvitteringer = db.nokkelutkvitteringer || []; const nr = Math.max(0, ...db.nokkelutkvitteringer.filter(u => u.eiendom_id === a.p_eiendom).map(u => u.nr)) + 1; const T = db.nokkeltyper;
        const u = { id: crypto.randomUUID(), eiendom_id: a.p_eiendom, system_id: a.p_system, nr, created_at: now(), data: { ...a.p_data, nokler: N.map(n => ({ id: n.id, type: T.find(t => t.id === n.type_id).kode, lopenr: n.lopenr })) } }; db.nokkelutkvitteringer.push(u);
        N.forEach(n => { n.status = 'ute'; n.data = { ...n.data, innehaver: a.p_data.person, utkvitteringId: u.id, utkvNr: nr, dato: a.p_data.dato, forventetRetur: a.p_data.forventetRetur || null, logg: [...(n.data.logg || []), { dato: now(), tekst: 'Utkvittert' }] }; }); persist(); return { data: u, error: null }; }
      if (name === 'nokkel_avslutt') { const N = db.nokler.filter(n => a.p_nokler.includes(n.id)); if (N.some(n => n.status !== 'ute')) return { data: null, error: { message: 'En eller flere av nøklene er allerede levert inn.' } };
        N.forEach(n => { const u = db.nokkelutkvitteringer.find(x => x.id === n.data.utkvitteringId); if (u) u.data.nokler = u.data.nokler.map(k => k.id === n.id ? { ...k, retur: { dato: a.p_dato, mottattAv: a.p_av, tapt: a.p_status === 'tapt' } } : k);
          const { innehaver, utkvitteringId, utkvNr, dato, forventetRetur, ...rest } = n.data; n.status = a.p_status; n.data = { ...rest, sistHos: a.p_status === 'tapt' ? innehaver : null, logg: [...(rest.logg || []), { dato: now(), tekst: a.p_status }] }; }); persist(); return { data: N.length, error: null }; }
      if (name === 'oppdater_min_profil') me.navn = a.p_navn;
      if (name === 'mfa_status') { const M = mfaS(); return { data: { kreves: M.kreves, har: M.factors.some(f => f.status === 'verified'), aal: M.aal }, error: null }; }
      if (name === 'mfa_oversikt') { const M = mfaS(); return { data: db.org_medlem.filter(m => m.org_id === a.p_org).map(m => ({ user_id: m.user_id, har_mfa: m.user_id === me.id ? M.factors.some(f => f.status === 'verified') : false })), error: null }; }
      if (name === 'mine_tilganger') return { data: (db.eiendommer || []).map(e => ({ eiendom_id: e.id, niva: ROLE === 'tekniker' ? 'drift' : 'skriv' })), error: null };
      if (name === 'mine_moduler') { if (!db.org_modul) return { data: null, error: { message: 'function mine_moduler does not exist' } }; return { data: db.org_modul.filter(r => r.aktiv !== false), error: null }; }
      if (name === 'min_primar_org') return { data: db.org_medlem.find(m => m.user_id === me.id)?.org_id || null, error: null };
      if (name === 'finn_org') return { data: db.organisasjoner.filter(o => (o.orgnr || '') === String(a.p_orgnr).replace(/\D/g, '')), error: null };
      return { data: null, error: null };
    },
    auth: {
      getSession: async () => ({ data: { session } }),
      onAuthStateChange: cb => { listeners.push(cb); return { data: { subscription: { unsubscribe() {} } } }; },
      signInWithPassword: async () => { session = { user: { id: me.id, email: me.epost } }; localStorage.removeItem('mockLogout'); listeners.forEach(f => f('SIGNED_IN')); return { error: null }; },
      signOut: async () => { session = null; localStorage.setItem('mockLogout', '1'); return { error: null }; },
      updateUser: async () => ({ error: null }), resetPasswordForEmail: async () => ({ error: null }),
      refreshSession: async () => ({ data: {}, error: null }),
      mfa: {
        getAuthenticatorAssuranceLevel: async () => { const M = mfaS(); return { data: { currentLevel: M.aal, nextLevel: M.factors.some(f => f.status === 'verified') ? 'aal2' : M.aal }, error: null }; },
        listFactors: async () => { const M = mfaS(); return { data: { all: M.factors, totp: M.factors.filter(f => f.status === 'verified') }, error: null }; },
        enroll: async () => { const M = mfaS(); const f = { id: 'f' + Date.now(), status: 'unverified', factor_type: 'totp' }; M.factors.push(f); mfaW(M); return { data: { id: f.id, totp: { qr_code: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>', secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://x' } }, error: null }; },
        challengeAndVerify: async ({ factorId, code }) => { if (code !== '123456') return { error: { message: 'Invalid TOTP code entered' } }; const M = mfaS(); M.factors.forEach(f => { if (f.id === factorId) f.status = 'verified'; }); M.aal = 'aal2'; mfaW(M); return { data: {}, error: null }; },
        unenroll: async ({ factorId }) => { const M = mfaS(); M.factors = M.factors.filter(f => f.id !== factorId); mfaW(M); return { error: null }; },
      },
    },
    storage: { from: () => ({
      upload: async (path, file) => { files[path] = URL.createObjectURL(file); return { error: null }; },
      createSignedUrl: async path => ({ data: { signedUrl: files[path] || (/\.(png|jpe?g)$/i.test(path) ? '/plan.png' : '') }, error: null }),
      download: async path => files[path] ? { data: await (await fetch(files[path])).blob(), error: null } : { data: null, error: { message: 'not found' } },
      remove: async () => ({ error: null }),
    }) },
    channel: () => { const c = { on: () => c, subscribe: () => c }; return c; }, removeChannel: () => {},
  };
}
window.__mockdb = db;
