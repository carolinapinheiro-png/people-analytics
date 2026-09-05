import {
  COLUNAS_TALENT, JA_TEMOS, degrau, blocosDe30Dias, tempoDeCasaTexto,
  workerType, valorOuVazio, ultimoValorConhecido,
} from './talent-mobility';

/**
 * Monta as 51 colunas do Talent Mobility Data Model.
 *
 * ===========================================================================
 * FUNÇÃO PURA, E ISSO É O PONTO
 * ===========================================================================
 * Recebe o que já foi lido do banco e devolve as linhas. Sem Supabase, sem
 * Convenia, sem data de hoje escondida dentro -- o mês de referência entra
 * como parâmetro.
 *
 * O mapa das colunas foi medido cruzando as 654 pessoas de julho com o export
 * do Convenia, coluna por coluna. Doze bateram em 100%. As decisões que
 * saíram daquela medição estão todas testadas em `talent-mobility.test.ts`:
 * blocos de 30 dias no Length of Service, tradução do vínculo, "Não
 * informado" como ausência, a escada de hierarquia lendo `team`.
 */
export interface PessoaTalent {
  id: string;
  nome: string | null;
  email: string | null;
  supervisorId: string | null;
  department: string | null;
  job_title: string | null;
  team: string | null;
  cost_center: string | null;
  empresa: string | null;
  escritorio: string | null;
  status: string | null;
  hiring_date: string | null;
  registration: string | null;
  social_name: string | null;
  relationship: string | null;
  uf: string | null;
  salary: number | null;
  birth_date: string | null;
  /** `custom_fields` como a carga guardou: lista de {nome, valor}. */
  personalizados: { nome: string; valor: string }[];
  /**
   * Os mesmos campos nas fotos dos meses anteriores, do mais recente para o
   * mais antigo. Alimenta o carry-forward -- ver `ultimoValorConhecido`.
   */
  personalizadosAnteriores?: { nome: string; valor: string }[][];
}

export interface SaidaTalent {
  /** Data inteira, para as colunas que pedem dia. Pode faltar. */
  data: string | null;
  /** Mês do desligamento. É ele que decide se a pessoa entra no arquivo. */
  mes: string | null;
  tipo: string | null;
}

/** Onde cada coluna escolhida busca o valor. Vem de `talent_mobility_mapa`. */
export type MapaEscolhido = Map<string, { campo: string; origem: string }>;

/**
 * O `Employee Type` no vocabulário do arquivo entregue.
 *
 * O cadastro devolve `Ativo` e `Em férias`; julho traz `ativo`, `admissão` e
 * `desligado`, minúsculo, e não tem nenhuma linha de férias entre as 654 --
 * quem está de férias aparece como ativo, o que faz sentido: férias não é um
 * tipo de vínculo, é um estado dentro dele.
 *
 * Desligado ganha o rótulo próprio. Sem isso as 10 pessoas que saíram em agosto
 * saíam com a coluna VAZIA, porque o cadastro já não guarda status para quem
 * não está mais lá -- e vazio ali se lê como "não sei", quando na verdade se
 * sabe muito bem.
 */
export function employeeType(status: string | null, temSaida: boolean): string {
  if (temSaida) return 'desligado';
  const s = (status ?? '').trim().toLowerCase();
  if (!s) return '';
  if (s.startsWith('em férias') || s.startsWith('em ferias')) return 'ativo';
  return s;
}

/** dd/mm/aaaa, que é como o arquivo entregue escreve data. */
export function dataBR(iso: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec((iso ?? '').trim());
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/**
 * O valor de uma coluna ESCOLHIDA, buscado onde o mapa mandou.
 *
 * As oito escolhidas apontam para três lugares diferentes: coluna da tabela
 * (`social_name`, `birth_date`, `salary`, `relationship`) ou campo
 * personalizado (`Job Type Family`, `Level`, `Career Band`, `Força de
 * Trabalho`). Quem sabe qual é qual é a linha gravada em
 * `talent_mobility_mapa`, não este código.
 *
 * Coluna sem escolha gravada sai VAZIA. Não há palpite aqui: o palpite mora na
 * tela de mapeamento, onde alguém olha antes de aceitar.
 */
/**
 * O valor de um campo personalizado, caindo para as fotos anteriores quando o
 * de hoje está vazio.
 *
 * É o carry-forward que a nota de agosto descreve como feito na mão: "vieram
 * em branco para 120 colegas e foram puxadas do último mês em que cada colega
 * teve valor".
 */
function personalizadoComHistorico(p: PessoaTalent, nome: string): string {
  const hoje = p.personalizados.find((c) => c.nome === nome)?.valor ?? null;
  const antes = (p.personalizadosAnteriores ?? [])
    .map((fs) => fs.find((c) => c.nome === nome)?.valor ?? null);
  return ultimoValorConhecido(hoje, antes).valor;
}

function escolhido(p: PessoaTalent, mapa: MapaEscolhido, coluna: string): string {
  const e = mapa.get(coluna);
  if (!e) return '';
  if (e.origem === 'personalizado') return personalizadoComHistorico(p, e.campo);
  const direto = (p as unknown as Record<string, unknown>)[e.campo];
  if (direto == null) return '';
  return valorOuVazio(typeof direto === 'number' ? String(direto) : String(direto));
}

export function montarLinhasTalent(
  pessoas: readonly PessoaTalent[],
  mapa: MapaEscolhido,
  saidas: ReadonlyMap<string, SaidaTalent>,
  /** Último dia do mês pedido, ISO. Length of Service conta até aqui. */
  refISO: string,
): string[][] {
  const chefeDe = new Map<string, string | null>(pessoas.map((p) => [p.id, p.supervisorId]));
  const porId = new Map(pessoas.map((p) => [p.id, p]));
  const teamDe = (id: string) => porId.get(id)?.team ?? null;
  const ccDe = (id: string) => porId.get(id)?.cost_center ?? null;

  return pessoas.map((p) => {
    const saida = saidas.get(p.id);
    const gestor = p.supervisorId ? porId.get(p.supervisorId) : undefined;
    const acima = (n: number) => {
      const c: string[] = [];
      let atual: string | undefined = p.id;
      const visto = new Set([p.id]);
      while (c.length < n && atual) {
        const chefe: string | null = chefeDe.get(atual) ?? null;
        if (!chefe || visto.has(chefe)) break;
        visto.add(chefe); c.push(chefe); atual = chefe;
      }
      return c.length < n ? undefined : porId.get(c[n - 1]);
    };

    const valor: Record<string, string> = {
      'Employee ID': p.registration ?? '',
      'Full Legal Name': p.nome ?? '',
      "Worker's Manager": gestor?.nome ?? '',
      'Manager - Level 02': acima(2)?.nome ?? '',
      'Manager - Level 03': acima(3)?.nome ?? '',
      'Worker Type': workerType(escolhido(p, mapa, 'Worker Type') || p.relationship),
      'Supervisory Organization': p.team ?? '',
      'Job Title': p.job_title ?? '',
      'Job Family Group': p.department ?? '',
      'Email - Primary Work': p.email ?? '',
      'Original Hire Date': dataBR(p.hiring_date),
      'Employee Type': employeeType(p.status, Boolean(saida?.mes)),
      // A data de nascimento vem do MAPA, e o mapa devolve o valor cru. Sem
      // isto ela saía como 1992-02-21 na mesma linha em que a admissão saía
      // como 07/07/2025 -- duas datas, dois formatos, no mesmo arquivo.
      'Date of Birth': dataBR(escolhido(p, mapa, 'Date of Birth') || p.birth_date),
      'End Employment Date': dataBR(saida?.data ?? null),
      'Length of Service': String(blocosDe30Dias(p.hiring_date, refISO) ?? ''),
      'Continuous Service Date': tempoDeCasaTexto(p.hiring_date, refISO),
      'Is Manager': personalizadoComHistorico(p, 'Liderança ?'),
      'Location': p.escritorio ?? '',
      'Work Address - Country': p.uf ?? '',
      'Company': p.empresa ?? '',
      'Cost Center': p.cost_center ?? '',
      'Line Manager Email': gestor?.email ?? '',
      'Compensation Grade Profile': personalizadoComHistorico(p, 'WorkDay Level'),
      'Leaver Date (exit the organisation)': dataBR(saida?.data ?? null),
      'Leaver Reason': saida?.tipo ?? '',
    };

    // As duas escadas: mesma subida, atributos diferentes, contagens que
    // começam em lugares diferentes. Supervisory Org 2 é a própria pessoa;
    // Cost Centre Hierarchy 1 também. Conferido contra o arquivo de agosto.
    for (let n = 2; n <= 8; n++) {
      valor[`Supervisory Org Level ${n}`] = degrau(p.id, n - 2, chefeDe, teamDe);
    }
    const CC = ['Cost centre Hierarchy Level 1', 'Cost centre Hierarchy Level 2',
      'Cost centre Hierarchy Level 3', 'Cost Centre Hierarchy Level 4',
      'Cost Centre Hierarchy Level 5'];
    CC.forEach((nome, i) => { valor[nome] = degrau(p.id, i, chefeDe, ccDe); });

    return COLUNAS_TALENT.map((coluna) => {
      // Colunas vazias por CONVENÇÃO -- Currency, Cost Center - ID, Hire Date,
      // On Leave, Leave Type, as duas de horas semanais e On Secondment estão
      // vazias nas 654 linhas de julho e nas 641 de agosto. Não é dado
      // faltando: é assim que o report é entregue.
      if (JA_TEMOS[coluna]?.startsWith('(vazia')) return '';
      if (valor[coluna] != null) return valor[coluna];
      return escolhido(p, mapa, coluna);
    });
  });
}

/** Quantas linhas ficaram sem valor em cada coluna. Vazio é visível. */
export function vaziosPorColuna(linhas: readonly string[][]): { coluna: string; vazios: number }[] {
  return COLUNAS_TALENT.map((coluna, i) => ({
    coluna,
    vazios: linhas.filter((l) => !l[i]).length,
  })).filter((c) => c.vazios > 0);
}
