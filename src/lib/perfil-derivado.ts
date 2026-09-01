import type { AccessProfile } from '@/lib/permissions';

/**
 * As TRÊS perguntas que um perfil de acesso realmente responde.
 *
 * ===========================================================================
 * POR QUE O PERFIL DEIXOU DE SER ESCOLHIDO
 * ===========================================================================
 * Os cinco perfis, postos lado a lado, codificavam três sim/não e uma lista:
 *
 *   perfil              global  admin  individual  abas
 *   admin               sim     SIM    sim         11
 *   hr_leader           sim     não    sim         11
 *   hrbp                não     não    SIM          9
 *   dept_leader         não     não    NÃO          9
 *   engagement_viewer   não     não    não          1
 *
 * Admin e HR Leader diferem só em "administra usuários". HRBP e Department
 * Leader diferem só em "vê dado individual" -- as mesmas nove abas.
 * `engagement_viewer` é um Department Leader com outra lista de abas, e a
 * lista virou campo por pessoa.
 *
 * Ou seja: o perfil era um rótulo fingindo ser uma decisão. Escolhê-lo e
 * depois ajustar os campos ao lado deixava dois modelos disputando a mesma
 * pergunta -- que foi como a tela ficou confusa.
 *
 * ===========================================================================
 * POR QUE ELE CONTINUA EXISTINDO
 * ===========================================================================
 * `isGlobalProfile` é consultado em 26 pontos do sistema, todos decidindo
 * acesso. Trocar os 26 de uma vez, à noite, para ganhar clareza de cadastro
 * seria péssima troca: o risco é de alguém ver o que não deve, e o ganho é de
 * interface.
 *
 * Então o perfil vira DERIVADO. A tela guarda as três respostas; isto as
 * converte no rótulo que o resto do sistema já entende. Nada muda para os
 * nove cadastrados, e o dia em que os 26 pontos migrarem, esta função é o
 * único lugar a apagar.
 */

export interface ChavesDeAcesso {
  /** Vê a empresa toda, ou só as áreas atribuídas? */
  global: boolean;
  /** Administra usuários? */
  admin: boolean;
  /** Vê nome e salário individuais? */
  individual: boolean;
}

/**
 * As três respostas -> o rótulo interno.
 *
 * `engagement_viewer` NÃO é produzido aqui, de propósito: ele não é uma
 * combinação das três: é um Department Leader com `tabs = ['engagement']`.
 * Mantê-lo como saída possível recriaria a ambiguidade que este arquivo
 * existe para desfazer.
 */
export function perfilDeChaves({ global, admin, individual }: ChavesDeAcesso): AccessProfile {
  if (global) return admin ? 'admin' : 'hr_leader';
  return individual ? 'hrbp' : 'dept_leader';
}

/**
 * O rótulo interno -> as três respostas. Para a tela abrir um cadastro antigo
 * já traduzido.
 *
 * `admin` só é verdade no perfil 'admin'; `individual` segue
 * `canSeeIndividualData`, e quem tiver o campo por usuário preenchido vence
 * isto -- ver `chavesDoCadastro`.
 */
export function chavesDePerfil(profile: AccessProfile): ChavesDeAcesso {
  return {
    global: profile === 'admin' || profile === 'hr_leader',
    admin: profile === 'admin',
    individual: profile === 'admin' || profile === 'hr_leader' || profile === 'hrbp',
  };
}

/**
 * As chaves de um cadastro, respeitando o campo por usuário.
 *
 * `can_see_individual` já existia como override de três estados (true, false,
 * null = conforme o perfil). Com o perfil derivado, o `null` deixa de ter
 * significado próprio: a resposta passa a ser a da chave.
 */
export function chavesDoCadastro(
  profile: AccessProfile,
  canSeeIndividual: boolean | null | undefined,
): ChavesDeAcesso {
  const base = chavesDePerfil(profile);
  return {
    ...base,
    individual: canSeeIndividual == null ? base.individual : canSeeIndividual,
  };
}
