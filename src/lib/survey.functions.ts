import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { SupabaseClient } from '@supabase/supabase-js';
import { canSeeIndividualData } from '@/lib/permissions';
import { parsePollyExport } from '@/lib/aggregator/polly-parser';
import {
  computeCuts, computeDriverScores, computeDriverImportance,
  applySuppression, ordemTempo, N_MINIMO_EXIBICAO,
  ehCruzamento, partesDoCruzamento,
} from '@/lib/aggregator/polly-survey';
import { selectedDept, recorteNoEscopo } from '@/lib/dept-filter';

/**
 * Carga e leitura da pesquisa de engajamento.
 *
 * A AGREGAÇÃO ACONTECE NO SERVIDOR, e é a decisão mais importante deste
 * arquivo. O export cru sobe inteiro -- com comentários livres que identificam
 * quem escreveu -- é agregado em memória, e só o agregado é gravado. Nada do
 * texto livre toca o banco, e o cru não passa pelo navegador de ninguém além de
 * quem já tinha o arquivo.
 *
 * Fazer isso no cliente teria sido mais simples e traria dois problemas: o
 * bundle passaria a conter a lógica de quem pode ver o quê, e a supressão por n
 * viraria uma decisão de renderização -- contornável abrindo o DevTools.
 */

type UntypedClient = SupabaseClient<any, 'public', any>;

/**
 * Adaptador fino sobre `resolverEscopo`, que e o unico lugar do sistema que
 * decide quem voce e -- e o unico que sabe do "ver como". Antes cada arquivo
 * tinha sua propria copia desta consulta; treze copias, quatro formatos.
 */
async function authorize(userEmail: string | undefined) {
  const { resolverEscopo } = await import('@/lib/escopo.server');
  // A importação de onda é ação de admin e a leitura pertence a Engajamento --
  // as duas cabem na mesma aba, porque um admin enxerga todas.
  const e = await resolverEscopo(userEmail, 'engagement');
  return {
    email: e.email, role: e.role, profile: e.profile, scope: e.scope,
    podeVerIndividual: e.podeVerIndividual,
  };
}

// ---------------------------------------------------------------- importação

const ImportInput = z.object({
  wave: z.string().min(3).max(40),
  label: z.string().min(2).max(40),
  referenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  eligible: z.number().int().positive().optional(),
  notes: z.string().max(500).optional(),
  /** Linhas do CSV já divididas, cabeçalho na posição 0. */
  rows: z.array(z.array(z.string())).min(2).max(5000),
  /** Sem isto a carga só simula e devolve o que faria. */
  confirm: z.boolean().default(false),
});

export interface ImportPreview {
  wave: string;
  respondentes: number;
  reconhecido: Record<string, boolean | number>;
  /** Cabeçalhos não reconhecidos, para conferir antes de gravar. */
  ignorados: string[];
  recortes: Array<{ cutType: string; valores: number }>;
  driversMedidos: number;
  /** Recortes abaixo do mínimo de exibição, para a pessoa saber antes. */
  recortesPequenos: Array<{ cutType: string; cutValue: string; n: number }>;
  gravado: boolean;
  avisos: string[];
}

export const importSurveyWave = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => ImportInput.parse(input))
  .handler(async ({ context, data }): Promise<ImportPreview> => {
    const { role, email } = await authorize(context.claims.email as string | undefined);
    if (role !== 'admin') throw new Error('Forbidden: apenas admin pode importar pesquisa');

    const parsed = parsePollyExport(data.rows);
    const cuts = computeCuts(parsed.responses);
    const driverScores = computeDriverScores(parsed.responses);
    const importance = parsed.encontrado.nps && parsed.encontrado.drivers
      ? computeDriverImportance(parsed.responses)
      : [];

    // Avisos são o produto principal da prévia: quem importa precisa ver o que
    // NÃO foi reconhecido antes de confirmar, senão descobre em produção.
    const avisos: string[] = [];
    if (!parsed.encontrado.nps) avisos.push('Nenhuma pergunta de recomendação (eNPS) reconhecida — a onda entra só com drivers.');
    if (!parsed.encontrado.retencao) avisos.push('Nenhuma pergunta de permanência reconhecida — não haverá risco de retenção.');
    if (!parsed.encontrado.area) avisos.push('Coluna de área não reconhecida — o recorte por departamento ficará vazio.');
    if (!parsed.encontrado.funcao) avisos.push('Coluna de função não reconhecida — sem recorte de gestor vs contribuidor.');
    if (!parsed.encontrado.marca) avisos.push('Coluna de marca não reconhecida — sem recorte por marca.');
    if (!parsed.encontrado.drivers) avisos.push('Nenhuma pergunta de driver reconhecida.');

    const recortesPequenos = cuts
      .filter((c) => c.cutType !== 'company' && c.n < N_MINIMO_EXIBICAO)
      .map((c) => ({ cutType: c.cutType, cutValue: c.cutValue, n: c.n }));

    const preview: ImportPreview = {
      wave: data.wave,
      respondentes: parsed.responses.length,
      reconhecido: { ...parsed.encontrado },
      ignorados: parsed.ignorados,
      recortes: [...new Set(cuts.map((c) => c.cutType))].map((t) => ({
        cutType: t, valores: cuts.filter((c) => c.cutType === t).length,
      })),
      driversMedidos: new Set(driverScores.map((d) => `${d.driver}||${d.question}`)).size,
      recortesPequenos,
      gravado: false,
      avisos,
    };

    if (!data.confirm) return preview;

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const db = supabaseAdmin as unknown as UntypedClient;

    const up = async (tabela: string, linhas: unknown[], conflito: string) => {
      if (!linhas.length) return;
      // Lotes de 500: o upsert inteiro de driver_scores passa de 1500 linhas
      // (uma pergunta por recorte, ~50 recortes) e estoura o limite de payload.
      for (let i = 0; i < linhas.length; i += 500) {
        const { error } = await db.from(tabela).upsert(linhas.slice(i, i + 500), { onConflict: conflito });
        if (error) throw new Error(`Falha ao gravar ${tabela}: ${error.message}`);
      }
    };

    const { error: eWave } = await db.from('survey_waves').upsert({
      wave: data.wave,
      label: data.label,
      reference_date: data.referenceDate,
      respondents: parsed.responses.length,
      eligible: data.eligible ?? null,
      notes: data.notes ?? null,
      loaded_at: new Date().toISOString(),
      loaded_by: email,
    }, { onConflict: 'wave' });
    if (eWave) throw new Error(`Falha ao gravar a onda: ${eWave.message}`);

    await up('survey_cut_scores', cuts.map((c) => ({
      wave: data.wave, cut_type: c.cutType, cut_value: c.cutValue,
      n: c.n, enps: c.enps, promotores: c.promotores, passivos: c.passivos,
      detratores: c.detratores, risco: c.risco, satisfacao: c.satisfacao,
    })), 'wave,cut_type,cut_value');

    await up('survey_driver_scores', driverScores.filter((d) => d.score != null).map((d) => ({
      wave: data.wave, driver: d.driver, question: d.question,
      cut_type: d.cutType, cut_value: d.cutValue, n: d.n, score: d.score,
      favoravel: d.favoravel,
    })), 'wave,driver,question,cut_type,cut_value');

    await up('survey_driver_importance', importance.map((i) => ({
      wave: data.wave, driver: i.driver, question: i.question,
      r: i.r, score: i.score, favoravel: i.favoravel, n: i.n,
    })), 'wave,driver,question');

    return { ...preview, gravado: true };
  });

// ---------------------------------------------------------------- leitura

export interface SurveyCut {
  cutType: string;
  cutValue: string;
  n: number;
  enps: number | null;
  risco: number | null;
  satisfacao: number | null;
  promotores: number | null;
  passivos: number | null;
  detratores: number | null;
  /** true quando a nota foi escondida por n baixo. O n continua real. */
  suprimido: boolean;
}

export interface SurveyImportance {
  driver: string;
  question: string;
  r: number;
  /** Media 1-5. Detalhe; `favoravel` e a leitura principal. */
  score: number;
  /** % que respondeu 4 ou 5 -- mesma leitura do deck da diretoria. */
  favoravel: number | null;
  n: number;
}

/**
 * Uma nota de pergunta dentro de um recorte.
 *
 * ------------------------------------------------------------------
 * O MESMO DADO SERVE ÀS DUAS PERGUNTAS DA REUNIÃO
 * ------------------------------------------------------------------
 * "Como está Marketing?" e "quem tem problema com remuneração?" são o mesmo
 * conjunto de números lido em eixos diferentes -- pergunta × área. Guardar
 * duas consultas para isso criaria duas verdades que divergem no primeiro
 * ajuste; é a lição das treze cópias de `authorize()` outra vez.
 *
 * `cutValue = 'company'` é a régua: sem ela, "4,04" não diz se a área está bem
 * ou mal, e comparar de cabeça com um número que está em outro quadro da tela
 * é exatamente o esforço que o painel existe para poupar.
 */
export interface DriverPorRecorte {
  driver: string;
  question: string;
  cutType: string;
  cutValue: string;
  n: number;
  score: number | null;
  favoravel: number | null;
}

export interface SurveyWaveData {
  wave: string;
  label: string;
  respondentes: number;
  /**
   * Quantas pessoas podiam responder em cada área, no mês de referência da
   * onda. Vem do headcount da Convenia, não da pesquisa: a pesquisa só sabe
   * quem respondeu. Chave é o nome da ÁREA, não do departamento.
   */
  elegiveisPorArea?: Record<string, number>;
  elegiveis: number | null;
  participacao: number | null;
  cuts: SurveyCut[];
  importancia: SurveyImportance[];
  /**
   * Notas de driver por área, mais a linha da empresa como régua.
   *
   * Vazio quando a onda não tem esse nível -- jan/26 foi carregada só no nível
   * da empresa, então clicar numa área naquela onda não teria o que abrir. A
   * tela precisa saber a diferença entre "esta área vai bem" e "esta onda não
   * mediu por área", que é o mesmo par de leituras já separado em Salários e
   * na linha do tempo.
   */
  driversPorArea: DriverPorRecorte[];
  /** Quantos recortes tiveram a nota escondida para este perfil. */
  suprimidos: number;
  minimoExibicao: number;
}

export const getSurveyWave = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ wave: z.string().optional(), department: z.string().nullish() }).parse(input ?? {}))
  .handler(async ({ context, data }): Promise<SurveyWaveData | null> => {
    const { profile, scope, podeVerIndividual } = await authorize(context.claims.email as string | undefined);
    const { isGlobalProfile, isInScope } = await import('@/lib/permissions');
    const { deptForScope, scopeForDept, AREA_RESIDUAL } = await import('@/lib/engagement-context');

    // Nome distinto de proposito: mais abaixo existe um `podeVerTudo` que
    // significa outra coisa (ver dado INDIVIDUAL, para a supressao por n
    // baixo). Sao duas perguntas diferentes -- "quais areas" e "que nivel de
    // detalhe" -- e confundi-las e como um perfil acaba vendo o que nao deve.
    const podeVerTudoEscopo = isGlobalProfile(profile);
    // ATENÇÃO AO SENTINELA. O seletor da tela manda a string "Todos" quando
    // nada está filtrado -- não manda vazio nem null. Este trecho fazia o
    // parsing à mão e só tratava vazio, então "Todos" virava `sel = "TODOS"`,
    // um departamento que não existe. O efeito era silencioso e grande: no
    // estado PADRÃO da aba, as oito áreas nomeadas eram descartadas aqui e no
    // filtro dos drivers logo abaixo. Sobrava só "Outros", que escapa porque
    // não tem departamento correspondente e sai antes, no `dept == null`.
    //
    // Na tela isso aparecia como a coluna `n` vazia na fila por área e como
    // "Outros" nos dois lados de "puxam para baixo / sustentam".
    //
    // `selectedDept` é o mesmo helper que comp, experience, recruitment, span
    // e team já usam. Era o único lugar que reimplementava a regra.
    const pedido = selectedDept({ department: data.department ?? undefined });
    if (!podeVerTudoEscopo && pedido && !isInScope(scope, pedido)) {
      throw new Error('Sem acesso a este departamento.');
    }
    // Sentinela que nao casa com departamento nenhum: perfil restrito sem area
    // atribuida ve tela vazia, nao a empresa inteira.
    const primeiro = (scope.departments ?? [])
      .map((d) => (d ?? '').trim().toUpperCase()).filter(Boolean)[0] ?? '\u0000SEM-ESCOPO';
    const sel = pedido ?? (podeVerTudoEscopo ? null : primeiro);

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const db = supabaseAdmin as unknown as UntypedClient;

    // Sem onda pedida, a mais recente. Assim a tela não precisa saber que a de
    // jul/26 existe para passar a mostrá-la.
    const { data: waves, error: eW } = await db
      .from('survey_waves').select('*').order('reference_date', { ascending: false });
    if (eW) throw new Error(`Falha ao carregar ondas: ${eW.message}`);
    const wave = data.wave
      ? (waves ?? []).find((w: { wave: string }) => w.wave === data.wave)
      : (waves ?? [])[0];
    if (!wave) return null;

    const [cutRes, impRes, drvRes, hcRes] = await Promise.all([
      db.from('survey_cut_scores').select('*').eq('wave', wave.wave),
      db.from('survey_driver_importance').select('*').eq('wave', wave.wave).order('r', { ascending: false }),
      // Só empresa e área. Os recortes por tempo de casa, marca e modelo
      // existem na mesma tabela e triplicariam o payload sem que nada na tela
      // os use hoje -- 748 linhas viram 340.
      db.from('survey_driver_scores')
        .select('driver, question, cut_type, cut_value, n, score, favoravel')
        .eq('wave', wave.wave)
        .in('cut_type', ['company', 'area']),
      // ------------------------------------------------------------------
      // QUANTAS PODIAM RESPONDER, POR ÁREA
      // ------------------------------------------------------------------
      // O denominador da taxa de resposta. Duas escolhas aqui, e as duas
      // importam:
      //
      // `source = 'convenia'` e não 'reconstruido'. A tabela tem as duas
      // séries para o mesmo mês, com totais diferentes (em jul/26: 634 contra
      // 680). O cartão do topo publica "76,5% dos elegíveis" sobre 634, que é
      // a Convenia -- usar a outra faria a soma das áreas discordar do total
      // que está na mesma tela.
      //
      // Todas as marcas, não só NSX. A pesquisa cobre a Flutter Brazil
      // inteira; somar só NSX deixaria Betfair BR e Flutter International de
      // fora do denominador e inflaria a taxa.
      db
        .from('monthly_metrics')
        .select('month, brand, dept_breakdown')
        .eq('source', 'convenia')
        .is('quality_flag', null)
        .not('dept_breakdown', 'is', null),
    ]);
    if (cutRes.error) throw new Error(`Falha ao carregar recortes: ${cutRes.error.message}`);

    const podeVerTudo = podeVerIndividual;
    const brutos = (cutRes.data ?? []).map((c: Record<string, unknown>) => ({
      cutType: String(c.cut_type), cutValue: String(c.cut_value),
      n: Number(c.n),
      enps: c.enps == null ? null : Number(c.enps),
      risco: c.risco == null ? null : Number(c.risco),
      satisfacao: c.satisfacao == null ? null : Number(c.satisfacao),
      promotores: c.promotores == null ? null : Number(c.promotores),
      passivos: c.passivos == null ? null : Number(c.passivos),
      detratores: c.detratores == null ? null : Number(c.detratores),
    }));

    // ======================================================================
    // O RECORTE POR ÁREA PRECISA DE ESCOPO; OS OUTROS NÃO
    // ======================================================================
    // `cut_type = 'area'` traz eNPS, risco e satisfação de cada departamento,
    // nominalmente. Sem este filtro, um líder de uma área lia as outras oito
    // aqui -- pelo mesmo caminho que o recorte por departamento fecha nas
    // outras visões, o que torna o fechamento das outras inútil.
    //
    // Os recortes por tempo de casa, função e marca NÃO identificam área e
    // seguem inteiros: são da Flutter Brazil e servem de referência. É a mesma
    // regra já usada nos drivers e na inclusão.
    // ------------------------------------------------------------------
    // NADA ESCAPA DA SELEÇÃO DE ÁREA
    // ------------------------------------------------------------------
    // A ordem das checagens importava e estava errada. `company`, as marcas e
    // o balde "Outros" devolvem `dept == null`, e a versão anterior os
    // liberava ANTES de olhar a seleção -- então filtrar Technology trazia
    // Technology e "Outros" junto, sem dizer que estava fazendo isso.
    //
    // Agora a seleção decide primeiro: se há uma área escolhida, só linhas
    // daquela área passam. Um recorte que não é área não pertence a área
    // nenhuma, logo não passa. Sem seleção, a permissão volta a mandar.
    const passaNoRecorte = (nome: string): boolean =>
      recorteNoEscopo(scope, deptForScope(nome), sel, podeVerTudoEscopo);

    // ======================================================================
    // OS RECORTES CRUZADOS CARREGAM UMA ÁREA DENTRO DO NOME
    // ======================================================================
    // "Commercial || 12-18 meses" é um recorte de ÁREA para efeito de
    // permissão: quem não pode ver Commercial não pode ver esta linha. Sem esta
    // extração, `deptForScope` não reconheceria o nome composto e a linha
    // cairia no ramo "não é área" -- que é o mesmo ramo de marca e tempo, e
    // esses passam para perfil global.
    //
    // Ou seja: sem tratar o caso, um cruzamento por área vazaria justamente
    // pela porta que o recorte por departamento existe para fechar. O `||` no
    // nome faz a checagem falhar fechada por acidente; esta função a faz falhar
    // fechada de propósito, que é diferente.
    const areaDoCut = (c: { cutType: string; cutValue: string }): string | null =>
      ehCruzamento(c.cutType) ? (partesDoCruzamento(c.cutValue)?.area ?? null)
      : c.cutType === 'area' ? c.cutValue
      : null;

    const noEscopo = brutos.filter((c) => {
      const area = areaDoCut(c);
      // Recorte que não é de área nenhuma (empresa, marca, tempo, função,
      // modelo) segue a regra de sempre: só perfil global o recebe, e a
      // seleção não se aplica porque ele não pertence a área alguma.
      if (area == null) return c.cutType !== 'area';
      return passaNoRecorte(area);
    });

    // A supressão é aplicada AQUI, antes de a linha existir na resposta HTTP.
    // Fazer isso na tela deixaria o número real no payload -- visível para
    // qualquer pessoa que abrisse a aba de rede do navegador.
    const cuts = applySuppression(noEscopo, podeVerTudo, [
      'enps', 'risco', 'satisfacao', 'promotores', 'passivos', 'detratores',
    ]) as SurveyCut[];

    cuts.sort((a, b) =>
      a.cutType !== b.cutType ? a.cutType.localeCompare(b.cutType)
      : a.cutType === 'tempo' ? ordemTempo(a.cutValue) - ordemTempo(b.cutValue)
      : b.n - a.n);

    // ======================================================================
    // O DRILL POR ÁREA PASSA PELA MESMA PORTA
    // ======================================================================
    // Este é o caminho novo -- clicar numa área abre as notas dela. Um caminho
    // novo para o mesmo dado é exatamente onde o escopo costuma ficar para
    // trás: o filtro acima seria inútil se este trecho devolvesse as nove
    // áreas por outro campo do mesmo JSON.
    //
    // A regra é reutilizada, não reescrita. `company` passa sempre: é a régua,
    // e o número da empresa já está visível em todos os outros quadros.
    //
    // A supressão por n baixo vale aqui também: uma área com três respostas
    // não pode ter a nota exposta porque quem olha clicou em vez de ler a
    // tabela.
    const driversNoEscopo = ((drvRes.error ? [] : drvRes.data ?? []) as Array<Record<string, unknown>>)
      .filter((d) => {
        // `company` é a régua e passa sempre: sem ela, "4,04" não diz se a
        // área está bem ou mal. O resto passa pela MESMA porta dos recortes.
        if (String(d.cut_type) === 'company') return true;
        return passaNoRecorte(String(d.cut_value));
      })
      .map((d) => ({
        driver: String(d.driver),
        question: String(d.question),
        cutType: String(d.cut_type),
        cutValue: String(d.cut_value),
        n: Number(d.n),
        score: d.score == null ? null : Number(d.score),
        favoravel: d.favoravel == null ? null : Number(d.favoravel),
      }));

    // ------------------------------------------------------------------
    // ELEGÍVEIS POR ÁREA
    // ------------------------------------------------------------------
    // Mês de referência da onda, não o mês corrente: a pesquisa de ago/26
    // começou em 28/07, e é a foto de julho que soma os 634 publicados. Pegar
    // agosto daria 635 e a soma das áreas não fecharia com o cartão.
    const mesRef = String(wave.reference_date ?? '').slice(0, 7);
    const elegiveisPorArea: Record<string, number> = {};
    for (const row of (hcRes.error ? [] : hcRes.data ?? []) as Array<{
      month: string; dept_breakdown: unknown;
    }>) {
      if (String(row.month).slice(0, 7) !== mesRef) continue;
      const blob = row.dept_breakdown as Record<string, { headcount?: number }> | null;
      if (!blob) continue;
      for (const [dept, d] of Object.entries(blob)) {
        const hc = Number(d?.headcount ?? 0);
        if (!hc) continue;
        // Departamento sem área na pesquisa (PORTO, DIRETORIA, GERAL) cai no
        // residual -- que é exatamente para onde essas pessoas vão na carga.
        const area = scopeForDept(dept) ?? AREA_RESIDUAL;
        // O denominador é tão nominal quanto o numerador: quem não pode ver a
        // área não pode ver quantas pessoas ela tem.
        if (!passaNoRecorte(area)) continue;
        elegiveisPorArea[area] = (elegiveisPorArea[area] ?? 0) + hc;
      }
    }

    const driversPorArea = applySuppression(
      driversNoEscopo, podeVerTudo, ['score', 'favoravel'],
    ) as DriverPorRecorte[];

    return {
      wave: String(wave.wave),
      label: String(wave.label),
      respondentes: Number(wave.respondents),
      elegiveis: wave.eligible == null ? null : Number(wave.eligible),
      participacao: wave.eligible
        ? Math.round((Number(wave.respondents) / Number(wave.eligible)) * 1000) / 10
        : null,
      cuts,
      importancia: (impRes.error ? [] : impRes.data ?? []).map((i: Record<string, unknown>) => ({
        driver: String(i.driver), question: String(i.question),
        r: Number(i.r), score: Number(i.score),
        favoravel: i.favoravel == null ? null : Number(i.favoravel),
        n: Number(i.n),
      })),
      driversPorArea,
      elegiveisPorArea,
      suprimidos: cuts.filter((c) => c.suprimido).length,
      minimoExibicao: N_MINIMO_EXIBICAO,
    };
  });
