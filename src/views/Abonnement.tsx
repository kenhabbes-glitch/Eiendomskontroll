// Abonnement: sperret modul, kundens oversikt over moduler, og plattformadministratorens modulstyring per kunde
import React, { useEffect, useState } from 'react';
import { mineOrg, sb, toast, useStore, feiltekst } from '../lib/store';
import { Chip, openModal } from '../components/ui';
import { fd, today } from '../lib/utils';
import { MODULER, lastModuler, modulerAktivert, harModul, proveTil, type ModulKey } from '../lib/moduler';
import { bump } from '../lib/store';

export function ModulSperret({ k }: { k: ModulKey }) {
  const m = MODULER.find(x => x.k === k);
  return <><h1>{m?.navn || 'Modul'}</h1><div className="card" style={{ maxWidth: 640 }}>
    <p><b>Denne modulen er ikke aktivert for organisasjonen.</b></p><p className="muted">{m?.tekst}</p>
    {m && <ul>{m.inneholder.map(x => <li key={x}>{x}</li>)}</ul>}
    <p className="small">Ta kontakt med leverandøren av Eiendomskontroll for å aktivere modulen eller få en prøveperiode. Dataene dere har registrert tidligere, blir liggende og kommer tilbake når modulen aktiveres.</p>
    <a className="btn" href="#/brukere">Se abonnementet</a></div></>;
}

/** Kundens egen oversikt (Organisasjon og tilgang → Abonnement) */
export function AbonnementOversikt() {
  useStore(); const org = mineOrg()[0];
  if (!modulerAktivert()) return <div className="card"><p className="muted">Modulstyring er ikke slått på ennå – alle funksjoner er tilgjengelige.</p></div>;
  return <div className="card"><h2 style={{ marginTop: 0 }}>Abonnement{org ? ' – ' + org.navn : ''}</h2>
    <div className="tbl-wrap"><table><thead><tr><th>Modul</th><th>Innhold</th><th>Status</th></tr></thead><tbody>
      {MODULER.map(m => { const har = harModul(m.k); const pt = proveTil(m.k);
        return <tr key={m.k}><td><b style={{ fontWeight: 600 }}>{m.navn}</b><div className="small muted">{m.tekst}</div></td><td className="small">{m.inneholder.join(' · ')}</td>
          <td>{m.k === 'kjerne' ? <Chip c="green">Inkludert</Chip> : har ? (pt ? <Chip c="amber">Prøve til {fd(pt)}</Chip> : <Chip c="green">Aktiv</Chip>) : <Chip c="grey">Ikke aktivert</Chip>}</td></tr>; })}
    </tbody></table></div>
    <p className="small muted">Ønsker dere flere moduler eller endringer i abonnementet, ta kontakt med leverandøren.</p></div>;
}

// ---------- Plattformadministrator: moduler per kunde
type Rad = { org_id: string; modul: string; aktiv: boolean; prove_til: string | null; til: string | null; merknad: string | null };
const status = (r?: Rad) => !r || !r.aktiv ? 'av' : r.til && r.til < today() ? 'utlopt' : r.prove_til ? (r.prove_til < today() ? 'utlopt' : 'prove') : r.til ? 'oppsagt' : 'betalt';
export function modulAdmin(org: { id: string; navn: string }) {
  openModal({ wide: true, render: close => <ModulAdminBody org={org} close={close} /> });
}
function ModulAdminBody({ org, close }: { org: { id: string; navn: string }; close: () => void }) {
  const [R, setR] = useState<Record<string, Rad>>({}); const [last, setLast] = useState(true); const [busy, setBusy] = useState(false); const [feil, setFeil] = useState('');
  useEffect(() => { sb.from('org_modul').select('*').eq('org_id', org.id).then(({ data, error }) => { if (error) setFeil(/relation|does not exist|schema/i.test(error.message) ? 'Modultabellen finnes ikke i databasen ennå (migrasjon 015).' : feiltekst(error)); setR(Object.fromEntries((data || []).map((r: Rad) => [r.modul, r]))); setLast(false); }); }, [org.id]);
  const sett = (k: string, x: Partial<Rad>) => setR(o => { const std: Rad = { org_id: org.id, modul: k, aktiv: true, prove_til: null, til: null, merknad: null }; return { ...o, [k]: { ...std, ...(o[k] || {}), ...x } }; });
  const velg = (k: string, s: string) => { const pluss = (d: number) => { const t = new Date(); t.setDate(t.getDate() + d); return t.toISOString().slice(0, 10); };
    if (s === 'av') sett(k, { aktiv: false }); else if (s === 'betalt') sett(k, { aktiv: true, prove_til: null, til: null }); else if (s === 'prove') sett(k, { aktiv: true, prove_til: R[k]?.prove_til && R[k].prove_til! >= today() ? R[k].prove_til : pluss(30), til: null }); else if (s === 'oppsagt') sett(k, { aktiv: true, prove_til: null, til: R[k]?.til || pluss(30) }); };
  const lagre = async () => { setBusy(true); const rows = Object.values(R).map(r => ({ org_id: org.id, modul: r.modul, aktiv: r.aktiv, prove_til: r.prove_til || null, til: r.til || null, merknad: r.merknad || null, endret: new Date().toISOString() }));
    const { error } = await sb.from('org_modul').upsert(rows); setBusy(false); if (error) return toast(feiltekst(error)); await lastModuler(); bump(); toast('Modulene er oppdatert for ' + org.navn); close(); };
  return <><div className="mh"><h2>Moduler – {org.navn}</h2><button className="btn ghost sm" onClick={close}>✕</button></div>
    <div className="mb">{feil ? <div className="note">{feil}</div> : last ? <p className="muted">Laster …</p> :
      <div className="tbl-wrap"><table><thead><tr><th>Modul</th><th>Status</th><th>Dato</th><th>Merknad</th></tr></thead><tbody>
        {MODULER.filter(m => m.k !== 'kjerne').map(m => { const r = R[m.k]; const s = status(r);
          return <tr key={m.k}><td><b style={{ fontWeight: 600 }}>{m.navn}</b><div className="small muted">{m.inneholder.join(' · ')}</div></td>
            <td><select value={s === 'utlopt' ? (r?.prove_til ? 'prove' : 'oppsagt') : s} onChange={e => velg(m.k, e.target.value)}><option value="av">Ikke aktivert</option><option value="prove">Prøveperiode</option><option value="betalt">Aktiv (betalt)</option><option value="oppsagt">Oppsagt – gjelder til</option></select>
              {s === 'utlopt' && <div><Chip c="red">Utløpt</Chip></div>}</td>
            <td>{(s === 'prove' || (s === 'utlopt' && r?.prove_til)) && <input type="date" value={r?.prove_til || ''} onChange={e => sett(m.k, { prove_til: e.target.value })} />}
              {(s === 'oppsagt' || (s === 'utlopt' && r?.til)) && <input type="date" value={r?.til || ''} onChange={e => sett(m.k, { til: e.target.value })} />}</td>
            <td><input value={r?.merknad || ''} onChange={e => sett(m.k, { merknad: e.target.value })} placeholder="F.eks. avtale, pris" /></td></tr>; })}
      </tbody></table></div>}
      <p className="small muted">Kjernen er alltid med. Modulene til eieren av en eiendom gjelder også for forvaltere og servicefirma som jobber på eiendommen. Data blir liggende når en modul slås av.</p></div>
    <div className="mf"><button className="btn" onClick={close}>Avbryt</button>{!feil && <button className="btn pri" disabled={busy || last} onClick={lagre}>Lagre</button>}</div></>;
}
