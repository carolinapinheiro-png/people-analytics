import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { SupabaseClient } from '@supabase/supabase-js';
import { canSeeIndividualData } from '@/lib/permissions';
import { parsePollyExport } from '@/lib/aggregator/polly-parser';
import {
  computeCuts, computeDriverScores, computeDriverImportance,
  applySuppression, ordemTempo, N_MINIMO_EXIBICAO,
} from '@/lib/aggregator/polly-survey';

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
  const e = await resolverEscopo(userEmail);
  return { email: e.email, role: e.role, profile: e.profile };
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
      // (31 perguntas × ~50 recortes) e estoura o limite de payload.
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

export interface SurveyWaveData {
  wave: string;
  label: string;
  respondentes: number;
  elegiveis: number | null;
  participacao: number | null;
  cuts: SurveyCut[];
  importancia: SurveyImportance[];
  /** Quantos recortes tiveram a nota escondida para este perfil. */
  suprimidos: number;
  minimoExibicao: number;
}

export const getSurveyWave = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ wave: z.string().optional() }).parse(input ?? {}))
  .handler(async ({ context, data }): Promise<SurveyWaveData | null> => {
    const { profile } = await authorize(context.claims.email as string | undefined);

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

    const [cutRes, impRes] = await Promise.all([
      db.from('survey_cut_scores').select('*').eq('wave', wave.wave),
      db.from('survey_driver_importance').select('*').eq('wave', wave.wave).order('r', { ascending: false }),
    ]);
    if (cutRes.error) throw new Error(`Falha ao carregar recortes: ${cutRes.error.message}`);

    const podeVerTudo = canSeeIndividualData(profile);
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

    // A supressão é aplicada AQUI, antes de a linha existir na resposta HTTP.
    // Fazer isso na tela deixaria o número real no payload -- visível para
    // qualquer pessoa que abrisse a aba de rede do navegador.
    const cuts = applySuppression(brutos, podeVerTudo, [
      'enps', 'risco', 'satisfacao', 'promotores', 'passivos', 'detratores',
    ]) as SurveyCut[];

    cuts.sort((a, b) =>
      a.cutType !== b.cutType ? a.cutType.localeCompare(b.cutType)
      : a.cutType === 'tempo' ? ordemTempo(a.cutValue) - ordemTempo(b.cutValue)
      : b.n - a.n);

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
      suprimidos: cuts.filter((c) => c.suprimido).length,
      minimoExibicao: N_MINIMO_EXIBICAO,
    };
  });
