/**
 * "Este bloco não segue o filtro de X."
 *
 * ===========================================================================
 * POR QUE ISTO É UM COMPONENTE
 * ===========================================================================
 * Nem todo dado da aba tem recorte por área no banco, e os que não têm caíam em
 * três situações diferentes na tela:
 *
 *   - `survey_cut_scores` de marca/função/tempo -- cortam a empresa por OUTRO
 *     eixo, e uma pessoa de Marketing está dentro de "Betnacional" também;
 *   - `survey_driver_importance` -- uma linha por pergunta, sem recorte nenhum;
 *   - a série por tempo de casa -- carregada só no nível da empresa.
 *
 * O aviso existia escrito à mão em um lugar só (o bloco de recortes). Os outros
 * dois trocavam de números junto com o filtro sem trocar de números -- ou seja,
 * ficavam idênticos, e nada na tela dizia por quê. Filtrado em Marketing, a
 * tabela de tempo de casa mostrava 83/76/80 exatamente como sem filtro, e quem
 * lesse concluiria que era o tempo de casa DE MARKETING.
 *
 * Um cartão que não obedece ao filtro tem que dizer isso ele mesmo. E o texto
 * precisa vir de um lugar só, senão a terceira cópia contradiz as duas
 * primeiras -- que é o problema que este arquivo inteiro existe para evitar,
 * e que já aconteceu com a régua das áreas e com a das perguntas.
 *
 * ===========================================================================
 * O QUE O AVISO PRECISA DIZER
 * ===========================================================================
 * Não basta "não segue o filtro". Quem lê precisa saber POR QUE (senão parece
 * defeito) e O QUE os números são então (senão não sabe se pode usá-los). Daí
 * `motivo` ser obrigatório e `escopo` dizer de quem é o número.
 */

export default function AvisoForaDoFiltro({
  departamento,
  motivo,
  escopo = 'da empresa inteira',
}: {
  /** Área selecionada. Sem filtro, o aviso não aparece — não há o que avisar. */
  departamento: string | null | undefined;
  /** Por que este bloco não tem recorte. Uma frase, concreta. */
  motivo: React.ReactNode;
  /** De quem são os números mostrados. */
  escopo?: React.ReactNode;
}) {
  if (!departamento) return null;
  return (
    <p className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:text-amber-200">
      Este bloco <strong>não segue o filtro de {departamento}</strong>. {motivo} Os números abaixo
      são <strong>{escopo}</strong>, não de {departamento}.
    </p>
  );
}
