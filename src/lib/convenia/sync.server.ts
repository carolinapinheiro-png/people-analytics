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
  linhasPorMarca: { marca: string; linhas: number; de: string | null; ate: string | null }[];
  totalLinhas: number;
  requisicoes: number;
  avisos: string[];
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
    const { EMPLOYEES, EMPLOYEES_DISMISSED } = await import('./paths');

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
        const pessoas: Minimo[] = brutos.map((b) => ({
          id: String(b.id ?? ''),
          hiring_date: (b.hiring_date as string) ?? null,
          department: (b.department as { name: string | null }) ?? null,
          status: (b.status as string) ?? null,
        }));

        const deslBrutos = await client.listarTudo<Record<string, unknown>>(EMPLOYEES_DISMISSED, {
          porPagina: 100, aoAvisar: (a) => avisos.push(`${f.empresa}: ${a}`),
        });
        const saidas = deslBrutos.map((b) => {
          const d = (b.dismissal ?? {}) as { date?: string; type?: { title?: string } };
          return { id: String(b.id ?? ''), data: d.date ?? null, tipo: d.type?.title ?? null };
        });

        requisicoes += client.stats.requests;
        linha.ativos = pessoas.length;
        linha.desligados = saidas.length;

        const porId = new Map(pessoas.map((p) => [p.id, p]));
        const registros: PessoaConvenia[] = pessoas.map((p) => ({
          id: p.id, hiring_date: p.hiring_date, department: p.department, status: p.status,
        }));

        for (const s of saidas) {
          const achado = porId.get(s.id);
          if (achado) {
            linha.cruzaram++;
            const r = registros.find((x) => x.id === s.id)!;
            r.dataSaida = s.data;
            r.tipoSaida = s.tipo;
          } else {
            // Saiu, e não está no cadastro de colaboradores: sabemos QUANDO
            // saiu, não sabemos quando entrou. Entra na série como saída no
            // mês certo e fica fora do headcount anterior -- o que subestima.
            // Por isso é contado e aparece no resumo.
            desligadosSemCadastro++;
            registros.push({ id: s.id, hiring_date: null, department: null, dataSaida: s.data, tipoSaida: s.tipo });
          }
        }

        const lista = porMarca.get(f.marca) ?? [];
        lista.push(...registros);
        porMarca.set(f.marca, lista);
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
    if (marcadosNoStatus && Math.abs(marcadosNoStatus - comSaida) > comSaida * 0.1) {
      avisos.push(`O campo status marca ${marcadosNoStatus} pessoas como desligadas, mas a listagem de desligados traz ${comSaida}. A diferença merece um olhar antes de promover esta série a oficial.`);
    }

    const out: ResumoSyncConvenia = {
      gravado: false,
      empresas,
      pessoasUnicas: pessoasTodas.length,
      desligadosSemCadastro,
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
