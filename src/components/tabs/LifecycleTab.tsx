import { useEffect } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Briefcase, Heart, LogOut } from 'lucide-react';
import { useDashboard } from '@/data/DashboardContext';
import RecruitmentTab from './RecruitmentTab';
import EngagementTab from './EngagementTab';
import AttritionTab from './AttritionTab';
import LeaversGate from '@/components/dashboard/LeaversGate';

/**
 * Ciclo de vida: entrada → permanência → saída.
 *
 * O agrupamento não é economia de espaço, é narrativa: as três respondem a
 * momentos da mesma jornada e as perguntas boas cruzam as fronteiras ("quem
 * avaliou mal o onboarding saiu nos primeiros meses?"). Separadas em três abas
 * distantes, ninguém fazia esse trajeto.
 *
 * O LeaversGate fica DENTRO da sub-aba de atrição, não em volta do grupo --
 * quem não pode ver desligamento individual continua vendo recrutamento e
 * experiência normalmente.
 */
export default function LifecycleTab() {
  const { activeSubTab, setActiveSubTab } = useDashboard();
  const valor = activeSubTab ?? 'recrutamento';

  // A barra de filtros decide o que oferecer a partir da sub-aba: atrição usa
  // os sete filtros, as outras duas não usam nenhum. Sem publicar isto, o
  // grupo inteiro herdaria os sete e a barra voltaria a mentir.
  useEffect(() => {
    if (!activeSubTab) setActiveSubTab('recrutamento');
  }, [activeSubTab, setActiveSubTab]);

  return (
    <Tabs value={valor} onValueChange={setActiveSubTab} className="space-y-4">
      <TabsList>
        <TabsTrigger value="recrutamento" className="gap-2">
          <Briefcase className="h-4 w-4" />
          Recrutamento
        </TabsTrigger>
        <TabsTrigger value="experiencia" className="gap-2">
          <Heart className="h-4 w-4" />
          Experiência
        </TabsTrigger>
        <TabsTrigger value="atricao" className="gap-2">
          <LogOut className="h-4 w-4" />
          Atrição &amp; Desligamentos
        </TabsTrigger>
      </TabsList>
      <TabsContent value="recrutamento" className="mt-0"><RecruitmentTab /></TabsContent>
      <TabsContent value="experiencia" className="mt-0"><EngagementTab /></TabsContent>
      <TabsContent value="atricao" className="mt-0">
        <LeaversGate><AttritionTab /></LeaversGate>
      </TabsContent>
    </Tabs>
  );
}
