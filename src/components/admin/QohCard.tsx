import { useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { AlertTriangle, CheckCircle2, ClipboardCheck, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { COLORS } from '@/lib/colors';
import { sondarQoh, type SondaQoh } from '@/lib/qoh.functions';

/**
 * Passo zero da Qualidade da Contratação: descobrir a forma da resposta.
 *
 * Não grava nada. Mostra quantos registros existem, quais campos vieram e que
 * valores as perguntas fechadas assumem -- é com isso que o de-para de
 * pontuação vai ser escrito, em vez de adivinhado.
 */
export function QohCard() {
  const sondar = useServerFn(sondarQoh);
  const [s, setS] = useState<SondaQoh | null>(null);
  const [carregando, setCarregando] = useState(false);

  const rodar = async () => {
    setCarregando(true);
    try {
      setS(await sondar({}));
    } catch (e) {
      setS({
        configurado: false, registros: 0, campos: [], categorias: [],
        viaHeader: false, avisos: [], erro: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { void rodar(); }, []);

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <ClipboardCheck className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="flex-1">
          <h3 className="text-base font-semibold">Qualidade da Contratação — sondar a API</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            O gestor responde 60 dias depois do Dia 1. Isto só pergunta como a resposta
            da API é feita — quantos registros, quais campos, que valores as perguntas
            fechadas assumem. Nada é gravado.
          </p>

          <Button onClick={rodar} disabled={carregando} className="mt-4" variant="outline">
            <RefreshCw className={`mr-2 h-4 w-4 ${carregando ? 'animate-spin' : ''}`} />
            {carregando ? 'Consultando…' : 'Sondar'}
          </Button>

          {s?.erro && (
            <div className="mt-4 rounded-lg border border-border/60 p-3 text-sm">
              <div className="flex items-center gap-2 font-medium" style={{ color: COLORS.danger }}>
                <AlertTriangle className="h-4 w-4" /> Não deu para consultar
              </div>
              <p className="mt-1 text-muted-foreground">{s.erro}</p>
            </div>
          )}

          {s && !s.erro && (
            <div className="mt-4 rounded-lg border border-border/60 p-4 text-sm">
              <div className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="h-4 w-4" style={{ color: COLORS.success }} />
                {s.registros} avaliações · {s.campos.length} campos
              </div>

              <div className="mt-1 text-xs text-muted-foreground">
                Token aceito {s.viaHeader ? 'por cabeçalho' : 'só na URL'}
              </div>

              {s.campos.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-muted-foreground">
                    Campos da resposta
                  </summary>
                  <p className="mt-1 text-xs text-muted-foreground">{s.campos.join(', ')}</p>
                </details>
              )}

              {s.categorias.length > 0 && (
                <div className="mt-3">
                  <div className="text-xs font-medium">Valores das perguntas fechadas</div>
                  <p className="text-xs text-muted-foreground">
                    É daqui que sai o de-para da pontuação.
                  </p>
                  <div className="mt-2 space-y-2">
                    {s.categorias.map((c) => (
                      <div key={c.campo} className="text-xs">
                        <div className="font-medium">{c.campo}</div>
                        <div className="text-muted-foreground">
                          {c.valores.map((v) => `${v.valor} (${v.n})`).join(' · ')}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {s.avisos.map((a) => (
                <p key={a} className="mt-3 text-xs" style={{ color: COLORS.warning }}>⚠ {a}</p>
              ))}
            </div>
          )}

          <p className="mt-3 text-xs text-muted-foreground">
            Só nomes de campo e valores de categoria saem daqui. Resposta aberta, nome e
            e-mail ficam de fora automaticamente: campo com muitos valores distintos é
            dado de pessoa, não categoria.
          </p>
        </div>
      </div>
    </div>
  );
}

export default QohCard;
