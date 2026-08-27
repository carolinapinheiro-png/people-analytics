import {
  ehCruzamento, partesDoCruzamento, CRUZAMENTOS_SEM_AREA,
} from '@/lib/aggregator/polly-survey';

/** 'tempo+modelo' cruza duas dimensões transversais: não é de área nenhuma. */
const semArea = (cutType: string) => (CRUZAMENTOS_SEM_AREA as string[]).includes(cutType);

/**
 * Quem enxerga cada recorte da pesquisa. Uma regra, um lugar.
 *
 * ------------------------------------------------------------------
 * POR QUE ISTO SAIU DE DENTRO DA SERVER FUNCTION
 * ------------------------------------------------------------------
 * A mesma decisão estava escrita duas vezes em `survey.functions.ts`, em
 * linhas separadas por sessenta linhas de código -- e as duas discordavam.
 *
 *   cuts    (eNPS, risco, satisfação) ...... liberava tempo/marca/modelo
 *                                            para qualquer perfil
 *   drivers (notas por pergunta) ........... bloqueava para quem tem escopo
 *
 * Ninguém percebeu enquanto a tela não usava os drivers desses recortes.
 * Quando o filtro por tempo de casa entrou, perfil com escopo passou a ver os
 * três números e um clima vazio, com uma mensagem dizendo que o dado "não foi
 * carregado nesta onda" -- falso: estava lá, e a permissão é que barrava.
 *
 * Havia ainda um comentário afirmando "só perfil global o recebe" ao lado do
 * código que liberava para todos. Código e comentário discordando sobre
 * PERMISSÃO é a pior combinação possível: quem lê um confia no outro.
 *
 * ------------------------------------------------------------------
 * A REGRA
 * ------------------------------------------------------------------
 * Recorte que não é de área nenhuma -- empresa, marca, tempo de casa, função,
 * modelo de trabalho -- é corte transversal da Flutter Brazil e passa para
 * todos. Ele não revela área alguma, do mesmo jeito que o eNPS da empresa,
 * que todo perfil já enxerga.
 *
 * Recorte DE área -- inclusive os cruzados, que carregam a área no nome --
 * passa pela porta de permissão e seleção de sempre.
 */

/** A área que um recorte identifica, ou `null` quando ele não é de área. */
export function areaDoRecorte(cutType: string, cutValue: string): string | null {
  if (semArea(cutType)) return null;
  if (ehCruzamento(cutType)) return partesDoCruzamento(cutValue)?.area ?? null;
  return cutType === 'area' ? cutValue : null;
}

export function recorteVisivel(
  cutType: string,
  cutValue: string,
  /** `recorteNoEscopo` já ligada ao escopo e à seleção de quem está pedindo. */
  passaNoRecorte: (area: string) => boolean,
): boolean {
  // ------------------------------------------------------------------
  // OS CRUZADOS PRIMEIRO, E FALHANDO FECHADO
  // ------------------------------------------------------------------
  // A primeira versão disto perguntava só "tem área?" e, sem área, devolvia
  // `cutType !== 'area'`. Um cruzado com o nome corrompido -- separador
  // trocado, valor truncado na carga -- não resolve para área nenhuma, e a
  // regra o classificava como TRANSVERSAL: "Technology || 24+ meses" com o
  // separador errado passaria a ser visível para todo mundo.
  //
  // O teste pegou isso na primeira execução, poucos minutos depois de eu
  // escrever a linha. Permissão é onde o custo de um caso não pensado é maior.
  // 'tempo+modelo' ANTES do teste geral: ele é cruzamento, mas o primeiro
  // campo é "24+ meses". Passar isso para `passaNoRecorte` compararia uma
  // faixa de tempo com a lista de áreas -- daria sempre false, barrando um
  // corte transversal que todo perfil pode ver, e a tela diria "não existe"
  // para um dado que está lá.
  if (semArea(cutType)) return true;

  if (ehCruzamento(cutType)) {
    // No triplo, "Marketing || 24+ meses || Remoto" parte no PRIMEIRO
    // separador e devolve area="Marketing". É o que a permissão precisa.
    const area = partesDoCruzamento(cutValue)?.area;
    return area == null ? false : passaNoRecorte(area);
  }
  if (cutType === 'area') return passaNoRecorte(cutValue);
  // Empresa, marca, tempo de casa, função, modelo: corte transversal.
  return true;
}
