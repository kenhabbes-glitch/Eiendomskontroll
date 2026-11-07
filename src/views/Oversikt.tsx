import { RegelverkStatus } from '../components/RegelverkStatus';
import { importerSystemer } from './SystemImport';
import { tgTekst } from '../components/TgKg';
import { koTilGodkjenning } from './KontrollAo';
import React from 'react';
import { isStaff } from '../lib/store';
import { PortefoljeStatistikk } from './Portefolje';
import { tilGodkjenning, vurderPlikt } from './Sjekkliste';
import { Hjelp } from '../components/Hjelp';
import { bvOppfolging, aktiveMidl } from '../lib/brannvern';
import { DOK_PAAKREVD } from '../lib/catalog';
import { eierRapport } from './EierRapport';
import { S, canEdit, isAdmin, state, useStore } from '../lib/store';
import { aNavn, kNavn, activeTasks, compRest, docCoverage, dUntil, eNavn, fd, openAvvik, pliktStatus, sortBy, today } from '../lib/utils';
import { editAvvik, editEiendom, visOppgave, editAnlegg, editKomponent } from '../lib/actions';
import { AlvChip, Chip, DueChip } from '../components/ui';
import { enhetStatus } from '../lib/oppslag';

const go = (p: string) => { location.hash = '#/' + p; };

export function Oversikt() {
  useStore();
  const ed = canEdit();
  if (!S.eiendommer.length) return <div className="welcome"><h1>Velkommen{state.me?.navn ? ', ' + state.me.navn : ''}</h1>
    {isAdmin() ? <div className="card"><h2>Kom i gang</h2><ol>
      <li><b>Registrer eiendommene</b> – du får forslag til faste kontroller som gjelder alle næringsbygg.</li>
      <li><b>Registrer systemer og komponenter</b> med TFM-kode, eller importer eksisterende TFM-lister. Kontroller og levetidsplan opprettes automatisk.</li>
      <li><b>Legg inn leietakerne</b> med avtaleperiode, vedlikeholdsansvar og internkontrollplikter.</li>
      <li><b>Inviter brukere</b> under «Brukere og roller» og gi dem tilgang til riktige eiendommer.</li>
      <li>Har du data fra prototypen, kan du hente dem inn under «Import og eksport».</li></ol>
      <button className="btn pri" onClick={() => editEiendom()}>+ Registrer første eiendom</button> <button className="btn" onClick={() => importerSystemer()}>Importer fra datainnsamlingsfil (Excel)</button></div>
      : <div className="card"><p style={{ margin: 0 }}>Du har ikke fått tilgang til noen eiendommer ennå. Kontakt administratoren.</p></div>}</div>;

  const T = activeTasks(); const forf = T.filter(o => (dUntil(o.nesteFrist) as number) < 0); const d30 = T.filter(o => { const d = dUntil(o.nesteFrist); return d !== null && d >= 0 && d <= 30; });
  const OA = openAvvik(); const krit = OA.filter(a => a.alv === 'Kritisk' || a.alv === 'Høy'); const avForf = OA.filter(a => a.frist && (dUntil(a.frist) as number) < 0);
  const dokExp = S.dokumenter.filter(d => d.gyldigTil && (dUntil(d.gyldigTil) as number) <= 90);
  const cov = ed ? S.eiendommer.flatMap(e => docCoverage(e, DOK_PAAKREVD).filter(x => x.s === 'no' || x.s === 'exp')) : [];
  const ikL = S.leietakere.filter(l => (l.plikter || []).some((p: any) => pliktStatus(p).o >= 2));
  const ikMiss = S.leietakere.flatMap(l => (l.plikter || []).filter((p: any) => pliktStatus(p).o >= 2));
  const lev = [...S.anlegg, ...S.komponenter.filter(k => k.levetid || k.planAar || k.tg)].filter(a => { const r = compRest(a); return (r !== null && r <= 3) || a.tg === 'TG3'; });
  const lAv = S.leietakere.filter(l => l.slutt && (dUntil(l.slutt) as number) <= (+l.varsel || 12) * 30.5);
  const K = (v: number, l: string, s: string, cls: string, h: string) => <button className={'kpi ' + cls} onClick={() => go(h)}><div className="l">{l}</div><div className="v">{v}</div><div className="s">{s}</div></button>;
  const actions = [
    ...forf.map(o => ({ d: o.nesteFrist, el: <div key={o.id} className="li" onClick={() => visOppgave(o.id)}><DueChip s={o.nesteFrist} /><div className="grow"><div className="lt">{o.navn}</div><div className="ls">{eNavn(o.eiendomId)} · {o.type}</div></div></div> })),
    ...OA.filter(a => a.alv === 'Kritisk' || (a.frist && (dUntil(a.frist) as number) < 0)).map(a => ({ d: a.frist || '0', el: <div key={a.id} className="li" onClick={() => editAvvik(a.id)}><AlvChip a={a.alv} /><div className="grow"><div className="lt">#{a.nr} {a.tittel}</div><div className="ls">{eNavn(a.eiendomId)} · {a.status} · frist {fd(a.frist)}</div></div></div> })),
    ...(ed ? S.leietakere.filter(l => l.brreg && enhetStatus(l.brreg).c !== 'green').map(l => ({ d: '0', el: <div key={'b' + l.id} className="li" onClick={() => go('leietaker/' + l.id)}><Chip c={enhetStatus(l.brreg).c}>{enhetStatus(l.brreg).t}</Chip><div className="grow"><div className="lt">{l.navn}</div><div className="ls">{eNavn(l.eiendomId)} · status i Brønnøysundregistrene per {fd(l.brreg.sjekket)}</div></div></div> })) : []),
    ...(ed ? [...S.anlegg.map(x => ({ x, k: false })), ...S.komponenter.map(x => ({ x, k: true }))].filter(({ x }) => x.tgForslag?.tg).map(({ x, k }) => ({ d: '0', el: <div key={'tg' + x.id} className="li" onClick={() => k ? editKomponent(x.id) : editAnlegg(x.id)}><Chip c="amber">Tilstand?</Chip><div className="grow"><div className="lt">{k ? kNavn(x.id) : aNavn(x.id)}: {tgTekst(x.tgForslag.fra)} → {tgTekst(x.tgForslag)}</div><div className="ls">{eNavn(x.eiendomId)} · forslag fra {x.tgForslag.av} {fd(x.tgForslag.dato)}</div></div></div> })) : []),
    ...(ed ? koTilGodkjenning().map(o => ({ d: '0', el: <div key={'k' + o.id} className="li" onClick={() => visOppgave(o.id)}><Chip c="blue">Rapport mottatt</Chip><div className="grow"><div className="lt">{o.navn}</div><div className="ls">{eNavn(o.eiendomId)} · {o.innrapport.firma || o.innrapport.epost} · utført {fd(o.innrapport.dato)}</div></div></div> })) : []),
    ...(ed ? tilGodkjenning().map(x => ({ d: '0', el: <div key={'g' + x.l.id + x.idx} className="li" onClick={() => vurderPlikt(x.l.id, x.idx)}><Chip c="blue">Til godkjenning</Chip><div className="grow"><div className="lt">{x.p.navn}</div><div className="ls">{x.l.navn} · {eNavn(x.l.eiendomId)} · sendt {fd(x.p.innsendt.tid)}</div></div></div> })) : []),
  ].sort((a, b) => String(a.d).localeCompare(String(b.d)));

  return <>
    <div className="head"><div className="grow"><h1>Oversikt<Hjelp id="side.oversikt" /></h1><p className="sub">{S.eiendommer.length} eiendommer{ed ? ` · ${S.leietakere.length} leietakere` : ''} · {T.length} aktive kontroller · status per {fd(today())}</p></div>{ed && <button className="btn" onClick={() => eierRapport()}>Statusrapport til eier</button>}<button className="btn" onClick={() => editAvvik()}>+ Meld avvik</button></div>
    {ed && <RegelverkStatus kompakt />}
    <div className="kpis">
      {K(forf.length, 'Forfalte kontroller', `${d30.length} forfaller neste 30 dager`, forf.length ? 'bad' : 'ok', 'kontroller')}
      {K(OA.length, 'Åpne avvik', `${krit.length} kritiske/høye · ${avForf.length} over frist`, avForf.length || krit.length ? 'bad' : OA.length ? 'warn' : 'ok', 'avvik')}
      {ed && K(cov.length, 'Dokumenter mangler/utløpt', `${dokExp.length} utløper innen 90 d`, cov.length ? 'warn' : 'ok', 'dokumenter')}
      {ed && K(ikMiss.length, 'Leietakerplikter ubekreftet', `hos ${ikL.length} leietakere`, ikMiss.length ? 'warn' : 'ok', 'leietakere')}
      {ed && (() => { const bvL = bvOppfolging(); const midl = S.eiendommer.reduce((n, e) => n + aktiveMidl(e).length, 0); return K(bvL.length, 'Brannvern-info til leietakere', midl ? `${midl} varsel om redusert brannsikkerhet` : 'ikke sendt, ubekreftet eller mangler ansvarlig', midl ? 'bad' : bvL.length ? 'warn' : 'ok', 'leietakere'); })()}
      {K(lev.length, 'Ved levetidsslutt', '≤ 3 år igjen eller TG3', lev.length ? 'warn' : 'ok', ed ? 'vedlikehold' : 'tfm')}
      {ed && K(lAv.length, 'Leieavtaler til fornyelse', 'innenfor varslingsfrist', lAv.length ? 'warn' : 'ok', 'leietakere')}
    </div>
    <div className="grid g2">
      <div className="card"><h2>Krever handling nå</h2>{actions.length ? <div className="list">{actions.slice(0, 12).map(x => x.el)}</div> : <p className="muted">Ingen forfalte kontroller eller kritiske avvik.</p>}{actions.length > 12 && <p className="small muted">+ {actions.length - 12} til</p>}</div>
      <div className="card"><h2>Neste 30 dager</h2>{d30.length ? <div className="list">{sortBy(d30, o => o.nesteFrist).slice(0, 12).map(o => <div key={o.id} className="li" onClick={() => visOppgave(o.id)}><DueChip s={o.nesteFrist} /><div className="grow"><div className="lt">{o.navn}</div><div className="ls">{eNavn(o.eiendomId)} · {o.utfores}</div></div></div>)}</div> : <p className="muted">Ingen kontroller forfaller de neste 30 dagene.</p>}</div>
    </div>
    {isStaff() && <PortefoljeStatistikk />}
    <div className="sec"><h2>Status per eiendom</h2><div className="tbl-wrap"><table><thead><tr><th>Eiendom</th><th>Kategori</th><th className="num">Forfalte</th><th className="num">≤ 30 d</th><th className="num">Åpne avvik</th><th className="num">Kritisk/høy</th>{ed && <th className="num">Dok.dekning</th>}{ed && <th className="num">Leietakere</th>}</tr></thead><tbody>
      {sortBy(S.eiendommer, e => e.navn).map(e => { const t = T.filter(o => o.eiendomId === e.id); const a = OA.filter(x => x.eiendomId === e.id); const c = docCoverage(e, DOK_PAAKREVD).filter(x => x.s !== 'na'); const okk = c.filter(x => x.s === 'ok' || x.s === 'soon').length; const f = t.filter(o => (dUntil(o.nesteFrist) as number) < 0).length; const kh = a.filter(x => x.alv === 'Kritisk' || x.alv === 'Høy').length; const pct = c.length ? Math.round(okk / c.length * 100) : 100;
        return <tr key={e.id} className="click" onClick={() => go('eiendom/' + e.id)}><td><b style={{ fontWeight: 500 }}>{e.navn}</b><div className="small muted">{e.adresse}</div></td><td className="small">{e.kategori}</td>
          <td className="num" style={f ? { color: 'var(--red)', fontWeight: 600 } : undefined}>{f}</td><td className="num">{t.filter(o => { const d = dUntil(o.nesteFrist); return d !== null && d >= 0 && d <= 30; }).length}</td><td className="num">{a.length}</td>
          <td className="num" style={kh ? { color: 'var(--red)', fontWeight: 600 } : undefined}>{kh}</td>{ed && <td className="num" style={pct < 70 ? { color: 'var(--amber)' } : undefined}>{pct}%</td>}{ed && <td className="num">{S.leietakere.filter(l => l.eiendomId === e.id).length}</td>}</tr>; })}
    </tbody></table></div></div>
  </>;
}
