import { getRequest } from '@tanstack/react-start/server';
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { CABECALHO_VER_COMO } from '@/lib/ver-como/estado';
import { decidirEscopo, perfilDe, type EscopoResolvido, type LinhaAcesso } from '@/lib/ver-como/regras';
import { canSeeTab, type DashboardTab } from '@/lib/permissions';

/**
 * ===========================================================================
 * O ÚNICO LUGAR QUE DECIDE QUEM VOCÊ É
 * ===========================================================================
 * Até 13/08/2026 existiam TREZE cópias quase idênticas desta consulta, uma em
 * cada `*.functions.ts`. Elas já divergiam: quatro formatos de retorno, e
 * algumas liam só `role` enquanto outras liam o escopo por departamento.
 *
 * Isso é tolerável enquanto todo mundo enxerga tudo. Deixa de ser no momento
 * em que existe "ver como": a simulação precisa alcançar TODAS as abas. Uma
 * cópia esquecida não quebra a tela -- ela devolve o dado do admin com a
 * aparência do dado do liderado, e quem está conferindo o acesso de alguém
 * não tem como perceber isso olhando.
 *
 * Por isso o retorno aqui é largo (email, role, profile, departments,
 * jobFamilies, scope): cada `authorize()` local virou um adaptador de três
 * linhas em cima desta função, sem mexer nos pontos de chamada.
 */

/**
 * O formato do escopo efetivo -- definido junto das regras, em
 * `ver-como/regras.ts`, para que a decisão e o seu formato não possam
 * divergir. `email` é sempre o REAL, nunca o simulado: é o que vai para os
 * campos de auditoria (`user_email`, `loaded_by`), e devolver o simulado ali
 * seria falsificar exatamente o rastro que existe para responder "quem viu
 * isso?".
 */
export type EscopoEfetivo = EscopoResolvido;

async function buscarLinha(email: string): Promise<LinhaAcesso | null> {
  const { data, error } = await supabaseAdmin
    .from('allowed_emails')
    .select('role, profile, departments, job_families, extra_tabs, tabs, sub_tabs, can_see_individual, expires_at, job_level')
    .ilike('email', email)
    .maybeSingle();
  // Falha de consulta NÃO é negação: um erro transitório de banco não pode se
  // disfarçar de "não autorizado" e derrubar uma sessão válida.
  if (error) throw new Error(`Access check failed: ${error.message}`);
  return (data as LinhaAcesso | null) ?? null;
}

/** Lê o alvo pedido no cabeçalho. Só um pedido -- a decisão vem depois. */
function alvoPedido(): string | null {
  try {
    const req = getRequest();
    const v = req?.headers?.get(CABECALHO_VER_COMO.toLowerCase());
    return v && v.trim() ? v.trim().toLowerCase() : null;
  } catch {
    // Fora de um contexto de requisição (ex.: cron chamando o núcleo direto)
    // não existe cabeçalho, e não existe simulação.
    return null;
  }
}

/**
 * Fire-and-forget: o log não pode derrubar a leitura que ele registra.
 *
 * O cast existe porque `metadata` é recém-criada e os tipos gerados do
 * Supabase ainda são de antes da migração. Some sozinho na próxima geração.
 */
function registrar(campos: Record<string, unknown>): void {
  void (supabaseAdmin as unknown as {
    from: (t: string) => {
      insert: (v: unknown) => PromiseLike<{ error: { message: string } | null }>;
    };
  })
    .from('access_logs')
    .insert(campos)
    .then(({ error }) => {
      if (error) console.error('Falha ao registrar acesso:', error.message);
    });
}

/**
 * Resolve o escopo EFETIVO da requisição.
 *
 * Faz apenas o que precisa de mundo externo -- ler o cabeçalho, consultar o
 * banco, registrar o log. A DECISÃO em si vive em `ver-como/regras.ts`, como
 * função pura e testada; aqui não há regra de permissão escrita duas vezes.
 */
export async function resolverEscopo(
  userEmail: string | undefined,
  aba?: DashboardTab,
): Promise<EscopoEfetivo> {
  if (!userEmail) throw new Error('Unauthorized');

  const propria = await buscarLinha(userEmail);
  if (!propria) throw new Error('Forbidden');

  const alvo = alvoPedido();
  const simula = !!alvo && alvo !== userEmail.trim().toLowerCase();

  // Uma tentativa não-admin de simular é deliberada: ninguém forja cabeçalho
  // sem querer. Fica registrada mesmo tendo sido barrada.
  if (simula && perfilDe(propria) !== 'admin') {
    registrar({ email: userEmail, action: 'ver_como_negado', allowed: false, metadata: { alvo } });
  }

  const linhaAlvo = simula ? await buscarLinha(alvo as string) : null;
  const resolvido = decidirEscopo({ email: userEmail, propria, alvo, linhaAlvo });

  // Registra CADA leitura simulada, não só a entrada.
  //
  // Registrar só a entrada deixaria um buraco: quem forjasse o cabeçalho
  // direto, sem passar pela tela, leria o painel inteiro pelos olhos de outra
  // pessoa sem deixar uma linha sequer. O volume é pequeno -- ver como alguém
  // é raro e deliberado -- e é justamente o evento que se quer poder
  // reconstruir depois.
  if (resolvido.verComo) {
    registrar({
      email: userEmail, action: 'ver_como', allowed: true,
      metadata: { alvo: resolvido.verComo.email, perfil_alvo: resolvido.verComo.profile },
    });
  }

  // ------------------------------------------------------------------
  // A ABA TAMBÉM É PERMISSÃO
  // ------------------------------------------------------------------
  // Esconder uma aba no menu não impede nada: a server function continua
  // respondendo a quem souber chamá-la, e saber chamá-la é abrir o inspetor
  // uma vez. Cada função declara a que aba pertence, e a recusa acontece
  // aqui -- no mesmo lugar que já decide quem a pessoa é, e não espalhada
  // por dezessete arquivos onde uma delas ficaria de fora.
  // `extraTabs` entra na conta: uma aba concedida individualmente vale tanto
  // quanto uma que veio do preset. Sem passar isto aqui, o menu mostraria a
  // aba concedida e o servidor a recusaria -- o pior dos dois mundos.
  if (aba && !canSeeTab(resolvido.profile, aba, resolvido.extraTabs, resolvido.tabs)) {
    registrar({
      email: userEmail, action: 'aba_negada', allowed: false,
      metadata: { aba, perfil: resolvido.profile },
    });
    throw new Error('Forbidden: seu perfil não tem acesso a esta seção.');
  }

  return resolvido;
}

/**
 * Verdadeiro quando a requisição está simulando alguém.
 *
 * Serve para as funções de admin recusarem: enquanto a sessão está vendo como
 * um líder de área, ela não deve conseguir importar dados, mexer em usuários
 * ou disparar sincronização. Duas razões, e a segunda importa mais:
 *
 *   1. A prévia mentiria -- cartões de admin continuariam funcionando numa
 *      tela que deveria ser a de um liderado.
 *   2. Uma ação de escrita disparada "de dentro" de outra identidade é o tipo
 *      de coisa que ninguém quer ter que explicar depois.
 */
export async function estaSimulando(userEmail: string | undefined): Promise<boolean> {
  if (!userEmail) return false;
  const alvo = alvoPedido();
  return !!alvo && alvo !== userEmail.toLowerCase();
}

export const SIMULANDO_SEM_ADMIN =
  'Você está vendo o painel como outra pessoa. Saia da simulação para executar ações de admin.';

/**
 * Porta única das ações de admin: precisa ser admin E não estar simulando.
 *
 * `motivo` completa a frase "Forbidden: apenas admin pode ..." -- quem leva o
 * erro merece saber qual ação foi barrada, não só que foi.
 */
export async function exigirAdmin(
  userEmail: string | undefined,
  motivo: string,
): Promise<string> {
  if (!userEmail) throw new Error('Unauthorized');
  if (await estaSimulando(userEmail)) throw new Error(SIMULANDO_SEM_ADMIN);

  const linha = await buscarLinha(userEmail);
  if (!linha) throw new Error('Forbidden');
  if (linha.profile !== 'admin') throw new Error(`Forbidden: apenas admin pode ${motivo}`);
  return userEmail;
}
