import { useEffect, useState } from 'react';
import {
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDashboard } from '@/data/DashboardContext';
import { useAuth } from '@/contexts/AuthContext';
import { visibleTabs, visibleExperienceSubTabs } from '@/lib/permissions';
import { GROUPS, type NavItem } from './nav-config';
import { readNavState, writeNavState } from '@/lib/nav-state';

export default function SideNav() {
  const { activeTab, setActiveTab, activeSubTab, setActiveSubTab } = useDashboard();
  const { profile, extraTabs, tabs, subTabs, podeVerIndividual, loading } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  // Quais seções com sub-abas estão abertas no índice. A seção ativa abre
  // sozinha; as outras a pessoa expande para dar uma olhada sem sair de onde está.
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [restored, setRestored] = useState(false);

  // Preferências de layout do índice (recolhido, seções abertas) voltam depois
  // do recarregamento. Lido só no cliente para não divergir do HTML do servidor.
  useEffect(() => {
    const s = readNavState();
    if (s?.collapsed !== undefined) setCollapsed(s.collapsed);
    if (s?.open) setOpen(s.open);
    setRestored(true);
  }, []);

  useEffect(() => {
    if (restored) writeNavState({ collapsed, open });
  }, [restored, collapsed, open]);

  const perfil = profile ?? 'dept_leader';
  // A lista DESTA pessoa quando existe; senão, preset mais concedidas. Ver a
  // nota em `visibleTabs`: uma lista manda por vez.
  const allowed = visibleTabs(perfil, extraTabs, tabs, podeVerIndividual);

  // As SUB-ABAS tambem sao permissao.
  //
  // Filtrar so `items` deixava "Onboarding" e "Inclusao & Pertencimento"
  // listados no indice para quem nao pode abri-los -- clicar levava a uma aba
  // vazia, porque o servidor nao manda o conteudo. Item de menu que nao leva a
  // lugar nenhum e pior que item ausente: sugere que falta dado, e nao que
  // falta acesso.
  //
  // Quando sobra UMA sub-aba, a lista some inteira: um indice de um item so e
  // ruido, e o titulo da secao ja diz onde a pessoa esta.
  const subsPermitidas = visibleExperienceSubTabs(perfil, subTabs) as readonly string[];
  const podarSubs = (i: NavItem): NavItem => {
    if (!i.subs) return i;
    const subs = i.subs.filter((sb) => subsPermitidas.includes(sb.id));
    return subs.length > 1 ? { ...i, subs } : { ...i, subs: undefined };
  };

  const groups = GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => allowed.includes(i.id)).map(podarSubs),
  })).filter((g) => g.items.length > 0);

  const firstAllowed = groups[0]?.items[0]?.id;

  // ------------------------------------------------------------------
  // NÃO CORRIGIR A ABA ENQUANTO O PERFIL NÃO CHEGOU
  // ------------------------------------------------------------------
  // Esta é a razão de a aba não voltar depois do F5, e a restauração não tinha
  // nada a ver: ela funcionava e era desfeita meio segundo depois.
  //
  // Enquanto a autenticação carrega, `profile` é nulo e `perfil` cai no
  // fallback `dept_leader`, que é o mais restrito. `allowed` sai curto, a aba
  // restaurada -- Remuneração, digamos -- não está nele, e este efeito a
  // empurra para a primeira permitida. Quando o perfil real chega, a aba certa
  // já passou a ser permitida, mas ninguém volta para ela: o estrago é de ida
  // só.
  //
  // O fallback restritivo está certo -- na dúvida, mostrar de menos. O erro é
  // AGIR sobre ele: negar acesso enquanto se carrega é prudente, redirecionar
  // é destrutivo.
  useEffect(() => {
    if (loading) return;
    if (firstAllowed && !allowed.includes(activeTab)) setActiveTab(firstAllowed);
  }, [loading, activeTab, allowed, firstAllowed, setActiveTab]);

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
