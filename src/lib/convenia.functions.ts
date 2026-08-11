import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

/**
 * Diagnóstico do token do Convenia.
 *
 * ------------------------------------------------------------------
 * POR QUE ISTO VEM ANTES DE QUALQUER SINCRONIZAÇÃO
 * ------------------------------------------------------------------
 * O token do Convenia expõe apenas os campos marcados na hora em que foi
 * criado. Um token feito para outra finalidade -- Power BI, por exemplo --
 * pode não trazer data de admissão, ou não trazer departamento.
 *
 * Se eu escrevesse o agregador supondo os campos e só descobrisse na primeira
 * carga, o sintoma não seria um erro: seria uma coluna silenciosamente vazia,
 * ou uma série de headcount plausível e errada. É o pior modo de falha que
 * este painel pode ter.
 *
 * Duas vezes nesta integração eu já concluí que algo não existia por ter
 * consultado a fonte errada -- o `statusHistory` do InHire e o `pg_cron` do
 * Supabase. Nas duas, a resposta real contradisse o que eu tinha lido.
 * Perguntar à API o que ela permite, antes de supor, é o remédio.
 */

async function authorizeAdmin(userEmail: string | undefined) {
  if (!userEmail) throw new Error('Unauthorized');
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data, error } = await supabaseAdmin
    .from('allowed_emails')
    .select('role')
    .ilike('email', userEmail)
    .maybeSingle();
  if (error) throw new Error(`Access check failed: ${error.message}`);
  if (!data) throw new Error('Forbidden');
  if ((data as { role?: string }).role !== 'admin') {
    throw new Error('Forbidden: apenas admin pode inspecionar a integração');
  }
  return userEmail;
}

export interface PermissaoConvenia {
  recurso: string;
  campos: string[];
}

export interface ConveniaDiagnostico {
  configurado: boolean;
  nomeDoToken: string | null;
  permissoes: PermissaoConvenia[];
  /** O que o painel precisa e o token NÃO entrega. Vazio é a resposta boa. */
  faltando: string[];
  avisos: string[];
  erro: string | null;
}

/**
 * O que o painel precisa para reconstruir a série mensal.
 *
 * Os nomes são fragmentos procurados sem acento e sem caixa, porque o rótulo
 * exato do Convenia varia ("Data de admissão", "Admissão", "admission_date") e
 * casar string exata daria falso negativo -- que aqui é pior que falso
 * positivo: mandaria você mexer num token que já estava certo.
 */
const NECESSARIOS: { rotulo: string; procurar: string[] }[] = [
  { rotulo: 'Data de admissão', procurar: ['admiss', 'hired', 'hire_date'] },
  { rotulo: 'Departamento', procurar: ['department', 'departamento'] },
  { rotulo: 'Data de desligamento', procurar: ['dismiss', 'desligamento', 'termination'] },
  { rotulo: 'Tipo de desligamento', procurar: ['dismissal_type', 'tipo de desligamento', 'dismissal-type'] },
];

const semAcento = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const getConveniaDiagnostico = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ConveniaDiagnostico> => {
    await authorizeAdmin(context.claims.email as string | undefined);

    const vazio: ConveniaDiagnostico = {
      configurado: false,
      nomeDoToken: null,
      permissoes: [],
      faltando: [],
      avisos: [],
      erro: null,
    };

    if (!process.env.CONVENIA_API_TOKEN) {
      return { ...vazio, erro: 'Falta o secret CONVENIA_API_TOKEN.' };
    }

    try {
      const { ConveniaClient } = await import('@/lib/convenia/client.server');
      const { TOKEN_PERMISSIONS } = await import('@/lib/convenia/paths');
      const client = ConveniaClient.create();

      const corpo = await client.get<{
        data?: { name?: string; permissions?: { translated_name?: string; name?: string; fields?: { translated_name?: string; name?: string }[] }[] };
      }>(TOKEN_PERMISSIONS);

      const perms = corpo?.data?.permissions ?? [];
      const permissoes: PermissaoConvenia[] = perms.map((p) => ({
        recurso: p.translated_name || p.name || '(sem nome)',
        campos: (p.fields ?? []).map((f) => f.translated_name || f.name || '').filter(Boolean),
      }));

      // Procura em recurso E campo: alguns endpoints entregam a data sem
      // listá-la como campo separado.
      const tudo = semAcento(
        permissoes.map((p) => `${p.recurso} ${p.campos.join(' ')}`).join(' '),
      );
      const faltando = NECESSARIOS
        .filter((n) => !n.procurar.some((frag) => tudo.includes(semAcento(frag))))
        .map((n) => n.rotulo);

      const avisos: string[] = [];
      if (!permissoes.length) {
        avisos.push('O token respondeu, mas sem nenhuma permissão listada. Isso costuma significar que ele foi criado sem marcar nada.');
      }
      if (faltando.length) {
        avisos.push('Dá para sincronizar mesmo assim, mas o que estiver faltando vira coluna vazia — não um erro visível. Vale corrigir o token antes.');
      }

      return {
        configurado: true,
        nomeDoToken: corpo?.data?.name ?? null,
        permissoes,
        faltando,
        avisos,
        erro: null,
      };
    } catch (e) {
      return { ...vazio, configurado: true, erro: e instanceof Error ? e.message : String(e) };
    }
  });
