// Tilstandsrapport i NS 3424-format: tilstandsgrad (TG) og konsekvensgrad (KG) per bygningsdel og system,
// med observasjon, anbefalt tiltak og kostnad. Bygger på TG/KG som allerede er registrert på systemene.
// Dette er en egenvurdering fra eier/drift – ikke en tilstandsanalyse utført av kvalifisert rådgiver.
import React, { useMemo, useState } from 'react';
import { S, canEdit, kanDrifteE, save, state, toast, uploadFile } from '../lib/store';
import { openModal } from '../components/ui';
import { AV_LUKKET, KOMP, KG_DEF, TG_DEF } from '../lib/catalog';
import { YEAR, aNavn, byId, compYear, fd, fdU, kostNaa, sysKomp, today, type Rec } from '../lib/utils';
import { KATEGORI, TGER } from '../lib/capexRapport';
import { tt, tu } from '../lib/i18n';

const katFor = (a: Rec) => { const s = String(a.tfmSys || '')[0]; if (s && '234567'.includes(s)) return s; const g = String(KOMP[a.type]?.g || '')[0]; return g && '234567'.includes(g) ? g : '?'; };
const kNok = (n: number) => n ? Math.round(n / 1e3).toLocaleString('nb-NO') : '–';

export function tilstandData(eid: string) {
  const A = S.anlegg.filter(a => !a.arkivert && a.eiendomId === eid && !String(a.type).startsWith('dok_') && a.type !== 'energimerke');
  const rader = A.map(a => {
    const tg = ['TG0', 'TG1', 'TG2', 'TG3'].includes(a.tg) ? a.tg : 'TGIU'; const cy = compYear(a);
    const kost = kostNaa(a) + sysKomp(a).reduce((s, k) => s + kostNaa(k), 0);
    const avvik = S.avvik.filter(x => x.anleggId === a.id && !AV_LUKKET.includes(x.status)).length;
    const lev = +a.levetid || KOMP[a.type]?.l || 0; const alder = +a.aar ? YEAR - +a.aar : null;
    return { a, navn: aNavn(a.id), kat: katFor(a), tg, kg: a.kg || '', obs: String(a.tgKomm || '').trim(), vurdert: [a.tgdato ? fd(a.tgdato) : '', a.tgVurdertAv || ''].filter(Boolean).join(' · '),
      aar: +a.aar || null, lev, alder, rest: cy ? cy - YEAR : null, tiltakAar: cy ? Math.max(cy, YEAR) : null, kost, avvik, grunn: a.tg === 'TG3' ? 'Strakstiltak' : cy && cy <= YEAR ? 'Passert levetid' : cy ? 'Levetid' : 'Mangler installasjonsår eller levetid' };
  });
  const per = (t: string) => rader.filter(r => r.tg === t);
  return { rader, per, ikkeVurdert: per('TGIU').length, kostTg23: rader.filter(r => r.tg === 'TG2' || r.tg === 'TG3').reduce((s, r) => s + r.kost, 0) };
}

async function lagPdf(eid: string, kommentar: string, utarbeidet: string) {
  const { ArkivDoc } = await import('../lib/prosjektArkiv'); const { hex, M } = await import('../lib/arealRapport');
  const e = byId('eiendommer', eid)!; const D = tilstandData(eid);
  const d: any = await ArkivDoc.lag('Tilstandsrapport');
  d.t(`${[e.adresse, e.poststed].filter(Boolean).join(', ')} · ${fdU(today())}`, M, d.y - 8, 8, hex('#5b645f')); d.y -= 14; d.h1(e.navn);
  d.kv([['Eiendom', e.navn], ['Adresse', [e.adresse, e.poststed].filter(Boolean).join(', ')], ['Byggeår', e.byggeaar], ['Bruttoareal (BTA)', e.bta ? e.bta + ' m2' : ''], ['Dato for rapporten', fdU(today())], ['Utarbeidet av', utarbeidet], ['Antall systemer', String(D.rader.length)]]);
  d.h2('Formål og metode');
  d.tekst('Rapporten viser tilstanden til byggets systemer og bygningsdeler slik den er registrert i Eiendomskontroll. Tilstanden er angitt med tilstandsgrad (TG) og konsekvensgrad (KG) etter prinsippene i NS 3424. Gradene bygger på egenkontroller, service- og kontrollrapporter og observasjoner fra drift.');
  d.tab([['Grad', 0.8], ['Betydning', 5]], [...TG_DEF.map(t => ({ c: [t[0], `${t[1]}. ${t[2]}`] })), ...KG_DEF.map(k => ({ c: [k[0], k[1]] }))]);
  d.h2('Sammendrag');
  d.tab([['Tilstandsgrad', 2], ['Antall systemer', 1.2, true], ['Andel', 1, true]], TGER.map(t => { const n = D.per(t).length; return { c: [t, n, D.rader.length ? Math.round(n / D.rader.length * 100) + ' %' : '–'] }; }));
  d.tekst(tu('Systemer med TG2 eller TG3 har til sammen anslått utskiftingskostnad {0} kNOK (dagens priser, der kostnad er registrert).', kNok(D.kostTg23)) + (D.ikkeVurdert ? ' ' + tu('{0} system er ikke vurdert (TGIU).', D.ikkeVurdert) : ''));
  if (kommentar.trim()) { d.h2('Kommentar'); d.tekst(kommentar); }
  const hoved = D.rader.filter(r => r.tg === 'TG3' || r.tg === 'TG2').sort((a, b) => (a.tg < b.tg ? 1 : -1) || b.kost - a.kost);
  if (hoved.length) { d.h2('Tiltak som bør prioriteres (TG2 og TG3)');
    d.tab([['System', 3], ['TG', 0.7], ['KG', 0.7], ['Observasjon og tiltak', 4], ['År', 0.8], ['kNOK', 1, true]], hoved.map(r => ({ c: [r.navn, r.tg, r.kg || '–', r.obs || tu(r.grunn), r.tiltakAar || '–', kNok(r.kost)], farge: [undefined, r.tg === 'TG3' ? hex('#b42318') : hex('#b0701c')] }))); }
  for (const [k, navn] of KATEGORI) {
    const R = D.rader.filter(r => r.kat === k).sort((a, b) => a.navn.localeCompare(b.navn)); if (!R.length) continue;
    d.h2(`${k} ${navn}`);
    d.tab([['System', 3], ['Installert', 1], ['Levetid', 0.9], ['Rest', 0.8], ['TG', 0.7], ['KG', 0.7], ['Vurdert', 1.6], ['Åpne avvik', 0.9, true]], R.map(r => ({ c: [r.navn, r.aar || '–', r.lev ? tu('{0} år', r.lev) : '–', r.rest === null ? '–' : r.rest <= 0 ? 'Passert' : tu('{0} år', r.rest), r.tg, r.kg || '–', r.vurdert || '–', r.avvik || ''], farge: [undefined, undefined, undefined, r.rest !== null && r.rest <= 0 ? hex('#b42318') : undefined] })));
  }
  d.h2('Forutsetninger og begrensninger');
  d.tekst('Dette er en egenvurdering utført av eier eller forvalter på grunnlag av registrerte data. Den er ikke en tilstandsanalyse utført av kvalifisert rådgiver etter NS 3424 og erstatter ikke slik analyse der den kreves, for eksempel ved kjøp, salg, lån eller forsikring. Levetider og kostnader er veiledende. Systemer uten installasjonsår eller levetid er ikke med i beregning av rest levetid.');
  d.h2('Godkjenning'); d.plass(40); d.y -= 24;
  d.page.drawLine({ start: { x: M, y: d.y }, end: { x: M + 200, y: d.y }, thickness: 0.5, color: hex('#9aa39d') }); d.page.drawLine({ start: { x: M + 260, y: d.y }, end: { x: M + 460, y: d.y }, thickness: 0.5, color: hex('#9aa39d') });
  d.t('Forvalter · dato', M, d.y - 10, 7.5, hex('#5b645f')); d.t('Eier · dato', M + 260, d.y - 10, 7.5, hex('#5b645f'));
  return await d.pdf.save();
}

function Body({ eid, close }: { eid?: string; close: () => void }) {
  const [id, setId] = useState(eid || (S.eiendommer.length === 1 ? S.eiendommer[0].id : '')); const [kommentar, setKommentar] = useState(''); const [busy, setBusy] = useState(false);
  const D = useMemo(() => id ? tilstandData(id) : null, [id, S.anlegg, S.avvik]);
  const navn = byId('eiendommer', id)?.navn || '';
  const utarbeidet = state.me?.navn || state.me?.epost || '';
  const bytes = async () => lagPdf(id, kommentar, utarbeidet);
  const last = async () => { setBusy(true); try { const b = await bytes(); const u = URL.createObjectURL(new Blob([b as any], { type: 'application/pdf' })); const a = document.createElement('a'); a.href = u; a.download = `Tilstandsrapport ${navn}.pdf`; a.click(); setTimeout(() => URL.revokeObjectURL(u), 4000); } catch (x: any) { toast(tt("Feil: ") + (x?.message || x)); } finally { setBusy(false); } };
  const lagre = async () => { if (!id || !kanDrifteE(id)) return toast(tt("Mangler skrivetilgang")); setBusy(true);
    try { const b = await bytes(); const fil = await uploadFile(new Blob([b as any], { type: 'application/pdf' }) as any, id, undefined, `Tilstandsrapport ${navn} ${today()}.pdf`.replace(/[\/\\]/g, '-'), 'rapporter'); if (!fil) throw new Error('Opplasting feilet');
      await save('dokumenter', { eiendomId: id, leietakerId: '', type: 'Tilstandsrapport', tittel: `Tilstandsrapport ${today()}`, dato: today(), fil, notat: kommentar.slice(0, 500) }); toast(tt("Rapporten er lagret under Dokumenter.")); }
    catch (x: any) { toast(tt("Feil: ") + (x?.message || x)); } finally { setBusy(false); } };
  return <>
    <div className="mh"><h2>{tt("Tilstandsrapport (NS 3424-format)")}</h2><button className="btn ghost sm" onClick={close}>✕</button></div>
    <div className="mb">
      <p className="small muted" style={{ marginTop: 0 }}>{tt("Samler tilstandsgrad (TG) og konsekvensgrad (KG) per system, med observasjon, rest levetid og kostnad. Dette er en egenvurdering, ikke en tilstandsanalyse fra rådgiver.")}</p>
      {S.eiendommer.length > 1 && <div className="fld"><label>{tt("Eiendom")}</label><select value={id} onChange={e => setId(e.target.value)}><option value="">{tt("Velg eiendom")}</option>{S.eiendommer.map(e => <option key={e.id} value={e.id}>{e.navn}</option>)}</select></div>}
      {D && <div className="kpis" style={{ margin: '8px 0' }}>{TGER.map(t => <div key={t} className="kpi" style={{ cursor: 'default' }}><div className="l">{t}</div><div className="v">{D.per(t).length}</div></div>)}</div>}
      {D && D.ikkeVurdert > 0 && <p className="small" style={{ color: 'var(--amber)' }}>{tt("{0} system er ikke vurdert (TGIU). Sett tilstandsgrad på systemene for en mer nyttig rapport.", D.ikkeVurdert)}</p>}
      <div className="fld"><label>{tt("Kommentar (valgfri)")}</label><textarea value={kommentar} onChange={e => setKommentar(e.target.value)} placeholder={tt("Omfang, forbehold eller oppsummering fra forvalter")} /></div>
    </div>
    <div className="mf"><span className="grow" /><button className="btn" disabled={busy || !id || !D?.rader.length} onClick={last}>{tt("Last ned PDF")}</button>{canEdit() && <button className="btn pri" disabled={busy || !id || !D?.rader.length} onClick={lagre}>{busy ? tt("Lager …") : tt("Lagre under Dokumenter")}</button>}</div>
  </>;
}
export function tilstandsrapport(eid?: string) { if (!S.eiendommer.length) return toast(tt("Ingen eiendommer")); openModal({ wide: true, render: close => <Body eid={eid} close={close} /> }); }
