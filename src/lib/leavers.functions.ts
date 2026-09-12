import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  canSeeIndividualData,
  isInScope,
  normalizeDept,
} from '@/lib/permissions';
import { classificarSaida, faixaTempoPorMeses } from '@/lib/convenia/pessoas';
import { salaryBand } from '@/lib/person-bands';

/**
 * O types.ts do Supabase e gerado automaticamente e ainda nao conhece as
 * tabelas criadas nesta etapa (leavers, leavers_access_log, monthly_metrics,
 * salary_bands, company_bu_map). Enquanto ele nao for regenerado, tipar as
 * linhas aqui e melhor do que espalhar `as any` pelas chamadas: a forma da
 * linha continua verificada, so o nome da tabela deixa de ser.
 */
export interface LeaverRow {
  id: string;
  nome: string;
  genero: string | null;
  raca: string | null;
  salario: number | null;
  vinculo: string | null;
  cargo: string | null;
  departamento: string | null;
  time: string | null;
  level: string | null;
  job_family: string | null;
  career_band: string | null;
  workday_level: string | null;
  data_desligamento_str: string | null;
  tipo_desligamento: string | null;
  motivo_desligamento: string | null;
  data_desligamento: string | null;
  data_admissao: string | null;
  tempo_casa_dias: number | null;
  faixa_salarial: string | null;
  tempo_casa_faixa: string | null;
  mes_desligamento: string | null;
  ano_desligamento: string | null;
  tipo_desligamento_agrupado: string | null;
}

/** Cliente sem o generic de Database, so para as tabelas ainda nao geradas. */
type UntypedClient = SupabaseClient<any, 'public', any>;

/**
 * Acesso a dado individual de pessoas desligadas.
 *
 * A leitura é `convenia_leavers`, sincronizada automaticamente pelo Convenia
 * (ver sync.server.ts) -- não mais `leavers`, que era carga manual de
 * planilha e ficou dois meses sem atualizar (65 desligamentos em 2026, contra
 * 173 que o Convenia já tinha). `leavers` continua existindo só pela função
 * `seedLeavers`, de uma carga que já rodou; nada mais neste arquivo a lê.
 *
 * Nenhuma das duas tabelas tem policy de SELECT: nem `authenticated` nem
 * `anon` conseguem le-las. O unico caminho e este modulo, que roda no servidor
 * com service_role. Isso existe por dois motivos:
 *
 *   1. O dado nao vai mais para o bundle do navegador. Antes, um import de
 *      leavers-data.ts entregava as 152 pessoas -- com nome, raca e salario --
 *      a qualquer um que abrisse o DevTools, independentemente do que a tela
 *      mostrava.
 *   2. Decisao da area: toda consulta e registrada. Registrar exige um ponto
 *      unico de passagem, e este e ele.
 *
 * Nunca exporte um cliente Supabase daqui, nem chame a tabela direto do React.
 */

/** Autoriza pelo mesmo criterio do resto do app: estar em allowed_emails. */
/**
 * Adaptador fino sobre `resolverEscopo`, que e o unico lugar do sistema que
 * decide quem voce e -- e o unico que sabe do "ver como". Antes cada arquivo
 * tinha sua propria copia desta consulta; treze copias, quatro formatos.
 */
async function authorize(userEmail: string | undefined) {
  const { resolverEscopo } = await import('@/lib/escopo.server');
  const { canSeeTab } = await import('@/lib/permissions');
  const e = await resolverEscopo(userEmail);
  // Como a serie mensal, a lista de desligados e carregada pelo CONTEXTO do
  // painel, antes de qualquer aba ser escolhida. Lancar 'Forbidden' aqui
  // faria um perfil de aba unica ver um erro na propria aba a que tem
  // direito. Vazio e a resposta certa: nao ha desligados para este perfil.
  // `e.tabs` entrou junto: sem ele, uma pessoa com lista própria SEM Atrição
  // continuaria recebendo a lista de desligados. O preset dela ainda inclui a
  // aba, e era o preset que esta linha consultava.
  const podeVerDesligados = canSeeTab(e.profile, 'attrition', e.extraTabs, e.tabs);
  return {
    email: e.email, role: e.role, scope: e.scope, podeVerDesligados,
    podeVerIndividual: e.podeVerIndividual,
  };
}

const ListLeaversInput = z
  .object({
    /** Rotulo do que motivou a consulta, gravado no log. Ex: 'aba leavers'. */
    context: z.string().max(120).optional(),
  })
  .optional();

/** Linha crua de `convenia_leavers` -- ver a migração 20260909210000. */
export interface ConveniaLeaverRow {
  convenia_id: string;
  nome: string | null;
  cargo: string | null;
  department: string | null;
  hiring_month: string | null;
  dismissal_month: string | null;
  dismissal_date: string | null;
  dismissal_type: string | null;
  salary: number | string | null;
  level: string | null;
  job_type_family: string | null;
  genero: string | null;
  raca: string | null;
  vinculo: string | null;
}

/** 'voluntaria'/'involuntaria'/'outra' (ver classificarSaida) -> rótulo da tela. */
export const ROTULO_TIPO: Record<ReturnType<typeof classificarSaida>, string> = {
  voluntaria: 'Voluntário',
  involuntaria: 'Involuntário',
  outra: 'Outros',
};

/** Meses inteiros entre a admissão (mês) e o desligamento (dia certo). */
export function mesesDeCasa(hiringMonth: string | null, dismissalDate: string | null): number | null {
  if (!hiringMonth || !dismissalDate) return null;
  const [hy, hm] = hiringMonth.split('-').map(Number);
  const fim = new Date(dismissalDate);
  if (!hy || !hm || isNaN(fim.getTime())) return null;
  return Math.max(0, (fim.getFullYear() - hy) * 12 + (fim.getMonth() + 1 - hm));
}

/** Dias entre os mesmos dois pontos, para a média de tempo de casa em meses. */
export function diasDeCasa(hiringMonth: string | null, dismissalDate: string | null): number | null {
  if (!hiringMonth || !dismissalDate) return null;
  const inicio = new Date(`${hiringMonth}-01`);
  const fim = new Date(dismissalDate);
  if (isNaN(inicio.getTime()) || isNaN(fim.getTime())) return null;
  return Math.max(0, Math.round((fim.getTime() - inicio.getTime()) / 86_400_000));
}

/**
 * `convenia_leavers` -> a forma que a aba de Desligamentos já sabe ler.
 *
 * Antes a aba lia `leavers`, carga manual de planilha parada há dois meses
 * (65 desligamentos em 2026, contra 173 que o Convenia já conhece). As
 * colunas que faltavam para fazer essa troca -- salário, level, job family e
 * agora vínculo -- foram para `convenia_leavers` nas migrações
 * 20260909210000 e 20260912000000; o resto (faixa salarial, tempo de casa,
 * mês/ano de desligamento, tipo agrupado) é derivado aqui, na leitura, do
 * mesmo jeito que `person-bands.ts` já deriva para Comp Ratio e Meu Time.
 *
 * Cobertura parcial é esperada e não é erro: nome, salário e level vêm do
 * detalhe individual do Convenia, que a carga sincroniza em lotes -- quem
 * ainda não foi lido aparece com o campo em branco (`null`, que a tela já
 * sabe mostrar como "Não informado") e se resolve sozinho nas próximas
 * sincronizações semanais.
 */
export function paraLeaverRow(r: ConveniaLeaverRow): LeaverRow {
  const salario = r.salary != null ? Number(r.salary) : null;
  const meses = mesesDeCasa(r.hiring_month, r.dismissal_date);
  const tipo = r.dismissal_type ? ROTULO_TIPO[classificarSaida(r.dismissal_type)] : null;
  const depto = r.department ? normalizeDept(r.department) : null;
  return {
    id: r.convenia_id,
    nome: r.nome ?? 'Não informado',
    genero: r.genero,
    raca: r.raca,
    salario,
    vinculo: r.vinculo,
    cargo: r.cargo,
    departamento: depto,
    time: null,
    level: r.level,
    job_family: r.job_type_family,
    career_band: null,
    workday_level: null,
    data_desligamento_str: r.dismissal_date
      ? new Date(r.dismissal_date).toLocaleDateString('pt-BR', { timeZone: 'UTC' })
      : null,
    tipo_desligamento: r.dismissal_type,
    motivo_desligamento: null,
    data_desligamento: r.dismissal_date,
    data_admissao: r.hiring_month ? `${r.hiring_month}-01` : null,
    tempo_casa_dias: diasDeCasa(r.hiring_month, r.dismissal_date),
    faixa_salarial: salaryBand(salario),
    tempo_casa_faixa: meses != null ? faixaTempoPorMeses(meses) : null,
    mes_desligamento: r.dismissal_month,
    ano_desligamento: r.dismissal_month ? r.dismissal_month.slice(0, 4) : null,
    tipo_desligamento_agrupado: tipo,
  };
}

export const listLeavers = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => ListLeaversInput.parse(input))
  .handler(async ({ context, data }) => {
    const { email, scope, podeVerDesligados, podeVerIndividual } = await authorize(context.claims.email as string | undefined);
    if (!podeVerDesligados) return [];

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const db = supabaseAdmin as unknown as UntypedClient;
    const { data: rawRows, error } = await db
      .from('convenia_leavers')
      .select('convenia_id, nome, cargo, department, hiring_month, dismissal_month, dismissal_date, dismissal_type, salary, level, job_type_family, genero, raca, vinculo')
      .order('dismissal_date', { ascending: false });

    if (error) throw new Error(`Falha ao carregar desligados: ${error.message}`);

    const rows = ((rawRows ?? []) as ConveniaLeaverRow[]).map(paraLeaverRow);

    // Escopo e mascaramento aplicados no servidor: o perfil nunca recebe linha
    // fora dos seus departamentos, nem nome/salario quando nao tem direito.
    const scoped = rows.filter((r) => isInScope(scope, r.departamento, r.job_family));
    const visible = podeVerIndividual
      ? scoped
      : scoped.map((r) => ({ ...r, nome: 'Confidencial', salario: null, faixa_salarial: null }));

    // O log e requisito, nao efeito colateral opcional: se ele falhar, a
    // consulta falha junto. Devolver o dado sem registrar quem o viu
    // derrotaria o proposito de ter tirado o arquivo do bundle.
    const { error: logError } = await db.from('leavers_access_log').insert({
      user_email: email,
      rows_returned: visible.length,
      context: data?.context ?? null,
    });

    if (logError) {
      throw new Error(`Falha ao registrar acesso; consulta abortada: ${logError.message}`);
    }

    return visible as LeaverRow[];
  });

const SeedInput = z.object({
  records: z.array(z.record(z.unknown())).min(1).max(5000),
});

/**
 * Carga unica: move os registros que hoje vivem em leavers-data.ts para o
 * banco. Roda a partir da tela de admin, uma vez, e depois o arquivo pode ser
 * removido do repositorio.
 *
 * Restrito a admin. Usa upsert por id, entao rodar duas vezes nao duplica.
 */
export const seedLeavers = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => SeedInput.parse(input))
  .handler(async ({ context, data }) => {
    const { role } = await authorize(context.claims.email as string | undefined);
    if (role !== 'admin') throw new Error('Forbidden: apenas admin pode importar');

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const db = supabaseAdmin as unknown as UntypedClient;
    const { error, count } = await db
      .from('leavers')
      .upsert(data.records, { onConflict: 'id', count: 'exact' });

    if (error) throw new Error(`Falha na carga: ${error.message}`);

    return { imported: count ?? data.records.length };
  });
