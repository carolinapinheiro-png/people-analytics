import { useMemo } from 'react';
import {
  Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts';
import { EyeOff, Layers3, Users2 } from 'lucide-react';
import ChartCard from '@/components/dashboard/ChartCard';
import { COLORS } from '@/lib/colors';
import type { SurveyCut } from '@/lib/survey.functions';

/**
 * Recortes que só existem depois de ler o export bruto: gestor vs contribuidor,
 * marca e tempo de casa.
 *
 * POR QUE CADA UM ESTÁ AQUI
 *
 * GESTOR vs CONTRIBUIDOR contradiz a expectativa: gestores costumam ser o grupo
 * mais engajado de qualquer empresa, porque têm mais contexto e mais autonomia.
 * Aqui é o contrário. Isso é um achado sobre a camada de liderança intermediária
 * e vale mais que qualquer média geral da tela.
 *
 * MARCA separa quem atua em uma marca de quem atua nas duas. É a única
 * dimensão do painel que fala sobre desenho organizacional em vez de área.
 *
 * TEMPO DE CASA é o único recorte que conecta esta aba à de onboarding: se o
 * risco sobe numa faixa específica de meses, a janela de intervenção é
 * conhecida e curta.
 *
 * ------------------------------------------------------------------
 * SIGILO
 * ------------------------------------------------------------------
 * O servidor esconde a NOTA de recortes com menos de 5 respostas antes de
 * mandar (ver survey.functions.ts) -- aqui só chega null. O n continua real e
 * continua na tela: sumir com a linha faria a pessoa concluir que o grupo não
 * respondeu, e perguntar o número por fora, que é justamente o caminho sem
 * controle nenhum.
 */

const fmt = (n: number | null | undefined) =>
  n == null ? '—' : Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 1 });

interface Bloco {
  tipo: string;
  titulo: string;
  subtitulo: string;
  leitura?: (rows: SurveyCut[]) => React.ReactNode;
}

const BLOCOS: Bloco[] = [
  {
    tipo: 'funcao',
    titulo: 'Gestores e contribuidores individuais',
    subtitulo: 'quem lidera pessoas contra quem não lidera',
    leitura: (rows) => {
      const g = rows.find((r) => r.cutValue.startsWith('Gestor'));
      const c = rows.find((r) => r.cutValue.startsWith('Contribuidor'));
      if (!g?.enps || !c?.enps || g.risco == null || c.risco == null) return null;
      const dEnps = g.enps - c.enps;
      if (dEnps >= 0) {
        return (
          <>
            Gestores estão {dEnps} pontos acima dos contribuidores em eNPS — o padrão esperado, já
            que costumam ter mais contexto e mais autonomia.
          </>
        );
      }
      return (
        <>
          Gestores estão <strong>{Math.abs(dEnps)} pontos abaixo</strong> dos contribuidores
          ({g.enps} contra {c.enps}) e declaram mais risco de sair ({fmt(g.risco)}% contra{' '}
          {fmt(c.risco)}%). É o inverso do padrão: normalmente quem lidera tem mais contexto e
          aparece mais engajado. Quando inverte, costuma ser carga de gestão sem apoio, ou clareza
          de estratégia que não desce. Vale ouvir os {g.n} gestores antes de concluir qual dos dois.
        </>
      );
    },
  },
  {
    tipo: 'marca',
    titulo: 'Por marca',
    subtitulo: 'Betnacional, Betfair e quem atua nas duas',
    leitura: (rows) => {
      const ambas = rows.find((r) => r.cutValue === 'Ambas');
      const outras = rows.filter((r) => r.cutValue !== 'Ambas' && r.enps != null);
      if (!ambas?.enps || !outras.length) return null;
      const melhor = outras.reduce((a, b) => ((b.enps ?? 0) > (a.enps ?? 0) ? b : a));
      const dif = (melhor.enps ?? 0) - ambas.enps;
      if (dif < 5) return null;
      return (
        <>
          Quem atua <strong>nas duas marcas</strong> tem eNPS {ambas.enps}, {dif} pontos abaixo de{' '}
          {melhor.cutValue} ({melhor.enps}), e é o maior grupo depois de Betnacional ({ambas.n}{' '}
          pessoas). Papel cross-brand costuma significar dois conjuntos de prioridades e dois
          fóruns de decisão — o custo aparece antes no engajamento do que na entrega.
        </>
      );
    },
  },
  {
    tipo: 'tempo',
    titulo: 'Por tempo de casa',
    subtitulo: 'a curva de quem entrou quando',
    leitura: (rows) => {
      const comRisco = rows.filter((r) => r.risco != null);
      if (comRisco.length < 3) return null;
      const pior = comRisco.reduce((a, b) => ((b.risco ?? 0) > (a.risco ?? 0) ? b : a));
      return (
        <>
          O risco de saída pica em <strong>{pior.cutValue}</strong> ({fmt(pior.risco)}%, n={pior.n}).
          Faixa de tempo é a única dimensão desta aba com janela de ação conhecida: dá para agir
          antes de a pessoa chegar nela. Vale cruzar com a aba de Onboarding, que mede a mesma
          população nas primeiras semanas.
        </>
      );
    },
  },
];

function BlocoRecorte({ bloco, rows }: { bloco: Bloco; rows: SurveyCut[] }) {
  const dados = useMemo(
    () => rows.map((r) => ({
      nome: r.cutValue,
      eNPS: r.enps,
      risco: r.risco,
      n: r.n,
      suprimido: r.suprimido,
    })),
    [rows],
  );
  if (!dados.length) return null;

  const ocultos = dados.filter((d) => d.suprimido);
  const leitura = bloco.leitura?.(rows);

  return (
    <ChartCard title={bloco.titulo} subtitle={bloco.subtitulo} icon={Users2}>
      <ResponsiveContainer width="100%" height={Math.max(190, dados.length * 34 + 60)}>
        <ComposedChart data={dados} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" horizontal={false} />
          <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
          <YAxis type="category" dataKey="nome" width={135} tick={{ fontSize: 11 }} />
          <Tooltip
            contentStyle={{ fontSize: 12 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as (typeof dados)[number];
              return (
                <div className="rounded-md border border-border bg-popover p-2.5 text-xs shadow-md max-w-[230px]">
                  <div className="font-medium mb-1">{d.nome}</div>
                  <div className="text-muted-foreground">{d.n} respostas</div>
                  {d.suprimido ? (
                    <div className="mt-1 text-[11px]" style={{ color: COLORS.warning }}>
                      Nota não exibida: menos de 5 respostas.
                    </div>
                  ) : (
                    <>
                      <div className="text-muted-foreground">eNPS {fmt(d.eNPS)}</div>
                      <div className="text-muted-foreground">Risco de saída {fmt(d.risco)}%</div>
                    </>
                  )}
                </div>
              );
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="eNPS" name="eNPS" fill={COLORS.flutter} radius={[0, 3, 3, 0]} barSize={14} />
          <Line
            dataKey="risco" name="Risco de saída (%)" stroke={COLORS.warning}
            strokeWidth={2} dot={{ r: 3 }} legendType="line"
          />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
        {dados.map((d) => (
          <span key={d.nome} className="text-[11px] text-muted-foreground">
            {d.nome}: <strong className="text-foreground">n={d.n}</strong>
            {d.suprimido && ' · nota oculta'}
          </span>
        ))}
      </div>

      {leitura && (
        <p className="text-[11px] text-muted-foreground mt-2.5 leading-relaxed">{leitura}</p>
      )}

      {ocultos.length > 0 && (
        <p className="text-[11px] mt-2 flex items-start gap-1.5" style={{ color: COLORS.warning }}>
          <EyeOff className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            {ocultos.length === 1 ? 'Um recorte tem' : `${ocultos.length} recortes têm`} menos de 5
            respostas e {ocultos.length === 1 ? 'está' : 'estão'} com a nota oculta. Em grupo desse
            tamanho, o resultado apontaria para pessoas específicas — e uma pesquisa anônima que
            deixa de ser anônima deixa de ser respondida com honestidade na onda seguinte.
          </span>
        </p>
      )}
    </ChartCard>
  );
}

export default function SurveyCuts({ cuts }: { cuts: SurveyCut[] }) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-muted/40 p-3 flex items-start gap-2.5">
        <Layers3 className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          Estes recortes vêm da leitura do arquivo original da pesquisa, não do deck — por isso cada
          um traz o <strong>n</strong>. Ler eNPS sem saber quantas pessoas responderam é o erro mais
          comum aqui: numa área de 15, uma pessoa move o número em 7 pontos.
        </p>
      </div>
      {BLOCOS.map((b) => {
        const rows = cuts.filter((c) => c.cutType === b.tipo);
        return rows.length ? <BlocoRecorte key={b.tipo} bloco={b} rows={rows} /> : null;
      })}
    </div>
  );
}
