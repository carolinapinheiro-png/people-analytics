import { cn } from '@/lib/utils';
import { COLORS } from '@/lib/colors';

const BRAND_COLORS: Record<string, string> = {
  combined: COLORS.flutter,
  NSX: COLORS.nsx,
  'Betfair BR': COLORS.betfair,
  'Flutter International': COLORS.flutter,
  Porto: COLORS.flutter,
};
import { useEffect } from 'react';
import { useDashboard, TabType } from '@/data/DashboardContext';
import { useAuth } from '@/contexts/AuthContext';
import { visibleTabs } from '@/lib/permissions';

const tabs: { id: TabType; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'team', label: 'Meu Time' },
  { id: 'dei', label: 'DEI Metrics' },
  { id: 'comp', label: 'Compensação' },
  { id: 'demographics', label: 'Demográficos' },
  { id: 'engagement', label: 'Experiência' },
  { id: 'span', label: 'Span de Controle' },
  { id: 'attrition', label: 'Atrição & Desligamentos' },
  { id: 'recruitment', label: 'Recrutamento' },
  { id: 'individual', label: 'Perfil Individual' },
  { id: 'data', label: 'Dados' },
];

export default function TabNavigation() {
  const { activeTab, setActiveTab, brand } = useDashboard();
  const { profile } = useAuth();
  const brandColor = BRAND_COLORS[brand] || COLORS.flutter;

  // O perfil define quais abas existem para esta pessoa.
  const allowed = visibleTabs(profile ?? 'dept_leader');
  const shownTabs = tabs.filter((t) => allowed.includes(t.id));

  useEffect(() => {
    if (shownTabs.length > 0 && !allowed.includes(activeTab)) {
      setActiveTab(shownTabs[0].id);
    }
  }, [activeTab, allowed, shownTabs, setActiveTab]);

  return (
    <div className="flex border-b border-border px-4 md:px-7 bg-card overflow-x-auto">
      {shownTabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          className={cn(
            'px-4 py-3 text-xs font-semibold border-b-2 whitespace-nowrap transition-all',
            activeTab === tab.id
              ? 'text-foreground'
              : 'text-muted-foreground border-transparent hover:text-foreground'
          )}
          style={activeTab === tab.id ? { borderBottomColor: brandColor } : undefined}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
