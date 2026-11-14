#!/bin/sh
# Legger inn filtilgang, brukertrigger og sanntid etter flytting av databasen.
SUPA="${SUPA:-$HOME/supabase-project}"; PW=$(grep '^POSTGRES_PASSWORD=' "$SUPA/.env" | cut -d= -f2-)
docker cp "$(dirname "$0")/etter-flytting.sql" supabase-db:/tmp/etter-flytting.sql
docker exec -e PGPASSWORD="$PW" supabase-db psql -h localhost -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q -f /tmp/etter-flytting.sql
