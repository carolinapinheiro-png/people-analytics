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

/**
 * Porta de admin. Delega a `exigirAdmin`, que alem de conferir o perfil
 * recusa enquanto a sessao esta vendo o painel como outra pessoa -- uma
 * previa em que os botoes de admin ainda funcionam nao confere nada.
 */
async function authorizeAdmin(userEmail: string | undefined) {
  const { exigirAdmin } = await import('@/lib/escopo.server');
  return exigirAdmin(userEmail, 'inspecionar a integração');
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
  /**
   * Nome tecnico e traduzido de cada permissao do token.
   *
   * Vinha na resposta e era descartado -- so a contagem sobrevivia. Isso
   * custou caro: para ligar o historico salarial eu precisava saber se o
   * recurso esta liberado e como ele se chama, e a resposta estava aqui o
   * tempo todo, dentro de uma chamada que o painel ja fazia.
   *
   * Identificador do recurso nao e dado pessoal. Esconde-lo nao protegeu
   * ninguem; so obrigou a perguntar de novo o que ja tinha sido respondido.
   */
  permissoes: { nome: string; traduzido: string }[];
  sondas: Sonda[];
  temTipoDesligamento: boolean | null;
  /**
   * Distribuição do campo `status` nos ativos. É a única leitura de VALOR
   * deste diagnóstico, e é categórica -- "Ativo", "Desligado" -- então não
   * identifica ninguém. Existe para responder uma pergunta que nenhum nome de
   * campo responde: a listagem de "colaboradores" já inclui quem saiu?
   */
  statusDosAtivos: { valor: string; quantidade: number }[];
  faltando: string[];
  erro: string | null;
}

export interface ConveniaDiagnostico {
  empresas: DiagnosticoEmpresa[];
  /** Secrets ainda por cadastrar, com o nome exato a usar no Lovable. */
  faltamSecrets: { env: string; empresa: string }[];
  /** Fontes desligadas de propósito, com o motivo. Não são pendência. */
  aposentadas: { empresa: string; motivo: string }[];
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

    const { fontesConfiguradas, fontesFaltando, fontesAposentadas } = await import('@/lib/convenia/fontes');
    const configuradas = fontesConfiguradas();
    const faltamSecrets = fontesFaltando().map((f) => ({ env: f.env, empresa: f.empresa }));
    const aposentadas = fontesAposentadas()
      .map((f) => ({ empresa: f.empresa, motivo: f.aposentada! }));

    if (!configuradas.length) {
      return {
        empresas: [], faltamSecrets, aposentadas, totalGeral: null, veredito: null, avisos: [],
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
        nomeDoToken: null, qtdPermissoes: 0, permissoesEscrita: 0, permissoes: [],
        sondas: [], temTipoDesligamento: null, statusDosAtivos: [], faltando: [], erro: null,
      };

      try {
        const client = ConveniaClient.paraToken(f.token!);

        const corpo = await client.get<{
          data?: { name?: string; permissions?: { translated_name?: string; name?: string }[] };
        }>(TOKEN_PERMISSIONS);
        const perms = corpo?.data?.permissions ?? [];
        base.nomeDoToken = corpo?.data?.name ?? null;
        base.qtdPermissoes = perms.length;
        base.permissoes = perms
          .map((p) => ({ nome: p.name ?? '', traduzido: p.translated_name ?? '' }))
          .filter((p) => p.nome || p.traduzido)
          .sort((a, b) => a.nome.localeCompare(b.nome));
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

        // A pergunta que decide o desenho da carga: os 638 "colaboradores"
        // incluem os 165 desligados, ou são só os ativos? Se incluírem, a
        // reconstrução sai de uma fonte só, com admissão e departamento --
        // que é justamente o que falta na listagem de desligados.
        //
        // Uma página de 100, só o campo `status` é lido, nada é guardado.
        try {
          const pg = await client.get<unknown>(EMPLOYEES, { per_page: 100, page: 1 });
          const { itens } = extrairPagina<Record<string, unknown>>(pg);
          const conta = new Map<string, number>();
          for (const it of itens) {
            const v = it.status;
            const chave = v == null ? '(vazio)' : String(v);
            conta.set(chave, (conta.get(chave) ?? 0) + 1);
          }
          base.statusDosAtivos = [...conta.entries()]
            .map(([valor, quantidade]) => ({ valor, quantidade }))
            .sort((a, b) => b.quantidade - a.quantidade);
        } catch {
          // Sem tally não dá para responder, mas não invalida o resto.
        }

        if (ativos.quantidade) {
          // `hiring_date` -- descoberto na resposta real depois de eu reportar
          // três vezes que "faltava data de admissão". Minha lista tinha
          // `hired` e `hire_date`, e nenhum dos dois casa com `hiring`.
          // Fragmentos curtos erram para o lado seguro: preferem falso
          // positivo a mandar alguém mexer num token que estava certo.
          if (!tem(ativos, ['admis', 'hir', 'contrat'])) base.faltando.push('Data de admissão (ativos)');
          if (!tem(ativos, ['department', 'departamento'])) base.faltando.push('Departamento (ativos)');
        }
        if (deslig.quantidade) {
          if (!tem(deslig, ['admis', 'hir'])) base.faltando.push('Data de admissão (desligados)');
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

    return { empresas, faltamSecrets, aposentadas, totalGeral, veredito, avisos, erro: null };
  });

// ===========================================================================
// A CARGA
// ===========================================================================
// Prévia antes de gravar, sempre -- mesmo desenho do InHire e do importador da
// pesquisa, e pela mesma razão: os erros desta integração são silenciosos. Uma
// área renomeada no Convenia não dá erro, só reparte a linha em duas. A prévia
// é o único momento em que isso fica visível antes de virar número na tela.
// ===========================================================================

import { z } from 'zod';
import type { ResumoSyncConvenia } from '@/lib/convenia/sync.server';

export type { ResumoSyncConvenia };

const SyncInput = z.object({ confirm: z.boolean().default(false) }).optional();

export const syncConvenia = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => SyncInput.parse(input))
  .handler(async ({ context, data }): Promise<ResumoSyncConvenia> => {
    const email = await authorizeAdmin(context.claims.email as string | undefined);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { executarSyncConvenia } = await import('@/lib/convenia/sync.server');
    return executarSyncConvenia(supabaseAdmin as never, {
      confirm: data?.confirm ?? false,
      origem: email,
    });
  });

/**
 * Qual das candidatas do histórico salarial responde.
 *
 * ===========================================================================
 * DESCOBRIR, EM VEZ DE ADIVINHAR
 * ===========================================================================
 * A permissão `employees.get.salariesHistoric` está no token, mas a grafia da
 * rota não. Cinco candidatas, uma pessoa, uma requisição cada: o que responde
 * 200 é o caminho, e o que responde 404 é resposta também.
 *
 * Uma pessoa só, e a primeira da listagem. Não é economia de requisição -- é
 * que descobrir a forma da porta não exige entrar na casa inteira.
 *
 * Depois de confirmada, a candidata vira caminho fixo e a lista sai. Isto é
 * andaime, não estrutura.
 */
export interface TesteHistorico {
  caminho: string;
  status: number | null;
  /** Chaves do primeiro registro, quando respondeu. Nomes, não valores. */
  campos: string[];
  erro: string | null;
}

export const descobrirHistoricoSalarial = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TesteHistorico[]> => {
    const { exigirAdmin } = await import('@/lib/escopo.server');
    await exigirAdmin(context.claims.email as string | undefined, 'descobrir o endpoint do historico');

    const { fontesConfiguradas } = await import('@/lib/convenia/fontes');
    const { ConveniaClient } = await import('@/lib/convenia/client.server');
    const { EMPLOYEES, CANDIDATOS_HISTORICO_SALARIAL, SALARIO_HISTORICO }
      = await import('@/lib/convenia/paths');

    const f = fontesConfiguradas()[0];
    if (!f?.token) return [];
    const client = ConveniaClient.paraToken(f.token);

    const pagina = await client.listarTudo<Record<string, unknown>>(EMPLOYEES, {
      porPagina: 1, maxPaginas: 1,
    });
    const id = String(pagina[0]?.id ?? '');
    if (!id) return [];

    const saida: TesteHistorico[] = [];
    for (const sub of CANDIDATOS_HISTORICO_SALARIAL) {
      const caminho = SALARIO_HISTORICO(id, sub);
      try {
        const corpo = await client.get<Record<string, unknown>>(caminho);
        const dados = (corpo?.data ?? corpo) as unknown;
        const primeiro = Array.isArray(dados) ? dados[0] : dados;
        saida.push({
          caminho,
          status: 200,
          // Só os NOMES dos campos. O histórico traz salário de gente com nome
          // ao lado, e um diagnóstico não precisa disso para dizer que achou.
          campos: primeiro && typeof primeiro === 'object'
            ? Object.keys(primeiro as Record<string, unknown>).sort() : [],
          erro: null,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        saida.push({
          caminho,
          status: /404/.test(msg) ? 404 : null,
          campos: [],
          erro: msg.slice(0, 160),
        });
      }
    }
    return saida;
  });
