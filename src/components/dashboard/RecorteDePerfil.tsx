import ChartCard from '@/components/dashboard/ChartCard';
import AreaDriverPanel from '@/components/dashboard/AreaDriverPanel';
import { COLORS } from '@/lib/colors';
import type { SurveyCut, DriverPorRecorte } from '@/lib/survey.functions';

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
  minimoExibicao = 5,
}: {
  cuts: SurveyCut[];
  drivers: DriverPorRecorte[];
  /** 'tempo' ou 'modelo'. */
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
  minimoExibicao?: number;
}) {
  const grupo = cuts.find((c) => c.cutType === cutType && c.cutValue === valor);
  const empresa = cuts.find((c) => c.cutType === 'company');
  const temClima = drivers.some((l) => l.cutType === cutType && l.cutValue === valor);
  const cruzado = cutType.includes('+');

  if (!grupo) {
    return (
      <ChartCard title={`${rotulo}: ${soValor}`}>
        <p className="text-sm text-muted-foreground py-5 leading-relaxed">
          A onda carregada não tem este recorte. Não é que o grupo não exista: é que a pesquisa
          desta onda não perguntou {rotulo.toLowerCase()}, ou a carga não trouxe a quebra.
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
              <strong>Este é o cruzamento de área com {rotulo.toLowerCase()}.</strong> Os números
              acima são só de quem está nos dois ao mesmo tempo, e por isso o grupo é menor — com
              menos de {minimoExibicao} respostas a nota fica oculta. A fila por área e a grade
              área × tema continuam fora: elas comparam as áreas ENTRE si, e aqui há uma só.
            </>
          ) : (
            <>
              <strong>Sem área selecionada, este recorte é da empresa inteira.</strong> Escolha um
              departamento junto para ver o cruzamento — por exemplo, só quem tem 24+ meses{' '}
              <em>dentro</em> de Marketing. A fila por área e a grade área × tema ficam de fora
              enquanto houver recorte de perfil: elas comparam áreas entre si.
            </>
          )}
        </p>
      </ChartCard>

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
