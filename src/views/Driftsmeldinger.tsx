// Driftsmeldinger fra utleier til leietakerne (f.eks. planlagt vannavstengning). Lagres på eiendommen (data.driftsmeldinger)
// og vises i leietakerportalen. Leietakere kan lese, men ikke endre eiendommen.
import { useState } from 'react';
import { S, kanRedigereE, loggHendelse, save, state } from '../lib/store';
import { formModal, showModal, confirmBox } from '../components/ui';
import { byId, fd, sortBy, today } from '../lib/utils';
import { tt } from '../lib/i18n';

export type Driftsmelding = { id: string; tid: string; tittel: string; tekst: string; utloper?: string; til?: string; av?: string };
/** Aktive meldinger for en leietaker: ikke utløpt, og enten til alle eller rettet mot denne leietakeren. */
export const meldingerFor = (eid: string, leietakerId?: string): Driftsmelding[] =>
  sortBy(((byId('eiendommer', eid) as any)?.driftsmeldinger || []).filter((m: Driftsmelding) => (!m.utloper || m.utloper >= today()) && (!m.til || m.til === leietakerId)), (m: Driftsmelding) => m.tid).reverse();

function Body({ eid }: { eid: string }) {
  const [, ny] = useState(0); const e: any = byId('eiendommer', eid); const L: Driftsmelding[] = sortBy(e?.driftsmeldinger || [], (m: Driftsmelding) => m.tid).reverse();
  const lagre = async (liste: Driftsmelding[]) => { await save('eiendommer', { ...e, driftsmeldinger: liste }); ny(x => x + 1); };
  const leietakere = S.leietakere.filter(l => l.eiendomId === eid).map(l => [l.id, l.navn] as [string, string]);
  const legg = () => formModal({
    title: tt("Ny driftsmelding"), saveTxt: tt("Publiser"),
    fields: [{ k: 'tittel', label: tt("Overskrift"), req: true, ph: tt("F.eks. Vannet stenges onsdag 08–12") }, { k: 'tekst', label: tt("Melding"), type: 'textarea', req: true },
      { k: 'til', label: tt("Til"), type: 'select', options: leietakere, empty: tt("Alle leietakere"), half: true }, { k: 'utloper', label: tt("Vises til og med"), type: 'date', half: true, hint: tt("Tom = vises til du sletter den") }],
    values: { tittel: '', tekst: '', til: '', utloper: '' },
    onSave: async v => { const m: Driftsmelding = { id: crypto.randomUUID(), tid: new Date().toISOString(), tittel: v.tittel, tekst: v.tekst, utloper: v.utloper || undefined, til: v.til || undefined, av: state.me?.navn || state.me?.epost };
      await lagre([m, ...(e.driftsmeldinger || [])]); loggHendelse(`Driftsmelding publisert: ${v.tittel}`, undefined, eid); },
  });
  const slett = async (m: Driftsmelding) => { if (await confirmBox(tt("Slette driftsmeldingen «{0}»?", m.tittel))) await lagre((e.driftsmeldinger || []).filter((x: Driftsmelding) => x.id !== m.id)); };
  return <>
    <p className="small muted" style={{ marginTop: 0 }}>{tt("Meldingene vises øverst i leietakerportalen. Bruk dem til varsler om planlagt arbeid, avstengninger, brannøvelser og lignende.")}</p>
    {L.length ? <div className="list">{L.map(m => <div key={m.id} className="li" style={{ cursor: 'default' }}><div className="grow"><div className="lt">{m.tittel}</div><div className="small muted">{fd(m.tid.slice(0, 10))} · {m.til ? byId('leietakere', m.til)?.navn : tt("Alle leietakere")}{m.utloper ? ' · ' + tt("til ") + fd(m.utloper) : ''}</div><div className="small" style={{ whiteSpace: 'pre-wrap' }}>{m.tekst}</div></div>
      {kanRedigereE(eid) && <button className="btn sm" onClick={() => slett(m)}>{tt("Slett")}</button>}</div>)}</div> : <p className="muted">{tt("Ingen driftsmeldinger.")}</p>}
    {kanRedigereE(eid) && <p><button className="btn pri" onClick={legg}>{tt("+ Ny driftsmelding")}</button></p>}
  </>;
}
export const driftsmeldinger = (eid: string) => showModal(tt("Driftsmeldinger til leietakere"), () => <Body eid={eid} />, { wide: true });
