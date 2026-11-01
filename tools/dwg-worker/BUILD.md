# Bygge DWG-workeren på nytt

```bash
git clone https://github.com/mlightcad/libredwg-web
cd libredwg-web
git apply /sti/til/tools/dwg-worker/svgConverter.patch
cp /sti/til/tools/dwg-worker/dwg-worker.ts bindings/javascript/
cd bindings/javascript
npx esbuild dwg-worker.ts --bundle --format=esm --platform=browser --external:module --minify --legal-comments=eof --outfile=dwg-worker.js
cp dwg-worker.js wasm/libredwg-web.wasm <repo>/public/dwg/
```
LibreDWG/libredwg-web er GPLv3. Se public/dwg/README.txt.
