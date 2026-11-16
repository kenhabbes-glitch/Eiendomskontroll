// Sending av push-varsler fra serveren (Web Push med VAPID-nøkler som lages og lagres i databasen første gang).
// Brukes av serverfunksjonene push, qr-meld og arbeidsordre. Feil her skal aldri stoppe selve operasjonen.
export type PushInnhold = { tittel: string; tekst: string; url?: string; tag?: string };

const lastWp = async (): Promise<any> => { const m: any = await import('web-push'); return m.default?.generateVAPIDKeys ? m.default : m; };

export async function vapid(admin: any): Promise<{ offentlig: string; privat: string } | null> {
  const { data } = await admin.from('push_noekler').select('offentlig, privat').eq('id', 1).maybeSingle();
  if (data?.offentlig) return data;
  const wp: any = await lastWp(); const k = wp.generateVAPIDKeys();
  await admin.from('push_noekler').insert({ id: 1, offentlig: k.publicKey, privat: k.privateKey });
  const { data: igjen } = await admin.from('push_noekler').select('offentlig, privat').eq('id', 1).maybeSingle(); // en annen samtidig kjøring kan ha vært først
  return igjen || null;
}

/** Sender til alle enheter for gitte brukere som har slått på minst én av typene. Returnerer antall sendt. */
export async function pushTilBrukere(admin: any, userIds: string[], typer: string[], inn: PushInnhold): Promise<number> {
  try {
    if (!userIds.length) return 0;
    const { data: subs } = await admin.from('push_abonnement').select('id, endpoint, p256dh, auth, typer').in('user_id', userIds);
    const mål = (subs || []).filter((s: any) => (s.typer || []).some((t: string) => typer.includes(t))); if (!mål.length) return 0;
    const k = await vapid(admin); if (!k) return 0;
    const wp: any = await lastWp();
    const emne = /^(mailto:|https:\/\/)/.test(process.env.PUSH_KONTAKT || '') ? process.env.PUSH_KONTAKT! : (process.env.URL && /^https:\/\//.test(process.env.URL) ? process.env.URL : 'mailto:post@example.com');
    const nyttelast = JSON.stringify({ tittel: inn.tittel.slice(0, 120), tekst: inn.tekst.slice(0, 300), url: inn.url || '/', tag: inn.tag });
    let ok = 0; const bort: string[] = [];
    await Promise.all(mål.map(async (s: any) => {
      try { await wp.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, nyttelast, { vapidDetails: { subject: emne, publicKey: k.offentlig, privateKey: k.privat }, TTL: 86400 }); ok++; }
      catch (e: any) { if (e?.statusCode === 404 || e?.statusCode === 410) bort.push(s.id); else console.error('push-feil', e?.statusCode || e?.message); }
    }));
    if (bort.length) await admin.from('push_abonnement').delete().in('id', bort);
    return ok;
  } catch (e: any) { console.error('push', e?.message || e); return 0; }
}

/** Sender til administratorer og forvaltere i en organisasjon */
export async function pushTilOrg(admin: any, orgId: string, typer: string[], inn: PushInnhold, roller = ['admin', 'forvalter']): Promise<number> {
  try {
    const { data: m } = await admin.from('org_medlem').select('user_id, rolle, aktiv').eq('org_id', orgId).eq('aktiv', true);
    return await pushTilBrukere(admin, (m || []).filter((x: any) => roller.includes(x.rolle)).map((x: any) => x.user_id), typer, inn);
  } catch { return 0; }
}
