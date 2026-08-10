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
  ChevronDown,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDashboard, TabType } from '@/data/DashboardContext';
import { useAuth } from '@/contexts/AuthContext';
import { visibleTabs } from '@/lib/permissions';

interface SubItem {
  id: string;
  label: string;
}

interface NavItem {
  id: TabType;
  label: string;
  icon: LucideIcon;
  /** Sub-abas da seção — os mesmos valores usados pelas Tabs de cada aba. */
  subs?: SubItem[];
  /** Sub-aba assumida quando a aba abre sem escolha explícita. */
  defaultSub?: string;
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
      {
        id: 'engagement',
        label: 'Experiência',
        icon: HeartHandshake,
        defaultSub: 'engajamento',
        subs: [
          { id: 'engajamento', label: 'Engajamento' },
          { id: 'onboarding', label: 'Onboarding' },
          { id: 'inclusao', label: 'Inclusão & Pertencimento' },
        ],
      },
    ],
  },
  {
    title: 'Compensação',
    items: [
      {
        id: 'comp',
        label: 'Compensação',
        icon: Wallet,
        defaultSub: 'custos',
        subs: [
          { id: 'custos', label: 'Custos & Bandas' },
          { id: 'compratio', label: 'Comp Ratio individual' },
          { id: 'movimentacoes', label: 'Movimentações Salariais' },
        ],
      },
      { id: 'individual', label: 'Perfil Individual', icon: UserSearch },
    ],
  },
  {
    title: 'Movimentação',
    items: [
      { id: 'span', label: 'Span de Controle', icon: Network },
      {
        id: 'attrition',
        label: 'Atrição & Desligamentos',
        icon: LogOut,
        defaultSub: 'desligamentos',
        subs: [
          { id: 'desligamentos', label: 'Desligamentos' },
          { id: 'nao-desejada', label: 'Atrição não desejada' },
        ],
      },
      { id: 'recruitment', label: 'Recrutamento', icon: UserPlus },
    ],
  },
  {
    title: 'Ferramentas',
    items: [{ id: 'data', label: 'Dados', icon: Database }],
  },
];

export default function SideNav() {
  const { activeTab, setActiveTab, activeSubTab, setActiveSubTab } = useDashboard();
  const { profile } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  // Quais seções com sub-abas estão abertas no índice. A seção ativa abre
  // sozinha; as outras a pessoa expande para dar uma olhada sem sair de onde está.
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const allowed = visibleTabs(profile ?? 'dept_leader');
  const groups = GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => allowed.includes(i.id)),
  })).filter((g) => g.items.length > 0);

  const firstAllowed = groups[0]?.items[0]?.id;

  useEffect(() => {
    if (firstAllowed && !allowed.includes(activeTab)) setActiveTab(firstAllowed);
  }, [activeTab, allowed, firstAllowed, setActiveTab]);

  const isOpen = (item: NavItem) =>
    activeTab === item.id ? open[item.id] !== false : open[item.id] === true;

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
                const expanded = !collapsed && !!item.subs && isOpen(item);
                const currentSub = active ? activeSubTab ?? item.defaultSub : null;
                return (
                  <li key={item.id}>
                    <div className="flex items-center">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab(item.id);
                          if (item.subs) setOpen((o) => ({ ...o, [item.id]: true }));
                        }}
                        title={collapsed ? item.label : undefined}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] font-medium transition-colors',
                          active
                            ? 'bg-accent text-accent-foreground'
                            : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                          collapsed && 'justify-center px-0',
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                      </button>
                      {!collapsed && item.subs && (
                        <button
                          type="button"
                          onClick={() =>
                            setOpen((o) => ({ ...o, [item.id]: !isOpen(item) }))
                          }
                          aria-label={
                            expanded
                              ? `Recolher sub-abas de ${item.label}`
                              : `Expandir sub-abas de ${item.label}`
                          }
                          aria-expanded={expanded}
                          className="ml-0.5 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                        >
                          {expanded ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                        </button>
                      )}
                    </div>

                    {expanded && (
                      <ul className="ml-[22px] mt-0.5 space-y-0.5 border-l border-border pl-2">
                        {item.subs!.map((sub) => {
                          const subActive = active && currentSub === sub.id;
                          return (
                            <li key={sub.id}>
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveTab(item.id);
                                  setActiveSubTab(sub.id);
                                }}
                                aria-current={subActive ? 'true' : undefined}
                                className={cn(
                                  'w-full rounded-md px-2 py-1.5 text-left text-[12px] transition-colors',
                                  subActive
                                    ? 'bg-accent/70 font-medium text-accent-foreground'
                                    : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground',
                                )}
                              >
                                <span className="block truncate">{sub.label}</span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
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

