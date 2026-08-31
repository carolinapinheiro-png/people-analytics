import { salaryBand, tenureBandFromHire } from '@/lib/person-bands';
import { valorFiltro } from '@/lib/filtro-sentinela';

/**
 * Os filtros de tela da folha de remuneração, num lugar só.
 *
 * ===========================================================================
 * POR QUE ISTO SAIU DE DENTRO DA SERVER FUNCTION
 * ===========================================================================
 * `listCompRatio` já aplicava os seis. O cartão de equidade, que vive na MESMA
 * tela e logo abaixo da lista, não aplicava nenhum: chamava o servidor sem
 * argumento.
 *
 * Duas populações diferentes na mesma página é pior que nenhum filtro. Com
 * Technology selecionado, a lista mostraria Technology e o cartão de equidade
 * mostraria a empresa inteira -- e nada na tela diria qual é qual.
 *
 * Copiar a cadeia de `.filter()` para o segundo lugar resolveria hoje e
 * divergiria na primeira vez que alguém mexesse num dos dois. Esta semana já
 * teve um caso assim: duas implementações da mesma regra de permissão, em
 * linhas separadas por sessenta, discordando.
 *
 * ===========================================================================
 * O QUE ESTA FUNÇÃO NÃO FAZ
 * ===========================================================================
 * NÃO decide permissão. `podeVerLinha` continua onde está, e roda ANTES desta
 * -- filtro de tela estreita o que a pessoa já pode ver, nunca amplia. Manter
 * as duas coisas separadas é deliberado: se um dia esta função ganhar um bug,
 * o pior que acontece é a tela mostrar gente demais dentro do escopo, não
 * gente de fora dele.
 */

export interface FiltrosDeComp {
  department?: string | null;
  level?: string | null;
  contract?: string | null;
  jobFamily?: string | null;
  tenureBand?: string | null;
  salaryBand?: string | null;
}

/** O que cada linha precisa ter para ser filtrável. */
export interface LinhaFiltravel {
  area?: string | null;
  level?: string | null;
  contract?: string | null;
  job_type_family?: string | null;
  hire?: string | null;
  salary?: number | string | null;
}

export function aplicarFiltrosDeComp<T extends LinhaFiltravel>(
  linhas: readonly T[],
  f: FiltrosDeComp | undefined,
): T[] {
  // `valorFiltro` é quem sabe do sentinela: a tela manda "Todos" quando nada
  // está filtrado, e "Todos" é truthy. Este arquivo já tropeçou nisso duas
  // vezes noutro contexto.
  const dept = valorFiltro(f?.department);
  const nivel = valorFiltro(f?.level);
  const contrato = valorFiltro(f?.contract);
  const familia = valorFiltro(f?.jobFamily);
  const tempo = valorFiltro(f?.tenureBand);
  const faixa = valorFiltro(f?.salaryBand);

  return linhas.filter((r) => {
    if (dept && (r.area ?? '').trim().toUpperCase() !== dept.toUpperCase()) return false;
    if (nivel && (r.level ?? '').trim() !== nivel) return false;
    if (contrato && (r.contract ?? '').trim() !== contrato) return false;
    if (familia && (r.job_type_family ?? '').trim() !== familia) return false;
    // As duas faixas são DERIVADAS de `hire` e `salary` -- não existem como
    // coluna. Quem não tem admissão ou salário no cadastro cai em "Não
    // informado" e sai do recorte: não sabemos a faixa dessa pessoa, então ela
    // não entra na faixa escolhida.
    if (tempo && tenureBandFromHire(r.hire) !== tempo) return false;
    if (faixa && salaryBand(r.salary == null ? null : Number(r.salary)) !== faixa) return false;
    return true;
  });
}
