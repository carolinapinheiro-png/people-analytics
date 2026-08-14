/**
 * Quem enxerga a remuneração de quem.
 *
 * ===========================================================================
 * A REGRA (decidida com a Carolina em 14/08/2026)
 * ===========================================================================
 *   - HR Leader e Admin: veem tudo, como antes.
 *   - C-level e N-2 com a aba concedida: veem a remuneração da PRÓPRIA ÁREA,
 *     e só de quem está ESTRITAMENTE ABAIXO do próprio nível. O próprio nível
 *     e tudo acima ficam de fora.
 *   - O resto da empresa: não acessa o quadro de remuneração.
 *
 * "Estritamente abaixo" cobre as duas coisas que ela pediu: esconde os pares
 * (mesmo N) e esconde a faixa acima. Uma comparação só -- `<` -- em vez de
 * duas listas de exceção que divergiriam.
 *
 * ===========================================================================
 * POR QUE ISTO FALHA FECHADO
 * ===========================================================================
 * Toda dúvida aqui resolve para ESCONDER:
 *   - nível de quem olha desconhecido  -> não vê nada
 *   - nível da linha desconhecido      -> a linha não aparece
 *   - área da linha fora do escopo     -> a linha não aparece
 *
 * O contrário seria pior de um jeito específico: quem não vê um salário
 * percebe e reclama. Quem vê um salário que não devia não reclama, e ninguém
 * fica sabendo.
 */

/**
 * ===========================================================================
 * ISTO PRECISA SER CONFERIDO -- É A ÚNICA PARTE QUE EU NÃO DEDUZI DOS DADOS
 * ===========================================================================
 * A tabela de remuneração usa a escada L0..L9. O cadastro de usuários usa
 * rótulos ("Director", "VP"). Não existia, em lugar nenhum do sistema, o
 * de-para entre os dois -- e é ele que decide quem vê o salário de quem.
 *
 * O mapa abaixo é o encaixe 1:1 mais natural entre os dez rótulos e os dez
 * degraus, coerente com o comentário que já existia em comp.functions.ts
 * ("L0-L2, L3-L4, lideres L4-L5/L6-L7, C-level"). Mas é uma LEITURA, não um
 * fato conferido: se na Flutter um Director for L6 e não L7, esta linha
 * mostra a um Director os salários dos pares dele.
 *
 * Um degrau errado aqui não gera erro nenhum na tela.
 */
export const NIVEL_POR_ROTULO: Record<string, number> = {
  'intern': 0,
  'analyst': 1,
  'senior analyst': 2,
  'specialist': 3,
  'coordinator': 4,
  'manager': 5,
  'senior manager': 6,
  'director': 7,
  'vp': 8,
  'c-level': 9,
};

const normalizar = (s: string | null | undefined): string =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/**
 * Converte um nível para o degrau numérico da escada.
 *
 * Aceita as duas escritas que existem na base: `L7` (tabela de remuneração) e
 * `Director` (cadastro de usuário). Devolve `null` quando não reconhece --
 * e `null` sempre esconde, nunca mostra.
 */
export function degrauDe(nivel: string | null | undefined): number | null {
  const s = normalizar(nivel);
  if (!s) return null;

  const escada = /^l(\d)$/.exec(s);
  if (escada) return Number(escada[1]);

  const porRotulo = NIVEL_POR_ROTULO[s];
  return porRotulo === undefined ? null : porRotulo;
}

export interface EscopoComp {
  /** Perfis globais (admin, hr_leader) veem tudo. */
  global: boolean;
  /** Degrau de quem está olhando. `null` = não reconhecido. */
  degrau: number | null;
  /** Áreas que a pessoa atende, já normalizadas em MAIÚSCULAS. */
  areas: string[];
}

export interface LinhaComp {
  area?: string | null;
  level?: string | null;
}

/**
 * A linha de remuneração pode sair para esta pessoa?
 *
 * Chamado NO SERVIDOR, antes de a linha entrar na resposta. Filtrar na tela
 * deixaria o salário no payload -- e um salário escondido por CSS continua
 * sendo um salário entregue.
 */
export function podeVerLinha(escopo: EscopoComp, linha: LinhaComp): boolean {
  if (escopo.global) return true;

  // Sem degrau reconhecido não há como comparar com nada. Mostrar tudo seria
  // a leitura otimista de um cadastro incompleto.
  if (escopo.degrau == null) return false;

  const areaDaLinha = normalizar(linha.area).toUpperCase();
  if (!escopo.areas.includes(areaDaLinha)) return false;

  const degrauDaLinha = degrauDe(linha.level);
  if (degrauDaLinha == null) return false;

  // ESTRITAMENTE abaixo: `<`, não `<=`. O `<=` deixaria os pares visíveis,
  // que é exatamente o caso que a regra existe para cobrir.
  return degrauDaLinha < escopo.degrau;
}

/** Aplica a regra a uma lista inteira. */
export function filtrarLinhas<T extends LinhaComp>(escopo: EscopoComp, linhas: T[]): T[] {
  if (escopo.global) return linhas;
  return linhas.filter((l) => podeVerLinha(escopo, l));
}

/**
 * Explica em uma frase o que a pessoa está vendo, para a tela poder dizer.
 *
 * Um recorte silencioso é o pior desfecho: quem lê "média salarial da área"
 * sem saber que os níveis acima do dele ficaram de fora leva um número
 * errado para uma conversa de orçamento, e o número parece certo.
 */
export function descreverRecorte(escopo: EscopoComp, rotuloNivel?: string | null): string | null {
  if (escopo.global) return null;
  if (escopo.degrau == null) {
    return 'Seu nível não está cadastrado, então nenhuma remuneração é exibida. Fale com o RH.';
  }
  const nivel = rotuloNivel?.trim() ? ` (${rotuloNivel.trim()})` : '';
  const areas = escopo.areas.length ? escopo.areas.join(', ') : 'sua área';
  return `Mostrando ${areas}, apenas níveis abaixo do seu${nivel}. Seus pares e os níveis acima não aparecem — nem nos totais e médias desta tela.`;
}
