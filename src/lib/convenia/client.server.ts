import { CONVENIA_BASE, extrairPagina, isPathPermitido } from './paths';

/**
 * Cliente HTTP do Convenia.
 *
 * ------------------------------------------------------------------
 * 50 REQUISIÇÕES POR MINUTO -- E ISSO MUDA O DESENHO
 * ------------------------------------------------------------------
 * O InHire permite 20 por SEGUNDO. O Convenia permite 50 por MINUTO: vinte e
 * quatro vezes menos. Um ritmo que era educado lá derruba a integração aqui.
 *
 * Por isso o cliente espaça as chamadas em 1,3 segundo (≈46/min, com folga
 * proposital abaixo do teto) e pede páginas grandes. Uma carga de 400 pessoas
 * em páginas de 100 são 4 requisições e ~5 segundos -- perfeitamente aceitável
 * uma vez por semana.
 *
 * A folga não é excesso de zelo: o limite provavelmente é por empresa, e se o
 * time usa o Convenia integrado a alguma outra coisa (Power BI, folha), nós
 * dividimos o balde sem saber com quem.
 */

const INTERVALO_MS = 1300;

export class ConveniaClient {
  private token: string;
  private ultimaChamada = 0;
  stats = { requests: 0, retries429: 0 };

  private constructor(token: string) {
    this.token = token;
  }

  /**
   * Valida a credencial ANTES de chamar a API, para o erro dizer o que fazer.
   *
   * Isto existe por causa do InHire: um HTTP 400 por espaço em branco colado
   * junto do valor produziu uma mensagem que apontava para "senha errada", e
   * mandou quem investigou mexer numa credencial que estava certa.
   */
  static create(): ConveniaClient {
    const bruto = process.env.CONVENIA_API_TOKEN;
    if (!bruto) {
      throw new Error('Integração não configurada: falta o secret CONVENIA_API_TOKEN.');
    }
    // Espaço, quebra de linha e aspas sobram de copiar e colar. Tirar aqui
    // evita um 401 que parece token inválido e não é.
    const token = bruto.trim().replace(/^["']|["']$/g, '');
    if (token.length < 20) {
      throw new Error(
        `CONVENIA_API_TOKEN tem só ${token.length} caracteres — parece truncado. Confira se o valor colado no secret está inteiro.`,
      );
    }
    return new ConveniaClient(token);
  }

  private async esperarVez() {
    const desde = Date.now() - this.ultimaChamada;
    if (this.ultimaChamada && desde < INTERVALO_MS) {
      await new Promise((r) => setTimeout(r, INTERVALO_MS - desde));
    }
    this.ultimaChamada = Date.now();
  }

  async get<T>(path: string, params?: Record<string, string | number>): Promise<T> {
    if (!isPathPermitido(path)) {
      // Falha ANTES de sair da máquina: um caminho fora da lista nunca vira
      // requisição, então nem chega a existir resposta com dado pessoal.
      throw new Error(`Caminho não permitido: ${path}. A lista fechada está em src/lib/convenia/paths.ts.`);
    }

    const url = new URL(CONVENIA_BASE + path);
    for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, String(v));

    for (let tentativa = 0; ; tentativa++) {
      await this.esperarVez();
      this.stats.requests++;

      const res = await fetch(url, {
        headers: {
          // O Convenia usa um cabeçalho `token` puro, sem "Bearer".
          // Não é o padrão da maioria das APIs, e é exatamente o tipo de
          // detalhe que produz um 401 enganoso quando se assume o padrão.
          token: this.token,
          Accept: 'application/json',
        },
      });

      if (res.status === 429) {
        this.stats.retries429++;
        if (tentativa >= 4) throw new Error('O Convenia recusou por excesso de chamadas mesmo depois de 4 esperas.');
        // Espera crescente com sorteio: se duas cargas colidirem, elas não
        // voltam juntas e colidem de novo.
        const espera = 5000 * Math.pow(2, tentativa) + Math.random() * 1000;
        await new Promise((r) => setTimeout(r, espera));
        continue;
      }

      const texto = await res.text();
      if (!res.ok) {
        // Devolve o corpo da resposta. Sem isso, um 400 vira adivinhação --
        // foi o que aconteceu no InHire e custou uma investigação inteira.
        throw new Error(`Convenia respondeu ${res.status} em ${path}: ${texto.slice(0, 300)}`);
      }

      try {
        return JSON.parse(texto) as T;
      } catch {
        throw new Error(`Convenia devolveu algo que não é JSON em ${path}: ${texto.slice(0, 200)}`);
      }
    }
  }

  /**
   * Percorre todas as páginas de um recurso.
   *
   * O critério de parada é `current_page >= last_page`, com um teto rígido de
   * páginas como rede de segurança: se a API mudar o envelope e `last_page`
   * sumir, o laço para em vez de girar para sempre consumindo o limite da
   * empresa inteira.
   */
  async listarTudo<T>(
    path: string,
    { porPagina = 100, maxPaginas = 50, aoAvisar }: { porPagina?: number; maxPaginas?: number; aoAvisar?: (a: string) => void } = {},
  ): Promise<T[]> {
    const todos: T[] = [];
    for (let pagina = 1; pagina <= maxPaginas; pagina++) {
      const corpo = await this.get<unknown>(path, { page: pagina, per_page: porPagina });
      const { itens, ultimaPagina, reconhecido } = extrairPagina<T>(corpo);

      if (!reconhecido) {
        aoAvisar?.(`A resposta de ${path} não veio no formato esperado — trate o resultado como incompleto.`);
        break;
      }

      todos.push(...itens);

      if (itens.length === 0) break;
      if (ultimaPagina != null && pagina >= ultimaPagina) break;
      if (ultimaPagina == null && itens.length < porPagina) break;

      if (pagina === maxPaginas) {
        aoAvisar?.(`Parei em ${maxPaginas} páginas em ${path} por segurança. Se a empresa tiver mais gente que isso, aumente o teto de propósito.`);
      }
    }
    return todos;
  }
}
