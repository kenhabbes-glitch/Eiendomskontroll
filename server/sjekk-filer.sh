#!/bin/sh
# Feilsøking: lager en signert lenke (som appen gjør) til en tegning og en 3D-fil, og henter dem gjennom Cloudflare.
SUPA="${SUPA:-$HOME/supabase-project}"; API="${API:-https://eiendomskontroll-api.knusleriet.no}"; APP="${APP:-https://eiendomskontroll.knusleriet.no}"
PW=$(grep '^POSTGRES_PASSWORD=' "$SUPA/.env" | cut -d= -f2-); NOK=$(grep '^SERVICE_ROLE_KEY=' "$SUPA/.env" | cut -d= -f2-)
q() { docker exec -e PGPASSWORD="$PW" supabase-db psql -h localhost -U supabase_admin -d postgres -At -c "$1"; }
for P in "$(q "select name from storage.objects where bucket_id='filer' and name not like '%modell%' and (name ilike '%.pdf' or name ilike '%.png' or name ilike '%.jpg') order by created_at desc limit 1")" \
         "$(q "select name from storage.objects where bucket_id='filer' and name like '%modell%' order by metadata->>'size' limit 1")"; do
  echo "=== $P"
  S=$(curl -s -X POST -H "apikey: $NOK" -H "Authorization: Bearer $NOK" -H 'Content-Type: application/json' -d '{"expiresIn":600}' "$API/storage/v1/object/sign/filer/$P")
  echo "Signering: $(echo "$S" | cut -c1-60)…"
  L=$(echo "$S" | sed -n 's/.*"signedURL":"\([^"]*\)".*/\1/p')
  [ -z "$L" ] && continue
  case "$L" in http*) U="$L";; /storage/*) U="$API$L";; *) U="$API/storage/v1$L";; esac
  echo "Lenke starter med: $(echo "$U" | cut -c1-45)…"
  curl -s -H "Origin: $APP" -H 'Accept-Encoding: gzip, br' -D /tmp/h.txt -o /tmp/f.bin "$U"
  grep -i -E '^(HTTP|content-type|content-encoding|content-length|access-control-allow-origin)' /tmp/h.txt
  echo "Mottatt: $(wc -c < /tmp/f.bin) byte. Første byte: $(head -c 8 /tmp/f.bin | od -An -tx1)"
  echo "--- CORS-forhånd:"; curl -s -o /dev/null -D - -X OPTIONS -H "Origin: $APP" -H 'Access-Control-Request-Method: GET' "$U" | grep -i -E '^(HTTP|access-control-allow-(origin|headers))'
done
