// Regler for å sende inn endringer som er gjort uten nett. Ren logikk uten nettleser eller database, så den kan testes.
//
// Hver endring i køen har raden slik den ser ut lokalt («obj») og slik den så ut før endringen («base»; mangler for nye rader).
// Når køen sendes, hentes raden slik den er på serveren nå, og bare feltene som faktisk ble endret lokalt legges oppå.
// Slik overskriver ikke en tekniker uten nett det en kollega har gjort i mellomtiden på andre felt.
export type R = { [k: string]: any };
export type KoPost = { col: string; obj: R; tid: number; base?: R | null; feil?: string; forsok?: number };

const lik = (a: any, b: any) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
/** Felt som appen selv setter og som ikke skal sendes */
const LOKALE = ['usynket', 'opprettet', 'endret', 'opprettetAv'];

/** Lister der det legges til oppføringer (historikk, logg): behold serverens og legg til de som er nye lokalt, i samme ende som lokalt. */
function flettListe(base: any[], lokal: any[], server: any[]): any[] {
  const iBase = new Set(base.map(x => JSON.stringify(x))); const iServer = new Set(server.map(x => JSON.stringify(x)));
  const nye = lokal.filter(x => !iBase.has(JSON.stringify(x)) && !iServer.has(JSON.stringify(x)));
  if (!nye.length) return server;
  const forst = lokal.length > 0 && !iBase.has(JSON.stringify(lokal[0]));
  return forst ? [...nye, ...server] : [...server, ...nye];
}
const erLoggliste = (base: any, lokal: any, server: any) => Array.isArray(lokal) && Array.isArray(server) && (base == null || Array.isArray(base))
  && lokal.every(x => x && typeof x === 'object') && (base || []).every((x: any) => lokal.some((y: any) => lik(x, y))); // ingenting fjernet lokalt

/** Legger de lokale endringene (forskjellen mellom base og lokal) oppå raden slik den er på serveren. */
export function flett(base: R, lokal: R, server: R): R {
  const ut: R = { ...server };
  for (const k of new Set([...Object.keys(lokal), ...Object.keys(base)])) {
    if (LOKALE.includes(k) || k === 'id') continue;
    if (lik(lokal[k], base[k])) continue; // ikke endret lokalt: serverens verdi gjelder
    ut[k] = erLoggliste(base[k], lokal[k], server[k]) ? flettListe(base[k] || [], lokal[k], server[k]) : lokal[k];
  }
  return ut;
}
/** Feltene som ble endret både lokalt og på serveren – til informasjon etter synk. */
export function konflikter(base: R, lokal: R, server: R): string[] {
  return Object.keys(lokal).filter(k => !LOKALE.includes(k) && k !== 'id' && !lik(lokal[k], base[k]) && !lik(server[k], base[k]) && !lik(server[k], lokal[k]) && !erLoggliste(base[k], lokal[k], server[k]));
}

/** Legger en endring i køen. Flere endringer på samme rad slås sammen: første «base» beholdes, siste «obj» gjelder. */
export function koSett(eks: KoPost | undefined, ny: KoPost): KoPost {
  if (!eks) return ny;
  return { col: ny.col, obj: ny.obj, tid: eks.tid, base: eks.base ?? null };
}
export const koNokkel = (col: string, id: string) => col + ':' + id;
export const rens = (o: R): R => { const x = { ...o }; delete x.usynket; return x; };

/** Finner alle lokale filer ({ lokal: nøkkel }) i en rad, uansett hvor dypt de ligger. */
export function lokaleFiler(v: any, ut: string[] = []): string[] {
  if (Array.isArray(v)) v.forEach(x => lokaleFiler(x, ut));
  else if (v && typeof v === 'object') { if (typeof v.lokal === 'string') ut.push(v.lokal); else Object.values(v).forEach(x => lokaleFiler(x, ut)); }
  return ut;
}
/** Bytter ut lokale filer med de opplastede. Filer som ikke er lastet opp ennå, blir stående. */
export function byttFiler<T>(v: T, opplastet: Record<string, any>): T {
  if (Array.isArray(v)) return v.map(x => byttFiler(x, opplastet)) as any;
  if (v && typeof v === 'object') { const o = v as any; if (typeof o.lokal === 'string') return opplastet[o.lokal] ?? v;
    return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, byttFiler(x, opplastet)])) as any; }
  return v;
}
/** Feil som betyr «ikke kontakt med serveren» – da prøves det igjen senere uten å plage brukeren. */
export const erNettfeil = (e: any) => /failed to fetch|networkerror|load failed|network request failed|fetch failed|timeout/i.test(String(e?.message || e || ''));
