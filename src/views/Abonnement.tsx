// Abonnement: sperret modul, kundens modulkort med priser og bestilling, og plattformadministratorens
// modulstyring per kunde, prisliste og behandling av bestillinger.
import React, { useEffect, useState } from 'react';
import { S, mineOrg, sb, state, toast, useStore, feiltekst, bump } from '../lib/store';
import { Chip, openModal, confirmBox } from '../components/ui';
import { fd, today } from '../lib/utils';
import { MODULER, STD_TRAPP, kr, lastModuler, lastPriser, modulerAktivert, orgHar, prisPerBruker, prisTotal, priser, proveTil, type ModulKey, type Priser } from '../lib/moduler';

export function ModulSperret({ k }: { k: ModulKey }) {
  const m = MODULER.find(x => x.k === k);
  return <><h1>{m?.navn || 'Modul'}</h1><div className="card" style={{ maxWidth: 640 }}>
    <p><b>Denne modulen er ikke aktivert for organisasjonen.</b></p><p className="muted">{m?.tekst}</p>
    {m && <ul>{m.inneholder.map(x => <li key={x}>{x}</li>)}</ul>}
    <p className="small">Administratoren i organisasjonen kan bestille modulen under Organisasjon og tilgang → Abonnement. Data dere har registrert tidligere, blir liggende og kommer tilbake når modulen aktiveres.</p>
    <a className="btn" href="#/brukere">Se abonnement og priser</a></div></>;
}

const MND = ' per bruker/mnd';
const aktiveBrukere = (org: string) => S.medlemmer.filter(m => m.org_id === org && m.aktiv).length;
const trappTekst = (P: Priser | null) => { const T = P?.trapp || STD_TRAPP; return T.map((t, i) => { const til = T[i + 1] ? T[i + 1].fra - 1 : null; return { t, navn: til === null ? `${t.fra}+` : til === t.fra ? `${t.fra}` : `${t.fra}–${til}` }; }); };

/** Kundens oversikt: antall brukere, moduler med pris per bruker, prisoversikt og bestilling */
export function AbonnementOversikt({ orgId, velger }: { orgId: string; velger?: React.ReactNode }) {
  useStore();
  const org = S.orgs.find(o => o.id === orgId) || mineOrg()[0]; const [P, setP] = useState<Priser | null>(priser()); const [B, setB] = useState<any[] | null>(null);
  const lastB = () => { sb.from('modul_bestilling').select('*').eq('org_id', orgId).order('opprettet', { ascending: false }).then(({ data, error }) => setB(error ? null : data || [])); };
  useEffect(() => { lastPriser().then(setP); lastB(); }, [orgId]);
  if (!modulerAktivert()) return <div className="card"><p className="muted">Modulstyring er ikke slått på ennå – alle funksjoner er tilgjengelige.</p></div>;
  const lis: number | null = org?.lisenser ?? null; const brukt = aktiveBrukere(orgId); const n = lis || Math.max(1, brukt);
  const betalte = MODULER.filter(m => orgHar(orgId, m.k) && !proveTil(m.k, orgId)).map(m => m.k);
  const sum = prisTotal(P, betalte, n);
  const venter = (k: string) => B?.find(b => b.modul === k && b.status === 'ny');
  const bestill = (k: ModulKey) => openModal({ render: close => <BestillBody orgId={orgId} k={k} P={P} n={n} close={close} ferdig={lastB} /> });
  const endreAntall = () => openModal({ render: close => <AntallBody orgId={orgId} P={P} n={n} brukt={brukt} moduler={betalte} close={close} /> });
  const TT = trappTekst(P);
  return <>
    <div className="card" style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 220 }}><div className="small muted">Abonnement {velger || <b>{org?.navn}</b>}</div>
        <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>{lis ? `${lis} bruker${lis === 1 ? '' : 'e'}` : 'Antall brukere ikke valgt'}</div>
        <div className="small muted">{brukt} i bruk{lis ? ` · ${Math.max(0, lis - brukt)} ledig${lis - brukt === 1 ? '' : 'e'}` : ' · ingen grense i prøveperioden'}</div></div>
      <button className="btn" onClick={endreAntall}>{lis ? 'Endre antall brukere' : 'Velg antall brukere'}</button>
      {sum > 0 && <div style={{ textAlign: 'right', minWidth: 160 }}><div className="small muted">Per måned for aktive moduler</div><div style={{ fontSize: 18, fontWeight: 700 }}>{kr(sum)}</div><div className="small muted">eks. mva. · {kr(Math.round(sum / n))} per bruker</div></div>}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12, marginTop: 12 }}>
      {MODULER.map(m => { const har = orgHar(orgId, m.k); const pt = proveTil(m.k, orgId); const v = venter(m.k); const pb = prisPerBruker(P, m.k, n); const p1 = prisPerBruker(P, m.k, 1);
        return <div key={m.k} className="card" style={{ margin: 0, display: 'flex', flexDirection: 'column', borderColor: har && !pt ? 'var(--green)' : undefined }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}><b style={{ flex: 1, fontSize: 15 }}>{m.navn}</b>
            {har ? (pt ? <Chip c="amber">Prøve til {fd(pt)}</Chip> : <Chip c="green">{m.k === 'kjerne' ? 'Inkludert' : 'Aktiv'}</Chip>) : v ? <Chip c="amber">Bestilt</Chip> : null}</div>
          <p className="small muted" style={{ margin: '4px 0 8px' }}>{m.tekst}</p>
          <ul className="small" style={{ margin: '0 0 10px', paddingLeft: 18, flex: 1 }}>{m.inneholder.map(x => <li key={x}>{x}</li>)}</ul>
          <div style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>
            {pb === null ? <b>Pris på forespørsel</b> : pb === 0 ? <b>Inkludert</b> : <><b style={{ fontSize: 16 }}>{kr(pb)}</b><span className="small muted">{MND}</span>
              <div className="small muted">{n > 1 ? `ved ${n} brukere = ${kr(pb * n)}/mnd${p1 && p1 > pb ? ` · listepris ${kr(p1)}` : ''}` : 'ved 1 bruker'}</div></>}
          </div>
          {m.k !== 'kjerne' && (!har || pt) && (v ? <p className="small muted" style={{ margin: 0 }}>Bestilt {fd(String(v.opprettet || v.created_at || '').slice(0, 10))} – aktiveres av leverandøren.</p>
            : <button className="btn pri sm" onClick={() => bestill(m.k)}>{pt ? 'Bestill – behold etter prøveperioden' : 'Bestill modulen'}</button>)}
        </div>; })}
    </div>
    {P && Object.values(P.moduler).some(x => x?.pris) && <div className="card" style={{ marginTop: 12 }}><b>Pris per bruker per måned etter antall brukere</b>
      <div className="tbl-wrap" style={{ marginTop: 6 }}><table><thead><tr><th>Modul</th>{TT.map(x => <th key={x.navn} className="num">{x.navn} {x.navn === '1' ? 'bruker' : 'brukere'}</th>)}</tr></thead><tbody>
        {MODULER.map(m => <tr key={m.k}><td>{m.navn}</td>{TT.map(x => { const v = prisPerBruker(P, m.k, x.t.fra); return <td key={x.navn} className="num" style={{ fontWeight: n >= x.t.fra && (TT.find(y => y.t.fra > x.t.fra)?.t.fra ?? 1e9) > n ? 700 : 400 }}>{v === null ? '–' : v === 0 ? 'Inkl.' : kr(v)}</td>; })}</tr>)}
        <tr><td className="small muted">Rabatt</td>{TT.map(x => <td key={x.navn} className="num small muted">{x.t.rabatt ? `−${x.t.rabatt} %` : '–'}</td>)}</tr></tbody></table></div>
      <p className="small muted" style={{ margin: '6px 0 0' }}>Prisen per bruker synker med antall brukere, men går aldri under minimumsprisen for modulen.</p></div>}
    <p className="small muted" style={{ marginTop: 8 }}>Priser eks. mva.{P?.notat ? ' ' + P.notat : ''} Antall brukere kan økes når som helst. Moduler aktiveres av leverandøren etter bestilling, normalt innen én virkedag.</p>
    {B && B.length > 0 && <div className="card"><b>Bestillinger</b><table style={{ marginTop: 6 }}><tbody>{B.slice(0, 10).map(b => <tr key={b.id}><td className="small">{fd(String(b.opprettet || b.created_at || '').slice(0, 10))}</td><td>{MODULER.find(m => m.k === b.modul)?.navn || b.modul}</td><td>{b.status === 'ny' ? <Chip c="amber">Venter</Chip> : b.status === 'aktivert' ? <Chip c="green">Aktivert</Chip> : <Chip c="grey">Avvist</Chip>}</td></tr>)}</tbody></table></div>}
  </>;
}

function AntallBody({ orgId, P, n, brukt, moduler, close }: { orgId: string; P: Priser | null; n: number; brukt: number; moduler: string[]; close: () => void }) {
  const [a, setA] = useState(String(n)); const [busy, setBusy] = useState(false); const ny = Math.max(0, Math.floor(+a || 0));
  const gml = prisTotal(P, moduler, n); const nyS = prisTotal(P, moduler, ny || 1);
  const lagre = async () => { if (ny < Math.max(1, brukt)) return toast(`Minst ${Math.max(1, brukt)} – organisasjonen har ${brukt} aktive brukere`); setBusy(true);
    const { error } = await sb.rpc('sett_lisenser', { p_org: orgId, p_antall: ny }); setBusy(false);
    if (error) return toast(/function|schema/i.test(error.message) ? 'Endring av antall brukere er ikke slått på ennå.' : feiltekst(error));
    const o = S.orgs.find(x => x.id === orgId); if (o) o.lisenser = ny; bump(); toast(`Antall brukere er satt til ${ny}`); close(); };
  return <><div className="mh"><h2>Antall brukere</h2><button className="btn ghost sm" onClick={close}>✕</button></div>
    <div className="mb"><p className="small muted" style={{ marginTop: 0 }}>Velg hvor mange brukere organisasjonen skal ha. Prisen per bruker blir lavere jo flere brukere dere har. Dere har {brukt} aktive brukere nå.</p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><button className="btn" onClick={() => setA(String(Math.max(Math.max(1, brukt), ny - 1)))} aria-label="Færre">−</button>
        <input type="number" min={Math.max(1, brukt)} max={1000} value={a} onChange={e => setA(e.target.value)} style={{ width: 100, textAlign: 'center', fontSize: 18 }} />
        <button className="btn" onClick={() => setA(String(Math.min(1000, ny + 1)))} aria-label="Flere">+</button><span className="small muted">brukere</span></div>
      {moduler.length > 0 && <table style={{ marginTop: 12 }}><thead><tr><th>Aktiv modul</th><th className="num">Per bruker</th><th className="num">Per måned</th></tr></thead><tbody>
        {moduler.map(k => { const pb = prisPerBruker(P, k, ny || 1); return <tr key={k}><td>{MODULER.find(m => m.k === k)?.navn}</td><td className="num">{pb === null ? 'forespørsel' : kr(pb)}</td><td className="num">{pb === null ? '–' : kr(pb * (ny || 1))}</td></tr>; })}
        <tr className="sum"><td>Sum per måned</td><td /><td className="num"><b>{kr(nyS)}</b></td></tr></tbody></table>}
      {ny !== n && gml > 0 && <p className="small">Endring: {nyS >= gml ? '+' : '−'}{kr(Math.abs(nyS - gml))} per måned eks. mva.</p>}
    </div>
    <div className="mf"><button className="btn" onClick={close}>Avbryt</button><button className="btn pri" disabled={busy || ny < Math.max(1, brukt) || ny === n && !!S.orgs.find(o => o.id === orgId)?.lisenser} onClick={lagre}>Bekreft {ny} bruker{ny === 1 ? '' : 'e'}</button></div></>;
}

function BestillBody({ orgId, k, P, n, close, ferdig }: { orgId: string; k: ModulKey; P: Priser | null; n: number; close: () => void; ferdig: () => void }) {
  const m = MODULER.find(x => x.k === k)!; const [komm, setKomm] = useState(''); const [busy, setBusy] = useState(false); const pb = prisPerBruker(P, k, n);
  const send = async () => { setBusy(true);
    const { error } = await sb.from('modul_bestilling').insert({ org_id: orgId, modul: k, status: 'ny', kommentar: komm.slice(0, 1000) || null, bestilt_av_navn: state.me?.navn || state.me?.epost });
    setBusy(false); if (error) return toast(/relation|does not exist|schema/i.test(error.message) ? 'Bestilling er ikke slått på ennå – ta kontakt med leverandøren.' : feiltekst(error));
    toast('Bestillingen er sendt – leverandøren aktiverer modulen'); ferdig(); close(); };
  return <><div className="mh"><h2>Bestill {m.navn}</h2><button className="btn ghost sm" onClick={close}>✕</button></div>
    <div className="mb"><p className="small muted" style={{ marginTop: 0 }}>{m.tekst}</p>
      <div className="card" style={{ margin: '0 0 10px' }}>{pb === null ? <b>Pris på forespørsel</b> : <><b style={{ fontSize: 16 }}>{kr(pb)}</b><span className="small muted">{MND}</span><div className="small">Ved {n} bruker{n === 1 ? '' : 'e'}: <b>{kr(pb * n)}</b> per måned eks. mva.</div></>}</div>
      <label style={{ display: 'block' }}><span className="small" style={{ fontWeight: 600 }}>Kommentar (valgfritt)</span><textarea rows={2} value={komm} onChange={e => setKomm(e.target.value)} style={{ width: '100%' }} placeholder="F.eks. fakturaadresse eller ønsket startdato" /></label>
    </div>
    <div className="mf"><button className="btn" onClick={close}>Avbryt</button><button className="btn pri" disabled={busy} onClick={send}>Send bestilling</button></div></>;
}

// ---------- Plattformadministrator: prisliste med rabatttrapp
export function prisEditor() { openModal({ wide: true, render: close => <PrisBody close={close} /> }); }
function PrisBody({ close }: { close: () => void }) {
  const [P, setP] = useState<Priser>({ moduler: {}, trapp: STD_TRAPP }); const [busy, setBusy] = useState(false); const [ok, setOk] = useState(false);
  useEffect(() => { lastPriser().then(p => { setP(p || { moduler: {}, trapp: STD_TRAPP }); setOk(true); }); }, []);
  const sett = (k: string, f: 'pris' | 'min', v: string) => setP(o => ({ ...o, moduler: { ...o.moduler, [k]: { pris: o.moduler[k]?.pris ?? null, min: o.moduler[k]?.min ?? null, [f]: v === '' ? null : Math.max(0, +v) } } }));
  const settT = (i: number, f: 'fra' | 'rabatt', v: string) => setP(o => ({ ...o, trapp: o.trapp.map((t, j) => j === i ? { ...t, [f]: Math.max(f === 'fra' ? 1 : 0, Math.min(f === 'rabatt' ? 90 : 10000, +v || 0)) } : t) }));
  const lagre = async () => { const trapp = [...P.trapp].sort((a, b) => a.fra - b.fra); if (trapp[0]?.fra !== 1) trapp.unshift({ fra: 1, rabatt: 0 });
    setBusy(true); const { error } = await sb.from('plattform_innstilling').upsert({ nokkel: 'priser', verdi: { ...P, trapp, oppdatert: today() }, endret: new Date().toISOString() }); setBusy(false);
    if (error) return toast(feiltekst(error)); await lastPriser(); bump(); toast('Prislisten er lagret'); close(); };
  const TT = trappTekst(P);
  return <><div className="mh"><h2>Prisliste – per bruker per måned eks. mva.</h2><button className="btn ghost sm" onClick={close}>✕</button></div>
    <div className="mb">{!ok ? <p className="muted">Laster …</p> : <>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)', gap: 18, alignItems: 'start' }}>
        <div><b>Moduler</b><table style={{ marginTop: 6 }}><thead><tr><th>Modul</th><th className="num">Listepris per bruker<div className="small muted" style={{ fontWeight: 400 }}>ved 1 bruker</div></th><th className="num">Minimum per bruker<div className="small muted" style={{ fontWeight: 400 }}>laveste med rabatt</div></th></tr></thead><tbody>
          {MODULER.map(m => <tr key={m.k}><td>{m.navn}</td>{(['pris', 'min'] as const).map(f => <td key={f} className="num"><input type="number" min={0} step={10} style={{ width: 100, textAlign: 'right' }} value={P.moduler[m.k]?.[f] ?? ''} placeholder={f === 'pris' ? 'forespørsel' : '0'} onChange={e => sett(m.k, f, e.target.value)} /></td>)}</tr>)}</tbody></table>
          {MODULER.some(m => P.moduler[m.k]?.pris == null && P.moduler[m.k]?.min != null) && <p className="small" style={{ color: 'var(--amber)' }}>Noen moduler har bare minimum. De får fast pris lik minimum (uten rabatt). Fyll inn listepris for å få rabatt etter antall brukere.</p>}
          <p className="small muted">Listepris = pris per bruker ved 1 bruker. Minimum = laveste pris per bruker uansett antall. Tom listepris = «På forespørsel», 0 = «Inkludert».</p></div>
        <div><b>Rabatttrapp</b><table style={{ marginTop: 6 }}><thead><tr><th className="num">Fra brukere</th><th className="num">Rabatt %</th><th /></tr></thead><tbody>
          {P.trapp.map((t, i) => <tr key={i}><td className="num"><input type="number" min={1} style={{ width: 70, textAlign: 'right' }} value={t.fra} disabled={i === 0} onChange={e => settT(i, 'fra', e.target.value)} /></td><td className="num"><input type="number" min={0} max={90} style={{ width: 70, textAlign: 'right' }} value={t.rabatt} disabled={i === 0} onChange={e => settT(i, 'rabatt', e.target.value)} /></td>
            <td>{i > 0 && <button className="btn ghost sm" onClick={() => setP(o => ({ ...o, trapp: o.trapp.filter((_, j) => j !== i) }))} aria-label="Fjern trinn">✕</button>}</td></tr>)}</tbody></table>
          <button className="btn sm" style={{ marginTop: 6 }} onClick={() => setP(o => ({ ...o, trapp: [...o.trapp, { fra: (o.trapp[o.trapp.length - 1]?.fra || 1) * 2, rabatt: Math.min(90, (o.trapp[o.trapp.length - 1]?.rabatt || 0) + 10) }] }))}>+ Trinn</button></div>
      </div>
      <b style={{ display: 'block', marginTop: 14 }}>Slik ser kunden det (pris per bruker)</b>
      <div className="tbl-wrap"><table><thead><tr><th>Modul</th>{TT.map(x => <th key={x.navn} className="num">{x.navn}</th>)}</tr></thead><tbody>
        {MODULER.map(m => <tr key={m.k}><td>{m.navn}</td>{TT.map(x => { const v = prisPerBruker(P, m.k, x.t.fra); return <td key={x.navn} className="num">{v === null ? '–' : v === 0 ? 'Inkl.' : kr(v)}</td>; })}</tr>)}</tbody></table></div>
      <label style={{ display: 'block', marginTop: 10 }}><span className="small" style={{ fontWeight: 600 }}>Tekst under prislisten (valgfritt)</span><input style={{ width: '100%' }} value={P.notat || ''} onChange={e => setP({ ...P, notat: e.target.value })} placeholder="F.eks. Fakturering kvartalsvis forskudd. Ingen binding." /></label></>}</div>
    <div className="mf"><button className="btn" onClick={close}>Avbryt</button><button className="btn pri" disabled={busy || !ok} onClick={lagre}>Lagre prisliste</button></div></>;
}

// ---------- Plattformadministrator: bestillinger
export function Bestillinger() {
  useStore(); const [B, setB] = useState<any[] | null>(null);
  const last = () => { sb.from('modul_bestilling').select('*').eq('status', 'ny').order('opprettet').then(({ data, error }) => setB(error ? null : data || [])); };
  useEffect(() => { last(); }, []);
  if (!B || !B.length) return null;
  const behandle = async (b: any, aktiver: boolean) => {
    if (aktiver) { const { error } = await sb.from('org_modul').upsert({ org_id: b.org_id, modul: b.modul, aktiv: true, prove_til: null, til: null, merknad: `Bestilt ${String(b.opprettet || b.created_at || '').slice(0, 10)} av ${b.bestilt_av_navn || ''}`, endret: new Date().toISOString() }); if (error) return toast(feiltekst(error)); }
    else if (!(await confirmBox('Avvise bestillingen? Kunden ser at den er avvist.', 'Avvis'))) return;
    await sb.from('modul_bestilling').update({ status: aktiver ? 'aktivert' : 'avvist', behandlet: new Date().toISOString() }).eq('id', b.id);
    await lastModuler(); bump(); toast(aktiver ? 'Modulen er aktivert' : 'Bestillingen er avvist'); last(); };
  return <div className="card" style={{ borderColor: 'var(--amber)', marginBottom: 12 }}><b>Nye bestillinger ({B.length})</b>
    <table style={{ marginTop: 6 }}><tbody>{B.map(b => { const o = S.orgs.find(x => x.id === b.org_id); return <tr key={b.id}><td className="small">{fd(String(b.opprettet || b.created_at || '').slice(0, 10))}</td><td><b style={{ fontWeight: 600 }}>{o?.navn || '?'}</b><div className="small muted">{b.bestilt_av_navn}{o?.lisenser ? ` · ${o.lisenser} brukere` : ''}{b.kommentar ? ' · «' + b.kommentar + '»' : ''}</div></td>
      <td>{MODULER.find(m => m.k === b.modul)?.navn || b.modul}</td>
      <td style={{ whiteSpace: 'nowrap' }}><button className="btn sm pri" style={{ marginRight: 6 }} onClick={() => behandle(b, true)}>Aktiver</button><button className="btn sm" onClick={() => behandle(b, false)}>Avvis</button></td></tr>; })}</tbody></table></div>;
}

// ---------- Plattformadministrator: moduler og brukerlisenser per kunde
type Rad = { org_id: string; modul: string; aktiv: boolean; prove_til: string | null; til: string | null; merknad: string | null };
const status = (r?: Rad) => !r || !r.aktiv ? 'av' : r.til && r.til < today() ? 'utlopt' : r.prove_til ? (r.prove_til < today() ? 'utlopt' : 'prove') : r.til ? 'oppsagt' : 'betalt';
export function modulAdmin(org: { id: string; navn: string; lisenser?: number | null }) {
  openModal({ wide: true, render: close => <ModulAdminBody org={org} close={close} /> });
}
function ModulAdminBody({ org, close }: { org: { id: string; navn: string; lisenser?: number | null }; close: () => void }) {
  const [R, setR] = useState<Record<string, Rad>>({}); const [last, setLast] = useState(true); const [busy, setBusy] = useState(false); const [feil, setFeil] = useState(''); const [lis, setLis] = useState(org.lisenser ? String(org.lisenser) : '');
  useEffect(() => { lastPriser(); sb.from('org_modul').select('*').eq('org_id', org.id).then(({ data, error }) => { if (error) setFeil(/relation|does not exist|schema/i.test(error.message) ? 'Modultabellen finnes ikke i databasen ennå.' : feiltekst(error)); setR(Object.fromEntries((data || []).map((r: Rad) => [r.modul, r]))); setLast(false); }); }, [org.id]);
  const sett = (k: string, x: Partial<Rad>) => setR(o => { const std: Rad = { org_id: org.id, modul: k, aktiv: true, prove_til: null, til: null, merknad: null }; return { ...o, [k]: { ...std, ...(o[k] || {}), ...x } }; });
  const velg = (k: string, s: string) => { const pluss = (d: number) => { const t = new Date(); t.setDate(t.getDate() + d); return t.toISOString().slice(0, 10); };
    if (s === 'av') sett(k, { aktiv: false }); else if (s === 'betalt') sett(k, { aktiv: true, prove_til: null, til: null }); else if (s === 'prove') sett(k, { aktiv: true, prove_til: R[k]?.prove_til && R[k].prove_til! >= today() ? R[k].prove_til : pluss(30), til: null }); else if (s === 'oppsagt') sett(k, { aktiv: true, prove_til: null, til: R[k]?.til || pluss(30) }); };
  const lagre = async () => { setBusy(true); const rows = Object.values(R).map(r => ({ org_id: org.id, modul: r.modul, aktiv: r.aktiv, prove_til: r.prove_til || null, til: r.til || null, merknad: r.merknad || null, endret: new Date().toISOString() }));
    const { error } = await sb.from('org_modul').upsert(rows);
    const nyL = lis ? Math.max(1, Math.floor(+lis)) : null;
    if (!error && nyL !== (org.lisenser || null)) { const { error: le } = nyL ? await sb.rpc('sett_lisenser', { p_org: org.id, p_antall: nyL }) : await sb.from('organisasjoner').update({ lisenser: null }).eq('id', org.id);
      if (le) toast(/function|schema|lisenser/i.test(le.message) ? 'Brukerlisenser krever databaseendring 017' : feiltekst(le)); else { const o = S.orgs.find(x => x.id === org.id); if (o) o.lisenser = nyL; } }
    setBusy(false); if (error) return toast(feiltekst(error)); await lastModuler(); bump(); toast('Abonnementet er oppdatert for ' + org.navn); close(); };
  const P = priser(); const nL = +lis || 0; const sum = nL && P ? prisTotal(P, MODULER.filter(m => m.k === 'kjerne' || ['betalt', 'oppsagt'].includes(status(R[m.k]))).map(m => m.k), nL) : 0;
  return <><div className="mh"><h2>Abonnement – {org.navn}</h2><button className="btn ghost sm" onClick={close}>✕</button></div>
    <div className="mb">{feil ? <div className="note">{feil}</div> : last ? <p className="muted">Laster …</p> : <>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}><b>Brukerlisenser</b>
        <input type="number" min={1} max={1000} value={lis} onChange={e => setLis(e.target.value)} placeholder="ingen grense" style={{ width: 120 }} /><span className="small muted">{S.medlemmer.filter(m => m.org_id === org.id && m.aktiv).length} aktive brukere</span>
        {sum > 0 && <span className="small muted" style={{ marginLeft: 'auto' }}>Per måned for betalte moduler: <b>{kr(sum)}</b> eks. mva.</span>}</div>
      <div className="tbl-wrap"><table><thead><tr><th>Modul</th><th>Status</th><th>Dato</th><th>Merknad</th></tr></thead><tbody>
        {MODULER.filter(m => m.k !== 'kjerne').map(m => { const r = R[m.k]; const s = status(r);
          return <tr key={m.k}><td><b style={{ fontWeight: 600 }}>{m.navn}</b><div className="small muted">{m.inneholder.join(' · ')}</div></td>
            <td><select value={s === 'utlopt' ? (r?.prove_til ? 'prove' : 'oppsagt') : s} onChange={e => velg(m.k, e.target.value)}><option value="av">Ikke aktivert</option><option value="prove">Prøveperiode</option><option value="betalt">Aktiv (betalt)</option><option value="oppsagt">Oppsagt – gjelder til</option></select>
              {s === 'utlopt' && <div><Chip c="red">Utløpt</Chip></div>}</td>
            <td>{(s === 'prove' || (s === 'utlopt' && r?.prove_til)) && <input type="date" value={r?.prove_til || ''} onChange={e => sett(m.k, { prove_til: e.target.value })} />}
              {(s === 'oppsagt' || (s === 'utlopt' && r?.til)) && <input type="date" value={r?.til || ''} onChange={e => sett(m.k, { til: e.target.value })} />}</td>
            <td><input value={r?.merknad || ''} onChange={e => sett(m.k, { merknad: e.target.value })} placeholder="F.eks. avtale, pris" /></td></tr>; })}
      </tbody></table></div></>}
      <p className="small muted">Kjernen er alltid med. Modulene til eieren av en eiendom gjelder også for forvaltere og servicefirma som jobber på eiendommen. Data blir liggende når en modul slås av. Antall brukerlisenser er grensen for hvor mange brukere organisasjonen kan ha; kunden kan selv øke det.</p></div>
    <div className="mf"><button className="btn" onClick={close}>Avbryt</button>{!feil && <button className="btn pri" disabled={busy || last} onClick={lagre}>Lagre</button>}</div></>;
}
