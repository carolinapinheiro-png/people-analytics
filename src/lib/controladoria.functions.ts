import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';

/**
 * Baixa a base mensal do report de headcount da Controladoria.
 *
 * ===========================================================================
 * POR QUE ISTO É UM BOTÃO, E NÃO UM SCRIPT
 * ===========================================================================
 * Este report é feito todo mês, sempre igual: exportar do Convenia, colar na
 * aba `dados`, atualizar o pivô. Um script na minha mão resolve agosto e
 * ninguém consegue rodar em setembro.
 *
 * O botão devolve o CSV com as 17 colunas na ordem da planilha, pronto para
 * colar. E devolve junto a contagem do que ficou sem empresa, porque esse é o
 * número que decide se o arquivo pode ir para a Controladoria hoje.
 *
 * A montagem das linhas mora em `controladoria.ts`, sem banco e com teste --
 * é lá que os erros de mapeamento moram.
 */
async function authorizeAdmin(userEmail: string | undefined) {
  const { exigirAdmin } = await import('@/lib/escopo.server');
  return exigirAdmin(userEmail, 'baixar a base do report da Controladoria');
}

export interface BaseDoMes {
  rotulo: string;
  /** As 17 colunas, para o cabeçalho da planilha. */
  colunas: string[];
  linhas: string[][];
  /** Quantas ficaram sem Company. O número que decide se dá para usar. */
  semEmpresa: number;
  /** Quantas ainda não foram lidas com o código atual -- fila da carga. */
  naoLidos: number;
  /** Admitidos DEPOIS do mês pedido, tirados da base. */
  admitidosDepois: number;
  /**
   * Pessoas que estavam ativas no mês pedido e já saíram desde então.
   *
   * Elas DEVERIAM estar nesta base e não estão: a carga lê o cadastro de hoje,
   * e quem saiu não está mais nele. `convenia_leavers` guarda o desligamento
   * mas não guarda o nome, então dá para contar e não dá para repor. Quanto
   * mais antigo o mês, maior este número -- é a medida do que só a foto mensal
   * do cadastro resolve.
   */
  saidosDepois: number;
}

export const baseControladoria = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    ano: z.number().int().min(2020).max(2100),
    mes: z.number().int().min(1).max(12),
  }).parse(d))
  .handler(async ({ context, data }): Promise<BaseDoMes> => {
    await authorizeAdmin(context.claims.email as string | undefined);

    const { montarLinhas, rotuloDoMes, semEmpresa, COLUNAS, fimDoMes, admitidoAte } =
      await import('@/lib/controladoria');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const db = supabaseAdmin as unknown as {
      from: (t: string) => { select: (c: string) => PromiseLike<{ data: unknown[] | null }> };
    };

    const { data: org } = await db.from('org_pessoas')
      .select('convenia_id, nome, department, supervisor_id');
    const { data: cad } = await db.from('convenia_pessoas')
      .select('convenia_id, empresa, escritorio, cost_center, hiring_date, status, custom_fields, job_title_em');
    const { data: saidas } = await db.from('convenia_leavers')
      .select('convenia_id, hiring_month, dismissal_month');

    type Org = { convenia_id: string; nome: string | null; department: string | null; supervisor_id: string | null };
    type Cad = {
      convenia_id: string; empresa: string | null; escritorio: string | null;
      cost_center: string | null; hiring_date: string | null; status: string | null;
      custom_fields: unknown; job_title_em: string | null;
    };
    const pessoas = (org ?? []) as Org[];
    const porId = new Map(((cad ?? []) as Cad[]).map((c) => [c.convenia_id, c]));
    // O gestor sai do organograma, e não de um campo de texto: o nome digitado
    // envelhece a cada troca de gestor, o `supervisor_id` não.
    const nomePorId = new Map(pessoas.map((p) => [p.convenia_id, p.nome]));

    const { lerCustomFields } = await import('@/lib/convenia/custom-fields');

    // O mês pedido deixa de ser só carimbo. Quem foi admitido depois do fim do
    // mês sai da base: rodando setembro, agosto não pode conter quem entrou em
    // setembro.
    const fim = fimDoMes(data.ano, data.mes);
    const noMes = pessoas.filter((p) => admitidoAte(porId.get(p.convenia_id)?.hiring_date ?? null, fim));

    const linhas = montarLinhas(
      noMes.map((p) => {
        const c = porId.get(p.convenia_id);
        return {
          nome: p.nome,
          status: c?.status ?? null,
          department: p.department,
          cost_center: c?.cost_center ?? null,
          hiring_date: c?.hiring_date ?? null,
          empresa: c?.empresa ?? null,
          escritorio: c?.escritorio ?? null,
          gestor: p.supervisor_id ? (nomePorId.get(p.supervisor_id) ?? null) : null,
          personalizados: lerCustomFields(c?.custom_fields),
        };
      }),
      rotuloDoMes(data.ano, data.mes),
    );

    return {
      rotulo: rotuloDoMes(data.ano, data.mes),
      colunas: [...COLUNAS],
      linhas,
      semEmpresa: semEmpresa(linhas),
      // Quem ainda não passou pelo laço de detalhe não tem campo personalizado
      // nenhum, e sairia com metade das colunas vazias. Contar aqui evita que
      // isso pareça "o Convenia não tem o dado".
      naoLidos: noMes.filter((p) => !porId.get(p.convenia_id)?.job_title_em).length,
      admitidosDepois: pessoas.length - noMes.length,
      // Estava dentro no mês pedido e já saiu: admitida até o fim do mês e
      // desligada depois dele. `convenia_leavers` não guarda o nome, então
      // conta-se e não se repõe.
      saidosDepois: ((saidas ?? []) as Array<{
        hiring_month: string | null; dismissal_month: string | null;
      }>).filter((s) => {
        const mesPedido = fim.slice(0, 7);
        const entrou = (s.hiring_month ?? '').slice(0, 7);
        const saiu = (s.dismissal_month ?? '').slice(0, 7);
        return saiu > mesPedido && (!entrou || entrou <= mesPedido);
      }).length,
    };
  });
