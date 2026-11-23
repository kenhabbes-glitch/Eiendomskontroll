// Automatisk lesing av innkomne servicerapporter (PDF). Skjer i nettleseren til en ansatt som har appen åpen – ingenting sendes ut av appen.
// Resultatet lagres som innrapport.lesing på kontrollen og vises i oversikten og i godkjenningspanelet.
import { S, save } from './store';
import { byId } from './utils';
import { harModul } from './moduler';
import { koTilGodkjenning } from '../views/KontrollAo';
import { pdfKilder } from '../views/RapportLeser';
import { brukMal, finnLeverandor, hentFelles, hentFellesMal, kontekster, lesInnst, levNokkel, pdfLinjer, vurder } from './rapportLesing';
import { oppsummerLesing, renRapport, trengerLesing } from './rapportVarselServer';

let kjorer = false; const prove = new Set<string>();
/** Leser opptil tre nye rapporter om gangen. Feil ignoreres (rapporten kan fortsatt leses for hånd). */
export async function lesNyeRapporter(maks = 3) {
  const c = renRapport(S.innst.rapportVarsel); if (!c.pa || !c.leseAuto || kjorer) return; kjorer = true;
  try {
    for (const o0 of koTilGodkjenning().filter(o => trengerLesing(o.innrapport) && !prove.has(o.id) && harModul('dokumentlesing', o.eiendomId)).slice(0, maks)) {
      prove.add(o0.id);
      try {
        const o = byId('oppgaver', o0.id)!; const r = o.innrapport; const K = pdfKilder(undefined, r.filer).filter(k => k.pdf); if (!K.length) continue;
        let alle: any[] = []; let ok = '';
        for (const k of K) {
          const { linjer } = await pdfLinjer(await k.hent()); const lev = finnLeverandor(linjer) || r.firma || o.utfores || '';
          await hentFelles(kontekster(o, lev)); const m = lesInnst().maler[levNokkel(lev)] || await hentFellesMal(lev);
          const mf = m ? brukMal(linjer, m) : []; const v = vurder(linjer, kontekster(o, lev)); ok = ok || v.okFunnet;
          alle = alle.concat((mf.length ? mf : v.forslag).filter(f => f.valgt));
        }
        const lesing = oppsummerLesing(alle, r.avvik || [], ok, new Date().toISOString());
        const fersk = byId('oppgaver', o.id); if (fersk?.innrapport) await save('oppgaver', { ...fersk, innrapport: { ...fersk.innrapport, lesing } });
      } catch { /* hopper over */ }
    }
  } finally { kjorer = false; }
}
