import { useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { getTeamSnapshot, type TeamSnapshot } from '@/lib/team.functions';
import ChartCard from '@/components/dashboard/ChartCard';
import KpiCard from '@/components/dashboard/KpiCard';
import { COLORS } from '@/lib/colors';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { Users, Layers, Scale, Building2, UserCog, Briefcase } from 'lucide-react';
import { useDashboard } from '@/data/DashboardContext';

const PIE = [COLORS.flutter, COLORS.nsx, COLORS.betfair, COLORS.purple, COLORS.orange, COLORS.info, COLORS.success, COLORS.danger];
const fmt1 = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export default function TeamTab() {
  const { filters } = useDashboard();
  const fetchTeam = useServerFn(getTeamSnapshot);
  const [snap, setSnap] = useState<TeamSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchTeam({
      data: {
        department: filters.departamento,
        level: filters.level,
        contract: filters.tipoContrato,
        jobFamily: filters.jobFamily,
        tenureBand: filters.tempoCasa,
        salaryBand: filters.faixaSalarial,
      },
    })
      .then((d) => { if (!cancelled) { setSnap(d as TeamSnapshot); setError(null); } })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Falha ao carregar'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [fetchTeam, filters.departamento, filters.level, filters.tipoContrato, filters.jobFamily, filters.tempoCasa, filters.faixaSalarial]);


  if (loading) {
    return <div className="flex items-center justify-center py-24"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }
  if (error || !snap) {
    return <p className="text-sm text-muted-foreground py-16 text-center">{error ?? 'Sem dados.'}</p>;
  }

  const scopeText = snap.global
    ? 'Empresa toda (perfil global)'
    : [...snap.scopeDepartments, ...snap.scopeFamilies].join(' · ') || 'Sem escopo atribuído';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Users className="h-5 w-5 text-[hsl(var(--flutter))]" />
          Meu Time
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Foto atual do seu time (escopo: <strong>{scopeText}</strong>). Só agregados; sem nomes.
          Não inclui gênero/raça/idade (não disponíveis por time) nem série temporal — é um retrato do mês.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Headcount do time" value={String(snap.headcount)} color={COLORS.flutter} icon={Users} />
        <KpiCard label="Gestores de pessoas" value={String(snap.roles.managers)} color={COLORS.nsx} icon={UserCog} sub={`${snap.roles.leaders} líderes (flag)`} />
        <KpiCard label="Contribuidores individuais" value={String(snap.roles.ics)} color={COLORS.info} icon={Users} />
        <KpiCard label="Comp-ratio mediano" value={snap.med_comp_ratio != null ? `${fmt1(snap.med_comp_ratio)}%` : '—'} color={COLORS.purple} icon={Scale} sub={`${snap.comp_n} com comp-ratio`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Distribuição por nível" subtitle="Senioridade do time" icon={Layers}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={snap.byLevel} margin={{ left: 4, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="n" name="Pessoas" fill={COLORS.nsx} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="CLT / PJ" subtitle="Vínculo do time" icon={Briefcase}>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={snap.byContract} dataKey="n" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2}>
                {snap.byContract.map((e, i) => <Cell key={e.name} fill={PIE[i % PIE.length]} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        {snap.byDept.length > 1 && (
          <ChartCard title="Por departamento" subtitle="Composição do time" icon={Building2}>
            <ResponsiveContainer width="100%" height={Math.max(200, snap.byDept.length * 30)}>
              <BarChart data={snap.byDept} layout="vertical" margin={{ left: 20, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} className="opacity-30" />
                <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="n" name="Pessoas" fill={COLORS.flutter} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {snap.byFamily.length > 1 && (
          <ChartCard title="Por job type family" subtitle="Composição do time" icon={Briefcase}>
            <ResponsiveContainer width="100%" height={Math.max(200, snap.byFamily.length * 30)}>
              <BarChart data={snap.byFamily} layout="vertical" margin={{ left: 20, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} className="opacity-30" />
                <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 9 }} />
                <Tooltip />
                <Bar dataKey="n" name="Pessoas" fill={COLORS.purple} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Fonte: person-level do comp (NSX). O escopo respeita a mesma trava do acesso (departamento e/ou família, união).
        Gênero, raça, idade e a evolução no tempo por time virão nas próximas fases (dependem de enriquecer a série).
      </p>
    </div>
  );
}
