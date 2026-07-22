import { useDashboard, Filters } from '@/data/DashboardContext';
import { COLORS } from '@/lib/colors';

const BRAND_COLORS: Record<string, string> = {
  combined: COLORS.flutter,
  NSX: COLORS.nsx,
  'Betfair BR': COLORS.betfair,
  'Flutter International': COLORS.flutter,
  Porto: COLORS.flutter,
};
import { cn } from '@/lib/utils';

const filterOptions = {
  departamento: ['Todos', 'TECHNOLOGY', 'PRODUCT', 'MARKETING', 'COMMERCIAL', 'FINANCE', 'OPERATIONS', 'HR'],
  jobFamily: ['Todos', 'Commercial & Marketing', 'Customer Operations', 'Product & Technology', 'Finance', 'Legal', 'Leadership (Executive) SR and C-Levels (reporting to CEO or N-3)', 'Other (Property, Security, Cleaning)', 'HR'],
  tempoCasa: ['Todos', '0-3 meses', '3-6 meses', '6-12 meses', '1-2 anos', '2-5 anos', '5+ anos'],
  tipoContrato: ['Todos', 'CLT', 'Pessoa Jurídica', 'Sócio'],
  faixaSalarial: ['Todos', 'Até 3k', '3k-5k', '5k-8k', '8k-12k', '12k-20k', '20k-50k', '50k+'],
  tipoDesligamento: ['Todos', 'Voluntário', 'Involuntário', 'Acordo', 'Término de Contrato', 'Outros'],
  level: ['Todos', 'L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L8'],
};

export default function FilterBar() {
  const { filters, setFilters, filteredDeptKey, brand } = useDashboard();
  const brandColor = BRAND_COLORS[brand] || COLORS.flutter;

  const handleChange = (key: keyof Filters, value: string) => {
    setFilters({ ...filters, [key]: value });
  };

  const hasActiveFilter =
    filters.departamento !== 'Todos' ||
    filters.jobFamily !== 'Todos' ||
    filters.tempoCasa !== 'Todos' ||
    filters.tipoContrato !== 'Todos' ||
    filters.faixaSalarial !== 'Todos' ||
    filters.tipoDesligamento !== 'Todos' ||
    filters.level !== 'Todos';

  const clearFilters = () => {
    setFilters({
      jobFamily: 'Todos',
      departamento: 'Todos',
      tempoCasa: 'Todos',
      centroCusto: 'Todos',
      tipoContrato: 'Todos',
      faixaSalarial: 'Todos',
      tipoDesligamento: 'Todos',
      level: 'Todos',
    });
  };

  return (
    <div className="flex items-center gap-4 px-4 md:px-7 py-2 bg-card border-b border-border overflow-x-auto">
      <FilterSelect
        label="DEPARTAMENTO"
        value={filters.departamento}
        options={filterOptions.departamento}
        onChange={(v) => handleChange('departamento', v)}
        active={!!filteredDeptKey}
        brandColor={brandColor}
      />
      <FilterSelect
        label="JOB FAMILY"
        value={filters.jobFamily}
        options={filterOptions.jobFamily}
        onChange={(v) => handleChange('jobFamily', v)}
        active={filters.jobFamily !== 'Todos'}
        brandColor={brandColor}
      />
      <FilterSelect
        label="TEMPO DE CASA"
        value={filters.tempoCasa}
        options={filterOptions.tempoCasa}
        onChange={(v) => handleChange('tempoCasa', v)}
        active={filters.tempoCasa !== 'Todos'}
        brandColor={brandColor}
      />
      <FilterSelect
        label="TIPO DE CONTRATO"
        value={filters.tipoContrato}
        options={filterOptions.tipoContrato}
        onChange={(v) => handleChange('tipoContrato', v)}
        active={filters.tipoContrato !== 'Todos'}
        brandColor={brandColor}
      />
      <FilterSelect
        label="FAIXA SALARIAL"
        value={filters.faixaSalarial}
        options={filterOptions.faixaSalarial}
        onChange={(v) => handleChange('faixaSalarial', v)}
        active={filters.faixaSalarial !== 'Todos'}
        brandColor={brandColor}
      />
      <FilterSelect
        label="TIPO DE DESLIGAMENTO"
        value={filters.tipoDesligamento}
        options={filterOptions.tipoDesligamento}
        onChange={(v) => handleChange('tipoDesligamento', v)}
        active={filters.tipoDesligamento !== 'Todos'}
        brandColor={brandColor}
      />
      <FilterSelect
        label="LEVEL"
        value={filters.level}
        options={filterOptions.level}
        onChange={(v) => handleChange('level', v)}
        active={filters.level !== 'Todos'}
        brandColor={brandColor}
      />
      {hasActiveFilter && (
        <button
          onClick={clearFilters}
          className="text-[10px] hover:underline shrink-0 font-semibold"
          style={{ color: brandColor }}
        >
          Limpar filtros
        </button>
      )}
    </div>
  );
}

function FilterSelect({ label, value, options, onChange, disabled, active, brandColor }: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  disabled?: boolean;
  active?: boolean;
  brandColor?: string;
}) {
  return (
    <div className="flex items-center gap-2 shrink-0">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground whitespace-nowrap">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={cn(
          'bg-secondary border rounded px-2 py-1 text-[11px] text-foreground min-w-[100px] focus:outline-none focus:ring-1',
          active ? 'ring-1' : 'border-border',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
        style={active ? { borderColor: brandColor, '--tw-ring-color': brandColor } as React.CSSProperties : undefined}
      >
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}
