import {
  COLUNAS_TALENT, JA_TEMOS, degrau, blocosDe30Dias, tempoDeCasaTexto,
  workerType, valorOuVazio,
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
}

export interface SaidaTalent {
  data: string | null;
  tipo: string | null;
}

/** Onde cada coluna escolhida busca o valor. Vem de `talent_mobility_mapa`. */
export type MapaEscolhido = Map<string, { campo: string; origem: string }>;

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
function escolhido(p: PessoaTalent, mapa: MapaEscolhido, coluna: string): string {
  const e = mapa.get(coluna);
  if (!e) return '';
  if (e.origem === 'personalizado') {
    const c = p.personalizados.find((x) => x.nome === e.campo);
    return valorOuVazio(c?.valor ?? null);
  }
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
      'Employee Type': p.status ?? '',
      'End Employment Date': dataBR(saida?.data ?? null),
      'Length of Service': String(blocosDe30Dias(p.hiring_date, refISO) ?? ''),
      'Continuous Service Date': tempoDeCasaTexto(p.hiring_date, refISO),
      'Is Manager': p.personalizados.find((c) => c.nome === 'Liderança ?')?.valor ?? '',
      'Location': p.escritorio ?? '',
      'Work Address - Country': p.uf ?? '',
      'Company': p.empresa ?? '',
      'Cost Center': p.cost_center ?? '',
      'Line Manager Email': gestor?.email ?? '',
      'Compensation Grade Profile': p.personalizados.find((c) => c.nome === 'WorkDay Level')?.valor ?? '',
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
