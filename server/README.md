# Eiendomskontroll på egen server

Den fulle oppskriften steg for steg ligger i PDF-en «Eiendomskontroll på egen server». Kort fortalt:

| Fil | Hva den gjør |
| --- | --- |
| `Dockerfile`, `docker-compose.server.yml` | Bygger og kjører appen (port 8080 på serveren) |
| `.env.server.example` | Mal for adresser, nøkler og e-post – kopieres til `.env.server` |
| `server/server.mjs` | Serverer appen og kjører funksjonene som Netlify gjorde, inkl. daglig jobb kl. 06 |
| `server/bygg.mjs` | Bygger `netlify/functions/*.ts` til Node-moduler |
| `server/supabase-tillegg.yml` | Tillegg til selvhostet Supabase: e-postmaler og nøkler for edge-funksjonen |
| `server/oppdater.sh` | Henter ny versjon fra GitHub og bygger på nytt (kjøres hvert 10. minutt) |
| `server/sikkerhetskopi.sh` | Nattlig kopi av database og filer |
| `server/vakt.sh` | Driftsvakt hvert 10. minutt: appen, databasen, sikkerhetskopi, disk, tunnel og nattjobber. Varsler på push og e-post |
| `server/nullstill-eiendommer.sh` | Sletter alle eiendommer og filene deres, beholder brukere (kjør først med `--torr`) |
| `scripts/flytt-filer.mjs` | Kopierer alle filer fra gammel til ny Supabase-lagring |

Appen virker fortsatt på Netlify som før; disse filene brukes bare på egen server.

## Driftsvakt (server/vakt.sh)

Sett opp som kenneth på serveren (kjøres hvert 10. minutt, skriver bare til `~/vakt.log` når noe er galt):

```
(crontab -l 2>/dev/null; echo '*/10 * * * * sh $HOME/eiendomskontroll/server/vakt.sh >> $HOME/vakt.log 2>&1') | crontab -
```

I `.env.server` kan du legge til (start appen på nytt etterpå med `docker compose -f docker-compose.server.yml --env-file .env.server up -d`):

- `DRIFT_EPOST=din@adresse.no` – hit sendes e-post om driftsfeil (krever SMTP)
- `HEALTHCHECK_URL=https://hc-ping.com/<din-kode>` – valgfritt eksternt signal (f.eks. healthchecks.io), slik at du også får vite det hvis hele serveren er nede

Slå på varseltypen «Driftsfeil på serveren» under Innstillinger → Push-varsler for å få push. Test vakten for hånd med `sh server/vakt.sh; echo $?` (0 = alt OK).
