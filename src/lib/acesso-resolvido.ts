import type { AccessProfile } from '@/lib/permissions';
import { perfilDeChaves, type ChavesDeAcesso } from '@/lib/perfil-derivado';

/**
 * O que um cadastro enxerga, somando perfil e exceção -- num lugar só.
 *
 * ===========================================================================
 * POR QUE ISTO É UMA FUNÇÃO PURA, E NÃO UM JOIN NO SERVIDOR
 * ===========================================================================
 * A regra tem três camadas -- perfil, exceção da pessoa, e o padrão de quem
 * não tem perfil -- e ela precisa valer igual em três lugares: no `authorize`
 * do servidor, na tela de cadastro (que mostra o que a pessoa vai ver) e na
 * lista de usuários (que mostra o que ela já vê).
 *
 * Três implementações da mesma regra de acesso é como o painel chegou a ter
 * `cuts` liberando um recorte que `drivers` bloqueava. Aqui é uma, com teste.
 *
 * ===========================================================================
 * A EXCEÇÃO PRECISA SER VISÍVEL, E NÃO SÓ FUNCIONAR
 * ===========================================================================
 * `excecoes` sai junto com o acesso de propósito. Sem isso, alguém tira uma
 * aba do perfil HRBP, uma das cinco pessoas não muda -- porque tem lista
 * própria -- e a conclusão é "o perfil não está funcionando". O cadastro tem
 * de dizer, na cara, quais campos daquela pessoa ignoram o perfil.
 */

/** O cadastro, como vem de `allowed_emails`. */
export interface CadastroDeAcesso {
  profileId?: string | null;
  /** O enum gravado. Só é consultado quando não há perfil. */
  profile?: AccessProfile | null;
  /** Exceções: nulo = herda do perfil, quando há perfil. */
  veEmpresaToda?: boolean | null;
  administraUsuarios?: boolean | null;
  veIndividual?: boolean | null;
  tabs?: readonly string[] | null;
  subTabs?: readonly string[] | null;
  extraTabs?: readonly string[] | null;
}

/** O perfil, como vem de `access_profiles`. */
export interface PerfilDeAcesso {
  id: string;
  nome: string;
  veEmpresaToda: boolean;
  administraUsuarios: boolean;
  veIndividual: boolean;
  tabs?: readonly string[] | null;
  subTabs?: readonly string[] | null;
}

export type CampoDeAcesso =
  | 'veEmpresaToda' | 'administraUsuarios' | 'veIndividual' | 'tabs' | 'subTabs';

export interface AcessoResolvido {
  chaves: ChavesDeAcesso;
  /** O rótulo interno que os 26 pontos de `isGlobalProfile` consultam. */
  profile: AccessProfile;
  /** Lista efetiva de abas. `null` = usa o preset do perfil derivado. */
  tabs: string[] | null;
  subTabs: string[] | null;
  /** Abas somadas, que só valem quando não há lista explícita. */
  extraTabs: string[] | null;
  /** O perfil de onde veio o acesso, quando veio de um. */
  perfil: { id: string; nome: string } | null;
  /** Campos que o cadastro sobrescreve. Vazio quando tudo vem do perfil. */
  excecoes: CampoDeAcesso[];
}

/** Lista vazia é "não definida" -- ver visibleTabs. Salvar sem marcar nada é
 *  o gesto mais fácil de fazer sem querer, e não pode virar "não vê nada". */
const lista = (v: readonly string[] | null | undefined): string[] | null =>
  v && v.length ? [...v] : null;

export function resolverAcesso(
  cadastro: CadastroDeAcesso,
  perfil: PerfilDeAcesso | null | undefined,
): AcessoResolvido {
  const excecoes: CampoDeAcesso[] = [];

  // ------------------------------------------------------------------
  // SEM PERFIL: EXATAMENTE O COMPORTAMENTO ANTERIOR
  // ------------------------------------------------------------------
  // Os nove cadastros de hoje caem aqui e não mudam em nada. `profile_id`
  // nulo não é um estado de transição a ser eliminado -- é o cadastro avulso,
  // que continua válido.
  if (!perfil) {
    const chaves: ChavesDeAcesso = {
      global: cadastro.veEmpresaToda ?? false,
      admin: cadastro.administraUsuarios ?? false,
      individual: cadastro.veIndividual ?? false,
    };
    return {
      chaves,
      profile: cadastro.profile ?? perfilDeChaves(chaves),
      tabs: lista(cadastro.tabs),
      subTabs: lista(cadastro.subTabs),
      extraTabs: lista(cadastro.extraTabs),
      perfil: null,
      excecoes: [],
    };
  }

  // ------------------------------------------------------------------
  // COM PERFIL: ELE MANDA, E O CAMPO PREENCHIDO É EXCEÇÃO
  // ------------------------------------------------------------------
  // `undefined` e `null` são a mesma coisa aqui -- "não respondi, herdo".
  // Só `true` e `false` explícitos contam como exceção, e é por isso que os
  // três campos precisam aceitar nulo no banco.
  const marcar = <T>(valorDoCadastro: T | null | undefined, doPerfil: T, campo: CampoDeAcesso): T => {
    if (valorDoCadastro == null) return doPerfil;
    if (valorDoCadastro !== doPerfil) excecoes.push(campo);
    return valorDoCadastro;
  };

  const chaves: ChavesDeAcesso = {
    global: marcar(cadastro.veEmpresaToda, perfil.veEmpresaToda, 'veEmpresaToda'),
    admin: marcar(cadastro.administraUsuarios, perfil.administraUsuarios, 'administraUsuarios'),
    individual: marcar(cadastro.veIndividual, perfil.veIndividual, 'veIndividual'),
  };

  const tabsDoCadastro = lista(cadastro.tabs);
  const tabsDoPerfil = lista(perfil.tabs);
  if (tabsDoCadastro && !mesmaLista(tabsDoCadastro, tabsDoPerfil)) excecoes.push('tabs');

  const subDoCadastro = lista(cadastro.subTabs);
  const subDoPerfil = lista(perfil.subTabs);
  if (subDoCadastro && !mesmaLista(subDoCadastro, subDoPerfil)) excecoes.push('subTabs');

  return {
    chaves,
    profile: perfilDeChaves(chaves),
    tabs: tabsDoCadastro ?? tabsDoPerfil,
    subTabs: subDoCadastro ?? subDoPerfil,
    // ------------------------------------------------------------------
    // `extra_tabs` NÃO SOBREVIVE AO PERFIL
    // ------------------------------------------------------------------
    // Ela soma sobre o preset. Somando também sobre a lista do perfil, o
    // cadastro voltaria a ter duas listas mandando ao mesmo tempo -- a
    // combinação que `visibleTabs` existe para não ter. Quem precisa de mais
    // uma aba ganha lista própria, que aparece como exceção.
    extraTabs: null,
    perfil: { id: perfil.id, nome: perfil.nome },
    excecoes,
  };
}

function mesmaLista(a: string[] | null, b: string[] | null): boolean {
  if (a == null || b == null) return a === b;
  if (a.length !== b.length) return false;
  const x = [...a].sort();
  const y = [...b].sort();
  return x.every((v, i) => v === y[i]);
}

/**
 * Quantas pessoas um perfil afeta. A tela precisa disto ANTES de salvar.
 *
 * Editar um perfil muda o acesso de todo mundo que está nele, de uma vez --
 * é o que faz o perfil valer a pena e é o que o torna perigoso. Um botão
 * "Salvar" que não diz quantas pessoas mudam é o mesmo erro de sempre: a
 * consequência existe e a tela não a mostra.
 */
export function atingidosPeloPerfil(
  cadastros: readonly CadastroDeAcesso[],
  perfilId: string,
  campo: CampoDeAcesso,
): number {
  return cadastros.filter((c) => {
    if (c.profileId !== perfilId) return false;
    // Quem tem exceção naquele campo não é afetado por mudança nele.
    if (campo === 'tabs') return !lista(c.tabs);
    if (campo === 'subTabs') return !lista(c.subTabs);
    return c[campo] == null;
  }).length;
}
