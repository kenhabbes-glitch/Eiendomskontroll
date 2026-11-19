// Innholdet i den interaktive brannvernopplæringen for én leietaker. Bygges av brannkortet (eiendommen) og
// leietakerens egne opplysninger, og lagres som et øyeblikksbilde på serveren når eier sender det ut.
import { bv, bvVersjon, binfo, STD_REGLER, aktiveMidl } from './brannvern';
import type { Rec } from './utils';
import type { OplInnhold } from './opplaeringServer';

const linjer = (s: any) => String(s || '').split('\n').map(x => x.trim()).filter(Boolean);

export function byggOpplaering(e: Rec, l: Rec): OplInnhold {
  const b = bv(e); const a = binfo(l).ansvarlig || {}; const midl = aktiveMidl(e);
  const eier = [b.eierAnsvarlig, b.eierTlf].filter(Boolean).join(', ');
  const leder = [a.navn || l.brannvernleder, a.tlf].filter(Boolean).join(', ');
  const steg: OplInnhold['steg'] = [
    { id: 's1', tittel: 'Hvorfor dette er viktig', tekst: [
      `Her er en kort gjennomgang av brannsikkerheten i ${e.navn || 'bygget'}. Den tar omtrent 10 minutter, og det er noen enkle spørsmål underveis.`,
      'Både eier og leietaker har plikter etter forskrift om brannforebygging. Leietaker skal sørge for at alle som arbeider i lokalene kjenner rutinene for varsling, evakuering og slokking – også nyansatte og vikarer.',
      ...(midl.length ? ['Viktig akkurat nå (midlertidige tiltak):', ...midl.map((m: Rec) => '• ' + m.tekst + (m.tiltak ? ' – Tiltak: ' + m.tiltak : ''))] : []),
    ], spm: { id: 'q1', q: 'Hvem har ansvar for at de ansatte kjenner rutinene for brann?', valg: ['Bare brannvesenet', 'Leietaker (virksomheten) sørger for at ansatte er kjent med rutinene', 'Ingen – det er frivillig'], riktig: 1, forklaring: 'Riktig. Virksomheten skal sørge for opplæring og kjennskap til rutinene hos alle som oppholder seg i lokalene.', tips: 'Tenk på hvem som driver virksomheten i lokalene.' } },
    { id: 's2', tittel: 'Hvis du oppdager brann', tekst: [
      ...linjer(b.alarm).length ? ['Slik er alarmen organisert hos oss:', ...linjer(b.alarm)] : ['Alarmorganiseringen bestemmes av bygget – spør brannvernlederen hvis du er usikker.'],
      'Husk: redde personer i umiddelbar fare, varsle (brannalarm og ring 110), og slokk bare hvis det er trygt. Lukk dører etter deg for å begrense røyk og brann.',
    ], spm: { id: 'q2', q: 'Du ser flammer og røyk i et rom. Hva gjør du?', valg: ['Går tilbake til arbeidet og håper det går over', 'Hjelper de som er i fare, varsler (alarm og 110) og slokker bare hvis det er trygt', 'Åpner alle vinduer og dører for å lufte ut'], riktig: 1, forklaring: 'Riktig. Liv går foran verdier. Varsle alltid, og lukk dører for å begrense brannen.', tips: 'Åpne dører gir brannen mer oksygen og sprer røyk.' } },
    { id: 's3', tittel: 'Rømningsveier og dører', tekst: [
      'Rømningsveier, korridorer og trapperom skal alltid være frie. Ingen lagring, møbler eller avfall.',
      'Branndører skal være lukket eller stå på godkjent dørholder. Ikke kil dem opp.',
      'Ikke bruk heis ved brann – bruk trappen.',
    ], spm: { id: 'q3', q: 'Det er mye papp etter en leveranse. Hvor kan du midlertidig sette den?', valg: ['I korridoren utenfor kontoret, bare en liten stund', 'I trapperommet ved siden av trappen', 'Ikke i rømningsveiene – flytt den til et eget sted som ikke er rømningsvei'], riktig: 2, forklaring: 'Riktig. Rømningsveier skal være frie til enhver tid – også «bare en liten stund».' } },
    { id: 's4', tittel: 'Oppstillingsplass', tekst: [
      b.oppstilling ? `Oppstillingsplass: ${b.oppstilling}` : 'Spør brannvernlederen hvor oppstillingsplassen er.',
      'Alle møter på oppstillingsplassen når bygget er forlatt. Der kontrolleres det at alle er ute, og du venter på beskjed fra brannvesenet eller brannvernlederen.',
      ...(b.brannsentral ? [`Brannsentral / nøkkelboks: ${b.brannsentral}`] : []),
    ], spm: { id: 'q4', q: 'Hvorfor skal alle møte på oppstillingsplassen?', valg: ['For å diskutere hva som skjedde', 'For å kontrollere at alle er kommet seg ut', 'For å gå inn igjen så fort alarmen stopper'], riktig: 1, forklaring: 'Riktig. Oppmøte gjør at man raskt ser om noen mangler, så brannvesenet kan få vite det. Gå aldri inn igjen før det er gitt klarsignal.' } },
    { id: 's5', tittel: 'Slokkeutstyr', tekst: [
      'Brannslokkere og brannslanger skal være synlige og tilgjengelige – ikke dekk dem til. Lær deg hvor de nærmeste er og hvordan de brukes.',
      'Slokk bare hvis brannen er liten, du har fri vei ut, og det ikke er mye røyk. Ellers: forlat området og lukk dører.',
    ], spm: { id: 'q5', q: 'Når bør du IKKE forsøke å slokke selv?', valg: ['Når brannen sprer seg raskt eller det er mye røyk', 'Når brannen er liten og du har fri vei ut', 'Når slokkeren er lett å nå'], riktig: 0, forklaring: 'Riktig. Ved rask spredning eller mye røyk er det ikke trygt – forlat området og la brannvesenet ta over.' } },
    { id: 's6', tittel: 'Husregler i bygget', tekst: [...linjer(b.regler || STD_REGLER)],
      spm: { id: 'q6', q: 'Du ser at en branndør er kilt opp, eller en brannslokker mangler. Hva gjør du?', valg: ['Ingenting – det er noen andres ansvar', 'Melder fra til brannvernleder eller eier', 'Fjerner skiltet så det ser ryddigere ut'], riktig: 1, forklaring: 'Riktig. Feil og mangler som svekker brannsikkerheten skal meldes straks.' } },
    { id: 's7', tittel: 'Hvem kan du kontakte', tekst: [
      leder ? `Brannvernleder hos leietaker: ${leder}` : 'Spør hos dere hvem som er brannvernleder.',
      eier ? `Eiers kontaktperson for brannsikkerhet: ${eier}` : '',
      'Nødnummer brann: 110.',
    ].filter(Boolean), spm: { id: 'q7', q: 'Hvilket nummer ringer du ved brann?', valg: ['112', '110', '113'], riktig: 1, forklaring: 'Riktig. 110 er brann. (112 er politi, 113 er ambulanse.)' } },
  ];
  return { tittel: `Brannvernopplæring – ${e.navn || ''} – ${l.navn || ''}`.trim(), steg };
}

export { bvVersjon };
