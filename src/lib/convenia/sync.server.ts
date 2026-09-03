import type { SupabaseClient } from '@supabase/supabase-js';
import { reconstruirSerie, type LinhaMensal, type PessoaConvenia } from './pessoas';
import { empresaDe, escritorioDe, lerCustomFields } from './custom-fields';
import { detectarColapso } from './colapso';
import { marcaDeEmpresa, empresasNaoReconhecidas } from './marca';

/**
 * Carga do Convenia: cinco empresas, uma série mensal por marca.
 *
 * ===========================================================================
 * ESTA CARGA NÃO SOBRESCREVE NADA
 * ===========================================================================
 * `monthly_metrics` tem `UNIQUE (month, brand, source)` e já guarda duas
 * séries: `raw-data.ts` (a congelada) e `reconstruido`. Esta entra como uma
 * TERCEIRA, com `source = 'convenia'`.
 *
 * Não é excesso de cuidado. A série que está no ar hoje é a que a diretoria
 * viu; trocá-la por uma calculada de outra fonte, sem comparação lado a lado,
 * transformaria qualquer divergência numa descoberta constrangedora em
 * reunião. O card "Comparação de séries" existe justamente para essa decisão
 * ser tomada olhando os números, e não por eu ter gravado por cima.
 *
 * ===========================================================================
 * O QUE ATRAVESSA A REDE, E O QUE FICA
 * ===========================================================================
 * A listagem do Convenia devolve 123 campos por pessoa, incluindo CPF, RG,
 * endereço e conta bancária. O painel precisa de quatro: id, data de admissão,
 * área e status.
 *
 * A redução acontece na primeira linha depois do recebimento, antes de
 * qualquer outra coisa -- os outros 119 campos não entram em variável nomeada,
 * não vão para log e não chegam ao banco. Ainda assim eles TRAFEGAM, e a única
 * forma de impedir isso é restringir os campos do próprio token, no Convenia.
 * Enquanto isso não for feito, esta é a mitigação possível, não a solução.
 */

type Db = SupabaseClient<any, 'public', any>;

/** O mínimo. Tudo que não está aqui é descartado na chegada. */
interface Minimo {
  id: string;
  hiring_date: string | null;
  /** Centro de custo, da listagem. Coluna CC do report da Controladoria. */
  cost_center?: string | null;
  department: { name: string | null } | null;
  status: string | null;
  supervisorId: string | null;
  salary: number | null;
  birth_date: string | null;
  uf: string | null;
  /** Corporativo. Liga a conta do painel a esta pessoa no organograma. */
  email: string | null;
  /** Ponte com a folha de remuneracao, que nao tem e-mail. */
  nome: string | null;
  /** Cargo. Preenche o cadastro de acesso sozinho -- ver `cargoDe`. */
  cargo: string | null;
}

export interface ResumoSyncConvenia {
  gravado: boolean;
  empresas: {
    empresa: string;
    marca: string;
    ativos: number;
    desligados: number;
    cruzaram: number;
    erro: string | null;
  }[];
  pessoasUnicas: number;
  desligadosSemCadastro: number;
  /** Buscados no detalhe individual nesta execução. Cai para ~0 nas próximas. */
  detalhesBuscados: number;
  /** Desligados que nem o detalhe resolveu. Estes ainda subestimam a série. */
  naoResolvidos: number;
  /** Progresso da resolução de gênero, que é feita em lotes. */
  genero: { conhecidos: number; total: number; buscadosAgora: number; pendentes: number };
  linhasPorMarca: { marca: string; linhas: number; de: string | null; ate: string | null }[];
  totalLinhas: number;
  /** Pessoas no organograma. Grava mesmo com a série travada. */
  totalOrg: number;
  /** Motivo, quando a série mensal foi recusada. `null` = seguiu normal. */
  serieTravada: string | null;
  requisicoes: number;
  avisos: string[];
}

/**
 * O Convenia devolve salário ora como número, ora como string no formato
 * brasileiro ("3.218,00"). `Number("3.218,00")` é `NaN`, e um NaN entrando na
 * média a transformaria em NaN inteira -- um campo que some do gráfico sem dar
 * erro. Por isso a conversão é explícita e devolve `null` no que não entender.
 */
function normalizarSalario(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : null;
  if (typeof v !== 'string') return null;
  const limpo = v.trim().replace(/\./g, '').replace(',', '.');
  const n = Number(limpo);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const ehDesligadoPeloStatus = (s: string | null) => {
  if (!s) return false;
  const t = s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return t.includes('deslig') || t.includes('inativ') || t.includes('dismiss');
};

/**
 * O nome completo da pessoa, a partir do que o Convenia devolver.
 *
 * ===========================================================================
 * POR QUE "TEM ESPACO" NAO SIGNIFICA "ESTA COMPLETO"
 * ===========================================================================
 * A primeira versao disto preferia `full_name` sempre que ele tivesse um
 * espaco, e so montava de first/middle/last se nao tivesse. Parecia seguro e
 * nao era: o Convenia guarda o primeiro nome em `name` e o RESTO em
 * `last_name`. A pessoa que na folha e "Tiago Albineli Motta" chegou aqui
 * como "Albineli Motta" -- dois termos, um espaco, aprovada no teste, e
 * truncada pela frente.
 *
 * O casamento com a folha foi de 0 de 606. Antes da correcao anterior tambem
 * era zero, so que por primeiro nome em vez de por ultimo: o numero na tela
 * nao mudou, e sem o cartao de conferencia eu teria concluido que funcionou.
 *
 * ===========================================================================
 * A REGRA
 * ===========================================================================
 * O primeiro nome e `first_name`, ou `name` quando aquele nao vem. Ele MANDA:
 * `full_name` so e aceito se comecar por ele. Qualquer outra coisa e montada
 * na ordem primeiro + meio + resto.
 *
 * A comparacao ignora acento e caixa porque as duas fontes divergem nisso --
 * a folha veio de planilha ("Alvaro") e o Convenia manda "Alvaro" com acento.
 */
const semAcento = (v: string) =>
  v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function nomeCompleto(b: Record<string, unknown>): string | null {
  const txt = (v: unknown) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '');

  const primeiro = txt(b.first_name) || txt(b.name);
  const cheio = txt(b.full_name);

  // `full_name` so vale se contiver o primeiro nome na frente. Sem esta
  // checagem, um `full_name` truncado passa por completo.
  if (cheio && primeiro && semAcento(cheio).startsWith(semAcento(primeiro))) return cheio;
  if (cheio && !primeiro) return cheio || null;

  const resto = [txt(b.middle_name), txt(b.last_name)].filter(Boolean).join(' ');
  // `last_name` as vezes ja vem com o primeiro nome dentro. Concatenar sem
  // olhar produziria "Tiago Tiago Albineli Motta".
  if (resto && primeiro && semAcento(resto).startsWith(semAcento(primeiro))) return resto;

  const montado = [primeiro, resto].filter(Boolean).join(' ');
  // Devolve `null` no vazio, e nao "": `vinculo-comp` trata ausencia como
  // "nao casa", mas duas chaves vazias casariam entre si.
  return montado || null;
}

/**
 * O cargo da pessoa, a partir do que o Convenia devolver.
 *
 * ===========================================================================
 * DEFENSIVO DE PROPOSITO
 * ===========================================================================
 * Nao sei em qual campo o Convenia guarda o cargo, e esta semana ja custou
 * duas rodadas eu supor o nome de um campo dele (`full_name` primeiro veio
 * sem sobrenome, depois sem o primeiro nome). Entao tenta os nomes plausiveis,
 * aceita objeto com `name` ou string direta, e o sync AVISA quando quase todos
 * vierem vazios.
 *
 * Vazio nao quebra nada: o campo Cargo continua digitavel. O pior caso e o
 * de hoje, em que ele ja e digitado a mao.
 */
export function cargoDe(b: Record<string, unknown>): string | null {
  const texto = (v: unknown): string => {
    if (typeof v === 'string') return v.trim();
    if (v && typeof v === 'object' && 'name' in v) {
      const n = (v as { name?: unknown }).name;
      return typeof n === 'string' ? n.trim() : '';
    }
    return '';
  };
  for (const campo of ['job_title', 'jobTitle', 'role', 'position', 'office', 'cargo', 'job']) {
    const v = texto(b[campo]);
    if (v) return v;
  }
  return null;
}

/** Quantos nomes vieram com um unico termo -- ou seja, sem sobrenome. */
export function soPrimeiroNome(nomes: Array<string | null>): number {
  return nomes.filter((n) => n != null && !n.trim().includes(' ')).length;
}

export async function executarSyncConvenia(
  db: Db,
  { confirm, origem }: { confirm: boolean; origem: string },
): Promise<ResumoSyncConvenia> {
  // FORA DO `try` DE PROPOSITO. Antes esta variavel vivia dentro dele, e o
  // `catch` final nao a enxergava -- entao o log de uma carga que falhou
  // gravava so a mensagem de erro, com `requests` no default.
  //
  // Em 17/08 isso fez a carga parecer que nunca tinha chamado o Convenia
  // (`requests = 0`) quando na verdade tinha feito centenas de chamadas e
  // morrido na ultima etapa. Um log que mente sobre o que aconteceu custa
  // mais caro que a falha que ele deveria descrever.
  let requisicoes = 0;

  const { data: logRow } = await db.from('integration_sync_log').insert({
    provider: 'convenia', status: 'running', triggered_by: origem,
  }).select('id').maybeSingle();
  const logId = (logRow as { id?: string } | null)?.id ?? null;

  const encerrar = async (status: string, campos: Record<string, unknown>) => {
    if (!logId) return;
    await db.from('integration_sync_log')
      .update({ status, finished_at: new Date().toISOString(), ...campos })
      .eq('id', logId);
  };

  try {
    const { fontesConfiguradas } = await import('./fontes');
    const { ConveniaClient } = await import('./client.server');
    const { EMPLOYEES, EMPLOYEES_DISMISSED, EMPLOYEE_DETAIL } = await import('./paths');
    const { mesDe, ehVoluntaria, normalizarGenero } = await import('./pessoas');

    // O cache do que já foi resolvido. Uma pessoa desligada não muda de data
    // de admissão nem de área, então buscar de novo seria expor cadastro
    // pessoal para reconfirmar um dado imutável.
    const { data: jaResolvidos } = await db
      .from('convenia_leavers')
      .select('convenia_id, hiring_month, department, dismissal_month, marca');
    const cache = new Map<string, { hiring_month: string | null; department: string | null }>(
      ((jaResolvidos ?? []) as { convenia_id: string; hiring_month: string | null; department: string | null }[])
        .map((r) => [r.convenia_id, { hiring_month: r.hiring_month, department: r.department }]),
    );
    let buscadosAgora = 0;
    let naoResolvidos = 0;

    // ------------------------------------------------------------------
    // GÊNERO, EM LOTES
    // ------------------------------------------------------------------
    // Só existe no detalhe individual: 638 pessoas a 1,3s são ~14 minutos, o
    // que estoura o tempo do agendador. Então cada execução resolve um lote e
    // guarda; a seguinte continua de onde parou.
    //
    // Converge sozinho em algumas semanas, ou na hora se alguém clicar algumas
    // vezes seguidas. O importante é que o progresso seja VISÍVEL -- daí o
    // contador de pendentes no resumo -- em vez de a série ficar
    // silenciosamente incompleta.
    const LOTE_GENERO = 200;
    const { data: pessoasCache } = await db
      .from('convenia_pessoas')
      .select('convenia_id, gender, race, job_title, job_title_em, empresa, escritorio, custom_fields');
    const cacheGenero = new Map<string, 'F' | 'M' | null>(
      ((pessoasCache ?? []) as { convenia_id: string; gender: string | null }[])
        .map((r) => [r.convenia_id, (r.gender as 'F' | 'M' | null) ?? null]),
    );
    // A raça já era GRAVADA em `convenia_pessoas` desde que o gênero entrou --
    // e nunca era LIDA de volta. Ficava 772 linhas preenchidas no banco
    // enquanto a tabela do DEI não renderizava por falta do agregado.
    //
    // Cache próprio, e não um campo a mais no de gênero, porque o de gênero
    // decide QUEM BUSCAR no detalhe: `cacheGenero.has(id)` significa "já
    // perguntei por esta pessoa". Raça e gênero vêm da mesma requisição, então
    // as duas chegam juntas ou nenhuma chega.
    const cacheRaca = new Map<string, string | null>(
      ((pessoasCache ?? []) as { convenia_id: string; race: string | null }[])
        .map((r) => [r.convenia_id, r.race ?? null]),
    );
    // ------------------------------------------------------------------
    // O CARGO TAMBEM SO EXISTE NO DETALHE -- E ISSO CUSTOU UMA CARGA INTEIRA
    // ------------------------------------------------------------------
    // `cargoDe` foi escrito para ler o payload da LISTAGEM, tentando sete
    // nomes de campo. Nenhum deles existe la. Medido em 01/09, com a sync ja
    // rodada: 0 de 638 pessoas com cargo em `org_pessoas`.
    //
    // O aviso de ">50% sem cargo" existia e teria disparado. O que nao
    // aconteceu foi alguem reparar, porque o efeito visivel -- campo Cargo em
    // branco no cadastro -- era identico ao comportamento anterior. Ausencia
    // que se parece com o estado de ontem nao chama atencao.
    //
    // Nao custa requisicao nova: o laco de genero JA busca esse detalhe e
    // descarta o resto da resposta. O cargo sai da mesma chamada.
    const cacheCargo = new Map<string, string | null>(
      ((pessoasCache ?? []) as { convenia_id: string; job_title: string | null }[])
        .map((r) => [r.convenia_id, r.job_title ?? null]),
    );
    // ------------------------------------------------------------------
    // A MARCA DA PERGUNTA, SEPARADA DA RESPOSTA
    // ------------------------------------------------------------------
    // `cacheCargo.has(id)` NAO serve para saber se ja perguntamos: as 805
    // linhas de `convenia_pessoas` foram gravadas pelo laco de GENERO, que
    // nunca leu cargo. Todas tem `job_title` nulo, e nenhuma delas e uma
    // resposta -- sao ausencias de pergunta.
    //
    // Sem essa distincao, "nao veio cargo" vira "o Convenia nao tem cargo", e
    // foi exatamente isso que a tela de cadastro passou a afirmar em amarelo.
    // Empresa e escritório vêm de `custom_fields`, no mesmo detalhe individual.
    // Ver custom-fields.ts: "Empresa" é a marca, "Escritório" é a localidade, e
    // são campos distintos -- juntá-los devolveria o que viesse primeiro.
    const cacheEmpresa = new Map<string, string | null>(
      ((pessoasCache ?? []) as { convenia_id: string; empresa: string | null }[])
        .map((r) => [r.convenia_id, r.empresa ?? null]),
    );
    const cacheEscritorio = new Map<string, string | null>(
      ((pessoasCache ?? []) as { convenia_id: string; escritorio: string | null }[])
        .map((r) => [r.convenia_id, r.escritorio ?? null]),
    );
    // ------------------------------------------------------------------
    // "JA LIDO" MUDA DE SIGNIFICADO A CADA CAMPO NOVO
    // ------------------------------------------------------------------
    // `job_title_em` marcava "li este cadastro com o codigo que le cargo". As
    // 636 pessoas ganharam essa marca ontem -- e hoje o codigo passou a
    // guardar `custom_fields`, `cost_center` e `hiring_date`, que nenhuma
    // delas tem.
    //
    // Com o criterio antigo, ninguem seria relido: a carga acharia que ja
    // perguntou, os campos novos ficariam nulos para sempre, e a unica pista
    // seria o report da Controladoria saindo com metade das colunas vazias --
    // que se leria como "o Convenia nao tem", pela terceira vez esta semana.
    //
    // `custom_fields is null` e a marca certa AGORA, porque e o campo mais
    // novo. No dia em que entrar outro, o criterio muda de novo -- e vale a
    // pena que mude, em vez de a carga mentir que ja perguntou.
    const cadastroCompleto = new Set(
      ((pessoasCache ?? []) as { convenia_id: string; custom_fields: unknown }[])
        .filter((r) => r.custom_fields != null).map((r) => r.convenia_id),
    );
    const cargoBuscado = new Set(
      ((pessoasCache ?? []) as { convenia_id: string; job_title_em: string | null }[])
        .filter((r) => r.job_title_em != null).map((r) => r.convenia_id),
    );
    // Quem já foi buscado e voltou sem gênero não é buscado de novo: a linha
    // existe no cache com valor nulo, e isso é a resposta, não uma falha.
    let generoBuscadosAgora = 0;

    const avisos: string[] = [];
    const porMarca = new Map<string, PessoaConvenia[]>();
    // Organograma de TODAS as empresas junto: a cadeia de reporte atravessa
    // as fontes (alguem da Betfair pode reportar a alguem da NSX), e calcular
    // empresa por empresa criaria topos falsos.
    const orgTodos: Array<{
      id: string; supervisorId: string | null; email: string | null;
      department: string | null; nome: string | null; cargo: string | null;
    }> = [];
    const empresas: ResumoSyncConvenia['empresas'] = [];
    let desligadosSemCadastro = 0;

    for (const f of fontesConfiguradas()) {
      const linha = { empresa: f.empresa, marca: f.marca, ativos: 0, desligados: 0, cruzaram: 0, erro: null as string | null };

      try {
        const client = ConveniaClient.paraToken(f.token!);

        const brutos = await client.listarTudo<Record<string, unknown>>(EMPLOYEES, {
          porPagina: 100, aoAvisar: (a) => avisos.push(`${f.empresa}: ${a}`),
        });

        // A REDUÇÃO. Daqui para baixo os outros 119 campos não existem mais.
        const pessoas: Minimo[] = brutos.map((b) => {
          const sup = b.supervisor as { id?: string } | null;
          const end = b.address as { state?: string } | null;
          const sal = b.salary;
          return {
            id: String(b.id ?? ''),
            hiring_date: (b.hiring_date as string) ?? null,
            // Ja vem na listagem, de graca. "GERALL" e o valor nao-migrado.
            cost_center: typeof b.cost_center === 'string' ? b.cost_center : null,
            department: (b.department as { name: string | null }) ?? null,
            status: (b.status as string) ?? null,
            supervisorId: sup?.id ? String(sup.id) : null,
            // E-mail corporativo: a UNICA ponte entre uma conta do painel e a
            // posicao da pessoa no organograma. Entra na reducao porque sem
            // ele a camada N teria de continuar sendo digitada a mao -- e
            // digitada a mao ela envelhece calada a cada promocao.
            email: ((b.corporate_email ?? b.email) as string | null) ?? null,
            // ------------------------------------------------------------
            // NOME COMPLETO, E NESTA ORDEM
            // ------------------------------------------------------------
            // Unica ponte com `comp_ratio`, que veio de planilha e nao tem
            // e-mail. Ver vinculo-comp.ts e a migracao 20260814210000.
            //
            // Estava `b.name ?? b.full_name`, e `name` no Convenia e o
            // PRIMEIRO NOME. O banco encheu de "Barbara", "Joao" -- e
            // `vinculo-comp` compara nome completo normalizado, entao casava
            // quase nada. A aba de Salarios escondia linhas por falta de
            // camada, e o motivo aparente era "o Convenia nao mandou".
            //
            // Medido antes de mexer, sobre as 62 pessoas com promocao:
            //   por primeiro nome ............ 15 unicas, 46 ambiguas
            //   primeiro nome + area ......... 34 unicas, 25 ambiguas
            //
            // Nenhuma das duas serve, e a segunda e pior do que parece: quem
            // fica de fora sao os primeiros nomes comuns, e distribuicao de
            // nome correlaciona com grupo demografico. Descartar 45% de forma
            // nao-aleatoria na dimensao que se quer medir fabrica diferenca.
            nome: nomeCompleto(b),
            cargo: cargoDe(b),
            // O Convenia manda salário ora número, ora string ("3.218,00").
            // Number() em "3.218,00" dá NaN, que viraria média silenciosamente
            // errada -- por isso a normalização explícita.
            salary: normalizarSalario(sal),
            birth_date: (b.birth_date as string) ?? null,
            uf: end?.state?.trim() || null,
          };
        });

        const deslBrutos = await client.listarTudo<Record<string, unknown>>(EMPLOYEES_DISMISSED, {
          porPagina: 100, aoAvisar: (a) => avisos.push(`${f.empresa}: ${a}`),
        });
        const saidas = deslBrutos.map((b) => {
          const d = (b.dismissal ?? {}) as { date?: string; type?: { title?: string } };
          return { id: String(b.id ?? ''), data: d.date ?? null, tipo: d.type?.title ?? null };
        });

        linha.ativos = pessoas.length;
        linha.desligados = saidas.length;

        for (const p of pessoas) {
          orgTodos.push({
            id: p.id, supervisorId: p.supervisorId, email: p.email,
            department: p.department?.name ?? null, nome: p.nome, cargo: p.cargo,
          });
        }

        const porId = new Map(pessoas.map((p) => [p.id, p]));
        const registros: PessoaConvenia[] = pessoas.map((p) => ({
          id: p.id, hiring_date: p.hiring_date, department: p.department, status: p.status,
          cost_center: p.cost_center ?? null,
          supervisorId: p.supervisorId, salary: p.salary, birth_date: p.birth_date, uf: p.uf,
          genero: cacheGenero.get(p.id) ?? null,
          raca: cacheRaca.get(p.id) ?? null,
        }));


        for (const s of saidas) {
          const achado = porId.get(s.id);
          if (achado) {
            linha.cruzaram++;
            const r = registros.find((x) => x.id === s.id)!;
            r.dataSaida = s.data;
            r.tipoSaida = s.tipo;
          } else {
            // Não está no cadastro de ativos -- confirmado: são bases
            // separadas, 0 de 164 cruzaram. A admissão e a área só existem no
            // detalhe individual, e é a única forma de a série não ficar
            // subestimada em 20%.
            desligadosSemCadastro++;

            let dados = cache.get(s.id);
            if (!dados) {
              try {
                const envelope = await client.get<Record<string, unknown>>(EMPLOYEE_DETAIL(s.id));

                // DESEMBRULHAR O ENVELOPE. O Convenia responde
                // `{ message, data, success }` em tudo. As listagens passam por
                // `extrairPagina`, que já faz isso; aqui eu li o envelope
                // direto e `hiring_date` era sempre undefined.
                //
                // O erro não deu erro: gravou 164 caches com admissão nula, e
                // o cache os devolveria assim para sempre. Um bug que se
                // disfarça de resposta é pior que um que estoura.
                const det = (envelope?.data ?? envelope) as Record<string, unknown>;

                // A REDUÇÃO, na linha seguinte à chegada. Dos 123 campos que
                // vieram, dois seguem adiante; os outros -- CPF, RG, endereço,
                // conta bancária -- morrem aqui.
                const mesAdmissao = mesDe(det.hiring_date as string);
                const area = ((det.department as { name?: string })?.name ?? null);

                // SÓ GUARDA O QUE SERVE. Cachear um nulo transformaria uma
                // falha temporária em permanente: a pessoa nunca mais seria
                // buscada, e a série carregaria o buraco para sempre.
                if (!mesAdmissao) {
                  naoResolvidos++;
                  registros.push({
                    id: s.id, hiring_date: null, department: area ? { name: area } : null,
                    dataSaida: s.data, tipoSaida: s.tipo,
                  });
                  continue;
                }

                dados = { hiring_month: mesAdmissao, department: area };
                cache.set(s.id, dados);
                buscadosAgora++;

                await db.from('convenia_leavers').upsert({
                  convenia_id: s.id,
                  empresa: f.empresa,
                  marca: f.marca,
                  hiring_month: mesAdmissao,
                  dismissal_month: mesDe(s.data),
                  department: area,
                  dismissal_type: s.tipo,
                  voluntary: ehVoluntaria(s.tipo),
                }, { onConflict: 'convenia_id' });
              } catch {
                // Uma pessoa que falha não derruba a carga. Ela fica sem
                // admissão, e o resumo diz quantas ficaram.
                naoResolvidos++;
              }
            }

            registros.push({
              id: s.id,
              // O cache guarda MÊS, não data. A série é mensal, e guardar o
              // dia daria uma precisão que ninguém usa.
              hiring_date: dados?.hiring_month ? `${dados.hiring_month}-01` : null,
              department: dados?.department ? { name: dados.department } : null,
              dataSaida: s.data,
              tipoSaida: s.tipo,
            });
          }
        }

        // ------------------------------------------------------------------
        // O GÊNERO É RESOLVIDO AQUI, DEPOIS DAS SAÍDAS -- E A ORDEM É O PONTO
        // ------------------------------------------------------------------
        // Este bloco já esteve acima do laço de saídas. A lista de alvos saía
        // de `registros`, que naquele momento tinha só os ativos: os
        // desligados ainda não tinham sido acrescentados.
        //
        // O resultado foi 638 pessoas resolvidas de 802, e o efeito visível
        // foi o percentual de gênero existir em 15 dos 272 meses -- porque nos
        // meses antigos a maioria das pessoas presentes já saiu.
        //
        // Nada falhou. A correção estava escrita e certa; só rodava cedo
        // demais.
        // Resolve um lote de gênero para quem ainda não está no cache.
        //
        // Inclui QUEM JÁ SAIU, e isso importa mais do que parece: nos meses
        // antigos a maioria das pessoas presentes já foi embora. Resolvendo só
        // os ativos, a cobertura de 2019 fica perto de zero e o percentual de
        // gênero some justamente onde a série é mais longa -- foi o que
        // aconteceu na primeira rodada, 15 meses com percentual de 272.
        // ------------------------------------------------------------------
        // QUEM BUSCAR: NAO E MAIS "QUEM NAO TEM GENERO"
        // ------------------------------------------------------------------
        // O detalhe individual passou a trazer TRES coisas alem de genero e
        // raca: cargo, empresa e escritorio. As 781 pessoas ja resolvidas foram
        // lidas por codigo que nao olhava para nenhuma das tres -- entao "tem
        // genero" deixou de significar "ja perguntei tudo o que preciso".
        //
        // `job_title_em` e a marca de "li este cadastro com o codigo atual".
        // Quem nao a tem entra na fila, mesmo com genero resolvido. Sao ~638
        // releituras uma unica vez, em lotes de 200 -- tres ou quatro execucoes
        // e converge, e depois volta a ser ~0 por carga.
        const semGenero = registros.filter(
          (x) => !cacheGenero.has(x.id) || !cargoBuscado.has(x.id) || !cadastroCompleto.has(x.id),
        );
        for (const alvo of semGenero) {
          if (generoBuscadosAgora >= LOTE_GENERO) break;
          try {
            const env2 = await client.get<Record<string, unknown>>(EMPLOYEE_DETAIL(String(alvo.id)));
            const det2 = (env2?.data ?? env2) as Record<string, unknown>;
            // Dos 123 campos, três seguem adiante. `gender` é a identidade de
            // gênero; `gender_document` seria o do documento, e usar aquele é
            // deliberado -- o painel fala de pessoas, não de cartórios.
            const g = normalizarGenero(
              (det2.gender as { name?: string } | string | null) &&
              (typeof det2.gender === 'string' ? det2.gender : (det2.gender as { name?: string })?.name),
            );
            const raca = (det2.ethnicity as { name?: string } | null)?.name ?? null;
            // Mesma resposta, mais um campo lido. `cargoDe` continua tentando
            // os sete nomes: aqui ela finalmente tem onde encontrar.
            const cargo = cargoDe(det2);
            const empresa = empresaDe(det2);
            const escritorio = escritorioDe(det2);
            cacheGenero.set(alvo.id, g);
            cacheRaca.set(alvo.id, raca);
            cacheCargo.set(alvo.id, cargo);
            cacheEmpresa.set(alvo.id, empresa);
            cacheEscritorio.set(alvo.id, escritorio);
            cargoBuscado.add(alvo.id);
            cadastroCompleto.add(alvo.id);
            // ------------------------------------------------------------
            // O CADASTRO INTEIRO, E NAO TRES CAMPOS ESCOLHIDOS A DEDO
            // ------------------------------------------------------------
            // Esta requisicao ja aconteceu. Ate agora ela rendia genero, raca,
            // cargo, empresa e escritorio, e o resto da resposta ia embora --
            // e cada vez que alguem precisava de mais um campo era migracao
            // nova, mexida na carga e 638 detalhes de novo. Aconteceu tres
            // vezes seguidas, pelo mesmo motivo.
            //
            // O report da Controladoria pede dez campos personalizados. Em vez
            // de criar dez colunas, guarda-se a lista como ela vem: campo novo
            // que o RH criar amanha ja entra.
            const personalizados = lerCustomFields(det2.custom_fields);
            generoBuscadosAgora++;
            await db.from('convenia_pessoas').upsert({
              convenia_id: alvo.id,
              gender: g,
              race: raca,
              job_title: cargo,
              empresa,
              escritorio,
              custom_fields: personalizados,
              // Estes tres vem da LISTAGEM, nao do detalhe -- sao de graca e
              // chegam para todo mundo em toda carga. Ficam aqui so porque e
              // aqui que a linha da pessoa e gravada.
              cost_center: typeof alvo.cost_center === 'string' ? alvo.cost_center : null,
              hiring_date: alvo.hiring_date || null,
              status: alvo.status ?? null,
              // Marca a PERGUNTA. Com cargo nulo e esta data preenchida, a
              // ausencia passa a ser uma resposta do Convenia -- e so entao
              // alguem pode dizer "nao esta preenchido la".
              job_title_em: new Date().toISOString(),
              birth_month: mesDe(alvo.birth_date ?? null),
            }, { onConflict: 'convenia_id' });
          } catch {
            // Falhou: NÃO entra no cache, para a próxima execução tentar de novo.
            break;
          }
        }

        // Reaplica o que acabou de ser resolvido.
        for (const r of registros) {
          r.genero = cacheGenero.get(r.id) ?? null;
          r.raca = cacheRaca.get(r.id) ?? null;
        }

        // ------------------------------------------------------------------
        // A MARCA SAI DO CADASTRO, COM O TOKEN COMO RESERVA
        // ------------------------------------------------------------------
        // Até 31/08 a marca era o token, e só. A unificação de bases acabou com
        // isso: um token devolve todo mundo, e a marca passou a ser o campo
        // `Empresa` do cadastro de cada pessoa.
        //
        // O token continua valendo como RESERVA, e isso não é indecisão. Hoje
        // 39% dos cadastros estão sem `Empresa` -- a migração do RH está em
        // curso --, e sem reserva essas pessoas ficariam sem marca nenhuma,
        // fora de toda a série. Cair na marca do token é o comportamento de
        // ontem, que era correto enquanto cada token era uma empresa.
        //
        // O que NÃO acontece é valor desconhecido virar marca nova: `marcaDeEmpresa`
        // devolve null nesses casos e a reserva assume. Uma entidade nova
        // criada pelo RH aparece como aviso, não como uma quarta marca no
        // painel.
        for (const r of registros) {
          const doCadastro = marcaDeEmpresa(cacheEmpresa.get(r.id));
          const marca = doCadastro ?? f.marca;
          const lista = porMarca.get(marca) ?? [];
          lista.push(r);
          porMarca.set(marca, lista);
        }
        // Contado DEPOIS do laço de detalhes: antes, as ~164 buscas
        // individuais não entravam na conta e o número parecia baixo demais
        // para o que a carga realmente fez.
        requisicoes += client.stats.requests;
      } catch (e) {
        linha.erro = e instanceof Error ? e.message : String(e);
        avisos.push(`${f.empresa} falhou: ${linha.erro}. As outras empresas continuam, mas a série desta marca fica incompleta.`);
      }

      empresas.push(linha);
    }

    const hoje = new Date();
    const ateMes = `${hoje.getUTCFullYear()}-${String(hoje.getUTCMonth() + 1).padStart(2, '0')}`;

    const todasLinhas: LinhaMensal[] = [];
    const linhasPorMarca: ResumoSyncConvenia['linhasPorMarca'] = [];

    for (const [marca, pessoas] of porMarca) {
      const { linhas, resumo } = reconstruirSerie(pessoas, marca, ateMes);
      todasLinhas.push(...linhas);
      linhasPorMarca.push({
        marca, linhas: linhas.length,
        de: linhas[0]?.month ?? null,
        ate: linhas.at(-1)?.month ?? null,
      });
      for (const a of resumo.avisos) avisos.push(`${marca}: ${a}`);
    }

    // Sinal de sanidade: se o status já marca quem saiu, cruzar com a listagem
    // de desligados poderia contar a mesma saída duas vezes. Aqui a saída vem
    // SÓ da listagem de desligados, então não há dupla contagem -- mas se o
    // status disser outra coisa, vale saber.
    const pessoasTodas = [...porMarca.values()].flat();
    const marcadosNoStatus = pessoasTodas.filter((p) => ehDesligadoPeloStatus(p.status ?? null)).length;
    const comSaida = pessoasTodas.filter((p) => p.dataSaida != null).length;
    // Gênero e raça NÃO vêm na listagem -- só no detalhe individual, uma
    // requisição por pessoa. Com 638 ativos seriam ~13 minutos, o que estoura o
    // tempo do agendador. Ficam de fora por ora, e o aviso existe para que a
    // ausência seja uma decisão visível e não um esquecimento.
    //
    // AS TRES CONTAGENS SAEM DA MESMA POPULACAO -- E ISSO E O PONTO.
    // Antes o numerador contava gênero em TODO MUNDO (802, desligados
    // inclusive) e o denominador só nos ativos (635), o que imprimia
    // "Gênero: 778 de 635 resolvidos". Um numerador maior que o denominador
    // nao e so feio: faz o leitor duvidar do resto do resumo, que estava certo.
    //
    // A resolucao em si CONTINUA incluindo quem ja saiu -- isso e deliberado,
    // ver o comentario no laco de genero. O que se alinha aqui e apenas a
    // contagem exibida.
    const ativos = [...porMarca.values()].flat().filter((x) => x.dataSaida == null);
    const totalAtivos = ativos.length;
    const comGenero = ativos.filter((x) => x.genero != null).length;
    const pendentes = Math.max(0, totalAtivos - ativos.filter((x) => cacheGenero.has(x.id)).length);

    if (pendentes > 0) {
      avisos.push(`Gênero: ${comGenero} de ${totalAtivos} pessoas resolvidas, ${pendentes} pendentes. A resolução é em lotes de ${LOTE_GENERO} por execução — rode de novo para avançar, ou deixe o agendamento semanal convergir. Enquanto a cobertura estiver abaixo de 90%, as CONTAGENS aparecem mas os PERCENTUAIS ficam nulos, porque percentual sobre amostra parcial é afirmação sobre o todo.`);
    }

    if (buscadosAgora > 0) {
      avisos.push(`${buscadosAgora} desligados foram buscados um a um para recuperar admissão e área. Eles ficam guardados, então a próxima execução não repete a busca.`);
    }
    if (naoResolvidos > 0) {
      avisos.push(`${naoResolvidos} desligados não foram resolvidos nem pelo detalhe — continuam fora do headcount dos meses em que estavam lá. Não ficam em cache, então a próxima execução tenta de novo.`);
    }
    if (marcadosNoStatus && Math.abs(marcadosNoStatus - comSaida) > comSaida * 0.1) {
      avisos.push(`O campo status marca ${marcadosNoStatus} pessoas como desligadas, mas a listagem de desligados traz ${comSaida}. A diferença merece um olhar antes de promover esta série a oficial.`);
    }

    // ========================================================================
    // O CENSO DE EMPRESA E ESCRITORIO
    // ========================================================================
    // Estava dentro do bloco do organograma, que só roda quando a gravação é
    // confirmada. Só que a trava abaixo zera a série, o botão "Gravar" some, e
    // a prévia passa a ser o único caminho alcançável -- justo o caminho em que
    // o censo não aparecia. O número que a decisão depende ficava escondido
    // atrás de um botão que a própria trava apagava.
    //
    // Ele não precisa de gravação nenhuma: sai de `orgTodos` e dos caches, que
    // a prévia já preenche.
    //
    // A conta só vale sobre quem JÁ FOI LIDO com o código atual. Misturar quem
    // está na fila faria a cobertura parecer baixa por atraso de lote, que é
    // outra conversa -- o mesmo cuidado do aviso de cargo.
    const lidos = orgTodos.filter((p) => cargoBuscado.has(p.id));
    if (lidos.length) {
      const comEmpresa = lidos.filter((p) => cacheEmpresa.get(p.id)).length;
      const comEscritorio = lidos.filter((p) => cacheEscritorio.get(p.id)).length;
      const naFila = orgTodos.length - lidos.length;
      const pct = (n: number) => Math.round((n / lidos.length) * 100);
      avisos.push(
        `Censo de custom_fields: de ${lidos.length} cadastros ja lidos, ` +
        `Empresa preenchida em ${comEmpresa} (${pct(comEmpresa)}%) e ` +
        `Escritorio em ${comEscritorio} (${pct(comEscritorio)}%).` +
        (naFila > 0 ? ` Faltam ${naFila} na fila -- rode de novo.` : '') +
        ' A marca so deve passar a sair do cadastro quando Empresa estiver perto de 100%:' +
        ' com cobertura parcial, quem estiver sem o campo cai numa marca nula.',
      );
      // ------------------------------------------------------------------
      // O DE-PARA TEM QUE DIZER O QUE NAO RECONHECEU, POR NOME
      // ------------------------------------------------------------------
      // Um contador de "N ficaram de fora" nao da para agir. Um nome, sim: e
      // o RH escrevendo a entidade de um jeito que a tabela nao previu, ou uma
      // empresa nova de verdade. As duas exigem uma decisao humana, e nenhuma
      // pode virar marca sozinha.
      const desconhecidas = empresasNaoReconhecidas(lidos.map((p) => cacheEmpresa.get(p.id)));
      if (desconhecidas.length) {
        avisos.push(
          `Empresa: ${desconhecidas.length} valor(es) do cadastro nao estao no de-para de marcas: ` +
          `${desconhecidas.join(', ')}. Essas pessoas caem na marca do TOKEN por reserva -- nada ` +
          'vira marca nova sozinho. Se alguma dessas for uma marca de verdade, ela precisa entrar ' +
          'em `FRAGMENTOS` (ver marca.ts) antes de aparecer no painel.',
        );
      }

      // Quantas pessoas ja tem marca vinda do CADASTRO, e nao do token. E este
      // numero -- nao a cobertura bruta de `Empresa` -- que diz o quanto a
      // serie ja depende da fonte nova.
      const comMarcaDoCadastro = lidos.filter((p) => marcaDeEmpresa(cacheEmpresa.get(p.id))).length;
      avisos.push(
        `Marca pelo cadastro: ${comMarcaDoCadastro} de ${lidos.length} pessoas ` +
        `(${Math.round((comMarcaDoCadastro / lidos.length) * 100)}%). As demais caem na marca do ` +
        'token, que e o comportamento anterior. Enquanto Betfair BR e Flutter International nao ' +
        'aparecerem no campo `Empresa` de ninguem, a trava continua recusando a serie: elas ' +
        'existem no historico e a carga nao consegue reproduzi-las.',
      );

      const valoresEmpresa = new Set(lidos.map((p) => cacheEmpresa.get(p.id)).filter(Boolean));
      if (comEmpresa && valoresEmpresa.size === 1) {
        avisos.push(
          `Atencao: Empresa tem um valor unico ("${[...valoresEmpresa][0]}") em todos os cadastros ` +
          'lidos. Existe, mas nao distingue -- como marca, colapsaria a serie inteira numa marca so.',
        );
      }
    }

    // ========================================================================
    // A TRAVA DA UNIFICACAO DE BASES
    // ========================================================================
    // O Convenia esta unificando as pessoas juridicas numa base so (NSX Brasil
    // Recife), com o escritorio passando a ser um campo do CADASTRO de cada
    // pessoa. Enquanto a migracao corre, uma carga rodada no meio dela
    // reescreve a serie inteira -- e reescreve de um jeito que continua
    // parecendo certo.
    //
    // O MECANISMO, porque ele nao e obvio:
    //
    // A marca nao vem da pessoa, vem do TOKEN (ver fontes.ts: cinco tokens,
    // tres marcas). Quando todo mundo migra para um token so:
    //
    //   - o token da Betfair passa a devolver zero pessoa. `reconstruirSerie`
    //     nao gera linha nenhuma, o upsert nao toca nada, e as linhas
    //     historicas de "Betfair BR" FICAM na tabela -- esta carga nunca apaga;
    //   - o token unificado devolve todo mundo, e a serie do NSX e
    //     reconstruida a partir da data de admissao de cada um. As mesmas 55
    //     pessoas de Betfair e Flutter passam a existir DENTRO do NSX, em
    //     todos os meses para tras.
    //
    // O `combined` da tela soma as marcas pelo NOME (helpers.ts). Resultado:
    // 55 pessoas contadas duas vezes, retroativamente, com o total ainda
    // plausivel. Ou, no outro sentido, as marcas antigas param de ter linha
    // nos meses novos e o total despenca 55 de um mes para o outro, com cara
    // de demissao em massa.
    //
    // Nos dois casos ninguem tem motivo para desconfiar. Por isso a trava
    // ABORTA a gravacao da serie em vez de avisar: um aviso ao lado de um
    // numero errado ja gravado nao desfaz o numero.
    //
    // O organograma (camada N) continua gravando -- ele e por pessoa, nao por
    // marca, e nao sofre com a unificacao.
    const marcasVivas = new Set(todasLinhas.map((l) => l.brand));
    const { data: marcasNoBanco } = await db
      .from('monthly_metrics')
      .select('brand, month, headcount')
      .eq('source', 'convenia');
    const gravadas = ((marcasNoBanco ?? []) as Array<{
      brand: string; month: string; headcount: number | null;
    }>).map((r) => ({ brand: r.brand, month: r.month, headcount: r.headcount ?? 0 }));
    const marcasHistoricas = new Set(gravadas.map((r) => r.brand));
    const sumiram = [...marcasHistoricas].filter((m) => !marcasVivas.has(m));

    // ------------------------------------------------------------------
    // SUMIR E ENCOLHER SAO DOIS CASOS, E EU SO TRATAVA UM
    // ------------------------------------------------------------------
    // Na execucao de 01/09 a Betfair BR tinha ZERO ativos e ainda assim
    // produziu 24 meses de serie: a listagem de DESLIGADOS devolve 7 pessoas
    // dela, e a reconstrucao monta os meses a partir de quem quer que apareca.
    // Sete desligados bastam para a marca "existir" -- e o headcount de agosto
    // ia de 34 para perto de zero sem a trava piscar.
    //
    // Naquela carga a gravacao foi abortada assim mesmo, por causa da Flutter
    // International. Ou seja: a protecao funcionou por SORTE. Se o token da
    // Flutter tambem parar de devolver desligados, nao sobra nada para
    // disparar, e a Betfair cai de 34 para 2 num painel que continua abrindo.
    const colapsos = detectarColapso(
      todasLinhas.map((l) => ({ brand: l.brand, month: l.month, headcount: l.headcount })),
      gravadas,
    );

    let serieTravada: string | null = null;

    // Encolhimento vem primeiro: e o caso mais silencioso dos dois.
    if (colapsos.length) {
      const lista = colapsos
        .map((c) => `${c.brand} de ${c.gravado} para ${c.novo} em ${c.month.slice(0, 7)}`)
        .join('; ');
      const recado =
        `Serie NAO gravada: ${lista}. Uma marca perdeu mais da metade do headcount de uma carga ` +
        'para a outra no mesmo mes. Com a unificacao de bases em curso, o mais provavel e que as ' +
        'pessoas tenham migrado para a base unica e esta marca esteja sendo remontada so a partir ' +
        'da listagem de desligados -- o que zera o headcount dela e recontam as mesmas pessoas ' +
        'dentro da marca que as recebeu. Se a queda for real (encerramento, corte), rode de novo ' +
        'apos confirmar: a trava so olha para o tamanho, nao sabe distinguir os dois.';
      avisos.push(recado);
      serieTravada = recado;
      todasLinhas.length = 0;
    }

    if (sumiram.length && marcasVivas.size && !serieTravada) {
      // `marcasVivas.size` no teste: se NADA voltou, o problema e outro (token
      // vencido, API fora) e ja existe erro por empresa para isso. A assinatura
      // da migracao e ESPECIFICA -- umas marcas somem e outras continuam.
      const recado =
        `Serie NAO gravada: ${sumiram.join(', ')} nao devolveu ninguem nesta carga, mas tem historico no painel. ` +
        'Essa e a assinatura da unificacao de bases do Convenia: as pessoas dessas marcas passaram para a base unica, ' +
        'a serie delas ficaria congelada no banco e as MESMAS pessoas seriam recontadas dentro de ' +
        `${[...marcasVivas].join(', ')} em todos os meses para tras. O total do painel some ou dobra, e continua parecendo normal. ` +
        'O organograma e a camada N foram gravados normalmente. Para destravar: definir de que campo do cadastro sai a marca ' +
        '(ver sondarCamposDaPessoa no card do Convenia) e passar fontes.ts a ler esse campo em vez do token.';
      avisos.push(recado);
      serieTravada = recado;
      todasLinhas.length = 0;
    }


    const out: ResumoSyncConvenia = {
      gravado: false,
      genero: {
        conhecidos: comGenero,
        total: totalAtivos,
        buscadosAgora: generoBuscadosAgora,
        pendentes,
      },
      empresas,
      pessoasUnicas: pessoasTodas.length,
      desligadosSemCadastro,
      detalhesBuscados: buscadosAgora,
      naoResolvidos,
      linhasPorMarca,
      totalLinhas: todasLinhas.length,
      // Quantas pessoas o organograma vai gravar. Com a serie travada, ISTO e
      // o que ainda vale confirmar -- camada N, cargo, empresa e escritorio.
      totalOrg: orgTodos.length,
      serieTravada,
      requisicoes,
      avisos,
    };

    if (!confirm) {
      await encerrar('preview', { requests: requisicoes, detail: out as unknown as Record<string, unknown> });
      return out;
    }

    // ======================================================================
    // A SERIE MENSAL VEM PRIMEIRO -- E A ORDEM E O PONTO
    // ======================================================================
    // Este bloco ja esteve DEPOIS do organograma. Em 17/08 o organograma
    // falhou (a `org_pessoas` nao existia no banco), o `throw` abortou a
    // funcao inteira, e a serie nao foi gravada -- com as cinco empresas ja
    // listadas, os desligados ja resolvidos um a um e o lote de genero ja
    // processado. Zero linhas, painel parado seis dias.
    //
    // A serie e o produto da carga: headcount, entradas, saidas, atricao.
    // O organograma e acessorio. Acessorio nao precede essencial.
    // ======================================================================
    // A MARCA DE QUALIDADE ESTAVA NO CONTADOR ERRADO
    // ======================================================================
    // Isto era `desligadosSemCadastro > 0 ? 'parcial' : null`. E esse contador
    // e sempre maior que zero POR CONSTRUCAO: o comentario la em cima, no
    // proprio laco que o incrementa, diz que sao bases separadas e que "0 de
    // 164 cruzaram". Todo desligado cai naquele ramo. Sempre.
    //
    // Consequencia: as 272 linhas da serie oficial, de marco/2013 a agosto de
    // 2026, nasciam marcadas como 'parcial'. E `getMonthlyMetrics` filtra
    // `quality_flag IS NULL`. A serie inteira era descartada na leitura, e o
    // painel caia -- em silencio -- para a copia congelada do raw-data.ts, que
    // termina em jun/26. Foi assim que o seletor de mes ficou dois meses atras
    // do banco: nao faltava dado, faltava ele passar pelo filtro.
    //
    // `naoResolvidos` e o contador certo. Ele conta quem nem a busca no
    // detalhe individual resolveu -- os unicos que de fato deixam a serie
    // incompleta. Precisar de busca no detalhe e o caminho normal desta
    // integracao, nao um defeito dela.
    //
    // Uma marca que acende sempre nao informa nada; so desliga o que ela
    // deveria proteger.
    const marcaQualidade = naoResolvidos > 0
      ? `parcial: ${naoResolvidos} desligado(s) sem admissao/area mesmo apos o detalhe individual`
      : null;

    if (todasLinhas.length) {
      const registros = todasLinhas.map((l) => ({
        month: l.month,
        brand: l.brand,
        source: 'convenia',
        headcount: l.headcount,
        joiners: l.joiners,
        leavers: l.leavers,
        attrition_rate: l.attrition_rate,
        // AS DUAS, e com significados diferentes -- ver LinhaMensal.
        // `dept_data` e onde `applyDeptFilter` ACHA a area; `dept_breakdown`
        // sao as dimensoes dela. Esta carga gravava a primeira na coluna da
        // segunda e nunca escrevia a de verdade.
        dept_data: l.dept_data,
        dept_breakdown: l.dept_breakdown,
        gender_female: l.gender_female,
        gender_male: l.gender_male,
        gender_female_pct: l.gender_female_pct,
        leader_female: l.leader_female,
        leader_female_pct: l.leader_female_pct,
        leaders: l.leaders,
        leaders_pct: l.leaders_pct,
        avg_salary_leaders: l.avg_salary_leaders,
        avg_salary_non_leaders: l.avg_salary_non_leaders,
        state_mix: l.state_mix,
        // O campo existia na tabela e era gravado sempre vazio. Ver
        // `race_cross` em pessoas.ts: a tela do DEI depende dele para existir.
        race_cross: l.race_cross,
        tenure_base: l.tenure_base,
        demographics: l.demographics,
        quality_flag: marcaQualidade,
        // O CONFLITO E EM (month, brand, source), ENTAO TODA CARGA SEMANAL E
        // UPDATE -- e `DEFAULT now()` so vale no INSERT. Sem esta linha e sem
        // trigger, `updated_at` congela na data do primeiro insert e nunca
        // mais anda, mesmo com a gravacao funcionando perfeitamente.
        //
        // Isso nao afeta nenhum grafico: o painel le `month`, nao este campo.
        // O que quebra e a CONFERENCIA -- o vigia semanal pergunta "o dado
        // avancou?" e recebe sempre a mesma data de 12/08/2026, o que e
        // indistinguivel de uma carga que parou de gravar. Um campo que
        // ninguem le vira o unico sinal de que algo esta errado, e ele estava
        // mentindo.
        updated_at: new Date().toISOString(),
      }));
      const { error } = await db.from('monthly_metrics')
        .upsert(registros, { onConflict: 'month,brand,source' });
      if (error) throw new Error(`Falha ao gravar a série do Convenia: ${error.message}`);
    }

    // ======================================================================
    // ORGANOGRAMA: A CAMADA DE CADA UM, RECALCULADA A CADA SINCRONIZACAO
    // ======================================================================
    // E o que faz o acesso a remuneracao acompanhar promocao e troca de
    // gestor sem ninguem editar cadastro nenhum. Gravado com `upsert`, entao
    // quem mudou de chefe muda de camada na proxima rodada.
    //
    // Quem cai em ciclo ou em cadeia quebrada fica com camada nula -- e nulo
    // ESCONDE. Uma cadeia mal preenchida no Convenia vira tela vazia na aba
    // de Salarios, nunca acesso a mais.
    //
    // NAO DERRUBA A CARGA, E A ESCOLHA E DESIGUAL DE PROPOSITO.
    // Falhar aqui congela a camada N no valor da ultima execucao boa: quem
    // foi promovido no meio-tempo fica com o acesso antigo. Isso e ruim, mas
    // e silencioso E seguro -- camada nula esconde, nunca libera a mais.
    // Perder a serie mensal inteira e pior e barulhento. Entre os dois, o
    // acessorio cede.
    if (orgTodos.length) {
      try {
        const { calcularCamadas, diagnosticar } = await import('@/lib/organograma');
        const camadas = calcularCamadas(orgTodos);
        const porPessoa = new Map(camadas.map((c) => [c.id, c]));
        const diag = diagnosticar(orgTodos, camadas);

        if (diag.semCamada > 0) {
          avisos.push(
            `${diag.semCamada} de ${diag.total} pessoas ficaram sem camada N (cadeia de reporte quebrada ou em ciclo no Convenia). Elas nao aparecem na aba de Salarios de ninguem, e quem for cadastrado com esses e-mails nao vai enxergar remuneracao.`,
          );
        }
        if (diag.topos > 8) {
          avisos.push(
            `${diag.topos} pessoas sem supervisor conhecido. Cada uma vira um "topo" e recebe N-2, o que achata a escada -- vale conferir o preenchimento de gestor no Convenia.`,
          );
        }

        // O cargo é resolvido DEPOIS de `orgTodos` ser montado -- ele sai do
        // laço de detalhe, que roda mais adiante --, então a junção acontece
        // aqui, no último momento antes de gravar.
        //
        // A listagem tem precedência: se um dia o Convenia passar a mandar o
        // cargo lá, ele vale e o detalhe vira redundância barata.
        const linhasOrg = orgTodos.map((p) => ({
          convenia_id: p.id,
          email: p.email ? p.email.trim().toLowerCase() : null,
          nome: p.nome,
          job_title: p.cargo || (cacheCargo.get(p.id) ?? null),
          supervisor_id: p.supervisorId,
          department: p.department,
          camada: porPessoa.get(p.id)?.camada ?? null,
          profundidade: porPessoa.get(p.id)?.profundidade ?? null,
          atualizado_em: new Date().toISOString(),
        }));

        // ------------------------------------------------------------------
        // O SYNC PRECISA DIZER SE O NOME VEIO INTEIRO
        // ------------------------------------------------------------------
        // `nomeCompleto` supoe que o Convenia devolve `full_name`. Se um dia
        // nao devolver -- ou se a API mudar --, o fallback entrega o primeiro
        // nome e TUDO continua funcionando: nenhuma excecao, nenhuma linha a
        // menos, so o casamento com a folha voltando a zero em silencio.
        //
        // Foi exatamente assim que o problema anterior durou: `b.name` era o
        // primeiro nome, nada quebrou, e o sintoma apareceu longe daqui, como
        // linhas sem camada na aba de Salarios.
        // Mesmo cuidado do nome: se o campo do cargo mudar de lugar na API,
        // nada quebra -- o cadastro so volta a ser digitado a mao, calado.
        // ------------------------------------------------------------------
        // O AVISO PRECISA DISTINGUIR "AINDA NAO BUSCADO" DE "NAO TEM"
        // ------------------------------------------------------------------
        // A versao anterior dizia so "vieram sem cargo", e isso era verdadeiro
        // e inutil: com o cargo saindo do detalhe em lotes de 200, a primeira
        // execucao SEMPRE deixa a maioria em branco. Um aviso que dispara toda
        // vez, por desenho, ensina a ignorar avisos.
        //
        // `cacheCargo.has(id)` e a diferenca: significa "ja perguntei por esta
        // pessoa". Quem esta no cache com valor nulo nao tem cargo no
        // Convenia; quem nao esta ainda vai ser buscado.
        const semCargo = linhasOrg.filter((l) => !l.job_title);
        const aindaNaoBuscados = semCargo.filter((l) => !cargoBuscado.has(l.convenia_id)).length;
        const buscadosSemCargo = semCargo.length - aindaNaoBuscados;
        if (aindaNaoBuscados > 0) {
          avisos.push(
            `Cargo: ${linhasOrg.length - semCargo.length} de ${linhasOrg.length} pessoas resolvidas, ` +
            `${aindaNaoBuscados} pendentes. O cargo so existe no detalhe individual do Convenia, ` +
            `entao ele avanca no mesmo lote do genero -- rode de novo para adiantar. Ate la o campo ` +
            'Cargo do cadastro continua digitavel.',
          );
        }
        if (buscadosSemCargo > linhasOrg.length / 2) {
          avisos.push(
            `Cargo: ${buscadosSemCargo} pessoas foram buscadas no detalhe e voltaram SEM cargo. ` +
            'Isso nao e atraso de lote -- e o campo nao existir onde `cargoDe` procura. ' +
            'Conferir em que campo o Convenia guarda o cargo hoje.',
          );
        }

        const semSobrenome = soPrimeiroNome(linhasOrg.map((l) => l.nome));
        if (semSobrenome > linhasOrg.length / 10) {
          avisos.push(
            // Sem nome de empresa de proposito: `orgTodos` junta todas as
            // fontes, porque a cadeia de reporte atravessa as empresas.
            `Organograma: ${semSobrenome} de ${linhasOrg.length} nomes vieram sem sobrenome. ` +
            'A ponte com a folha de remuneracao compara nome completo, entao esses nao casam: ' +
            'a aba de Salarios fica sem camada para eles, e o cruzamento de promocao com ' +
            'genero e etnia perde essas pessoas. Conferir se o Convenia ainda devolve full_name.',
          );
        }

        for (let i = 0; i < linhasOrg.length; i += 500) {
          const { error } = await db.from('org_pessoas')
            .upsert(linhasOrg.slice(i, i + 500) as never, { onConflict: 'convenia_id' });
          if (error) throw new Error(`Falha ao gravar o organograma: ${error.message}`);
        }
      } catch (e) {
        // O aviso precisa dizer o que congelou, e nao so que algo falhou.
        // "Organograma nao gravado" sozinho nao conta a quem le que a aba de
        // Salarios vai mostrar a hierarquia da semana passada.
        const msgOrg = e instanceof Error ? e.message : String(e);
        avisos.push(
          `Organograma nao gravado: ${msgOrg}. A serie mensal entrou normalmente -- headcount, entradas, saidas e atricao estao atualizados. O que ficou parado foi a camada N, que continua com o valor da ultima execucao bem-sucedida: quem mudou de gestor ou foi promovido desde entao esta com a camada antiga na aba de Salarios. Nao ha risco de acesso indevido, porque camada nula esconde e nunca libera a mais.`,
        );
      }
    }

    await encerrar('success', {
      requests: requisicoes,
      rows_written: todasLinhas.length,
      detail: out as unknown as Record<string, unknown>,
    });
    return { ...out, gravado: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await encerrar('error', { error: msg.slice(0, 500), requests: requisicoes });
    throw e;
  }
}
