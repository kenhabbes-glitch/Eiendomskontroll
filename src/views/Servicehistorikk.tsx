// Servicehistorikk for et system eller en komponent: utførte kontroller/service, kommende kontroller
// og avvik registrert mot systemet, med status. Klikk for å åpne og redigere; status kan endres direkte.
import React, { useState } from 'react';
import { S, save, state, toast, kanDrifteE, useStore } from '../lib/store';
import { AV_LUKKET, AV_STATUS } from '../lib/catalog';
import { byId, fd, kNavn, today, type Rec } from '../lib/utils';
import { AlvChip, Chip, DueChip, FileLink, StChip } from '../components/ui';
import { editAvvik, editOppgave, visOppgave } from '../lib/actions';
import { tt } from '../lib/i18n';

type Rad = { d: string; type: 'service' | 'avvik'; key: string; el: React.ReactNode };

export function ServiceHistorikk({ anleggId, komponentId }: { anleggId?: string; komponentId?: string }) {
  useStore();
  const [vis, setVis] = useState<'alle' | 'service' | 'avvik' | 'apne'>('alle');
  const sys = anleggId ? byId('anlegg', anleggId) : null; const komp = komponentId ? byId('komponenter', komponentId) : null;
  const eid = (sys || komp)?.eiendomId; if (!eid) return null;
  const kompIds = sys ? S.komponenter.filter(k => k.anleggId === sys.id).map(k => k.id) : [];
  const gjelder = (x: Rec) => komp ? x.komponentId === komp.id : (x.anleggId === sys!.id || kompIds.includes(x.komponentId));
  // For en komponent: også systemets kontroller der komponenten ble kvittert ut i en komponentvis sjekkliste
  const K = S.oppgaver.filter(o => gjelder(o) || (komp && o.anleggId === komp.anleggId && (o.historikk || []).some((h: any) => h.runde?.kp?.[komp.id]))); const A = S.avvik.filter(a => gjelder(a));
  const kan = kanDrifteE(eid);
  const apne = A.filter(a => !AV_LUKKET.includes(a.status));
  const nyStatus = async (a: Rec, s: string) => {
    const f = byId('avvik', a.id)!; if (f.status === s) return;
    const n: Rec = { ...f, status: s, logg: [...(f.logg || []), { t: new Date().toISOString(), s, k: `Status: ${f.status} → ${s}`, av: state.me?.navn || state.me?.epost }] };
    if (AV_LUKKET.includes(s) && !AV_LUKKET.includes(f.status)) n.lukket = today(); if (!AV_LUKKET.includes(s)) delete n.lukket;
    await save('avvik', n); toast(tt("Avvik #{0}: {1}", f.nr, s));
  };
  const rader: Rad[] = [];
  for (const o of K) for (const [i, h0] of (o.historikk || []).entries()) {
    let h = h0;
    if (komp && !gjelder(o)) { // bare komponentens egen linje fra sjekklisten
      const s = h0.runde?.kp?.[komp.id]; if (!s) continue; const av = (s.avvik || []).length > 0;
      h = { ...h0, res: av ? 'Avvik funnet' : 'OK – ingen avvik', av: s.av ? s.av + (s.firma ? ' (' + s.firma + ')' : '') : h0.av, komm: 'Sjekkliste: ' + (av ? s.avvik.join('; ') : 'alle punkter OK') + (s.komm ? ' – ' + s.komm : ''), avvik: s.avvikIds || [], dokId: h0.dokId };
    }
    const dk = h.dokId && byId('dokumenter', h.dokId);
    rader.push({ d: h.dato || '', type: 'service', key: o.id + i, el: <tr key={o.id + ':' + i} className="click" onClick={() => visOppgave(o.id)}>
      <td className="small" style={{ whiteSpace: 'nowrap' }}>{fd(h.dato)}</td>
      <td><span className="tag">{o.type || tt("Kontroll")}</span></td>
      <td>{o.navn}{o.komponentId && !komp ? <div className="small muted">{kNavn(o.komponentId)}</div> : null}{h.komm && <div className="small muted" style={{ whiteSpace: 'pre-wrap' }}>{h.komm.length > 160 ? h.komm.slice(0, 160) + '…' : h.komm}</div>}
        {dk?.fil && <div className="small" onClick={e => e.stopPropagation()}><FileLink fil={dk.fil} /></div>}</td>
      <td className="small">{h.av || '–'}{h.kilde === 'servicefirma' ? <div className="muted">{tt("via lenke")}</div> : null}</td>
      <td><Chip c={h.res?.startsWith('OK') ? 'green' : h.res === 'Avvik funnet' ? 'amber' : ''}>{h.res || tt("Utført")}</Chip>{(h.avvik || []).length > 0 && <div className="small muted">{h.avvik.length} {tt("avvik")}</div>}</td></tr> });
  }
  for (const a of A) rader.push({ d: a.oppdaget || '', type: 'avvik', key: a.id, el: <tr key={a.id} className="click" onClick={() => editAvvik(a.id)} style={AV_LUKKET.includes(a.status) ? { opacity: .7 } : undefined}>
    <td className="small" style={{ whiteSpace: 'nowrap' }}>{fd(a.oppdaget)}</td>
    <td><span className="tag" style={{ borderColor: 'var(--amber)', color: 'var(--amber)' }}>{tt("Avvik #")}{a.nr}</span></td>
    <td>{a.tittel}{a.komponentId && !komp ? <div className="small muted">{kNavn(a.komponentId)}</div> : null}<div className="small muted">{a.ansvar === 'Leietaker' ? tt("Leietaker") : a.ansvar === 'Felles' ? tt("Felles") : a.ansvar === 'Leverandør/entreprenør' ? (a.utbedresAv || tt("Leverandør")) : tt("Eier")}{a.frist && !AV_LUKKET.includes(a.status) ? tt(" · frist {0}", fd(a.frist)) : ''}{a.lukket ? tt(" · lukket {0}", fd(a.lukket)) : ''}</div></td>
    <td><AlvChip a={a.alv} /></td>
    <td onClick={e => e.stopPropagation()}>{kan ? <select value={a.status} onChange={e => nyStatus(a, e.target.value)} style={{ border: '1px solid var(--line2)', borderRadius: 6, padding: '3px 6px', fontSize: 12.5 }} title={tt("Endre status")}>{AV_STATUS.map(s => <option key={s}>{s}</option>)}</select> : <StChip s={a.status} />}</td></tr> });
  const R = rader.filter(r => vis === 'alle' || (vis === 'service' && r.type === 'service') || (vis === 'avvik' && r.type === 'avvik') || (vis === 'apne' && r.type === 'avvik' && apne.some(a => a.id === r.key))).sort((a, b) => b.d.localeCompare(a.d));
  const kommende = K.filter(o => o.aktiv !== false && o.nesteFrist).sort((a, b) => a.nesteFrist.localeCompare(b.nesteFrist));
  const nService = rader.filter(r => r.type === 'service').length;
  const preset = { eiendomId: eid, anleggId: sys?.id || komp?.anleggId || '', komponentId: komp?.id || '' };
  return <div style={{ marginTop: 18 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <h3 style={{ margin: 0 }}>{tt("Servicehistorikk")}</h3>
      <span className="small muted">{nService} {tt("utført ·")} {A.length} {tt("avvik")}{apne.length ? <> · <b style={{ color: 'var(--amber)' }}>{apne.length} {tt("åpne")}</b></> : ''}</span>
      <span className="grow" style={{ flex: 1 }} />
      {kan && <><button type="button" className="btn sm" onClick={() => editAvvik(undefined, preset)}>{tt("+ Registrer avvik")}</button>
        <button type="button" className="btn sm" onClick={() => editOppgave(undefined, { ...preset, kategori: undefined })}>{tt("+ Ny kontroll")}</button></>}
    </div>
    {kommende.length > 0 && <div className="small" style={{ margin: '8px 0', display: 'flex', gap: 10, flexWrap: 'wrap' }}><span className="muted">{tt("Kommende:")}</span>{kommende.slice(0, 6).map(o => <a key={o.id} href="#" onClick={e => { e.preventDefault(); visOppgave(o.id); }} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><DueChip s={o.nesteFrist} />{o.navn}</a>)}</div>}
    <div className="tabs" style={{ margin: '6px 0' }}>{([['alle', 'Alt'], ['service', 'Kontroller og service'], ['avvik', 'Avvik'], ['apne', `Åpne avvik (${apne.length})`]] as const).map(([k, l]) => <a key={k} href="#" className={vis === k ? 'on' : ''} onClick={e => { e.preventDefault(); setVis(k); }}>{tt(l)}</a>)}</div>
    {R.length ? <div className="tbl-wrap"><table className="small"><thead><tr><th>{tt("Dato")}</th><th>{tt("Type")}</th><th>{tt("Hva")}</th><th>{tt("Utført av / alvorlighet")}</th><th>{tt("Resultat / status")}</th></tr></thead><tbody>{R.map(r => r.el)}</tbody></table></div>
      : <p className="small muted">{tt("Ingenting registrert ennå.")}</p>}
  </div>;
}
