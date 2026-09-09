import { createServerFn } from '@tanstack/react-start';
import { DeptFilterInput } from '@/lib/dept-filter';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Modelo de trabalho (remoto / hibrido / presencial) dos ativos, consolidado do
 * Talent Mobility. So agregados (contagem por modelo, total e por departamento);
 * sem nomes individuais. Mesmo padrao do span.
 */

type UntypedClient = SupabaseClient<any, 'public', any>;

/**
 * Adaptador fino sobre `resolverEscopo`, que e o unico lugar do sistema que
 * decide quem voce e -- e o unico que sabe do "ver como". Antes cada arquivo
 * tinha sua propria copia desta consulta; treze copias, quatro formatos.
 *
 * A aba declarada ('demographics') e permissao, nao decoracao: um perfil que nao a
 * enxerga leva 'Forbidden' aqui, e nao so deixa de ver o item no menu.
 */
async function authorize(userEmail: string | undefined) {
  const { resolverEscopo } = await import('@/lib/escopo.server');
  // O RETORNO É USADO. A versão anterior chamava `resolverEscopo` e descartava
  // o resultado -- autorizava a ABA e não recortava NADA. Como a consulta usa
  // `supabaseAdmin` (que passa por cima do RLS), o efeito era esta função
  // devolver o modelo de trabalho de TODOS os departamentos para qualquer
  // pessoa que pudesse abrir Demográficos, e a tabela "por departamento" da
  // tela desenhava todos eles.
  //
  // Não era o filtro da barra sendo ignorado: era escopo de acesso ausente.
  return resolverEscopo(userEmail, 'demographics');
}

export interface WorkModelRow {
  snapshot_month: string;
  scope_type: 'overall' | 'department';
  scope: string;
  model: string;
  n: number;
  position: number;
}

export const getWorkModel = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  // A barra tem filtro de departamento e esta função não o recebia: a tela de
  // Demográficos nem lia `filters`. O gráfico de modelo de trabalho ficava com
  // a empresa toda embaixo de um rótulo que dizia o nome de uma área.
  .validator((input: unknown) => DeptFilterInput.parse(input))
  .handler(async ({ context, data: input }): Promise<WorkModelRow[]> => {
    const escopo = await authorize(context.claims.email as string | undefined);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { isGlobalProfile, normalizeDept } = await import('@/lib/permissions');
    const { selectedDept, visibleWithFilter } = await import('@/lib/dept-filter');
    const sel = selectedDept(input);
    const db = supabaseAdmin as unknown as UntypedClient;
    const { data, error } = await db
      .from('work_model_snapshot')
      .select('*')
      .order('position', { ascending: true });
    if (error) throw new Error(`Falha ao carregar modelo de trabalho: ${error.message}`);

    const linhas = (data ?? []) as WorkModelRow[];
    // Sem escopo e sem seleção, nada muda: é o caso do admin sem filtro.
    if (isGlobalProfile(escopo.scope.profile) && !sel) return linhas;

    // ------------------------------------------------------------------
    // O `overall` DA EMPRESA NÃO PODE SOBREVIVER A UM ESCOPO
    // ------------------------------------------------------------------
    // Devolver as linhas do departamento da pessoa e manter o `overall` seria
    // entregar um agregado que INCLUI as outras áreas -- e a regra aqui é que
    // uma área não vê a outra nem em agregado que a contenha.
    //
    // Então o `overall` é recalculado como a soma das áreas da própria pessoa.
    // O gráfico continua respondendo "como é o modelo de trabalho no meu
    // mundo", que é a pergunta que ele faz, e passa a ser verdade sobre o
    // mundo dela.
    // `visibleWithFilter` = permissão E seleção no mesmo ponto. Duas checagens
    // separadas seriam duas chances de alguém mexer só numa.
    const minhas = linhas.filter(
      (r) => r.scope_type === 'department' && visibleWithFilter(escopo.scope, r.scope, sel),
    );

    const somaPorModelo = new Map<string, { n: number; position: number }>();
    for (const r of minhas) {
      const a = somaPorModelo.get(r.model) ?? { n: 0, position: r.position };
      a.n += r.n;
      somaPorModelo.set(r.model, a);
    }
    const mes = minhas[0]?.snapshot_month ?? linhas[0]?.snapshot_month ?? '';
    const overall: WorkModelRow[] = [...somaPorModelo.entries()].map(([model, a]) => ({
      snapshot_month: mes,
      scope_type: 'overall',
      // O rótulo diz de que soma se trata. "Geral" numa tela recortada é a
      // mesma palavra para duas populações diferentes.
      scope: sel ?? (escopo.scope.departments.map(normalizeDept).join(', ') || 'suas áreas'),
      model,
      n: a.n,
      position: a.position,
    }));

    return [...overall, ...minhas];
  });
