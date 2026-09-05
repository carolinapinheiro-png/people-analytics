/**
 * De onde sai cada coluna dos reports do Sandeep.
 *
 * ===========================================================================
 * POR QUE ISTO EXISTE ANTES DO BOTÃO
 * ===========================================================================
 * O Talent Mobility Data Model tem 51 colunas no vocabulário do Workday. O
 * cadastro do Convenia tem os dados -- mas com nomes dados pelo RH, não pela
 * API, e nenhum padrão meu adivinha nome que gente escolheu.
 *
 * A lição está fresca: `cargoDe` tentou sete nomes de campo, acertou zero em
 * 638, e a tela passou a afirmar que o Convenia não tinha cargo. Um mapa
 * errado aqui é pior: sai um CSV inteiro, plausível, com Career Band no lugar
 * de Compensation Grade, e ninguém tem como ver.
 *
 * Este módulo não decide nada. Casa nome com nome, diz a força do casamento e
 * mostra os valores -- e deixa a escolha ser feita olhando.
 *
 * É função pura: recebe os campos que a sonda viu e devolve o mapa. Sem banco
 * e sem API, dá para testar o casamento, que é onde os erros moram.
 */

/** As 51 colunas do Talent Mobility Data Model, na ordem do arquivo. */
export const COLUNAS_TALENT = [
  'Employee ID', 'Full Legal Name', 'Preferred Name', "Worker's Manager",
  'Manager - Level 02', 'Manager - Level 03', 'Date of Birth',
  'On Leave (e.g. Mat/pat etc)', 'Leave Type', 'Worker Type',
  'Supervisory Org Level 2', 'Supervisory Org Level 3', 'Supervisory Org Level 4',
  'Supervisory Org Level 5', 'Supervisory Org Level 6', 'Supervisory Org Level 7',
  'Supervisory Org Level 8', 'Supervisory Organization', 'Job Title',
  'Job Family', 'Job Family Group', 'Email - Primary Work', 'Original Hire Date',
  'Hire Date', 'Continuous Service Date', 'Employee Type', 'End Employment Date',
  'Length of Service', 'Is Manager', 'Location', 'Work Address - Country',
  'Company', 'Cost Center', 'Cost Center - ID', 'Cost centre Hierarchy Level 1',
  'Cost centre Hierarchy Level 2', 'Cost centre Hierarchy Level 3',
  'Cost Centre Hierarchy Level 4', 'Cost Centre Hierarchy Level 5',
  'Line Manager Email', 'Compensation Grade', 'Career Band',
  'Compensation Grade Profile', 'FTE %', 'Scheduled Weekly Hours',
  'Default Weekly Hours', 'Leaver Date (exit the organisation)', 'Leaver Reason',
  'Basic Salary', 'Currency', 'On Secondment',
] as const;

/**
 * As colunas que NÃO precisam de campo no Convenia.
 *
 * Saem do organograma, da tabela de desligados ou de conta -- e procurar campo
 * para elas só produziria falso positivo. `Company` casaria com o campo
 * `Empresa`, que é de onde ela já vem; `Currency` casaria com qualquer coisa.
 */
export const JA_TEMOS: Partial<Record<(typeof COLUNAS_TALENT)[number], string>> = {
  // `registration`, e NÃO o `id`. O `id` do Convenia é UUID
  // (795f0df4-9556-...); o arquivo de agosto traz 320 e P000212, que é o
  // `registration` com os zeros à esquerda comidos pelo Excel. Eu tinha
  // apontado para o UUID -- 641 linhas com a matrícula errada, e nenhuma
  // pareceria errada.
  'Employee ID': 'convenia: registration',
  // O Convenia separa: `name` é "Adriana", `last_name` é o resto.
  'Full Legal Name': 'convenia: name + last_name',
  "Worker's Manager": 'organograma (supervisor_id)',
  'Manager - Level 02': 'organograma, um nível acima',
  'Manager - Level 03': 'organograma, dois níveis acima',
  // `team`, e não `department`. Agosto: "Customer Support Betnacional",
  // "Facilities", "AI Tech" -- que é o `team` da listagem. O `department` traz
  // OPERATION/TECHNOLOGY/FINANCE, e esses são o Job Family Group.
  'Supervisory Organization': 'convenia: team',
  'Job Family Group': 'org_pessoas.department (OPERATION, TECHNOLOGY, FINANCE)',
  // A escada sobe lendo `team` de cada degrau -- o mesmo atributo da
  // Supervisory Organization, que é o degrau zero. Antes eu dizia
  // `department`: escada certa, atributo errado.
  'Supervisory Org Level 2': 'organograma: team da própria pessoa',
  'Supervisory Org Level 3': 'organograma: team do gestor',
  'Supervisory Org Level 4': 'organograma: team, 2 níveis acima',
  'Supervisory Org Level 5': 'organograma: team, 3 níveis acima',
  'Supervisory Org Level 6': 'organograma: team, 4 níveis acima',
  'Supervisory Org Level 7': 'organograma: team, 5 níveis acima',
  'Supervisory Org Level 8': 'organograma: team, 6 níveis acima',
  // Estado de RESIDÊNCIA, não do escritório: os remotos espalham por RJ, RS,
  // MG. Vem de `address.state` no DETALHE -- a sync já o extrai como `uf`. Na
  // listagem o endereço vem vazio, e é por isso que a sonda não o mostrou.
  'Work Address - Country': 'convenia: address.state (detalhe)',
  // N-6 Above, N-5, N-3 -- o campo personalizado `WorkDay Level`. O `Level`
  // (L0/L5/L3) é o Compensation Grade, que é outra coluna.
  'Compensation Grade Profile': 'personalizado: WorkDay Level',
  'Job Title': 'convenia_pessoas.job_title',
  'Email - Primary Work': 'org_pessoas.email',
  'Original Hire Date': 'convenia_pessoas.hiring_date',
  'Employee Type': 'convenia_pessoas.status (ativo / admissão / desligado)',
  'End Employment Date': 'convenia_leavers: data de desligamento',
  'Length of Service': 'blocos de 30 dias desde a admissão, como o arquivo faz',
  'Continuous Service Date': 'anos, meses e dias desde a admissão',
  'Is Manager': 'personalizado: Liderança ? (Sim / Não / Não informado)',
  'Location': 'convenia_pessoas.escritorio',
  'Company': 'convenia_pessoas.empresa',
  'Cost Center': 'convenia_pessoas.cost_center',
  // VAZIAS nas 654 linhas de julho e nas 641 de agosto. Não é campo faltando:
  // é assim que o report é entregue. `Currency` eu tinha declarado como "BRL
  // constante" -- teria inventado uma coluna que ninguém preenche.
  'Cost Center - ID': '(vazia no report, como julho e agosto)',
  'Currency': '(vazia no report, como julho e agosto)',
  'On Leave (e.g. Mat/pat etc)': '(vazia no report, como julho e agosto)',
  'Leave Type': '(vazia no report, como julho e agosto)',
  'Scheduled Weekly Hours': '(vazia no report, como julho e agosto)',
  'Default Weekly Hours': '(vazia no report, como julho e agosto)',
  'On Secondment': '(vazia no report, como julho e agosto)',
  'Hire Date': '(vazia no report; a admissão vai em Original Hire Date)',
  // Mesma subida das Supervisory Org, outro atributo -- e a contagem começa em
  // 1, não em 2. Alcides: CC L1 AI TECH (o dele), CC L2 PRODUCT ENGINEERING
  // (do gestor). O arquivo de agosto traz `#N/A` onde o PROCV não achou; aqui
  // sai vazio, que é visível.
  'Cost centre Hierarchy Level 1': 'organograma: cost center da própria pessoa',
  'Cost centre Hierarchy Level 2': 'organograma: cost center do gestor',
  'Cost centre Hierarchy Level 3': 'organograma: cost center, 2 níveis acima',
  'Cost Centre Hierarchy Level 4': 'organograma: cost center, 3 níveis acima',
  'Cost Centre Hierarchy Level 5': 'organograma: cost center, 4 níveis acima',
  'Line Manager Email': 'e-mail do gestor, pelo organograma',
  'Leaver Date (exit the organisation)': 'convenia_leavers: data de desligamento',
  'Leaver Reason': 'convenia_leavers: tipo de desligamento',
};

/** Campo visto no cadastro: nome, de onde veio, cobertura e amostra de valores. */
export interface CampoVisto {
  nome: string;
  origem: 'listagem' | 'detalhe' | 'personalizado';
  preenchidos: number;
  valores: string[];
}

export interface Casamento {
  coluna: string;
  /** Preenchida quando a coluna já sai do que temos, sem campo do Convenia. */
  jaTemos?: string;
  campo?: CampoVisto;
  /**
   * `escolhida` foi apontada por gente e está gravada; as outras são palpite
   * meu. Só `escolhida` alimenta o CSV -- ver `casarCampos`.
   */
  forca?: 'escolhida' | 'exata' | 'parcial';
  /** Quem escolheu, quando a força é `escolhida`. */
  definidoPor?: string;
}

/** Uma escolha gravada em `talent_mobility_mapa`. */
export interface EscolhaSalva {
  coluna: string;
  campo: string;
  definidoPor: string;
}

/** Sem acento, sem caixa, sem pontuação e sem espaço: "FTE %" vira "fte". */
export const chave = (s: string): string =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');

/** Palavras da chave, sem os pedaços curtos demais para significar algo. */
export const palavras = (s: string): string[] =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().split(/[^a-z0-9]+/).filter((p) => p.length > 1);

/**
 * Palavras que sozinhas não significam nada.
 *
 * `Preferred Name` e `father_name` compartilham "name", e a primeira execução
 * real ofereceu o nome do PAI como nome preferido. `Leave Type` e
 * `salary_type` compartilham "type". Meia dúzia de palavras de ligação casa
 * com tudo, e um palpite ruim custa mais do que nenhum: ele ocupa o lugar,
 * gasta o campo e ainda parece resposta.
 */
const PALAVRAS_VAGAS = new Set([
  'name', 'type', 'date', 'id', 'level', 'number', 'code', 'group',
  'total', 'of', 'the', 'primary', 'work', 'address',
]);

/**
 * Quanto o nome do campo cobre o nome da coluna, dos dois lados.
 *
 * Contido-em era permissivo demais: `Level` está contido em `Supervisory Org
 * Level 2`, em `Cost centre Hierarchy Level 5` e em mais dez, e a primeira
 * execução real entregou doze colunas a um campo só -- todas com `L0 | L5 |
 * L3`, que é Compensation Grade e nada mais. A coluna certa ficou órfã porque
 * o campo dela já tinha sido gasto.
 *
 * Fração de palavras em comum, pelo pior dos dois lados: `Level` cobre 1 de 4
 * palavras de `Supervisory Org Level 2` e não passa; `salary` cobre 1 de 2 de
 * `Basic Salary` e passa, marcado para conferência.
 *
 * E o que sobra tem de ser palavra com conteúdo: `Date of Birth` casa com
 * `birth_date` porque divide "birth", não porque divide "date".
 */
export function forcaDoCasamento(coluna: string, campo: string): number {
  const a = palavras(coluna), b = palavras(campo);
  if (!a.length || !b.length) return 0;
  const comuns = a.filter((p) => b.includes(p));
  if (!comuns.some((p) => !PALAVRAS_VAGAS.has(p))) return 0;
  return Math.min(comuns.length / a.length, comuns.length / b.length);
}

/**
 * Casa as 51 colunas com os campos vistos no cadastro.
 *
 * Exata primeiro, em todos os campos, ANTES de qualquer parcial: senão
 * `Career Band` casaria por pedaço com `Career Band Level` só porque este veio
 * antes na lista, e a coluna certa ficaria órfã. A ordem de `custom_fields`
 * não é contrato.
 *
 * E um campo vale por UMA coluna. Sem isso, o melhor palpite vira o palpite de
 * todo mundo.
 */
export function casarCampos(
  campos: readonly CampoVisto[],
  salvas: readonly EscolhaSalva[] = [],
): Casamento[] {
  const usados = new Set<string>();
  const porChave = new Map<string, CampoVisto>();
  for (const c of campos) if (!porChave.has(chave(c.nome))) porChave.set(chave(c.nome), c);

  const escolhido = new Map<string, { campo: CampoVisto; forca: Casamento['forca']; por?: string }>();

  // O que foi apontado por gente vem primeiro e não é discutido. `Level` é o
  // Compensation Grade e os nomes não têm uma letra em comum -- nenhum
  // casamento por nome chegaria lá, e o palpite não tem o direito de desfazer
  // a escolha de quem leu os valores.
  for (const e of salvas) {
    // Uma coluna pode ter virado derivada DEPOIS de alguém a ter mapeado --
    // foi o que aconteceu com `Job Family Group`. A escolha antiga não pode
    // seguir reservando o campo, senão ele some do seletor das outras.
    if (JA_TEMOS[e.coluna as (typeof COLUNAS_TALENT)[number]]) continue;
    const achado = porChave.get(chave(e.campo));
    if (!achado) continue;
    escolhido.set(e.coluna, { campo: achado, forca: 'escolhida', por: e.definidoPor });
    usados.add(achado.nome);
  }

  for (const col of COLUNAS_TALENT) {
    if (JA_TEMOS[col] || escolhido.has(col)) continue;
    const achado = porChave.get(chave(col));
    if (achado && !usados.has(achado.nome)) {
      escolhido.set(col, { campo: achado, forca: 'exata' });
      usados.add(achado.nome);
    }
  }

  // Os parciais entram pelo melhor primeiro, e nao na ordem das colunas: se
  // `salary` serve a duas, vai para aquela em que cobre mais.
  const candidatos = COLUNAS_TALENT
    .filter((col) => !JA_TEMOS[col] && !escolhido.has(col))
    .flatMap((coluna) => campos.map((campo) => ({
      coluna: coluna as string, campo, forca: forcaDoCasamento(coluna, campo.nome),
    })))
    .filter((c) => c.forca >= 0.5)
    .sort((a, b) => b.forca - a.forca);

  for (const c of candidatos) {
    if (escolhido.has(c.coluna) || usados.has(c.campo.nome)) continue;
    escolhido.set(c.coluna, { campo: c.campo, forca: 'parcial' });
    usados.add(c.campo.nome);
  }

  return COLUNAS_TALENT.map((coluna) => {
    if (JA_TEMOS[coluna]) return { coluna, jaTemos: JA_TEMOS[coluna] };
    const e = escolhido.get(coluna);
    return e ? { coluna, campo: e.campo, forca: e.forca, definidoPor: e.por } : { coluna };
  });
}

/** Os campos que nenhuma coluna reivindicou -- onde mora o que eu não previ. */
export function sobraram(campos: readonly CampoVisto[], mapa: readonly Casamento[]): CampoVisto[] {
  const usados = new Set(mapa.map((m) => m.campo?.nome).filter(Boolean));
  return campos.filter((c) => !usados.has(c.nome));
}

/**
 * A cadeia de gestores acima de alguém, do mais próximo ao mais distante.
 *
 * Alimenta as sete Supervisory Org e as cinco Cost Centre Hierarchy do report
 * do Sandeep -- que não são campo do Convenia nenhum, e sim o organograma
 * andado para cima. Só muda o atributo que se lê de cada degrau: `department`
 * numa família, `cost_center` na outra.
 *
 * PARA POR CICLO, E NÃO POR SORTE
 *
 * Organograma real tem gestor apontando para si mesmo e par de pessoas
 * apontando uma para a outra -- vem de cadastro digitado. Sem a trava de
 * visitados isto é um laço infinito num handler de servidor, e o sintoma seria
 * a tela pendurada, não um erro. O limite de profundidade sozinho esconderia o
 * ciclo repetindo a mesma pessoa em sete colunas.
 *
 * Devolve os IDs; quem chama decide o que ler de cada um.
 */
export function cadeiaAcima(
  id: string,
  supervisorDe: ReadonlyMap<string, string | null>,
  maxNiveis: number,
): string[] {
  const cadeia: string[] = [];
  const visitados = new Set<string>([id]);
  let atual = id;
  while (cadeia.length < maxNiveis) {
    const chefe = supervisorDe.get(atual);
    if (!chefe || visitados.has(chefe)) break;
    visitados.add(chefe);
    cadeia.push(chefe);
    atual = chefe;
  }
  return cadeia;
}

/**
 * O degrau `n` da hierarquia: 0 é a própria pessoa, 1 o gestor, e assim acima.
 *
 * Vazio quando a cadeia acaba antes. O arquivo de agosto traz `#N/A` e `0`
 * nesses lugares, resíduo de PROCV que não achou -- vazio é melhor: some do
 * pivô em vez de virar uma categoria chamada "#N/A".
 */
export function degrau(
  id: string,
  nivel: number,
  supervisorDe: ReadonlyMap<string, string | null>,
  atributoDe: (id: string) => string | null,
): string {
  if (nivel === 0) return atributoDe(id) ?? '';
  const cadeia = cadeiaAcima(id, supervisorDe, nivel);
  return cadeia.length < nivel ? '' : (atributoDe(cadeia[nivel - 1]) ?? '');
}

/**
 * TEMPO DE CASA: DUAS CONTAS DIFERENTES, DE PROPÓSITO
 *
 * `Length of Service` e `Continuous Service Date` medem a mesma coisa e não
 * são calculados igual. Manter as duas contas é intencional -- ver abaixo.
 */

/**
 * `Length of Service`, como o arquivo de agosto faz: blocos de 30 dias.
 *
 * NÃO é mês de calendário. Reproduzir a planilha exigiu descobrir isto:
 * `floor(dias / 30)` contra o último dia do mês bate em 641 de 641 linhas;
 * mês de calendário bate em 373. A Alba, admitida em 02/06/2025, aparece com
 * 15 e não 14 -- são 455 dias, 15 blocos de 30.
 *
 * A conta drifta: seis anos dão 73 em vez de 72, porque doze blocos de 30 são
 * 360 dias e não um ano. Fica assim mesmo. O número já foi submetido ao grupo
 * todo mês, e mudar a régua agora criaria um degrau na série do Sandeep sem
 * ninguém ter pedido -- um problema pior do que o drift, e mais difícil de
 * explicar. Se for para corrigir, que seja uma decisão dele, com data.
 */
export function blocosDe30Dias(hiring_date: string | null, refISO: string): number | null {
  const ini = /^(\d{4})-(\d{2})-(\d{2})/.exec((hiring_date ?? '').trim());
  const fim = /^(\d{4})-(\d{2})-(\d{2})/.exec(refISO.trim());
  if (!ini || !fim) return null;
  const a = Date.UTC(+ini[1], +ini[2] - 1, +ini[3]);
  const b = Date.UTC(+fim[1], +fim[2] - 1, +fim[3]);
  if (b < a) return null;
  return Math.floor((b - a) / 86400000 / 30);
}

/**
 * `Continuous Service Date`: anos, meses e dias de calendário desde a admissão.
 *
 * Vem vazia nas 641 linhas de agosto, então não há formato anterior a
 * respeitar e nada que eu possa conferir contra. O formato abaixo é escolha
 * minha, e está num lugar só de propósito: se o Sandeep quiser "1y 2m 15d" ou
 * uma data, muda aqui.
 *
 * Calendário de verdade, e não blocos de 30: aqui o número é lido por pessoa
 * ("dois anos e três meses"), e alguém que entrou em 10/01/2024 espera ver
 * dois anos exatos em 10/01/2026. É o oposto do Length of Service, que é
 * agregado e tem uma série histórica para não quebrar.
 */
export function tempoDeCasa(
  hiring_date: string | null,
  refISO: string,
): { anos: number; meses: number; dias: number } | null {
  const ini = /^(\d{4})-(\d{2})-(\d{2})/.exec((hiring_date ?? '').trim());
  const fim = /^(\d{4})-(\d{2})-(\d{2})/.exec(refISO.trim());
  if (!ini || !fim) return null;

  const a = { y: +ini[1], m: +ini[2], d: +ini[3] };
  const alvo = Date.UTC(+fim[1], +fim[2] - 1, +fim[3]);
  if (Date.UTC(a.y, a.m - 1, a.d) > alvo) return null;

  /**
   * Somar meses truncando no fim do mês: 31/01 + 1 mês é 29/02, não 02/03.
   *
   * A primeira versão subtraía campo a campo e emprestava os dias do mês
   * anterior quando o dia ficava negativo. Não fecha: de 31/01 a 01/03 o dia
   * dá -30, e somar os 29 de fevereiro ainda deixa -1. Emprestar duas vezes
   * seria remendo; contar quantos meses inteiros cabem é a definição.
   */
  const somarMeses = (n: number): number => {
    const total = (a.m - 1) + n;
    const y = a.y + Math.floor(total / 12);
    const m = ((total % 12) + 12) % 12;
    const ultimoDia = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return Date.UTC(y, m, Math.min(a.d, ultimoDia));
  };

  let meses = 0;
  while (somarMeses(meses + 1) <= alvo) meses++;
  const dias = Math.round((alvo - somarMeses(meses)) / 86400000);
  return { anos: Math.floor(meses / 12), meses: meses % 12, dias };
}

/** "1a 2m 15d". Vazio quando não dá para calcular -- vazio é visível. */
export function tempoDeCasaTexto(hiring_date: string | null, refISO: string): string {
  const t = tempoDeCasa(hiring_date, refISO);
  return t ? `${t.anos}a ${t.meses}m ${t.dias}d` : '';
}

/**
 * O `Vínculo` do Convenia vira CLT ou PJ no report.
 *
 * Medido cruzando as 654 linhas de julho com o export do Convenia, pessoa a
 * pessoa. As divergências eram todas o mesmo par -- "Pessoa Jurídica" no
 * cadastro, "PJ" no report -- e os vínculos raros ficaram visíveis na
 * contagem: Diretor Estatutário (6), Aprendiz (3) e Contrato Intermitente (2)
 * saem como CLT; Associado (2) sai como PJ.
 *
 * A mesma divisão está escrita na nota do template do WIL: Regular Employee =
 * CLT, Aprendiz, Contrato Intermitente, Diretor Estatutário; Contractor =
 * Pessoa Jurídica, Associado. Duas fontes independentes concordando -- a
 * planilha entregue e a definição do grupo.
 */
const VINCULO_CLT = ['clt', 'aprendiz', 'contrato intermitente', 'diretor estatutario'];
const VINCULO_PJ = ['pessoa juridica', 'associado'];

/**
 * Vínculo desconhecido sai VAZIO, e não chutado para CLT.
 *
 * Um vínculo novo que o RH criar amanhã apareceria como CLT em silêncio -- e
 * CLT é a maioria, ninguém olharia duas vezes. Vazio aparece na contagem.
 */
export function workerType(vinculo: string | null): string {
  const v = chave(vinculo ?? '');
  if (!v) return '';
  if (VINCULO_CLT.some((x) => chave(x) === v)) return 'CLT';
  if (VINCULO_PJ.some((x) => chave(x) === v)) return 'PJ';
  return '';
}

/**
 * "Não informado" é ausência de dado, e não um valor.
 *
 * O export do Convenia escreve isso no lugar da célula em branco, e foi o que
 * derrubou a medição na primeira passada: `Career Band` batia em 63% das
 * linhas, e as outras 37% não divergiam -- estavam com o texto no lugar do
 * vazio. Tratado como ausência, bate em 641 de 641, zero divergências. Julho
 * tem 69 pessoas assim em Job Family: é exatamente a população que hoje é
 * puxada do mês anterior na mão.
 *
 * O report também usa "Não informado" em algumas colunas (End Employment Date,
 * Leaver Reason, Is Manager). Isso é convenção DELE, na saída. Aqui é entrada,
 * e entrada com texto de preenchimento é campo vazio.
 */
const PREENCHIMENTO = ['naoinformado', 'na', 'nao aplicavel'].map(chave);

export function valorOuVazio(v: string | null): string {
  const s = (v ?? '').trim();
  return PREENCHIMENTO.includes(chave(s)) ? '' : s;
}

/**
 * A pessoa esteve empregada em algum momento do mês de referência?
 *
 * ===========================================================================
 * QUEM ENTRA NO ARQUIVO
 * ===========================================================================
 * A primeira versão filtrava só pela admissão, e teria produzido 801 linhas
 * para agosto: 629 ativos mais os 172 desligados desde 2024. O arquivo de
 * julho tem 654 -- 621 ativos, 17 em admissão e 16 desligados -- e as 18 datas
 * de saída que ele traz são todas de julho.
 *
 * Ou seja: o desligado entra no mês em que saiu, e some nos meses seguintes.
 * É o que faz o arquivo ser um retrato do mês, e não um cadastro acumulado.
 *
 * Admissão depois do fim do mês: fora. Saída antes do início do mês: fora.
 * Sem data de admissão a pessoa FICA -- tirar alguém real por falta de um
 * campo é pior do que deixá-la visível.
 */
export function noMesDeReferencia(
  hiring_date: string | null,
  dismissal: string | null,
  inicioISO: string,
  fimISO: string,
): boolean {
  const adm = /^(\d{4}-\d{2}-\d{2})/.exec((hiring_date ?? '').trim())?.[1];
  if (adm && adm > fimISO) return false;
  const saida = /^(\d{4}-\d{2})/.exec((dismissal ?? '').trim())?.[1];
  // Só o mês da saída é guardado, então a comparação é por mês: quem saiu no
  // mês de referência entra; quem saiu antes, não.
  if (saida && saida < inicioISO.slice(0, 7)) return false;
  return true;
}

/**
 * O último valor conhecido de um campo, olhando para trás nas fotos mensais.
 *
 * ===========================================================================
 * O CARRY-FORWARD QUE HOJE É FEITO NA MÃO
 * ===========================================================================
 * A nota de agosto do arquivo entregue diz, com todas as letras: Job Type
 * Family, Career Band e WorkDay Level vieram em branco para 120 colegas e
 * foram puxadas do último mês em que cada um teve valor.
 *
 * Medido em agosto de 2026: `Compensation Grade` sai em 73% e `Job Family` em
 * 89% -- é a mesma população. O campo está vazio no cadastro de hoje, e o
 * valor existia mês passado.
 *
 * As fotos vêm da mais recente para a mais antiga, e a primeira que tiver
 * valor ganha. Não interpola nem inventa: se nenhuma foto tem, sai vazio, e a
 * contagem de vazios continua dizendo quantos.
 *
 * A janela é limitada de propósito. Um Career Band de dezoito meses atrás não
 * descreve mais ninguém -- carregar valor velho para sempre é a forma de fazer
 * um campo parecer preenchido enquanto ele apodrece.
 */
export const MESES_DE_CARRY_FORWARD = 6;

export function ultimoValorConhecido(
  atual: string | null | undefined,
  /** Fotos anteriores, da mais recente para a mais antiga. */
  anteriores: readonly (string | null | undefined)[],
  limite = MESES_DE_CARRY_FORWARD,
): { valor: string; deMesAnterior: boolean } {
  const agora = valorOuVazio(atual ?? null);
  if (agora) return { valor: agora, deMesAnterior: false };
  for (const v of anteriores.slice(0, limite)) {
    const achado = valorOuVazio(v ?? null);
    if (achado) return { valor: achado, deMesAnterior: true };
  }
  return { valor: '', deMesAnterior: false };
}
