import { createMiddleware } from '@tanstack/react-start';
import { CABECALHO_VER_COMO, lerVerComo } from './estado';

/**
 * Anexa o alvo do "ver como" a TODA chamada de server function.
 *
 * Registrado como `functionMiddleware` global em `src/start.ts`, ao lado do
 * que anexa o token do Supabase. Global de propósito: se fosse aplicado
 * arquivo a arquivo, bastaria uma server function esquecida para a simulação
 * mentir naquela aba -- e mentir para o lado perigoso, mostrando o dado do
 * admin com a cara do dado do liderado. Quem está conferindo o acesso de
 * alguém não tem como perceber isso olhando a tela.
 *
 * O cabeçalho é só um PEDIDO. Quem valida é `resolverEscopo` no servidor.
 */
export const attachVerComo = createMiddleware({ type: 'function' }).client(
  async ({ next }) => {
    const alvo = lerVerComo();
    return next({ headers: alvo ? { [CABECALHO_VER_COMO]: alvo } : {} });
  },
);
