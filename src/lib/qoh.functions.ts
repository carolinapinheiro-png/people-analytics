import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

/**
 * Sonda do app de Qualidade da Contratação.
 *
 * Mesmo passo zero das outras integrações, pela mesma razão: o contrato real
 * de uma API só se conhece pela resposta. Três vezes nesta conversa eu conclui
 * algo a partir de documentação ou nome de campo e a resposta me contradisse.
 *
 * Esta função NÃO grava nada. Ela pergunta como a resposta é feita -- quantos
 * registros, quais chaves, quais valores as perguntas fechadas assumem -- para
 * o agregador ser escrito em cima de evidência.
 */

async function authorizeAdmin(userEmail: string | undefined) {
  if (!userEmail) throw new Error('Unauthorized');
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data, error } = await supabaseAdmin
    .from('allowed_emails').select('role').ilike('email', userEmail).maybeSingle();
  if (error) throw new Error(`Access check failed: ${error.message}`);
  if (!data) throw new Error('Forbidden');
  if ((data as { role?: string }).role !== 'admin') {
    throw new Error('Forbidden: apenas admin pode inspecionar a integração');
  }
  return userEmail;
}

export interface SondaQoh {
  configurado: boolean;
  /** Quantos registros a resposta trouxe. */
  registros: number;
  /** Só NOMES de campo. Nenhum valor de pessoa sai daqui. */
  campos: string[];
  /**
   * Valores distintos das colunas que parecem categóricas, com contagem.
   * É a única leitura de valor, e serve para descobrir como as respostas das
   * perguntas fechadas são escritas -- "Sim, totalmente" ou "1"? "Mesmo cargo"
   * ou um id? Sem isso o de-para de pontuação seria adivinhação.
   *
   * Campos com muitos valores distintos (texto aberto, nome, e-mail) ficam de
   * fora automaticamente: se quase todo registro tem um valor diferente, é
   * dado de pessoa, não categoria.
   */
  categorias: { campo: string; valores: { valor: string; n: number }[] }[];
  /** Como o token foi aceito, para sabermos se dá para sair da query string. */
  viaHeader: boolean;
  avisos: string[];
  erro: string | null;
}

const MAX_DISTINTOS = 12;

export const sondarQoh = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SondaQoh> => {
    await authorizeAdmin(context.claims.email as string | undefined);

    const vazio: SondaQoh = {
      configurado: false, registros: 0, campos: [], categorias: [],
      viaHeader: false, avisos: [], erro: null,
    };

    if (!process.env.QOH_API_TOKEN) {
      return { ...vazio, erro: 'Falta o secret QOH_API_TOKEN.' };
    }

    try {
      const { QohClient } = await import('@/lib/qoh/client.server');
      const { AVALIACOES } = await import('@/lib/qoh/paths');
      const client = QohClient.create();

      const corpo = await client.get<unknown>(AVALIACOES);

      // O envelope pode ser array direto ou { data: [...] } -- os dois
      // existem por aí, e supor um deles foi exatamente o erro que me custou
      // uma rodada inteira no Convenia.
      const itens: Record<string, unknown>[] = Array.isArray(corpo)
        ? (corpo as Record<string, unknown>[])
        : Array.isArray((corpo as { data?: unknown })?.data)
          ? ((corpo as { data: Record<string, unknown>[] }).data)
          : [];

      const avisos: string[] = [];
      if (!itens.length) {
        avisos.push('A chamada funcionou mas não voltou nenhum registro. Pode ser que ninguém tenha respondido ainda, ou que o formato do envelope seja outro.');
      }

      const campos = itens.length ? Object.keys(itens[0]) : [];

      // Descobre os valores possíveis das colunas categóricas.
      const categorias: SondaQoh['categorias'] = [];
      for (const campo of campos) {
        const conta = new Map<string, number>();
        for (const it of itens) {
          const v = it[campo];
          if (v == null || typeof v === 'object') continue;
          const s = String(v);
          // Texto longo é resposta aberta, não categoria.
          if (s.length > 60) continue;
          conta.set(s, (conta.get(s) ?? 0) + 1);
        }
        // Muitos valores distintos = identificador ou texto livre, não categoria.
        if (conta.size === 0 || conta.size > MAX_DISTINTOS) continue;
        categorias.push({
          campo,
          valores: [...conta.entries()]
            .map(([valor, n]) => ({ valor, n }))
            .sort((a, b) => b.n - a.n),
        });
      }

      if (client.stats.viaQuery > 0) {
        avisos.push('O serviço só aceitou o token na URL. Se o TI habilitar `Authorization: Bearer` ou `X-Token`, esta integração passa a usar cabeçalho sozinha — o código já tenta por cabeçalho primeiro.');
      }

      return {
        configurado: true,
        registros: itens.length,
        campos,
        categorias,
        viaHeader: client.stats.viaHeader > 0 && client.stats.viaQuery === 0,
        avisos,
        erro: null,
      };
    } catch (e) {
      return { ...vazio, configurado: true, erro: e instanceof Error ? e.message : String(e) };
    }
  });
