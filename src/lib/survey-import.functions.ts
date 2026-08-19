import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { SupabaseClient } from '@supabase/supabase-js';

type UntypedClient = SupabaseClient<any, 'public', any>;

/**
 * ===========================================================================
 * CARGA DE UMA ONDA DE PESQUISA
 * ===========================================================================
 * Até 19/08/2026 isto era feito à mão: alguém lia o export do Polly, rodava os
 * agregadores fora do app e gerava INSERTs. Foi assim com ago/26 e com jul/25.
 * Funciona, e não escala -- cada onda depende de uma pessoa específica estar
 * disponível, e o caminho não deixa rastro no sistema.
 *
 * ---------------------------------------------------------------------------
 * AS RESPOSTAS INDIVIDUAIS NÃO CHEGAM AQUI
 * ---------------------------------------------------------------------------
 * O CSV é lido e agregado NO NAVEGADOR. O que sobe são somas e contagens por
 * recorte -- nunca uma linha de respondente, nunca um comentário livre.
 *
 * É a mesma decisão já tomada para o Talent_Mobility.xlsx, e pela mesma razão:
 * o export do Polly traz comentários em texto aberto, e comentário de pesquisa
 * anônima é o tipo de dado que, uma vez no banco, alguém eventualmente lê
 * junto com o recorte de área e deixa de ser anônimo.
 *
 * Não é só política: a planilha de agosto tinha 87 colunas, e mais da metade
 * eram `(comment) ...`. Elas nunca entraram, e não é aqui que vão entrar.
 *
 * ---------------------------------------------------------------------------
 * IDEMPOTENTE POR ONDA
 * ---------------------------------------------------------------------------
 * Apaga a onda antes de gravar. Recarregar a mesma onda corrigida é o caso
 * comum -- alguém percebe que o de-para de área estava errado e refaz -- e sem
 * isso a segunda carga duplicaria tudo em silêncio, que é exatamente o defeito
 * que a aba de engajamento teve por outro caminho.
 */

const Cut = z.object({
  cutType: z.enum(['company', 'area', 'funcao', 'marca', 'tempo', 'modelo']),
  cutValue: z.string().min(1).max(120),
  n: z.number().int().nonnegative(),
  enps: z.number().nullable(),
  promotores: z.number().int().nonnegative(),
  passivos: z.number().int().nonnegative(),
  detratores: z.number().int().nonnegative(),
  risco: z.number().nullable(),
  satisfacao: z.number().nullable(),
});

const DriverScore = z.object({
  driver: z.string().min(1).max(200),
  question: z.string().min(1).max(600),
  cutType: z.enum(['company', 'area', 'funcao', 'marca', 'tempo', 'modelo']),
  cutValue: z.string().min(1).max(120),
  n: z.number().int().nonnegative(),
  score: z.number().nullable(),
  favoravel: z.number().nullable(),
});

const Importance = z.object({
  driver: z.string().min(1).max(200),
  question: z.string().min(1).max(600),
  r: z.number(),
  score: z.number(),
  favoravel: z.number(),
  n: z.number().int().nonnegative(),
});

const Entrada = z.object({
  /** Identificador técnico da onda: `ago_2026`. */
  wave: z.string().regex(/^[a-z]{3}_\d{4}$/, 'use o formato mes_ano, como ago_2026'),
  /** Como ela é chamada nas reuniões: `Agosto/26`. */
  label: z.string().min(1).max(40),
  /** Data de início da coleta, AAAA-MM-DD. É o que define os elegíveis. */
  referenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  respondents: z.number().int().positive(),
  /** Headcount na largada. Sem isto não há taxa de participação. */
  eligible: z.number().int().positive().nullable(),
  notes: z.string().max(1200).nullable(),
  cuts: z.array(Cut).max(400),
  driverScores: z.array(DriverScore).max(4000),
  importance: z.array(Importance).max(200),
  /** false = só devolve o que faria, sem tocar no banco. */
  confirm: z.boolean().default(false),
});

export interface ResultadoCarga {
  gravado: boolean;
  wave: string;
  linhas: {
    cuts: number; engagementScores: number; engagementDrivers: number;
    driverScores: number; importance: number;
  };
  avisos: string[];
}

export const importSurveyWave = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => Entrada.parse(input))
  .handler(async ({ context, data }): Promise<ResultadoCarga> => {
    const { exigirAdmin } = await import('@/lib/escopo.server');
    const email = await exigirAdmin(
      context.claims.email as string | undefined, 'carregar uma onda de pesquisa',
    );

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const db = supabaseAdmin as unknown as UntypedClient;

    // ------------------------------------------------------------------
    // AS DUAS DERIVADAS QUE A TELA ESPERA
    // ------------------------------------------------------------------
    // `engagement_scores` (a leitura por área dos cartões e da fila) e
    // `engagement_drivers` (a lista de perguntas no nível da empresa) NÃO são
    // dados novos: saem dos mesmos recortes. Derivar aqui, e não pedir que
    // quem carrega os informe, evita a única forma de esta carga ficar
    // internamente incoerente -- alguém digitar um número que discorda do
    // recorte que está do lado.
    const empresa = data.cuts.find((c) => c.cutType === 'company');
    const areas = data.cuts.filter((c) => c.cutType === 'area')
      .sort((a, b) => (b.enps ?? -Infinity) - (a.enps ?? -Infinity));

    const participacao = data.eligible
      ? Math.round((data.respondents / data.eligible) * 1000) / 10
      : null;

    const scores = [
      ...(empresa ? [{
        wave: data.wave, scope: 'company',
        enps: empresa.enps, retention_risk: empresa.risco, satisfaction: empresa.satisfacao,
        // Os deltas ficam NULOS de propósito: eles são calculados na leitura,
        // comparando com a onda anterior. Gravar aqui recriaria o problema que
        // a aba tinha -- um numero digitado que ninguem consegue conferir.
        enps_delta: null, rr_delta: null, sat_delta: null,
        participation: participacao, status: data.notes, position: 0,
      }] : []),
      ...areas.map((a, i) => ({
        wave: data.wave, scope: a.cutValue,
        enps: a.enps, retention_risk: a.risco, satisfaction: a.satisfacao,
        enps_delta: null, rr_delta: null, sat_delta: null,
        participation: null, status: null, position: i + 1,
      })),
    ];

    // A lista de perguntas da empresa, na ordem em que o agregador as produziu.
    const doDriverEmpresa = data.driverScores.filter((d) => d.cutType === 'company');
    const drivers = doDriverEmpresa.map((d, i) => ({
      wave: data.wave, driver: d.driver, driver_desc: null, question: d.question,
      score_current: d.score, score_prev: null, evaluation: null,
      driver_pos: 0, q_pos: i,
    }));

    const linhas = {
      cuts: data.cuts.length,
      engagementScores: scores.length,
      engagementDrivers: drivers.length,
      driverScores: data.driverScores.length,
      importance: data.importance.length,
    };

    // ------------------------------------------------------------------
    // OS AVISOS SAEM DO DADO, E NAO DE UMA LISTA FIXA
    // ------------------------------------------------------------------
    // Cada um deles corresponde a algo que ja aconteceu de verdade numa carga
    // anterior e custou tempo para entender depois.
    const avisos: string[] = [];
    if (!empresa) {
      avisos.push('Sem recorte de empresa: os cartões do topo e a régua de comparação das áreas ficam sem número.');
    }
    if (!areas.length) {
      avisos.push('Sem recorte por área: a fila de prioridade e o drill por área não terão o que mostrar nesta onda.');
    }
    if (!data.importance.length) {
      avisos.push('Sem importância de driver: a correlação exige eNPS e nota de pergunta na MESMA resposta. É o caso de jul/25, aplicada em duas partes.');
    }
    if (!data.driverScores.some((d) => d.cutType === 'area')) {
      avisos.push('As perguntas não vêm quebradas por área: clicar numa área não abrirá o perfil dela (foi o que aconteceu com jan/26).');
    }
    if (!data.eligible) {
      avisos.push('Sem elegíveis: não haverá taxa de participação para esta onda.');
    }

    if (!data.confirm) return { gravado: false, wave: data.wave, linhas, avisos };

    // Apaga antes de gravar. Recarregar uma onda corrigida é o caso comum.
    for (const t of ['survey_driver_importance', 'survey_driver_scores', 'survey_cut_scores',
      'engagement_drivers', 'engagement_scores']) {
      const { error } = await db.from(t).delete().eq('wave', data.wave);
      if (error) throw new Error(`Falha ao limpar ${t}: ${error.message}`);
    }

    const { error: eW } = await db.from('survey_waves').upsert({
      wave: data.wave, label: data.label, reference_date: data.referenceDate,
      respondents: data.respondents, eligible: data.eligible, notes: data.notes,
      loaded_at: new Date().toISOString(), loaded_by: email,
    } as never, { onConflict: 'wave' });
    if (eW) throw new Error(`Falha ao gravar a onda: ${eW.message}`);

    const emLotes = async (tabela: string, linhas: unknown[]) => {
      for (let i = 0; i < linhas.length; i += 500) {
        const { error } = await db.from(tabela).insert(linhas.slice(i, i + 500) as never);
        if (error) throw new Error(`Falha ao gravar ${tabela}: ${error.message}`);
      }
    };

    await emLotes('survey_cut_scores', data.cuts.map((c) => ({
      wave: data.wave, cut_type: c.cutType, cut_value: c.cutValue, n: c.n,
      enps: c.enps, promotores: c.promotores, passivos: c.passivos,
      detratores: c.detratores, risco: c.risco, satisfacao: c.satisfacao,
    })));
    await emLotes('engagement_scores', scores);
    await emLotes('engagement_drivers', drivers);
    await emLotes('survey_driver_scores', data.driverScores.map((d) => ({
      wave: data.wave, driver: d.driver, question: d.question,
      cut_type: d.cutType, cut_value: d.cutValue, n: d.n,
      score: d.score, favoravel: d.favoravel,
    })));
    await emLotes('survey_driver_importance', data.importance.map((i) => ({
      wave: data.wave, driver: i.driver, question: i.question,
      r: i.r, score: i.score, favoravel: i.favoravel, n: i.n,
    })));

    // O rastro entra na mesma tabela das sincronizações: "quem carregou o quê,
    // quando" é a mesma pergunta, e duas tabelas para respondê-la dariam duas
    // respostas.
    await db.from('integration_sync_log').insert({
      provider: 'pesquisa', status: 'success',
      started_at: new Date().toISOString(), finished_at: new Date().toISOString(),
      rows_written: Object.values(linhas).reduce((a, b) => a + b, 0),
      triggered_by: email,
      detail: { wave: data.wave, label: data.label, linhas, avisos } as never,
    } as never);

    return { gravado: true, wave: data.wave, linhas, avisos };
  });
