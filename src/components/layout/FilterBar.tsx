import { useState } from 'react';
import { useDashboard, Filters } from '@/data/DashboardContext';
import { COLORS } from '@/lib/colors';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { isGlobalProfile, normalizeDept } from '@/lib/permissions';
import { filtersForTab, unavailableFilters, FILTER_LABELS, RECORTES_EXCLUSIVOS, type FilterKey } from '@/lib/tab-filters';
import { SlidersHorizontal, X } from 'lucide-react';

/**
 * Barra de filtros.
 *
 * Três decisões, todas vindas de problemas reais observados na tela:
 *
 * 1. MOSTRA SÓ O QUE A ABA APLICA (ver tab-filters.ts). Antes exibia os sete em
 *    todas as abas, e seis deles só funcionam em Atrição & Desligamentos. A
 *    pessoa filtrava, nada acontecia, e a tela não avisava.
 *
 * 2. FICA RECOLHIDA quando nada está selecionado. Uma linha inteira de
 *    controles dizendo "Todos" ocupa espaço permanente para um estado que é o
 *    padrão em quase todo acesso.
 *
 * 3. O QUE ESTÁ ATIVO VIRA ETIQUETA REMOVÍVEL, sempre visível. O problema
 *    anterior: você filtrava um departamento, mudava de aba, e o filtro
 *    continuava valendo sem nada gritar isso -- levando a ler o número de uma
 *    área achando que era o da empresa.
 */

const BRAND_COLORS: Record<string, string> = {
  combined: COLORS.flutter,
  NSX: COLORS.nsx,
  'Betfair BR': COLORS.betfair,
  'Flutter International': COLORS.flutter,
  Porto: COLORS.flutter,
};

const filterOptions: Record<FilterKey, string[]> = {
  departamento: ['Todos', 'TECHNOLOGY', 'PRODUCT', 'MARKETING', 'COMMERCIAL', 'FINANCE', 'OPERATION', 'HR', 'LEGAL & COMPLIANCE'],
  jobFamily: ['Todos', 'Commercial & Marketing', 'Customer Operations', 'Product & Technology', 'Finance', 'Legal', 'Leadership (Executive) SR and C-Levels (reporting to CEO or N-3)', 'Other (Property, Security, Cleaning)', 'HR'],
  tempoCasa: ['Todos', '0-3 meses', '3-6 meses', '6-12 meses', '1-2 anos', '2-5 anos', '5+ anos'],
  tipoContrato: ['Todos', 'CLT', 'Pessoa Jurídica', 'Sócio'],
  faixaSalarial: ['Todos', 'Até 3k', '3k-5k', '5k-8k', '8k-12k', '12k-20k', '20k-50k', '50k+'],
  tipoDesligamento: ['Todos', 'Voluntário', 'Involuntário', 'Acordo', 'Término de Contrato', 'Outros'],
  level: ['Todos', 'L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L8'],
};

const VAZIO: Filters = {
  jobFamily: 'Todos',
  departamento: 'Todos',
  tempoCasa: 'Todos',
  centroCusto: 'Todos',
  tipoContrato: 'Todos',
  faixaSalarial: 'Todos',
  tipoDesligamento: 'Todos',
  level: 'Todos',
};

export default function FilterBar() {
  const { filters, setFilters, brand, activeTab, activeSubTab } = useDashboard();
  const { profile, departments } = useAuth();
  const [aberto, setAberto] = useState(false);

  const brandColor = BRAND_COLORS[brand] || COLORS.flutter;
  const disponiveis = filtersForTab(activeTab, activeSubTab);
  const indisponiveis = unavailableFilters(activeTab, activeSubTab);

  // Perfis com escopo só escolhem entre os departamentos que atendem.
  const scoped = !!profile && !isGlobalProfile(profile);
  const opcoes = (k: FilterKey): string[] =>
    k === 'departamento' && scoped
      ? ['Todos', ...departments.map(normalizeDept).filter(Boolean)]
      : filterOptions[k];

  // Todo filtro ligado aparece, sempre -- mesmo quando esta aba não o aplica.
  //
  // A versão anterior mostrava só os da aba atual. Parecia mais limpo e criou um
  // bug feio: o filtro continuava valendo invisível. Filtrar "contrato = CLT" em
  // Atrição e voltar ao Overview jogava o Overview na visão reduzida, sem nada
  // na tela explicando por quê -- lia-se como "os indicadores pararam de
  // funcionar". Estado que muda o que você vê não pode ficar escondido.
  const TODAS: FilterKey[] = [
    'departamento', 'jobFamily', 'tempoCasa', 'tipoContrato',
    'faixaSalarial', 'tipoDesligamento', 'level',
  ];
  const ativos = disponiveis.filter((k) => filters[k] !== 'Todos');
  const ativosForaDaAba = TODAS.filter(
    (k) => filters[k] !== 'Todos' && !disponiveis.includes(k),
  );

  const set = (key: FilterKey, value: string) => {
    const next = { ...filters, [key]: value };
    // Exclusividade: escolher um recorte de dimensao limpa os outros dois. A
    // serie nao guarda o cruzamento entre eles, entao manter dois ativos
    // produziria um numero que parece filtrado pelos dois e nao e por nenhum.
    if (RECORTES_EXCLUSIVOS.includes(key) && value !== 'Todos') {
      for (const outro of RECORTES_EXCLUSIVOS) {
        if (outro !== key) next[outro] = 'Todos';
      }
    }
    setFilters(next);
  };
  const limparUm = (key: FilterKey) => set(key, 'Todos');
  const limparTudo = () => setFilters({ ...VAZIO });

  // Aba sem nada filtrável: a barra some. Melhor que oferecer controle inerte.
  if (disponiveis.length === 0) return null;

  return (
    <div className="px-4 md:px-7 py-2 bg-card border-b border-border">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setAberto((v) => !v)}
          className={cn(
            'flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-colors shrink-0',
            aberto || ativos.length || ativosForaDaAba.length
              ? 'border-border text-foreground'
              : 'border-border text-muted-foreground hover:text-foreground',
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filtros
          {ativos.length + ativosForaDaAba.length > 0 && (
            <span
              className="rounded-full px-1.5 text-[10px] font-medium text-white"
              style={{ backgroundColor: brandColor }}
            >
              {ativos.length + ativosForaDaAba.length}
            </span>
          )}
        </button>

        {/* Etiquetas do que está ativo: visíveis mesmo com a barra recolhida. */}
        {ativos.map((k) => (
          <span
            key={k}
            className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-[11px] shrink-0"
          >
            <span className="text-muted-foreground">{FILTER_LABELS[k]}:</span>
            <span className="font-medium max-w-[180px] truncate">{filters[k]}</span>
            <button
              onClick={() => limparUm(k)}
              aria-label={`Remover filtro ${FILTER_LABELS[k]}`}
              className="rounded-full hover:bg-background/60 p-0.5"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}

        {ativosForaDaAba.map((k) => (
          <span
            key={k}
            className="inline-flex items-center gap-1 rounded-md border border-dashed border-amber-500/50 px-2 py-1 text-[11px] shrink-0"
            title="Ativo em outra aba. Não recorta esta, mas continua valendo onde se aplica."
          >
            <span className="text-amber-600 dark:text-amber-500">{FILTER_LABELS[k]}:</span>
            <span className="max-w-[140px] truncate">{filters[k]}</span>
            <span className="text-muted-foreground">· não aplicado aqui</span>
            <button
              onClick={() => limparUm(k)}
              aria-label={`Remover filtro ${FILTER_LABELS[k]}`}
              className="rounded-full hover:bg-background/60 p-0.5"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}

        {ativos.length + ativosForaDaAba.length > 1 && (
          <button
            onClick={limparTudo}
            className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2 shrink-0"
          >
            limpar todos
          </button>
        )}

        {ativos.length + ativosForaDaAba.length === 0 && !aberto && (
          <span className="text-[11px] text-muted-foreground">
            Mostrando a empresa toda.
          </span>
        )}

        {RECORTES_EXCLUSIVOS.some((k) => disponiveis.includes(k) && filters[k] !== 'Todos') && (
          <span className="text-[11px] text-amber-600 dark:text-amber-500">
            recorte único — só headcount, saídas e atrição
          </span>
        )}
      </div>

      {aberto && (
        <div className="flex flex-wrap items-end gap-3 pt-2.5">
          {/* Indisponíveis primeiro? Não: depois, esmaecidos. Ver comentário
              em unavailableFilters -- some sem explicação faz a pessoa procurar
              o controle de novo na próxima vez. */}
          {disponiveis.map((k) => (
            <div key={k} className="space-y-1">
              <label className="block text-[10px] uppercase tracking-wider text-muted-foreground">
                {FILTER_LABELS[k]}
              </label>
              <select
                value={filters[k]}
                onChange={(e) => set(k, e.target.value)}
                className={cn(
                  // max-w evita que "Leadership (Executive) SR and C-Levels..."
                  // estique o seletor e empurre o resto para fora da tela --
                  // era a causa direta da rolagem horizontal.
                  'bg-secondary border rounded px-2 py-1 text-[11px] text-foreground',
                  'min-w-[140px] max-w-[200px]',
                  filters[k] !== 'Todos' ? 'ring-1' : 'border-border',
                )}
                style={
                  filters[k] !== 'Todos'
                    ? ({ borderColor: brandColor, '--tw-ring-color': brandColor } as React.CSSProperties)
                    : undefined
                }
              >
                {opcoes(k).map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
          ))}

          {indisponiveis.map(({ key, reason }) => (
            <div key={key} className="space-y-1 opacity-45" title={reason}>
              <label className="block text-[10px] uppercase tracking-wider text-muted-foreground">
                {FILTER_LABELS[key]}
              </label>
              <div className="border border-dashed border-border rounded px-2 py-1 text-[11px] text-muted-foreground min-w-[140px] max-w-[200px] cursor-help">
                não se aplica aqui
              </div>
            </div>
          ))}
        </div>
      )}

      {aberto && indisponiveis.length > 0 && (
        <p className="text-[11px] text-muted-foreground pt-2 max-w-3xl leading-relaxed">
          Os esmaecidos existem em Atrição &amp; Desligamentos, que lê pessoa a pessoa. Nas abas de
          série mensal só o departamento é recortável — a série é pré-agregada e guarda apenas essa
          quebra. Passe o mouse para ver o motivo de cada um.
        </p>
      )}
    </div>
  );
}
