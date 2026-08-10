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
 * Trilha "Dashboard > Aba > Sub-aba". Serve para localizar onde a leitura está
 * e para voltar um nível com um clique — clicar na aba zera a sub-aba.
 */
export default function Breadcrumbs() {
  const { activeTab, setActiveTab, activeSubTab, setActiveSubTab } = useDashboard();
  const found = findNav(activeTab);
  if (!found) return null;

  const { group, item } = found;
  const subId = activeSubTab ?? item.defaultSub ?? null;
  const sub = item.subs?.find((s) => s.id === subId) ?? null;

  return (
    <div className="border-b border-border bg-card/40 px-4 py-2 md:px-6">
      <Breadcrumb>
        <BreadcrumbList className="text-[12px]">
          <BreadcrumbItem>
            <BreadcrumbLink
              asChild
              className="flex items-center gap-1.5 cursor-pointer"
            >
              <button type="button" onClick={() => setActiveTab('overview')}>
                <Home className="h-3.5 w-3.5" />
                <span>Dashboard</span>
              </button>
            </BreadcrumbLink>
          </BreadcrumbItem>

          <BreadcrumbSeparator>
            <ChevronRight className="h-3.5 w-3.5" />
          </BreadcrumbSeparator>
          <BreadcrumbItem>
            <span className="text-muted-foreground">{group.title}</span>
          </BreadcrumbItem>

          <BreadcrumbSeparator>
            <ChevronRight className="h-3.5 w-3.5" />
          </BreadcrumbSeparator>
          <BreadcrumbItem>
            {sub ? (
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

          {sub && (
            <>
              <BreadcrumbSeparator>
                <ChevronRight className="h-3.5 w-3.5" />
              </BreadcrumbSeparator>
              <BreadcrumbItem>
                <BreadcrumbPage className="font-medium">{sub.label}</BreadcrumbPage>
              </BreadcrumbItem>
            </>
          )}
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  );
}
