// Statistikk per eier og portefølje (det brukeren har tilgang til)
import React, { useState } from 'react';
import { Hjelp } from '../components/Hjelp';
import { S, orgNavn, canEdit, useStore } from '../lib/store';
import { DOK_PAAKREVD } from '../lib/catalog';
import { YEAR, activeTasks, compYear, dUntil, docCoverage, m2, nok, openAvvik, sysKostNaa, sysKostUtskift, naaverdi, sortBy, kostNaa, type Rec } from '../lib/utils';

type Tall = { bygg: number; bta: number; avvik: number; kritisk: number; forfalt: number; tg23: number; utsk10: number; nv10: number; etterslep: number; dekning: number; ids: string[] };
function beregn(E: Rec[]): Tall {
  const ids = E.map(e => e.id); const sett = new Set(ids);
  const OA = openAvvik().filter(a => sett.has(a.eiendomId)); const T = activeTasks().filter(o => sett.has(o.eiendomId));
  const A = S.anlegg.filter(a => sett.has(a.eiendomId)); const K = S.komponenter.filter(k => sett.has(k.eiendomId));
  let utsk10 = 0, nv10 = 0, etterslep = 0;
  A.forEach(a => { const y = compYear(a); if (!y) return; if (y < YEAR) { etterslep += sysKostNaa(a).tot || 0; return; } if (y <= YEAR + 10) { const v = sysKostUtskift(a, y); utsk10 += v; nv10 += naaverdi(v, y); } });
  const dek = E.map(e => { const c = docCoverage(e, DOK_PAAKREVD).filter(x => x.s !== 'na'); return c.length ? c.filter(x => x.s === 'ok' || x.s === 'soon').length / c.length : 1; });
  return {
    bygg: E.length, bta: E.reduce((s, e) => s + (+e.bta || 0), 0), avvik: OA.length, kritisk: OA.filter(a => ['Kritisk', 'Høy'].includes(a.alv)).length,
    forfalt: T.filter(o => (dUntil(o.nesteFrist) as number) < 0).length, tg23: [...A, ...K].filter(x => ['TG2', 'TG3'].includes(x.tg)).length,
    utsk10, nv10, etterslep, dekning: dek.length ? Math.round(dek.reduce((s, x) => s + x, 0) / dek.length * 100) : 0, ids,
  };
}

export function PortefoljeStatistikk() {
  useStore(); const [apen, setApen] = useState<Record<string, boolean>>({}); const ok = canEdit();
  const eiere = [...new Set(S.eiendommer.map(e => e.eierOrgId))];
  if (!S.portefoljer.length && eiere.length <= 1) return null;
  const rader: { k: string; niv: 0 | 1; navn: string; t: Tall; eid?: string }[] = [];
  sortBy(eiere, o => orgNavn(o)).forEach(o => {
    const E = S.eiendommer.filter(e => e.eierOrgId === o); rader.push({ k: 'o' + o, niv: 0, navn: orgNavn(o) || 'Ukjent eier', t: beregn(E) });
    if (!apen['o' + o]) return;
    const P = sortBy(S.portefoljer.filter(p => p.eier_org_id === o && E.some(e => e.portefoljeId === p.id)), p => p.navn);
    P.forEach(p => rader.push({ k: 'p' + p.id, niv: 1, navn: p.navn, t: beregn(E.filter(e => e.portefoljeId === p.id)) }));
    const uten = E.filter(e => !e.portefoljeId || !P.some(p => p.id === e.portefoljeId)); if (uten.length && P.length) rader.push({ k: 'u' + o, niv: 1, navn: 'Uten portefølje', t: beregn(uten) });
  });
  const tot = beregn(S.eiendommer);
  const celle = (v: number, rød?: boolean) => <td className="num" style={rød && v ? { color: 'var(--red)', fontWeight: 600 } : undefined}>{v}</td>;
  return <div className="sec"><h2>Per eier og portefølje<Hjelp id="portefolje" /></h2><div className="tbl-wrap"><table><thead><tr>
    <th>Eier / portefølje</th><th className="num">Bygg</th><th className="num">BTA</th><th className="num">Åpne avvik</th><th className="num">Kritisk/høy</th><th className="num">Forfalte kontroller</th><th className="num">TG2/TG3</th>
    {ok && <><th className="num">Etterslep</th><th className="num">Utskifting 10 år</th><th className="num">Nåverdi 10 år</th></>}<th className="num">Dok.dekning</th></tr></thead><tbody>
    {rader.map(r => <tr key={r.k} className={r.niv === 0 ? 'click grp' : ''} onClick={() => r.niv === 0 && setApen(a => ({ ...a, [r.k]: !a[r.k] }))} style={r.niv === 0 ? { background: 'var(--bg2, #eef0ec)' } : undefined}>
      <td style={{ paddingLeft: r.niv ? 30 : undefined, fontWeight: r.niv ? 500 : 700 }}>{r.niv === 0 && <span style={{ display: 'inline-block', width: 18, color: 'var(--muted)' }}>{apen[r.k] ? '▾' : '▸'}</span>}{r.navn}</td>
      <td className="num">{r.t.bygg}</td><td className="num">{r.t.bta ? m2(r.t.bta) : '–'}</td>{celle(r.t.avvik)}{celle(r.t.kritisk, true)}{celle(r.t.forfalt, true)}{celle(r.t.tg23, true)}
      {ok && <><td className="num" style={r.t.etterslep ? { color: 'var(--red)' } : undefined}>{r.t.etterslep ? nok(r.t.etterslep) : '–'}</td><td className="num">{r.t.utsk10 ? nok(r.t.utsk10) : '–'}</td><td className="num">{r.t.nv10 ? nok(r.t.nv10) : '–'}</td></>}
      <td className="num" style={r.t.dekning < 70 ? { color: 'var(--amber)' } : undefined}>{r.t.dekning}%</td></tr>)}
    <tr style={{ borderTop: '2px solid var(--line2)' }}><td style={{ fontWeight: 700 }}>Sum alle</td><td className="num"><b>{tot.bygg}</b></td><td className="num">{tot.bta ? m2(tot.bta) : '–'}</td><td className="num">{tot.avvik}</td><td className="num">{tot.kritisk}</td><td className="num">{tot.forfalt}</td><td className="num">{tot.tg23}</td>
      {ok && <><td className="num">{tot.etterslep ? nok(tot.etterslep) : '–'}</td><td className="num"><b>{tot.utsk10 ? nok(tot.utsk10) : '–'}</b></td><td className="num"><b>{tot.nv10 ? nok(tot.nv10) : '–'}</b></td></>}<td className="num">{tot.dekning}%</td></tr>
  </tbody></table></div><p className="small muted">Klikk på en eier for å se porteføljene. Etterslep = kostnad i dag for systemer som har passert utskiftingsåret. Utskifting 10 år er KPI-justert til utskiftingsåret.</p></div>;
}
