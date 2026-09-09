/**
 * Os avisos da carga, separados por QUEM PRECISA FAZER ALGUMA COISA.
 *
 * ===========================================================================
 * OITO AMARELOS ENSINAM A IGNORAR AMARELO
 * ===========================================================================
 * A carga terminava com oito linhas, todas com ⚠ e todas da mesma cor. No
 * meio delas conviviam coisas que não têm nada em comum:
 *
 *   "Foto do cadastro gravada"          -> deu certo, é recibo
 *   "162 pessoas sem Level"             -> o RH precisa preencher
 *   "193 linhas nascem marcadas"        -> é assim e vai continuar sendo
 *
 * Quando tudo é alerta, nada é. E o custo real não é estético: a linha que
 * pedia ação ficava do lado da que só dizia "gravei", com o mesmo peso -- e
 * quem lê aprende, em duas execuções, a passar o olho por cima de todas.
 *
 * ===========================================================================
 * A CATEGORIA VEM DA ORIGEM, NÃO DE ADIVINHAÇÃO
 * ===========================================================================
 * A tentação seria classificar pelo texto na tela ("se contém 'gravado',
 * é recibo"). Este repositório já pagou por esse tipo de leitura: o resumo do
 * comp-ratio agrupava tirando o que estava entre aspas, e juntou "vínculo
 * vazio" com "Aprendiz" numa linha só.
 *
 * Então quem EMITE o aviso diz a categoria, com um prefixo. E o padrão de
 * quem esquecer é `pendencia` -- a categoria mais visível. Esquecer marca
 * torna o aviso mais gritante, nunca mais silencioso.
 */

export type CategoriaDeAviso = 'feito' | 'pendencia' | 'limite';

const MARCAS: Record<Exclude<CategoriaDeAviso, 'pendencia'>, string> = {
  feito: '[feito] ',
  limite: '[limite] ',
};

/** Recibo: a carga fez, deu certo, não há o que fazer a respeito. */
export const feito = (texto: string): string => `${MARCAS.feito}${texto}`;

/**
 * Limite conhecido: verdadeiro hoje, amanhã e no mês que vem. Aparece
 * recolhido -- não é notícia depois da primeira leitura, mas some da tela
 * seria pior: alguém reencontraria o fato como se fosse novidade.
 */
export const limite = (texto: string): string => `${MARCAS.limite}${texto}`;

export interface AvisoClassificado {
  categoria: CategoriaDeAviso;
  /** O texto sem a marca, pronto para a tela. */
  texto: string;
}

export function classificar(aviso: string): AvisoClassificado {
  for (const [categoria, marca] of Object.entries(MARCAS)) {
    if (aviso.startsWith(marca)) {
      return { categoria: categoria as CategoriaDeAviso, texto: aviso.slice(marca.length) };
    }
  }
  // Sem marca = pendência. Ver o cabeçalho: o esquecimento tem de empurrar
  // para o lado visível.
  return { categoria: 'pendencia', texto: aviso };
}

export interface AvisosAgrupados {
  feito: string[];
  pendencia: string[];
  limite: string[];
}

/** Agrupa preservando a ordem em que a carga emitiu cada um. */
export function agruparAvisos(avisos: readonly string[]): AvisosAgrupados {
  const out: AvisosAgrupados = { feito: [], pendencia: [], limite: [] };
  for (const a of avisos) {
    const { categoria, texto } = classificar(a);
    out[categoria].push(texto);
  }
  return out;
}
