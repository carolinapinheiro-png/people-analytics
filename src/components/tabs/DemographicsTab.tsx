import { useDashboard } from '@/data/DashboardContext';
import { useRecorteDeSerie } from '@/data/use-series-cut';
import SeriesCutView from '@/components/dashboard/SeriesCutView';
import { mLabel } from '@/data/helpers';
import ChartCard from '@/components/dashboard/ChartCard';
import KpiCard from '@/components/dashboard/KpiCard';
import { COLORS } from '@/lib/colors';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { Users, MapPin, Cake, ShieldCheck, Globe, GraduationCap, Laptop } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { FAIXAS_TEMPO_DE_CASA } from '@/lib/convenia/pessoas';

import { tx } from '@/lib/i18n';
const WORK_MODEL_ORDER = ['Remoto', 'Híbrido', 'Presencial', 'Não informado'];
const WORK_MODEL_COLORS: Record<string, string> = {
  Remoto: COLORS.flutter,
  Híbrido: COLORS.purple,
  Presencial: COLORS.nsx,
  'Não informado': '#475569',
};

const BRAND_COLORS: Record<string, string> = {
  combined: COLORS.flutter,
  NSX: COLORS.nsx,
  'Betfair BR': COLORS.betfair,
  'Flutter International': COLORS.flutter,
  Porto: COLORS.flutter,
};

const AGE_ORDER = ['<25', '25-34', '35-44', '45-54', '55+', 'Não informado'];
const LEVELS = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9'];
const RACE_COLORS: Record<string, string> = {
  Branca: '#cbd5e1', Parda: '#c99a6b', Preta: '#5b4636', Amarela: '#e9c46a', Indígena: '#2a9d8f', 'Não informado': '#475569',
};
// A serie guarda o estado por NOME (ex.: "São Paulo"), nao por sigla. Este mapa
// resolve nome -> { sigla, regiao }; tambem aceita sigla como entrada (robustez).
const STATE_INFO: Record<string, { uf: string; region: string }> = {
  'São Paulo': { uf: 'SP', region: 'Sudeste' },
  'Rio de Janeiro': { uf: 'RJ', region: 'Sudeste' },
  'Minas Gerais': { uf: 'MG', region: 'Sudeste' },
  'Espírito Santo': { uf: 'ES', region: 'Sudeste' },
  'Paraná': { uf: 'PR', region: 'Sul' },
  'Rio Grande do Sul': { uf: 'RS', region: 'Sul' },
  'Santa Catarina': { uf: 'SC', region: 'Sul' },
  'Bahia': { uf: 'BA', region: 'Nordeste' },
  'Pernambuco': { uf: 'PE', region: 'Nordeste' },
  'Ceará': { uf: 'CE', region: 'Nordeste' },
  'Rio Grande do Norte': { uf: 'RN', region: 'Nordeste' },
  'Paraíba': { uf: 'PB', region: 'Nordeste' },
  'Alagoas': { uf: 'AL', region: 'Nordeste' },
  'Maranhão': { uf: 'MA', region: 'Nordeste' },
  'Piauí': { uf: 'PI', region: 'Nordeste' },
  'Sergipe': { uf: 'SE', region: 'Nordeste' },
  'Distrito Federal': { uf: 'DF', region: 'Centro-Oeste' },
  'Goiás': { uf: 'GO', region: 'Centro-Oeste' },
  'Mato Grosso': { uf: 'MT', region: 'Centro-Oeste' },
  'Mato Grosso do Sul': { uf: 'MS', region: 'Centro-Oeste' },
  'Amazonas': { uf: 'AM', region: 'Norte' },
  'Pará': { uf: 'PA', region: 'Norte' },
  'Acre': { uf: 'AC', region: 'Norte' },
  'Rondônia': { uf: 'RO', region: 'Norte' },
  'Roraima': { uf: 'RR', region: 'Norte' },
  'Amapá': { uf: 'AP', region: 'Norte' },
  'Tocantins': { uf: 'TO', region: 'Norte' },
};
const UF_TO_REGION: Record<string, string> = Object.values(STATE_INFO).reduce(
  (acc, { uf, region }) => ((acc[uf] = region), acc),
  {} as Record<string, string>,
);
function resolveState(name: string): { uf: string; region: string } {
  const byName = STATE_INFO[name.trim()];
  if (byName) return byName;
  const up = name.trim().toUpperCase();
  if (UF_TO_REGION[up]) return { uf: up, region: UF_TO_REGION[up] };
  return { uf: name.length <= 3 ? up : name.slice(0, 3), region: 'Outros' };
}

const toArr = (o: Record<string, number> | undefined, order?: string[]) => {
  const e = Object.entries(o || {}).map(([name, value]) => ({ name, value }));
  if (order) return e.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
  return e.sort((a, b) => b.value - a.value);
};
const pctOf = (part: number, total: number) => (total > 0 ? (part / total) * 100 : 0);

export default function DemographicsTab() {
  const { currentMonth, brand, filters } = useDashboard();
  // O recorte de dimensão vem do hook, e não do contexto: `currentData` do
  // contexto passou só pelo filtro de departamento. Sem esta linha os
  // seletores de job family, contrato e tempo de casa acendem e não fazem
  // nada -- foi exatamente o que aconteceu em 10/09.
  const { currentData: curr, cut } = useRecorteDeSerie('demographics');
  const brandColor = BRAND_COLORS[brand] || COLORS.flutter;

  // ------------------------------------------------------------------
  // MODELO DE TRABALHO -- AGORA AO VIVO, DA SÉRIE MENSAL
  // ------------------------------------------------------------------
  // Até 15/09 isto vinha de `getWorkModel`/`work_model_snapshot`: uma foto
  // ÚNICA de jul/2026, carregada à parte do Talent Mobility, que não recortava
  // por mês/trimestre/ano nem respondia aos outros filtros da barra.
  //
  // O campo já vem no `custom_fields` do Convenia -- mesmo lugar de `Level` e
  // `Job Type Family` -- e passou a entrar em `work_model_base` na
  // reconstrução mensal (ver `pessoas.ts`). Não é mais uma chamada à parte:
  // `curr` já é a mesma série recortada (mês, marca, departamento, família,
  // contrato, tempo de casa) que alimenta todo o resto desta aba.
  //
  // AGRUPAMENTO: o Convenia distingue "Remoto sem registro de ponto" de
  // "Remoto com registro de ponto" -- os dois viram "Remoto" aqui, na tela,
  // não na série (que guarda o valor cru, como `contract_base` guarda
  // "Pessoa Jurídica" em vez de traduzir para "PJ").
  const agruparModelo = (bruto: string): string => {
    if (bruto.toLowerCase().startsWith('remoto')) return 'Remoto';
    return WORK_MODEL_ORDER.includes(bruto) ? bruto : bruto || 'Não informado';
  };
  const wmOverall = useMemo(() => {
    const acc: Record<string, number> = {};
    Object.entries(curr.work_model_base || {}).forEach(([bruto, n]) => {
      const m = agruparModelo(bruto);
      acc[m] = (acc[m] ?? 0) + n;
    });
    return WORK_MODEL_ORDER
      .map((name) => ({ name, value: acc[name] ?? 0 }))
      .filter((r) => r.value > 0);
  }, [curr]);
  const wmTotal = wmOverall.reduce((s, r) => s + r.value, 0);
  const wmByDept = useMemo(() => {
    return Object.entries(curr.dept_breakdown || {})
      .map(([dept, b]) => {
        const models: Record<string, number> = {};
        Object.entries(b.work_model_base || {}).forEach(([bruto, n]) => {
          const m = agruparModelo(bruto);
          models[m] = (models[m] ?? 0) + n;
        });
        return {
          dept,
          total: Object.values(models).reduce((s, v) => s + v, 0),
          ...models,
        };
      })
      .filter((d) => d.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [curr]);
  const wmRemotoPct = wmTotal > 0 ? (wmOverall.find((r) => r.name === 'Remoto')?.value ?? 0) / wmTotal * 100 : 0;
  const dg = curr.demographics || {};
  const hc = curr.headcount || 0;

  const genderData = [
    { name: 'Mulheres', value: curr.gender_female || 0 },
    { name: 'Homens', value: curr.gender_male || 0 },
  ];
  const age = toArr(dg.age, AGE_ORDER).filter((a) => a.value > 0);
  const race = toArr(dg.race);
  const marital = toArr(dg.marital);
  const origin = toArr(dg.origin).filter((o) => o.name !== 'Não informado').slice(0, 10);
  const level = LEVELS.map((l) => ({ name: l, value: curr.level_base?.[l] || 0 })).filter((l) => l.value > 0);
  // ------------------------------------------------------------------
  // TEMPO DE CASA: EIXO FIXO, DO MENOR PARA O MAIOR
  // ------------------------------------------------------------------
  // Este gráfico saía fora de ordem ("5+ anos" antes de "0-3 meses") porque a
  // ordem vinha de uma lista local escrita noutro vocabulário -- '0-3m',
  // '1-2a', '5a+' -- enquanto a série grava '0-3 meses', '1-2 anos', '5+ anos'.
  // Nenhum rótulo batia, `indexOf` devolvia -1 para todos, e a ordenação virava
  // a ordem em que as chaves aparecem no JSON, que muda com a carga.
  //
  // Agora a régua vem de FAIXAS_TEMPO_DE_CASA (pessoas.ts), o único lugar que
  // a define, e as seis faixas são SEMPRE desenhadas -- inclusive as de valor
  // zero. Faixa vazia que some do eixo faz o gráfico mudar de forma a cada
  // filtro, e some justamente a informação de que ali não tem ninguém.
  const tenure = [
    ...FAIXAS_TEMPO_DE_CASA.map((name) => ({ name: name as string, value: curr.tenure_base?.[name] || 0 })),
    // 'Não informado' não é faixa de tempo: só entra se existir de fato.
    ...(curr.tenure_base?.['Não informado']
      ? [{ name: 'Não informado', value: curr.tenure_base['Não informado'] }]
      : []),
  ];

  const states = Object.entries(curr.state_mix || {})
    .map(([name, v]) => ({ name: resolveState(name).uf, full: name, value: v }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
  const regionMap: Record<string, number> = {};
  Object.entries(curr.state_mix || {}).forEach(([st, v]) => {
    const reg = resolveState(st).region;
    regionMap[reg] = (regionMap[reg] || 0) + v;
  });
  const regions = Object.entries(regionMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

  const topAge = age.length ? [...age].sort((a, b) => b.value - a.value)[0] : null;
  const raceKnown = race.filter((r) => r.name !== 'Não informado').reduce((s, r) => s + r.value, 0);
  const nonWhite = race.filter((r) => !['Branca', 'Não informado'].includes(r.name)).reduce((s, r) => s + r.value, 0);

  const hasDemographics = age.length > 0 || race.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex gap-5 flex-wrap text-xs text-muted-foreground">
        <span>{tx("Marca:")}{" "}<strong className="text-foreground">{brand === 'combined' ? tx("Combinado") : brand}</strong></span>
        <span>{tx("Ref:")}{" "}<strong className="text-foreground">{tx(mLabel(currentMonth))}</strong></span>
        <span>{tx("Total:")}{" "}<strong className="text-foreground">{hc}</strong></span>
        {cut.active && cut.label && (
          <span>{tx("Recorte:")}{" "}<strong className="text-foreground">{tx(cut.label)}</strong></span>
        )}
      </div>

      {/* ------------------------------------------------------------------
          O QUE O RECORTE NÃO ALCANÇA, DITO ANTES DOS GRÁFICOS
          ------------------------------------------------------------------
          Nem tudo sobrevive a um recorte de dimensão: PCD, aprendizes e o
          modelo de trabalho não vêm da quebra e continuam sendo os da empresa.
          Sem esta linha, os cartões continuariam desenhando esses números ao
          lado dos recortados, na mesma tela, sem nada dizendo que são de
          populações diferentes. */}
      {cut.active && cut.valorDesconhecido && (
        <p className="text-[11px] rounded-md border border-amber-500/40 p-2 text-amber-600 dark:text-amber-500">
          <strong>{tx(cut.label)}</strong>{" "}{tx("não aparece em nenhum mês da série. Isso não quer dizer \"ninguém nessa faixa\": quer dizer que a carga nunca gravou esse valor. Provável diferença de vocabulário entre o seletor e o cadastro do Convenia — vale reportar.")}
        </p>
      )}
      {/* A composição da fatia não existe: ou é linha anterior à quebra, ou é
          o cruzamento com departamento, que ninguém calcula. Nos dois casos os
          gráficos abaixo ficariam vazios -- e gráfico vazio, sem uma frase ao
          lado, se lê como "não temos ninguém". Foi assim que quatro gráficos
          passaram despercebidos em 09/09. */}
      {cut.active && !cut.valorDesconhecido && curr?.demographics == null && (
        <p className="text-[11px] rounded-md border border-amber-500/40 p-2 text-amber-600 dark:text-amber-500">
          {tx("Os gráficos abaixo estão vazios porque a composição desta fatia não foi calculada")}
          {filters.departamento && filters.departamento !== 'Todos'
            ? tx(" — a série guarda quem é de {0} e quem é de {1}, nunca o cruzamento dos dois. Limpe o departamento para ler este recorte.", [filters.departamento, cut.label?.split(': ')[1]])
            : tx(" — este mês foi gravado antes da quebra por essa dimensão existir. Rode a carga de novo para preenchê-lo.")}
          {' '}{tx("O headcount acima é exato.")}
        </p>
      )}
      {cut.active && !cut.valorDesconhecido && curr?.demographics != null && (
        <p className="text-[11px] rounded-md border border-border p-2 text-muted-foreground">
          {tx("Com")}{" "}<strong className="text-foreground">{tx(cut.label)}</strong>{tx(", gênero, raça, idade, estado civil e origem são os desta fatia. Continuam sendo da empresa toda:")}{' '}
          {tx(cut.suppressed.join(', '))}{tx(", PCD, aprendizes e modelo de trabalho.")}
        </p>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <KpiCard label={tx("Mulheres")} value={`${curr.gender_female_pct || 0}%`} color={COLORS.female} icon={Users} help="mulheres" />
        <KpiCard label={tx("Faixa etária top")} value={topAge ? topAge.name : '—'} sub={topAge ? tx("{0}% do quadro", [pctOf(topAge.value, hc).toFixed(0)]) : ''} color={COLORS.info} icon={Cake} />
        <KpiCard label={tx("Não brancos")} value={raceKnown ? `${pctOf(nonWhite, raceKnown).toFixed(0)}%` : '—'} sub={tx("da base com raça")} color={COLORS.nsx} icon={Globe} help="naoBrancos" />
        {/* ------------------------------------------------------------------
            AS COTAS LEGAIS: "—" QUANDO NÃO SE SABE, E A BASE DE QUEM RESPONDEU
            ------------------------------------------------------------------
            Antes: `curr.pcd || 0` sobre o HEADCOUNT. Dois defeitos numa linha.

            O `|| 0` transformava "esta fatia não tem a quebra" em "zero PCD",
            e a divisão pelo headcount fazia "0,8%" se ler como "0,8% da
            empresa é PCD" -- quando o campo "Considera PCD" é respondido por
            poucos. Numa cota legal, confundir "quase ninguém é PCD" com "quase
            ninguém respondeu" troca um problema de inclusão por um de
            cadastro. */}
        {/* ------------------------------------------------------------------
            DENOMINADOR = O QUADRO, IGUAL À ABA DEI (17/09/2026)

            Este card dividia por `pcd_conhecido` (quem respondeu "Considera
            PCD") e mostrava 6,3% enquanto a DEI mostrava 0,8% para o mesmo
            mês -- mesma etiqueta, dois números, convidando à comparação
            errada.

            O RH confirmou que o branco significa "não é PCD", "não se
            identifica" ou "não quis declarar" -- e não "ainda não
            perguntamos". Então a taxa sobre quem respondeu media só o
            subconjunto que preencheu, e não a empresa.

            Segue sendo PISO, não retrato, enquanto a cobertura do campo não
            fechar: quem não declarou entra como não-PCD. Essa ressalva está
            no verbete `pcd` de metric-help.ts, no "?" do card.
            ------------------------------------------------------------------ */}
        <KpiCard
          label={tx("% PCD")}
          value={curr.pcd == null ? '—' : `${pctOf(curr.pcd, hc).toFixed(1)}%`}
          sub={curr.pcd == null
            ? tx("não calculado nesta fatia")
            : hc > 0 ? tx("{0} de {1}", [curr.pcd, hc]) : tx("{0} pessoas", [curr.pcd])}
          color={COLORS.warning} icon={ShieldCheck} help="pcd"
        />
        {/* O denominador aparece, como no card de PCD ao lado: com 1 casa
            decimal o percentual anda de 0,5% a 0,6% no ano inteiro, e sem a
            base parece travado. O que se move é a contagem. */}
        <KpiCard
          label={tx("% Aprendiz")}
          value={curr.apprentice == null ? '—' : `${pctOf(curr.apprentice, hc).toFixed(1)}%`}
          sub={curr.apprentice == null
            ? tx("não calculado nesta fatia")
            : hc > 0 ? tx("{0} de {1}", [curr.apprentice, hc]) : tx("{0} aprendizes", [curr.apprentice])}
          color={COLORS.purple} icon={GraduationCap}
        />
      </div>

      {/* Modelo de trabalho -- ao vivo, da série mensal (ver work_model_base) */}
      {wmTotal > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title={tx("Modelo de trabalho")} subtitle={tx("{0} · {1} ativos · {2}% remoto", [mLabel(currentMonth), wmTotal, wmRemotoPct.toFixed(0)])} icon={Laptop}>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={wmOverall} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2}>
                  {wmOverall.map((e) => <Cell key={e.name} fill={WORK_MODEL_COLORS[e.name] || COLORS.info} />)}
                </Pie>
                <Tooltip formatter={(v: number) => [`${v} (${pctOf(v, wmTotal).toFixed(1)}%)`, 'Pessoas']} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title={tx("Modelo por departamento")} subtitle={tx("% dentro de cada área")} icon={Users}>
            <ResponsiveContainer width="100%" height={Math.max(220, wmByDept.length * 26)}>
              <BarChart data={wmByDept} layout="vertical" stackOffset="expand" margin={{ left: 30, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} className="opacity-30" />
                <XAxis type="number" tickFormatter={(v) => `${Math.round(v * 100)}%`} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="dept" width={95} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number, n) => [`${v}`, n as string]} />
                {WORK_MODEL_ORDER.map((m) => (
                  <Bar key={m} dataKey={m} name={tx(m)} stackId="a" fill={WORK_MODEL_COLORS[m]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      )}

      {!hasDemographics && (
        <p className="text-sm text-muted-foreground text-center py-8">
          {tx("Sem dados demográficos para esta marca (ex.: Flutter International não tem cadastro completo).")}
        </p>
      )}

      {hasDemographics && (
        <>
          {/* Gênero & Idade */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title={tx("Gênero")} subtitle={tx("Distribuição do quadro")} icon={Users}>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={genderData} innerRadius={55} outerRadius={80} dataKey="value" strokeWidth={0}>
                    <Cell fill={COLORS.female} />
                    <Cell fill={COLORS.info} />
                  </Pie>
                  <Tooltip contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)', borderRadius: 8, fontSize: 11 }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title={tx("Faixa etária")} subtitle={tx("Idade exata no mês")} icon={Cake}>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={age}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis dataKey="name" tick={{ fill: 'var(--chart-tick)', fontSize: 10 }} />
                  <YAxis tick={{ fill: 'var(--chart-tick)', fontSize: 9 }} />
                  <Tooltip contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)', borderRadius: 8, fontSize: 11 }} />
                  <Bar dataKey="value" name={tx("Pessoas")} fill={brandColor} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* Cor/Raça & Estado civil */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title={tx("Cor / Raça")} subtitle={tx("Autodeclaração · dado sensível, só agregado (LGPD)")} icon={Globe}>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={race} layout="vertical" margin={{ left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis type="number" tick={{ fill: 'var(--chart-tick)', fontSize: 9 }} />
                  <YAxis type="category" dataKey="name" tick={{ fill: 'var(--chart-tick)', fontSize: 10 }} width={90} />
                  <Tooltip contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)', borderRadius: 8, fontSize: 11 }} formatter={(v: number) => [`${v} · ${pctOf(v, hc).toFixed(0)}%`, 'Pessoas']} />
                  <Bar dataKey="value" name={tx("Pessoas")} radius={[0, 4, 4, 0]}>
                    {race.map((r) => <Cell key={r.name} fill={RACE_COLORS[r.name] || brandColor} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title={tx("Estado civil")} icon={Users}>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={marital} layout="vertical" margin={{ left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis type="number" tick={{ fill: 'var(--chart-tick)', fontSize: 9 }} />
                  <YAxis type="category" dataKey="name" tick={{ fill: 'var(--chart-tick)', fontSize: 10 }} width={100} />
                  <Tooltip contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)', borderRadius: 8, fontSize: 11 }} formatter={(v: number) => [`${v} · ${pctOf(v, hc).toFixed(0)}%`, 'Pessoas']} />
                  <Bar dataKey="value" name={tx("Pessoas")} fill={COLORS.nsx + '99'} stroke={COLORS.nsx} strokeWidth={1} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* Origem & Localização */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title={tx("Origem (UF natal)")} subtitle={tx("Onde nasceram — top 10")} icon={Globe}>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={origin} layout="vertical" margin={{ left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis type="number" tick={{ fill: 'var(--chart-tick)', fontSize: 9 }} />
                  <YAxis type="category" dataKey="name" tick={{ fill: 'var(--chart-tick)', fontSize: 9 }} width={110} />
                  <Tooltip contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)', borderRadius: 8, fontSize: 11 }} />
                  <Bar dataKey="value" name={tx("Pessoas")} fill={COLORS.betfair + '99'} stroke={COLORS.betfair} strokeWidth={1} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title={tx("Local de trabalho (UF)")} subtitle={tx("Top estados e regiões")} icon={MapPin}>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={states} layout="vertical" margin={{ left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis type="number" tick={{ fill: 'var(--chart-tick)', fontSize: 9 }} />
                  <YAxis type="category" dataKey="name" tick={{ fill: 'var(--chart-tick)', fontSize: 10 }} width={40} />
                  <Tooltip
                    contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)', borderRadius: 8, fontSize: 11 }}
                    formatter={(v: number, _n: string, item: any) => [`${v} · ${pctOf(v, hc).toFixed(0)}%`, item.payload.full]}
                  />
                  <Bar dataKey="value" name={tx("Pessoas")} fill={brandColor} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-2 mt-2 text-[11px] text-muted-foreground">
                {regions.map((r) => (
                  <span key={r.name} className="rounded bg-muted/60 px-2 py-0.5">
                    {tx(r.name)}: <strong className="text-foreground">{tx(pctOf(r.value, hc).toFixed(0))}%</strong>
                  </span>
                ))}
              </div>
            </ChartCard>
          </div>

          {/* Senioridade & Tempo de casa */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title={tx("Senioridade (nível)")} subtitle={tx("Pirâmide do quadro")} icon={GraduationCap}>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={level} layout="vertical" margin={{ left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis type="number" tick={{ fill: 'var(--chart-tick)', fontSize: 9 }} />
                  <YAxis type="category" dataKey="name" tick={{ fill: 'var(--chart-tick)', fontSize: 10 }} width={32} />
                  <Tooltip contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)', borderRadius: 8, fontSize: 11 }} />
                  <Bar dataKey="value" name={tx("Pessoas")} fill={COLORS.purple + '99'} stroke={COLORS.purple} strokeWidth={1} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title={tx("Tempo de casa")} subtitle={tx("Distribuição dos ativos")} icon={Cake}>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={tenure}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  {/* interval={0}: sem isto o recharts esconde rótulos quando a
                      largura aperta, e o eixo deixa de ser a escada completa. */}
                  <XAxis dataKey="name" interval={0} tick={{ fill: 'var(--chart-tick)', fontSize: 10 }} />
                  <YAxis tick={{ fill: 'var(--chart-tick)', fontSize: 9 }} />
                  <Tooltip contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)', borderRadius: 8, fontSize: 11 }} />
                  <Bar dataKey="value" name={tx("Pessoas")} fill={COLORS.info} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}
