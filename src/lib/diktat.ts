// Diktering til tekstfelt via nettleserens talegjenkjenning (Web Speech API).
// Lyden behandles av nettleserleverandøren (Google i Chrome/Edge, Apple i Safari) – ikke av appen eller serveren vår.
import { sprak } from './i18n';
const SPRAK: Record<string, string> = { nb: 'nb-NO', sv: 'sv-SE', da: 'da-DK', en: 'en-GB', es: 'es-MX' };
const SR = (): any => (typeof window === 'undefined' ? null : (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
export const diktatStotte = () => !!SR();

export type Diktat = { stopp: () => void };
/** Starter diktering. `grunn` er teksten som allerede står i feltet; `paaTekst` får hele den nye teksten fortløpende. */
export function startDiktat(grunn: string, paaTekst: (t: string) => void, paaSlutt: (feil?: string) => void): Diktat | null {
  const R = SR(); if (!R) return null;
  const r = new R(); r.lang = SPRAK[sprak()] || 'nb-NO'; r.continuous = true; r.interimResults = true;
  let ferdig = '';
  const settSammen = (a: string, b: string) => (a && b ? a.replace(/\s+$/, '') + ' ' : a) + b;
  r.onresult = (e: any) => {
    let mellom = '';
    for (let i = e.resultIndex; i < e.results.length; i++) { const t = String(e.results[i][0]?.transcript || ''); if (e.results[i].isFinal) ferdig = settSammen(ferdig, t.trim()); else mellom += t; }
    let ut = settSammen(grunn, settSammen(ferdig, mellom.trim()));
    if (!grunn && ut) ut = ut.charAt(0).toUpperCase() + ut.slice(1);
    paaTekst(ut);
  };
  r.onerror = (e: any) => paaSlutt(e?.error === 'not-allowed' || e?.error === 'service-not-allowed' ? 'mikrofon' : e?.error === 'no-speech' || e?.error === 'aborted' ? undefined : e?.error || 'feil');
  r.onend = () => paaSlutt();
  try { r.start(); } catch { return null; }
  return { stopp: () => { try { r.stop(); } catch { } } };
}
