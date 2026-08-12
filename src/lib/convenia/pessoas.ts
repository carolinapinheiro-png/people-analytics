/**
 * Reconstrução da série mensal a partir do cadastro de pessoas.
 *
 * ===========================================================================
 * A IDEIA
 * ===========================================================================
 * Hoje `monthly_metrics` é digitada a partir de planilhas. Com data de admissão
 * e data de desligamento de cada pessoa, o headcount de QUALQUER mês passado
 * deixa de ser digitado e passa a ser calculado:
 *
 *   esteve na empresa no mês M  ⟺  admitida até o fim de M
 *                                  E (não saiu, ou saiu depois do fim de M)
 *
 * A diferença não é de esforço, é de natureza: um número digitado não tem como
 * ser conferido; um número calculado é reproduzível, e a conta que o produziu
 * pode ser lida e discutida.
 *
 * ===========================================================================
 * O QUE VEM DE ONDE
 * ===========================================================================
 * A listagem de colaboradores traz `hiring_date`, `department`, `status`.
 * A listagem de desligados traz só `id`, `corporate_email` e o bloco
 * `dismissal` -- sem admissão e sem área.
 *
 * As duas se cruzam pelo `id`. Se a pessoa desligada também estiver na
 * listagem de colaboradores, o registro fica completo. Se não estiver, ela
 * entra como saída (sabemos a data), mas não entra no headcount dos meses em
 * que esteve presente -- porque não sabemos quando entrou.
 *
 * Isso é uma subestimação, e ela é CONTADA e devolvida em
 * `resumo.semAdmissao`. Um erro que se sabe medir é um erro administrável;
 * um erro silencioso não é.
 */

export interface PessoaConvenia {
  id: string;
  /** ISO ou dd/mm/aaaa. Pode faltar. */
  hiring_date?: string | null;
  department?: { name?: string | null } | null;
  status?: string | null;
  /** Preenchidos pelo cruzamento com a listagem de desligados. */
  dataSaida?: string | null;
  tipoSaida?: string | null;
}

export interface LinhaMensal {
  month: string;
  brand: string;
  headcount: number;
  joiners: number;
  leavers: number;
  attrition_rate: number | null;
  dept_breakdown: Record<string, { headcount: number; joiners: number; leavers: number }>;
}

export interface ResumoReconstrucao {
  pessoas: number;
  comAdmissao: number;
  semAdmissao: number;
  saidas: number;
  saidasSemAdmissao: number;
  primeiroMes: string | null;
  ultimoMes: string | null;
  avisos: string[];
}

/**
 * O Convenia devolve data em mais de um formato dependendo do endpoint:
 * ISO (`2026-03-16`) na API, e `dd/mm/aaaa` no export. Aceitar os dois evita
 * que uma troca de origem quebre a série sem avisar.
 *
 * Devolve `YYYY-MM` -- o mês é a granularidade da série, e guardar o dia daria
 * uma precisão que a série não usa e que convidaria a comparações erradas.
 */
export function mesDe(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const s = String(valor).trim();
  if (!s || s === 'Não informado') return null;

  const iso = s.match(/^(\d{4})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}`;

  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}`;

  // Formato desconhecido: devolver null é melhor que adivinhar. Um mês errado
  // entra na série sem parecer errado; um mês ausente aparece na contagem.
  return null;
}

/** Lista de meses de a até b, inclusive. */
export function mesesEntre(de: string, ate: string): string[] {
  const out: string[] = [];
  let [a, m] = de.split('-').map(Number);
  const [aF, mF] = ate.split('-').map(Number);
  while (a < aF || (a === aF && m <= mF)) {
    out.push(`${a}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; a++; }
  }
  return out;
}

const AREA_VAZIA = 'SEM DEPTO';

export function areaDe(p: PessoaConvenia): string {
  const n = p.department?.name?.trim();
  return n && n.length ? n.toUpperCase() : AREA_VAZIA;
}

/**
 * Saída VOLUNTÁRIA vs involuntária.
 *
 * O painel só conta saída voluntária no cálculo de atrição ligado a
 * engajamento, porque demissão pela empresa diz respeito à decisão da empresa,
 * não à experiência de quem ficou. Misturar as duas faria uma reestruturação
 * parecer crise de retenção.
 *
 * O Convenia devolve o rótulo em `dismissal.type.title`, em português, coisa
 * como "Pedido de demissão" ou "Demissão SEM justa causa - Pedido da Empresa".
 * A regra abaixo procura o pedido da PESSOA; qualquer outra coisa conta como
 * involuntária. Na dúvida o código erra para involuntária, que é o lado
 * conservador: subestimar atrição voluntária é menos perigoso que inventá-la.
 */
export function ehVoluntaria(tipo: string | null | undefined): boolean {
  if (!tipo) return false;
  const t = tipo.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (t.includes('pedido da empresa')) return false;
  return t.includes('pedido de demissao')
    || t.includes('pedido do colaborador')
    || t.includes('a pedido')
    || t.includes('rescisao a pedido');
}

/**
 * Reconstrói a série mensal.
 *
 * @param pessoas registros já cruzados: admissão e área da listagem de
 *                colaboradores, saída da listagem de desligados.
 * @param marca   a marca da empresa de origem (NSX / Betfair / Flutter Int).
 * @param ateMes  último mês da série, normalmente o mês corrente.
 */
export function reconstruirSerie(
  pessoas: PessoaConvenia[],
  marca: string,
  ateMes: string,
): { linhas: LinhaMensal[]; resumo: ResumoReconstrucao } {
  const avisos: string[] = [];

  const comMes = pessoas.map((p) => ({
    p,
    entrada: mesDe(p.hiring_date),
    saida: mesDe(p.dataSaida),
    area: areaDe(p),
  }));

  const comAdmissao = comMes.filter((x) => x.entrada != null);
  const semAdmissao = comMes.length - comAdmissao.length;
  const saidas = comMes.filter((x) => x.saida != null);
  const saidasSemAdmissao = saidas.filter((x) => x.entrada == null).length;

  if (semAdmissao > 0) {
    avisos.push(`${semAdmissao} pessoas sem data de admissão legível — ficam fora do headcount dos meses em que estiveram presentes, o que subestima a série para baixo.`);
  }
  if (saidasSemAdmissao > 0) {
    avisos.push(`${saidasSemAdmissao} saídas sem admissão conhecida: contam como saída no mês certo, mas não somam headcount antes disso.`);
  }

  const entradas = comAdmissao.map((x) => x.entrada!).sort();
  const primeiroMes = entradas[0] ?? null;

  if (!primeiroMes) {
    return {
      linhas: [],
      resumo: {
        pessoas: pessoas.length, comAdmissao: 0, semAdmissao,
        saidas: saidas.length, saidasSemAdmissao,
        primeiroMes: null, ultimoMes: null,
        avisos: [...avisos, 'Nenhuma data de admissão legível — não há série a reconstruir.'],
      },
    };
  }

  const linhas: LinhaMensal[] = [];

  for (const mes of mesesEntre(primeiroMes, ateMes)) {
    const dept: LinhaMensal['dept_breakdown'] = {};
    const bump = (area: string, campo: 'headcount' | 'joiners' | 'leavers') => {
      dept[area] ??= { headcount: 0, joiners: 0, leavers: 0 };
      dept[area][campo]++;
    };

    let headcount = 0, joiners = 0, leavers = 0;

    for (const x of comMes) {
      // Presente no mês: entrou até o fim dele e não tinha saído ainda.
      // A comparação de strings "YYYY-MM" funciona porque o formato é
      // lexicograficamente ordenável -- é o motivo de guardar assim.
      const presente = x.entrada != null && x.entrada <= mes && (x.saida == null || x.saida > mes);
      if (presente) { headcount++; bump(x.area, 'headcount'); }
      if (x.entrada === mes) { joiners++; bump(x.area, 'joiners'); }
      if (x.saida === mes) { leavers++; bump(x.area, 'leavers'); }
    }

    // Denominador: headcount do fim do mês mais quem saiu nele -- ou seja, o
    // conjunto de pessoas expostas ao risco de sair naquele mês. Usar só o
    // headcount final subestimaria a taxa, porque quem saiu já não está lá.
    const expostos = headcount + leavers;
    linhas.push({
      month: `${mes}-01`,
      brand: marca,
      headcount, joiners, leavers,
      attrition_rate: expostos > 0 ? Math.round((leavers / expostos) * 1000) / 10 : null,
      dept_breakdown: dept,
    });
  }

  return {
    linhas,
    resumo: {
      pessoas: pessoas.length,
      comAdmissao: comAdmissao.length,
      semAdmissao,
      saidas: saidas.length,
      saidasSemAdmissao,
      primeiroMes,
      ultimoMes: ateMes,
      avisos,
    },
  };
}
