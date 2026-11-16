// «Foreslå fra bilde» i nytt avvik: leser tekst på bildet (skilt, typeskilt, etiketter) lokalt i nettleseren, og foreslår system,
// alvorlighet, tittel og plassering ut fra ordene. Ingen AI-tjeneste. Ingenting fylles ut før brukeren trykker «Bruk forslag».
import { useState } from 'react';
import { tt } from '../lib/i18n';
import { aNavn, byId } from '../lib/utils';
import { S } from '../lib/store';
import { tolk } from '../lib/innboks';
import { ocrLinjer } from '../lib/rapportLesing';
import { foreslaAvvik, type AvvikForslag } from '../lib/avvikFoto';

type F = AvvikForslag & { anleggId: string; aGrunn: string; lest: number };
export function AvvikFoto({ v, set }: { v: any; set: (p: any) => void }) {
  const bilder: File[] = (v.bilder || []).filter((f: File) => f?.type?.startsWith('image/'));
  const [busy, setBusy] = useState(false); const [p, setP] = useState(0); const [f, setF] = useState<F | null>(null); const [feil, setFeil] = useState('');
  if (!bilder.length && !f) return <div className="small muted">{tt("Legg til et bilde først, så kan appen foreslå system, alvorlighet og tittel ut fra teksten på bildet.")}</div>;
  const kjor = async () => { setBusy(true); setFeil(''); setP(0); let linjer: string[] = [];
    try { for (const b of bilder.slice(0, 3)) linjer.push(...await ocrLinjer(await b.arrayBuffer(), false, x => { if (x >= 0) setP(x); }, 1)); } catch { setFeil(tt("Kunne ikke lese tekst fra bildet (trenger nett første gang). Forslaget bygger på det du har skrevet.")); }
    const navn = bilder.map(b => b.name).join(' '); const skrevet = [v.tittel, v.beskrivelse, v.plassering].filter(Boolean).join(' ');
    const t = v.eiendomId ? tolk(navn, linjer, v.eiendomId) : null; const tekstAlt = [linjer.join(' '), navn, skrevet].join(' '); const dl = foreslaAvvik(tekstAlt).typer; let aGrunn2 = '';
    let anleggId = v.anleggId || t?.anleggId || ''; if (!anleggId && v.eiendomId && dl.length) { const m = S.anlegg.filter(a => a.eiendomId === v.eiendomId && !a.arkivert && dl.includes(a.type)); if (m.length === 1) { anleggId = m[0].id; aGrunn2 = tt("byggedelen nevnt i teksten"); } }
    const sysNavn = anleggId ? aNavn(anleggId) : ''; const fs = foreslaAvvik([linjer.join(' '), navn, skrevet].join(' '), sysNavn);
    setF({ ...fs, anleggId, aGrunn: v.anleggId ? '' : t?.aGrunn || aGrunn2, lest: linjer.join('').length }); setBusy(false); };
  const bruk = () => { if (!f) return; const x: any = { alv: f.alv.alv };
    if (f.anleggId && !v.anleggId) x.anleggId = f.anleggId; if (f.tittel && !String(v.tittel || '').trim()) x.tittel = f.tittel; if (f.plassering && !v.plassering) x.plassering = f.plassering; set(x); setF(null); };
  return <div>
    {!f && <button type="button" className="btn sm" disabled={busy} onClick={kjor}>{busy ? tt("Leser bildet … {0} %", Math.round(p * 100)) : tt("Foreslå fra bilde")}</button>}
    {feil && <p className="small" style={{ color: 'var(--amber)' }}>{feil}</p>}
    {f && <div className="note small" style={{ color: 'var(--ink)' }}>
      <b>{tt("Forslag")}</b>{f.lest < 15 && <span className="muted"> · {tt("fant lite tekst på bildet")}</span>}
      <div>{tt("System")}: {f.anleggId ? <>{aNavn(f.anleggId)}{f.aGrunn && <span className="muted"> ({f.aGrunn})</span>}{byId('anlegg', f.anleggId)?.id === v.anleggId && <span className="muted"> ({tt("allerede valgt")})</span>}</> : <span className="muted">{tt("ikke funnet")}</span>}</div>
      <div>{tt("Alvorlighet")}: <b>{f.alv.alv}</b>{f.alv.ord.length > 0 && <span className="muted"> ({tt("ord")}: {f.alv.ord.join(', ')})</span>}</div>
      {f.merknad && <div style={{ color: 'var(--amber)', margin: '4px 0' }}>⚠ {tt(f.merknad)}</div>}
      {!f.feil && !f.alv.ord.length && !f.anleggId && <div className="muted">{tt("Fant ingen kjente ord. Skriv kort hva som er feil, for eksempel «hakk i vegg», «flekk i tak» eller «løs list».")}</div>}
      <div>{tt("Tittel")}: {f.tittel || <span className="muted">{tt("ingen forslag")}</span>}</div>
      {f.plassering && <div>{tt("Plassering")}: {f.plassering}</div>}
      <div className="toolbar" style={{ margin: '6px 0 0' }}><button type="button" className="btn sm pri" onClick={bruk}>{tt("Bruk forslag")}</button><button type="button" className="btn sm ghost" onClick={() => setF(null)}>{tt("Forkast")}</button></div>
      <p className="muted" style={{ margin: '4px 0 0' }}>{tt("Forslag fra ord, ikke fra selve motivet. Kontroller før du lagrer. Skriv gjerne noen ord om hva som er feil, så blir forslaget bedre.")}</p></div>}
  </div>;
}
