import { useState, useCallback, useRef } from 'react';
import { useServerFn } from '@tanstack/react-start';
import {
  searchEmployees,
  getEmployeeProfile,
  type EmployeeSearchResult,
  type EmployeeProfile,
} from '@/lib/comp.functions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import KpiCard from '@/components/dashboard/KpiCard';
import { COLORS } from '@/lib/colors';
import {
  Search, User, Clock, TrendingUp, Layers, Scale, Building2, Users,
} from 'lucide-react';

const fmt1 = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function tenureLabel(months: number | null | undefined): string {
  if (months == null) return '—';
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0) return `${m}m`;
  if (m === 0) return `${y}a`;
  return `${y}a ${m}m`;
}

function crLabel(cr: number | null | undefined): string {
  return cr == null ? '—' : `${fmt1(cr)}%`;
}

/** Leitura simples do comp-ratio da pessoa vs. mediana do nível. */
function relToMedian(mine: number | null, med: number | null): { txt: string; color: string } {
  if (mine == null || med == null) return { txt: '—', color: COLORS.info };
  const diff = mine - med;
  if (Math.abs(diff) < 1) return { txt: 'na mediana do nível', color: COLORS.success };
  const sign = diff > 0 ? '+' : '';
  const color = diff > 0 ? COLORS.info : COLORS.warning;
  return { txt: `${sign}${fmt1(diff)}pp vs. mediana do nível`, color };
}

export default function ProfileTab() {
  const searchFn = useServerFn(searchEmployees);
  const profileFn = useServerFn(getEmployeeProfile);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<EmployeeSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback((q: string) => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      if (q.trim().length < 2) { setResults([]); return; }
      setSearching(true);
      try {
        const r = await searchFn({ data: { query: q.trim() } });
        setResults(r as EmployeeSearchResult[]);
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 300);
  }, [searchFn]);

  const openProfile = useCallback(async (id: string) => {
    setLoadingProfile(true);
    setResults([]);
    try {
      const p = await profileFn({ data: { id } });
      setProfile(p as EmployeeProfile | null);
    } catch { setProfile(null); }
    finally { setLoadingProfile(false); }
  }, [profileFn]);

  const relLevel = profile ? relToMedian(profile.comp_ratio, profile.cohort_level.med_cr) : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <User className="h-5 w-5 text-[hsl(var(--flutter))]" />
          Perfil Individual
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Admissão, tempo de casa, nível e posição relativa ao time. Remuneração aparece só como
          <strong> faixa + comp-ratio</strong> — nunca o valor nominal. Cada consulta é registrada em log de acesso.
        </p>
      </div>

      {/* Busca */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); runSearch(e.target.value); }}
              placeholder="Buscar colaborador pelo nome (mín. 2 letras)…"
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-background border border-border text-sm outline-none focus:ring-2"
              style={{ '--tw-ring-color': COLORS.flutter } as React.CSSProperties}
            />
          </div>
          {searching && <p className="text-xs text-muted-foreground mt-2">Buscando…</p>}
          {results.length > 0 && (
            <div className="mt-2 divide-y divide-border/60 rounded-lg border border-border/60 overflow-hidden">
              {results.map((r) => (
                <button
                  key={r.id}
                  onClick={() => openProfile(r.id)}
                  className="w-full text-left px-3 py-2 hover:bg-muted/50 flex items-center justify-between gap-3"
                >
                  <span className="font-medium text-sm">{r.name}</span>
                  <span className="text-xs text-muted-foreground truncate">
                    {r.job_title || '—'} · {r.area || '—'} · {r.level || '—'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {loadingProfile && (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      )}

      {!loadingProfile && profile && (
        <div className="space-y-5">
          {/* Cabecalho do colaborador */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{profile.name}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {profile.job_title || '—'} · {profile.area || '—'}
                {profile.team ? ` / ${profile.team}` : ''} · {profile.contract || '—'}
                {profile.company ? ` · ${profile.company}` : ''}
              </p>
            </CardHeader>
          </Card>

          {/* KPIs do individuo */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard
              label="Tempo de casa"
              value={tenureLabel(profile.tenure_months)}
              color={COLORS.flutter}
              icon={Clock}
              sub={profile.hire ? `admissão ${profile.hire}` : undefined}
            />
            <KpiCard
              label="Última promoção"
              value={profile.last_promotion
                ? tenureLabel(profile.months_since_promotion) + ' atrás'
                : 'sem registro'}
              color={COLORS.purple}
              icon={TrendingUp}
              sub={profile.last_promotion ? profile.last_promotion : 'histórico não carregado'}
            />
            <KpiCard
              label="Nível / senioridade"
              value={profile.level || '—'}
              color={COLORS.nsx}
              icon={Layers}
              sub={profile.quartile ? `quartil ${profile.quartile}` : undefined}
            />
            <KpiCard
              label="Faixa + comp-ratio"
              value={profile.band}
              color={COLORS.info}
              icon={Scale}
              sub={`comp-ratio ${crLabel(profile.comp_ratio)}${profile.cr_percentile_level != null ? ` · p${profile.cr_percentile_level} do nível` : ''}`}
            />
          </div>

          {/* Comparacao com o time */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Layers className="h-4 w-4" style={{ color: COLORS.nsx }} />
                  Comparação com o nível {profile.level || '—'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row label="Pessoas no mesmo nível" value={String(profile.cohort_level.n)} />
                <Row label="Comp-ratio mediano do nível" value={crLabel(profile.cohort_level.med_cr)} />
                <Row label="Comp-ratio desta pessoa" value={crLabel(profile.comp_ratio)} />
                {relLevel && (
                  <p className="text-xs font-medium pt-1" style={{ color: relLevel.color }}>{relLevel.txt}</p>
                )}
                <Row label="Tempo de casa mediano do nível" value={tenureLabel(profile.cohort_level.med_tenure_months)} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Building2 className="h-4 w-4" style={{ color: COLORS.flutter }} />
                  Comparação com a área {profile.area || '—'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row label="Pessoas na área" value={String(profile.cohort_area.n)} />
                <Row label="Comp-ratio mediano da área" value={crLabel(profile.cohort_area.med_cr)} />
                <Row label="Tempo de casa mediano da área" value={tenureLabel(profile.cohort_area.med_tenure_months)} />
                <p className="text-xs text-muted-foreground pt-1 flex items-center gap-1">
                  <Users className="h-3 w-3" /> Medianas do time — leitura relativa, sem expor valores individuais de outros.
                </p>
              </CardContent>
            </Card>
          </div>

          <p className="text-[11px] text-muted-foreground">
            <strong>Notas.</strong> Faixa e comp-ratio derivam do snapshot de compensação (Convenia); o valor nominal
            não é exibido. <strong>Última promoção</strong> vem da aba de histórico e ainda não foi carregada por pessoa —
            enquanto isso, mostra "sem registro". Comparações usam a <strong>mediana</strong> do cohort (mais robusta que a média).
          </p>
        </div>
      )}

      {!loadingProfile && !profile && !searching && results.length === 0 && query.trim().length >= 2 && (
        <p className="text-sm text-muted-foreground">Nenhum colaborador encontrado para "{query}".</p>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}
