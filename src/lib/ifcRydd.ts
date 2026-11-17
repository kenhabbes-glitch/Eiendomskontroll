// Rydding etter en IFC-import: finner det som ble opprettet av importen på ett bygg, og det som er trygt å fjerne.
// Ren funksjon (ingen database) – selve slettingen gjøres av «Fjern IFC-importerte data» på 3D-siden, etter bekreftelse.
type R = Record<string, any>;
export type Rydding = {
  komponenter: R[]; systemer: R[]; kontroller: R[];
  beholdtKomp: { navn: string; grunn: string }[]; beholdtSys: { navn: string; grunn: string }[];
};

/** Komponenter med importKilde.ifc er opprettet av IFC-importen. Systemer regnes som opprettet av importen når de har objekter fra modellen og merknaden «Fra IFC-modell». */
export function planRydding(d: { komponenter: R[]; anlegg: R[]; avvik: R[]; dokumenter: R[]; oppgaver: R[] }, eid: string): Rydding {
  const avvikKomp = new Set(d.avvik.filter(a => a.eiendomId === eid && a.komponentId).map(a => a.komponentId));
  const avvikSys = new Set(d.avvik.filter(a => a.eiendomId === eid && a.anleggId).map(a => a.anleggId));
  const dokSys = new Set(d.dokumenter.filter(x => x.eiendomId === eid).flatMap(x => [x.anleggId, ...(x.anleggIds || [])]).filter(Boolean));
  const utfort = new Set(d.oppgaver.filter(o => o.eiendomId === eid && o.anleggId && (o.historikk || []).length).map(o => o.anleggId));
  const beholdtKomp: Rydding['beholdtKomp'] = []; const komponenter: R[] = [];
  for (const k of d.komponenter.filter(x => x.eiendomId === eid && x.importKilde?.ifc)) {
    if (avvikKomp.has(k.id)) beholdtKomp.push({ navn: k.navn || k.kode || '?', grunn: 'har avvik' }); else komponenter.push(k);
  }
  const slettK = new Set(komponenter.map(k => k.id));
  const systemer: R[] = []; const beholdtSys: Rydding['beholdtSys'] = [];
  for (const a of d.anlegg.filter(x => x.eiendomId === eid && !x.arkivert && x.importKilde && (x.ifcGuider || []).length && /Fra IFC-modell/.test(x.notat || ''))) {
    const rest = d.komponenter.filter(k => k.anleggId === a.id && !slettK.has(k.id)).length;
    const grunn = rest ? 'har komponenter som ikke kommer fra IFC-importen (eller har avvik)' : avvikSys.has(a.id) ? 'har avvik' : dokSys.has(a.id) ? 'har dokumenter' : utfort.has(a.id) ? 'har registrerte kontroller' : '';
    if (grunn) beholdtSys.push({ navn: a.navn || '?', grunn }); else systemer.push(a);
  }
  const slettS = new Set(systemer.map(a => a.id));
  // kontroller som er laget for de slettede systemene og aldri er utført
  const kontroller = d.oppgaver.filter(o => o.eiendomId === eid && slettS.has(o.anleggId) && !(o.historikk || []).length);
  return { komponenter, systemer, kontroller, beholdtKomp, beholdtSys };
}
