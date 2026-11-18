// Opplasting av flere dokumenter samtidig, og oversikt over alle dokumenter av én type på en eiendom.
import React, { useRef, useState } from 'react';
import { S, save, toast, useStore, uploadFile, kanDrifteE, canEdit } from './store';
import { DOK_TYPER } from './catalog';
import { ModalFrame, openModal, Chip, FileLink } from '../components/ui';
import { aNavn, byId, dUntil, eNavn, sortBy, today, docCoverage } from './utils';
import { editDok } from './actions';
import { tt } from './i18n';

const MAKS = 50 * 1024 * 1024;
const KUN_ADMIN = ['Leieavtale', 'Forsikringspolise', 'Samordningsavtale', 'Leietakers IK-dokumentasjon'];
type Rad = { id: number; fil: File; tittel: string; status: 'venter' | 'laster' | 'ok' | 'feil'; feil?: string };
let radId = 0;

export const filtittel = (navn: string) => navn.replace(/\.[^.]+$/, '').replace(/^[0-9a-f]{8}-[0-9a-f-]{20,}-/i, '').replace(/[_]+/g, ' ').trim();
export const stor = (b: number) => b >= 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(b / 1024)) + ' kB';

/** Åpner dialogen for opplasting av mange filer. preset: eiendom og dokumenttype som er valgt på forhånd. */
export function lastOppFlereDok(preset: { eiendomId?: string; type?: string } = {}) {
  openModal({ wide: true, render: close => <FlereFiler preset={preset} close={close} /> });
}

function FlereFiler({ preset, close }: { preset: { eiendomId?: string; type?: string }; close: () => void }) {
  useStore();
  const eier = S.eiendommer.filter(e => kanDrifteE(e.id));
  const [eid, setEid] = useState(preset.eiendomId || (eier.length === 1 ? eier[0].id : ''));
  const typer = canEdit() ? DOK_TYPER : DOK_TYPER.filter(t => !KUN_ADMIN.includes(t));
  const [type, setType] = useState(preset.type || 'Annet');
  const [anleggId, setAnleggId] = useState(''); const [gyldigTil, setGyldigTil] = useState('');
  const [rader, setRader] = useState<Rad[]>([]); const [busy, setBusy] = useState(false); const [drag, setDrag] = useState(false);
  const inp = useRef<HTMLInputElement>(null);
  const upd = (id: number, p: Partial<Rad>) => setRader(L => L.map(r => r.id === id ? { ...r, ...p } : r));

  const leggTil = (fl: FileList | File[]) => {
    const nye: Rad[] = []; let for_stor = 0;
    for (const f of Array.from(fl)) {
      if (f.size > MAKS) { for_stor++; continue; }
      nye.push({ id: ++radId, fil: f, tittel: filtittel(f.name) || f.name, status: 'venter' });
    }
    if (for_stor) toast(`${for_stor} ${tt("fil(er) er over 50 MB og ble hoppet over")}`);
    setRader(L => [...L, ...nye.filter(n => !L.some(x => x.fil.name === n.fil.name && x.fil.size === n.fil.size && x.fil.lastModified === n.fil.lastModified))]);
  };
  const dublett = (r: Rad) => !!eid && S.dokumenter.some(d => d.eiendomId === eid && d.fil?.navn === r.fil.name);

  const start = async () => {
    if (!eid) { toast(tt("Velg eiendom først")); return; }
    const jobb = rader.filter(r => r.status === 'venter' || r.status === 'feil'); if (!jobb.length) return;
    setBusy(true); let i = 0, ok = 0;
    const arbeider = async () => {
      while (i < jobb.length) {
        const r = jobb[i++]; upd(r.id, { status: 'laster', feil: '' });
        try {
          const f = await uploadFile(r.fil, eid, undefined);
          if (!f) throw new Error(tt("Opplastingen feilet"));
          const nid = await save('dokumenter', { eiendomId: eid, type, tittel: r.tittel.trim() || type, dato: today(), fil: f, ...(anleggId ? { anleggId } : {}), ...(gyldigTil ? { gyldigTil } : {}) });
          if (!nid) throw new Error(tt("Kunne ikke lagre dokumentet"));
          upd(r.id, { status: 'ok' }); ok++;
        } catch (e: any) { upd(r.id, { status: 'feil', feil: String(e?.message || e) }); }
      }
    };
    await Promise.all([arbeider(), arbeider(), arbeider()]);
    setBusy(false); toast(`${ok} ${tt("av")} ${jobb.length} ${tt("dokumenter lagret")}`);
  };

  const ventende = rader.filter(r => r.status === 'venter' || r.status === 'feil').length; const ferdige = rader.filter(r => r.status === 'ok').length;
  const system = sortBy(S.anlegg.filter(a => a.eiendomId === eid && !a.arkivert), a => aNavn(a.id));
  const hentet = (r: Rad) => r.status === 'ok' ? <Chip c="green">{tt("Lagret")}</Chip> : r.status === 'laster' ? <Chip c="blue">{tt("Laster opp …")}</Chip> : r.status === 'feil' ? <Chip c="red" title={r.feil}>{tt("Feilet")}</Chip> : dublett(r) ? <Chip c="amber" title={tt("Et dokument med samme filnavn finnes allerede på eiendommen")}>{tt("Finnes fra før?")}</Chip> : null;
  return <ModalFrame title={tt("Last opp flere dokumenter")} close={close} foot={<>
    <span className="muted small" style={{ flex: 1 }}>{ferdige > 0 && `${ferdige} ${tt("lagret")}`}{ferdige > 0 && ventende > 0 && ' · '}{ventende > 0 && `${ventende} ${tt("venter")}`}</span>
    <button className="btn" onClick={close} disabled={busy}>{ventende === 0 && ferdige > 0 ? tt("Ferdig") : tt("Lukk")}</button>
    <button className="btn pri" onClick={start} disabled={busy || !ventende || !eid}>{busy ? tt("Laster opp …") : ventende ? `${tt("Last opp")} ${ventende} ${ventende === 1 ? tt("fil") : tt("filer")}` : tt("Last opp")}</button></>}>
    <div className="grid g2">
      <div className="fld"><label>{tt("Eiendom")}</label><select value={eid} disabled={busy} onChange={e => { setEid(e.target.value); setAnleggId(''); }}><option value="">{tt("Velg eiendom …")}</option>{sortBy(eier, e => e.navn).map(e => <option key={e.id} value={e.id}>{e.navn}</option>)}</select></div>
      <div className="fld"><label>{tt("Dokumenttype (gjelder alle filene)")}</label><select value={type} disabled={busy} onChange={e => setType(e.target.value)}>{typer.map(t => <option key={t} value={t}>{tt(t)}</option>)}</select></div>
      <div className="fld"><label>{tt("System (valgfritt)")}</label><select value={anleggId} disabled={busy || !eid} onChange={e => setAnleggId(e.target.value)}><option value="">–</option>{system.map(a => <option key={a.id} value={a.id}>{aNavn(a.id)}</option>)}</select></div>
      <div className="fld"><label>{tt("Gyldig til / revideres (valgfritt)")}</label><input type="date" value={gyldigTil} disabled={busy} onChange={e => setGyldigTil(e.target.value)} /></div>
    </div>
    <div onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); if (!busy && e.dataTransfer.files.length) leggTil(e.dataTransfer.files); }}
      style={{ border: '2px dashed ' + (drag ? 'var(--accent, #2563eb)' : 'var(--line, #cbd5e1)'), borderRadius: 8, padding: '18px 12px', textAlign: 'center', margin: '10px 0', background: drag ? 'rgba(37,99,235,.06)' : undefined }}>
      <div className="muted small" style={{ marginBottom: 8 }}>{tt("Dra filene hit, eller velg dem fra maskinen. Du kan velge mange samtidig (maks 50 MB per fil).")}</div>
      <button className="btn" disabled={busy} onClick={() => inp.current?.click()}>{tt("Velg filer …")}</button>
      <input ref={inp} type="file" multiple hidden onChange={e => { if (e.target.files?.length) leggTil(e.target.files); e.target.value = ''; }} />
    </div>
    {rader.length > 0 && <div style={{ maxHeight: '40vh', overflow: 'auto' }}><table><thead><tr><th>{tt("Tittel")}</th><th>{tt("Fil")}</th><th /><th /></tr></thead><tbody>
      {rader.map(r => <tr key={r.id}>
        <td><input value={r.tittel} disabled={r.status === 'laster' || r.status === 'ok'} onChange={e => upd(r.id, { tittel: e.target.value })} style={{ width: '100%', minWidth: 160 }} /></td>
        <td className="small muted">{r.fil.name} · {stor(r.fil.size)}</td><td>{hentet(r)}</td>
        <td>{r.status !== 'laster' && r.status !== 'ok' && <button className="btn ghost sm" title={tt("Fjern fra listen")} onClick={() => setRader(L => L.filter(x => x.id !== r.id))}>✕</button>}</td></tr>)}
    </tbody></table></div>}
    {rader.length > 1 && !busy && ventende > 0 && <p className="small muted" style={{ marginBottom: 0 }}>{tt("Tittelen foreslås ut fra filnavnet. Du kan endre den før opplasting.")}</p>}
  </ModalFrame>;
}

/** Alle dokumenter av én type på en eiendom, med knapper for å legge til flere. */
export function visDokumenterAvType(eid: string, type: string) {
  openModal({ wide: true, render: close => <TypeListe eid={eid} type={type} close={close} /> });
}
function TypeListe({ eid, type, close }: { eid: string; type: string; close: () => void }) {
  useStore();
  const e = byId('eiendommer', eid); const ds = e ? (docCoverage(e, [type])[0] as any).ds as any[] | undefined : undefined;
  const L = sortBy((ds || S.dokumenter.filter(d => d.eiendomId === eid && d.type === type)), d => d.tittel || '');
  const ok = kanDrifteE(eid);
  return <ModalFrame title={`${tt(type)} – ${eNavn(eid)}`} close={close} foot={<>
    <span style={{ flex: 1 }} />{ok && <><button className="btn" onClick={() => { close(); editDok(undefined, { eiendomId: eid, type, tittel: type }); }}>{tt("+ Ett dokument")}</button>
      <button className="btn pri" onClick={() => { close(); lastOppFlereDok({ eiendomId: eid, type }); }}>{tt("+ Last opp flere filer")}</button></>}
    <button className="btn" onClick={close}>{tt("Lukk")}</button></>}>
    {L.length === 0 ? <p className="muted">{tt("Ingen dokumenter av denne typen ennå.")}</p> : <table><thead><tr><th>{tt("Tittel")}</th><th>{tt("Fil")}</th><th>{tt("Dato")}</th><th>{tt("Gyldig til")}</th></tr></thead><tbody>
      {L.map(d => { const u = d.gyldigTil ? dUntil(d.gyldigTil) as number : null; return <tr key={d.id}>
        <td><a href="#" onClick={ev => { ev.preventDefault(); close(); editDok(d.id); }}>{d.tittel || d.type}</a></td>
        <td>{d.fil ? <FileLink fil={d.fil} /> : <span className="muted">{d.plassering || '–'}</span>}</td>
        <td className="mono small">{d.dato || ''}</td>
        <td>{d.gyldigTil ? <Chip c={u! < 0 ? 'red' : u! <= 90 ? 'amber' : 'green'}>{d.gyldigTil}</Chip> : <span className="muted">–</span>}</td></tr>; })}
    </tbody></table>}
  </ModalFrame>;
}
