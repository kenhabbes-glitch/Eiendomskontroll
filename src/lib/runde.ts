// Vaktmesterens kontrollrunde: alt som forfaller på en eiendom, gruppert etter sted på tegningen og sortert i gangrekkefølge.
import { S, state } from './store';
import { byId, today, addDays, kNavn, aNavn, sortBy, type Rec } from './utils';
import { AV_LUKKET } from './catalog';
import { kompForKontroll } from './komponentsjekk';
import { alleMaalere, maalerStatus } from './maaler';
import { alleSjekkmaler } from '../views/Sjekkmaler';
import { tt } from './i18n';

export type RStatus = 'forfalt' | 'idag' | 'snart' | 'ok';
export type RItem = { key: string; type: 'kontroll' | 'komp' | 'maaler' | 'avvik'; o?: Rec; k?: Rec; a?: Rec; navn: string; under: string; frist: string; status: RStatus; pos?: { tegningId: string; x: number; y: number } | null; plassering?: string; anleggId?: string };
export type Sted = { key: string; navn: string; tegningId: string; x: number; y: number; items: RItem[]; nr: number };

const posOk = (p: any) => p?.tegningId && byId('tegninger', p.tegningId) ? p : null;
function status(frist: string, iDag: string): RStatus { return !frist || frist < iDag ? 'forfalt' : frist === iDag ? 'idag' : 'snart'; }

/** Alle punkter for runden. horisont = antall dager fram i tid som tas med. */
export function rundePunkter(eid: string, horisont: number): RItem[] {
  const iDag = today(); const grense = addDays(iDag, horisont); const maler = alleSjekkmaler(); const ut: RItem[] = [];
  for (const o of S.oppgaver.filter(x => x.eiendomId === eid && x.aktiv !== false)) {
    const gjortIDag = o.sistUtfort === iDag; const frist = o.nesteFrist || '';
    if (!gjortIDag && frist && frist > grense) continue;
    const sys = o.anleggId ? byId('anlegg', o.anleggId) : null; const komp = o.komponentId ? byId('komponenter', o.komponentId) : null;
    const K = kompForKontroll(o, S.komponenter, maler);
    if (K.length && !gjortIDag) {
      for (const k of K) { const s = o.runde?.kp?.[k.id];
        ut.push({ key: o.id + ':' + k.id, type: 'komp', o, k, navn: kNavn(k.id), under: o.navn, frist, status: s ? 'ok' : status(frist, iDag), pos: posOk(k.pos) || posOk(sys?.pos), plassering: k.plassering, anleggId: o.anleggId }); }
      continue;
    }
    const pos = posOk(komp?.pos) || posOk(sys?.pos) || posOk(S.komponenter.find(k => k.anleggId === o.anleggId && posOk(k.pos))?.pos);
    ut.push({ key: o.id, type: 'kontroll', o, navn: o.navn, under: komp ? kNavn(komp.id) : sys ? aNavn(sys.id) : '', frist, status: gjortIDag ? 'ok' : status(frist, iDag), pos, plassering: komp?.plassering || sys?.navn || '', anleggId: o.anleggId });
  }
  for (const k of alleMaalere(eid)) {
    const st = maalerStatus(k); const lestIDag = st.siste?.dato === iDag;
    if (!lestIDag && st.neste && st.neste > grense) continue;
    ut.push({ key: 'm:' + k.id, type: 'maaler', k, navn: kNavn(k.id), under: 'Måleravlesning', frist: st.neste || '', status: lestIDag ? 'ok' : status(st.neste || '', iDag), pos: posOk(k.pos) || posOk(byId('anlegg', k.anleggId)?.pos), plassering: k.plassering, anleggId: k.anleggId });
  }
  for (const a of S.avvik.filter(x => x.eiendomId === eid && x.tildeltId && x.tildeltId === state.me?.id && !AV_LUKKET.includes(x.status))) {
    const k = a.komponentId ? byId('komponenter', a.komponentId) : null;
    ut.push({ key: 'a:' + a.id, type: 'avvik', a, navn: `Avvik #${a.nr || ''} ${a.tittel || ''}`.trim(), under: a.status, frist: a.frist || '', status: status(a.frist || '', iDag) === 'snart' ? 'idag' : status(a.frist || '', iDag), pos: posOk(a.pos) || posOk(k?.pos), plassering: a.plassering, anleggId: a.anleggId });
  }
  return ut;
}

export function iPoly(q: number[], P: number[][]) { let inn = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > q[1]) !== (yj > q[1]) && q[0] < (xj - xi) * (q[1] - yi) / (yj - yi) + xi) inn = !inn; } return inn; }

/** Grupper punktene i steder (areal på tegningen, eller nærhet) og sorter etasje for etasje i gangrekkefølge. */
export function lagSteder(items: RItem[], visAlle: boolean): { steder: Sted[]; uten: Sted[] } {
  const perT: Record<string, RItem[]> = {}; const uten: Record<string, Sted> = {};
  for (const it of items) {
    if (it.pos) (perT[it.pos.tegningId] ||= []).push(it);
    else { const k = 'u:' + (it.anleggId || it.type); (uten[k] ||= { key: k, navn: it.anleggId ? aNavn(it.anleggId) : it.type === 'avvik' ? tt("Avvik uten plassering") : tt("Uten system"), tegningId: '', x: 0, y: 0, items: [], nr: 0 }).items.push(it); }
  }
  const steder: Sted[] = [];
  for (const T of sortBy(S.tegninger.filter(t => perT[t.id]), t => (+t.etasje || 0) * 1000 + (+t.side || 0))) {
    const L = perT[T.id]; const R = 0.07 * Math.max(T.w || 1000, T.h || 800); const lok: Sted[] = [];
    for (const it of L) {
      const z = (T.soner || []).find((z: Rec) => z.pts?.length > 2 && iPoly([it.pos!.x, it.pos!.y], z.pts));
      let s = z ? lok.find(x => x.key === T.id + ':' + z.id) : lok.find(x => !(x as any).sone && Math.hypot(x.x - it.pos!.x, x.y - it.pos!.y) < R);
      if (!s) { s = { key: z ? T.id + ':' + z.id : T.id + ':c' + lok.length, navn: z ? tt("{0} – {1}", T.navn, z.navn) : '', tegningId: T.id, x: it.pos!.x, y: it.pos!.y, items: [], nr: 0 }; (s as any).sone = !!z; lok.push(s); }
      s.items.push(it); s.x = s.items.reduce((a, i) => a + i.pos!.x, 0) / s.items.length; s.y = s.items.reduce((a, i) => a + i.pos!.y, 0) / s.items.length;
    }
    for (const s of lok) if (!s.navn) { const pl: Record<string, number> = {}; s.items.forEach(i => { if (i.plassering) pl[i.plassering] = (pl[i.plassering] || 0) + 1; });
      const best = Object.entries(pl).sort((a, b) => b[1] - a[1])[0]?.[0]; s.navn = best ? (best.startsWith(T.navn) ? best : `${T.navn} – ${best}`) : `${T.navn} – nær ${s.items[0].navn}`; }
    // Gangrekkefølge: start øverst til venstre, gå til nærmeste neste
    let rest = lok.slice(); let cur = rest.sort((a, b) => (a.x + a.y) - (b.x + b.y))[0];
    while (cur) { steder.push(cur); rest = rest.filter(s => s !== cur); cur = rest.sort((a, b) => Math.hypot(a.x - cur!.x, a.y - cur!.y) - Math.hypot(b.x - cur!.x, b.y - cur!.y))[0]; }
  }
  const alle = [...steder, ...Object.values(uten)];
  // «Snart»-punkter tas bare med der det uansett er noe som må gjøres nå (eller hvis brukeren vil se alt)
  for (const s of alle) { const naa = s.items.some(i => i.status === 'forfalt' || i.status === 'idag');
    if (!visAlle && !naa) s.items = s.items.filter(i => i.status === 'ok'); }
  const ord = (i: RItem) => ({ forfalt: 0, idag: 1, snart: 2, ok: 3 })[i.status];
  const fs = (L: Sted[]) => L.filter(s => s.items.length).map(s => ({ ...s, items: s.items.slice().sort((a, b) => ord(a) - ord(b) || a.frist.localeCompare(b.frist)) }));
  const S1 = fs(steder); S1.forEach((s, i) => { s.nr = i + 1; }); const U = fs(Object.values(uten)); U.forEach((s, i) => { s.nr = S1.length + i + 1; });
  return { steder: S1, uten: U };
}
