import React from 'react';
import { Hjelp } from '../components/Hjelp';
import { KATS, KOMP, MALER, PLIKTER, TFM_KODER } from '../lib/catalog';
import { isTenant } from '../lib/store';
import { intTxt } from '../lib/utils';

// Statisk innhold (ikke brukerdata) – trygt å rendre som HTML
const SEK: [string, string[]][] = [
  ['Brannsikkerhet', ['<b>Forskrift om brannforebygging (FOB) kap. 2</b>: Eier skal kjenne kravene til brannsikkerhet for byggverket og ha dokumentasjon på det (§ 4).', 'Eier skal sørge for kontroll og vedlikehold av bygningsdeler og sikkerhetsinnretninger (brannalarm, sprinkler, nødlys, røykluker, branndører, slokkeutstyr) slik at de virker etter hensikten (§ 5), og av fyringsanlegg (§ 6).', 'Virksomhet som eier byggverk skal ha systematisk sikkerhetsarbeid og dokumentere at pliktene er oppfylt (§§ 9–10).', 'Brukeren (leietaker) har egne plikter i FOB kap. 3: opplæring, rutiner og dokumentasjon. Ansvarsdeling avtales skriftlig.']],
  ['Internkontroll og samordning', ['<b>Internkontrollforskriften</b>: Virksomheter skal ha systematisk HMS-arbeid, kartlegge risiko og gjennomgå internkontrollen årlig (§ 5).', 'Der flere virksomheter deler arbeidsplass/bygg, skal det inngås <b>skriftlig avtale om samordning</b> (§ 6; aml. § 2-2).', 'Eier bør følge opp at leietakerne faktisk har internkontroll – leietakere bekrefter sine plikter direkte i programmet.']],
  ['Elektro', ['<b>Forskrift om elektriske lavspenningsanlegg (FEL)</b>: Eier/bruker er ansvarlig for at anlegget er forsvarlig og holdes i stand. Endringer utføres av registrert virksomhet med samsvarserklæring.', 'Forsikringsselskap krever ofte årlig termografi/el-kontroll (FG). Det lokale eltilsynet (DLE) fører tilsyn.']],
  ['Heis, porter og løfteinnretninger', ['Heiser, rulletrapper og løfteplattformer krever <b>periodisk kontroll av akkreditert kontrollforetak</b> og vedlikehold (pbl. § 29-9). Kommunen fører tilsyn.', 'Motoriserte porter og dører skal kontrolleres jevnlig (maskinforskriften, NS-EN 12453).', 'Fallsikring/forankringspunkter på tak skal kontrolleres årlig.']],
  ['VVS, miljø og energi', ['<b>F-gass</b> (produktforskriften kap. 6a): lekkasjekontroll av kulde- og varmepumpeanlegg over 5 tonn CO₂-ekvivalenter, hyppighet etter fyllmengde.', '<b>Energimerkeforskriften</b>: yrkesbygg over 1000 m² skal ha gyldig energiattest synlig oppslått; varme- og klimaanlegg over effektgrensene skal energivurderes regelmessig.', '<b>Legionella</b> (folkehelseforskriften kap. 3a): risikovurdering og tiltak for bl.a. dusjanlegg tilgjengelig for publikum, kjøletårn og luftskrubbere.', 'Fett- og oljeutskillere tømmes og kontrolleres etter forurensningsforskriften og kommunale krav. Tilbakeslagssikring testes årlig.']],
  ['Dokumentasjon og eiers aktsomhet', ['Ferdigattest/brukstillatelse, brannkonsept, branntegninger, FDV-dokumentasjon og samsvarserklæringer er grunnlaget for drift og tilsyn.', 'Bruksendring og vesentlige ombygginger krever søknad (pbl. § 20-1).', 'Eier har aktsomhetsplikt overfor brukere og tredjepersoner (snø og is fra tak, løse fasadedeler, glatte adkomster).', 'Langsiktig vedlikeholdsplan med tilstandsvurdering (NS 3424) og levetider gir grunnlag for budsjett og verdibevaring.']],
];
const Li = ({ h }: { h: string }) => <li dangerouslySetInnerHTML={{ __html: h }} />;

export function Regelverk() {
  if (isTenant()) return <>
    <div className="head"><div className="grow"><h1>Plikter og regelverk<Hjelp id="side.regelverk" /></h1><p className="sub">Hva som forventes av deg som leietaker</p></div></div>
    <div className="grid g2">
      <div className="card rules"><h3>Brannsikkerhet (forskrift om brannforebygging kap. 3)</h3><ul><Li h="Utpek en ansvarlig for brannsikkerheten i virksomheten og meld navnet til eier." /><Li h="Sørg for at ansatte får opplæring og at det gjennomføres brannøvelser." /><Li h="Hold rømningsveier frie, og meld fra om feil på brannalarm, nødlys, branndører eller slokkeutstyr." /><Li h="Dokumenter rutiner og egenkontroller." /></ul></div>
      <div className="card rules"><h3>Internkontroll (HMS)</h3><ul><Li h="Virksomheten skal ha systematisk HMS-arbeid med risikovurdering og årlig gjennomgang (internkontrollforskriften § 5)." /><Li h="Samordning med eier og andre virksomheter i bygget avtales skriftlig (§ 6)." /></ul></div>
      <div className="card rules"><h3>Vedlikehold etter leieavtalen</h3><ul><Li h="Se fordelingen av vedlikeholdsansvar under «Mitt leieforhold»." /><Li h="Meld skader, feil og avvik i bygget så snart de oppdages." /><Li h="Endret bruk eller ombygging må avklares med eier – det kan kreve søknad (pbl. § 20-1)." /></ul></div>
    </div>
    <h2 className="sec">Standard plikter</h2><div className="tbl-wrap"><table><thead><tr><th>Plikt</th><th>Hjemmel</th></tr></thead><tbody>{Object.values(PLIKTER).map(p => <tr key={p.n}><td>{p.n}</td><td className="small muted">{p.h}</td></tr>)}</tbody></table></div>
  </>;
  const byK: Record<string, any[]> = {}; Object.values(MALER).forEach(m => { (byK[m.k] = byK[m.k] || []).push(m); });
  return <>
    <div className="head"><div className="grow"><h1>Regelverk og eiers plikter<Hjelp id="side.regelverk" /></h1><p className="sub">Hva som hviler på eier av næringseiendom, og grunnlaget for malene i programmet</p></div></div>
    <div className="note" style={{ marginBottom: 16 }}>Oversikten er et arbeidsverktøy, ikke juridisk rådgivning. Krav og intervaller avhenger av byggets bruk, størrelse og anleggenes utførelse, og regelverket endres. Kontroller mot <a href="https://lovdata.no" target="_blank" rel="noopener noreferrer">Lovdata</a>, DSB, DiBK, NVE og Miljødirektoratet, og mot krav fra forsikringsselskapet.</div>
    <div className="grid g2">{SEK.map(([t, l]) => <div key={t} className="card rules"><h3>{t}</h3><ul>{l.map((h, i) => <Li key={i} h={h} />)}</ul></div>)}</div>
    <div className="sec"><h2>Tverrfaglig merkesystem (TFM)</h2><div className="card rules"><p style={{ marginTop: 0 }}>Systemer og komponenter registreres med TFM-kode, slik at samme ID brukes på merkeskilt, tegninger, FDV-dokumentasjon, servicerapporter og i avvik.</p>
      <div className="note mono" style={{ fontSize: 15, color: 'var(--ink)', marginBottom: 10 }}>+01=360.001-JV001%…</div>
      <ul><Li h="<b class='mono'>+01</b> – lokalisering/byggnummer (settes på eiendommen)" /><Li h="<b class='mono'>=360</b> – systemkode etter NS 3451 (her 36 Luftbehandling)" /><Li h="<b class='mono'>.001</b> – systemløpenummer, unikt per systemkode i bygget" /><Li h="<b class='mono'>-JV</b> – komponentkode (to bokstaver) fra TFM-komponenttabellen (JV = vifte)" /><Li h="<b class='mono'>001</b> – komponentløpenummer innen systemet" /><Li h="<b class='mono'>%</b> – valgfri typekode for komponenttype/produkt" /></ul>
      <p className="small muted" style={{ marginBottom: 0 }}>Standardkodene er forslag. Der tredje siffer i NS 3451 er usikkert er hovedgruppen (f.eks. 320) brukt. Følg egen merkeinstruks for porteføljen der den finnes.</p></div>
      <details style={{ marginTop: 10 }}><summary>Komponentkoder (utvalg fra TFM)</summary><div className="tbl-wrap" style={{ marginTop: 8 }}><table><thead><tr><th>Kode</th><th>Komponent</th></tr></thead><tbody>{TFM_KODER.map(([c, n]) => <tr key={c}><td className="mono">{c}</td><td>{n}</td></tr>)}</tbody></table></div></details></div>
    <div className="sec"><h2>Kontrollmaler</h2><div className="tbl-wrap"><table><thead><tr><th>Kontroll</th><th>Type</th><th>Intervall</th><th>Utføres av</th><th>Hjemmel / grunnlag</th></tr></thead><tbody>
      {KATS.filter(k => byK[k]).map(k => <React.Fragment key={k}><tr className="grp"><td colSpan={5}>{k}</td></tr>{byK[k].map(m => <tr key={m.n}><td>{m.n}</td><td><span className="tag">{m.t}</span></td><td className="small">{intTxt({ n: m.i[0], enhet: m.i[1] })}</td><td className="small">{m.u}</td><td className="small muted">{m.h}</td></tr>)}</React.Fragment>)}
    </tbody></table></div></div>
    <div className="sec"><h2>Standard plikter for leietakere</h2><div className="tbl-wrap"><table><thead><tr><th>Plikt</th><th>Hjemmel</th></tr></thead><tbody>{Object.values(PLIKTER).map(p => <tr key={p.n}><td>{p.n}</td><td className="small muted">{p.h}</td></tr>)}</tbody></table></div></div>
    <div className="sec"><h2>Veiledende levetider</h2><div className="tbl-wrap"><table><thead><tr><th>System / bygningsdel</th><th>Gruppe</th><th className="num">Levetid (år)</th></tr></thead><tbody>{Object.values(KOMP).filter(k => k.n !== 'Annet').map(k => <tr key={k.n}><td>{k.n}</td><td className="small muted">{k.g}</td><td className="num">{k.l}</td></tr>)}</tbody></table></div></div>
  </>;
}
