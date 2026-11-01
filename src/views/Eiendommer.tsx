import React, { useState } from 'react';
import { Hjelp } from '../components/Hjelp';
import { AV_LUKKET, DOK_PAAKREVD } from '../lib/catalog';
import { S, canEdit, isAdmin, useStore } from '../lib/store';
import { activeTasks, byId, dUntil, openAvvik, sortBy } from '../lib/utils';
import { autoTfm, editAnlegg, editAvvik, editDok, editEiendom, editKomponent, editLeietaker, editOppgave, generatePlan, importTfm, visOppgave } from '../lib/actions';
import { AvvikTable, CoverageTable, DokTable, LeieTable, ServiceavtaleTable, TaskTable, TfmTree } from '../components/tables';
import { Chip, DueChip, Empty } from '../components/ui';
import { ArealSection } from './Arealer';
import { kartUrl, seEiendomUrl, enhetStatus } from '../lib/oppslag';

const go = (p: string) => { location.hash = '#/' + p; };

export function Eiendommer() {
  useStore();
  return <>
    <div className="head"><div className="grow"><h1>Eiendommer<Hjelp id="side.eiendommer" /></h1><p className="sub">{S.eiendommer.length} eiendommer</p></div>{isAdmin() && <button className="btn pri" onClick={() => editEiendom()}>+ Ny eiendom</button>}</div>
    {S.eiendommer.length ? <div className="props">{sortBy(S.eiendommer, e => e.navn).map(e => {
      const f = activeTasks().filter(o => o.eiendomId === e.id && (dUntil(o.nesteFrist) as number) < 0).length; const a = openAvvik().filter(x => x.eiendomId === e.id); const kh = a.filter(x => x.alv === 'Kritisk' || x.alv === 'Høy').length;
      return <div key={e.id} className="card prop" onClick={() => go('eiendom/' + e.id)}>
        <div className="t">{e.navn}</div><div className="a">{[e.adresse, e.poststed].filter(Boolean).join(', ') || '–'}</div>
        <div className="row">{e.kategori && <span className="tag">{e.kategori}</span>}{e.byggeaar && <span className="tag">Bygget {e.byggeaar}</span>}{e.bta && <span className="tag">{e.bta} m²</span>}{e.tfmBygg && <span className="tag mono">+{e.tfmBygg}</span>}</div>
        <div className="row" style={{ marginTop: 10 }}>{f ? <Chip c="red">{f} forfalte</Chip> : <Chip c="green">Ingen forfalte</Chip>}{a.length > 0 && <Chip c={kh ? 'red' : 'amber'}>{a.length} åpne avvik</Chip>}</div>
      </div>; })}</div> : <div className="card"><Empty t="Ingen eiendommer">{isAdmin() ? 'Registrer den første eiendommen.' : 'Du har ikke fått tilgang til noen eiendommer ennå.'}</Empty></div>}
  </>;
}

const tabMem: Record<string, string> = {};
export function Eiendom({ id }: { id: string }) {
  useStore();
  const [tab, setTabS] = useState(tabMem.e || 'info'); const setTab = (t: string) => { tabMem.e = t; setTabS(t); };
  const [q, setQ] = useState('');
  const e = byId('eiendommer', id); const ed = canEdit();
  if (!e) return <Empty t="Fant ikke eiendommen"><a href="#/eiendommer">Tilbake</a></Empty>;
  const T = S.oppgaver.filter(o => o.eiendomId === id); const A = S.avvik.filter(a => a.eiendomId === id); const D = S.dokumenter.filter(d => d.eiendomId === id); const AN = S.anlegg.filter(a => a.eiendomId === id); const L = S.leietakere.filter(l => l.eiendomId === id);
  const tabs: [string, string, number | ''][] = [['info', 'Oversikt', ''], ['anlegg', 'Systemer og komponenter (TFM)', AN.length], ['kontroll', 'Kontrollplan', T.filter(o => o.aktiv !== false).length], ['avvik', 'Avvik', A.filter(a => !AV_LUKKET.includes(a.status)).length], ['dok', 'Dokumenter', D.length]];
  if (ed) tabs.push(['leie', 'Leietakere', L.length]);
  tabs.push(['areal', 'Tegninger og arealer', S.tegninger.filter(t => t.eiendomId === id).length]);
  const cur = tabs.some(t => t[0] === tab) ? tab : 'info';
  let c: React.ReactNode = null;
  if (cur === 'info') {
    const dl: [string, any][] = ([['Adresse', [e.adresse, e.poststed].filter(Boolean).join(', ')], ['Kommune', e.kommune], ['Gnr./bnr.', e.gnrbnr ? <>{e.gnrbnr}{e.kommunenummer ? <span className="muted"> · knr. {e.kommunenummer}</span> : null}{seEiendomUrl(e) && <> · <a href={seEiendomUrl(e)} target="_blank" rel="noopener noreferrer">Se eiendom</a></>}{kartUrl(e) && <> · <a href={kartUrl(e)} target="_blank" rel="noopener noreferrer">Kart</a></>}</> : ''],
      ['Eier', e.eierNavn ? <>{e.eierNavn}{e.eierOrgnr ? <span className="muted mono small"> {e.eierOrgnr}</span> : null}{e.eierBrreg && enhetStatus(e.eierBrreg).c !== 'green' && <> <Chip c="red">{enhetStatus(e.eierBrreg).t}</Chip></>}</> : ''], ['TFM byggnummer', e.tfmBygg ? '+' + e.tfmBygg : ''], ['Kategori', e.kategori], ['Byggeår', e.byggeaar], ['Rehabilitert', e.rehabaar], ['BTA', e.bta ? e.bta + ' m²' : ''], ['Etasjer', e.etasjer], ['Risikoklasse', e.risikoklasse], ['Brannklasse', e.brannklasse], ['Energikarakter', e.energimerke], ['Tilsynsobjekt brann', e.tilsyn], ['Driftsansvarlig', e.driftsansvarlig], ['Brannansvarlig (eier)', e.brannansvarlig], ['Forsikring', ed ? e.forsikring : ''], ['Kontakt for leietakere', e.kontaktLeietaker]] as [string, any][]).filter(x => x[1]);
    const f = T.filter(o => o.aktiv !== false && (dUntil(o.nesteFrist) as number) < 0); const nx = sortBy(T.filter(o => o.aktiv !== false && (dUntil(o.nesteFrist) as number) >= 0), o => o.nesteFrist).slice(0, 6);
    const staff = S.profiles.filter(p => S.tilganger.some(t => t.user_id === p.id && t.eiendom_id === id));
    c = <><div className="grid g2">
      <div className="card"><h2>Eiendomsdata</h2>{dl.length ? <dl className="dl">{dl.map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}</dl> : <p className="muted">Ingen detaljer registrert.</p>}{e.notat && <p className="small" style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>{e.notat}</p>}
        {isAdmin() && <p className="small muted" style={{ marginBottom: 0 }}>Tilgang: {staff.length ? staff.map(p => p.navn || p.epost).join(', ') : 'bare administratorer'} · <a href="#/brukere">Endre</a></p>}</div>
      <div className="card"><h2>Kontroller</h2>{f.length > 0 && <p style={{ marginTop: 0 }}><Chip c="red">{f.length} forfalte</Chip></p>}
        {T.length ? <div className="list">{[...f, ...nx].slice(0, 8).map(o => <div key={o.id} className="li" onClick={() => visOppgave(o.id)}><DueChip s={o.nesteFrist} /><div className="grow"><div className="lt">{o.navn}</div></div></div>)}</div>
          : <><p className="muted">Ingen kontrollplan ennå.</p>{ed && <button className="btn pri sm" onClick={() => generatePlan(id)}>Generer kontrollplan</button>}</>}</div></div>
      {ed && <div className="sec"><h2>Dokumentdekning</h2><CoverageTable es={[e]} /></div>}</>;
  }
  if (cur === 'anlegg') c = <>
    <div className="toolbar">{ed && <><button className="btn pri" onClick={() => editAnlegg(undefined, id)}>+ System / bygningsdel</button><button className="btn" onClick={() => importTfm(id)}>Importer TFM-liste</button>
      {AN.some(a => !a.tfmSys) && <button className="btn" onClick={() => autoTfm(id)}>Tildel TFM-koder automatisk ({AN.filter(a => !a.tfmSys).length})</button>}</>}
      <input type="search" placeholder="Søk kode, navn, fabrikat …" value={q} onChange={ev => setQ(ev.target.value)} style={{ marginLeft: 'auto' }} /></div>
    <p className="small muted" style={{ margin: '-4px 0 10px' }}>{e.tfmBygg ? <>Byggnummer <span className="mono">+{e.tfmBygg}</span> · </> : ed ? 'Ingen TFM byggnummer satt (rediger eiendommen) · ' : ''}{AN.length} systemer · {S.komponenter.filter(k => k.eiendomId === id).length} komponenter · levetider er veiledende<Hjelp id="side.eiendom.tfm" /></p>
    <TfmTree list={AN} q={q} eid={id} onDok={() => setTab('dok')} onNewKomp={aid => editKomponent(undefined, aid)} /></>;
  if (cur === 'kontroll') c = <>{ed && <div className="toolbar"><button className="btn pri" onClick={() => generatePlan(id)}>Generer / utvid kontrollplan</button><Hjelp id="kontroller.generer" /><button className="btn" onClick={() => editOppgave(undefined, { eiendomId: id })}>+ Egen kontroll/oppgave</button></div>}
    <TaskTable list={T.filter(o => o.aktiv !== false)} showE={false} />{T.some(o => o.aktiv === false) && <p className="small muted">{T.filter(o => o.aktiv === false).length} inaktive kontroller skjult.</p>}</>;
  if (cur === 'avvik') c = <><div className="toolbar"><button className="btn pri" onClick={() => editAvvik(undefined, { eiendomId: id })}>+ Nytt avvik</button></div><AvvikTable list={A} showE={false} /></>;
  if (cur === 'dok') c = <><div className="toolbar"><button className="btn pri" onClick={() => editDok(undefined, { eiendomId: id })}>+ Dokument</button></div>{ed && <CoverageTable es={[e]} />}<div className="sec"><h2>Serviceavtaler for systemer</h2><ServiceavtaleTable es={[e]} showE={false} visAnb /></div><div className="sec"><h2>Alle dokumenter</h2><DokTable list={D} showE={false} /></div></>;
  if (cur === 'leie') c = <><div className="toolbar"><button className="btn pri" onClick={() => editLeietaker(undefined, { eiendomId: id })}>+ Leietaker</button></div><LeieTable list={L} showE={false} /></>;
  if (cur === 'areal') c = <ArealSection eid={id} />;
  return <>
    <p className="small" style={{ margin: '0 0 6px' }}><a href="#/eiendommer">← Eiendommer</a></p>
    <div className="head"><div className="grow"><h1>{e.navn}</h1><p className="sub">{[e.adresse, e.poststed, e.kategori].filter(Boolean).join(' · ')}</p></div>{ed && <button className="btn" onClick={() => editEiendom(id)}>Rediger</button>}<button className="btn" onClick={() => editAvvik(undefined, { eiendomId: id })}>+ Avvik</button></div>
    <div className="tabs">{tabs.map(([k, l, n]) => <a key={k} className={cur === k ? 'on' : ''} onClick={() => setTab(k)}>{l}{n !== '' && <span className="c">{n}</span>}</a>)}</div>
    {c}
  </>;
}
