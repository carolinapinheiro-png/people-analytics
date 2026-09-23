/**
 * O seletor do topo (entidade) passa a recortar a aba de Engajamento.
 *
 * ------------------------------------------------------------------
 * CORREÇÃO DE UMA PREMISSA ERRADA
 * ------------------------------------------------------------------
 * A aba dizia que entidade e marca de produto "não são a mesma coisa" e que
 * "NSX BETFAIR BRASIL S.A." é entidade NSX. O próprio código já dizia o
 * contrário: `monthly-aggregator.ts` e `comp.functions.ts` roteiam essa razão
 * social para Betfair BR. Carolina confirmou (23/09): a entidade Betfair BR
 * é quem atende a marca Betfair, e a NSX atende a Betnacional.
 *
 * Então o seletor passa a valer aqui, via a marca que a pesquisa pergunta:
 *   Betfair BR -> Betfair
 *   NSX        -> Betnacional
 *   Flutter International -> sem equivalente na pesquisa (null)
 *
 * Limite conhecido: quem respondeu "Cross Brand" não entra em nenhuma das
 * duas, porque a pesquisa é anônima e não diz a entidade dessa pessoa.
 */
import type { BrandType } from '@/data/DashboardContext';

const MARCA_POR_ENTIDADE: Partial<Record<BrandType, string>> = {
  'Betfair BR': 'Betfair',
  NSX: 'Betnacional',
};

/** A marca de produto que corresponde à entidade, ou null se não houver. */
export function marcaDaEntidade(brand: BrandType): string | null {
  return MARCA_POR_ENTIDADE[brand] ?? null;
}

/**
 * Os filtros que a pesquisa deve receber: com uma entidade mapeável no topo,
 * a marca de produto vem dela. Sem mapeamento, os filtros passam intactos.
 */
export function filtrosDaPesquisa<T extends { marcaProduto?: string | null }>(
  filters: T,
  brand: BrandType,
): T {
  const marca = marcaDaEntidade(brand);
  return marca ? { ...filters, marcaProduto: marca } : filters;
}
