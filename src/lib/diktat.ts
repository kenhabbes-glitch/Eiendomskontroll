// Diktering til tekstfelt via nettleserens talegjenkjenning (Web Speech API).
// Lyden behandles av nettleserleverandøren (Google i Chrome/Edge, Apple i Safari) – ikke av appen eller serveren vår.
import { sprak } from './i18n';
const SPRAK: Record<string, string> = { nb: 'nb-NO', sv: 'sv-SE', da: 'da-DK', en: 'en-GB', es: 'es-MX' };
const SR = (): any => (typeof window === 'undefined' ? null : (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
export const diktatStotte = () => !!SR();

export type Diktat = { stopp: () => void };
const erIos = () => typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1));
let aktiv: any = null; // bare én diktering om gangen; en hengende forrige økt avbrytes før ny starter
let inst: any = null;  // samme objekt gjenbrukes mellom øktene: Safari på iPhone slutter ofte å virke hvis man lager et nytt for hver gang
/** Starter diktering. `grunn` er teksten som allerede står i feltet; `paaTekst` får hele den nye teksten fortløpende.
 *  `paaSlutt` kalles når økten er over; feil: 'mikrofon' (ikke tillatt), 'ingen-tale' (hørte ingenting), ellers feilkoden. */
export function startDiktat(grunn: string, paaTekst: (t: string) => void, paaSlutt: (feil?: string) => void): Diktat | null {
  const R = SR(); if (!R) return null;
  if (aktiv) { try { aktiv.onresult = aktiv.onerror = aktiv.onend = null; aktiv.abort(); } catch { } aktiv = null; inst = null; }
  const r = inst || (inst = new R()); r.lang = SPRAK[sprak()] || 'nb-NO'; r.interimResults = true;
  r.continuous = !erIos(); // Safari på iPhone er ustabil i kontinuerlig modus: én setning per trykk
  let ferdig = '', fikkTale = false, stoppetAvOss = false, slutt = false, feilKode: string | undefined;
  const settSammen = (a: string, b: string) => (a && b ? a.replace(/\s+$/, '') + ' ' : a) + b;
  r.onresult = (e: any) => {
    let mellom = '';
    for (let i = e.resultIndex; i < e.results.length; i++) { const t = String(e.results[i][0]?.transcript || ''); if (e.results[i].isFinal) ferdig = settSammen(ferdig, t.trim()); else mellom += t; }
    let ut = settSammen(grunn, settSammen(ferdig, mellom.trim())); if (ut !== grunn) fikkTale = true;
    if (!grunn && ut) ut = ut.charAt(0).toUpperCase() + ut.slice(1);
    paaTekst(ut);
  };
  r.onerror = (e: any) => { const k = e?.error; feilKode = k === 'not-allowed' || k === 'service-not-allowed' ? 'mikrofon' : k === 'no-speech' ? 'ingen-tale' : k === 'aborted' ? (stoppetAvOss ? undefined : 'avbrutt') : k || 'feil'; };
  r.onend = () => { if (slutt) return; slutt = true; if (aktiv === r) aktiv = null; paaSlutt(feilKode || (!fikkTale && !stoppetAvOss ? 'ingen-tale' : undefined)); };
  aktiv = r;
  try { r.start(); } catch { aktiv = null; return null; }
  return { stopp: () => { stoppetAvOss = true; try { r.stop(); } catch { } } };
}
