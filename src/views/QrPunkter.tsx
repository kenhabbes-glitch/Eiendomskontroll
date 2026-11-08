// Meldepunkter med QR-kode: hvem som helst i bygget kan melde avvik uten innlogging.
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { S, kanRedigereE, loggHendelse, sb, toast } from '../lib/store';
import { formModal, showModal, confirmBox } from '../components/ui';
import { byId } from '../lib/utils';
import { tt } from '../lib/i18n';

type Punkt = { id: string; eiendom_id: string; token: string; navn: string; data: { sted?: string; systemId?: string; aktiv?: boolean } };
const lenke = (t: string) => location.origin + '/#/qr/' + t;
const lagToken = () => { const b = new Uint8Array(18); crypto.getRandomValues(b); return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[c]);

/** Åpner et utskriftsvindu med ett A6-kort per meldepunkt (QR-kode, navn, sted og kort veiledning). */
async function skrivUt(eid: string, P: Punkt[]) {
  const e = byId('eiendommer', eid); const kort: string[] = [];
  for (const p of P) { const img = await QRCode.toDataURL(lenke(p.token), { margin: 1, width: 600, errorCorrectionLevel: 'M' });
    kort.push(`<div class="k"><h2>${esc(tt("Meld avvik eller feil"))}</h2><img src="${img}"><div class="n">${esc(p.navn)}</div>${p.data.sted ? `<div class="s">${esc(p.data.sted)}</div>` : ''}<p>${esc(tt("Skann koden med mobilkameraet. Du trenger ikke å logge inn."))}</p><div class="e">${esc(e?.navn || '')}</div></div>`); }
  const w = window.open('', '_blank'); if (!w) return toast(tt("Nettleseren blokkerte utskriftsvinduet"));
  w.document.write(`<!doctype html><meta charset="utf-8"><title>QR</title><style>body{font-family:system-ui,sans-serif;margin:0}.k{width:100mm;height:140mm;box-sizing:border-box;border:1px dashed #999;display:inline-block;vertical-align:top;text-align:center;padding:8mm;page-break-inside:avoid}.k h2{margin:0 0 4mm;font-size:18pt}.k img{width:70mm;height:70mm}.n{font-size:15pt;font-weight:700;margin-top:3mm}.s{font-size:12pt}.k p{font-size:11pt}.e{font-size:10pt;color:#555}@media print{.k{border:1px dashed #ccc}}</style>${kort.join('')}<script>onload=()=>setTimeout(()=>print(),300)</script>`);
  w.document.close();
}

function Body({ eid }: { eid: string }) {
  const [P, setP] = useState<Punkt[] | null>(null); const [ver, setVer] = useState(0); const ed = kanRedigereE(eid);
  useEffect(() => { let on = true; sb.from('qr_punkter').select('*').eq('eiendom_id', eid).order('created_at').then(({ data, error }) => { if (on) { if (error) toast(error.message); setP((data as any) || []); } }); return () => { on = false; }; }, [eid, ver]);
  const systemer = S.anlegg.filter((a: any) => a.eiendomId === eid && !a.arkivert).map((a: any) => [a.id, a.navn] as [string, string]);
  const rediger = (p?: Punkt) => formModal({
    title: p ? tt("Rediger meldepunkt") : tt("Nytt meldepunkt"),
    fields: [{ k: 'navn', label: tt("Navn"), req: true, ph: tt("F.eks. Hovedinngang 1. etg") }, { k: 'sted', label: tt("Sted (vises for melder)"), ph: tt("Etasje, rom, sone …") },
      { k: 'systemId', label: tt("Knyttet til system (valgfritt)"), type: 'select', options: systemer, empty: tt("– ingen –") }],
    values: { navn: p?.navn || '', sted: p?.data.sted || '', systemId: p?.data.systemId || '' },
    onSave: async v => {
      const data = { ...(p?.data || {}), sted: v.sted, systemId: v.systemId || '', aktiv: p?.data.aktiv !== false };
      const r = p ? await sb.from('qr_punkter').update({ navn: v.navn, data }).eq('id', p.id) : await sb.from('qr_punkter').insert({ eiendom_id: eid, token: lagToken(), navn: v.navn, data });
      if (r.error) { toast(r.error.message); return false; }
      if (!p) loggHendelse(`Opprettet QR-meldepunkt «${v.navn}»`, undefined, eid); setVer(x => x + 1);
    } });
  const av = async (p: Punkt) => { const r = await sb.from('qr_punkter').update({ data: { ...p.data, aktiv: p.data.aktiv === false } }).eq('id', p.id); if (r.error) return toast(r.error.message); setVer(x => x + 1); };
  const slett = async (p: Punkt) => { if (!(await confirmBox(tt("Slette meldepunktet «{0}»? Utskrevne QR-koder slutter å virke.", p.navn)))) return; const r = await sb.from('qr_punkter').delete().eq('id', p.id); if (r.error) return toast(r.error.message); loggHendelse(`Slettet QR-meldepunkt «${p.navn}»`, undefined, eid); setVer(x => x + 1); };
  return <>
    <p className="small muted" style={{ marginTop: 0 }}>{tt("Skriv ut QR-koder og heng dem opp i bygget. Alle som skanner dem kan melde avvik med bilde uten å logge inn. Meldingene kommer inn som avvik med kilde «QR-melding».")}</p>
    {!P ? <p className="muted">{tt("Laster …")}</p> : P.length ? <div className="tbl-wrap"><table><thead><tr><th>{tt("Navn")}</th><th>{tt("Sted")}</th><th>{tt("Status")}</th><th /></tr></thead><tbody>
      {P.map(p => <tr key={p.id}><td><b style={{ fontWeight: 500 }}>{p.navn}</b></td><td className="small">{p.data.sted || ''}</td><td className="small">{p.data.aktiv === false ? <span className="chip">{tt("Av")}</span> : <span className="chip green">{tt("Aktiv")}</span>}</td>
        <td style={{ whiteSpace: 'nowrap' }}><a className="btn sm" href={lenke(p.token)} target="_blank" rel="noopener noreferrer">{tt("Åpne")}</a>{ed && <> <button className="btn sm" onClick={() => rediger(p)}>{tt("Rediger")}</button> <button className="btn sm" onClick={() => av(p)}>{p.data.aktiv === false ? tt("Slå på") : tt("Slå av")}</button> <button className="btn sm" onClick={() => slett(p)}>{tt("Slett")}</button></>}</td></tr>)}
    </tbody></table></div> : <p className="muted">{tt("Ingen meldepunkter ennå.")}</p>}
    <p>{ed && <button className="btn pri" onClick={() => rediger()}>{tt("+ Nytt meldepunkt")}</button>} {!!P?.length && <button className="btn" onClick={() => skrivUt(eid, P.filter(p => p.data.aktiv !== false))}>{tt("Skriv ut QR-koder")}</button>}</p>
  </>;
}
export const qrPunkter = (eid: string) => showModal(tt("QR-meldepunkter"), () => <Body eid={eid} />, { wide: true });
