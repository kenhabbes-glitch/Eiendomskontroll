// Abonnement: sperret modul, kundens modulkort med priser og bestilling, og plattformadministratorens
// modulstyring per kunde, prisliste og behandling av bestillinger.
import React, { useEffect, useState } from 'react';
import { S, mineOrg, sb, state, toast, useStore, feiltekst, bump } from '../lib/store';
import { Chip, openModal, confirmBox } from '../components/ui';
import { fd, today } from '../lib/utils';
import { MODULER, TRINN, kr, lastModuler, lastPriser, modulerAktivert, orgHar, priser, proveTil, type ModulKey, type Priser, type Trinn } from '../lib/moduler';

export function ModulSperret({ k }: { k: ModulKey }) {
  const m = MODULER.find(x => x.k === k);
  return <><h1>{m?.navn || 'Modul'}</h1><div className="card" style={{ maxWidth: 640 }}>
    <p><b>Denne modulen er ikke aktivert for organisasjonen.</b></p><p className="muted">{m?.tekst}</p>
    {m && <ul>{m.inneholder.map(x => <li key={x}>{x}</li>)}</ul>}
    <p className="small">Administratoren i organisasjonen kan bestille modulen under Organisasjon og tilgang → Abonnement. Data dere har registrert tidligere, blir liggende og kommer tilbake når modulen aktiveres.</p>
    <a className="btn" href="#/brukere">Se abonnement og priser</a></div></>;
}

const trinnNavn = (t?: string | null) => TRINN.find(x => x[0] === t)?.[1] || '';
const pris = (P: Priser | null, k: string, t: Trinn) => P?.moduler?.[k]?.[t] ?? null;

/** Kundens oversikt: moduler med innhold, pris per trinn, status og bestilling */
export function AbonnementOversikt({ orgId, velger }: { orgId: string; velger?: React.ReactNode }) {
  useStore();
  const org = S.orgs.find(o => o.id === orgId) || mineOrg()[0]; const [P, setP] = useState<Priser | null>(priser()); const [B, setB] = useState<any[] | null>(null);
  const lastB = () => { sb.from('modul_bestilling').select('*').eq('org_id', orgId).order('opprettet', { ascending: false }).then(({ data, error }) => setB(error ? null : data || [])); };
  useEffect(() => { lastPriser().then(setP); lastB(); }, [orgId]);
  if (!modulerAktivert()) return <div className="card"><p className="muted">Modulstyring er ikke slått på ennå – alle funksjoner er tilgjengelige.</p></div>;
  const trinn = (org?.abonnement_trinn || null) as Trinn | null;
  const aktive = MODULER.filter(m => orgHar(orgId, m.k));
  const sum = trinn && P ? aktive.filter(m => !proveTil(m.k, orgId)).reduce((s, m) => s + (pris(P, m.k, trinn) || 0), 0) : 0;
  const venter = (k: string) => B?.find(b => b.modul === k && b.status === 'ny');
  const bestill = (k: ModulKey) => openModal({ render: close => <BestillBody orgId={orgId} k={k} P={P} trinn={trinn} close={close} ferdig={lastB} /> });
  return <>
    <div className="card" style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 220 }}><div className="small muted">Abonnement {velger || <b>{org?.navn}</b>}</div>
        <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>{trinn ? trinnNavn(trinn) : aktive.some(m => proveTil(m.k, orgId)) ? 'Prøveperiode' : 'Ikke valgt'}</div>
        <div className="small muted">{trinn === 'en' ? 'Én bruker i organisasjonen' : trinn === 'fler' ? 'Ubegrenset antall brukere' : 'Velg trinn når dere bestiller'}</div></div>
      {sum > 0 && <div style={{ textAlign: 'right' }}><div className="small muted">Månedspris for aktive moduler</div><div style={{ fontSize: 18, fontWeight: 700 }}>{kr(sum)}</div><div className="small muted">eks. mva.</div></div>}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12, marginTop: 12 }}>
      {MODULER.map(m => { const har = orgHar(orgId, m.k); const pt = proveTil(m.k, orgId); const v = venter(m.k); const harPris = TRINN.some(([t]) => pris(P, m.k, t) !== null);
        return <div key={m.k} className="card" style={{ margin: 0, display: 'flex', flexDirection: 'column', borderColor: har && !pt ? 'var(--green)' : undefined }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}><b style={{ flex: 1, fontSize: 15 }}>{m.navn}</b>
            {m.k === 'kjerne' ? <Chip c="green">Inkludert</Chip> : har ? (pt ? <Chip c="amber">Prøve til {fd(pt)}</Chip> : <Chip c="green">Aktiv</Chip>) : v ? <Chip c="amber">Bestilt</Chip> : null}</div>
          <p className="small muted" style={{ margin: '4px 0 8px' }}>{m.tekst}</p>
          <ul className="small" style={{ margin: '0 0 10px', paddingLeft: 18, flex: 1 }}>{m.inneholder.map(x => <li key={x}>{x}</li>)}</ul>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
            {TRINN.map(([t, l]) => { const p = pris(P, m.k, t); return <div key={t} style={{ border: '1px solid ' + (trinn === t ? 'var(--acc)' : 'var(--line)'), borderRadius: 8, padding: '6px 8px', background: trinn === t ? 'var(--surface2)' : undefined }}>
              <div className="small muted">{l}</div><b>{p === null ? (harPris ? '–' : 'På forespørsel') : p === 0 ? 'Inkludert' : kr(p)}</b>{p ? <span className="small muted"> /mnd</span> : null}</div>; })}
          </div>
          {m.k !== 'kjerne' && (!har || pt) && (v ? <p className="small muted" style={{ margin: 0 }}>Bestilt {fd(String(v.opprettet || v.created_at || '').slice(0, 10))} – aktiveres av leverandøren.</p>
            : <button className="btn pri sm" onClick={() => bestill(m.k)}>{pt ? 'Bestill – behold etter prøveperioden' : 'Bestill modulen'}</button>)}
        </div>; })}
    </div>
    <p className="small muted" style={{ marginTop: 8 }}>Priser per måned eks. mva.{P?.notat ? ' ' + P.notat : ''} Bestillinger aktiveres av leverandøren, normalt innen én virkedag. Dere får faktura fra leverandøren.</p>
    {B && B.length > 0 && <div className="card"><b>Bestillinger</b><table style={{ marginTop: 6 }}><tbody>{B.slice(0, 10).map(b => <tr key={b.id}><td className="small">{fd(String(b.opprettet || b.created_at || '').slice(0, 10))}</td><td>{MODULER.find(m => m.k === b.modul)?.navn || b.modul}</td><td className="small">{trinnNavn(b.trinn)}</td><td>{b.status === 'ny' ? <Chip c="amber">Venter</Chip> : b.status === 'aktivert' ? <Chip c="green">Aktivert</Chip> : <Chip c="grey">Avvist</Chip>}</td></tr>)}</tbody></table></div>}
  </>;
}

function BestillBody({ orgId, k, P, trinn, close, ferdig }: { orgId: string; k: ModulKey; P: Priser | null; trinn: Trinn | null; close: () => void; ferdig: () => void }) {
  const m = MODULER.find(x => x.k === k)!; const [t, setT] = useState<Trinn>(trinn || 'fler'); const [komm, setKomm] = useState(''); const [busy, setBusy] = useState(false);
  const send = async () => { setBusy(true);
    const { error } = await sb.from('modul_bestilling').insert({ org_id: orgId, modul: k, trinn: t, status: 'ny', kommentar: komm.slice(0, 1000) || null, bestilt_av_navn: state.me?.navn || state.me?.epost });
    setBusy(false); if (error) return toast(/relation|does not exist|schema/i.test(error.message) ? 'Bestilling er ikke slått på ennå – ta kontakt med leverandøren.' : feiltekst(error));
    toast('Bestillingen er sendt – leverandøren aktiverer modulen'); ferdig(); close(); };
  return <><div className="mh"><h2>Bestill {m.navn}</h2><button className="btn ghost sm" onClick={close}>✕</button></div>
    <div className="mb"><p className="small muted" style={{ marginTop: 0 }}>{m.tekst}</p>
      <div className="small" style={{ fontWeight: 600, marginBottom: 6 }}>Abonnementstrinn</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>{TRINN.map(([v, l, b]) => { const p = pris(P, k, v);
        return <label key={v} className="card" style={{ margin: 0, cursor: 'pointer', borderColor: t === v ? 'var(--acc)' : undefined }}>
          <input type="radio" name="trinn" checked={t === v} onChange={() => setT(v)} /> <b>{l}</b><div className="small muted">{b}</div><div style={{ marginTop: 4 }}><b>{p === null ? 'Pris på forespørsel' : kr(p)}</b>{p ? <span className="small muted"> /mnd eks. mva.</span> : null}</div></label>; })}</div>
      {trinn && trinn !== t && <p className="small" style={{ color: 'var(--amber)' }}>Trinnet gjelder hele abonnementet. Bytter dere fra {trinnNavn(trinn)} til {trinnNavn(t)}, endres prisen også for de andre modulene.</p>}
      <label style={{ display: 'block', marginTop: 10 }}><span className="small" style={{ fontWeight: 600 }}>Kommentar (valgfritt)</span><textarea rows={2} value={komm} onChange={e => setKomm(e.target.value)} style={{ width: '100%' }} placeholder="F.eks. fakturaadresse eller ønsket startdato" /></label>
    </div>
    <div className="mf"><button className="btn" onClick={close}>Avbryt</button><button className="btn pri" disabled={busy} onClick={send}>Send bestilling</button></div></>;
}

// ---------- Plattformadministrator: prisliste
export function prisEditor() { openModal({ wide: true, render: close => <PrisBody close={close} /> }); }
function PrisBody({ close }: { close: () => void }) {
  const [P, setP] = useState<Priser>({ moduler: {} }); const [busy, setBusy] = useState(false); const [ok, setOk] = useState(false);
  useEffect(() => { lastPriser().then(p => { setP(p || { moduler: {} }); setOk(true); }); }, []);
  const sett = (k: string, t: Trinn, v: string) => setP(o => ({ ...o, moduler: { ...o.moduler, [k]: { en: o.moduler[k]?.en ?? null, fler: o.moduler[k]?.fler ?? null, [t]: v === '' ? null : Math.max(0, +v) } } }));
  const lagre = async () => { setBusy(true); const { error } = await sb.from('plattform_innstilling').upsert({ nokkel: 'priser', verdi: { ...P, oppdatert: today() }, endret: new Date().toISOString() }); setBusy(false);
    if (error) return toast(feiltekst(error)); await lastPriser(); bump(); toast('Prislisten er lagret'); close(); };
  return <><div className="mh"><h2>Prisliste (kr per måned eks. mva.)</h2><button className="btn ghost sm" onClick={close}>✕</button></div>
    <div className="mb">{!ok ? <p className="muted">Laster …</p> : <>
      <table><thead><tr><th>Modul</th>{TRINN.map(([t, l]) => <th key={t} className="num">{l}</th>)}</tr></thead><tbody>
        {MODULER.map(m => <tr key={m.k}><td><b style={{ fontWeight: 600 }}>{m.navn}</b></td>{TRINN.map(([t]) => <td key={t} className="num"><input type="number" min={0} step={10} style={{ width: 120, textAlign: 'right' }} value={P.moduler[m.k]?.[t] ?? ''} placeholder="på forespørsel" onChange={e => sett(m.k, t, e.target.value)} /></td>)}</tr>)}
      </tbody></table>
      <label style={{ display: 'block', marginTop: 10 }}><span className="small" style={{ fontWeight: 600 }}>Tekst under prislisten (valgfritt)</span><input style={{ width: '100%' }} value={P.notat || ''} onChange={e => setP({ ...P, notat: e.target.value })} placeholder="F.eks. Årlig forskuddsfakturering. 12 måneders binding." /></label>
      <p className="small muted">Tomt felt = «På forespørsel». 0 = «Inkludert». Kundene ser prisene under Abonnement.</p></>}</div>
    <div className="mf"><button className="btn" onClick={close}>Avbryt</button><button className="btn pri" disabled={busy || !ok} onClick={lagre}>Lagre prisliste</button></div></>;
}

// ---------- Plattformadministrator: bestillinger
export function Bestillinger() {
  useStore(); const [B, setB] = useState<any[] | null>(null);
  const last = () => { sb.from('modul_bestilling').select('*').eq('status', 'ny').order('opprettet').then(({ data, error }) => setB(error ? null : data || [])); };
  useEffect(() => { last(); }, []);
  if (!B || !B.length) return null;
  const behandle = async (b: any, aktiver: boolean) => {
    if (aktiver) {
      const { error } = await sb.from('org_modul').upsert({ org_id: b.org_id, modul: b.modul, aktiv: true, prove_til: null, til: null, merknad: `Bestilt ${String(b.opprettet || b.created_at || '').slice(0, 10)} av ${b.bestilt_av_navn || ''}`, endret: new Date().toISOString() });
      if (error) return toast(feiltekst(error));
      const org = S.orgs.find(o => o.id === b.org_id);
      if (b.trinn && org?.abonnement_trinn !== b.trinn) { const { error: te } = await sb.from('organisasjoner').update({ abonnement_trinn: b.trinn }).eq('id', b.org_id); if (te) toast(feiltekst(te)); else if (org) org.abonnement_trinn = b.trinn; }
    } else if (!(await confirmBox('Avvise bestillingen? Kunden ser at den er avvist.', 'Avvis'))) return;
    await sb.from('modul_bestilling').update({ status: aktiver ? 'aktivert' : 'avvist', behandlet: new Date().toISOString() }).eq('id', b.id);
    await lastModuler(); bump(); toast(aktiver ? 'Modulen er aktivert' : 'Bestillingen er avvist'); last(); };
  return <div className="card" style={{ borderColor: 'var(--amber)', marginBottom: 12 }}><b>Nye bestillinger ({B.length})</b>
    <table style={{ marginTop: 6 }}><tbody>{B.map(b => <tr key={b.id}><td className="small">{fd(String(b.opprettet || b.created_at || '').slice(0, 10))}</td><td><b style={{ fontWeight: 600 }}>{S.orgs.find(o => o.id === b.org_id)?.navn || '?'}</b><div className="small muted">{b.bestilt_av_navn}{b.kommentar ? ' · «' + b.kommentar + '»' : ''}</div></td>
      <td>{MODULER.find(m => m.k === b.modul)?.navn || b.modul}</td><td className="small">{trinnNavn(b.trinn)}</td>
      <td style={{ whiteSpace: 'nowrap' }}><button className="btn sm pri" style={{ marginRight: 6 }} onClick={() => behandle(b, true)}>Aktiver</button><button className="btn sm" onClick={() => behandle(b, false)}>Avvis</button></td></tr>)}</tbody></table></div>;
}

// ---------- Plattformadministrator: moduler og trinn per kunde
type Rad = { org_id: string; modul: string; aktiv: boolean; prove_til: string | null; til: string | null; merknad: string | null };
const status = (r?: Rad) => !r || !r.aktiv ? 'av' : r.til && r.til < today() ? 'utlopt' : r.prove_til ? (r.prove_til < today() ? 'utlopt' : 'prove') : r.til ? 'oppsagt' : 'betalt';
export function modulAdmin(org: { id: string; navn: string; abonnement_trinn?: string }) {
  openModal({ wide: true, render: close => <ModulAdminBody org={org} close={close} /> });
}
function ModulAdminBody({ org, close }: { org: { id: string; navn: string; abonnement_trinn?: string }; close: () => void }) {
  const [R, setR] = useState<Record<string, Rad>>({}); const [last, setLast] = useState(true); const [busy, setBusy] = useState(false); const [feil, setFeil] = useState(''); const [trinn, setTrinn] = useState(org.abonnement_trinn || '');
  useEffect(() => { lastPriser(); sb.from('org_modul').select('*').eq('org_id', org.id).then(({ data, error }) => { if (error) setFeil(/relation|does not exist|schema/i.test(error.message) ? 'Modultabellen finnes ikke i databasen ennå.' : feiltekst(error)); setR(Object.fromEntries((data || []).map((r: Rad) => [r.modul, r]))); setLast(false); }); }, [org.id]);
  const sett = (k: string, x: Partial<Rad>) => setR(o => { const std: Rad = { org_id: org.id, modul: k, aktiv: true, prove_til: null, til: null, merknad: null }; return { ...o, [k]: { ...std, ...(o[k] || {}), ...x } }; });
  const velg = (k: string, s: string) => { const pluss = (d: number) => { const t = new Date(); t.setDate(t.getDate() + d); return t.toISOString().slice(0, 10); };
    if (s === 'av') sett(k, { aktiv: false }); else if (s === 'betalt') sett(k, { aktiv: true, prove_til: null, til: null }); else if (s === 'prove') sett(k, { aktiv: true, prove_til: R[k]?.prove_til && R[k].prove_til! >= today() ? R[k].prove_til : pluss(30), til: null }); else if (s === 'oppsagt') sett(k, { aktiv: true, prove_til: null, til: R[k]?.til || pluss(30) }); };
  const lagre = async () => { setBusy(true); const rows = Object.values(R).map(r => ({ org_id: org.id, modul: r.modul, aktiv: r.aktiv, prove_til: r.prove_til || null, til: r.til || null, merknad: r.merknad || null, endret: new Date().toISOString() }));
    const { error } = await sb.from('org_modul').upsert(rows);
    if (!error && (trinn || null) !== (org.abonnement_trinn || null)) { const { error: te } = await sb.from('organisasjoner').update({ abonnement_trinn: trinn || null }).eq('id', org.id); if (te) toast(/abonnement_trinn/.test(te.message) ? 'Abonnementstrinn krever databaseendring 017' : feiltekst(te)); else { const o = S.orgs.find(x => x.id === org.id); if (o) o.abonnement_trinn = trinn || null; } }
    setBusy(false); if (error) return toast(feiltekst(error)); await lastModuler(); bump(); toast('Abonnementet er oppdatert for ' + org.navn); close(); };
  const P = priser(); const sum = trinn && P ? MODULER.filter(m => m.k === 'kjerne' || ['betalt', 'oppsagt'].includes(status(R[m.k]))).reduce((s, m) => s + (P.moduler[m.k]?.[trinn as Trinn] || 0), 0) : 0;
  return <><div className="mh"><h2>Abonnement – {org.navn}</h2><button className="btn ghost sm" onClick={close}>✕</button></div>
    <div className="mb">{feil ? <div className="note">{feil}</div> : last ? <p className="muted">Laster …</p> : <>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}><b>Trinn</b>
        <select value={trinn} onChange={e => setTrinn(e.target.value)}><option value="">Ikke satt (ingen brukergrense)</option>{TRINN.map(([t, l, b]) => <option key={t} value={t}>{l} – {b}</option>)}</select>
        {sum > 0 && <span className="small muted" style={{ marginLeft: 'auto' }}>Månedspris for betalte moduler: <b>{kr(sum)}</b> eks. mva.</span>}</div>
      <div className="tbl-wrap"><table><thead><tr><th>Modul</th><th>Status</th><th>Dato</th><th>Merknad</th></tr></thead><tbody>
        {MODULER.filter(m => m.k !== 'kjerne').map(m => { const r = R[m.k]; const s = status(r);
          return <tr key={m.k}><td><b style={{ fontWeight: 600 }}>{m.navn}</b><div className="small muted">{m.inneholder.join(' · ')}</div></td>
            <td><select value={s === 'utlopt' ? (r?.prove_til ? 'prove' : 'oppsagt') : s} onChange={e => velg(m.k, e.target.value)}><option value="av">Ikke aktivert</option><option value="prove">Prøveperiode</option><option value="betalt">Aktiv (betalt)</option><option value="oppsagt">Oppsagt – gjelder til</option></select>
              {s === 'utlopt' && <div><Chip c="red">Utløpt</Chip></div>}</td>
            <td>{(s === 'prove' || (s === 'utlopt' && r?.prove_til)) && <input type="date" value={r?.prove_til || ''} onChange={e => sett(m.k, { prove_til: e.target.value })} />}
              {(s === 'oppsagt' || (s === 'utlopt' && r?.til)) && <input type="date" value={r?.til || ''} onChange={e => sett(m.k, { til: e.target.value })} />}</td>
            <td><input value={r?.merknad || ''} onChange={e => sett(m.k, { merknad: e.target.value })} placeholder="F.eks. avtale, pris" /></td></tr>; })}
      </tbody></table></div></>}
      <p className="small muted">Kjernen er alltid med. Modulene til eieren av en eiendom gjelder også for forvaltere og servicefirma som jobber på eiendommen. Data blir liggende når en modul slås av. Enbruker begrenser organisasjonen til én bruker.</p></div>
    <div className="mf"><button className="btn" onClick={close}>Avbryt</button>{!feil && <button className="btn pri" disabled={busy || last} onClick={lagre}>Lagre</button>}</div></>;
}
