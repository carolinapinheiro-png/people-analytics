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

/**
 * Endpoint de listagem, conferido na referência da API em 10/08/2026.
 *
 * Vale registrar o que eu tinha SUPOSTO antes de ler: `GET /jobs?limit=100`,
 * com paginação por `cursor`. Estava errado nos três pontos -- é POST, o
 * caminho tem sufixo, e o cursor tem outro nome. As três coisas falhariam na
 * primeira execução, o que pelo menos é barulhento; o perigoso era o quarto
 * erro, o `Bearer` faltando no header, que devolveria 401 e pareceria problema
 * de credencial.
 */
export const JOBS_PAGINATED = '/jobs/paginated/lean';

const PERMITIDOS: RegExp[] = [
  /^\/jobs\/paginated\/lean$/,
  /^\/jobs\/[\w-]+$/,
  /^\/custom-fields(\?[^#]*)?$/,
];

export function isPathPermitido(path: string): boolean {
  return PERMITIDOS.some((re) => re.test(path));
}

/**
 * Extrai as vagas e a chave da próxima página.
 *
 * A API roda sobre banco NoSQL e usa "pagination token": a resposta traz
 * `startKey`, que volta na requisição seguinte como `exclusiveStartKey`. Não
 * existe "página 3" -- só dá para caminhar.
 *
 * ATENÇÃO AO CRITÉRIO DE PARADA. A documentação diz para repetir "até que a
 * resposta não contenha mais vagas" -- ou seja, quem manda é a LISTA VAZIA, não
 * a ausência de `startKey`. Parar quando `startKey` some traria dados
 * incompletos se a API devolvesse a última página com chave; continuar com
 * lista vazia mas chave presente giraria à toa. Por isso os dois sinais são
 * devolvidos separados, e quem chama decide com os dois.
 */
export function extrairPagina(resposta: unknown): {
  itens: InhireJob[];
  startKey: unknown;
  reconhecido: boolean;
} {
  if (Array.isArray(resposta)) {
    return { itens: resposta as InhireJob[], startKey: null, reconhecido: true };
  }
  const r = resposta as Record<string, unknown> | null;
  if (!r || typeof r !== 'object') return { itens: [], startKey: null, reconhecido: false };

  const chaveLista = ['data', 'items', 'results', 'jobs'].find((k) => Array.isArray(r[k]));
  if (!chaveLista) return { itens: [], startKey: null, reconhecido: false };

  const bruta = (r.startKey ?? r.lastEvaluatedKey ?? r.nextStartKey ?? null) as unknown;
  // Fim de lista chega como null, string vazia, false ou objeto vazio. Tratar
  // qualquer um deles como chave faria a paginação girar até o teto de páginas,
  // gastando o limite que é compartilhado com o MCP do time.
  const vazia =
    bruta == null || bruta === '' || bruta === false ||
    (typeof bruta === 'object' && Object.keys(bruta as object).length === 0);

  return {
    itens: r[chaveLista] as InhireJob[],
    startKey: vazia ? null : bruta,
    reconhecido: true,
  };
}
