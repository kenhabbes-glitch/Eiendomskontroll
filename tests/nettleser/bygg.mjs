// Bygger appen for skjermbildetestene: samme kode som i drift, men med en etterligning av databasen (mock-supabase.js).
import { build } from 'esbuild'; import fs from 'node:fs'; import path from 'node:path'; import zlib from 'node:zlib'; import { fileURLToPath } from 'node:url';
const her = path.dirname(fileURLToPath(import.meta.url)); const rot = path.join(her, '../..'); export const UT = path.join(rot, 'tests/.bygg/nettleser');
fs.mkdirSync(UT, { recursive: true });
await build({ entryPoints: [path.join(rot, 'src/main.tsx')], bundle: true, outfile: path.join(UT, 'main.js'), jsx: 'automatic', logLevel: 'error',
  alias: { '@supabase/supabase-js': path.join(her, 'mock-supabase.js') }, loader: { '.png': 'dataurl', '.svg': 'dataurl', '.woff2': 'dataurl' },
  define: { 'import.meta.env': '{"VITE_SUPABASE_URL":"http://x","VITE_SUPABASE_ANON_KEY":"k"}', __BYGGET__: '"2026-11-07T05:00:00Z"', __COMMIT__: '"test"', __APP_VERSJON__: '"0.0.0"', 'import.meta.url': '"http://localhost/main.js"' } });
fs.writeFileSync(path.join(UT, 'index.html'), '<!DOCTYPE html><html lang="no"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="main.css"></head><body><div id="root"></div><script src="main.js"></script></body></html>');
// En enkel «plantegning» (rutenett) som PNG, så tegningsvisningen har et bilde å vise
const B = 800, H = 500; const raa = Buffer.alloc((B * 3 + 1) * H); for (let y = 0; y < H; y++) for (let x = 0; x < B; x++) { const v = x % 100 === 0 || y % 100 === 0 ? 120 : 245; raa.fill(v, y * (B * 3 + 1) + 1 + x * 3, y * (B * 3 + 1) + 4 + x * 3); }
const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = b => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const bit = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(B, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
fs.writeFileSync(path.join(UT, 'plan.png'), Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bit('IHDR', ihdr), bit('IDAT', zlib.deflateSync(raa)), bit('IEND', Buffer.alloc(0))]));
