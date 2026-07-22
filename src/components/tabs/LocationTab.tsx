import { useDashboard } from '@/data/DashboardContext';
import { mLabel } from '@/data/helpers';
import ChartCard from '@/components/dashboard/ChartCard';
import { StorySection, StoryInsight, StoryMetric } from '@/components/dashboard/StorySection';
import { COLORS } from '@/lib/colors';

const BRAND_COLORS: Record<string, string> = {
  combined: COLORS.flutter,
  NSX: COLORS.nsx,
  'Betfair BR': COLORS.betfair,
  'Flutter International': COLORS.flutter,
  Porto: COLORS.flutter,
};
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import {
  MapPin,
  BarChart3,
  Globe,
  Map
} from 'lucide-react';

const REGIONS: Record<string, string> = {
  SP: 'Sudeste', RJ: 'Sudeste', MG: 'Sudeste', ES: 'Sudeste',
  PR: 'Sul', RS: 'Sul', SC: 'Sul',
  BA: 'Nordeste', PE: 'Nordeste', CE: 'Nordeste', RN: 'Nordeste', PB: 'Nordeste', AL: 'Nordeste', MA: 'Nordeste', PI: 'Nordeste',
  DF: 'Centro-Oeste', GO: 'Centro-Oeste', MT: 'Centro-Oeste', MS: 'Centro-Oeste',
  AM: 'Norte', PA: 'Norte', AC: 'Norte', RO: 'Norte', RR: 'Norte', AP: 'Norte', TO: 'Norte'
};

function getRegion(state: string): string {
  return REGIONS[state?.toUpperCase()] || 'Outros';
}

export default function LocationTab() {
  const { currentData, currentMonth, brand } = useDashboard();
  const brandColor = BRAND_COLORS[brand] || COLORS.flutter;
  const curr = currentData;

  const states = Object.entries(curr.state_mix || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([k, v]) => ({ name: k, hc: v }));

  const regionMap: Record<string, number> = {};
  Object.entries(curr.state_mix || {}).forEach(([state, hc]) => {
    const region = getRegion(state);
    regionMap[region] = (regionMap[region] || 0) + hc;
  });

  const regionData = Object.entries(regionMap)
    .map(([region, hc]) => ({ region, hc }))
    .sort((a, b) => b.hc - a.hc);

  const total = Object.values(curr.state_mix || {}).reduce((a, b) => a + b, 0);
  const top3 = states.slice(0, 3).reduce((a, s) => a + s.hc, 0);
  const top3Pct = total > 0 ? ((top3 / total) * 100).toFixed(1) : '0';
  const southeastPct = total > 0 ? (((regionMap['Sudeste'] || 0) / total) * 100).toFixed(1) : '0';

  const brandLabel = brand === 'combined' ? 'Combined' : brand;

  return (
    <div className="space-y-6">
      <div className="flex gap-5 flex-wrap text-xs text-muted-foreground">
        <span>Marca: <strong className="text-foreground">{brandLabel}</strong></span>
        <span>Ref: <strong className="text-foreground">{mLabel(currentMonth)}</strong></span>
      </div>

      <StorySection title="Visão Geral da Distribuição Geográfica" icon={MapPin} variant="default">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StoryMetric 
            label={`Total ${brandLabel}`}
            value={total}
            subtext="colaboradores"
          />
          <StoryMetric 
            label="Estados"
            value={states.length}
            subtext="com presença"
          />
          <StoryMetric 
            label="Concentração Top 3"
            value={`${top3Pct}%`}
            subtext={states.slice(0, 3).map(s => s.name).join(', ')}
          />
          <StoryMetric 
            label="Região Sudeste"
            value={`${southeastPct}%`}
            subtext="concentração"
          />
        </div>
        <StoryInsight type="neutral">
          <strong>Visão Geral:</strong> Distribuição geográfica reflete a marca selecionada ({brandLabel}).
          {Number(southeastPct) > 50 && ` Concentração significativa no Sudeste (${southeastPct}%).`}
        </StoryInsight>
      </StorySection>

      <StorySection title="Distribuição por Estado e Região" icon={Map} variant="info">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartCard title={`Top Estados - ${brandLabel}`} icon={Map}>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={states} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(218 40% 21%)" />
                <XAxis type="number" tick={{ fill: '#4a5568', fontSize: 10 }} />
                <YAxis dataKey="name" type="category" tick={{ fill: '#4a5568', fontSize: 10 }} width={40} />
                <Tooltip 
                  contentStyle={{ background: '#111827', border: '1px solid #1f2e4a', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#e2e8f0' }}
                />
                <Bar dataKey="hc" fill={brandColor} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Distribuição por Região" icon={Globe}>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart 
                data={regionData}
                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(218 40% 21%)" />
                <XAxis dataKey="region" tick={{ fill: '#4a5568', fontSize: 10 }} />
                <YAxis tick={{ fill: '#4a5568', fontSize: 10 }} />
                <Tooltip 
                  contentStyle={{ background: '#111827', border: '1px solid #1f2e4a', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#e2e8f0' }}
                />
                <Bar dataKey="hc" fill={brandColor} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </StorySection>

      <StorySection title="Análise de Distribuição" icon={BarChart3} variant="info">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <StoryInsight type="positive">
            <strong>Concentração Estratégica:</strong> {top3Pct}% do headcount está nos top 3 estados 
            ({states.slice(0, 3).map(s => s.name).join(', ')}), facilitando gestão e colaboração presencial quando necessário.
          </StoryInsight>
          <StoryInsight type="neutral">
            <strong>Modelo Distribuído:</strong> {states.length} estados com presença ativa. 
            Modelo remote-first permite acesso a talentos distribuídos sem limitações geográficas.
          </StoryInsight>
        </div>
      </StorySection>
    </div>
  );
}
