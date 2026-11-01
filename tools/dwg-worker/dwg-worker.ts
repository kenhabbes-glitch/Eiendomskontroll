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
    try { lib.dwg_free(dwg) } catch { }
    ;(self as any).postMessage({ ok: true, svg, insunits: h.INSUNITS ?? null, measurement: h.MEASUREMENT ?? null, lag })
  } catch (err: any) {
    ;(self as any).postMessage({ ok: false, error: String(err?.message || err) })
  }
}
