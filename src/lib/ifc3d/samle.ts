// Setter sammen flere fagmodeller (ARK, RIB, RIV, RIE …) til én modell i samme koordinatsystem.
// web-ifc flytter hver fil nær origo ved åpning (COORDINATE_TO_ORIGIN), og hver fil flyttes ulikt.
// Forskyvningen lagres i hodet (koord). Her regnes alle fag tilbake til felles «ramme» = virkelige koordinater + ramme-forskyvning,
// slik at fagene legger seg oppå hverandre. Rammen lagres på eiendommens hovedmodell og endres ikke når et fag byttes ut.
import type { Modell } from './modell';
import { tt } from '../i18n';

export const FAG: { k: string; n: string }[] = [
  { k: 'ARK', n: 'Arkitekt' }, { k: 'RIB', n: 'Konstruksjon' }, { k: 'RIV', n: 'VVS (rør og ventilasjon)' }, { k: 'RIVv', n: 'Ventilasjon' }, { k: 'RIVr', n: 'Rør og sanitær' },
  { k: 'RIVs', n: 'Sprinkler' }, { k: 'RIE', n: 'Elektro' }, { k: 'RIT', n: 'Tele og automasjon' }, { k: 'RIBr', n: 'Brann' }, { k: 'RIA', n: 'Akustikk' },
  { k: 'LARK', n: 'Landskap' }, { k: 'RIG', n: 'Geoteknikk' }, { k: 'RIByfy', n: 'Bygningsfysikk' }, { k: 'IARK', n: 'Interiør' }, { k: 'ANNET', n: 'Annet' },
];
export const fagNavn = (k?: string) => { const f = FAG.find(x => x.k === k); return f ? `${f.k} – ${tt(f.n)}` : k || tt('Annet'); };
const rekkef = (k?: string) => { const i = FAG.findIndex(x => x.k === k); return i < 0 ? 99 : i; };

/** Gjetter fag ut fra filnavnet (norske fagkoder og engelske ord). */
export function gjettFag(filnavn: string): string {
  const s = filnavn.replace(/\.[a-z0-9]+$/i, ''); const ord = s.split(/[^A-Za-zÆØÅæøå0-9]+/).filter(Boolean); const u = ord.map(o => o.toUpperCase());
  const har = (...k: string[]) => u.some(o => k.includes(o));
  if (har('RIBR', 'BRANN', 'FIRE')) return 'RIBr';
  if (har('RIVS', 'SPRINKLER')) return 'RIVs';
  if (har('RIVV', 'VENT', 'VENTILASJON', 'HVAC')) return u.includes('HVAC') ? 'RIV' : 'RIVv';
  if (har('RIVR', 'SANITÆR', 'SANITAR', 'PLUMBING', 'PIPING')) return 'RIVr';
  if (har('RIV', 'VVS', 'MEP', 'MECHANICAL')) return 'RIV';
  if (har('RIE', 'ELEKTRO', 'EL', 'ELECTRICAL')) return 'RIE';
  if (har('RIT', 'TELE', 'IKT', 'AUTOMASJON')) return 'RIT';
  if (har('RIBYFY')) return 'RIByfy';
  if (har('RIB', 'KONSTRUKSJON', 'STRUCTURAL', 'STRUCTURE', 'BÆRESYSTEM')) return 'RIB';
  if (har('RIA', 'AKUSTIKK')) return 'RIA';
  if (har('LARK', 'LANDSKAP', 'LANDSCAPING', 'LANDSCAPE')) return 'LARK';
  if (har('RIG', 'GEOTEKNIKK')) return 'RIG';
  if (har('IARK', 'INTERIØR', 'INTERIOR')) return 'IARK';
  if (har('ARK', 'ARKITEKT', 'ARCHITECTURE', 'ARCHITECTURAL', 'ARCH')) return 'ARK';
  // koder klistret inn i ord, f.eks. «20760RIV01»
  for (const f of ['RIBr', 'RIVv', 'RIVr', 'RIVs', 'LARK', 'IARK', 'RIB', 'RIV', 'RIE', 'RIT', 'RIA', 'RIG', 'ARK']) if (new RegExp(`(^|[^A-Z])${f.toUpperCase()}([^A-Z]|$)`).test(s.toUpperCase())) return f;
  return 'ANNET';
}

type M4 = number[]; // 16 tall, kolonnevis (som web-ifc)
const inv = (K: M4): M4 => { // affin invers
  const [a, b, c, , d, e, f, , g, h, i] = K; const det = a * (e * i - f * h) - d * (b * i - c * h) + g * (b * f - c * e) || 1;
  const r = [(e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det, 0, (f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det, 0, (d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det, 0, 0, 0, 0, 1];
  const tx = K[12], ty = K[13], tz = K[14]; r[12] = -(r[0] * tx + r[4] * ty + r[8] * tz); r[13] = -(r[1] * tx + r[5] * ty + r[9] * tz); r[14] = -(r[2] * tx + r[6] * ty + r[10] * tz); return r;
};
const bruk = (M: M4, x: number, y: number, z: number) => [M[0] * x + M[4] * y + M[8] * z + M[12], M[1] * x + M[5] * y + M[9] * z + M[13], M[2] * x + M[6] * y + M[10] * z + M[14]];
const erId = (M: M4) => M.every((v, i) => Math.abs(v - (i % 5 === 0 ? 1 : 0)) < 1e-9);

export type Del = { mod: Modell; fag: string; navn: string; id: string };
export type Samlet = Modell & { fag: { k: string; navn: string; id: string; utenKoord: boolean }[] };

/** Ramme for nye eiendommer: forskyvningen til første modell som har koord (da står den modellen urørt). */
export const rammeFra = (deler: Del[]) => { const d = deler.find(x => x.mod.hode.koord); return d ? [d.mod.hode.koord![12], d.mod.hode.koord![13], d.mod.hode.koord![14]] : null; };

export function samle(deler: Del[], ramme: number[] | null): Samlet {
  deler = [...deler].sort((a, b) => rekkef(a.fag) - rekkef(b.fag));
  if (deler.length === 1 && (!ramme || !deler[0].mod.hode.koord)) { const d = deler[0]; return { ...d.mod, hode: { ...d.mod.hode, grupper: d.mod.hode.grupper.map(g => ({ ...g, fag: 0 })), elementer: d.mod.hode.elementer.map(e => ({ ...e, f: 0 })) }, fag: [{ k: d.fag, navn: d.navn, id: d.id, utenKoord: !d.mod.hode.koord }] }; }
  // felles etasjeliste: samme kote (±0,5 m) = samme etasje; navn fra første fag (ARK)
  const etasjer: { navn: string; kote: number; terreng?: boolean }[] = []; const kart: number[][] = [];
  for (const d of deler) kart.push(d.mod.hode.etasjer.map(e => { if (e.terreng) return -1; let i = etasjer.findIndex(x => !x.terreng && Math.abs(x.kote - e.kote) < 0.5); if (i < 0) i = etasjer.push({ navn: e.navn, kote: e.kote }) - 1; return i; }));
  const orden = etasjer.map((e, i) => [e.kote, i]).sort((a, b) => a[0] - b[0]).map(x => x[1]); const nyIdx = new Map(orden.map((gml, ny) => [gml, ny]));
  const ets = orden.map(i => etasjer[i]); const harTerr = deler.some(d => d.mod.hode.etasjer.some(e => e.terreng)); const TERR = ets.length; if (harTerr) ets.push({ navn: tt('Terreng / omgivelser'), kote: -1e3, terreng: true });
  const etKart = kart.map(k => k.map(i => i < 0 ? TERR : nyIdx.get(i)!));

  const grupper: Modell['grupper'] = []; const hg: any[] = []; const elementer: any[] = []; const segs: Int32Array[] = []; let nSeg = 0; const eg: Record<string, any> = {};
  const bbox = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity], fokus = [...bbox];
  const utvid = (b: number[], p: number[]) => { for (let k = 0; k < 3; k++) { if (p[k] < b[k]) b[k] = p[k]; if (p[k] > b[k + 3]) b[k + 3] = p[k]; } };
  const fag: Samlet['fag'] = [];
  deler.forEach((d, fi) => {
    const h = d.mod.hode; const K = h.koord; fag.push({ k: d.fag, navn: d.navn, id: d.id, utenKoord: !K });
    const M: M4 = K && ramme ? (() => { const I = inv(K); I[12] += ramme[0]; I[13] += ramme[1]; I[14] += ramme[2]; return I; })() : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const id = erId(M); const rot = !id && [0, 1, 2, 4, 5, 6, 8, 9, 10].some(i => Math.abs(M[i] - (i % 5 === 0 ? 1 : 0)) > 1e-9);
    const g0 = grupper.length, e0 = elementer.length;
    d.mod.grupper.forEach((g, gi) => {
      let pos = g.pos, nor = g.nor;
      // flyttes på stedet (ingen kopi): arrayene er nylig lest og brukes ikke av andre
      if (!id) { for (let v = 0; v < pos.length; v += 3) { const p = bruk(M, pos[v], pos[v + 1], pos[v + 2]); pos[v] = p[0]; pos[v + 1] = p[1]; pos[v + 2] = p[2]; } }
      if (rot) { nor = new Int8Array(g.nor.length); for (let v = 0; v < nor.length; v += 3) { const x = g.nor[v], y = g.nor[v + 1], z = g.nor[v + 2]; const nx = M[0] * x + M[4] * y + M[8] * z, ny = M[1] * x + M[5] * y + M[9] * z, nz = M[2] * x + M[6] * y + M[10] * z; const L = Math.hypot(nx, ny, nz) || 1; nor[v] = Math.round(nx / L * 127); nor[v + 1] = Math.round(ny / L * 127); nor[v + 2] = Math.round(nz / L * 127); } }
      grupper.push({ pos, nor, idx: g.idx }); const gh = h.grupper[gi]; hg.push({ ...gh, etasje: etKart[fi][gh.etasje] ?? 0, fag: fi });
    });
    h.elementer.forEach(e => elementer.push({ ...e, e: etKart[fi][e.e] ?? 0, f: fi }));
    const s = new Int32Array(d.mod.seg); for (let i = 0; i < h.nSeg; i++) { s[i * 7] += e0; s[i * 7 + 1] += g0; } segs.push(s); nSeg += h.nSeg;
    for (const [b, mal] of [[h.bbox, bbox], [h.fokus, fokus]] as const) if (isFinite(b[0])) for (const x of [b[0], b[3]]) for (const y of [b[1], b[4]]) for (const z of [b[2], b[5]]) utvid(mal, bruk(M, x, y, z));
    Object.assign(eg, h.egenskaper || {});
  });
  const seg = new Int32Array(nSeg * 7); let o = 0; for (const s of segs) { seg.set(s, o); o += s.length; }
  const h0 = deler[0].mod.hode;
  return { hode: { ...h0, v: 2, bbox, fokus, etasjer: ets, grupper: hg, elementer, nSeg, egenskaper: eg }, grupper, seg, fag };
}
