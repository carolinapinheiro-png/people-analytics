/**
 * A camada de cada pessoa, calculada pela cadeia de reporte.
 *
 * ===========================================================================
 * POR QUE CALCULAR EM VEZ DE DIGITAR
 * ===========================================================================
 * A camada N decide, na aba de Salários, de quem a pessoa enxerga a
 * remuneração. Digitá-la no cadastro de acesso tem dois problemas, e o
 * segundo é o grave:
 *
 *   1. Trabalho manual a cada usuário novo.
 *   2. Ela ENVELHECE CALADA. Quem é promovido continua com o acesso da camada
 *      antiga até alguém lembrar de editar -- e ninguém lembra, porque nada
 *      na tela indica que aquele campo ficou velho.
 *
 * O Convenia já traz o supervisor de cada pessoa, e já sincroniza sozinho. A
 * camada passa a ser derivada disso: muda o organograma, muda o acesso, sem
 * ninguém tocar em nada.
 *
 * ===========================================================================
 * A ÂNCORA
 * ===========================================================================
 * `N` é o CEO da Flutter, que não está na base brasileira. O topo da cadeia
 * daqui é `N-2` (decisão da Carolina, 14/08/2026): quem lidera a Flutter
 * Brazil reporta a alguém que reporta ao CEO.
 *
 * A âncora é só ROTULAGEM. A regra de acesso compara camadas entre si, então
 * errar a âncora muda o texto na tela e não muda quem vê o quê.
 */

export const ANCORA_TOPO = 2;

/** Profundidade máxima antes de considerar a cadeia quebrada. */
const MAX_SALTOS = 20;

export interface PessoaOrg {
  id: string;
  supervisorId?: string | null;
}

export interface CamadaCalculada {
  id: string;
  /** Profundidade a partir do topo local: 0 = topo. */
  profundidade: number;
  /** Rótulo na escada da Flutter: "N-2", "N-3"... */
  camada: string;
}

/**
 * Sobe a cadeia até o topo e devolve a profundidade de cada pessoa.
 *
 * ------------------------------------------------------------------
 * OS DOIS CASOS QUE PRECISAM DE DEFESA
 * ------------------------------------------------------------------
 * CICLO: A reporta a B, que reporta a A. Acontece em base de RH real (troca
 * de gestor feita pela metade) e travaria o laço para sempre. Quem entra num
 * ciclo fica SEM camada -- não dá para dizer quem está acima de quem.
 *
 * SUPERVISOR FANTASMA: a pessoa aponta para um id que não está na lista
 * (gestor de outra empresa do grupo, ou já desligado). A cadeia acaba ali, e
 * essa ponta vira um topo local. É a leitura honesta: sabemos que existe
 * alguém acima, mas não quem -- e inventar uma camada aqui seria o tipo de
 * palpite que solta salário.
 */
export function calcularCamadas(
  pessoas: PessoaOrg[],
  ancora = ANCORA_TOPO,
): CamadaCalculada[] {
  const porId = new Map(pessoas.map((p) => [String(p.id), p]));
  const cache = new Map<string, number | null>();

  const profundidadeDe = (id: string): number | null => {
    const memo = cache.get(id);
    if (memo !== undefined) return memo;

    const vistos = new Set<string>();
    let atual = id;
    let saltos = 0;

    // Sobe até achar alguém sem supervisor conhecido.
    while (true) {
      if (vistos.has(atual)) {
        // Ciclo: marca TODOS os envolvidos como sem camada, senão o próximo
        // que cair aqui repete a caminhada inteira.
        for (const v of vistos) cache.set(v, null);
        return null;
      }
      vistos.add(atual);

      const p = porId.get(atual);
      const chefe = p?.supervisorId ? String(p.supervisorId) : null;

      // Topo: sem supervisor, ou supervisor fora da lista.
      if (!chefe || !porId.has(chefe)) break;

      // Se o chefe já tem profundidade conhecida, aproveita e desce de volta.
      const doChefe = cache.get(chefe);
      if (doChefe !== undefined) {
        if (doChefe === null) {
          for (const v of vistos) cache.set(v, null);
          return null;
        }
        // ==================================================================
        // ESTE `d` SUBIA QUANDO DEVIA DESCER
        // ==================================================================
        // `vistos` é preenchido de baixo para cima -- [pessoa, pai, avô...] --
        // então o reverso é [avô, pai, pessoa]: de cima para baixo. Descendo,
        // a profundidade AUMENTA. O laço fazia `d--`.
        //
        // O ramo logo abaixo (o do topo real) já fazia `d++`, e está certo. Só
        // este, o do atalho pelo cache, ia ao contrário.
        //
        // O QUE ISSO PRODUZIU, medido em 02/09 sobre as 639 pessoas:
        //
        //   profundidade  0 ... 37 pessoas   camada N-2
        //   profundidade -1 ... 31 pessoas   camada N-1
        //   profundidade -2 ... 11 pessoas   camada N-0
        //   profundidade -3 ...  2 pessoas   camada "N--1"
        //   profundidade -4 ...  1 pessoa    camada "N--2"
        //
        // E os negativos eram só a ponta visivel. Recalculando a cadeia inteira
        // no banco, 323 das 639 pessoas -- MAIS DA METADE -- estavam com a
        // camada rasa demais, e todas na mesma direcao: 225 por dois degraus,
        // 59 por quatro, 27 por seis, 11 por oito, 1 por dez.
        //
        // "Na mesma direcao" e o que torna isso um vazamento e nao um ruido:
        // errar sempre para cima significa ver sempre mais gente do que devia.
        //
        // A âncora do topo é N-2. Quarenta e cinco pessoas ficaram com camada
        // ACIMA do topo da empresa -- e duas com uma string que não é camada
        // nenhuma, com dois hifens.
        //
        // Não é erro de exibição: `camada` decide até que degrau a pessoa
        // enxerga remuneração na aba de Salários. Quanto mais alta a camada,
        // mais gente ela vê. O erro só acontece no atalho pelo cache, então
        // atinge quem está em cadeia longa -- justamente quem deveria ver
        // menos.
        //
        // Nada quebrou, nada deu erro, e a camada continuou sendo gravada a
        // cada sync. Só o número estava invertido.
        let d = doChefe + 1;
        for (const v of [...vistos].reverse()) { cache.set(v, d); d++; }
        return cache.get(id) ?? null;
      }

      atual = chefe;
      if (++saltos > MAX_SALTOS) {
        for (const v of vistos) cache.set(v, null);
        return null;
      }
    }

    // `atual` é o topo. Atribui descendo.
    let d = 0;
    for (const v of [...vistos].reverse()) { cache.set(v, d); d++; }
    return cache.get(id) ?? null;
  };

  const out: CamadaCalculada[] = [];
  for (const p of pessoas) {
    const prof = profundidadeDe(String(p.id));
    if (prof == null) continue;
    out.push({
      id: String(p.id),
      profundidade: prof,
      camada: `N-${ancora + prof}`,
    });
  }
  return out;
}

/** Quantas pessoas ficaram sem camada, e por quê -- para o resumo da sync. */
export function diagnosticar(pessoas: PessoaOrg[], calculadas: CamadaCalculada[]) {
  const comCamada = new Set(calculadas.map((c) => c.id));
  const semCamada = pessoas.filter((p) => !comCamada.has(String(p.id)));
  const topos = calculadas.filter((c) => c.profundidade === 0).length;
  return {
    total: pessoas.length,
    comCamada: comCamada.size,
    semCamada: semCamada.length,
    /**
     * Mais de um topo é normal (cada empresa do grupo tem o seu) mas MUITOS
     * topos indica cadeia quebrada -- e cadeia quebrada vira gente sem camada,
     * que por sua vez vira tela vazia na aba de Salários.
     */
    topos,
    profundidadeMaxima: calculadas.reduce((m, c) => Math.max(m, c.profundidade), 0),
  };
}
