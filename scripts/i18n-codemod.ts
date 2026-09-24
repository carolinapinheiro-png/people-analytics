/**
 * i18n-codemod: envolve em tx() os textos de INTERFACE dos .tsx.
 *
 *   bun scripts/i18n-codemod.ts            -> só lista (dry run)
 *   bun scripts/i18n-codemod.ts --write    -> aplica nos arquivos
 *   bun scripts/i18n-codemod.ts --missing  -> chaves usadas sem tradução EN
 *
 * Só mexe em posição de EXIBIÇÃO: texto JSX, atributos de texto (title,
 * aria-label, placeholder...), expressões filhas de JSX e toasts. Nunca em
 * comparação, chave de objeto, className ou constante de módulo -- é ali que
 * texto em português é DADO (valor do Convenia, rótulo de faixa usado em
 * filtro) e traduzir quebraria o casamento.
 *
 * Expressões dinâmicas ({o.label}, {rotulo}) só são envolvidas quando o tipo
 * é string, pelo type checker. tx() em string sem entrada no dicionário
 * devolve a própria string, então envolver dado é inofensivo.
 */
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dir, '..');
const WRITE = process.argv.includes('--write');
const MISSING = process.argv.includes('--missing');

const SKIP_FILES = [
  /src\/components\/ui\//, /src\/integrations\//, /routeTree\.gen\.ts$/,
  /lovable\.oauth\.consent/, /src\/lib\/i18n/, /\.test\.tsx?$/,
];

const TEXT_ATTRS = new Set([
  'title', 'aria-label', 'placeholder', 'alt', 'label', 'rotulo', 'titulo',
  'subtitle', 'subtitulo', 'description', 'descricao', 'tooltip', 'hint',
  'ajuda', 'help', 'legenda', 'texto', 'text', 'heading', 'emptyText',
  'vazio', 'name', 'nota', 'aviso', 'mensagem', 'caption', 'info', 'sub',
  'unidade', 'unit', 'detalhe', 'explicacao', 'pergunta', 'resumo', 'chip',
]);
const SKIP_ATTRS = new Set([
  'className', 'id', 'key', 'type', 'value', 'href', 'to', 'variant', 'size',
  'align', 'side', 'role', 'htmlFor', 'target', 'rel', 'src', 'fill', 'stroke',
  'strokeDasharray', 'd', 'viewBox', 'dataKey', 'nameKey', 'orientation',
  'layout', 'mode', 'defaultValue', 'method', 'autoComplete', 'inputMode',
  'pattern', 'accept', 'form', 'xmlns', 'textAnchor', 'dominantBaseline',
  'fontFamily', 'fontWeight', 'transform', 'points', 'cursor', 'position',
  'interval', 'tipo', 'kind', 'cor', 'color', 'icon', 'stackId', 'yAxisId',
  'xAxisId', 'scale', 'domain', 'lang', 'dir', 'style', 'download', 'tabela',
  'campo', 'coluna', 'marca', 'brand', 'aba', 'tab', 'secao', 'chave', 'k',
]);

const TEM_LETRA = /[A-Za-zÀ-ÿ]/;
const PROSA = /[\sÀ-ÿ]/; // espaço ou acento: parece frase, não identificador

function arquivos(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) arquivos(p, out);
    else if (p.endsWith('.tsx') && !SKIP_FILES.some((r) => r.test(p))) out.push(p);
  }
  return out;
}

const ENT: Record<string, string> = {
  '&nbsp;': '\u00a0', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
  '&apos;': "'", '&#39;': "'", '&rarr;': '→', '&larr;': '←', '&middot;': '·',
  '&mdash;': '—', '&ndash;': '–', '&hellip;': '…', '&ge;': '≥', '&le;': '≤',
};

/** Normalização de espaço do JSX: linhas aparadas, vazias somem, junta com ' '. */
function limparJsx(raw: string): string | null {
  const linhas = raw.split(/\r?\n/);
  const partes: string[] = [];
  linhas.forEach((l, i) => {
    let s = l.replace(/\t/g, ' ');
    if (i > 0) s = s.replace(/^\s+/, '');
    if (i < linhas.length - 1) s = s.replace(/\s+$/, '');
    if (s !== '') partes.push(s);
  });
  let out = partes.join(' ');
  out = out.replace(/&[#a-z0-9]+;/gi, (m) => (m in ENT ? ENT[m] : `\u0000${m}`));
  if (out.includes('\u0000')) return null;
  return out;
}

const cfgPath = path.join(ROOT, 'tsconfig.json');
const cfg = ts.readConfigFile(cfgPath, ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, ROOT);
const files = arquivos(path.join(ROOT, 'src'));
const program = ts.createProgram(files, parsed.options);
const checker = program.getTypeChecker();

type Edit = { pos: number; end: number; text: string };
const chaves = new Map<string, string>(); // chave -> primeiro arquivo
let totalEdits = 0;

function soString(expr: ts.Expression): boolean {
  const t = checker.getTypeAtLocation(expr);
  const membros = t.isUnion() ? t.types : [t];
  let algumString = false;
  for (const m of membros) {
    // String geral sim; união só de literais ('enps' | 'pcd') é identificador
    // tipado, não texto -- traduzir quebraria quem recebe.
    if (m.flags & ts.TypeFlags.String) algumString = true;
    else if (m.flags & ts.TypeFlags.StringLike) continue;
    else if (m.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null)) continue;
    else return false;
  }
  return algumString;
}

function ehChamadaTx(e: ts.Node): boolean {
  return ts.isCallExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === 'tx';
}

for (const file of files) {
  const sf = program.getSourceFile(file);
  if (!sf) continue;
  const src = sf.getFullText();
  const edits: Edit[] = [];
  const rel = path.relative(ROOT, file);

  const lit = (node: ts.Node, key: string) => {
    chaves.has(key) || chaves.set(key, rel);
    edits.push({ pos: node.getStart(sf), end: node.getEnd(), text: `tx(${JSON.stringify(key)})` });
  };
  const envolver = (node: ts.Expression) => {
    edits.push({ pos: node.getStart(sf), end: node.getStart(sf), text: 'tx(' });
    edits.push({ pos: node.getEnd(), end: node.getEnd(), text: ')' });
  };

  /** Expressão em posição de exibição. `forte`: aceita literal sem cara de prosa. */
  function wrapExpr(e: ts.Expression, forte: boolean, porTipo: boolean) {
    if (ts.isParenthesizedExpression(e)) return wrapExpr(e.expression, forte, porTipo);
    if (ts.isConditionalExpression(e)) {
      wrapExpr(e.whenTrue, forte, porTipo);
      wrapExpr(e.whenFalse, forte, porTipo);
      return;
    }
    if (ts.isBinaryExpression(e)) {
      const op = e.operatorToken.kind;
      if (op === ts.SyntaxKind.AmpersandAmpersandToken) return wrapExpr(e.right, forte, porTipo);
      if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) {
        wrapExpr(e.left, forte, porTipo);
        wrapExpr(e.right, forte, porTipo);
      }
      return;
    }
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) {
      const v = e.text;
      if (!TEM_LETRA.test(v)) return;
      if (!forte && !PROSA.test(v) && !/^[A-ZÀ-Ý]/.test(v)) return;
      if (v.trim() === '') return;
      return lit(e, v);
    }
    if (ts.isTemplateExpression(e)) {
      let pat = e.head.text;
      const args: string[] = [];
      e.templateSpans.forEach((s, i) => {
        args.push(s.expression.getText(sf));
        pat += `{${i}}` + s.literal.text;
      });
      const soLiteral = pat.replace(/\{\d+\}/g, '');
      if (!TEM_LETRA.test(soLiteral)) return;
      chaves.has(pat) || chaves.set(pat, rel);
      edits.push({
        pos: e.getStart(sf), end: e.getEnd(),
        text: `tx(${JSON.stringify(pat)}, [${args.join(', ')}])`,
      });
      return;
    }
    if (!porTipo || ehChamadaTx(e)) return;
    if (ts.isIdentifier(e) || ts.isPropertyAccessExpression(e) || ts.isElementAccessExpression(e) || ts.isCallExpression(e)) {
      if (soString(e)) envolver(e);
    }
  }

  function nomeTag(n: ts.Node): string {
    const el = ts.isJsxElement(n) ? n.openingElement : null;
    return el ? el.tagName.getText(sf) : '';
  }

  function visit(node: ts.Node) {
    if (ts.isJsxText(node)) {
      const pai = node.parent;
      if (['code', 'pre', 'style', 'script', 'kbd'].includes(nomeTag(pai))) return;
      const raw = node.getFullText(sf);
      const limpo = limparJsx(raw);
      if (limpo === null) { console.warn(`[entidade] ${rel}: ${raw.trim().slice(0, 60)}`); return; }
      const key = limpo.trim();
      if (!key || !TEM_LETRA.test(key)) return;
      chaves.has(key) || chaves.set(key, rel);
      const lead = /^\s/.test(limpo) ? '{" "}' : '';
      const trail = /\s$/.test(limpo) ? '{" "}' : '';
      // Preserva quebras de linha originais nas pontas para o diff ficar legível.
      const mLead = raw.match(/^\s*/)![0];
      const mTrail = raw.match(/\s*$/)![0];
      const nl = (s: string) => (s.includes('\n') ? s : '');
      edits.push({
        pos: node.getFullStart(), end: node.getEnd(),
        text: `${nl(mLead)}${lead}{tx(${JSON.stringify(key)})}${trail}${nl(mTrail)}`,
      });
      return;
    }
    if (ts.isJsxAttribute(node)) {
      const nome = node.name.getText(sf);
      const init = node.initializer;
      if (!init || SKIP_ATTRS.has(nome) || nome.startsWith('data-') || /^on[A-Z]/.test(nome)) {
        return ts.forEachChild(node, visit);
      }
      const texto = TEXT_ATTRS.has(nome);
      if (ts.isStringLiteral(init)) {
        const v = init.text;
        if (TEM_LETRA.test(v) && (PROSA.test(v) || (texto && /^[A-ZÀ-Ý]/.test(v)))) {
          chaves.has(v) || chaves.set(v, rel);
          edits.push({ pos: init.getStart(sf), end: init.getEnd(), text: `{tx(${JSON.stringify(v)})}` });
        }
        return;
      }
      if (ts.isJsxExpression(init) && init.expression) {
        wrapExpr(init.expression, false, texto);
      }
      return ts.forEachChild(node, visit);
    }
    if (ts.isJsxExpression(node) && node.expression &&
        (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
      wrapExpr(node.expression, true, true);
      return ts.forEachChild(node, visit);
    }
    if (ts.isCallExpression(node)) {
      const c = node.expression.getText(sf);
      if (/^toast(\.(success|error|info|warning|message|loading))?$/.test(c) || /^(window\.)?(confirm|alert)$/.test(c)) {
        if (node.arguments[0]) wrapExpr(node.arguments[0], true, true);
        const o = node.arguments[1];
        if (o && ts.isObjectLiteralExpression(o)) {
          for (const p of o.properties) {
            if (ts.isPropertyAssignment(p) && p.name.getText(sf) === 'description') wrapExpr(p.initializer, true, true);
          }
        }
      }
      if (ehChamadaTx(node)) return;
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);

  if (edits.length === 0) continue;
  // Descarta substituições aninhadas dentro de outra substituição (a de fora vence).
  const subs = edits.filter((e) => e.end > e.pos).sort((a, b) => a.pos - b.pos || b.end - a.end);
  const ok: Edit[] = [];
  let fim = -1;
  for (const e of subs) { if (e.pos >= fim) { ok.push(e); fim = e.end; } }
  const ins = edits.filter((e) => e.end === e.pos && !ok.some((s) => e.pos > s.pos && e.pos < s.end));
  const todos = [...ok, ...ins].sort((a, b) => b.pos - a.pos || (a.text === 'tx(' ? 1 : -1));
  totalEdits += todos.length;
  if (!WRITE) continue;
  let out = src;
  for (const e of todos) out = out.slice(0, e.pos) + e.text + out.slice(e.end);
  if (!/import\s*\{[^}]*\btx\b[^}]*\}\s*from\s*['"]@\/lib\/i18n['"]/.test(out)) {
    const imports = [...out.matchAll(/^import[\s\S]*?from\s*['"][^'"]+['"];?\s*$/gm)];
    const ultimo = imports[imports.length - 1];
    const at = ultimo ? ultimo.index! + ultimo[0].length : 0;
    out = out.slice(0, at) + `\nimport { tx } from '@/lib/i18n';` + out.slice(at);
  }
  fs.writeFileSync(file, out);
}

const ordenadas = [...chaves.keys()].sort((a, b) => a.localeCompare(b, 'pt'));
fs.writeFileSync(path.join(ROOT, 'scripts/i18n-keys.json'), JSON.stringify(ordenadas, null, 1));
console.log(`arquivos: ${files.length}  edits: ${totalEdits}  chaves únicas: ${ordenadas.length}`);
if (MISSING) {
  const { EN } = await import(path.join(ROOT, 'src/lib/i18n-en.ts'));
  const falta = ordenadas.filter((k) => !(k in EN));
  console.log(`sem tradução: ${falta.length}`);
  fs.writeFileSync(path.join(ROOT, 'scripts/i18n-missing.json'), JSON.stringify(falta, null, 1));
}
