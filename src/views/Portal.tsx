import React from 'react';
import { harModul } from '../lib/moduler';
import { PLIKTER } from '../lib/catalog';
import { Hjelp } from '../components/Hjelp';
import { AV_LUKKET } from '../lib/catalog';
import { AnsvarPortal } from './Kontrakt';
import { PortalBrannvern } from '../lib/brannvern';
import { S, bump, feiltekst, save, sb, state, toast, uploadFile, useStore } from '../lib/store';
import { addDays, byId, fd, intTxt, pliktStatus, pliktVis, sortBy, today, leieAreal, m2 } from '../lib/utils';
import { AlvChip, Chip, Empty, FileLink, StChip, formModal, showModal } from '../components/ui';
import { tt, lokale } from '../lib/i18n';

async function refreshMine() {
  const lid = state.me?.leietakerId; if (!lid) return;
  const { data } = await sb.from('leietakere').select('*').eq('id', lid).single();
  if (data) { const i = S.leietakere.findIndex(x => x.id === lid); const o = { ...(data.data || {}), id: data.id, eiendomId: data.eiendom_id }; if (i >= 0) S.leietakere[i] = o; else S.leietakere.push(o); bump(); }
}

function meldAvvik(l: any) {
  formModal({
    title: tt("Meld ny sak"), saveTxt: tt("Send inn sak"),
    top: <p className="small muted" style={{ marginTop: 0 }}>{tt("Meldingen går til eier/forvalter av")} {byId('eiendommer', l.eiendomId)?.navn || tt("eiendommen")}{tt(". Du får et saksnummer og kan følge saken og skrive til utleier her.")}</p>,
    fields: [
      { k: 'tittel', label: tt("Hva gjelder det?"), req: true, ph: tt("F.eks. Nødlys over utgang i 2. etg lyser ikke") },
      { k: 'plassering', label: tt("Hvor?"), ph: tt("Etasje, rom, inngang …"), half: true },
      { k: 'alv', label: tt("Hvor alvorlig?"), type: 'select', options: [['Kritisk', 'Kritisk – fare for liv/helse eller stor skade'], ['Høy', 'Høy – må rettes raskt'], ['Middels', 'Middels'], ['Lav', 'Lav – ikke hastesak']], def: 'Middels', half: true },
      { k: 'beskrivelse', label: tt("Beskrivelse"), type: 'textarea' },
      { k: 'fil', label: tt("Bilde eller dokument (valgfritt)"), type: 'file' }],
    onSave: async v => {
      const o: any = { tittel: v.tittel, beskrivelse: [v.beskrivelse, v.plassering ? 'Sted: ' + v.plassering : ''].filter(Boolean).join('\n'), eiendomId: l.eiendomId, leietakerId: l.id, alv: v.alv, status: 'Ny', kilde: 'Leietaker', ansvar: 'Eier', meldtAv: state.me?.navn || state.me?.epost, oppdaget: today(), frist: addDays(today(), ({ Kritisk: 7, 'Høy': 30, Middels: 90, Lav: 365 } as any)[v.alv]), logg: [{ t: new Date().toISOString(), s: 'Ny', k: 'Meldt av leietaker', av: state.me?.navn || state.me?.epost }] };
      if (v.fil) { const f = await uploadFile(v.fil, l.eiendomId, l.id); if (f) o.vedlegg = [f]; }
      const nyId = await save('avvik', o); toast(tt("Takk! Saken er registrert."));
      const na = byId('avvik', nyId); if (na) setTimeout(() => visAvvik(na), 300);
    },
  });
}
function bekreft(l: any, p: any) {
  const dok = PLIKTER[p.key]?.dok || [];
  formModal({
    title: p.navn, saveTxt: tt("Send til utleier"),
    top: <><p className="small muted" style={{ marginTop: 0 }}>{p.hjemmel}{tt(". Kryss av for det som er på plass, legg ved dokumentasjon og send inn. Utleier går gjennom og godkjenner.")}</p>
      {p.status === 'avvist' && p.tilbakemelding && <div className="note small" style={{ color: 'var(--red)', borderColor: 'var(--red)' }}><b>{tt("Tilbakemelding fra utleier")} {fd(p.tilbakemelding.tid)}:</b><br />{p.tilbakemelding.tekst}</div>}</>,
    fields: [...(dok.length ? [{ k: 'sjekk', type: 'custom', label: tt("Dette skal dokumenteres"), def: p.innsendt?.sjekk || p.sjekk || [], render: (v: any, set: any) => <div className="note small" style={{ color: 'var(--ink)' }}>{dok.map(t => { const on = (v.sjekk || []).includes(t); return <label key={t} style={{ display: 'flex', gap: 8, alignItems: 'start', margin: '3px 0', cursor: 'pointer', fontWeight: 400 }}><input type="checkbox" checked={on} onChange={() => set({ sjekk: on ? v.sjekk.filter((x: string) => x !== t) : [...(v.sjekk || []), t] })} style={{ marginTop: 3 }} />{t}</label>; })}<div className="muted" style={{ marginTop: 4 }}>{(v.sjekk || []).length} {tt("av")} {dok.length} {tt("punkter krysset av")}</div></div> } as any] : []),
      { k: 'dato', label: tt("Dato (gjennomført/dokumentert)"), type: 'date', def: today(), half: true }, { k: 'komm', label: tt("Kommentar"), type: 'textarea', def: p.innsendt?.komm || '', ph: tt("F.eks. navn på brannvernleder, dato for øvelse, antall deltakere …") }, { k: 'fil', label: tt("Dokumentasjon (PDF, bilde e.l.)"), type: 'file' }],
    onSave: async v => {
      let dokId: string | null = p.innsendt?.dokId || null;
      if (v.fil) { const f = await uploadFile(v.fil, l.eiendomId, l.id); if (f) dokId = await save('dokumenter', { eiendomId: l.eiendomId, leietakerId: l.id, type: 'Leietakers IK-dokumentasjon', tittel: p.navn + ' – ' + l.navn, dato: v.dato, fil: f }); }
      const { error } = await sb.rpc('send_inn_plikt', { p_key: p.key, p_dato: v.dato, p_kommentar: v.komm || '', p_dok: dokId, p_sjekk: v.sjekk || [] });
      if (error) { toast(tt("Kunne ikke sende: ") + feiltekst(error)); return false; }
      await refreshMine(); toast(tt("Takk – sendt til utleier for godkjenning"));
    },
  });
}
function lastOpp(l: any) {
  formModal({
    title: tt("Last opp dokument"), saveTxt: tt("Last opp"),
    fields: [{ k: 'tittel', label: tt("Tittel"), req: true }, { k: 'type', label: tt("Type"), type: 'select', options: ['Leietakers IK-dokumentasjon', 'Servicerapport', 'Egenkontrollskjema', 'Annet'], def: 'Leietakers IK-dokumentasjon' }, { k: 'fil', label: tt("Fil"), type: 'file', req: true }, { k: 'notat', label: tt("Kommentar"), type: 'textarea' }],
    onSave: async v => { const f = await uploadFile(v.fil, l.eiendomId, l.id); if (!f) return false; await save('dokumenter', { eiendomId: l.eiendomId, leietakerId: l.id, type: v.type, tittel: v.tittel, dato: today(), fil: f, notat: v.notat }); toast(tt("Dokumentet er lastet opp")); },
  });
}
function visAvvik(a: any) {
  showModal(tt("Melding #{0}: {1}", a.nr || '', a.tittel), () => <>
    <dl className="dl"><dt>{tt("Status")}</dt><dd><StChip s={a.status} /></dd><dt>{tt("Alvorlighet")}</dt><dd><AlvChip a={a.alv} /></dd><dt>{tt("Meldt")}</dt><dd>{fd(a.oppdaget)}{a.meldtAv ? tt(" av ") + a.meldtAv : ''}</dd>{a.planlagt && <><dt>{tt("Planlagt utbedret")}</dt><dd>{fd(a.planlagt)}</dd></>}{a.beskrivelse && <><dt>{tt("Beskrivelse")}</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{a.beskrivelse}</dd></>}</dl>
    {(a.vedlegg || []).length > 0 && <p>{a.vedlegg.map((f: any, i: number) => <FileLink key={i} fil={f} />)}</p>}
    {a.leietakerId && <><h3 style={{ marginTop: 16 }}>{tt("Meldinger om saken")}</h3><Samtale eiendomId={a.eiendomId} leietakerId={a.leietakerId} avvikId={a.id} /></>}
    <h3 style={{ marginTop: 16 }}>{tt("Historikk")}</h3><div className="log">{(a.logg || []).slice().reverse().map((x: any, i: number) => <div key={i}><span className="lt">{new Date(x.t).toLocaleString(lokale(), { dateStyle: 'short', timeStyle: 'short' })}</span> · <StChip s={x.s} />{x.k && <><br />{x.k}</>}</div>)}</div>
  </>);
}

import { meldingerFor } from './Driftsmeldinger';
import { Samtale, useMineMeldinger, ulestSvar } from '../components/Samtale';
export function Portal() {
  useStore();
  const l = S.leietakere.find(x => x.id === state.me?.leietakerId);
  if (!l) return <div className="card"><Empty t="Fant ikke leieforholdet">{tt("Brukeren din er ikke koblet til en leietaker. Kontakt utleier.")}</Empty></div>;
  const e = byId('eiendommer', l.eiendomId) || ({} as any);
  const A0 = sortBy(S.avvik.filter(a => a.leietakerId === l.id), a => String(a.nr || 0).padStart(9, '0')).reverse();
  const [sok, setSok] = React.useState(''); const M = useMineMeldinger();
  const nyeIn = (a: any) => M.filter(m => m.avvik_id === a.id && ulestSvar(m)).length; const sistIn = (a: any) => M.find(m => m.avvik_id === a.id);
  const q = sok.trim().toLowerCase().replace(/^#/, '');
  const A = q ? A0.filter(a => String(a.nr) === q || (a.tittel || '').toLowerCase().includes(q) || (a.status || '').toLowerCase().includes(q) || M.some(m => m.avvik_id === a.id && m.data.tekst.toLowerCase().includes(q))) : A0;
  const apne = A.filter(a => !AV_LUKKET.includes(a.status));
  const D = S.dokumenter.filter(d => d.leietakerId === l.id);
  const pl = (l.plikter || []).filter((p: any) => !p.ikkeRelevant); const mangler = pl.filter((p: any) => pliktStatus(p).o >= 1 && p.status !== 'til_godkjenning');
  return <>
    <div className="portalhero"><div className="head" style={{ marginBottom: 0 }}><div className="grow"><h1>{l.navn}<Hjelp id="side.portal" /></h1><p className="sub">{e.navn}{e.adresse ? ' · ' + e.adresse : ''}{l.lokale ? ' · ' + l.lokale : ''}</p></div><button className="btn pri" onClick={() => meldAvvik(l)}>{tt("+ Meld ny sak")}</button></div>
      <div className="kpis" style={{ marginTop: 14, marginBottom: 0 }}>
        <div className={'kpi ' + (mangler.length ? 'warn' : 'ok')} style={{ cursor: 'default' }}><div className="l">{tt("Plikter som må bekreftes")}</div><div className="v">{mangler.length}</div><div className="s">{tt("av")} {pl.length} {tt("plikter")}</div></div>
        <div className="kpi" style={{ cursor: 'default' }}><div className="l">{tt("Åpne meldinger")}</div><div className="v">{apne.length}</div><div className="s">{A.length - apne.length} {tt("avsluttet")}</div></div>
        <div className="kpi" style={{ cursor: 'default' }}><div className="l">{tt("Leieavtale")}</div><div className="v" style={{ fontSize: 17, letterSpacing: 0 }}>{l.slutt ? tt("til ") + fd(l.slutt) : '–'}</div><div className="s">{leieAreal(l).verdi !== null ? m2(leieAreal(l).verdi) + tt(" leieareal") : ''}</div></div>
      </div>
      {e.kontaktLeietaker && <p className="small" style={{ marginBottom: 0 }}>{tt("Kontakt utleier:")} {e.kontaktLeietaker}</p>}
    </div>
    {meldingerFor(l.eiendomId, l.id).map(m => <div key={m.id} className="banner" role="status" style={{ display: 'block' }}><b>{m.tittel}</b> <span className="small muted">{fd(m.tid.slice(0, 10))}</span><div style={{ whiteSpace: 'pre-wrap' }}>{m.tekst}</div></div>)}
    {harModul('brannvern', l.eiendomId) && <PortalBrannvern l={l} refresh={refreshMine} />}
    <div className="sec"><h2>{tt("Internkontroll og plikter")}</h2><p className="small muted" style={{ marginTop: -6 }}>{tt("Som leietaker har virksomheten egne plikter etter forskrift om brannforebygging, internkontrollforskriften og leieavtalen. Fyll ut sjekklisten for hver plikt, legg ved dokumentasjon og send til utleier for godkjenning.")}</p>
      <div className="tbl-wrap"><table><thead><tr><th>{tt("Plikt")}</th><th>{tt("Hjemmel")}</th><th>{tt("Frekvens")}</th><th>{tt("Sist bekreftet")}</th><th>{tt("Status")}</th><th /></tr></thead><tbody>
        {pl.length ? pl.map((p: any) => { const s = pliktStatus(p); const v = pliktVis(p); const venter = p.status === 'til_godkjenning'; const dk = PLIKTER[p.key]?.dok || []; return <tr key={p.key}><td>{p.navn}{dk.length > 0 && <div className="small muted">{dk.length} {tt("punkter i sjekklisten")}</div>}{p.status === 'avvist' && p.tilbakemelding && <div className="small" style={{ color: 'var(--red)' }}>{tt("Utleier:")} {p.tilbakemelding.tekst}</div>}{venter && <div className="small muted">{tt("Sendt")} {fd(p.innsendt.tid)} {tt("– venter på utleier")}</div>}</td><td className="small muted">{p.hjemmel}</td><td className="small">{intTxt(p.frekvens)}</td><td className="small">{fd(p.sist)}</td><td><Chip c={v.c}>{v.t}</Chip></td><td><button className={'btn sm ' + (!venter && (s.o >= 1 || p.status === 'avvist') ? 'pri' : '')} onClick={() => bekreft(l, p)}>{venter ? tt("Endre") : p.status === 'avvist' ? tt("Send på nytt") : s.o >= 1 ? tt("Fyll ut") : tt("Oppdater")}</button></td></tr>; }) : <tr><td colSpan={6} className="muted">{tt("Ingen plikter registrert.")}</td></tr>}
      </tbody></table></div></div>
    <div className="sec"><div className="toolbar"><h2 style={{ margin: 0, flex: 1 }}>{tt("Mine saker")}</h2><input placeholder={tt("Søk i saker (nr, tittel, melding) …")} value={sok} onChange={e => setSok(e.target.value)} style={{ border: '1px solid var(--line2)', borderRadius: 8, padding: '7px 10px', width: 280 }} /><button className="btn pri" onClick={() => meldAvvik(l)}>{tt("+ Meld ny sak")}</button></div>
      <p className="small muted" style={{ marginTop: 0 }}>{tt("Hver sak har et saksnummer. Åpne en sak for å skrive til utleier, legge ved bilder og følge status.")}</p>
      {A.length ? <div className="tbl-wrap"><table><thead><tr><th className="num">{tt("Sak nr")}</th><th>{tt("Sak")}</th><th>{tt("Status")}</th><th>{tt("Siste melding")}</th><th>{tt("Meldt")}</th></tr></thead><tbody>
        {A.map(a => { const n = nyeIn(a); const sist = sistIn(a); return <tr key={a.id} className="click" onClick={() => visAvvik(a)}><td className="num muted">#{a.nr}</td><td><b style={{ fontWeight: n ? 700 : 500 }}>{a.tittel}</b>{n > 0 && <span className="chip red" style={{ marginLeft: 6 }}>{n} {tt("ny")}</span>}<div><AlvChip a={a.alv} /></div></td><td><StChip s={a.status} /></td><td className="small">{sist ? sist.data.tekst.slice(0, 60) : <span className="muted">–</span>}</td><td className="small">{fd(a.oppdaget)}</td></tr>; })}
      </tbody></table></div> : <div className="tbl-wrap"><Empty t={q ? "Ingen treff" : "Ingen saker"}>{q ? tt("Ingen saker passer med søket.") : tt("Bruk «Meld ny sak» når noe må utbedres eller du har et spørsmål til utleier.")}</Empty></div>}</div>
    <div className="grid g2 sec">
      <AnsvarPortal l={l} />
      <div className="card"><div className="toolbar"><h2 style={{ margin: 0, flex: 1 }}>{tt("Dokumenter")}</h2><button className="btn sm" onClick={() => lastOpp(l)}>{tt("+ Last opp")}</button></div>
        {D.length ? <div className="list">{sortBy(D, d => d.dato || '').reverse().map(d => <div key={d.id} className="li" style={{ cursor: 'default' }}><div className="grow"><div className="lt">{d.fil ? <FileLink fil={d.fil}>{d.tittel}</FileLink> : d.tittel}</div><div className="ls">{d.type} · {fd(d.dato)}</div></div></div>)}</div> : <p className="muted small">{tt("Ingen dokumenter.")}</p>}</div>
    </div>
  </>;
}
