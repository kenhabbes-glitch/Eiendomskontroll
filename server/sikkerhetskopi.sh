#!/bin/sh
# Nattlig sikkerhetskopi av database og filer. Beholder 14 dager lokalt i ~/sikkerhetskopi.
# Kopier også mappen til en annen disk eller sky (se oppskriften, steg 12) – en kopi på samme PC er ikke nok.
SUPA="${SUPA:-$HOME/supabase-project}"; MAL="${MAL:-$HOME/sikkerhetskopi}"; D=$(date +%F)
mkdir -p "$MAL"
PW=$(grep '^POSTGRES_PASSWORD=' "$SUPA/.env" | cut -d= -f2-)
docker exec -e PGPASSWORD="$PW" supabase-db pg_dumpall -h localhost -U supabase_admin | gzip > "$MAL/database-$D.sql.gz" || { echo "Databasekopi feilet"; exit 1; }
tar -czf "$MAL/filer-$D.tar.gz" -C "$SUPA/volumes" storage || { echo "Filkopi feilet"; exit 1; }
find "$MAL" -name '*.gz' -mtime +14 -delete
echo "$(date '+%F %T') Sikkerhetskopi ferdig: $(du -sh "$MAL" | cut -f1) totalt"
