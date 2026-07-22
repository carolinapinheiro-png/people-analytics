import { DashboardProvider, useDashboard } from '@/data/DashboardContext';
import TopBar from '@/components/layout/TopBar';
import FilterBar from '@/components/layout/FilterBar';
import TabNavigation from '@/components/layout/TabNavigation';
import OverviewTab from '@/components/tabs/OverviewTab';
import TrendTab from '@/components/tabs/TrendTab';
import DEITab from '@/components/tabs/DEITab';
import SalaryTab from '@/components/tabs/SalaryTab';
import LocationTab from '@/components/tabs/LocationTab';
import MovementTab from '@/components/tabs/MovementTab';
import EngagementTab from '@/components/tabs/EngagementTab';
import SpanTab from '@/components/tabs/SpanTab';
import UnwantedTab from '@/components/tabs/UnwantedTab';
import LeaversTab from '@/components/tabs/LeaversTab';
import DataTab from '@/components/tabs/DataTab';
import CompRatioTab from '@/components/tabs/CompRatioTab';

function DashboardContent() {
  const { activeTab } = useDashboard();

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <FilterBar />
      <TabNavigation />
      <main className="p-4 md:p-6 max-w-[1600px] mx-auto">
        {activeTab === 'overview' && <OverviewTab />}
        {activeTab === 'trend' && <TrendTab />}
        {activeTab === 'dei' && <DEITab />}
        {activeTab === 'salary' && <SalaryTab />}
        {activeTab === 'location' && <LocationTab />}
        {activeTab === 'movement' && <MovementTab />}
        {activeTab === 'engagement' && <EngagementTab />}
        {activeTab === 'span' && <SpanTab />}
        {activeTab === 'unwanted' && <UnwantedTab />}
        {activeTab === 'leavers' && <LeaversTab />}
        {activeTab === 'data' && <DataTab />}
        {activeTab === 'compratio' && <CompRatioTab />}
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
