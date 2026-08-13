import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DeptFilterInput, selectedDept } from '@/lib/dept-filter';

/**
 * Span de controle calculado da cadeia real de reporte (Talent Mobility).
 * So agregados (gestores, reports, span medio); sem nomes individuais.
 */

type UntypedClient = SupabaseClient<any, 'public', any>;

/**
 * Adaptador fino sobre `resolverEscopo`, que e o unico lugar do sistema que
 * decide quem voce e -- e o unico que sabe do "ver como". Antes cada arquivo
 * tinha sua propria copia desta consulta; treze copias, quatro formatos.
 */
async function authorize(userEmail: string | undefined) {
  const { resolverEscopo } = await import('@/lib/escopo.server');
  await resolverEscopo(userEmail);
}

export interface SpanRow {
  snapshot_month: string;
  scope_type: 'overall' | 'department' | 'distribution';
  scope: string;
  managers: number | null;
  reports: number | null;
  avg_span: number | null;
  actives: number | null;
  ics: number | null;
  position: number;
}

export const getSpanSnapshot = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => DeptFilterInput.parse(input))
  .handler(async ({ context, data: input }): Promise<SpanRow[]> => {
    await authorize(context.claims.email as string | undefined);
    const sel = selectedDept(input);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const db = supabaseAdmin as unknown as UntypedClient;
    const { data, error } = await db
      .from('span_snapshot')
      .select('*')
      .order('position', { ascending: true });
    if (error) throw new Error(`Falha ao carregar span: ${error.message}`);
    const rows = (data ?? []) as SpanRow[];
    if (!sel) return rows;

    // Filtro conservador de propósito: com um departamento selecionado, devolve
    // SÓ as linhas daquele departamento. As linhas 'overall' e 'distribution'
    // são da empresa inteira -- mantê-las ao lado de um recorte faria número de
    // empresa passar por número de área, que é o erro mais caro aqui. Se a aba
    // ficar vazia para algum departamento, é porque não há linha dele: falha
    // visível é melhor que número enganoso.
    return rows.filter(
      (r) => r.scope_type === 'department' && r.scope?.trim().toUpperCase() === sel,
    );
  });
