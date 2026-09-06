import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
import type { LinhaWIL, PessoaWIL } from '@/lib/wil-location';

/**
 * A aba "Template - Location" do report do WIL/GPA, pronta para colar.
 *
 * Só NSX -- as três entidades. Quem fica de fora por não ser NSX e quem fica
 * por não ter `Job Type Family` são contados em separado: uma exclusão é regra
 * do report, a outra é cadastro incompleto, e somá-las esconderia a segunda.
 *
 * As três colunas de vaga aberta saem VAZIAS. Elas vêm de uma planilha
 * preenchida à mão, não do Convenia -- e o gerador não inventa o que não sabe.
 */
export interface BaseWIL {
  rotulo: string;
  linhas: LinhaWIL[];
  foraDoRecorte: number;
  semFamilia: number;
  /** Ativos cuja família não é reconhecida pelo de-para, com o valor visto. */
  familiasDesconhecidas: string[];
}

const MESES = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.',
  'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];

export const baseWIL = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    ano: z.number().int().min(2013).max(2100),
    mes: z.number().int().min(1).max(12),
  }).parse(d))
  .handler(async ({ context, data }): Promise<BaseWIL> => {
    const email = context.claims.email as string | undefined;
    const { exigirAdmin } = await import('@/lib/escopo.server');
    await exigirAdmin(email, 'gerar a base do WIL');

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { montarLocation, semFamilia, foraDoRecorte, familiaWIL }
      = await import('@/lib/wil-location');
    const { workerType } = await import('@/lib/talent-mobility');

    const db = supabaseAdmin as unknown as {
      from: (t: string) => { select: (c: string) => PromiseLike<{ data: unknown[] | null }> };
    };

    const [{ data: cad }, { data: saidasRaw }] = await Promise.all([
      db.from('convenia_pessoas')
        .select('convenia_id, hiring_date, relationship, gender, custom_fields'),
      db.from('convenia_leavers').select('convenia_id, dismissal_month, voluntary'),
    ]);

    const saidas = new Map(
      ((saidasRaw ?? []) as Array<{
        convenia_id: string; dismissal_month: string | null; voluntary: boolean | null;
      }>).map((s) => [s.convenia_id, s]),
    );

    const campo = (cf: unknown, nome: string): string | null => {
      if (!Array.isArray(cf)) return null;
      const c = (cf as { nome?: string; valor?: string }[]).find((x) => x.nome === nome);
      return c?.valor?.trim() || null;
    };
    /** "0,9" chega com vírgula: `Number("0,9")` é NaN, e NaN somado apaga a coluna. */
    const fteDe = (v: string | null): number | null => {
      if (!v) return null;
      const n = Number(v.replace(',', '.'));
      return Number.isFinite(n) && n > 0 ? n : null;
    };

    const pessoas: PessoaWIL[] = ((cad ?? []) as Array<{
      convenia_id: string; hiring_date: string | null; relationship: string | null;
      gender: string | null; custom_fields: unknown;
    }>).map((c) => ({
      familia: familiaWIL(campo(c.custom_fields, 'Job Type Family')),
      empresa: campo(c.custom_fields, 'Empresa'),
      tipo: workerType(c.relationship),
      genero: c.gender,
      fte: fteDe(campo(c.custom_fields, 'Força de Trabalho')),
      admissao: c.hiring_date,
      saida: saidas.get(c.convenia_id)?.dismissal_month ?? null,
      voluntaria: saidas.get(c.convenia_id)?.voluntary ?? null,
    }));

    const ref = `${data.ano}-${String(data.mes).padStart(2, '0')}`;

    // Família que o de-para não conhece é dita PELO VALOR, e não contada. Um
    // nome novo no cadastro -- "Growth", digamos -- some do report inteiro, e
    // um número não diz onde procurar.
    const desconhecidas = new Set<string>();
    for (const c of (cad ?? []) as Array<{ custom_fields: unknown }>) {
      const v = campo(c.custom_fields, 'Job Type Family');
      if (v && !familiaWIL(v)) desconhecidas.add(v);
    }

    return {
      rotulo: `${MESES[data.mes - 1]}/${data.ano}`,
      linhas: montarLocation(pessoas, ref),
      foraDoRecorte: foraDoRecorte(pessoas),
      semFamilia: semFamilia(pessoas),
      familiasDesconhecidas: [...desconhecidas].sort(),
    };
  });
