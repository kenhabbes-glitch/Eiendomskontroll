import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

// Appversjon: versjon fra package.json, tidspunkt for bygget og commit (Netlify setter COMMIT_REF)
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSJON__: JSON.stringify(pkg.version || ''),
    __BYGGET__: JSON.stringify(new Date().toISOString()),
    __COMMIT__: JSON.stringify((process.env.COMMIT_REF || '').slice(0, 7)),
  },
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 1500 },
});
