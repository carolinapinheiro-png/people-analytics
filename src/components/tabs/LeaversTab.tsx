import { useDashboard, applyDeptFilter } from '@/data/DashboardContext';
import { getAllMonthsForBrand } from '@/data/helpers';
import { LeaverRecord } from '@/data/leaver-types';
import { fmt, fmtC, mLabel } from '@/data/helpers';
import KpiCard from '@/components/dashboard/KpiCard';
import ChartCard from '@/components/dashboard/ChartCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { COLORS } from '@/lib/colors';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, PieChart, Pie, Cell
} from 'recharts';
import {
  Users,
  DollarSign,
  Clock,
  LogOut,
  TrendingUp,
  Briefcase,
  AlertTriangle,
  UserX,
  BarChart3,
  Search,
  UserMinus,
  Hourglass,
  EyeOff,
} from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { getCompAggregates, type CompAggregates } from '@/lib/comp.functions';
import { usePeriodo } from '@/data/use-periodo';
import FreshnessBadge from '@/components/dashboard/FreshnessBadge';
import { passaFiltro } from '@/lib/filtro-sentinela';
import Delta from '@/components/dashboard/Delta';
import {
  taxaDoPeriodo, deltaPP, deslocarMeses, mesesDoAnoAte, ultimos12,
  mediana, mesesDeCasaValidos, turnoverPrecoce,
} from '@/lib/desligamentos-kpis';

import { tx } from '@/lib/i18n';
const BRAND_COLORS: Record<string, string> = {
  combined: COLORS.flutter,
  NSX: COLORS.nsx,
  'Betfair BR': COLORS.betfair,
  'Flutter International': COLORS.flutter,
  Porto: COLORS.flutter,
};

const SALARY_BAND_ORDER = ['Até 3k', '3k-5k', '5k-8k', '8k-12k', '12k-20k', '20k-50k', '50k+'];
const TENURE_ORDER = ['0-3 meses', '3-6 meses', '6-12 meses', '1-2 anos', '2-5 anos', '5+ anos'];
const LEVEL_ORDER = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L8'];

const PIE_COLORS = [COLORS.flutter, COLORS.nsx, COLORS.betfair, COLORS.purple, COLORS.orange, COLORS.danger, COLORS.success];

function countBy(records: LeaverRecord[], key: keyof LeaverRecord, order?: string[]) {
  const counts = new Map<string, number>();
  records.forEach(r => {
    const val = String(r[key] || 'Não informado');
    counts.set(val, (counts.get(val) || 0) + 1);
  });
  const entries = Array.from(counts.entries()).map(([name, value]) => ({ name, value }));
  if (order) {
    const orderMap = new Map(order.map((o, i) => [o, i]));
    entries.sort((a, b) => (orderMap.get(a.name) ?? 999) - (orderMap.get(b.name) ?? 999));
  } else {
    entries.sort((a, b) => b.value - a.value);
  }
  return entries;
}

function avgSalary(records: LeaverRecord[]): number {
  const valid = records.filter(r => r.salario > 0);
  return valid.length > 0 ? valid.reduce((sum, r) => sum + r.salario, 0) / valid.length : 0;
}

const pctFmt = (n: number | null | undefined, casas = 1) => (n == null ? '—' : `${n.toFixed(casas)}%`);

export default function LeaversTab() {
  // Mês, trimestre e ano são GLOBAIS (TopBar) -- `usePeriodo()` resolve os
  // três de uma vez (ver `src/lib/periodo.ts`), mesma régua que o resto do
  // painel usa.
  const {
    leavers, filters, brand, currentMonth, currentData, serieTodosOsAnos, data, filteredDeptKey,
    janelaDeslig, metricaDeslig: modo,
  } = useDashboard();
  const periodo = usePeriodo();
  const brandColor = BRAND_COLORS[brand] || COLORS.flutter;
  const [searchTerm, setSearchTerm] = useState('');
  // Janela e métrica vêm da barra de filtros (ver FilterBar) e valem para a
  // aba inteira: cartões, quadros e evolução mensal. Até 21/09 eram botões
  // no meio da aba que só mexiam nos quadros de distribuição -- e a tela
  // mostrava duas populações, com um aviso explicando qual era qual.

  // Ativos por faixa salarial (snapshot atual, agregado leve) -> denominador da
  // taxa de atricao por faixa (#23). Company-wide, coerente com a lista de
  // desligados (que nao e por marca).
  //
  // O DENOMINADOR PODE FALTAR, E ISSO PRECISA APARECER
  //
  // Quantos ativos ha em cada faixa salarial e informacao de salario, mesmo
  // agregada -- entao vem de `getCompAggregates` e continua exigindo a aba
  // Compensation. Decisao de 18/08/2026.
  //
  // O problema nao era esse. Era que, sem o denominador, o grafico continuava
  // desenhado e o tooltip trocava de significado em silencio: "12 · 4,3% dos
  // 280 ativos na faixa" virava "12 · 9% do total". Duas frases parecidas, duas
  // contas diferentes, nada dizendo que mudou. Quem le uma vez por mes nao
  // percebe -- so acha que o numero mexeu.
  //
  // Agora o estado e explicito e o subtitulo do quadro conta qual conta esta
  // sendo feita.
  const [comp, setComp] = useState<CompAggregates | null>(null);
  const [semAcesso, setSemAcesso] = useState(false);
  const fetchComp = useServerFn(getCompAggregates);
  useEffect(() => {
    let cancelled = false;
    fetchComp({ data: { department: filters.departamento } })
      .then((d) => { if (!cancelled) setComp(d as CompAggregates); })
      .catch((e: unknown) => {
        // Recusa por perfil e um fato sobre o acesso, nao uma falha. As duas
        // pedem frases diferentes: uma se resolve com o admin, a outra com o
        // suporte.
        const msg = e instanceof Error ? e.message : '';
        if (!cancelled) setSemAcesso(/forbidden|acesso a esta se/i.test(msg));
      });
    return () => { cancelled = true; };
    // Sem `filters.departamento` na lista, a chamada acontecia uma vez e o
    // cartão ficava com os agregados da primeira renderização -- os da empresa
    // -- enquanto o resto da tela já estava recortado.
  }, [fetchComp, filters.departamento]);
  const activeByBand = useMemo(() => {
    const acc: Record<string, number> = {};
    comp?.bands.forEach((b) => { acc[b.band] = (acc[b.band] ?? 0) + b.n; });
    return acc;
  }, [comp]);
  // O que o subtitulo promete tem que ser o que o tooltip faz.
  //
  // Ligar isto a "a chamada deu certo" nao basta: um perfil com Compensation
  // concedida mas sem a camada N importada recebe a resposta com `bands` vazio.
  // A chamada foi bem-sucedida e mesmo assim nao ha denominador -- o subtitulo
  // prometeria uma taxa que o tooltip nao tem como calcular.
  const temDenominador = Object.keys(activeByBand).length > 0;

  // ------------------------------------------------------------------
  // O PERÍODO DO TOPO RECORTA A LISTA, NÃO SÓ O ANO
  // ------------------------------------------------------------------
  // Até 15/09 aqui só passava o ano: escolher "julho" no topo mudava os
  // cartões que vêm da série e deixava a lista, os gráficos e os KPIs com o
  // ano inteiro. Duas populações na mesma tela, sem nada dizendo qual era
  // qual. `mes_desligamento` é 'AAAA-MM', então o mesmo período que recorta a
  // série recorta a lista -- ver `src/lib/periodo.ts`.
  // ------------------------------------------------------------------
  // O FILTRO NÃO-TEMPORAL, SEPARADO DO RECORTE DE PERÍODO
  // ------------------------------------------------------------------
  // Departamento, job family, contrato etc. são os mesmos para a lista (que
  // usa `periodo.contem`, período exato) e para a tendência mensal logo
  // abaixo (que usa `periodo.ateOFim`, história até o fim do período -- um
  // gráfico cortado a um único mês deixa de ser gráfico). Escrito uma vez só,
  // para as duas leituras nunca divergirem no critério que não é de tempo.
  const passaOutrosFiltros = (r: LeaverRecord) => {
    // A MARCA DO TOPO TAMBÉM RECORTA A LISTA
    //
    // Até 21/09 a lista era sempre a da empresa inteira, e a taxa vinha da
    // série DA MARCA: com "NSX" no topo, "Total desligados" contava Betfair
    // e International, e a atrição dividia saídas de uma população pelo HC
    // de outra. `marca` vem de `convenia_leavers` com os mesmos valores do
    // `brand` (ver `fontes.ts`).
    if (brand !== 'combined' && r.marca !== brand) return false;
    if (!passaFiltro(filters.departamento, r.departamento)) return false;
    if (!passaFiltro(filters.jobFamily, r.job_family)) return false;
    if (!passaFiltro(filters.tempoCasa, r.tempo_casa_faixa)) return false;
    if (!passaFiltro(filters.tipoContrato, r.vinculo)) return false;
    if (!passaFiltro(filters.faixaSalarial, r.faixa_salarial)) return false;
    if (!passaFiltro(filters.tipoDesligamento, r.tipo_desligamento_agrupado)) return false;
    if (!passaFiltro(filters.level, r.level)) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        r.nome.toLowerCase().includes(term) ||
        r.cargo.toLowerCase().includes(term) ||
        r.departamento.toLowerCase().includes(term)
      );
    }
    return true;
  };

  // ------------------------------------------------------------------
  // O ESCOPO DE MESES DA ABA
  // ------------------------------------------------------------------
  // Mês/trimestre do topo, ou os 12 meses que terminam nele. `null` = todos
  // os meses ("Todos os anos" no topo, sem janela de 12 meses).
  const usaLtm = janelaDeslig === 'ltm';
  const fimDoPeriodo = (periodo.tipo !== 'todos' ? periodo.meses[periodo.meses.length - 1] : undefined) ?? currentMonth;
  const chaveEscopo = usaLtm ? `ltm:${fimDoPeriodo}` : periodo.tipo === 'todos' ? 'todos' : periodo.meses.join();
  const mesesEscopo = useMemo<string[] | null>(
    () => (usaLtm ? ultimos12(fimDoPeriodo) : periodo.tipo === 'todos' ? null : periodo.meses),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chaveEscopo],
  );
  const escopoSet = useMemo(() => (mesesEscopo ? new Set(mesesEscopo) : null), [mesesEscopo]);
  const noEscopo = (ym: string | null | undefined) => (escopoSet ? escopoSet.has(String(ym ?? '')) : true);
  const temPeriodo = mesesEscopo != null;
  const rotuloEscopo = usaLtm ? `12 meses até ${mLabel(fimDoPeriodo)}` : periodo.label;

  const filteredLeavers = useMemo(() => {
    return leavers.filter(r => noEscopo(r.mes_desligamento) && passaOutrosFiltros(r));
  }, [leavers, filters, searchTerm, escopoSet, brand]);

  const mesesAtuais = mesesEscopo ?? serieTodosOsAnos.filter((d) => (d.headcount || 0) > 0).map((d) => d.month);
  const mesesAnteriores = mesesEscopo ? deslocarMeses(mesesEscopo, -mesesEscopo.length) : [];
  const nomeAnterior = usaLtm ? 'os 12 meses anteriores' : periodo.tipo === 'trimestre' ? 'o trimestre anterior' : 'o mês anterior';

  // Os quadros usam a mesma população dos cartões.
  const distLeavers = filteredLeavers;

  const totalLeavers = filteredLeavers.length;
  const involuntary = filteredLeavers.filter(r => r.tipo_desligamento_agrupado === 'Involuntário').length;
  const voluntary = filteredLeavers.filter(r => r.tipo_desligamento_agrupado === 'Voluntário').length;
  const pctTot = (v: number) => (totalLeavers > 0 ? (v / totalLeavers) * 100 : 0);
  const totalDist = totalLeavers;
  const pctDist = pctTot;

  const mesesCasa = mesesDeCasaValidos(filteredLeavers.map(r => r.tempo_casa_dias));
  const tenureMedia = mesesCasa.length ? mesesCasa.reduce((a, b) => a + b, 0) / mesesCasa.length : null;
  const tenureMediana = mediana(mesesCasa);
  const precoce = turnoverPrecoce(filteredLeavers.map(r => r.tempo_casa_dias));

  // Mesmos filtros, período anterior -- só a contagem, para o delta do total.
  const totalAnterior = useMemo(() => {
    if (!temPeriodo) return null;
    const alvo = new Set(mesesAnteriores);
    return leavers.filter(r => alvo.has(r.mes_desligamento) && passaOutrosFiltros(r)).length;
  }, [temPeriodo, mesesAnteriores.join(), leavers, filters, searchTerm, brand]);

  // O perfil sem acesso a dado individual recebe a lista com o nome trocado
  // por "Confidencial" (o mascaramento é no servidor -- ver listLeavers). Sem
  // dizer isso na tela, a coluna de nomes parece um defeito.
  const nomesOcultos = leavers.length > 0 && leavers.every(r => r.nome === 'Confidencial');

  // Denominadores de ATIVOS para o "% sobre o HC" (significancia relativa: uma
  // area pequena com poucas saidas pode pesar mais que uma grande). HC atual do
  // depto (dept_data) e do nivel (level_base) da serie reconstruida.
  const deptHC: Record<string, number> = {};
  for (const [k, v] of Object.entries(currentData?.dept_data || {})) deptHC[k.toUpperCase().trim()] = v.hc;
  const levelHC = (currentData?.level_base || {}) as Record<string, number>;
  // HC por faixa de tempo de casa no mês de referência -- a série grava com
  // os MESMOS rótulos de `tempo_casa_faixa` ('0-3 meses', '1-2 anos'...).
  const tenureHC = (currentData?.tenure_base || {}) as Record<string, number>;
  // Tipo e motivo não têm grupo de ativos próprio: a base é o HC médio do
  // período inteiro, a mesma do cartão de atrição voluntária.
  const hcTotal = taxaDoPeriodo(serieTodosOsAnos, mesesAtuais)?.hcMedio ?? 0;

  const addShare = (rows: { name: string; value: number }[]) =>
    rows.map(d => ({ ...d, pctTot: pctDist(d.value) }));
  // `pctHC` é a taxa sobre os ativos do grupo HOJE (snapshot). Na janela de
  // 12 meses isso é uma aproximação -- o grupo pode ter mudado de tamanho --
  // e o tooltip diz "ativos hoje" para não fingir outra coisa.
  const comTaxa = (rows: { name: string; value: number }[], hcDe: (n: string) => number) =>
    rows.map(d => {
      const hc = hcDe(d.name);
      return { ...d, pctTot: pctDist(d.value), hc, pctHC: hc > 0 ? (d.value / hc) * 100 : null };
    });

  const salaryBandData = comTaxa(countBy(distLeavers, 'faixa_salarial', SALARY_BAND_ORDER), n => activeByBand[n] ?? 0);
  const tenureData = comTaxa(countBy(distLeavers, 'tempo_casa_faixa', TENURE_ORDER), n => tenureHC[n] ?? 0);
  const levelData = comTaxa(countBy(distLeavers, 'level', LEVEL_ORDER), n => levelHC[n] ?? 0);
  const deptData = comTaxa(countBy(distLeavers, 'departamento'), n => deptHC[n.toUpperCase().trim()] ?? 0);
  const typeData = comTaxa(countBy(distLeavers, 'tipo_desligamento_agrupado'), () => hcTotal);
  // ------------------------------------------------------------------
  // POR MARCA, NÃO POR EMPRESA
  // ------------------------------------------------------------------
  // Era "Por Empresa (base Convenia)": NSX Recife, NSX São Paulo, NSX
  // Marechal... que são todas a marca NSX -- a quebra não dizia nada que a
  // marca não diga, e não tinha HC para virar taxa. Por marca tem: a série
  // guarda headcount por marca, e a taxa sai com a mesma conta do cartão
  // (saídas ÷ HC médio do período, com o recorte de área da barra).
  const hcPorMarca = useMemo(() => {
    const out: Record<string, number> = {};
    for (const m of ['NSX', 'Betfair BR', 'Flutter International']) {
      const serie = getAllMonthsForBrand(data, m).map(r => (filteredDeptKey ? applyDeptFilter(r, filteredDeptKey) : r));
      out[m] = taxaDoPeriodo(serie, mesesAtuais)?.hcMedio ?? 0;
    }
    return out;
  }, [data, filteredDeptKey, mesesAtuais.join()]);
  const empresaData = comTaxa(countBy(distLeavers, 'marca'), n => hcPorMarca[n] ?? 0);
  // Com uma empresa só no recorte (Betfair, International) o quadro é uma
  // barra única -- não informa nada.
  const mostraEmpresa = brand === 'combined' && empresaData.length > 1;
  // Motivo: só quem tem. "Não informado" não vira barra -- com a cobertura
  // parcial do começo, seria a maior barra do quadro e não diria nada.
  const comMotivo = distLeavers.filter(r => r.motivo_desligamento);
  const motivoData = comTaxa(countBy(comMotivo, 'motivo_desligamento'), () => hcTotal).slice(0, 10);
  const tooltipSobreHcTotal = (_v: number, _n: string, item: any) => {
    const p = item.payload;
    return [
      p.pctHC != null
        ? `${p.value} · ${p.pctHC.toFixed(2)}% do HC médio (${Math.round(p.hc)})`
        : `${p.value} desligados`,
      p.name ?? 'Desligados',
    ];
  };

  // No modo taxa, a barra é `pctHC`; grupo sem denominador fica sem barra
  // (e o tooltip explica), em vez de virar zero.
  const chaveBarra = modo === 'taxa' ? 'pctHC' : 'value';
  const eixoContagem = { allowDecimals: false, domain: [0, 'auto'] as [number, 'auto'] };
  const eixoBarra = modo === 'taxa'
    ? { allowDecimals: true, domain: [0, 'auto'] as [number, 'auto'], tickFormatter: (v: number) => `${v}%` }
    : eixoContagem;
  const tooltipTaxa = (value: number, _n: string, item: any) => {
    const p = item.payload;
    const base = p.pctHC != null
      ? `${p.value} · ${p.pctHC.toFixed(1)}% dos ${p.hc} ativos hoje`
      : `${p.value} · ${p.pctTot.toFixed(0)}% do total (sem HC do grupo)`;
    return [base, 'Desligados'];
  };

  // Evolucao mensal empilhada por tipo (voluntario x involuntario x outros) --
  // a "visao mes a mes classificando" pedida pela diretora.
  //
  // USA `ateOFim`, NÃO `filteredLeavers` -- um gráfico de "mês a mês" cortado
  // a um único mês vira uma barra solta. A história do ano (ou do trimestre
  // corrente) até o mês escolhido é o que sustenta a leitura de tendência;
  // os outros filtros (departamento, contrato etc.) continuam valendo.
  // Na janela de 12 meses a evolução mostra exatamente esses 12; no período
  // do topo, a história até o fim dele (`ateOFim`). Em "% sobre ativos",
  // cada barra é saídas do tipo ÷ HC daquele mês.
  const hcDoMes = useMemo(
    () => new Map(serieTodosOsAnos.map((d) => [d.month, d.headcount || 0])),
    [serieTodosOsAnos],
  );
  const monthlyData = useMemo(() => {
    const m = new Map<string, { voluntario: number; involuntario: number; outros: number }>();
    leavers
      .filter(r => (usaLtm ? noEscopo(r.mes_desligamento) : periodo.ateOFim(r.mes_desligamento)) && passaOutrosFiltros(r))
      .forEach(r => {
        const cur = m.get(r.mes_desligamento) || { voluntario: 0, involuntario: 0, outros: 0 };
        if (r.tipo_desligamento_agrupado === 'Voluntário') cur.voluntario++;
        else if (r.tipo_desligamento_agrupado === 'Involuntário') cur.involuntario++;
        else cur.outros++;
        m.set(r.mes_desligamento, cur);
      });
    const rows = Array.from(m.entries())
      .map(([month, v]) => ({ month, ...v }))
      .sort((a, b) => a.month.localeCompare(b.month));
    if (modo !== 'taxa') return rows;
    return rows.map((r) => {
      const hc = hcDoMes.get(r.month) ?? 0;
      const t = (n: number) => (hc > 0 ? Math.round((n / hc) * 1000) / 10 : null);
      return { month: r.month, voluntario: t(r.voluntario), involuntario: t(r.involuntario), outros: t(r.outros) };
    });
  }, [leavers, filters, searchTerm, periodo, brand, usaLtm, escopoSet, modo, hcDoMes]);

  // ------------------------------------------------------------------
  // TAXA DO PERÍODO, COM O NOME CERTO E COM COMPARAÇÃO
  // ------------------------------------------------------------------
  // Saídas ÷ HC médio dos meses do período (mês, trimestre ou tudo), da
  // série da marca com o recorte de área. Era rotulada "acumulada" mesmo
  // com um mês só no topo. Ver `lib/desligamentos-kpis.ts`.
  //
  // `serieTodosOsAnos`, e não `allMonthsData`: esta vem restrita ao ano em
  // escopo (e agregada na visão trimestral), e aí o mesmo período do ano
  // passado não existia para comparar. A série mensal completa serve às
  // três visões com a mesma conta.
  const taxaAtual = taxaDoPeriodo(serieTodosOsAnos, mesesAtuais);
  const taxaAnterior = temPeriodo ? taxaDoPeriodo(serieTodosOsAnos, mesesAnteriores) : null;
  // Em 12 meses, "o período anterior" JÁ É o mesmo período do ano passado --
  // mostrar os dois seria o mesmo número duas vezes.
  const taxaAnoPassado = mesesEscopo && !usaLtm ? taxaDoPeriodo(serieTodosOsAnos, deslocarMeses(mesesEscopo, -12)) : null;
  const taxaYtd = mesesEscopo && !usaLtm ? taxaDoPeriodo(serieTodosOsAnos, mesesDoAnoAte(fimDoPeriodo)) : null;
  const anoPassado = Number(fimDoPeriodo.slice(0, 4)) - 1;
  const hcMedio = taxaAtual?.hcMedio ?? 0;
  const taxaDe = (n: number) => (hcMedio > 0 ? (n / hcMedio) * 100 : null);

  const rotuloTaxa = usaLtm ? 'Atrição 12 meses' : periodo.tipo === 'mes' ? 'Atrição do mês' : periodo.tipo === 'trimestre' ? 'Atrição do trimestre' : 'Atrição (todos os anos)';
  const dYoY = deltaPP(taxaAtual, taxaAnoPassado);
  const subTaxa = taxaAtual
    ? [
        `${taxaAtual.saidas} saídas ÷ HC médio ${Math.round(taxaAtual.hcMedio)}`,
        temPeriodo && taxaAtual.nMeses < 12 ? `anualizada ${pctFmt(taxaAtual.anualizada)}` : null,
        taxaYtd && taxaYtd.nMeses > taxaAtual.nMeses ? `acum. ${fimDoPeriodo.slice(0, 4)} ${pctFmt(taxaYtd.taxa)}` : null,
        dYoY != null ? `vs ${anoPassado}: ${dYoY > 0 ? '+' : ''}${dYoY.toFixed(1)} p.p.` : null,
      ].filter(Boolean).join(' · ')
    : 'sem headcount na série para este período';

  const kpis = [
    {
      label: 'Total Desligados', value: fmt(totalLeavers), color: COLORS.danger, icon: UserX,
      sub: temPeriodo ? `em ${rotuloEscopo}` : 'todos os anos',
      delta: totalAnterior != null
        ? <Delta v={totalLeavers - totalAnterior} invertido periodo={nomeAnterior} />
        : undefined,
    },
    {
      label: rotuloTaxa, value: pctFmt(taxaAtual?.taxa), color: COLORS.orange, icon: TrendingUp,
      help: 'atricaoPeriodo' as const, helpValue: taxaAtual?.taxa ?? null,
      sub: subTaxa,
      delta: temPeriodo ? <Delta v={deltaPP(taxaAtual, taxaAnterior)} invertido periodo={tx("{0} (em p.p.)", [nomeAnterior])} /> : undefined,
    },
    // A métrica da barra de filtros decide o número grande: nº de saídas
    // (com a taxa embaixo) ou taxa sobre o HC médio (com o nº embaixo).
    modo === 'taxa'
      ? {
          label: 'Atrição voluntária', value: pctFmt(taxaDe(voluntary)), color: COLORS.info, icon: LogOut,
          help: 'atricaoVoluntaria' as const, helpValue: taxaDe(voluntary),
          sub: `${fmt(voluntary)} saídas · ${pctTot(voluntary).toFixed(0)}% dos desligamentos`,
        }
      : {
          label: 'Voluntários', value: `${fmt(voluntary)} (${pctTot(voluntary).toFixed(0)}%)`, color: COLORS.info, icon: LogOut,
          help: 'atricaoVoluntaria' as const, helpValue: taxaDe(voluntary),
          sub: `${pctFmt(taxaDe(voluntary))} do HC médio`,
        },
    {
      // Cor neutra de propósito: desligamento involuntário não é, por si,
      // sinal de problema -- pode ser gestão de desempenho funcionando. O
      // âmbar/vermelho fica para o que é alerta de fato (atrição não desejada).
      label: modo === 'taxa' ? 'Atrição involuntária' : 'Involuntários',
      value: modo === 'taxa' ? pctFmt(taxaDe(involuntary)) : `${fmt(involuntary)} (${pctTot(involuntary).toFixed(0)}%)`,
      color: COLORS.purple, icon: UserMinus,
      sub: modo === 'taxa'
        ? `${fmt(involuntary)} saídas · ${pctTot(involuntary).toFixed(0)}% dos desligamentos`
        : `${pctFmt(taxaDe(involuntary))} do HC médio`,
    },
    {
      label: 'Tempo de casa', value: tenureMediana != null ? `${tenureMediana.toFixed(1)}m` : '—', color: COLORS.nsx, icon: Clock,
      help: 'tempoCasaMediana' as const,
      sub: tenureMedia != null
        ? `mediana · média ${tenureMedia.toFixed(1)}m${mesesCasa.length < totalLeavers ? ` · ${mesesCasa.length} de ${totalLeavers} com admissão` : ''}`
        : 'sem data de admissão',
    },
    {
      label: 'Saída precoce', value: pctFmt(precoce.pct12m, 0), color: COLORS.warning, icon: Hourglass,
      help: 'turnoverPrecoce' as const, helpValue: precoce.pct12m,
      sub: precoce.n
        ? `${precoce.ate12m} de ${precoce.n} com menos de 1 ano · ${precoce.ate3m} até 3 meses`
        : 'sem data de admissão',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-end"><FreshnessBadge dataset="leavers" /></div>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <LogOut className="h-5 w-5" style={{ color: brandColor }} />
            {tx("Análise de Desligamentos")}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {totalLeavers}{" "}{tx("desligamentos")}{temPeriodo ? tx(" em {0}", [rotuloEscopo]) : tx(" (todos os anos)")}
            {brand !== 'combined' ? ` · ${brand}` : ''}{" "}{tx("· marca, mês, trimestre e ano no topo recortam esta aba")}
          </p>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder={nomesOcultos ? tx("Buscar cargo ou departamento...") : tx("Buscar colaborador, cargo ou departamento...")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-secondary border border-border rounded pl-9 pr-3 py-1.5 text-sm text-foreground w-full md:w-[320px] focus:outline-none focus:ring-1"
            style={{ '--tw-ring-color': brandColor } as React.CSSProperties}
          />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {kpis.map((kpi, idx) => (
          <KpiCard key={idx} {...kpi} />
        ))}
      </div>

      {totalDist > 0 && totalDist < 20 && (
        <p className="text-[11px] text-muted-foreground">
          {tx("Poucas saídas no recorte: cada barra é uma ou duas pessoas e o desenho muda muito de um período para o outro.")}
          {!usaLtm ? tx(" A janela \"Últimos 12 meses\", na barra de filtros, dá uma leitura mais estável.") : ''}
        </p>
      )}

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard
          title={tx("Desligamentos por Faixa Salarial")}
          nota={
            modo === 'taxa'
              ? temDenominador
                ? tx("% das pessoas ativas hoje em cada faixa que saíram · no tooltip, o absoluto")
                : semAcesso
                  ? tx("A taxa sobre os ativos da faixa exige acesso a Compensation — sem barras neste modo")
                  : tx("Sem o HC por faixa, não há taxa — sem barras neste modo")
              : temDenominador
                ? tx("Absoluto · no tooltip, taxa sobre os ativos da faixa")
                : semAcesso
                  ? tx("Absoluto · no tooltip, % do total — a taxa sobre os ativos da faixa exige acesso a Compensation")
                  : tx("Absoluto · no tooltip, % do total")
          }
        >
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={salaryBandData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis dataKey="name" tick={{ fill: 'var(--chart-tick)', fontSize: 11 }} />
              <YAxis {...eixoBarra} tick={{ fill: 'var(--chart-tick)', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)', borderRadius: 8, fontSize: 12 }} formatter={tooltipTaxa} />
              <Bar dataKey={chaveBarra} name={tx("Desligados")} fill={brandColor} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title={tx("Desligamentos por Tempo de Casa")}
          nota={modo === 'taxa'
            ? tx("Saídas com aquele tempo de casa ÷ ativos na mesma faixa no mês de referência · no tooltip, o absoluto")
            : tx("Tempo de casa na data da saída · no tooltip, a taxa sobre os ativos da faixa")}
        >
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={tenureData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis dataKey="name" tick={{ fill: 'var(--chart-tick)', fontSize: 11 }} />
              <YAxis {...eixoBarra} tick={{ fill: 'var(--chart-tick)', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)', borderRadius: 8, fontSize: 12 }} formatter={tooltipTaxa} />
              <Bar dataKey={chaveBarra} name={tx("Desligados")} fill={COLORS.nsx} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard
          title={tx("Por Tipo de Desligamento")}
          nota={"'Outros' = tudo fora de voluntário/involuntário (acordo, fim de contrato, etc.)"
            + (modo === 'taxa' ? ' · em % do HC médio do período' : '')}
        >
          <ResponsiveContainer width="100%" height={240}>
            {modo === 'taxa' ? (
              // Em taxa, pizza não serve: as fatias somariam a atrição total,
              // não 100%. Barras mostram o tamanho de cada tipo sobre o HC.
              <BarChart data={typeData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis dataKey="name" tick={{ fill: 'var(--chart-tick)', fontSize: 11 }} />
                <YAxis {...eixoBarra} tick={{ fill: 'var(--chart-tick)', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)', borderRadius: 8, fontSize: 12 }} formatter={tooltipSobreHcTotal} />
                <Bar dataKey="pctHC" name={tx("Desligados")} radius={[4, 4, 0, 0]}>
                  {typeData.map((_, idx) => (
                    <Cell key={`cell-${idx}`} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            ) : (
              <PieChart>
                <Pie
                  data={typeData}
                  cx="50%"
                  cy="45%"
                  innerRadius={42}
                  outerRadius={66}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {typeData.map((_, idx) => (
                    <Cell key={`cell-${idx}`} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)', borderRadius: 8, fontSize: 12 }}
                  formatter={(value: number, name: string) => [`${value} desligados`, name]}
                />
                <Legend wrapperStyle={{ fontSize: 10 }} iconSize={8} />
              </PieChart>
            )}
          </ResponsiveContainer>
        </ChartCard>

        {mostraEmpresa && (
          <ChartCard
            title={tx("Por Marca")}
            nota={modo === 'taxa'
              ? tx("Saídas da marca ÷ HC médio da marca no período · no tooltip, o absoluto")
              : tx("Nº de saídas · no tooltip, a taxa sobre o HC médio da marca no período")}
          >
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={empresaData} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis type="number" {...eixoBarra} tick={{ fill: 'var(--chart-tick)', fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fill: 'var(--chart-tick)', fontSize: 10 }} width={120} />
                <Tooltip
                  contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)', borderRadius: 8, fontSize: 12 }}
                  formatter={(_v: number, _n: string, item: any) => {
                    const p = item.payload;
                    return [p.pctHC != null
                      ? `${p.value} · ${p.pctHC.toFixed(1)}% do HC médio (${Math.round(p.hc)})`
                      : `${p.value} · sem HC da marca no período`, 'Desligados'];
                  }}
                />
                <Bar dataKey={chaveBarra} name={tx("Desligados")} radius={[0, 4, 4, 0]}>
                  {empresaData.map((d) => (
                    <Cell key={d.name} fill={BRAND_COLORS[d.name] || COLORS.flutter} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {comMotivo.length > 0 && (
          <ChartCard
            title={tx("Por Motivo")}
            nota={`${comMotivo.length} de ${totalDist} saídas com motivo no Convenia · top 10`
              + (modo === 'taxa' ? ' · em % do HC médio do período' : ' · no tooltip, % das que têm motivo')}
          >
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={motivoData} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis type="number" {...eixoBarra} tick={{ fill: 'var(--chart-tick)', fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fill: 'var(--chart-tick)', fontSize: 10 }} width={140} />
                <Tooltip
                  contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)', borderRadius: 8, fontSize: 12 }}
                  formatter={modo === 'taxa'
                    ? tooltipSobreHcTotal
                    : (value: number) => [`${value} · ${((value / comMotivo.length) * 100).toFixed(0)}% das saídas com motivo`, 'Desligados']}
                />
                <Bar dataKey={chaveBarra} name={tx("Desligados")} fill={COLORS.teal} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        <ChartCard
          title={tx("Por Departamento")}
          nota={modo === 'taxa' ? tx("% do HC atual do depto que saiu · top 8 por nº de saídas") : tx("Absoluto · no tooltip, % sobre o HC do depto")}
        >
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={deptData.slice(0, 8)} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis type="number" {...eixoBarra} tick={{ fill: 'var(--chart-tick)', fontSize: 10 }} />
              <YAxis type="category" dataKey="name" tick={{ fill: 'var(--chart-tick)', fontSize: 10 }} width={90} />
              <Tooltip contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)', borderRadius: 8, fontSize: 12 }} formatter={tooltipTaxa} />
              <Bar dataKey={chaveBarra} name={tx("Desligados")} fill={COLORS.purple} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title={tx("Por Level")}
          nota={modo === 'taxa' ? tx("% do HC atual do nível que saiu · no tooltip, o absoluto") : tx("Absoluto · no tooltip, % sobre o HC do nível")}
        >
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={levelData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis dataKey="name" tick={{ fill: 'var(--chart-tick)', fontSize: 11 }} />
              <YAxis {...eixoBarra} tick={{ fill: 'var(--chart-tick)', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)', borderRadius: 8, fontSize: 12 }} formatter={tooltipTaxa} />
              <Bar dataKey={chaveBarra} name={tx("Desligados")} fill={COLORS.betfair} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Evolução mensal empilhada por tipo */}
      <ChartCard
        title={tx("Evolução Mensal de Desligamentos")}
        nota={
          (usaLtm ? 'Os 12 meses da janela' : 'Mês a mês até o período do topo')
          + (modo === 'taxa' ? ', em % do HC de cada mês, por tipo' : ', em nº de saídas, por tipo')
        }
      >
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={monthlyData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
            <XAxis
              dataKey="month"
              tick={{ fill: 'var(--chart-tick)', fontSize: 10 }}
              tickFormatter={(v) => mLabel(v)}
            />
            <YAxis {...eixoBarra} tick={{ fill: 'var(--chart-tick)', fontSize: 11 }} />
            <Tooltip
              contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)', borderRadius: 8, fontSize: 12 }}
              formatter={(v: number, name: string) => [modo === 'taxa' ? `${v}%` : v, name]}
              labelFormatter={(label) => mLabel(String(label))}
            />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Bar dataKey="voluntario" name={tx("Voluntário")} stackId="t" fill={COLORS.info} />
            <Bar dataKey="involuntario" name={tx("Involuntário")} stackId="t" fill={COLORS.orange} />
            <Bar dataKey="outros" name={tx("Outros")} stackId="t" fill={COLORS.gray800} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Detailed Table */}
      <Card className="border-l-4 bg-card/50" style={{ borderLeftColor: brandColor }}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2 text-foreground">
            <BarChart3 className="h-5 w-5" style={{ color: brandColor }} />
            {tx("Lista de Desligados")}
          </CardTitle>
          {nomesOcultos && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
              <EyeOff className="h-3.5 w-3.5 shrink-0" />
              {tx("Nomes e salários ficam ocultos no seu perfil de acesso — os números da aba contam todas as pessoas do seu escopo.")}
            </p>
          )}
        </CardHeader>
        <CardContent>
          <div className="overflow-auto max-h-[500px]">
            <table className="w-full text-[11px]">
              <thead className="text-muted-foreground uppercase sticky top-0 bg-card/95 backdrop-blur-sm">
                <tr className="border-b border-border/50">
                  <th className="text-left p-2">{tx("Nome")}</th>
                  <th className="text-left p-2">{tx("Cargo")}</th>
                  <th className="text-left p-2">{tx("Depto")}</th>
                  <th className="text-left p-2">{tx("Level")}</th>
                  <th className="text-left p-2">{tx("Vínculo")}</th>
                  <th className="text-left p-2">{tx("Tempo de Casa")}</th>
                  <th className="text-left p-2">{tx("Data Deslig.")}</th>
                  <th className="text-left p-2">{tx("Tipo")}</th>
                  <th className="text-left p-2">{tx("Motivo")}</th>
                </tr>
              </thead>
              <tbody>
                {filteredLeavers.map((leaver) => (
                  <tr key={leaver.id} className="border-b border-border/30 hover:bg-muted/50">
                    <td className="p-2 font-medium text-foreground whitespace-nowrap">{tx(leaver.nome)}</td>
                    <td className="p-2 text-foreground">{tx(leaver.cargo)}</td>
                    <td className="p-2 text-foreground">{tx(leaver.departamento)}</td>
                    <td className="p-2 text-foreground">{tx(leaver.level)}</td>
                    <td className="p-2 text-foreground">{tx(leaver.vinculo)}</td>
                    <td className="p-2 text-foreground">{tx(leaver.tempo_casa_faixa)}</td>
                    <td className="p-2 text-foreground whitespace-nowrap">{tx(leaver.data_desligamento_str)}</td>
                    <td className="p-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                        leaver.tipo_desligamento_agrupado === 'Involuntário'
                          ? 'bg-red-500/20 text-red-400'
                          : leaver.tipo_desligamento_agrupado === 'Voluntário'
                          ? 'bg-blue-500/20 text-blue-400'
                          : leaver.tipo_desligamento_agrupado === 'Acordo'
                          ? 'bg-yellow-500/20 text-yellow-400'
                          : 'bg-muted text-muted-foreground'
                      }`}>
                        {tx(leaver.tipo_desligamento_agrupado)}
                      </span>
                    </td>
                    <td className="p-2 text-muted-foreground">{tx(leaver.motivo_desligamento) || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredLeavers.length === 0 && (
              <p className="text-center text-muted-foreground py-8">{tx("Nenhum desligado encontrado com os filtros selecionados.")}</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
