import React from 'react';
import { S, save, saveInnst, toast, kanRedigereE } from '../lib/store';
import { PLIKTER } from '../lib/catalog';
import { byId, aNavn } from '../lib/utils';
import { formModal, type Field } from '../components/ui';
import { Hjelp } from '../components/Hjelp';
import { ANS_VALG, ANS_KORT, AVLEDET, OMR, finnMal, fordeling, kontraktKey, leietakerHar, omrForSys, pliktKeysFor, systemerFor, type Ans, type Celle, type Fordeling } from '../lib/kontrakt';

const selStil = (avvik: boolean): React.CSSProperties => ({ border: '1px solid ' + (avvik ? 'var(--amber)' : 'var(--line2)'), background: avvik ? 'color-mix(in srgb, var(--amber) 10%, transparent)' : undefined, borderRadius: 6, padding: '3px 6px', width: '100%' });

function AnsSel({ val, mal, ro, on }: { val: Ans; mal: Ans; ro: boolean; on: (a: Ans) => void }) {
  if (ro) return <span>{ANS_KORT[val]}</span>;
  return <><select value={val} onChange={e => on(e.target.value as Ans)} style={selStil(val !== mal)} title={val !== mal ? `Avviker fra standard for kontraktstypen (standard: ${ANS_KORT[mal]})` : 'Standard for kontraktstypen'}>
    {ANS_VALG.map(o => <option key={o} value={o}>{ANS_KORT[o]}{o === mal ? ' (standard)' : ''}</option>)}</select>
    {val !== mal && <div style={{ fontSize: 11, marginTop: 2 }} className="muted">Standard: {ANS_KORT[mal]} · <a href="#" onClick={e => { e.preventDefault(); on(mal); }}>tilbakestill</a></div>}</>;
}

export async function settCelle(lid: string, k: string, patch: Partial<Celle>) {
  const l = byId('leietakere', lid)!; const f = fordeling(l); f[k] = { ...f[k], ...patch };
  await save('leietakere', { ...l, kontrakt: kontraktKey(l), ansvar: f });
  if (patch.v || patch.u) toast('Ansvar endret – trykk «Oppdater plikter og kontroller» for å ta det i bruk');
}

export function AnsvarKort({ l }: { l: any }) {
  const f = fordeling(l); const mal = finnMal(kontraktKey(l)); const ro = !kanRedigereE(l.eiendomId);
  const sys = systemerFor(l); const avvik = OMR.filter(o => f[o.k].v !== mal.f[o.k].v || f[o.k].u !== mal.f[o.k].u).length;
  return <div className="sec">
    <div className="toolbar"><h2 style={{ margin: 0, flex: 1 }}>Ansvarsfordeling etter leieavtalen<Hjelp id="kontrakt.type" /></h2>
      {!ro && <><button className="btn sm" onClick={() => lagreSomMal(l.id)} title="Bruk denne fordelingen på andre leietakere med samme kontrakt">Lagre som egen mal</button>
        <button className="btn sm pri" onClick={() => oppdaterEtterKontrakt(l.id)}>Oppdater plikter og kontroller</button></>}</div>
    <p className="small" style={{ marginTop: 0 }}><b>{mal.n}</b><span className="muted"> – {mal.beskr}</span><br />
      <span className="muted">{l.heleBygget ? 'Leietaker leier hele bygget – alle systemer på eiendommen omfattes.' : `${sys.length} system(er) er knyttet til leieobjektet (feltet «Betjener leietaker» på systemet).`}
        {avvik > 0 && <> · <span style={{ color: 'var(--amber)' }}>{avvik} punkt(er) avviker fra malen</span></>}</span></p>
    <div className="tbl-wrap"><table className="small"><thead><tr><th>Ansvarsområde</th><th style={{ width: 190 }}>Drift og vedlikehold</th><th style={{ width: 190 }}>Utskifting</th><th style={{ width: 200 }}>Kontraktspunkt / merknad</th></tr></thead><tbody>
      {OMR.map(o => { const c = f[o.k], m = mal.f[o.k]; return <tr key={o.k}>
        <td>{o.n}{o.sys.length > 0 && <div className="muted" style={{ fontSize: 11 }}>NS 3451: {o.sys.join(', ')}</div>}</td>
        <td><AnsSel val={c.v} mal={m.v} ro={ro} on={x => settCelle(l.id, o.k, { v: x })} /></td>
        <td><AnsSel val={c.u} mal={m.u} ro={ro} on={x => settCelle(l.id, o.k, { u: x })} /></td>
        <td>{ro ? c.p || '' : <input key={c.p || ''} defaultValue={c.p || ''} placeholder="F.eks. § 9.2" onBlur={e => e.target.value !== (c.p || '') && settCelle(l.id, o.k, { p: e.target.value })} style={{ border: '1px solid var(--line2)', borderRadius: 6, padding: '3px 6px', width: '100%' }} />}</td></tr>; })}
    </tbody></table></div>
    <p className="small muted">Tabellen er fylt ut med det som er standard for kontraktstypen. Gå gjennom kontrakten og endre punktene der den sier noe annet – skriv gjerne inn kontraktspunktet. Gul ramme betyr at punktet avviker fra standard; «tilbakestill» setter det tilbake. «Eier, leietaker betaler» betyr at eier utfører og viderefakturerer (vanlig i trippel netto).</p>
  </div>;
}

// ---------- Lagre fordelingen som organisasjonens egen kontraktsmal
export function lagreSomMal(lid: string) {
  const l = byId('leietakere', lid)!;
  formModal({
    title: 'Lagre som egen kontraktsmal', saveTxt: 'Lagre mal',
    fields: [{ k: 'n', label: 'Navn på malen', req: true, def: finnMal(kontraktKey(l)).n + ' – ' + (l.navn || '') },
      { k: 'beskr', label: 'Beskrivelse', type: 'textarea', def: 'Ansvarsfordeling hentet fra leieavtalen med ' + (l.navn || '') }],
    onSave: async x => {
      if (!x.n?.trim()) { toast('Gi malen et navn'); return false; }
      const f: Fordeling = Object.fromEntries(Object.entries(fordeling(l)).map(([k, c]) => [k, { v: c.v, u: c.u }]));
      const key = 'org_' + crypto.randomUUID().slice(0, 8);
      await saveInnst('kontraktsmaler', [...(S.innst.kontraktsmaler || []), { key, n: x.n.trim(), beskr: x.beskr || '', f }]);
      await save('leietakere', { ...l, kontrakt: key, ansvar: fordeling(l) });
      toast('Malen er lagret og kan velges for andre leietakere');
    },
  });
}

// ---------- Forhåndsvisning: hva endres når kontrakten tas i bruk
type Endring = { id: string; gruppe: 'plikt' | 'system'; tekst: string; detalj?: string };
const tilSys = (a: Ans): string | null => a === 'Eier – viderefaktureres' ? 'Eier' : a === 'Ikke aktuelt' ? null : a;

export function beregnEndringer(l: any): Endring[] {
  const ut: Endring[] = []; const f = fordeling(l);
  const har = (l.plikter || []).map((p: any) => p.key); const skal = pliktKeysFor(l);
  skal.filter(k => !har.includes(k)).forEach(k => ut.push({ id: 'p+' + k, gruppe: 'plikt', tekst: 'Ny plikt: ' + PLIKTER[k].n, detalj: PLIKTER[k].h }));
  (l.plikter || []).filter((p: any) => AVLEDET.includes(p.key) && !skal.includes(p.key) && !p.ikkeRelevant)
    .forEach((p: any) => ut.push({ id: 'p-' + p.key, gruppe: 'plikt', tekst: 'Markeres ikke relevant: ' + p.navn, detalj: 'Følger ikke lenger av ansvarsfordelingen' }));
  for (const a of systemerFor(l)) {
    const ok = omrForSys(a.tfmSys); if (!ok) continue; const c = f[ok];
    const nv = tilSys(c.v), nu = tilSys(c.u); const ov = a.ansvar || 'Eier', ou = a.utskiftAnsvar || ov;
    const T = S.oppgaver.filter(o => o.anleggId === a.id && o.aktiv !== false);
    const tAns = nv === 'Leietaker' ? 'Leietaker' : nv === 'Eier' ? 'Eier' : null;
    const tFlytt = tAns ? T.filter(o => (o.ansvar || 'Eier') !== tAns || (tAns === 'Leietaker' ? o.leietakerId !== l.id : !!o.leietakerId && o.leietakerId === l.id)) : [];
    const d: string[] = [];
    if (nv && nv !== ov) d.push(`drift og vedlikehold ${ov} → ${nv}`);
    if (nu && nu !== ou) d.push(`utskifting ${ou} → ${nu}`);
    if (tFlytt.length) d.push(`${tFlytt.length} kontroll(er) flyttes til ${tAns === 'Leietaker' ? 'leietaker' : 'eier'}`);
    if (d.length) ut.push({ id: 's' + a.id, gruppe: 'system', tekst: aNavn(a.id), detalj: OMR.find(o => o.k === ok)!.n + ': ' + d.join(' · ') });
  }
  return ut;
}

async function utfor(lid: string, valgt: string[]) {
  let l = byId('leietakere', lid)!; const f = fordeling(l);
  const pl = (l.plikter || []).map((p: any) => valgt.includes('p-' + p.key) ? { ...p, ikkeRelevant: true } : p);
  valgt.filter(v => v.startsWith('p+')).forEach(v => { const k = v.slice(2); pl.push({ key: k, navn: PLIKTER[k].n, hjemmel: PLIKTER[k].h, frekvens: { n: 1, enhet: 'år' }, sist: '' }); });
  await save('leietakere', { ...l, plikter: pl, ansvar: f, kontrakt: kontraktKey(l) });
  let ns = 0, nt = 0;
  for (const v of valgt.filter(v => v.startsWith('s'))) {
    const a = byId('anlegg', v.slice(1)); if (!a) continue; const c = f[omrForSys(a.tfmSys)!];
    const nv = tilSys(c.v), nu = tilSys(c.u);
    await save('anlegg', { ...a, ...(nv ? { ansvar: nv } : {}), ...(nu ? { utskiftAnsvar: nu } : {}) }); ns++;
    const tAns = nv === 'Leietaker' ? 'Leietaker' : nv === 'Eier' ? 'Eier' : null; if (!tAns) continue;
    for (const o of S.oppgaver.filter(o => o.anleggId === a.id && o.aktiv !== false)) {
      const nyL = tAns === 'Leietaker' ? lid : (o.leietakerId === lid ? '' : o.leietakerId || '');
      if ((o.ansvar || 'Eier') !== tAns || (o.leietakerId || '') !== nyL) { await save('oppgaver', { ...o, ansvar: tAns, leietakerId: nyL }); nt++; }
    }
  }
  const np = valgt.filter(v => v.startsWith('p')).length;
  toast(`Oppdatert: ${np} plikt(er), ${ns} system(er), ${nt} kontroll(er)`);
}

export function oppdaterEtterKontrakt(lid: string) {
  const l = byId('leietakere', lid); if (!l) return;
  const E = beregnEndringer(l);
  if (!E.length) { toast('Plikter og kontroller er allerede i tråd med ansvarsfordelingen'); return; }
  const gr = (g: Endring['gruppe']) => E.filter(e => e.gruppe === g);
  const liste = (g: Endring['gruppe'], tittel: string): Field => ({ k: 'l_' + g, type: 'custom', label: tittel, render: (v, set) => {
    const L = gr(g); if (!L.length) return <div className="muted small">Ingen endringer.</div>;
    return <div className="note small" style={{ color: 'var(--ink)' }}>{L.map(e => { const on = v.valgt.includes(e.id);
      return <label key={e.id} style={{ display: 'flex', gap: 8, alignItems: 'start', margin: '4px 0', cursor: 'pointer', fontWeight: 400 }}>
        <input type="checkbox" checked={on} onChange={() => set({ valgt: on ? v.valgt.filter((x: string) => x !== e.id) : [...v.valgt, e.id] })} style={{ marginTop: 3 }} />
        <span>{e.tekst}{e.detalj && <div className="muted">{e.detalj}</div>}</span></label>; })}</div>; } });
  formModal({
    title: 'Ta i bruk ansvarsfordelingen – ' + l.navn, wide: true, saveTxt: 'Gjennomfør valgte endringer',
    top: <p className="muted small" style={{ marginTop: 0 }}>Kontrakt: <b>{finnMal(kontraktKey(l)).n}</b>. Fjern haken på det som ikke skal endres, f.eks. systemer der kontrakten har særskilte bestemmelser. Allerede registrert historikk endres ikke.</p>,
    fields: [{ k: 'valgt', type: 'custom', def: E.map(e => e.id), render: () => null }, liste('plikt', 'Plikter for leietakeren'), liste('system', 'Systemer og kontroller')],
    onSave: async x => { if (!x.valgt.length) { toast('Ingen endringer valgt'); return false; } await utfor(lid, x.valgt); },
  });
}

// Ansvarsfordeling som leietaker ser i portalen
export function AnsvarPortal({ l }: { l: any }) {
  const f = fordeling(l); const vis = (a: Ans) => a === 'Leietaker' ? <b>Dere</b> : a === 'Eier – viderefaktureres' ? 'Utleier (dere betaler)' : a === 'Ikke aktuelt' ? '–' : a === 'Delt' ? 'Delt' : 'Utleier';
  return <div className="card"><h2>Vedlikeholdsansvar etter leieavtalen</h2><p className="small muted" style={{ marginTop: -6 }}>{finnMal(kontraktKey(l)).n}</p>
    <table className="small"><thead><tr><th style={{ textAlign: 'left' }}>Område</th><th style={{ textAlign: 'left' }}>Vedlikehold</th><th style={{ textAlign: 'left' }}>Utskifting</th></tr></thead>
      <tbody>{OMR.filter(o => f[o.k].v !== 'Ikke aktuelt' || f[o.k].u !== 'Ikke aktuelt').map(o => <tr key={o.k}><td style={{ padding: '5px 8px 5px 0' }}>{o.n}{f[o.k].p && <span className="muted"> ({f[o.k].p})</span>}</td><td style={{ whiteSpace: 'nowrap', paddingRight: 8 }}>{vis(f[o.k].v)}</td><td style={{ whiteSpace: 'nowrap' }}>{vis(f[o.k].u)}</td></tr>)}</tbody></table></div>;
}
export { leietakerHar };
