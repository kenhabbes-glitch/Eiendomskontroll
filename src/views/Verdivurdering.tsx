// Verdivurdering (internt anslag) – inndata til venstre, resultat til høyre; lagres på eiendommen med historikk
import React, { useMemo, useRef, useState } from 'react';
import { S, kanRedigereE, save, state, toast, useStore } from '../lib/store';
import { openModal } from '../components/ui';
import { fd, m2, today, type Rec } from '../lib/utils';
import { innFor, kr, mkr, verdivurdering, type VerdiInn, type Verdi } from '../lib/verdivurdering';
import { RAP_CSS, skrivUt } from './ProsjektRapport';
import { editLeietaker } from '../lib/actions';
import { tt, lokale } from '../lib/i18n';

const CSS = `.rap .vv{border:2px solid #1f6f5c;background:#eef6f3;border-radius:8px;padding:10px 14px;margin:10px 0}.rap .vv b{font-size:20pt;display:block}.rap .vv span{color:#5b645f;font-size:9pt}
.rap .kp{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:8px 0 12px}.rap .kp>div{border:1px solid #dfe3dd;border-radius:8px;padding:7px 10px}.rap .kp span{display:block;color:#5b645f;font-size:9pt}.rap .kp b{font-size:13pt;font-variant-numeric:tabular-nums}
.rap .ul{display:flex;align-items:flex-end;gap:4px;height:80px;border-bottom:1px solid #9aa39d}.rap .ul div{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100%}.rap .ul i{display:block;width:70%;background:#1f6f5c;border-radius:3px 3px 0 0}
.rap .ux{display:flex;gap:4px;font-size:8pt;color:#5b645f}.rap .ux span{flex:1;text-align:center}.rap .adv{border:1px solid #f0d9b5;background:#fdf6ea;border-radius:8px;padding:8px 12px;margin:10px 0;font-size:9.5pt}`;

function Rapport({ r }: { r: Verdi }) {
  const e = r.e; const i = r.inn; const maxU = Math.max(...r.utlop.map(u => u.leie), 1);
  return <div className="rap"><style>{RAP_CSS + CSS}</style>
    <div className="meta">{tt("Verdivurdering – internt anslag ·")} {fd(today())} · {state.me?.navn || state.me?.epost || ''}</div>
    <h1>{e.navn}</h1><div className="meta">{[e.adresse, e.poststed].filter(Boolean).join(', ')}{e.gnrbnr ? tt(" · gnr/bnr ") + e.gnrbnr : ''}{r.bta ? tt(" · BTA {0}", m2(r.bta)) : ''}{e.kategori ? ' · ' + e.kategori : ''}</div>
    <div className="vv"><span>{tt("Anslått markedsverdi")}</span><b>{mkr(r.verdi)}</b><span>{r.bta ? tt("{0} per m² BTA · ", kr(r.m2)) : ''}{tt("yield")} {i.yield.toLocaleString(lokale())} {tt("% · netto leie")} {kr(r.netto)}</span></div>
    {r.mangler.length > 0 && <div className="adv"><b>{tt("Usikkerhet i grunnlaget")}</b><ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{r.mangler.map((m, j) => <li key={j}>{m}</li>)}</ul></div>}
    <div className="kp">
      <div><span>{tt("Kontraktsleie")}</span><b>{kr(r.kontraktsleie)}</b><span>{r.arealMedLeie ? tt("{0}/m² · ", kr(r.kontraktsleie / r.arealMedLeie)) : ''}{m2(r.utleid)} {tt("utleid")}</span></div>
      <div><span>{tt("Vektet gjenstående løpetid (WAULT)")}</span><b>{r.wault.toLocaleString(lokale(), { maximumFractionDigits: 1 })} {tt("år")}</b><span>{r.utlopSnart ? tt("{0} utløper innen 1 år", kr(r.utlopSnart)) : tt("ingen utløp innen 1 år")}</span></div>
      <div><span>{tt("Ledighet")}</span><b>{r.ledighetPst.toLocaleString(lokale(), { maximumFractionDigits: 1 })} %</b><span>{i.ledigAreal ? m2(i.ledigAreal) + tt(" ledig") : tt("fullt utleid")}</span></div>
    </div>
    <h2>{tt("Beregning")}</h2><table><tbody>
      <tr><td>{tt("Leie fra leietakerne")}{r.rader.some(x => x.marked) ? tt(" (markedsleie for {0})", r.rader.filter(x => x.marked).map(x => x.navn).join(', ')) : ''}</td><td className="n">{kr(r.brutto - r.ledigLeie)}</td></tr>
      {r.ledigLeie > 0 && <tr><td>{tt("+ Ledig areal til markedsleie (")}{m2(i.ledigAreal)} × {kr(i.markedsleie)})</td><td className="n">{kr(r.ledigLeie)}</td></tr>}
      <tr className="sum"><td>{tt("Brutto leie")}</td><td className="n">{kr(r.brutto)}</td></tr>
      <tr><td>{tt("− Langsiktig ledighetsrisiko (")}{i.ledighet.toLocaleString(lokale())} %)</td><td className="n">−{kr(r.ledighetsFradrag)}</td></tr>
      <tr><td>{tt("− Eierkostnader")} {i.eierkost > 0 ? tt("(oppgitt)") : tt("({0} % av brutto leie)", i.eierkostPst.toLocaleString(lokale()))}</td><td className="n">−{kr(r.eierkost)}</td></tr>
      <tr className="sum"><td>{tt("Netto leie")}</td><td className="n">{kr(r.netto)}</td></tr>
      <tr><td>{tt("Kapitalisert med yield")} {i.yield.toLocaleString(lokale())} %</td><td className="n">{kr(r.bruttoverdi)}</td></tr>
      {r.capexFradrag > 0 && <tr><td>− {i.capex === 'etterslep' ? tt("Teknisk etterslep og TG3 ({0} tiltak)", r.ett.length) : tt("Utskiftingsbehov neste 5 år (nåverdi)")}</td><td className="n">−{kr(r.capexFradrag)}</td></tr>}
      {r.ledigFradrag > 0 && <tr><td>{tt("− Leietap til ledig areal er utleid (")}{i.tilUtleie} {tt("mnd)")}</td><td className="n">−{kr(r.ledigFradrag)}</td></tr>}
      <tr className="sum"><td>{tt("Anslått markedsverdi")}</td><td className="n">{kr(r.verdi)}</td></tr></tbody></table>
    <h2>{tt("Følsomhet for yield")}</h2><table><thead><tr>{r.sens.map(s => <th key={s.y} className="n">{s.y.toLocaleString(lokale(), { minimumFractionDigits: 2 })} %</th>)}</tr></thead><tbody><tr>{r.sens.map(s => <td key={s.y} className="n" style={{ fontWeight: s.y === i.yield ? 700 : 400 }}>{mkr(s.v)}</td>)}</tr></tbody></table>
    <h2>{tt("Leietakere")}</h2>{r.rader.length ? <table><thead><tr><th>{tt("Leietaker")}</th><th className="n">{tt("Areal")}</th><th className="n">{tt("Leie/år")}</th><th className="n">{tt("kr/m²")}</th><th>{tt("Utløp")}</th><th className="n">{tt("KPI")}</th><th>{tt("Opsjon")}</th></tr></thead><tbody>
      {r.rader.map(x => <tr key={x.l.id}><td>{x.navn}{x.marked && <div className="meta">{x.leie ? tt("regnet med markedsleie (utløper snart)") : tt("leie mangler – regnet med markedsleie")}</div>}</td><td className="n">{x.areal ? m2(x.areal) : '–'}</td><td className="n">{x.leie ? kr(x.leie) : <span style={{ color: '#b7791f' }}>{tt("mangler")}</span>}</td><td className="n">{x.m2 ? kr(x.m2) : '–'}</td><td>{fd(x.slutt)}</td><td className="n">{x.kpi} %</td><td>{x.opsjon}</td></tr>)}</tbody></table> : <p className="muted">{tt("Ingen aktive leietakere.")}</p>}
    {r.kontraktsleie > 0 && <><h3>{tt("Leie som utløper per år")}</h3><div className="ul">{r.utlop.map(u => <div key={u.aar} title={kr(u.leie)}><i style={{ height: u.leie / maxU * 100 + '%' }} /></div>)}</div><div className="ux">{r.utlop.map(u => <span key={u.aar}>’{String(u.aar).slice(2)}</span>)}</div></>}
    {i.notat.trim() && <><h2>{tt("Kommentar")}</h2><p className="pre">{i.notat}</p></>}
    <p className="meta" style={{ marginTop: 16 }}>{tt("Internt anslag etter avkastningsmetoden, ikke en takst eller verdivurdering fra autorisert takstmann. Resultatet er svært følsomt for yield og markedsleie – bruk tall fra megler eller nylige salg i området. Fradraget for teknisk etterslep hentes fra vedlikeholdsplanen.")}</p>
    {(e.verdi?.historikk || []).length > 0 && <><h3>{tt("Tidligere anslag")}</h3><table><thead><tr><th>{tt("Dato")}</th><th className="n">{tt("Yield")}</th><th className="n">{tt("Netto leie")}</th><th className="n">{tt("Verdi")}</th></tr></thead><tbody>{[...e.verdi.historikk].reverse().slice(0, 8).map((h: Rec, j: number) => <tr key={j}><td>{fd(h.dato)}</td><td className="n">{(+h.yield).toLocaleString(lokale())} %</td><td className="n">{kr(h.netto)}</td><td className="n">{mkr(h.verdi)}</td></tr>)}</tbody></table></>}
  </div>;
}

function Body({ eid, close }: { eid: string; close: () => void }) {
  useStore(); const e = S.eiendommer.find(x => x.id === eid)!; const ro = !kanRedigereE(eid);
  const [inn, setInn] = useState<VerdiInn>(() => innFor(e)); const set = (x: Partial<VerdiInn>) => setInn(v => ({ ...v, ...x }));
  const r = useMemo(() => verdivurdering(e, inn), [inn, e, S.leietakere, S.anlegg, S.komponenter, S.tegninger]);
  const ref = useRef<HTMLDivElement>(null); const [busy, setBusy] = useState(false);
  const num = (k: keyof VerdiInn, l: string, suf: string, step = 1, hint?: string) => <label style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}><span className="small" style={{ fontWeight: 600 }}>{l}</span>
    <span style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 6, alignItems: 'center' }}><input type="number" step={step} disabled={ro} value={(inn[k] as number) || ''} onChange={x => set({ [k]: x.target.value === '' ? 0 : +x.target.value } as any)} style={{ width: '100%', minWidth: 0, boxSizing: 'border-box' }} /><span className="small muted" style={{ whiteSpace: 'nowrap' }}>{suf}</span></span>
    {hint && <span className="small muted">{hint}</span>}</label>;
  const lagre = async () => { setBusy(true); try {
    const h = [...(e.verdi?.historikk || []), { dato: today(), yield: inn.yield, netto: Math.round(r.netto), verdi: Math.round(r.verdi), av: state.me?.navn || '' }].slice(-30);
    await save('eiendommer', { ...e, verdi: { inn, sist: { dato: today(), verdi: Math.round(r.verdi), netto: Math.round(r.netto), yield: inn.yield }, historikk: h } }); toast(tt("Verdivurderingen er lagret på eiendommen")); } finally { setBusy(false); } };
  return <>
    <div className="mh"><h2>{tt("Verdivurdering –")} {e.navn}</h2><button className="btn ghost sm" onClick={close}>✕</button></div>
    <div className="mb">
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 380px) 1fr', gap: 14, alignItems: 'start' }}>
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px 12px' }}>
            {num('yield', 'Markedsyield', '%', 0.05, 'Fra megler eller nylige salg')}
            {num('markedsleie', 'Markedsleie', 'kr/m²/år', 50, 'For tilsvarende lokaler')}
            {num('ledigAreal', 'Ledig areal', 'm²', 10, 'Utleibart, ikke leid ut')}
            {num('tilUtleie', 'Tid til utleid', 'mnd', 1, 'For ledig areal')}
            {num('ledighet', 'Ledighetsrisiko', '% av leie', 0.5, 'Langsiktig, normalisert')}
            {num('eierkostPst', 'Eierkostnader', '% av leie', 0.5, inn.eierkost > 0 ? 'Brukes ikke – beløp er oppgitt' : 'Forsikring, skatt, forvaltning, vedlikehold')}
            {num('eierkost', 'Eller eierkostnader i kr', 'kr/år', 10000)}
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}><span className="small" style={{ fontWeight: 600 }}>{tt("Trekk for teknisk tilstand")}</span><select style={{ width: '100%' }} disabled={ro} value={inn.capex} onChange={x => set({ capex: x.target.value as any })}><option value="etterslep">{tt("Etterslep og TG3")}</option><option value="fem">{tt("Utskiftinger neste 5 år (nåverdi)")}</option><option value="ingen">{tt("Ingen trekk")}</option></select></label>
            <label className="small" style={{ gridColumn: '1 / -1', display: 'flex', gap: 6 }}><input type="checkbox" disabled={ro} checked={inn.leieMarked} onChange={x => set({ leieMarked: x.target.checked })} />{tt("Bruk markedsleie for kontrakter som utløper innen 1 år")}</label>
            <label style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 3 }}><span className="small" style={{ fontWeight: 600 }}>{tt("Kommentar")}</span><textarea rows={3} disabled={ro} value={inn.notat} onChange={x => set({ notat: x.target.value })} placeholder={tt("Kilde for yield og markedsleie, forutsetninger")} /></label>
          </div>
          {r.rader.some(x => !x.leie) && <div className="note small">{tt("Leie mangler for noen leietakere:")} {r.rader.filter(x => !x.leie).map(x => <a key={x.l.id} href="#" style={{ marginRight: 8 }} onClick={ev => { ev.preventDefault(); editLeietaker(x.l.id); }}>{x.navn}</a>)}</div>}
          {e.verdi?.sist && <p className="small muted">{tt("Sist lagret")} {fd(e.verdi.sist.dato)}: {mkr(e.verdi.sist.verdi)}</p>}
        </div>
        <div className="card" ref={ref} style={{ maxHeight: '64vh', overflow: 'auto', background: '#fff', margin: 0 }}><Rapport r={r} /></div>
      </div>
    </div>
    <div className="mf"><button className="btn" onClick={close}>{tt("Lukk")}</button><button className="btn" onClick={() => skrivUt(ref.current, `Verdivurdering ${e.navn} ${fd(today())}`)}>{tt("Skriv ut / PDF")}</button>
      {!ro && <button className="btn pri" disabled={busy} onClick={lagre}>{busy ? tt("Lagrer …") : tt("Lagre")}</button>}</div>
  </>;
}
export function verdiModal(eid: string) { openModal({ wide: true, render: close => <Body eid={eid} close={close} /> }); }
