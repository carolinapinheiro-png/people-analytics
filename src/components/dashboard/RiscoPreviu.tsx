import {
  CartesianGrid, LabelList, ResponsiveContainer, Scatter, ScatterChart,
  Tooltip, XAxis, YAxis,
} from 'recharts';
import { Target } from 'lucide-react';
import ChartCard from '@/components/dashboard/ChartCard';
import { COLORS } from '@/lib/colors';
import {
  instavel, SAIDAS_MINIMAS_PARA_TAXA, type AderenciaRisco,
} from '@/lib/analise-engajamento';
import { cn } from '@/lib/utils';

/**
 * O painel avaliando a si mesmo.
 *
 * ------------------------------------------------------------------
 * A PERGUNTA QUE FALTAVA
 * ------------------------------------------------------------------
 * A coluna "risco de saída" aparece em toda visão de engajamento e carrega uma
 * promessa implícita: que antecipa quem vai embora. Ela nunca tinha sido
 * conferida contra o que de fato aconteceu.
 *
 * Dá para conferir, e a janela existe: a onda de jan/26 declarou um risco por
 * área, e sabemos quem pediu demissão de fevereiro a julho. É o intervalo
 * exato entre uma onda e a seguinte.
 *
 * ------------------------------------------------------------------
 * AS DUAS RESPOSTAS SÃO ÚTEIS; NÃO PERGUNTAR É QUE NÃO É
 * ------------------------------------------------------------------
 * Se o risco antecipa, a coluna ganha o espaço que ocupa e vira insumo de
 * retenção -- dá para agir antes.
 *
 * Se não antecipa, ela continua sendo um fato legítimo sobre como as pessoas
 * se sentem, mas precisa ser chamada por outro nome, e ninguém deveria
 * planejar reposição de posição com base nela.
 *
 * O que não serve é a coluna seguir prometendo sem nunca ser cobrada.
 *
 * ------------------------------------------------------------------
 * ERA DOIS CARTÕES, E ELES DIVERGIRAM NA TELA
 * ------------------------------------------------------------------
 * Esta pergunta tinha duas respostas na mesma aba: esta lista e um gráfico de
 * dispersão ("O risco declarado virou saída?"). Desenhos diferentes escondiam
 * que a pergunta era a mesma -- até que ambos passaram a respeitar o filtro de
 * área e viraram, visivelmente, o mesmo cartão duas vezes.
 *
 * E não mostravam o mesmo número. Este busca o risco na onda ANTERIOR à janela
 * de saídas (jan/26, 13,1% em Technology). O outro lia `retentionRisk`, que é
 * o risco da onda CORRENTE (ago/26, 8,7%) -- com "risco em jan/2026" escrito à
 * mão no subtítulo. Ou seja: comparava uma declaração de agosto com demissões
 * de fevereiro a julho, o efeito antes da causa, que é exatamente a inversão
 * que o comentário do servidor diz ter escapado por pouco. Escapou de um
 * cartão e entrou no outro.
 *
 * Três vezes num só dia eu corrigi um dos dois e esqueci o irmão. A nuvem e a
 * calibração vieram para cá e o outro arquivo deixou de existir -- não por
 * economia de tela, mas porque duas leituras da mesma pergunta em dois
 * arquivos divergem sozinhas, e ninguém percebe até o número aparecer em
 * duplicata na frente de quem sabe a resposta.
 *
 * ------------------------------------------------------------------
 * O n É PEQUENO, E ISSO VAI ESCRITO NA TELA
 * ------------------------------------------------------------------
 * São oito ou nove áreas. Um rho calculado sobre nove pontos é indício, não
 * prova, e some se uma área grande se comportar diferente na próxima onda. A
 * frase que acompanha o número diz isso -- senão o número vira citação de
 * reunião e perde a ressalva no caminho.
 */

const fmt1 = (v: number | null) =>
  v == null ? '—' : v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const fmt2 = (v: number | null) =>
  v == null ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * A leitura do rho em palavras.
 *
 * Os cortes são deliberadamente conservadores para nove pontos: 0,7 para
 * afirmar que acompanha, 0,4 para dizer que há alguma relação. Abaixo disso a
 * resposta honesta é "não dá para afirmar", e não "não prevê" -- ausência de
 * sinal com n pequeno não é prova de ausência.
 */
function leitura(
  rho: number | null,
  pares: number,
  jack: AderenciaRisco['jackknife'],
  poucaSaida: number,
): { titulo: string; cor: string; texto: string } {
  if (rho == null) {
    return {
      titulo: 'Ainda não dá para dizer',
      cor: COLORS.gray400,
      texto: `São ${pares} áreas com os dois números. Com menos de quatro, qualquer padrão que aparecesse seria acaso com aparência de medição.`,
    };
  }

  // ------------------------------------------------------------------
  // A ESTABILIDADE VEM ANTES DO VALOR
  // ------------------------------------------------------------------
  // Este bloco existe porque a versão anterior deste painel dizia "não
  // acompanhou" com rho 0,02 -- e estava afirmando demais. Refazendo a conta
  // sem cada área, o resultado ia de -0,32 a +0,29: tirar UMA linha mudava a
  // conclusão de ponta a ponta.
  //
  // Ausência de correlação com oito pontos, e a maioria das áreas com zero ou
  // uma saída, não é evidência de ausência. "Não dá para dizer" e "não prevê"
  // levam a decisões diferentes, e só a primeira é honesta aqui.
  if (instavel(jack)) {
    return {
      titulo: 'Esta conta ainda não sustenta conclusão',
      cor: COLORS.gray400,
      texto: `Refazendo sem cada área, o resultado vai de ${fmt2(jack?.min ?? null)} a ${fmt2(jack?.max ?? null)} — tirar uma única linha muda a leitura de ponta a ponta.${poucaSaida ? ` ${poucaSaida} das ${pares} áreas tiveram menos de duas saídas no período, e numa área pequena uma pessoa move o índice inteiro.` : ''} Não é que o risco não preveja: é que com este volume ainda não dá para saber.`,
    };
  }
  if (rho >= 0.7) return {
    titulo: 'O risco declarado acompanhou as saídas',
    cor: COLORS.success,
    texto: 'As áreas que declararam mais risco foram, em geral, as que mais perderam gente. A coluna está ganhando o espaço que ocupa.',
  };
  if (rho >= 0.4) return {
    titulo: 'Acompanhou em parte',
    cor: COLORS.warning,
    texto: 'Há relação, mas não o suficiente para tratar o risco declarado como previsão de área. Serve para priorizar conversa, não para planejar reposição.',
  };
  if (rho > -0.4) return {
    titulo: 'Não acompanhou',
    cor: COLORS.danger,
    texto: 'O risco que as áreas declararam não guarda relação com quem de fato pediu demissão nesta janela. Continua sendo um fato sobre como as pessoas se sentem — mas não é previsão de saída, e não deveria ser usado como tal.',
  };
  return {
    titulo: 'Acompanhou ao contrário',
    cor: COLORS.danger,
    texto: 'As áreas que declararam MAIS risco perderam MENOS gente nesta janela. Com este número de áreas isso pode ser acaso, mas é o oposto do que a coluna promete e vale investigar antes de usá-la para qualquer coisa.',
  };
}

export default function RiscoPreviu({
  dados, ondaLabel, janela, departamentoSelecionado = null,
}: {
  dados: AderenciaRisco;
  ondaLabel: string;
  /** Rótulo da janela de saídas, p.ex. "fev–jul/2026". */
  janela?: string;
  /**
   * Recorta o cartão. Ver o bloco no topo do arquivo.
   *
   * ------------------------------------------------------------------
   * A CORREÇÃO ANTERIOR RESOLVEU METADE E CRIOU A OUTRA
   * ------------------------------------------------------------------
   * Antes, filtrar uma área fazia este cartão sumir -- e silêncio se lê como
   * "não há nada aqui". A correção foi ignorar o filtro. Só que a lista
   * abaixo tem uma linha por área, com nome, risco declarado e quantos
   * pediram demissão: ignorar o filtro entrega o resultado das oito áreas a
   * quem pediu uma.
   *
   * Nenhuma das duas versões estava certa. A pergunta do cartão -- "a coluna
   * de risco antecipa quem sai?" -- é mesmo uma correlação entre áreas e não
   * existe com uma só; o que não se seguia disso é que a saída fosse mostrar
   * todas. Com filtro, fica a linha da área e cai o resto, dito na tela.
   */
  departamentoSelecionado?: string | null;
}) {
  const chave = (t: string) =>
    t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
  const alvo = departamentoSelecionado ? chave(departamentoSelecionado) : null;

  // ======================================================================
  // COM UMA ÁREA ESCOLHIDA, SÓ A LINHA DELA
  // ======================================================================
  // O rho, o veredito e a lista comparam áreas entre si -- não existem para
  // uma, e mostrá-los aqui seria entregar as outras oito de carona.
  if (alvo) {
    const minha = dados.linhas.find((r) => chave(r.area) === alvo) ?? null;
    return (
      <ChartCard
        title="O risco declarado previu as saídas?"
        subtitle={`${departamentoSelecionado} · declarado em ${ondaLabel} · saídas nos ${dados.mesesObservados} meses seguintes`}
        icon={Target}
      >
        {minha == null ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Esta área não tem risco declarado e saídas observadas na mesma janela.
          </p>
        ) : (
          <div className="rounded-md border border-border p-3">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-2xl font-medium tabular-nums" style={{ color: COLORS.warning }}>
                {fmt1(minha.riscoDeclarado)}%
              </span>
              <span className="text-xs text-muted-foreground">declararam risco em {ondaLabel}</span>
              <span className="text-muted-foreground">→</span>
              {minha.saidaObservada == null ? (
                <span className="text-xs text-muted-foreground">
                  sem denominador para calcular a saída
                </span>
              ) : (
                <>
                  <span className="text-2xl font-medium tabular-nums" style={{ color: COLORS.danger }}>
                    {fmt1(minha.saidaObservada)}%
                  </span>
                  <span className="text-xs text-muted-foreground">
                    pediram demissão ({minha.pediramDemissao} de {minha.headcount ?? '—'},
                    anualizado)
                  </span>
                </>
              )}
            </div>
            {minha.pediramDemissao < SAIDAS_MINIMAS_PARA_TAXA && (
              <p className="text-[11px] mt-2 leading-relaxed" style={{ color: COLORS.warning }}>
                Poucas saídas para uma taxa estável: uma pessoa a mais ou a menos move este
                percentual vários pontos. O risco declarado, esse vem da pesquisa inteira da área.
              </p>
            )}
          </div>
        )}

        <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
          <strong>O veredito do cartão não cabe aqui.</strong> Saber se a coluna de risco antecipa
          quem sai é comparar o que cada área declarou com o que aconteceu em cada uma — precisa de
          várias áreas para existir. Com uma, há dois números e nenhuma relação a testar. Tire o
          filtro para ver a comparação.
        </p>
        <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
          Risco declarado é o % que disse que não ficaria diante de uma oferta igual em outro lugar
          — é intenção, não decisão. A saída observada é anualizada, para não comparar{' '}
          {dados.mesesObservados} meses de saída com um percentual sem prazo.
        </p>
      </ChartCard>
    );
  }

  if (dados.linhas.length < 3) return null;

  const l = leitura(dados.rho, dados.pares, dados.jackknife, dados.areasComPoucaSaida);

  // ======================================================================
  // NUVEM E CALIBRAÇÃO SAEM DE `dados.linhas`, A MESMA FONTE DA LISTA
  // ======================================================================
  // É o ponto inteiro da fusão. Enquanto viviam noutro arquivo, liam
  // `retentionRisk` -- a onda corrente -- e mostravam 8,7% ao lado dos 13,1%
  // desta lista, com as duas coisas chamadas "risco declarado em jan/26".
  const pontos = dados.linhas
    .filter((x) => x.saidaObservada != null && x.headcount != null)
    .map((x) => ({
      x: x.riscoDeclarado,
      y: x.saidaObservada as number,
      nome: x.area,
      saidas: x.pediramDemissao,
      hc: x.headcount as number,
      fragil: x.pediramDemissao < SAIDAS_MINIMAS_PARA_TAXA,
    }));

  const totalVol = pontos.reduce((a, q) => a + q.saidas, 0);
  const totalHc = pontos.reduce((a, q) => a + q.hc, 0);
  const observadaAgregada =
    totalHc > 0 && dados.mesesObservados > 0
      ? Math.round((totalVol / totalHc) * (12 / dados.mesesObservados) * 1000) / 10
      : null;
  const declaradaMedia = pontos.length
    ? Math.round((pontos.reduce((a, q) => a + q.x, 0) / pontos.length) * 10) / 10
    : null;
  const maxRisco = Math.max(...dados.linhas.map((x) => x.riscoDeclarado), 1);
  const maxSaida = Math.max(...dados.linhas.map((x) => x.saidaObservada ?? 0), 1);

  return (
    <ChartCard
      title="O risco declarado previu as saídas?"
      subtitle={`declarado em ${ondaLabel} · saídas ${
        janela ? `em ${janela}` : `nos ${dados.mesesObservados} meses seguintes`
      }`}
      ajuda="riscoPreviuSaidas"
      icon={Target}
    >
      <div className="rounded-md border px-3 py-2.5 mb-3" style={{ borderColor: `${l.cor}55`, background: `${l.cor}12` }}>
        <p className="text-sm font-semibold" style={{ color: l.cor }}>
          {l.titulo}
          {dados.rho != null && (
            <span className="font-normal text-muted-foreground"> · rho {fmt1(dados.rho)}</span>
          )}
        </p>
        <p className="text-[13px] leading-relaxed mt-1">{l.texto}</p>
      </div>

      {pontos.length >= 4 && (
        <div className="mb-3">
          <ResponsiveContainer width="100%" height={280}>
            <ScatterChart margin={{ top: 16, right: 28, bottom: 28, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis
                type="number" dataKey="x" name="Risco declarado" unit="%"
                domain={['dataMin - 3', 'dataMax + 3']} tick={{ fontSize: 11 }}
                label={{ value: 'Risco declarado na pesquisa (%)', position: 'insideBottom', offset: -16, fontSize: 11 }}
              />
              <YAxis
                type="number" dataKey="y" name="Saída voluntária" unit="%"
                domain={[0, 'dataMax + 4']} tick={{ fontSize: 11 }}
                label={{ value: 'Saída voluntária (% a.a.)', angle: -90, position: 'insideLeft', fontSize: 11 }}
              />
              <Tooltip
                cursor={{ strokeDasharray: '3 3' }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const q = payload[0].payload as (typeof pontos)[number];
                  return (
                    <div className="rounded-md border border-border bg-popover p-2.5 text-xs shadow-md max-w-[250px]">
                      <div className="font-medium mb-1">{q.nome}</div>
                      <div className="text-muted-foreground">Declararam risco: {fmt1(q.x)}%</div>
                      <div className="text-muted-foreground">
                        Pediram demissão: {q.saidas} de ~{q.hc} ({fmt1(q.y)}% a.a.)
                      </div>
                      {q.fragil && (
                        <div className="mt-1.5 pt-1.5 border-t border-border/60 text-[11px]" style={{ color: COLORS.warning }}>
                          Poucas saídas para uma taxa estável — uma pessoa a mais ou a menos move
                          bastante este ponto.
                        </div>
                      )}
                    </div>
                  );
                }}
              />
              {/* Dois Scatter em vez de um: pontos frágeis vazados. Recharts não
                  aceita cor por ponto sem <Cell>, e <Cell> não distingue o traço --
                  que é justamente o que comunica "não confie neste ponto". */}
              <Scatter name="≥5 saídas" data={pontos.filter((q) => !q.fragil)} fill={COLORS.flutter} fillOpacity={0.85}>
                <LabelList dataKey="nome" position="top" style={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
              </Scatter>
              <Scatter
                name="<5 saídas" data={pontos.filter((q) => q.fragil)}
                fill="transparent" stroke={COLORS.flutter} strokeWidth={1.6} strokeDasharray="2 2"
              >
                <LabelList dataKey="nome" position="top" style={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
          <p className="text-[11px] text-muted-foreground -mt-1 leading-relaxed">
            Cada ponto é uma área: à direita, mais gente disse que pensava em sair; acima, mais
            gente de fato pediu demissão depois. Se a pesquisa previsse bem, os pontos formariam
            uma diagonal subindo. Bolas cheias são áreas com {SAIDAS_MINIMAS_PARA_TAXA} ou mais
            pedidos — só {pontos.filter((q) => !q.fragil).length} de {pontos.length}; nas vazadas,
            a altura diz pouco.
          </p>
        </div>
      )}

      <div className="space-y-0.5">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground pb-1">
          <span className="w-[112px] shrink-0">Área</span>
          <span className="flex-1 text-right">Risco declarado</span>
          <span className="flex-1">Saída observada (a.a.)</span>
        </div>

        {dados.linhas.map((r) => (
          <div
            key={r.area}
            className={cn(
              'flex items-center gap-2 py-1 text-[12px]',
              // A área filtrada continua na lista e ganha destaque: tirá-la
              // seria esconder justamente a linha que quem filtrou quer ver.
              alvo && chave(r.area) === alvo && 'rounded bg-muted/60 -mx-1 px-1',
            )}
          >
            <span
              className={cn(
                'w-[112px] shrink-0 truncate',
                alvo && chave(r.area) === alvo && 'font-semibold',
              )}
              title={r.area}
            >
              {r.area}
            </span>

            <div className="flex-1 flex items-center justify-end gap-1.5 min-w-0">
              <span className="tabular-nums text-muted-foreground">{fmt1(r.riscoDeclarado)}%</span>
              <div className="h-2 rounded-l-full" style={{
                width: `${(r.riscoDeclarado / maxRisco) * 70}%`, background: COLORS.warning,
              }} />
            </div>

            <div className="w-px h-3 bg-border shrink-0" />

            <div className="flex-1 flex items-center gap-1.5 min-w-0">
              {r.saidaObservada == null ? (
                <span className="text-muted-foreground">sem denominador</span>
              ) : (
                <>
                  <div className="h-2 rounded-r-full" style={{
                    width: `${(r.saidaObservada / maxSaida) * 70}%`, background: COLORS.danger,
                  }} />
                  <span className="tabular-nums">{fmt1(r.saidaObservada)}%</span>
                  <span className="text-[11px] text-muted-foreground">
                    ({r.pediramDemissao} de {r.headcount ?? '—'})
                  </span>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {observadaAgregada != null && declaradaMedia != null && (
        <div className="rounded-md border border-border p-3 mt-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
            Calibração — quanto a intenção supera o fato
          </p>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-2xl font-medium tabular-nums">{fmt1(declaradaMedia)}%</span>
            <span className="text-xs text-muted-foreground">declararam risco</span>
            <span className="text-muted-foreground">→</span>
            <span className="text-2xl font-medium tabular-nums" style={{ color: COLORS.nsx }}>
              {fmt1(observadaAgregada)}%
            </span>
            <span className="text-xs text-muted-foreground">
              pediram demissão de fato ({totalVol} pessoas de ~{totalHc}, anualizado)
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
            Dizer que se pensa em sair não custa nada; sair custa muito. Por isso a intenção sempre
            fica acima do fato — o número útil é o <strong>fator</strong> entre os dois, aqui cerca
            de {(declaradaMedia / Math.max(observadaAgregada, 0.1)).toFixed(1)}×. Guardado esse
            fator, a próxima onda dá uma estimativa de perda no mesmo dia em que fecha, sem esperar
            seis meses para conferir. Ele só vale de verdade depois de duas ou três ondas — com uma
            medição, é ponto de partida, não régua.
          </p>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
        Risco declarado é o % que disse que não ficaria diante de uma oferta igual em
        outro lugar — é intenção, não decisão. A saída observada é anualizada, para
        não comparar {dados.mesesObservados} meses de saída com um percentual sem
        prazo. São {dados.pares} áreas com os dois números: é pouco, e um rho sobre
        {' '}{dados.pares} pontos é indício, não prova.
        {dados.jackknife && (
          <> Refazendo a conta sem cada área, o rho vai de {fmt2(dados.jackknife.min)} a{' '}
          {fmt2(dados.jackknife.max)} — é essa amplitude, e não o valor central, que diz
          se o número descreve alguma coisa.</>
        )}
      </p>
    </ChartCard>
  );
}
