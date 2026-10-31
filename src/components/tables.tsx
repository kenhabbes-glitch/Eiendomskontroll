import React, { type ReactNode } from 'react';
import { KOMP, DOK_PAAKREVD, AV_LUKKET } from '../lib/catalog';
import { S, canEdit } from '../lib/store';
import { kostNaa, kostTip, kostJustert, nok, YEAR, leieAreal, m2, sysKostNaa, sysKostUtskift, sysKostTip, kompAar, egetAar } from '../lib/utils';
const justTip = (a: any) => { const y = Math.max(compYear(a) || YEAR, YEAR); return `${kostTip(a)}. Prisjustert med KPI til utskiftingsåret ${y}.`; };
import { aNavn, byId, compRest, compYear, dUntil, docCoverage, eNavn, fd, intTxt, knok, lNavn, openAvvik, pad, pliktStatus, sortBy, tfmKomp, tfmSys, type Rec } from '../lib/utils';
import { editAnlegg, editAvvik, editDok, editKomponent, toggleDokNA, utfor, visOppgave } from '../lib/actions';
import { enhetStatus } from '../lib/oppslag';
import { openPlan } from '../views/Arealer';
export const Pin = ({ o }: { o: any }) => o.pos?.tegningId ? <a href="#" title="Vis på tegning" style={{ marginLeft: 6, textDecoration: 'none' }} onClick={e => { e.preventDefault(); e.stopPropagation(); openPlan(o.pos.tegningId, { mode: 'tfm', focus: o.id }); }}>⌖</a> : null;
import { AlvChip, Chip, DueChip, Empty, FileLink, RestChip, StChip, TgChip } from './ui';

const go = (p: string) => { location.hash = '#/' + p; };
const stop = (e: React.MouseEvent) => e.stopPropagation();
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
      <td><b style={{ fontWeight: 500 }}>{o.navn}</b>{o.anleggId && <div className="small muted">{aNavn(o.anleggId)}</div>}</td>
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
        <td><b style={{ fontWeight: 500 }}>{a.tittel}</b>{kc ? <div className="small muted mono">{tfmKomp(kc)}</div> : a.anleggId ? <div className="small muted">{aNavn(a.anleggId)}</div> : null}</td>
        {showE && <td>{eNavn(a.eiendomId)}</td>}
        <td><AlvChip a={a.alv} /></td>
        <td><StChip s={a.status} />{a.status === 'Utsatt' && a.planlagt && <div className="small muted">til {fd(a.planlagt)}</div>}</td>
        <td>{closed ? <span className="small muted">{a.lukket ? 'Lukket ' + fd(a.lukket) : '–'}</span> : <DueChip s={a.frist} />}</td>
        <td className="small">{a.ansvar === 'Leverandør/entreprenør' ? 'Leverandør' : a.ansvar === 'Leietaker' ? 'Leietaker' : 'Eier / drift'}{a.ansvar === 'Leietaker' && a.leietakerId && lNavn(a.leietakerId) && <div className="muted">{lNavn(a.leietakerId)}</div>}{a.ansvar === 'Leverandør/entreprenør' && a.utbedresAv && <div className="muted">{a.utbedresAv}</div>}</td>
        <td className="small muted">{a.kilde}</td></tr>; })}
  </tbody></table></Wrap>;
}

export function DokTable({ list, showE = true }: { list: Rec[]; showE?: boolean }) {
  if (!list.length) return <Wrap><Empty t="Ingen dokumenter">Last opp eller registrer plassering for dokumentasjon.</Empty></Wrap>;
  const L = sortBy(list, d => d.type + '|' + (d.tittel || ''));
  return <Wrap><table><thead><tr><th>Dokument</th><th>Type</th>{showE && <th>Eiendom</th>}<th>Dato</th><th>Gyldig til</th><th>Fil / plassering</th></tr></thead><tbody>
    {L.map(d => { const gd = d.gyldigTil ? dUntil(d.gyldigTil)! : null;
      return <tr key={d.id} className="click" onClick={() => editDok(d.id)}>
        <td><b style={{ fontWeight: 500 }}>{d.tittel}</b>{d.leietakerId && lNavn(d.leietakerId) && <div className="small muted">{lNavn(d.leietakerId)}</div>}</td>
        <td className="small">{d.type}</td>{showE && <td>{eNavn(d.eiendomId)}</td>}<td className="small">{fd(d.dato)}</td>
        <td>{d.gyldigTil ? (gd! < 0 ? <Chip c="red">Utløpt {fd(d.gyldigTil)}</Chip> : gd! <= 90 ? <Chip c="amber">{fd(d.gyldigTil)}</Chip> : <span className="small">{fd(d.gyldigTil)}</span>) : <span className="muted">–</span>}</td>
        <td className="small" onClick={stop}>{d.fil ? <FileLink fil={d.fil} /> : d.plassering || '–'}</td></tr>; })}
  </tbody></table></Wrap>;
}

function SysKost({ a }: { a: Rec }) {
  const c = sysKostNaa(a); const y = compYear(a); const v = c.tot ? sysKostUtskift(a) : 0;
  return <><td className="num" style={{ whiteSpace: 'nowrap' }} data-tip={c.tot ? sysKostTip(a) : undefined}>{c.tot ? nok(c.tot) : '–'}{c.n > 0 && <div className="small muted">inkl. {c.n} komp.</div>}</td>
    <td className="num" data-tip={c.tot && y ? `${sysKostTip(a)}. Prisjustert med KPI til utskiftingsåret ${Math.max(y, YEAR)}.` : undefined}>{c.tot && y ? nok(v) : '–'}</td></>;
}

export function AnleggTable({ list, showE = false }: { list: Rec[]; showE?: boolean }) {
  if (!list.length) return <Wrap><Empty t="Ingen systemer eller bygningsdeler registrert" /></Wrap>;
  const L = sortBy(list, a => (KOMP[a.type]?.g || '') + '|' + aNavn(a.id)); const ok = canEdit();
  return <Wrap><table><thead><tr><th>System / bygningsdel</th>{showE && <th>Eiendom</th>}<th className="num">Installert år</th><th className="num">Levetid</th><th className="num">Utskiftings­år</th><th>Restlevetid</th><th>Tilstand</th>{ok && <th className="num">Kostnad i dag</th>}{ok && <th className="num">Kostnad ved utskifting</th>}<th>Kontroller</th></tr></thead><tbody>
    {L.map(a => { const k = KOMP[a.type] || ({} as any); const r = compRest(a); const n = S.oppgaver.filter(o => o.anleggId === a.id && o.aktiv !== false); const due = n.filter(o => (dUntil(o.nesteFrist) as number) < 0).length;
      return <tr key={a.id} className="click" onClick={() => editAnlegg(a.id)}>
        <td>{a.tfmSys && <span className="mono small">{tfmSys(a)} </span>}<b style={{ fontWeight: 500 }}>{a.navn || k.n}</b><div className="small muted">{a.navn ? k.n : k.g}{a.fabrikat ? ' · ' + a.fabrikat : ''}</div></td>
        {showE && <td>{eNavn(a.eiendomId)}</td>}<td className="num">{a.aar || '–'}</td><td className="num">{a.levetid || k.l || '–'}</td><td className="num">{compYear(a) || '–'}</td>
        <td>{r === null ? <span className="muted small">Mangler år</span> : <RestChip r={r} />}</td><td><TgChip t={a.tg} /></td>{ok && <SysKost a={a} />}
        <td className="small">{n.length ? <>{n.length} stk{due > 0 && <> · <span style={{ color: 'var(--red)' }}>{due} forfalt</span></>}</> : <span className="muted">–</span>}</td></tr>; })}
  </tbody></table></Wrap>;
}

export function TfmTree({ list, q, onNewKomp }: { list: Rec[]; q: string; onNewKomp?: (id: string) => void }) {
  if (!list.length) return <Wrap><Empty t="Ingen systemer registrert">Registrer tekniske systemer og bygningsdeler med TFM-kode, eller importer en eksisterende TFM-liste.</Empty></Wrap>;
  const qq = q.toLowerCase(); const ok = canEdit();
  const sorted = list.slice().sort((a, b) => ((a.tfmSys || '999') + '.' + pad(a.tfmLop)).localeCompare((b.tfmSys || '999') + '.' + pad(b.tfmLop)) || aNavn(a.id).localeCompare(aNavn(b.id)));
  const rows: ReactNode[] = [];
  sorted.forEach(a => {
    const k = KOMP[a.type] || ({} as any); const ks = sortBy(S.komponenter.filter(c => c.anleggId === a.id), c => (c.kode || '') + pad(c.lop));
    const n = S.oppgaver.filter(o => o.anleggId === a.id && o.aktiv !== false); const due = n.filter(o => (dUntil(o.nesteFrist) as number) < 0).length;
    const sysTxt = (tfmSys(a) + ' ' + (a.navn || '') + ' ' + k.n + ' ' + (a.fabrikat || '')).toLowerCase();
    const km = ks.filter(c => !qq || (tfmKomp(c) + ' ' + (c.navn || '') + ' ' + (c.fabrikat || '') + ' ' + (c.plassering || '')).toLowerCase().includes(qq));
    if (qq && !sysTxt.includes(qq) && !km.length) return;
    const kl = qq && !sysTxt.includes(qq) ? km : ks;
    rows.push(<tr key={a.id} className="click sysrow" onClick={() => editAnlegg(a.id)}>
      <td className="mono" style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{tfmSys(a) || '–'}<Pin o={a} /></td>
      <td><b style={{ fontWeight: 600 }}>{a.navn || k.n}</b><div className="small muted">{[a.navn ? k.n : k.g, a.fabrikat].filter(Boolean).join(' · ')}</div></td>
      <td className="num">{a.aar || '–'}</td><td className="num">{compYear(a) || '–'}{a.planAar ? <div className="small muted">overstyrt</div> : null}</td><td><RestChip r={compRest(a)} /></td><td><TgChip t={a.tg} /></td>
      {ok && <SysKost a={a} />}
      <td className="small">{n.length ? <>{n.length} kontr.{due > 0 && <> · <span style={{ color: 'var(--red)' }}>{due} forfalt</span></>}</> : <span className="muted">–</span>}</td>
      <td style={{ whiteSpace: 'nowrap' }}>{ok && onNewKomp && <button className="btn sm" onClick={e => { stop(e); onNewKomp(a.id); }}>+ Komponent</button>}</td></tr>);
    kl.forEach(c => rows.push(<tr key={c.id} className="click" onClick={() => editKomponent(c.id)}>
      <td className="mono small" style={{ paddingLeft: 26, whiteSpace: 'nowrap' }}>{'-' + (c.kode || '') + pad(c.lop) + (c.typekode ? '%' + c.typekode : '')}<Pin o={c} /></td>
      <td>{c.navn}<div className="small muted">{[c.fabrikat, c.plassering, c.serienr ? 's/n ' + c.serienr : ''].filter(Boolean).join(' · ')}</div></td>
      <td className="num">{c.aar || '–'}</td><td className="num">{kompAar(c) || '–'}{!egetAar(c) && kompAar(c) ? <div className="small muted">følger systemet</div> : null}</td><td>{egetAar(c) ? <RestChip r={compRest(c)} /> : <span className="muted small">–</span>}</td><td><TgChip t={c.tg} /></td>
      {ok && <td className="num" data-tip={c.kost ? kostTip(c) : undefined}>{c.kost ? nok(kostNaa(c)) : '–'}</td>}{ok && <td className="num" data-tip={c.kost ? `${kostTip(c)}. Prisjustert med KPI til ${Math.max(kompAar(c) || YEAR, YEAR)}.` : undefined}>{c.kost && kompAar(c) ? nok(kostJustert(c, kompAar(c))) : '–'}</td>}<td /><td /></tr>));
  });
  return <Wrap><table><thead><tr><th>TFM-kode</th><th>System / komponent</th><th className="num">Installert år</th><th className="num">Utskiftings­år</th><th>Restlevetid</th><th>Tilstand</th>{ok && <th className="num">Kostnad i dag</th>}{ok && <th className="num">Kostnad ved utskifting</th>}<th>Kontroller</th><th /></tr></thead>
    <tbody>{rows.length ? rows : <tr><td colSpan={10} className="muted">Ingen treff.</td></tr>}</tbody></table></Wrap>;
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

export function LeieTable({ list, showE = true }: { list: Rec[]; showE?: boolean }) {
  if (!list.length) return <Wrap><Empty t="Ingen leietakere">Legg til leietakere med avtaleperiode, vedlikeholdsansvar og internkontrollplikter.</Empty></Wrap>;
  return <Wrap><table><thead><tr><th>Leietaker</th>{showE && <th>Eiendom</th>}<th>Leieobjekt</th><th className="num">Areal</th><th>Avtale utløper</th><th>Internkontroll / plikter</th><th className="num">Åpne avvik</th><th>Brukere</th></tr></thead><tbody>
    {sortBy(list, l => l.navn).map(l => { const ps = (l.plikter || []).map(pliktStatus).filter((s: any) => s.t !== 'Ikke relevant'); const bad = ps.filter((s: any) => s.o >= 2).length; const d = l.slutt ? dUntil(l.slutt)! : null; const varsel = (+l.varsel || 12) * 30.5;
      const users = S.profiles.filter(p => p.leietaker_id === l.id && p.rolle === 'leietaker').length;
      return <tr key={l.id} className="click" onClick={() => go('leietaker/' + l.id)}>
        <td><b style={{ fontWeight: 500 }}>{l.navn}</b>{l.brreg && enhetStatus(l.brreg).c !== 'green' && <> <Chip c={enhetStatus(l.brreg).c}>{enhetStatus(l.brreg).t}</Chip></>}<div className="small muted">{l.virksomhet}{l.orgnr ? ' · ' + l.orgnr : ''}</div></td>{showE && <td>{eNavn(l.eiendomId)}</td>}
        <td className="small">{l.lokale || '–'}</td><td className="num">{(() => { const la = leieAreal(l); return la.verdi === null ? '–' : <>{m2(la.verdi)}{la.adv.length > 0 && <span data-tip={la.adv.join('\n')} style={{ color: 'var(--amber)', marginLeft: 4 }}>⚠</span>}{la.kilde === 'overstyrt' && <div className="small muted">overstyrt</div>}</>; })()}</td>
        <td>{d === null ? <span className="muted">–</span> : d < 0 ? <Chip c="red">Utløpt {fd(l.slutt)}</Chip> : d <= varsel ? <Chip c="amber">{fd(l.slutt)}</Chip> : <span className="small">{fd(l.slutt)}</span>}</td>
        <td>{ps.length ? (bad ? <Chip c="red">{bad} av {ps.length} mangler</Chip> : <Chip c="green">{ps.length} av {ps.length} OK</Chip>) : <span className="muted">–</span>}</td>
        <td className="num">{openAvvik().filter(a => a.leietakerId === l.id).length}</td>
        <td className="small">{users ? `${users} bruker${users > 1 ? 'e' : ''}` : <span className="muted">Ingen</span>}</td></tr>; })}
  </tbody></table></Wrap>;
}
