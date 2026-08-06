import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { COLORS } from '@/lib/colors';
import { mLabel } from '@/data/helpers';
import type { MonthRecord } from '@/data/raw-data';

/**
 * Visão reduzida do Overview quando há um recorte de dimensão ativo
 * (nível, tempo de casa ou vínculo).
 *
 * Por que uma visão à parte em vez de desabilitar pedaços do Overview normal:
 * sob esse recorte a maioria dos blocos deixa de ter valor exato (ver
 * series-filter.ts). Desativar metade dos cartões de uma tela desenhada para
 * estar cheia produz um layout esburacado que parece defeito. Uma tela menor,
 * que só mostra o que é verdade e diz o que ficou de fora, comunica melhor --
 * e não corre o risco de um cartão esquecido continuar exibindo número da
 * empresa inteira com o rótulo do recorte.
 */
export default function SeriesCutView({
  months,
  label,
  suppressed,
  brandColor,
}: {
  months: MonthRecord[];
  label: string;
  suppressed: string[];
  brandColor: string;
}) {
  const serie = useMemo(
    () =>
      months.map((m) => ({
        mes: mLabel(m.month),
        headcount: m.headcount,
        saidas: m.leavers,
        atricao: m.attrition_rate,
      })),
    [months],
  );

  const ultimo = months[months.length - 1];
  const primeiro = months[0];
  const totalSaidas = months.reduce((s, m) => s + (m.leavers || 0), 0);
  const hcMedio = months.length
    ? Math.round(months.reduce((s, m) => s + m.headcount, 0) / months.length)
    : 0;
  // Acumulado do período, mesma definição do resto do dashboard: total de
  // saídas sobre headcount médio -- não é a média das taxas mensais.
  const atricaoAcum = hcMedio > 0 ? Math.round((totalSaidas / hcMedio) * 1000) / 10 : 0;
  const variacao = primeiro && ultimo ? ultimo.headcount - primeiro.headcount : 0;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-muted/40 p-3 flex items-start gap-2.5">
        <Info className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
        <div className="space-y-1">
          <p className="text-sm">
            Recorte ativo: <Badge variant="secondary" className="text-[11px]">{label}</Badge>
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Sob este recorte só <strong>headcount</strong>, <strong>saídas</strong> e{' '}
            <strong>atrição</strong> têm valor exato — a série guarda a contagem por faixa, e as
            saídas vêm da base individual de desligados. Ficam de fora: {suppressed.join(', ')}.
            Esses números existem só no nível da empresa e do departamento; ratear por faixa daria
            uma precisão que o dado não tem.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Headcount atual', value: ultimo?.headcount ?? 0, note: mLabel(ultimo?.month ?? '') },
          {
            label: 'Variação no período',
            value: `${variacao >= 0 ? '+' : ''}${variacao}`,
            note: `desde ${mLabel(primeiro?.month ?? '')}`,
          },
          { label: 'Saídas no período', value: totalSaidas, note: 'contagem individual' },
          { label: 'Atrição acumulada', value: `${atricaoAcum}%`, note: `sobre HC médio de ${hcMedio}` },
        ].map((k) => (
          <Card key={k.label}>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground mb-1">{k.label}</p>
              <p className="text-2xl font-medium">{k.value}</p>
              <p className="text-[11px] text-muted-foreground">{k.note}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Headcount do recorte ao longo do tempo</CardTitle>
          <CardDescription className="text-xs">
            Contagem exata por mês, lida da distribuição que a série já guarda.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={serie} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="cutHc" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={brandColor} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={brandColor} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Area
                type="monotone"
                dataKey="headcount"
                name="Headcount"
                stroke={brandColor}
                strokeWidth={2}
                fill="url(#cutHc)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Saídas e atrição do recorte</CardTitle>
          <CardDescription className="text-xs">
            Saídas contadas pessoa a pessoa na base de desligados; atrição = saídas ÷ headcount do
            mês. Entradas não aparecem porque não há registro individual de admissão com esta
            dimensão.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={serie} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="l" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11 }} unit="%" />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="l" dataKey="saidas" name="Saídas" fill={COLORS.danger} radius={[3, 3, 0, 0]} />
              <Line
                yAxisId="r"
                type="monotone"
                dataKey="atricao"
                name="Atrição (%)"
                stroke={COLORS.warning}
                strokeWidth={2}
                dot={{ r: 2 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
