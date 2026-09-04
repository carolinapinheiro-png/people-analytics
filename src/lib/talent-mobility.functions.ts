import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { CampoVisto, Casamento } from '@/lib/talent-mobility';

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
        empresa: f.empresa, amostra: 0, mapa: [], sobraram: [], erro: null,
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
        const anotar = (nome: string, origem: CampoVisto['origem'], texto: string | null) => {
          const atual = vistos.get(nome) ?? { origem, n: 0, vals: new Set<string>() };
          if (texto) {
            atual.n++;
            if (!valorEhSensivel(nome) && atual.vals.size < 6) atual.vals.add(texto.slice(0, 40));
          }
          vistos.set(nome, atual);
        };

        for (const p of amostra) {
          for (const [k, v] of Object.entries(p)) anotar(k, 'listagem', legivel(v));
        }

        for (const p of amostra) {
          const env = await client.get<Record<string, unknown>>(EMPLOYEE_DETAIL(String(p.id)));
          const det = (env?.data ?? env) as Record<string, unknown>;
          for (const [k, v] of Object.entries(det)) {
            if (k === 'custom_fields') continue;
            anotar(k, 'detalhe', legivel(v));
          }
          // Um campo pode vir repetido no mesmo cadastro. Contando ocorrências,
          // a sonda de escritório imprimiu "Level 10/8" -- numerador maior que
          // denominador, que além de errado faz duvidar do resto do quadro.
          const nestaPessoa = new Set<string>();
          for (const c of lerCustomFields(det.custom_fields)) {
            if (nestaPessoa.has(c.nome)) continue;
            nestaPessoa.add(c.nome);
            anotar(c.nome, 'personalizado', c.valor || null);
          }
        }

        const campos: CampoVisto[] = [...vistos]
          .map(([nome, d]) => ({ nome, origem: d.origem, preenchidos: d.n, valores: [...d.vals] }))
          .sort((a, b) => a.nome.localeCompare(b.nome));
        linha.mapa = casarCampos(campos);
        linha.sobraram = sobraram(campos, linha.mapa);
      } catch (e) {
        linha.erro = e instanceof Error ? e.message : String(e);
      }
      saida.push(linha);
    }
    return saida;
  });
