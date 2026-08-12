import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

/**
 * Diagnóstico da integração com o Convenia.
 *
 * ------------------------------------------------------------------
 * UMA EMPRESA POR TOKEN
 * ------------------------------------------------------------------
 * O Convenia é por CNPJ. A Flutter BR está espalhada em cinco empresas -- NSX
 * Recife, NSX Marechal, NSX São Paulo, Betfair e Flutter International -- e
 * cada uma tem seu token, que só enxerga a si mesma.
 *
 * A primeira sonda voltou com 397 colaboradores e eu quase tratei isso como o
 * headcount da companhia. Era só Recife. Se a carga tivesse rodado assim, o
 * painel mostraria um headcount menor que o real com aparência perfeitamente
 * normal: nenhum erro, nenhuma coluna vazia, só um número errado que ninguém
 * teria motivo para questionar.
 *
 * ------------------------------------------------------------------
 * POR QUE DIAGNOSTICAR ANTES DE SINCRONIZAR
 * ------------------------------------------------------------------
 * O token expõe só os campos marcados na criação, e cada empresa pode ter sido
 * configurada de um jeito. Um token sem data de admissão não dá erro -- produz
 * uma série de headcount plausível e errada, que é o pior modo de falha que
 * este painel pode ter.
 *
 * Três vezes nesta integração eu concluí que algo não existia por ter olhado a
 * fonte errada: o `statusHistory` do InHire, o `pg_cron` do Supabase, e o tipo
 * de desligamento do Convenia. Nas três, a resposta real me contradisse.
 * Por isso aqui o veredito sai da RESPOSTA, e o nome da permissão é só indício.
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

export interface Sonda {
  recurso: string;
  /** Apenas NOMES de campo. Nenhum valor sai daqui. */
  camposVistos: string[];
  /** Total do recurso inteiro, não da página. */
  total: number | null;
  quantidade: number;
  erro: string | null;
}

export interface DiagnosticoEmpresa {
  empresa: string;
  marca: string;
  local: string | null;
  env: string;
  nomeDoToken: string | null;
  qtdPermissoes: number;
  permissoesEscrita: number;
  sondas: Sonda[];
  temTipoDesligamento: boolean | null;
  faltando: string[];
  erro: string | null;
}

export interface ConveniaDiagnostico {
  empresas: DiagnosticoEmpresa[];
  /** Secrets ainda por cadastrar, com o nome exato a usar no Lovable. */
  faltamSecrets: { env: string; empresa: string }[];
  /** Soma dos ativos das empresas configuradas. */
  totalGeral: number | null;
  veredito: string | null;
  avisos: string[];
  erro: string | null;
}

const semAcento = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Caminhos de chave (`dismissal.type`), nunca valores. */
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

const ESCRITA = ['criar', 'criacao', 'atualizacao', 'delecao', 'upload', 'vincular'];

export const getConveniaDiagnostico = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ConveniaDiagnostico> => {
    await authorizeAdmin(context.claims.email as string | undefined);

    const { fontesConfiguradas, fontesFaltando } = await import('@/lib/convenia/fontes');
    const configuradas = fontesConfiguradas();
    const faltamSecrets = fontesFaltando().map((f) => ({ env: f.env, empresa: f.empresa }));

    if (!configuradas.length) {
      return {
        empresas: [], faltamSecrets, totalGeral: null, veredito: null, avisos: [],
        erro: 'Nenhum token do Convenia cadastrado ainda.',
      };
    }

    const { ConveniaClient } = await import('@/lib/convenia/client.server');
    const { TOKEN_PERMISSIONS, EMPLOYEES, EMPLOYEES_DISMISSED, extrairPagina } =
      await import('@/lib/convenia/paths');

    const empresas: DiagnosticoEmpresa[] = [];

    // Em SEQUÊNCIA, uma empresa por vez. Os limites são por conta, então em
    // tese daria para paralelizar -- mas cinco frentes simultâneas contra o
    // mesmo fornecedor é o tipo de coisa que aparece no gráfico deles como
    // pico e vira conversa desagradável. Diagnóstico não tem pressa.
    for (const f of configuradas) {
      const base: DiagnosticoEmpresa = {
        empresa: f.empresa, marca: f.marca, local: f.local, env: f.env,
        nomeDoToken: null, qtdPermissoes: 0, permissoesEscrita: 0,
        sondas: [], temTipoDesligamento: null, faltando: [], erro: null,
      };

      try {
        const client = ConveniaClient.paraToken(f.token!);

        const corpo = await client.get<{
          data?: { name?: string; permissions?: { translated_name?: string; name?: string }[] };
        }>(TOKEN_PERMISSIONS);
        const perms = corpo?.data?.permissions ?? [];
        base.nomeDoToken = corpo?.data?.name ?? null;
        base.qtdPermissoes = perms.length;
        base.permissoesEscrita = perms.filter((p) =>
          ESCRITA.some((v) => semAcento(p.translated_name || p.name || '').startsWith(v)),
        ).length;

        const sondar = async (recurso: string, path: string): Promise<Sonda> => {
          try {
            const bruto = await client.get<unknown>(path, { per_page: 1, page: 1 });
            const p = extrairPagina<Record<string, unknown>>(bruto);
            return {
              recurso,
              camposVistos: p.itens.length ? chavesDe(p.itens[0]) : [],
              total: p.total ?? null,
              quantidade: p.itens.length,
              erro: null,
            };
          } catch (e) {
            return { recurso, camposVistos: [], total: null, quantidade: 0, erro: e instanceof Error ? e.message : String(e) };
          }
        };

        const ativos = await sondar('Colaboradores', EMPLOYEES);
        const deslig = await sondar('Desligados', EMPLOYEES_DISMISSED);
        base.sondas = [ativos, deslig];

        const tem = (s: Sonda, frags: string[]) =>
          s.camposVistos.some((c) => frags.some((x) => semAcento(c).includes(x)));

        base.temTipoDesligamento = deslig.quantidade
          ? tem(deslig, ['type', 'tipo', 'motivo', 'reason'])
          : null;

        if (ativos.quantidade) {
          if (!tem(ativos, ['admiss', 'hired', 'hire_date'])) base.faltando.push('Data de admissão (ativos)');
          if (!tem(ativos, ['department', 'departamento'])) base.faltando.push('Departamento (ativos)');
        }
        if (deslig.quantidade) {
          if (!tem(deslig, ['admiss', 'hired'])) base.faltando.push('Data de admissão (desligados)');
          if (!tem(deslig, ['department', 'departamento'])) base.faltando.push('Departamento (desligados)');
        }
      } catch (e) {
        base.erro = e instanceof Error ? e.message : String(e);
      }

      empresas.push(base);
    }

    const totais = empresas
      .map((e) => e.sondas.find((s) => s.recurso === 'Colaboradores')?.total)
      .filter((t): t is number => typeof t === 'number');
    const totalGeral = totais.length ? totais.reduce((a, b) => a + b, 0) : null;

    const avisos: string[] = [];
    if (faltamSecrets.length) {
      avisos.push(`${faltamSecrets.length} empresas ainda sem token — o headcount somado abaixo está incompleto até elas entrarem.`);
    }
    const comEscrita = empresas.filter((e) => e.permissoesEscrita > 0);
    if (comEscrita.length) {
      avisos.push(`${comEscrita.length} tokens têm permissão de escrita (criar admissão, criar desligamento, apagar cadastro). O painel só lê.`);
    }

    // O veredito vale para todas: se uma empresa não traz admissão, é provável
    // que nenhuma traga, porque a limitação é do endpoint e não do token.
    const semAdmissao = empresas.filter((e) => e.faltando.some((x) => x.startsWith('Data de admissão (ativos)')));
    let veredito: string | null = null;
    if (semAdmissao.length === empresas.length && empresas.length > 0) {
      veredito = 'Nenhuma empresa traz data de admissão na listagem — é limitação do endpoint de listagem, não do token. O próximo passo é testar se algum parâmetro traz os campos completos, antes de considerar buscar pessoa por pessoa.';
    } else if (semAdmissao.length) {
      veredito = `${semAdmissao.length} de ${empresas.length} empresas não trazem data de admissão. Como varia entre elas, é configuração de token — dá para corrigir no Convenia.`;
    } else if (empresas.length) {
      veredito = 'Todas as empresas trazem admissão e departamento na listagem. Dá para reconstruir a série mensal por área e por marca.';
    }

    return { empresas, faltamSecrets, totalGeral, veredito, avisos, erro: null };
  });
