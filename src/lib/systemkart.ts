// Kartet «Slik henger appen sammen»: hvilke data automatikken leser, og hva den sender videre. Ren data, ingen avhengigheter.
export type KartData = { id: string; navn: string; side: string };
export type KartUt = { id: string; navn: string; side: string };
export type KartAuto = { id: string; navn: string; fra: string[]; til: string[]; fast?: boolean };
export const KART_DATA: KartData[] = [
  { id: 'kontroller', navn: 'Kontroller', side: 'kontroller' }, { id: 'avvik', navn: 'Avvik', side: 'avvik' }, { id: 'dokumenter', navn: 'Dokumenter', side: 'dokumenter' },
  { id: 'leietakere', navn: 'Leietakere og leieavtaler', side: 'leietakere' }, { id: 'systemer', navn: 'Systemer og komponenter', side: 'vedlikehold' }, { id: 'meldinger', navn: 'Meldinger (chat)', side: 'meldinger' },
  { id: 'opplaering', navn: 'Brannopplæring', side: 'leietakere' }, { id: 'rapporter', navn: 'Servicerapporter inn', side: 'oversikt' },
];
export const KART_UT: KartUt[] = [
  { id: 'epost', navn: 'E-post', side: '' }, { id: 'push', navn: 'Push-varsler', side: 'innstillinger' }, { id: 'oversikt', navn: 'Oversikt (å gjøre)', side: 'oversikt' }, { id: 'logg', navn: 'Hendelseslogg', side: 'logg' },
];
/** id er den samme som i AUTOMATIKK (src/lib/anbefalt.ts), bortsett fra den faste driftsvakten */
export const KART_AUTO: KartAuto[] = [
  { id: 'ukeoversikt', navn: 'Ukeoversikt til eier', fra: ['kontroller', 'avvik', 'dokumenter'], til: ['epost', 'push'] },
  { id: 'purring', navn: 'Purring på avvik', fra: ['avvik'], til: ['epost', 'logg'] },
  { id: 'eskalering', navn: 'Eskalering til eier', fra: ['avvik'], til: ['epost'] },
  { id: 'avvikuke', navn: 'Ukentlig avviksoversikt', fra: ['avvik'], til: ['epost'] },
  { id: 'fornyelse', navn: 'Fornyelse av dokumenter', fra: ['dokumenter'], til: ['epost', 'logg'] },
  { id: 'leietakerrunde', navn: 'Leietaker-runde', fra: ['leietakere', 'kontroller'], til: ['epost', 'logg'] },
  { id: 'leievakt', navn: 'Leieavtale-vakt', fra: ['leietakere'], til: ['epost', 'oversikt'] },
  { id: 'brannopplaering', navn: 'Brannopplæring på autopilot', fra: ['opplaering', 'leietakere'], til: ['epost', 'logg'] },
  { id: 'investvarsel', navn: 'Investeringsvarsler', fra: ['systemer'], til: ['epost', 'push'] },
  { id: 'chatvarsel', navn: 'Chat-varsler', fra: ['meldinger'], til: ['epost', 'push'] },
  { id: 'rapportvarsel', navn: 'Rapporter til oppfølging', fra: ['rapporter'], til: ['epost', 'push', 'oversikt'] },
  { id: 'driftsvakt', navn: 'Driftsvakt på serveren', fra: [], til: ['epost', 'push', 'logg'], fast: true },
];
