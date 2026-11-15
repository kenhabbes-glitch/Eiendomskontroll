// Sesongavhengige kontroller (f.eks. snø og is på tak): kontrollen har bare frister i sesongen.
// Sesongen angis med måneder 1–12 og kan gå over nyttår (november–april = { fra: 11, til: 4 }).
export type Sesong = { fra: number; til: number };
const gyldig = (s?: Sesong | null): s is Sesong => !!s && s.fra >= 1 && s.fra <= 12 && s.til >= 1 && s.til <= 12;
const mnd = (dato: string) => +dato.slice(5, 7);
export function iSesong(dato: string, s?: Sesong | null): boolean {
  if (!gyldig(s) || !dato) return true; const m = mnd(dato);
  return s.fra <= s.til ? m >= s.fra && m <= s.til : m >= s.fra || m <= s.til;
}
/** Datoen selv når den er i sesong, ellers første dag i neste sesong. */
export function tilSesong(dato: string, s?: Sesong | null): string {
  if (!dato || iSesong(dato, s)) return dato;
  const aar = +dato.slice(0, 4) + (mnd(dato) > s!.fra ? 1 : 0);
  return `${aar}-${String(s!.fra).padStart(2, '0')}-01`;
}
export const MND_KORT = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];
export const sesongTxt = (s?: Sesong | null) => gyldig(s) ? `${MND_KORT[s.fra - 1]}–${MND_KORT[s.til - 1]}` : '';
