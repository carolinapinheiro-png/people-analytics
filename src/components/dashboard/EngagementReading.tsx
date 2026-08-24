import { useMemo, type ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { COLORS } from '@/lib/colors';
import { classifyPerguntas, temaDominante } from '@/lib/pergunta-priority';
import { classifyAreas } from '@/lib/area-priority';
import type { EngagementContextRow } from '@/lib/engagement-context';
import type { SurveyCut, SurveyImportance } from '@/lib/survey.functions';

/**
 * A leitura da onda, em quatro frases, calculada dos próprios números.
 *
 * ------------------------------------------------------------------
 * POR QUE ISTO É O PRIMEIRO BLOCO DA ABA
 * ------------------------------------------------------------------
 * A versão anterior tinha onze gráficos e nenhuma conclusão. Quem abria via
 * muito número e saía sem saber o que fazer -- que é o pior resultado possível
 * para um painel de gente, porque o custo não é confusão, é a pessoa deixar de
 * voltar.
 *
 * Um gráfico responde "qual é o número". Ele não responde "e daí". A ponte
 * entre as duas coisas normalmente é feita por quem apresenta, de cabeça, e por
 * isso muda a cada apresentação. Aqui ela é calculada, sempre igual, e fica
 * antes de qualquer gráfico.
 *
 * ------------------------------------------------------------------
 * POR QUE CALCULADO E NÃO ESCRITO À MÃO
 * ------------------------------------------------------------------
 * Texto fixo envelhece calado. Se alguém escrevesse "Marketing é a prioridade"
 * hoje, a frase continuaria lá na onda de julho, com a mesma cara de verdade,
 * mesmo depois de Marketing melhorar. Cada frase abaixo é derivada dos dados
 * que estão na tela logo em seguida -- e some quando o dado não sustenta.
 *
 * A regra: nenhuma frase afirma o que os dados não mostram. Onde a evidência é
 * fraca (n pequeno, correlação sem força), a frase muda de "é" para "vale
 * olhar" -- ver os retornos condicionais em cada bloco.
 */

interface Linha {
  rotulo: string;
  texto: ReactNode;
  cor: string;
}

const fmt1 = (n: number | null | undefined) =>
  n == null ? '—' : Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 1 });

export default function EngagementReading({
  enpsEmpresa,
  respondentes,
  participacao,
  areas,
  cuts,
  importancia,
  departamento = null,
}: {
  enpsEmpresa: number | null;
  respondentes: number | null;
  participacao: number | null;
  areas: EngagementContextRow[];
  cuts: SurveyCut[];
  importancia: SurveyImportance[];
  /**
   * Área escolhida no filtro, ou null.
   *
   * ------------------------------------------------------------------
   * POR QUE A LEITURA PRECISA SABER DISSO
   * ------------------------------------------------------------------
   * Isto NÃO é para escolher números -- quem chama já manda tudo no escopo
   * certo. É só para o texto: dizer "em MARKETING" e avisar quais frases
   * continuam sendo da empresa mesmo com o filtro ligado.
   *
   * A frase de abertura já saiu errada assim, filtrada em Marketing:
   *
   *     "eNPS 48, patamar baixo, com 485 respostas (76,5% dos elegíveis)."
   *
   * O 48 era de Marketing; as 485, da empresa. Marketing teve 81. Uma vírgula
   * separava os dois e nada avisava. A correção que ficou não foi o texto
   * desviar do número -- foi a aba passar o número da área.
   *
   * O que continua sendo da empresa em qualquer filtro é `importancia`: a
   * tabela de associação com o eNPS não tem coluna de recorte no banco.
   */
  departamento?: string | null;
}) {
  const linhas = useMemo<Linha[]>(() => {
    const out: Linha[] = [];
    // Só departamentos de verdade: "Betfair" aparece na pesquisa ao lado das
    // áreas, mas é marca -- entra em todas elas. Ver AreaPriority.
    const comArea = areas.filter((a) => a.dept != null && a.enps != null);

    // 1. ONDE ESTAMOS -------------------------------------------------------
    if (enpsEmpresa != null) {
      const qualidade = enpsEmpresa >= 70 ? 'alto' : enpsEmpresa >= 50 ? 'saudável' : 'baixo';
      out.push({
        rotulo: 'Onde estamos',
        cor: COLORS.flutter,
        texto: (
          <>
            eNPS <strong>{enpsEmpresa}</strong>
            {departamento ? ` em ${departamento}` : ''}, patamar {qualidade}
            {respondentes ? `, com ${respondentes} respostas` : ''}
            {participacao ? ` (${fmt1(participacao)}% dos elegíveis)` : ''}.{' '}
            {departamento
              ? 'A leitura abaixo compara esta área com o resto da casa.'
              : 'A média esconde diferença grande entre áreas — é onde a conversa começa.'}
          </>
        ),
      });
    }

    // 2. O QUE MUDOU --------------------------------------------------------
    const comPrev = comArea.filter((a) => a.enpsPrev != null);
    if (comPrev.length >= 3) {
      const caiu = comPrev.filter((a) => (a.enps as number) < (a.enpsPrev as number));
      const subiu = comPrev.filter((a) => (a.enps as number) > (a.enpsPrev as number));
      const maioria = caiu.length >= comPrev.length * 0.7;
      out.push({
        rotulo: 'O que mudou',
        cor: caiu.length > subiu.length ? COLORS.warning : COLORS.success,
        texto: maioria ? (
          <>
            <strong>{caiu.length} de {comPrev.length} áreas caíram</strong> desde a onda anterior.
            Quando quase todas se movem para o mesmo lado, a causa costuma ser da empresa, não de
            cada gestor — vale procurar o que mudou no período antes de cobrar área por área.
          </>
        ) : (
          <>
            {caiu.length} áreas caíram e {subiu.length} subiram desde a onda anterior. Movimento
            misto: aqui a explicação tende a ser local, de cada área.
          </>
        ),
      });
    }

    // 3. ONDE AGIR ----------------------------------------------------------
    // Mesma classificação da fila por área (lib/area-priority.ts). Compartilhar
    // é obrigatório: se esta frase e a lista logo abaixo usassem regras
    // separadas, elas divergiriam no primeiro ajuste -- e a tela passaria a
    // apontar duas prioridades diferentes na mesma rolagem.
    const criticas = classifyAreas(areas).itens.filter((i) => i.veredito === 'agir');
    const alvo = criticas[0];
    if (alvo) {
      out.push({
        rotulo: 'Onde agir primeiro',
        cor: COLORS.danger,
        texto: (
          <>
            <strong>{alvo.scope}</strong> junta as duas coisas: engajamento abaixo do grupo
            (eNPS {alvo.enps}) e risco de saída acima ({fmt1(alvo.risco)}%)
            {criticas.length > 1 && `, junto com ${criticas.slice(1).map((c) => c.scope).join(' e ')}`}.
            É a combinação que mais costuma virar saída nos meses seguintes.
          </>
        ),
      });
    }

    // 4. POR ONDE COMEÇAR ---------------------------------------------------
    // Tema dominante entre as perguntas de nota baixa e associação alta.
    if (importancia.length >= 8) {
      // Mesma régua dos dois cartões da aba (`pergunta-priority.ts`). Antes esta
      // frase cortava pela mediana das médias e os cartões pelo % favorável, de
      // modo que a leitura do topo podia contar uma quantidade de perguntas que
      // não batia com a lista logo abaixo dela.
      const { itens } = classifyPerguntas(importancia);
      const prioridade = itens.filter((i) => i.quadrante === 'prioridade');
      const { tema, quantas } = temaDominante(prioridade);
      if (tema && quantas >= 2) {
        out.push({
          rotulo: 'Por onde começar',
          cor: COLORS.nsx,
          texto: (
            <>
              {/* A associação com o eNPS é calculada uma vez, na empresa inteira
                  -- `survey_driver_importance` não tem coluna de recorte. Com
                  filtro ligado, a frase precisa dizer isso, senão se lê como se
                  fossem as perguntas daquela área. */}
              Das {prioridade.length} perguntas com menor concordância que mais acompanham o
              engajamento <strong>na empresa toda</strong>,{' '}
              <strong>{quantas} são de {tema.toLowerCase()}</strong>. É onde o mesmo esforço tende
              a render mais — mais que remuneração, que tem as piores notas mas acompanha menos.
              {departamento && ' Esta leitura não muda com o filtro: a associação só existe medida na empresa.'}
            </>
          ),
        });
      }
    }

    // 5. O QUE OBSERVAR -----------------------------------------------------
    // Recorte com maior distância do total da empresa, entre os grandes o
    // bastante para a distância significar algo.
    const empresa = cuts.find((c) => c.cutType === 'company');
    if (empresa?.enps != null) {
      const candidatos = cuts.filter(
        (c) => c.cutType !== 'company' && c.cutType !== 'area' && !c.suprimido && c.enps != null && c.n >= 20,
      );
      const pior = candidatos.sort(
        (a, b) => (a.enps as number) - (b.enps as number),
      )[0];
      if (pior && (empresa.enps as number) - (pior.enps as number) >= 8) {
        const nome = { funcao: '', marca: 'quem atua em ', tempo: 'quem está há ' }[pior.cutType] ?? '';
        out.push({
          rotulo: 'O que observar',
          cor: COLORS.info,
          texto: (
            <>
              <strong>{nome}{pior.cutValue}</strong> tem eNPS {pior.enps},{' '}
              {(empresa.enps as number) - (pior.enps as number)} pontos abaixo da empresa, e são{' '}
              {pior.n} pessoas. Recorte que não aparece na leitura por área
              {departamento && ' — e que corta a empresa inteira, não só ' + departamento}.
            </>
          ),
        });
      }
    }

    return out;
  }, [enpsEmpresa, respondentes, participacao, areas, cuts, importancia, departamento]);

  if (!linhas.length) return null;

  return (
    <div
      className="rounded-xl border border-border/80 p-5 md:p-6 shadow-sm ring-1 ring-border/40"
      style={{
        background:
          'linear-gradient(160deg, color-mix(in oklab, var(--card) 92%, var(--primary) 8%), var(--card) 60%)',
      }}
    >
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground mb-4">
        A leitura desta onda
      </p>
      <div className="space-y-4">
        {linhas.map((l) => (
          <div key={l.rotulo} className="flex gap-3.5">
            <div className="w-[3px] rounded-full shrink-0" style={{ background: l.cor }} />
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wider font-medium" style={{ color: l.cor }}>{l.rotulo}</p>
              <p className="text-sm leading-relaxed mt-0.5">{l.texto}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground mt-4 pt-3 border-t border-border/50 flex items-center gap-1.5">
        <ArrowRight className="h-3 w-3 shrink-0" />
        Cada frase acima sai dos gráficos abaixo, e muda sozinha quando o dado mudar.
      </p>
    </div>
  );
}

