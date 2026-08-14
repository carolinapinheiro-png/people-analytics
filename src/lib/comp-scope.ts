/**
 * Quem enxerga a remuneração de quem.
 *
 * ===========================================================================
 * A REGRA (Carolina, 14/08/2026)
 * ===========================================================================
 *   - HR Leader e Admin: veem tudo, como antes.
 *   - N-1 (C-level) e N-2 com a aba concedida: veem a remuneração da PRÓPRIA
 *     ÁREA, e só de quem está em camada MAIS PROFUNDA que a sua. A própria
 *     camada e as acima ficam de fora.
 *   - O resto da empresa: não acessa o quadro de remuneração.
 *
 * ===========================================================================
 * A ESCADA É O "N" DO WORKDAY, E ELA CONTA AO CONTRÁRIO
 * ===========================================================================
 * `N` é o CEO. `N-1` são os reportes diretos dele, `N-2` a camada seguinte, e
 * assim por diante até `N-4`. Ou seja: **quanto MAIOR o número depois do
 * traço, mais júnior** a pessoa.
 *
 * Isto é o inverso da escada L0..L9 da tabela de remuneração, em que o número
 * maior é o mais sênior. Na primeira versão desta regra eu usei a escada
 * errada E no sentido errado -- um N-1 teria visto exatamente quem não devia.
 * Por isso as duas nunca se misturam neste arquivo: `camadaDe` só entende N.
 */

/**
 * Profundidade a partir do CEO. `N` = 0, `N-1` = 1, ... `N-4` = 4.
 *
 * Aceita as escritas que aparecem numa planilha preenchida à mão: `N-2`,
 * `n 2`, `N2`, `2`, `Layer 2`. Devolve `null` para o que não reconhecer -- e
 * `null` sempre esconde.
 *
 * O limite de 12 é um sanity check: a Flutter define liderança até N-4, então
 * um "N-37" é erro de digitação, não uma camada. Aceitar viraria uma linha
 * visível para todo mundo.
 */
export function camadaDe(valor: string | null | undefined): number | null {
  const s = (valor ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim().toLowerCase();
  if (!s) return null;

  if (s === 'n' || s === 'ceo') return 0;

  const m = /^(?:n|layer|camada)?\s*[-–_ ]?\s*(\d{1,2})$/.exec(s);
  if (!m) return null;

  const n = Number(m[1]);
  return Number.isFinite(n) && n >= 0 && n <= 12 ? n : null;
}

export type KpiToneNaoUsado = never;

export interface EscopoComp {
  /** Perfis globais (admin, hr_leader) veem tudo. */
  global: boolean;
  /** Camada de quem está olhando. `null` = não cadastrada. */
  camada: number | null;
  /** Áreas que a pessoa atende, já em MAIÚSCULAS. */
  areas: string[];
}

export interface LinhaComp {
  area?: string | null;
  /** Camada N da pessoa da linha. Vem do "WorkDay Level". */
  n_layer?: string | number | null;
}

const areaNormal = (v: string | null | undefined) =>
  (v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();

/**
 * A linha de remuneração pode sair para esta pessoa?
 *
 * Chamado NO SERVIDOR, antes de a linha entrar na resposta. Filtrar na tela
 * deixaria o salário no payload -- e salário escondido por CSS continua sendo
 * salário entregue.
 *
 * Toda dúvida resolve para ESCONDER. O motivo é assimétrico: quem não vê um
 * salário percebe e reclama; quem vê um que não devia não reclama, e ninguém
 * fica sabendo.
 */
export function podeVerLinha(escopo: EscopoComp, linha: LinhaComp): boolean {
  if (escopo.global) return true;
  if (escopo.camada == null) return false;

  if (!escopo.areas.includes(areaNormal(linha.area))) return false;

  const camadaDaLinha = camadaDe(
    typeof linha.n_layer === 'number' ? String(linha.n_layer) : linha.n_layer,
  );
  if (camadaDaLinha == null) return false;

  // MAIS PROFUNDO que o de quem olha. `>` e não `>=`: o `>=` deixaria os
  // pares visíveis, que é o caso central da regra.
  return camadaDaLinha > escopo.camada;
}

export function filtrarLinhas<T extends LinhaComp>(escopo: EscopoComp, linhas: T[]): T[] {
  if (escopo.global) return linhas;
  return linhas.filter((l) => podeVerLinha(escopo, l));
}

/**
 * A camada N já existe nos dados?
 *
 * ------------------------------------------------------------------
 * POR QUE ESTA PERGUNTA PRECISA DE RESPOSTA PRÓPRIA
 * ------------------------------------------------------------------
 * Enquanto `n_layer` estiver vazia para todo mundo, a regra -- corretamente --
 * esconde tudo. Mas "escondi tudo porque a regra mandou" e "escondi tudo
 * porque o dado não foi importado" produzem a MESMA tela vazia, e levam a
 * ações opostas: a primeira é o sistema funcionando, a segunda é uma
 * importação faltando.
 *
 * Sem esta distinção, alguém abriria a aba, veria vazio, e concluiria que a
 * área não tem gente.
 */
export function temCamadaNosDados(linhas: LinhaComp[]): boolean {
  return linhas.some((l) => camadaDe(
    typeof l.n_layer === 'number' ? String(l.n_layer) : l.n_layer,
  ) != null);
}

/**
 * Explica em uma frase o que a pessoa está vendo. Um recorte silencioso é o
 * pior desfecho: quem lê "média da área" sem saber que as camadas acima
 * ficaram de fora leva um número errado para uma conversa de orçamento -- e o
 * número parece certo.
 */
export function descreverRecorte(
  escopo: EscopoComp,
  rotuloCamada?: string | null,
  camadaImportada = true,
): string | null {
  if (escopo.global) return null;

  if (!camadaImportada) {
    return 'A camada N ainda não foi importada para a base de remuneração, então nenhuma linha pode ser liberada. Isto é falta de dado, não ausência de gente na sua área.';
  }
  if (escopo.camada == null) {
    return 'Sua camada N não está cadastrada, então nenhuma remuneração é exibida. Fale com o RH.';
  }
  const quem = rotuloCamada?.trim() ? ` (${rotuloCamada.trim()})` : '';
  const areas = escopo.areas.length ? escopo.areas.join(', ') : 'sua área';
  return `Mostrando ${areas}, apenas camadas abaixo da sua${quem}. Seus pares e as camadas acima não aparecem — nem nos totais e médias desta tela.`;
}
