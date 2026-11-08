import React from 'react';
import { createRoot } from 'react-dom/client';
import { lastSprak } from './lib/i18n';
import './styles.css';

// Språket lastes før resten av appen, slik at tekster som lages ved oppstart også blir oversatt
lastSprak().then(() => import('./App')).then(({ default: App }) => {
  createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
});

// Appen kan startes uten nett (befaringer). Bare i den publiserte versjonen.
if ('serviceWorker' in navigator && (import.meta as any).env?.PROD) window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => { }); });
