import ChartCard from '@/components/dashboard/ChartCard';
import AreaDriverPanel from '@/components/dashboard/AreaDriverPanel';
import DriversDeepDive from '@/components/dashboard/DriversDeepDive';
import DriverPriority from '@/components/dashboard/DriverPriority';
import { COLORS } from '@/lib/colors';
import type { SurveyCut, DriverPorRecorte, SurveyImportance } from '@/lib/survey.functions';

/**
 * A aba quando o recorte é um PERFIL, e não uma área.
 *
 * ------------------------------------------------------------------
 * POR QUE UMA TELA PRÓPRIA, E NÃO A DE SEMPRE FILTRADA
 * ------------------------------------------------------------------
 * A Anna pediu filtro por tempo de casa e modelo de trabalho. A primeira
 * versão disto vinha com uma ressalva: o recorte NÃO cruzava com área, porque
 * `survey_driver_scores` tinha as notas por área OU por tempo, nunca pelos
 * dois. Filtrar "24+ meses" e manter a tela normal daria uma página metade
 * recortada.
 *
 * A ressalva durou pouco. O agregador passou a gravar os cruzados nos drivers
 * -- a conta já existia, era `CUT_KEY` montando "Marketing || 24+ meses", e
 * só não era chamada para esta tabela --, então "Marketing E 24+ meses" existe
 * de verdade e os dois filtros se somam.
 *
 * O que continua fora é o que compara ÁREAS ENTRE SI: a fila por área e a
 * grade área × tema. Com uma área escolhida não há comparação a fazer, e isso
 * não muda com cruzamento nenhum.
 *
 * A tela é a mesma nos dois casos -- o que o grupo respondeu e em que ele está
 * mais longe da empresa --, e o texto diz qual dos dois está valendo.
 *
 * ------------------------------------------------------------------
 * O QUE ISTO DESTRAVA
 * ------------------------------------------------------------------
 * O clima de quem tem mais de dois anos de casa nunca existiu no painel, e é
 * justamente o grupo cuja queda a aba inteira aponta -- as três faixas acima
 * de um ano caem em todas as medições. Até aqui dava para ver QUE caiu, nunca
 * EM QUÊ.
 */

const fmt1 = (v: number | null | undefined) =>
  v == null ? '—' : v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

export default function RecorteDePerfil({
  cuts,
  drivers,
  cutType,
  valor,
  rotulo,
  soValor,
  importancia = [],
  minimoExibicao = 5,
}: {
  cuts: SurveyCut[];
  drivers: DriverPorRecorte[];
  /** 'tempo', 'modelo', 'tempo+modelo', 'area+tempo', 'area+tempo+modelo'... */
  cutType: string;
  /** O valor escolhido, como está gravado: "24+ meses", "Híbrido". */
  valor: string;
  /** Como o filtro chama a dimensão: "Tempo de casa", "Modelo de trabalho". */
  rotulo: string;
  /**
   * O valor SEM a área na frente.
   *
   * Com área junto, `valor` vem composto -- "Marketing || 24+ meses" -- porque
   * é assim que a chave está gravada. No título isso ficaria "Marketing ·
   * Tempo de casa: Marketing || 24+ meses", com o separador cru na tela.
   */
  soValor: string;
  /**
   * A associação com o eNPS, por pergunta. Não existe por perfil -- só por
   * empresa e por área --, então aqui ela entra como ORDEM: quais perguntas
   * mais movem o engajamento na Flutter Brazil, com a nota DESTE grupo.
   */
  importancia?: SurveyImportance[];
  minimoExibicao?: number;
}) {
  const grupo = cuts.find((c) => c.cutType === cutType && c.cutValue === valor);
  const empresa = cuts.find((c) => c.cutType === 'company');
  const temClima = drivers.some((l) => l.cutType === cutType && l.cutValue === valor);
  const cruzado = cutType.includes('+');

  /* ------------------------------------------------------------------
     "NÃO EXISTE" E "PEQUENO DEMAIS" SÃO COISAS DIFERENTES
     ------------------------------------------------------------------
     Este cartão tinha uma mensagem só para os dois casos, e ela dizia que a
     onda "não tem este recorte". Com o cruzamento triplo isso passou a ser
     falso na maioria das vezes: medido em ago/26, 77 das 106 combinações de
     área × tempo de casa × modelo TÊM gente -- só têm menos de cinco pessoas,
     e a nota fica oculta de propósito, para não identificar ninguém.

     Dizer "não existe" para um grupo que existe é a mesma troca que este
     painel passou a semana desfazendo. Quem lê conclui que a área não tem
     ninguém naquela faixa, e isso vira decisão. */
  if (!grupo || grupo.n < minimoExibicao) {
    const vazio = !grupo;
    return (
      <ChartCard title={`${rotulo}: ${soValor}`}>
        <p className="text-sm text-muted-foreground py-5 leading-relaxed">
          {vazio ? (
            <>
              <strong>Ninguém respondeu com esta combinação nesta onda.</strong> Ou a pesquisa
              desta onda não perguntou {rotulo.toLowerCase()} — modelo de trabalho, por exemplo, só
              entrou em ago/26 — ou não há pessoa alguma que caia em todos os filtros ao mesmo
              tempo.
            </>
          ) : (
            <>
              <strong>
                Este grupo tem {grupo.n} {grupo.n === 1 ? 'pessoa' : 'pessoas'}, abaixo do mínimo de{' '}
                {minimoExibicao}.
              </strong>{' '}
              O grupo existe — o que não aparece é a nota, porque com tão poucas respostas ela
              apontaria para indivíduos. Tire um dos filtros para ver o número: com dois recortes
              de perfil sobre uma área, a maioria das combinações fica abaixo do mínimo.
            </>
          )}
        </p>
      </ChartCard>
    );
  }

  /** A distância até a empresa, que é a régua de todo o painel. */
  const contra = (v: number | null | undefined, base: number | null | undefined) =>
    v == null || base == null ? null : Math.round((v - base) * 10) / 10;

  const dEnps = contra(grupo.enps, empresa?.enps);
  const dRisco = contra(grupo.risco, empresa?.risco);
  const dSatisf = contra(grupo.satisfacao, empresa?.satisfacao);

  const Numero = ({
    rot, valor: v, delta, sufixo = '', inverso = false,
  }: {
    rot: string;
    valor: number | null | undefined;
    delta: number | null;
    sufixo?: string;
    /** true quando SUBIR é ruim -- caso do risco. */
    inverso?: boolean;
  }) => {
    const bom = delta == null ? null : inverso ? delta <= 0 : delta >= 0;
    return (
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{rot}</div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-bold tabular-nums">
            {fmt1(v)}
            {sufixo}
          </span>
          {delta != null && (
            <span
              className="text-[11px] tabular-nums"
              style={{ color: bom ? COLORS.success : COLORS.danger }}
            >
              {delta > 0 ? '+' : ''}
              {fmt1(delta)} vs empresa
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <ChartCard
        title={`${rotulo}: ${soValor}`}
        subtitle={`${grupo.n} ${grupo.n === 1 ? 'resposta' : 'respostas'}${
          empresa ? ` · empresa: eNPS ${empresa.enps}, risco ${fmt1(empresa.risco)}%` : ''
        }`}
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Numero rot="eNPS" valor={grupo.enps} delta={dEnps} />
          <Numero rot="Satisfação" valor={grupo.satisfacao} delta={dSatisf} />
          <Numero rot="Risco de saída" valor={grupo.risco} delta={dRisco} sufixo="%" inverso />
        </div>

        {grupo.promotores != null && (
          <div className="mt-3 pt-3 border-t border-border/60 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
            <span>
              <strong className="text-emerald-600 dark:text-emerald-500">{grupo.promotores}</strong>{' '}
              promotores
            </span>
            <span>
              <strong className="text-foreground">{grupo.passivos ?? '—'}</strong> passivos
            </span>
            <span>
              <strong className="text-red-600 dark:text-red-500">{grupo.detratores ?? '—'}</strong>{' '}
              detratores
            </span>
          </div>
        )}

        {/* ------------------------------------------------------------------
            O QUE NÃO CABE, DITO ANTES DE FAZEREM FALTA
            ------------------------------------------------------------------
            Sem esta frase, quem filtra por tempo de casa procura a fila por
            área e conclui que o painel quebrou. */}
        {/* O texto muda conforme o recorte seja cruzado ou não: dizer "não
            cruza com área" numa tela que está cruzando seria a mesma classe
            de afirmação envelhecida que este painel passou a semana tirando. */}
        <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
          {cruzado ? (
            <>
              <strong>
                Os números acima são só de quem está em TODOS os filtros ao mesmo tempo.
              </strong>{' '}
              Por isso o grupo é menor que a área inteira, e abaixo de {minimoExibicao} respostas a
              nota fica oculta. A fila por área e a grade área × tema continuam fora: elas comparam
              as áreas ENTRE si, e aqui há uma só.
            </>
          ) : (
            <>
              <strong>Sem área selecionada, este recorte é da empresa inteira.</strong> Escolha um
              departamento junto para estreitar — por exemplo, só quem tem 24+ meses{' '}
              <em>dentro</em> de Marketing. A fila por área e a grade área × tema ficam de fora
              enquanto houver recorte de perfil: elas comparam áreas entre si.
            </>
          )}
        </p>
      </ChartCard>

      {/* ------------------------------------------------------------------
          OS CARTÕES DE CLIMA, RECORTADOS
          ------------------------------------------------------------------
          A primeira versão desta tela tinha três números e uma lista. O pedido
          foi que o filtro valesse "para todos os indicadores e cards", e a
          maior parte dele é possível: as notas por pergunta existem para este
          grupo, e é delas que saem tema por tema e pergunta a pergunta.

          O que NÃO vem junto, e por quê:

            fila por área, grade área × tema, dispersão entre áreas
              comparam ÁREAS ENTRE SI. Com um grupo só não há comparação --
              e isso não muda com dado nenhum.

            série ao longo das ondas
              modelo de trabalho só foi perguntado em ago/26. Uma "série" de
              um ponto é um ponto.

            a associação com o eNPS
              só existe por empresa e por área. Aqui ela entra como ORDEM --
              quais perguntas mais movem o engajamento na empresa -- com a
              NOTA deste grupo. É o mesmo tratamento que uma área pequena
              demais para ter correlação própria já recebia. */}
      {temClima && (
        <>
          <DriversDeepDive
            drivers={[]}
            porArea={drivers}
            recorte={{ cutType, valor }}
          />
          {importancia.length > 0 && (
            <DriverPriority
              rows={importancia}
              drivers={drivers}
              recorte={{ cutType, valor }}
              departamentoSelecionado={soValor}
            />
          )}
        </>
      )}

      {temClima ? (
        <AreaDriverPanel
          area={valor}
          cutType={cutType}
          drivers={drivers}
          minimoExibicao={minimoExibicao}
        />
      ) : (
        <ChartCard title="Em que este grupo está mais longe da empresa">
          <p className="text-sm text-muted-foreground py-5 leading-relaxed">
            As notas por pergunta não foram carregadas com este recorte nesta onda. Os três números
            acima vêm de outra tabela, que tem a quebra — por isso eles aparecem e o detalhe não.
          </p>
        </ChartCard>
      )}
    </div>
  );
}
