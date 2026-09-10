import { useMemo } from 'react';
import type { MonthRecord } from './raw-data';
import { useDashboard } from './DashboardContext';
import {
  applySeriesFilter,
  resolveSeriesCut,
  type SeriesFilterKey,
  type SeriesFilterResult,
} from './series-filter';
import { filtersForTab } from '@/lib/tab-filters';
import type { DashboardTab } from '@/lib/permissions';

/**
 * O recorte de dimensão, aplicado uma vez e do mesmo jeito em toda aba.
 *
 * ===========================================================================
 * POR QUE ISTO EXISTE
 * ===========================================================================
 * Até 10/09 só o `OverviewTab` chamava `applySeriesFilter`. Ele tinha o
 * recorte escrito no corpo do componente, e nenhuma outra aba tinha.
 *
 * Quando `tab-filters.ts` passou a oferecer job family, contrato e tempo de
 * casa em Demográficos e DEI, os seletores acenderam e não filtravam nada --
 * porque não havia ninguém do outro lado para aplicar. Foi o defeito que
 * `tab-filters.ts` existe para impedir, cometido pela mão de quem escreveu o
 * arquivo.
 *
 * A causa não foi distração: era possível DECLARAR um filtro num arquivo e
 * IMPLEMENTAR o recorte em outro, e nada ligava os dois. Este hook fecha essa
 * distância -- quem declara passa a receber o recorte de graça.
 *
 * ===========================================================================
 * O QUE ELE RECORTA, E O QUE NÃO
 * ===========================================================================
 * Só as dimensões que a ABA declara em `filtersForTab`. O estado dos filtros é
 * global e sobrevive à troca de aba: sem esta checagem, um "Job family: Data"
 * escolhido em Demográficos recortaria silenciosamente uma aba que nunca
 * prometeu recortar por isso.
 *
 * `applySeriesFilter` decide o resto -- inclusive devolver os demográficos
 * como suprimidos quando a linha do mês é anterior à quebra.
 */
export interface RecorteDeSerie {
  /** A série inteira, já recortada. */
  allMonthsData: MonthRecord[];
  /** O mês de referência, recortado. `undefined` se ele não está na série. */
  currentData: MonthRecord;
  /** O mês anterior, recortado. */
  prevData: MonthRecord | undefined;
  /** O resultado bruto, para a tela mostrar rótulo, avisos e supressões. */
  cut: SeriesFilterResult;
}

export function useRecorteDeSerie(tab: DashboardTab, subTab?: string | null): RecorteDeSerie {
  const { allMonthsData, currentData, prevData, filters, leavers } = useDashboard();

  return useMemo(() => {
    const oferecidos = new Set<string>(filtersForTab(tab, subTab));
    // Só entram no resolvedor as dimensões que ESTA aba declara. As outras
    // continuam selecionadas na barra e simplesmente não recortam aqui.
    const candidatos: Partial<Record<SeriesFilterKey, string>> = {};
    for (const k of ['level', 'tempoCasa', 'jobFamily', 'tipoContrato'] as const) {
      if (oferecidos.has(k) && filters[k]) candidatos[k] = filters[k];
    }

    const escolha = resolveSeriesCut(candidatos);
    const cut = applySeriesFilter(
      allMonthsData,
      leavers,
      escolha.key,
      escolha.value,
      filters.departamento,
    );

    if (!cut.active) {
      return { allMonthsData, currentData, prevData, cut };
    }

    // O mês de referência tem de sair da série RECORTADA, e não do contexto:
    // senão os cartões do topo mostrariam a empresa e os gráficos a fatia, na
    // mesma tela. Duas populações numa tela só é como um painel perde a
    // confiança de quem o lê.
    const porMes = new Map(cut.months.map((m) => [m.month, m]));
    return {
      allMonthsData: cut.months,
      currentData: porMes.get(currentData?.month) ?? currentData,
      prevData: prevData ? porMes.get(prevData.month) ?? prevData : undefined,
      cut,
    };
  }, [allMonthsData, currentData, prevData, filters, leavers, tab, subTab]);
}
