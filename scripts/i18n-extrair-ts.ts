/**
 * Lista textos de interface que vivem em .ts (ajuda de métrica, glossário,
 * rótulos de navegação, leituras automáticas). Esses arquivos NÃO são
 * editados: o texto chega à tela por uma expressão que o codemod já envolveu
 * em tx(), então basta a frase existir no dicionário.
 *
 * Literais estáticos viram chave como estão. Template literals viram chave com
 * {0},{1}... e são listados à parte: só traduzem se o ponto de uso passar a
 * chamar tx(padrão, [args]) -- ajuste manual.
 */
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dir, '..');
const PULA = [/\.test\.ts$/, /\.server\.ts$/, /\.functions\.ts$/, /src\/integrations\//, /routeTree/, /src\/lib\/i18n/, /src\/lib\/mcp\//, /src\/routes\//];
const PROSA = /[A-Za-zÀ-ÿ].*\s.*[A-Za-zÀ-ÿ]|[À-ÿ]/;

function arquivos(dir: string, out: string[] = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) arquivos(p, out);
    else if (/\.ts$/.test(p) && !PULA.some((r) => r.test(p))) out.push(p);
  }
  return out;
}

const estaticos = new Map<string, string>();
const templates = new Map<string, string>();
for (const f of arquivos(path.join(ROOT, 'src'))) {
  const sf = ts.createSourceFile(f, fs.readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true);
  const rel = path.relative(ROOT, f);
  const v = (n: ts.Node) => {
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) return;
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      const p = n.parent;
      const ehChave = ts.isPropertyAssignment(p) && p.name === n;
      const ehComparacao = ts.isBinaryExpression(p) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(p.operatorToken.kind);
      if (!ehChave && !ehComparacao && !ts.isCaseClause(p) && !ts.isLiteralTypeNode(p) && PROSA.test(n.text) && !/^(select|insert|update|with)\b/i.test(n.text)) {
        estaticos.has(n.text) || estaticos.set(n.text, rel);
      }
    } else if (ts.isTemplateExpression(n)) {
      let pat = n.head.text;
      n.templateSpans.forEach((s, i) => (pat += `{${i}}` + s.literal.text));
      if (PROSA.test(pat.replace(/\{\d+\}/g, ''))) templates.has(pat) || templates.set(pat, rel);
    }
    ts.forEachChild(n, v);
  };
  v(sf);
}
fs.writeFileSync(path.join(ROOT, 'scripts/i18n-ts-estaticos.json'), JSON.stringify(Object.fromEntries(estaticos), null, 1));
fs.writeFileSync(path.join(ROOT, 'scripts/i18n-ts-templates.json'), JSON.stringify(Object.fromEntries(templates), null, 1));
const soma = (m: Map<string, string>) => [...m.keys()].reduce((a, s) => a + s.length, 0);
console.log(`estáticos: ${estaticos.size} (${soma(estaticos)} chars)  templates: ${templates.size} (${soma(templates)} chars)`);
const porArq = new Map<string, number>();
for (const f of estaticos.values()) porArq.set(f, (porArq.get(f) ?? 0) + 1);
console.log([...porArq].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([f, n]) => `${n}\t${f}`).join('\n'));
