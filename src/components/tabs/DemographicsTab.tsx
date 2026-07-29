import { useDashboard } from '@/data/DashboardContext';
import { mLabel } from '@/data/helpers';
import ChartCard from '@/components/dashboard/ChartCard';
import KpiCard from '@/components/dashboard/KpiCard';
import { COLORS } from '@/lib/colors';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { Users, MapPin, Cake, ShieldCheck, Globe, GraduationCap } from 'lucide-react';

const BRAND_COLORS: Record<string, string> = {
  combined: COLORS.flutter,
  NSX: COLORS.nsx,
  'Betfair BR': COLORS.betfair,
  'Flutter International': COLORS.flutter,
  Porto: COLORS.flutter,
};

const AGE_ORDER = ['<25', '25-34', '35-44', '45-54', '55+', 'Não informado'];
const TENURE_ORDER = ['0-3m', '3-6m', '6-12m', '1-2a', '2-5a', '5a+', 'Não informado'];
const LEVELS = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9'];
const RACE_COLORS: Record<string, string> = {
  Branca: '#cbd5e1', Parda: '#c99a6b', Preta: '#5b4636', Amarela: '#e9c46a', Indígena: '#2a9d8f', 'Não informado': '#475569',
};
const REGIONS: Record<string, string> = {
  SP: 'Sudeste', RJ: 'Sudeste', MG: 'Sudeste', ES: 'Sudeste',
  PR: 'Sul', RS: 'Sul', SC: 'Sul',
  BA: 'Nordeste', PE: 'Nordeste', CE: 'Nordeste', RN: 'Nordeste', PB: 'Nordeste', AL: 'Nordeste', MA: 'Nordeste', PI: 'Nordeste', SE: 'Nordeste',
  DF: 'Centro-Oeste', GO: 'Centro-Oeste', MT: 'Centro-Oeste', MS: 'Centro-Oeste',
  AM: 'Norte', PA: 'Norte', AC: 'Norte', RO: 'Norte', RR: 'Norte', AP: 'Norte', TO: 'Norte',
};

const toArr = (o: Record<string, number> | undefined, order?: string[]) => {
  const e = Object.entries(o || {}).map(([name, value]) => ({ name, value }));
  if (order) return e.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
  return e.sort((a, b) => b.value - a.value);
};
const pctOf = (part: number, total: number) => (total > 0 ? (part / total) * 100 : 0);

export default function DemographicsTab() {
  const { currentData, currentMonth, brand } = useDashboard();
  const curr = currentData;
  const brandColor = BRAND_COLORS[brand] || COLORS.flutter;
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
  const tenure = toArr(curr.tenure_base, TENURE_ORDER).filter((t) => t.value > 0);

  const states = Object.entries(curr.state_mix || {}).map(([name, v]) => ({ name, value: v })).sort((a, b) => b.value - a.value).slice(0, 10);
  const regionMap: Record<string, number> = {};
  Object.entries(curr.state_mix || {}).forEach(([st, v]) => {
    const reg = REGIONS[st.toUpperCase()] || 'Outros';
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
        <span>Marca: <strong className="text-foreground">{brand === 'combined' ? 'Combined' : brand}</strong></span>
        <span>Ref: <strong className="text-foreground">{mLabel(currentMonth)}</strong></span>
        <span>Total: <strong className="text-foreground">{hc}</strong></span>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <KpiCard label="Mulheres" value={`${curr.gender_female_pct || 0}%`} color={COLORS.female} icon={Users} />
        <KpiCard label="Faixa etária top" value={topAge ? topAge.name : '—'} sub={topAge ? `${pctOf(topAge.value, hc).toFixed(0)}% do quadro` : ''} color={COLORS.info} icon={Cake} />
        <KpiCard label="Não brancos" value={raceKnown ? `${pctOf(nonWhite, raceKnown).toFixed(0)}%` : '—'} sub="da base com raça" color={COLORS.nsx} icon={Globe} />
        <KpiCard label="% PCD" value={`${pctOf(curr.pcd || 0, hc).toFixed(1)}%`} sub={`${curr.pcd || 0} · campo parcial`} color={COLORS.warning} icon={ShieldCheck} />
        <KpiCard label="% Aprendiz" value={`${pctOf(curr.apprentice || 0, hc).toFixed(1)}%`} sub={`${curr.apprentice || 0} aprendizes`} color={COLORS.purple} icon={GraduationCap} />
      </div>

      {!hasDemographics && (
        <p className="text-sm text-muted-foreground text-center py-8">
          Sem dados demográficos para esta marca (ex.: Flutter International não tem cadastro completo).
        </p>
      )}

      {hasDemographics && (
        <>
          {/* Gênero & Idade */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Gênero" subtitle="Distribuição do quadro" icon={Users}>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={genderData} innerRadius={55} outerRadius={80} dataKey="value" strokeWidth={0}>
                    <Cell fill={COLORS.female} />
                    <Cell fill={COLORS.info} />
                  </Pie>
                  <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1f2e4a', borderRadius: 8, fontSize: 11 }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Faixa etária" subtitle="Idade exata no mês" icon={Cake}>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={age}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(218 40% 21%)" />
                  <XAxis dataKey="name" tick={{ fill: '#4a5568', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#4a5568', fontSize: 9 }} />
                  <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1f2e4a', borderRadius: 8, fontSize: 11 }} />
                  <Bar dataKey="value" name="Pessoas" fill={brandColor} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* Cor/Raça & Estado civil */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Cor / Raça" subtitle="Autodeclaração · dado sensível, só agregado (LGPD)" icon={Globe}>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={race} layout="vertical" margin={{ left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(218 40% 21%)" />
                  <XAxis type="number" tick={{ fill: '#4a5568', fontSize: 9 }} />
                  <YAxis type="category" dataKey="name" tick={{ fill: '#4a5568', fontSize: 10 }} width={90} />
                  <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1f2e4a', borderRadius: 8, fontSize: 11 }} formatter={(v: number) => [`${v} · ${pctOf(v, hc).toFixed(0)}%`, 'Pessoas']} />
                  <Bar dataKey="value" name="Pessoas" radius={[0, 4, 4, 0]}>
                    {race.map((r) => <Cell key={r.name} fill={RACE_COLORS[r.name] || brandColor} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Estado civil" icon={Users}>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={marital} layout="vertical" margin={{ left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(218 40% 21%)" />
                  <XAxis type="number" tick={{ fill: '#4a5568', fontSize: 9 }} />
                  <YAxis type="category" dataKey="name" tick={{ fill: '#4a5568', fontSize: 10 }} width={100} />
                  <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1f2e4a', borderRadius: 8, fontSize: 11 }} formatter={(v: number) => [`${v} · ${pctOf(v, hc).toFixed(0)}%`, 'Pessoas']} />
                  <Bar dataKey="value" name="Pessoas" fill={COLORS.nsx + '99'} stroke={COLORS.nsx} strokeWidth={1} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* Origem & Localização */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Origem (UF natal)" subtitle="Onde nasceram — top 10" icon={Globe}>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={origin} layout="vertical" margin={{ left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(218 40% 21%)" />
                  <XAxis type="number" tick={{ fill: '#4a5568', fontSize: 9 }} />
                  <YAxis type="category" dataKey="name" tick={{ fill: '#4a5568', fontSize: 9 }} width={110} />
                  <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1f2e4a', borderRadius: 8, fontSize: 11 }} />
                  <Bar dataKey="value" name="Pessoas" fill={COLORS.betfair + '99'} stroke={COLORS.betfair} strokeWidth={1} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Local de trabalho (UF)" subtitle="Top estados e regiões" icon={MapPin}>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={states} layout="vertical" margin={{ left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(218 40% 21%)" />
                  <XAxis type="number" tick={{ fill: '#4a5568', fontSize: 9 }} />
                  <YAxis type="category" dataKey="name" tick={{ fill: '#4a5568', fontSize: 9 }} width={44} />
                  <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1f2e4a', borderRadius: 8, fontSize: 11 }} />
                  <Bar dataKey="value" name="Pessoas" fill={brandColor} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-2 mt-2 text-[11px] text-muted-foreground">
                {regions.map((r) => (
                  <span key={r.name} className="rounded bg-slate-800/60 px-2 py-0.5">
                    {r.name}: <strong className="text-foreground">{pctOf(r.value, hc).toFixed(0)}%</strong>
                  </span>
                ))}
              </div>
            </ChartCard>
          </div>

          {/* Senioridade & Tempo de casa */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Senioridade (nível)" subtitle="Pirâmide do quadro" icon={GraduationCap}>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={level} layout="vertical" margin={{ left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(218 40% 21%)" />
                  <XAxis type="number" tick={{ fill: '#4a5568', fontSize: 9 }} />
                  <YAxis type="category" dataKey="name" tick={{ fill: '#4a5568', fontSize: 10 }} width={32} />
                  <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1f2e4a', borderRadius: 8, fontSize: 11 }} />
                  <Bar dataKey="value" name="Pessoas" fill={COLORS.purple + '99'} stroke={COLORS.purple} strokeWidth={1} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Tempo de casa" subtitle="Distribuição dos ativos" icon={Cake}>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={tenure}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(218 40% 21%)" />
                  <XAxis dataKey="name" tick={{ fill: '#4a5568', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#4a5568', fontSize: 9 }} />
                  <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1f2e4a', borderRadius: 8, fontSize: 11 }} />
                  <Bar dataKey="value" name="Pessoas" fill={COLORS.info} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}
