// Kopierer alle filer (tegninger, bilder, dokumenter, 3D-modeller) fra gammel til ny Supabase-lagring.
// Bruk:  GML_URL=https://xxxx.supabase.co GML_NOKKEL=<service_role gammel> NY_URL=https://api.dittdomene.no NY_NOKKEL=<SERVICE_ROLE_KEY ny> node scripts/flytt-filer.mjs
// Trygt å kjøre flere ganger: filer som finnes fra før blir overskrevet med samme innhold.
import { createClient } from '@supabase/supabase-js';
const { GML_URL, GML_NOKKEL, NY_URL, NY_NOKKEL } = process.env;
if (!GML_URL || !GML_NOKKEL || !NY_URL || !NY_NOKKEL) { console.error('Mangler GML_URL, GML_NOKKEL, NY_URL eller NY_NOKKEL'); process.exit(1); }
const gml = createClient(GML_URL, GML_NOKKEL, { auth: { persistSession: false } });
const ny = createClient(NY_URL, NY_NOKKEL, { auth: { persistSession: false } });
let ok = 0, feil = 0, bytes = 0;
async function alle(bucket, prefix = '') {
  const ut = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await gml.storage.from(bucket).list(prefix, { limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw new Error(`Liste ${bucket}/${prefix}: ${error.message}`);
    for (const o of data) { const p = prefix ? `${prefix}/${o.name}` : o.name; if (o.id === null) ut.push(...await alle(bucket, p)); else ut.push({ p, type: o.metadata?.mimetype }); }
    if (data.length < 1000) break;
  }
  return ut;
}
const { data: buckets, error } = await gml.storage.listBuckets(); if (error) throw error;
for (const b of buckets) {
  const { error: e1 } = await ny.storage.createBucket(b.id, { public: b.public, fileSizeLimit: b.file_size_limit ?? undefined, allowedMimeTypes: b.allowed_mime_types ?? undefined });
  if (e1 && !/exist/i.test(e1.message)) console.warn(`Bøtte ${b.id}: ${e1.message}`);
  const filer = await alle(b.id); console.log(`Bøtte «${b.id}»: ${filer.length} filer`);
  for (const [i, f] of filer.entries()) {
    try {
      const { data, error: e2 } = await gml.storage.from(b.id).download(f.p); if (e2) throw e2;
      const { error: e3 } = await ny.storage.from(b.id).upload(f.p, data, { upsert: true, contentType: f.type || data.type || 'application/octet-stream' }); if (e3) throw e3;
      ok++; bytes += data.size; if ((i + 1) % 25 === 0) console.log(`  ${i + 1} av ${filer.length} …`);
    } catch (e) { feil++; console.error(`  FEIL ${b.id}/${f.p}: ${e.message || e}`); }
  }
}
console.log(`Ferdig: ${ok} filer kopiert (${(bytes / 1e6).toFixed(1)} MB), ${feil} feil.${feil ? ' Kjør skriptet på nytt for å prøve feilene igjen.' : ''}`);
