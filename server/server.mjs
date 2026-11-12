// Eiendomskontroll på egen server: serverer appen (dist/) og kjører funksjonene som på Netlify
// (/.netlify/functions/<navn>), inkludert planlagte jobber (config.schedule, f.eks. '0 6 * * *').
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROT, 'dist'); const FN = path.join(ROT, 'server', 'funksjoner');
const PORT = +(process.env.PORT || 8080);
const TYPER = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json', '.gz': 'application/gzip' };
const SIKKERHET = { 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' };
const moduler = new Map();
const hentFn = async navn => { if (!/^[a-z0-9-]+$/.test(navn)) return null; const f = path.join(FN, navn + '.mjs'); if (!existsSync(f)) return null;
  if (!moduler.has(navn)) moduler.set(navn, await import(pathToFileURL(f).href)); return moduler.get(navn); };

async function kjorFunksjon(navn, req, res) {
  const m = await hentFn(navn); if (!m?.default) { res.writeHead(404); return res.end('Ukjent funksjon'); }
  const chunks = []; for await (const c of req) chunks.push(c); const body = Buffer.concat(chunks);
  const proto = req.headers['x-forwarded-proto'] || 'http'; const url = `${proto}://${req.headers.host}${req.url}`;
  const headers = new Headers(); for (const [k, v] of Object.entries(req.headers)) if (v != null) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
  const r = new Request(url, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body });
  let svar;
  try { svar = await m.default(r, { ip: req.headers['cf-connecting-ip'] || req.socket.remoteAddress }); }
  catch (e) { console.error(`[${navn}]`, e); res.writeHead(500, { 'Content-Type': 'text/plain' }); return res.end('Serverfeil'); }
  if (!(svar instanceof Response)) svar = new Response(typeof svar === 'string' ? svar : JSON.stringify(svar ?? ''), { status: 200 });
  const h = {}; svar.headers.forEach((v, k) => { h[k] = v; });
  res.writeHead(svar.status, h); res.end(Buffer.from(await svar.arrayBuffer()));
}

async function statisk(req, res) {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname); let fil = path.normalize(path.join(DIST, u));
  if (!fil.startsWith(DIST)) { res.writeHead(400); return res.end(); }
  let s = await stat(fil).catch(() => null); if (s?.isDirectory()) { fil = path.join(fil, 'index.html'); s = await stat(fil).catch(() => null); }
  if (!s) fil = path.join(DIST, 'index.html'); // enkeltsideapp: alle ukjente stier går til index.html (som på Netlify)
  const ext = path.extname(fil).toLowerCase(); const data = await readFile(fil);
  const cache = fil.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache';
  res.writeHead(200, { ...SIKKERHET, 'Content-Type': TYPER[ext] || 'application/octet-stream', 'Cache-Control': cache }); res.end(req.method === 'HEAD' ? undefined : data);
}

http.createServer(async (req, res) => {
  try {
    const m = /^\/\.netlify\/functions\/([^/?]+)/.exec(req.url || ''); if (m) return await kjorFunksjon(m[1], req, res);
    if (req.url === '/helse') { res.writeHead(200); return res.end('ok'); }
    return await statisk(req, res);
  } catch (e) { console.error(e); if (!res.headersSent) res.writeHead(500); res.end(); }
}).listen(PORT, () => console.log(`Eiendomskontroll kjører på port ${PORT}`));

// Planlagte funksjoner: støtter «minutt time * * *» (f.eks. '0 6 * * *' = hver dag kl. 06:00, i serverens tidssone)
const planlagt = [];
for (const f of existsSync(FN) ? readdirSync(FN).filter(x => x.endsWith('.mjs')) : []) {
  const navn = f.replace(/\.mjs$/, ''); const m = await hentFn(navn); const s = m?.config?.schedule;
  const p = typeof s === 'string' && /^(\d+) (\d+) \* \* \*$/.exec(s.trim());
  if (p) { planlagt.push({ navn, min: +p[1], time: +p[2], fn: m.default }); console.log(`Planlagt: ${navn} kl. ${p[2].padStart(2, '0')}:${p[1].padStart(2, '0')} hver dag`); }
  else if (s) console.warn(`Planen «${s}» for ${navn} støttes ikke – kjøres ikke automatisk`);
}
let sist = '';
setInterval(async () => { const n = new Date(); const nokkel = `${n.toDateString()} ${n.getHours()}:${n.getMinutes()}`; if (nokkel === sist) return; sist = nokkel;
  for (const p of planlagt) if (n.getHours() === p.time && n.getMinutes() === p.min) { console.log(`Kjører ${p.navn}`); try { await p.fn(new Request('http://localhost/.netlify/functions/' + p.navn)); } catch (e) { console.error(`[${p.navn}]`, e); } } }, 20000);
