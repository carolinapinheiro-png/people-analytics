import React, { createContext, useContext, useState, useMemo } from 'react';
import { RAW_DATA, MonthRecord } from './raw-data';
import { LEAVERS_DATA, LeaverRecord } from './leavers-data';
import { getMonthsOrder, getMonthData, getAllMonthsForBrand, aggregateMonthlyToQuarterly } from './helpers';

export type BrandType = 'combined' | 'NSX' | 'Betfair BR' | 'Flutter International';
export type TabType = 'overview' | 'trend' | 'dei' | 'salary' | 'location' | 'movement' | 'engagement' | 'span' | 'unwanted' | 'data' | 'compratio' | 'leavers';
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
  monthsOrder: string[];
  currentMonth: string;
  currentData: MonthRecord;
  prevData: MonthRecord | undefined;
  allMonthsData: MonthRecord[];
  filteredDeptKey: string | null;
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
  const [data] = useState<MonthRecord[]>(RAW_DATA);
  const [leavers] = useState<LeaverRecord[]>(LEAVERS_DATA);
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

  const monthsOrder = useMemo(() => getMonthsOrder(data), [data]);
  const [currentMonthIdx, setCurrentMonthIdx] = useState(monthsOrder.length - 1);

  const currentMonth = monthsOrder[currentMonthIdx] || '';
  const filteredDeptKey = filters.departamento !== 'Todos' ? filters.departamento : null;

  // Get monthly data first
  const monthlyAllData = useMemo(() => {
    const raw = getAllMonthsForBrand(data, brand);
    return filteredDeptKey ? raw.map(r => applyDeptFilter(r, filteredDeptKey)) : raw;
  }, [data, brand, filteredDeptKey]);

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
      monthsOrder, currentMonth, currentData, prevData, allMonthsData,
      filteredDeptKey,
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
