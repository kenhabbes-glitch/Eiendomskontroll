// Geometri for 3D-måling og -tegning (alle koordinater i meter, Y opp).
export type V3 = [number, number, number];
export const avst = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const horisontalt = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[2] - b[2]);
export const lengde = (p: V3[], lukket = false) => { let s = 0; for (let i = 1; i < p.length; i++) s += avst(p[i - 1], p[i]); if (lukket && p.length > 2) s += avst(p[p.length - 1], p[0]); return s; };
/** Areal av en plan flate i rommet (Newell) – riktig også for skrå og loddrette flater. */
export function areal(p: V3[]) { let x = 0, y = 0, z = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; x += (a[1] - b[1]) * (a[2] + b[2]); y += (a[2] - b[2]) * (a[0] + b[0]); z += (a[0] - b[0]) * (a[1] + b[1]); } return Math.hypot(x, y, z) / 2; }
/** Vinkel i grader i punkt b mellom a–b og c–b. */
export function vinkel(a: V3, b: V3, c: V3) { const u = [a[0] - b[0], a[1] - b[1], a[2] - b[2]], v = [c[0] - b[0], c[1] - b[1], c[2] - b[2]]; const d = u[0] * v[0] + u[1] * v[1] + u[2] * v[2]; const n = Math.hypot(u[0], u[1], u[2]) * Math.hypot(v[0], v[1], v[2]); return n ? Math.acos(Math.max(-1, Math.min(1, d / n))) * 180 / Math.PI : 0; }
/** Avstand fra punkt til linjestykke (for å velge en tegning ved klikk). */
export const midt = (p: V3[]): V3 => { const n = p.length || 1; return [p.reduce((s, q) => s + q[0], 0) / n, p.reduce((s, q) => s + q[1], 0) / n, p.reduce((s, q) => s + q[2], 0) / n]; };

/** Kalibrering av en plantegning mot modellen: to punkter på tegningen (piksler) og de samme to i 3D. Gir tegning→(X,Z) og høyde.
 *  sp = speilvendt (hvis tegningens y-akse går motsatt vei av modellens Z). */
export type Kal = { p: [number, number][]; m: V3[]; sp?: boolean };
export type KalMat = { a: number; b: number; e: number; f: number; sp: boolean; y: number };
export function kalMat(k: Kal): KalMat | null {
  const sp = !!k.sp; const P = k.p.map(q => [q[0], sp ? -q[1] : q[1]]); const Q = k.m.map(q => [q[0], q[2]]);
  const dpx = P[1][0] - P[0][0], dpy = P[1][1] - P[0][1], dqx = Q[1][0] - Q[0][0], dqy = Q[1][1] - Q[0][1]; const n2 = dpx * dpx + dpy * dpy; if (n2 < 1e-9 || dqx * dqx + dqy * dqy < 1e-9) return null;
  const a = (dqx * dpx + dqy * dpy) / n2, b = (dqy * dpx - dqx * dpy) / n2;
  return { a, b, e: Q[0][0] - (a * P[0][0] - b * P[0][1]), f: Q[0][1] - (b * P[0][0] + a * P[0][1]), sp, y: (k.m[0][1] + k.m[1][1]) / 2 };
}
export function tilModell(M: KalMat, px: number, py: number, løft = 1): V3 { const y = M.sp ? -py : py; return [M.a * px - M.b * y + M.e, M.y + løft, M.b * px + M.a * y + M.f]; }
export const meterPerPiksel = (M: KalMat) => Math.hypot(M.a, M.b);
