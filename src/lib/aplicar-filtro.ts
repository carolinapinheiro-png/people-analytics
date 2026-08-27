import type { Filters } from '@/data/DashboardContext';
import { RECORTES_EXCLUSIVOS, PERFIS_EXCLUSIVOS, type FilterKey } from '@/lib/tab-filters';
import { SEM_FILTRO, semFiltro } from '@/lib/filtro-sentinela';

/**
 * O que acontece com os OUTROS filtros quando um deles muda.
 *
 * ------------------------------------------------------------------
 * POR QUE ISTO SAIU DO COMPONENTE
 * ------------------------------------------------------------------
 * Duas regras de exclusividade convivem aqui, com escopos diferentes -- uma
 * vale em toda aba, a outra só em Engajamento -- e o efeito delas é apagar
 * uma seleção que a pessoa acabou de fazer noutro seletor.
 *
 * Isso já chegou como "os filtros não estão se cruzando: quando seleciono
 * departamento, ou tempo de casa, o modelo volta para todos". Dentro do JSX,
 * a única forma de responder era ler o `if` e torcer; agora dá para perguntar
 * ao teste.
 *
 * ------------------------------------------------------------------
 * AS DUAS REGRAS, E POR QUE CADA UMA EXISTE
 * ------------------------------------------------------------------
 * RECORTES_EXCLUSIVOS (level, tempo de casa) -- a série mensal não guarda o
 * cruzamento entre eles. Vale em todas as abas que leem a série.
 *
 * PERFIS_EXCLUSIVOS -- hoje VAZIA. Tempo de casa e modelo se excluíam porque
 * 'tempo+modelo' não era gravado; passou a ser, e medido é o cruzamento com
 * melhor aproveitamento do painel. Ver a constante para os números.
 *
 * DEPARTAMENTO NÃO ESTÁ EM NENHUMA DAS DUAS, de propósito: ele soma com
 * qualquer perfil desde que os cruzados passaram a ser gravados nos drivers.
 *
 * Com a segunda lista vazia, a barra só troca seleção no caso de nível ×
 * tempo de casa, que é da SÉRIE MENSAL. Na pesquisa nada mais se apaga
 * sozinho -- que era o pedido: "os filtros não estão se cruzando".
 */

export interface ResultadoDoFiltro {
  filtros: Filters;
  /** Os que foram zerados para caber na regra. Vazio quando nada saiu. */
  limpos: FilterKey[];
}

export function aplicarFiltro(
  filtros: Filters,
  chave: FilterKey,
  valor: string,
  aba: string,
): ResultadoDoFiltro {
  const proximo = { ...filtros, [chave]: valor } as Filters;
  const limpos: FilterKey[] = [];

  // Desligar um filtro nunca mexe nos outros: só ligar cria conflito.
  if (semFiltro(valor)) return { filtros: proximo, limpos };

  const zerar = (grupo: readonly FilterKey[]) => {
    if (!grupo.includes(chave)) return;
    for (const outro of grupo) {
      if (outro === chave) continue;
      if (semFiltro(proximo[outro as keyof Filters] as string)) continue;
      proximo[outro as keyof Filters] = SEM_FILTRO;
      limpos.push(outro);
    }
  };

  zerar(RECORTES_EXCLUSIVOS);
  if (aba === 'engagement') zerar(PERFIS_EXCLUSIVOS);

  return { filtros: proximo, limpos: [...new Set(limpos)] };
}
