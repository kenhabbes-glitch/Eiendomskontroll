import { bvStatus } from '../lib/brannvern';
import { TgForslagChip } from './TgKg';
import React, { type ReactNode } from 'react';
import { Hjelp } from './Hjelp';
import { KOMP, DOK_PAAKREVD, AV_LUKKET, SERVICEAVTALE, MALER, NS_DOK, dokNs } from '../lib/catalog';
import { ikDekning } from '../lib/utils';
import { S, canEdit, save } from '../lib/store';
import { kostNaa, kostTip, kostJustert, nok, YEAR, leieAreal, m2, sysKostNaa, sysKostUtskift, sysKostTip, kompAar, egetAar, sysNaaverdi, kompNaaverdi, nvTip, saStatus, taggerFor, erForslag, harForslag } from '../lib/utils';
const justTip = (a: any) => { const y = Math.max(compYear(a) || YEAR, YEAR); return `${kostTip(a)}. Prisjustert med KPI til utskiftingsåret ${y}.`; };
import { today } from '../lib/utils';
import { aNavn, byId, compRest, compYear, dUntil, docCoverage, eNavn, fd, intTxt, knok, lNavn, openAvvik, pad, pliktStatus, sortBy, tfmKomp, tfmSys, type Rec } from '../lib/utils';
import { editAnlegg, editAvvik, editDok, editKomponent, toggleDokNA, utfor, visOppgave } from '../lib/actions';
import { enhetStatus } from '../lib/oppslag';
import { openPlan, plasserteFor, visPaaTegning } from '../views/Arealer';
import { tildeltNavn } from '../lib/arbeidsordre';
export const Pin = ({ o }: { o: any }) => { const n = plasserteFor(o).length; return n ? <a href="#" title={o.pos ? 'Vis på tegning' : `Vis ${n} plasserte komponenter på tegning`} style={{ marginLeft: 6, textDecoration: 'none' }} onClick={e => { e.preventDefault(); e.stopPropagation(); visPaaTegning(o); }}>⌖</a> : null; };
import { AlvChip, Chip, DueChip, Empty, FileLink, ForslagMerke, RestChip, StChip, TaggChips, TgChip } from './ui';

const go = (p: string) => { location.hash = '#/' + p; };
const stop = (e: React.MouseEvent) => e.stopPropagation();

// NS 3451 hovedgrupper + felles åpen/lukket-tilstand (deles mellom TFM-registeret og eiendommens systemliste)
export const HOVEDGRUPPER: Record<string, string> = { '1': 'Dokumentasjon', '2': 'Bygning', '3': 'VVS-installasjoner', '4': 'Elkraftinstallasjoner', '5': 'Tele og automatisering', '6': 'Andre installasjoner', '7': 'Utendørs' };
const APEN_KEY = 'tfmApen';
export function useApen() {
  const [apen, setA] = React.useState<Record<string, boolean>>(() => { try { return JSON.parse(localStorage.getItem(APEN_KEY) || '{}'); } catch { return {}; } });
  const lagre = (n: Record<string, boolean>) => { setA(n); try { localStorage.setItem(APEN_KEY, JSON.stringify(n)); } catch { } };
  return { apen, toggle: (k: string) => lagre({ ...apen, [k]: !apen[k] }), settApen: (ks: string[], v: boolean) => { const n = { ...apen }; ks.forEach(k => { if (v) n[k] = true; else delete n[k]; }); lagre(n); } };
}
export const Wrap = ({ children }: { children: ReactNode }) => <div className="tbl-wrap">{children}</div>;

export function TaskTable({ list, showE = true, group = true }: { list: Rec[]; showE?: boolean; group?: boolean }) {
  if (!list.length) return <Wrap><Empty t="Ingen kontroller">Opprett kontroller via «Generer kontrollplan» på en eiendom, eller registrer systemer.</Empty></Wrap>;
  const L = sortBy(list, o => o.nesteFrist || '9999'); let last = ''; const rows: ReactNode[] = [];
  L.forEach(o => {
    if (group) {
      const d = dUntil(o.nesteFrist); const key = d !== null && d < 0 ? 'Forfalt' : o.nesteFrist ? o.nesteFrist.slice(0, 7) : 'Uten frist';
      if (key !== last) { last = key; const lab = key === 'Forfalt' || key === 'Uten frist' ? key : new Date(key + '-01T12:00').toLocaleDateString('nb-NO', { month: 'long', year: 'numeric' }); rows.push(<tr key={'g' + key} className="grp"><td colSpan={showE ? 7 : 6}>{lab.charAt(0).toUpperCase() + lab.slice(1)}</td></tr>); }
    }
    rows.push(<tr key={o.id} className="click" onClick={() => visOppgave(o.id)}>
      <td><DueChip s={o.nesteFrist} /></td>
      <td><b style={{ fontWeight: 500 }}>{o.navn}</b>{o.innrapport && <> <Chip c="blue">Rapport til godkjenning</Chip></>}{o.runde?.kp && Object.keys(o.runde.kp).length > 0 && !o.innrapport && <> <Chip c="amber" title="Komponentvis kontroll pågår – trykk Utført for å fortsette">Pågår: {Object.keys(o.runde.kp).length} kontrollert</Chip></>}{o.aoSendt && o.aoSendt.frist === o.nesteFrist && !o.innrapport && <span className="small muted" title={`Arbeidsordre sendt ${fd(o.aoSendt.dato)} til ${o.aoSendt.til}`}> ✉</span>}{o.ao?.auto && !(o.aoSendt && o.aoSendt.frist === o.nesteFrist) && <span className="small muted" title={`Arbeidsordre sendes automatisk ${o.ao.dager || 0} dager før frist til ${o.ao.epost}`}> ⏱</span>}{o.anleggId && <div className="small muted">{aNavn(o.anleggId)}</div>}{(() => { const d = ikDekning(o, MALER); return d && d.n > 0 ? <div className="small" style={{ color: d.nOk === d.n ? 'var(--green)' : 'var(--amber)' }}>{d.nOk} av {d.n} leietakere dokumentert</div> : null; })()}</td>
      {showE && <td>{eNavn(o.eiendomId)}</td>}
      <td><span className="tag">{o.type}</span><div className="small muted">{o.kategori}</div></td>
      <td className="small">{intTxt(o.intervall)}</td>
      <td className="small">{o.ansvar === 'Leietaker' ? 'Leietaker' + (o.leietakerId && lNavn(o.leietakerId) ? ': ' + lNavn(o.leietakerId) : '') : o.utfores || 'Eier'}<div className="muted">Sist: {fd(o.sistUtfort)}</div></td>
      <td><button className="btn sm" onClick={e => { stop(e); utfor(o.id); }}>Utført</button></td>
    </tr>);
  });
  return <Wrap><table><thead><tr><th>Frist</th><th>Kontroll</th>{showE && <th>Eiendom</th>}<th>Type</th><th>Intervall</th><th>Utføres av</th><th /></tr></thead><tbody>{rows}</tbody></table></Wrap>;
}

export function AvvikTable({ list, showE = true }: { list: Rec[]; showE?: boolean }) {
  if (!list.length) return <Wrap><Empty t="Ingen avvik">Avvik registreres fra kontroller, servicerapporter, tilsyn eller meldinger fra leietakere.</Empty></Wrap>;
  const ao: Record<string, number> = { Kritisk: 0, 'Høy': 1, Middels: 2, Lav: 3 };
  const L = list.slice().sort((a, b) => (+AV_LUKKET.includes(a.status) - +AV_LUKKET.includes(b.status)) || (ao[a.alv] - ao[b.alv]) || String(a.frist || '9').localeCompare(String(b.frist || '9')));
  return <Wrap><table><thead><tr><th className="num">Nr</th><th>Avvik</th>{showE && <th>Eiendom</th>}<th>Alvorlighet</th><th>Status</th><th>Frist</th><th>Ansvar</th><th>Kilde</th></tr></thead><tbody>
    {L.map(a => { const closed = AV_LUKKET.includes(a.status); const kc = a.komponentId && byId('komponenter', a.komponentId);
      return <tr key={a.id} className="click" onClick={() => editAvvik(a.id)}>
        <td className="num muted">{a.nr}</td>
        <td><b style={{ fontWeight: 500 }}>{a.tittel}</b>{kc ? <div className="small muted mono">{tfmKomp(kc)}</div> : a.anleggId ? <div className="small muted">{aNavn(a.anleggId)}</div> : null}
          {(a.pos || a.tildeltId) && <div className="small muted">{a.pos && <span style={{ color: '#b42318' }} title="Plassert på tegning">▲ </span>}{a.tildeltId && <>→ {tildeltNavn(a.tildeltId) || 'ekstern'}</>}</div>}</td>
        {showE && <td>{eNavn(a.eiendomId)}</td>}
        <td><AlvChip a={a.alv} /></td>
        <td><StChip s={a.status} />{a.status === 'Utsatt' && a.planlagt && <div className="small muted">til {fd(a.planlagt)}</div>}</td>
        <td>{closed ? <span className="small muted">{a.lukket ? 'Lukket ' + fd(a.lukket) : '–'}</span> : <DueChip s={a.frist} />}</td>
        <td className="small">{a.ansvar === 'Leverandør/entreprenør' ? 'Leverandør' : a.ansvar === 'Leietaker' ? 'Leietaker' : a.ansvar === 'Felles' ? 'Felles' : 'Eier / drift'}{a.ansvar === 'Leietaker' && a.leietakerId && lNavn(a.leietakerId) && <div className="muted">{lNavn(a.leietakerId)}</div>}{a.ansvar === 'Leverandør/entreprenør' && a.utbedresAv && <div className="muted">{a.utbedresAv}</div>}</td>
        <td className="small muted">{a.kilde}</td></tr>; })}
  </tbody></table></Wrap>;
}

export function DokTable({ list, showE = true }: { list: Rec[]; showE?: boolean }) {
  if (!list.length) return <Wrap><Empty t="Ingen dokumenter">Last opp eller registrer plassering for dokumentasjon.</Empty></Wrap>;
  const L = sortBy(list, d => dokNs(d) + '|' + d.type + '|' + (d.tittel || ''));
  return <Wrap><table><thead><tr><th>NS 3451</th><th>Dokument</th><th>Type</th>{showE && <th>Eiendom</th>}<th>Dato</th><th>Gyldig til</th><th>Fil / plassering</th></tr></thead><tbody>
    {L.map(d => { const gd = d.gyldigTil ? dUntil(d.gyldigTil)! : null;
      return <tr key={d.id} className="click" onClick={() => editDok(d.id)}>
        <td className="mono small" title={NS_DOK[dokNs(d)]}>={dokNs(d)}</td><td><b style={{ fontWeight: 500 }}>{d.tittel}</b>{d.laast ? ' 🔒' : ''}{d.leietakerId && lNavn(d.leietakerId) && <div className="small muted">{lNavn(d.leietakerId)}</div>}{(d.anleggId || (d.anleggIds || []).length > 0) && <div className="small muted">System: {[d.anleggId, ...(d.anleggIds || [])].filter((x, i, A) => x && A.indexOf(x) === i).map((x: string) => aNavn(x)).join(', ')}</div>}{d.arkiv && <div className="small" style={{ color: d.arkiv.minstTil && d.arkiv.minstTil < today() ? (d.arkiv.klasse === 'person' ? 'var(--red)' : 'var(--amber)') : 'var(--muted)' }}>{!d.arkiv.minstTil ? 'Oppbevares i byggets levetid' : d.arkiv.minstTil < today() ? (d.arkiv.klasse === 'person' ? `Inneholder personopplysninger – bør slettes (frist ${fd(d.arkiv.minstTil)})` : `Oppbevaringstiden er ute (${fd(d.arkiv.minstTil)}) – vurder sletting`) : `Oppbevares minst til ${fd(d.arkiv.minstTil)}`}</div>}</td>
        <td className="small">{d.type}</td>{showE && <td>{eNavn(d.eiendomId)}</td>}<td className="small">{fd(d.dato)}</td>
        <td>{d.gyldigTil ? (gd! < 0 ? <Chip c="red">Utløpt {fd(d.gyldigTil)}</Chip> : gd! <= 90 ? <Chip c="amber">{fd(d.gyldigTil)}</Chip> : <span className="small">{fd(d.gyldigTil)}</span>) : <span className="muted">–</span>}</td>
        <td className="small" onClick={stop}>{d.fil ? <FileLink fil={d.fil} /> : d.plassering || '–'}</td></tr>; })}
  </tbody></table></Wrap>;
}

function SysKost({ a }: { a: Rec }) {
  const c = sysKostNaa(a); const y = compYear(a); const v = c.tot ? sysKostUtskift(a) : 0;
  return <><td className="num" style={{ whiteSpace: 'nowrap' }} data-tip={c.tot ? sysKostTip(a) : undefined}>{c.tot ? nok(c.tot) : '–'}{c.tot > 0 && harForslag(a) && <ForslagMerke tip="Hele eller deler av kostnaden er et forslag fra nettsøk – kontroller mot tilbud" />}{c.n > 0 && <div className="small muted">inkl. {c.n} komp.</div>}</td>
    <td className="num" data-tip={c.tot && y ? `${sysKostTip(a)}. Prisjustert med KPI til utskiftingsåret ${Math.max(y, YEAR)}.` : undefined}>{c.tot && y ? nok(v) : '–'}</td>
    <td className="num" data-tip={c.tot && y ? nvTip(y) : undefined}>{c.tot && y ? nok(sysNaaverdi(a)) : '–'}</td></>;
}

export function AnleggTable({ list, showE = false }: { list: Rec[]; showE?: boolean }) {
  if (!list.length) return <Wrap><Empty t="Ingen systemer eller bygningsdeler registrert" /></Wrap>;
  const L = sortBy(list, a => (KOMP[a.type]?.g || '') + '|' + aNavn(a.id)); const ok = canEdit();
  return <Wrap><table><thead><tr><th>System / bygningsdel</th>{showE && <th>Eiendom</th>}<th className="num">Installert år</th><th className="num">Levetid</th><th className="num">Utskiftings­år</th><th>Restlevetid</th><th>Tilstand</th>{ok && <th className="num">Kostnad i dag</th>}{ok && <th className="num">Kostnad ved utskifting</th>}{ok && <th className="num">Nåverdi<Hjelp id="naaverdi" size={14} /></th>}<th>Kontroller</th></tr></thead><tbody>
    {L.map(a => { const k = KOMP[a.type] || ({} as any); const r = compRest(a); const n = S.oppgaver.filter(o => o.anleggId === a.id && o.aktiv !== false); const due = n.filter(o => (dUntil(o.nesteFrist) as number) < 0).length;
      return <tr key={a.id} className="click" onClick={() => editAnlegg(a.id)}>
        <td>{a.tfmSys && <span className="mono small">{tfmSys(a)} </span>}<b style={{ fontWeight: 500 }}>{a.navn || k.n}</b><div className="small muted">{a.navn ? k.n : k.g}{a.fabrikat ? ' · ' + a.fabrikat : ''}</div></td>
        {showE && <td>{eNavn(a.eiendomId)}</td>}<td className="num">{a.aar || '–'}</td><td className="num">{a.levetid || k.l || '–'}</td><td className="num">{compYear(a) || '–'}</td>
        <td>{r === null ? <span className="muted small">Mangler år</span> : <RestChip r={r} />}</td><td><TgChip t={a.tg} /><TgForslagChip o={a} /></td>{ok && <SysKost a={a} />}
        <td className="small">{n.length ? <>{n.length} stk{due > 0 && <> · <span style={{ color: 'var(--red)' }}>{due} forfalt</span></>}</> : <span className="muted">–</span>}</td></tr>; })}
  </tbody></table></Wrap>;
}

export function TfmTree({ list, q, onNewKomp, eid, onDok }: { list: Rec[]; q: string; onNewKomp?: (id: string) => void; eid?: string; onDok?: () => void }) {
  const { apen, toggle, settApen } = useApen();
  if (!list.length) return <Wrap><Empty t="Ingen systemer registrert">Registrer tekniske systemer og bygningsdeler med TFM-kode, eller importer en eksisterende TFM-liste.</Empty></Wrap>;
  const qq = q.toLowerCase(); const ok = canEdit();
  const sorted = list.slice().sort((a, b) => ((a.tfmSys || '999') + '.' + pad(a.tfmLop)).localeCompare((b.tfmSys || '999') + '.' + pad(b.tfmLop)) || aNavn(a.id).localeCompare(aNavn(b.id)));
  const tving = !!qq;
  const grupper: Record<string, { sys: string[]; rader: ReactNode[]; nS: number; nK: number; naa?: number; utsk?: number; nv?: number }> = {};
  sorted.forEach(a => {
    const gk = String(a.tfmSys || '')[0] || ''; const G = grupper[gk] ||= { sys: [], rader: [], nS: 0, nK: 0 }; const rows = G.rader;
    const k = KOMP[a.type] || ({} as any); const ks = sortBy(S.komponenter.filter(c => c.anleggId === a.id), c => (c.kode || '') + pad(c.lop));
    const n = S.oppgaver.filter(o => o.anleggId === a.id && o.aktiv !== false); const due = n.filter(o => (dUntil(o.nesteFrist) as number) < 0).length;
    const sysTxt = (tfmSys(a) + ' ' + (a.navn || '') + ' ' + k.n + ' ' + (a.fabrikat || '')).toLowerCase();
    const km = ks.filter(c => !qq || (tfmKomp(c) + ' ' + (c.navn || '') + ' ' + (c.fabrikat || '') + ' ' + (c.plassering || '')).toLowerCase().includes(qq));
    if (qq && !sysTxt.includes(qq) && !km.length) return;
    const kl = qq && !sysTxt.includes(qq) ? km : ks; G.sys.push('s' + a.id); G.nS++; G.nK += kl.length;
    if (ok) { const kn = sysKostNaa(a).tot || 0; const yy = compYear(a); G.naa = (G.naa || 0) + kn; if (kn && yy) { G.utsk = (G.utsk || 0) + sysKostUtskift(a); G.nv = (G.nv || 0) + sysNaaverdi(a); } }
    const sOpen = tving || !!apen['s' + a.id]; if (!tving && !apen['g' + gk]) return;
    rows.push(<tr key={a.id} className="click sysrow" onClick={() => editAnlegg(a.id)}>
      <td className="mono" style={{ fontWeight: 600, whiteSpace: 'nowrap', paddingLeft: 22 }}><span onClick={e => { stop(e); if (kl.length && !tving) toggle('s' + a.id); }} title={kl.length ? (sOpen ? 'Skjul komponenter' : 'Vis komponenter') : ''} style={{ display: 'inline-block', width: 20, cursor: kl.length ? 'pointer' : 'default', color: 'var(--muted)', fontFamily: 'sans-serif' }}>{kl.length ? (sOpen ? '▾' : '▸') : ''}</span>{tfmSys(a) || '–'}<Pin o={a} />{kl.length > 0 && !sOpen && <span className="small muted" style={{ fontWeight: 400, marginLeft: 6, fontFamily: 'sans-serif' }}>({kl.length})</span>}</td>
      <td><b style={{ fontWeight: 600 }}>{a.navn || k.n}</b> <TaggChips t={taggerFor(a, 'a')} small /><div className="small muted">{[a.navn ? k.n : k.g, a.fabrikat].filter(Boolean).join(' · ')}</div></td>
      <td className="num">{a.aar || '–'}</td><td className="num">{compYear(a) || '–'}{a.planAar ? <div className="small muted">overstyrt</div> : null}</td><td><RestChip r={compRest(a)} /></td><td><TgChip t={a.tg} /><TgForslagChip o={a} /></td>
      {ok && <SysKost a={a} />}
      <td className="small">{n.length ? <>{n.length} kontr.{due > 0 && <> · <span style={{ color: 'var(--red)' }}>{due} forfalt</span></>}</> : <span className="muted">–</span>}</td>
      <td style={{ whiteSpace: 'nowrap' }}>{ok && onNewKomp && <button className="btn sm" onClick={e => { stop(e); onNewKomp(a.id); }}>+ Komponent</button>}</td></tr>);
    if (sOpen) kl.forEach(c => rows.push(<tr key={c.id} className="click" onClick={() => editKomponent(c.id)}>
      <td className="mono small" style={{ paddingLeft: 58, whiteSpace: 'nowrap' }}>{'-' + (c.kode || '') + pad(c.lop) + (c.typekode ? '%' + c.typekode : '')}<Pin o={c} /></td>
      <td>{c.navn} {Array.isArray(c.tagger) && <TaggChips t={c.tagger} small />}<div className="small muted">{[c.fabrikat, c.plassering, c.serienr ? 's/n ' + c.serienr : ''].filter(Boolean).join(' · ')}</div></td>
      <td className="num">{c.aar || '–'}</td><td className="num">{kompAar(c) || '–'}{!egetAar(c) && kompAar(c) ? <div className="small muted">følger systemet</div> : null}</td><td>{egetAar(c) ? <RestChip r={compRest(c)} /> : <span className="muted small">–</span>}</td><td><TgChip t={c.tg} /><TgForslagChip o={c} /></td>
      {ok && <td className="num" data-tip={c.kost ? kostTip(c) : undefined}>{c.kost ? nok(kostNaa(c)) : '–'}{erForslag(c) && <ForslagMerke />}</td>}{ok && <td className="num" data-tip={c.kost ? `${kostTip(c)}. Prisjustert med KPI til ${Math.max(kompAar(c) || YEAR, YEAR)}.` : undefined}>{c.kost && kompAar(c) ? nok(kostJustert(c, kompAar(c))) : '–'}</td>}{ok && <td className="num" data-tip={c.kost && kompAar(c) ? nvTip(kompAar(c)) : undefined}>{c.kost && kompAar(c) ? nok(kompNaaverdi(c)) : '–'}</td>}<td /><td /></tr>));
  });
  // Hovedgruppe 1 Dokumentasjon: eiendommens dokumenter etter NS 3451 10–19 (ligger under Dokumenter, vises her for oversikt)
  const D = eid ? S.dokumenter.filter(d => d.eiendomId === eid && (!qq || (d.tittel + ' ' + d.type).toLowerCase().includes(qq))) : [];
  if (D.length || (eid && !qq)) {
    const G = grupper['1'] ||= { sys: [], rader: [], nS: 0, nK: 0 }; G.sys.push('d1');
    Object.keys(NS_DOK).forEach(k => { const dk = D.filter(d => dokNs(d) === k); if (!dk.length) return;
      // Finnes et dokumentasjonssystem med samme kode (f.eks. =17.001), legges dokumentene under det
      const sys = sorted.find(a => String(a.tfmSys) === k); const idx = sys ? G.rader.findIndex((r: any) => r?.key === sys.id) : -1;
      if (idx >= 0) { G.rader.splice(idx + 1, 0, ...dk.map(d => <tr key={d.id} className="click" onClick={() => editDok(d.id)}><td className="small muted" style={{ paddingLeft: 58 }}>dokument</td><td colSpan={ok ? 9 : 6}>📄 {d.tittel} <span className="small muted">· {d.type}{d.gyldigTil ? ' · gyldig til ' + fd(d.gyldigTil) : ''}</span></td><td className="small" onClick={stop}>{d.fil ? <FileLink fil={d.fil} /> : d.plassering || ''}</td></tr>)); return; }
      if (sys) return; const on = tving || !!apen['s1' + k];
      G.rader.push(<tr key={'d' + k} className="click sysrow" onClick={() => toggle('s1' + k)}><td className="mono" style={{ fontWeight: 600, whiteSpace: 'nowrap', paddingLeft: 22 }}><span style={{ display: 'inline-block', width: 20, color: 'var(--muted)', fontFamily: 'sans-serif' }}>{on ? '▾' : '▸'}</span>={k}</td>
        <td colSpan={ok ? 9 : 6}><b style={{ fontWeight: 600 }}>{NS_DOK[k]}</b> <span className="small muted">{dk.length} dokument{dk.length === 1 ? '' : 'er'}</span></td><td>{onDok && <button className="btn sm" onClick={e => { stop(e); onDok(); }} title="Gå til Dokumenter">Åpne</button>}</td></tr>);
      if (on) dk.forEach(d => G.rader.push(<tr key={d.id} className="click" onClick={() => editDok(d.id)}><td className="small muted" style={{ paddingLeft: 58 }}>{d.type}</td><td colSpan={ok ? 9 : 6}>{d.tittel}{d.gyldigTil && <span className="small muted"> · gyldig til {fd(d.gyldigTil)}</span>}</td><td className="small" onClick={stop}>{d.fil ? <FileLink fil={d.fil} /> : d.plassering || ''}</td></tr>));
    });
    if (!G.rader.length) G.rader.push(<tr key="d-tom"><td /><td colSpan={ok ? 10 : 7} className="small muted">Ingen dokumenter registrert. {onDok && <a href="#" onClick={e => { e.preventDefault(); onDok(); }}>Gå til Dokumenter</a>}</td></tr>);
    (G as any).nD = D.length;
  }
  const nokler = Object.keys(grupper).sort((x, y) => (x || '9z').localeCompare(y || '9z'));
  const alle = [...nokler.map(k => 'g' + k), ...nokler.flatMap(k => grupper[k].sys)];
  const ncol = ok ? 11 : 8;
  const rows: ReactNode[] = [];
  nokler.forEach(k => { const G = grupper[k]; const gOpen = tving || !!apen['g' + k];
    rows.push(<tr key={'g' + k} className="click grp" onClick={() => !tving && toggle('g' + k)} style={{ background: 'var(--bg2, #eef0ec)' }}>
      <td colSpan={ok ? 6 : ncol} style={{ fontWeight: 700 }}><span style={{ display: 'inline-block', width: 18, color: 'var(--muted)' }}>{gOpen ? '▾' : '▸'}</span><span className="mono" style={{ marginRight: 8 }}>{k || '–'}</span>{k ? HOVEDGRUPPER[k] || 'Hovedgruppe ' + k : 'Uten TFM-kode'}<span className="small muted" style={{ fontWeight: 400, marginLeft: 10 }}>{k === '1' ? `${G.nS ? G.nS + ' system' + (G.nS === 1 ? '' : 'er') + ' · ' : ''}${(G as any).nD || 0} dokument${(G as any).nD === 1 ? '' : 'er'} (registreres under Dokumenter)` : <>{G.nS} system{G.nS === 1 ? '' : 'er'}{G.nK ? ` · ${G.nK} komponent${G.nK === 1 ? '' : 'er'}` : ''}</>}</span></td>{ok && <><td className="num" style={{ fontWeight: 700, whiteSpace: 'nowrap' }} title="Sum kostnad i dag for gruppen">{G.naa ? nok(G.naa) : ''}</td><td className="num" style={{ fontWeight: 700, whiteSpace: 'nowrap' }} title="Sum kostnad ved utskifting (KPI-justert)">{G.utsk ? nok(G.utsk) : ''}</td><td className="num" style={{ fontWeight: 700, whiteSpace: 'nowrap' }} title="Sum nåverdi">{G.nv ? nok(G.nv) : ''}</td><td colSpan={2} /></>}</tr>);
    if (gOpen) rows.push(...G.rader); });
  if (ok && nokler.length > 1) { const sum = (f: 'naa' | 'utsk' | 'nv') => nokler.reduce((s0, k) => s0 + (grupper[k][f] || 0), 0); const tN = sum('naa'), tU = sum('utsk'), tV = sum('nv');
    if (tN) rows.push(<tr key="sum" style={{ borderTop: '2px solid var(--line2)' }}><td colSpan={6} style={{ fontWeight: 700 }}>Sum alle bygningsdeler</td><td className="num" style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{nok(tN)}</td><td className="num" style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{tU ? nok(tU) : ''}</td><td className="num" style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{tV ? nok(tV) : ''}</td><td colSpan={2} /></tr>); }
  return <><div className="toolbar" style={{ marginTop: -4 }}><button className="btn sm" onClick={() => settApen(alle, true)}>▾ Vis alle</button><button className="btn sm" onClick={() => settApen(alle, false)}>▸ Skjul alle</button>{tving && <span className="small muted">Søk er aktivt – alt vises utvidet</span>}</div>
  <Wrap><table><thead><tr><th>TFM-kode</th><th>System / komponent</th><th className="num">Installert år</th><th className="num">Utskiftings­år</th><th>Restlevetid</th><th>Tilstand</th>{ok && <th className="num">Kostnad i dag</th>}{ok && <th className="num">Kostnad ved utskifting</th>}{ok && <th className="num">Nåverdi<Hjelp id="naaverdi" size={14} /></th>}<th>Kontroller</th><th /></tr></thead>
    <tbody>{rows.length ? rows : <tr><td colSpan={11} className="muted">Ingen treff.</td></tr>}</tbody></table></Wrap></>;
}

export function CoverageTable({ es }: { es: Rec[] }) {
  if (!es.length) return null; const ok = canEdit();
  return <Wrap><table className="matrix"><thead><tr><th>Eiendom</th>{DOK_PAAKREVD.map(t => <th key={t} title={t} style={{ whiteSpace: 'normal', minWidth: 80, fontSize: 10.5 }}>{t.split(/[\/(]/)[0]}</th>)}<th>Dekning</th></tr></thead><tbody>
    {es.map(e => { const c = docCoverage(e, DOK_PAAKREVD); const rel = c.filter(x => x.s !== 'na'); const okk = rel.filter(x => x.s === 'ok' || x.s === 'soon').length;
      return <tr key={e.id}><td><a href={'#/eiendom/' + e.id}>{e.navn}</a></td>
        {c.map(x => { const sym = ({ ok: ['ok', '✓'], soon: ['exp', '!'], exp: ['exp', '!'], no: ['no', '✕'], na: ['na', '–'] } as any)[x.s]; const tip = ({ ok: 'Finnes', soon: 'Utløper innen 90 dager', exp: 'Utløpt', no: ok ? 'Mangler – klikk for å registrere' : 'Mangler', na: 'Ikke relevant' } as any)[x.s];
          const click = () => { if (x.d) editDok(x.d.id); else if (!ok) return; else if (x.s === 'na') toggleDokNA(e.id, x.t); else editDok(undefined, { eiendomId: e.id, type: x.t, tittel: x.t }); };
          return <td key={x.t}><span className={'dot ' + sym[0]} style={{ cursor: 'pointer' }} data-tip={`${x.t}: ${tip}`} onClick={click}>{sym[1]}</span>
            {x.s === 'no' && ok && <><br /><a href="#" className="small muted" style={{ fontSize: 10.5 }} onClick={ev => { ev.preventDefault(); toggleDokNA(e.id, x.t); }}>ikke rel.</a></>}</td>; })}
        <td className="mono">{rel.length ? Math.round(okk / rel.length * 100) : 100}%</td></tr>; })}
  </tbody></table></Wrap>;
}

export const saNy = (a: Rec) => ({ eiendomId: a.eiendomId, type: 'Serviceavtale', anleggId: a.id, tittel: 'Serviceavtale – ' + (a.navn || KOMP[a.type]?.n || 'system') + (a.leverandor ? ' (' + a.leverandor + ')' : '') });
export function ServiceavtaleTable({ es, visAnb = false, showE = true }: { es: Rec[]; visAnb?: boolean; showE?: boolean }) {
  const ok = canEdit(); const ids = es.map(e => e.id);
  const A = sortBy(S.anlegg.filter(a => ids.includes(a.eiendomId) && SERVICEAVTALE[a.type]), a => eNavn(a.eiendomId) + (SERVICEAVTALE[a.type].n === 'lov' ? '0' : '1') + aNavn(a.id))
    .map(a => ({ a, k: SERVICEAVTALE[a.type], st: saStatus(a, SERVICEAVTALE[a.type]) })).filter(r => r.k.n === 'lov' || visAnb || r.st.d);
  if (!A.length) return <Wrap><Empty t="Ingen systemer som krever serviceavtale">Når du registrerer heis, brannalarm, sprinkler, fettutskiller, kjøleanlegg o.l., dukker de opp her.</Empty></Wrap>;
  const lov = A.filter(r => r.k.n === 'lov' && r.st.s !== 'na'); const har = lov.filter(r => r.st.s === 'ok' || r.st.s === 'soon').length;
  const naToggle = async (a: Rec) => { await save('anlegg', { ...a, saIkkeRelevant: !a.saIkkeRelevant }); };
  return <>
    {lov.length > 0 && <p className="small" style={{ margin: '0 0 8px' }}>{har === lov.length ? <Chip c="green">Alle {lov.length} systemer med lovkrav har gyldig serviceavtale</Chip> : <Chip c="red">{lov.length - har} av {lov.length} systemer med lovkrav mangler gyldig serviceavtale</Chip>}</p>}
    <Wrap><table><thead><tr><th>System</th>{showE && <th>Eiendom</th>}<th>Krav</th><th>Leverandør</th><th>Serviceavtale</th><th>Gyldig til</th><th /></tr></thead><tbody>
    {A.map(({ a, k, st }) => <tr key={a.id}>
      <td><a href="#" onClick={e => { e.preventDefault(); editAnlegg(a.id); }}>{aNavn(a.id)}</a></td>{showE && <td>{eNavn(a.eiendomId)}</td>}
      <td><span data-tip={k.h}>{k.n === 'lov' ? <Chip c="blue">Lovkrav</Chip> : <Chip>Anbefalt</Chip>}</span></td>
      <td className="small">{a.leverandor || <span className="muted">–</span>}</td>
      <td>{st.s === 'na' ? <Chip>Ikke relevant</Chip> : st.d ? <a href="#" onClick={e => { e.preventDefault(); editDok(st.d!.id); }}>{st.d.tittel}</a> : st.s === 'no' ? <Chip c="red">Mangler</Chip> : <span className="muted small">Ingen registrert</span>}</td>
      <td>{st.d?.gyldigTil ? (st.s === 'exp' ? <Chip c="red">Utløpt {fd(st.d.gyldigTil)}</Chip> : st.s === 'soon' ? <Chip c="amber">{fd(st.d.gyldigTil)}</Chip> : <span className="small">{fd(st.d.gyldigTil)}</span>) : st.d ? <span className="small muted">Løpende</span> : <span className="muted">–</span>}</td>
      <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>{ok && <>{(!st.d || st.s === 'exp') && st.s !== 'na' && <button className="btn sm" onClick={() => editDok(undefined, saNy(a))}>{st.s === 'exp' ? 'Ny avtale' : 'Registrer avtale'}</button>}
        {!st.d && <a href="#" className="small muted" style={{ marginLeft: 8 }} onClick={e => { e.preventDefault(); naToggle(a); }}>{a.saIkkeRelevant ? 'angre' : 'ikke rel.'}</a>}</>}</td></tr>)}
  </tbody></table></Wrap></>;
}

export function LeieTable({ list, showE = true }: { list: Rec[]; showE?: boolean }) {
  if (!list.length) return <Wrap><Empty t="Ingen leietakere">Legg til leietakere med avtaleperiode, vedlikeholdsansvar og internkontrollplikter.</Empty></Wrap>;
  return <Wrap><table><thead><tr><th>Leietaker</th>{showE && <th>Eiendom</th>}<th>Leieobjekt</th><th className="num">Areal</th><th>Avtale utløper</th><th>Internkontroll / plikter</th><th>Brannvern-info</th><th className="num">Åpne avvik</th><th>Brukere</th></tr></thead><tbody>
    {sortBy(list, l => l.navn).map(l => { const ps = (l.plikter || []).map(pliktStatus).filter((s: any) => s.t !== 'Ikke relevant'); const bad = ps.filter((s: any) => s.o >= 2).length; const d = l.slutt ? dUntil(l.slutt)! : null; const varsel = (+l.varsel || 12) * 30.5;
      const users = S.profiles.filter(p => p.leietaker_id === l.id && p.rolle === 'leietaker').length;
      return <tr key={l.id} className="click" onClick={() => go('leietaker/' + l.id)}>
        <td><b style={{ fontWeight: 500 }}>{l.navn}</b>{l.brreg && enhetStatus(l.brreg).c !== 'green' && <> <Chip c={enhetStatus(l.brreg).c}>{enhetStatus(l.brreg).t}</Chip></>}<div className="small muted">{l.virksomhet}{l.orgnr ? ' · ' + l.orgnr : ''}</div></td>{showE && <td>{eNavn(l.eiendomId)}</td>}
        <td className="small">{l.lokale || '–'}</td><td className="num">{(() => { const la = leieAreal(l); return la.verdi === null ? '–' : <>{m2(la.verdi)}{la.adv.length > 0 && <span data-tip={la.adv.join('\n')} style={{ color: 'var(--amber)', marginLeft: 4 }}>⚠</span>}{la.kilde === 'overstyrt' && <div className="small muted">overstyrt</div>}</>; })()}</td>
        <td>{d === null ? <span className="muted">–</span> : d < 0 ? <Chip c="red">Utløpt {fd(l.slutt)}</Chip> : d <= varsel ? <Chip c="amber">{fd(l.slutt)}</Chip> : <span className="small">{fd(l.slutt)}</span>}</td>
        <td>{ps.length ? (bad ? <Chip c="red">{bad} av {ps.length} mangler</Chip> : <Chip c="green">{ps.length} av {ps.length} OK</Chip>) : <span className="muted">–</span>}</td>
        <td>{(() => { const b = bvStatus(l); return <Chip c={b.c} title={b.hint}>{b.t}</Chip>; })()}</td>
        <td className="num">{openAvvik().filter(a => a.leietakerId === l.id).length}</td>
        <td className="small">{users ? `${users} bruker${users > 1 ? 'e' : ''}` : <span className="muted">Ingen</span>}</td></tr>; })}
  </tbody></table></Wrap>;
}
