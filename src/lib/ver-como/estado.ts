/**
 * "Ver como": olhar o painel pelos olhos de outra pessoa.
 *
 * ===========================================================================
 * POR QUE ISTO EXISTE
 * ===========================================================================
 * O escopo por departamento só é confiável se alguém conseguir CONFERIR o que
 * um líder de área enxerga. Sem isso, a única forma de testar seria pedir a
 * senha da pessoa ou criar contas falsas -- as duas ruins, a primeira pior.
 *
 * ===========================================================================
 * A REGRA QUE FAZ ISTO NÃO SER UM BURACO
 * ===========================================================================
 * O alvo escolhido aqui é um PEDIDO, não uma decisão. Ele viaja num cabeçalho
 * e quem decide é o servidor (`src/lib/escopo.server.ts`), que exige que o
 * solicitante seja admin. Um não-admin que forje o cabeçalho recebe erro.
 *
 * E o sentido só anda para BAIXO: só admin pode simular, e admin já é o teto.
 * Não existe combinação em que "ver como" mostre mais do que a própria conta
 * já mostrava.
 *
 * ===========================================================================
 * POR QUE sessionStorage, E NÃO localStorage
 * ===========================================================================
 * O risco real desta funcionalidade não é vazamento -- é ESQUECIMENTO. Alguém
 * simula um líder de RH, fecha o painel, volta no dia seguinte e lê números
 * recortados achando que são da empresa inteira. Uma decisão tomada em cima
 * disso não deixa rastro de erro: os números são verdadeiros, só não são os
 * que a pessoa pensa que está lendo.
 *
 * `sessionStorage` morre quando a aba fecha, e não contamina outras abas.
 * Sobrevive a recarregar a página, que é o que se precisa para navegar o
 * painel inteiro durante a conferência.
 */

export const CHAVE_VER_COMO = 'pa:ver-como';
export const CABECALHO_VER_COMO = 'X-Ver-Como';

type Ouvinte = () => void;
const ouvintes = new Set<Ouvinte>();

/** E-mail que está sendo simulado, ou `null` quando a sessão é a real. */
export function lerVerComo(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = window.sessionStorage.getItem(CHAVE_VER_COMO);
    return v && v.trim() ? v.trim().toLowerCase() : null;
  } catch {
    // sessionStorage pode estar bloqueado (modo restrito, política do
    // navegador). Sem ele, a sessão simplesmente não simula ninguém -- que é
    // o padrão seguro.
    return null;
  }
}

export function definirVerComo(email: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (email && email.trim()) {
      window.sessionStorage.setItem(CHAVE_VER_COMO, email.trim().toLowerCase());
    } else {
      window.sessionStorage.removeItem(CHAVE_VER_COMO);
    }
  } catch {
    // Ver acima: sem armazenamento, não há simulação.
  }
  for (const o of ouvintes) o();
}

export function inscreverVerComo(o: Ouvinte): () => void {
  ouvintes.add(o);
  return () => ouvintes.delete(o);
}
