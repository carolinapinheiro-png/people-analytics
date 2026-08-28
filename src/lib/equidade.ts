/**
 * Equidade de comp-ratio por gênero e etnia -- só as contas.
 *
 * ===========================================================================
 * POR QUE FORA DE comp.functions.ts
 * ===========================================================================
 * Lá dentro isto não tinha teste: o arquivo importa a camada de servidor
 * inteira, e o mirror de teste não resolve `@/integrations`. Regra de
 * supressão sem teste é como as outras que este painel passou a semana
 * consertando -- certa quando foi escrita, e sem nada que avise quando deixar
 * de ser.
 *
 * ===========================================================================
 * O QUE O COMP-RATIO PERMITE PERGUNTAR
 * ===========================================================================
 * Comp-ratio é salário ÷ ponto médio da faixa do cargo. Nível e família já
 * estão controlados POR CONSTRUÇÃO, então comparar comp-ratio entre grupos não
 * compara salário: pergunta "dentro da MESMA faixa, quem está posicionado
 * onde". É a diferença entre uma leitura de composição -- mulheres ganham
 * menos porque estão em níveis menores -- e uma de equidade.
 */

export interface CelulaEquidade {
  grupo: string;
  n: number;
  /** Mediana do comp-ratio. `null` quando a célula foi suprimida por n baixo. */
  mediana: number | null;
}

export interface RecorteEquidade {
  /** 'L3', ou 'Geral' na linha que não quebra por nível. */
  nivel: string;
  celulas: CelulaEquidade[];
}

export interface CompEquidade {
  porGenero: RecorteEquidade[];
  porEtnia: RecorteEquidade[];
  /** Pessoas na base depois da permissão. */
  total: number;
  /** Quantas delas têm o elo com o cadastro -- e portanto demografia. */
  comElo: number;
  minimo: number;
}

/** Mediana, não média: um outlier salarial não deve mover a leitura. */
export function mediana(v: number[]): number | null {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  const r = s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  return Math.round(r * 10) / 10;
}

/**
 * Mesmo mínimo do resto do painel. Célula menor que isso sai com `mediana`
 * nula e o `n` REAL -- some o número, não a linha. Quem olha precisa saber que
 * o grupo existe e que é pequeno demais para publicar, em vez de concluir que
 * não há ninguém ali.
 */
export const N_MINIMO_EQUIDADE = 5;

export function agruparEquidade(
  pessoas: Array<{ nivel: string | null; chave: string | null; cr: number }>,
  ordem: string[],
): RecorteEquidade[] {
  const porNivel = new Map<string, Map<string, number[]>>();
  const add = (nivel: string, chave: string, cr: number) => {
    const m = porNivel.get(nivel) ?? new Map<string, number[]>();
    m.set(chave, [...(m.get(chave) ?? []), cr]);
    porNivel.set(nivel, m);
  };
  for (const p of pessoas) {
    if (!p.chave) continue;
    // Cada pessoa entra DUAS vezes: na linha do seu nível e na linha "Geral".
    // A geral NÃO é a soma das outras -- ela mistura níveis, e é por isso que
    // a tela mostra as duas: a geral responde "no todo", as por nível
    // respondem "comparando igual com igual". Só a segunda é leitura de
    // equidade; a primeira ainda carrega composição.
    add('Geral', p.chave, p.cr);
    if (p.nivel) add(p.nivel, p.chave, p.cr);
  }
  const niveis = [...porNivel.keys()].sort((a, b) =>
    a === 'Geral' ? -1 : b === 'Geral' ? 1 : a.localeCompare(b));
  return niveis.map((nivel) => {
    const m = porNivel.get(nivel)!;
    const chaves = [...m.keys()].sort((a, b) => {
      const ia = ordem.indexOf(a), ib = ordem.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
    });
    return {
      nivel,
      celulas: chaves.map((grupo) => {
        const vs = m.get(grupo)!;
        return {
          grupo,
          n: vs.length,
          mediana: vs.length >= N_MINIMO_EQUIDADE ? mediana(vs) : null,
        };
      }),
    };
  });
}
