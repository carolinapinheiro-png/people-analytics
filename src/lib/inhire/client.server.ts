import type { SupabaseClient } from '@supabase/supabase-js';
import {
  INHIRE_API_BASE, getAccessToken, invalidateToken, readCreds,
  type InhireCreds,
} from './auth.server';
import { isPathPermitido } from './paths';

/**
 * Cliente HTTP da API do InHire.
 *
 * ------------------------------------------------------------------
 * O LIMITE É COMPARTILHADO COM O MCP — ISTO MUDA TUDO
 * ------------------------------------------------------------------
 * A documentação diz que o limite é POR CONTA, não por credencial: 20
 * requisições por segundo sustentadas, com um balde de 400 fichas para picos.
 * O conector MCP que a equipe usa no dia a dia bebe do mesmo balde.
 *
 * Ou seja: uma sincronização mal-comportada aqui não degrada só a si mesma --
 * ela derruba a ferramenta que o time de recrutamento está usando naquele
 * momento, sem que ninguém entenda por quê. Por isso este módulo é
 * deliberadamente lento: teto de concorrência baixo, pausa entre lotes, e
 * recuo agressivo ao primeiro sinal de 429.
 *
 * O padrão implementado é o que a própria documentação recomenda: respeitar
 * `Retry-After`, backoff exponencial com jitter, e desacelerar de forma
 * preventiva quando `X-RateLimit-Remaining` fica baixo -- em vez de acelerar
 * até tomar erro.
 *
 * ------------------------------------------------------------------
 * LISTA FECHADA DE CAMINHOS
 * ------------------------------------------------------------------
 * A credencial tem acesso integral a todos os dados da conta, incluindo
 * currículo, CPF e telefone de candidato. Não existe escopo do lado do InHire.
 *
 * O que dá para fazer é limitar o alcance do nosso lado: `PERMITIDOS` é uma
 * lista fechada de caminhos, e qualquer chamada fora dela falha antes de sair
 * da máquina. Isso não protege contra código malicioso -- protege contra o
 * cenário real, que é alguém (inclusive eu, num commit futuro) acrescentar uma
 * varredura de candidatos "só para ver" e o dado pessoal começar a circular sem
 * ninguém ter decidido isso.
 *
 * Ampliar a lista é uma mudança de código, revisável, e não um efeito colateral.
 */

type Db = SupabaseClient<any, 'public', any>;

export class InhireForbiddenPathError extends Error {
  constructor(path: string) {
    super(
      `Caminho não permitido para este dashboard: ${path}. ` +
      'A credencial do InHire tem acesso total; a lista de caminhos em client.server.ts é o que limita o alcance. ' +
      'Se este caminho for mesmo necessário, acrescente-o lá conscientemente.',
    );
    this.name = 'InhireForbiddenPathError';
  }
}

export interface ClientStats {
  requests: number;
  retries429: number;
  /** Menor valor visto de X-RateLimit-Remaining, para saber quão perto do teto passamos. */
  minRemaining: number | null;
}

export class InhireClient {
  private token: string | null = null;
  readonly stats: ClientStats = { requests: 0, retries429: 0, minRemaining: null };

  private constructor(private db: Db, private creds: InhireCreds) {}

  static async create(db: Db): Promise<InhireClient> {
    const creds = readCreds();
    const c = new InhireClient(db, creds);
    c.token = await getAccessToken(db, creds);
    return c;
  }

  /**
   * GET num caminho permitido.
   *
   * @param path caminho a partir de api.inhire.app, começando com "/"
   */
  async get<T>(path: string): Promise<T> {
    if (!isPathPermitido(path)) throw new InhireForbiddenPathError(path);
    return this.request<T>(path, 0);
  }

  private async request<T>(path: string, tentativa: number): Promise<T> {
    if (!this.token) this.token = await getAccessToken(this.db, this.creds);

    const res = await fetch(`${INHIRE_API_BASE}${path}`, {
      headers: {
        Authorization: this.token,
        'X-Tenant': this.creds.tenant,
        Accept: 'application/json',
      },
    });
    this.stats.requests++;

    const restante = Number(res.headers.get('x-ratelimit-remaining'));
    if (Number.isFinite(restante)) {
      this.stats.minRemaining =
        this.stats.minRemaining == null ? restante : Math.min(this.stats.minRemaining, restante);
      // Desaceleração preventiva. O balde é da conta inteira: chegar perto do
      // fundo significa que o MCP do time começa a tomar 429 por nossa causa.
      if (restante < 80) await dormir(1000);
    }

    if (res.status === 429) {
      if (tentativa >= 5) throw new Error('Limite de requisições do InHire persistente após 5 tentativas.');
      this.stats.retries429++;
      // `Retry-After` vem em segundos, mínimo 1. O 429 é aplicado ANTES de a
      // requisição chegar à API, então repetir é seguro -- nada foi executado.
      const header = Number(res.headers.get('retry-after'));
      const base = header >= 1 ? header : 1;
      const espera = base * 2 ** tentativa;
      const jitter = Math.random() * espera * 0.3;
      await dormir((espera + jitter) * 1000);
      return this.request<T>(path, tentativa + 1);
    }

    if (res.status === 401) {
      if (tentativa >= 1) throw new Error('InHire recusou o token duas vezes seguidas. Verifique o usuário de API.');
      // Token vencido antes do previsto, ou senha rotacionada. Descarta o cache
      // e tenta uma vez; se falhar de novo, é problema de credencial.
      await invalidateToken(this.db, 'HTTP 401 na API');
      this.token = null;
      return this.request<T>(path, tentativa + 1);
    }

    if (!res.ok) {
      throw new Error(`InHire respondeu HTTP ${res.status} em ${path}`);
    }

    return (await res.json()) as T;
  }

  /**
   * Percorre uma lista paginada até o fim.
   *
   * Página grande de propósito: cada requisição custa uma ficha do balde
   * compartilhado, então trazer 100 registros por chamada em vez de 20 reduz o
   * consumo em cinco vezes para o mesmo resultado.
   *
   * O teto de páginas existe para que um bug de paginação do outro lado -- um
   * cursor que nunca avança -- não vire um laço infinito consumindo o limite
   * até o time inteiro perder o MCP.
   */
  async getAll<T>(
    path: string,
    extrair: (resposta: unknown) => { itens: T[]; proximo: string | null },
    maxPaginas = 100,
  ): Promise<T[]> {
    const out: T[] = [];
    let atual: string | null = path;
    for (let p = 0; p < maxPaginas && atual; p++) {
      const resposta: unknown = await this.get<unknown>(atual);
      const { itens, proximo } = extrair(resposta);
      out.push(...itens);
      atual = proximo;
      // Pausa entre páginas: mantém o ritmo abaixo da taxa sustentada mesmo
      // quando a rede está rápida, em vez de esvaziar o burst num piscar.
      if (atual) await dormir(120);
    }
    return out;
  }
}

function dormir(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
