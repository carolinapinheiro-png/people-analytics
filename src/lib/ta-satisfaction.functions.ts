import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isInScope,
  isGlobalProfile,
  canSeeIndividualData,
  type AccessScope,
} from '@/lib/permissions';

/**
 * Pesquisa de Satisfacao de TA (Google Forms), lida para o dashboard.
 *
 * DUAS DECISOES DE EXPOSICAO, tomadas com o dado na mao:
 *
 * 1. O NOME DA RECRUTADORA NAO SAI DAQUI. A pesquisa avalia quatro pessoas
 *    nomeadas. Com 20 respostas e 90% de nota 5, a diferenca entre a primeira e
 *    a ultima colocada vem de UM gestor -- ranquear isso seria ruido vestido de
 *    avaliacao de desempenho. O campo continua no banco para quando houver
 *    volume; simplesmente nao trafega.
 *
 * 2. OS COMENTARIOS SAO DADO INDIVIDUAL. Eles citam recrutadoras pelo nome no
 *    texto livre ("a Berna fez um trabalho..."), entao seguem a mesma regra de
 *    salario e desligamento: perfil que nao ve dado individual nao os recebe.
 *    Gestor de area recebe os da propria area.
 */

type UntypedClient = SupabaseClient<any, 'public', any>;

/**
 * Adaptador fino sobre `resolverEscopo`, que e o unico lugar do sistema que
 * decide quem voce e -- e o unico que sabe do "ver como". Antes cada arquivo
 * tinha sua propria copia desta consulta; treze copias, quatro formatos.
 *
 * A aba declarada ('recruitment') e permissao, nao decoracao: um perfil que nao a
 * enxerga leva 'Forbidden' aqui, e nao so deixa de ver o item no menu.
 */
async function authorize(userEmail: string | undefined) {
  const { resolverEscopo } = await import('@/lib/escopo.server');
  const e = await resolverEscopo(userEmail, 'recruitment');
  return { scope: e.scope, podeVerIndividual: e.podeVerIndividual };
}

export interface DimensionScore {
  key: string;
  label: string;
  avg: number;
  n: number;
}
export interface AreaScore {
  area: string;
  avg: number;
  n: number;
}
export interface SurveyComment {
  area: string;
  period: string;
  text: string;
  overall: number | null;
}
export interface TaSatisfactionData {
  responses: number;
  /** Vagas fechadas no mesmo recorte -- denominador honesto da cobertura. */
  closedJobs: number;
  firstAt: string | null;
  lastAt: string | null;
  dimensions: DimensionScore[];
  byArea: AreaScore[];
  comments: SurveyComment[];
  /** false quando o perfil nao pode ver texto livre; a tela explica o vazio. */
  canSeeComments: boolean;
  /**
   * Verdadeiro quando as notas nao separam nada (todas as dimensoes coladas no
   * topo). A tela precisa dizer isso, senao cinco barras iguais parecem defeito
   * do grafico em vez de propriedade do instrumento.
   */
  ceilingEffect: boolean;
}

const DIMS = [
  { key: 'communication', label: 'Comunicação' },
  { key: 'understanding', label: 'Entendimento do requisito' },
  { key: 'organization', label: 'Organização do processo' },
  { key: 'consultative', label: 'Postura consultiva' },
  { key: 'overall', label: 'Satisfação geral' },
] as const;

const avg = (ns: number[]) =>
  ns.length ? Math.round((ns.reduce((s, n) => s + n, 0) / ns.length) * 100) / 100 : 0;

export const getTaSatisfaction = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TaSatisfactionData> => {
    const { scope, podeVerIndividual } = await authorize(context.claims.email as string | undefined);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const db = supabaseAdmin as unknown as UntypedClient;

    // recruiter fica FORA do select de proposito (ver cabecalho).
    const { data, error } = await db
      .from('ta_satisfaction')
      .select(
        'submitted_at, period_raw, area, communication, understanding, organization, consultative, overall, comment',
      )
      .order('submitted_at', { ascending: true });
    if (error) throw new Error(`Falha ao carregar satisfação de TA: ${error.message}`);

    type Row = {
      submitted_at: string;
      period_raw: string | null;
      area: string | null;
      communication: number | null;
      understanding: number | null;
      organization: number | null;
      consultative: number | null;
      overall: number | null;
      comment: string | null;
    };
    const all = (data ?? []) as Row[];
    const global = isGlobalProfile(scope.profile);
    const rows = all.filter((r) => global || isInScope(scope, r.area));

    const dimensions = DIMS.map((d) => {
      const vals = rows.map((r) => r[d.key]).filter((v): v is number => v != null);
      return { key: d.key, label: d.label, avg: avg(vals), n: vals.length };
    });

    const byAreaMap = new Map<string, number[]>();
    for (const r of rows) {
      if (r.overall == null) continue;
      const k = r.area || 'SEM ÁREA';
      byAreaMap.set(k, [...(byAreaMap.get(k) ?? []), r.overall]);
    }
    const byArea = [...byAreaMap.entries()]
      .map(([area, vals]) => ({ area, avg: avg(vals), n: vals.length }))
      .sort((a, b) => a.avg - b.avg);

    const podeVerTexto = podeVerIndividual;
    const comments: SurveyComment[] = podeVerTexto
      ? rows
          .filter((r) => r.comment && r.comment.trim().length > 0)
          .map((r) => ({
            area: r.area || 'SEM ÁREA',
            period: r.period_raw ?? '',
            text: r.comment!.trim(),
            overall: r.overall,
          }))
          .reverse()
      : [];

    // Cobertura: respostas contra vagas fechadas no MESMO escopo de area.
    const { data: rec } = await db
      .from('recruitment_monthly')
      .select('department, closed_jobs');
    const closedJobs = ((rec ?? []) as Array<{ department: string; closed_jobs: number }>)
      .filter((r) => global || isInScope(scope, r.department))
      .reduce((s, r) => s + r.closed_jobs, 0);

    // Teto: todas as dimensoes com media >= 4.5 e amplitude menor que 0.3.
    const medias = dimensions.filter((d) => d.n > 0).map((d) => d.avg);
    const ceilingEffect =
      medias.length > 1 &&
      Math.min(...medias) >= 4.5 &&
      Math.max(...medias) - Math.min(...medias) < 0.3;

    return {
      responses: rows.length,
      closedJobs,
      firstAt: rows.length ? rows[0].submitted_at : null,
      lastAt: rows.length ? rows[rows.length - 1].submitted_at : null,
      dimensions,
      byArea,
      comments,
      canSeeComments: podeVerTexto,
      ceilingEffect,
    };
  });
