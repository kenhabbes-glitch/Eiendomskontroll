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
  // Ukeoversikt til eier (styres av Innstillinger → Ukeoversikt til eier; av som standard)
  const r3 = await fetch(`${base}/.netlify/functions/arbeidsordre`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-ek-cron': sig }, body: JSON.stringify({ action: 'eier_uke' }) });
  console.log('eier-uke', r3.status, (await r3.text()).slice(0, 1000));
  // Automatisk leietaker-runde (styres av Innstillinger → Leietaker-runde; av som standard)
  const r4 = await fetch(`${base}/.netlify/functions/arbeidsordre`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-ek-cron': sig }, body: JSON.stringify({ action: 'lt_runde' }) });
  console.log('lt-runde', r4.status, (await r4.text()).slice(0, 1000));
  // Fornyelse av utløpende dokumenter (styres av Innstillinger → Fornyelse av dokumenter; av som standard)
  const r5 = await fetch(`${base}/.netlify/functions/arbeidsordre`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-ek-cron': sig }, body: JSON.stringify({ action: 'dok_fornyelse' }) });
  console.log('dok-fornyelse', r5.status, (await r5.text()).slice(0, 1000));
  // Leieavtale-vakt: avtaleutløp, oppsigelsesfrist og kommende indeksregulering (styres av Innstillinger → Leieavtale-vakt; av som standard)
  const r6 = await fetch(`${base}/.netlify/functions/arbeidsordre`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-ek-cron': sig }, body: JSON.stringify({ action: 'leie_vakt' }) });
  console.log('leie-vakt', r6.status, (await r6.text()).slice(0, 1000));
  // Brannopplæring på autopilot: purring, årlig repetisjon og eskalering (styres av Innstillinger → Brannopplæring; av som standard)
  const r7 = await fetch(`${base}/.netlify/functions/arbeidsordre`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-ek-cron': sig }, body: JSON.stringify({ action: 'brannauto' }) });
  console.log('brannauto', r7.status, (await r7.text()).slice(0, 1000));
  // Hjerteslag: forteller driftsvakten (server/vakt.sh) at nattjobbene har kjørt
  await fetch(`${base}/.netlify/functions/arbeidsordre`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-ek-cron': sig }, body: JSON.stringify({ action: 'jobb_hjerteslag', navn: 'ko-auto' }) }).catch(() => null);
  return new Response(t, { status: r.status });
};
