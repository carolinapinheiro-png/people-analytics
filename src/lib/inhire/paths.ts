import type { InhireJob } from './jobs';

/**
 * O que este dashboard pode pedir ao InHire, e como ler a resposta paginada.
 *
 * Módulo puro de propósito: é a peça de segurança da integração, e peça de
 * segurança que só pode ser testada com credencial de produção acaba não sendo
 * testada.
 *
 * ------------------------------------------------------------------
 * POR QUE UMA LISTA FECHADA
 * ------------------------------------------------------------------
 * A documentação do InHire é explícita: "o usuário de API tem acesso integral a
 * todos os dados da aplicação". Não existe escopo do lado deles -- a mesma
 * credencial que lê a contagem de vagas lê currículo, CPF e telefone de
 * qualquer candidato.
 *
 * Como não dá para limitar a credencial, limita-se o código: só os caminhos
 * abaixo saem da máquina. Isso não protege contra código malicioso, e não é
 * essa a ameaça. Protege contra o cenário real: alguém -- inclusive eu, num
 * commit futuro -- acrescentar uma varredura de candidatos "só para ver um
 * número" e dado pessoal começar a circular sem que ninguém tenha decidido isso.
 *
 * Ampliar a lista continua possível. Vira uma linha de diff, revisável, em vez
 * de um efeito colateral.
 */

const PERMITIDOS: RegExp[] = [
  /^\/jobs(\?[^#]*)?$/,
  /^\/jobs\/[\w-]+$/,
  /^\/jobs\/[\w-]+\/positions(\?[^#]*)?$/,
  /^\/custom-fields(\?[^#]*)?$/,
];

export function isPathPermitido(path: string): boolean {
  return PERMITIDOS.some((re) => re.test(path));
}

/**
 * Extrai itens e cursor de uma resposta paginada de /jobs.
 *
 * O formato exato da paginação não está fixado na documentação pública. Uma
 * suposição errada aqui pararia na primeira página EM SILÊNCIO -- trazendo 20
 * vagas de 156 e desenhando um gráfico perfeitamente plausível com um terço dos
 * dados.
 *
 * Por isso a leitura aceita os formatos comuns e, quando não reconhece nada,
 * devolve `reconhecido: false` para o chamador avisar. Parar avisando é melhor
 * que continuar pela metade.
 */
export function extrairPagina(resposta: unknown): {
  itens: InhireJob[];
  proximo: string | null;
  reconhecido: boolean;
} {
  if (Array.isArray(resposta)) {
    return { itens: resposta as InhireJob[], proximo: null, reconhecido: true };
  }
  const r = resposta as Record<string, unknown> | null;
  if (!r || typeof r !== 'object') return { itens: [], proximo: null, reconhecido: false };

  const chaveLista = ['data', 'items', 'results', 'jobs'].find((k) => Array.isArray(r[k]));
  if (!chaveLista) return { itens: [], proximo: null, reconhecido: false };
  const itens = r[chaveLista] as InhireJob[];

  const cursor = (r.nextCursor ?? r.next ?? r.nextPage ?? null) as unknown;
  // Fim da lista chega de várias formas: null, string vazia, ou `false`. Tratar
  // qualquer uma delas como cursor faria a paginação pedir "/jobs?cursor=false"
  // e girar até o teto de páginas, gastando o limite compartilhado à toa.
  const temProximo =
    cursor != null && cursor !== '' && cursor !== false &&
    (typeof cursor === 'string' || typeof cursor === 'number');
  return {
    itens,
    proximo: temProximo ? `/jobs?cursor=${encodeURIComponent(String(cursor))}&limit=100` : null,
    reconhecido: true,
  };
}
