import { useMemo } from 'react';
import {
  CartesianGrid, LabelList, ResponsiveContainer, Scatter, ScatterChart,
  Tooltip, XAxis, YAxis,
} from 'recharts';
import { AlertTriangle, Crosshair } from 'lucide-react';
import ChartCard from '@/components/dashboard/ChartCard';
import { COLORS } from '@/lib/colors';
import { spearman } from '@/lib/stats';
import type { EngagementContextRow } from '@/lib/engagement-context';

/**
 * O risco declarado em janeiro virou saída de fevereiro a julho?
 *
 * POR QUE ESTE É O GRÁFICO MAIS IMPORTANTE DA ABA
 * Todo o resto da aba mostra o que as pessoas DISSERAM. Este é o único que
 * confronta o que elas disseram com o que fizeram. É o que decide se a pesquisa
 * é instrumento de gestão ou termômetro de humor -- e é a pergunta que a
 * liderança faz na primeira reunião: "isso aí prevê alguma coisa?".
 *
 * POR QUE SÓ SAÍDA VOLUNTÁRIA
 * Risco de retenção mede intenção de pedir demissão. Colocar contra ele o total
 * de saídas mediria também a decisão da empresa: uma área que passou por corte
 * apareceria como acerto da pesquisa sem a pesquisa ter acertado nada.
 * Ver engagement-context.ts.
 *
 * POR QUE O VEREDITO ESTATÍSTICO É TÃO GRANDE NA TELA
 * São 8 áreas. Com 8 pontos, ρ precisa passar de 0,74 para significar algo, e
 * quase nunca passa. Um scatter com uma nuvem inclinada convence qualquer
 * plateia -- inclusive quando não deveria. Como este painel vai para liderança,
 * gestor e RH ao mesmo tempo, a ressalva não pode ser nota de rodapé: ela é
 * parte do resultado, com o mesmo peso visual do coeficiente.
 */

/**
 * Abaixo de 5 pedidos de demissão no semestre, a taxa da área é ruído: em Legal,
 * uma única pessoa vale 11,8 pontos percentuais anualizados. Esses pontos
 * continuam no gráfico -- escondê-los seria escolher a amostra pelo resultado --
 * mas vazados, para que ninguém os leia com o mesmo peso de uma área grande.
 */
const N_MINIMO_CONFIAVEL = 5;

interface Ponto {
  x: number; y: number; nome: string; saidas: number; hc: number; fragil: boolean;
}

export default function RiskVsAttrition({
  rows,
  janela,
  meses,
  ressalvas,
}: {
  rows: EngagementContextRow[];
  janela: string;
  /** Meses observados. Entra na conta da anualização; hardcodar quebra em silêncio. */
  meses: number;
  ressalvas: string[];
}) {
  const { pontos, corr, calibracao } = useMemo(() => {
    const usaveis = rows.filter(
      (r) => r.dept && r.retentionRisk != null && r.atricaoVoluntariaAnual != null,
    );
    const p: Ponto[] = usaveis.map((r) => ({
      x: r.retentionRisk as number,
      y: r.atricaoVoluntariaAnual as number,
      nome: r.scope,
      saidas: r.saidasVoluntarias ?? 0,
      hc: r.headcountMedio ?? 0,
      fragil: (r.saidasVoluntarias ?? 0) < N_MINIMO_CONFIAVEL,
    }));

    // Calibração no agregado: o risco declarado sempre supera a saída real --
    // dizer que se pensa em sair custa nada, sair custa muito. O que importa
    // não é a diferença existir, é o TAMANHO dela, que dá o fator para
    // interpretar a próxima onda antes de ter os seis meses seguintes.
    const totalVol = usaveis.reduce((s, r) => s + (r.saidasVoluntarias ?? 0), 0);
    const totalHc = usaveis.reduce((s, r) => s + (r.headcountMedio ?? 0), 0);
    const observadaAgregada =
      totalHc > 0 && meses > 0
        ? Math.round((totalVol / totalHc) * (12 / meses) * 1000) / 10
        : null;
    const declaradaMedia = usaveis.length
      ? Math.round((usaveis.reduce((s, r) => s + (r.retentionRisk ?? 0), 0) / usaveis.length) * 10) / 10
      : null;

    return {
      pontos: p,
      corr: spearman(p.map((q) => [q.x, q.y])),
      calibracao: { observadaAgregada, declaradaMedia, totalVol, totalHc },
    };
  }, [rows, meses]);

  if (pontos.length < 4) {
    return (
      <ChartCard title="O risco declarado virou saída?" icon={Crosshair}>
        <p className="text-sm text-muted-foreground py-6 text-center">
          Ainda não há áreas suficientes com risco declarado e saídas observadas para montar
          esta comparação.
        </p>
      </ChartCard>
    );
  }

  // Áreas onde declarado e observado divergem muito são o que interessa contar
  // na reunião -- é onde a pesquisa errou, e o motivo do erro é sempre uma
  // informação nova sobre a área.
  const ordenadoPorRisco = [...pontos].sort((a, b) => b.x - a.x);
  const maiorRisco = ordenadoPorRisco[0];
  const maiorSaida = [...pontos].sort((a, b) => b.y - a.y)[0];

  return (
    <ChartCard
      title="O risco declarado virou saída?"
      subtitle={`risco em jan/2026 × saídas voluntárias em ${janela}`}
      icon={Crosshair}
    >
      <ResponsiveContainer width="100%" height={300}>
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
            label={{ value: 'Saída voluntária observada (% a.a.)', angle: -90, position: 'insideLeft', fontSize: 11 }}
          />
          <Tooltip
            cursor={{ strokeDasharray: '3 3' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as Ponto;
              return (
                <div className="rounded-md border border-border bg-popover p-2.5 text-xs shadow-md max-w-[250px]">
                  <div className="font-medium mb-1">{p.nome}</div>
                  <div className="text-muted-foreground">Declararam risco: {p.x}%</div>
                  <div className="text-muted-foreground">
                    Pediram demissão: {p.saidas} de ~{p.hc} ({p.y}% a.a.)
                  </div>
                  {p.fragil && (
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
          <Scatter name="≥5 saídas" data={pontos.filter((p) => !p.fragil)} fill={COLORS.flutter} fillOpacity={0.85}>
            <LabelList dataKey="nome" position="top" style={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
          </Scatter>
          <Scatter
            name="<5 saídas" data={pontos.filter((p) => p.fragil)}
            fill="transparent" stroke={COLORS.flutter} strokeWidth={1.6} strokeDasharray="2 2"
          >
            <LabelList dataKey="nome" position="top" style={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>

      <p className="text-[11px] text-muted-foreground -mt-1 leading-relaxed">
        Bolas cheias: áreas com {N_MINIMO_CONFIAVEL} ou mais pedidos de demissão no período — só{' '}
        {pontos.filter((p) => !p.fragil).length} de {pontos.length}. Nas vazadas, uma pessoa a mais
        ou a menos move o ponto vários pontos percentuais, então a altura delas diz pouco.
      </p>

      {/* O veredito vem antes de qualquer leitura substantiva, de propósito. */}
      <div
        className="rounded-md border p-3 mt-3"
        style={{
          borderColor: corr.significant ? `${COLORS.success}55` : `${COLORS.warning}55`,
          background: corr.significant ? `${COLORS.success}0f` : `${COLORS.warning}0f`,
        }}
      >
        <div className="flex items-start gap-2">
          <AlertTriangle
            className="h-4 w-4 mt-0.5 shrink-0"
            style={{ color: corr.significant ? COLORS.success : COLORS.warning }}
          />
          <div className="space-y-1">
            <p className="text-xs font-medium">
              {corr.significant
                ? 'A pesquisa antecipou as saídas'
                : 'Ainda não dá para testar se a pesquisa antecipa saídas'}
            </p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">{corr.verdict}</p>
            {!corr.significant && (
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                <strong>O que falta:</strong> foram {calibracao.totalVol} pedidos de demissão em{' '}
                {meses} meses, espalhados por {pontos.length} áreas. Com essa contagem, nenhum
                resultado aqui seria conclusivo — nem a favor, nem contra. A conta passa a ter força
                com uma janela de 12 meses ou com a segunda onda da pesquisa, o que vier primeiro.
              </p>
            )}
          </div>
        </div>
      </div>

      {calibracao.observadaAgregada != null && calibracao.declaradaMedia != null && (
        <div className="rounded-md border border-border p-3 mt-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
            Calibração — quanto a intenção supera o fato
          </p>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-2xl font-medium tabular-nums">{calibracao.declaradaMedia}%</span>
            <span className="text-xs text-muted-foreground">declararam risco</span>
            <span className="text-muted-foreground">→</span>
            <span className="text-2xl font-medium tabular-nums" style={{ color: COLORS.nsx }}>
              {calibracao.observadaAgregada}%
            </span>
            <span className="text-xs text-muted-foreground">
              pediram demissão de fato ({calibracao.totalVol} pessoas de ~{calibracao.totalHc}, anualizado)
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
            Dizer que se pensa em sair não custa nada; sair custa muito. Por isso a intenção sempre
            fica acima do fato — o número útil é o <strong>fator</strong> entre os dois, aqui cerca
            de {(calibracao.declaradaMedia / Math.max(calibracao.observadaAgregada, 0.1)).toFixed(1)}×.
            Guardado esse fator, a próxima onda dá uma estimativa de perda no mesmo dia em que
            fecha, sem esperar seis meses para conferir. Ele só vale de verdade depois de duas ou
            três ondas — com uma medição, é ponto de partida, não régua.
          </p>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-2 mt-2">
        <div className="rounded-md border border-border p-2.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            Maior risco declarado
          </p>
          <p className="text-sm font-medium">{maiorRisco.nome}</p>
          <p className="text-[11px] text-muted-foreground">
            {maiorRisco.x}% declararam · saíram {maiorRisco.saidas} por vontade própria ({maiorRisco.y}% a.a.)
          </p>
        </div>
        <div className="rounded-md border border-border p-2.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            Maior saída voluntária observada
          </p>
          <p className="text-sm font-medium">{maiorSaida.nome}</p>
          <p className="text-[11px] text-muted-foreground">
            {maiorSaida.y}% a.a. · tinha declarado {maiorSaida.x}% de risco
          </p>
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          <strong>Como ler:</strong> cada ponto é uma área. Quanto mais à direita, mais gente disse
          que pensava em sair. Quanto mais acima, mais gente de fato pediu demissão nos seis meses
          seguintes. Se a pesquisa previsse bem, os pontos formariam uma diagonal subindo.
          Só entram pedidos de demissão — desligamento pela empresa não testa a intenção de ninguém.
        </p>
        {ressalvas.map((r) => (
          <p key={r} className="text-[11px] text-muted-foreground leading-relaxed">• {r}</p>
        ))}
      </div>
    </ChartCard>
  );
}
