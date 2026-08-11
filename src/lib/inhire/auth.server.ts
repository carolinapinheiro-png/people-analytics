import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Autenticação na API do InHire.
 *
 * ------------------------------------------------------------------
 * O MODELO
 * ------------------------------------------------------------------
 * `POST auth.inhire.app/login` com e-mail e senha do usuário de API devolve
 * um par: `accessToken` que vale 1 HORA e `refreshToken` que vale 30 DIAS.
 * `POST auth.inhire.app/refresh` troca o refresh por um par novo.
 *
 * ------------------------------------------------------------------
 * POR QUE O TOKEN É GUARDADO NO BANCO E NÃO EM MEMÓRIA
 * ------------------------------------------------------------------
 * Server function não tem processo longo: cada invocação pode cair numa
 * instância nova. Um cache em memória seria descartado quase sempre, e a
 * integração faria login a cada chamada -- gastando o limite de requisições que
 * é COMPARTILHADO com o MCP que a equipe usa no dia a dia, e batendo no
 * endpoint de autenticação como se fosse força bruta.
 *
 * No banco, o token sobrevive entre invocações e entre deploys.
 *
 * ------------------------------------------------------------------
 * POR QUE O LOGIN COMPLETO CONTINUA SENDO NECESSÁRIO
 * ------------------------------------------------------------------
 * A tentação é guardar só o refreshToken e nunca mais precisar da senha. Não
 * funciona: o refresh vale 30 dias. Uma pausa maior que isso -- férias
 * coletivas, um mês sem contratação, a integração desligada durante uma
 * migração -- e ele expira. Sem a senha nos secrets, a integração morre em
 * silêncio e alguém precisa criar um usuário de API novo para ressuscitá-la.
 *
 * Por isso os dois caminhos existem, nesta ordem: token válido → refresh →
 * login. O login é o piso, e ele nunca some.
 *
 * ------------------------------------------------------------------
 * A CREDENCIAL TEM ACESSO TOTAL
 * ------------------------------------------------------------------
 * A documentação do InHire é explícita: "o usuário de API tem acesso integral a
 * todos os dados da aplicação". Não há escopo, não há permissão de leitura
 * parcial. Essa credencial lê currículo, CPF, e-mail e telefone de qualquer
 * candidato.
 *
 * O que dá para controlar é o alcance do NOSSO código, e isso é feito em
 * client.server.ts, que só aceita chamar uma lista fechada de caminhos. Aqui,
 * a regra é mais simples: e-mail e senha existem apenas como variável de
 * ambiente do servidor. Nunca no bundle, nunca no banco, nunca em log.
 */

export const INHIRE_AUTH_BASE = 'https://auth.inhire.app';
export const INHIRE_API_BASE = 'https://api.inhire.app';
export const PROVIDER = 'inhire';

/** Renova antes de vencer. Uma requisição que sai com token vencendo no meio do
 *  voo volta 401, e o retry gastaria uma ficha do limite à toa. */
const MARGEM_MS = 5 * 60 * 1000;

export interface InhireCreds {
  email: string;
  password: string;
  tenant: string;
}

/**
 * Lê as credenciais do ambiente. Falha com mensagem acionável -- "Unauthorized"
 * vindo do InHire não diria qual das três variáveis está faltando.
 */
export function readCreds(): InhireCreds {
  const email = process.env.INHIRE_API_EMAIL;
  const password = process.env.INHIRE_API_PASSWORD;
  const tenant = process.env.INHIRE_TENANT;
  const faltando = [
    !email && 'INHIRE_API_EMAIL',
    !password && 'INHIRE_API_PASSWORD',
    !tenant && 'INHIRE_TENANT',
  ].filter(Boolean);
  if (faltando.length) {
    throw new Error(
      `Integração InHire não configurada. Faltam nos secrets: ${faltando.join(', ')}. ` +
      'Crie o usuário de API em Configurações > Usuários de API e cole os valores lá.',
    );
  }
  return { email: email!, password: password!, tenant: tenant! };
}

interface TokenRow {
  access_token: string | null;
  access_expires_at: string | null;
  refresh_token: string | null;
  refresh_expires_at: string | null;
}

interface ParDeTokens {
  accessToken: string;
  refreshToken: string;
}

/** Erro que identifica falha de credencial, para o chamador não tratar como rede. */
export class InhireAuthError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'InhireAuthError';
  }
}

async function postAuth(path: string, body: unknown): Promise<ParDeTokens> {
  const res = await fetch(`${INHIRE_AUTH_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    // O corpo do erro pode conter eco do payload. Nunca propagar -- em `login`
    // isso significaria a senha aparecendo na mensagem, e daí em log.
    throw new InhireAuthError(
      `Falha em ${path}: HTTP ${res.status}. Verifique se o usuário de API está ativo e se a senha nos secrets é a atual.`,
      res.status,
    );
  }
  const json = (await res.json()) as Partial<ParDeTokens>;
  if (!json.accessToken || !json.refreshToken) {
    throw new InhireAuthError(`Resposta de ${path} veio sem os tokens esperados.`);
  }
  return { accessToken: json.accessToken, refreshToken: json.refreshToken };
}

export async function login(creds: InhireCreds): Promise<ParDeTokens> {
  return postAuth('/login', { email: creds.email, password: creds.password });
}

export async function refresh(refreshToken: string): Promise<ParDeTokens> {
  return postAuth('/refresh', { refreshToken });
}

type Db = SupabaseClient<any, 'public', any>;

async function gravar(db: Db, par: ParDeTokens) {
  const agora = Date.now();
  const { error } = await db.from('integration_tokens').upsert({
    provider: PROVIDER,
    access_token: par.accessToken,
    // Prazos declarados pela documentação; a resposta não traz expires_in.
    access_expires_at: new Date(agora + 60 * 60 * 1000).toISOString(),
    refresh_token: par.refreshToken,
    refresh_expires_at: new Date(agora + 30 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
    last_error: null,
  }, { onConflict: 'provider' });
  if (error) throw new Error(`Falha ao guardar o token: ${error.message}`);
}

/**
 * Devolve um accessToken válido, pelo caminho mais barato disponível.
 *
 * Ordem: token em cache ainda válido → refresh → login completo. Cada degrau
 * custa uma requisição a mais, e o primeiro custa zero.
 */
export async function getAccessToken(db: Db, creds: InhireCreds): Promise<string> {
  const { data } = await db
    .from('integration_tokens')
    .select('access_token, access_expires_at, refresh_token, refresh_expires_at')
    .eq('provider', PROVIDER)
    .maybeSingle();
  const row = data as TokenRow | null;
  const agora = Date.now();

  if (row?.access_token && row.access_expires_at) {
    if (new Date(row.access_expires_at).getTime() - MARGEM_MS > agora) return row.access_token;
  }

  if (row?.refresh_token && row.refresh_expires_at) {
    if (new Date(row.refresh_expires_at).getTime() > agora) {
      try {
        const par = await refresh(row.refresh_token);
        await gravar(db, par);
        return par.accessToken;
      } catch {
        // Refresh recusado acontece quando a senha foi rotacionada ou o usuário
        // de API foi desativado. Não é motivo para abortar: o login abaixo diz
        // com clareza qual é o problema, se for o caso.
      }
    }
  }

  const par = await login(creds);
  await gravar(db, par);
  return par.accessToken;
}

/** Invalida o cache. Usado quando a API devolve 401 com token que parecia bom. */
export async function invalidateToken(db: Db, motivo: string) {
  await db.from('integration_tokens').upsert({
    provider: PROVIDER,
    access_token: null,
    access_expires_at: null,
    updated_at: new Date().toISOString(),
    last_error: motivo.slice(0, 300),
  }, { onConflict: 'provider' });
}
