import { useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { MessageSquare, Gauge, Lock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getTaSatisfaction, type TaSatisfactionData } from '@/lib/ta-satisfaction.functions';
import FreshnessBadge from '@/components/dashboard/FreshnessBadge';

/**
 * Satisfacao do cliente interno (gestor contratante) com o servico de TA.
 *
 * A tela e deliberadamente pouco grafica. Com as cinco dimensoes entre 4,80 e
 * 4,90, um grafico de barras produz cinco barras identicas coladas no teto --
 * o leitor conclui que o dashboard quebrou, quando o que aconteceu e que a
 * escala nao separa. Entao mostramos o numero, o n, e dizemos isso em palavras.
 *
 * O conteudo util aqui sao os comentarios abertos: e onde aparece o que muda
 * processo ("idioma deveria ser validado na triagem de RH"). Media nao carrega
 * isso.
 */

export default function TaSatisfactionSection() {
  const [d, setD] = useState<TaSatisfactionData | null>(null);
  const fn = useServerFn(getTaSatisfaction);

  useEffect(() => {
    let alive = true;
    fn()
      .then((r) => alive && setD(r as TaSatisfactionData))
      .catch(() => alive && setD(null));
    return () => {
      alive = false;
    };
  }, [fn]);

  // Como agora isto e uma sub-aba inteira, devolver null deixaria a aba em
  // branco sem explicacao -- o usuario clica e nao entende se quebrou ou se nao
  // ha dado. Estado vazio explicito.
  if (d && d.responses === 0) {
    return (
      <Card>
        <CardContent className="p-6 space-y-1">
          <p className="text-sm font-medium">Nenhuma resposta no seu escopo</p>
          <p className="text-sm text-muted-foreground">
            A pesquisa é respondida pelo gestor contratante depois do aceite da oferta. Se a área
            não teve contratação recente, é esperado que não haja resposta.
          </p>
        </CardContent>
      </Card>
    );
  }
  if (!d) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">Carregando…</CardContent>
      </Card>
    );
  }

  const cobertura = d.closedJobs > 0 ? Math.round((d.responses / d.closedJobs) * 100) : null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Gauge className="h-4 w-4" />
          Satisfação do gestor com o serviço de TA
        </CardTitle>
        <CardDescription className="text-xs flex flex-wrap items-center gap-2">
          <span>
            Pesquisa respondida pelo gestor contratante após o aceite da oferta. A planilha do
            formulário é lida toda semana e as respostas novas entram sozinhas.
          </span>
          <FreshnessBadge dataset="ta_satisfaction" />
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Cobertura antes da nota: uma media de 4,85 sobre 18% dos processos diz
            menos do que parece, e a ordem na tela deve refletir isso. */}
        <div className="flex flex-wrap gap-3">
          <div className="rounded-lg bg-muted/50 px-3 py-2">
            <p className="text-[11px] text-muted-foreground">Respostas</p>
            <p className="text-xl font-medium">{d.responses}</p>
          </div>
          {cobertura != null && (
            <div className="rounded-lg bg-muted/50 px-3 py-2">
              <p className="text-[11px] text-muted-foreground">Cobertura</p>
              <p className="text-xl font-medium">{cobertura}%</p>
              <p className="text-[11px] text-muted-foreground">
                de {d.closedJobs} vagas fechadas
              </p>
            </div>
          )}
          <div className="rounded-lg bg-muted/50 px-3 py-2">
            <p className="text-[11px] text-muted-foreground">Satisfação geral</p>
            <p className="text-xl font-medium">
              {d.dimensions.find((x) => x.key === 'overall')?.avg.toFixed(2) ?? '—'}
              <span className="text-xs text-muted-foreground font-normal"> / 5</span>
            </p>
          </div>
        </div>

        {/* Dimensoes: numero + n, sem barra. */}
        <div>
          <p className="text-xs font-medium mb-1.5">Por dimensão</p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {d.dimensions.map((dim) => (
              <div key={dim.key} className="rounded-md border border-border p-2">
                <p className="text-[11px] text-muted-foreground leading-tight h-8">{dim.label}</p>
                <p className="text-lg font-medium">{dim.avg.toFixed(2)}</p>
                <p className="text-[10px] text-muted-foreground">n = {dim.n}</p>
              </div>
            ))}
          </div>
          {d.ceilingEffect && (
            <p className="text-[11px] text-amber-600 dark:text-amber-500 mt-2 leading-relaxed">
              As cinco dimensões estão entre{' '}
              {Math.min(...d.dimensions.map((x) => x.avg)).toFixed(2)} e{' '}
              {Math.max(...d.dimensions.map((x) => x.avg)).toFixed(2)} — a escala não está
              separando nada. Isso não indica que o serviço é uniformemente ótimo; indica que este
              instrumento, com este volume, não discrimina. Use os comentários para saber o que
              mudar, e a série ao longo do tempo para saber se piorou.
            </p>
          )}
        </div>

        {/* ------------------------------------------------------------------
            POR ÁREA: MENOR PRIMEIRO -- MAS SÓ ENTRE AS QUE TÊM VOLUME
            ------------------------------------------------------------------
            A ordem era crescente pela nota, e só. Medido hoje: das 7 áreas, 4
            têm menos de 5 respostas e COMMERCIAL tem UMA. Uma área de uma
            resposta pode encabeçar a lista das piores -- e o topo da lista é
            lido como "onde o problema está".

            Isso é a mesma troca que este cabeçalho já recusa para o nome da
            recrutadora: com 24 respostas e quase tudo nota 5, a diferença entre
            primeira e última vem de um gestor.

            As áreas de n baixo continuam na tela, com o número e o n. O que
            muda é que elas não definem mais o topo. */}
        {d.byArea.length > 1 && (
          <div>
            <p className="text-xs font-medium mb-1.5">Por área contratante</p>
            <div className="space-y-1">
              {[...d.byArea]
                .sort((x, y) => (x.n >= 3 ? 0 : 1) - (y.n >= 3 ? 0 : 1) || x.avg - y.avg)
                .map((a) => (
                <div key={a.area} className="flex items-center justify-between text-xs py-0.5">
                  <span className="flex items-center gap-1.5">
                    {a.area}
                    {a.n < 3 && (
                      <span className="text-[10px] text-muted-foreground">
                        {a.n === 1 ? 'uma resposta só' : 'n baixo'}
                      </span>
                    )}
                  </span>
                  <span className="text-muted-foreground">
                    {a.avg.toFixed(2)} · {a.n} resposta{a.n > 1 ? 's' : ''}
                  </span>
                </div>
              ))}
            </div>
            {d.byArea.some((a) => a.n < 3) && (
              <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
                As áreas com menos de três respostas ficam no fim da lista, não porque estejam bem,
                mas porque com uma ou duas respostas a &quot;média da área&quot; é a opinião de uma
                pessoa. Elas contam quem falou, não como a área pensa.
              </p>
            )}
          </div>
        )}

        {/* Comentarios: o conteudo de verdade. */}
        <div>
          <p className="text-xs font-medium mb-1.5 flex items-center gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" />
            O que os gestores escreveram
          </p>
          {!d.canSeeComments ? (
            <p className="text-xs text-muted-foreground flex items-start gap-1.5">
              <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              Os comentários citam recrutadoras pelo nome, então seguem a mesma regra de salário e
              desligamento: só perfis com acesso a dado individual os veem.
            </p>
          ) : d.comments.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum comentário no período.</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {d.comments.map((c, i) => (
                <div key={i} className="rounded-md border border-border p-2.5">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="secondary" className="text-[10px] font-normal">
                      {c.area}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">{c.period}</span>
                    {c.overall != null && c.overall <= 4 && (
                      <span className="text-[10px] text-amber-600 dark:text-amber-500">
                        nota {c.overall}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{c.text}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
