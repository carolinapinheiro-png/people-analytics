import { comporCruzamento } from '@/lib/aggregator/polly-survey';
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

/**
 * Os perfis, na ORDEM em que entram na chave.
 *
 * A ordem não é estética: 'area+tempo+modelo' é o nome gravado, e montar
 * "Marketing || Remoto || 24+ meses" não acharia linha nenhuma. Zero linha
 * aqui chega à tela como "este grupo não respondeu", que é falso.
 */
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
  const ativos = PERFIS.map((p) => ({ ...p, bruto: filtros[p.chave] }))
    .filter((p) => !semFiltro(p.bruto))
    .map((p) => ({ ...p, valor: valorFiltro(p.bruto) as string }));
  if (!ativos.length) return null;

  // ------------------------------------------------------------------
  // DOIS PERFIS AO MESMO TEMPO
  // ------------------------------------------------------------------
  // Tempo de casa e modelo se excluíam porque 'tempo+modelo' não era gravado.
  // Passou a ser, e medido em ago/26 é o cruzamento com MELHOR aproveitamento
  // do painel: 20 de 20 combinações acima do mínimo de cinco respostas. A
  // exclusão era a única coisa impedindo o melhor recorte disponível.
  //
  // O triplo, com área, é o oposto: 29 de 106 (27%), cobrindo 69% das
  // pessoas. Vale, e quem lê isto avisa quando a combinação escolhida é uma
  // das que não passam -- "existe e é pequeno demais", não "não existe".
  const tipos = ativos.map((p) => p.tipo);
  const valores = ativos.map((p) => p.valor);
  const soValor = valores.join(' · ');

  if (!areaGravada) {
    return {
      cutType: tipos.join('+'),
      valor: comporCruzamento(...valores),
      soValor,
      rotulo: ativos.map((p) => p.rotulo).join(' e '),
      // `cruzado` quer dizer "TEM ÁREA JUNTO", e não "tem mais de um campo".
      // Quem lê isto decide se explica a ausência da fila por área.
      cruzado: false,
    };
  }
  return {
    cutType: ['area', ...tipos].join('+'),
    valor: comporCruzamento(areaGravada, ...valores),
    soValor,
    rotulo: `${areaGravada} · ${ativos.map((p) => p.rotulo).join(' e ')}`,
    cruzado: true,
  };
}
