// Koblinger rundt et avvik: rapporten det kom fra, og gjentatte avvik på samme komponent/system.
import { S } from './store';
import { byId, addDays, today, type Rec } from './utils';

/** Rapporten (servicerapport/egenkontroll) avviket ble registrert fra, med kontrollen og datoen */
export function rapportFor(a: Rec): { dok: Rec | null; dokIds: string[]; oppgave: Rec | null; dato: string } | null {
  const o = a.oppgaveId ? byId('oppgaver', a.oppgaveId) : null;
  const h = o ? (o.historikk || []).find((x: Rec) => (x.avvik || []).includes(a.id)) : null;
  const dokIds = [a.dokId, ...(h?.dokIds || []), h?.dokId].filter((x, i, A) => x && A.indexOf(x) === i) as string[];
  if (!o && !dokIds.length) return null;
  return { dok: dokIds.length ? byId('dokumenter', dokIds[0]) || null : null, dokIds, oppgave: o, dato: h?.dato || a.oppdaget || '' };
}

export const GJENTATT_MND = 24, GJENTATT_MIN = 3;
const nokkel = (a: Rec) => a.komponentId ? 'k:' + a.komponentId : a.anleggId ? 'a:' + a.anleggId : '';
const innenfor = (a: Rec, fra: string) => String(a.oppdaget || a.opprettet || '').slice(0, 10) >= fra;
/** Avvik på samme komponent (eller samme system når komponent mangler) siste 24 måneder, inkludert dette */
export function gjentatte(a: Rec): Rec[] {
  const k = nokkel(a); if (!k) return [];
  const fra = addDays(today(), -Math.round(GJENTATT_MND * 30.44));
  return S.avvik.filter(x => nokkel(x) === k && innenfor(x, fra) && x.status !== 'Avvist').sort((x, y) => String(y.oppdaget).localeCompare(String(x.oppdaget)));
}
/** Antall per komponent/system for hele listen (til tabellen) */
export function gjentattTelling(): Record<string, number> {
  const fra = addDays(today(), -Math.round(GJENTATT_MND * 30.44)); const c: Record<string, number> = {};
  for (const x of S.avvik) { const k = nokkel(x); if (k && innenfor(x, fra) && x.status !== 'Avvist') c[k] = (c[k] || 0) + 1; }
  return c;
}
export const gjentattAntall = (a: Rec, c: Record<string, number>) => c[nokkel(a)] || 0;
