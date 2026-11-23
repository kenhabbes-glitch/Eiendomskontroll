// Driftsvakt: server/vakt.sh mot falske kommandoer (curl, docker, df, systemctl), og serverhandlingene drift_varsel / jobb_hjerteslag.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, chmodSync, utimesSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { lagFalsk, type Db } from './falsk-supabase.ts';
import { driftHandling, driftTekst, renPunkter } from '../src/lib/driftServer.ts';

function miljo() {
  const d = mkdtempSync(path.join(tmpdir(), 'vakt-')); const bin = path.join(d, 'bin'); mkdirSync(bin); const mal = path.join(d, 'kopi'); mkdirSync(mal); const supa = path.join(d, 'supa'); mkdirSync(supa);
  const skriv = (n: string, s: string) => { writeFileSync(path.join(bin, n), '#!/bin/sh\n' + s); chmodSync(path.join(bin, n), 0o755); };
  const logg = path.join(d, 'logg');
  skriv('curl', `echo "$@" >> "${logg}"; case "$*" in *arbeidsordre*) [ "$FAKE_POST" = ned ] && exit 22; exit 0;; *"/helse"*) [ "$FAKE_APP" = ned ] && exit 22; echo ok;; *) exit 0;; esac`);
  skriv('docker', `case "$*" in *psql*) case "$*" in *"select 1"*) [ "$FAKE_DB" = ned ] && exit 1; echo 1;; *hendelseslogg*) printf '%s' "$FAKE_ALDER";; esac;; *"ps "*) printf '%s' "$FAKE_PS";; esac`);
  skriv('df', `echo "Filesystem 1K-blocks Used Available Use% Mounted on"; echo "/dev/x 100 \${FAKE_BRUKT:-40} 0 \${FAKE_BRUKT:-40}% /"`);
  skriv('systemctl', `[ "$FAKE_TUNNEL" = ned ] && exit 3; exit 0`);
  writeFileSync(path.join(supa, '.env'), 'POSTGRES_PASSWORD=hemmelig\n'); writeFileSync(path.join(d, 'env'), 'SUPABASE_SERVICE_ROLE_KEY=nokkel123\n');
  const kopi = path.join(mal, 'database-2026-11-23.sql.gz'); writeFileSync(kopi, Buffer.alloc(20000, 1));
  const kjor = (ekstra: Record<string, string> = {}) => spawnSync('sh', ['server/vakt.sh'], { encoding: 'utf8', env: { PATH: bin + ':' + process.env.PATH, HOME: d, ENVFIL: path.join(d, 'env'), SUPA: supa, MAL: mal, STATE: path.join(d, 'state'), APP_URL: 'http://app', FAKE_ALDER: '3600', ...ekstra } });
  const poster = () => (existsSync(logg) ? readFileSync(logg, 'utf8').split('\n').filter(l => l.includes('arbeidsordre')) : []);
  return { d, kjor, poster, kopi, state: path.join(d, 'state'), logg, ryd: () => rmSync(d, { recursive: true, force: true }) };
}

test('vakt: alt i orden gir ingen utskrift, ingen varsel og exit 0', () => {
  const m = miljo(); const r = m.kjor(); assert.equal(r.status, 0); assert.equal(r.stdout.trim(), ''); assert.equal(m.poster().length, 0); m.ryd();
});
test('vakt: feil varsles én gang, ikke på nytt med samme feil, ny feil varsles, og «i orden igjen» sendes', () => {
  const m = miljo();
  let r = m.kjor({ FAKE_APP: 'ned' }); assert.equal(r.status, 1); assert.match(r.stdout, /Appen svarer ikke/); assert.equal(m.poster().length, 1);
  assert.match(readFileSync(m.logg, 'utf8'), /"punkter":\["Appen svarer ikke på \/helse"\]/); assert.match(readFileSync(m.logg, 'utf8'), /x-ek-cron: [0-9a-f]{64}/);
  m.kjor({ FAKE_APP: 'ned' }); assert.equal(m.poster().length, 1, 'samme feil sendes ikke på nytt');
  m.kjor({ FAKE_APP: 'ned', FAKE_DB: 'ned' }); assert.equal(m.poster().length, 2, 'ny feil varsles');
  r = m.kjor(); assert.equal(r.status, 0); assert.equal(m.poster().length, 3); assert.match(readFileSync(m.logg, 'utf8'), /"status":"ok"/); assert.equal(existsSync(m.state), false);
  m.ryd();
});
test('vakt: sikkerhetskopi, disk, tjenester og nattjobber', () => {
  const m = miljo();
  utimesSync(m.kopi, new Date(Date.now() - 30 * 3600e3), new Date(Date.now() - 30 * 3600e3));
  let r = m.kjor(); assert.match(r.stdout, /sikkerhetskopi/); rmSync(m.state, { force: true });
  writeFileSync(m.kopi, Buffer.alloc(20000, 1)); r = m.kjor({ FAKE_BRUKT: '90' }); assert.match(r.stdout, /Disken er 90 % full/); rmSync(m.state, { force: true });
  r = m.kjor({ FAKE_PS: 'supabase-db Up 2 hours (unhealthy)' }); assert.match(r.stdout, /Containere med feil: supabase-db/); rmSync(m.state, { force: true });
  r = m.kjor({ FAKE_TUNNEL: 'ned' }); assert.match(r.stdout, /cloudflared/); rmSync(m.state, { force: true });
  r = m.kjor({ FAKE_ALDER: String(30 * 3600) }); assert.match(r.stdout, /Nattjobbene har ikke kjørt på 30 timer/); rmSync(m.state, { force: true });
  r = m.kjor({ FAKE_ALDER: '' }); assert.equal(r.status, 0, 'ingen hjerteslag ennå = ingen alarm');
  m.ryd();
});
test('vakt: varsel som ikke kommer fram lagres ikke (prøver igjen), og eksternt signal sendes når HEALTHCHECK_URL er satt', () => {
  const m = miljo(); let r = m.kjor({ FAKE_APP: 'ned', FAKE_POST: 'ned' }); assert.equal(r.status, 1); assert.equal(existsSync(m.state), false); assert.match(r.stdout, /prøver igjen/);
  writeFileSync(path.join(m.d, 'env'), 'SUPABASE_SERVICE_ROLE_KEY=nokkel123\nHEALTHCHECK_URL=https://hc.example/abc\n');
  rmSync(m.logg, { force: true }); m.kjor(); assert.match(readFileSync(m.logg, 'utf8'), /https:\/\/hc\.example\/abc(\n|$)/);
  rmSync(m.logg, { force: true }); m.kjor({ FAKE_APP: 'ned', FAKE_POST: 'ned' }); assert.match(readFileSync(m.logg, 'utf8'), /hc\.example\/abc\/fail/); assert.equal(existsSync(m.state), true, 'eksternt signal regnes som varslet');
  m.ryd();
});

test('driftTekst og renPunkter', () => {
  assert.equal(driftTekst('feil', ['a']).tittel, 'Driftsfeil på serveren'); assert.equal(driftTekst('feil', ['a', 'b']).tittel, '2 driftsfeil på serveren'); assert.equal(driftTekst('ok', []).ok, true);
  assert.deepEqual(renPunkter(['  a\nb ', '', 5]), ['a b', '5']); assert.equal(renPunkter(Array(30).fill('x')).length, 12); assert.deepEqual(renPunkter('x'), []);
});

const json = (s: number, b: any) => new Response(JSON.stringify(b), { status: s });
function server(erCron = true) {
  const db: Db = { organisasjoner: [{ id: 'o1', aktiv: true }, { id: 'o2', aktiv: false }], hendelseslogg: [] } as any; const pushet: any[] = []; const eposter: any[] = [];
  const ctx = (body: any) => ({ admin: lagFalsk(db, {}, {}).klient as any, body, json, esc: (s: any) => String(s ?? ''), erCron, oppsettFor: async () => ({}),
    sendEpost: async (til: string, emne: string) => { eposter.push({ til, emne }); return { sendt: true }; }, pushTilOrg: async (_a: any, org: string, typer: string[], inn: any, roller?: string[]) => { pushet.push({ org, typer, inn, roller }); return 2; } });
  return { db, pushet, eposter, ctx };
}
test('drift_varsel: push til administratorer i aktive organisasjoner og e-post til DRIFT_EPOST; avvises uten signatur; krever punkter', async () => {
  process.env.DRIFT_EPOST = 'meg@example.no'; const s = server();
  const r = await (await driftHandling(s.ctx({ action: 'drift_varsel', status: 'feil', punkter: ['Disken er 90 % full'] })))!.json();
  assert.equal(r.push, 2); assert.equal(r.epost, 1); assert.equal(s.pushet.length, 1); assert.deepEqual(s.pushet[0].typer, ['drift']); assert.deepEqual(s.pushet[0].roller, ['admin']); assert.equal(s.eposter[0].til, 'meg@example.no');
  assert.equal((await driftHandling(s.ctx({ action: 'drift_varsel', status: 'feil', punkter: [] })))!.status, 400);
  assert.equal((await driftHandling(server(false).ctx({ action: 'drift_varsel', status: 'ok' })))!.status, 403);
  assert.equal((await driftHandling(server(false).ctx({ action: 'jobb_hjerteslag' })))!.status, 403);
  delete process.env.DRIFT_EPOST;
});
test('jobb_hjerteslag skrives til loggen', async () => {
  const s = server(); await driftHandling(s.ctx({ action: 'jobb_hjerteslag', navn: 'ko-auto' })); assert.equal(s.db.hendelseslogg[0].handling, 'jobb'); assert.match(s.db.hendelseslogg[0].tekst, /ko-auto ferdig/);
});
