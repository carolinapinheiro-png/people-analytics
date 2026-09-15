import { useMemo } from 'react';
import { useDashboard } from './DashboardContext';
import { resolverPeriodo, type Periodo } from '@/lib/periodo';

/**
 * O período em escopo (ano + visão + mês do topo), pronto para recortar
 * qualquer fonte de dado que tenha mês -- ver `src/lib/periodo.ts`.
 *
 * A série do contexto já vem recortada; este hook é para o resto: a lista de
 * desligados, a série de recrutamento, o mix de contratos. Um único lugar
 * derivando a régua, para não haver duas leituras de "julho" na mesma tela.
 */
export function usePeriodo(): Periodo {
  const { view, currentMonth, activeYear } = useDashboard();
  return useMemo(
    () => resolverPeriodo({ view, currentMonth, activeYear }),
    [view, currentMonth, activeYear],
  );
}
