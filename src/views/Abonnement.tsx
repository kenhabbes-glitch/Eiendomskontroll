// Abonnement: sperret modul, kundens modulkort med priser og bestilling, og plattformadministratorens
// modulstyring per kunde, prisliste og behandling av bestillinger.
import React, { useEffect, useState } from 'react';
import { S, mineOrg, sb, state, toast, useStore, feiltekst, bump } from '../lib/store';
import { Chip, openModal, confirmBox } from '../components/ui';
import { fd, today } from '../lib/utils';
import { MODULER, STD_TRAPP, STD_TRAPP_BYGG, byggFor, kr, lastModuler, lastPriser, modulPris, modulerAktivert, orgHar, prisPer, prisTotal, priser, proveTil, trappFor, type Enhet, type ModulKey, type ModulPris, type Priser, type Trapp } from '../lib/moduler';
import { tt } from '../lib/i18n';

export function ModulSperret({ k }: { k: ModulKey }) {
  const m = MODULER.find(x => x.k === k);
  return <><h1>{m?.navn || tt("Modul")}</h1><div className="card" style={{ maxWidth: 640 }}>
    <p><b>{tt("Denne modulen er ikke aktivert for organisasjonen.")}</b></p><p className="muted">{m?.tekst}</p>
    {m && <ul>{m.inneholder.map(x => <li key={x}>{x}</li>)}</ul>}
    <p className="small">{tt("Administratoren i organisasjonen kan bestille modulen under Organisasjon og tilgang → Abonnement. Data dere har registrert tidligere, blir liggende og kommer tilbake når modulen aktiveres.")}</p>
    <a className="btn" href="#/brukere">{tt("Se abonnement og priser")}</a></div></>;
}

const aktiveBrukere = (org: string) => S.medlemmer.filter(m => m.org_id === org && m.aktiv).length;
const trappTekst = (P: Priser | null, e: Enhet = 'bruker') => { const T = trappFor(P, e); return T.map((t, i) => { const til = T[i + 1] ? T[i + 1].fra - 1 : null; return { t, navn: til === null ? tt("{0}+", t.fra) : til === t.fra ? tt("{0}", t.fra) : tt("{0}–{1}", t.fra, til) }; }); };
const flertall = (n: number, e: Enhet) => e === 'bygg' ? 'bygg' : n === 1 ? 'bruker' : 'brukere';
/** Prislinje for en modul: «390 kr per bygg + 120 kr per bruker» */
function PrisLinje({ P, k, nU, nB }: { P: Priser | null; k: string; nU: number; nB: number }) {
  const pB = prisPer(P, k, nB, 'bygg'); const pU = prisPer(P, k, nU, 'bruker');
  if (pB === null && pU === null) return <b>{tt("Pris på forespørsel")}</b>;
  if (!pB && !pU) return <b>{tt("Inkludert")}</b>;
  const tot = modulPris(P, k, nU, nB);
  return <><div>{pB ? <><b style={{ fontSize: 15 }}>{kr(pB)}</b><span className="small muted"> {tt("per bygg")}</span></> : null}{pB && pU ? <span className="small muted"> + </span> : null}{pU ? <><b style={{ fontSize: 15 }}>{kr(pU)}</b><span className="small muted"> {tt("per bruker")}</span></> : null}<span className="small muted"> {tt("/mnd")}</span></div>
    <div className="small muted">{[pB ? `${nB} bygg` : '', pU ? `${nU} ${flertall(nU, 'bruker')}` : ''].filter(Boolean).join(' og ')} = {kr(tot)}{tt("/mnd")}</div></>;
}

/** Kundens oversikt: bygg og brukere, moduler med pris, prisoversikt og bestilling */
export function AbonnementOversikt({ orgId, velger }: { orgId: string; velger?: React.ReactNode }) {
  useStore();
  const org = S.orgs.find(o => o.id === orgId) || mineOrg()[0]; const [P, setP] = useState<Priser | null>(priser()); const [B, setB] = useState<any[] | null>(null);
  const lastB = () => { sb.from('modul_bestilling').select('*').eq('org_id', orgId).order('opprettet', { ascending: false }).then(({ data, error }) => setB(error ? null : data || [])); };
  useEffect(() => { lastPriser().then(setP); lastB(); }, [orgId]);
  if (!modulerAktivert()) return <div className="card"><p className="muted">{tt("Modulstyring er ikke slått på ennå – alle funksjoner er tilgjengelige.")}</p></div>;
  const lis: number | null = org?.lisenser ?? null; const brukt = aktiveBrukere(orgId); const nU = lis || Math.max(1, brukt); const nB = Math.max(1, byggFor(orgId)); const ekteBygg = byggFor(orgId);
  const betalte = MODULER.filter(m => orgHar(orgId, m.k) && !proveTil(m.k, orgId)).map(m => m.k);
  const sum = prisTotal(P, betalte, nU, ekteBygg);
  const venter = (k: string) => B?.find(b => b.modul === k && b.status === 'ny');
  const bestill = (k: ModulKey) => openModal({ render: close => <BestillBody orgId={orgId} k={k} P={P} nU={nU} nB={nB} close={close} ferdig={lastB} /> });
  const endreAntall = () => openModal({ render: close => <AntallBody orgId={orgId} P={P} n={nU} nB={ekteBygg} brukt={brukt} moduler={betalte} close={close} /> });
  const harByggPris = MODULER.some(m => prisPer(P, m.k, 1, 'bygg') !== null); const harBrukerPris = MODULER.some(m => prisPer(P, m.k, 1, 'bruker') !== null);
  const Tabell = ({ e }: { e: Enhet }) => { const TT = trappTekst(P, e); const n = e === 'bygg' ? nB : nU;
    return <div className="tbl-wrap" style={{ marginTop: 6 }}><table><thead><tr><th>{tt("Pris per")} {e} {tt("per måned")}</th>{TT.map(x => <th key={x.navn} className="num">{x.navn} {flertall(x.t.fra === 1 && x.navn === '1' ? 1 : 2, e)}</th>)}</tr></thead><tbody>
      {MODULER.filter(m => prisPer(P, m.k, 1, e) !== null).map(m => <tr key={m.k}><td>{m.navn}</td>{TT.map((x, i) => { const v = prisPer(P, m.k, x.t.fra, e); const her = n >= x.t.fra && (TT[i + 1]?.t.fra ?? 1e9) > n; return <td key={x.navn} className="num" style={{ fontWeight: her ? 700 : 400 }}>{v === null ? '–' : v === 0 ? tt("Inkl.") : kr(v)}</td>; })}</tr>)}
      <tr><td className="small muted">{tt("Rabatt")}</td>{TT.map(x => <td key={x.navn} className="num small muted">{x.t.rabatt ? tt("−{0} %", x.t.rabatt) : '–'}</td>)}</tr></tbody></table></div>; };
  return <>
    <div className="card" style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 220 }}><div className="small muted">{tt("Abonnement")} {velger || <b>{org?.navn}</b>}</div>
        <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>{ekteBygg} {tt("bygg ·")} {lis ? tt("{0} {1}", lis, flertall(lis, 'bruker')) : tt("antall brukere ikke valgt")}</div>
        <div className="small muted">{brukt} {flertall(brukt, 'bruker')} {tt("i bruk")}{lis ? tt(" · {0} ledig{1}", Math.max(0, lis - brukt), lis - brukt === 1 ? '' : 'e') : tt(" · ingen grense i prøveperioden")} {tt("· antall bygg telles automatisk")}</div></div>
      <button className="btn" onClick={endreAntall}>{lis ? tt("Endre antall brukere") : tt("Velg antall brukere")}</button>
      {sum > 0 && <div style={{ textAlign: 'right', minWidth: 160 }}><div className="small muted">{tt("Per måned for aktive moduler")}</div><div style={{ fontSize: 18, fontWeight: 700 }}>{kr(sum)}</div><div className="small muted">{tt("eks. mva.")}</div></div>}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12, marginTop: 12 }}>
      {MODULER.map(m => { const har = orgHar(orgId, m.k); const pt = proveTil(m.k, orgId); const v = venter(m.k);
        return <div key={m.k} className="card" style={{ margin: 0, display: 'flex', flexDirection: 'column', borderColor: har && !pt ? 'var(--green)' : undefined }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}><b style={{ flex: 1, fontSize: 15 }}>{m.navn}</b>
            {har ? (pt ? <Chip c="amber">{tt("Prøve til")} {fd(pt)}</Chip> : <Chip c="green">{m.k === 'kjerne' ? tt("Inkludert") : tt("Aktiv")}</Chip>) : v ? <Chip c="amber">{tt("Bestilt")}</Chip> : null}</div>
          <p className="small muted" style={{ margin: '4px 0 8px' }}>{m.tekst}</p>
          <ul className="small" style={{ margin: '0 0 10px', paddingLeft: 18, flex: 1 }}>{m.inneholder.map(x => <li key={x}>{x}</li>)}</ul>
          <div style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}><PrisLinje P={P} k={m.k} nU={nU} nB={nB} /></div>
          {m.k !== 'kjerne' && (!har || pt) && (v ? <p className="small muted" style={{ margin: 0 }}>{tt("Bestilt")} {fd(String(v.opprettet || v.created_at || '').slice(0, 10))} {tt("– aktiveres av leverandøren.")}</p>
            : <button className="btn pri sm" onClick={() => bestill(m.k)}>{pt ? tt("Bestill – behold etter prøveperioden") : tt("Bestill modulen")}</button>)}
        </div>; })}
    </div>
    {P && (harByggPris || harBrukerPris) && <div className="card" style={{ marginTop: 12 }}><b>{tt("Prisene synker med antall bygg og brukere")}</b>
      {harByggPris && <Tabell e="bygg" />}{harBrukerPris && <Tabell e="bruker" />}
      <p className="small muted" style={{ margin: '6px 0 0' }}>{tt("Uthevet = deres trinn. Prisen går aldri under minimumsprisen for modulen.")}</p></div>}
    <p className="small muted" style={{ marginTop: 8 }}>{tt("Priser eks. mva.")}{P?.notat ? ' ' + P.notat : ''} {tt("Antall bygg telles fra eiendommene dere har i appen. Antall brukere kan økes når som helst. Moduler aktiveres av leverandøren etter bestilling, normalt innen én virkedag.")}</p>
    {B && B.length > 0 && <div className="card"><b>{tt("Bestillinger")}</b><table style={{ marginTop: 6 }}><tbody>{B.slice(0, 10).map(b => <tr key={b.id}><td className="small">{fd(String(b.opprettet || b.created_at || '').slice(0, 10))}</td><td>{MODULER.find(m => m.k === b.modul)?.navn || b.modul}</td><td>{b.status === 'ny' ? <Chip c="amber">{tt("Venter")}</Chip> : b.status === 'aktivert' ? <Chip c="green">{tt("Aktivert")}</Chip> : <Chip c="grey">{tt("Avvist")}</Chip>}</td></tr>)}</tbody></table></div>}
  </>;
}

function AntallBody({ orgId, P, n, nB, brukt, moduler, close }: { orgId: string; P: Priser | null; n: number; nB: number; brukt: number; moduler: string[]; close: () => void }) {
  const [a, setA] = useState(String(n)); const [busy, setBusy] = useState(false); const ny = Math.max(0, Math.floor(+a || 0));
  const gml = prisTotal(P, moduler, n, nB); const nyS = prisTotal(P, moduler, ny || 1, nB);
  const lagre = async () => { if (ny < Math.max(1, brukt)) return toast(tt("Minst {0} – organisasjonen har {1} aktive brukere", Math.max(1, brukt), brukt)); setBusy(true);
    const { error } = await sb.rpc('sett_lisenser', { p_org: orgId, p_antall: ny }); setBusy(false);
    if (error) return toast(/function|schema/i.test(error.message) ? tt("Endring av antall brukere er ikke slått på ennå.") : feiltekst(error));
    const o = S.orgs.find(x => x.id === orgId); if (o) o.lisenser = ny; bump(); toast(tt("Antall brukere er satt til {0}", ny)); close(); };
  return <><div className="mh"><h2>{tt("Antall brukere")}</h2><button className="btn ghost sm" onClick={close}>✕</button></div>
    <div className="mb"><p className="small muted" style={{ marginTop: 0 }}>{tt("Velg hvor mange brukere organisasjonen skal ha. Prisen per bruker blir lavere jo flere brukere dere har. Dere har")} {brukt} {tt("aktive brukere og")} {nB} {tt("bygg nå.")}</p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><button className="btn" onClick={() => setA(String(Math.max(Math.max(1, brukt), ny - 1)))} aria-label={tt("Færre")}>−</button>
        <input type="number" min={Math.max(1, brukt)} max={1000} value={a} onChange={e => setA(e.target.value)} style={{ width: 100, textAlign: 'center', fontSize: 18 }} />
        <button className="btn" onClick={() => setA(String(Math.min(1000, ny + 1)))} aria-label={tt("Flere")}>+</button><span className="small muted">{tt("brukere")}</span></div>
      {moduler.length > 0 && <table style={{ marginTop: 12 }}><thead><tr><th>{tt("Aktiv modul")}</th><th className="num">{tt("Per bruker")}</th><th className="num">{tt("Per måned")}</th></tr></thead><tbody>
        {moduler.map(k => { const pb = prisPer(P, k, ny || 1, 'bruker'); return <tr key={k}><td>{MODULER.find(m => m.k === k)?.navn}</td><td className="num">{pb === null ? '–' : kr(pb)}</td><td className="num">{kr(modulPris(P, k, ny || 1, nB))}</td></tr>; })}
        <tr className="sum"><td>{tt("Sum per måned (inkl. bygg)")}</td><td /><td className="num"><b>{kr(nyS)}</b></td></tr></tbody></table>}
      {ny !== n && gml > 0 && <p className="small">{tt("Endring:")} {nyS >= gml ? '+' : '−'}{kr(Math.abs(nyS - gml))} {tt("per måned eks. mva.")}</p>}
    </div>
    <div className="mf"><button className="btn" onClick={close}>{tt("Avbryt")}</button><button className="btn pri" disabled={busy || ny < Math.max(1, brukt) || ny === n && !!S.orgs.find(o => o.id === orgId)?.lisenser} onClick={lagre}>{tt("Bekreft")} {ny} {flertall(ny, 'bruker')}</button></div></>;
}

function BestillBody({ orgId, k, P, nU, nB, close, ferdig }: { orgId: string; k: ModulKey; P: Priser | null; nU: number; nB: number; close: () => void; ferdig: () => void }) {
  const m = MODULER.find(x => x.k === k)!; const [komm, setKomm] = useState(''); const [busy, setBusy] = useState(false);
  const send = async () => { setBusy(true);
    const { error } = await sb.from('modul_bestilling').insert({ org_id: orgId, modul: k, status: 'ny', kommentar: komm.slice(0, 1000) || null, bestilt_av_navn: state.me?.navn || state.me?.epost });
    setBusy(false); if (error) return toast(/relation|does not exist|schema/i.test(error.message) ? tt("Bestilling er ikke slått på ennå – ta kontakt med leverandøren.") : feiltekst(error));
    toast(tt("Bestillingen er sendt – leverandøren aktiverer modulen")); ferdig(); close(); };
  return <><div className="mh"><h2>{tt("Bestill")} {m.navn}</h2><button className="btn ghost sm" onClick={close}>✕</button></div>
    <div className="mb"><p className="small muted" style={{ marginTop: 0 }}>{m.tekst}</p>
      <div className="card" style={{ margin: '0 0 10px' }}><PrisLinje P={P} k={k} nU={nU} nB={nB} /><div className="small muted" style={{ marginTop: 4 }}>{tt("Eks. mva. Prisen følger antall bygg og brukere.")}</div></div>
      <label style={{ display: 'block' }}><span className="small" style={{ fontWeight: 600 }}>{tt("Kommentar (valgfritt)")}</span><textarea rows={2} value={komm} onChange={e => setKomm(e.target.value)} style={{ width: '100%' }} placeholder={tt("F.eks. fakturaadresse eller ønsket startdato")} /></label>
    </div>
    <div className="mf"><button className="btn" onClick={close}>{tt("Avbryt")}</button><button className="btn pri" disabled={busy} onClick={send}>{tt("Send bestilling")}</button></div></>;
}

// ---------- Plattformadministrator: prisliste med rabatttrapper for bygg og brukere
export function prisEditor() { openModal({ wide: true, render: close => <PrisBody close={close} /> }); }
function TrappEditor({ T, set, enhet }: { T: Trapp; set: (t: Trapp) => void; enhet: Enhet }) {
  const settT = (i: number, f: 'fra' | 'rabatt', v: string) => set(T.map((t, j) => j === i ? { ...t, [f]: Math.max(f === 'fra' ? 1 : 0, Math.min(f === 'rabatt' ? 90 : 10000, +v || 0)) } : t));
  return <div><b>{tt("Rabatt etter antall")} {enhet === 'bygg' ? tt("bygg") : tt("brukere")}</b><table style={{ marginTop: 6 }}><thead><tr><th className="num">{tt("Fra")}</th><th className="num">{tt("Rabatt %")}</th><th /></tr></thead><tbody>
    {T.map((t, i) => <tr key={i}><td className="num"><input type="number" min={1} style={{ width: 70, textAlign: 'right' }} value={t.fra} disabled={i === 0} onChange={e => settT(i, 'fra', e.target.value)} /></td><td className="num"><input type="number" min={0} max={90} style={{ width: 70, textAlign: 'right' }} value={t.rabatt} disabled={i === 0} onChange={e => settT(i, 'rabatt', e.target.value)} /></td>
      <td>{i > 0 && <button className="btn ghost sm" onClick={() => set(T.filter((_, j) => j !== i))} aria-label={tt("Fjern trinn")}>✕</button>}</td></tr>)}</tbody></table>
    <button className="btn sm" style={{ marginTop: 6 }} onClick={() => set([...T, { fra: (T[T.length - 1]?.fra || 1) * 2, rabatt: Math.min(90, (T[T.length - 1]?.rabatt || 0) + 10) }])}>{tt("+ Trinn")}</button></div>;
}
function PrisBody({ close }: { close: () => void }) {
  const [P, setP] = useState<Priser>({ moduler: {}, trapp: STD_TRAPP, trappBygg: STD_TRAPP_BYGG }); const [busy, setBusy] = useState(false); const [ok, setOk] = useState(false);
  useEffect(() => { lastPriser().then(p => { setP(p || { moduler: {}, trapp: STD_TRAPP, trappBygg: STD_TRAPP_BYGG }); setOk(true); }); }, []);
  const sett = (k: string, f: keyof ModulPris, v: string) => setP(o => ({ ...o, moduler: { ...o.moduler, [k]: { ...({ pris: null, min: null, prisBygg: null, minBygg: null } as ModulPris), ...(o.moduler[k] || {}), [f]: v === '' ? null : Math.max(0, +v) } } }));
  const fiks = (t: Trapp) => { const x = [...t].sort((a, b) => a.fra - b.fra); if (x[0]?.fra !== 1) x.unshift({ fra: 1, rabatt: 0 }); return x; };
  const lagre = async () => { setBusy(true); const { error } = await sb.from('plattform_innstilling').upsert({ nokkel: 'priser', verdi: { ...P, trapp: fiks(P.trapp), trappBygg: fiks(P.trappBygg), oppdatert: today() }, endret: new Date().toISOString() }); setBusy(false);
    if (error) return toast(feiltekst(error)); await lastPriser(); bump(); toast(tt("Prislisten er lagret")); close(); };
  const felt = (k: string, f: keyof ModulPris, ph: string) => <td className="num"><input type="number" min={0} step={10} style={{ width: 90, textAlign: 'right' }} value={(P.moduler[k] as any)?.[f] ?? ''} placeholder={ph} onChange={e => sett(k, f, e.target.value)} /></td>;
  const eks = (n: number, e: Enhet) => MODULER.filter(m => prisPer(P, m.k, 1, e) !== null).map(m => `${m.navn}: ${kr(prisPer(P, m.k, n, e))}`);
  return <><div className="mh"><h2>{tt("Prisliste – per måned eks. mva.")}</h2><button className="btn ghost sm" onClick={close}>✕</button></div>
    <div className="mb">{!ok ? <p className="muted">{tt("Laster …")}</p> : <>
      <table><thead><tr><th>{tt("Modul")}</th><th className="num" colSpan={2} style={{ textAlign: 'center' }}>{tt("Per bygg")}</th><th className="num" colSpan={2} style={{ textAlign: 'center' }}>{tt("Per bruker")}</th></tr>
        <tr><th /><th className="num small">{tt("Listepris")}</th><th className="num small">{tt("Minimum")}</th><th className="num small">{tt("Listepris")}</th><th className="num small">{tt("Minimum")}</th></tr></thead><tbody>
        {MODULER.map(m => <tr key={m.k}><td>{m.navn}</td>{felt(m.k, 'prisBygg', '–')}{felt(m.k, 'minBygg', '–')}{felt(m.k, 'pris', '–')}{felt(m.k, 'min', '–')}</tr>)}</tbody></table>
      <p className="small muted">{tt("Listepris = pris ved 1 bygg / 1 bruker. Minimum = laveste pris med rabatt. Bare minimum = fast pris uten rabatt. Begge tomme = ingen pris for den delen; er alt tomt for en modul, vises «På forespørsel». 0 = inkludert.")}</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginTop: 8 }}>
        <TrappEditor T={P.trappBygg} set={t => setP(o => ({ ...o, trappBygg: t }))} enhet="bygg" /><TrappEditor T={P.trapp} set={t => setP(o => ({ ...o, trapp: t }))} enhet="bruker" /></div>
      <div className="card" style={{ marginTop: 12, background: 'var(--surface2)' }}><b>{tt("Eksempel: kunde med 10 bygg og 4 brukere, alle moduler")}</b>
        <div style={{ fontSize: 18, fontWeight: 700, margin: '4px 0' }}>{kr(prisTotal(P, MODULER.map(m => m.k), 4, 10))} {tt("per måned")}</div>
        <div className="small muted">{[...eks(10, 'bygg').map(x => x + '/bygg'), ...eks(4, 'bruker').map(x => x + '/bruker')].join(' · ') || tt("Ingen priser lagt inn ennå")}</div></div>
      <label style={{ display: 'block', marginTop: 10 }}><span className="small" style={{ fontWeight: 600 }}>{tt("Tekst under prislisten (valgfritt)")}</span><input style={{ width: '100%' }} value={P.notat || ''} onChange={e => setP({ ...P, notat: e.target.value })} placeholder={tt("F.eks. Fakturering kvartalsvis forskudd. Ingen binding.")} /></label></>}</div>
    <div className="mf"><button className="btn" onClick={close}>{tt("Avbryt")}</button><button className="btn pri" disabled={busy || !ok} onClick={lagre}>{tt("Lagre prisliste")}</button></div></>;
}

// ---------- Plattformadministrator: bestillinger
export function Bestillinger() {
  useStore(); const [B, setB] = useState<any[] | null>(null);
  const last = () => { sb.from('modul_bestilling').select('*').eq('status', 'ny').order('opprettet').then(({ data, error }) => setB(error ? null : data || [])); };
  useEffect(() => { last(); }, []);
  if (!B || !B.length) return null;
  const behandle = async (b: any, aktiver: boolean) => {
    if (aktiver) { const { error } = await sb.from('org_modul').upsert({ org_id: b.org_id, modul: b.modul, aktiv: true, prove_til: null, til: null, merknad: `Bestilt ${String(b.opprettet || b.created_at || '').slice(0, 10)} av ${b.bestilt_av_navn || ''}`, endret: new Date().toISOString() }); if (error) return toast(feiltekst(error)); }
    else if (!(await confirmBox(tt("Avvise bestillingen? Kunden ser at den er avvist."), tt("Avvis")))) return;
    await sb.from('modul_bestilling').update({ status: aktiver ? 'aktivert' : 'avvist', behandlet: new Date().toISOString() }).eq('id', b.id);
    await lastModuler(); bump(); toast(aktiver ? tt("Modulen er aktivert") : tt("Bestillingen er avvist")); last(); };
  return <div className="card" style={{ borderColor: 'var(--amber)', marginBottom: 12 }}><b>{tt("Nye bestillinger (")}{B.length})</b>
    <table style={{ marginTop: 6 }}><tbody>{B.map(b => { const o = S.orgs.find(x => x.id === b.org_id); return <tr key={b.id}><td className="small">{fd(String(b.opprettet || b.created_at || '').slice(0, 10))}</td><td><b style={{ fontWeight: 600 }}>{o?.navn || '?'}</b><div className="small muted">{b.bestilt_av_navn}{tt(" · {0} bygg", byggFor(b.org_id))}{o?.lisenser ? tt(" · {0} brukere", o.lisenser) : ''}{b.kommentar ? ' · «' + b.kommentar + '»' : ''}</div></td>
      <td>{MODULER.find(m => m.k === b.modul)?.navn || b.modul}</td>
      <td style={{ whiteSpace: 'nowrap' }}><button className="btn sm pri" style={{ marginRight: 6 }} onClick={() => behandle(b, true)}>{tt("Aktiver")}</button><button className="btn sm" onClick={() => behandle(b, false)}>{tt("Avvis")}</button></td></tr>; })}</tbody></table></div>;
}

// ---------- Plattformadministrator: moduler og brukerlisenser per kunde
type Rad = { org_id: string; modul: string; aktiv: boolean; prove_til: string | null; til: string | null; merknad: string | null };
const status = (r?: Rad) => !r || !r.aktiv ? 'av' : r.til && r.til < today() ? 'utlopt' : r.prove_til ? (r.prove_til < today() ? 'utlopt' : 'prove') : r.til ? 'oppsagt' : 'betalt';
export function modulAdmin(org: { id: string; navn: string; lisenser?: number | null }) {
  openModal({ wide: true, render: close => <ModulAdminBody org={org} close={close} /> });
}
function ModulAdminBody({ org, close }: { org: { id: string; navn: string; lisenser?: number | null }; close: () => void }) {
  const [R, setR] = useState<Record<string, Rad>>({}); const [last, setLast] = useState(true); const [busy, setBusy] = useState(false); const [feil, setFeil] = useState(''); const [lis, setLis] = useState(org.lisenser ? String(org.lisenser) : '');
  useEffect(() => { lastPriser(); sb.from('org_modul').select('*').eq('org_id', org.id).then(({ data, error }) => { if (error) setFeil(/relation|does not exist|schema/i.test(error.message) ? tt("Modultabellen finnes ikke i databasen ennå.") : feiltekst(error)); setR(Object.fromEntries((data || []).map((r: Rad) => [r.modul, r]))); setLast(false); }); }, [org.id]);
  const sett = (k: string, x: Partial<Rad>) => setR(o => { const std: Rad = { org_id: org.id, modul: k, aktiv: true, prove_til: null, til: null, merknad: null }; return { ...o, [k]: { ...std, ...(o[k] || {}), ...x } }; });
  const velg = (k: string, s: string) => { const pluss = (d: number) => { const t = new Date(); t.setDate(t.getDate() + d); return t.toISOString().slice(0, 10); };
    if (s === 'av') sett(k, { aktiv: false }); else if (s === 'betalt') sett(k, { aktiv: true, prove_til: null, til: null }); else if (s === 'prove') sett(k, { aktiv: true, prove_til: R[k]?.prove_til && R[k].prove_til! >= today() ? R[k].prove_til : pluss(30), til: null }); else if (s === 'oppsagt') sett(k, { aktiv: true, prove_til: null, til: R[k]?.til || pluss(30) }); };
  const lagre = async () => { setBusy(true); const rows = Object.values(R).map(r => ({ org_id: org.id, modul: r.modul, aktiv: r.aktiv, prove_til: r.prove_til || null, til: r.til || null, merknad: r.merknad || null, endret: new Date().toISOString() }));
    const { error } = await sb.from('org_modul').upsert(rows);
    const nyL = lis ? Math.max(1, Math.floor(+lis)) : null;
    if (!error && nyL !== (org.lisenser || null)) { const { error: le } = nyL ? await sb.rpc('sett_lisenser', { p_org: org.id, p_antall: nyL }) : await sb.from('organisasjoner').update({ lisenser: null }).eq('id', org.id);
      if (le) toast(/function|schema|lisenser/i.test(le.message) ? tt("Brukerlisenser krever databaseendring 017") : feiltekst(le)); else { const o = S.orgs.find(x => x.id === org.id); if (o) o.lisenser = nyL; } }
    setBusy(false); if (error) return toast(feiltekst(error)); await lastModuler(); bump(); toast(tt("Abonnementet er oppdatert for ") + org.navn); close(); };
  const P = priser(); const nL = +lis || 0; const sum = P ? prisTotal(P, MODULER.filter(m => m.k === 'kjerne' || ['betalt', 'oppsagt'].includes(status(R[m.k]))).map(m => m.k), nL || Math.max(1, S.medlemmer.filter(m => m.org_id === org.id && m.aktiv).length), byggFor(org.id)) : 0;
  return <><div className="mh"><h2>{tt("Abonnement –")} {org.navn}</h2><button className="btn ghost sm" onClick={close}>✕</button></div>
    <div className="mb">{feil ? <div className="note">{feil}</div> : last ? <p className="muted">{tt("Laster …")}</p> : <>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}><b>{tt("Brukerlisenser")}</b>
        <input type="number" min={1} max={1000} value={lis} onChange={e => setLis(e.target.value)} placeholder={tt("ingen grense")} style={{ width: 120 }} /><span className="small muted">{S.medlemmer.filter(m => m.org_id === org.id && m.aktiv).length} {tt("aktive brukere ·")} {byggFor(org.id)} {tt("bygg")}</span>
        {sum > 0 && <span className="small muted" style={{ marginLeft: 'auto' }}>{tt("Per måned for betalte moduler:")} <b>{kr(sum)}</b> {tt("eks. mva.")}</span>}</div>
      <div className="tbl-wrap"><table><thead><tr><th>{tt("Modul")}</th><th>{tt("Status")}</th><th>{tt("Dato")}</th><th>{tt("Merknad")}</th></tr></thead><tbody>
        {MODULER.filter(m => m.k !== 'kjerne').map(m => { const r = R[m.k]; const s = status(r);
          return <tr key={m.k}><td><b style={{ fontWeight: 600 }}>{m.navn}</b><div className="small muted">{m.inneholder.join(' · ')}</div></td>
            <td><select value={s === 'utlopt' ? (r?.prove_til ? 'prove' : 'oppsagt') : s} onChange={e => velg(m.k, e.target.value)}><option value="av">{tt("Ikke aktivert")}</option><option value="prove">{tt("Prøveperiode")}</option><option value="betalt">{tt("Aktiv (betalt)")}</option><option value="oppsagt">{tt("Oppsagt – gjelder til")}</option></select>
              {s === 'utlopt' && <div><Chip c="red">{tt("Utløpt")}</Chip></div>}</td>
            <td>{(s === 'prove' || (s === 'utlopt' && r?.prove_til)) && <input type="date" value={r?.prove_til || ''} onChange={e => sett(m.k, { prove_til: e.target.value })} />}
              {(s === 'oppsagt' || (s === 'utlopt' && r?.til)) && <input type="date" value={r?.til || ''} onChange={e => sett(m.k, { til: e.target.value })} />}</td>
            <td><input value={r?.merknad || ''} onChange={e => sett(m.k, { merknad: e.target.value })} placeholder={tt("F.eks. avtale, pris")} /></td></tr>; })}
      </tbody></table></div></>}
      <p className="small muted">{tt("Kjernen er alltid med. Modulene til eieren av en eiendom gjelder også for forvaltere og servicefirma som jobber på eiendommen. Data blir liggende når en modul slås av. Antall brukerlisenser er grensen for hvor mange brukere organisasjonen kan ha; kunden kan selv øke det.")}</p></div>
    <div className="mf"><button className="btn" onClick={close}>{tt("Avbryt")}</button>{!feil && <button className="btn pri" disabled={busy || last} onClick={lagre}>{tt("Lagre")}</button>}</div></>;
}
