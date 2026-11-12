#!/bin/sh
# Henter siste versjon av appen fra GitHub og bygger på nytt hvis noe er endret.
# Kjøres automatisk hvert 10. minutt (se oppskriften, steg 11), eller for hånd: sh server/oppdater.sh
cd "$(dirname "$0")/.." || exit 1
git fetch -q origin main || exit 1
if [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] && [ "$1" != "--tving" ]; then exit 0; fi
echo "$(date '+%F %T') Ny versjon funnet – bygger …"
git reset -q --hard origin/main
docker compose -f docker-compose.server.yml --env-file .env.server up -d --build && docker image prune -f >/dev/null
echo "$(date '+%F %T') Ferdig: $(git log -1 --format='%h %s')"
