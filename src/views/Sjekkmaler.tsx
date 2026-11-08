// Sjekklistemaler for komponentvis kontroll (Dokumenter → Sjekklistemaler). Lagres per organisasjon i innstillinger 'sjekkmaler'.
import React, { useState } from 'react';
import { S, canEdit, saveInnst, toast, useStore } from '../lib/store';
import { STD_SJEKKMALER, sjekkMaler, type SjekkMal, type SjekkPunkt } from '../lib/komponentsjekk';
import { Chip, confirmBox, openModal, ModalFrame } from '../components/ui';
import { TFM_KODER, KOMP } from '../lib/catalog';
import { tt } from '../lib/i18n';

export const egneMaler = (): SjekkMal[] => (S.innst.sjekkmaler || []) as SjekkMal[];
export const alleSjekkmaler = () => sjekkMaler(egneMaler());
const kodeNavn = (c: string) => c === '*' ? 'Alle andre komponenttyper' : `${c} – ${TFM_KODER.find(k => k[0] === c)?.[1] || 'ukjent kode'}`;

async function lagre(m: SjekkMal | null, slettId?: string) {
  let E = egneMaler().filter(x => x.id !== (slettId || m?.id));
  if (m) E = [...E, { id: m.id, navn: m.navn, koder: m.koder, systemer: m.systemer?.length ? m.systemer : undefined, punkter: m.punkter, beskr: m.beskr || '' }];
  await saveInnst('sjekkmaler', E);
}

function MalRedigering({ m0, close }: { m0: SjekkMal; close: () => void }) {
  const [m, setM] = useState<SjekkMal>(JSON.parse(JSON.stringify(m0)));
  const [koder, setKoder] = useState(m0.koder.join(', '));
  const [type, setType] = useState<'komp' | 'sys'>(m0.systemer ? 'sys' : 'komp');
  const [sys, setSys] = useState<string[]>(m0.systemer || []); const [sysQ, setSysQ] = useState('');
  const setP = (i: number, p: Partial<SjekkPunkt>) => setM({ ...m, punkter: m.punkter.map((x, j) => j === i ? { ...x, ...p } : x) });
  const flytt = (i: number, d: number) => { const P = m.punkter.slice(); const j = i + d; if (j < 0 || j >= P.length) return; [P[i], P[j]] = [P[j], P[i]]; setM({ ...m, punkter: P }); };
  const ok = async () => {
    const K = type === 'sys' ? [] : koder.split(/[,\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
    const P = m.punkter.map(p => ({ ...p, t: p.t.trim() })).filter(p => p.t);
    if (!m.navn.trim()) return toast(tt("Gi malen et navn"));
    if (type === 'komp' && !K.length) return toast(tt("Angi minst én TFM-komponentkode malen gjelder for, f.eks. UN"));
    if (type === 'sys' && !sys.length) return toast(tt("Velg minst én systemtype malen gjelder for"));
    if (!P.length) return toast(tt("Malen må ha minst ett sjekkpunkt"));
    const bruktAv = alleSjekkmaler().find(x => x.id !== m.id && x.koder.some(c => K.includes(c.toUpperCase())));
    if (bruktAv) return toast(tt("Koden {0} brukes allerede av «{1}»", K.find(c => bruktAv.koder.map(x => x.toUpperCase()).includes(c)), bruktAv.navn));
    const bruktS = type === 'sys' ? alleSjekkmaler().find(x => x.id !== m.id && (x.systemer || []).some(t => sys.includes(t))) : null;
    if (bruktS) return toast(tt("«{0}» har allerede malen «{1}»", KOMP[(bruktS.systemer || []).find(t => sys.includes(t))!]?.n, bruktS.navn));
    await lagre({ ...m, navn: m.navn.trim(), koder: K, systemer: type === 'sys' ? sys : undefined, punkter: P }); toast(tt("Malen er lagret")); close();
  };
  const inp = { border: '1px solid var(--line2)', borderRadius: 8, padding: '7px 9px', width: '100%' } as React.CSSProperties;
  return <ModalFrame title={m0.navn ? tt("Rediger sjekklistemal") : tt("Ny sjekklistemal")} close={close} foot={<>
    {m0.std && m0.endret && <button className="btn" onClick={async () => { if (!(await confirmBox(tt("Tilbakestille malen til standardutgaven? Endringene dine forsvinner."), tt("Tilbakestill")))) return; await lagre(null, m.id); toast(tt("Tilbakestilt til standard")); close(); }}>{tt("Tilbakestill til standard")}</button>}
    {!m0.std && m0.navn && <button className="btn danger" onClick={async () => { if (!(await confirmBox(tt("Slette malen «{0}»?", m0.navn)))) return; await lagre(null, m.id); toast(tt("Slettet")); close(); }}>{tt("Slett")}</button>}
    <span className="grow" /><button className="btn" onClick={close}>{tt("Avbryt")}</button><button className="btn pri" onClick={ok}>{tt("Lagre")}</button></>}>
    <div className="frm">
      <div className="fld"><label>{tt("Navn")}</label><input style={inp} value={m.navn} onChange={e => setM({ ...m, navn: e.target.value })} placeholder={tt("F.eks. Brannslukker")} /></div>
      {!m.koder.includes('*') && <div className="fld"><label>{tt("Malen gjelder")}</label><div className="seg">
        <button type="button" className={'btn sm' + (type === 'sys' ? ' pri' : '')} onClick={() => setType('sys')}>{tt("Hele systemet (én sjekkliste per kontroll)")}</button>
        <button type="button" className={'btn sm' + (type === 'komp' ? ' pri' : '')} onClick={() => setType('komp')}>{tt("Hver komponent (f.eks. hver dør)")}</button></div></div>}
      {type === 'komp' || m.koder.includes('*') ? <div className="fld"><label>{tt("Gjelder komponenter med TFM-kode")}</label><input style={inp} value={koder} disabled={m.koder.includes('*')} onChange={e => setKoder(e.target.value)} placeholder={tt("F.eks. UN eller DB, flere kan skilles med komma")} />
        <div className="hint">{m.koder.includes('*') ? tt("Brukes for alle komponenttyper som ikke har egen mal.") : koder.split(/[,\s]+/).filter(Boolean).map(c => kodeNavn(c.toUpperCase())).join(' · ')}</div></div>
      : <div className="fld"><label>{tt("Gjelder systemtyper")}</label>
        <input style={{ ...inp, marginBottom: 6 }} value={sysQ} onChange={e => setSysQ(e.target.value)} placeholder={tt("Søk systemtype …")} />
        <div style={{ maxHeight: 170, overflow: 'auto', border: '1px solid var(--line)', borderRadius: 8, padding: '4px 8px' }}>
          {Object.entries(KOMP).filter(([k, v]) => !k.startsWith('dok_') && (!sysQ || v.n.toLowerCase().includes(sysQ.toLowerCase()) || sys.includes(k))).map(([k, v]) =>
            <label key={k} className="small" style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 400, padding: '2px 0' }}><input type="checkbox" style={{ width: 'auto' }} checked={sys.includes(k)} onChange={e => setSys(e.target.checked ? [...sys, k] : sys.filter(x => x !== k))} />{v.n} <span className="muted">({v.g})</span></label>)}</div>
        <div className="hint">{tt("Sjekklisten vises når en kontroll på et slikt system kvitteres ut – i appen og i lenken til servicefirmaet.")}</div></div>}
      <div className="fld"><label>{tt("Beskrivelse (valgfritt)")}</label><input style={inp} value={m.beskr || ''} onChange={e => setM({ ...m, beskr: e.target.value })} placeholder={tt("Grunnlag, standard eller hvordan kontrollen utføres")} /></div>
      <label style={{ display: 'block', margin: '12px 0 6px', fontWeight: 600 }}>{tt("Sjekkpunkter")}</label>
      {m.punkter.map((p, i) => <div key={p.id} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
        <span className="muted small" style={{ width: 18, textAlign: 'right' }}>{i + 1}.</span>
        <input style={{ ...inp, flex: 1 }} value={p.t} onChange={e => setP(i, { t: e.target.value })} placeholder={tt("Hva skal kontrolleres?")} />
        <label className="small" title={tt("Tas bare med på kontroller hvert halvår eller sjeldnere (årskontroll/service) – ikke på ukentlige og månedlige")} style={{ display: 'flex', gap: 4, alignItems: 'center', whiteSpace: 'nowrap' }}><input type="checkbox" style={{ width: 'auto' }} checked={!!p.aar} onChange={e => setP(i, { aar: e.target.checked || undefined })} />{tt("bare årlig")}</label>
        <button className="btn ghost sm" title={tt("Flytt opp")} onClick={() => flytt(i, -1)} disabled={i === 0}>↑</button>
        <button className="btn ghost sm" title={tt("Flytt ned")} onClick={() => flytt(i, 1)} disabled={i === m.punkter.length - 1}>↓</button>
        <button className="btn ghost sm" title={tt("Fjern")} onClick={() => setM({ ...m, punkter: m.punkter.filter((_, j) => j !== i) })}>✕</button>
      </div>)}
      <button className="btn sm" onClick={() => setM({ ...m, punkter: [...m.punkter, { id: 'p' + Date.now().toString(36), t: '' }] })}>{tt("+ Legg til sjekkpunkt")}</button>
      <p className="small muted">{tt("Endringer gjelder nye kontrollrunder. En runde som er i gang, beholder sjekklisten den ble startet med.")}</p>
    </div>
  </ModalFrame>;
}

export const redigerMal = (m: SjekkMal) => openModal({ wide: true, render: close => <MalRedigering m0={m} close={close} /> });

export function Sjekkmaler() {
  useStore();
  const M = alleSjekkmaler(); const kan = canEdit();
  return <div className="sec">
    <div className="toolbar"><h2 style={{ margin: 0, flex: 1 }}>{tt("Sjekklistemaler")}</h2>
      {kan && <button className="btn" onClick={() => redigerMal({ id: 'm' + Date.now().toString(36), navn: '', koder: [], systemer: [], punkter: [{ id: 'p1', t: '' }] })}>{tt("+ Ny mal")}</button>}</div>
    <p className="small muted" style={{ marginTop: 0 }}>{tt("Sjekklister vises når en kontroll kvitteres ut. Systemmaler gir én sjekkliste for hele anlegget, f.eks. ventilasjon eller heis. Punkter merket «bare årlig» tas bare med på kontroller hvert halvår eller sjeldnere, så ukentlige og månedlige kontroller får den korte listen. Kontroller på systemer med flere like komponenter, f.eks. branndører og nødlys, får én sjekkliste per komponent. Den kvitteres ut komponent for komponent mens du går gjennom bygget, i appen eller via lenken til servicefirmaet. Malen velges ut fra komponentens TFM-kode.")}</p>
    <div className="tbl-wrap"><table><thead><tr><th>{tt("Mal")}</th><th>{tt("Gjelder")}</th><th>{tt("Sjekkpunkter")}</th><th /></tr></thead><tbody>
      {[...M.filter(m => m.systemer?.length), ...M.filter(m => !m.systemer?.length)].map(m => <tr key={m.id} className={kan ? 'click' : ''} onClick={() => kan && redigerMal(m)}>
        <td><b style={{ fontWeight: 600 }}>{m.navn}</b> {m.std ? (m.endret ? <Chip c="amber">{tt("Tilpasset")}</Chip> : <Chip>{tt("Standard")}</Chip>) : <Chip c="blue">{tt("Egen")}</Chip>}{m.beskr && <div className="small muted">{m.beskr}</div>}</td>
        <td className="small">{m.systemer?.length ? <>{tt("System:")} {m.systemer.map(t => KOMP[t]?.n || t).join(', ')}</> : <>{tt("Per komponent:")} {m.koder.map(kodeNavn).join(', ')}</>}</td>
        <td className="small">{m.punkter.length} {tt("punkter")}{m.punkter.some(p => p.aar) ? tt(" ({0} bare årlig)", m.punkter.filter(p => p.aar).length) : ''}</td>
        <td>{kan && <span className="small" style={{ color: 'var(--acc)' }}>{tt("Rediger")}</span>}</td></tr>)}
    </tbody></table></div>
  </div>;
}
export { STD_SJEKKMALER };
