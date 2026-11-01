// Web Worker: leser DWG/DXF med LibreDWG (GPLv3) og returnerer SVG + tegningsenhet.
// Kjører isolert fra resten av appen og lastes bare når en DWG/DXF åpnes.
import { Dwg_File_Type, LibreDwg } from './src/index'
let lib: any = null
self.onmessage = async (e: MessageEvent) => {
  const { data, type, base } = e.data
  try {
    if (!lib) lib = await LibreDwg.create(base)
    const dwg = lib.dwg_read_data(data, type === 'dxf' ? Dwg_File_Type.DXF : Dwg_File_Type.DWG)
    if (!dwg) throw new Error('Kunne ikke lese filen')
    const db = lib.convert(dwg)
    const svg = lib.dwg_to_svg(db)
    const h: any = db.header || {}
    const lag = (db.tables?.LAYER?.entries || []).map((l: any) => l.name)
    // Diagnose: objekttyper som ikke kan tegnes, og eksterne referanser (xref)
    const STOTTET = new Set(['ARC', 'CIRCLE', 'DIMENSION', 'ELLIPSE', 'INSERT', 'LINE', 'LWPOLYLINE', 'MTEXT', 'SPLINE', 'POLYLINE', 'POLYLINE2D', 'POLYLINE3D', 'RAY', 'TABLE', 'ACAD_TABLE', 'TEXT', 'XLINE', 'HATCH', 'SOLID', 'TRACE', '3DFACE', 'MLINE', 'ATTDEF', 'POINT', 'VIEWPORT', 'WIPEOUT', 'IMAGE', 'OLE2FRAME', 'LEADER', 'MULTILEADER'])
    const ukjente: Record<string, number> = {}
    const tell = (es: any[]) => (es || []).forEach((e: any) => { if (!STOTTET.has(e.type)) ukjente[e.type || '?'] = (ukjente[e.type || '?'] || 0) + 1 })
    ;(db.tables?.BLOCK_RECORD?.entries || []).forEach((b: any) => tell(b.entities))
    const xref = (db.tables?.BLOCK_RECORD?.entries || []).filter((b: any) => b.flags & 4).map((b: any) => b.name)
    try { lib.dwg_free(dwg) } catch { }
    ;(self as any).postMessage({ ok: true, svg, insunits: h.INSUNITS ?? null, measurement: h.MEASUREMENT ?? null, lag, ukjente, xref })
  } catch (err: any) {
    ;(self as any).postMessage({ ok: false, error: String(err?.message || err) })
  }
}
