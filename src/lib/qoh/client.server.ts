/**
 * Cliente do app de Qualidade da Contratação (Appsmith, feito pelo TI da NSX).
 *
 * ===========================================================================
 * O TOKEN VAI NA URL, E ISSO É UM PROBLEMA HERDADO
 * ===========================================================================
 * A API foi entregue assim:
 *
 *   GET .../API/v1/cadastros/avaliacoes?token=<uuid>
 *
 * Segredo em query string vaza por caminhos que ninguém audita: log de acesso
 * do servidor, histórico de navegador, cabeçalho `Referer` mandado a
 * terceiros. Num serviço interno o risco é menor, mas o log do próprio
 * servidor guarda o token em texto a cada chamada -- para sempre.
 *
 * O código abaixo tenta PRIMEIRO por cabeçalho. Se o serviço passar a aceitar
 * `Authorization: Bearer` ou `X-Token` -- uma linha do lado do TI --, a
 * integração já está pronta e o token some das URLs sem mudar nada aqui.
 *
 * Enquanto isso, duas proteções:
 *
 *   1. `redigir()` limpa o token de QUALQUER texto antes de virar mensagem de
 *      erro. Sem isso, um 500 com a URL no corpo colocaria o segredo no log de
 *      sincronização, que é justamente o lugar que a gente lê quando algo
 *      quebra.
 *   2. A URL nunca é concatenada em log, aviso ou retorno.
 */

import { isPathPermitido, QOH_BASE } from './paths';

export class QohClient {
  private token: string;
  /**
   * `null` = ainda não sabemos se o serviço aceita cabeçalho. Na primeira
   * chamada tentamos por cabeçalho; se falhar com 401/403, caímos para a query
   * string e lembramos disso.
   */
  private aceitaHeader: boolean | null = null;
  stats = { requests: 0, viaHeader: 0, viaQuery: 0 };

  private constructor(token: string) {
    this.token = token;
  }

  static create(): QohClient {
    const bruto = process.env.QOH_API_TOKEN;
    if (!bruto) {
      throw new Error('Integração não configurada: falta o secret QOH_API_TOKEN.');
    }
    const token = bruto.trim().replace(/^["']|["']$/g, '');
    if (token.length < 20) {
      throw new Error(
        `QOH_API_TOKEN tem só ${token.length} caracteres — parece truncado. Confira se o valor colado no secret está inteiro.`,
      );
    }
    return new QohClient(token);
  }

  /**
   * Tira o token de qualquer texto. Chamada em TODA mensagem de erro.
   *
   * Um erro que vaza o segredo é pior que o erro original: o incidente vira
   * dois, e o segundo fica registrado no banco onde a gente vai procurar
   * ajuda para o primeiro.
   */
  private redigir(texto: string): string {
    return texto.split(this.token).join('<TOKEN>');
  }

  async get<T>(path: string, params?: Record<string, string | number>): Promise<T> {
    if (!isPathPermitido(path)) {
      throw new Error(`Caminho não permitido: ${path}. A lista fechada está em src/lib/qoh/paths.ts.`);
    }

    const montar = (comToken: boolean) => {
      const url = new URL(QOH_BASE + path);
      for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, String(v));
      if (comToken) url.searchParams.set('token', this.token);
      return url;
    };

    const tentar = async (viaHeader: boolean) => {
      const url = montar(!viaHeader);
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (viaHeader) {
        headers.Authorization = `Bearer ${this.token}`;
        headers['X-Token'] = this.token;
      }
      this.stats.requests++;
      if (viaHeader) this.stats.viaHeader++; else this.stats.viaQuery++;
      return fetch(url, { headers });
    };

    let res: Response;
    if (this.aceitaHeader === false) {
      res = await tentar(false);
    } else {
      res = await tentar(true);
      // 401/403 por cabeçalho significa que o serviço ainda só entende query
      // string. Registramos e não tentamos por cabeçalho de novo nesta carga.
      if (res.status === 401 || res.status === 403) {
        this.aceitaHeader = false;
        res = await tentar(false);
      } else if (res.ok) {
        this.aceitaHeader = true;
      }
    }

    const texto = await res.text();
    if (!res.ok) {
      throw new Error(this.redigir(`Qualidade da Contratação respondeu ${res.status}: ${texto.slice(0, 300)}`));
    }
    try {
      return JSON.parse(texto) as T;
    } catch {
      throw new Error(this.redigir(`Resposta não é JSON: ${texto.slice(0, 200)}`));
    }
  }
}
