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
 * A Anna pediu filtro por tempo de casa e modelo de trabalho. O dado existe --
 * eNPS, risco, satisfação e as notas por pergunta, tudo recortado por essas
 * chaves --, mas ele NÃO cruza com área: `survey_driver_scores` tem as notas
 * por área OU por tempo, nunca pelos dois.
 *
 * Então filtrar "24+ meses" e manter a tela normal produziria uma página
 * metade recortada e metade não: a fila por área continuaria mostrando as nove
 * áreas inteiras sob um filtro que promete outra coisa. É exatamente o que
 * este painel passou a semana desfazendo.
 *
 * A saída honesta é uma tela menor e verdadeira: o que o grupo respondeu, em
 * que ele está mais longe da empresa, e uma frase dizendo o que não cabe aqui.
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
  minimoExibicao?: number;
}) {
  const grupo = cuts.find((c) => c.cutType === cutType && c.cutValue === valor);
  const empresa = cuts.find((c) => c.cutType === 'company');
  const temClima = drivers.some((l) => l.cutType === cutType && l.cutValue === valor);

  if (!grupo) {
    return (
      <ChartCard title={`${rotulo}: ${valor}`}>
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
        title={`${rotulo}: ${valor}`}
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
        <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
          <strong>Este recorte não cruza com área.</strong> As notas por pergunta existem por área{' '}
          <em>ou</em> por {rotulo.toLowerCase()}, nunca pelos dois — então a fila por área, a grade
          área × tema e a matriz de ação ficam de fora enquanto este filtro estiver ligado, em vez
          de mostrarem as nove áreas inteiras sob um recorte que promete outra coisa. Volte para{' '}
          <strong>Todos</strong> em {rotulo.toLowerCase()} para tê-las de novo.
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
