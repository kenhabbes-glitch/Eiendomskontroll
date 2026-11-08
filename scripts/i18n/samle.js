const ts = require('typescript'); const fs = require('fs'), path = require('path');
const root = require('path').join(__dirname, '../../src'); const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(f)) files.push(p); } })(root);
const K = new Set();
// 1) tt("...")-nøkler
for (const f of files) { const src = fs.readFileSync(f, 'utf8'); const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, f.endsWith('x') ? 4 : 3);
  const v = n => { if (ts.isCallExpression(n) && n.expression.getText(sf) === 'tt' && n.arguments[0] && (ts.isStringLiteral(n.arguments[0]) || ts.isNoSubstitutionTemplateLiteral(n.arguments[0]))) K.add(n.arguments[0].text); ts.forEachChild(n, v); }; v(sf); }
// 2) faste verdier som vises: alle strenger i utvalgte konstanter
const DATA = { 'lib/catalog.ts': ['AV_STATUS', 'AV_ALV', 'AV_KILDE', 'DOK_TYPER', 'KOMP', 'TYPER', 'KATEGORIER', 'ENH'], 'lib/befaring.ts': ['BSTATUS', 'ROLLER_DELT', 'ART_NAVN', 'ROM_PUNKTER', 'BTYPER', 'FELLES_LEIE'], 'lib/actions.tsx': ['UTBEDRER'], 'lib/store.ts': ['ROLLER'] };
for (const [fil, navn] of Object.entries(DATA)) { const p = path.join(root, fil); const src = fs.readFileSync(p, 'utf8'); const sf = ts.createSourceFile(p, src, ts.ScriptTarget.Latest, true, p.endsWith('x') ? 4 : 3);
  const samle = n => { if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && /[A-Za-zÆØÅæøå]{2,}/.test(n.text) && !/^[a-z_]+$/.test(n.text) && n.text.length < 300) K.add(n.text); ts.forEachChild(n, samle); };
  const v = n => { if (ts.isVariableDeclaration(n) && navn.includes(n.name.getText(sf)) && n.initializer) samle(n.initializer); ts.forEachChild(n, v); }; v(sf); }
const L = [...K].filter(s => /[A-Za-zÆØÅæøå]{2,}/.test(s)).sort();
fs.writeFileSync('./alle.json', JSON.stringify(L, null, 0));
console.log(L.length, 'nøkler,', L.join('').length, 'tegn');
// 3) tupler ['nøkkel', 'Etikett'] (faner, meny, filtervalg) – andre element vises med tt()
const K2 = new Set();
for (const f of files) { const src = fs.readFileSync(f, 'utf8'); const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, f.endsWith('x') ? 4 : 3);
  const v = n => { if (ts.isArrayLiteralExpression(n) && n.elements.length >= 2 && n.elements.length <= 3 && ts.isStringLiteral(n.elements[0]) && /^[a-z0-9_.\-]*$/.test(n.elements[0].text)) { const e = n.elements[1]; if ((ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) && /[A-ZÆØÅa-zæøå]{2,}/.test(e.text) && !/^[a-z0-9_.\-]+$/.test(e.text) && !K.has(e.text)) K2.add(e.text); } ts.forEachChild(n, v); }; v(sf); }
fs.writeFileSync('./tupler.json', JSON.stringify([...K2].sort()));
console.log('tupler', K2.size);
