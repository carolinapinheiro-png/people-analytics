import { bandaDaPessoa, type PessoaParaBanda } from '@/lib/banda-da-pessoa';

/**
 * O comp-ratio de cada pessoa, a partir do Convenia e das bandas.
 *
 * ===========================================================================
 * POR QUE ISTO DEIXA DE VIR DE PLANILHA
 * ===========================================================================
 * `comp_ratio` foi carregada de uma planilha e parou em junho. O efeito não é
 * "dado velho": é dado velho com cara de atual. Quem entrou depois não existe,
 * quem saiu continua lá, e quem foi promovido aparece na faixa antiga -- e
 * nada na tela distingue isso de um cadastro correto.
 *
 * O Convenia tem salário para 648 dos 649 ativos, e é o mesmo lugar de onde já
 * vêm área, time, cargo, nível e vínculo. A única coisa que ele NÃO tem é a
 * faixa -- ponto médio é decisão da empresa, não fato sobre a pessoa --, e por
 * isso `salary_bands` continua sendo a única tabela de política que sobra.
 *
 * ===========================================================================
 * QUEM NÃO RESOLVE APARECE, COM O MOTIVO
 * ===========================================================================
 * Medido em set/2026: 564 de 649 resolvem banda. Das 85 que não, 71 são
 * cadastro incompleto (efeito da unificação de bases, ainda em curso) e 12 são
 * vínculos para os quais nunca se definiu faixa -- Aprendiz, Diretor
 * Estatutário, Associado, Sócio.
 *
 * As duas coisas são diferentes e a linha guarda a diferença em `semBanda`.
 * Sumir com essas pessoas da tabela faria a aba de Salários mostrar 564 e
 * parecer completa; e um comp-ratio nulo sem motivo se lê como falha de carga.
 */

export interface PessoaDoConvenia extends PessoaParaBanda {
  conveniaId: string;
  nome: string;
  salario: number | null;
  team?: string | null;
  jobTitle?: string | null;
  hire?: string | null;
  empresa?: string | null;
}

export interface Banda {
  jobFamily: string;
  contract: string;
  level: string;
  minimum: number;
  midpoint: number;
  maximum: number;
}

export interface LinhaCompRatio {
  convenia_id: string;
  name: string;
  company: string | null;
  area: string | null;
  team: string | null;
  job_title: string | null;
  job_type_family: string | null;
  level: string | null;
  contract: string | null;
  hire: string | null;
  salary: number | null;
  comp_ratio: number | null;
  quartile: string | null;
  band_family: string | null;
  band_midpoint: number | null;
  /** `null` quando resolveu. Preenchido, diz POR QUE não há comp-ratio. */
  sem_banda: string | null;
}

const chave = (f: string, c: string, l: string) => `${f}||${c}||${l}`;

export function indexarBandas(bandas: readonly Banda[]): Map<string, Banda> {
  const m = new Map<string, Banda>();
  for (const b of bandas) m.set(chave(b.jobFamily, b.contract, b.level), b);
  return m;
}

/**
 * O quartil, pela mesma régua da tabela: q1 = (min+médio)/2, q2 = médio,
 * q3 = (médio+max)/2, q4 = max. Acima do máximo continua sendo Q4 -- a pessoa
 * está fora da faixa por cima, e isso é informação, não erro.
 */
export function quartilDe(salario: number, b: Banda): string {
  const q1 = (b.minimum + b.midpoint) / 2;
  const q3 = (b.midpoint + b.maximum) / 2;
  if (salario <= q1) return 'Q1';
  if (salario <= b.midpoint) return 'Q2';
  if (salario <= q3) return 'Q3';
  return 'Q4';
}

export function montarCompRatio(
  pessoas: readonly PessoaDoConvenia[],
  bandas: readonly Banda[],
): LinhaCompRatio[] {
  const porChave = indexarBandas(bandas);

  return pessoas.map((p) => {
    const b = bandaDaPessoa(p);
    const base: LinhaCompRatio = {
      convenia_id: p.conveniaId,
      name: p.nome,
      company: p.empresa ?? null,
      area: p.department ?? null,
      team: p.team ?? null,
      job_title: p.jobTitle ?? null,
      job_type_family: p.jobTypeFamily ?? null,
      level: b.level,
      contract: b.contrato,
      hire: p.hire ?? null,
      salary: p.salario ?? null,
      comp_ratio: null,
      quartile: null,
      band_family: b.familia,
      band_midpoint: null,
      sem_banda: b.motivo,
    };

    if (p.salario == null) {
      return { ...base, sem_banda: b.motivo ?? 'Sem salário no Convenia.' };
    }
    if (!b.familia || !b.contrato || !b.level) return base;

    const banda = porChave.get(chave(b.familia, b.contrato, b.level));
    if (!banda) {
      // A combinação existe no cadastro e não na tabela de faixas. Não é o
      // mesmo que "cadastro incompleto", e a mensagem tem de dizer qual dos
      // dois -- senão alguém corrige o Convenia esperando resolver, e não
      // resolve.
      return {
        ...base,
        sem_banda: `Não há faixa cadastrada para ${b.familia} · ${b.contrato} · ${b.level}.`,
      };
    }
    if (!banda.midpoint) {
      // Divisão por zero daria Infinity, que vira `null` no banco ou um número
      // absurdo na tela. Faixa com ponto médio zero é faixa não preenchida.
      return { ...base, sem_banda: `A faixa ${b.familia} · ${b.contrato} · ${b.level} está sem ponto médio.` };
    }

    return {
      ...base,
      comp_ratio: Math.round((p.salario / banda.midpoint) * 100) / 100,
      quartile: quartilDe(p.salario, banda),
      band_midpoint: banda.midpoint,
      sem_banda: null,
    };
  });
}

/** Resumo para o aviso da carga: quantos resolveram e por que os outros não. */
export function resumoDaCarga(linhas: readonly LinhaCompRatio[]): {
  total: number; comRatio: number; porMotivo: Array<{ motivo: string; n: number }>;
} {
  const porMotivo = new Map<string, number>();
  let comRatio = 0;
  for (const l of linhas) {
    if (l.comp_ratio != null) { comRatio++; continue; }
    // Agrupa tirando o valor entre aspas: "Job Type Family X não está no
    // de-para" e o mesmo com Y são o mesmo problema, e listar um por pessoa
    // enterraria o padrão numa lista de 85 linhas.
    const m = (l.sem_banda ?? 'sem motivo registrado').replace(/"[^"]*"/g, '"…"');
    porMotivo.set(m, (porMotivo.get(m) ?? 0) + 1);
  }
  return {
    total: linhas.length,
    comRatio,
    porMotivo: [...porMotivo.entries()]
      .map(([motivo, n]) => ({ motivo, n }))
      .sort((a, b) => b.n - a.n),
  };
}
