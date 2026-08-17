import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { AlertTriangle, Link2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { vincularCamadaComp } from '@/lib/comp.functions';

interface Resultado {
  gravado: boolean;
  total: number;
  casados: number;
  semCorrespondencia: string[];
  ambiguos: string[];
  semCamadaNaOrigem: string[];
  resumo: string;
}

/**
 * Liga a folha de remuneração ao organograma.
 *
 * A taxa de casamento é o número que decide se isto pode ser usado: 95% quer
 * dizer que a aba de Salários funciona para quase todo mundo; 60% quer dizer
 * que quatro em cada dez pessoas somem da tela sem que ninguém entenda por
 * quê. Por isso a prévia mostra a taxa antes de gravar, e não só depois.
 */
export default function VinculoCamadaCard() {
  const rodar = useServerFn(vincularCamadaComp);
  const [r, setR] = useState<Resultado | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const executar = async (confirm: boolean) => {
    setOcupado(true);
    try {
      const res = (await rodar({ data: { confirm } })) as Resultado;
      setR(res);
      if (confirm) toast.success(`${res.casados} linha(s) receberam a camada N.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao vincular');
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
          Camada N na folha de remuneração
        </CardTitle>
        <CardDescription>
          Casa cada linha de salário com a pessoa no organograma do Convenia, pelo
          nome, e grava a camada. É o que faz a aba de Salários mostrar alguma coisa
          para quem não é HR Leader nem Admin.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        <Button variant="outline" size="sm" onClick={() => executar(false)} disabled={ocupado}>
          <RefreshCw className={`mr-2 h-4 w-4 ${ocupado ? 'animate-spin' : ''}`} />
          {ocupado ? 'Conferindo…' : 'Conferir antes de gravar'}
        </Button>

        {r && (
          <div className="rounded-lg border border-border/60 p-3 text-sm space-y-3">
            <div className={taxa >= 90 ? '' : 'text-amber-600 dark:text-amber-500'}>
              {r.resumo}
            </div>

            {taxa < 90 && r.total > 0 && (
              <p className="text-[12px] text-muted-foreground">
                Abaixo de 90% vale olhar as listas antes de gravar: cada linha que não
                casa é uma pessoa que some da aba de Salários, e a tela não explica o
                motivo para quem estiver olhando.
              </p>
            )}

            {r.ambiguos.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 text-[12px] font-medium text-amber-600 dark:text-amber-500">
                  <AlertTriangle className="h-3.5 w-3.5" /> Nome repetido — recusadas de propósito
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Escolher uma seria decidir no cara ou coroa quem enxerga o salário de quem.
                </p>
                <p className="mt-1 text-[12px] text-muted-foreground">{r.ambiguos.join(' · ')}</p>
              </div>
            )}

            {r.semCamadaNaOrigem.length > 0 && (
              <div>
                <div className="text-[12px] font-medium">Sem camada no organograma</div>
                <p className="text-[11px] text-muted-foreground">
                  A pessoa existe no Convenia, mas a cadeia de reporte dela está quebrada
                  ou em ciclo. Resolve-se arrumando o gestor no Convenia.
                </p>
                <p className="mt-1 text-[12px] text-muted-foreground">{r.semCamadaNaOrigem.join(' · ')}</p>
              </div>
            )}

            {r.semCorrespondencia.length > 0 && (
              <div>
                <div className="text-[12px] font-medium">Sem correspondência no Convenia</div>
                <p className="text-[11px] text-muted-foreground">
                  Grafia diferente, nome de casada, ou gente que não está no Convenia
                  (Betfair, terceiros). Amostra:
                </p>
                <p className="mt-1 text-[12px] text-muted-foreground">{r.semCorrespondencia.join(' · ')}</p>
              </div>
            )}

            {!r.gravado && r.casados > 0 && (
              <Button onClick={() => executar(true)} disabled={ocupado}>
                Gravar a camada em {r.casados} linha(s)
              </Button>
            )}
            {r.gravado && <p className="text-[12px] text-muted-foreground">Gravado.</p>}
          </div>
        )}

        <p className="text-[11px] text-muted-foreground">
          Quem não casa fica sem camada — e sem camada a linha não aparece para
          ninguém que não seja perfil global. O erro cai sempre para o lado de
          esconder.
        </p>
      </CardContent>
    </Card>
  );
}
