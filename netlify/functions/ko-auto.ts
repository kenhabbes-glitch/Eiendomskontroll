// Planlagt funksjon: sender arbeidsordre for kontroller automatisk et valgt antall dager før frist, og purring på avvik.
// Kjører hver morgen kl. 06:00 UTC (07:00/08:00 norsk tid) og kaller arbeidsordre-funksjonen med en intern signatur.
export const config = { schedule: '0 6 * * *' };

export default async () => {
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const base = (process.env.URL || '').replace(/\/+$/, '');
  if (!key || !base) { console.error('ko-auto: mangler SUPABASE_SERVICE_ROLE_KEY eller URL'); return new Response('mangler oppsett', { status: 500 }); }
  const sig = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('ko-auto:' + key))).toString('hex');
  const r = await fetch(`${base}/.netlify/functions/arbeidsordre`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-ek-cron': sig }, body: JSON.stringify({ action: 'ko_auto' }) });
  const t = await r.text(); console.log('ko-auto', r.status, t.slice(0, 1000));
  // Purring på avvik (styres av innstillingene «Purring på avvik» per organisasjon – alt er av som standard)
  const r2 = await fetch(`${base}/.netlify/functions/arbeidsordre`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-ek-cron': sig }, body: JSON.stringify({ action: 'av_purring' }) });
  console.log('av-purring', r2.status, (await r2.text()).slice(0, 1000));
  return new Response(t, { status: r.status });
};
