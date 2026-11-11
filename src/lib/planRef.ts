// Omregning mellom to versjoner av samme etasjetegning. Posisjoner lagres som piksler på tegningsbildet; når en ny versjon
// lastes opp finner vi en transformasjon (forskyvning, skala og rotasjon) fra gammel til ny tegning, og flytter alt med.
export type Mat = [number, number, number, number, number, number]; // x' = a·x + c·y + e,  y' = b·x + d·y + f  → [a,b,c,d,e,f]
export type Pt = [number, number];
export type CadRef = { vb: { x: number; y: number; w: number; h: number }; w: number; h: number };

export const bruk = (m: Mat, p: number[]): Pt => [Math.round((m[0] * p[0] + m[2] * p[1] + m[4]) * 10) / 10, Math.round((m[1] * p[0] + m[3] * p[1] + m[5]) * 10) / 10];

/** To punktpar (gammel p1,p2 → ny q1,q2): rotasjon + lik skala + forskyvning. */
export function likhet(p1: Pt, p2: Pt, q1: Pt, q2: Pt): Mat | null {
  const dpx = p2[0] - p1[0], dpy = p2[1] - p1[1], dqx = q2[0] - q1[0], dqy = q2[1] - q1[1]; const n2 = dpx * dpx + dpy * dpy; if (n2 < 1e-6 || dqx * dqx + dqy * dqy < 1e-6) return null;
  const a = (dqx * dpx + dqy * dpy) / n2, b = (dqy * dpx - dqx * dpy) / n2;
  return [a, b, -b, a, q1[0] - (a * p1[0] - b * p1[1]), q1[1] - (b * p1[0] + a * p1[1])];
}
/** Begge tegningene er lest fra DWG med samme koordinatsystem: gammel piksel → CAD-koordinat → ny piksel. */
export function fraCad(g: CadRef, n: CadRef): Mat {
  return [(g.vb.w / g.w) * (n.w / n.vb.w), 0, 0, (g.vb.h / g.h) * (n.h / n.vb.h), ((g.vb.x - n.vb.x) / n.vb.w) * n.w, ((g.vb.y - n.vb.y) / n.vb.h) * n.h];
}
export const skalafaktor = (m: Mat) => Math.hypot(m[0], m[1]);
export const rotasjonGrader = (m: Mat) => Math.atan2(m[1], m[0]) * 180 / Math.PI;
