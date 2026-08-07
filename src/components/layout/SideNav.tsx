import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Users,
  UsersRound,
  HeartHandshake,
  Wallet,
  UserSearch,
  Network,
  LogOut,
  UserPlus,
  Database,
  PanelLeftClose,
  PanelLeftOpen,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDashboard, TabType } from '@/data/DashboardContext';
import { useAuth } from '@/contexts/AuthContext';
import { visibleTabs } from '@/lib/permissions';

interface NavItem {
  id: TabType;
  label: string;
  icon: LucideIcon;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

/** Índice do dashboard agrupado por tema — a ordem conta a história dos dados. */
const GROUPS: NavGroup[] = [
  {
    title: 'Visão geral',
    items: [
      { id: 'overview', label: 'Overview', icon: LayoutDashboard },
      { id: 'team', label: 'Meu Time', icon: Users },
    ],
  },
  {
    title: 'Pessoas',
    items: [
      { id: 'demographics', label: 'Demográficos', icon: UsersRound },
      { id: 'dei', label: 'DEI Metrics', icon: HeartHandshake },
      { id: 'engagement', label: 'Experiência', icon: HeartHandshake },
    ],
  },
  {
    title: 'Compensação',
    items: [
      { id: 'comp', label: 'Compensação', icon: Wallet },
      { id: 'individual', label: 'Perfil Individual', icon: UserSearch },
    ],
  },
  {
    title: 'Movimentação',
    items: [
      { id: 'span', label: 'Span de Controle', icon: Network },
      { id: 'attrition', label: 'Atrição & Desligamentos', icon: LogOut },
      { id: 'recruitment', label: 'Recrutamento', icon: UserPlus },
    ],
  },
  {
    title: 'Ferramentas',
    items: [{ id: 'data', label: 'Dados', icon: Database }],
  },
];

export default function SideNav() {
  const { activeTab, setActiveTab } = useDashboard();
  const { profile } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  const allowed = visibleTabs(profile ?? 'dept_leader');
  const groups = GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => allowed.includes(i.id)),
  })).filter((g) => g.items.length > 0);

  const firstAllowed = groups[0]?.items[0]?.id;

  useEffect(() => {
    if (firstAllowed && !allowed.includes(activeTab)) setActiveTab(firstAllowed);
  }, [activeTab, allowed, firstAllowed, setActiveTab]);

  return (
    <aside
      className={cn(
        'shrink-0 border-r border-border bg-card transition-all duration-200',
        'sticky top-0 h-[100dvh] overflow-y-auto',
        collapsed ? 'w-[64px]' : 'w-[240px]',
      )}
    >
      <div className="flex items-center justify-between px-3 py-3">
        {!collapsed && (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Índice
          </span>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? 'Expandir índice' : 'Recolher índice'}
          className="ml-auto rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>

      <nav className="pb-6">
        {groups.map((group) => (
          <div key={group.title} className="mb-4">
            {!collapsed && (
              <p className="px-4 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
                {group.title}
              </p>
            )}
            <ul className="space-y-0.5 px-2">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setActiveTab(item.id)}
                      title={collapsed ? item.label : undefined}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] font-medium transition-colors',
                        active
                          ? 'bg-accent text-accent-foreground'
                          : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                        collapsed && 'justify-center px-0',
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
