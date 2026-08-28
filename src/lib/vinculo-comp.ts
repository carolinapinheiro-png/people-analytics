/**
 * Liga cada linha de remuneração à sua camada N no organograma.
 *
 * ===========================================================================
 * POR QUE PELO NOME, QUE É A PIOR CHAVE POSSÍVEL
 * ===========================================================================
 * `comp_ratio` veio de uma planilha e tem `name`. O organograma vem do
 * Convenia e tem `corporate_email`. Não há nenhum campo em comum além do
 * nome -- nem id, nem e-mail, nem matrícula.
 *
 * Nome é chave ruim: homônimo existe, grafia varia, nome de casada muda. A
 * alternativa era esperar uma reimportação com a coluna "WorkDay Level", o
 * que deixaria a aba de Salários escondendo tudo até lá.
 *
 * Então casamos pelo nome, mas com a regra que torna isso seguro:
 *
 *   **NA DÚVIDA, NÃO CASA.**
 *
 * Duas pessoas com o mesmo nome normalizado não recebem camada -- nenhuma das
 * duas. Escolher uma seria decidir, no cara ou coroa, quem enxerga o salário
 * de quem. Sem camada, a linha não aparece para ninguém que não seja global,
 * e o custo é uma linha a menos na tela de alguém.
 */

export interface PessoaOrgNome {
  /** Nome como está no Convenia. */
  nome: string;
  camada: string | null;
  /**
   * A chave da pessoa no Convenia.
   *
   * Vai junto da camada para ser GRAVADA na folha -- ver a migração
   * 20260828160000. Depois disso, quem precisa ligar remuneração a cadastro
   * usa um join por chave em vez de refazer o casamento por nome, que já
   * devolveu 0% duas vezes esta semana por defeitos diferentes no mesmo campo.
   */
  convenia_id?: string | null;
}

export interface LinhaComp {
  id: string;
  name: string;
}

export interface ResultadoVinculo {
  /** id da linha de comp -> o que gravar nela. */
  casados: Array<{ id: string; nome: string; camada: string; convenia_id: string | null }>;
  /** Nome não encontrado no organograma. */
  semCorrespondencia: string[];
  /**
   * Nome que aparece mais de uma vez de um dos lados. Recusado de propósito:
   * ver o cabeçalho deste arquivo.
   */
  ambiguos: string[];
  /** Encontrado, mas o organograma não soube dizer a camada (ciclo/cadeia quebrada). */
  semCamadaNaOrigem: string[];
}

/**
 * Chave de comparação.
 *
 * Minúsculas, sem acento, sem pontuação, espaços colapsados. NÃO tenta ser
 * esperta além disso: não remove sobrenome, não tenta apelido, não faz
 * distância de edição. Cada uma dessas "ajudas" aumenta a chance de casar
 * duas pessoas diferentes -- e o preço de casar errado aqui é mostrar o
 * salário de alguém para quem não devia.
 */
export function chaveNome(nome: string | null | undefined): string {
  return (nome ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function vincular(
  linhas: LinhaComp[],
  organograma: PessoaOrgNome[],
): ResultadoVinculo {
  // Índice do organograma. Chave repetida vira "ambígua" e sai do índice --
  // não dá para saber qual das duas pessoas é a da folha.
  const porChave = new Map<string, PessoaOrgNome | 'ambiguo'>();
  for (const p of organograma) {
    const k = chaveNome(p.nome);
    if (!k) continue;
    porChave.set(k, porChave.has(k) ? 'ambiguo' : p);
  }

  // O mesmo do lado da folha: duas linhas com o mesmo nome não podem apontar
  // para a mesma pessoa do organograma.
  const vezesNaFolha = new Map<string, number>();
  for (const l of linhas) {
    const k = chaveNome(l.name);
    if (k) vezesNaFolha.set(k, (vezesNaFolha.get(k) ?? 0) + 1);
  }

  const casados: ResultadoVinculo['casados'] = [];
  const semCorrespondencia: string[] = [];
  const ambiguos: string[] = [];
  const semCamadaNaOrigem: string[] = [];

  for (const l of linhas) {
    const k = chaveNome(l.name);
    if (!k) { semCorrespondencia.push(l.name); continue; }

    if ((vezesNaFolha.get(k) ?? 0) > 1) { ambiguos.push(l.name); continue; }

    const achado = porChave.get(k);
    if (achado === undefined) { semCorrespondencia.push(l.name); continue; }
    if (achado === 'ambiguo') { ambiguos.push(l.name); continue; }
    if (!achado.camada) { semCamadaNaOrigem.push(l.name); continue; }

    casados.push({
      id: l.id, nome: l.name, camada: achado.camada,
      convenia_id: achado.convenia_id ?? null,
    });
  }

  return { casados, semCorrespondencia, ambiguos, semCamadaNaOrigem };
}

/**
 * Uma leitura em português do que o vínculo conseguiu.
 *
 * A taxa de casamento é o número que decide se isto pode ser usado: 95% quer
 * dizer que a aba funciona para quase todo mundo; 60% quer dizer que quatro
 * em cada dez linhas somem da tela sem que ninguém entenda por quê.
 */
export function resumir(r: ResultadoVinculo, total: number): string {
  if (total === 0) return 'Nenhuma linha de remuneração para vincular.';
  const pct = Math.round((r.casados.length / total) * 100);
  const partes = [`${r.casados.length} de ${total} linhas casaram (${pct}%)`];
  if (r.semCorrespondencia.length) partes.push(`${r.semCorrespondencia.length} sem correspondência no Convenia`);
  if (r.ambiguos.length) partes.push(`${r.ambiguos.length} com nome repetido — recusadas de propósito`);
  if (r.semCamadaNaOrigem.length) partes.push(`${r.semCamadaNaOrigem.length} sem camada no organograma`);
  return partes.join(' · ');
}
