DWG/DXF-leser for Eiendomskontroll
==================================
dwg-worker.js og libredwg-web.wasm er bygget fra LibreDWG / libredwg-web
(https://github.com/mlightcad/libredwg-web, commit b5177613f2c735858a6d1cb1d1c7e238c397b88f),
lisensiert under GNU General Public License v3 (se COPYING.txt).

Komponenten kjøres isolert i en egen Web Worker og kommuniserer med appen
bare via meldinger (filinnhold inn, SVG-tekst ut).

Endringer fra original: svg/svgConverter.ts er endret slik at enkeltobjekter
som feiler hoppes over, RAY/XLINE ikke påvirker utstrekningen, og hvert objekt
får lagnavn (data-l). Kildekoden for workeren ligger i tools/dwg-worker/ i dette repoet.
