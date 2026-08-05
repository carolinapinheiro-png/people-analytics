import { useEffect } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Users, Scale, Network } from 'lucide-react';
import { useDashboard } from '@/data/DashboardContext';
import DemographicsTab from './DemographicsTab';
import DEITab from './DEITab';
import SpanTab from './SpanTab';

/**
 * Quadro: quem somos e como estamos organizados.
 *
 * Demográficos, DEI e Span respondem à mesma pergunta por ângulos diferentes --
 * a composição do quadro hoje. DEI é uma leitura recortada dos demográficos, e
 * span é a estrutura que os distribui; ficarem em abas separadas obrigava a
 * navegar para comparar coisas que se explicam juntas.
 */
export default function QuadroTab() {
  const { activeSubTab, setActiveSubTab } = useDashboard();
  const valor = activeSubTab ?? 'demograficos';

  useEffect(() => {
    if (!activeSubTab) setActiveSubTab('demograficos');
  }, [activeSubTab, setActiveSubTab]);

  return (
    <Tabs value={valor} onValueChange={setActiveSubTab} className="space-y-4">
      <TabsList>
        <TabsTrigger value="demograficos" className="gap-2">
          <Users className="h-4 w-4" />
          Demográficos
        </TabsTrigger>
        <TabsTrigger value="dei" className="gap-2">
          <Scale className="h-4 w-4" />
          DEI
        </TabsTrigger>
        <TabsTrigger value="span" className="gap-2">
          <Network className="h-4 w-4" />
          Span de Controle
        </TabsTrigger>
      </TabsList>
      <TabsContent value="demograficos" className="mt-0"><DemographicsTab /></TabsContent>
      <TabsContent value="dei" className="mt-0"><DEITab /></TabsContent>
      <TabsContent value="span" className="mt-0"><SpanTab /></TabsContent>
    </Tabs>
  );
}
