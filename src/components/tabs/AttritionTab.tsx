import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { LogOut, UserX } from 'lucide-react';
import LeaversTab from './LeaversTab';
import UnwantedTab from './UnwantedTab';

/**
 * Atricao numa secao unica (decisao da area): comeca por Desligamentos (o dash
 * factual) e tem uma sub-aba separada so para a Atricao Nao Desejada (a
 * estimativa). Cada sub-aba continua sendo o componente que ja existia. Ambas
 * dependem do dado protegido de desligados -- o gate fica no Index, em volta
 * desta secao.
 */
export default function AttritionTab() {
  return (
    <Tabs defaultValue="desligamentos" className="space-y-4">
      <TabsList>
        <TabsTrigger value="desligamentos" className="gap-2">
          <LogOut className="h-4 w-4" />
          Desligamentos
        </TabsTrigger>
        <TabsTrigger value="nao-desejada" className="gap-2">
          <UserX className="h-4 w-4" />
          Atrição não desejada
        </TabsTrigger>
      </TabsList>
      <TabsContent value="desligamentos" className="mt-0"><LeaversTab /></TabsContent>
      <TabsContent value="nao-desejada" className="mt-0"><UnwantedTab /></TabsContent>
    </Tabs>
  );
}
