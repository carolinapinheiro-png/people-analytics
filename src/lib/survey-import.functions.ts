import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CUTS_PADRAO, type CutType } from '@/lib/aggregator/polly-survey';

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

/**
 * ---------------------------------------------------------------------------
 * OS TIPOS DE RECORTE SAEM DO AGREGADOR, NÃO DE UMA LISTA AQUI
 * ---------------------------------------------------------------------------
 * Esta lista estava escrita à mão, com os seis tipos originais. Quando os
 * cruzamentos por área entraram em `polly-survey.ts`, a carga passou a produzir
 * 'area+tempo' e este validador a rejeitou -- a importação inteira falhava com
 * 124 erros de enum, e o dado novo não tinha como entrar pela porta da frente.
 *
 * Foi o terceiro portão esquecido no mesmo dia: a consulta do servidor filtrava
 * `cut_type`, a tabela `engagement_scores` não foi atualizada junto, e agora
 * este enum. Todos com a mesma forma -- um valor novo declarado num lugar e uma
 * lista fechada em outro.
 *
 * Derivar de `CUTS_PADRAO` fecha a categoria: um recorte novo no agregador
 * passa a ser aceito aqui sem ninguém lembrar. O que se perde é a possibilidade
 * de a lista aqui ser mais restritiva que a de lá -- e ela nunca deveria ser.
 */
const TIPOS_DE_RECORTE = CUTS_PADRAO as [CutType, ...CutType[]];

const Cut = z.object({
  cutType: z.enum(TIPOS_DE_RECORTE),
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
  cutType: z.enum(TIPOS_DE_RECORTE),
  cutValue: z.string().min(1).max(120),
  n: z.number().int().nonnegative(),
  score: z.number().nullable(),
  favoravel: z.number().nullable(),
});

const Importance = z.object({
  // A associação com o eNPS passou a ser calculada também por área. Ver o
  // comentário de `computeDriverImportance` -- a tela dizia que ela "só existe
  // na empresa", e isso nunca foi verdade, só nunca tinha sido calculado.
  cutType: z.enum(['company', 'area']),
  cutValue: z.string().min(1).max(120),
  driver: z.string().min(1).max(200),
  question: z.string().min(1).max(600),
  r: z.number(),
  score: z.number(),
  favoravel: z.number(),
  n: z.number().int().nonnegative(),
});

// ===========================================================================
// OS TETOS DE TAMANHO, E POR QUE ELES SÃO ESSES
// ===========================================================================
// Existem para barrar payload absurdo, não para descrever o formato de hoje --
// e era isso que estavam fazendo. `importance` tinha teto 200, dimensionado
// quando a associação com o eNPS era uma linha por pergunta (34). Quando ela
// passou a ser calculada por área, viraram 204, e a carga inteira foi recusada
// por 4 linhas.
//
// Quinto portão esquecido no mesmo dia, todos com a mesma forma: o agregador
// passou a produzir mais, e uma constante em outro arquivo continuou com a
// medida antiga.
//
// A defesa é escrever a CONTA, não o resultado. Quem mexer no agregador vê
// aqui de onde o número sai e percebe que precisa mexer junto.
const MAX_PERGUNTAS = 60;      // 34 em ago/26; a pesquisa cresce devagar
const MAX_AREAS = 20;          // 9 hoje
const MAX_FAIXAS = 12;         // 7 faixas de tempo de casa
const MAX_RECORTES_SIMPLES = 40;

/** Simples + os quatro cruzamentos com área. */
const MAX_CUTS = MAX_RECORTES_SIMPLES + MAX_AREAS * (MAX_FAIXAS + 3 + 2 + 3);
/** Uma linha por pergunta × recorte. */
const MAX_DRIVER_SCORES = MAX_PERGUNTAS * (MAX_RECORTES_SIMPLES + MAX_AREAS);
/** Uma linha por pergunta, na empresa e em cada área que passa do mínimo. */
const MAX_IMPORTANCE = MAX_PERGUNTAS * (1 + MAX_AREAS);

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
  cuts: z.array(Cut).max(MAX_CUTS),
  driverScores: z.array(DriverScore).max(MAX_DRIVER_SCORES),
  importance: z.array(Importance).max(MAX_IMPORTANCE),
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

    // ==================================================================
    // ARQUIVO SEM eNPS NÃO PODE APAGAR O eNPS QUE JÁ ESTÁ LÁ
    // ==================================================================
    // jul/25 foi aplicada em DUAS partes: o eNPS saiu em jun/25 (233
    // respostas) e os drivers em jul/25 (295). São arquivos diferentes, e esta
    // tela aceita um por vez.
    //
    // Em 25/08/2026 a onda foi recarregada com o arquivo dos drivers. Ele não
    // tem a coluna de recomendação, então `computeCuts` devolveu eNPS nulo em
    // todos os recortes, o `delete` apagou as linhas boas e o `insert` gravou
    // nulos por cima. jul/25 sumiu da série -- e a única pista era o gráfico
    // ter trocado de três ondas para duas.
    //
    // A carga não avisou nada. As colunas ausentes caíam na lista de ignorados
    // do parser, que ninguém lê, e o resultado foi "gravado" em verde.
    //
    // A correção NÃO é recusar: uma onda de duas partes é legítima e precisa
    // ser carregável. É não deixar a metade que chegou apagar a que já está
    // gravada -- cada arquivo escreve só o que ele MEDIU.
    const trazEnps = data.cuts.some((c) => c.enps != null);
    let preservouEnps = false;

    if (!trazEnps) {
      const { data: existentes } = await db
        .from('survey_cut_scores')
        .select('cut_value')
        .eq('wave', data.wave)
        .not('enps', 'is', null)
        .limit(1);
      preservouEnps = ((existentes ?? []) as unknown[]).length > 0;

      avisos.push(
        preservouEnps
          ? 'Este arquivo NÃO tem a pergunta de recomendação (eNPS), e esta onda já tem eNPS gravado. As notas de eNPS, risco e satisfação que já estão lá serão PRESERVADAS — a carga vai substituir só as perguntas de driver. É o caso de uma onda aplicada em duas partes.'
          : 'Este arquivo não tem a pergunta de recomendação (eNPS). Esta onda ficará só com as perguntas de driver, sem eNPS, risco nem satisfação.',
      );
    }

    if (!data.confirm) {
      return { gravado: false, wave: data.wave, linhas, avisos };
    }

    // Apaga antes de gravar. Recarregar uma onda corrigida é o caso comum.
    //
    // Quando a carga preserva o eNPS (ver acima), as duas tabelas que o guardam
    // ficam de fora da limpeza E da gravação. Metade do arquivo não pode apagar
    // a metade do outro.
    const aLimpar = preservouEnps
      ? ['survey_driver_importance', 'survey_driver_scores', 'engagement_drivers']
      : ['survey_driver_importance', 'survey_driver_scores', 'survey_cut_scores',
         'engagement_drivers', 'engagement_scores'];
    for (const t of aLimpar) {
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

    if (!preservouEnps) {
      await emLotes('survey_cut_scores', data.cuts.map((c) => ({
        wave: data.wave, cut_type: c.cutType, cut_value: c.cutValue, n: c.n,
        enps: c.enps, promotores: c.promotores, passivos: c.passivos,
        detratores: c.detratores, risco: c.risco, satisfacao: c.satisfacao,
      })));
      await emLotes('engagement_scores', scores);
    }
    await emLotes('engagement_drivers', drivers);
    await emLotes('survey_driver_scores', data.driverScores.map((d) => ({
      wave: data.wave, driver: d.driver, question: d.question,
      cut_type: d.cutType, cut_value: d.cutValue, n: d.n,
      score: d.score, favoravel: d.favoravel,
    })));
    await emLotes('survey_driver_importance', data.importance.map((i) => ({
      wave: data.wave, cut_type: i.cutType, cut_value: i.cutValue,
      driver: i.driver, question: i.question,
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

/**
 * ===========================================================================
 * O QUE JÁ ESTÁ GRAVADO SOBRE CADA ONDA
 * ===========================================================================
 * Existe para o formulário de carga se preencher sozinho quando a onda já
 * existe -- e existe porque a alternativa quase apagou uma ressalva.
 *
 * Recarregar uma onda para corrigir o dado é o caso comum. O formulário pedia
 * identificador, rótulo, data, elegíveis e observação toda vez, em branco. Quem
 * recarrega meses depois não tem esses números na cabeça: os elegíveis de
 * jul/25 (356) foram derivados do headcount de 01/06/2025, e a data de início
 * de jan/26 é 21/01.
 *
 * O pior não é a pessoa não lembrar -- é ela deixar em branco. A observação de
 * jul/25 diz que aquela onda foi aplicada em DUAS partes, com o eNPS em jun/25
 * e os drivers em jul/25, e que por isso não há importância de driver naquela
 * onda. É a explicação de um número estranho na tela. Um campo vazio a apagaria
 * sem avisar, e ninguém notaria até alguém perguntar de novo por que jul/25 não
 * tem aquela seção.
 *
 * Devolve só metadado da onda. Nenhuma resposta, nenhum recorte.
 */
export const listSurveyWaves = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Array<{
    wave: string; label: string; referenceDate: string;
    eligible: number | null; notes: string | null; respondents: number | null;
  }>> => {
    const { exigirAdmin } = await import('@/lib/escopo.server');
    await exigirAdmin(context.claims.email as string | undefined, 'ler as ondas de pesquisa');

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const db = supabaseAdmin as unknown as UntypedClient;
    const { data, error } = await db
      .from('survey_waves')
      .select('wave, label, reference_date, eligible, notes, respondents')
      .order('reference_date', { ascending: false });
    if (error) throw new Error(`Falha ao listar ondas: ${error.message}`);

    return ((data ?? []) as Array<Record<string, unknown>>).map((w) => ({
      wave: String(w.wave),
      label: String(w.label ?? ''),
      referenceDate: String(w.reference_date ?? '').slice(0, 10),
      eligible: w.eligible == null ? null : Number(w.eligible),
      notes: w.notes == null ? null : String(w.notes),
      respondents: w.respondents == null ? null : Number(w.respondents),
    }));
  });
