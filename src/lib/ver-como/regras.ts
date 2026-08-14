import { canSeeIndividualData, type AccessProfile, type AccessScope } from '@/lib/permissions';

/**
 * As regras do "ver como", separadas de banco e de HTTP.
 *
 * Isto está aqui, e não dentro de `escopo.server.ts`, por um motivo prático:
 * decisão de permissão precisa de teste, e teste que exige subir Supabase e
 * forjar cabeçalho não é escrito -- ou é escrito uma vez e some. Como função
 * pura, cada regra vira três linhas de teste, inclusive as que só aparecem em
 * combinações que ninguém reproduz à mão (simular outro admin, simular a si
 * mesmo, alvo sem perfil cadastrado).
 */

export interface LinhaAcesso {
  role?: string | null;
  profile?: string | null;
  departments?: string[] | null;
  job_families?: string[] | null;
  /** Abas concedidas alem das do perfil. */
  extra_tabs?: string[] | null;
  /** true/false forcam; null = conforme o perfil. */
  can_see_individual?: boolean | null;
  /** Acesso temporario. Passou da data, a conta para de valer. */
  expires_at?: string | null;
}

export interface EscopoResolvido {
  /** E-mail REAL. Nunca o simulado -- é o que vai para a auditoria. */
  email: string;
  role: 'admin' | 'viewer';
  profile: AccessProfile;
  departments: string[];
  jobFamilies: string[];
  scope: AccessScope;
  verComo: { email: string; profile: AccessProfile } | null;
  /** Abas concedidas a esta pessoa alem das do perfil. */
  extraTabs: string[];
  /**
   * Ja resolvido: flag por usuario quando existe, perfil quando nao existe.
   * Os quatro pontos que mostram dado individual leem daqui, para nao
   * reimplementarem a regra cada um do seu jeito.
   */
  podeVerIndividual: boolean;
  /** Quando o acesso expira, se for temporario. */
  expiraEm: string | null;
}

/** Perfil ausente cai no mais restrito, nunca no mais permissivo. */
export function perfilDe(linha: LinhaAcesso): AccessProfile {
  return (linha.profile as AccessProfile) ?? 'dept_leader';
}

/**
 * `alvo` já normalizado (minúsculo, sem espaço) ou null.
 * `linhaAlvo` só precisa vir preenchida quando há simulação de fato.
 */
export const ACESSO_EXPIRADO = 'Forbidden: acesso expirado.';

/** `agora` entra por parametro para o teste nao depender do relogio. */
export function decidirEscopo(params: {
  email: string;
  propria: LinhaAcesso;
  alvo: string | null;
  linhaAlvo: LinhaAcesso | null;
  agora?: Date;
}): EscopoResolvido {
  const { email, propria, alvo, linhaAlvo } = params;
  const agora = params.agora ?? new Date();

  // ------------------------------------------------------------------
  // VALIDADE VENCIDA E NEGACAO, NAO AVISO
  // ------------------------------------------------------------------
  // A coluna `expires_at` existe desde 14/08 e ate agora NADA a lia. Um campo
  // com cara de permissao que nao vale e o pior meio-caminho possivel: quem
  // cadastra confia nele e vai embora tranquilo, e o acesso continua de pe.
  //
  // Vencido resolve como 'Forbidden', o mesmo caminho de quem nunca esteve na
  // lista -- e por isso derruba a sessao, em vez de deixar a pessoa navegando
  // com um aviso.
  if (expirou(propria, agora)) throw new Error(ACESSO_EXPIRADO);

  // Pedir para ver como si mesmo é a sessão normal, não uma simulação.
  const simula = !!alvo && alvo !== email.trim().toLowerCase();

  if (!simula) return montar(email, propria, null);

  if (perfilDe(propria) !== 'admin') {
    throw new Error('Forbidden: apenas admin pode ver o painel como outra pessoa.');
  }
  if (!linhaAlvo) {
    throw new Error(`Não há usuário cadastrado com o e-mail ${alvo}.`);
  }
  // Simular uma conta vencida mostraria uma tela que a pessoa nao consegue
  // mais abrir. Erro explicito diz o que aconteceu; a tela vazia nao diria.
  if (expirou(linhaAlvo, agora)) {
    throw new Error(`O acesso de ${alvo} está expirado.`);
  }

  return montar(email, linhaAlvo, { email: alvo as string, profile: perfilDe(linhaAlvo) });
}

function expirou(linha: LinhaAcesso, agora: Date): boolean {
  if (!linha.expires_at) return false;
  const t = new Date(linha.expires_at).getTime();
  // Data ilegivel NAO bloqueia: um valor corrompido nao pode virar negacao de
  // acesso silenciosa para alguem que nunca pediu prazo nenhum.
  if (!Number.isFinite(t)) return false;
  return t <= agora.getTime();
}

function montar(
  email: string,
  linha: LinhaAcesso,
  verComo: EscopoResolvido['verComo'],
): EscopoResolvido {
  const profile = perfilDe(linha);
  const scope: AccessScope = {
    profile,
    departments: linha.departments ?? [],
    jobFamilies: linha.job_families ?? [],
  };
  const extraTabs = (linha.extra_tabs ?? []).filter(Boolean);
  return {
    email,
    extraTabs,
    // O flag por usuario resolvido aqui, uma vez, para os quatro pontos que
    // mostram dado individual nao repetirem a regra cada um do seu jeito.
    podeVerIndividual: canSeeIndividualData(profile, linha.can_see_individual ?? null),
    expiraEm: linha.expires_at ?? null,
    // ------------------------------------------------------------------
    // `role` E `profile` SE SEPARAM AQUI, DE PROPÓSITO
    // ------------------------------------------------------------------
    // `profile` é o do alvo: decide o que a tela MOSTRA, e ver isso é o
    // objetivo inteiro da simulação.
    //
    // `role` decide o que se pode ESCREVER, e cai para 'viewer' em qualquer
    // simulação -- inclusive ao simular outro admin. Assim todo
    // `if (role !== 'admin') throw` já espalhado pelo sistema passa a barrar
    // sozinho, sem depender de alguém lembrar de tratar a simulação em cada
    // um deles. Conferir o que alguém vê nunca precisou de escrita.
    role: verComo ? 'viewer' : profile === 'admin' ? 'admin' : 'viewer',
    profile,
    departments: scope.departments,
    jobFamilies: scope.jobFamilies ?? [],
    scope,
    verComo,
  };
}
