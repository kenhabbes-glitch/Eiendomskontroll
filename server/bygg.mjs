// Bygger Netlify-funksjonene (netlify/functions/*.ts) til vanlige Node-moduler, slik at de kan kjøres av server/server.mjs på egen server.
import { build } from 'esbuild';
import { readdirSync } from 'node:fs';
const filer = readdirSync('netlify/functions').filter(f => f.endsWith('.ts'));
await build({ entryPoints: filer.map(f => 'netlify/functions/' + f), outdir: 'server/funksjoner', bundle: true, platform: 'node', format: 'esm', target: 'node22',
  outExtension: { '.js': '.mjs' }, external: ['nodemailer', 'ws'], logLevel: 'warning',
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
console.log('Bygget', filer.length, 'funksjoner til server/funksjoner/');
