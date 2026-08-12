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

export async function executarSyncConvenia(
  db: Db,
  { confirm, origem }: { confirm: boolean; origem: string },
): Promise<ResumoSyncConvenia> {
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
      .select('convenia_id, gender');
    const cacheGenero = new Map<string, 'F' | 'M' | null>(
      ((pessoasCache ?? []) as { convenia_id: string; gender: string | null }[])
        .map((r) => [r.convenia_id, (r.gender as 'F' | 'M' | null) ?? null]),
    );
    // Quem já foi buscado e voltou sem gênero não é buscado de novo: a linha
    // existe no cache com valor nulo, e isso é a resposta, não uma falha.
    let generoBuscadosAgora = 0;

    const avisos: string[] = [];
    const porMarca = new Map<string, PessoaConvenia[]>();
    const empresas: ResumoSyncConvenia['empresas'] = [];
    let requisicoes = 0;
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

        const porId = new Map(pessoas.map((p) => [p.id, p]));
        const registros: PessoaConvenia[] = pessoas.map((p) => ({
          id: p.id, hiring_date: p.hiring_date, department: p.department, status: p.status,
          supervisorId: p.supervisorId, salary: p.salary, birth_date: p.birth_date, uf: p.uf,
          genero: cacheGenero.get(p.id) ?? null,
        }));

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
        for (const r of registros) r.genero = cacheGenero.get(r.id) ?? null;

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
    const totalAtivos = [...porMarca.values()].flat().filter((x) => x.dataSaida == null).length;
    const comGenero = [...porMarca.values()].flat().filter((x) => x.genero != null).length;
    const pendentes = Math.max(0, totalAtivos - [...cacheGenero.keys()].length);

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

    if (todasLinhas.length) {
      const registros = todasLinhas.map((l) => ({
        month: l.month,
        brand: l.brand,
        source: 'convenia',
        headcount: l.headcount,
        joiners: l.joiners,
        leavers: l.leavers,
        attrition_rate: l.attrition_rate,
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
        tenure_base: l.tenure_base,
        demographics: l.demographics,
        quality_flag: desligadosSemCadastro > 0 ? 'parcial' : null,
      }));
      const { error } = await db.from('monthly_metrics')
        .upsert(registros, { onConflict: 'month,brand,source' });
      if (error) throw new Error(`Falha ao gravar a série do Convenia: ${error.message}`);
    }

    await encerrar('success', {
      requests: requisicoes,
      rows_written: todasLinhas.length,
      detail: out as unknown as Record<string, unknown>,
    });
    return { ...out, gravado: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await encerrar('error', { error: msg.slice(0, 500) });
    throw e;
  }
}
