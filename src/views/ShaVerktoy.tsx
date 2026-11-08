// SHA etter byggherreforskriften: vurdering av plikter, risikovurdering, koordinatorer/organisering og byggherrens SHA-plan.
import React, { useRef } from 'react';
import { byId, eNavn, fd, today, type Rec } from '../lib/utils';
import { Chip } from '../components/ui';
import { Hjelp } from '../components/LovHjelp';
import { RISIKOFORHOLD } from '../lib/lovhjelp';
import { FASER, uid } from '../lib/prosjekt';
import { n } from '../lib/prosjektArbeid';
import { Rader, risikoNivaa } from './ProsjektArbeid';
import { RAP_CSS, skrivUt } from './ProsjektRapport';
import { tt } from '../lib/i18n';

export type ShaFane = 'vurdering' | 'risiko' | 'org' | 'plan';
const JN = ({ v, set }: { v?: string; set: (x: string) => void }) => <div className="seg">{[['ja', 'Ja'], ['nei', 'Nei'], ['usikker', 'Usikker']].map(([k, l]) => <button key={k} type="button" className={'btn sm' + (v === k ? ' pri' : '')} onClick={() => set(k)}>{tt(l)}</button>)}</div>;
const virkedager = (a: string, b: string) => { if (!a || !b) return 0; let d = new Date(a + 'T00:00:00Z'), e = new Date(b + 'T00:00:00Z'), c = 0; while (d <= e) { const w = d.getUTCDay(); if (w && w !== 6) c++; d = new Date(d.getTime() + 864e5); } return c; };

export function shaKonklusjon(v: Rec = {}, p?: Rec) {
  const V = v.vurdering || {}; const utf = (p?.faser || []).find((f: Rec) => f.k === 'utf') || {};
  const dagerPlan = virkedager(utf.start, utf.slutt); const dager = n(V.dager) || dagerPlan; const dagsverk = n(V.dagsverk) || (dager && n(V.personer) ? dager * n(V.personer) : 0);
  const gjelder = V.forbruker === 'ja' ? false : V.vedlikehold === 'ja' ? false : V.vedlikehold === 'nei' ? true : null;
  const jn = (x?: string) => x === 'ja' ? true : x === 'nei' ? false : null;
  const kp = jn(V.flereP ?? V.flere), ku = jn(V.flereU ?? V.flere);
  // Koordinering kreves når det er flere prosjekterende eller flere utførende (§ 13)
  const koord = kp || ku ? true : kp === false && ku === false ? false : null;
  const fm = dager > 15 || dagsverk > 250 ? true : dager || dagsverk ? false : null;
  return { gjelder, koord, kp, ku, fm, dager, dagerPlan, dagsverk, vurdert: !!(V.vedlikehold && (V.flere || (V.flereP && V.flereU))) };
}
/** Hvilke sjekkpunkter som kan krysses av ut fra innholdet i SHA-verktøyet */
export function shaAvkrysning(t: string, v: Rec = {}, p?: Rec): boolean {
  const k = shaKonklusjon(v, p); const s = t.toLowerCase(); const O = v.org || {};
  if (/risikovurdering av arbeidet/.test(s)) return (v.risiko || []).length > 0;
  if (/behov for sha-plan|sha-plan og behov/.test(s)) return k.vurdert;
  if (/koordinator for prosjektering/.test(s)) return !!O.kp || k.koord === false;
  if (/koordinator for utførelse/.test(s)) return !!O.ku || k.koord === false;
  if (/forhåndsmelding/.test(s)) return !!v.vurdering?.forhandsmeldt || k.fm === false;
  return false;
}

export function Sha({ v, set, p, fane, setFane }: { v: Rec; set: (x: Rec) => void; p: Rec; fane: ShaFane; setFane: (f: ShaFane) => void }) {
  const V: Rec = v.vurdering || {}; const setV = (x: Rec) => set({ vurdering: { ...V, ...x } });
  const O: Rec = v.org || {}; const setO = (x: Rec) => set({ org: { ...O, ...x } });
  const R: Rec[] = v.risiko || []; const k = shaKonklusjon(v, p);
  const leggTilRf = (navn: string[]) => set({ risiko: [...R, ...navn.filter(x => !R.some(r => r.aktivitet === x)).map(x => { const f = RISIKOFORHOLD.find(z => z[0] === x)!; return { id: uid(), aktivitet: f[0], fare: f[1], s: 'Middels', k: 'Høy', tiltak: f[2], ansvar: '', fase: 'Utførelse', status: 'Åpen' }; })] });
  const ref = useRef<HTMLDivElement>(null);
  return <div>
    <h3 className="pa-h">{tt("Sikkerhet, helse og arbeidsmiljø (byggherreforskriften)")}</h3>
    <div className="sha-tabs">{([['vurdering', '1 Vurdering av plikter'], ['risiko', `2 Risikovurdering (${R.length})`], ['org', '3 Koordinatorer og aktører'], ['plan', '4 SHA-plan']] as [ShaFane, string][]).map(([f, l]) => <button key={f} type="button" className={fane === f ? 'on' : ''} onClick={() => setFane(f)}>{l}</button>)}</div>

    {fane === 'vurdering' && <>
      <div className="sha-q"><span>{tt("Er arbeidet rutinemessig eller mindre omfattende vedlikehold?")} <Hjelp k="bhf_shaplan" /></span><JN v={V.vedlikehold} set={x => setV({ vedlikehold: x })} /></div>
      <div className="sha-q"><span>{tt("Blir det flere prosjekterende (rådgivere, arkitekt, entreprenørs prosjekterende)?")} <Hjelp k="bhf_kp" /></span><JN v={V.flereP ?? V.flere} set={x => setV({ flereP: x })} /></div>
      <div className="sha-q"><span>{tt("Blir det flere utførende virksomheter – samtidig eller etter hverandre (underentreprenører teller med)?")} <Hjelp k="bhf_ku" /></span><JN v={V.flereU ?? V.flere} set={x => setV({ flereU: x })} /></div>
      <div className="sha-q"><span>{tt("Forventet varighet og arbeidsmengde på byggeplassen")} <Hjelp k="bhf_forhandsmelding" />{k.dagerPlan ? <div className="small muted">{tt("Utførelsesfasen i fremdriftsplanen:")} {k.dagerPlan} {tt("virkedager")}</div> : null}</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><label className="small">{tt("Virkedager")} <input className="num" style={{ width: 70 }} value={V.dager ?? ''} placeholder={k.dagerPlan ? String(k.dagerPlan) : ''} onChange={e => setV({ dager: e.target.value })} /></label>
          <label className="small">{tt("Personer i snitt")} <input className="num" style={{ width: 60 }} value={V.personer ?? ''} onChange={e => setV({ personer: e.target.value })} /></label>
          <label className="small">{tt("eller dagsverk")} <input className="num" style={{ width: 70 }} value={V.dagsverk ?? ''} placeholder={k.dagsverk && !n(V.dagsverk) ? String(k.dagsverk) : ''} onChange={e => setV({ dagsverk: e.target.value })} /></label></div></div>
      <div style={{ padding: '8px 0' }}><span>{tt("Risikoforhold i prosjektet")} <Hjelp k="bhf_risiko" /> <span className="small muted">{tt("– kryss av det som er aktuelt, så kan det tas med i risikovurderingen")}</span></span>
        <div className="sha-rf">{RISIKOFORHOLD.map(([navn, fare]) => <label key={navn} title={fare}><input type="checkbox" checked={(V.rf || []).includes(navn)} onChange={e => setV({ rf: e.target.checked ? [...(V.rf || []), navn] : (V.rf || []).filter((x: string) => x !== navn) })} />{navn}</label>)}</div>
        {(V.rf || []).some((x: string) => !R.some(r => r.aktivitet === x)) && <button type="button" className="btn sm" onClick={() => { leggTilRf(V.rf); setFane('risiko'); }}>{tt("Lag risikovurdering av valgte forhold →")}</button>}</div>

      <div className="sha-konk"><b>{tt("Konklusjon")}</b>
        <div>{k.gjelder === false ? tt("○ Byggherreforskriften gjelder trolig ikke (rutinemessig/mindre vedlikehold). Begrunn vurderingen i notatet.") : k.gjelder ? tt("● Byggherreforskriften gjelder. Byggherren skal sørge for skriftlig SHA-plan før oppstart (§ 7) og ta risikoforhold med i tilbudsgrunnlaget (§ 6).") : tt("… Svar på spørsmålet om vedlikehold.")}</div>
        <div>{k.koord ? tt("● Koordinering kreves (§ 13): byggherren utpeker skriftlig koordinator for prosjekteringsfasen (KP) og for utførelsesfasen (KU) – byggherren kan selv ha rollen med nødvendig kompetanse.") : k.koord === false ? tt("○ Én prosjekterende og én utførende – koordinator kreves ikke, men byggherren har fortsatt oppfølgingsplikter (§ 14). Vurder på nytt hvis det kommer inn flere virksomheter.") : tt("… Svar på spørsmålene om flere prosjekterende og flere utførende.")}</div>
        <div>{k.fm ? <>{tt("● Forhåndsmelding til Arbeidstilsynet kreves (")}{k.dager ? tt("{0} virkedager", k.dager) : ''}{k.dager && k.dagsverk ? ', ' : ''}{k.dagsverk ? tt("{0} dagsverk", k.dagsverk) : ''}{tt("). Sendes i Altinn senest én uke før oppstart og henges opp på plassen (§ 10).")}</> : k.fm === false ? tt("○ Forhåndsmelding kreves ikke ({0} virkedager, {1} dagsverk – grensen er over 15 virkedager eller over 250 dagsverk).", k.dager || '?', k.dagsverk || '?') : tt("… Fyll inn varighet og arbeidsmengde.")}</div>
        {k.fm && <div style={{ marginTop: 6 }}><label className="small">{tt("Forhåndsmelding sendt dato")} <input type="date" value={V.forhandsmeldt || ''} onChange={e => setV({ forhandsmeldt: e.target.value })} /></label> <a className="small" href="https://www.altinn.no/" target="_blank" rel="noopener noreferrer">{tt("Altinn ↗")}</a> <span className="small muted">{tt("(søk «forhåndsmelding»)")}</span></div>}
      </div>
      <label className="pa-felt"><span>{tt("Begrunnelse / notat til vurderingen")}</span><textarea rows={2} value={V.notat || ''} onChange={e => setV({ notat: e.target.value })} /></label>
    </>}

    {fane === 'risiko' && <>
      <p className="small muted" style={{ marginTop: 0 }}>{tt("Vurder hver arbeidsoperasjon: hva kan skje, hvor sannsynlig og hvor alvorlig – og hvilke tiltak som reduserer risikoen. Rødt (6–9) krever særskilte tiltak i SHA-planen.")} <Hjelp k="bhf_risiko" /></p>
      <Rader v={R} set={x => set({ risiko: x })} tom="Ingen risikoforhold registrert ennå. Bruk hurtigvalgene under, eller legg til egne."
        ny={() => ({ aktivitet: '', fare: '', s: 'Middels', k: 'Middels', tiltak: '', ansvar: '', fase: 'Utførelse', status: 'Åpen' })}
        kol={[{ k: 'aktivitet', l: 'Arbeidsoperasjon', w: '15%', type: 'area' }, { k: 'fare', l: 'Fare / hva kan skje', type: 'area', w: '25%' }, { k: 's', l: 'Sanns.', type: 'select', opts: ['Lav', 'Middels', 'Høy'], w: 104 }, { k: 'k', l: 'Kons.', type: 'select', opts: ['Lav', 'Middels', 'Høy'], w: 104 },
          { k: 'tiltak', l: 'Tiltak', type: 'area', w: '26%' }, { k: 'ansvar', l: 'Ansvar', w: 90 }, { k: 'fase', l: 'Fase', type: 'select', opts: ['Prosjektering', 'Utførelse', 'Begge'], w: 96 }]} sumL="Risiko"
        sum={r => { const x = risikoNivaa({ sannsynlighet: r.s, konsekvens: r.k }); return <Chip c={x >= 6 ? 'red' : x >= 3 ? 'amber' : 'green'}>{x || '–'}</Chip>; }} />
      <div style={{ marginTop: 8 }}><span className="small muted">{tt("Hurtigvalg:")} </span>{RISIKOFORHOLD.filter(f => !R.some(r => r.aktivitet === f[0])).map(f => <button key={f[0]} type="button" className="btn ghost sm" title={f[1]} onClick={() => leggTilRf([f[0]])}>+ {f[0]}</button>)}</div>
    </>}

    {fane === 'org' && <>
      <div className="pa-grid">
        <label className="pa-felt half"><span>{tt("Byggherre")}</span><input value={O.byggherre ?? ''} placeholder={eNavn(p.eiendomId) ? tt("Eier av {0}", eNavn(p.eiendomId)) : ''} onChange={e => setO({ byggherre: e.target.value })} /></label>
        <label className="pa-felt half"><span>{tt("Byggherrens representant (skriftlig avtale)")}</span><input value={O.bhr || ''} placeholder={p.leder || ''} onChange={e => setO({ bhr: e.target.value })} /></label>
        <label className="pa-felt half"><span>{tt("Koordinator prosjektering (KP)")} <Hjelp k="bhf_kp" /></span><input value={O.kp || ''} placeholder={shaKonklusjon(v, p).koord === false ? tt("Ikke påkrevd") : tt("Navn, firma, telefon")} onChange={e => setO({ kp: e.target.value })} /></label>
        <label className="pa-felt half"><span>{tt("Koordinator utførelse (KU)")} <Hjelp k="bhf_ku" /></span><input value={O.ku || ''} placeholder={shaKonklusjon(v, p).koord === false ? tt("Ikke påkrevd") : tt("Navn, firma, telefon")} onChange={e => setO({ ku: e.target.value })} /></label>
        <label className="pa-felt half"><span>{tt("Koordinatoravtale signert dato")}</span><input type="date" value={O.avtale || ''} onChange={e => setO({ avtale: e.target.value })} /></label>
        <label className="pa-felt half"><span>{tt("Verneombud / hovedbedrift")}</span><input value={O.vo || ''} onChange={e => setO({ vo: e.target.value })} /></label>
      </div>
      <b className="small">{tt("Prosjekterende og utførende virksomheter")}</b>
      <Rader v={O.aktorer || []} set={x => setO({ aktorer: x })} tom="Legg til rådgivere, entreprenører og underentreprenører." ny={() => ({ virksomhet: '', rolle: '', kontakt: '', tlf: '' })}
        kol={[{ k: 'virksomhet', l: 'Virksomhet', w: '30%' }, { k: 'rolle', l: 'Rolle', dl: ['Prosjekterende', 'Hovedentreprenør', 'Totalentreprenør', 'Sideentreprenør', 'Underentreprenør', 'Rådgiver'] }, { k: 'kontakt', l: 'Kontaktperson' }, { k: 'tlf', l: 'Telefon' }]} />
    </>}

    {fane === 'plan' && <>
      <div className="pa-grid">
        <label className="pa-felt"><span>{tt("Krav til forebyggende tiltak på plassen (adkomst, orden, lagring, samordning, arbeidstider i bygg i drift)")}</span><textarea rows={3} value={v.plan?.tiltak || ''} placeholder={tt("F.eks. arbeidsområdet avsperres; støyende arbeid kl. 07–09 og etter kl. 16; adkomst via varemottak; leietakere varsles 5 virkedager før")} onChange={e => set({ plan: { ...(v.plan || {}), tiltak: e.target.value } })} /></label>
        <label className="pa-felt half"><span>{tt("Rutine for avvik og uønskede hendelser")}</span><textarea rows={2} value={v.plan?.avvik || ''} placeholder={tt("Meldes straks til KU og byggherre; registreres som avvik i appen")} onChange={e => set({ plan: { ...(v.plan || {}), avvik: e.target.value } })} /></label>
        <label className="pa-felt half"><span>{tt("Varsling ved ulykke")}</span><textarea rows={2} value={v.plan?.varsling || ''} placeholder={tt("113 / 110 / 112 – deretter anleggsleder, KU, byggherre. Alvorlige ulykker meldes Arbeidstilsynet og politiet.")} onChange={e => set({ plan: { ...(v.plan || {}), varsling: e.target.value } })} /></label>
      </div>
      <div className="pa-forhand"><div ref={ref}><ShaPlan v={v} p={p} /></div></div>
      <p><button type="button" className="btn" onClick={() => skrivUt(ref.current, `SHA-plan – ${p.navn}`)}>{tt("Skriv ut / lagre som PDF")}</button> <span className="small muted">{tt("Legges ved konkurransegrunnlaget")} <Hjelp k="bhf_tilbud" /> {tt("og oppdateres etter kontrahering.")}</span></p>
    </>}
  </div>;
}

export function ShaPlan({ v, p }: { v: Rec; p: Rec }) {
  const O: Rec = v.org || {}; const R: Rec[] = v.risiko || []; const k = shaKonklusjon(v, p); const e = byId('eiendommer', p.eiendomId);
  const nivaa = (r: Rec) => risikoNivaa({ sannsynlighet: r.s, konsekvens: r.k });
  return <div className="rap"><style>{RAP_CSS}</style>
    <div className="meta">{eNavn(p.eiendomId)}{e?.adresse ? ' · ' + e.adresse : ''}</div>
    <h1>{tt("Byggherrens SHA-plan")}</h1>
    <div><b>{p.navn}</b> <span className="meta">{tt("· plan for sikkerhet, helse og arbeidsmiljø etter byggherreforskriften §§ 7–8 · utarbeidet")} {fd(today())}</span></div>
    <h2>{tt("1. Prosjektet")}</h2><p className="pre">{p.beskrivelse || p.arbeid?.beskrivelse?.mal || p.arbeid?.beskrivelse?.bakgrunn || '–'}</p>
    <table><tbody>
      <tr><td>{tt("Planlagt periode")}</td><td>{p.start ? tt("{0} – {1}", fd(p.start), fd(p.slutt)) : '–'}</td></tr>
      <tr><td>{tt("Forventet varighet utførelse")}</td><td>{k.dager ? tt("{0} virkedager", k.dager) : '–'}{k.dagsverk ? tt(", ca. {0} dagsverk", k.dagsverk) : ''}</td></tr>
      <tr><td>{tt("Forhåndsmelding (§ 10)")}</td><td>{k.fm ? (v.vurdering?.forhandsmeldt ? tt("Sendt {0}", fd(v.vurdering.forhandsmeldt)) : tt("Kreves – ikke sendt ennå")) : k.fm === false ? tt("Ikke påkrevd") : tt("Ikke vurdert")}</td></tr>
    </tbody></table>
    <h2>{tt("2. Organisering")}</h2><table><tbody>
      <tr><td>{tt("Byggherre")}</td><td>{O.byggherre || '–'}</td></tr><tr><td>{tt("Byggherrens representant")}</td><td>{O.bhr || p.leder || '–'}</td></tr>
      <tr><td>{tt("Koordinator prosjektering (KP)")}</td><td>{O.kp || (k.koord === false ? tt("Ikke påkrevd") : '–')}</td></tr><tr><td>{tt("Koordinator utførelse (KU)")}</td><td>{O.ku || (k.koord === false ? tt("Ikke påkrevd") : '–')}</td></tr>
      {O.vo && <tr><td>{tt("Verneombud / hovedbedrift")}</td><td>{O.vo}</td></tr>}
      {(O.aktorer || []).map((a: Rec, i: number) => <tr key={i}><td>{a.rolle || tt("Virksomhet")}</td><td>{a.virksomhet}{a.kontakt ? tt(" – {0}", a.kontakt) : ''}{a.tlf ? tt(", {0}", a.tlf) : ''}</td></tr>)}
    </tbody></table>
    <h2>{tt("3. Fremdrift")}</h2><table><tbody>{(p.faser || []).filter((f: Rec) => f.start).map((f: Rec) => <tr key={f.k}><td>{FASER.find(x => x[0] === f.k)?.[1]}</td><td>{fd(f.start)} – {fd(f.slutt)}</td></tr>)}</tbody></table>
    <p className="meta">{tt("Byggherren skal sikre at det avsettes nok tid til de enkelte arbeidsoperasjonene. Detaljert fremdriftsplan fra entreprenør legges ved når den foreligger.")}</p>
    <h2>{tt("4. Risikoforhold og tiltak (§ 8)")}</h2>
    {R.length ? <table><thead><tr><th>{tt("Arbeidsoperasjon")}</th><th>{tt("Fare")}</th><th className="n">{tt("Risiko")}</th><th>{tt("Tiltak")}</th><th>{tt("Ansvar")}</th></tr></thead><tbody>
      {[...R].sort((a, b) => nivaa(b) - nivaa(a)).map((r, i) => <tr key={i}><td>{r.aktivitet}<div className="meta">{r.fase}</div></td><td className="pre">{r.fare}</td><td className="n" style={{ color: nivaa(r) >= 6 ? '#c0392b' : nivaa(r) >= 3 ? '#b7791f' : '#2f7d4f', fontWeight: 700 }}>{nivaa(r)}</td><td className="pre">{r.tiltak}</td><td>{r.ansvar}</td></tr>)}</tbody></table>
      : <p className="meta">{tt("Risikovurdering er ikke gjennomført.")}</p>}
    <p className="meta">{tt("Risiko = sannsynlighet × konsekvens (1–3 hver). 6–9: særskilte tiltak før arbeidet starter.")}</p>
    {v.plan?.tiltak && <><h2>{tt("5. Forebyggende tiltak på bygge- eller anleggsplassen (§ 9)")}</h2><p className="pre">{v.plan.tiltak}</p></>}
    <h2>{v.plan?.tiltak ? 6 : 5}{tt(". Avvik, endringer og varsling")}</h2>
    <p className="pre">{v.plan?.avvik || tt("Avvik fra SHA-planen og uønskede hendelser meldes straks til koordinator for utførelse og byggherren.")}</p>
    <p className="pre">{v.plan?.varsling || tt("Ved ulykke: varsle 113 / 110 / 112, deretter anleggsleder, KU og byggherre. Alvorlige arbeidsulykker meldes straks Arbeidstilsynet og politiet.")}</p>
    <p className="meta">{tt("Planen oppdateres ved endringer, første gang etter kontrahering, og gjøres kjent for alle arbeidsgivere og enmannsbedrifter. De utførende skal innarbeide relevante deler i egne planer.")}</p>
    {v.vurdering?.notat && <><h2>{tt("Vedlegg: byggherrens vurdering")}</h2><p className="pre">{v.vurdering.notat}</p></>}
  </div>;
}
