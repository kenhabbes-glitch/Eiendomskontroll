// Komponentvis sjekkliste: én enkel sjekkliste per komponent (f.eks. hver branndør / hvert nødlys) som kvitteres ut
// etter hvert som man går gjennom bygget. Rene funksjoner – brukes både i appen og i serverfunksjonen (lenke til servicefirma).

export type SjekkPunkt = { id: string; t: string; aar?: boolean };
export type SjekkMal = { id: string; navn: string; koder: string[]; punkter: SjekkPunkt[]; beskr?: string; std?: boolean; endret?: boolean };
export type Svar = 'ok' | 'avvik' | 'ia';
export type KompSvar = { t: string; av?: string; firma?: string; svar: Record<string, Svar>; komm?: string; avvik?: string[]; filer?: any[]; avvikIds?: string[]; kilde?: string };
export type Runde = { start: string; malId?: Record<string, string>; maler: Record<string, SjekkMal>; kp: Record<string, KompSvar> };

const p = (id: string, t: string, aar?: boolean): SjekkPunkt => (aar ? { id, t, aar } : { id, t });

/** Standardmaler. Punkter merket «aar» tas bare med på årlige (eller sjeldnere) kontroller. */
export const STD_SJEKKMALER: SjekkMal[] = [
  { id: 'nodlys', navn: 'Nødlys / ledelys', koder: ['UN'], std: true,
    beskr: 'Etter NS-EN 50172. Månedlig: kort funksjonstest. Årlig: i tillegg full varighetstest og batterisjekk.',
    punkter: [
      p('hel', 'Armatur hel, ren og godt festet'),
      p('lader', 'Ladeindikator lyser (armaturen har strøm)'),
      p('test', 'Funksjonstest: tenner ved simulert strømbrudd / testknapp'),
      p('skilt', 'Ledeskilt / piktogram viser riktig retning og er godt synlig'),
      p('fritt', 'Ikke skjult eller blokkert av inventar, skilt eller dekor'),
      p('varighet', 'Varighetstest: lyser i hele dimensjonert tid (normalt 1 t eller 3 t)', true),
      p('batteri', 'Batteri i orden (alder / utskiftingsdato kontrollert)', true),
      p('merket', 'Merket med dato for kontroll', true),
    ] },
  { id: 'branndor', navn: 'Branndør', koder: ['DB'], std: true,
    beskr: 'Egenkontroll av branndører etter forskrift om brannforebygging § 5 (brannskiller skal opprettholde sin funksjon).',
    punkter: [
      p('lukker', 'Lukker av seg selv fra helt åpen stilling (dørlukker virker)'),
      p('las', 'Går i lås – fallen fanger uten å måtte dyttes'),
      p('pakning', 'Pakninger og brannlister hele og på plass'),
      p('skade', 'Dørblad, karm og eventuelt glass uten skader'),
      p('kile', 'Ikke kilt eller holdt åpen med gjenstander'),
      p('magnet', 'Dørholdemagnet slipper ved brannalarm / test (hvis montert)'),
      p('merking', 'Merket med brannklasse og skilt «Branndør – holdes lukket»'),
      p('gjennomf', 'Gjennomføringer og fuger rundt karmen tettet'),
      p('hengsler', 'Hengsler, dørlukker og beslag uten slitasje eller oljelekkasje', true),
    ] },
  { id: 'generell', navn: 'Generell komponentkontroll', koder: ['*'], std: true,
    beskr: 'Brukes for komponenttyper uten egen mal når komponentvis sjekkliste er slått på for kontrollen.',
    punkter: [
      p('funnet', 'Komponenten er funnet og tilgjengelig'),
      p('visuell', 'Visuell kontroll – ingen skader'),
      p('funksjon', 'Funksjon testet og i orden'),
      p('merking', 'Merking / skilting i orden'),
    ] },
];

/** Standardmaler med organisasjonens endringer og egne maler (samme id = endret standard). */
export function sjekkMaler(egne?: SjekkMal[] | null): SjekkMal[] {
  const E = (egne || []).filter(m => m && m.id && Array.isArray(m.punkter));
  const std = STD_SJEKKMALER.map(s => { const e = E.find(m => m.id === s.id); return e ? { ...e, std: true, endret: true } : s; });
  return [...std, ...E.filter(m => !STD_SJEKKMALER.some(s => s.id === m.id)).map(m => ({ ...m, std: false }))];
}

export function malForKode(maler: SjekkMal[], kode?: string): SjekkMal | null {
  const k = String(kode || '').toUpperCase();
  return maler.find(m => m.koder.some(c => c.toUpperCase() === k)) || null;
}
export const generellMal = (maler: SjekkMal[]) => maler.find(m => m.koder.includes('*')) || STD_SJEKKMALER[2];

/** Årlig eller sjeldnere? */
export function erAarlig(iv?: { n?: number; enhet?: string } | null): boolean {
  const n = +(iv?.n || 1); const e = String(iv?.enhet || 'år');
  return e.startsWith('år') ? true : e.startsWith('mnd') ? n >= 12 : false;
}
export const punkterFor = (mal: SjekkMal, iv?: any) => mal.punkter.filter(x => !x.aar || erAarlig(iv));

/** Komponenter som skal ha egen sjekkliste for en kontroll. Tom liste = vanlig utkvittering. */
export function kompForKontroll(o: any, komponenter: any[], maler: SjekkMal[]): any[] {
  if (!o || o.komponentId || !o.anleggId || o.kompSjekk === 'av') return [];
  const K = komponenter.filter(k => k.anleggId === o.anleggId);
  if (!K.length) return [];
  if (o.kompSjekk === 'pa') return K;
  return K.some(k => malForKode(maler, k.kode)) ? K : [];
}

/** Lag en ny runde: kopier malene som trengs, så pågående runder ikke endres om malen redigeres. */
export function nyRunde(K: any[], maler: SjekkMal[], start: string): Runde {
  const malId: Record<string, string> = {}; const brukt: Record<string, SjekkMal> = {};
  for (const k of K) { const m = malForKode(maler, k.kode) || generellMal(maler); malId[k.id] = m.id; brukt[m.id] = { id: m.id, navn: m.navn, koder: m.koder, punkter: m.punkter }; }
  return { start, malId, maler: brukt, kp: {} };
}
export const malIRunde = (r: Runde, kid: string): SjekkMal => r.maler[r.malId?.[kid] || ''] || Object.values(r.maler)[0] || STD_SJEKKMALER[2];

export function rundeStatus(r: Runde | null | undefined, K: any[]) {
  const kp = r?.kp || {}; let ok = 0, avvik = 0;
  for (const k of K) { const s = kp[k.id]; if (!s) continue; if ((s.avvik || []).length || Object.values(s.svar || {}).includes('avvik')) avvik++; else ok++; }
  return { antall: K.length, ok, avvik, gjort: ok + avvik, igjen: K.length - ok - avvik };
}

/** Rens et svar fra klienten (server og app). */
export function renKompSvar(x: any, mal: SjekkMal, iv: any): KompSvar | null {
  if (!x || typeof x !== 'object') return null;
  const svar: Record<string, Svar> = {};
  for (const pt of punkterFor(mal, iv)) { const v = x.svar?.[pt.id]; if (v === 'ok' || v === 'avvik' || v === 'ia') svar[pt.id] = v; }
  const avvik = (Array.isArray(x.avvik) ? x.avvik : []).map((a: any) => String(a || '').trim().slice(0, 300)).filter(Boolean).slice(0, 10);
  return { t: new Date().toISOString(), av: String(x.av || '').slice(0, 160), firma: x.firma ? String(x.firma).slice(0, 160) : undefined, svar, komm: String(x.komm || '').slice(0, 1000), avvik };
}
