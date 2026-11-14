#!/bin/sh
# Feilsøking: henter første 3D-modellfil gjennom lagringen og viser hoder og de første bytene.
SUPA="${SUPA:-$HOME/supabase-project}"
PW=$(grep '^POSTGRES_PASSWORD=' "$SUPA/.env" | cut -d= -f2-); NOK=$(grep '^SERVICE_ROLE_KEY=' "$SUPA/.env" | cut -d= -f2-)
P=$(docker exec -e PGPASSWORD="$PW" supabase-db psql -h localhost -U supabase_admin -d postgres -At -c "select coalesce(data->'deler'->>0, data->>'path') from public.modeller3d order by created_at desc limit 1" 2>/dev/null)
[ -z "$P" ] && P=$(docker exec -e PGPASSWORD="$PW" supabase-db psql -h localhost -U supabase_admin -d postgres -At -c "select coalesce(data->'deler'->>0, data->>'path') from public.modeller3d limit 1")
echo "Fil: $P"
echo "Størrelse i databasen: $(docker exec -e PGPASSWORD="$PW" supabase-db psql -h localhost -U supabase_admin -d postgres -At -c "select metadata->>'size', metadata->>'mimetype' from storage.objects where bucket_id='filer' and name='$P'")"
for U in http://localhost:8000 https://api.knusleriet.no; do
  echo "== $U"
  curl -s -H "apikey: $NOK" -H "Authorization: Bearer $NOK" -H 'Accept-Encoding: gzip, br' -D /tmp/h.txt -o /tmp/m.bin "$U/storage/v1/object/filer/$P"
  grep -i -E '^(HTTP|content-type|content-encoding|content-length)' /tmp/h.txt
  echo "Mottatt: $(wc -c < /tmp/m.bin) byte. Første byte: $(head -c 4 /tmp/m.bin | od -An -tx1)"
done
