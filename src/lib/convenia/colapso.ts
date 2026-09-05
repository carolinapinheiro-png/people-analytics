/**
 * A marca não sumiu: ela encolheu. E a trava só sabia detectar sumiço.
 *
 * ===========================================================================
 * O QUE A PRIMEIRA EXECUÇÃO REAL MOSTROU
 * ===========================================================================
 * A trava da unificação recusa gravar quando uma marca com histórico não
 * devolve NENHUMA linha. Na execução de 01/09 ela disparou -- por Flutter
 * International, que voltou com zero pessoas e zero meses.
 *
 * Só que a Betfair BR também está vazia de gente ativa, e mesmo assim produziu
 * 24 meses de série. O motivo: a listagem de DESLIGADOS ainda devolve 7
 * pessoas dela, e a reconstrução monta os meses a partir das datas de
 * admissão de quem quer que apareça. Sete desligados bastam para a marca
 * "existir".
 *
 * Resultado:
 *
 *   Betfair BR, ago/26, no banco ......... 34 pessoas
 *   Betfair BR, ago/26, nesta carga ...... perto de zero
 *
 * A trava deixou passar. Hoje isso não teve consequência porque a Flutter
 * abortou a gravação inteira -- ou seja, a proteção funcionou por SORTE. Na
 * próxima carga, se o token da Flutter também parar de devolver desligados,
 * não sobra nada para disparar a trava, e a Betfair cai de 34 para 2 sem
 * ninguém ver: um número plausível, num painel que continua abrindo.
 *
 * ===========================================================================
 * POR QUE COMPARAR HEADCOUNT E NÃO CONTAR PESSOAS
 * ===========================================================================
 * Porque é o headcount que vai para a tela. Uma marca pode trocar de gente
 * inteira sem que o total mude, e isso não é problema nenhum; o que não pode
 * é o total dar um salto que nenhuma demissão explica.
 *
 * A comparação é feita no ÚLTIMO MÊS QUE EXISTE NOS DOIS lados. Comparar com
 * o mês mais novo de cada um compararia agosto fechado contra setembro pela
 * metade, e acusaria queda todo primeiro dia do mês.
 */

export interface PontoDeSerie {
  brand: string;
  month: string;
  headcount: number;
}

export interface Colapso {
  brand: string;
  /** O mês comparado: o mais novo presente nas duas séries. */
  month: string;
  gravado: number;
  novo: number;
}

/**
 * Piso de tamanho para valer a pena comparar.
 *
 * Uma marca de 3 pessoas que vai a 1 caiu 67% e não diz nada -- é uma saída.
 * Abaixo disto o alarme seria ruído, e alarme que toca à toa é alarme
 * desligado.
 */
export const MINIMO_PARA_COMPARAR = 5;

/** Quanto a marca pode encolher de uma carga para a outra sem ser suspeita. */
export const QUEDA_SUSPEITA = 0.5;

/**
 * Marcas que encolheram demais entre o que está gravado e o que a carga traz.
 *
 * Não decide nada sozinha: quem chama é que aborta. Aqui só se mede.
 */
export function detectarColapso(
  novas: readonly PontoDeSerie[],
  gravadas: readonly PontoDeSerie[],
  { minimo = MINIMO_PARA_COMPARAR, queda = QUEDA_SUSPEITA } = {},
): Colapso[] {
  const porMarca = (pontos: readonly PontoDeSerie[]) => {
    const m = new Map<string, Map<string, number>>();
    for (const p of pontos) {
      if (!m.has(p.brand)) m.set(p.brand, new Map());
      // O maior vence: a mesma marca pode vir de mais de uma fonte na mesma
      // carga (duas empresas, uma marca) e o headcount do mês é a soma delas.
      const meses = m.get(p.brand)!;
      meses.set(p.month, (meses.get(p.month) ?? 0) + p.headcount);
    }
    return m;
  };

  const antes = porMarca(gravadas);
  const depois = porMarca(novas);
  const achados: Colapso[] = [];

  for (const [brand, mesesAntes] of antes) {
    const mesesDepois = depois.get(brand);
    // Marca que sumiu inteira é outro caso, tratado por quem chama: aqui não
    // há mês em comum para comparar, e inventar um daria falso positivo.
    if (!mesesDepois) continue;

    const comuns = [...mesesAntes.keys()].filter((m) => mesesDepois.has(m)).sort();
    const mes = comuns.at(-1);
    if (!mes) continue;

    const gravado = mesesAntes.get(mes)!;
    const novo = mesesDepois.get(mes)!;
    if (gravado < minimo) continue;
    if (novo <= gravado * queda) achados.push({ brand, month: mes, gravado, novo });
  }

  return achados.sort((a, b) => a.brand.localeCompare(b.brand));
}

/**
 * ===========================================================================
 * A MARCA NÃO ENCOLHEU: ELA TROCOU DE HISTÓRIA
 * ===========================================================================
 * Terceira forma da mesma falha. A trava aprendeu a ver marca que some, depois
 * marca que encolhe -- e deixou passar esta, que é maior que as duas.
 *
 * Execução de 04/09, com a cobertura do campo `Empresa` chegando a 96%:
 *
 *   NSX ....................... de 163 meses (2013-03) para 86 (2019-08)
 *   Flutter International ..... de  12 meses (2025-10) para 163 (2013-03)
 *
 * Nenhum headcount despencou no mês comparado, então `detectarColapso` não
 * disse nada e a carga ofereceu gravar 275 linhas.
 *
 * A causa: UMA pessoa. Das 21 com `Empresa = Flutter International`, vinte
 * foram admitidas em 2025 e 2026 -- o que bate com a marca real. Uma tem
 * admissão de 25/03/2013, e a reconstrução monta um mês para cada mês desde a
 * admissão mais antiga da marca. Um registro fabricou 151 meses de história
 * para uma marca que nasceu em 2025, e tirou os mesmos 77 da NSX.
 *
 * Enquanto a marca vinha do token isso era impossível. Vindo do cadastro,
 * um valor digitado errado numa linha reescreve uma década em duas marcas.
 *
 * Por isso a trava passa a olhar também o INÍCIO da série, dos dois lados:
 * marca que ganha história que não tinha, e marca que perde a que tinha.
 */
export interface SaltoDeHistoria {
  brand: string;
  /** Mês mais antigo gravado e o desta carga. */
  gravadoDe: string;
  novoDe: string;
  /** Positivo: ganhou história para trás. Negativo: perdeu. */
  mesesDeDiferenca: number;
}

/** Um ano. Abaixo disso, um desligado antigo entrando na conta explica. */
export const SALTO_SUSPEITO_MESES = 12;

const mesesEntreISO = (a: string, b: string): number => {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return (by - ay) * 12 + (bm - am);
};

/**
 * Marcas cujo início de série andou demais entre o gravado e esta carga.
 *
 * Como `detectarColapso`, não decide nada: aqui só se mede.
 */
export function detectarSaltoDeHistoria(
  novas: readonly PontoDeSerie[],
  gravadas: readonly PontoDeSerie[],
  { salto = SALTO_SUSPEITO_MESES } = {},
): SaltoDeHistoria[] {
  const inicio = (pontos: readonly PontoDeSerie[]) => {
    const m = new Map<string, string>();
    for (const p of pontos) {
      const atual = m.get(p.brand);
      if (!atual || p.month < atual) m.set(p.brand, p.month);
    }
    return m;
  };

  const antes = inicio(gravadas);
  const depois = inicio(novas);
  const achados: SaltoDeHistoria[] = [];

  for (const [brand, de] of antes) {
    const novoDe = depois.get(brand);
    // Marca que sumiu inteira já é tratada por quem chama.
    if (!novoDe) continue;
    const diff = mesesEntreISO(novoDe.slice(0, 7), de.slice(0, 7));
    if (Math.abs(diff) >= salto) {
      achados.push({ brand, gravadoDe: de.slice(0, 7), novoDe: novoDe.slice(0, 7), mesesDeDiferenca: diff });
    }
  }
  return achados.sort((a, b) => a.brand.localeCompare(b.brand));
}
