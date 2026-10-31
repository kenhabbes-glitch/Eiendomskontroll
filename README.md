# Eiendomskontroll

Flerbrukerprogram for eiere av næringseiendom: lovpålagte kontroller og egenkontroller, avvik, TFM-merkede systemer og komponenter, dokumentasjon, levetid og vedlikeholdsplan, leietakers internkontroll, plantegninger og arealoppgave.

**Teknologi:** React + TypeScript (Vite) · Supabase (database, innlogging, fillagring, sanntid) · Netlify (publisering og serverfunksjon)

## Roller

| Rolle | Kan |
|---|---|
| **Administrator** | Alt. Oppretter eiendommer, inviterer brukere, tildeler roller og eiendomstilgang. |
| **Forvalter / driftsleder** | Full drift av eiendommer de har fått tilgang til: systemer, kontroller, avvik, dokumenter, leietakere, arealer, vedlikeholdsplan. |
| **Driftstekniker / serviceleverandør** | Ser kontrollplan, systemer og avvik på tildelte eiendommer, registrerer utførte kontroller og avvik, laster opp servicerapporter. Ser ikke leietakere, leieavtaler eller økonomi. |
| **Leietaker** | Ser eget leieforhold. Melder avvik, følger status, bekrefter internkontrollplikter og laster opp dokumentasjon. |

Tilgangen håndheves i databasen med Row Level Security (`supabase/migrations/001_schema.sql`). Skjermbildene skjuler i tillegg funksjoner rollen ikke har.

---

## Oppsett (ca. 20 minutter)

### 1. Supabase
1. Opprett prosjekt på [supabase.com](https://supabase.com) (velg region **Stockholm (eu-north-1)** eller Frankfurt).
2. **SQL Editor → New query**: lim inn hele innholdet i `supabase/migrations/001_schema.sql` og trykk **Run**. Gjør det samme med `002_innstillinger.sql` (KPI-innstillinger).
3. **Project Settings → API**: noter
   - *Project URL*
   - *anon public* key
   - *service_role* key (hemmelig – bare til Netlify)
4. **Authentication → Users → Add user → Create new user**: lag din egen bruker (e-post + passord, huk av *Auto Confirm User*). Den første brukeren blir automatisk **administrator**.
5. **Authentication → Sign In / Providers**: slå **av** «Allow new users to sign up». Nye brukere kommer da bare inn via invitasjon fra administrator.

### 2. Netlify
1. **Add new site → Import an existing project → GitHub** → velg repoet `eiendomskontroll`.
2. Bygginnstillingene leses fra `netlify.toml` (ingen endring nødvendig).
3. **Site configuration → Environment variables**, legg inn:

   | Navn | Verdi |
   |---|---|
   | `VITE_SUPABASE_URL` | Project URL |
   | `VITE_SUPABASE_ANON_KEY` | anon public key |
   | `SUPABASE_URL` | Project URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role key |

4. **Deploys → Trigger deploy**. Noter adressen (f.eks. `https://eiendomskontroll.netlify.app`).

### 3. Koble innlogging til adressen
I Supabase: **Authentication → URL Configuration**
- *Site URL*: Netlify-adressen
- *Redirect URLs*: legg til `https://DIN-ADRESSE.netlify.app/**`

### 4. E-post (anbefalt før dere inviterer mange)
Supabase sin innebygde e-post er begrenset til noen få e-poster i timen og er ment for testing.
- **Authentication → Emails → SMTP Settings**: koble til egen e-posttjeneste (f.eks. Resend, Brevo, SendGrid eller firmaets Microsoft 365).
- **Authentication → Emails → Templates**: oversett «Invite user» og «Reset password» til norsk.

### 5. Ta i bruk
1. Logg inn med brukeren fra punkt 1.4.
2. Har du data fra prototypen: åpne prototypen → «Sikkerhetskopi og data» → «Kopier alle data», og lim inn under **Import og eksport**.
3. Registrer eiendommer, systemer og leietakere.
4. **Brukere og roller → Inviter bruker**. Velg rolle og hvilke eiendommer brukeren skal ha tilgang til (forvalter/tekniker), eller hvilken leietaker (leietaker).

---

## Utvikling lokalt
```bash
npm install
cp .env.example .env.local   # fyll inn verdiene
npm run dev                  # http://localhost:5173
npm run typecheck            # typekontroll
```
Invitasjon av brukere krever Netlify-funksjonen; kjør `npx netlify dev` for å teste den lokalt.

## Struktur
```
supabase/migrations/001_schema.sql   Tabeller, roller, RLS-regler, fillagring, sanntid
netlify/functions/brukere.ts         Invitere/slette brukere (service-nøkkel, kun admin)
src/lib/catalog.ts                   Kontrollmaler, levetider, TFM-koder, plikter
src/lib/store.ts                     Supabase-klient, data, roller, filer
src/lib/actions.tsx                  Skjemaer og handlinger
src/views/                           Skjermbilder per modul
```

## Datamodell
Hver fagtabell har nøkkelkolonner som styrer tilgang (`eiendom_id`, `leietaker_id`, `system_id`) og et `data`-felt (jsonb) med øvrige felter. Det gjør det enkelt å utvide skjemaene uten databaseendringer. Avvik får løpenummer (`nr`) fra databasen.

Filer lagres i den private bøtten `filer` med sti `{eiendom_id}/felles/...` eller `{eiendom_id}/leietaker/{leietaker_id}/...`, og vises via tidsbegrensede lenker.

## Viktig
- Hjemler, intervaller og NS 3451-koder i katalogen er veiledende og må kontrolleres mot gjeldende regelverk, egen merkeinstruks og forsikringsvilkår.
- Arealer målt fra tegning er veiledende – en formell arealoppgave etter NS 3940 bør kontrollmåles.
- Systemer og komponenter kan plasseres som markører på plantegninger («Systemkart»). Plasseringen lagres i feltet `pos` (tegningId, x, y) på systemet/komponenten.
- Utskiftingskostnad for et system = sentralkost (på systemet) + summen av komponentenes kostnader. Komponenter uten egen levetid følger systemets utskiftingsår; komponenter med kortere egen levetid kommer i tillegg i vedlikeholdsplanen.
- Nåverdi = KPI-justert kostnad i utskiftingsåret diskontert til i dag med kalkulasjonsrenten (Innstillinger, standard 6 %). Lagres i `innstillinger` med nøkkel `rente`.
- Arealrapport (PDF) lages i nettleseren med pdf-lib: valgfrie etasjer og leietakere, plantegninger med arealer og dekning av fellesareal. Kontraktfestet fellesareal settes på leietakeren (`fellesAvtale`: m2 | pst_felles | paslag, `fellesAvtaleVerdi`).
- Serviceavtaler: `SERVICEAVTALE` i catalog.ts angir per systemtype om det er lovkrav om fagkyndig vedlikehold/kontroll (lov) eller anbefalt (anb). Status hentes fra dokumenter av typen «Serviceavtale» koblet via `anleggId`/`anleggIds`.
- `SUPABASE_SERVICE_ROLE_KEY` gir full tilgang til databasen. Den skal bare ligge i Netlify sine miljøvariabler, aldri i koden eller med `VITE_`-prefiks.

## Arbeidsordre (avvik på tegning, tildeling og eksterne utførende)

1. Kjør `supabase/migrations/003_arbeidsordre.sql` i Supabase (SQL Editor → New query → lim inn → Run). Den legger til:
   - rollen **Utførende (ekstern)** som bare ser arbeidsordre tildelt dem,
   - kolonnen `tildelt_id` på avvik, med regler for hva utførende kan endre (status «Under utbedring»/«Utført – til kontroll», logg, vedlegg),
   - tabellen `ao_invitasjon` for lenker sendt på e-post,
   - **hendelseslogg**: alle endringer i alle tabeller logges automatisk av databasen (hvem, når, hva som ble endret).
2. E-post (valgfritt, men anbefalt): opprett konto hos [Resend](https://resend.com), verifiser domenet deres, og legg inn i Netlify → Environment variables:
   - `RESEND_API_KEY` – API-nøkkelen fra Resend
   - `EPOST_FRA` – avsender, f.eks. `Eiendomskontroll <varsel@dittdomene.no>`
   Uten dette åpnes arbeidsordren i brukerens eget e-postprogram i stedet (PDF må da legges ved manuelt).

Flyt: avvik → «Plasser på tegning» → «Tildel» (intern bruker) eller «Send på e-post» (hvem som helst). Mottakeren åpner lenken, oppretter bruker eller logger inn, ser plasseringen, starter jobben, laster opp bilder/filer og kvitterer ut. Avviket går til «Utført – til kontroll», og forvalter godkjenner og lukker eller sender tilbake.
