// «Hva finnes i bygget?» – enkle ja/nei-valg som oppretter systemene, slik at appen vet hvilke lovkrav som gjelder.
import { useState } from 'react';
import { KOMP, MALER, TFM_DEF } from '../lib/catalog';
import { kompMaler } from '../lib/land';
import { S, save, toast } from '../lib/store';
import { byId, nextSysLop } from '../lib/utils';
import { openModal } from '../components/ui';
import { generatePlan } from '../lib/actions';
import { tt } from '../lib/i18n';

const LOV = ['Lovpålagt', 'Forsikringskrav'];
function Body({ eid, isNew, close }: { eid: string; isNew?: boolean; close: () => void }) {
  const e = byId('eiendommer', eid) || ({} as any);
  // Bare systemtyper som utløser lovpålagte kontroller eller forsikringskrav – resten registreres som vanlig under «Systemer og komponenter»
  const typer = Object.entries(KOMP).map(([k, t]) => ({ k, t, lov: kompMaler(k, eid).filter(m => LOV.includes(MALER[m]?.t)) })).filter(x => x.lov.length);
  const finnes = (k: string) => S.anlegg.some(a => a.eiendomId === eid && a.type === k && !a.arkivert);
  const [sel, setSel] = useState<Record<string, boolean>>({}); const [busy, setBusy] = useState(false);
  const grupper = [...new Set(typer.map(x => x.t.g))].sort();
  const valgt = typer.filter(x => sel[x.k] && !finnes(x.k));
  const run = async () => { setBusy(true);
    for (const x of valgt) { const sys = TFM_DEF[x.k]?.[0] || ''; await save('anlegg', { eiendomId: eid, type: x.k, navn: x.t.n, tfmSys: sys, tfmLop: sys ? nextSysLop(eid, sys) : '', levetid: x.t.l || '' }); }
    close(); if (valgt.length) toast(tt("{0} systemer registrert", valgt.length)); setTimeout(() => generatePlan(eid, isNew), 200); };
  return <>
    <div className="mh"><h2>{tt("Hva finnes i bygget?")} – {e.navn}</h2><button className="btn ghost sm" onClick={close}>✕</button></div>
    <div className="mb">
      <p className="muted" style={{ marginTop: 0 }}>{tt("Kryss av for det bygget har. Da vet appen hvilke lovpålagte kontroller som gjelder, og foreslår dem i neste steg. Detaljer som fabrikat og årstall kan du fylle inn senere.")}</p>
      {grupper.map(g => <div key={g}><h4 style={{ margin: '12px 0 6px' }}>{tt(g.replace(/^\d+\s*/, ''))}</h4><div className="checks veiv">{typer.filter(x => x.t.g === g).map(x => { const f = finnes(x.k);
        return <label key={x.k} style={{ opacity: f ? .7 : 1 }}>{f ? <span style={{ color: 'var(--green)', fontWeight: 700, width: 16, display: 'inline-block' }}>✓</span> : <input type="checkbox" checked={!!sel[x.k]} onChange={ev => setSel(s => ({ ...s, [x.k]: ev.target.checked }))} />}
          <span><span className="ct">{tt(x.t.n)}</span><br /><span className="cs">{f ? tt("Allerede registrert") : x.lov.map(m => MALER[m].n.replace(/^.*? – /, '')).join(' · ')}</span></span></label>; })}</div></div>)}
    </div>
    <div className="mf"><button className="btn" onClick={() => { close(); if (isNew) setTimeout(() => generatePlan(eid, true), 200); }}>{isNew ? tt("Hopp over") : tt("Avbryt")}</button>
      <button className="btn pri" disabled={busy} onClick={run}>{valgt.length ? tt("Registrer {0} og vis kontrollene", valgt.length) : tt("Videre til kontrollene")}</button></div>
  </>;
}
export function byggVeiviser(eid: string, isNew?: boolean) { openModal({ wide: true, render: close => <Body eid={eid} isNew={isNew} close={close} /> }); }
