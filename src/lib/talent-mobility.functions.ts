import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
import type { CampoVisto, Casamento, EscolhaSalva } from '@/lib/talent-mobility';

/**
 * O mapa: qual campo do Convenia preenche cada coluna do report do Sandeep.
 *
 * ===========================================================================
 * ISTO NÃO GERA REPORT NENHUM
 * ===========================================================================
 * Lê uma amostra do cadastro e mostra, coluna por coluna, o que existe para
 * preenchê-la. Não grava, não baixa, não decide.
 *
 * A ordem importa: enquanto o mapa não estiver conferido, gerar o CSV produz
 * 51 colunas plausíveis com Career Band no lugar de Compensation Grade -- e um
 * arquivo que parece certo é pior do que um que falta.
 *
 * O filtro de valor é o mesmo da sonda de escritório, e pela mesma razão: a
 * primeira execução daquela imprimiu CNPJ e endereço de prestador numa tela de
 * admin, debaixo de uma frase minha dizendo que isso não acontecia.
 */
export interface MapaDeCampos {
  empresa: string;
  amostra: number;
  mapa: Casamento[];
  /** Todos os campos vistos, para o seletor da tela. */
  campos: CampoVisto[];
  /** Campos que nenhuma coluna reivindicou -- onde mora o que eu não previ. */
  sobraram: CampoVisto[];
  erro: string | null;
}

async function authorizeAdmin(userEmail: string | undefined) {
  const { exigirAdmin } = await import('@/lib/escopo.server');
  return exigirAdmin(userEmail, 'mapear os campos dos reports do Sandeep');
}

export const mapearCamposTalent = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MapaDeCampos[]> => {
    await authorizeAdmin(context.claims.email as string | undefined);

    const { fontesConfiguradas } = await import('@/lib/convenia/fontes');
    const { ConveniaClient } = await import('@/lib/convenia/client.server');
    const { EMPLOYEES, EMPLOYEE_DETAIL } = await import('@/lib/convenia/paths');
    const { lerCustomFields, valorEhSensivel } = await import('@/lib/convenia/custom-fields');
    const { casarCampos, sobraram } = await import('@/lib/talent-mobility');

    // As escolhas gravadas valem para todas as fontes: o mapa é do report, não
    // da empresa. Lidas uma vez, fora do laço.
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const dbMapa = supabaseAdmin as unknown as {
      from: (t: string) => { select: (c: string) => PromiseLike<{ data: unknown[] | null }> };
    };
    const { data: gravadas } = await dbMapa.from('talent_mobility_mapa')
      .select('coluna, campo, definido_por');
    const salvas: EscolhaSalva[] = ((gravadas ?? []) as Array<{
      coluna: string; campo: string; definido_por: string;
    }>).map((r) => ({ coluna: r.coluna, campo: r.campo, definidoPor: r.definido_por }));

    /** Achata `{name: 'X'}` e trunca. Valor nunca sai inteiro. */
    const legivel = (v: unknown): string | null => {
      if (typeof v === 'string') return v.trim().slice(0, 40) || null;
      if (typeof v === 'number') return String(v);
      if (v && typeof v === 'object' && 'name' in v) {
        const n = (v as { name?: unknown }).name;
        return typeof n === 'string' ? n.trim().slice(0, 40) || null : null;
      }
      return null;
    };

    const saida: MapaDeCampos[] = [];

    for (const f of fontesConfiguradas()) {
      const linha: MapaDeCampos = {
        empresa: f.empresa, amostra: 0, mapa: [], campos: [], sobraram: [], erro: null,
      };
      try {
        const client = ConveniaClient.paraToken(f.token!);
        const pagina = await client.listarTudo<Record<string, unknown>>(EMPLOYEES, {
          porPagina: 20, maxPaginas: 1,
        });
        // Amostra pequena de propósito: o objetivo é descobrir ONDE o campo
        // mora, não medir cobertura. A cobertura sai depois, na carga inteira.
        const amostra = pagina.slice(0, 8);
        linha.amostra = amostra.length;

        const vistos = new Map<string, { origem: CampoVisto['origem']; n: number; vals: Set<string> }>();
        // Uma pessoa conta UMA vez por campo. O mesmo nome aparece na listagem
        // e no detalhe, e somar os dois laços imprimiu "name 16/8" -- numerador
        // maior que denominador, que além de errado faz duvidar do resto do
        // quadro. É o mesmo erro que a sonda de escritório já tinha cometido.
        const contadaNestaPessoa = new Set<string>();
        const anotar = (nome: string, origem: CampoVisto['origem'], texto: string | null) => {
          const atual = vistos.get(nome) ?? { origem, n: 0, vals: new Set<string>() };
          if (texto && !contadaNestaPessoa.has(nome)) {
            contadaNestaPessoa.add(nome);
            atual.n++;
            if (!valorEhSensivel(nome) && atual.vals.size < 6) atual.vals.add(texto.slice(0, 40));
          }
          vistos.set(nome, atual);
        };

        // Um laço só por pessoa, cobrindo listagem e detalhe juntos. Em dois
        // laços separados o `contadaNestaPessoa` zeraria entre eles e o campo
        // que aparece nos dois voltaria a contar duas vezes.
        for (const p of amostra) {
          contadaNestaPessoa.clear();
          for (const [k, v] of Object.entries(p)) anotar(k, 'listagem', legivel(v));

          const env = await client.get<Record<string, unknown>>(EMPLOYEE_DETAIL(String(p.id)));
          const det = (env?.data ?? env) as Record<string, unknown>;
          for (const [k, v] of Object.entries(det)) {
            if (k === 'custom_fields') continue;
            anotar(k, 'detalhe', legivel(v));
          }
          for (const c of lerCustomFields(det.custom_fields)) {
            anotar(c.nome, 'personalizado', c.valor || null);
          }
        }

        const campos: CampoVisto[] = [...vistos]
          .map(([nome, d]) => ({ nome, origem: d.origem, preenchidos: d.n, valores: [...d.vals] }))
          .sort((a, b) => a.nome.localeCompare(b.nome));
        linha.campos = campos;
        linha.mapa = casarCampos(campos, salvas);
        linha.sobraram = sobraram(campos, linha.mapa);
      } catch (e) {
        linha.erro = e instanceof Error ? e.message : String(e);
      }
      saida.push(linha);
    }
    return saida;
  });

/**
 * Grava (ou apaga) a escolha de campo para uma coluna.
 *
 * `campo` vazio apaga a linha: desfazer uma escolha errada tem de ser tão fácil
 * quanto fazê-la, senão o mapa acumula erro que ninguém tem coragem de mexer.
 *
 * Guarda quem escolheu. O mapa decide o conteúdo de um arquivo que leva nome,
 * salário e data de nascimento de 641 pessoas para fora daqui -- quem pode
 * reescrevê-lo pode redirecionar o que sai, e isso tem dono.
 */
export const salvarEscolhaTalent = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    coluna: z.string().min(1).max(120),
    campo: z.string().max(200),
    origem: z.enum(['listagem', 'detalhe', 'personalizado']),
  }).parse(d))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const email = context.claims.email as string | undefined;
    await authorizeAdmin(email);

    const { COLUNAS_TALENT, JA_TEMOS } = await import('@/lib/talent-mobility');
    // A coluna tem de ser uma das 51, e não pode ser das que já saem do que
    // temos: mapear `Company` para um campo qualquer trocaria em silêncio uma
    // coluna que hoje está certa.
    if (!(COLUNAS_TALENT as readonly string[]).includes(data.coluna)) {
      throw new Error(`Coluna desconhecida: ${data.coluna}`);
    }
    if (JA_TEMOS[data.coluna as (typeof COLUNAS_TALENT)[number]]) {
      throw new Error(`${data.coluna} já sai do que temos e não se mapeia aqui.`);
    }

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const db = supabaseAdmin as unknown as {
      from: (t: string) => {
        upsert: (v: unknown) => PromiseLike<{ error: { message: string } | null }>;
        delete: () => { eq: (c: string, v: string) => PromiseLike<{ error: { message: string } | null }> };
      };
    };

    const { error } = data.campo
      ? await db.from('talent_mobility_mapa').upsert({
        coluna: data.coluna, campo: data.campo, origem: data.origem,
        definido_por: email ?? 'desconhecido', definido_em: new Date().toISOString(),
      })
      : await db.from('talent_mobility_mapa').delete().eq('coluna', data.coluna);

    if (error) throw new Error(error.message);
    return { ok: true };
  });
