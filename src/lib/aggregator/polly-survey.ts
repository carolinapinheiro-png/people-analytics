/**
 * Agregador da pesquisa de engajamento (export do Polly).
 *
 * ------------------------------------------------------------------
 * POR QUE LER O BRUTO EM VEZ DE DIGITAR O AGREGADO
 * ------------------------------------------------------------------
 * Até aqui o painel recebia eNPS, risco e satisfação já calculados, digitados
 * a partir do deck. Isso funcionava e tinha três custos:
 *
 *   1. Não dava para saber o n de cada área. Legal aparecia com eNPS 47 sem que
 *      ninguém soubesse que são 15 respostas -- uma pessoa a mais ou a menos
 *      move esse número em 7 pontos.
 *   2. Recortes que a pesquisa coleta (gestor/contribuidor, marca, tempo de
 *      casa) simplesmente não existiam no painel, porque não estavam no deck.
 *   3. Toda onda dependia de alguém redigitar 60 números sem errar.
 *
 * Este módulo lê o export e reproduz o agregado. Validado em 10/08/2026 contra
 * a onda de jan/2026: as 8 áreas bateram exatamente (eNPS, risco e satisfação),
 * além do total da empresa (eNPS 76, risco 16,6%, satisfação 8,9).
 *
 * ------------------------------------------------------------------
 * AS DEFINIÇÕES, E COMO FORAM DESCOBERTAS
 * ------------------------------------------------------------------
 * Nenhuma delas estava escrita em lugar nenhum -- foram inferidas testando
 * contra os números publicados até reproduzir os dez escopos.
 *
 *   eNPS   = %promotores (9-10) − %detratores (1-6), sobre a pergunta de
 *            recomendação. NPS clássico.
 *   risco  = % que respondeu 6 OU MENOS em "qual a probabilidade de você
 *            permanecer se recebesse uma oferta idêntica". Testei todos os
 *            cortes de 1 a 7; só o ≤6 devolve os 16,6% publicados.
 *   satisf = média simples da pergunta de satisfação.
 *
 * A escala da pergunta mudou entre as ondas: jun/25 dizia "0 quer dizer nada
 * provável", jan/26 diz "1". Não afeta nenhuma das três contas, porque os
 * cortes do NPS (≥9 e ≤6) estão longe do piso -- mas fica registrado, porque a
 * primeira reação ao ver isso é achar que as ondas não são comparáveis.
 *
 * ------------------------------------------------------------------
 * O QUE NÃO ENTRA, POR DECISÃO
 * ------------------------------------------------------------------
 * Os comentários livres. Eles são o campo mais rico do export e o mais
 * perigoso: em jan/26 há respostas que descrevem a própria estrutura do time
 * ("no time de PLD, aconteceu a junção entre as áreas; eu sou pleno, mas veio
 * um sênior..."), escritas por alguém que acreditava estar anônimo. Guardar
 * isso no banco transformaria uma pesquisa anônima em uma base identificável.
 * Este módulo lê a coluna e descarta.
 */

export interface PollyResponse {
  area: string | null;
  tempoCasa: string | null;
  /** true = gestor, false = contribuidor individual, null = não perguntado. */
  gestor: boolean | null;
  marca: string | null;
  /**
   * Presencial / híbrido / remoto. Pergunta nova na onda de ago/26.
   *
   * Entrou porque estava sendo DESCARTADA em silêncio: o parser lê por
   * cabeçalho e simplesmente não reconhecia esta coluna, então ela caía na
   * lista de ignorados junto com "Polly Id". A pergunta foi feita a 485
   * pessoas e a resposta não chegava a lugar nenhum.
   */
  modelo: string | null;
  /** Recomendação, 0-10. */
  nps: number | null;
  /** Permaneceria com oferta idêntica, 0-10. */
  retencao: number | null;
  /** Satisfação geral, 0-10. */
  satisfacao: number | null;
  /** Notas 1-5 por pergunta, indexadas por "driver||pergunta". */
  drivers: Record<string, number>;
}

/** Abaixo disto a nota não é exibida para quem não é RH. Ver `applySuppression`. */
export const N_MINIMO_EXIBICAO = 5;

// ---------------------------------------------------------------- normalização

/**
 * A pesquisa é bilíngue e a mesma área chega escrita de quatro jeitos:
 * "Comercial", "Commercial", " Marketing " (com espaços), "Legal  & Compliance"
 * (com espaço duplo). Sem normalizar, Commercial vira uma área de 2 pessoas ao
 * lado de Comercial com 23 -- e as duas somem do gráfico por n baixo.
 */
const AREA_CANON: Record<string, string> = {
  tecnologia: 'Technology', technology: 'Technology',
  marketing: 'Marketing',
  'atendimento ao cliente': 'Customer Service', 'customer service': 'Customer Service',
  produto: 'Product', product: 'Product',
  comercial: 'Commercial', commercial: 'Commercial',
  financeiro: 'Finance', finance: 'Finance',
  'recursos humanos': 'Human Resources', 'human resources': 'Human Resources', rh: 'Human Resources',
  legal: 'Legal', 'legal & compliance': 'Legal', 'legal and compliance': 'Legal',
  outros: 'Outros', others: 'Outros', other: 'Outros',
};

const MARCA_CANON: Record<string, string> = {
  betnacional: 'Betnacional',
  betfair: 'Betfair',
  'ambas / função cross-brand': 'Ambas',
  'both/cross-brand': 'Ambas',
  'both / cross-brand': 'Ambas',
};

/** Faixas de tempo de casa na ordem em que fazem sentido no eixo. */
export const TEMPO_ORDEM = [
  '0-3 meses', '3-6 meses', '6-9 meses', '9-12 meses',
  '12-18 meses', '18-24 meses', '24+ meses',
];

/** Espaço duplo, NBSP e espaço fino aparecem no export e quebram o match. */
export function limpa(v: string | null | undefined): string {
  return (v ?? '').replace(/[   ]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function canonArea(v: string | null | undefined): string | null {
  const k = limpa(v).toLowerCase();
  if (!k) return null;
  return AREA_CANON[k] ?? limpa(v);
}

/**
 * Modelo de trabalho. Normaliza pelo NÚCLEO da palavra, e não pela frase
 * inteira: cada onda escreve "100% remoto", "Remoto", "Home office" para a
 * mesma coisa, e um dicionário de frases quebraria calado na próxima.
 *
 * O que não reconhecer volta como veio -- visível na tela, em vez de somar
 * silenciosamente com um grupo errado.
 */
export function canonModelo(v: string | null | undefined): string | null {
  const s = limpa(v);
  if (!s) return null;
  const k = s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (k.includes('hibrid')) return 'Híbrido';
  if (k.includes('remoto') || k.includes('home office') || k.includes('anywhere')) return 'Remoto';
  if (k.includes('presencial') || k.includes('escritorio')) return 'Presencial';
  return s;
}

export function canonMarca(v: string | null | undefined): string | null {
  const k = limpa(v).toLowerCase();
  if (!k) return null;
  return MARCA_CANON[k] ?? limpa(v);
}

/**
 * Faixa de tempo de casa, normalizada PELOS NÚMEROS e não pelo texto.
 *
 * Cada onda escreveu a mesma faixa de um jeito: jul/25 usa "24+ meses" e
 * "0-3 meses"; jan/26 usa "[+] 24 meses" e "3 meses ou menos"; e as duas têm
 * um punhado de respostas em inglês ("6-9 months"). Um dicionário de strings
 * cobriria o que já vimos e quebraria calado na próxima onda -- foi exatamente
 * o que aconteceu: "6-9 months" virou uma faixa própria com 3 pessoas, ao lado
 * de "6 - 9 meses" com 38.
 *
 * Extrair os números resolve as três grafias de uma vez e sobrevive a uma
 * quarta. O que não tiver número reconhecível volta como veio, visível na
 * tela, em vez de ser jogado numa faixa errada.
 */
export function canonTempo(v: string | null | undefined): string | null {
  const s = limpa(v);
  if (!s) return null;
  const k = s.toLowerCase();
  const n = (k.match(/\d+/g) ?? []).map(Number);

  // "24+", "[+] 24", "mais de 24", "over 24" -> faixa aberta no topo.
  if (n.length === 1 && /\+|mais de|over|acima/.test(k)) return `${n[0]}+ meses`;
  // "3 meses ou menos", "3 months or less", "menos de 3" -> faixa aberta embaixo.
  if (n.length === 1 && /ou menos|or less|menos de|less than|under/.test(k)) return `0-${n[0]} meses`;
  if (n.length >= 2) return `${n[0]}-${n[1]} meses`;
  if (n.length === 1) return `${n[0]} meses`;
  return s;
}

/** Posição da faixa no eixo. Faixas desconhecidas vão para o fim, não somem. */
export function ordemTempo(faixa: string): number {
  const i = TEMPO_ORDEM.indexOf(faixa);
  if (i >= 0) return i;
  const n = Number((faixa.match(/\d+/) ?? ['999'])[0]);
  return 100 + n;
}

/**
 * Gestor vs contribuidor. O texto vem longo e nos dois idiomas
 * ("Gestor(a): tenho responsabilidade formal..." / "Manager: I have formal...").
 * Basta o prefixo; qualquer coisa fora dos dois é null, não "contribuidor" --
 * chutar aqui empilharia respostas não classificadas no grupo maior.
 */
export function canonGestor(v: string | null | undefined): boolean | null {
  const s = limpa(v).toLowerCase();
  if (!s) return null;
  if (s.startsWith('gestor') || s.startsWith('manager')) return true;
  if (s.startsWith('contribuidor') || s.startsWith('individual')) return false;
  return null;
}

// ---------------------------------------------------------------- métricas

export interface CutMetrics {
  n: number;
  enps: number | null;
  promotores: number;
  passivos: number;
  detratores: number;
  /** % que respondeu ≤6 na pergunta de permanência. */
  risco: number | null;
  satisfacao: number | null;
}

const nums = (v: Array<number | null>) => v.filter((x): x is number => x != null && Number.isFinite(x));

export function computeMetrics(rs: PollyResponse[]): CutMetrics {
  const nps = nums(rs.map((r) => r.nps));
  const promotores = nps.filter((v) => v >= 9).length;
  const detratores = nps.filter((v) => v <= 6).length;
  const ret = nums(rs.map((r) => r.retencao));
  const sat = nums(rs.map((r) => r.satisfacao));

  return {
    // n é o total de respostas do recorte, não o de quem respondeu o eNPS.
    // São diferentes quando alguém pula a pergunta, e o n que protege o sigilo
    // é o de pessoas, não o de respostas válidas.
    n: rs.length,
    enps: nps.length ? Math.round(((promotores - detratores) / nps.length) * 100) : null,
    promotores,
    passivos: nps.length - promotores - detratores,
    detratores,
    risco: ret.length ? Math.round((ret.filter((v) => v <= 6).length / ret.length) * 1000) / 10 : null,
    satisfacao: sat.length ? Math.round((sat.reduce((a, b) => a + b, 0) / sat.length) * 10) / 10 : null,
  };
}

// ===========================================================================
// OS CRUZAMENTOS COM ÁREA
// ===========================================================================
// Esta função sempre percorreu UMA dimensão por vez. Cada resposta carrega
// área, tempo de casa, marca, função e modelo na MESMA linha, então o cruzamento
// sempre foi possível -- só nunca foi calculado.
//
// A consequência aparecia na tela como impossibilidade. Filtrado em Commercial,
// o bloco de tempo de casa exibia "não existe a quebra por área nesta série" e
// mostrava os números da empresa. A frase estava errada: o certo era "esta
// quebra não foi calculada na carga". Uma limitação de agregação virou
// explicação, e explicação congela a limitação -- é o terceiro caso do mesmo
// tipo neste painel.
//
// ---------------------------------------------------------------------------
// O QUE MUDA, E O QUE NÃO MUDA
// ---------------------------------------------------------------------------
// O que muda é só isto: mais entradas em CUT_KEY. Nenhuma estatística nova,
// nenhuma inferência -- as mesmas contas de `computeMetrics` sobre um grupo
// menor.
//
// O que NÃO muda é a supressão, e é ela o limite de verdade. Commercial tem 48
// respondentes; espalhados por 7 faixas de tempo de casa, duas ficam abaixo de
// cinco pessoas e não podem ir para a tela. Em RH, com 20 respostas, sobra uma
// faixa de sete. O cruzamento é viável e desigual, e quem lê precisa ver quais
// células sumiram e por quê -- não uma tabela com buracos silenciosos.

/**
 * Separa a área do outro recorte dentro de `cutValue`.
 *
 * Vive num `cutValue` composto em vez de numa coluna nova porque assim a regra
 * de permissão FALHA FECHADA: quem tentar tratar "Commercial || 12-18 meses"
 * como um nome de área comum não acha o departamento, `deptForScope` devolve
 * null, e `recorteNoEscopo` esconde a linha. Uma coluna nova falharia aberta
 * para quem esquecesse de lê-la.
 */
export const SEPARADOR_CRUZAMENTO = ' || ';

export type CutTypeSimples = 'company' | 'area' | 'funcao' | 'marca' | 'tempo' | 'modelo';
export type CutTypeCruzado = 'area+tempo' | 'area+marca' | 'area+funcao' | 'area+modelo';
export type CutType = CutTypeSimples | CutTypeCruzado;

export const CRUZAMENTOS: CutTypeCruzado[] = [
  'area+tempo', 'area+marca', 'area+funcao', 'area+modelo',
];

export function ehCruzamento(cutType: string): cutType is CutTypeCruzado {
  return (CRUZAMENTOS as string[]).includes(cutType);
}

/** "Commercial || 12-18 meses" -> { area, valor }. null se não for cruzamento. */
export function partesDoCruzamento(
  cutValue: string,
): { area: string; valor: string } | null {
  const i = (cutValue ?? '').indexOf(SEPARADOR_CRUZAMENTO);
  if (i < 0) return null;
  const area = cutValue.slice(0, i).trim();
  const valor = cutValue.slice(i + SEPARADOR_CRUZAMENTO.length).trim();
  return area && valor ? { area, valor } : null;
}

export interface CutRow extends CutMetrics {
  cutType: CutType;
  cutValue: string;
}

const funcaoDe = (r: PollyResponse): string | null =>
  r.gestor == null ? null : r.gestor ? 'Gestores' : 'Contribuidores individuais';

/** Só cruza quando OS DOIS lados existem. Meia chave viraria um grupo falso. */
const cruzar =
  (segundo: (r: PollyResponse) => string | null) =>
  (r: PollyResponse): string | null => {
    const b = segundo(r);
    return r.area && b ? `${r.area}${SEPARADOR_CRUZAMENTO}${b}` : null;
  };

/** Chave de agrupamento de cada recorte. null = a resposta não entra naquele corte. */
const CUT_KEY: Record<CutType, (r: PollyResponse) => string | null> = {
  company: () => 'company',
  area: (r) => r.area,
  funcao: funcaoDe,
  marca: (r) => r.marca,
  tempo: (r) => r.tempoCasa,
  modelo: (r) => r.modelo,
  'area+tempo': cruzar((r) => r.tempoCasa),
  'area+marca': cruzar((r) => r.marca),
  'area+funcao': cruzar(funcaoDe),
  'area+modelo': cruzar((r) => r.modelo),
};

export const CUTS_PADRAO: CutType[] = [
  'company', 'area', 'funcao', 'marca', 'tempo', 'modelo', ...CRUZAMENTOS,
];

export function computeCuts(rs: PollyResponse[], tipos: CutType[] = CUTS_PADRAO): CutRow[] {
  const out: CutRow[] = [];
  for (const t of tipos) {
    const grupos = new Map<string, PollyResponse[]>();
    for (const r of rs) {
      const k = CUT_KEY[t](r);
      if (!k) continue;
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k)!.push(r);
    }
    for (const [cutValue, g] of grupos) out.push({ cutType: t, cutValue, ...computeMetrics(g) });
  }
  return out;
}

// ---------------------------------------------------------------- drivers

/**
 * Percentual de respostas favoráveis: notas 4 e 5 numa escala de 1 a 5.
 *
 * É como o deck do CEO lê os drivers, e por dois bons motivos.
 *
 * Primeiro, legibilidade: "78% concordam" cabe numa frase falada; "4,27 de 5"
 * exige que quem ouve reconstrua a escala de cabeça antes de sentir se é bom.
 *
 * Segundo, a escala de 1 a 5 é ordinal, não métrica. A distância entre 4 e 5
 * não é a mesma entre 2 e 3 -- concordar plenamente em vez de concordar é um
 * salto menor que sair de discordar para neutro. Média trata os dois como 1
 * ponto igual. Contar quem está do lado favorável não faz essa suposição.
 *
 * A média continua sendo calculada e exibida ao lado: ela usa a escala inteira
 * e capta movimento pequeno entre ondas que o corte binário não vê.
 */
export function pctFavoravel(notas: number[]): number | null {
  if (!notas.length) return null;
  return Math.round((notas.filter((n) => n >= 4).length / notas.length) * 1000) / 10;
}

export interface DriverScore {
  driver: string;
  question: string;
  cutType: CutType;
  cutValue: string;
  n: number;
  score: number | null;
  /** % que respondeu 4 ou 5. Leitura principal; `score` é o detalhe. */
  favoravel: number | null;
}

export function computeDriverScores(
  rs: PollyResponse[],
  tipos: CutType[] = ['company', 'area', 'funcao', 'marca', 'tempo'],
): DriverScore[] {
  const chaves = [...new Set(rs.flatMap((r) => Object.keys(r.drivers)))].sort();
  const out: DriverScore[] = [];
  for (const t of tipos) {
    const grupos = new Map<string, PollyResponse[]>();
    for (const r of rs) {
      const k = CUT_KEY[t](r);
      if (!k) continue;
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k)!.push(r);
    }
    for (const [cutValue, g] of grupos) {
      for (const ch of chaves) {
        const [driver, question] = ch.split('||');
        const v = g.map((r) => r.drivers[ch]).filter((x) => x != null && Number.isFinite(x));
        out.push({
          driver, question, cutType: t, cutValue,
          n: v.length,
          score: v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100 : null,
          favoravel: pctFavoravel(v),
        });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- sigilo

/**
 * Esconde a NOTA de recortes pequenos, mantendo o recorte e o n visíveis.
 *
 * Por que não simplesmente omitir a linha: sumir sem explicação faz a pessoa
 * concluir que a área não respondeu, ou que o painel está quebrado. Pior, ela
 * pergunta o número por fora -- e aí alguém manda por Slack, sem nenhum
 * controle. Mostrar "3 respostas, abaixo do mínimo" responde a pergunta antes
 * de ela ser feita.
 *
 * Por que 5: é o piso usual de pesquisa de clima. Abaixo disso, num time de 15
 * pessoas com 3 gestores, o resultado do recorte de gestor é praticamente
 * nominal -- todo mundo na área sabe de quem se trata. O risco concreto não é
 * jurídico, é a próxima onda: quando as pessoas percebem que recortes pequenos
 * circulam, elas param de responder com honestidade, e o instrumento morre.
 *
 * Perfis com acesso a dado individual (RH) veem tudo, porque já veem salário e
 * desligamento pessoa a pessoa no resto do painel -- esconder aqui seria
 * teatro, não proteção.
 */
// ---------------------------------------------------------------- importância

/**
 * Quanto cada pergunta anda junto com o eNPS da MESMA pessoa.
 *
 * ------------------------------------------------------------------
 * POR QUE ISTO SÓ FOI POSSÍVEL DEPOIS DE LER O BRUTO
 * ------------------------------------------------------------------
 * Com o agregado, a única correlação possível era entre 8 áreas -- oito pontos,
 * onde nada passa no teste (ver stats.ts). No nível da pessoa são 367 pontos,
 * e o r crítico cai de 0,74 para cerca de 0,10. A conta passa a ter força de
 * verdade, e é a mesma pergunta: o que anda junto com engajamento.
 *
 * ------------------------------------------------------------------
 * TRÊS RESSALVAS QUE PRECISAM VIAJAR JUNTO COM O NÚMERO
 * ------------------------------------------------------------------
 * 1. ISTO NÃO É CAUSA. Todas as respostas vêm da mesma pessoa no mesmo
 *    momento; quem está satisfeito tende a marcar alto em tudo (viés de método
 *    comum). Um r de 0,51 em comunicação não promete que melhorar comunicação
 *    eleva o eNPS -- promete que as duas coisas aparecem juntas.
 * 2. A ESCALA É CURTA E CONCENTRADA NO TOPO. Quase todas as notas ficam entre 4
 *    e 5, o que comprime a variação e puxa todos os r para baixo. Comparar os r
 *    ENTRE perguntas é legítimo; comparar com r de outros estudos, não.
 * 3. O QUE IMPORTA É A ORDEM, NÃO O VALOR. "Comunicação lidera" é o achado.
 *    "0,51" é só como ele foi medido.
 *
 * O uso correto é cruzar isto com a NOTA: pergunta com nota baixa e associação
 * alta é onde um ponto ganho tende a render mais. Pergunta com nota baixa e
 * associação baixa pode ser um problema real que simplesmente não é o que move
 * engajamento -- e merece outra conversa, não esta.
 */
export interface DriverImportance {
  driver: string;
  question: string;
  /** Correlação de Pearson com o eNPS individual. */
  r: number;
  /** Nota média da pergunta. */
  score: number;
  /** % que respondeu 4 ou 5 -- a leitura principal na tela. */
  favoravel: number;
  /** Pares completos usados. */
  n: number;
}

function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 3) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx, b = ys[i] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : null;
}

export function computeDriverImportance(rs: PollyResponse[], minN = 30): DriverImportance[] {
  const chaves = [...new Set(rs.flatMap((r) => Object.keys(r.drivers)))];
  const out: DriverImportance[] = [];
  for (const ch of chaves) {
    const pares = rs
      .map((r) => [r.drivers[ch], r.nps] as const)
      .filter(([a, b]) => a != null && b != null && Number.isFinite(a) && Number.isFinite(b)) as Array<readonly [number, number]>;
    if (pares.length < minN) continue;
    const r = pearson(pares.map((p) => p[0]), pares.map((p) => p[1]));
    if (r == null) continue;
    const [driver, question] = ch.split('||');
    out.push({
      driver, question,
      r: Math.round(r * 1000) / 1000,
      score: Math.round((pares.reduce((s, p) => s + p[0], 0) / pares.length) * 100) / 100,
      favoravel: pctFavoravel(pares.map((p) => p[0])) ?? 0,
      n: pares.length,
    });
  }
  return out.sort((a, b) => b.r - a.r);
}

export function applySuppression<T extends { n: number }>(
  rows: T[],
  podeVerTudo: boolean,
  campos: Array<keyof T>,
): Array<T & { suprimido: boolean }> {
  return rows.map((r) => {
    const suprimido = !podeVerTudo && r.n < N_MINIMO_EXIBICAO;
    if (!suprimido) return { ...r, suprimido: false };
    const copia = { ...r } as T & { suprimido: boolean };
    for (const c of campos) (copia as Record<string, unknown>)[c as string] = null;
    copia.suprimido = true;
    return copia;
  });
}
