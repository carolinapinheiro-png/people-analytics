import React from 'react';
import { DashboardProvider, useDashboard } from '@/data/DashboardContext';
import { Button } from '@/components/ui/button';
import TopBar from '@/components/layout/TopBar';
import FilterBar from '@/components/layout/FilterBar';
import TabNavigation from '@/components/layout/TabNavigation';
import OverviewTab from '@/components/tabs/OverviewTab';
import TrendTab from '@/components/tabs/TrendTab';
import DEITab from '@/components/tabs/DEITab';
import CompensationTab from '@/components/tabs/CompensationTab';
import LocationTab from '@/components/tabs/LocationTab';
import EngagementTab from '@/components/tabs/EngagementTab';
import SpanTab from '@/components/tabs/SpanTab';
import AttritionTab from '@/components/tabs/AttritionTab';
import DataTab from '@/components/tabs/DataTab';

/**
 * As abas de desligados dependem de dado individual, que agora vem do servidor
 * em vez de estar no bundle. Tratar carga e erro aqui, no ponto de troca de
 * aba, evita espalhar early return dentro de cada aba -- o que quebraria a
 * ordem dos hooks, ja que ambas chamam useMemo depois do useDashboard.
 */
function LeaversGate({ children }: { children: React.ReactNode }) {
  const { leaversLoading, leaversError, reloadLeavers } = useDashboard();

  if (leaversLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (leaversError) {
    return (
      <div className="max-w-md mx-auto text-center py-24 space-y-4">
        <h2 className="text-lg font-semibold text-foreground">
          Não foi possível carregar os desligados
        </h2>
        <p className="text-sm text-muted-foreground">{leaversError}</p>
        <Button onClick={() => reloadLeavers()}>Tentar novamente</Button>
      </div>
    );
  }

  return <>{children}</>;
}

function DashboardContent() {
  const { activeTab, dataLoading, dataError } = useDashboard();

  // A serie mensal agora vem do banco. Ate carregar, nao renderiza as abas --
  // elas assumem que ha dados e quebrariam com lista vazia.
  if (dataLoading) {
    return (
      <div className="min-h-screen bg-background">
        <TopBar />
        <div className="flex items-center justify-center py-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </div>
    );
  }

  if (dataError) {
    return (
      <div className="min-h-screen bg-background">
        <TopBar />
        <div className="max-w-md mx-auto text-center py-32 space-y-3">
          <h2 className="text-lg font-semibold text-foreground">
            Não foi possível carregar os indicadores
          </h2>
          <p className="text-sm text-muted-foreground">{dataError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <FilterBar />
      <TabNavigation />
      <main className="p-4 md:p-6 max-w-[1600px] mx-auto">
        {activeTab === 'overview' && <OverviewTab />}
        {activeTab === 'trend' && <TrendTab />}
        {activeTab === 'dei' && <DEITab />}
        {activeTab === 'comp' && <CompensationTab />}
        {activeTab === 'location' && <LocationTab />}
        {activeTab === 'engagement' && <EngagementTab />}
        {activeTab === 'span' && <SpanTab />}
        {activeTab === 'attrition' && <LeaversGate><AttritionTab /></LeaversGate>}
        {activeTab === 'data' && <DataTab />}
      </main>
    </div>
  );
}

export default function Index() {
  return (
    <DashboardProvider>
      <DashboardContent />
    </DashboardProvider>
  );
}
