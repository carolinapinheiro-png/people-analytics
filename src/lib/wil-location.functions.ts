import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
import type { LinhaWIL, PessoaWIL } from '@/lib/wil-location';
import type { LinhaN4 } from '@/lib/wil-n4';

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
  n4: LinhaN4[];
  /** Pessoas em camada mais funda que N-4. A aba não as conta. */
  abaixoDeN4: number;
  /** A planilha inteira, em base64, para o navegador salvar como .xlsx. */
  xlsxBase64: string;
}

const MESES = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.',
  'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];

/** As colunas do template, na ordem exata em que ele as espera. */
const CABECALHO_LOCATION = [
  'LOCATION', 'JOB Family', 'Headcount at month end', 'Number of females at month end',
  'Number of contingent workers month end', 'number of FTE month end',
  'average headcount past 12 months', 'Total leavers past 12 months',
  'Total Female leavers past 12 months', 'Number of voluntary leavers past 12 months',
  'Female voluntary leavers past 12 months', 'Total hires past 12 months',
  'Female hires past 12 months', 'Total Leavers this month', 'Total Hires this month',
  'Total open roles', 'Number of Backfill open roles', 'Number of New open roles',
  'FlutterBR Notes',
];

const CABECALHO_N4 = [
  'month end', 'Number of males - Employee', 'Number of males - Contractor',
  'Number of females - Employee', 'Number of females - Contractor', 'Number of Blank Gender',
];

/**
 * Uma linha da aba Location.
 *
 * As três colunas de vaga aberta saem VAZIAS: vêm de uma planilha preenchida à
 * mão, não do Convenia, e o gerador não inventa o que não sabe. Vazio é
 * visível na hora de colar; zero passaria por resposta.
 */
const linhaLocation = (l: LinhaWIL) => [
  'BRAZIL', l.familia, l.headcount, l.mulheres, 0, l.fte, l.mediaHeadcount12m,
  l.saidas12m, l.saidasMulheres12m, l.saidasVoluntarias12m,
  l.saidasVoluntariasMulheres12m, l.entradas12m, l.entradasMulheres12m,
  l.saidasNoMes, l.entradasNoMes, '', '', '',
  l.tipo === 'Regular' ? 'Regular Employee' : 'Contractor',
];

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
    const { montarN4, abaixoDeN4 } = await import('@/lib/wil-n4');
    const XLSX = await import('xlsx');
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
    const linhas = montarLocation(pessoas, ref);

    // A camada vem do organograma, e nem todo mundo está nele.
    const { data: org } = await db.from('org_pessoas').select('convenia_id, camada');
    const camadaDe = new Map(
      ((org ?? []) as Array<{ convenia_id: string; camada: string | null }>)
        .map((o) => [o.convenia_id, o.camada]),
    );
    const comCamada = ((cad ?? []) as Array<{ convenia_id: string }>).map((c, i) => ({
      ...pessoas[i], camada: camadaDe.get(c.convenia_id) ?? null,
    }));
    const n4 = montarN4(comCamada, ref);

    // Família que o de-para não conhece é dita PELO VALOR, e não contada. Um
    // nome novo no cadastro -- "Growth", digamos -- some do report inteiro, e
    // um número não diz onde procurar.
    const desconhecidas = new Set<string>();
    for (const c of (cad ?? []) as Array<{ custom_fields: unknown }>) {
      const v = campo(c.custom_fields, 'Job Type Family');
      if (v && !familiaWIL(v)) desconhecidas.add(v);
    }

    // ------------------------------------------------------------------
    // UMA PLANILHA, E NÃO TRÊS CSVs
    // ------------------------------------------------------------------
    // Três arquivos para colar em três abas é trabalho manual que o gerador
    // devia poupar -- e cada colagem é uma chance de errar a aba ou a linha de
    // início. O .xlsx sai com os nomes de aba EXATOS do template recebido,
    // senão a colagem continua manual do mesmo jeito.
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([CABECALHO_LOCATION, ...linhas.map(linhaLocation)]),
      'Template - Location 2025',
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([CABECALHO_N4, ...n4.map((l) => [
        l.camada, l.homensEmpregados, l.homensContractors,
        l.mulheresEmpregadas, l.mulheresContractors, l.semGenero,
      ])]),
      'N-4',
    );
    const xlsxBase64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' }) as string;

    return {
      rotulo: `${MESES[data.mes - 1]}/${data.ano}`,
      linhas,
      foraDoRecorte: foraDoRecorte(pessoas),
      semFamilia: semFamilia(pessoas),
      familiasDesconhecidas: [...desconhecidas].sort(),
      n4,
      abaixoDeN4: abaixoDeN4(comCamada, ref),
      xlsxBase64,
    };
  });
