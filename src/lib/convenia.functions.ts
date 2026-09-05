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
        nomeDoToken: null, qtdPermissoes: 0, permissoesEscrita: 0,
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
 * De que campo do cadastro sai a marca, depois da unificação de bases.
 *
 * ===========================================================================
 * POR QUE UMA SONDA E NÃO UMA LISTA DE NOMES PROVÁVEIS
 * ===========================================================================
 * Hoje a marca vem do TOKEN: cinco tokens, três marcas, escrito à mão em
 * `fontes.ts`. Com a base unificada isso deixa de funcionar -- um token só
 * devolve todo mundo, e a marca passa a ser um campo do cadastro de cada
 * pessoa. Falta saber QUAL campo.
 *
 * A tentação é escrever a lista de nomes prováveis e ler o primeiro que
 * responder. Foi exatamente o que `cargoDe` fez, com sete nomes -- e o
 * resultado foi 0 de 638, porque o cargo não estava em nenhum deles: estava no
 * detalhe individual, num endereço que a função nunca consultou. E o painel
 * passou a AFIRMAR, em amarelo, que o Convenia não tinha cargo.
 *
 * Chutar de novo aqui custaria mais caro: cargo errado deixa um campo em
 * branco, marca errada reescreve a série inteira.
 *
 * Então esta função não decide nada. Ela olha e reporta.
 *
 * ===========================================================================
 * O QUE ELA DEVOLVE, E O QUE ELA SE RECUSA A DEVOLVER
 * ===========================================================================
 * O cadastro do Convenia tem CPF, RG, endereço, conta bancária, dependentes --
 * 123 campos. Despejar tudo na tela para "ver o que tem" transformaria uma
 * investigação de dez minutos num vazamento.
 *
 * O filtro é pela CHAVE, não pelo valor: só passam campos cujo nome fala de
 * empresa, marca, centro de custo, escritório, unidade, filial ou local. Os
 * valores saem truncados. Um campo com nome inocente e conteúdo sensível não
 * atravessa, porque a lista de chaves permitidas é curta e explícita.
 *
 * Cada campo vem com quantas pessoas da amostra o têm preenchido e quais
 * valores distintos aparecem. É isso que separa "o campo existe" de "o campo
 * distingue as marcas" -- um campo presente em 100% com um valor único não
 * serve, e é a cara do "GERALL" que o RH avisou que ia aparecer.
 */
export interface CampoCandidato {
  campo: string;
  /** Onde ele apareceu: na listagem (barata) ou só no detalhe individual. */
  origem: 'listagem' | 'detalhe';
  preenchidos: number;
  /** Valores distintos encontrados, truncados. Máximo de 8. */
  valores: string[];
}
export interface SondaCampos {
  empresa: string;
  amostra: number;
  /** Total de chaves no cadastro, para dimensionar o que NÃO está sendo lido. */
  chavesNoDetalhe: number;
  /**
   * TODOS os nomes de campo do cadastro, sem valor nenhum.
   *
   * A primeira sonda filtrou por nome e achou só `cost_center` (que é centro
   * de custo, não marca) e `custom_fields` (vazio). Isso não significa que a
   * marca não esteja lá: significa que, se estiver, o campo tem outro nome --
   * e o filtro que me protegia de vazar CPF também escondia a resposta.
   *
   * Nome de campo não é dado pessoal. Listar os 47 nomes deixa escolher o
   * candidato certo olhando, e só então pedir o valor dele.
   */
  chaves: string[];
  /**
   * Os campos personalizados, por NOME, com quantos vieram preenchidos.
   *
   * O RH confirmou que o escritório vai morar em `custom_fields`. Ele está
   * vazio hoje, então esta lista é o instrumento que avisa quando deixar de
   * estar -- e mostra com que nome o campo foi criado, que é o que falta para
   * ligar `fontes.ts` nele.
   */
  personalizados: Array<{ nome: string; preenchidos: number; valores: string[] }>;
  /** Casou com algum nome de escritório? É isto que destrava a marca. */
  escritorioResolvido: number;
  candidatos: CampoCandidato[];
  erro: string | null;
}

/** Chaves cujo NOME fala de empresa/local. Nada fora daqui atravessa. */
const PADRAO_MARCA =
  /(company|empresa|brand|marca|cost|custo|centro|office|escritorio|escritório|unit|unidade|branch|filial|establishment|estabelecimento|location|local|site|workplace|subsidiar)/i;

export const sondarCamposDaPessoa = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SondaCampos[]> => {
    await authorizeAdmin(context.claims.email as string | undefined);

    const { fontesConfiguradas } = await import('@/lib/convenia/fontes');
    const { ConveniaClient } = await import('@/lib/convenia/client.server');
    const { EMPLOYEES, EMPLOYEE_DETAIL } = await import('@/lib/convenia/paths');

    /** Achata `{name: 'X'}` e corta o resto. Valor nunca sai inteiro. */
    const legivel = (v: unknown): string | null => {
      if (typeof v === 'string') return v.trim().slice(0, 40) || null;
      if (typeof v === 'number') return String(v);
      if (v && typeof v === 'object' && 'name' in v) {
        const n = (v as { name?: unknown }).name;
        return typeof n === 'string' ? n.trim().slice(0, 40) || null : null;
      }
      return null;
    };

    const saida: SondaCampos[] = [];

    for (const f of fontesConfiguradas()) {
      const linha: SondaCampos = {
        empresa: f.empresa, amostra: 0, chavesNoDetalhe: 0, chaves: [],
        personalizados: [], escritorioResolvido: 0, candidatos: [], erro: null,
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

        const acumular = (
          mapa: Map<string, { n: number; vals: Set<string> }>,
          obj: Record<string, unknown>,
        ) => {
          for (const [k, v] of Object.entries(obj)) {
            if (!PADRAO_MARCA.test(k)) continue;
            const texto = legivel(v);
            const atual = mapa.get(k) ?? { n: 0, vals: new Set<string>() };
            if (texto) { atual.n++; if (atual.vals.size < 8) atual.vals.add(texto); }
            mapa.set(k, atual);
          }
        };

        const naListagem = new Map<string, { n: number; vals: Set<string> }>();
        for (const p of amostra) acumular(naListagem, p);

        const { lerCustomFields, escritorioDe, valorEhSensivel } =
          await import('@/lib/convenia/custom-fields');
        const personalizados = new Map<string, { n: number; vals: Set<string> }>();

        const noDetalhe = new Map<string, { n: number; vals: Set<string> }>();
        for (const p of amostra) {
          const env = await client.get<Record<string, unknown>>(EMPLOYEE_DETAIL(String(p.id)));
          const det = (env?.data ?? env) as Record<string, unknown>;
          linha.chavesNoDetalhe = Math.max(linha.chavesNoDetalhe, Object.keys(det).length);
          // Só os NOMES. Nenhum valor atravessa por aqui.
          linha.chaves = [...new Set([...linha.chaves, ...Object.keys(det)])].sort();
          acumular(noDetalhe, det);

          // Os campos personalizados entram por fora do filtro de chaves: o
          // NOME deles é dado pelo RH, não pela API, então nenhum padrão meu
          // acertaria. O valor sai truncado igual ao resto.
          // Um campo pode vir repetido no mesmo cadastro. Contando ocorrências,
          // a tela imprimiu "Level 10/8" -- numerador maior que denominador, que
          // além de errado faz duvidar do resto do quadro.
          const vistosNestaPessoa = new Set<string>();
          for (const c2 of lerCustomFields(det.custom_fields)) {
            if (vistosNestaPessoa.has(c2.nome)) continue;
            vistosNestaPessoa.add(c2.nome);
            const atual = personalizados.get(c2.nome) ?? { n: 0, vals: new Set<string>() };
            atual.n++;
            // O NOME e a CONTAGEM sempre saem; o valor, não. Ver VALOR_SENSIVEL:
            // a primeira execução desta sonda imprimiu CNPJ e endereço de
            // prestador numa tela de admin, debaixo de uma frase minha dizendo
            // que isso não acontecia.
            if (!valorEhSensivel(c2.nome) && atual.vals.size < 8) {
              atual.vals.add(c2.valor.slice(0, 40));
            }
            personalizados.set(c2.nome, atual);
          }
          if (escritorioDe(det)) linha.escritorioResolvido++;
        }
        linha.personalizados = [...personalizados].map(([nome, d]) => ({
          nome, preenchidos: d.n, valores: [...d.vals],
        })).sort((x, y) => y.preenchidos - x.preenchidos);

        for (const [campo, d] of naListagem) {
          linha.candidatos.push({
            campo, origem: 'listagem', preenchidos: d.n, valores: [...d.vals],
          });
        }
        // Só entra como 'detalhe' o que NÃO estava na listagem: a listagem é
        // uma requisição para todo mundo, o detalhe é uma por pessoa. A
        // diferença entre as duas é de 638 chamadas por carga.
        for (const [campo, d] of noDetalhe) {
          if (naListagem.has(campo)) continue;
          linha.candidatos.push({
            campo, origem: 'detalhe', preenchidos: d.n, valores: [...d.vals],
          });
        }
        linha.candidatos.sort((a, b) => b.preenchidos - a.preenchidos || a.campo.localeCompare(b.campo));
      } catch (e) {
        linha.erro = e instanceof Error ? e.message : String(e);
      }
      saida.push(linha);
    }

    return saida;
  });
