/**
 * Os campos personalizados do Convenia.
 *
 * ===========================================================================
 * POR QUE ISTO EXISTE ANTES DE HAVER DADO
 * ===========================================================================
 * A unificação de bases tirou a marca do lugar onde ela estava. Até 31/08 a
 * marca vinha do TOKEN -- cinco tokens, três marcas, escrito à mão em
 * `fontes.ts`. Em 01/09 três dessas cinco bases voltaram vazias: todo mundo
 * passou para a base única, e o escritório passa a ser um campo do cadastro.
 *
 * O campo é `custom_fields`, confirmado pelo RH -- e a sonda mostrou que ele
 * JÁ TEM CONTEÚDO: 5 das 8 pessoas da amostra de Recife, 1 de 1 em São Paulo.
 * A leitura anterior dizia 0 de 8 porque o caminho que media era o filtro por
 * nome de chave, que devolve null para uma lista. O campo estava cheio e eu
 * estava olhando pelo buraco errado.
 *
 * São DOIS campos, e eles não são a mesma coisa:
 *
 *   Empresa ...... "NSX Brasil Recife", "NSX Brasil São Paulo"  -> marca
 *   Escritório ... "Recife - Boa Viagem", "Remoto", "São Paulo" -> localidade
 *
 * Misturar os dois numa lista só faria a busca devolver o que viesse primeiro
 * na resposta, que não é contrato nenhum.
 *
 * ===========================================================================
 * POR QUE UM MÓDULO PURO, COM TESTE, PARA LER UMA LISTA
 * ===========================================================================
 * Porque a última vez que escrevi um leitor de campo do Convenia sem ter o
 * dado na mão, ele acertou zero em 638 -- e o painel passou a AFIRMAR, em
 * amarelo, que o Convenia não tinha cargo. O código não quebrou; ele devolveu
 * null, e null virou fato sobre o mundo.
 *
 * A diferença de custo é grande: cargo errado deixa um campo em branco na tela
 * de cadastro; marca errada reescreve a série mensal inteira, retroativamente,
 * com números que continuam plausíveis.
 *
 * Então este arquivo faz uma coisa só -- normalizar a forma -- e faz isso
 * contra as quatro formas que uma API costuma usar para "lista de pares
 * nome/valor". Qual delas o Convenia usa, eu não sei ainda. Os testes cobrem
 * as quatro, então a resposta certa não depende de eu ter adivinhado.
 *
 * O que este arquivo NÃO faz: decidir que a marca é isto. Enquanto a cobertura
 * medida for baixa, `fontes.ts` continua mandando e a série continua travada.
 * Ler é reversível; gravar não é.
 */

export interface CampoPersonalizado {
  nome: string;
  valor: string;
}

const texto = (v: unknown): string => {
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  // `{name: 'Recife'}` -- a mesma embalagem que `department` e `ethnicity` usam
  // nesta API. Se o valor do campo personalizado vier assim, ele é lido.
  if (v && typeof v === 'object' && 'name' in v) {
    const n = (v as { name?: unknown }).name;
    return typeof n === 'string' ? n.trim() : '';
  }
  return '';
};

/**
 * Normaliza `custom_fields` para uma lista de pares, seja qual for a forma.
 *
 * As quatro formas cobertas:
 *
 *   1. lista de objetos com nome e valor
 *      `[{ name: 'Escritório', value: 'Recife' }]`
 *      -- e as variantes `label`/`field`/`title` para o nome, `content`/`data`
 *         para o valor, porque cada API escolhe uma.
 *
 *   2. objeto simples, chave é o nome
 *      `{ 'Escritório': 'Recife' }`
 *
 *   3. lista de objetos de UM par cada
 *      `[{ 'Escritório': 'Recife' }]`
 *
 *   4. nada: null, undefined, `[]`, `{}`
 *      -- devolve lista vazia, que é diferente de devolver null. Ver abaixo.
 *
 * Devolve SEMPRE uma lista. Quem chama distingue "não tem campo nenhum"
 * (lista vazia) de "tem campos, nenhum chamado assim" (lista cheia, busca
 * falha) -- e essas duas coisas dizem ao RH problemas diferentes.
 */
export function lerCustomFields(bruto: unknown): CampoPersonalizado[] {
  const par = (nome: unknown, valor: unknown): CampoPersonalizado | null => {
    const n = texto(nome);
    const v = texto(valor);
    return n && v ? { nome: n, valor: v } : null;
  };

  const doObjeto = (o: Record<string, unknown>): CampoPersonalizado[] => {
    const nome = o.name ?? o.label ?? o.field ?? o.title ?? o.key;
    const valor = o.value ?? o.content ?? o.data ?? o.text;
    // Forma 1: tem par explícito.
    if (nome !== undefined || valor !== undefined) {
      const p = par(nome, valor);
      return p ? [p] : [];
    }
    // Formas 2 e 3: as próprias chaves são os nomes.
    return Object.entries(o)
      .map(([k, v]) => par(k, v))
      .filter((p): p is CampoPersonalizado => p != null);
  };

  if (bruto == null) return [];
  if (Array.isArray(bruto)) {
    return bruto.flatMap((item) =>
      item && typeof item === 'object' ? doObjeto(item as Record<string, unknown>) : [],
    );
  }
  if (typeof bruto === 'object') return doObjeto(bruto as Record<string, unknown>);
  return [];
}

/** Sem acento e em minúscula, para "Escritório" casar com "escritorio". */
export const chave = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/**
 * O valor do primeiro campo cujo NOME casa com um dos procurados.
 *
 * A busca é por nome de campo, e não por posição, porque a ordem de
 * `custom_fields` não é contrato: basta o RH criar um campo novo antes para a
 * leitura por índice passar a devolver outra coisa, calada.
 */
export function valorDe(
  campos: readonly CampoPersonalizado[],
  procurados: readonly string[],
): string | null {
  const alvos = procurados.map(chave);
  for (const c of campos) {
    const k = chave(c.nome);
    if (alvos.some((a) => k === a || k.includes(a))) return c.valor;
  }
  return null;
}

/**
 * Nomes que o escritório pode ter no cadastro.
 *
 * Lista de PROCURA, não de verdade: ela existe para a sonda medir cobertura,
 * e a medição é que decide. Se nenhum casar, a sonda mostra os nomes reais dos
 * campos personalizados e alguém acrescenta o certo aqui -- olhando, não
 * adivinhando.
 */
export const NOMES_DE_ESCRITORIO = [
  'escritorio', 'escritório', 'office', 'unidade', 'localidade', 'local',
  'praca', 'praça', 'filial', 'sede',
];

/**
 * Nomes para a EMPRESA -- a que vira marca no painel.
 *
 * `razao social` fica de fora de propósito: o cadastro tem "Razão Social
 * (quando PJ)", que é a empresa DO PRESTADOR, não a nossa. Um prestador
 * viraria uma marca com uma pessoa só, e o painel ganharia dezenas de marcas
 * fantasma sem nada dar erro.
 */
export const NOMES_DE_EMPRESA = ['empresa', 'company'];

export const escritorioDe = (detalhe: Record<string, unknown>): string | null =>
  valorDe(lerCustomFields(detalhe.custom_fields), NOMES_DE_ESCRITORIO);

export const empresaDe = (detalhe: Record<string, unknown>): string | null =>
  valorDe(lerCustomFields(detalhe.custom_fields), NOMES_DE_EMPRESA);

/**
 * Campos personalizados cujo VALOR não pode aparecer na tela.
 *
 * ===========================================================================
 * O FILTRO QUE EU DISSE QUE PROTEGIA E NÃO PROTEGIA
 * ===========================================================================
 * A sonda filtra por NOME DE CHAVE, e o texto dela na tela promete: "CPF,
 * endereço e conta bancária não atravessam o filtro". Verdade para os 47
 * campos nativos do cadastro.
 *
 * `custom_fields` passa por fora desse filtro por construção -- os nomes ali
 * são dados pelo RH, não pela API, então nenhum padrão meu os acertaria, e foi
 * exatamente por isso que eu os deixei passar inteiros.
 *
 * O que apareceu na primeira execução:
 *
 *   Razão Social (quando PJ) .. nomes de empresas de pessoas físicas
 *   CNPJ (quando PJs) ......... 50.167.372/0001-85, ...
 *   Endereço PJs .............. AVENIDA PAULISTA, 1106 Sala 01 ...
 *
 * CNPJ e endereço de prestador, numa tela de admin, debaixo de uma frase minha
 * dizendo que isso não atravessava. A promessa estava certa sobre metade do
 * mecanismo, e eu escrevi ela como se valesse para o todo.
 *
 * A correção não é remover o campo da lista: saber que ele EXISTE é útil, e é
 * a razão da sonda. O que sai é o valor. Nome e contagem continuam.
 */
export const VALOR_SENSIVEL =
  /(cnpj|cpf|raz[ãa]o\s*social|endere[çc]o|conta|banc|ag[êe]ncia|pix|rg\b|documento|identidade|pis|ctps|t[íi]tulo|passaporte|nascimento|depende|sal[áa]rio|salario|remunera)/i;

/** true quando o valor deste campo não deve ser exibido. */
export const valorEhSensivel = (nome: string): boolean => VALOR_SENSIVEL.test(chave(nome));
