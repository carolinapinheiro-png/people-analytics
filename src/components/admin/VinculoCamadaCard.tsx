import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { AlertTriangle, Link2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { vincularCamadaComp } from '@/lib/comp.functions';

import { tx } from '@/lib/i18n';
interface Resultado {
  total: number;
  casados: number;
  semCorrespondencia: string[];
  ambiguos: string[];
  semCamadaNaOrigem: string[];
  resumo: string;
}

/**
 * Confere folha contra organograma. NÃO grava.
 *
 * Isto gravava a camada, casando por nome. Quem escreve `n_layer` hoje é a
 * carga do Convenia, pelo `convenia_id` -- e deixar os dois escrevendo no
 * mesmo campo significava que um clique por hábito desfaria a camada certa
 * sem erro nenhum na tela. Ver a nota em comp.functions.ts.
 *
 * O que sobra é o diagnóstico, que continua sendo útil: as linhas que a carga
 * não toca (as que vieram da planilha e não têm `convenia_id`) aparecem aqui,
 * com o motivo de não casarem.
 */
export default function VinculoCamadaCard() {
  const rodar = useServerFn(vincularCamadaComp);
  const [r, setR] = useState<Resultado | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const executar = async () => {
    setOcupado(true);
    try {
      setR((await rodar({ data: {} })) as Resultado);
    } catch (e) {
      toast.error(e instanceof Error ? tx(e.message) : tx("Falha ao conferir"));
    } finally {
      setOcupado(false);
    }
  };

  const taxa = r && r.total > 0 ? Math.round((r.casados / r.total) * 100) : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Link2 className="h-5 w-5 text-muted-foreground" />
          {tx("Camada N na folha — conferência")}
        </CardTitle>
        <CardDescription>
          {tx("Compara a folha de remuneração com o organograma, pelo nome, e mostra quem não casa. Não grava nada: a camada é escrita pela sincronização do Convenia, pelo elo de id.")}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        <Button variant="outline" size="sm" onClick={executar} disabled={ocupado}>
          <RefreshCw className={`mr-2 h-4 w-4 ${ocupado ? 'animate-spin' : ''}`} />
          {ocupado ? tx("Conferindo…") : tx("Conferir")}
        </Button>

        {r && (
          <div className="rounded-lg border border-border/60 p-3 text-sm space-y-3">
            <div className={taxa >= 90 ? '' : 'text-amber-600 dark:text-amber-500'}>
              {tx(r.resumo)}
            </div>

            {taxa < 90 && r.total > 0 && (
              <p className="text-[12px] text-muted-foreground">
                {tx("A taxa aqui não mede mais a saúde da aba de Salários — mede só o quanto os nomes coincidem. As linhas que não casam são as que a sincronização do Convenia não alcança: em geral, resíduo da planilha antiga.")}
              </p>
            )}

            {r.ambiguos.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 text-[12px] font-medium text-amber-600 dark:text-amber-500">
                  <AlertTriangle className="h-3.5 w-3.5" />{" "}{tx("Nome repetido — recusadas de propósito")}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {tx("Escolher uma seria decidir no cara ou coroa quem enxerga o salário de quem.")}
                </p>
                <p className="mt-1 text-[12px] text-muted-foreground">{tx(r.ambiguos.join(' · '))}</p>
              </div>
            )}

            {r.semCamadaNaOrigem.length > 0 && (
              <div>
                <div className="text-[12px] font-medium">{tx("Sem camada no organograma")}</div>
                <p className="text-[11px] text-muted-foreground">
                  {tx("A pessoa existe no Convenia, mas a cadeia de reporte dela está quebrada ou em ciclo. Resolve-se arrumando o gestor no Convenia.")}
                </p>
                <p className="mt-1 text-[12px] text-muted-foreground">{tx(r.semCamadaNaOrigem.join(' · '))}</p>
              </div>
            )}

            {r.semCorrespondencia.length > 0 && (
              <div>
                <div className="text-[12px] font-medium">{tx("Sem correspondência no Convenia")}</div>
                <p className="text-[11px] text-muted-foreground">
                  {tx("Grafia diferente, nome de casada, ou gente que não está no Convenia (Betfair, terceiros). Amostra:")}
                </p>
                <p className="mt-1 text-[12px] text-muted-foreground">{tx(r.semCorrespondencia.join(' · '))}</p>
              </div>
            )}

          </div>
        )}

        <p className="text-[11px] text-muted-foreground">
          {tx("A camada que controla o acesso é gravada pela sincronização do Convenia, pelo elo de id. Esta tela só olha — gravar daqui, por nome, desfaria o que a carga acertou, e sem erro nenhum aparecer.")}
        </p>
      </CardContent>
    </Card>
  );
}
