#!/bin/sh
# Kjører nye databaseendringer (supabase/migrations/*.sql) på den selvhostede databasen. Kjøres for hånd:
#   sh ~/eiendomskontroll/server/migrer.sh          viser hva som venter
#   sh ~/eiendomskontroll/server/migrer.sh --kjor   tar sikkerhetskopi og kjører dem
# Første gang registreres 001–025 som allerede kjørt (de fulgte med da databasen ble flyttet).
cd "$(dirname "$0")/.." || exit 1
SUPA="${SUPA:-$HOME/supabase-project}"; PW=$(grep '^POSTGRES_PASSWORD=' "$SUPA/.env" | cut -d= -f2-)
q() { docker exec -i -e PGPASSWORD="$PW" supabase-db psql -h localhost -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -At "$@"; }
q -q -c "create schema if not exists ek_drift; create table if not exists ek_drift.migrasjoner (navn text primary key, kjort timestamptz not null default now());" || exit 1
if [ "$(q -c 'select count(*) from ek_drift.migrasjoner')" = "0" ]; then
  for f in supabase/migrations/*.sql; do n=$(basename "$f"); [ "$(echo "$n" | cut -c1-3)" -le 25 ] 2>/dev/null && q -q -c "insert into ek_drift.migrasjoner (navn) values ('$n') on conflict do nothing"; done
fi
VENTER=""; for f in supabase/migrations/*.sql; do n=$(basename "$f"); [ "$(q -c "select count(*) from ek_drift.migrasjoner where navn='$n'")" = "0" ] && VENTER="$VENTER $f"; done
[ -z "$VENTER" ] && { echo "Databasen er oppdatert – ingen endringer venter."; exit 0; }
echo "Venter på å bli kjørt:"; for f in $VENTER; do echo "  $(basename "$f")"; done
[ "$1" != "--kjor" ] && { echo "Kjør med --kjor for å ta sikkerhetskopi og legge dem inn."; exit 0; }
sh server/sikkerhetskopi.sh || { echo "Sikkerhetskopi feilet – ingenting er endret."; exit 1; }
for f in $VENTER; do n=$(basename "$f")
  { echo "begin;"; cat "$f"; echo; echo "insert into ek_drift.migrasjoner (navn) values ('$n'); commit;"; } | q -q -f - >/dev/null \
    && echo "✓ $n" || { echo "✕ $n feilet – denne og de neste er ikke lagt inn. Send feilmeldingen over til Claude."; exit 1; }
done
docker exec -e PGPASSWORD="$PW" supabase-db psql -h localhost -U supabase_admin -d postgres -q -c "notify pgrst, 'reload schema'" >/dev/null 2>&1
echo "Ferdig."
