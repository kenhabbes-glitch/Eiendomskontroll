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
| `scripts/flytt-filer.mjs` | Kopierer alle filer fra gammel til ny Supabase-lagring |

Appen virker fortsatt på Netlify som før; disse filene brukes bare på egen server.
