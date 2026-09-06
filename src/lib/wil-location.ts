/**
 * A aba "Template - Location" do report do WIL/GPA.
 *
 * ===========================================================================
 * FUNÇÃO PURA: RECEBE PESSOAS, DEVOLVE AS LINHAS
 * ===========================================================================
 * Dez famílias de cargo em dois blocos -- Regular e Contractor -- e dezesseis
 * colunas por linha, mais os subtotais. Sem banco e sem API: o mês de
 * referência entra como parâmetro, e é ele que define "este mês" e a janela de
 * doze meses.
 *
 * Conferido contra o arquivo de setembro de 2026, que fecha agosto: headcount
 * 611, desligados em 12 meses 103, voluntários 40. A estrutura da conta bate;
 * a diferença que sobra são as 64 pessoas ativas sem `Job Type Family`, que é
 * a mesma população do carry-forward.
 */

/** As dez famílias do template, na ordem em que ele as espera. */
export const FAMILIAS_WIL = [
  'Commercial & Marketing', 'Customer Operations', 'Data & Analytics', 'Finance',
  'HR', 'Leadership (Executive)', 'Legal', 'Other', 'Product & Technology',
  'Risk and Trading',
] as const;

/**
 * O cadastro escreve o nome por extenso; o template quer o nome curto.
 *
 * `Leadership (Executive) SR and C-Levels (reporting to CEO or N-3)` e
 * `Other (Property, Security, Cleaning)` são os dois casos reais. Casar por
 * prefixo resolveria os dois hoje e quebraria no dia em que aparecer
 * "Other Services" -- então é de-para explícito, como o das marcas.
 */
const DE_PARA: Record<string, string> = {
  'leadership (executive) sr and c-levels (reporting to ceo or n-3)': 'Leadership (Executive)',
  'other (property, security, cleaning)': 'Other',
};

/** Família do template, ou null quando o valor não é reconhecido. */
export function familiaWIL(valor: string | null | undefined): string | null {
  const v = (valor ?? '').trim();
  if (!v) return null;
  const k = v.toLowerCase();
  if (DE_PARA[k]) return DE_PARA[k];
  const exata = FAMILIAS_WIL.find((f) => f.toLowerCase() === k);
  return exata ?? null;
}

export interface PessoaWIL {
  familia: string | null;
  /** 'CLT' ou 'PJ', já traduzido do vínculo. Ver `workerType`. */
  tipo: string;
  /** 'F', 'M' ou null. Percentual sobre gênero desconhecido não é afirmação. */
  genero: string | null;
  /** `Força de Trabalho`: 1 para integral, 0,9 etc. Null quando não informado. */
  fte: number | null;
  admissao: string | null;
  /** Mês do desligamento, `AAAA-MM`. Null para quem está ativo. */
  saida: string | null;
  voluntaria: boolean | null;
}

export interface LinhaWIL {
  familia: string;
  tipo: 'Regular' | 'Contractor';
  headcount: number;
  mulheres: number;
  fte: number;
  mediaHeadcount12m: number;
  saidas12m: number;
  saidasMulheres12m: number;
  saidasVoluntarias12m: number;
  saidasVoluntariasMulheres12m: number;
  entradas12m: number;
  entradasMulheres12m: number;
  saidasNoMes: number;
  entradasNoMes: number;
}

const mes = (iso: string | null | undefined) =>
  /^(\d{4}-\d{2})/.exec((iso ?? '').trim())?.[1] ?? null;

/** Os doze meses que terminam em `ate`, inclusive. */
export function janela12(ate: string): string[] {
  const [a, m] = ate.split('-').map(Number);
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(a, m - 1 - (11 - i), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

/** Estava dentro no fim deste mês? */
const dentroEm = (p: PessoaWIL, m: string) => {
  const adm = mes(p.admissao);
  if (adm && adm > m) return false;
  if (p.saida && p.saida < m) return false;
  return true;
};

/**
 * As vinte linhas do template: dez famílias, dois blocos.
 *
 * Família sempre aparece, mesmo zerada -- o template tem `Risk and Trading`
 * com zeros no arquivo entregue, e linha faltando desalinha a colagem.
 *
 * Quem está sem `Job Type Family` fica FORA, e o chamador conta quantos. Somar
 * essas pessoas numa família qualquer distribuiria gente real na caixa errada;
 * jogá-las em "Other" seria pior ainda, porque "Other" é uma família de
 * verdade, com quinze pessoas.
 */
export function montarLocation(
  pessoas: readonly PessoaWIL[],
  /** Mês de referência, `AAAA-MM`. */
  ref: string,
): LinhaWIL[] {
  const meses = janela12(ref);
  const linhas: LinhaWIL[] = [];

  for (const tipo of ['Regular', 'Contractor'] as const) {
    const doTipo = pessoas.filter((p) => (tipo === 'Regular' ? p.tipo === 'CLT' : p.tipo === 'PJ'));
    for (const familia of FAMILIAS_WIL) {
      const g = doTipo.filter((p) => p.familia === familia);
      const dentro = g.filter((p) => dentroEm(p, ref));
      const saiu12 = g.filter((p) => p.saida && meses.includes(p.saida));
      const entrou12 = g.filter((p) => {
        const a = mes(p.admissao);
        return a != null && meses.includes(a);
      });

      linhas.push({
        familia,
        tipo,
        headcount: dentro.length,
        mulheres: dentro.filter((p) => p.genero === 'F').length,
        // Soma dos FTE de quem tem o campo. Quem não tem conta como 1: o
        // template diz que jornada integral pode ficar em branco, então
        // ausência do campo significa integral, e não zero.
        fte: Math.round(dentro.reduce((s, p) => s + (p.fte ?? 1), 0) * 10) / 10,
        // Média do headcount nos doze meses, arredondada -- é como o arquivo
        // entregue traz (296, 229).
        mediaHeadcount12m: Math.round(
          meses.reduce((s, m) => s + g.filter((p) => dentroEm(p, m)).length, 0) / 12,
        ),
        saidas12m: saiu12.length,
        saidasMulheres12m: saiu12.filter((p) => p.genero === 'F').length,
        saidasVoluntarias12m: saiu12.filter((p) => p.voluntaria === true).length,
        saidasVoluntariasMulheres12m:
          saiu12.filter((p) => p.voluntaria === true && p.genero === 'F').length,
        entradas12m: entrou12.length,
        entradasMulheres12m: entrou12.filter((p) => p.genero === 'F').length,
        saidasNoMes: g.filter((p) => p.saida === ref).length,
        entradasNoMes: g.filter((p) => mes(p.admissao) === ref).length,
      });
    }
  }
  return linhas;
}

/** Quem ficou de fora por não ter família reconhecida. */
export function semFamilia(pessoas: readonly PessoaWIL[]): number {
  return pessoas.filter((p) => !p.familia).length;
}
