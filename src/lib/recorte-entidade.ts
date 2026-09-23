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
 * SUPRESSÃO: O QUE DÁ PARA DEDUZIR POR DIFERENÇA
 * ------------------------------------------------------------------
 * Numa área, quem não vê dado individual enxerga três números: a área inteira
 * (T = Betnacional + Betfair + Cross Brand), a área na NSX (N + C) e a área na
 * Betfair BR (F + C). Com eles faz as contas:
 *
 *   T − NSX        = F  (só Betfair)
 *   T − Betfair BR = N  (só Betnacional)
 *   NSX + BF − T   = C  (só Cross Brand)
 *
 * Então a entidade só aparece se nenhuma dessas diferenças expuser um grupo
 * de 1 a 4 pessoas. Se as duas entidades passam mas o Cross Brand é pequeno,
 * esconde-se a MENOR e mostra-se a maior -- mostrar as duas devolveria o C.
 *
 * A primeira versão (23/09 de manhã) escondia a entidade sempre que qualquer
 * pedaço tinha menos de cinco. Era mais rígida do que precisava: NSX
 * Commercial, com 42 respostas, sumia porque o Cross Brand de Commercial tem
 * 3 -- e a Thais via cartões com "—" e 42 respondentes. Pela regra acima, a
 * NSX aparece e a Betfair BR (9 respostas) é que fica escondida.
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
export type Combinada = { bloqueadoPorDiferenca?: boolean };

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

const ENTRE_1_E_4 = (n: number) => n >= 1 && n < N_MINIMO_EXIBICAO;

/**
 * A entidade pode aparecer, dadas as contagens do alvo por marca?
 * O = a marca da própria entidade, X = a outra marca, C = Cross Brand.
 */
export function bloqueadoPorDiferenca(O: number, X: number, C: number): boolean {
  const esta = O + C >= N_MINIMO_EXIBICAO && !ENTRE_1_E_4(X);
  if (!esta) return true;
  const outra = X + C >= N_MINIMO_EXIBICAO && !ENTRE_1_E_4(O);
  // As duas visíveis devolvem o C por soma. Fica a maior; empate esconde esta.
  return outra && ENTRE_1_E_4(C) && O <= X;
}

function rebasear<T extends Base>(
  linhas: readonly T[],
  marcas: string[],
  chaveExtra: (r: T) => string,
  combinar: (partes: T[], alvo: { cut_type: string; cut_value: string }) => T,
): Array<T & Combinada> {
  const propria = marcas.find((m) => m !== CROSS_BRAND) ?? '';
  const outra = ['Betfair', 'Betnacional'].find((m) => m !== propria) ?? '';
  const grupos = new Map<string, {
    alvo: { cut_type: string; cut_value: string }; partes: T[]; O: number; X: number; C: number;
  }>();
  for (const r of linhas) {
    const d = destino(r, [...marcas, outra]);
    if (!d) continue;
    const marca = rotuloDeCorte(r.cut_type === 'marca' ? r.cut_value : partesDoCruzamento(r.cut_value)!.valor);
    const k = [r.wave ?? '', d.cut_type, d.cut_value, chaveExtra(r)].join('\u0001');
    const g = grupos.get(k) ?? { alvo: d, partes: [], O: 0, X: 0, C: 0 };
    const n = num(r.n) ?? 0;
    if (marca === propria) g.O += n;
    else if (marca === outra) g.X += n;
    else g.C += n;
    if (marcas.includes(marca)) g.partes.push(r);
    grupos.set(k, g);
  }
  // As linhas originais de empresa e área saem -- inclusive nas ondas sem
  // marca, onde não há o que pôr no lugar. O resto passa intacto.
  const mantidas = linhas.filter((r) => r.cut_type !== 'company' && r.cut_type !== 'area');
  const sintetizadas = [...grupos.values()]
    .filter((g) => g.partes.length > 0)
    .map(({ alvo, partes, O, X, C }) => ({
      ...combinar(partes, alvo),
      bloqueadoPorDiferenca: bloqueadoPorDiferenca(O, X, C),
    }));
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

/** A linha combinada precisa ser escondida por diferença? (ver o topo) */
export function pedacoPequeno(r: Combinada, podeVerTudo: boolean): boolean {
  return !podeVerTudo && !!r.bloqueadoPorDiferenca;
}

/** Aplica a regra acima por cima de `applySuppression`, e tira o campo interno. */
export function suprimirPedacos<T extends Combinada & { suprimido?: boolean }>(
  linhas: T[],
  podeVerTudo: boolean,
  campos: string[],
): Array<Omit<T, 'bloqueadoPorDiferenca'>> {
  return linhas.map((r) => {
    const { bloqueadoPorDiferenca: _, ...resto } = r;
    if (!pedacoPequeno(r, podeVerTudo)) return resto;
    const copia = { ...resto } as Record<string, unknown>;
    for (const c of campos) copia[c] = null;
    copia.suprimido = true;
    return copia as Omit<T, 'bloqueadoPorDiferenca'>;
  });
}

/**
 * Áreas (por onda) em que alguma marca tem de 1 a 4 respostas.
 *
 * Nelas, as notas por marca DENTRO da área não podem sair para quem não vê
 * dado individual -- nem as das marcas grandes. Esconder só a marca pequena
 * não basta: área inteira − Betnacional − Betfair devolve o Cross Brand, e
 * NSX − Betnacional também. A área inteira e a entidade (pela regra de
 * `bloqueadoPorDiferenca`) continuam aparecendo; o que some é a quebra por
 * marca daquela área.
 *
 * Chave: `${wave}\u0001${area}`. Sem `wave` na linha, a onda é ''.
 */
export function areasComMarcaPequena(linhas: readonly Base[]): Set<string> {
  const fora = new Set<string>();
  for (const r of linhas) {
    if (r.cut_type !== 'area+marca') continue;
    const p = partesDoCruzamento(r.cut_value);
    const n = num(r.n) ?? 0;
    if (p && n >= 1 && n < N_MINIMO_EXIBICAO) fora.add(`${r.wave ?? ''}\u0001${p.area}`);
  }
  return fora;
}

/** Esta linha 'area+marca' cai numa área com marca pequena? */
export function marcaDeAreaExposta(
  r: { cut_type?: string; cutType?: string; cut_value?: string; cutValue?: string; wave?: string },
  fora: Set<string>,
): boolean {
  const tipo = r.cut_type ?? r.cutType;
  if (tipo !== 'area+marca') return false;
  const p = partesDoCruzamento(r.cut_value ?? r.cutValue ?? '');
  return !!p && fora.has(`${r.wave ?? ''}\u0001${p.area}`);
}

/** O que a tela diz sobre o recorte de entidade em vigor. */
export interface RecorteEntidade {
  brand: string;
  /** Marcas somadas. Vazio quando a entidade não tem marca na pesquisa. */
  marcas: string[];
  /** Blocos desta resposta que continuam sendo da Flutter Brazil inteira. */
  daEmpresaInteira: string[];
}
