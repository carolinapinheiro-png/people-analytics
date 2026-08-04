import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Qualidade de cadastro -- o que precisa ser corrigido NA ORIGEM.
 *
 * Por que existe: ao longo da construcao, o dashboard virou um bom detector de
 * erro de cadastro (desligado marcado como ativo, area fora do de-para, campo
 * nao preenchido). O problema e que cada achado virava workaround no codigo de
 * transformacao e o cadastro seguia errado -- ou seja, a gente escondia o
 * sintoma e preservava a doenca.
 *
 * Esta funcao inverte isso: transforma o achado numa lista com dono e
 * consequencia. Nao mostra nome de pessoa -- mostra quantos, onde, e o que
 * deixa de funcionar enquanto nao for corrigido. Quem for consertar precisa
 * localizar os registros no sistema de origem, e la o nome existe.
 */

type UntypedClient = SupabaseClient<any, 'public', any>;

async function authorize(userEmail: string | undefined) {
  if (!userEmail) throw new Error('Unauthorized');
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data, error } = await supabaseAdmin
    .from('allowed_emails')
    .select('role')
    .ilike('email', userEmail)
    .maybeSingle();
  if (error) throw new Error(`Access check failed: ${error.message}`);
  if (!data) throw new Error('Forbidden');
}

export interface QualityIssue {
  key: string;
  title: string;
  count: number;
  /** Onde estao (area, valor do campo), para quem for corrigir localizar. */
  where: string;
  /** O que para de funcionar enquanto isto existir. E o que justifica a fila. */
  impact: string;
  owner: 'DP / Cadastro' | 'Talent Acquisition' | 'People Analytics';
  severity: 'alta' | 'média' | 'baixa';
}

export const getDataQuality = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<QualityIssue[]> => {
    await authorize(context.claims.email as string | undefined);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const db = supabaseAdmin as unknown as UntypedClient;
    const issues: QualityIssue[] = [];

    const { data: people } = await db
      .from('comp_ratio')
      .select('area, level, job_type_family, team, in_comp_scope');
    const rows = (people ?? []) as Array<{
      area: string | null;
      level: string | null;
      job_type_family: string | null;
      team: string | null;
      in_comp_scope: boolean | null;
    }>;
    const empty = (v: string | null) => v == null || v.trim() === '';

    // 1. Sem job type family. Nao e cosmetico: o escopo de acesso do gestor pode
    //    ser por familia, entao quem esta sem familia fica INVISIVEL para esse
    //    gestor -- um buraco de permissao silencioso, nao um campo bonito vazio.
    const semFamilia = rows.filter((r) => empty(r.job_type_family));
    if (semFamilia.length) {
      const porArea = new Map<string, number>();
      for (const r of semFamilia) {
        const k = r.area?.trim() || '(sem área)';
        porArea.set(k, (porArea.get(k) ?? 0) + 1);
      }
      const top = [...porArea.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
      issues.push({
        key: 'sem_familia',
        title: 'Pessoas sem job type family',
        count: semFamilia.length,
        where: top.map(([a, n]) => `${a} (${n})`).join(', '),
        impact:
          'Gestor com escopo por família não enxerga essas pessoas — some do time dele sem aviso.',
        owner: 'DP / Cadastro',
        severity: 'alta',
      });
    }

    // 2. Sem nivel: quebra a piramide de senioridade e a comparacao salarial.
    const semNivel = rows.filter((r) => empty(r.level));
    if (semNivel.length) {
      issues.push({
        key: 'sem_nivel',
        title: 'Pessoas sem nível de senioridade',
        count: semNivel.length,
        where: `${semNivel.filter((r) => r.in_comp_scope === false).length} são da carga de People/diretoria (fora da base de comp)`,
        impact: 'Ficam fora da pirâmide de senioridade e da comparação salarial por nível.',
        owner: 'DP / Cadastro',
        severity: 'média',
      });
    }

    const semTime = rows.filter((r) => empty(r.team));
    if (semTime.length) {
      issues.push({
        key: 'sem_time',
        title: 'Pessoas sem time',
        count: semTime.length,
        where: [...new Set(semTime.map((r) => r.area?.trim() || '(sem área)'))].join(', '),
        impact: 'Recortes por time ficam incompletos.',
        owner: 'DP / Cadastro',
        severity: 'baixa',
      });
    }

    // 3. Area que nao existe no catalogo de departamentos. Como o de-para e por
    //    nome, um valor fora do catalogo nao casa com nada: a pessoa nao entra
    //    em nenhum recorte por departamento.
    const { data: depts } = await db.from('departments').select('name, aliases, active');
    const known = new Set<string>();
    for (const d of (depts ?? []) as Array<{ name: string; aliases: string[] | null }>) {
      known.add(d.name.trim().toUpperCase());
      for (const a of d.aliases ?? []) known.add(a.trim().toUpperCase());
    }
    const foraCatalogo = new Map<string, number>();
    for (const r of rows) {
      const a = r.area?.trim();
      if (!a) continue;
      if (!known.has(a.toUpperCase())) foraCatalogo.set(a, (foraCatalogo.get(a) ?? 0) + 1);
    }
    if (foraCatalogo.size) {
      const total = [...foraCatalogo.values()].reduce((s, n) => s + n, 0);
      issues.push({
        key: 'area_fora_catalogo',
        title: 'Área que não existe no catálogo de departamentos',
        count: total,
        where: [...foraCatalogo.entries()].map(([a, n]) => `"${a}" (${n})`).join(', '),
        impact:
          'Não casa com nenhum departamento conhecido: some dos recortes por área e do escopo de acesso. Corrigir o cadastro ou cadastrar como apelido do departamento certo.',
        owner: 'People Analytics',
        severity: 'alta',
      });
    }

    // 4. Ativos sem departamento vigente, direto da serie mensal.
    const { data: last } = await db
      .from('monthly_metrics')
      .select('month, headcount, pcd, dept_data')
      .eq('brand', 'NSX')
      .eq('source', 'reconstruido')
      .order('month', { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastRow = last as
      | { month: string; headcount: number; pcd: number | null; dept_data: Record<string, { hc: number }> | null }
      | null;
    if (lastRow) {
      const semDepto = lastRow.dept_data?.['SEM DEPTO']?.hc ?? 0;
      if (semDepto > 0) {
        issues.push({
          key: 'sem_depto',
          title: 'Ativos sem departamento vigente',
          count: semDepto,
          where: `mês de ${String(lastRow.month).slice(0, 7)}`,
          impact:
            'Aparecem como "SEM DEPTO" nos gráficos. Não é uma área — é registro faltando no histórico.',
          owner: 'DP / Cadastro',
          severity: 'média',
        });
      }
      // PCD subpreenchido nao e "pouca gente com deficiencia": e campo em branco.
      // Reportar a cota com esse dado subconta e pode virar problema legal.
      const pcd = lastRow.pcd ?? 0;
      const esperado = Math.round(lastRow.headcount * 0.02);
      if (pcd < esperado) {
        issues.push({
          key: 'pcd',
          title: 'Campo PCD quase não preenchido',
          count: pcd,
          where: `${pcd} marcados em ${lastRow.headcount} ativos`,
          impact:
            'Subconta a representatividade real. Cota legal calculada com este dado sai errada — o campo está vazio, não é ausência de PCD.',
          owner: 'DP / Cadastro',
          severity: 'alta',
        });
      }
    }

    // 5. Recrutamento: vaga sem departamento preenchido no ATS.
    const { data: rec } = await db
      .from('recruitment_monthly')
      .select('department, closed_jobs')
      .eq('department', 'SEM DEPTO');
    const vagasSemDepto = ((rec ?? []) as Array<{ closed_jobs: number }>).reduce(
      (s, r) => s + r.closed_jobs,
      0,
    );
    if (vagasSemDepto > 0) {
      issues.push({
        key: 'vaga_sem_depto',
        title: 'Vagas sem departamento no InHire',
        count: vagasSemDepto,
        where: 'campo personalizado "Departamento" em branco',
        impact: 'A vaga não entra em nenhum recorte por área nem no cruzamento com o quadro.',
        owner: 'Talent Acquisition',
        severity: 'média',
      });
    }

    const ordem = { alta: 0, média: 1, baixa: 2 };
    return issues.sort((a, b) => ordem[a.severity] - ordem[b.severity] || b.count - a.count);
  });
