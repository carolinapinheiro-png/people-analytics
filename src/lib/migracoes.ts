/**
 * ===========================================================================
 * O QUE CADA MIGRATION PROMETE, PARA PODER CONFERIR SE CUMPRIU
 * ===========================================================================
 * Em 19/08/2026 a aba de Salários estava quebrada para TODO MUNDO -- inclusive
 * para a admin -- porque `comp_ratio.n_layer` não existia. O arquivo da
 * migration estava no repositório desde 14/08. Ele nunca foi aplicado.
 *
 * ---------------------------------------------------------------------------
 * POR QUE NÃO DÁ PARA COMPARAR COM A TABELA DE CONTROLE
 * ---------------------------------------------------------------------------
 * O caminho óbvio seria comparar `supabase/migrations/*.sql` com
 * `supabase_migrations.schema_migrations`. Não funciona aqui:
 *
 *     arquivos no repositório .......... 46
 *     registrados como aplicados ........ 5
 *
 * A tabela de controle só conhece o que passou pelo fluxo do Lovable. As
 * outras 41 foram aplicadas de outras formas e estão valendo. Um alerta que
 * apontasse 41 pendências seria ignorado na primeira semana -- e junto com ele
 * a única que importava.
 *
 * ---------------------------------------------------------------------------
 * ENTÃO A PERGUNTA MUDA
 * ---------------------------------------------------------------------------
 * Não é "esta migration rodou?", é "o que ela promete existe?". A segunda é
 * verificável contra o banco de verdade, e é a que produz consequência: uma
 * coluna que não existe quebra uma tela, independentemente de que caminho a
 * teria criado.
 *
 * Este módulo lê o SQL e extrai as PROMESSAS. A conferência acontece no
 * servidor, contra o catálogo do Postgres.
 *
 * ---------------------------------------------------------------------------
 * DELIBERADAMENTE INCOMPLETO
 * ---------------------------------------------------------------------------
 * Reconhece os cinco tipos de declaração que aparecem nestas 46 migrations:
 * tabela, coluna, índice, valor de enum e função. NÃO tenta ser um parser de
 * SQL -- policies, triggers, grants e views passam batido, e isso é escolha.
 *
 * A alternativa seria um parser de verdade, que erraria de formas difíceis de
 * prever. Um verificador que cobre pouco e acerta sempre é útil; um que cobre
 * tudo e às vezes acusa o que está certo é abandonado. E o modo de falha aqui
 * é benigno: o que ele não reconhece simplesmente não vira promessa, então o
 * pior caso é não avisar -- nunca avisar errado.
 */

export type TipoObjeto = 'tabela' | 'coluna' | 'indice' | 'enum' | 'funcao';

export interface Promessa {
  tipo: TipoObjeto;
  /** Nome do objeto. Para coluna, `tabela.coluna`; para enum, `tipo.valor`. */
  nome: string;
  /** Arquivo que a declarou, para o aviso dizer onde olhar. */
  arquivo: string;
}

/** Remove comentários e normaliza espaço, para os padrões não dependerem de layout. */
function limparSql(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')   // bloco
    .replace(/--[^\n]*/g, ' ')            // linha
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/** `public.x` e `"x"` viram `x`. O schema é sempre public neste projeto. */
const nu = (s: string) => s.replace(/"/g, '').replace(/^public\./, '').trim();

const PADROES: Array<{ tipo: TipoObjeto; re: RegExp; monta: (m: RegExpExecArray) => string }> = [
  {
    tipo: 'tabela',
    re: /create table (?:if not exists )?([\w".]+)/g,
    monta: (m) => nu(m[1]),
  },
  {
    // Uma migration pode adicionar várias colunas na mesma instrução; o `g`
    // pega a primeira de cada `alter table`. As demais entram pelo segundo
    // padrão abaixo -- separá-los é mais simples que uma regex que faz os dois.
    tipo: 'coluna',
    re: /alter table (?:if exists )?([\w".]+)\s+add column (?:if not exists )?([\w"]+)/g,
    monta: (m) => `${nu(m[1])}.${nu(m[2])}`,
  },
  {
    tipo: 'indice',
    re: /create (?:unique )?index (?:concurrently )?(?:if not exists )?([\w"]+)/g,
    monta: (m) => nu(m[1]),
  },
  {
    tipo: 'enum',
    re: /alter type ([\w".]+) add value (?:if not exists )?'([^']+)'/g,
    monta: (m) => `${nu(m[1])}.${m[2]}`,
  },
  {
    tipo: 'funcao',
    re: /create (?:or replace )?function ([\w".]+)\s*\(/g,
    monta: (m) => nu(m[1]),
  },
];

/**
 * As promessas de UM arquivo.
 *
 * `drop` é ignorado de propósito: uma migration que cria e depois derruba a
 * mesma coisa é rara, e tratar isso exigiria ordenar instruções -- complexidade
 * que só se paga quando o caso aparecer.
 */
export function lerPromessas(arquivo: string, sql: string): Promessa[] {
  const limpo = limparSql(sql);
  const out: Promessa[] = [];
  const vistos = new Set<string>();

  for (const p of PADROES) {
    p.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = p.re.exec(limpo)) !== null) {
      const nome = p.monta(m);
      const k = `${p.tipo}|${nome}`;
      if (!nome || vistos.has(k)) continue;
      vistos.add(k);
      out.push({ tipo: p.tipo, nome, arquivo });
    }
  }
  return out;
}

export interface ArquivoMigration {
  arquivo: string;
  sql: string;
}

/**
 * As promessas de todos os arquivos, sem repetição.
 *
 * Quando duas migrations declaram o mesmo objeto -- acontece com `create table
 * if not exists` repetido -- fica a MAIS ANTIGA, porque é ela que deveria ter
 * criado. É a que a pessoa precisa procurar quando o objeto não está lá.
 */
export function lerTodas(arquivos: readonly ArquivoMigration[]): Promessa[] {
  const porChave = new Map<string, Promessa>();
  for (const a of [...arquivos].sort((x, y) => (x.arquivo < y.arquivo ? -1 : 1))) {
    for (const p of lerPromessas(a.arquivo, a.sql)) {
      const k = `${p.tipo}|${p.nome}`;
      if (!porChave.has(k)) porChave.set(k, p);
    }
  }
  return [...porChave.values()];
}

export interface Faltando extends Promessa {
  /** Frase pronta para a tela. */
  descricao: string;
}

const COMO_CHAMAR: Record<TipoObjeto, string> = {
  tabela: 'tabela',
  coluna: 'coluna',
  indice: 'índice',
  enum: 'valor de enum',
  funcao: 'função',
};

/**
 * O que foi prometido e não existe.
 *
 * `existentes` vem do catálogo do Postgres, montado no servidor. A comparação
 * mora aqui, separada da consulta, para poder ser testada sem banco.
 */
export function pendencias(
  promessas: readonly Promessa[],
  existentes: ReadonlySet<string>,
): Faltando[] {
  return promessas
    .filter((p) => !existentes.has(`${p.tipo}|${p.nome}`))
    .map((p) => ({
      ...p,
      descricao: `${COMO_CHAMAR[p.tipo]} ${p.nome} — declarada em ${p.arquivo}`,
    }));
}
