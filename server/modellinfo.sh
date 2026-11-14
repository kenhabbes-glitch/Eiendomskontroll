#!/bin/sh
# Viser hvor store 3D-modellene egentlig er (punkter, trekanter og anslått minnebruk i nettleseren). Leser bare – endrer ingenting.
SUPA="${SUPA:-$HOME/supabase-project}"
sudo find "$SUPA/volumes/storage" -type f -path '*modell*' | while read -r f; do
  navn=$(echo "$f" | sed 's|.*/modell/||; s|/[^/]*$||' | cut -c38-)
  sudo cat "$f" | node -e '
    const zlib = require("zlib"); const biter = []; process.stdin.on("data", d => biter.push(d)).on("end", () => { try {
      const gz = Buffer.concat(biter); const r = zlib.gunzipSync(gz); const hl = r.readUInt32LE(4); const h = JSON.parse(r.subarray(8, 8 + hl).toString());
      const nv = h.grupper.reduce((s, g) => s + g.nv, 0), ni = h.grupper.reduce((s, g) => s + g.ni, 0), mb = x => (x / 1e6).toFixed(0).padStart(5);
      console.log(process.argv[1].padEnd(46), "fil" + mb(gz.length) + " MB · utpakket" + mb(r.length) + " MB · punkter " + (nv / 1e6).toFixed(1) + " mill · trekanter " + (ni / 3e6).toFixed(1) + " mill · grupper " + h.grupper.length + " · objekter " + h.elementer.length + " · i minnet ca." + mb(nv * 18 + ni * 4) + " MB");
    } catch (e) { console.log(process.argv[1], "kunne ikke leses:", e.message); } });' "$navn"
done
