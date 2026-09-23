/**
 * O seletor de ENTIDADE do topo aplicado à pesquisa de engajamento.
 *
 * ------------------------------------------------------------------
 * A REGRA (Carolina, 23/09)
 * ------------------------------------------------------------------
 * A pesquisa é anônima e não pergunta a entidade -- pergunta a MARCA de
 * produto. Entidade e marca se correspondem ("NSX BETFAIR BRASIL S.A." é a
 * entidade Betfair BR e atende a marca Betfair; ver monthly-aggregator.ts),
 * e quem trabalha para as duas marcas (Cross Brand) pertence às DUAS
 * entidades:
 *
 *   Betfair BR -> Betfair + Cross Brand
 *   NSX        -> Betnacional + Cross Brand
 *   Flutter International -> sem marca na pesquisa (null)
 *
 * Consequência que precisa ser dita na tela: Betfair BR + NSX ≠ Flutter
 * Brazil, porque o Cross Brand aparece nas duas.
 *
 * ------------------------------------------------------------------
 * COMO: REBASEAR, EM VEZ DE ENSINAR CADA BLOCO
 * ------------------------------------------------------------------
 * Toda a aba lê 'company' e 'area'. Em vez de ensinar a entidade a cada
 * bloco, estas funções trocam essas linhas por versões SINTETIZADAS a partir
 * de 'marca' e 'area+marca', somando as marcas da entidade. O resto do código
 * continua lendo 'company' e 'area' sem saber que elas mudaram.
 *
 * O que não tem marca cruzada (tempo de casa, modelo, função, importância,
 * onboarding, inclusão, drivers do deck) segue da empresa inteira, e quem
 * chama devolve isso à tela para ela avisar. Ondas sem a pergunta de marca
 * (jul/25) não entram: não dá para saber a entidade de ninguém nelas.
 *
 * ------------------------------------------------------------------
 * A CONTA
 * ------------------------------------------------------------------
 * eNPS: promotores, passivos e detratores são CONTAGENS -- a soma é exata.
 * Risco, satisfação e notas de driver são médias gravadas com o `n` do grupo:
 * a combinação é ponderada por `n`, exata a menos do arredondamento gravado.
 *
 * ------------------------------------------------------------------
 * SUPRESSÃO: O MENOR PEDAÇO DECIDE
 * ------------------------------------------------------------------
 * "Legal || Betnacional" tem 4 respostas e seria suprimido. Somado ao Cross
 * Brand (12) vira 16 e passaria -- mas "Legal || Cross Brand" aparece também
 * na entidade Betfair BR, e a diferença entre as duas telas devolveria as 4
 * pessoas. Então a linha combinada carrega `nMinComponente` e é suprimida se
 * QUALQUER pedaço com resposta ficaria suprimido sozinho.
 */
import { partesDoCruzamento, rotuloDeCorte, N_MINIMO_EXIBICAO, CROSS_BRAND } from '@/lib/aggregator/polly-survey';

export type Entidade = 'combined' | 'NSX' | 'Betfair BR' | 'Flutter International';

const MARCAS: Partial<Record<Entidade, string[]>> = {
  'Betfair BR': ['Betfair', CROSS_BRAND],
  NSX: ['Betnacional', CROSS_BRAND],
};

/** As marcas da pesquisa que compõem a entidade, ou null (sem recorte). */
export function marcasDaEntidade(brand: string | null | undefined): string[] | null {
  return MARCAS[(brand ?? 'combined') as Entidade] ?? null;
}

/** A entidade não tem correspondente na pesquisa (Flutter International). */
export function entidadeSemMarca(brand: string | null | undefined): boolean {
  return !!brand && brand !== 'combined' && !marcasDaEntidade(brand);
}

type Base = { cut_type: string; cut_value: string; n: number | null; wave?: string };

export type CutLinha = Base & {
  enps: number | null; promotores: number | null; passivos: number | null;
  detratores: number | null; risco: number | null; satisfacao: number | null;
};
export type DriverLinha = Base & {
  driver: string; question: string; score: number | null; favoravel: number | null;
};
export type Combinada = { nMinComponente?: number };

const num = (v: unknown): number | null =>
  v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null;

/** Média ponderada por n dos valores não nulos. */
function ponderada(partes: Array<{ n: number; v: number | null }>, casas: number): number | null {
  const ok = partes.filter((p) => p.v != null && p.n > 0);
  const peso = ok.reduce((s, p) => s + p.n, 0);
  if (!peso) return null;
  const f = 10 ** casas;
  return Math.round((ok.reduce((s, p) => s + p.n * (p.v as number), 0) / peso) * f) / f;
}

/**
 * Para qual linha sintetizada esta linha contribui, se alguma.
 * 'marca' Betfair -> company; 'area+marca' "Legal || Betfair" -> area Legal.
 */
function destino(r: Base, marcas: string[]): { cut_type: string; cut_value: string } | null {
  if (r.cut_type === 'marca') {
    return marcas.includes(rotuloDeCorte(r.cut_value)) ? { cut_type: 'company', cut_value: 'company' } : null;
  }
  if (r.cut_type === 'area+marca') {
    const p = partesDoCruzamento(r.cut_value);
    return p && marcas.includes(rotuloDeCorte(p.valor)) ? { cut_type: 'area', cut_value: p.area } : null;
  }
  return null;
}

function rebasear<T extends Base>(
  linhas: readonly T[],
  marcas: string[],
  chaveExtra: (r: T) => string,
  combinar: (partes: T[], alvo: { cut_type: string; cut_value: string }) => T,
): Array<T & Combinada> {
  const grupos = new Map<string, { alvo: { cut_type: string; cut_value: string }; partes: T[] }>();
  for (const r of linhas) {
    const d = destino(r, marcas);
    if (!d) continue;
    const k = [r.wave ?? '', d.cut_type, d.cut_value, chaveExtra(r)].join('\u0001');
    const g = grupos.get(k) ?? { alvo: d, partes: [] };
    g.partes.push(r);
    grupos.set(k, g);
  }
  // As linhas originais de empresa e área saem -- inclusive nas ondas sem
  // marca, onde não há o que pôr no lugar. O resto passa intacto.
  const mantidas = linhas.filter((r) => r.cut_type !== 'company' && r.cut_type !== 'area');
  const sintetizadas = [...grupos.values()].map(({ alvo, partes }) => {
    const nMin = Math.min(...partes.map((p) => num(p.n) ?? 0).filter((n) => n > 0));
    return { ...combinar(partes, alvo), nMinComponente: Number.isFinite(nMin) ? nMin : 0 };
  });
  return [...mantidas, ...sintetizadas];
}

/** `survey_cut_scores` com 'company' e 'area' refeitos para a entidade. */
export function rebasearCuts<T extends CutLinha>(linhas: readonly T[], marcas: string[]): Array<T & Combinada> {
  return rebasear(linhas, marcas, () => '', (partes, alvo) => {
    const soma = (k: 'promotores' | 'passivos' | 'detratores') =>
      partes.every((p) => num(p[k]) != null) ? partes.reduce((s, p) => s + (num(p[k]) as number), 0) : null;
    const n = partes.reduce((s, p) => s + (num(p.n) ?? 0), 0);
    const P = soma('promotores'), Pa = soma('passivos'), D = soma('detratores');
    const base = P != null && Pa != null && D != null ? P + Pa + D : 0;
    const pn = partes.map((p) => ({ n: num(p.n) ?? 0 }));
    return {
      ...partes[0],
      ...alvo,
      n,
      promotores: P,
      passivos: Pa,
      detratores: D,
      enps: base ? Math.round(((P! - D!) / base) * 100) : null,
      risco: ponderada(partes.map((p, i) => ({ ...pn[i], v: num(p.risco) })), 1),
      satisfacao: ponderada(partes.map((p, i) => ({ ...pn[i], v: num(p.satisfacao) })), 1),
    };
  });
}

/** `survey_driver_scores` com 'company' e 'area' refeitos para a entidade. */
export function rebasearDrivers<T extends DriverLinha>(linhas: readonly T[], marcas: string[]): Array<T & Combinada> {
  return rebasear(linhas, marcas, (r) => `${r.driver}\u0001${r.question}`, (partes, alvo) => {
    const pn = partes.map((p) => ({ n: num(p.n) ?? 0 }));
    return {
      ...partes[0],
      ...alvo,
      n: pn.reduce((s, p) => s + p.n, 0),
      score: ponderada(partes.map((p, i) => ({ ...pn[i], v: num(p.score) })), 2),
      favoravel: ponderada(partes.map((p, i) => ({ ...pn[i], v: num(p.favoravel) })), 1),
    };
  });
}

/**
 * A linha combinada precisa ser suprimida mesmo com `n` total grande?
 * Sim quando algum pedaço com resposta ficaria suprimido sozinho.
 */
export function pedacoPequeno(r: Combinada, podeVerTudo: boolean): boolean {
  return !podeVerTudo && r.nMinComponente != null && r.nMinComponente > 0
    && r.nMinComponente < N_MINIMO_EXIBICAO;
}

/** Aplica a regra acima por cima de `applySuppression`, e tira o campo interno. */
export function suprimirPedacos<T extends Combinada & { suprimido?: boolean }>(
  linhas: T[],
  podeVerTudo: boolean,
  campos: string[],
): Array<Omit<T, 'nMinComponente'>> {
  return linhas.map((r) => {
    const { nMinComponente: _, ...resto } = r;
    if (!pedacoPequeno(r, podeVerTudo)) return resto;
    const copia = { ...resto } as Record<string, unknown>;
    for (const c of campos) copia[c] = null;
    copia.suprimido = true;
    return copia as Omit<T, 'nMinComponente'>;
  });
}

/** O que a tela diz sobre o recorte de entidade em vigor. */
export interface RecorteEntidade {
  brand: string;
  /** Marcas somadas. Vazio quando a entidade não tem marca na pesquisa. */
  marcas: string[];
  /** Blocos desta resposta que continuam sendo da Flutter Brazil inteira. */
  daEmpresaInteira: string[];
}
