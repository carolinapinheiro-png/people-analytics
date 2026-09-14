import { marcaDeEmpresa, type MarcaDoPainel } from './convenia/marca';

/**
 * A evolução CLT/PJ do mês corrente, a partir do vínculo atual de cada
 * pessoa ativa no Convenia.
 *
 * Só o MÊS CORRENTE -- não o passado. `relationship` é o vínculo ATUAL de
 * cada pessoa, não o que ela tinha em cada mês anterior; essa informação
 * não sobrevive em nenhuma tabela viva. Ver o comentário completo na seção
 * "EVOLUÇÃO CLT/PJ" de `sync.server.ts`, que é quem chama isto a cada carga.
 */

export const CATEGORIAS_VINCULO = ['CLT', 'PJ', 'Aprendiz', 'Estatutário/Sócio', 'Outros'] as const;
export type CategoriaVinculo = typeof CATEGORIAS_VINCULO[number];

/**
 * O vínculo cru do Convenia (`relationship`) na categoria que o gráfico usa.
 *
 * Medido em set/2026, entre os ativos: CLT e Pessoa Jurídica cobrem a grande
 * maioria; Diretor Estatutário e Associado viram "Estatutário/Sócio" (mesma
 * categoria que a série congelada já usava). O resto -- ex.: "Contrato
 * Intermitente", 2 pessoas -- cai em "Outros" em vez de sumir da conta.
 */
export function categoriaDeVinculo(vinculo: string | null | undefined): CategoriaVinculo {
  const v = (vinculo ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  if (v === 'clt') return 'CLT';
  if (v === 'pessoa juridica') return 'PJ';
  if (v === 'aprendiz') return 'Aprendiz';
  if (v === 'diretor estatutario' || v === 'associado' || v === 'socio') return 'Estatutário/Sócio';
  return 'Outros';
}

export interface PessoaParaMix {
  relationship: string | null;
  empresa: string | null;
}

export interface LinhaMixCLTPJ {
  brand: MarcaDoPainel;
  contract: CategoriaVinculo;
  n: number;
  position: number;
}

/**
 * Agrupa por marca x categoria.
 *
 * `diaDoMes` entra pronto (dias desde a época, do mês sendo gravado) para a
 * `position` resultante ficar maior que qualquer mês congelado da série
 * antiga (posições 0 a 75) sem precisar ler o máximo atual da tabela -- o
 * gráfico ordena por `position`, e um mês vivo tem que vir sempre depois de
 * um mês congelado, nunca embaralhado com ele.
 */
export function montarEvolucaoCLTPJ(
  pessoas: readonly PessoaParaMix[],
  diaDoMes: number,
): { linhas: LinhaMixCLTPJ[]; semMarca: number } {
  const contagem = new Map<string, number>();
  let semMarca = 0;
  for (const p of pessoas) {
    const marca = marcaDeEmpresa(p.empresa);
    if (!marca) { semMarca++; continue; }
    const chave = `${marca}||${categoriaDeVinculo(p.relationship)}`;
    contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
  }
  const linhas = [...contagem.entries()].map(([chave, n]) => {
    const [brand, contract] = chave.split('||') as [MarcaDoPainel, CategoriaVinculo];
    const idx = CATEGORIAS_VINCULO.indexOf(contract);
    return { brand, contract, n, position: diaDoMes * 10 + idx };
  });
  return { linhas, semMarca };
}
