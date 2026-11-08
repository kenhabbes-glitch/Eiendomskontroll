// Verktøy for bruk i felt: installere appen på hjemskjermen og skanne QR-koder med kameraet.
import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { S, toast } from '../lib/store';
import { showModal } from './ui';
import { tt } from '../lib/i18n';

let utsatt: any = null; const lyttere = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); utsatt = e; lyttere.forEach(f => f()); });
  window.addEventListener('appinstalled', () => { utsatt = null; lyttere.forEach(f => f()); });
}
const standalone = () => typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true);
const erIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as any).MSStream;

/** Knapp som installerer appen (Android/Chrome/Edge), eller viser veiledning på iPhone/iPad. Skjules når appen allerede er installert. */
export function InstallerApp() {
  const [, ny] = useState(0);
  useEffect(() => { const f = () => ny(x => x + 1); lyttere.add(f); return () => { lyttere.delete(f); }; }, []);
  if (standalone() || (!utsatt && !erIos())) return null;
  const klikk = async () => {
    if (utsatt) { utsatt.prompt(); try { await utsatt.userChoice; } catch { } utsatt = null; ny(x => x + 1); return; }
    showModal(tt("Installer appen på iPhone/iPad"), () => <ol><li>{tt("Åpne siden i Safari.")}</li><li>{tt("Trykk på del-knappen (firkant med pil opp).")}</li><li>{tt("Velg «Legg til på Hjem-skjerm».")}</li></ol>);
  };
  return <button onClick={klikk}>{tt("Installer appen")}</button>;
}

/** Tolker en skannet kode: lenke til denne appen åpnes, ellers søkes det etter system/komponent med samme serienummer eller id. */
function handterKode(kode: string): boolean {
  const k = kode.trim();
  try { const u = new URL(k); if (u.origin === location.origin && u.hash.startsWith('#/')) { location.hash = u.hash; return true; } } catch { }
  const sys = S.anlegg.find((a: any) => a.id === k || (a.serienr && String(a.serienr).toLowerCase() === k.toLowerCase()));
  if (sys) { location.hash = '#/eiendommer/' + sys.eiendomId; toast(`${sys.navn}`); return true; }
  const komp = S.komponenter.find((c: any) => c.id === k || (c.serienr && String(c.serienr).toLowerCase() === k.toLowerCase()));
  if (komp) { location.hash = '#/eiendommer/' + komp.eiendomId; toast(`${komp.navn || komp.type || ''}`); return true; }
  return false;
}

function Skanner({ close }: { close: () => void }) {
  const v = useRef<HTMLVideoElement>(null); const [feil, setFeil] = useState(''); const [ukjent, setUkjent] = useState('');
  useEffect(() => {
    let stopp = false; let strom: MediaStream | null = null;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error(tt("Kameraet er ikke tilgjengelig i denne nettleseren"));
        strom = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (stopp) { strom.getTracks().forEach(t => t.stop()); return; }
        const el = v.current!; el.srcObject = strom; await el.play();
        const BD = (window as any).BarcodeDetector; const det = BD ? new BD({ formats: ['qr_code'] }) : null; const c = document.createElement('canvas'); const g = c.getContext('2d', { willReadFrequently: true })!;
        const les = async () => {
          if (stopp) return;
          if (el.videoWidth) {
            let kode = '';
            try { if (det) { const r = await det.detect(el); kode = r[0]?.rawValue || ''; } else { c.width = el.videoWidth; c.height = el.videoHeight; g.drawImage(el, 0, 0); const d = g.getImageData(0, 0, c.width, c.height); kode = jsQR(d.data, d.width, d.height)?.data || ''; } } catch { }
            if (kode) { if (handterKode(kode)) { close(); return; } setUkjent(kode); }
          }
          setTimeout(les, 250);
        };
        les();
      } catch (e: any) { setFeil(e?.name === 'NotAllowedError' ? tt("Du må gi appen tilgang til kameraet") : (e?.message || String(e))); }
    })();
    return () => { stopp = true; strom?.getTracks().forEach(t => t.stop()); };
  }, []);
  return <>
    {feil ? <p className="banner">{feil}</p> : <video ref={v} playsInline muted style={{ width: '100%', borderRadius: 8, background: '#000', maxHeight: '60vh' }} />}
    {ukjent && <p className="small">{tt("Koden ble lest, men hører ikke til noe i appen:")} <span className="mono">{ukjent.slice(0, 120)}</span></p>}
    <p className="small muted">{tt("Hold kameraet mot en QR-kode fra appen (meldepunkt) eller en kode med serienummer.")}</p>
  </>;
}
export const skannQr = () => showModal(tt("Skann QR-kode"), close => <Skanner close={close} />);
