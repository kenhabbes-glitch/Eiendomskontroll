// Konverterer en IFC-modell til et kompakt 3D-format (.ek3d) som nettleseren laster raskt, også på mobil.
// Geometrien slås sammen per etasje (én tegning per etasje, med og uten gjennomsiktighet), og hvert objekt
// får en liste over trekantområder slik at det kan klikkes, fargelegges og skjules.
// Kjører i en Web Worker (se worker.ts). Kjernen tar et ferdig initialisert web-ifc, så den kan testes i Node.

export type Ek3dEtasje = { navn: string; kote: number; terreng?: boolean };
export type Ek3dGruppe = { etasje: number; glass: boolean; nv: number; ni: number };
export type Ek3dElement = { g: string; k: string; n: string; t: string; e: number };
export type Ek3dHode = { v: 1; bbox: number[]; fokus: number[]; etasjer: Ek3dEtasje[]; grupper: Ek3dGruppe[]; elementer: Ek3dElement[]; nSeg: number; program?: string };

class Vekst { a: Float32Array | Int8Array | Uint32Array; n = 0; constructor(private T: any, start = 1 << 16) { this.a = new T(start); }
  skaff(m: number) { if (this.n + m > this.a.length) { const b = new this.T(Math.max(this.a.length * 2, this.n + m)); b.set(this.a); this.a = b; } }
  ferdig() { return this.a.subarray(0, this.n); } }
type Grp = { etasje: number; glass: boolean; pos: Vekst; nor: Vekst; idx: Vekst; nv: number };

export async function konverter(api: any, W: any, data: Uint8Array, fremdrift: (p: number, t: string) => void): Promise<Uint8Array> {
  fremdrift(0.02, 'Åpner modellen');
  const id = api.OpenModel(data, { COORDINATE_TO_ORIGIN: true });
  const linjer = (type: number) => { const v = api.GetLineIDsWithType(id, type); const ut: number[] = []; for (let i = 0; i < v.size(); i++) ut.push(v.get(i)); return ut; };
  const verdi = (x: any) => (x && typeof x === 'object' && 'value' in x ? x.value : x);

  // Lengdeenhet i filen (geometrien leveres i meter, men høydekoter står i filens enhet)
  let enhet = 1; for (const i of linjer(W.IFCSIUNIT)) { const l = api.GetLine(id, i); if (verdi(l.UnitType) === 'LENGTHUNIT') { const pf = verdi(l.Prefix); enhet = pf === 'MILLI' ? 0.001 : pf === 'CENTI' ? 0.01 : 1; } }
  // Etasjer (sortert på kote) og tilhørighet
  const etasjerR = linjer(W.IFCBUILDINGSTOREY).map(i => { const l = api.GetLine(id, i); return { id: i, navn: String(verdi(l.Name) || verdi(l.LongName) || 'Etasje'), kote: (Number(verdi(l.Elevation)) || 0) * enhet }; }).sort((a, b) => a.kote - b.kote);
  const koteIdx = (z: number) => { let r = 0; for (let i = 0; i < etasjerR.length; i++) if (etasjerR[i].kote <= z + 0.3) r = i; return r; };
  const nEt = Math.max(1, etasjerR.length); const TERR = nEt; let brukTerreng = false;

  const grupper = new Map<string, Grp>(); const grp = (e: number, glass: boolean) => { const k = e + (glass ? 'g' : 'o'); let g = grupper.get(k); if (!g) { g = { etasje: e, glass, pos: new Vekst(Float32Array), nor: new Vekst(Int8Array), idx: new Vekst(Uint32Array), nv: 0 }; grupper.set(k, g); } return g; };
  const grpNr = new Map<Grp, number>();
  const elementer: Ek3dElement[] = []; const senter: number[][] = []; const seg: number[] = []; // [el, gruppe(midl: via Grp), vf, vc, f, c, rgba]
  const segGrp: Grp[] = [];
  const bbox = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  let antall = 0, ferdig = 0;
  const totalt = Math.max(1, linjer(W.IFCBUILDINGELEMENTPROXY).length); void totalt;

  api.StreamAllMeshes(id, (m: any) => {
    const n = m.geometries.size(); if (!n) return;
    const eid = m.expressID; let navn = '', guid = '', tag = '', klasse = '';
    try { const l = api.GetLine(id, eid); guid = String(verdi(l.GlobalId) || ''); navn = String(verdi(l.Name) || ''); tag = String(verdi(l.Tag) || ''); klasse = String(api.GetNameFromTypeCode(api.GetLineType(id, eid)) || '').toUpperCase(); } catch { /* ukjent objekt */ }
    let et: number | null = null; let elIdx = -1; let minZ = Infinity;
    const deler: { pos: Float32Array; nor: Int8Array; ind: Uint32Array; rgba: number; glass: boolean }[] = [];
    for (let i = 0; i < n; i++) {
      const pg = m.geometries.get(i); const geo = api.GetGeometry(id, pg.geometryExpressID);
      const vd = api.GetVertexArray(geo.GetVertexData(), geo.GetVertexDataSize()) as Float32Array; const ia = api.GetIndexArray(geo.GetIndexData(), geo.GetIndexDataSize()) as Uint32Array;
      const nv = vd.length / 6; const T = pg.flatTransformation as number[]; const pos = new Float32Array(nv * 3), nor = new Int8Array(nv * 3);
      for (let v = 0; v < nv; v++) { const x = vd[v * 6], y = vd[v * 6 + 1], z = vd[v * 6 + 2], a = vd[v * 6 + 3], b = vd[v * 6 + 4], c = vd[v * 6 + 5];
        const X = T[0] * x + T[4] * y + T[8] * z + T[12], Y = T[1] * x + T[5] * y + T[9] * z + T[13], Z = T[2] * x + T[6] * y + T[10] * z + T[14];
        pos[v * 3] = X; pos[v * 3 + 1] = Y; pos[v * 3 + 2] = Z; if (Y < minZ) minZ = Y;
        if (X < bbox[0]) bbox[0] = X; if (Y < bbox[1]) bbox[1] = Y; if (Z < bbox[2]) bbox[2] = Z; if (X > bbox[3]) bbox[3] = X; if (Y > bbox[4]) bbox[4] = Y; if (Z > bbox[5]) bbox[5] = Z;
        const nx = T[0] * a + T[4] * b + T[8] * c, ny = T[1] * a + T[5] * b + T[9] * c, nz = T[2] * a + T[6] * b + T[10] * c; const L = Math.hypot(nx, ny, nz) || 1;
        nor[v * 3] = Math.round(nx / L * 127); nor[v * 3 + 1] = Math.round(ny / L * 127); nor[v * 3 + 2] = Math.round(nz / L * 127); }
      const col = pg.color; const al = Math.round(Math.min(1, Math.max(0, col.w)) * 255);
      const rgba = ((Math.round(col.x * 255) & 255) << 24 | (Math.round(col.y * 255) & 255) << 16 | (Math.round(col.z * 255) & 255) << 8 | al) | 0;
      deler.push({ pos, nor, ind: ia.slice(), rgba, glass: al < 235 }); geo.delete();
    }
    if (et == null) et = 0; void minZ;
    { let sx = 0, sy = 0, sz = 0, sn = 0; for (const d of deler) for (let v = 0; v < d.pos.length; v += 3) { sx += d.pos[v]; sy += d.pos[v + 1]; sz += d.pos[v + 2]; sn++; } if (sn) { senter.push([sx / sn, sy / sn, sz / sn]); et = koteIdx(sy / sn);
      // Store, tynne flater (terreng, tomt) legges i en egen gruppe som kan skjules
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (const d of deler) for (let v = 0; v < d.pos.length; v += 3) { const X = d.pos[v], Y = d.pos[v + 1], Z = d.pos[v + 2]; if (X < x0) x0 = X; if (X > x1) x1 = X; if (Z < z0) z0 = Z; if (Z > z1) z1 = Z; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y; }
      if (Math.max(x1 - x0, z1 - z0) > 100 && y1 - y0 < 3) { et = TERR; brukTerreng = true; } } }
    const eN = et === TERR ? TERR : Math.min(et, nEt - 1); elIdx = elementer.push({ g: guid, k: klasse, n: navn, t: tag, e: eN }) - 1;
    for (const d of deler) { const g = grp(eN, d.glass); const nv = d.pos.length / 3, vf = g.nv, f = g.idx.n;
      g.pos.skaff(d.pos.length); g.pos.a.set(d.pos, g.pos.n); g.pos.n += d.pos.length; g.nor.skaff(d.nor.length); g.nor.a.set(d.nor, g.nor.n); g.nor.n += d.nor.length;
      g.idx.skaff(d.ind.length); for (let i = 0; i < d.ind.length; i++) g.idx.a[g.idx.n + i] = d.ind[i] + vf; g.idx.n += d.ind.length; g.nv += nv;
      seg.push(elIdx, 0, vf, nv, f, d.ind.length, d.rgba); segGrp.push(g); }
    if (++antall % 400 === 0) { ferdig = antall; fremdrift(0.05 + 0.85 * Math.min(1, ferdig / 17000), `Bygger 3D (${antall} objekter)`); }
  });
  fremdrift(0.92, 'Pakker modellen');
  const gl = [...grupper.values()]; gl.forEach((g, i) => grpNr.set(g, i));
  const segI = new Int32Array(seg); segGrp.forEach((g, i) => { segI[i * 7 + 1] = grpNr.get(g)!; });
  const pr = (k: number, p: number) => { const a = senter.map(c => c[k]).sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.max(0, Math.floor(a.length * p)))] : 0; };
  const fokus = [0, 1, 2].flatMap(k => [pr(k, 0.01)]).concat([0, 1, 2].map(k => pr(k, 0.99)));
  const hode: Ek3dHode = { v: 1, bbox, fokus, etasjer: [...(etasjerR.length ? etasjerR : [{ navn: 'Alle', kote: 0 }]).map(e => ({ navn: e.navn, kote: e.kote })), ...(brukTerreng ? [{ navn: 'Terreng / omgivelser', kote: -1e3, terreng: true }] : [])], grupper: gl.map(g => ({ etasje: g.etasje, glass: g.glass, nv: g.nv, ni: g.idx.n })), elementer, nSeg: segGrp.length };
  const hb = new TextEncoder().encode(JSON.stringify(hode)); const hLen = Math.ceil(hb.length / 4) * 4;
  let total = 8 + hLen; for (const g of gl) total += g.nv * 12 + Math.ceil(g.nv * 3 / 4) * 4 + g.idx.n * 4; total += segI.length * 4;
  const ut = new Uint8Array(total); const dv = new DataView(ut.buffer); ut.set([0x45, 0x4b, 0x33, 0x44], 0); dv.setUint32(4, hb.length, true); ut.set(hb, 8);
  let o = 8 + hLen;
  for (const g of gl) { const p = g.pos.ferdig(); ut.set(new Uint8Array(p.buffer, p.byteOffset, p.byteLength), o); o += p.byteLength; const nn = g.nor.ferdig(); ut.set(new Uint8Array(nn.buffer, nn.byteOffset, nn.byteLength), o); o += Math.ceil(nn.byteLength / 4) * 4; const ix = g.idx.ferdig(); ut.set(new Uint8Array(ix.buffer, ix.byteOffset, ix.byteLength), o); o += ix.byteLength; }
  ut.set(new Uint8Array(segI.buffer), o);
  api.CloseModel(id); fremdrift(1, 'Ferdig'); return ut;
}
