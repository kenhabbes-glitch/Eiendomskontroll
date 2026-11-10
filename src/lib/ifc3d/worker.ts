// Web Worker: pakker ut .ifczip, kjører web-ifc og konverterer til .ek3d (se konverter.ts).
import * as WebIFC from 'web-ifc';
import { unzipSync } from 'fflate';
import { konverter } from './konverter';

self.onmessage = async (ev: MessageEvent<{ buf: ArrayBuffer; navn: string }>) => {
  try {
    let data = new Uint8Array(ev.data.buf);
    if (/\.(ifczip|zip)$/i.test(ev.data.navn) || (data[0] === 0x50 && data[1] === 0x4b)) {
      (self as any).postMessage({ p: 0.01, t: 'Pakker ut' });
      const z = unzipSync(data, { filter: f => /\.ifc$/i.test(f.name) }); const k = Object.keys(z)[0]; if (!k) throw new Error('Fant ingen .ifc-fil i pakken');
      data = z[k];
    }
    const api = new WebIFC.IfcAPI(); api.SetWasmPath('/web-ifc/', true); await api.Init();
    const ut = await konverter(api, WebIFC, data, (p, t) => (self as any).postMessage({ p, t }));
    (self as any).postMessage({ ferdig: ut.buffer }, [ut.buffer]);
  } catch (e: any) { (self as any).postMessage({ feil: String(e?.message || e) }); }
};
