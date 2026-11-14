// Felles oppsett for skjermbildetestene: en liten filserver, en nettleser og hjelpere for å åpne appen med testdata.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page, type BrowserContext } from 'playwright';

const UT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../.bygg/nettleser');
const TYPER: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
// «Nytt siden sist» skal ikke dekke skjermen i testene: merk siste nyhet som lest
const SISTE_NYHET = (fs.readFileSync(path.join(UT, '../../../src/lib/nyheter.ts'), 'utf8').match(/id: '([^']+)'/) || [])[1] || '';
let tjener: http.Server, nettleser: Browser; export let ADR = '';

export async function start() {
  if (!fs.existsSync(path.join(UT, 'main.js'))) throw new Error('Kjør «node tests/nettleser/bygg.mjs» først (npm run test:nettleser gjør det selv)');
  tjener = http.createServer((req, res) => { const f = path.join(UT, decodeURIComponent((req.url || '/').split('?')[0]).replace(/^\/$/, '/index.html'));
    if (!f.startsWith(UT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPER[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
  await new Promise<void>(ok => tjener.listen(0, '127.0.0.1', ok)); ADR = 'http://127.0.0.1:' + (tjener.address() as any).port;
  nettleser = await chromium.launch();
}
export async function stopp() { await nettleser?.close(); await new Promise(ok => tjener?.close(ok)); }

export type Data = Record<string, any[]>;
export const NAA = new Date().toISOString();
/** Et lite bygg med tegning, system, komponent og avvik. */
export const grunndata = (): Data => ({
  eiendommer: [{ id: 'e1', data: { navn: 'Testgården', adresse: 'Storgata 1' }, created_at: NAA }],
  eiendom_tilgang: [{ user_id: 'u-me', eiendom_id: 'e1', niva: 'skriv' }],
  tegninger: [{ id: 't1', eiendom_id: 'e1', created_at: NAA, data: { eiendomId: 'e1', navn: '1. etasje', etasje: 1, side: 1, w: 1600, h: 1000, fil: { path: 'e1/plan.png', name: 'plan.png' }, skala: { a: [100, 900], b: [1500, 900], m: 14 }, soner: [{ id: 'z1', navn: 'Kontor 101', pts: [[200, 200], [600, 200], [600, 500], [200, 500]] }] } }],
  systemer: [{ id: 's1', eiendom_id: 'e1', created_at: NAA, data: { eiendomId: 'e1', navn: 'Brannalarmanlegg', type: 'brannalarm', pos: { tegningId: 't1', x: 400, y: 300 } } }],
  komponenter: [{ id: 'k1', eiendom_id: 'e1', system_id: 's1', created_at: NAA, data: { eiendomId: 'e1', anleggId: 's1', navn: 'Røykdetektor 1' } }],
  avvik: [{ id: 'a1', nr: 1, eiendom_id: 'e1', created_at: NAA, data: { eiendomId: 'e1', tittel: 'Løs himlingsplate', status: 'Ny', alv: 'Middels', oppdaget: NAA.slice(0, 10) } }],
});

export type Aapnet = { side: Page; kontekst: BrowserContext; feil: string[]; db: () => Promise<Data>; lukk: () => Promise<void> };
/** Åpner appen på en gitt side med gitte data. «lager» er ekstra verdier i localStorage (rolle, språk …). */
export async function aapne(rute = '#/', valg: { data?: Data; mobil?: boolean; lager?: Record<string, string> } = {}): Promise<Aapnet> {
  const kontekst = await nettleser.newContext(valg.mobil ? { viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true } : { viewport: { width: 1300, height: 950 } });
  const lager = { mockdb: JSON.stringify({ profiles: [], eiendom_tilgang: [], ...(valg.data || grunndata()) }), 'ek.sprak': 'nb', 'ek_nyheter_sett_u-me': SISTE_NYHET, ...valg.lager };
  await kontekst.addInitScript((l: Record<string, string>) => { if (!sessionStorage.getItem('__satt')) { for (const k in l) localStorage.setItem(k, l[k]); sessionStorage.setItem('__satt', '1'); } }, lager);
  const side = await kontekst.newPage(); const feil: string[] = [];
  side.on('pageerror', e => feil.push(String(e).slice(0, 300)));
  side.on('console', m => { if (m.type() === 'error' && process.env.EK_DEBUG) console.log('konsoll:', m.text().slice(0, 300)); }); await side.goto(ADR + '/index.html' + rute); await side.waitForSelector('#root > *', { state: 'attached' });
  return { side, kontekst, feil, db: () => side.evaluate(() => JSON.parse(localStorage.getItem('mockdb') || '{}')), lukk: () => kontekst.close() };
}
