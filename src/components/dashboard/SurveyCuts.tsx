import { useMemo } from 'react';
import { EyeOff } from 'lucide-react';
import ChartCard from '@/components/dashboard/ChartCard';
import AvisoForaDoFiltro from '@/components/dashboard/AvisoForaDoFiltro';
import { COLORS } from '@/lib/colors';
import { cn } from '@/lib/utils';
import type { SurveyCut } from '@/lib/survey.functions';

/**
 * Gestor/contribuidor, marca e tempo de casa -- recortes que só existem depois
 * de ler o arquivo original da pesquisa.
 *
 * ------------------------------------------------------------------
 * POR QUE ISTO DEIXOU DE SER GRÁFICO
 * ------------------------------------------------------------------
 * A versão anterior eram três gráficos de barra com uma linha por cima e dois
 * eixos verticais -- eNPS de um lado, risco do outro. Eixo duplo é a forma mais
 * fácil de fazer duas séries parecerem relacionadas quando a relação é só de
 * escala: mexer no domínio de um dos eixos muda a "história" sem mudar um dado
 * sequer. Além disso obriga a conferir de qual eixo cada série é antes de ler
 * qualquer coisa.
 *
 * O que importa aqui é uma comparação simples: este grupo está acima ou abaixo
 * da empresa, e por quanto. Isso é uma barra com uma linha de referência, e a
 * distância é o dado.
 *
 * ------------------------------------------------------------------
 * SIGILO
 * ------------------------------------------------------------------
 * O servidor esconde a nota de recortes com menos de 5 respostas antes de
 * enviar (survey.functions.ts) -- aqui já chega null. O n continua na tela:
 * sumir com a linha faria a pessoa concluir que o grupo não respondeu e
 * perguntar o número por fora, que é o caminho sem controle nenhum.
 */

const fmt1 = (n: number | null | undefined) =>
  n == null ? '—' : Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 1 });

const BLOCOS: Array<{ tipo: string; titulo: string }> = [
  { tipo: 'funcao', titulo: 'Gestores e contribuidores' },
  { tipo: 'marca', titulo: 'Por marca' },
  { tipo: 'tempo', titulo: 'Por tempo de casa' },
];

/** Barra divergente: distância até a empresa, para a esquerda ou para a direita. */
function Divergente({
  valor, base, max, invertido = false,
}: {
  valor: number | null;
  base: number;
  max: number;
  /** true quando MAIOR é pior (caso do risco de saída). */
  invertido?: boolean;
}) {
  if (valor == null) {
    return <div className="h-3 rounded-full bg-muted/60 w-full" />;
  }
  const d = valor - base;
  const larguraPct = Math.min(Math.abs(d) / max, 1) * 50;
  const bom = invertido ? d <= 0 : d >= 0;
  const cor = bom ? COLORS.success : COLORS.warning;
  return (
    <div className="relative h-3 w-full">
      <div className="absolute inset-0 rounded-full bg-muted/50" />
      <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
      <div
        className="absolute inset-y-0 rounded-full transition-all"
        style={{
          // Intensidade acompanha a distância: perto da empresa quase apaga,
          // longe fica cheio. Sem isso, todo desvio parecia igual.
          background: `color-mix(in oklab, ${cor} ${55 + (larguraPct / 50) * 40}%, transparent)`,
          ...(d >= 0
            ? { left: '50%', width: `${larguraPct}%` }
            : { right: '50%', width: `${larguraPct}%` }),
        }}
      />
    </div>
  );
}

/**
 * Um painel por métrica (eNPS e risco), em vez das duas barras divergentes na
 * mesma linha. Duas escalas lado a lado numa linha de 11px obrigavam leitura
 * linha-a-linha; separadas, "quem está longe" salta antes da leitura consciente.
 */
function Painel({
  rotulo, rows, base, max, invertido = false, sufixo,
}: {
  rotulo: string;
  rows: SurveyCut[];
  base: number;
  max: number;
  invertido?: boolean;
  sufixo: string;
}) {
  const valorDe = (r: SurveyCut) => (invertido ? r.risco : r.enps);
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">{rotulo}</p>
      <div className="space-y-1.5">
        {rows.map((r) => {
          const v = valorDe(r);
          const d = v == null ? null : v - base;
          const bom = d == null ? false : invertido ? d <= 0 : d >= 0;
          return (
            <div key={r.cutValue} className="flex items-center gap-2 text-xs">
              <span className="w-[120px] shrink-0 truncate text-muted-foreground" title={r.cutValue}>
                {r.cutValue}
              </span>
              <div className="flex-1 min-w-0">
                <Divergente valor={v} base={base} max={max} invertido={invertido} />
              </div>
              <span className={cn(
                'tabular-nums w-[62px] shrink-0 text-right font-medium',
                d == null ? 'text-muted-foreground'
                : bom ? 'text-emerald-600 dark:text-emerald-500'
                : 'text-amber-600 dark:text-amber-500',
              )}>
                {d == null ? 'oculto' : `${d > 0 ? '+' : ''}${fmt1(d)}${sufixo}`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Bloco({ titulo, rows, empresa }: { titulo: string; rows: SurveyCut[]; empresa: SurveyCut | undefined }) {
  const baseEnps = empresa?.enps ?? 0;
  const baseRisco = empresa?.risco ?? 0;
  const maxEnps = useMemo(
    () => Math.max(...rows.map((r) => Math.abs((r.enps ?? baseEnps) - baseEnps)), 5),
    [rows, baseEnps],
  );
  const maxRisco = useMemo(
    () => Math.max(...rows.map((r) => Math.abs((r.risco ?? baseRisco) - baseRisco)), 3),
    [rows, baseRisco],
  );
  const ocultos = rows.filter((r) => r.suprimido);

  return (
    <div className="rounded-lg border border-border/60 bg-muted/15 p-3">
      <div className="flex items-baseline justify-between mb-2.5">
        <span className="text-sm font-medium">{titulo}</span>
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
          diferença para a empresa
        </span>
      </div>
      <div className="grid lg:grid-cols-2 gap-x-6 gap-y-4">
        <Painel rotulo="eNPS" rows={rows} base={baseEnps} max={maxEnps} sufixo=" pts" />
        <Painel rotulo="Risco de saída" rows={rows} base={baseRisco} max={maxRisco} invertido sufixo=" p.p." />
      </div>
      {ocultos.length > 0 && (
        <p className="text-xs mt-2 flex items-start gap-1" style={{ color: COLORS.warning }}>
          <EyeOff className="h-3 w-3 mt-0.5 shrink-0" />
          {ocultos.length === 1 ? 'Um grupo tem' : `${ocultos.length} grupos têm`} menos de 5
          respostas — nota oculta para não apontar para pessoas.
        </p>
      )}
      <p className="text-[11px] text-muted-foreground mt-2">
        n por grupo: {rows.map((r) => `${r.cutValue} ${r.n}`).join(' · ')}
      </p>
    </div>
  );
}


export default function SurveyCuts({
  cuts,
  departamentoSelecionado,
}: {
  cuts: SurveyCut[];
  /**
   * Departamento ativo no filtro, se houver.
   *
   * Estes recortes -- gestão, marca, tempo de casa -- NÃO seguem o filtro de
   * área, e isso é de propósito: eles não identificam área nenhuma e servem
   * de referência da empresa inteira. Só que a tela não dizia isso. Com
   * PRODUCT filtrado, o bloco continuava mostrando "Betnacional 327 · Ambas
   * 122 · Betfair 36" -- 485 pessoas, a empresa toda -- enquanto Product tem
   * 41 respondentes. Quem rolasse até aqui leria "Gestores −14 pts" achando
   * que eram os gestores de Product.
   *
   * O número está certo; o que faltava era o rótulo dizer de quem ele é.
   */
  departamentoSelecionado?: string | null;
}) {
  const empresa = cuts.find((c) => c.cutType === 'company');
  const blocos = BLOCOS
    .map((b) => ({ ...b, rows: cuts.filter((c) => c.cutType === b.tipo) }))
    .filter((b) => b.rows.length > 0);

  if (!blocos.length || !empresa) return null;

  // A frase de leitura sai do próprio dado: o maior afastamento entre grupos
  // grandes o bastante para o afastamento significar alguma coisa.
  const destaque = cuts
    .filter((c) => c.cutType !== 'company' && c.cutType !== 'area' && !c.suprimido && c.enps != null && c.n >= 20)
    .sort((a, b) => (a.enps as number) - (b.enps as number))[0];

  return (
    <ChartCard
      title="Quem está mais distante da média"
      subtitle={`comparado com a empresa: eNPS ${empresa.enps}, risco ${fmt1(empresa.risco)}%`}
    >
      <AvisoForaDoFiltro
        departamento={departamentoSelecionado}
        motivo="Gestão, marca e tempo de casa são recortes da Flutter Brazil inteira — eles cortam a empresa por outro eixo e não identificam área, então servem de referência."
        escopo={`das ${empresa.n} pessoas da empresa`}
      />
      {destaque && (empresa.enps as number) - (destaque.enps as number) >= 8 && (
        <p className="text-sm leading-relaxed mb-3">
          <strong>{destaque.cutValue}</strong> está{' '}
          {(empresa.enps as number) - (destaque.enps as number)} pontos de eNPS abaixo da empresa,
          e são {destaque.n} pessoas. É um recorte que a leitura por área não mostra.
        </p>
      )}
      <div className="space-y-3">
        {blocos.map((b) => (
          <Bloco key={b.tipo} titulo={b.titulo} rows={b.rows} empresa={empresa} />
        ))}
      </div>
      <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
        A linha do meio de cada barra é a empresa. Verde é melhor que a média, âmbar é pior — vale
        para os dois lados, já que em risco de saída menor é melhor.
      </p>
    </ChartCard>
  );
}
