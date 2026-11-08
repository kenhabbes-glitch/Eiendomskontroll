import { useEffect, useRef } from 'react';
import { state, useStore } from '../lib/store';
import { NYHETER, merkSett, sistSett } from '../lib/nyheter';
import { showModal } from './ui';
import { tt, lokale } from '../lib/i18n';

export function NyheterListe({ maks }: { maks?: number }) {
  return <>{NYHETER.slice(0, maks).map(n => <div key={n.id} style={{ marginBottom: 14 }}>
    <div><b>{tt(n.tittel)}</b> <span className="small muted">{new Date(n.dato).toLocaleDateString(lokale(), { dateStyle: 'medium' })}</span></div>
    <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>{n.punkter.map(p => <li key={p} className="small">{tt(p)}</li>)}</ul>
  </div>)}</>;
}

/** Viser «Nytt i appen» én gang per bruker når det finnes en nyere oppdatering enn den brukeren har sett. */
export function NyheterPopup() {
  useStore();
  const vist = useRef(false);
  const uid = state.me?.id;
  useEffect(() => {
    if (!uid || vist.current || !NYHETER.length) return;
    if (sistSett(uid) === NYHETER[0].id) return;
    vist.current = true;
    showModal(tt("Appen er oppdatert"), close => <>
      <p>{tt("Dette er nytt siden sist:")}</p><NyheterListe maks={1} />
      <p className="small muted">{tt("Du finner oppdateringshistorikken i Hendelseslogg.")}</p>
    </>, { foot: close => <button className="btn pri" onClick={() => { merkSett(uid); close(); }}>{tt("OK")}</button> });
    // ESC/klikk utenfor lukker også – regn det som sett
    merkSett(uid);
  }, [uid]);
  return null;
}
