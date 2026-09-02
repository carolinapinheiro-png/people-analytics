/**
 * De que empresa do cadastro sai cada marca do painel.
 *
 * ===========================================================================
 * POR QUE ISTO É UM DE-PARA E NÃO O VALOR CRU
 * ===========================================================================
 * O painel tem três marcas, e elas são o eixo de comparação de toda a série
 * mensal: `NSX`, `Betfair BR`, `Flutter International`. Esses nomes estão
 * gravados em `monthly_metrics.brand` desde a primeira carga.
 *
 * O campo `Empresa` do cadastro devolve a ENTIDADE LEGAL, que é mais fina:
 *
 *   NSX Brasil Recife ........ 407
 *   NSX Brasil São Paulo ..... 12
 *   NSX Brasil Marechal ......  5
 *
 * As três são a mesma marca -- exatamente como os três tokens de NSX sempre
 * foram. Gravar o valor cru criaria três marcas novas ao lado da antiga, e a
 * comparação entre séries trataria "NSX" e "NSX Brasil Recife" como empresas
 * diferentes. O painel não daria erro: mostraria seis marcas onde havia três.
 *
 * ===========================================================================
 * O QUE ACONTECE COM UM VALOR QUE NÃO ESTÁ NA TABELA
 * ===========================================================================
 * Devolve `null`, e NÃO o valor cru nem um palpite.
 *
 * A tentação seria "se não conheço, uso como está" -- e é assim que uma marca
 * nova entra no painel sem ninguém decidir. Basta o RH escrever "NSX Brasil -
 * Recife" com um hífen a mais, ou criar uma entidade nova, para a série se
 * partir em duas com o mesmo significado.
 *
 * Null é uma resposta que quem chama tem de tratar. E a carga reporta os
 * valores que não casaram, para o de-para ser corrigido olhando.
 *
 * ===========================================================================
 * O QUE ESTA TABELA AINDA NÃO TEM
 * ===========================================================================
 * Betfair e Flutter International. Medido em 02/09, sobre os 389 cadastros
 * com `Empresa` preenchida: nenhum menciona qualquer uma das duas.
 *
 * Isso NÃO quer dizer que elas sumiram -- 376 cadastros ainda estão sem o
 * campo, e a migração do RH está em curso. As entradas para elas ficam
 * previstas aqui, com os nomes que o Convenia provavelmente vai usar, e a
 * carga avisa assim que um valor desconhecido aparecer. É a diferença entre
 * "não vi" e "não existe", que este painel passou a semana inteira aprendendo
 * a não confundir.
 */

export type MarcaDoPainel = 'NSX' | 'Betfair BR' | 'Flutter International';

/** Sem acento, sem pontuação dupla, minúscula. "São Paulo" == "sao paulo". */
export const normalizar = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase();

/**
 * Fragmentos que identificam cada marca dentro do nome da entidade legal.
 *
 * Por FRAGMENTO e não por igualdade: "NSX Brasil Recife", "NSX Brasil São
 * Paulo" e "NSX Brasil Marechal" são a mesma marca, e listar cada praça uma a
 * uma faria a próxima praça nova cair em null.
 *
 * A ordem importa quando um nome pudesse casar com dois -- por isso o mais
 * específico primeiro.
 */
const FRAGMENTOS: ReadonlyArray<readonly [MarcaDoPainel, readonly string[]]> = [
  ['Flutter International', ['flutter international', 'flutter int']],
  ['Betfair BR', ['betfair']],
  ['NSX', ['nsx']],
];

/**
 * A marca do painel para um valor do campo `Empresa`.
 *
 * `null` quando o valor não é reconhecido -- inclusive para string vazia. Quem
 * chama decide o que fazer, e a carga avisa.
 */
export function marcaDeEmpresa(empresa: string | null | undefined): MarcaDoPainel | null {
  if (!empresa) return null;
  const alvo = normalizar(empresa);
  if (!alvo) return null;
  for (const [marca, fragmentos] of FRAGMENTOS) {
    if (fragmentos.some((f) => alvo.includes(f))) return marca;
  }
  return null;
}

/**
 * Os valores de `Empresa` que o de-para não reconhece.
 *
 * Serve para a carga dizer O QUE apareceu de novo, em vez de só contar
 * quantos ficaram de fora. Um número não dá para agir; um nome, sim.
 */
export function empresasNaoReconhecidas(valores: Iterable<string | null | undefined>): string[] {
  const fora = new Set<string>();
  for (const v of valores) {
    if (!v) continue;
    if (marcaDeEmpresa(v) == null) fora.add(v.trim());
  }
  return [...fora].sort();
}
