import type { SupabaseClient } from '@supabase/supabase-js';
import { reconstruirSerie, type LinhaMensal, type PessoaConvenia } from './pessoas';

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
      .select('convenia_id, gender, race');
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
      department: string | null; nome: string | null;
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
            department: p.department?.name ?? null, nome: p.nome,
          });
        }

        const porId = new Map(pessoas.map((p) => [p.id, p]));
        const registros: PessoaConvenia[] = pessoas.map((p) => ({
          id: p.id, hiring_date: p.hiring_date, department: p.department, status: p.status,
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
        const semGenero = registros.filter((x) => !cacheGenero.has(x.id));
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
            cacheGenero.set(alvo.id, g);
            cacheRaca.set(alvo.id, raca);
            generoBuscadosAgora++;
            await db.from('convenia_pessoas').upsert({
              convenia_id: alvo.id,
              gender: g,
              race: raca,
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

        const lista = porMarca.get(f.marca) ?? [];
        lista.push(...registros);
        porMarca.set(f.marca, lista);
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

        const linhasOrg = orgTodos.map((p) => ({
          convenia_id: p.id,
          email: p.email ? p.email.trim().toLowerCase() : null,
          nome: p.nome,
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
