// En liten etterligning av Supabase-klienten for tester av serverfunksjonene.
// Tabeller ligger i minnet, og alle kall til brukeradministrasjonen (auth.admin) logges i «kall».
export type Db = Record<string, any[]>;
const inneholder = (a: any, b: any): boolean => Array.isArray(b) ? Array.isArray(a) && b.every(x => a.some(y => inneholder(y, x))) : b && typeof b === 'object' ? !!a && typeof a === 'object' && Object.keys(b).every(k => inneholder(a[k], b[k])) : a === b;
export function lagFalsk(db: Db, brukere: Record<string, { id: string; email: string; user_metadata?: any; faktorer?: string[] }>, tokens: Record<string, string>, valg: { niva?: Record<string, Record<string, string>>; filer?: Record<string, number>; opplastingFeiler?: boolean; invitasjonFeiler?: any } = {}) {
  const kall: { hva: string; arg: any }[] = [];
  const sporring = (tabell: string) => {
    const filtre: ((r: any) => boolean)[] = []; let modus = 'select', nytt: any = null, hode = false;
    const rader = () => (db[tabell] ||= []).filter(r => filtre.every(f => f(r)));
    const utfor = (en?: 'single' | 'maybe') => {
      const T = (db[tabell] ||= []);
      if (modus === 'insert') { const n = (Array.isArray(nytt) ? nytt : [nytt]).map(x => ({ id: 'ny-' + (T.length + 1), ...x })); T.push(...n); return { data: en ? n[0] : n, error: null }; }
      if (modus === 'upsert') { const n = Array.isArray(nytt) ? nytt : [nytt];
        for (const x of n) { const i = T.findIndex(r => (x.id && r.id === x.id) || (x.org_id && x.user_id && r.org_id === x.org_id && r.user_id === x.user_id)); if (i >= 0) T[i] = { ...T[i], ...x }; else T.push(x); }
        return { data: en ? n[0] : n, error: null }; }
      if (modus === 'update') { rader().forEach(r => Object.assign(r, nytt)); return { data: null, error: null }; }
      if (modus === 'delete') { const bort = new Set(rader()); db[tabell] = T.filter(r => !bort.has(r)); return { data: null, error: null }; }
      const R = rader(); if (hode) return { data: null, count: R.length, error: null };
      return { data: en ? R[0] ?? null : R, error: en === 'single' && !R[0] ? { message: 'ingen rad' } : null };
    };
    const b: any = {
      select: (_k?: string, o?: any) => { if (o?.head) hode = true; return b; },
      insert: (x: any) => { modus = 'insert'; nytt = x; return b; }, upsert: (x: any) => { modus = 'upsert'; nytt = x; return b; },
      update: (x: any) => { modus = 'update'; nytt = x; return b; }, delete: () => { modus = 'delete'; return b; },
      eq: (k: string, v: any) => { filtre.push(r => r[k] === v); return b; }, neq: (k: string, v: any) => { filtre.push(r => r[k] !== v); return b; },
      in: (k: string, v: any[]) => { filtre.push(r => v.includes(r[k])); return b; }, gte: (k: string, v: any) => { filtre.push(r => r[k] >= v); return b; }, lte: (k: string, v: any) => { filtre.push(r => r[k] <= v); return b; },
      contains: (k: string, v: any) => { filtre.push(r => inneholder(r[k], v)); return b; }, is: (k: string, v: any) => { filtre.push(r => (r[k] ?? null) === v); return b; },
      order: () => b, limit: () => b,
      single: async () => utfor('single'), maybeSingle: async () => utfor('maybe'),
      then: (ok: any, feil: any) => Promise.resolve(utfor()).then(ok, feil),
    };
    return b;
  };
  const aktivOrgAdmin = (uid: string, org: string) => (db.org_medlem || []).some(m => m.user_id === uid && m.org_id === org && m.aktiv && m.rolle === 'admin');
  const klient = {
    from: (t: string) => { // «organisasjoner!inner(aktiv)» i org_medlem-oppslaget: legg på organisasjonen
      if (t === 'org_medlem') (db.org_medlem ||= []).forEach(m => { m.organisasjoner = (db.organisasjoner || []).find(o => o.id === m.org_id) || null; });
      return sporring(t); },
    rpc: async (navn: string, a: any) => {
      if (navn === 'mfa_ok_for') return { data: true }; if (navn === 'full_tilgang') return { data: false };
      if (navn === 'niva_for') return { data: valg.niva?.[a.p_uid]?.[a.eid] ?? null }; if (navn === 'org_har') return { data: true };
      return { data: null };
    },
    storage: { from: () => ({
      upload: async (path: string, buf: any, o: any) => { kall.push({ hva: 'opplasting', arg: { path, str: buf.length, type: o?.contentType } }); return valg.opplastingFeiler ? { error: { message: 'full' } } : { data: { path }, error: null }; },
      createSignedUploadUrl: async (path: string) => { kall.push({ hva: 'signertOpplasting', arg: path }); return { data: { token: 'opplasting', path }, error: null }; },
      createSignedUrl: async (path: string) => { kall.push({ hva: 'signertLenke', arg: path }); return { data: { signedUrl: 'http://fil/' + path }, error: null }; },
      list: async (mappe: string) => ({ data: Array.from({ length: valg.filer?.[mappe] || 0 }, (_, i) => ({ name: 'f' + i })), error: null }),
    }) },
    auth: {
      getUser: async (token: string) => { const id = tokens[token]; return id ? { data: { user: brukere[id] }, error: null } : { data: { user: null }, error: { message: 'ugyldig' } }; },
      admin: {
        getUserById: async (id: string) => ({ data: { user: brukere[id] || null }, error: null }),
        updateUserById: async (id: string, e: any) => { kall.push({ hva: 'updateUserById', arg: { id, ...e } }); return { data: { user: brukere[id] }, error: null }; },
        createUser: async (e: any) => { kall.push({ hva: 'createUser', arg: e }); const id = 'u-ny-' + kall.length; brukere[id] = { id, email: e.email, user_metadata: e.user_metadata }; return { data: { user: brukere[id] }, error: null }; },
        inviteUserByEmail: async (epost: string, o: any) => { kall.push({ hva: 'inviteUserByEmail', arg: { epost, ...o } }); if (valg.invitasjonFeiler) return { data: { user: null }, error: valg.invitasjonFeiler }; const id = 'u-inv-' + kall.length; brukere[id] = { id, email: epost, user_metadata: o?.data }; return { data: { user: brukere[id] }, error: null }; },
        deleteUser: async (id: string) => { kall.push({ hva: 'deleteUser', arg: id }); return { error: null }; },
        mfa: {
          listFactors: async ({ userId }: any) => ({ data: { factors: (brukere[userId]?.faktorer || []).map(id => ({ id })) }, error: null }),
          deleteFactor: async (a: any) => { kall.push({ hva: 'deleteFactor', arg: a }); return { error: null }; },
        },
      },
    },
  };
  return { klient, kall, aktivOrgAdmin };
}
