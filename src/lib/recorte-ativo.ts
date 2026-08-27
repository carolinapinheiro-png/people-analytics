import { SEPARADOR_CRUZAMENTO } from '@/lib/aggregator/polly-survey';
import { semFiltro, valorFiltro } from '@/lib/filtro-sentinela';

/**
 * Qual recorte a aba de Engajamento deve mostrar, dados os filtros.
 *
 * ------------------------------------------------------------------
 * POR QUE ISTO SAIU DO COMPONENTE
 * ------------------------------------------------------------------
 * A decisão tem quatro estados -- sem recorte, só perfil, só área, os dois --
 * e monta a chave do banco, que muda de forma no caso cruzado: 'tempo' com
 * valor "24+ meses" vira 'area+tempo' com valor "Marketing || 24+ meses".
 *
 * Enquanto morava dentro do JSX, a única forma de conferir era abrir a tela e
 * olhar. Foi assim que o caso mais importante passou: o recorte era calculado
 * certo e renderizado DEPOIS dos quatro KPIs, que continuavam mostrando a
 * empresa. Chegou como "o filtro de tempo de casa não está funcionando" --
 * ele funcionava, e o resultado aparecia embaixo do que não tinha mudado.
 *
 * Um cartão certo embaixo de quatro cartões errados se lê como quatro cartões
 * certos.
 */

export interface RecorteAtivo {
  /** Como está gravado em `cut_type`: 'tempo', 'modelo', 'area+tempo'... */
  cutType: string;
  /** Como está gravado em `cut_value`, composto quando cruzado. */
  valor: string;
  /** O valor sem a área na frente, para o título não mostrar o separador. */
  soValor: string;
  /** O que escrever antes dos dois-pontos no título. */
  rotulo: string;
  /** `true` quando área e perfil estão juntos. */
  cruzado: boolean;
}

/** Só a parte de perfil: tempo de casa ou modelo, nunca os dois. */
const PERFIS = [
  { chave: 'tempoCasa', tipo: 'tempo', rotulo: 'Tempo de casa' },
  { chave: 'modeloTrabalho', tipo: 'modelo', rotulo: 'Modelo de trabalho' },
] as const;

export function recorteAtivo(
  filtros: { tempoCasa?: string | null; modeloTrabalho?: string | null },
  /**
   * A área selecionada, com o nome COMO ESTÁ GRAVADO -- "Marketing", não
   * "MARKETING". O filtro guarda em caixa alta e o banco não; montar a chave
   * com o valor do filtro devolveria zero linhas, e zero linha aqui se lê como
   * "este grupo não respondeu", que é falso.
   */
  areaGravada: string | null,
): RecorteAtivo | null {
  const perfil = PERFIS.map((p) => ({ ...p, bruto: filtros[p.chave] }))
    .find((p) => !semFiltro(p.bruto));
  if (!perfil) return null;

  const soValor = valorFiltro(perfil.bruto) as string;
  if (!areaGravada) {
    return { cutType: perfil.tipo, valor: soValor, soValor, rotulo: perfil.rotulo, cruzado: false };
  }
  return {
    cutType: `area+${perfil.tipo}`,
    valor: `${areaGravada}${SEPARADOR_CRUZAMENTO}${soValor}`,
    soValor,
    rotulo: `${areaGravada} · ${perfil.rotulo}`,
    cruzado: true,
  };
}
