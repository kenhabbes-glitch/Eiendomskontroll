// Push-varsler i nettleseren: melde enheten på/av og velge hvilke varsler som skal komme.
import { sb } from './store';
import { sprak } from './i18n';

export const PUSH_TYPER: { k: string; navn: string; hjelp: string }[] = [
  { k: 'kritisk', navn: 'Kritiske saker', hjelp: 'Straks en sak er meldt som kritisk (f.eks. røyk, vann fra tak, blokkert rømningsvei)' },
  { k: 'melding', navn: 'Nye saker og meldinger', hjelp: 'Hver gang en leietaker eller en QR-kode melder en sak' },
  { k: 'drift', navn: 'Driftsfeil på serveren', hjelp: 'Når vaktskriptet på serveren melder om feil, for eksempel mislykket sikkerhetskopi, full disk eller stoppede tjenester (bare administratorer)' },
  { k: 'oversikt', navn: 'Ukeoversikten', hjelp: 'Et kort varsel når ukeoversikten er sendt, med antall forfalte og kommende' },
];
export const pushStotte = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const erIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1);
export const erInstallert = () => (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || (navigator as any).standalone === true;

async function api(body: any) {
  const { data: { session } } = await sb.auth.getSession();
  const r = await fetch('/.netlify/functions/push', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: 'Bearer ' + session.access_token } : {}) }, body: JSON.stringify({ sprak: sprak(), ...body }) });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Feil ' + r.status); return j;
}
const b64 = (s: string) => { const p = '='.repeat((4 - s.length % 4) % 4); const raw = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, c => c.charCodeAt(0)); };
const enhetsNavn = () => (erIos() ? 'iPhone/iPad' : /Android/.test(navigator.userAgent) ? 'Android' : /Mobile/.test(navigator.userAgent) ? 'Mobil' : 'PC') + ' – ' + (/Edg\//.test(navigator.userAgent) ? 'Edge' : /Chrome\//.test(navigator.userAgent) ? 'Chrome' : /Firefox\//.test(navigator.userAgent) ? 'Firefox' : /Safari\//.test(navigator.userAgent) ? 'Safari' : 'nettleser');

export async function hentAbonnement(): Promise<PushSubscription | null> {
  if (!pushStotte()) return null; const reg = await navigator.serviceWorker.getRegistration(); return reg ? reg.pushManager.getSubscription() : null;
}
export async function pushStatus(): Promise<{ pa: boolean; typer: string[]; enheter: number }> {
  const s = await hentAbonnement(); if (!s) { const r = await api({ action: 'status', endpoint: '' }).catch(() => ({ enheter: 0 })); return { pa: false, typer: [], enheter: r.enheter || 0 }; }
  const r = await api({ action: 'status', endpoint: s.endpoint }); return { pa: !!r.abonnement, typer: r.abonnement?.typer || [], enheter: r.enheter || 0 };
}
export async function slaPaPush(typer: string[]) {
  if (!pushStotte()) throw new Error('Nettleseren støtter ikke push-varsler');
  const tillat = await Notification.requestPermission(); if (tillat !== 'granted') throw new Error('Varsler er ikke tillatt i nettleseren. Endre det i nettleserens innstillinger for nettstedet.');
  const reg = (await navigator.serviceWorker.getRegistration()) || await navigator.serviceWorker.register('/sw.js'); await navigator.serviceWorker.ready;
  const { nokkel } = await api({ action: 'nokkel' });
  let s = await reg.pushManager.getSubscription();
  if (!s) s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(nokkel) });
  await api({ action: 'abonner', abonnement: s.toJSON(), typer, enhet: enhetsNavn() });
}
export async function endreTyper(typer: string[]) { const s = await hentAbonnement(); if (s) await api({ action: 'typer', endpoint: s.endpoint, typer }); }
export async function slaAvPush() { const s = await hentAbonnement(); if (s) { await api({ action: 'avslutt', endpoint: s.endpoint }).catch(() => { }); await s.unsubscribe().catch(() => { }); } }
export async function testPush(): Promise<number> { return (await api({ action: 'test' })).sendt || 0; }
export async function meldNySak(avvikId: string) { try { await api({ action: 'melding', avvik_id: avvikId }); } catch { } }
