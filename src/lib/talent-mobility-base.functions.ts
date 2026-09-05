import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
import { COLUNAS_TALENT } from '@/lib/talent-mobility';
import type { PessoaTalent, SaidaTalent } from '@/lib/talent-mobility-base';

/**
 * A base do Talent Mobility Data Model, 51 colunas.
 *
 * ===========================================================================
 * O LOG É GRAVADO ANTES DE DEVOLVER, E A FALHA DELE ABORTA
 * ===========================================================================
 * Este arquivo leva nome completo, data de nascimento e salário individual de
 * 637 pessoas na mesma linha. É o artefato mais sensível que este sistema
 * produz -- mais do que a tabela de leavers, que já tem log obrigatório.
 *
 * Gravar depois de devolver seria log de melhor esforço: uma falha do banco
 * produziria um download sem rastro, silenciosamente. Gravar antes, e abortar
 * se não conseguir, significa que um arquivo baixado é um arquivo registrado.
 * O custo é uma escrita a mais; o benefício é a frase "todo download está no
 * log" continuar verdadeira sem depender de sorte.
 */
export interface BaseTalent {
  colunas: string[];
  linhas: string[][];
  rotulo: string;
  /** Colunas com célula vazia, e quantas. Vazio é visível. */
  vazios: { coluna: string; vazios: number }[];
  /** Admitidos depois do mês pedido, tirados da base. */
  admitidosDepois: number;
  /** Ainda não relidos pela carga: saem sem campo personalizado. */
  semCadastroCompleto: number;
}

const MESES = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.',
  'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];

export const baseTalentMobility = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    ano: z.number().int().min(2013).max(2100),
    mes: z.number().int().min(1).max(12),
  }).parse(d))
  .handler(async ({ context, data }): Promise<BaseTalent> => {
    const email = context.claims.email as string | undefined;
    const { exigirAdmin } = await import('@/lib/escopo.server');
    await exigirAdmin(email, 'baixar a base do Talent Mobility');

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { montarLinhasTalent, vaziosPorColuna } = await import('@/lib/talent-mobility-base');
    const { fimDoMes } = await import('@/lib/controladoria');
    const { noMesDeReferencia } = await import('@/lib/talent-mobility');

    const db = supabaseAdmin as unknown as {
      from: (t: string) => {
        select: (c: string) => PromiseLike<{ data: unknown[] | null }> & {
          lt: (col: string, v: string) => {
            order: (col: string, o: { ascending: boolean }) => PromiseLike<{ data: unknown[] | null }>;
          };
        };
        insert: (v: unknown) => PromiseLike<{ error: { message: string } | null }>;
      };
    };

    const [{ data: cad }, { data: org }, { data: saidasRaw }, { data: mapaRaw }] = await Promise.all([
      db.from('convenia_pessoas').select(
        'convenia_id, job_title, empresa, escritorio, cost_center, hiring_date, status,'
        + ' custom_fields, registration, social_name, team, relationship, uf, salary, birth_date',
      ),
      db.from('org_pessoas').select('convenia_id, nome, email, supervisor_id, department'),
      db.from('convenia_leavers').select('convenia_id, dismissal_month, dismissal_date, dismissal_type'),
      db.from('talent_mobility_mapa').select('coluna, campo, origem'),
    ]);

    // As fotos dos meses ANTERIORES ao pedido, da mais recente para a mais
    // antiga. É delas que sai o carry-forward dos campos personalizados --
    // hoje feito na mão, e responsável por Compensation Grade sair em 73%.
    const { data: fotosRaw } = await db.from('convenia_cadastro_mensal')
      .select('mes, convenia_id, dados')
      .lt('mes', `${data.ano}-${String(data.mes).padStart(2, '0')}`)
      .order('mes', { ascending: false });
    const fotosPorPessoa = new Map<string, { nome: string; valor: string }[][]>();
    for (const f of (fotosRaw ?? []) as Array<{ convenia_id: string; dados: { custom_fields?: unknown } }>) {
      const cf = Array.isArray(f.dados?.custom_fields)
        ? (f.dados.custom_fields as { nome: string; valor: string }[])
        : [];
      const lista = fotosPorPessoa.get(f.convenia_id) ?? [];
      lista.push(cf);
      fotosPorPessoa.set(f.convenia_id, lista);
    }

    type LinhaCad = {
      convenia_id: string; job_title: string | null; empresa: string | null;
      escritorio: string | null; cost_center: string | null; hiring_date: string | null;
      status: string | null; custom_fields: unknown; registration: string | null;
      social_name: string | null; team: string | null; relationship: string | null;
      uf: string | null; salary: number | null; birth_date: string | null;
    };
    type LinhaOrg = {
      convenia_id: string; nome: string | null; email: string | null;
      supervisor_id: string | null; department: string | null;
    };

    const porOrg = new Map(((org ?? []) as LinhaOrg[]).map((o) => [o.convenia_id, o]));
    const pessoas: PessoaTalent[] = ((cad ?? []) as LinhaCad[]).map((c) => {
      const o = porOrg.get(c.convenia_id);
      return {
        id: c.convenia_id,
        nome: o?.nome ?? null, email: o?.email ?? null,
        supervisorId: o?.supervisor_id ?? null, department: o?.department ?? null,
        job_title: c.job_title, team: c.team, cost_center: c.cost_center,
        empresa: c.empresa, escritorio: c.escritorio, status: c.status,
        hiring_date: c.hiring_date, registration: c.registration,
        social_name: c.social_name, relationship: c.relationship, uf: c.uf,
        salary: c.salary, birth_date: c.birth_date,
        personalizados: Array.isArray(c.custom_fields)
          ? (c.custom_fields as { nome: string; valor: string }[])
          : [],
        personalizadosAnteriores: fotosPorPessoa.get(c.convenia_id) ?? [],
      };
    });

    const saidas = new Map<string, SaidaTalent>(
      ((saidasRaw ?? []) as {
        convenia_id: string; dismissal_month: string | null;
        dismissal_date: string | null; dismissal_type: string | null;
      }[])
        // `data` é a data inteira, para as colunas que pedem dia; `mes` é o que
        // decide se a pessoa entra no arquivo do mês. Antes as duas eram o mês,
        // e `dataBR` recusava YYYY-MM -- daí End Employment Date em 0 de 639.
        .map((s) => [s.convenia_id, {
          data: s.dismissal_date, mes: s.dismissal_month, tipo: s.dismissal_type,
        }]),
    );
    const mapa = new Map(
      ((mapaRaw ?? []) as { coluna: string; campo: string; origem: string }[])
        .map((m) => [m.coluna, { campo: m.campo, origem: m.origem }]),
    );

    // O mês FILTRA, e filtra dos DOIS lados: quem entrou depois do fim do mês
    // não estava lá, e quem saiu antes do início também não. Conferido contra
    // julho: 654 linhas, 16 delas desligadas, e as 18 datas de saída do arquivo
    // são todas daquele mês. Filtrar só pela admissão daria 801 -- os 172
    // desligados desde 2024 entrariam todos, e o retrato do mês viraria um
    // cadastro acumulado.
    const fim = fimDoMes(data.ano, data.mes);
    const inicio = `${data.ano}-${String(data.mes).padStart(2, '0')}-01`;
    const noMes = pessoas.filter((p) =>
      noMesDeReferencia(p.hiring_date, saidas.get(p.id)?.mes ?? null, inicio, fim));

    const linhas = montarLinhasTalent(noMes, mapa, saidas, fim);
    const rotulo = `${MESES[data.mes - 1]}/${data.ano}`;

    // ------------------------------------------------------------------
    // O LOG ANTES DO ARQUIVO
    // ------------------------------------------------------------------
    // Se esta escrita falhar, o download não acontece. É deliberado: um log
    // que às vezes não grava não sustenta a frase "todo acesso está
    // registrado", e essa frase é a razão de o salário poder estar aqui.
    const { error: erroLog } = await db.from('talent_mobility_download_log').insert({
      baixado_por: email ?? 'desconhecido',
      linhas: linhas.length,
      mes_alvo: `${data.ano}-${String(data.mes).padStart(2, '0')}`,
      campos_sensiveis: ['Full Legal Name', 'Date of Birth', 'Basic Salary'],
    });
    if (erroLog) throw new Error(`Download cancelado: o registro de acesso não gravou (${erroLog.message}).`);

    return {
      colunas: [...COLUNAS_TALENT],
      linhas,
      rotulo,
      vazios: vaziosPorColuna(linhas),
      admitidosDepois: pessoas.length - noMes.length,
      // Quem a carga ainda não releu sai sem campo personalizado -- Job
      // Family, Career Band, Compensation Grade e FTE vêm de lá.
      semCadastroCompleto: noMes.filter((p) => p.personalizados.length === 0).length,
    };
  });
