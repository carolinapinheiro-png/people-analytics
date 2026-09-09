/**
 * Qual banda salarial se aplica a uma pessoa.
 *
 * ===========================================================================
 * POR QUE ESTA FUNÇÃO EXISTE
 * ===========================================================================
 * O comp-ratio é `salário ÷ ponto médio da banda`. O Convenia dá o salário de
 * 648 dos 649 ativos; a banda vem de `salary_bands`, que é a única tabela de
 * POLÍTICA que sobra -- decisão da Carolina, 09/09, depois de a alternativa
 * (derivar o ponto médio da mediana dos pares) ser medida e descartada: uma
 * régua tirada da própria coisa que ela mede dá 1,00 para um time inteiro mal
 * pago, e 20 dos 71 grupos têm uma pessoa só.
 *
 * `salary_bands` é chaveada por (job_family, contract, level) com CINCO
 * famílias legadas. O Convenia tem DEZ. Esta função é o de-para, e ele mora
 * aqui, em função pura com teste, em vez de espalhado na carga.
 *
 * ===========================================================================
 * O QUE FOI DECIDIDO, E POR QUEM
 * ===========================================================================
 * Oito famílias são diretas. Duas exigiram decisão da Carolina (09/09):
 *
 *   Commercial & Marketing   uma família no Convenia, duas bandas. Separa pelo
 *                            DEPARTAMENTO: COMMERCIAL -> COMMERCIAL,
 *                            MARKETING -> MARKETING/COM.
 *
 *                            O custo está registrado: é usar um campo para uma
 *                            coisa que ele não é. Quem mudar de departamento
 *                            sem mudar de família muda de banda, e nada na tela
 *                            vai dizer por quê.
 *
 *   Leadership (Executive)   não é família, é o topo de cada uma. Usa a banda
 *                            da ÁREA da pessoa, e o level já diferencia.
 *
 * ===========================================================================
 * O ÚNICO PALPITE QUE SOBROU
 * ===========================================================================
 * `Risk and Trading` -> COMMERCIAL. Uma pessoa, e ninguém confirmou. Está aqui
 * em vez de escondido: se estiver errado, é um comp-ratio errado, e um só.
 */

export type FamiliaDeBanda =
  | 'TECH' | 'COMMERCIAL' | 'MARKETING/COM' | 'CUSTOMER SERVICE' | 'CORPORATE';

/** Departamento do Convenia -> banda. Usado por Leadership e por quem não tem família. */
const POR_DEPARTAMENTO: Record<string, FamiliaDeBanda> = {
  TECHNOLOGY: 'TECH',
  PRODUCT: 'TECH',
  OPERATION: 'CUSTOMER SERVICE',
  COMMERCIAL: 'COMMERCIAL',
  MARKETING: 'MARKETING/COM',
  FINANCE: 'CORPORATE',
  HR: 'CORPORATE',
  'LEGAL & COMPLIANCE': 'CORPORATE',
};

/** Job Type Family do Convenia -> banda, quando não depende de mais nada. */
const POR_FAMILIA: Record<string, FamiliaDeBanda> = {
  'Customer Operations': 'CUSTOMER SERVICE',
  'Product & Technology': 'TECH',
  'Data & Analytics': 'TECH',
  Finance: 'CORPORATE',
  HR: 'CORPORATE',
  Legal: 'CORPORATE',
  'Other (Property, Security, Cleaning)': 'CORPORATE',
  'Risk and Trading': 'COMMERCIAL',
};

const LIDERANCA = 'Leadership (Executive) SR and C-Levels (reporting to CEO or N-3)';

export interface PessoaParaBanda {
  jobTypeFamily?: string | null;
  department?: string | null;
  /** Vínculo do Convenia: "CLT", "Pessoa Jurídica", "Aprendiz"... */
  vinculo?: string | null;
  /** "L0".."L9". */
  level?: string | null;
}

export interface BandaDaPessoa {
  familia: FamiliaDeBanda | null;
  contrato: 'CLT' | 'PJ' | null;
  level: string | null;
  /**
   * Por que não deu, quando não deu. A tela mostra ISTO em vez de omitir a
   * pessoa -- "sem banda" e "sem salário" são coisas diferentes, e a segunda
   * já apareceu como a primeira neste painel.
   */
  motivo: string | null;
}

/**
 * `salary_bands.contract` só tem CLT e PJ. Aprendiz, Diretor Estatutário,
 * Associado, Sócio e Contrato Intermitente não têm banda POR CONSTRUÇÃO --
 * não é dado faltando, é faixa que nunca foi definida para esses vínculos.
 */
function contratoDeBanda(vinculo: string | null | undefined): 'CLT' | 'PJ' | null {
  const v = (vinculo ?? '').trim();
  if (v === 'CLT') return 'CLT';
  if (v === 'Pessoa Jurídica' || v === 'PJ') return 'PJ';
  return null;
}

export function bandaDaPessoa(p: PessoaParaBanda): BandaDaPessoa {
  const dep = (p.department ?? '').trim().toUpperCase();
  const fam = (p.jobTypeFamily ?? '').trim();
  const level = (p.level ?? '').trim() || null;
  const contrato = contratoDeBanda(p.vinculo);

  const vazio = (motivo: string): BandaDaPessoa =>
    ({ familia: null, contrato, level, motivo });

  if (!contrato) {
    return vazio(`Vínculo "${p.vinculo ?? '—'}" não tem banda definida: as faixas existem só para CLT e PJ.`);
  }
  if (!level) return vazio('Sem level no Convenia — sem ele não há linha de banda.');

  let familia: FamiliaDeBanda | null = null;

  if (fam === 'Commercial & Marketing') {
    // Decisão da Carolina: separa pelo departamento. Fora de COMMERCIAL e
    // MARKETING não há como decidir, e chutar aqui seria pôr 152 pessoas na
    // faixa errada sem sinal nenhum.
    familia = dep === 'COMMERCIAL' ? 'COMMERCIAL' : dep === 'MARKETING' ? 'MARKETING/COM' : null;
    if (!familia) {
      return vazio(`Commercial & Marketing usa o departamento para escolher a banda, e "${dep || '—'}" não é COMMERCIAL nem MARKETING.`);
    }
  } else if (fam === LIDERANCA) {
    // Liderança usa a banda da área. O level é que diferencia o topo.
    familia = POR_DEPARTAMENTO[dep] ?? null;
    if (!familia) {
      return vazio(`Liderança usa a banda da área, e o departamento "${dep || '—'}" não tem banda.`);
    }
  } else if (fam) {
    familia = POR_FAMILIA[fam] ?? null;
    if (!familia) return vazio(`Job Type Family "${fam}" não está no de-para de bandas.`);
  } else {
    return vazio('Sem Job Type Family no Convenia — provável efeito da unificação de bases, ainda em curso.');
  }

  return { familia, contrato, level, motivo: null };
}
