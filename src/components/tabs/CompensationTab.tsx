import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Wallet, Scale, Award } from 'lucide-react';
import SalaryTab from './SalaryTab';
import CompRatioTab from './CompRatioTab';
import MovementTab from './MovementTab';

/**
 * Compensacao numa secao unica (decisao da area): Custos & Bandas, Comp Ratio
 * individual e Movimentacoes Salariais viram sub-abas. Cada uma continua sendo
 * o componente que ja existia. A Comp Ratio so monta quando a sub-aba e aberta
 * (Radix Tabs nao renderiza conteudo inativo), entao o acesso ao dado sensivel
 * so e registrado quando a pessoa realmente abre aquela visao.
 */
export default function CompensationTab() {
  return (
    <Tabs defaultValue="custos" className="space-y-4">
      <TabsList>
        <TabsTrigger value="custos" className="gap-2">
          <Wallet className="h-4 w-4" />
          Custos &amp; Bandas
        </TabsTrigger>
        <TabsTrigger value="compratio" className="gap-2">
          <Scale className="h-4 w-4" />
          Comp Ratio individual
        </TabsTrigger>
        <TabsTrigger value="movimentacoes" className="gap-2">
          <Award className="h-4 w-4" />
          Movimentações Salariais
        </TabsTrigger>
      </TabsList>
      <TabsContent value="custos" className="mt-0"><SalaryTab /></TabsContent>
      <TabsContent value="compratio" className="mt-0"><CompRatioTab /></TabsContent>
      <TabsContent value="movimentacoes" className="mt-0"><MovementTab /></TabsContent>
    </Tabs>
  );
}
