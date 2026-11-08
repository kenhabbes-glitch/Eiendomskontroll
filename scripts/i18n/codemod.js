// Pakker UI-tekster i tt(). Bruk: node codemod.js <src> [--skriv]
const ts = require('typescript');
const fs = require('fs'), path = require('path');
const root = process.argv[2], skriv = process.argv.includes('--skriv');
const UTELAT = new Set(['lib/i18n.ts', 'lib/catalog.ts', 'lib/hjelpTekster.ts', 'components/Vilkar.tsx', 'components/Personvern.tsx', 'views/PersonvernNotat.tsx', 'lib/lovhjelp.ts', 'lib/kontrakt.ts', 'lib/tilsyn.ts', 'lib/prosjekt.ts', 'lib/prosjektArbeid.ts', 'lib/prosjektArkiv.ts', 'lib/ns3451.ts', 'lib/komponentsjekk.ts', 'lib/sjekklistePakke.ts', 'lib/store.ts', 'lib/utils.ts', 'lib/offline.ts', 'main.tsx']);
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(f) && !f.endsWith('.d.ts')) files.push(p); } })(root);
const harBokstav = s => /[A-Za-zÆØÅæøå]{2,}/.test(s);
const UI_PROPS = new Set(['label', 'hint', 'ph', 'title', 'saveTxt', 'empty', 'tekst', 'sub', 'beskr', 'navn', 'n', 'kort', 'help']);
const UI_ATTR = new Set(['title', 'placeholder', 'aria-label', 'alt', 'label', 'ph', 'empty', 'hint', 'saveTxt']);
const UI_CALLS = new Set(['toast', 'confirmBox', 'showModal', 'textModal', 'varsle', 'setErr', 'setFeil']);
const BOOL_OPS = new Set([ts.SyntaxKind.BarBarToken, ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.PlusToken]);
let nFiler = 0, nEdits = 0; const nokler = new Set();
for (const f of files) {
  const rel = path.relative(root, f).split(path.sep).join('/'); if (UTELAT.has(rel)) continue;
  const src = fs.readFileSync(f, 'utf8'); const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const edits = [];
  const strengUttrykk = node => { // returnerer tt(...)-kall som tekst
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) { nokler.add(node.text); return `tt(${JSON.stringify(node.text)})`; }
    // TemplateExpression
    let k = node.head.text; const args = [];
    node.templateSpans.forEach((sp, i) => { k += `{${i}}` + sp.literal.text; args.push(sp.expression.getText(sf)); });
    nokler.add(k); return `tt(${JSON.stringify(k)}, ${args.join(', ')})`;
  };
  // Er noden i «verdiposisjon» fram til et JSX-barn (ikke betingelse/sammenligning)?
  const iJsxBarn = node => {
    let c = node, p = node.parent;
    for (;;) {
      if (ts.isParenthesizedExpression(p)) { c = p; p = p.parent; continue; }
      if (ts.isConditionalExpression(p) && (p.whenTrue === c || p.whenFalse === c)) { c = p; p = p.parent; continue; }
      if (ts.isBinaryExpression(p) && BOOL_OPS.has(p.operatorToken.kind) && (p.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken || p.right === c)) { c = p; p = p.parent; continue; }
      break;
    }
    return ts.isJsxExpression(p) && !ts.isJsxAttribute(p.parent) && c !== node.parent?.condition;
  };
  const iUiPosisjon = node => {
    const p = node.parent;
    if (ts.isJsxAttribute(p) && UI_ATTR.has(p.name.getText(sf))) return 'attr';
    // attributter med uttrykk: title={ok ? 'A' : 'B'}
    let c = node, q = p; while (ts.isParenthesizedExpression(q) || (ts.isConditionalExpression(q) && (q.whenTrue === c || q.whenFalse === c)) || (ts.isBinaryExpression(q) && BOOL_OPS.has(q.operatorToken.kind))) { c = q; q = q.parent; }
    if (ts.isJsxExpression(q) && ts.isJsxAttribute(q.parent) && UI_ATTR.has(q.parent.name.getText(sf))) return 'attrexpr';
    if (ts.isPropertyAssignment(q) && q.initializer === c && UI_PROPS.has(q.name.getText(sf))) return 'prop';
    if (ts.isCallExpression(q) && UI_CALLS.has(q.expression.getText(sf)) && q.arguments.includes(c)) return 'call';
    if (iJsxBarn(node)) return 'jsx';
    return '';
  };
  const visit = node => {
    if (ts.isJsxText(node)) {
      const raw = node.getText(sf); if (harBokstav(raw) && !/[{}]/.test(raw)) {
        const m = raw.match(/^(\s*)([\s\S]*?)(\s*)$/); const core = m[2].replace(/\s+/g, ' ');
        if (/&[a-z]+;|&#/.test(core)) return; // HTML-entiteter: la stå
        nokler.add(core); edits.push([node.getStart(sf), node.getEnd(), `${m[1]}{tt(${JSON.stringify(core)})}${m[3]}`]); return;
      }
    }
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) && harBokstav(node.getText(sf))) {
      // ikke i import, ikke i type, ikke allerede tt(...)
      const p = node.parent; if (ts.isImportDeclaration(p) || ts.isLiteralTypeNode(p) || (ts.isCallExpression(p) && p.expression.getText(sf) === 'tt')) return;
      if (iUiPosisjon(node)) { edits.push([node.getStart(sf), node.getEnd(), (ts.isJsxAttribute(p) ? '{' : '') + strengUttrykk(node) + (ts.isJsxAttribute(p) ? '}' : '')]); return; }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (!edits.length) continue;
  edits.sort((a, b) => b[0] - a[0]);
  let out = src; for (const [s, e, r] of edits) out = out.slice(0, s) + r + out.slice(e);
  // import
  const imp = path.relative(path.dirname(f), path.join(root, 'lib/i18n')).split(path.sep).join('/'); const impS = (imp.startsWith('.') ? imp : './' + imp);
  if (!/import \{[^}]*\btt\b[^}]*\} from '[^']*i18n'/.test(out)) {
    const lines = out.split('\n'); let last = -1; for (let i = 0; i < lines.length; i++) { if (/^import\b/.test(lines[i])) { last = i; while (!/;\s*$/.test(lines[last]) && last < lines.length - 1) last++; i = last; } else if (lines[i].trim() && !lines[i].startsWith('//') && last >= 0) break; }
    lines.splice(last + 1, 0, `import { tt } from '${impS}';`); out = lines.join('\n');
  }
  nFiler++; nEdits += edits.length; if (skriv) fs.writeFileSync(f, out);
}
fs.writeFileSync('./nokler.json', JSON.stringify([...nokler].sort(), null, 1));
console.log({ nFiler, nEdits, unike: nokler.size, skrevet: skriv });
