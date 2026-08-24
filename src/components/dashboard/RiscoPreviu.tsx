import { Target } from 'lucide-react';
import ChartCard from '@/components/dashboard/ChartCard';
import { COLORS } from '@/lib/colors';
import { instavel, type AderenciaRisco } from '@/lib/analise-engajamento';
import AvisoForaDoFiltro from '@/components/dashboard/AvisoForaDoFiltro';
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
  dados, ondaLabel, departamentoSelecionado = null,
}: {
  dados: AderenciaRisco;
  ondaLabel: string;
  /**
   * Só para o aviso e para o destaque na lista. Este cartão NÃO segue o filtro
   * de propósito: ele responde "a coluna de risco antecipa quem vai embora?",
   * que é uma pergunta sobre o instrumento e uma correlação entre áreas.
   *
   * Enquanto ele se alimentou das linhas filtradas, escolher um departamento o
   * fazia desaparecer da tela -- o `return null` abaixo. Silêncio se lê como
   * "não há nada aqui"; o certo é "esta pergunta não é sobre a sua área".
   */
  departamentoSelecionado?: string | null;
}) {
  if (dados.linhas.length < 3) return null;

  const chave = (t: string) =>
    t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
  const alvo = departamentoSelecionado ? chave(departamentoSelecionado) : null;

  const l = leitura(dados.rho, dados.pares, dados.jackknife, dados.areasComPoucaSaida);
  const maxRisco = Math.max(...dados.linhas.map((x) => x.riscoDeclarado), 1);
  const maxSaida = Math.max(...dados.linhas.map((x) => x.saidaObservada ?? 0), 1);

  return (
    <ChartCard
      title="O risco declarado previu as saídas?"
      subtitle={`declarado em ${ondaLabel} · saídas nos ${dados.mesesObservados} meses seguintes`}
      icon={Target}
    >
      <AvisoForaDoFiltro
        departamento={departamentoSelecionado}
        motivo="Esta pergunta não é sobre uma área: é sobre a coluna de risco. A resposta é uma correlação ENTRE as áreas, e com uma só ela não existe — por isso o quadro mostra todas."
        escopo="de todas as áreas"
      />
      <div className="rounded-md border px-3 py-2.5 mb-3" style={{ borderColor: `${l.cor}55`, background: `${l.cor}12` }}>
        <p className="text-sm font-semibold" style={{ color: l.cor }}>
          {l.titulo}
          {dados.rho != null && (
            <span className="font-normal text-muted-foreground"> · rho {fmt1(dados.rho)}</span>
          )}
        </p>
        <p className="text-[13px] leading-relaxed mt-1">{l.texto}</p>
      </div>

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
