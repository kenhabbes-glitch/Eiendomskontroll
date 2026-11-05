import React, { useEffect, useState } from 'react';
import { Hjelp } from '../components/Hjelp';
import { S, aoApi, isAdmin, saveInnst, toast, useStore } from '../lib/store';
import { KPI_STANDARD, RENTE_STANDARD, YEAR, kpiFaktor, kpiInnst, nok, renteInnst } from '../lib/utils';

const SQL_URL = 'https://github.com/kenhabbes-glitch/Eiendomskontroll/blob/main/supabase/migrations/002_innstillinger.sql';

export function Innstillinger() {
  useStore();
  const k0 = kpiInnst();
  const [modus, setModus] = useState(k0.modus); const [fast, setFast] = useState<string>(String(k0.fast));
  const [aar, setAar] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(k0.aar).map(([a, v]) => [a, String(v)])));
  const [fra, setFra] = useState(YEAR - 3); const [til, setTil] = useState(YEAR + 30);
  const [busy, setBusy] = useState(false);
  useEffect(() => { const k = kpiInnst(); setModus(k.modus); setFast(String(k.fast)); setAar(Object.fromEntries(Object.entries(k.aar).map(([a, v]) => [a, String(v)]))); }, [JSON.stringify(S.innst.kpi || {})]);
  const ro = !isAdmin();
  const num = (s: string) => { const v = parseFloat(String(s).replace(',', '.')); return isNaN(v) ? null : v; };
  const lagre = async () => {
    const f = num(fast); if (f === null) { toast('Skriv inn en gyldig fast KPI'); return; }
    const a: Record<string, number> = {}; Object.entries(aar).forEach(([y, v]) => { const n = num(v); if (n !== null) a[y] = n; });
    setBusy(true); try { await saveInnst('kpi', { modus, fast: f, aar: a }); toast('KPI-innstillinger lagret'); } catch { } setBusy(false);
  };
  const years: number[] = []; for (let y = fra; y <= til; y++) years.push(y);
  // Forhåndsvisning med det som står i skjemaet (før lagring)
  const prev = (y: number) => { const v = modus === 'aar' ? num(aar[String(y)] ?? '') : null; return v ?? (num(fast) ?? KPI_STANDARD); };
  let fakt = 1; const eks = [5, 10, 15, 20].map(n => { fakt = 1; for (let y = YEAR + 1; y <= YEAR + n; y++) fakt *= 1 + prev(y) / 100; return [n, fakt] as [number, number]; });
  return <>
    <div className="head"><div className="grow"><h1>Innstillinger<Hjelp id="side.innstillinger" /></h1><p className="sub">Felles forutsetninger for beregninger i programmet</p></div></div>
    {S.innstMangler && <div className="banner">Databasetabellen for innstillinger mangler. Kjør <a href={SQL_URL} target="_blank" rel="noopener noreferrer">002_innstillinger.sql</a> i Supabase (SQL Editor → New query → lim inn → Run), og last siden på nytt. Inntil da brukes {KPI_STANDARD} % per år.</div>}
    <div className="card" style={{ maxWidth: 900 }}>
      <h2>KPI for prisjustering av utskiftingskostnader</h2>
      <p className="small muted" style={{ marginTop: -4 }}>Kostnader anslås i kroneverdien for året de ble vurdert. Vedlikeholdsplanen prisjusterer beløpet år for år frem til utskiftingsåret med satsene under.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '12px 0' }}>
        <label className={'rolecard ' + (modus === 'fast' ? 'on' : '')}><input type="radio" checked={modus === 'fast'} disabled={ro} onChange={() => setModus('fast')} /><span><b>Fast KPI for alle år</b><br /><span className="small muted">Samme årlige prisstigning brukes for alle år.</span></span></label>
        <label className={'rolecard ' + (modus === 'aar' ? 'on' : '')}><input type="radio" checked={modus === 'aar'} disabled={ro} onChange={() => setModus('aar')} /><span><b>Egen KPI per år</b><br /><span className="small muted">Legg inn faktisk KPI for passerte år og prognoser fremover. År uten verdi bruker standardsatsen.</span></span></label>
      </div>
      <div className="form" style={{ maxWidth: 420 }}><div className="fld half"><label>{modus === 'fast' ? 'KPI per år (%)' : 'Standardsats for år uten egen verdi (%)'}</label><input value={fast} readOnly={ro} onChange={e => setFast(e.target.value)} inputMode="decimal" style={{ border: '1px solid var(--line2)', borderRadius: 8, padding: '7px 10px' }} /></div></div>
      {modus === 'aar' && <div className="sec">
        <div className="toolbar"><span className="small">Vis år</span><input type="number" value={fra} onChange={e => setFra(+e.target.value || YEAR)} style={{ width: 90 }} /><span className="small">til</span><input type="number" value={til} onChange={e => setTil(+e.target.value || YEAR + 30)} style={{ width: 90 }} />
          {!ro && <button className="btn sm" onClick={() => { const n = { ...aar }; years.forEach(y => { if (y > YEAR && !n[String(y)]) n[String(y)] = fast; }); setAar(n); }}>Fyll fremtidige år med standardsats</button>}</div>
        <div className="tbl-wrap" style={{ maxHeight: 420 }}><table><thead><tr><th>År</th><th>KPI (%)</th><th className="num">Brukes i beregning</th></tr></thead><tbody>
          {years.map(y => <tr key={y} style={y === YEAR ? { background: 'var(--acc2)' } : undefined}><td className="mono">{y}{y === YEAR ? ' (i år)' : y < YEAR ? '' : ''}</td>
            <td><input value={aar[String(y)] ?? ''} readOnly={ro} placeholder={String(num(fast) ?? KPI_STANDARD).replace('.', ',')} inputMode="decimal" onChange={e => setAar({ ...aar, [String(y)]: e.target.value })} style={{ border: '1px solid var(--line2)', borderRadius: 6, padding: '4px 8px', width: 110 }} /></td>
            <td className="num">{prev(y).toLocaleString('nb-NO', { maximumFractionDigits: 2 })} %</td></tr>)}
        </tbody></table></div></div>}
      <div className="note small" style={{ marginTop: 14 }}>Eksempel: 1 000 000 kr anslått i {YEAR} blir {eks.map(([n, f]) => `${nok(1e6 * f)} i ${YEAR + n}`).join(' · ')}.</div>
      {!ro ? <div style={{ marginTop: 14 }}><button className="btn pri" disabled={busy || S.innstMangler} onClick={lagre}>{busy ? 'Lagrer …' : 'Lagre KPI-innstillinger'}</button></div> : <p className="small muted">Bare administrator kan endre innstillingene.</p>}
    </div>
    <RenteKort ro={ro} />
    {isAdmin() && <EpostKort />}
  </>;
}

function RenteKort({ ro }: { ro: boolean }) {
  useStore();
  const [v, setV] = useState(String(renteInnst())); const [busy, setBusy] = useState(false);
  useEffect(() => { setV(String(renteInnst()).replace('.', ',')); }, [JSON.stringify(S.innst.rente || {})]);
  const r = parseFloat(v.replace(',', '.'));
  const lagre = async () => { if (isNaN(r) || r < 0 || r > 30) { toast('Skriv inn en rente mellom 0 og 30 %'); return; } setBusy(true); try { await saveInnst('rente', { sats: r }); toast('Kalkulasjonsrente lagret'); } catch { } setBusy(false); };
  const kpi = kpiInnst().fast;
  return <div className="card" style={{ maxWidth: 900, marginTop: 16 }}>
    <h2>Kalkulasjonsrente for nåverdi<Hjelp id="naaverdi" /></h2>
    <p className="small muted" style={{ marginTop: -4 }}>Nåverdien viser hva fremtidige utskiftinger er verdt i dag: kostnaden prisjusteres med KPI frem til utskiftingsåret og diskonteres tilbake til {YEAR} med denne renten. Siden kostnadene er KPI-justert (nominelle), bør renten også være nominell. Realrenten er omtrent kalkulasjonsrente minus KPI{!isNaN(r) ? ` – nå ca. ${(r - kpi).toLocaleString('nb-NO', { maximumFractionDigits: 2 })} %` : ''}.</p>
    <div className="form" style={{ maxWidth: 420 }}><div className="fld half"><label>Kalkulasjonsrente (% per år)</label><input value={v} readOnly={ro} onChange={e => setV(e.target.value)} inputMode="decimal" placeholder={String(RENTE_STANDARD)} style={{ border: '1px solid var(--line2)', borderRadius: 8, padding: '7px 10px' }} /></div></div>
    {!isNaN(r) && <div className="note small">Eksempel: 1 000 000 kr som må betales om 10 år har nåverdi {nok(1e6 / Math.pow(1 + r / 100, 10))}, om 20 år {nok(1e6 / Math.pow(1 + r / 100, 20))}.</div>}
    {!ro && <div style={{ marginTop: 14 }}><button className="btn pri" disabled={busy || S.innstMangler} onClick={lagre}>{busy ? 'Lagrer …' : 'Lagre kalkulasjonsrente'}</button></div>}
  </div>;
}

const PRESET: Record<string, [string, number, string]> = {
  gmail: ['smtp.gmail.com', 465, 'Gmail: bruk app-passord (myaccount.google.com/apppasswords). Avsenderadressen må være Gmail-adressen.'],
  m365: ['smtp.office365.com', 587, 'Microsoft 365/Outlook: SMTP AUTH må være slått på for postkassen hos kunden.'],
  domeneshop: ['smtp.domeneshop.no', 587, 'Domeneshop: brukernavn og passord for e-postkontoen.'],
  annen: ['', 587, 'Annen e-postleverandør: se leverandørens SMTP-innstillinger.'],
};
function EpostKort() {
  const [d, setD] = useState<any>(null); const [har, setHar] = useState(false); const [aktiv, setAktiv] = useState<any>(null); const [hem, setHem] = useState(''); const [busy, setBusy] = useState(''); const [feil, setFeil] = useState(''); const [lev, setLev] = useState('gmail');
  const last = async () => { try { const r = await aoApi({ action: 'epost_hent' }); setD({ metode: 'smtp', smtpHost: 'smtp.gmail.com', smtpPort: 465, ...r.data }); setHar(r.harHemmelig); setAktiv(r.aktiv); const h = r.data?.smtpHost || 'smtp.gmail.com'; setLev(Object.keys(PRESET).find(k => PRESET[k][0] === h) || 'annen'); } catch (e: any) { setFeil(e.message); setD({ metode: 'smtp', smtpHost: 'smtp.gmail.com', smtpPort: 465 }); } };
  useEffect(() => { last(); }, []);
  if (!d) return <div className="card" style={{ maxWidth: 900, marginTop: 16 }}><h2>E-post for arbeidsordre</h2><p className="muted small">Laster …</p></div>;
  const set = (x: any) => setD({ ...d, ...x });
  const inp = { border: '1px solid var(--line2)', borderRadius: 8, padding: '7px 10px', width: '100%' } as any;
  const lagre = async () => { setBusy('Lagrer …'); try { await aoApi({ action: 'epost_lagre', data: d, hemmelig: hem }); setHem(''); toast('E-postoppsett lagret'); await last(); } catch (e: any) { toast(e.message); } setBusy(''); };
  const test = async () => { setBusy('Sender test …'); try { const r = await aoApi({ action: 'epost_test' }); toast(r.sendt ? 'Testmelding sendt til ' + r.til : r.grunn); } catch (e: any) { toast(e.message); } setBusy(''); };
  return <div className="card" style={{ maxWidth: 900, marginTop: 16 }}>
    <h2>E-post for arbeidsordre</h2>
    <p className="small muted" style={{ marginTop: -4 }}>Arbeidsordre og varsler sendes fra denne avsenderen, slik at e-posten ser ut til å komme fra dere. Passord og nøkler lagres på serveren, kan ikke leses av noen brukere i appen og vises aldri igjen etter lagring.</p>
    {feil && <div className="banner">{feil}</div>}
    {aktiv && <p className="small">{aktiv.metode ? <>Aktiv nå: <b>{aktiv.metode === 'smtp' ? 'SMTP' : 'Resend'}</b> fra <b>{aktiv.fra}</b> {aktiv.kilde === 'netlify' && <span className="muted">(fra miljøvariabler i Netlify – det du lagrer her overstyrer dem)</span>}</> : <span style={{ color: 'var(--amber)' }}>Ingen e-posttjeneste er satt opp. Arbeidsordre åpnes i brukerens eget e-postprogram.</span>}</p>}
    <div className="form" style={{ maxWidth: 640 }}>
      <div className="fld half"><label>Standard avsendernavn</label><input style={inp} value={d.fraNavn || ''} onChange={e => set({ fraNavn: e.target.value })} placeholder="F.eks. organisasjonens navn" /><div className="hint">Brukes når eiendommen ikke har eget avsendernavn eller eier registrert. Ellers vises eiendommens avsendernavn, eller eieren (hjemmelshaver).</div></div>
      <div className="fld half"><label>Svar går til (valgfritt)</label><input style={inp} value={d.svarTil || ''} onChange={e => set({ svarTil: e.target.value })} placeholder="Tom = den som sendte arbeidsordren" /></div>
      <div className="fld half"><label>Sendemetode</label><select style={inp} value={d.metode || ''} onChange={e => set({ metode: e.target.value })}><option value="smtp">SMTP (egen e-postkonto)</option><option value="resend">Resend (eget domene)</option><option value="">Av – bruk eget e-postprogram</option></select></div>
      {d.metode === 'smtp' && <>
        <div className="fld half"><label>E-postleverandør</label><select style={inp} value={lev} onChange={e => { const k = e.target.value; setLev(k); if (k !== 'annen') set({ smtpHost: PRESET[k][0], smtpPort: PRESET[k][1] }); }}>{[['gmail', 'Gmail'], ['m365', 'Microsoft 365 / Outlook'], ['domeneshop', 'Domeneshop'], ['annen', 'Annen']].map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div className="fld" style={{ marginTop: -4 }}><div className="hint">{PRESET[lev][2]}</div></div>
        {lev === 'annen' && <><div className="fld half"><label>SMTP-server</label><input style={inp} value={d.smtpHost || ''} onChange={e => set({ smtpHost: e.target.value })} /></div><div className="fld half"><label>Port</label><input style={inp} type="number" value={d.smtpPort || ''} onChange={e => set({ smtpPort: +e.target.value })} /></div></>}
        <div className="fld half"><label>Brukernavn (e-postadressen)</label><input style={inp} value={d.smtpUser || ''} onChange={e => set({ smtpUser: e.target.value, fraEpost: !d.fraEpost || d.fraEpost === d.smtpUser ? e.target.value : d.fraEpost })} /></div>
        <div className="fld half"><label>Passord / app-passord</label><input style={inp} type="password" value={hem} onChange={e => setHem(e.target.value)} placeholder={har ? '•••••••• (lagret – fyll ut for å bytte)' : ''} autoComplete="new-password" /></div>
        <div className="fld half"><label>Avsenderadresse</label><input style={inp} value={d.fraEpost || ''} onChange={e => set({ fraEpost: e.target.value })} /><div className="hint">Normalt samme som brukernavnet.</div></div>
      </>}
      {d.metode === 'resend' && <>
        <div className="fld half"><label>Avsenderadresse</label><input style={inp} value={d.fraEpost || ''} onChange={e => set({ fraEpost: e.target.value })} placeholder="arbeidsordre@varsel.firma.no" /><div className="hint">Må være på et domene verifisert i Resend.</div></div>
        <div className="fld half"><label>Resend API-nøkkel</label><input style={inp} type="password" value={hem} onChange={e => setHem(e.target.value)} placeholder={har ? '•••••••• (lagret – fyll ut for å bytte)' : 're_…'} autoComplete="new-password" /></div>
      </>}
    </div>
    <p className="small muted">Mottakeren ser: <b>«eiendommens avsendernavn eller eier»</b> &lt;{d.fraEpost || d.smtpUser || '…'}&gt; – eller <b>{d.fraNavn || 'Eiendomskontroll'}</b> hvis eiendommen mangler begge.</p>
    <div style={{ display: 'flex', gap: 8 }}><button className="btn pri" disabled={!!busy} onClick={lagre}>{busy || 'Lagre e-postoppsett'}</button><button className="btn" disabled={!!busy} onClick={test}>Send test til meg</button></div>
  </div>;
}
