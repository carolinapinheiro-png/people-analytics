import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DeptFilterInput, selectedDept } from '@/lib/dept-filter';
import { normalizeDept } from '@/lib/permissions';

/**
 * Span de controle, calculado AO VIVO da cadeia real de reporte
 * (`org_pessoas.supervisor_id`) a cada carregamento da aba -- a mesma fonte
 * que já alimenta a Camada N da aba de Salários, e que é reescrita a cada
 * sincronização do Convenia (ver sync.server.ts). Nada fica gravado aqui:
 * não existe mais um snapshot mensal para alguém lembrar de rodar de novo.
 *
 * Antes disto, a aba lia de `span_snapshot`, uma tabela gravada uma vez em
 * jul/2026 por um script à parte -- e ficou parada dois meses sem ninguém
 * notar, porque nada na tela dizia que era foto velha.
 *
 * Só agregados (gestores, reports, span médio); sem nomes individuais.
 */

type UntypedClient = SupabaseClient<any, 'public', any>;

/**
 * Adaptador fino sobre `resolverEscopo`, que e o unico lugar do sistema que
 * decide quem voce e -- e o unico que sabe do "ver como". Antes cada arquivo
 * tinha sua propria copia desta consulta; treze copias, quatro formatos.
 *
 * A aba declarada ('span') e permissao, nao decoracao: um perfil que nao a
 * enxerga leva 'Forbidden' aqui, e nao so deixa de ver o item no menu.
 */
async function authorize(userEmail: string | undefined) {
  const { resolverEscopo } = await import('@/lib/escopo.server');
  await resolverEscopo(userEmail, 'span');
}

export interface SpanRow {
  scope_type: 'overall' | 'department' | 'distribution';
  scope: string;
  managers: number | null;
  reports: number | null;
  avg_span: number | null;
  actives: number | null;
  ics: number | null;
  position: number;
}

type OrgRow = { convenia_id: string; supervisor_id: string | null; department: string | null };

/**
 * Quem está fora do headcount ativo.
 *
 * A PRIMEIRA VERSÃO checava `convenia_pessoas.status != 'Desligado'` -- e não
 * excluía NINGUÉM: em 646 pessoas de `org_pessoas`, o status vem só como
 * "Ativo", "Em férias" ou nulo. Nunca "Desligado". O campo só é atualizado
 * quando a pessoa aparece na LISTAGEM DE ATIVOS do Convenia naquela
 * sincronização -- quando ela sai, a linha simplesmente para de ser tocada
 * e o status fica congelado no último valor que tinha. `org_pessoas` é
 * upsert-only pelo mesmo motivo (ver a migração `20260814200000`): ninguém
 * apaga quem sai, então sem um filtro que funcione de verdade, quem saiu
 * meses atrás continua contando como ativo, e até como gestor, para sempre.
 *
 * A régua que realmente funciona é a mesma que a série mensal usa para
 * headcount (ver `reconstruirSerie` em pessoas.ts): não confiar em nenhum
 * campo de status, e sim checar se a pessoa está na listagem de DESLIGADOS
 * (`convenia_leavers`). Testado contra o headcount oficial de set/2026 (636):
 * o filtro por status devolvia 646 ativos; por ausência em `convenia_leavers`,
 * 640 -- os 4 que sobram são desligamentos recentes que a listagem do
 * Convenia ainda não capturou, e se resolvem sozinhos na sincronização
 * semanal seguinte (mesma defasagem que já existe no resto da carga).
 */
function paraAtivo(orgRow: OrgRow, desligados: Set<string>) {
  return !desligados.has(orgRow.convenia_id);
}

const SEM_DEPTO = 'SEM DEPTO';
const deptoDe = (v: string | null) => normalizeDept(v) || SEM_DEPTO;

/** Faixas de tamanho de time, na ordem em que aparecem na tela. */
const FAIXAS_DISTRIBUICAO: Array<{ scope: string; min: number; max: number }> = [
  { scope: '1-3 reports', min: 1, max: 3 },
  { scope: '4-6 reports', min: 4, max: 6 },
  { scope: '7-9 reports', min: 7, max: 9 },
  { scope: '10+ reports', min: 10, max: Infinity },
];

export const getSpanSnapshot = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => DeptFilterInput.parse(input))
  .handler(async ({ context, data: input }): Promise<SpanRow[]> => {
    await authorize(context.claims.email as string | undefined);
    const sel = selectedDept(input);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const db = supabaseAdmin as unknown as UntypedClient;

    const [{ data: orgData, error: orgErr }, { data: leaverData, error: leaverErr }] =
      await Promise.all([
        db.from('org_pessoas').select('convenia_id, supervisor_id, department'),
        db.from('convenia_leavers').select('convenia_id'),
      ]);
    if (orgErr) throw new Error(`Falha ao carregar o organograma: ${orgErr.message}`);
    if (leaverErr) throw new Error(`Falha ao carregar os desligados: ${leaverErr.message}`);

    const orgRows = (orgData ?? []) as OrgRow[];
    const desligados = new Set(
      (leaverData as Array<{ convenia_id: string }> ?? []).map((r) => String(r.convenia_id)),
    );

    const ativos = orgRows
      .filter((r) => paraAtivo(r, desligados))
      .map((r) => ({
        id: String(r.convenia_id),
        supervisorId: r.supervisor_id ? String(r.supervisor_id) : null,
        depto: deptoDe(r.department),
      }));

    const idsAtivos = new Set(ativos.map((p) => p.id));
    const deptoPorId = new Map(ativos.map((p) => [p.id, p.depto]));

    // Reports por gestor. Só conta quando o supervisor TAMBÉM está entre os
    // ativos -- supervisor desligado ou fantasma (id fora da base) não vira
    // "gestor" aqui, mesmo que ainda apareça no campo do Convenia.
    const reportsPorGestor = new Map<string, number>();
    for (const p of ativos) {
      if (p.supervisorId && idsAtivos.has(p.supervisorId)) {
        reportsPorGestor.set(p.supervisorId, (reportsPorGestor.get(p.supervisorId) ?? 0) + 1);
      }
    }

    const totalAtivos = ativos.length;
    const totalGestores = reportsPorGestor.size;
    const totalReports = [...reportsPorGestor.values()].reduce((a, b) => a + b, 0);

    const rows: SpanRow[] = [{
      scope_type: 'overall', scope: 'Empresa',
      managers: totalGestores, reports: totalReports,
      avg_span: totalGestores > 0 ? totalReports / totalGestores : null,
      actives: totalAtivos, ics: Math.max(0, totalAtivos - totalGestores),
      position: 0,
    }];

    // Por departamento: o departamento é o do GESTOR (onde ele está lotado);
    // soma-se os reports de todos os gestores daquele departamento -- é a
    // mesma leitura que a tela sempre mostrou ("reports por gestor").
    const porDepto = new Map<string, { managers: number; reports: number }>();
    for (const [gestorId, n] of reportsPorGestor) {
      const depto = deptoPorId.get(gestorId) ?? SEM_DEPTO;
      const acc = porDepto.get(depto) ?? { managers: 0, reports: 0 };
      acc.managers += 1;
      acc.reports += n;
      porDepto.set(depto, acc);
    }
    let pos = 1;
    for (const [depto, { managers, reports }] of [...porDepto.entries()]
      .sort((a, b) => b[1].reports / b[1].managers - a[1].reports / a[1].managers)) {
      rows.push({
        scope_type: 'department', scope: depto,
        managers, reports, avg_span: reports / managers,
        actives: null, ics: null, position: pos++,
      });
    }

    // Distribuição do tamanho de time.
    const tamanhos = [...reportsPorGestor.values()];
    for (const faixa of FAIXAS_DISTRIBUICAO) {
      rows.push({
        scope_type: 'distribution', scope: faixa.scope,
        managers: tamanhos.filter((n) => n >= faixa.min && n <= faixa.max).length,
        reports: null, avg_span: null, actives: null, ics: null,
        position: pos++,
      });
    }

    if (!sel) return rows;

    // Filtro conservador de propósito: com um departamento selecionado,
    // devolve SÓ as linhas daquele departamento. 'overall' e 'distribution'
    // são da empresa inteira -- mantê-las ao lado de um recorte faria número
    // de empresa passar por número de área, que é o erro mais caro aqui.
    return rows.filter((r) => r.scope_type === 'department' && r.scope === sel);
  });
