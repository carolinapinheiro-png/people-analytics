/**
 * As empresas do Convenia, uma por token.
 *
 * ------------------------------------------------------------------
 * POR QUE ISTO EXISTE
 * ------------------------------------------------------------------
 * O Convenia é por PESSOA JURÍDICA, não por grupo. Cada CNPJ tem seu token, e
 * um token só enxerga a própria empresa. A Flutter BR está espalhada em várias:
 * NSX em Recife, Marechal e São Paulo, mais Betfair e Flutter International.
 *
 * Isso apareceu tarde, e vale registrar como isso quase virou erro:
 * a primeira sonda voltou com **397 colaboradores** e eu estava a ponto de
 * tratar esse número como o headcount da empresa. Era só o de uma unidade. Se
 * a carga tivesse rodado assim, o painel mostraria um headcount menor que o
 * real, com aparência perfeitamente normal -- nenhum erro, nenhuma coluna
 * vazia, só um número errado que ninguém teria motivo para questionar.
 *
 * ------------------------------------------------------------------
 * O LADO BOM
 * ------------------------------------------------------------------
 * A empresa de origem não é ruído: é exatamente a dimensão de MARCA que o
 * painel já usa (NSX / Betfair / Flutter International), e traz de brinde a
 * LOCALIDADE, que a análise de engajamento pediu e não tinha de onde tirar.
 *
 * Ou seja: o dado chega já cortado pelas duas dimensões que interessam, sem
 * precisar de de-para nenhum.
 *
 * ------------------------------------------------------------------
 * POR QUE OS NOMES ESTÃO ESCRITOS AQUI, UM A UM
 * ------------------------------------------------------------------
 * O caminho tentador seria varrer `process.env` atrás de tudo que comece com
 * `CONVENIA_TOKEN_`. Não faço isso porque os secrets do Lovable entram no
 * momento do BUILD: o empacotador troca `process.env.NOME` pelo valor onde vê
 * a referência literal, e uma varredura em tempo de execução acharia um objeto
 * vazio. O sintoma seria "nenhuma empresa configurada" com cinco secrets
 * cadastrados -- e a investigação começaria no lugar errado.
 *
 * O custo de escrever um a um é uma linha por empresa nova. Barato.
 */

export interface FonteConvenia {
  /** Nome do secret no Lovable. */
  env: string;
  /** Como aparece na tela. */
  empresa: string;
  /** Casa com a dimensão de marca que o painel já usa. */
  /**
   * Tem que ser IDÊNTICO ao `brand` que já existe em `monthly_metrics`, senão
   * a comparação entre séries trata a mesma marca como duas. Conferido contra
   * o banco: os valores em uso são 'NSX', 'Betfair BR', 'Flutter International'
   * e 'Porto'.
   */
  marca: 'NSX' | 'Betfair BR' | 'Flutter International';
  /** Cidade. `null` quando a empresa não é de uma praça só. */
  local: string | null;
  token: string | null;
  /**
   * Preenchida quando o token foi removido DE PROPÓSITO, com motivo e data.
   * Uma fonte aposentada não aparece como pendência -- ver `fontesFaltando`.
   */
  aposentada?: string;
}

/** Tira espaço e aspas que sobram de copiar e colar. */
const limpar = (v: string | undefined) => {
  const t = v?.trim().replace(/^["']|["']$/g, '');
  return t && t.length >= 20 ? t : null;
};

export function fontes(): FonteConvenia[] {
  return [
    {
      env: 'CONVENIA_TOKEN_NSX_RECIFE',
      empresa: 'NSX Recife',
      marca: 'NSX',
      local: 'Recife',
      // O primeiro token cadastrado chamava-se CONVENIA_API_TOKEN, antes de
      // sabermos que havia várias empresas. Aceitar os dois nomes evita que a
      // integração pare no dia em que alguém arrumar a nomenclatura.
      token: limpar(process.env.CONVENIA_TOKEN_NSX_RECIFE) ?? limpar(process.env.CONVENIA_API_TOKEN),
    },
    {
      env: 'CONVENIA_TOKEN_NSX_MARECHAL',
      empresa: 'NSX Marechal',
      marca: 'NSX',
      local: 'Marechal',
      token: limpar(process.env.CONVENIA_TOKEN_NSX_MARECHAL),
      aposentada: 'Unificacao de bases, 05/09/2026. Os ativos migraram para NSX Recife e os 7 desligados estao em convenia_leavers.',
    },
    {
      env: 'CONVENIA_TOKEN_NSX_SP',
      empresa: 'NSX São Paulo',
      marca: 'NSX',
      local: 'São Paulo',
      token: limpar(process.env.CONVENIA_TOKEN_NSX_SP),
      aposentada: 'Unificacao de bases, 05/09/2026. Os ativos migraram para NSX Recife e os 21 desligados estao em convenia_leavers.',
    },
    {
      env: 'CONVENIA_TOKEN_BETFAIR',
      empresa: 'Betfair',
      marca: 'Betfair BR',
      local: null,
      token: limpar(process.env.CONVENIA_TOKEN_BETFAIR),
      aposentada: 'Unificacao de bases, 05/09/2026. Os ativos migraram para NSX Recife e os 7 desligados estao em convenia_leavers.',
    },
    {
      env: 'CONVENIA_TOKEN_INTERNATIONAL',
      empresa: 'Flutter International',
      marca: 'Flutter International',
      local: null,
      token: limpar(process.env.CONVENIA_TOKEN_INTERNATIONAL),
      aposentada: 'Unificacao de bases, 05/09/2026. Os ativos migraram para NSX Recife; esta base nunca devolveu desligado legivel.',
    },
  ];
}

export const fontesConfiguradas = () => fontes().filter((f) => f.token != null);

/**
 * Empresa sem token que AINDA PRECISA de um.
 *
 * ===========================================================================
 * AUSÊNCIA DECIDIDA NÃO É PENDÊNCIA
 * ===========================================================================
 * Removidos os quatro tokens da unificação, a tela passou a pedir que alguém
 * criasse os secrets de volta e a avisar que "o headcount somado está
 * incompleto até elas entrarem". As duas coisas eram falsas: as bases estão
 * vazias por decisão, os ativos migraram para Recife, e os 35 desligados delas
 * vivem em `convenia_leavers` -- a carga que veio depois provou isso, mantendo
 * as três marcas idênticas.
 *
 * Um alerta que pede para desfazer o que acabou de ser feito, todo mês, ensina
 * a ignorar alertas. E o dia em que um token de verdade faltar, esse é o
 * alerta que ninguém vai ler.
 *
 * A fonte aposentada continua listada, com o motivo e a data, para que ela
 * possa ser reativada se a unificação for revertida.
 */
export const fontesFaltando = () => fontes().filter((f) => f.token == null && !f.aposentada);

/** As que foram desligadas de propósito, com o porquê. */
export const fontesAposentadas = () => fontes().filter((f) => f.token == null && f.aposentada);
