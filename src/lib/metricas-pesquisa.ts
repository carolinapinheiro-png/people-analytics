import type { PontoOnda } from '@/lib/experience.functions';

const fmt1 = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

/**
 * As três métricas, e o que cada uma tem de diferente.
 *
 * `inverso` marca a única em que SUBIR é ruim. Sem isso, um leitor que
 * atravessa os três painéis da esquerda para a direita lê a terceira subida
 * como boa notícia -- e ela é o oposto. A nota sob o título diz isso em
 * palavras, porque cor sozinha não sobrevive a um print em preto e branco.
 */
export const METRICAS = [
  {
    chave: "enps" as const,
    titulo: "eNPS",
    nota: "maior é melhor",
    valor: (p: PontoOnda) => p.enps as number | null,
    formatar: (v: number) => String(Math.round(v)),
    inverso: false,
  },
  {
    chave: "satisfacao" as const,
    titulo: "Satisfação",
    nota: "média de 0 a 10 · maior é melhor",
    valor: (p: PontoOnda) => p.satisfacao,
    formatar: (v: number) => fmt1(v),
    inverso: false,
  },
  {
    chave: "risco" as const,
    titulo: "Risco de saída",
    nota: "% · menor é melhor",
    valor: (p: PontoOnda) => p.risco,
    formatar: (v: number) => `${fmt1(v)}%`,
    inverso: true,
  },
];


export type Metrica = (typeof METRICAS)[number];
