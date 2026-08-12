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
  marca: 'NSX' | 'Betfair' | 'Flutter International';
  /** Cidade. `null` quando a empresa não é de uma praça só. */
  local: string | null;
  token: string | null;
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
    },
    {
      env: 'CONVENIA_TOKEN_NSX_SP',
      empresa: 'NSX São Paulo',
      marca: 'NSX',
      local: 'São Paulo',
      token: limpar(process.env.CONVENIA_TOKEN_NSX_SP),
    },
    {
      env: 'CONVENIA_TOKEN_BETFAIR',
      empresa: 'Betfair',
      marca: 'Betfair',
      local: null,
      token: limpar(process.env.CONVENIA_TOKEN_BETFAIR),
    },
    {
      env: 'CONVENIA_TOKEN_INTERNATIONAL',
      empresa: 'Flutter International',
      marca: 'Flutter International',
      local: null,
      token: limpar(process.env.CONVENIA_TOKEN_INTERNATIONAL),
    },
  ];
}

export const fontesConfiguradas = () => fontes().filter((f) => f.token != null);
export const fontesFaltando = () => fontes().filter((f) => f.token == null);
