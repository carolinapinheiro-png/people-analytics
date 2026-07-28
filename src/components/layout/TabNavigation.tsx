import { cn } from '@/lib/utils';
import { COLORS } from '@/lib/colors';

const BRAND_COLORS: Record<string, string> = {
  combined: COLORS.flutter,
  NSX: COLORS.nsx,
  'Betfair BR': COLORS.betfair,
  'Flutter International': COLORS.flutter,
  Porto: COLORS.flutter,
};
import { useDashboard, TabType } from '@/data/DashboardContext';

const tabs: { id: TabType; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'trend', label: 'Trend' },
  { id: 'dei', label: 'DEI Metrics' },
  { id: 'salary', label: 'Compensação' },
  { id: 'compratio', label: 'Comp. Ratio' },
  { id: 'location', label: 'Localização' },
  { id: 'movement', label: 'Movimentação' },
  { id: 'engagement', label: 'Experiência' },
  { id: 'span', label: 'Span de Controle' },
  { id: 'unwanted', label: 'Atriç. Não Desejada' },
  { id: 'leavers', label: 'Desligamentos' },
  { id: 'data', label: 'Dados' },
];

export default function TabNavigation() {
  const { activeTab, setActiveTab, brand } = useDashboard();
  const brandColor = BRAND_COLORS[brand] || COLORS.flutter;

  return (
    <div className="flex border-b border-border px-4 md:px-7 bg-card overflow-x-auto">
      {tabs.map(tab => (
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
