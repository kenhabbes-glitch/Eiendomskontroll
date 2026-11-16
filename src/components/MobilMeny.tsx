// Menyen på mobil: bunnmeny med fem knapper som følger rollen, og «Mer»-siden med søk, sist brukt og store fliser.
// På bred skjerm brukes fortsatt sidemenyen (se App.tsx).
import React, { useEffect, useMemo, useState } from 'react';
import { canEdit, isAdmin, isStaff, isTenant, isUtforer, signOut, state } from '../lib/store';
import { tt } from '../lib/i18n';
import { InstallerApp, skannQr } from './Felt';
import { editAvvik } from '../lib/actions';

type Nav = [string, string][];
type Knapp = { k: string; navn: string; ikon: string; badge?: number; handling?: () => void };
const SIST = 'ek-sist-brukt';
const sistListe = (): string[] => { try { return JSON.parse(localStorage.getItem(SIST) || '[]'); } catch { return []; } };

const stiBlock = (I: Record<string, string>, k: string) => I[k] || I.oversikt;
const Ikon = ({ d, s = 24 }: { d: string; s?: number }) => <svg viewBox="0 0 24 24" width={s} height={s} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;

/** De fem knappene nederst, valgt ut fra rollen. Bare sider brukeren har tilgang til tas med. */
export function bunnKnapper(nav: Nav, I: Record<string, string>, antall: Record<string, number>): Knapp[] {
  const har = (k: string) => nav.some(n => n[0] === k);
  const side = (k: string, navn: string): Knapp => ({ k, navn, ikon: stiBlock(I, k), badge: antall[k] || 0 });
  const mer: Knapp = { k: 'mer', navn: 'Mer', ikon: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z' };
  const qr: Knapp = { k: 'skann', navn: 'Skann', ikon: 'M4 8V5a1 1 0 011-1h3M16 4h3a1 1 0 011 1v3M20 16v3a1 1 0 01-1 1h-3M8 20H5a1 1 0 01-1-1v-3M7 12h10', handling: () => skannQr() };
  let L: Knapp[];
  if (isTenant()) L = [side('portal', 'Mitt leieforhold'), side('regelverk', 'Plikter'), mer];
  else if (isUtforer()) L = [side('arbeidsordre', 'Arbeidsordre'), side('meldinger', 'Meldinger'), mer];
  else if (state.me?.rolle === 'tekniker') L = [{ ...side('oversikt', 'Min dag') }, side('runde', 'Runde'), qr, side('avvik', 'Avvik'), mer];
  else if (isAdmin() && !state.me?.plattform) L = [side('oversikt', 'Oversikt'), side('avvik', 'Avvik'), side('dokumenter', 'Dokumenter'), har('vedlikehold') ? side('vedlikehold', 'Plan') : side('eiendommer', 'Eiendommer'), mer];
  else L = [side('oversikt', 'Oversikt'), side('kontroller', 'Kontroll'), side('avvik', 'Avvik'), har('meldinger') ? side('meldinger', 'Meldinger') : side('eiendommer', 'Eiendommer'), mer];
  return L.filter(x => x.k === 'mer' || x.k === 'skann' || har(x.k));
}

export function BunnMeny({ nav, I, antall, aktiv }: { nav: Nav; I: Record<string, string>; antall: Record<string, number>; aktiv: string }) {
  const L = bunnKnapper(nav, I, antall);
  // Husk de siste sidene (til «Sist brukt» på Mer-siden)
  useEffect(() => { if (!aktiv || aktiv === 'mer' || !nav.some(n => n[0] === aktiv) || L.some(x => x.k === aktiv)) return; try { localStorage.setItem(SIST, JSON.stringify([aktiv, ...sistListe().filter(x => x !== aktiv)].slice(0, 3))); } catch { } }, [aktiv]);
  return <nav id="bunnmeny" aria-label={tt("Hovedmeny")}>
    {L.map(x => {
      const pa = x.k === aktiv; const inn = <><span className={'bm-ikon' + (pa ? ' on' : '')}><Ikon d={x.ikon} /></span><span className="bm-tekst">{tt(x.navn)}</span>{!!x.badge && <span className="bm-badge">{x.badge}</span>}</>;
      return x.handling ? <button key={x.k} type="button" className="bm" onClick={x.handling}>{inn}</button>
        : <a key={x.k} href={'#/' + x.k} className={'bm' + (pa ? ' on' : '')} aria-current={pa ? 'page' : undefined}>{inn}</a>;
    })}
  </nav>;
}

/** Store knapper øverst på forsiden (mobil): det man gjør ute på eiendommen */
export function MobilSnarveier() {
  if (isTenant() || isUtforer() || !isStaff()) return null;
  return <div className="mob-snarvei">
    <button type="button" className="ms pri" onClick={() => editAvvik()}><Ikon d="M12 3l10 18H2zM12 10v5M12 18h.01" s={26} />{tt("Nytt avvik")}</button>
    <button type="button" className="ms mork" onClick={() => skannQr()}><Ikon d="M4 8V5a1 1 0 011-1h3M16 4h3a1 1 0 011 1v3M20 16v3a1 1 0 01-1 1h-3M8 20H5a1 1 0 01-1-1v-3M7 12h10" s={26} />{tt("Skann QR")}</button>
    <a className="ms" href="#/runde"><Ikon d="M5 12l4 4L19 6M3 5h6M3 19h6" s={26} />{tt("Kontrollrunde")}</a>
    <a className="ms" href="#/kontroller"><Ikon d={'M9 3h6a1 1 0 011 1v1h2a1 1 0 011 1v14a1 1 0 01-1 1H6a1 1 0 01-1-1V6a1 1 0 011-1h2V4a1 1 0 011-1zM9 13l2 2 4-4'} s={26} />{tt("Kontrollplan")}</a>
  </div>;
}

export function MerSide({ nav, I, grupper, antall }: { nav: Nav; I: Record<string, string>; grupper: [string, string, string, string[]][]; antall: Record<string, number> }) {
  const [q, setQ] = useState('');
  const bunn = new Set(bunnKnapper(nav, I, antall).map(x => x.k));
  const rest = nav.filter(n => !bunn.has(n[0]));
  const tekst = (n: [string, string]) => tt(n[1]).toLowerCase();
  const treff = (n: [string, string]) => !q.trim() || tekst(n).includes(q.trim().toLowerCase());
  const inGr = new Set(grupper.flatMap(g => g[3]));
  const sist = useMemo(() => sistListe().map(k => nav.find(n => n[0] === k)).filter(Boolean) as Nav, []);
  const seksjoner: { navn: string; sider: Nav }[] = [
    ...grupper.map(g => ({ navn: g[1], sider: rest.filter(n => g[3].includes(n[0])) })),
    { navn: 'Flere sider', sider: rest.filter(n => !inGr.has(n[0])) },
  ].map(s => ({ ...s, sider: s.sider.filter(treff) })).filter(s => s.sider.length);
  const flis = (n: [string, string]) => <a key={n[0]} href={'#/' + n[0]} className="mer-flis"><span className="mf-ikon"><Ikon d={stiBlock(I, n[0])} s={26} /></span><span className="mf-navn">{tt(n[1])}</span>{!!antall[n[0]] && <span className="bm-badge mf-b">{antall[n[0]]}</span>}</a>;
  return <div className="mer-side">
    <h1 style={{ margin: '0 0 12px' }}>{tt("Mer")}</h1>
    <input className="mer-sok" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={tt("Søk i menyen …")} aria-label={tt("Søk i menyen")} />
    {!q && sist.length > 0 && <div className="mer-sek"><span className="mer-tit">{tt("Sist brukt")}</span><div className="mer-sist">{sist.map(n => <a key={n[0]} href={'#/' + n[0]} className="mer-pille">{tt(n[1])}</a>)}</div></div>}
    {seksjoner.map(s => <div className="mer-sek" key={s.navn}><span className="mer-tit">{tt(s.navn)}</span><div className="mer-grid">{s.sider.map(flis)}</div></div>)}
    {q && !seksjoner.length && <p className="muted">{tt("Ingen sider passer med søket")}</p>}
    <div className="mer-sek"><span className="mer-tit">{tt("Konto")}</span><div className="mer-grid">
      <button type="button" className="mer-flis" onClick={() => skannQr()}><span className="mf-ikon"><Ikon d="M4 8V5a1 1 0 011-1h3M16 4h3a1 1 0 011 1v3M20 16v3a1 1 0 01-1 1h-3M8 20H5a1 1 0 01-1-1v-3M7 12h10" s={26} /></span><span className="mf-navn">{tt("Skann QR-kode")}</span></button>
      <a className="mer-flis" href="#/profil"><span className="mf-ikon"><Ikon d="M16 11a4 4 0 10-8 0 4 4 0 008 0zM4 21a8 8 0 0116 0" s={26} /></span><span className="mf-navn">{tt("Min profil")}</span></a>
    </div><div style={{ marginTop: 10 }}><InstallerApp /></div><button type="button" className="btn" style={{ marginTop: 12, minHeight: 44 }} onClick={() => signOut()}>{tt("Logg ut")}</button></div>
  </div>;
}
