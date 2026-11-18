#!/bin/sh
# Sletter ALLE eiendommer og alt som hører til dem (systemer, komponenter, avvik, oppgaver, leietakere,
# dokumenter, tegninger, 3D-modeller, nøkler, målere …) og filene deres i lagringen.
# Beholder: brukere, organisasjoner, porteføljer, roller, e-postoppsett og innstillinger.
#
# Bruk:   sh server/nullstill-eiendommer.sh --torr      (viser bare hva som ville blitt slettet)
#         sh server/nullstill-eiendommer.sh             (tar sikkerhetskopi, spør, og sletter)
#         sh server/nullstill-eiendommer.sh --logg      (sletter i tillegg hendelsesloggen)
set -eu
SUPA="${SUPA:-$HOME/supabase-project}"
TORR=0; LOGG=0
for a in "$@"; do case "$a" in --torr) TORR=1 ;; --logg) LOGG=1 ;; *) echo "Ukjent valg: $a"; exit 2 ;; esac; done
[ -f "$SUPA/.env" ] || { echo "Finner ikke $SUPA/.env – er Supabase installert der?"; exit 1; }
PW=$(grep '^POSTGRES_PASSWORD=' "$SUPA/.env" | cut -d= -f2-)
sql() { docker exec -i -e PGPASSWORD="$PW" supabase-db psql -h localhost -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -At "$@"; }

echo "=== Eiendommer som slettes ==="
sql -F ' | ' -c "select e.data->>'navn', e.created_at::date,
  (select count(*) from public.oppgaver o where o.eiendom_id=e.id) as oppgaver,
  (select count(*) from public.komponenter k where k.eiendom_id=e.id) as komponenter,
  (select count(*) from public.dokumenter d where d.eiendom_id=e.id) as dokumenter
  from public.eiendommer e order by e.created_at;"
ANT=$(sql -c "select count(*) from public.eiendommer;")
FILER=$(sql -c "select count(*) from storage.objects where bucket_id='filer';")
echo "Totalt: $ANT eiendommer og $FILER filer i lagringen."
[ "$LOGG" = 1 ] && echo "Hendelsesloggen ($(sql -c 'select count(*) from public.hendelseslogg;') rader) slettes også."
echo "Beholdes: brukere, organisasjoner, porteføljer, innstillinger."
[ "$TORR" = 1 ] && { echo "(Tørrkjøring – ingenting er slettet.)"; exit 0; }
[ "$ANT" = 0 ] && [ "$FILER" = 0 ] && { echo "Ingenting å slette."; exit 0; }

echo
echo "Tar ny sikkerhetskopi først …"
sh "$(dirname "$0")/sikkerhetskopi.sh" || { echo "Sikkerhetskopien feilet – avbryter. Ingenting er slettet."; exit 1; }
echo
printf 'Dette kan ikke angres (bortsett fra fra sikkerhetskopien). Skriv  SLETT ALT  for å fortsette: '
read -r SVAR
[ "$SVAR" = "SLETT ALT" ] || { echo "Avbrutt. Ingenting er slettet."; exit 1; }

echo "Sletter eiendommer i databasen …"
if [ "$LOGG" = 1 ]; then
  sql -c "begin; delete from public.eiendommer; delete from public.hendelseslogg; commit;"
else
  sql -c "begin; delete from public.eiendommer; commit;"
fi

echo "Sletter filer i lagringen (via Storage-API-et) …"
KONG=$(grep '^KONG_HTTP_PORT=' "$SUPA/.env" | cut -d= -f2-); KONG="${KONG:-8000}"
sql -c "select name from storage.objects where bucket_id='filer' order by name;" > /tmp/ek-filnavn.$$ || true
SUPA="$SUPA" KONG="$KONG" LISTE="/tmp/ek-filnavn.$$" python3 -I - <<'PY'
import json, os, urllib.request
env = {}
for l in open(os.path.join(os.environ["SUPA"], ".env"), encoding="utf-8"):
    if "=" in l and not l.lstrip().startswith("#"):
        k, v = l.rstrip("\n").split("=", 1); env[k] = v.strip().strip('"').strip("'")
key = env.get("SERVICE_ROLE_KEY", "")
if not key: raise SystemExit("Fant ikke SERVICE_ROLE_KEY i .env – filene er IKKE slettet.")
navn = [l.rstrip("\n") for l in open(os.environ["LISTE"], encoding="utf-8") if l.strip()]
base = "http://localhost:%s/storage/v1/object/filer" % os.environ["KONG"]
slettet = 0
for i in range(0, len(navn), 100):
    gruppe = navn[i:i + 100]
    r = urllib.request.Request(base, data=json.dumps({"prefixes": gruppe}).encode(), method="DELETE",
                               headers={"Authorization": "Bearer " + key, "apikey": key, "Content-Type": "application/json"})
    try: urllib.request.urlopen(r, timeout=60).read(); slettet += len(gruppe)
    except Exception as e: print("Feil ved sletting av gruppe", i // 100 + 1, ":", e)
print("Slettet %d av %d filer." % (slettet, len(navn)))
PY
rm -f "/tmp/ek-filnavn.$$"

echo
echo "=== Kontroll: rader som er igjen i tabeller med eiendom_id (skal være 0) ==="
sql -F ': ' -c "select table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', table_name), false, true, '')))[1]::text
  from information_schema.columns where table_schema='public' and column_name='eiendom_id' order by 1;"
echo "Filer igjen i lagringen: $(sql -c "select count(*) from storage.objects where bucket_id='filer';")"
echo "Ferdig. Appen er nå tom for eiendommer – logg inn og lag den nye."
