// Lovkrav for én eiendom: hvert krav eieren har ansvar for, med hjemmel, status og hva som dokumenterer at det er oppfylt.
import { useState } from 'react';
import { MALER } from '../lib/catalog';
import { save, toast } from '../lib/store';
import { fd, taskFromMal, today, addDays } from '../lib/utils';
import { tt } from '../lib/i18n';
import { eierStatus, kontrollNA, type KontrollRad, type Lys } from '../lib/eierRapport';
import { editDok, fjernKontrollNA, generatePlan, settKontrollNA, toggleDokNA, visOppgave } from '../lib/actions';
import { Lyspunkt } from '../components/Samsvar';

const St = ({ lys, t }: { lys: Lys; t: string }) => <span className="krav-st"><Lyspunkt lys={lys} /> {tt(t)}</span>;

export function Kravregister({ id }: { id: string }) {
  const [bare, setBare] = useState(false);
  const s = eierStatus(id);
  const K = s.kontroller.filter(k => !bare || (k.lys !== 'green' && !k.na) || k.utenDok);
  const D = s.dok.filter(d => d.krav === 'Lovkrav' || d.status !== 'Ikke relevant').filter(d => !bare || (d.lys !== 'green' && d.lys !== 'grey'));
  const alle = [...s.kontroller.filter(k => !k.na), ...s.dok.filter(d => d.lys !== 'grey')];
  const ok = alle.filter(x => x.lys === 'green' && !(x as KontrollRad).utenDok).length; const rod = alle.filter(x => x.lys === 'red').length;
  const leggInn = async (k: KontrollRad) => { await save('oppgaver', taskFromMal(k.malKey!, MALER, id, k.anleggId || '', addDays(today(), 30))); toast(tt("Kontrollen er lagt inn i kontrollplanen med frist om 30 dager")); };
  const mangler = s.kontroller.filter(k => k.mangler);
  return <>
    <div className="toolbar">
      <p className="small muted" style={{ margin: 0 }}><b>{alle.length}</b> {tt("krav gjelder eiendommen")} · <b style={{ color: 'var(--green)' }}>{ok}</b> {tt("i orden og dokumentert")} · <b style={rod ? { color: 'var(--red)' } : undefined}>{rod}</b> {tt("krever tiltak")}</p>
      <label className="small" style={{ marginLeft: 'auto' }}><input type="checkbox" checked={bare} onChange={e => setBare(e.target.checked)} /> {tt("Vis bare det som ikke er i orden")}</label>
      {mangler.length > 1 && <button className="btn pri sm" onClick={() => generatePlan(id)}>{tt("Legg inn {0} manglende lovpålagte kontroller", mangler.length)}</button>}
    </div>
    <div className="sec"><h2>{tt("Kontroller, tilsyn og service eier skal sørge for")}</h2>
      {K.length ? <div className="tbl-wrap"><table className="krav"><thead><tr><th>{tt("Krav")}</th><th>{tt("Gjelder")}</th><th>{tt("Intervall")}</th><th>{tt("Status")}</th><th>{tt("Dokumentasjon")}</th><th></th></tr></thead><tbody>
        {K.map((k, i) => <tr key={k.id || i} className={k.id ? 'click' : ''} onClick={k.id ? () => visOppgave(k.id!) : undefined}>
          <td><b style={{ fontWeight: 500 }}>{k.navn}</b>{k.hjemmel && <div className="small muted">{k.hjemmel}</div>}</td>
          <td className="small">{k.system === 'Eiendommen' ? tt("Eiendommen") : k.system}</td><td className="small">{k.intervall}</td>
          <td><St lys={k.lys} t={k.status} />{k.frist && <div className="small muted">{tt("Frist")} {fd(k.frist)}</div>}</td>
          <td className="small">{k.na ? <><i>{k.na}</i><div className="muted">{(() => { const n = kontrollNA(s.e, k.malKey!, k.anleggId); return n ? `${n.av || ''} ${fd(n.dato)}` : ''; })()}</div></>
            : k.mangler ? <span className="muted">–</span>
            : k.sist ? <>{tt("Utført")} {fd(k.sist)}<div className={k.utenDok ? 'krav-uten' : 'muted'}>{k.utenDok ? tt("Ingen rapport eller dokumentasjon vedlagt") : k.bevis}</div></>
            : <span className="muted">{tt("Ikke utført ennå")}</span>}</td>
          <td className="krav-h" onClick={e => e.stopPropagation()}>
            {k.mangler && <><button className="btn sm pri" onClick={() => leggInn(k)}>{tt("Legg inn")}</button> <button className="btn sm" onClick={() => settKontrollNA(id, k.malKey!, k.anleggId || '', k.navn)}>{tt("Ikke aktuelt")}</button></>}
            {k.na && <button className="btn sm" onClick={() => fjernKontrollNA(id, k.malKey!, k.anleggId || '')}>{tt("Angre")}</button>}
            {k.utenDok && k.id && <button className="btn sm" onClick={() => visOppgave(k.id!)}>{tt("Legg ved")}</button>}
          </td></tr>)}
      </tbody></table></div> : <p className="muted">{bare ? tt("Alle lovpålagte kontroller er i rute.") : tt("Ingen lovpålagte kontroller registrert.")}</p>}
    </div>
    <div className="sec"><h2>{tt("Dokumenter eier skal kunne legge fram")}</h2>
      {D.length ? <div className="tbl-wrap"><table className="krav"><thead><tr><th>{tt("Dokument")}</th><th>{tt("Krav")}</th><th>{tt("Status")}</th><th>{tt("Dokumentasjon")}</th><th></th></tr></thead><tbody>
        {D.map(d => <tr key={d.type}>
          <td><b style={{ fontWeight: 500 }}>{tt(d.type)}</b>{d.h && <div className="small muted">{d.h}</div>}</td><td className="small">{tt(d.krav)}</td>
          <td><St lys={d.lys} t={d.status} />{d.gyldigTil && <div className="small muted">{tt("Gyldig til")} {fd(d.gyldigTil)}</div>}</td>
          <td className="small">{d.tittel || d.dato ? <>{d.tittel}<div className="muted">{fd(d.dato)}</div></> : <span className="muted">–</span>}</td>
          <td className="krav-h">{(d.status === 'Mangler' || d.status === 'Utløpt') && <><button className="btn sm pri" onClick={() => editDok(undefined, { eiendomId: id, type: d.type })}>{tt("Last opp")}</button> {d.status === 'Mangler' && <button className="btn sm" onClick={() => toggleDokNA(id, d.type)}>{tt("Ikke aktuelt")}</button>}</>}
            {d.status === 'Ikke relevant' && <button className="btn sm" onClick={() => toggleDokNA(id, d.type)}>{tt("Angre")}</button>}</td></tr>)}
      </tbody></table></div> : <p className="muted">{tt("Alle påkrevde dokumenter foreligger.")}</p>}
    </div>
    <p className="small muted">{tt("Listen bygger på eiendommens kategori, land og registrerte systemer. Den er et hjelpemiddel og erstatter ikke eiers egen vurdering av hvilke krav som gjelder.")} {tt("Grå prikk betyr at kravet er vurdert som ikke aktuelt.")}</p>
  </>;
}
