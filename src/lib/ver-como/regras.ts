import type { AccessProfile, AccessScope } from '@/lib/permissions';

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
}

/** Perfil ausente cai no mais restrito, nunca no mais permissivo. */
export function perfilDe(linha: LinhaAcesso): AccessProfile {
  return (linha.profile as AccessProfile) ?? 'dept_leader';
}

/**
 * `alvo` já normalizado (minúsculo, sem espaço) ou null.
 * `linhaAlvo` só precisa vir preenchida quando há simulação de fato.
 */
export function decidirEscopo(params: {
  email: string;
  propria: LinhaAcesso;
  alvo: string | null;
  linhaAlvo: LinhaAcesso | null;
}): EscopoResolvido {
  const { email, propria, alvo, linhaAlvo } = params;

  // Pedir para ver como si mesmo é a sessão normal, não uma simulação.
  const simula = !!alvo && alvo !== email.trim().toLowerCase();

  if (!simula) return montar(email, propria, null);

  if (perfilDe(propria) !== 'admin') {
    throw new Error('Forbidden: apenas admin pode ver o painel como outra pessoa.');
  }
  if (!linhaAlvo) {
    throw new Error(`Não há usuário cadastrado com o e-mail ${alvo}.`);
  }

  return montar(email, linhaAlvo, { email: alvo as string, profile: perfilDe(linhaAlvo) });
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
  return {
    email,
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
