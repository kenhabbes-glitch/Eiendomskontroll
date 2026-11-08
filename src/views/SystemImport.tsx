// Import av systemer fra datainnsamlingsfil (Excel). Steg: fil → hvilket bygg (eller ny eiendom) → kontroll av radene → import.
import React, { useMemo, useState } from 'react';
import { S, save, toast, useStore, kanRedigereE, mineOrg } from '../lib/store';
import { byId, sortBy, nok, type Rec } from '../lib/utils';
import { ModalFrame, openModal, Chip } from '../components/ui';
import { editEiendom, generatePlan } from '../lib/actions';
import { KOMP } from '../lib/catalog';
import { lesXlsx, lesCsv, tolkData, tolkGenerell, foreslaKolonner, GEN_FELT, tilSystem, type ImportRad } from '../lib/systemImport';
import { tt, lokale } from '../lib/i18n';

export function importerSystemer(eid?: string) { openModal({ wide: true, render: close => <Dialog eid0={eid} close={close} /> }); }

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9æøå]/g, '');
const filNavn = (n: string) => n.replace(/\.xlsx?$/i, '').replace(/^[0-9a-f]{6,}-/i, '').replace(/_/g, ' ').trim();
const typeValg = sortBy(Object.entries(KOMP).map(([k, v]) => [k, `${v.g.split(' ')[0]} · ${v.n}`] as [string, string]), x => x[1]);

function Dialog({ eid0, close }: { eid0?: string; close: () => void }) {
  useStore();
  const [ark, setArk] = useState<Record<string, any[][]> | null>(null); const [navn, setNavn] = useState(''); const [feil, setFeil] = useState('');
  const [eid, setEid] = useState(eid0 || ''); const [steg, setSteg] = useState<'fil' | 'kolonner' | 'bygg' | 'sjekk' | 'ferdig'>('fil');
  const [gen, setGen] = useState<{ ark: Record<string, any[][]>; ark1: string; hode: number; map: Record<string, number> } | null>(null);
  const [endr, setEndr] = useState<Record<number, Partial<ImportRad>>>({}); const [eks, setEks] = useState<'oppdater' | 'hopp'>('oppdater');
  const [busy, setBusy] = useState(false); const [res, setRes] = useState<{ ny: number; opp: number; hopp: number } | null>(null);
  const E = sortBy(S.eiendommer.filter(e => kanRedigereE(e.id)), e => e.navn || '');
  const kanNy = mineOrg(['admin', 'forvalter']).length > 0;
  const genR = gen ? gen.ark[gen.ark1] || [] : [];
  const tolket = useMemo(() => gen && eid ? { rader: tolkGenerell(genR, gen.hode, gen.map, eid), feil: '' } : ark && eid ? tolkData(ark, eid) : null, [ark, gen, eid, S.anlegg.length]);
  const rader: ImportRad[] = (tolket?.rader || []).map(r => ({ ...r, ...(endr[r.rad] || {}) }));
  const settR = (rad: number, p: Partial<ImportRad>) => setEndr(x => ({ ...x, [rad]: { ...(x[rad] || {}), ...p } }));

  const velgFil = async (f?: File | null) => {
    if (!f) return; setFeil(''); setBusy(true);
    try { const a = await lesXlsx(f); setArk(a); setNavn(filNavn(f.name)); const t = tolkData(a, '__'); if (t.feil) { setFeil(t.feil); setBusy(false); return; }
      // Foreslå bygg ut fra filnavnet
      if (!eid) { const n = norm(filNavn(f.name)); const m = E.find(e => n && (norm(e.navn || '').includes(n) || n.includes(norm(e.navn || '')) || norm(e.adresse || '').includes(n))); if (m) setEid(m.id); }
      setSteg('bygg'); }
    catch (e: any) { setFeil(tt("Kunne ikke lese filen: ") + (e?.message || e) + tt(". Lagre den som .xlsx og prøv igjen.")); }
    setBusy(false);
  };
  const velgGenerell = async (f?: File | null) => {
    if (!f) return; setFeil(''); setBusy(true);
    try { let a: Record<string, any[][]>; if (/\.xlsx?$/i.test(f.name)) a = await lesXlsx(f); else a = { [filNavn(f.name) || 'Data']: lesCsv(await f.text()) };
      const navnL = Object.keys(a).filter(n => (a[n] || []).length > 1); if (!navnL.length) { setFeil(tt("Fant ingen rader i filen.")); setBusy(false); return; }
      const ark1 = navnL.sort((x, y) => a[y].length - a[x].length)[0]; const fk = foreslaKolonner(a[ark1]);
      setArk(null); setNavn(filNavn(f.name)); setGen({ ark: a, ark1, hode: fk.hode, map: fk.map });
      if (!eid) { const n = norm(filNavn(f.name)); const m = E.find(e => n && (norm(e.navn || '').includes(n) || n.includes(norm(e.navn || '')))); if (m) setEid(m.id); }
      setSteg('kolonner'); }
    catch (e: any) { setFeil(tt("Kunne ikke lese filen: ") + (e?.message || e) + tt(". Lagre den som .xlsx eller .csv og prøv igjen.")); }
    setBusy(false);
  };
  const velgArk = (n: string) => { const fk = foreslaKolonner(gen!.ark[n]); setGen({ ...gen!, ark1: n, hode: fk.hode, map: fk.map }); };
  const nyEiendom = () => editEiendom(undefined, nid => { setEid(nid); setSteg('sjekk'); }, { navn });
  const importer = async () => {
    const L = rader.filter(r => r.ta && !(r.finnes && eks === 'hopp')); if (!L.length) return toast(tt("Ingen rader valgt"));
    setBusy(true); let ny = 0, opp = 0;
    try {
      for (const r of L) { const f = r.finnes ? byId('anlegg', r.finnes.id) : null; await save('anlegg', tilSystem(r, eid, f)); f ? opp++ : ny++; }
      setRes({ ny, opp, hopp: rader.filter(r => r.ta).length - L.length }); setSteg('ferdig');
    } catch (e: any) { toast(tt("Importen stoppet: ") + (e?.message || e)); }
    setBusy(false);
  };
  const e = eid ? byId('eiendommer', eid) : null; const valgt = rader.filter(r => r.ta); const sumKost = valgt.reduce((s, r) => s + (r.kost || 0), 0);
  const tittel = steg === 'fil' ? 'Importer systemer fra Excel' : steg === 'kolonner' ? 'Koble kolonnene i filen' : steg === 'bygg' ? 'Hvilket bygg tilhører dataene?' : steg === 'sjekk' ? `Kontroller og importer – ${e?.navn || ''}` : 'Import fullført';
  return <ModalFrame title={tittel} close={close} foot={<>
    {steg === 'kolonner' && <><button className="btn" onClick={() => { setGen(null); setSteg('fil'); }}>{tt("← Tilbake")}</button><span className="grow" /><button className="btn pri" disabled={gen?.map.navn == null && gen?.map.type == null} onClick={() => setSteg(eid ? 'sjekk' : 'bygg')}>{tt("Neste →")}</button></>}
    {steg === 'bygg' && <><button className="btn" onClick={() => setSteg(gen ? 'kolonner' : 'fil')}>{tt("← Tilbake")}</button><span className="grow" /><button className="btn pri" disabled={!eid} onClick={() => setSteg('sjekk')}>{tt("Neste →")}</button></>}
    {steg === 'sjekk' && <><button className="btn" onClick={() => setSteg('bygg')}>{tt("← Bytt bygg")}</button><span className="grow" /><span className="small muted">{valgt.length} {tt("systemer ·")} {nok(sumKost)}</span><button className="btn pri" disabled={busy || !valgt.length} onClick={importer}>{busy ? tt("Importerer …") : tt("Importer {0} systemer", valgt.filter(r => !(r.finnes && eks === 'hopp')).length)}</button></>}
    {steg === 'ferdig' && <><span className="grow" /><button className="btn" onClick={() => { close(); location.hash = '#/eiendom/' + eid; }}>{tt("Gå til eiendommen")}</button><button className="btn pri" onClick={() => { close(); generatePlan(eid); }}>{tt("Lag kontrollplan for systemene →")}</button></>}
    {steg === 'fil' && <><span className="grow" /><button className="btn" onClick={close}>{tt("Avbryt")}</button></>}</>}>
    {steg === 'fil' && <div>
      <p style={{ marginTop: 0 }}>{tt("Velg datainnsamlingsfilen (Excel). Appen leser arket")} <b>{tt("«Data»")}</b> {tt("og tar med radene som er merket")} <b>{tt("«Aktuelt for bygg»")}</b>{tt(": NS 3451-kode, systemnummer, beskrivelse, mengde og kostnad, tilstandsgrad, installasjonsår, levetid og planlagt investeringsår.")}</p>
      <label className="btn pri" style={{ display: 'inline-flex' }}>{busy ? tt("Leser filen …") : tt("Velg Excel-fil")}<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" style={{ display: 'none' }} onChange={x => velgFil(x.target.files?.[0])} /></label>
      <hr style={{ margin: '14px 0', border: 0, borderTop: '1px solid var(--line)' }} />
      <p style={{ marginBottom: 6 }}><b>{tt("Fra et annet system (Dalux, Plania, Facilit, Propely …) eller egen liste")}</b></p>
      <p className="small muted" style={{ marginTop: 0 }}>{tt("Eksporter systemene som Excel eller CSV fra det gamle systemet. Du kobler kolonnene selv i neste steg, og appen foreslår koblingen ut fra overskriftene.")}</p>
      <label className="btn" style={{ display: 'inline-flex' }}>{busy ? tt("Leser filen …") : tt("Velg Excel- eller CSV-fil")}<input type="file" accept=".xlsx,.csv,.txt,text/csv" style={{ display: 'none' }} onChange={x => { velgGenerell(x.target.files?.[0]); x.target.value = ''; }} /></label>
      {feil && <p style={{ color: 'var(--red)' }}>{feil}</p>}
      <p className="small muted">{tt("Filen leses her i nettleseren. Bare systemene du velger å importere, lagres i Eiendomskontroll.")}</p></div>}
    {steg === 'kolonner' && gen && (() => { const hdr = (genR[gen.hode] || []).map((h: any, i: number) => String(h ?? '').trim() || tt("Kolonne {0}", i + 1)); const ant = genR.length - gen.hode - 1;
      return <div>
        <p style={{ marginTop: 0 }}>{tt("Filen")} <b>{navn}</b> {tt("har")} {ant} {tt("rader. Velg hvilken kolonne som inneholder hva. Trenger du bare navn eller type, er det nok. Resten fylles inn der det finnes.")}</p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
          {Object.keys(gen.ark).length > 1 && <label className="small">{tt("Ark")}<br /><select value={gen.ark1} onChange={x => velgArk(x.target.value)}>{Object.keys(gen.ark).map(n => <option key={n} value={n}>{n}</option>)}</select></label>}
          <label className="small">{tt("Overskriften står i rad")}<br /><input type="number" min={1} max={30} value={gen.hode + 1} style={{ width: 70 }} onChange={x => { const h = Math.max(0, +x.target.value - 1); const fk = foreslaKolonner(genR.slice(h)); setGen({ ...gen, hode: h, map: Object.fromEntries(Object.entries(fk.map)) }); }} /></label></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(250px,1fr))', gap: '6px 14px' }}>
          {GEN_FELT.map(f => <label key={f.k} className="small">{tt(f.navn)}<br /><select value={gen.map[f.k] ?? -1} onChange={x => { const m = { ...gen.map }; if (+x.target.value < 0) delete m[f.k]; else m[f.k] = +x.target.value; setGen({ ...gen, map: m }); }} style={{ width: '100%', borderColor: gen.map[f.k] == null && (f.k === 'navn') ? 'var(--amber)' : undefined }}><option value={-1}>{tt("– ikke i filen –")}</option>{hdr.map((h: string, i: number) => <option key={i} value={i}>{h}</option>)}</select></label>)}</div>
        <div className="tbl-wrap" style={{ maxHeight: 220, marginTop: 10 }}><table><thead><tr>{hdr.slice(0, 12).map((h: string, i: number) => <th key={i}>{h}</th>)}</tr></thead><tbody>{genR.slice(gen.hode + 1, gen.hode + 6).map((r, j) => <tr key={j}>{hdr.slice(0, 12).map((_: any, i: number) => <td key={i} className="small">{String(r?.[i] ?? '')}</td>)}</tr>)}</tbody></table></div>
        <p className="small muted">{tt("Appen foreslår type og NS 3451-kode ut fra tekstene. Du kontrollerer og retter hver rad i neste steg før noe lagres.")}</p></div>; })()}
    {steg === 'bygg' && <div>
      <p style={{ marginTop: 0 }}>{tt("Filen")} <b>{navn}</b> {tt("har")} {(gen ? tolkGenerell(genR, gen.hode, gen.map, '__').length : tolkData(ark!, '__').rader.length)} {tt("systemer merket «Aktuelt for bygg». Velg bygget de hører til:")}</p>
      {E.length ? <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflow: 'auto' }}>{E.map(x => <label key={x.id} className={'kr-rad' + (eid === x.id ? ' ok' : '')} style={{ cursor: 'pointer' }}>
        <input type="radio" name="bygg" checked={eid === x.id} onChange={() => setEid(x.id)} style={{ width: 'auto' }} />
        <span style={{ flex: 1 }}><b>{x.navn}</b><span className="small muted" style={{ display: 'block' }}>{[x.adresse, x.poststed].filter(Boolean).join(', ')} · {S.anlegg.filter(a => a.eiendomId === x.id).length} {tt("systemer fra før")}</span></span></label>)}</div>
        : <div className="note" style={{ color: 'var(--ink)' }}>{tt("Du har ikke registrert noen eiendommer ennå.")}</div>}
      {kanNy && <p><button className="btn" onClick={nyEiendom}>{tt("+ Registrer ny eiendom")}{navn ? tt(" («{0}»)", navn) : ''}</button> <span className="small muted">{tt("Systemene importeres til den nye eiendommen etterpå.")}</span></p>}
    </div>}
    {steg === 'sjekk' && tolket && <div>
      {rader.some(r => r.finnes) && <div className="note" style={{ color: 'var(--ink)', marginBottom: 8 }}>{rader.filter(r => r.finnes).length} {tt("systemer finnes allerede på bygget (samme TFM-kode).")}
        <select value={eks} onChange={x => setEks(x.target.value as any)} style={{ marginLeft: 8 }}><option value="oppdater">{tt("Oppdater dem med verdiene fra filen")}</option><option value="hopp">{tt("Hopp over dem")}</option></select></div>}
      <div className="tbl-wrap" style={{ maxHeight: '55vh' }}><table><thead><tr><th><input type="checkbox" style={{ width: 'auto' }} checked={rader.every(r => r.ta)} onChange={x => setEndr(p => Object.fromEntries(rader.map(r => [r.rad, { ...(p[r.rad] || {}), ta: x.target.checked }])))} /></th>
        <th>{tt("TFM")}</th><th>{tt("Type i appen")}</th><th>{tt("Betegnelse")}</th><th>{tt("TG")}</th><th>{tt("År")}</th><th>{tt("Utskifting")}</th><th className="num">{tt("Kost")}</th><th /></tr></thead><tbody>
        {rader.map(r => <tr key={r.rad} style={{ opacity: r.ta ? 1 : .45 }}>
          <td><input type="checkbox" style={{ width: 'auto' }} checked={r.ta} onChange={x => settR(r.rad, { ta: x.target.checked })} /></td>
          <td className="mono small" style={{ whiteSpace: 'nowrap' }}>{r.kode ? '=' + r.kode + '.' + r.lop : '–'}<div className="muted" style={{ whiteSpace: 'normal', fontFamily: 'inherit' }}>{(r.del || r.gruppe).replace(/^\d+\s*-\s*/, '')}</div></td>
          <td><select value={r.type} onChange={x => settR(r.rad, { type: x.target.value })} style={{ maxWidth: 190, borderColor: r.type ? undefined : 'var(--amber)' }}><option value="">{tt("– annet (uten katalogtype) –")}</option>{typeValg.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></td>
          <td><input value={r.navn} onChange={x => settR(r.rad, { navn: x.target.value })} style={{ minWidth: 140 }} />{r.komm && <div className="small muted">{r.komm}</div>}</td>
          <td>{r.tg ? <Chip c={r.tg === 'TG3' ? 'red' : r.tg === 'TG2' ? 'amber' : 'green'}>{r.tg}</Chip> : <span className="muted">–</span>}</td>
          <td className="small">{r.aar || '–'}</td><td className="small">{r.planAar || (r.levetid ? tt("levetid {0} år", r.levetid) : '–')}</td>
          <td className="num small mono">{r.kost ? nok(r.kost) : '–'}{/^m(2|²)$/i.test(r.enhet) && r.antall ? <div className="muted">{r.antall.toLocaleString(lokale())} m²</div> : r.antall && r.antall > 1 ? <div className="muted">{r.antall} {r.enhet}</div> : null}</td>
          <td>{r.finnes ? <Chip c={eks === 'hopp' ? '' : 'blue'}>{eks === 'hopp' ? tt("Hoppes over") : tt("Oppdateres")}</Chip> : <Chip c="green">{tt("Ny")}</Chip>}</td></tr>)}
      </tbody></table></div>
      <p className="small muted">{tt("Typen bestemmer levetid, kontroller og sjekklister i appen. Rader markert gult har ingen katalogtype. De importeres likevel med NS 3451-koden, men får ikke automatiske kontroller. Kostnad i m² regnes som areal × enhetspris, så den kan måles opp på tegning senere.")}</p>
    </div>}
    {steg === 'ferdig' && res && <div>
      <p style={{ marginTop: 0 }}><b>{res.ny}</b> {tt("nye systemer og")} <b>{res.opp}</b> {tt("oppdatert på")} <b>{e?.navn}</b>{res.hopp ? tt(", {0} hoppet over", res.hopp) : ''}.</p>
      <p>{tt("Neste steg: lag kontrollplanen. Da foreslås lovpålagte og anbefalte kontroller for systemene, for eksempel brannalarm, nødlys, heis og ventilasjon.")}</p></div>}
  </ModalFrame>;
}
