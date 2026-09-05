import React, { createContext, useContext, useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useServerFn } from '@tanstack/react-start';
import type { MonthRecord } from './raw-data';
import type { LeaverRecord } from './leaver-types';
import { listLeavers } from '@/lib/leavers.functions';
import { getMonthlyMetrics, getCoberturaAnos } from '@/lib/metrics.functions';
import type { CoberturaBase } from '@/lib/cobertura';
import { composeMonthlyMetrics, diagnosticarSerie, type DiagnosticoSerie } from './compose-metrics';
import { useAuth } from '@/contexts/AuthContext';
import { isGlobalProfile, normalizeDept } from '@/lib/permissions';
import { readNavState, writeNavState } from '@/lib/nav-state';
import { SEM_FILTRO, semFiltro, valorFiltro } from '@/lib/filtro-sentinela';
import { getMonthsOrder, getMonthData, getAllMonthsForBrand, aggregateMonthlyToQuarterly } from './helpers';

export type BrandType = 'combined' | 'NSX' | 'Betfair BR' | 'Flutter International';
export type TabType = 'overview' | 'team' | 'dei' | 'comp' | 'demographics' | 'engagement' | 'span' | 'attrition' | 'recruitment' | 'individual' | 'data';
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
  /** Presencial / Híbrido / Remoto. Só a aba de Engajamento aplica. */
  modeloTrabalho: string;
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
  /** Sub-aba ativa dentro de um agrupador (Quadro, Ciclo de vida). A barra de
   *  filtros decide o que oferecer a partir dela: dentro de Ciclo de vida, so
   *  Atricao aplica filtro. Sem isto o grupo herdaria os sete e a barra
   *  voltaria a mostrar controle que nao faz nada. */
  activeSubTab: string | null;
  setActiveSubTab: (t: string | null) => void;
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
  /**
   * Qual série está no ar. `congelada` significa que a oficial não chegou e o
   * painel está mostrando a cópia antiga -- coisa que já aconteceu por dois
   * meses sem ninguém saber. Ver compose-metrics.ts.
   */
  serie: DiagnosticoSerie | null;
  /**
   * Até onde cada base alcança. O filtro de ano usa para rotular os anos que
   * só têm parte do painel -- 2013 a 2023 só têm a série de quadro.
   */
  cobertura: CoberturaBase[];
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
    // ------------------------------------------------------------------
    // NAO ACHOU A AREA: ZERA OS ESCALARES **E SE DECLARA APROXIMADO**
    // ------------------------------------------------------------------
    // O `dept_filter_exact` faltava aqui, e este ramo e o mais perigoso dos
    // tres: ele zera headcount, joiners, leavers, leaders e promotions -- mas
    // deixa gender_female_pct, leader_female_pct, level_base, tenure_base,
    // demographics e race_cross com os valores da EMPRESA.
    //
    // Filtrar por uma area entao devolvia "Mulheres - Geral: 33,6%" identico
    // ao da empresa inteira, ao lado de um headcount zero. Sem a marca, nada
    // rio abaixo tinha como saber que aquilo nao era do departamento.
    return {
      ...record, dept_filter_exact: false,
      headcount: 0, joiners: 0, leavers: 0, leaders: 0, promotions: 0,
    };
  }
  const [deptName, deptInfo] = deptEntry;
  const ratio = record.headcount > 0 ? deptInfo.hc / record.headcount : 0;

  // Fase 2: se a serie tem a quebra EXATA deste departamento (dept_breakdown),
  // troca os blocos de dimensao (genero, nivel, tempo de casa, demograficos,
  // raca) pela fatia do depto -- as abas de tendencia passam a recortar de
  // verdade. Sem o breakdown (Betfair/Flutter ou meses antigos), cai no rateio
  // proporcional dos escalares e mantem as dimensoes company-wide (fallback).
  const db = record.dept_breakdown?.[deptName];
  const base: MonthRecord = {
    ...record,
    // Sem dept_breakdown (marca Combinada, meses antigos, Betfair/Flutter) as
    // dimensoes ficam company-wide. Marcar aqui evita que um recorte posterior
    // misture headcount de departamento com distribuicao de empresa.
    dept_filter_exact: !!db,
    headcount: deptInfo.hc,
    // ------------------------------------------------------------------
    // ENTRADAS E SAIDAS: EXATAS QUANDO EXISTEM
    // ------------------------------------------------------------------
    // Isto rateava sempre -- entradas da empresa vezes a fatia de headcount da
    // area. A carga conta as duas POR AREA desde sempre; o que faltava era
    // guarda-las. Com o numerador estimado sobre um denominador exato, a
    // atricao do recorte saia de duas populacoes diferentes.
    //
    // O rateio fica como reserva para linhas antigas, que nao tem os campos.
    joiners: deptInfo.joiners ?? Math.round((record.joiners || 0) * ratio),
    leavers: deptInfo.leavers ?? Math.round((record.leavers || 0) * ratio),
    // Recalculada da area, e nao herdada. `...record` trazia a taxa da EMPRESA
    // para dentro do recorte -- um numero que nao tinha nada a ver com o
    // departamento selecionado e que ninguem tinha como conferir na tela.
    attrition_rate: (() => {
      const sai = deptInfo.leavers ?? Math.round((record.leavers || 0) * ratio);
      const expostos = deptInfo.hc + sai;
      return expostos > 0 ? Math.round((sai / expostos) * 1000) / 10 : 0;
    })(),
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
    dept_breakdown: db ? { [deptName]: db } : undefined,
  };
  if (!db) return base;

  const genderBase = db.gender_female + db.gender_male;
  return {
    ...base,
    gender_female: db.gender_female,
    gender_male: db.gender_male,
    gender_female_pct: genderBase ? Math.round((db.gender_female / genderBase) * 1000) / 10 : 0,
    leaders: db.leaders,
    leader_female: db.leader_female,
    leader_female_pct: db.leaders ? Math.round((db.leader_female / db.leaders) * 1000) / 10 : 0,
    leaders_pct: deptInfo.hc ? Math.round((db.leaders / deptInfo.hc) * 1000) / 10 : 0,
    level_base: db.level_base,
    tenure_base: db.tenure_base,
    demographics: db.demographics,
    race_cross: db.race_cross,
    leader_dept: { [deptName]: { leaders: db.leaders, female: db.leader_female } },
  };
}

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  // Serie mensal: agora vem do banco (monthly_metrics), nao mais do mock
  // raw-data.ts. Reconstruida oficial + congelada nos 3 campos que ela nao
  // gera; so linhas confiaveis (quality_flag IS NULL). Ver compose-metrics.ts.
  const [data, setData] = useState<MonthRecord[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [serie, setSerie] = useState<DiagnosticoSerie | null>(null);
  // Cobertura por base. Falha aqui não derruba nada: sem ela o filtro de ano
  // volta a ser uma lista simples, que é o comportamento anterior.
  const [cobertura, setCobertura] = useState<CoberturaBase[]>([]);
  const fetchCobertura = useServerFn(getCoberturaAnos);
  useEffect(() => {
    let cancelled = false;
    fetchCobertura()
      .then((c) => { if (!cancelled) setCobertura((c ?? []) as CoberturaBase[]); })
      .catch((e: unknown) => console.error('cobertura por ano indisponivel:', e));
    return () => { cancelled = true; };
  }, [fetchCobertura]);
  const fetchMetrics = useServerFn(getMonthlyMetrics);

  useEffect(() => {
    let cancelled = false;
    setDataLoading(true);
    setDataError(null);
    // 'convenia' é a série oficial; 'raw-data.ts' entra só para preencher
    // pesquisa de desligamento e atrição por faixa salarial, que o Convenia não
    // tem. A 'reconstruido' saiu: superestimava Betfair BR ao somar o Porto.
    fetchMetrics({ data: { sources: ['convenia', 'raw-data.ts'] } })
      .then((rows) => {
        if (cancelled) return;
        setData(composeMonthlyMetrics(rows));
        setSerie(diagnosticarSerie(rows));
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
    jobFamily: SEM_FILTRO,
    departamento: SEM_FILTRO,
    tempoCasa: SEM_FILTRO,
    centroCusto: SEM_FILTRO,
    tipoContrato: SEM_FILTRO,
    faixaSalarial: SEM_FILTRO,
    tipoDesligamento: SEM_FILTRO,
    level: SEM_FILTRO,
    modeloTrabalho: SEM_FILTRO,
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
  const [activeSubTab, setActiveSubTab] = useState<string | null>(null);

  // Restaura aba/sub-aba do ultimo acesso. Feito em efeito (nao no init do
  // useState) porque no SSR nao existe localStorage e o HTML divergiria.
  const lastTab = useRef<TabType>(activeTab);
  const [navRestored, setNavRestored] = useState(false);
  useEffect(() => {
    const s = readNavState();
    if (s?.tab) {
      // Marcado ANTES de mudar a aba para o efeito de reset abaixo nao apagar
      // a sub-aba que acabamos de restaurar.
      lastTab.current = s.tab as TabType;
      setActiveTab(s.tab as TabType);
      if (s.sub !== undefined) setActiveSubTab(s.sub);
    }
    setNavRestored(true);
  }, []);

  useEffect(() => {
    if (navRestored) writeNavState({ tab: activeTab, sub: activeSubTab });
  }, [navRestored, activeTab, activeSubTab]);

  // Trocar de aba principal ZERA a sub-aba. Sem isto, sair de
  // "Ciclo de vida > Atricao" para "Quadro" levaria junto o subTab 'atricao',
  // e a barra ofereceria os sete filtros numa aba que aplica um -- de volta ao
  // problema de mostrar controle que nao faz nada.
  //
  // SÓ DEPOIS DA RESTAURAÇÃO, e é isso que consertava o "recarreguei e voltei
  // para a página errada". O efeito de restauração mexe em `lastTab.current`
  // de forma síncrona, mas `activeTab` só muda na renderização seguinte. No
  // mesmo ciclo de montagem este efeito comparava o ref já restaurado
  // ('engagement') com o estado ainda inicial ('overview'), concluía que houve
  // troca de aba e apagava a sub-aba recém-restaurada -- e ainda devolvia o
  // ref para 'overview', fazendo a renderização seguinte apagar de novo.
  //
  // A aba principal voltava, a sub-aba não. Quem estava em "Ciclo de vida >
  // Atrição" recarregava e caía na primeira sub-aba do Ciclo de vida, o que se
  // parece o bastante com "voltou para o lugar errado".
  useEffect(() => {
    if (!navRestored) return;
    if (lastTab.current === activeTab) return;
    lastTab.current = activeTab;
    setActiveSubTab(null);
  }, [navRestored, activeTab]);
  const [yearFilter, setYearFilter] = useState<string>('atual');
  const activeYear =
    semFiltro(yearFilter)
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
  const filteredDeptKey = valorFiltro(filters.departamento);

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
      activeTab, setActiveTab, activeSubTab, setActiveSubTab, view, setView, filters, setFilters,
      yearFilter, setYearFilter, availableYears, activeYear,
      monthsOrder, currentMonth, currentData, prevData, allMonthsData,
      filteredDeptKey, dataLoading, dataError, serie, cobertura,
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
