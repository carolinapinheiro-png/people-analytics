import React from 'react';
import { DashboardProvider, useDashboard } from '@/data/DashboardContext';
import { Button } from '@/components/ui/button';
import TopBar from '@/components/layout/TopBar';
import FilterBar from '@/components/layout/FilterBar';
import TabNavigation from '@/components/layout/TabNavigation';
import OverviewTab from '@/components/tabs/OverviewTab';
import TeamTab from '@/components/tabs/TeamTab';
import CompensationTab from '@/components/tabs/CompensationTab';
import ProfileTab from '@/components/tabs/ProfileTab';
import DataTab from '@/components/tabs/DataTab';
import LeaversGate from '@/components/dashboard/LeaversGate';
import QuadroTab from '@/components/tabs/QuadroTab';
import LifecycleTab from '@/components/tabs/LifecycleTab';


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
        {activeTab === 'team' && <TeamTab />}
        {activeTab === 'quadro' && <QuadroTab />}
        {activeTab === 'comp' && <CompensationTab />}
        {activeTab === 'lifecycle' && <LifecycleTab />}
        {activeTab === 'individual' && <ProfileTab />}
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
