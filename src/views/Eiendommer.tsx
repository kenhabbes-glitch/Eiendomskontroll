import { importerSystemer } from './SystemImport';
import React, { useState } from 'react';
import { Hjelp } from '../components/Hjelp';
import { AV_LUKKET, DOK_PAAKREVD } from '../lib/catalog';
import { eierRapport } from './EierRapport';
import { capexRapport } from './CapexRapport';
import { verdiModal } from './Verdivurdering';
import { harModul } from '../lib/moduler';
import { S, canEdit, isAdmin, isPlattform, orgNavn, useStore, mineOrg, kanDrifteE } from '../lib/store';
import { Befaringer, nyBefaringDialog } from './Befaring';
import { activeTasks, byId, dUntil, openAvvik, sortBy } from '../lib/utils';
import { autoTfm, editAnlegg, editAvvik, editDok, editEiendom, editKomponent, editLeietaker, editOppgave, generatePlan, importTfm, visOppgave } from '../lib/actions';
import { AvvikTable, CoverageTable, DokTable, LeieTable, ServiceavtaleTable, TaskTable, TfmTree } from '../components/tables';
import { Chip, DueChip, Empty } from '../components/ui';
import { ArealSection } from './Arealer';
import { BrannvernSection, bvStatus, mangelAnsvarlig, aktiveMidl } from '../lib/brannvern';
import { kartUrl, seEiendomUrl, enhetStatus } from '../lib/oppslag';
import { tt } from '../lib/i18n';

const go = (p: string) => { location.hash = '#/' + p; };

export function Eiendommer() {
  useStore();
  const [fk, setFk] = useState(''); const [fp, setFp] = useState('');
  const kunder = [...new Set(S.eiendommer.map(e => e.eierOrgId || ''))]; const flereKunder = kunder.length > 1;
  const portNavn = (id?: string) => S.portefoljer.find(p => p.id === id)?.navn || '';
  const ports = sortBy(S.portefoljer.filter(p => S.eiendommer.some(e => e.portefoljeId === p.id) && (!fk || p.eierOrgId === fk || p.eier_org_id === fk)), p => p.navn);
  const L = sortBy(S.eiendommer.filter(e => (!fk || (e.eierOrgId || '') === fk) && (!fp || (fp === '-' ? !e.portefoljeId : e.portefoljeId === fp))), e => (flereKunder ? orgNavn(e.eierOrgId) + '|' : '') + e.navn);
  const kort = (e: any) => { const f = activeTasks().filter(o => o.eiendomId === e.id && (dUntil(o.nesteFrist) as number) < 0).length; const a = openAvvik().filter(x => x.eiendomId === e.id); const kh = a.filter(x => x.alv === 'Kritisk' || x.alv === 'Høy').length;
    return <div key={e.id} className="card prop" onClick={() => go('eiendom/' + e.id)}>
      <div className="t">{e.navn}</div><div className="a">{[e.adresse, e.poststed].filter(Boolean).join(', ') || '–'}</div>
      {(fk && flereKunder || e.portefoljeId) && <div className="small muted" style={{ marginTop: 2 }}>{[fk && flereKunder ? orgNavn(e.eierOrgId) || 'Uten kunde' : '', e.portefoljeId ? 'Portefølje: ' + portNavn(e.portefoljeId) : ''].filter(Boolean).join(' · ')}</div>}
      <div className="row">{e.kategori && <span className="tag">{e.kategori}</span>}{e.byggeaar && <span className="tag">{tt("Bygget")} {e.byggeaar}</span>}{e.bta && <span className="tag">{e.bta} m²</span>}{e.tfmBygg && <span className="tag mono">+{e.tfmBygg}</span>}</div>
      <div className="row" style={{ marginTop: 10 }}>{f ? <Chip c="red">{f} {tt("forfalte")}</Chip> : <Chip c="green">{tt("Ingen forfalte")}</Chip>}{a.length > 0 && <Chip c={kh ? 'red' : 'amber'}>{a.length} {tt("åpne avvik")}</Chip>}</div>
    </div>; };
  const grupper: [string, any[]][] = flereKunder && !fk ? [...new Set(L.map(e => e.eierOrgId || ''))].map(k => [k, L.filter(e => (e.eierOrgId || '') === k)]) : [['', L]];
  return <>
    <div className="head"><div className="grow"><h1>{tt("Eiendommer")}<Hjelp id="side.eiendommer" /></h1><p className="sub">{S.eiendommer.length} {tt("eiendommer")}</p></div>{(isAdmin() || mineOrg(['admin', 'forvalter']).length > 0) && <button className="btn" onClick={() => importerSystemer()}>{tt("Importer systemer fra Excel")}</button>}{isAdmin() && <button className="btn pri" onClick={() => editEiendom()}>{tt("+ Ny eiendom")}</button>}</div>
    {(flereKunder || ports.length > 0) && S.eiendommer.length > 0 && <div className="toolbar" style={{ marginBottom: 12, gap: 8 }}>
      {flereKunder && <select value={fk} onChange={e => { setFk(e.target.value); setFp(''); }}><option value="">{tt("Alle kunder (")}{kunder.length})</option>{sortBy(kunder, k => orgNavn(k)).map(k => <option key={k} value={k}>{orgNavn(k) || tt("Uten kunde")} ({S.eiendommer.filter(e => (e.eierOrgId || '') === k).length})</option>)}</select>}
      {(ports.length > 0) && <select value={fp} onChange={e => setFp(e.target.value)}><option value="">{tt("Alle porteføljer")}</option>{ports.map(p => <option key={p.id} value={p.id}>{p.navn}{flereKunder && !fk ? tt(" ({0})", orgNavn(p.eierOrgId || p.eier_org_id)) : ''}</option>)}<option value="-">{tt("Uten portefølje")}</option></select>}
      <span className="small muted">{L.length} {tt("vist")}</span></div>}
    {S.eiendommer.length ? grupper.map(([k, G]) => <React.Fragment key={k || 'x'}>{grupper.length > 1 && <h2 style={{ margin: '14px 0 8px' }}>{orgNavn(k) || tt("Uten kunde")} <span className="muted small">{G.length} {tt("eiendom")}{G.length === 1 ? '' : tt("mer")}</span></h2>}<div className="props">{G.map(kort)}</div></React.Fragment>)
      : <div className="card"><Empty t="Ingen eiendommer">{isAdmin() ? tt("Registrer den første eiendommen.") : tt("Du har ikke fått tilgang til noen eiendommer ennå.")}</Empty></div>}
  </>;
}

const tabMem: Record<string, string> = {};
export function Eiendom({ id }: { id: string }) {
  useStore();
  const [tab, setTabS] = useState(tabMem.e || 'info'); const setTab = (t: string) => { tabMem.e = t; setTabS(t); };
  const [q, setQ] = useState('');
  const e = byId('eiendommer', id); const ed = canEdit();
  if (!e) return <Empty t="Fant ikke eiendommen"><a href="#/eiendommer">{tt("Tilbake")}</a></Empty>;
  const T = S.oppgaver.filter(o => o.eiendomId === id); const A = S.avvik.filter(a => a.eiendomId === id); const D = S.dokumenter.filter(d => d.eiendomId === id); const AN = S.anlegg.filter(a => a.eiendomId === id); const L = S.leietakere.filter(l => l.eiendomId === id);
  const tabs: [string, string, number | ''][] = [['info', 'Oversikt', ''], ['anlegg', 'Systemer og komponenter (TFM)', AN.length], ['kontroll', 'Kontrollplan', T.filter(o => o.aktiv !== false).length], ['avvik', 'Avvik', A.filter(a => !AV_LUKKET.includes(a.status)).length], ['dok', 'Dokumenter', D.length]];
  if (harModul('brannvern', id)) tabs.push(['brann', 'Brannvern', ed ? L.filter(l => bvStatus(l).o >= 1 || mangelAnsvarlig(l)).length + aktiveMidl(e).length || '' : aktiveMidl(e).length || '']);
  if (ed) tabs.push(['leie', 'Leietakere', L.length]);
  tabs.push(['areal', 'Tegninger og arealer', S.tegninger.filter(t => t.eiendomId === id).length]);
  if (harModul('befaring', id) && kanDrifteE(id)) tabs.push(['bef', 'Befaringer', S.befaringer.filter(b => b.eiendomId === id).length]);
  const cur = tabs.some(t => t[0] === tab) ? tab : 'info';
  let c: React.ReactNode = null;
  if (cur === 'info') {
    const dl: [string, any][] = ([['Adresse', [e.adresse, e.poststed].filter(Boolean).join(', ')], ['Kommune', e.kommune], ['Gnr./bnr.', e.gnrbnr ? <>{e.gnrbnr}{e.kommunenummer ? <span className="muted"> {tt("· knr.")} {e.kommunenummer}</span> : null}{seEiendomUrl(e) && <> · <a href={seEiendomUrl(e)} target="_blank" rel="noopener noreferrer">{tt("Se eiendom")}</a></>}{kartUrl(e) && <> · <a href={kartUrl(e)} target="_blank" rel="noopener noreferrer">{tt("Kart")}</a></>}</> : ''],
      ['Kunde i appen', S.eiendommer.some(x => x.eierOrgId !== e.eierOrgId) || isPlattform() ? orgNavn(e.eierOrgId) : ''], ['Portefølje', S.portefoljer.find(p => p.id === e.portefoljeId)?.navn || ''],
      ['Eier', e.eierNavn ? <>{e.eierNavn}{e.eierOrgnr ? <span className="muted mono small"> {e.eierOrgnr}</span> : null}{e.eierBrreg && enhetStatus(e.eierBrreg).c !== 'green' && <> <Chip c="red">{enhetStatus(e.eierBrreg).t}</Chip></>}</> : ''], ['TFM byggnummer', e.tfmBygg ? '+' + e.tfmBygg : ''], ['Kategori', e.kategori], ['Byggeår', e.byggeaar], ['Rehabilitert', e.rehabaar], ['BTA', e.bta ? e.bta + ' m²' : ''], ['Etasjer', e.etasjer], ['Risikoklasse', e.risikoklasse], ['Brannklasse', e.brannklasse], ['Energikarakter', e.energimerke], ['Tilsynsobjekt brann', e.tilsyn], ['Driftsansvarlig', e.driftsansvarlig], ['Brannansvarlig (eier)', e.brannansvarlig], ['Forsikring', ed ? e.forsikring : ''], ['Kontakt for leietakere', e.kontaktLeietaker]] as [string, any][]).filter(x => x[1]);
    const f = T.filter(o => o.aktiv !== false && (dUntil(o.nesteFrist) as number) < 0); const nx = sortBy(T.filter(o => o.aktiv !== false && (dUntil(o.nesteFrist) as number) >= 0), o => o.nesteFrist).slice(0, 6);
    const staff = S.profiles.filter(p => S.tilganger.some(t => t.user_id === p.id && t.eiendom_id === id));
    c = <><div className="grid g2">
      <div className="card"><h2>{tt("Eiendomsdata")}</h2>{dl.length ? <dl className="dl">{dl.map(([k, v]) => <React.Fragment key={k}><dt>{tt(k)}</dt><dd>{v}</dd></React.Fragment>)}</dl> : <p className="muted">{tt("Ingen detaljer registrert.")}</p>}{e.notat && <p className="small" style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>{e.notat}</p>}
        {isAdmin() && <p className="small muted" style={{ marginBottom: 0 }}>{tt("Tilgang:")} {staff.length ? staff.map(p => p.navn || p.epost).join(', ') : tt("bare administratorer")} · <a href="#/brukere">{tt("Endre")}</a></p>}</div>
      <div className="card"><h2>{tt("Kontroller")}</h2>{f.length > 0 && <p style={{ marginTop: 0 }}><Chip c="red">{f.length} {tt("forfalte")}</Chip></p>}
        {T.length ? <div className="list">{[...f, ...nx].slice(0, 8).map(o => <div key={o.id} className="li" onClick={() => visOppgave(o.id)}><DueChip s={o.nesteFrist} /><div className="grow"><div className="lt">{o.navn}</div></div></div>)}</div>
          : <><p className="muted">{tt("Ingen kontrollplan ennå.")}</p>{ed && <button className="btn pri sm" onClick={() => generatePlan(id)}>{tt("Generer kontrollplan")}</button>}</>}</div></div>
      {ed && <div className="sec"><h2>{tt("Dokumentdekning")}</h2><CoverageTable es={[e]} /></div>}</>;
  }
  if (cur === 'anlegg') c = <>
    <div className="toolbar">{ed && <><button className="btn pri" onClick={() => editAnlegg(undefined, id)}>{tt("+ System / bygningsdel")}</button><button className="btn" onClick={() => importerSystemer(id)}>{tt("Importer fra Excel")}</button><button className="btn" onClick={() => importTfm(id)}>{tt("Importer TFM-liste")}</button>
      {AN.some(a => !a.tfmSys) && <button className="btn" onClick={() => autoTfm(id)}>{tt("Tildel TFM-koder automatisk (")}{AN.filter(a => !a.tfmSys).length})</button>}</>}
      <input type="search" placeholder={tt("Søk kode, navn, fabrikat …")} value={q} onChange={ev => setQ(ev.target.value)} style={{ marginLeft: 'auto' }} /></div>
    <p className="small muted" style={{ margin: '-4px 0 10px' }}>{e.tfmBygg ? <>{tt("Byggnummer")} <span className="mono">+{e.tfmBygg}</span> · </> : ed ? tt("Ingen TFM byggnummer satt (rediger eiendommen) · ") : ''}{AN.length} {tt("systemer ·")} {S.komponenter.filter(k => k.eiendomId === id).length} {tt("komponenter · levetider er veiledende")}<Hjelp id="side.eiendom.tfm" /></p>
    <TfmTree list={AN} q={q} eid={id} onDok={() => setTab('dok')} onNewKomp={aid => editKomponent(undefined, aid)} /></>;
  if (cur === 'kontroll') c = <>{ed && <div className="toolbar"><button className="btn pri" onClick={() => generatePlan(id)}>{tt("Generer / utvid kontrollplan")}</button><Hjelp id="kontroller.generer" /><button className="btn" onClick={() => editOppgave(undefined, { eiendomId: id })}>{tt("+ Egen kontroll/oppgave")}</button></div>}
    <TaskTable list={T.filter(o => o.aktiv !== false)} showE={false} />{T.some(o => o.aktiv === false) && <p className="small muted">{T.filter(o => o.aktiv === false).length} {tt("inaktive kontroller skjult.")}</p>}</>;
  if (cur === 'avvik') c = <><div className="toolbar"><button className="btn pri" onClick={() => editAvvik(undefined, { eiendomId: id })}>{tt("+ Nytt avvik")}</button></div><AvvikTable list={A} showE={false} /></>;
  if (cur === 'dok') c = <><div className="toolbar"><button className="btn pri" onClick={() => editDok(undefined, { eiendomId: id })}>{tt("+ Dokument")}</button></div>{ed && <CoverageTable es={[e]} />}<div className="sec"><h2>{tt("Serviceavtaler for systemer")}</h2><ServiceavtaleTable es={[e]} showE={false} visAnb /></div><div className="sec"><h2>{tt("Alle dokumenter")}</h2><DokTable list={D} showE={false} /></div></>;
  if (cur === 'leie') c = <><div className="toolbar"><button className="btn pri" onClick={() => editLeietaker(undefined, { eiendomId: id })}>{tt("+ Leietaker")}</button></div><LeieTable list={L} showE={false} /></>;
  if (cur === 'areal') c = <ArealSection eid={id} />;
  if (cur === 'brann') c = <BrannvernSection eid={id} />;
  if (cur === 'bef') c = <><div className="toolbar"><button className="btn pri" onClick={() => nyBefaringDialog({ eiendomId: id })}>{tt("+ Ny befaring")}</button></div><Befaringer eiendomId={id} kompakt /></>;
  return <>
    <p className="small" style={{ margin: '0 0 6px' }}><a href="#/eiendommer">{tt("← Eiendommer")}</a></p>
    <div className="head"><div className="grow"><h1>{e.navn}</h1><p className="sub">{[e.adresse, e.poststed, e.kategori].filter(Boolean).join(' · ')}</p></div>{ed && harModul('rapporter', id) && <button className="btn" onClick={() => verdiModal(id)} title={tt("Enkelt verdianslag etter avkastningsmetoden")}>{tt("Verdivurdering")}</button>}{ed && harModul('vedlikehold', id) && <button className="btn" onClick={() => capexRapport(id)} title={tt("Utskiftingsbehov og langtidsvedlikehold for valgfri periode")}>{tt("Capex-rapport")}</button>}{ed && harModul('rapporter', id) && <button className="btn" onClick={() => eierRapport(id)} title={tt("Status på eiers lovpålagte oppgaver og dokumenter")}>{tt("Statusrapport til eier")}</button>}{ed && <button className="btn" onClick={() => editEiendom(id)}>{tt("Rediger")}</button>}<button className="btn" onClick={() => editAvvik(undefined, { eiendomId: id })}>{tt("+ Avvik")}</button></div>
    <div className="tabs">{tabs.map(([k, l, n]) => <a key={k} className={cur === k ? 'on' : ''} onClick={() => setTab(k)}>{tt(l)}{n !== '' && <span className="c">{n}</span>}</a>)}</div>
    {c}
  </>;
}
