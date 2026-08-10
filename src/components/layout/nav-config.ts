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
  type LucideIcon,
} from 'lucide-react';
import type { TabType } from '@/data/DashboardContext';

export interface SubItem {
  id: string;
  label: string;
}

export interface NavItem {
  id: TabType;
  label: string;
  icon: LucideIcon;
  /** Sub-abas da seção — os mesmos valores usados pelas Tabs de cada aba. */
  subs?: SubItem[];
  /** Sub-aba assumida quando a aba abre sem escolha explícita. */
  defaultSub?: string;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

/** Índice do dashboard agrupado por tema — a ordem conta a história dos dados. */
export const GROUPS: NavGroup[] = [
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

/** Localiza a aba (e seu grupo) no índice — usado pelos breadcrumbs. */
export function findNav(tab: TabType) {
  for (const group of GROUPS) {
    const item = group.items.find((i) => i.id === tab);
    if (item) return { group, item };
  }
  return null;
}
