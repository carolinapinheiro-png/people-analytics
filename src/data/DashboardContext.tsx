import React, { createContext, useContext, useState, useMemo, useEffect, useCallback } from 'react';
import { useServerFn } from '@tanstack/react-start';
import type { MonthRecord } from './raw-data';
import type { LeaverRecord } from './leaver-types';
import { listLeavers } from '@/lib/leavers.functions';
import { getMonthlyMetrics } from '@/lib/metrics.functions';
import { composeMonthlyMetrics } from './compose-metrics';
import { useAuth } from '@/contexts/AuthContext';
import { isGlobalProfile, normalizeDept } from '@/lib/permissions';
import { getMonthsOrder, getMonthData, getAllMonthsForBrand, aggregateMonthlyToQuarterly } from './helpers';

export type BrandType = 'combined' | 'NSX' | 'Betfair BR' | 'Flutter International';
export type TabType = 'overview' | 'dei' | 'comp' | 'demographics' | 'engagement' | 'span' | 'attrition' | 'individual' | 'data';
export type ViewType = 'monthly' | 'quarterly';

export interface Filters {
  jobFamily: string;
  departamento: string;
  tempoCasa: string;
  centroCusto: string;
  tipoContrato: string;
  faixaSalarial: string;
  tipoDesligamento: string;
  level: string;
}

interface DashboardState {
  data: MonthRecord[];
  leavers: LeaverRecord[];
  brand: BrandType;
  setBrand: (b: BrandType) => void;
  currentMonthIdx: number;
  setCurrentMonthIdx: (i: number) => void;
  activeTab: TabType;
  setActiveTab: (t: TabType) => void;
  view: ViewType;
  setView: (v: ViewType) => void;
  filters: Filters;
  setFilters: (f: Filters) => void;
  /** Filtro de ano global: 'atual' (ano mais recente), 'Todos', ou 'AAAA'. */
  yearFilter: string;
  setYearFilter: (y: string) => void;
  /** Anos presentes na serie (para montar o seletor). */
  availableYears: string[];
  /** Ano em escopo hoje (null = Todos). Util para filtrar dados individuais. */
  activeYear: string | null;
  monthsOrder: string[];
  currentMonth: string;
  currentData: MonthRecord;
  prevData: MonthRecord | undefined;
  allMonthsData: MonthRecord[];
  filteredDeptKey: string | null;
  /** A serie mensal agora vem do banco (nao mais do mock), entao tem carga. */
  dataLoading: boolean;
  dataError: string | null;
  /** Dado individual de desligados vem do servidor, entao tem estado de carga. */
  leaversLoading: boolean;
  leaversError: string | null;
  reloadLeavers: () => void;
}

const DashboardContext = createContext<DashboardState | null>(null);

/**
 * When a departamento filter is active, we scale the MonthRecord
 * proportionally based on that department's share of headcount.
 */
function applyDeptFilter(record: MonthRecord, dept: string): MonthRecord {
  const deptEntry = Object.entries(record.dept_data || {}).find(
    ([k]) => k.toUpperCase() === dept.toUpperCase()
  );
  if (!deptEntry) {
    // Department not found in this month — return zeroed record
    return { ...record, headcount: 0, joiners: 0, leavers: 0, leaders: 0, promotions: 0 };
  }
  const [deptName, deptInfo] = deptEntry;
  const ratio = record.headcount > 0 ? deptInfo.hc / record.headcount : 0;

  return {
    ...record,
    headcount: deptInfo.hc,
    joiners: Math.round((record.joiners || 0) * ratio),
    leavers: Math.round((record.leavers || 0) * ratio),
    leaders: Math.round((record.leaders || 0) * ratio),
    promotions: Math.round((record.promotions || 0) * ratio),
    gender_female: Math.round((record.gender_female || 0) * ratio),
    gender_male: Math.round((record.gender_male || 0) * ratio),
    gender_female_pct: record.gender_female_pct, // keep overall pct
    leader_female: Math.round((record.leader_female || 0) * ratio),
    leader_female_pct: record.leader_female_pct,
    leaders_pct: record.leaders_pct,
    avg_salary_leaders: deptInfo.avg_salary_leaders,
    avg_salary_non_leaders: deptInfo.avg_salary_non_leaders,
    dept_data: { [deptName]: deptInfo },
  };
}

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  // Serie mensal: agora vem do banco (monthly_metrics), nao mais do mock
  // raw-data.ts. Reconstruida oficial + congelada nos 3 campos que ela nao
  // gera; so linhas confiaveis (quality_flag IS NULL). Ver compose-metrics.ts.
  const [data, setData] = useState<MonthRecord[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const fetchMetrics = useServerFn(getMonthlyMetrics);

  useEffect(() => {
    let cancelled = false;
    setDataLoading(true);
    setDataError(null);
    fetchMetrics({ data: { sources: ['reconstruido', 'raw-data.ts'] } })
      .then((rows) => {
        if (cancelled) return;
        setData(composeMonthlyMetrics(rows));
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        console.error('Falha ao carregar a serie mensal:', e);
        setDataError(e instanceof Error ? e.message : 'Falha ao carregar a serie mensal');
      })
      .finally(() => {
        if (!cancelled) setDataLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchMetrics]);

  // Desligados nao vem mais de um import: o arquivo carregava 152 pessoas com
  // nome, raca e salario para dentro do bundle, ou seja, para o navegador de
  // qualquer pessoa autenticada. Agora a leitura passa por listLeavers, que
  // roda no servidor e registra quem consultou.
  const [leavers, setLeavers] = useState<LeaverRecord[]>([]);
  const [leaversLoading, setLeaversLoading] = useState(true);
  const [leaversError, setLeaversError] = useState<string | null>(null);
  const fetchLeavers = useServerFn(listLeavers);

  const reloadLeavers = useCallback(() => {
    let cancelled = false;
    setLeaversLoading(true);
    setLeaversError(null);

    fetchLeavers({ data: { context: 'dashboard' } })
      .then((rows) => {
        if (cancelled) return;
        // numeric do Postgres pode chegar como string dependendo do driver.
        setLeavers(
          (rows ?? []).map((r) => ({
            ...r,
            salario: Number(r.salario ?? 0),
            tempo_casa_dias: Number(r.tempo_casa_dias ?? 0),
          })) as LeaverRecord[],
        );
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        console.error('Falha ao carregar desligados:', e);
        setLeaversError(e instanceof Error ? e.message : 'Falha ao carregar desligados');
      })
      .finally(() => {
        if (!cancelled) setLeaversLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fetchLeavers]);

  useEffect(() => reloadLeavers(), [reloadLeavers]);
  const [brand, setBrand] = useState<BrandType>('combined');
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [view, setView] = useState<ViewType>('monthly');
  const [filters, setFilters] = useState<Filters>({
    jobFamily: 'Todos',
    departamento: 'Todos',
    tempoCasa: 'Todos',
    centroCusto: 'Todos',
    tipoContrato: 'Todos',
    faixaSalarial: 'Todos',
    tipoDesligamento: 'Todos',
    level: 'Todos',
  });

  // Perfil com escopo (HRBP / Department Leader) nunca ve o consolidado:
  // o filtro de departamento nasce travado no primeiro departamento atendido.
  const { profile, departments } = useAuth();
  const scopedDepartments = useMemo(
    () =>
      profile && !isGlobalProfile(profile)
        ? departments.map(normalizeDept).filter(Boolean)
        : null,
    [profile, departments],
  );

  useEffect(() => {
    if (!scopedDepartments) return;
    setFilters((f) =>
      scopedDepartments.includes(normalizeDept(f.departamento))
        ? f
        : { ...f, departamento: scopedDepartments[0] ?? 'SEM ACESSO' },
    );
  }, [scopedDepartments]);

  const monthsOrderAll = useMemo(() => getMonthsOrder(data), [data]);
  const availableYears = useMemo(
    () => [...new Set(monthsOrderAll.map((m) => m.slice(0, 4)))].sort(),
    [monthsOrderAll],
  );
  const [yearFilter, setYearFilter] = useState<string>('atual');
  const activeYear =
    yearFilter === 'Todos'
      ? null
      : yearFilter === 'atual'
        ? (availableYears[availableYears.length - 1] ?? null)
        : yearFilter;

  // Filtro de ano global: restringe a serie ao ano escolhido (mes atual passa a
  // ser o mais recente daquele ano; historico so daquele ano). "Todos" = tudo.
  const monthsOrder = useMemo(
    () => (activeYear ? monthsOrderAll.filter((m) => m.startsWith(activeYear)) : monthsOrderAll),
    [monthsOrderAll, activeYear],
  );
  const [currentMonthIdx, setCurrentMonthIdx] = useState(0);

  // Quando a lista de meses em escopo muda (carga inicial ou troca de ano),
  // aponta para o mes mais recente do escopo.
  useEffect(() => {
    if (monthsOrder.length > 0) setCurrentMonthIdx(monthsOrder.length - 1);
  }, [monthsOrder.length, activeYear]);

  const currentMonth = monthsOrder[currentMonthIdx] || monthsOrder[monthsOrder.length - 1] || '';
  const filteredDeptKey = filters.departamento !== 'Todos' ? filters.departamento : null;

  // Get monthly data first (ja restrito ao ano em escopo).
  const monthlyAllData = useMemo(() => {
    const raw = getAllMonthsForBrand(data, brand).filter(
      (r) => !activeYear || r.month.startsWith(activeYear),
    );
    return filteredDeptKey ? raw.map(r => applyDeptFilter(r, filteredDeptKey)) : raw;
  }, [data, brand, filteredDeptKey, activeYear]);

  // Aggregate to quarterly if needed
  const allMonthsData = useMemo(() => {
    if (view === 'quarterly') {
      return aggregateMonthlyToQuarterly(monthlyAllData);
    }
    return monthlyAllData;
  }, [monthlyAllData, view]);

  // Current data depends on view
  const currentData = useMemo(() => {
    if (view === 'quarterly') {
      // Find the quarter that contains the current month
      const currentQuarter = allMonthsData.find(q => {
        // Check if current month is in this quarter
        const [qYear, qNum] = q.month.split('Q');
        const qStartMonth = (parseInt(qNum) - 1) * 3 + 1;
        const qEndMonth = qStartMonth + 2;
        const [cYear, cMonth] = currentMonth.split('-').map(Number);
        return cYear === parseInt(qYear) && cMonth >= qStartMonth && cMonth <= qEndMonth;
      });
      return currentQuarter || allMonthsData[allMonthsData.length - 1] || monthlyAllData[monthlyAllData.length - 1];
    }
    // Monthly view - get specific month
    const raw = getMonthData(data, currentMonth, brand);
    if (filteredDeptKey) return applyDeptFilter(raw, filteredDeptKey);
    return raw;
  }, [data, currentMonth, brand, filteredDeptKey, view, allMonthsData, monthlyAllData]);

  // Previous data depends on view
  const prevData = useMemo(() => {
    if (view === 'quarterly') {
      const currentIdx = allMonthsData.findIndex(d => d.month === currentData.month);
      return currentIdx > 0 ? allMonthsData[currentIdx - 1] : undefined;
    }
    // Monthly view
    if (currentMonthIdx > 0) {
      const raw = getMonthData(data, monthsOrder[currentMonthIdx - 1], brand);
      if (filteredDeptKey) return applyDeptFilter(raw, filteredDeptKey);
      return raw;
    }
    return undefined;
  }, [data, currentMonthIdx, monthsOrder, brand, filteredDeptKey, view, allMonthsData, currentData]);

  return (
    <DashboardContext.Provider value={{
      data, leavers, brand, setBrand, currentMonthIdx, setCurrentMonthIdx,
      activeTab, setActiveTab, view, setView, filters, setFilters,
      yearFilter, setYearFilter, availableYears, activeYear,
      monthsOrder, currentMonth, currentData, prevData, allMonthsData,
      filteredDeptKey, dataLoading, dataError,
      leaversLoading, leaversError, reloadLeavers,
    }}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error('useDashboard must be used within DashboardProvider');
  return ctx;
}
