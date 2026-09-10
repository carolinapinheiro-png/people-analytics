import type { MonthRecord } from './raw-data';
import type { LeaverRecord } from './leaver-types';
import type { FilterKey } from '@/lib/tab-filters';
import { FAIXAS_TEMPO_DE_CASA } from '@/lib/convenia/pessoas';
import { ehAusencia, SEM_VALOR } from '@/lib/filtro-sentinela';

/**
 * As opções de cada filtro, LIDAS DO DADO -- não escritas à mão.
 *
 * ===========================================================================
 * POR QUE ISTO EXISTE
 * ===========================================================================
 * As listas de opções viviam escritas à mão em `FilterBar.tsx`, e a carga
 * gravava outra coisa. Não em um filtro: em todos. Medido em 10/09, contra a
 * série de set/2026:
 *
 *   tempo de casa .. seletor "0-3 meses / 3-6 meses / 2-5 anos / 5+ anos"
 *                    série    "0-6 meses / 2-4 anos / 4+ anos"
 *                    → 4 das 6 opções não existiam em mês nenhum.
 *   level .......... faltavam L7 (10 pessoas), L9 (2) e NA (166).
 *   contrato ....... faltavam Diretor Estatutário, Aprendiz, Contrato
 *                    Intermitente e Associado (14 pessoas).
 *   job family ..... faltava Data & Analytics (19) e Não informado (64).
 *   departamento ... faltavam GERALL, GERAL, COMPLIANCE, PORTO, DIRETORIA.
 *
 * Escolher uma opção morta desenha uma linha reta no zero, que se lê como
 * "não temos ninguém nessa faixa". E as pessoas que estão em valores ausentes
 * da lista ficam INALCANÇÁVEIS: não há como recortá-las.
 *
 * ===========================================================================
 * A REGRA
 * ===========================================================================
 * O vocabulário do seletor é o vocabulário GRAVADO. As chaves de `family_base`,
 * `contract_base`, `tenure_base`, `level_base` e `dept_data` são, por
 * definição, os valores que existem -- elas foram escritas pela mesma carga
 * que a tela vai consultar.
 *
 * Consequências que valem a pena:
 *   - vínculo novo que o RH criar aparece sozinho, sem deploy;
 *   - opção que some do quadro some do seletor;
 *   - "não temos ninguém nessa faixa" volta a significar isso, porque a faixa
 *     só está ali se alguém já esteve nela.
 *
 * O que NÃO sai daqui: `modeloTrabalho` e `marcaProduto` vêm da pesquisa, que
 * é outra base com outro vocabulário, e `tempoCasa` em Engajamento tem a
 * escada própria da pesquisa. Esses continuam declarados na barra, com o
 * motivo escrito lá.
 */

/**
 * A ordem das faixas de tempo de casa -- importada, não copiada.
 *
 * Esta régua já existia em quatro lugares e um deles divergia. Uma quinta
 * cópia aqui, ainda que correta hoje, seria só a próxima a envelhecer.
 */
const ORDEM_TEMPO: readonly string[] = FAIXAS_TEMPO_DE_CASA;

/** Faixa salarial é escada: por frequência ela sairia embaralhada. */
const ORDEM_SALARIO = ['Até 3k', '3k-5k', '5k-8k', '8k-12k', '12k-20k', '20k-50k', '50k+'];

/**
 * "Não informado" e "NA" vão para o FIM, e não somem.
 *
 * Some e as pessoas sem o campo preenchido ficam sem recorte nenhum -- 166 em
 * `level` e 64 em job family, em set/2026. São a maior fatia de `level`, e
 * escondê-las faria a soma dos recortes não bater com o headcount sem que nada
 * dissesse por quê.
 */
const ehSemValor = ehAusencia;

/**
 * Ordena pela régua conhecida quando existe; senão, por tamanho.
 *
 * Por tamanho, e não alfabética: numa lista de dez famílias, a que tem 150
 * pessoas importa mais que a que começa com "A". A régua fixa vence porque
 * "4+ anos" depois de "1-2 anos" é a única ordem que se lê.
 */
function ordenar(valores: Map<string, number>, regua?: readonly string[]): string[] {
  const chaves = [...valores.keys()];
  const comValor = chaves.filter((v) => !ehSemValor(v));
  // Todas as formas de ausência viram UMA opção. A série escreve "NA", os
  // desligados escrevem "Não informado" e "Não se aplica", e o departamento
  // escreve "-": oferecer os quatro daria quatro seletores para a mesma
  // pergunta, e cada um acharia só a base que o escreveu.
  const sem = chaves.some(ehSemValor) ? [SEM_VALOR] : [];

  comValor.sort((a, b) => {
    if (regua) {
      const ia = regua.indexOf(a);
      const ib = regua.indexOf(b);
      // Fora da régua vai depois de quem está nela, em vez de virar -1 e pular
      // para o começo -- que é como um valor novo apareceria primeiro.
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    }
    return (valores.get(b) ?? 0) - (valores.get(a) ?? 0);
  });
  return [...comValor, ...sem];
}

/** Soma as contagens de um mapa `{ valor: n }` ao longo dos meses. */
function somarChaves(
  meses: ReadonlyArray<MonthRecord>,
  pegar: (m: MonthRecord) => Record<string, number> | undefined,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of meses) {
    for (const [k, v] of Object.entries(pegar(m) ?? {})) {
      const chave = k.trim();
      if (!chave) continue;
      out.set(chave, (out.get(chave) ?? 0) + (Number(v) || 0));
    }
  }
  return out;
}

/** O mesmo, para um campo de texto da base de desligados. */
function contarDosDesligados(
  leavers: ReadonlyArray<LeaverRecord>,
  pegar: (l: LeaverRecord) => string | null | undefined,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const l of leavers) {
    const v = (pegar(l) ?? '').trim();
    if (!v) continue;
    out.set(v, (out.get(v) ?? 0) + 1);
  }
  return out;
}

/**
 * As opções derivadas do dado, por filtro.
 *
 * Devolve `undefined` para os filtros cujo vocabulário NÃO vem da série -- a
 * barra mantém a lista declarada dela para esses. `undefined`, e não `[]`:
 * lista vazia apagaria o seletor, e "ainda não carregou" viraria "não existe".
 */
export function opcoesDoDado(
  meses: ReadonlyArray<MonthRecord>,
  leavers: ReadonlyArray<LeaverRecord>,
): Partial<Record<FilterKey, string[]>> {
  // Sem série carregada não há vocabulário -- e devolver listas vazias faria a
  // barra piscar sem opções durante o carregamento.
  if (!meses.length) return {};

  // ------------------------------------------------------------------
  // A UNIÃO DAS DUAS BASES, E NÃO SÓ A SÉRIE
  // ------------------------------------------------------------------
  // As mesmas cinco dimensões existem em dois lugares, e os conjuntos NÃO
  // coincidem: a série tem "Data & Analytics" e "Aprendiz", que ninguém
  // desligado tem; os desligados têm o departamento "-", que a série não tem.
  //
  // Oferecer só a série tornaria inalcançável quem só aparece nos desligados,
  // e vice-versa. A união é o único conjunto em que toda pessoa de qualquer
  // das duas bases pode ser encontrada por algum recorte.
  const unir = (
    a: Map<string, number>,
    b: Map<string, number>,
  ): Map<string, number> => {
    const out = new Map(a);
    for (const [k, v] of b) out.set(k, (out.get(k) ?? 0) + v);
    return out;
  };

  const out: Partial<Record<FilterKey, string[]>> = {
    jobFamily: ordenar(unir(
      somarChaves(meses, (m) => m.family_base),
      contarDosDesligados(leavers, (l) => l.job_family),
    )),
    tipoContrato: ordenar(unir(
      somarChaves(meses, (m) => m.contract_base),
      contarDosDesligados(leavers, (l) => l.vinculo),
    )),
    tempoCasa: ordenar(unir(
      somarChaves(meses, (m) => m.tenure_base),
      contarDosDesligados(leavers, (l) => l.tempo_casa_faixa),
    ), ORDEM_TEMPO),
    level: ordenar(unir(
      somarChaves(meses, (m) => m.level_base),
      contarDosDesligados(leavers, (l) => l.level),
    )),
    departamento: ordenar(unir(
      somarChaves(meses, (m) =>
        Object.fromEntries(Object.entries(m.dept_data ?? {}).map(([k, d]) => [k, d.hc ?? 0]))),
      contarDosDesligados(leavers, (l) => l.departamento),
    )),
  };

  // Faixa salarial e tipo de desligamento só existem na base por pessoa. Sem
  // desligados carregados, ficam de fora e a barra usa a lista declarada.
  if (leavers.length) {
    out.faixaSalarial = ordenar(contarDosDesligados(leavers, (l) => l.faixa_salarial), ORDEM_SALARIO);
    // `tipo_desligamento_agrupado`, e NÃO `tipo_desligamento`. O cru é o texto
    // do Convenia -- "Demissão SEM justa causa fora do contrato de experiência
    // - Pedido da Empresa", doze variantes. É o agrupado (Voluntário,
    // Involuntário, Acordo, Término de Contrato, Outros) que a aba de Atrição
    // compara com o filtro. Oferecer o cru daria doze opções ilegíveis e
    // nenhuma delas casaria.
    out.tipoDesligamento = ordenar(
      contarDosDesligados(leavers, (l) => l.tipo_desligamento_agrupado),
    );
  }

  // Um filtro sem nenhum valor gravado sai da lista: a barra volta a usar o
  // que ela declara, em vez de mostrar um seletor com "Todos" e nada mais.
  for (const [k, v] of Object.entries(out)) {
    if (!v || v.length === 0) delete out[k as FilterKey];
  }
  return out;
}
