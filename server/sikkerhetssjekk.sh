#!/bin/sh
# Sikkerhetssjekk av serveren. Skriver bare OK / SJEKK – aldri passord eller nøkler. Trygt å ta skjermbilde av.
SUPA="${SUPA:-$HOME/supabase-project}"; E="$SUPA/.env"; APPENV="$(dirname "$0")/../.env.server"
v() { grep "^$1=" "$E" | cut -d= -f2-; }
ok() { echo "  OK     $1"; }; sj() { echo "  SJEKK  $1"; FEIL=$((FEIL+1)); }; FEIL=0
API=$(v SUPABASE_PUBLIC_URL); PW=$(v POSTGRES_PASSWORD)
q() { docker exec -e PGPASSWORD="$PW" supabase-db psql -h localhost -U supabase_admin -d postgres -At -c "$1" 2>/dev/null; }
echo "1. Hemmeligheter (standardverdier fra installasjonen må være byttet)"
for k in JWT_SECRET POSTGRES_PASSWORD DASHBOARD_PASSWORD SECRET_KEY_BASE VAULT_ENC_KEY; do x=$(v $k)
  case "$x" in ''|*your-super-secret*|*this_password_is_insecure*|*your-encryption-key*|*UpNVntn3cDxHJpq99YMc1T1AQgQpc8kfYTuRgBiYa15BLrx8etQoXz3gZv1*) sj "$k har standardverdi eller mangler";; *) [ ${#x} -lt 16 ] && sj "$k er kort (${#x} tegn)" || ok "$k";; esac; done
for k in ANON_KEY SERVICE_ROLE_KEY; do p=$(v $k | cut -d. -f2 | tr '_-' '/+'); case $((${#p} % 4)) in 2) p="$p==";; 3) p="$p=";; esac
  echo "$p" | base64 -d 2>/dev/null | grep -q 'supabase-demo' && sj "$k er demonøkkelen fra installasjonen" || ok "$k"; done
[ "$(v DASHBOARD_USERNAME)" = "supabase" ] && sj "DASHBOARD_USERNAME er standard («supabase») – bytt gjerne" || ok "DASHBOARD_USERNAME"
for f in "$E" "$APPENV"; do [ -f "$f" ] && { [ "$(stat -c %a "$f")" = "600" ] && ok "Rettigheter på $(basename "$f")" || sj "$(basename "$f") kan leses av andre brukere på serveren: chmod 600 $f"; }; done
echo "2. Innlogging"
[ "$(v DISABLE_SIGNUP)" = "true" ] && ok "Åpen registrering er slått av" || sj "DISABLE_SIGNUP er ikke «true» – hvem som helst kan opprette en konto direkte mot API-et"
[ "$(v ENABLE_ANONYMOUS_USERS)" = "true" ] && sj "ENABLE_ANONYMOUS_USERS er på" || ok "Anonyme brukere er av"
[ "$(v ENABLE_EMAIL_AUTOCONFIRM)" = "true" ] && sj "ENABLE_EMAIL_AUTOCONFIRM er på" || ok "E-post må bekreftes"
[ -n "$(v SMTP_HOST)" ] && [ "$(v SMTP_HOST)" != "supabase-mail" ] && ok "E-post (SMTP) er satt opp" || sj "SMTP er ikke satt opp – «Glemt passord» og invitasjoner virker ikke"
echo "3. Databasen"
[ "$(q "select count(*) from pg_policies where schemaname='storage' and policyname like 'filer_%'")" = "4" ] && ok "Filregler (4)" || sj "Filregler mangler – kjør etter-flytting.sh"
[ "$(q "select count(*) from pg_trigger where tgname='on_auth_user_created'")" = "1" ] && ok "Brukertrigger" || sj "Brukertrigger mangler – kjør etter-flytting.sh"
n=$(q "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity and c.relname not like 'ek\\_%'")
[ "$n" = "0" ] && ok "Alle tabeller har radregler påslått" || sj "$n tabeller uten radregler"
n=$(q "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity and exists (select 1 from pg_policies p where p.schemaname='public' and p.tablename=c.relname and p.policyname<>'mfa') and not exists (select 1 from pg_policies p where p.schemaname='public' and p.tablename=c.relname and p.policyname='mfa')")
[ "$n" = "0" ] && ok "Tofaktor-regel på alle tabeller" || sj "$n tabeller mangler tofaktor-regelen – kjør migrer.sh --kjor"
n=$(q "select count(*) from information_schema.role_table_grants where table_schema='public' and grantee='anon'")
[ "$n" = "0" ] && ok "Uinnloggede har ingen tabelltilgang" || sj "Uinnloggede har tabellrettigheter ($n) – kjør migrer.sh --kjor"
echo "4. Det som er synlig fra internett"
if [ -n "$API" ]; then
  c=$(curl -s -o /dev/null -m 10 -w '%{http_code}' "$API/"); [ "$c" = "401" ] || [ "$c" = "200" ] && sj "Supabase Studio (databaseadministrasjon) svarer på $API/ fra internett (kode $c) – bør sperres i Cloudflare" || ok "Studio er ikke åpent på $API/ (kode $c)"
  c=$(curl -s -o /dev/null -m 10 -w '%{http_code}' "$API/pg/"); [ "$c" = "401" ] || [ "$c" = "404" ] || [ "$c" = "403" ] && ok "Databaseverktøyet /pg/ krever nøkkel (kode $c)" || sj "$API/pg/ svarer med kode $c – bør sperres i Cloudflare"
fi
ss -tln 2>/dev/null | grep -E '0\.0\.0\.0:(5432|6543|8000|8443)\b|\[::\]:(5432|6543|8000|8443)\b' >/dev/null && echo "  MERK   Database/API lytter på hele hjemmenettet (5432/6543/8000). Greit så lenge ingen porter er åpnet i routeren." || ok "Ingen databaseporter åpne mot nettverket"
sudo -n true 2>/dev/null && { sudo ufw status 2>/dev/null | grep -q "Status: active" && ok "Brannmur (ufw) er på" || echo "  MERK   Brannmur (ufw) er ikke slått på"; }
echo; [ "$FEIL" = "0" ] && echo "Alt i orden." || echo "$FEIL punkt bør følges opp."
