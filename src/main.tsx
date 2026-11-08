import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);

// Appen kan startes uten nett (befaringer). Bare i den publiserte versjonen.
if ('serviceWorker' in navigator && (import.meta as any).env?.PROD) window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => { }); });
