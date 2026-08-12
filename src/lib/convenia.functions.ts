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

export interface AmostraDesligados {
  /**
   * Apenas os NOMES dos campos que voltaram, nunca os valores.
   *
   * A listagem de desligados traz e-mail profissional, que identifica pessoa.
   * O que precisamos saber aqui é só a FORMA da resposta -- quais chaves
   * existem --, e a forma não exige ver conteúdo nenhum.
   */
  camposVistos: string[];
  /** null = não deu para checar. */
  temTipoDesligamento: boolean | null;
  quantidade: number;
  erro: string | null;
}

export interface ConveniaDiagnostico {
  configurado: boolean;
  nomeDoToken: string | null;
  permissoes: PermissaoConvenia[];
  /** O que o painel precisa e o token NÃO entrega. Vazio é a resposta boa. */
  faltando: string[];
  /** Escrita e dados pessoais que o token carrega mas o painel não usa. */
  excessos: string[];
  amostra: AmostraDesligados | null;
  avisos: string[];
  erro: string | null;
}

/**
 * Caminhos de ESCRITA. O painel só lê -- se algum destes estiver no token, é
 * poder que existe sem ter para que servir.
 */
const ESCRITA = ['criar', 'criacao', 'atualizacao', 'delecao', 'upload', 'vincular'];

/** Campos pessoais que o painel nunca usa e que aumentam o estrago de um vazamento. */
const PESSOAIS = ['cpf', 'registro geral', 'dados bancarios', 'endereco', 'dependente', 'documentos', 'cid'];

/**
 * Devolve caminhos de chave (`dismissal.type`), nunca valores.
 *
 * Dois níveis bastam: campos compostos do Convenia -- "Informações do
 * desligamento" -- são um objeto com as partes dentro, e é exatamente aí que a
 * resposta desta pergunta mora.
 */
function chavesDe(obj: unknown, prefixo = '', nivel = 0): string[] {
  if (nivel > 2 || obj == null || typeof obj !== 'object' || Array.isArray(obj)) return [];
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const caminho = prefixo ? `${prefixo}.${k}` : k;
    out.push(caminho);
    if (v && typeof v === 'object' && !Array.isArray(v)) out.push(...chavesDe(v, caminho, nivel + 1));
  }
  return out;
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
      excessos: [],
      amostra: null,
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

      // ------------------------------------------------------------------
      // O QUE SOBRA NO TOKEN
      // ------------------------------------------------------------------
      // A lista fechada em paths.ts limita o que ESTE código chama. Ela não
      // limita o token: quem tiver o valor pode chamar qualquer coisa que o
      // token permita, inclusive escrever. Vale enxergar esse excedente.
      const escrita = permissoes.filter((p) =>
        ESCRITA.some((v) => semAcento(p.recurso).startsWith(v)),
      ).length;
      const comPessoais = permissoes.filter((p) =>
        PESSOAIS.some((f) => semAcento(p.campos.join(' ')).includes(semAcento(f))),
      ).length;

      const excessos: string[] = [];
      if (escrita > 0) {
        excessos.push(`${escrita} permissões de escrita (criar admissão, criar desligamento, alterar e apagar cadastro). O painel só lê — isso é poder sem finalidade.`);
      }
      if (comPessoais > 0) {
        excessos.push(`${comPessoais} recursos expõem dado pessoal que o painel não usa: CPF, RG, endereço, dados bancários, dependentes, CID de afastamento.`);
      }

      // ------------------------------------------------------------------
      // A SONDA
      // ------------------------------------------------------------------
      // "Informações do desligamento" é um campo COMPOSTO. Pelo nome não dá
      // para saber se o tipo de desligamento está dentro dele. Já errei duas
      // vezes nesta integração por concluir a partir de nome e de schema em
      // vez de resposta real -- então aqui eu pergunto à API.
      //
      // Uma página, um registro, e só os NOMES das chaves voltam.
      let amostra: AmostraDesligados | null = null;
      try {
        const { EMPLOYEES_DISMISSED } = await import('@/lib/convenia/paths');
        const { extrairPagina } = await import('@/lib/convenia/paths');
        const bruto = await client.get<unknown>(EMPLOYEES_DISMISSED, { per_page: 1, page: 1 });
        const { itens } = extrairPagina<Record<string, unknown>>(bruto);
        const campos = itens.length ? chavesDe(itens[0]) : [];
        const achou = campos.some((c) =>
          ['type', 'tipo', 'reason', 'motivo', 'dismissal_type'].some((f) => semAcento(c).includes(f)),
        );
        amostra = {
          camposVistos: campos,
          temTipoDesligamento: itens.length ? achou : null,
          quantidade: itens.length,
          erro: null,
        };
      } catch (e) {
        amostra = {
          camposVistos: [],
          temTipoDesligamento: null,
          quantidade: 0,
          erro: e instanceof Error ? e.message : String(e),
        };
      }

      const avisos: string[] = [];
      if (!permissoes.length) {
        avisos.push('O token respondeu, mas sem nenhuma permissão listada. Isso costuma significar que ele foi criado sem marcar nada.');
      }
      if (amostra?.temTipoDesligamento === true) {
        avisos.push('O tipo de desligamento VEM na resposta real, dentro do campo composto — o alerta acima era falso alarme meu. Dá para separar saída voluntária de involuntária.');
      } else if (amostra?.temTipoDesligamento === false) {
        avisos.push('A resposta real confirma: não vem tipo de desligamento. Sem ele, o painel mostra saídas totais, mas não separa voluntária de involuntária — e essa separação é a que sustenta a leitura de retenção.');
      }

      return {
        configurado: true,
        nomeDoToken: corpo?.data?.name ?? null,
        permissoes,
        faltando,
        excessos,
        amostra,
        avisos,
        erro: null,
      };
    } catch (e) {
      return { ...vazio, configurado: true, erro: e instanceof Error ? e.message : String(e) };
    }
  });
