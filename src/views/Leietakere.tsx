import React from 'react';
import { harModul } from '../lib/moduler';
import { kanRedigereE, kanDrifteE } from '../lib/store';
import { Leieforlop } from './Befaring';
import { Hjelp } from '../components/Hjelp';
import { DOK_LEIE } from '../lib/catalog';
import { AnsvarKort } from './Kontrakt';
import { BrannvernKort } from '../lib/brannvern';
import { finnMal, kontraktKey, pliktKeysFor } from '../lib/kontrakt';
import { S, isAdmin, useStore } from '../lib/store';
import { leieAreal, byId, eNavn, fd, intTxt, m2, pliktStatus } from '../lib/utils';
import { bekreftPlikt, brev, editAvvik, editDok, editLeietaker, nyPlikt, setMatrise, leggTilStandardPlikter } from '../lib/actions';
import { PLIKTER, STD_PLIKTER } from '../lib/catalog';
import { sendSjekkliste, vurderPlikt, importerPakke } from './Sjekkliste';
import { pliktVis } from '../lib/utils';
import { AvvikTable, DokTable, LeieTable, TaskTable } from '../components/tables';
import { Chip, Empty, FileLink } from '../components/ui';
import { Search, Sel, eiendomOpts, useFilter } from './common';
import { inviter } from './Brukere';
import { brregData, enhetStatus, rensOrgnr } from '../lib/oppslag';
import { save, toast, canEdit } from '../lib/store';
import { confirmBox } from '../components/ui';
import { tt } from '../lib/i18n';

async function oppdaterBrreg(l: any, stille = false) {
  if (rensOrgnr(l.orgnr || '').length !== 9) { if (!stille) toast(tt("Leietakeren mangler gyldig org.nr.")); return null; }
  const b = await brregData(l.orgnr).catch(() => null);
  if (!b) { if (!stille) toast(tt("Fant ikke org.nr. i Enhetsregisteret")); return null; }
  await save('leietakere', { ...l, brreg: b }); if (!stille) toast(tt("Oppdatert fra Brønnøysundregistrene")); return b;
}
async function sjekkAlle(L: any[]) {
  const med = L.filter(l => rensOrgnr(l.orgnr || '').length === 9); if (!med.length) { toast(tt("Ingen leietakere har org.nr.")); return; }
  if (!await confirmBox(tt("Sjekke {0} leietakere mot Brønnøysundregistrene?", med.length), tt("Sjekk"))) return;
  let varsler = 0; for (const l of med) { const b = await oppdaterBrreg(l, true); if (b && enhetStatus(b).c !== 'green') varsler++; await new Promise(r => setTimeout(r, 250)); }
  toast(varsler ? tt("{0} leietaker(e) har avvikende status – se listen", varsler) : tt("Alle leietakere er aktive i Enhetsregisteret"));
}

export function Leietakere() {
  useStore();
  const [f, setF] = useFilter('lt', { e: '', q: '' });
  let L = S.leietakere.slice(); if (f.e) L = L.filter(l => l.eiendomId === f.e);
  if (f.q) { const q = f.q.toLowerCase(); L = L.filter(l => (l.navn + ' ' + (l.orgnr || '') + ' ' + (l.kontakt || '')).toLowerCase().includes(q)); }
  return <>
    <div className="head"><div className="grow"><h1>{tt("Leietakere")}<Hjelp id="side.leietakere" /></h1><p className="sub">{tt("Leieavtaler, vedlikeholdsansvar og oppfølging av leietakers internkontroll")}</p></div><button className="btn" onClick={() => sjekkAlle(L)}>{tt("Sjekk status i Brønnøysund")}</button><button className="btn pri" onClick={() => editLeietaker()}>{tt("+ Ny leietaker")}</button></div>
    <div className="toolbar"><Search value={f.q} onChange={q => setF({ q })} /><Sel value={f.e} onChange={e => setF({ e })} opts={eiendomOpts()} empty={tt("Alle eiendommer")} /></div>
    <LeieTable list={L} />
  </>;
}

export function LeietakerView({ id }: { id: string }) {
  useStore();
  const l = byId('leietakere', id);
  if (!l) return <Empty t="Fant ikke leietakeren"><a href="#/leietakere">{tt("Tilbake")}</a></Empty>;
  const A = S.avvik.filter(a => a.leietakerId === id); const D = S.dokumenter.filter(d => d.leietakerId === id); const T = S.oppgaver.filter(o => o.leietakerId === id && o.aktiv !== false);
  const la = leieAreal(l);
  const users = S.profiles.filter(p => p.leietaker_id === id);
  const dl: [string, React.ReactNode][] = ([
    ['Eiendom', <a href={'#/eiendom/' + l.eiendomId}>{eNavn(l.eiendomId)}</a>], ['Leieobjekt', l.lokale],
    ['Leieareal', la.verdi !== null ? <><b>{m2(la.verdi)}</b> <span className="muted small">{la.kilde === 'maalt' ? tt("fra tegninger (eksklusivt {0} + andel fellesareal {1})", m2(la.p!.eks), m2(la.p!.fe + la.p!.fb)) : la.kilde === 'overstyrt' ? (la.p ? tt("overstyrt · oppmålt {0}", m2(la.p.tot)) : tt("overstyrt manuelt")) : tt("registrert manuelt")}</span>{la.adv.map((a, i) => <div key={i} className="small" style={{ color: 'var(--amber)' }}>⚠ {a}</div>)}</> : <span className="muted">{tt("Ikke registrert")}</span>],
    ['Org.nr.', l.orgnr], ['Virksomhet', l.virksomhet], ['Avtaleperiode', l.start || l.slutt ? fd(l.start) + ' – ' + fd(l.slutt) : ''], ['Kontraktstype', finnMal(kontraktKey(l)).n + (l.heleBygget ? ' · hele bygget' : '') + (l.avtaletype ? ' · ' + l.avtaletype : '')],
    ['Kontakt', [l.kontakt, l.epost, l.tlf].filter(Boolean).join(' · ')], ['Brannvernleder', l.brannvernleder]] as [string, React.ReactNode][]).filter(x => x[1]);
  const docMiss = DOK_LEIE.filter(t => !D.some(d => d.type === t));
  return <>
    <p className="small" style={{ margin: '0 0 6px' }}><a href="#/leietakere">{tt("← Leietakere")}</a></p>
    <div className="head"><div className="grow"><h1>{l.navn}</h1><p className="sub">{eNavn(l.eiendomId)}{l.lokale ? ' · ' + l.lokale : ''}</p></div><button className="btn" onClick={() => editLeietaker(id)}>{tt("Rediger")}</button><button className="btn pri" onClick={() => brev(id)}>{tt("Lag oppfølgingsbrev")}</button></div>
    <div className="grid g2">
      <div className="card"><h2>{tt("Leieforhold")}</h2><dl className="dl">{dl.map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}</dl>
        {docMiss.length > 0 && <p className="small" style={{ marginBottom: 0 }}><Chip c="amber">{tt("Mangler:")} {docMiss.join(', ')}</Chip> <a href="#" onClick={e => { e.preventDefault(); editDok(undefined, { eiendomId: l.eiendomId, leietakerId: id, type: docMiss[0], tittel: docMiss[0] + ' – ' + l.navn }); }}>{tt("Registrer")}</a></p>}
        {l.notat && <p className="small" style={{ whiteSpace: 'pre-wrap' }}>{l.notat}</p>}
        <h3 style={{ marginTop: 16 }}>{tt("Brukere hos leietaker")}</h3>
        {users.length ? <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{users.map(u => <li key={u.id}>{u.navn || u.epost} <span className="muted">· {u.epost}{u.aktiv ? '' : tt(" · deaktivert")}</span></li>)}</ul> : <p className="small muted" style={{ margin: 0 }}>{tt("Ingen brukere. Leietakeren kan få egen innlogging for å melde avvik og bekrefte plikter.")}</p>}
        {kanRedigereE(l.eiendomId) && <button className="btn sm" style={{ marginTop: 8 }} onClick={() => inviter({ rolle: 'leietaker', leietaker_id: id, epost: l.epost || '', navn: l.kontakt || '' })}>{tt("+ Inviter bruker for leietakeren")}</button>}
      </div>
      <div className="card"><div className="toolbar" style={{ marginBottom: 6 }}><h2 style={{ margin: 0, flex: 1 }}>{tt("Brønnøysundregistrene")}</h2><button className="btn sm" onClick={() => oppdaterBrreg(l)}>{l.brreg ? tt("Oppdater") : tt("Hent opplysninger")}</button></div>
        {l.brreg ? (() => { const b = l.brreg; const st = enhetStatus(b); return <><p style={{ margin: '0 0 8px' }}><Chip c={st.c}>{st.t}</Chip> <span className="small muted">{tt("sjekket")} {fd(b.sjekket)}</span></p>
          <dl className="dl">{([['Org.nr.', b.orgnr], ['Organisasjonsform', b.orgform], ['Næring', b.naering], ['Ansatte', b.ansatte != null ? String(b.ansatte) : ''], ['Forretningsadresse', b.adresse], ['Daglig leder', b.dagligLeder], ['Styreleder', b.styreleder], ['Stiftet', b.stiftet ? fd(b.stiftet) : ''], ['Kontakt', [b.epost, b.telefon].filter(Boolean).join(' · ')]] as [string, string][]).filter(x => x[1]).map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}</dl>
          <p className="small" style={{ marginBottom: 0 }}><a href={`https://virksomhet.brreg.no/nb/oppslag/enheter/${b.orgnr}`} target="_blank" rel="noopener noreferrer">{tt("Se i Brønnøysundregistrene")}</a></p></>; })()
          : <p className="small muted" style={{ margin: 0 }}>{rensOrgnr(l.orgnr || '').length === 9 ? tt("Ikke hentet ennå.") : tt("Legg inn org.nr. for å hente opplysninger og overvåke status (konkurs, avvikling).")}</p>}</div>
    </div>
    <AnsvarKort l={l} />
    {harModul('brannvern', l.eiendomId) && <BrannvernKort l={l} />}
    {harModul('befaring', l.eiendomId) && kanDrifteE(l.eiendomId) && <Leieforlop lid={l.id} />}
    <div className="sec"><div className="toolbar"><h2 style={{ margin: 0, flex: 1 }}>{tt("Internkontroll og plikter")}<Hjelp id="ik.underpunkt" /><Hjelp id="ik.send" /></h2>{(() => { const mangler = pliktKeysFor(l).filter(k => !(l.plikter || []).some((p: any) => p.key === k)); return mangler.length > 0 && <button className="btn sm pri" onClick={() => leggTilStandardPlikter(id)} title={mangler.map(k => PLIKTER[k].n).join('\n')}>{tt("+ Legg til")} {mangler.length} {tt("manglende plikter")}</button>; })()}<button className="btn sm" onClick={() => nyPlikt(id)}>{tt("+ Legg til plikt")}</button><button className="btn sm" onClick={() => sendSjekkliste(id)} title={tt("Send lenke eller Excel-pakke til leietaker for utfylling")}>{tt("✉ Send sjekkliste til leietaker")}</button><button className="btn sm" onClick={() => importerPakke(id)} title={tt("Les inn utfylt Excel-sjekkliste og mapper (ZIP) fra leietaker")}>{tt("⇪ Importer utfylt sjekkliste")}</button></div>
      <div className="tbl-wrap"><table><thead><tr><th>{tt("Plikt")}</th><th>{tt("Hjemmel")}</th><th>{tt("Frekvens")}</th><th>{tt("Sist bekreftet")}</th><th>{tt("Neste")}</th><th>{tt("Status")}</th><th /></tr></thead><tbody>
        {(l.plikter || []).length ? l.plikter.map((p: any, i: number) => { const s = pliktStatus(p); const d = p.dokId && byId('dokumenter', p.dokId);
          const dk = PLIKTER[p.key]?.dok || []; return <tr key={p.key + i}><td>{p.navn}{dk.length > 0 && <div className="small" style={{ color: (p.sjekk || []).length >= dk.length ? 'var(--green)' : 'var(--muted)' }}>{tt("Sjekkliste:")} {(p.sjekk || []).length} {tt("av")} {dk.length} {tt("dokumenter mottatt")}</div>}{p.komm && <div className="small muted">{p.komm}</div>}{d?.fil && <div className="small"><FileLink fil={d.fil} /></div>}</td><td className="small muted">{p.hjemmel}</td><td className="small">{intTxt(p.frekvens)}</td>
            <td className="small">{fd(p.sist)}{p.form && <div className="muted">{p.form}</div>}</td><td className="small">{s.nx ? fd(s.nx) : '–'}</td><td><Chip c={pliktVis(p).c}>{pliktVis(p).t}</Chip>{p.status === 'til_godkjenning' && p.innsendt && <div className="small muted">{tt("sendt")} {fd(p.innsendt.tid)}</div>}</td><td style={{ whiteSpace: 'nowrap' }}>{p.status === 'til_godkjenning' && p.innsendt ? <button className="btn sm pri" onClick={() => vurderPlikt(id, i)}>{tt("Vurder")}</button> : <button className="btn sm" onClick={() => bekreftPlikt(id, i)}>{tt("Registrer")}</button>}</td></tr>; })
          : <tr><td colSpan={7} className="muted">{tt("Ingen plikter registrert.")}</td></tr>}
      </tbody></table></div></div>
    {T.length > 0 && <div className="sec"><h2>{tt("Kontroller leietaker har ansvar for")}</h2><TaskTable list={T} showE={false} group={false} /></div>}
    <div className="sec"><div className="toolbar"><h2 style={{ margin: 0, flex: 1 }}>{tt("Avvik knyttet til leietaker")}</h2><button className="btn sm" onClick={() => editAvvik(undefined, { eiendomId: l.eiendomId, leietakerId: id, kilde: 'Leietaker' })}>{tt("+ Avvik")}</button></div><AvvikTable list={A} showE={false} /></div>
    <div className="sec"><div className="toolbar"><h2 style={{ margin: 0, flex: 1 }}>{tt("Dokumenter")}</h2><button className="btn sm" onClick={() => editDok(undefined, { eiendomId: l.eiendomId, leietakerId: id, type: 'Leieavtale', tittel: 'Leieavtale – ' + l.navn })}>{tt("+ Dokument")}</button></div><DokTable list={D} showE={false} /></div>
  </>;
}
