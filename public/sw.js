// Service worker: lar appen starte uten nett (befaringer i kjeller, tekniske rom o.l.).
// * Sidene (index.html) hentes fra nettet først, med lagret kopi som reserve.
// * Byggede filer (/assets/*, med versjonsnummer i navnet) lagres første gang de brukes.
// * Data, innlogging og filer fra Supabase og serverfunksjoner går alltid til nettet og lagres aldri her.
const CACHE = 'ek-app-v1';
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(['/', '/index.html', '/favicon.svg']).catch(() => { }))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url); if (u.origin !== self.location.origin || u.pathname.startsWith('/.netlify/')) return;
  if (r.mode === 'navigate') {
    e.respondWith(fetch(r).then(res => { const k = res.clone(); caches.open(CACHE).then(c => c.put('/index.html', k)); return res; }).catch(() => caches.match('/index.html').then(x => x || caches.match('/'))));
    return;
  }
  if (u.pathname.startsWith('/assets/') || /\.(svg|png|woff2?|json|mjs|js|css)$/.test(u.pathname)) {
    e.respondWith(caches.match(r).then(hit => hit || fetch(r).then(res => { if (res.ok) { const k = res.clone(); caches.open(CACHE).then(c => c.put(r, k)); } return res; })));
  }
});

// Push-varsler (sendes fra serveren via funksjonen «push»)
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch { d = { tekst: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.tittel || 'Eiendomskontroll', { body: d.tekst || '', icon: '/favicon.svg', badge: '/favicon.svg', tag: d.tag || undefined, data: { url: d.url || '/' } }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close(); const url = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(L => {
    for (const c of L) { if (c.url.startsWith(self.location.origin) && 'focus' in c) { c.navigate && c.navigate(url).catch(() => { }); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
