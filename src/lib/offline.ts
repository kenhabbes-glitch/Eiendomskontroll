// Lokal lagring for arbeid uten nett (IndexedDB i nettleseren):
//  * utkast  – befaringer slik de er på enheten, med flagg for usynkede endringer
//  * filer   – bilder tatt under befaringen som ikke er lastet opp ennå
//  * tegn    – nedlastede tegninger (bildefilen), så de kan vises uten nett
//  * snap    – kopi av sist lastede data, så appen kan startes uten nett
// Ingenting her sendes noe sted før enheten er på nett og brukeren er innlogget.
const DB = 'ek-offline', VER = 1;
let dbP: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (dbP) return dbP;
  dbP = new Promise((res, rej) => {
    const r = indexedDB.open(DB, VER);
    r.onupgradeneeded = () => { const d = r.result; ['utkast', 'filer', 'tegn', 'snap'].forEach(s => { if (!d.objectStoreNames.contains(s)) d.createObjectStore(s); }); };
    r.onsuccess = () => res(r.result); r.onerror = () => { dbP = null; rej(r.error); };
  });
  return dbP;
}
async function tx<T>(store: string, mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<any> | void): Promise<T> {
  const d = await db();
  return new Promise((res, rej) => { const t = d.transaction(store, mode); const s = t.objectStore(store); const q = f(s); let v: any;
    if (q) q.onsuccess = () => { v = q.result; }; t.oncomplete = () => res(v); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
}
export const idbGet = <T = any>(store: string, key: string) => tx<T | undefined>(store, 'readonly', s => s.get(key)).catch(() => undefined);
export const idbPut = (store: string, key: string, v: any) => tx<void>(store, 'readwrite', s => s.put(v, key));
export const idbDel = (store: string, key: string) => tx<void>(store, 'readwrite', s => s.delete(key)).catch(() => undefined);
export async function idbAlle<T = any>(store: string): Promise<{ key: string; v: T }[]> {
  const d = await db().catch(() => null); if (!d) return [];
  return new Promise(res => { const out: { key: string; v: T }[] = []; const t = d.transaction(store, 'readonly'); const c = t.objectStore(store).openCursor();
    c.onsuccess = () => { const cur = c.result; if (cur) { out.push({ key: String(cur.key), v: cur.value }); cur.continue(); } }; t.oncomplete = () => res(out); t.onerror = () => res(out); });
}

// ---------- nettstatus
export const paaNett = () => typeof navigator === 'undefined' || navigator.onLine !== false;

// ---------- lokale filer (bilder) – referanse { lokal: nøkkel, navn, type }
export type LokalFil = { lokal: string; navn: string; type: string; str?: number };
export async function lagreLokalFil(blob: Blob, navn: string): Promise<LokalFil> {
  const k = crypto.randomUUID(); await idbPut('filer', k, { blob, navn, type: blob.type, t: Date.now() });
  return { lokal: k, navn, type: blob.type || 'application/octet-stream', str: blob.size };
}
export async function hentLokalFil(k: string): Promise<Blob | null> { const r = await idbGet<any>('filer', k); return r?.blob || null; }
/** Husk at en lokal fil er lastet opp (så den ikke lastes opp på nytt) */
export async function merkOpplastet(k: string, fil: any) { const r = await idbGet<any>('filer', k); if (r) await idbPut('filer', k, { ...r, fil }); }
export async function opplastetSom(k: string): Promise<any> { return (await idbGet<any>('filer', k))?.fil || null; }
const urlC: Record<string, string> = {};
export async function lokalUrl(k: string) { if (urlC[k]) return urlC[k]; const b = await hentLokalFil(k); if (!b) return ''; return (urlC[k] = URL.createObjectURL(b)); }

/** Skalerer ned bilder fra kamera (sparer lagring og opplasting). Andre filer returneres uendret. */
export async function komprimer(f: File, maks = 1800): Promise<Blob> {
  if (!/^image\/(jpeg|png|webp)/.test(f.type)) return f;
  try {
    const bmp = await createImageBitmap(f); const s = Math.min(1, maks / Math.max(bmp.width, bmp.height));
    if (s >= 1 && f.size < 900_000) return f;
    const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * s); cv.height = Math.round(bmp.height * s);
    cv.getContext('2d')!.drawImage(bmp, 0, 0, cv.width, cv.height);
    return await new Promise<Blob>(res => cv.toBlob(b => res(b || f), 'image/jpeg', 0.82));
  } catch { return f; }
}

// ---------- tegninger lagret på enheten
export async function tegningBlob(path: string, hent: () => Promise<string>): Promise<Blob | null> {
  const c = await idbGet<any>('tegn', path); if (c?.blob) return c.blob;
  if (!paaNett()) return null;
  try { const u = await hent(); if (!u) return null; const r = await fetch(u); if (!r.ok) return null; const b = await r.blob(); await idbPut('tegn', path, { blob: b, t: Date.now() }).catch(() => { }); return b; }
  catch { return null; }
}
const tUrl: Record<string, string> = {};
export async function tegningUrl(path: string, hent: () => Promise<string>) {
  if (tUrl[path]) return tUrl[path]; const b = await tegningBlob(path, hent); if (b) return (tUrl[path] = URL.createObjectURL(b));
  return paaNett() ? await hent() : '';
}
export async function harTegningLokalt(path: string) { return !!(await idbGet<any>('tegn', path))?.blob; }

// ---------- utkast av befaringer
export type Utkast = { rec: any; usynket: boolean; endret: number; feil?: string };
export const hentUtkast = (id: string) => idbGet<Utkast>('utkast', id);
export const lagreUtkast = (id: string, u: Utkast) => idbPut('utkast', id, u);
export const slettUtkast = (id: string) => idbDel('utkast', id);
export const alleUtkast = () => idbAlle<Utkast>('utkast');

// ---------- datakopi for oppstart uten nett
export const lagreSnap = (v: any) => idbPut('snap', 'S', { v, t: Date.now() }).catch(() => { });
export const hentSnap = () => idbGet<{ v: any; t: number }>('snap', 'S');
export async function tomAlt() { for (const s of ['utkast', 'filer', 'tegn', 'snap']) { const a = await idbAlle(s); for (const x of a) await idbDel(s, x.key); } }
