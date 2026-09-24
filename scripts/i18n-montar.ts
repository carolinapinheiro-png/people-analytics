/**
 * Junta scripts/i18n-lotes/*.json (índice -> inglês) com scripts/i18n-todo.json
 * (índice -> chave em português) e reescreve src/lib/i18n-en.ts.
 *
 * Recusa o lote inteiro se algum placeholder {n} não bater entre PT e EN:
 * uma tradução que perde o {0} esconde o número na tela sem erro nenhum.
 * Entradas que já existem no dicionário e não estão nos lotes são mantidas.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dir, '..');
const todo: string[] = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/i18n-todo.json'), 'utf8'));
const { EN: atual } = await import(path.join(ROOT, 'src/lib/i18n-en.ts'));
const dic: Record<string, string> = { ...atual };

const ph = (s: string) => (s.match(/\{\d+\}/g) ?? []).sort().join(',');
const erros: string[] = [];
const dir = path.join(ROOT, 'scripts/i18n-lotes');
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
  const lote: Record<string, string> = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  for (const [i, en] of Object.entries(lote)) {
    const pt = todo[Number(i)];
    if (pt === undefined) { erros.push(`${f}#${i}: índice fora da lista`); continue; }
    if (ph(pt) !== ph(en)) { erros.push(`${f}#${i}: placeholders ${ph(pt)} ≠ ${ph(en)} — ${pt}`); continue; }
    if (en !== pt) dic[pt] = en;
  }
}
if (erros.length) { console.error(erros.join('\n')); process.exit(1); }

const linhas = Object.keys(dic)
  .sort((a, b) => a.localeCompare(b, 'pt'))
  .map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(dic[k])},`);
const out = `/**
 * Dicionário PT -> EN da interface. A chave é o texto em português exatamente
 * como aparece no código; ver src/lib/i18n.ts.
 *
 * Gerado por scripts/i18n-montar.ts a partir de scripts/i18n-lotes/. Para
 * corrigir uma tradução, pode editar aqui direto; para textos novos, rode
 * \`bun scripts/i18n-codemod.ts --write --missing\` e traduza o que faltar.
 */
export const EN: Record<string, string> = {
${linhas.join('\n')}
};
`;
fs.writeFileSync(path.join(ROOT, 'src/lib/i18n-en.ts'), out);
const faltam = todo.filter((k) => !(k in dic));
console.log(`dicionário: ${Object.keys(dic).length} entradas · sem tradução: ${faltam.length}`);
if (faltam.length) console.log(faltam.slice(0, 30).map((s) => '  ' + JSON.stringify(s)).join('\n'));
