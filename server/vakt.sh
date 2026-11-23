#!/bin/sh
# Driftsvakt: sjekker at appen, databasen, sikkerhetskopien, disken, tunnelen og nattjobbene er i orden, og varsler hvis ikke.
# Kjøres hvert 10. minutt fra cron (se server/README.md). Skriver ingenting når alt er OK. Viser aldri passord eller nøkler.
# Varsler via appen (push til administratorer og e-post til DRIFT_EPOST i .env.server). Valgfritt: HEALTHCHECK_URL i .env.server
# (f.eks. fra healthchecks.io) får et signal hver gang alt er OK, og varsler deg selv hvis hele serveren er nede.
ROT="$(cd "$(dirname "$0")/.." && pwd)"
ENVFIL="${ENVFIL:-$ROT/.env.server}"; SUPA="${SUPA:-$HOME/supabase-project}"; MAL="${MAL:-$HOME/sikkerhetskopi}"
STATE="${STATE:-$HOME/.vakt-status}"; APP="${APP_URL:-http://127.0.0.1:8080}"; MINFRI="${MIN_DISK_FRI:-15}"
env_v() { [ -f "$ENVFIL" ] && grep "^$1=" "$ENVFIL" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'"; }
KEY=$(env_v SUPABASE_SERVICE_ROLE_KEY); HC=$(env_v HEALTHCHECK_URL)
PW=$(grep '^POSTGRES_PASSWORD=' "$SUPA/.env" 2>/dev/null | cut -d= -f2-)
NA=$(date +%s); P=""
fei() { P="$P$1
"; }
sql() { docker exec -e PGPASSWORD="$PW" supabase-db psql -h localhost -U supabase_admin -d postgres -At -c "$1" 2>/dev/null; }

# 1. Appen
[ "$(curl -fsS -m 8 "$APP/helse" 2>/dev/null)" = "ok" ] || fei "Appen svarer ikke på /helse"
# 2. Databasen
[ "$(sql 'select 1')" = "1" ] || fei "Databasen svarer ikke"
# 3. Sikkerhetskopi: ny database-fil siste 26 timer, og ikke tom
SISTE=$(find "$MAL" -name 'database-*.sql.gz' -mmin -1560 -size +10k 2>/dev/null | head -1)
[ -n "$SISTE" ] || fei "Ingen gyldig sikkerhetskopi av databasen de siste 26 timene"
# 4. Disk
BRUKT=$(df -P "$HOME" 2>/dev/null | awk 'NR==2 {gsub("%","",$5); print $5}')
if [ -n "$BRUKT" ] && [ $((100 - BRUKT)) -lt "$MINFRI" ]; then fei "Disken er $BRUKT % full (under $MINFRI % ledig)"; fi
# 5. Tjenester
DOCKERFEIL=$(docker ps --format '{{.Names}} {{.Status}}' 2>/dev/null | grep -Ei 'unhealthy|restarting' | awk '{print $1}' | tr '\n' ' ')
[ -z "$DOCKERFEIL" ] || fei "Containere med feil: $DOCKERFEIL"
if command -v systemctl >/dev/null 2>&1; then systemctl is-active --quiet cloudflared 2>/dev/null || fei "Tunnelen (cloudflared) kjører ikke"; fi
# 6. Nattjobbene: hjerteslag siste 26 timer (ingen sjekk før første hjerteslag finnes)
ALDER=$(sql "select extract(epoch from now() - max(tid))::bigint from hendelseslogg where handling = 'jobb'")
case "$ALDER" in ''|*[!0-9]*) ;; *) [ "$ALDER" -le 93600 ] || fei "Nattjobbene har ikke kjørt på $((ALDER / 3600)) timer";; esac

sendt() { # $1 = ok|feil
  SIG=$(printf 'ko-auto:%s' "$KEY" | sha256sum | cut -d' ' -f1)
  if [ "$1" = ok ]; then JS='{"action":"drift_varsel","status":"ok"}'
  else L=$(printf '%s' "$P" | sed 's/\\/\\\\/g; s/"/\\"/g' | awk 'NF {printf "%s\"%s\"", (n++ ? "," : ""), $0}'); JS="{\"action\":\"drift_varsel\",\"status\":\"feil\",\"punkter\":[$L]}"; fi
  curl -fsS -m 20 -X POST "$APP/.netlify/functions/arbeidsordre" -H 'Content-Type: application/json' -H "x-ek-cron: $SIG" -d "$JS" >/dev/null 2>&1
}
ping_hc() { [ -n "$HC" ] || return 0; curl -fsS -m 10 --retry 2 "$HC$1" >/dev/null 2>&1; }

if [ -z "$P" ]; then
  ping_hc ""
  if [ -f "$STATE" ]; then echo "$(date '+%F %T') Alt i orden igjen"; sendt ok; rm -f "$STATE"; fi
  exit 0
fi
ping_hc "/fail"
NOKKEL=$(printf '%s' "$P" | cksum | cut -d' ' -f1); SISTN=""; SISTT=0
[ -f "$STATE" ] && { SISTN=$(sed -n 1p "$STATE"); SISTT=$(sed -n 2p "$STATE"); }
if [ "$NOKKEL" != "$SISTN" ] || [ $((NA - ${SISTT:-0})) -ge 86400 ]; then
  echo "$(date '+%F %T') Feil funnet:"; printf '%s' "$P" | sed 's/^/  /'
  if sendt feil || [ -n "$HC" ]; then printf '%s\n%s\n' "$NOKKEL" "$NA" > "$STATE"; else echo "  (kunne ikke sende varsel – prøver igjen om 10 minutter)"; fi
fi
exit 1
