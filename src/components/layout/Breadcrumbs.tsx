import { ChevronRight, Home } from 'lucide-react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { useDashboard } from '@/data/DashboardContext';
import { findNav } from './nav-config';

/**
 * Trilha "Dashboard > Grupo > Aba > Sub-aba".
 *
 * ===========================================================================
 * NENHUM PEDAÇO É LINK SE CLICAR NELE NÃO MUDA NADA
 * ===========================================================================
 * Três dos quatro eram links mortos:
 *
 *   "Dashboard" ......... clicável mesmo já estando no Overview.
 *   o nome do grupo ..... "Pessoas" é um cabeçalho de seção do menu, não uma
 *                         página. Ficava parecendo trilha e não levava a lugar
 *                         nenhum.
 *   o nome da aba ....... vira link quando há sub-aba, e o clique chamava
 *                         `setActiveSubTab(item.defaultSub)`. Como `subId` já
 *                         era `activeSubTab ?? item.defaultSub`, estando na
 *                         sub padrão o clique definia o valor que já estava
 *                         lá. Nada acontecia.
 *
 * O último é o pior porque a trilha mostrava "Compensação > Custos & Bandas"
 * mesmo para quem nunca escolheu sub-aba nenhuma -- e o único elemento que
 * parecia oferecer uma saída não oferecia.
 *
 * Agora cada pedaço só é link quando o clique leva a algum lugar; senão é
 * texto. O grupo continua texto sempre: ele não é destino.
 */
export default function Breadcrumbs() {
  const { activeTab, setActiveTab, activeSubTab, setActiveSubTab } = useDashboard();
  const found = findNav(activeTab);
  if (!found) return null;

  const { group, item } = found;
  const subId = activeSubTab ?? item.defaultSub ?? null;
  const sub = item.subs?.find((s) => s.id === subId) ?? null;
  // A sub só entra na trilha quando foi ESCOLHIDA. Mostrar a padrão como se
  // tivesse sido escolhida é o que criava o link morto acima -- e diz à pessoa
  // que ela está dois níveis fundo quando está um.
  const subEscolhida = activeSubTab != null && activeSubTab !== item.defaultSub ? sub : null;
  const noOverview = activeTab === 'overview';

  return (
    <div className="border-b border-border bg-card/40 px-4 py-2 md:px-6">
      <Breadcrumb>
        <BreadcrumbList className="text-[12px]">
          <BreadcrumbItem>
            {noOverview ? (
              <BreadcrumbLink asChild className="flex items-center gap-1.5 cursor-pointer">
                <button type="button" onClick={() => setActiveTab('overview')}>
                  <Home className="h-3.5 w-3.5" />
                  <span>Dashboard</span>
                </button>
              </BreadcrumbLink>
            ) : (
              <BreadcrumbPage className="flex items-center gap-1.5 font-medium">
                <Home className="h-3.5 w-3.5" />
                <span>Dashboard</span>
              </BreadcrumbPage>
            )}
          </BreadcrumbItem>

          <BreadcrumbSeparator>
            <ChevronRight className="h-3.5 w-3.5" />
          </BreadcrumbSeparator>
          <BreadcrumbItem>
            {/* Texto, nunca link: grupo é seção do menu, não página. */}
            <span className="text-muted-foreground">{group.title}</span>
          </BreadcrumbItem>

          <BreadcrumbSeparator>
            <ChevronRight className="h-3.5 w-3.5" />
          </BreadcrumbSeparator>
          <BreadcrumbItem>
            {subEscolhida ? (
              <BreadcrumbLink asChild className="cursor-pointer">
                <button
                  type="button"
                  onClick={() => setActiveSubTab(item.defaultSub ?? null)}
                >
                  {item.label}
                </button>
              </BreadcrumbLink>
            ) : (
              <BreadcrumbPage className="font-medium">{item.label}</BreadcrumbPage>
            )}
          </BreadcrumbItem>

          {subEscolhida && (
            <>
              <BreadcrumbSeparator>
                <ChevronRight className="h-3.5 w-3.5" />
              </BreadcrumbSeparator>
              <BreadcrumbItem>
                <BreadcrumbPage className="font-medium">{subEscolhida.label}</BreadcrumbPage>
              </BreadcrumbItem>
            </>
          )}
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  );
}
