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

/** As mesmas contas da linha mensal, restritas a uma área. */
export interface DeptBreakdownPorArea {
  gender_female: number;
  gender_male: number;
  leaders: number;
  leader_female: number;
  level_base: Record<string, number>;
  tenure_base: Record<string, number>;
  demographics: {
    age: Record<string, number>;
    race: Record<string, number>;
    marital: Record<string, number>;
    origin: Record<string, number>;
  };
  race_cross: Record<string, { total: number; female: number; leaders: number; female_leaders: number }>;
}

export interface PessoaConvenia {
  id: string;
  /** ISO ou dd/mm/aaaa. Pode faltar. */
  hiring_date?: string | null;
  /** Centro de custo, da listagem. Coluna CC do report da Controladoria. */
  cost_center?: string | null;
  department?: { name?: string | null } | null;
  status?: string | null;
  /** Quem esta pessoa reporta. Usado para DERIVAR quem é gestor. */
  supervisorId?: string | null;
  salary?: number | null;
  birth_date?: string | null;
  /** UF, de `address.state`. */
  uf?: string | null;
  /** Matrícula (000320, P000212). Employee ID do Talent Mobility -- não o id. */
  registration?: string | null;
  /** Nome social. Preferred Name do report. */
  social_name?: string | null;
  /** O `Time`. Supervisory Organization e os sete níveis da escada. */
  team?: string | null;
  /** Vínculo cru, como o Convenia manda. A tradução CLT/PJ é do gerador. */
  relationship?: string | null;
  /** 'F' | 'M' | null. Vem do cache, não da listagem. */
  genero?: 'F' | 'M' | null;
  /** Cor/raça, como o Convenia escreve ("Branca", "Parda"). Também do cache. */
  raca?: string | null;
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
  /**
   * Headcount, entradas e saídas por área.
   *
   * ------------------------------------------------------------------
   * O NOME ERA `dept_breakdown`, E ESSE NOME JÁ ESTAVA OCUPADO
   * ------------------------------------------------------------------
   * O app tem DUAS estruturas por departamento, com significados diferentes:
   *
   *   dept_data ......... { hc, avg_salary_* } -- é o que `applyDeptFilter`
   *                       usa para ACHAR a área e tirar a fatia.
   *   dept_breakdown .... { gender_female, leaders, level_base, demographics,
   *                       race_cross } -- as dimensões recortadas por área.
   *
   * Esta carga gravava `{headcount, joiners, leavers}` na coluna
   * `dept_breakdown`, e nunca escrevia `dept_data`. As duas pontas usavam o
   * mesmo nome para coisas distintas.
   *
   * O efeito: `applyDeptFilter` não achava a área em `dept_data` (vazio) e
   * saía cedo, devolvendo headcount/leaders/joiners zerados COM todos os
   * percentuais e distribuições da empresa intactos. Filtrar por uma área
   * deixava "Mulheres — Geral" igual ao da empresa inteira -- que foi
   * exatamente o que apareceu na tela do DEI.
   */
  dept_data: Record<string, {
    hc: number; joiners: number; leavers: number;
    /**
     * Médias salariais DA ÁREA. `null` quando o grupo é pequeno demais --
     * mesmo piso da média da empresa (`MIN_GRUPO_SALARIO`), e aqui ele pesa
     * mais: uma área com um gestor só teria o salário dele publicado como
     * "média da liderança". Agregar não anonimiza, só disfarça.
     */
    avg_salary_leaders: number | null;
    avg_salary_non_leaders: number | null;
    /**
     * Quantas pessoas entraram em cada média.
     *
     * Existem para a visão COMBINADA poder ponderar. `mergeDepts` fazia
     * `a.avg || b.avg` -- pegava a média de uma marca e a apresentava como a
     * do conjunto. Nunca aparecia porque `dept_data` vinha vazio do banco;
     * assim que ela passou a ser gravada, passaria a aparecer.
     *
     * Média de médias sem peso é errada sempre que os grupos têm tamanhos
     * diferentes, e aqui têm: NSX tem 578 pessoas e a Flutter, 21.
     */
    n_leaders_salario: number;
    n_non_leaders_salario: number;
  }>;
  /**
   * As dimensões por área -- gênero, liderança, nível, tempo de casa,
   * demografia e raça. É o que permite o filtro de departamento recortar de
   * VERDADE em vez de rateio.
   *
   * Nunca foi produzido por esta carga. `applyDeptFilter` tem o caminho exato
   * escrito e esperando por ele desde sempre.
   */
  dept_breakdown: Record<string, DeptBreakdownPorArea>;
  /** Quantas das pessoas presentes no mês são gestoras. */
  leaders: number;
  leaders_pct: number | null;
  avg_salary_leaders: number | null;
  avg_salary_non_leaders: number | null;
  /** { 'SP': 120, 'PE': 380, ... } entre quem estava presente. */
  state_mix: Record<string, number>;
  /** Faixas de tempo de casa. */
  tenure_base: Record<string, number>;
  /**
   * Demográficos aninhados: `{ age, race }`.
   *
   * ------------------------------------------------------------------
   * A FORMA IMPORTA, E ESTAVA ERRADA
   * ------------------------------------------------------------------
   * Isto era um mapa PLANO de faixas etárias -- `{ '25-34': 313, ... }` --
   * enquanto a aba de Demográficos lê `dg.age` e `dg.race`. Com a forma
   * plana, as duas leituras davam `undefined`: o gráfico de idade E o de
   * cor/raça ficavam vazios, sem erro nenhum.
   *
   * Passou despercebido porque a série `reconstruido`, que gravava a forma
   * certa, era a que estava no ar. Quando o Convenia a substituiu, os dois
   * gráficos perderam o dado -- e a tela não tinha como dizer isso.
   */
  demographics: { age: Record<string, number>; race: Record<string, number> };
  gender_female: number;
  gender_male: number;
  /** `null` enquanto a cobertura de gênero for baixa demais para ser honesta. */
  gender_female_pct: number | null;
  leader_female: number;
  leader_female_pct: number | null;
  /** Quantas das pessoas presentes têm gênero conhecido. */
  genero_conhecido: number;
  /**
   * Representatividade por cor/raça entre quem estava presente no mês.
   *
   * `{ Branca: { total, female, leaders }, ... }` -- a forma que a tabela do
   * DEI espera. Ela já existia, escrita e completa, atrás de um
   * `hasRaceCross` que nunca foi verdadeiro: este campo saía `{}` em todas as
   * linhas porque ninguém o calculava, e a tela inteira não renderizava.
   *
   * Vem VAZIO quando a cobertura de raça do mês não sustenta percentual --
   * mesma regra do gênero. A tabela divide `total` pelo headcount do mês, e
   * com metade das pessoas sem raça conhecida "Branca: 20% do quadro" seria
   * lido como representatividade quando é desconhecimento.
   */
  race_cross: Record<string, { total: number; female: number; leaders: number }>;
  /** Quantas das pessoas presentes têm raça conhecida. */
  raca_conhecida: number;
}

/**
 * Cobertura mínima de gênero para publicar percentuais.
 *
 * O risco aqui não é o número faltar -- é ele existir e estar errado. Com 120
 * de 638 pessoas resolvidas, "38% de mulheres" seria 38% DAQUELAS 120, e a
 * ordem em que a API devolve as pessoas não é aleatória: é por cadastro, que
 * correlaciona com data de entrada, que correlaciona com área. Um recorte
 * enviesado apresentado como total.
 *
 * Abaixo do piso as CONTAGENS continuam sendo gravadas -- elas são fatos sobre
 * quem já foi resolvido -- mas o PERCENTUAL fica nulo, porque percentual sobre
 * amostra enviesada é afirmação sobre o todo.
 */
export const COBERTURA_MINIMA_GENERO = 0.9;

/** 'Mulher', 'Feminino', 'F' -> 'F'. Devolve null no que não reconhecer. */
export function normalizarGenero(v: string | null | undefined): 'F' | 'M' | null {
  if (!v) return null;
  const t = v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  if (t.startsWith('mulher') || t.startsWith('femin') || t === 'f') return 'F';
  if (t.startsWith('homem') || t.startsWith('masc') || t === 'm') return 'M';
  // Identidades fora do binário, ou rótulo novo: null em vez de forçar num
  // dos dois. Elas contam no headcount e ficam fora do recorte de gênero, que
  // é melhor que serem classificadas erradas para fechar uma conta.
  return null;
}

/**
 * ATRIBUTOS DE HOJE APLICADOS AO PASSADO
 * ---------------------------------------------------------------------------
 * Liderança, salário, estado e área vêm do cadastro ATUAL. Aplicá-los a meses
 * antigos assume que a pessoa sempre foi gestora, sempre ganhou o mesmo e
 * sempre esteve na mesma área -- o que é falso para quem foi promovido, mudou
 * de time ou recebeu aumento.
 *
 * O erro cresce quanto mais para trás se olha, e ele é sistemático numa
 * direção: infla o passado com a senioridade do presente.
 *
 * Não é evitável com o que a API entrega numa chamada -- o histórico salarial
 * e o de alterações de perfil existem, mas custam uma requisição por pessoa
 * cada. A alternativa honesta é registrar a limitação onde ela aparece, e é o
 * que este comentário faz.
 */

/** Gestor é quem aparece como supervisor de alguém. Derivado, não declarado. */
export function idsDeGestores(pessoas: PessoaConvenia[]): Set<string> {
  const s = new Set<string>();
  for (const p of pessoas) if (p.supervisorId) s.add(String(p.supervisorId));
  return s;
}

/** Faixas de tempo de casa, em meses completos até o mês de referência. */
export function faixaTempoDeCasa(entrada: string, mes: string): string {
  const [ay, am] = entrada.split('-').map(Number);
  const [by, bm] = mes.split('-').map(Number);
  const meses = (by - ay) * 12 + (bm - am);
  if (meses < 6) return '0-6 meses';
  if (meses < 12) return '6-12 meses';
  if (meses < 24) return '1-2 anos';
  if (meses < 48) return '2-4 anos';
  return '4+ anos';
}

/** Faixa etária no mês de referência. */
export function faixaEtaria(nascimento: string | null | undefined, mes: string): string | null {
  const nm = mesDe(nascimento);
  if (!nm) return null;
  const [ay, am] = nm.split('-').map(Number);
  const [by, bm] = mes.split('-').map(Number);
  const anos = Math.floor(((by - ay) * 12 + (bm - am)) / 12);
  if (anos < 18 || anos > 90) return null; // data implausível: fora em vez de errada
  // '<25', e nao '18-24'. O rotulo tem de bater com AGE_ORDER na tela e com a
  // serie `reconstruido` que ficou no banco para o card de comparacao -- senao
  // a MESMA faixa aparece como duas categorias diferentes ao comparar as
  // series, e o grafico ordena a nova antes de todas as outras.
  if (anos < 25) return '<25';
  if (anos < 35) return '25-34';
  if (anos < 45) return '35-44';
  if (anos < 55) return '45-54';
  return '55+';
}

/**
 * Mínimo de pessoas para publicar uma média salarial.
 *
 * Descoberto por um teste que eu tinha escrito para outra coisa: ele afirmava
 * que nenhum valor individual sobrevive à agregação, e passou a falhar quando
 * o salário virou média. Com UMA pessoa no grupo, a média é o salário dela --
 * agregar não anonimiza, só disfarça.
 *
 * Cinco é o mesmo piso que a pesquisa de engajamento já usa. Manter o número
 * igual importa: dois limiares diferentes no mesmo painel viram uma discussão
 * sobre qual está certo, em vez de uma regra que todo mundo conhece.
 */
export const MIN_GRUPO_SALARIO = 5;

const media = (v: number[]) =>
  v.length >= MIN_GRUPO_SALARIO
    ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100
    : null;

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
 * Classifica a saída em VOLUNTÁRIA, INVOLUNTÁRIA ou OUTRA.
 *
 * ===========================================================================
 * ESCRITO CONTRA OS RÓTULOS REAIS, DEPOIS DE ERRAR COM OS IMAGINADOS
 * ===========================================================================
 * A primeira versão procurava "pedido de demissão" e "pedido do colaborador".
 * O Convenia escreve **"Pedido do Empregado"**. Nenhum dos dois casava, e o
 * resultado foi 164 saídas classificadas e ZERO voluntárias -- número que
 * apareceria no painel como um achado extraordinário em vez de um bug.
 *
 * Os rótulos abaixo saíram de uma consulta à base real, não da documentação:
 *
 *   77  Demissão SEM justa causa fora do contrato - Pedido da Empresa
 *   39  Demissão fora do contrato de experiência - Pedido do Empregado
 *   20  Outros
 *   10  Antecipado pelo empregador (tempo determinado)
 *    4  Rescisão contratual por acordo entre as partes
 *    4  Antecipado pelo empregado (tempo determinado)
 *    3  Quebra de Contrato de Experiência - Pedido do Empregado
 *    2  Término do contrato de trabalho por tempo determinado
 *    2  Quebra de Contrato de Experiência - Pedido da Empresa
 *    1  Demissão COM justa causa - Pedido da Empresa
 *    1  Término de Contrato de Experiência - Pedido da Empresa
 *    1  Suspensão de contrato
 *
 * ===========================================================================
 * POR QUE TRÊS CATEGORIAS, E NÃO DUAS
 * ===========================================================================
 * "Rescisão por acordo entre as partes" e "Término de contrato por tempo
 * determinado" não são nem uma coisa nem outra. Num booleano `voluntary` elas
 * caem em involuntária por omissão, e inflam o número que a diretoria lê como
 * "demissões feitas pela empresa".
 *
 * "Outros" -- 20 casos, 12% do total -- é ausência de informação, não uma
 * categoria. Tratá-lo como involuntária seria inventar; como voluntária,
 * pior ainda.
 *
 * A atrição ligada a engajamento usa SÓ a voluntária: demissão pela empresa
 * fala da decisão da empresa, não da experiência de quem ficou. Misturar as
 * duas faria uma reestruturação parecer crise de retenção.
 */
export type TipoSaida = 'voluntaria' | 'involuntaria' | 'outra';

export function classificarSaida(tipo: string | null | undefined): TipoSaida {
  if (!tipo) return 'outra';
  const t = tipo.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  // ORDEM CRÍTICA: "pelo empregador" CONTÉM "pelo empregado".
  //
  // Um teste com os doze rótulos reais pegou isto: "Antecipado pelo
  // empregador" caía em voluntária, porque a checagem de voluntária rodava
  // primeiro e o fragmento mais curto casava dentro do mais longo. Duas
  // letras de diferença invertiam quem tomou a decisão de desligar.
  //
  // Por isso o EMPREGADOR é testado antes -- o caso mais específico primeiro,
  // sempre, quando um termo é prefixo do outro.
  if (t.includes('pelo empregador') || t.includes('pedido da empresa')
      || t.includes('justa causa')) {
    return 'involuntaria';
  }
  if (t.includes('pedido do empregado') || t.includes('pedido do colaborador')
      || t.includes('pelo empregado') || t.includes('pedido de demissao')) {
    return 'voluntaria';
  }
  // Acordo, fim de contrato, suspensão, "Outros": nem uma nem outra.
  return 'outra';
}

/** Compatibilidade: a atrição ligada a engajamento só conta voluntária. */
export function ehVoluntaria(tipo: string | null | undefined): boolean {
  return classificarSaida(tipo) === 'voluntaria';
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

  // Gestores derivados de quem aparece como supervisor de alguém. Note que a
  // fonte são TODAS as pessoas, inclusive as que já saíram: quem era gestor de
  // alguém continua tendo sido gestor no passado.
  const gestores = idsDeGestores(pessoas);

  const linhas: LinhaMensal[] = [];

  for (const mes of mesesEntre(primeiroMes, ateMes)) {
    const dept: LinhaMensal['dept_data'] = {};
    const bump = (area: string, campo: 'hc' | 'joiners' | 'leavers') => {
      dept[area] ??= {
        hc: 0, joiners: 0, leavers: 0,
        avg_salary_leaders: null, avg_salary_non_leaders: null,
        n_leaders_salario: 0, n_non_leaders_salario: 0,
      };
      dept[area][campo]++;
    };
    // Salários por área, guardados crus e mediados no fim -- a média só sai
    // quando o grupo passa do piso, e isso não dá para decidir no meio do laço.
    const salPorArea: Record<string, { lideres: number[]; demais: number[] }> = {};

    // As MESMAS contas da linha, por área. É o que faz o filtro de
    // departamento recortar gênero e liderança de verdade.
    const porArea: Record<string, DeptBreakdownPorArea> = {};
    const areaDe_ = (a: string): DeptBreakdownPorArea => (porArea[a] ??= {
      gender_female: 0, gender_male: 0, leaders: 0, leader_female: 0,
      level_base: {}, tenure_base: {},
      demographics: { age: {}, race: {}, marital: {}, origin: {} },
      race_cross: {},
    });

    let headcount = 0, joiners = 0, leavers = 0, leaders = 0;
    let gF = 0, gM = 0, lidF = 0, generoConhecido = 0, racaConhecida = 0;
    const porRaca: Record<string, { total: number; female: number; leaders: number }> = {};
    const salLideres: number[] = [];
    const salDemais: number[] = [];
    const state_mix: Record<string, number> = {};
    const tenure_base: Record<string, number> = {};
    const porIdade: Record<string, number> = {};
    const porRacaDemo: Record<string, number> = {};

    for (const x of comMes) {
      // Presente no mês: entrou até o fim dele e não tinha saído ainda.
      // A comparação de strings "YYYY-MM" funciona porque o formato é
      // lexicograficamente ordenável -- é o motivo de guardar assim.
      const presente = x.entrada != null && x.entrada <= mes && (x.saida == null || x.saida > mes);

      if (presente) {
        headcount++;
        bump(x.area, 'hc');
        // A MESMA pessoa entra na conta da empresa e na da área dela. Duas
        // linhas por conta, e não uma segunda passada: separar as duas somas
        // é como elas divergem.
        const A = areaDe_(x.area);

        const ehGestor = gestores.has(x.p.id);
        if (ehGestor) { leaders++; A.leaders++; }

        if (x.p.genero) {
          generoConhecido++;
          if (x.p.genero === 'F') {
            gF++; A.gender_female++;
            if (ehGestor) { lidF++; A.leader_female++; }
          } else { gM++; A.gender_male++; }
        }

        const raca = (x.p.raca ?? '').trim();
        if (raca) {
          racaConhecida++;
          porRaca[raca] ??= { total: 0, female: 0, leaders: 0 };
          porRaca[raca].total++;
          if (x.p.genero === 'F') porRaca[raca].female++;
          if (ehGestor) porRaca[raca].leaders++;

          const rc = (A.race_cross[raca] ??= { total: 0, female: 0, leaders: 0, female_leaders: 0 });
          rc.total++;
          if (x.p.genero === 'F') { rc.female++; if (ehGestor) rc.female_leaders++; }
          if (ehGestor) rc.leaders++;
        }

        if (typeof x.p.salary === 'number' && x.p.salary > 0) {
          (ehGestor ? salLideres : salDemais).push(x.p.salary);
          const sa = (salPorArea[x.area] ??= { lideres: [], demais: [] });
          (ehGestor ? sa.lideres : sa.demais).push(x.p.salary);
        }

        const uf = x.p.uf?.trim();
        if (uf) state_mix[uf] = (state_mix[uf] ?? 0) + 1;

        const faixa = faixaTempoDeCasa(x.entrada!, mes);
        tenure_base[faixa] = (tenure_base[faixa] ?? 0) + 1;
        A.tenure_base[faixa] = (A.tenure_base[faixa] ?? 0) + 1;

        const idade = faixaEtaria(x.p.birth_date, mes);
        if (idade) {
          porIdade[idade] = (porIdade[idade] ?? 0) + 1;
          A.demographics.age[idade] = (A.demographics.age[idade] ?? 0) + 1;
        }

        // A MESMA raça que alimenta `race_cross`, aqui só contada.
        // `race_cross` tem regra de cobertura porque cruza com gênero e
        // liderança; esta é a distribuição simples, que a aba de Demográficos
        // já sabe rotular como "Não informado" quando falta.
        const racaDemo = (x.p.raca ?? '').trim();
        if (racaDemo) {
          porRacaDemo[racaDemo] = (porRacaDemo[racaDemo] ?? 0) + 1;
          A.demographics.race[racaDemo] = (A.demographics.race[racaDemo] ?? 0) + 1;
        }
      }

      if (x.entrada === mes) { joiners++; bump(x.area, 'joiners'); }
      if (x.saida === mes) { leavers++; bump(x.area, 'leavers'); }
    }

    // Denominador: headcount do fim do mês mais quem saiu nele -- ou seja, o
    // conjunto de pessoas expostas ao risco de sair naquele mês. Usar só o
    // headcount final subestimaria a taxa, porque quem saiu já não está lá.
    // As médias por área, agora que os grupos estão fechados.
    for (const [area, sal] of Object.entries(salPorArea)) {
      const d = dept[area];
      if (!d) continue;
      d.avg_salary_leaders = media(sal.lideres);
      d.avg_salary_non_leaders = media(sal.demais);
      // O n vai junto mesmo quando a média foi suprimida: ele é o que permite
      // ponderar na visão combinada, e não revela salário de ninguém.
      d.n_leaders_salario = sal.lideres.length;
      d.n_non_leaders_salario = sal.demais.length;
    }

    const expostos = headcount + leavers;
    linhas.push({
      month: `${mes}-01`,
      brand: marca,
      headcount, joiners, leavers,
      attrition_rate: expostos > 0 ? Math.round((leavers / expostos) * 1000) / 10 : null,
      dept_data: dept,
      dept_breakdown: porArea,
      leaders,
      leaders_pct: headcount > 0 ? Math.round((leaders / headcount) * 1000) / 10 : null,
      avg_salary_leaders: media(salLideres),
      avg_salary_non_leaders: media(salDemais),
      state_mix,
      tenure_base,
      demographics: { age: porIdade, race: porRacaDemo },
      gender_female: gF,
      gender_male: gM,
      // Percentual só quando a cobertura sustenta. Ver COBERTURA_MINIMA_GENERO.
      gender_female_pct: headcount > 0 && generoConhecido / headcount >= COBERTURA_MINIMA_GENERO
        ? Math.round((gF / generoConhecido) * 1000) / 10
        : null,
      leader_female: lidF,
      leader_female_pct: leaders > 0 && generoConhecido / headcount >= COBERTURA_MINIMA_GENERO
        ? Math.round((lidF / leaders) * 1000) / 10
        : null,
      genero_conhecido: generoConhecido,
      raca_conhecida: racaConhecida,
      // Mesma régua do gênero, e pelo mesmo motivo: a tabela do DEI divide
      // pelo headcount do mês, então cobertura parcial vira subnotificação
      // apresentada como representatividade. Vazio esconde a tabela inteira,
      // que é o comportamento certo -- ela some em vez de mentir.
      race_cross: headcount > 0 && racaConhecida / headcount >= COBERTURA_MINIMA_GENERO
        ? porRaca
        : {},
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

/**
 * Texto que veio da API do Convenia, ou null. Achata `{name}` e trata
 * "Não informado" como ausência.
 *
 * ===========================================================================
 * O ACHATAMENTO NÃO É DETALHE
 * ===========================================================================
 * `team` e `relationship` chegam como objeto, igual a `department` -- e a
 * primeira versão disto devolvia null para objeto. Resultado: as duas colunas
 * ficaram em 0 de 809 depois de uma carga inteira, enquanto `registration`,
 * `salary` e `birth_date`, que são string, preencheram normalmente. Uma
 * gravou, a outra não, pelo tipo do campo -- e nada no resumo dizia isso.
 *
 * O que escondeu o erro foi a sonda de campos: ela achata `{name}` para
 * exibir. A tela mostrava "team · 8/8 · Customer Support Betnacional" e a
 * carga gravava nulo. A sonda dizia a verdade sobre o Convenia e mentia sobre
 * a carga -- que é o pior tipo de instrumento, porque parece confirmação.
 *
 * "Não informado" é o texto que o Convenia escreve no lugar da célula vazia.
 * Medido no export: `Career Band` parecia ter 63% de cobertura, e os 37%
 * restantes não divergiam, estavam com esse texto ocupando o lugar do branco.
 * Guardar a string faria disso uma categoria em todo agrupamento.
 */
export function textoDe(v: unknown): string | null {
  if (typeof v === 'number') return String(v);
  if (v && typeof v === 'object') {
    const o = v as { name?: unknown; title?: unknown };
    return textoDe(o.name ?? o.title);
  }
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  const k = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return k === 'nao informado' || k === 'n/a' ? null : s;
}

/** O estado do endereço, que vem aninhado e às vezes ausente. */
export function ufDe(v: unknown): string | null {
  const end = v as { state?: unknown } | null;
  return textoDe(end?.state);
}
