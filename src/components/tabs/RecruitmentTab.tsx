import { useEffect, useMemo, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Briefcase, Clock, Users, AlertTriangle, Snowflake } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getRecruitment, type RecruitmentData, type RecruitmentOpen } from '@/lib/recruitment.functions';
import { useDashboard } from '@/data/DashboardContext';

/**
 * Aba de Recrutamento (InHire).
 *
 * O InHire ja tem os proprios dashboards. Esta aba nao existe para copia-los --
 * existe para o que o InHire nao consegue fazer: cruzar o funil com o dado de
 * gente que ja esta neste dashboard (headcount e saidas por departamento).
 *
 * Tres honestidades ficam na tela, nao no rodape:
 *  - a data da foto (o InHire e tempo real; nos somos a ultima carga);
 *  - o inicio da medicao, vindo do servidor (antes dele "zero" seria mentira; a
 *    verdade e "nao medido"). DEPOIS dele, mes sem fechamento e zero de verdade
 *    -- por isso o eixo do grafico e continuo e preenche as lacunas;
 *  - que esta aba NAO responde ao filtro de ano do topo.
 */

const fmt1 = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

const monthLabel = (ym: string) => {
  const [y, m] = ym.slice(0, 7).split('-');
  return `${m}/${y.slice(2)}`;
};

export default function RecruitmentTab() {
  const [data, setData] = useState<RecruitmentData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fn = useServerFn(getRecruitment);
  const { data: months } = useDashboard();

  useEffect(() => {
    let alive = true;
    fn()
      .then((d) => alive && setData(d as RecruitmentData))
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'Falha ao carregar'));
    return () => {
      alive = false;
    };
  }, [fn]);

  const serie = useMemo(() => {
    if (!data?.seriesStart || !data.seriesEnd) return [];
    // Agrega os meses que TEM linha.
    const byMonth = new Map<string, { somaTth: number; fechadas: number }>();
    for (const r of data.monthly) {
      const k = r.month.slice(0, 7);
      const e = byMonth.get(k) ?? { somaTth: 0, fechadas: 0 };
      e.fechadas += r.closed_jobs;
      // Media ponderada pelo numero de vagas: cada departamento contribui com o
      // peso do que fechou, senao uma area com 1 vaga pesaria igual a uma com 10.
      if (r.tth_avg != null) e.somaTth += Number(r.tth_avg) * r.closed_jobs;
      byMonth.set(k, e);
    }

    // EIXO CONTINUO. Sem isto, meses sem fechamento simplesmente somem e os que
    // sobram sao desenhados lado a lado -- Finance fecha em 01, 03, 04 e 07/26, e
    // o grafico mostraria os quatro grudados como se fossem consecutivos, com a
    // linha de TTH ligando janeiro a marco. Depois do inicio da medicao, mes sem
    // fechamento e ZERO de verdade, entao entra como zero.
    const out: Array<{ mes: string; fechadas: number; tth: number | null }> = [];
    const [y0, m0] = data.seriesStart.slice(0, 7).split('-').map(Number);
    const [y1, m1] = data.seriesEnd.slice(0, 7).split('-').map(Number);
    for (let y = y0, m = m0; y < y1 || (y === y1 && m <= m1); m === 12 ? ((y += 1), (m = 1)) : (m += 1)) {
      const k = `${y}-${String(m).padStart(2, '0')}`;
      const e = byMonth.get(k);
      out.push({
        mes: monthLabel(k),
        fechadas: e?.fechadas ?? 0,
        // TTH so existe se houve fechamento. null vira buraco na linha, nao zero:
        // "nao fechamos nada" nao e "fechamos em 0 dias".
        tth: e && e.fechadas ? Math.round(e.somaTth / e.fechadas) : null,
      });
    }
    return out;
  }, [data]);

  const porDepto = useMemo(() => {
    if (!data) return [];
    const m = new Map<string, { dept: string; fechadas: number; somaTth: number; cand: number }>();
    for (const r of data.monthly) {
      const e = m.get(r.department) ?? { dept: r.department, fechadas: 0, somaTth: 0, cand: 0 };
      e.fechadas += r.closed_jobs;
      if (r.tth_avg != null) e.somaTth += Number(r.tth_avg) * r.closed_jobs;
      e.cand += r.applications;
      m.set(r.department, e);
    }
    return [...m.values()]
      .map((e) => ({
        dept: e.dept,
        fechadas: e.fechadas,
        tth: e.fechadas ? Math.round(e.somaTth / e.fechadas) : null,
        cand: e.cand,
        porVaga: e.fechadas ? Math.round(e.cand / e.fechadas) : 0,
      }))
      .sort((a, b) => (b.tth ?? 0) - (a.tth ?? 0));
  }, [data]);

  const abertas = useMemo(() => {
    if (!data) return { jobs: 0, positions: 0, congeladas: 0, envelhecidas: [] as RecruitmentOpen[] };
    const ab = data.open.filter((o) => o.status === 'Aberta');
    const cg = data.open.filter((o) => o.status === 'Congelada');
    return {
      jobs: ab.reduce((s, o) => s + o.jobs, 0),
      positions: ab.reduce((s, o) => s + o.positions, 0),
      congeladas: cg.reduce((s, o) => s + o.jobs, 0),
      envelhecidas: [...data.open].sort((a, b) => (b.avg_age_days ?? 0) - (a.avg_age_days ?? 0)).slice(0, 4),
    };
  }, [data]);

  // O cruzamento que so existe aqui: quanto o time contratou contra quanto ele
  // perdeu, no mesmo periodo e no mesmo departamento.
  const cruzamento = useMemo(() => {
    if (!data || !months?.length) return [];
    const inicio = data.seriesStart?.slice(0, 7) ?? '';
    // Headcount do MES MAIS RECENTE de cada departamento (o loop e ordenado, entao
    // a ultima escrita vence). Denominador do esforco de contratacao.
    const hcPorDepto = new Map<string, number>();
    for (const m of months) {
      if (m.brand !== 'NSX' || m.month < inicio) continue;
      for (const [dept, d] of Object.entries(m.dept_data ?? {})) {
        hcPorDepto.set(dept, (d as { hc: number }).hc);
      }
    }
    return porDepto
      .filter((r) => hcPorDepto.has(r.dept))
      .map((r) => ({
        dept: r.dept,
        fechadas: r.fechadas,
        hc: hcPorDepto.get(r.dept)!,
        intensidade: Math.round((r.fechadas / hcPorDepto.get(r.dept)!) * 1000) / 10,
      }))
      .sort((a, b) => b.intensidade - a.intensidade);
  }, [data, months, porDepto]);

  if (error) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-destructive flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" /> {error}
        </CardContent>
      </Card>
    );
  }
  if (!data) {
    return <Card><CardContent className="p-6 text-sm text-muted-foreground">Carregando…</CardContent></Card>;
  }

  const totalFechadas = porDepto.reduce((s, r) => s + r.fechadas, 0);
  const tthGeral = totalFechadas
    ? Math.round(porDepto.reduce((s, r) => s + (r.tth ?? 0) * r.fechadas, 0) / totalFechadas)
    : null;

  const desde = data.seriesStart ? monthLabel(data.seriesStart) : '—';

  // Escopo sem nenhuma vaga: dizer isso e diferente de desenhar zeros. Zero num
  // grafico parece medicao; a verdade e que nao ha o que medir aqui.
  if (totalFechadas === 0 && abertas.jobs === 0 && abertas.congeladas === 0) {
    return (
      <Card>
        <CardContent className="p-6 space-y-2">
          <p className="text-sm font-medium">Nenhuma vaga no seu escopo</p>
          <p className="text-sm text-muted-foreground">
            {data.scopeDepartments.length > 0
              ? `Não há vagas abertas nem fechadas em ${data.scopeDepartments.join(', ')} desde ${desde}, que é quando o ATS passou a registrar fechamentos.`
              : `Não há vagas registradas desde ${desde}.`}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Honestidade de origem, no topo e nao no rodape. */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="secondary" className="text-[10px]">InHire</Badge>
        <span>
          Foto de {data.asOf ? new Date(data.asOf + 'T12:00').toLocaleDateString('pt-BR') : '—'} — o
          painel do InHire é tempo real; este é a última carga, então pequenas diferenças entre os
          dois são esperadas. Esta aba mostra sempre o período completo desde {desde} e{' '}
          <strong>não responde ao filtro de ano</strong> do topo.
        </span>
        {!data.global && data.scopeDepartments.length > 0 && (
          <Badge variant="outline" className="text-[10px]">
            escopo: {data.scopeDepartments.join(', ')}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Vagas abertas', value: abertas.jobs, icon: Briefcase, note: `${abertas.positions} posições` },
          // "fora do SLA" lia como "estourou o prazo". Congelada é o oposto: o
          // relógio para, por decisão. A cadeira segue vazia — daí o alerta.
          { label: 'Congeladas', value: abertas.congeladas, icon: Snowflake, note: 'relógio parado' },
          { label: 'Fechadas no período', value: totalFechadas, icon: Briefcase, note: `desde ${desde}` },
          { label: 'TTH médio', value: tthGeral == null ? '—' : `${tthGeral}d`, icon: Clock, note: 'dias ativos' },
          {
            label: 'Candidaturas',
            value: porDepto.reduce((s, r) => s + r.cand, 0).toLocaleString('pt-BR'),
            icon: Users,
            note: 'nas vagas reais',
          },
        ].map((k) => (
          <Card key={k.label}>
            <CardContent className="p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <k.icon className="h-3.5 w-3.5" />
                {k.label}
              </div>
              <p className="text-2xl font-medium">{k.value}</p>
              <p className="text-[11px] text-muted-foreground">{k.note}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Fechamentos e tempo de contratação</CardTitle>
          <CardDescription className="text-xs">
            Barras = vagas fechadas no mês. Linha = TTH médio em dias ativos, já descontados os
            períodos em que a vaga esteve congelada ou cancelada.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={serie} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="l" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11 }} unit="d" />
              <Tooltip
                contentStyle={{ fontSize: 12 }}
                formatter={(v, n) => [n === 'tth' ? `${v} dias` : v, n === 'tth' ? 'TTH médio' : 'Fechadas']}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="l" dataKey="fechadas" name="Vagas fechadas" fill="hsl(var(--chart-1))" radius={[3, 3, 0, 0]} />
              <Line yAxisId="r" type="monotone" dataKey="tth" name="TTH médio (dias)" stroke="hsl(var(--chart-3))" strokeWidth={2} dot={{ r: 2 }} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Tempo de contratação por área</CardTitle>
            <CardDescription className="text-xs">
              Da mais lenta para a mais rápida. Candidaturas por vaga ajuda a ler o número: poucas
              candidaturas e TTH alto costuma ser dificuldade de atração, não de processo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5 text-sm">
              <div className="grid grid-cols-12 gap-2 text-[11px] text-muted-foreground pb-1 border-b border-border">
                <span className="col-span-5">Área</span>
                <span className="col-span-2 text-right">Fechadas</span>
                <span className="col-span-2 text-right">TTH</span>
                <span className="col-span-3 text-right">Cand./vaga</span>
              </div>
              {porDepto.map((r) => (
                <div key={r.dept} className="grid grid-cols-12 gap-2 items-center py-0.5">
                  <span className="col-span-5 truncate text-xs flex items-center gap-1">
                    {r.dept}
                    {/* Amostra pequena no topo de um ranking engana: 3 vagas nao
                        sustentam "a area mais lenta". Marcar e mais honesto que
                        esconder a linha. */}
                    {r.fechadas < 5 && (
                      <span className="text-[10px] text-muted-foreground" title="Poucas vagas: média instável">
                        n baixo
                      </span>
                    )}
                  </span>
                  <span className="col-span-2 text-right text-xs text-muted-foreground">{r.fechadas}</span>
                  <span className="col-span-2 text-right text-xs font-medium">
                    {r.tth == null ? '—' : `${r.tth}d`}
                  </span>
                  <span className="col-span-3 text-right text-xs text-muted-foreground">{r.porVaga}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Intensidade de contratação</CardTitle>
            <CardDescription className="text-xs">
              Vagas fechadas desde {desde} como % do headcount <em>atual</em> da área — o cruzamento
              que o InHire não faz, porque ele não conhece o seu quadro. Atenção: é um fluxo de
              vários meses dividido por uma foto de hoje, então serve para comparar áreas entre si,
              não como taxa de um período.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {cruzamento.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Sem sobreposição entre as áreas do InHire e os departamentos do quadro.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={cruzamento} layout="vertical" margin={{ left: 8, right: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} unit="%" />
                  <YAxis type="category" dataKey="dept" width={110} tick={{ fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ fontSize: 12 }}
                    formatter={(v, _n, p) => [
                      `${fmt1(Number(v))}% — ${p.payload.fechadas} vagas para ${p.payload.hc} pessoas`,
                      'Intensidade',
                    ]}
                  />
                  <Bar dataKey="intensidade" fill="hsl(var(--chart-2))" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Vagas que estão envelhecendo</CardTitle>
          <CardDescription className="text-xs">
            Idade média em dias ativos das vagas ainda abertas ou congeladas. Congelada não corre
            SLA — mas continua sendo uma cadeira vazia.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {abertas.envelhecidas.map((o: RecruitmentOpen) => (
              <div
                key={`${o.department}-${o.status}`}
                className="rounded-lg border border-border p-2.5 min-w-[150px]"
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium">{o.department}</span>
                  <Badge
                    variant={o.status === 'Congelada' ? 'outline' : 'secondary'}
                    className="text-[10px]"
                  >
                    {o.status}
                  </Badge>
                </div>
                <p className="text-xl font-medium mt-0.5">{o.avg_age_days ?? '—'}d</p>
                <p className="text-[11px] text-muted-foreground">
                  {o.jobs} vaga{o.jobs > 1 ? 's' : ''} · {o.applications} candidaturas
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        <strong>Como o TTH é calculado:</strong> dias corridos entre a abertura e o fechamento,
        descontados os períodos em que a vaga esteve congelada ou cancelada — a regra da aba
        Diretrizes do InHire. O campo <code>sla</code> da API do InHire está vazio, então o número é
        reconstruído do histórico de status. Excluídos: talent pools e 5 vagas fechadas no mesmo dia
        da abertura (1 candidatura cada, não são processos reais). O ATS só registra fechamento
        desde {desde} — antes disso não há medição, e não é zero. Depois disso, mês sem barra é
        zero de verdade.
      </p>
    </div>
  );
}
