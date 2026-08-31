import { useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import ChartCard from '@/components/dashboard/ChartCard';
import { getCompEquidade } from '@/lib/comp.functions';
import type { CompEquidade, RecorteEquidade } from '@/lib/equidade';
import { COLORS } from '@/lib/colors';
import { useDashboard } from '@/data/DashboardContext';
import { Scale } from 'lucide-react';

/**
 * Comp-ratio por gênero e etnia, no mesmo nível.
 *
 * ===========================================================================
 * O QUE ESTA TELA PODE E NÃO PODE DIZER
 * ===========================================================================
 * Comp-ratio é salário ÷ ponto médio da faixa do cargo. Nível e família já
 * estão controlados por construção, então a comparação entre grupos NÃO é
 * "quem ganha mais" -- é "dentro da mesma faixa, quem está posicionado onde".
 *
 * A distinção decide a leitura. Uma diferença no total pode ser só composição
 * (um grupo concentrado em níveis menores). A mesma diferença DENTRO de um
 * nível não tem essa saída.
 *
 * Por isso a linha "Geral" aparece, mas não é a manchete: ela ainda carrega
 * composição. As linhas por nível é que comparam igual com igual, e é nelas
 * que a tela pede para olhar.
 *
 * ===========================================================================
 * POR QUE A CONTAGEM VEM SEMPRE JUNTO
 * ===========================================================================
 * Uma mediana de duas pessoas e uma de noventa e quatro se parecem na tela e
 * não valem o mesmo. Sem o `n` ao lado, uma diferença de dois pontos numa
 * célula minúscula é lida como achado.
 *
 * Isso passou a valer MAIS, não menos, desde que a supressão saiu: o `n` é
 * agora a única coisa na tela dizendo quanto peso cada número tem. Ver
 * `N_MINIMO_EQUIDADE` -- a decisão de mostrar todo grupo supõe que a aba de
 * Compensação continue restrita a quem já vê salário individual.
 *
 * O rodapé diz isso em português. Não é ornamento: é onde a suposição fica
 * visível para quem eventualmente abrir a aba para mais gente.
 */

export default function EquidadeCompRatio() {
  const buscar = useServerFn(getCompEquidade);
  const { filters } = useDashboard();
  const [dados, setDados] = useState<CompEquidade | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // ------------------------------------------------------------------
  // OS MESMOS SEIS FILTROS DA LISTA LOGO ACIMA
  // ------------------------------------------------------------------
  // Este cartão nasceu chamando `buscar({})` -- sem filtro nenhum. Ele respeita
  // a permissão, mas ignorava o seletor: com Technology escolhido, a lista de
  // comp-ratio mostrava Technology e a tabela de equidade mostrava a empresa
  // inteira, na mesma tela, sem nada dizendo qual era qual.
  //
  // Duas populações na mesma página é pior que nenhum filtro: quem lê supõe
  // que as duas descrevem o mesmo grupo, e é uma suposição razoável.
  useEffect(() => {
    let cancelado = false;
    buscar({
      data: {
        department: filters.departamento,
        level: filters.level,
        contract: filters.tipoContrato,
        jobFamily: filters.jobFamily,
        tenureBand: filters.tempoCasa,
        salaryBand: filters.faixaSalarial,
      },
    })
      .then((d) => { if (!cancelado) setDados(d as CompEquidade); })
      .catch((e: unknown) => {
        if (!cancelado) setErro(e instanceof Error ? e.message : String(e));
      });
    return () => { cancelado = true; };
  }, [
    buscar, filters.departamento, filters.level, filters.tipoContrato,
    filters.jobFamily, filters.tempoCasa, filters.faixaSalarial,
  ]);

  if (erro) {
    return (
      <ChartCard title="Equidade de comp ratio" icon={Scale}>
        <p className="text-sm text-muted-foreground py-4">Não foi possível carregar: {erro}</p>
      </ChartCard>
    );
  }
  if (!dados) return null;

  const semElo = dados.total - dados.comElo;

  if (!dados.comElo) {
    return (
      <ChartCard title="Equidade de comp ratio" icon={Scale}>
        <p className="text-sm text-muted-foreground py-4 leading-relaxed">
          Nenhuma das {dados.total} linhas de remuneração está ligada ao cadastro do Convenia, e é
          de lá que vêm gênero e etnia. Rode o vínculo de camada no admin — ele grava esse elo junto
          com a camada N.
        </p>
      </ChartCard>
    );
  }

  const Tabela = ({ recortes, titulo }: { recortes: RecorteEquidade[]; titulo: string }) => {
    if (!recortes.length) return null;
    const grupos = [...new Set(recortes.flatMap((r) => r.celulas.map((c) => c.grupo)))];
    return (
      <div className="overflow-x-auto">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
          {titulo}
        </div>
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b border-border text-left">
              <th className="p-2">Nível</th>
              {grupos.map((g) => (
                <th key={g} className="p-2 text-right">{g}</th>
              ))}
              <th className="p-2 text-right">Diferença</th>
            </tr>
          </thead>
          <tbody>
            {recortes.map((r) => {
              const porGrupo = new Map(r.celulas.map((c) => [c.grupo, c]));
              const visiveis = r.celulas.filter((c) => c.mediana != null);
              // A diferença só existe quando HÁ dois grupos publicáveis. Com um
              // só, subtrair de um valor suprimido daria um número inventado.
              const dif = visiveis.length >= 2
                ? Math.round((Math.min(...visiveis.map((c) => c.mediana!))
                  - Math.max(...visiveis.map((c) => c.mediana!))) * 10) / 10
                : null;
              return (
                <tr
                  key={r.nivel}
                  className={`border-b border-border/50 ${r.nivel === 'Geral' ? 'bg-muted/30' : ''}`}
                >
                  <td className="p-2 font-medium">{r.nivel}</td>
                  {grupos.map((g) => {
                    const c = porGrupo.get(g);
                    return (
                      <td key={g} className="p-2 text-right tabular-nums">
                        {c == null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : c.mediana == null ? (
                          <span className="text-muted-foreground" title={`${c.n} pessoa(s): abaixo do mínimo de ${dados.minimo}`}>
                            n={c.n}
                          </span>
                        ) : (
                          <>
                            {c.mediana.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
                            <span className="text-muted-foreground text-[11px] ml-1">({c.n})</span>
                          </>
                        )}
                      </td>
                    );
                  })}
                  <td
                    className="p-2 text-right tabular-nums font-semibold"
                    style={{ color: dif != null && dif <= -10 ? COLORS.danger : undefined }}
                  >
                    {dif == null ? <span className="text-muted-foreground font-normal">—</span>
                      : `${dif.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} pp`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <ChartCard
      title="Equidade de comp ratio"
      icon={Scale}
      subtitle={`${dados.comElo} pessoas com cadastro vinculado${semElo > 0 ? ` · ${semElo} sem vínculo, fora da conta` : ''}`}
    >
      <div className="space-y-5">
        <Tabela recortes={dados.porGenero} titulo="Por gênero" />
        <Tabela recortes={dados.porEtnia} titulo="Por cor / raça" />
      </div>

      <div className="mt-4 pt-3 border-t border-border/60 space-y-2 text-[11px] text-muted-foreground leading-relaxed">
        <p>
          <strong>Comp ratio é posição dentro da faixa do próprio cargo</strong> — 100% é o meio da
          faixa. Como o nível já está embutido no cálculo, comparar grupos aqui não compara salário:
          pergunta se, na mesma faixa, um grupo está posicionado abaixo do outro.
        </p>
        <p>
          <strong>Olhe as linhas por nível, não a "Geral".</strong> A geral mistura níveis, então uma
          diferença ali pode ser só composição — um grupo concentrado em cargos menores. Dentro de um
          nível essa explicação não existe.
        </p>
        <p>
          O número entre parênteses é quantas pessoas há na célula, e aqui{' '}
          <strong>todo grupo aparece, de qualquer tamanho</strong> — inclusive de uma pessoa só.
          Com n baixo a mediana é o número de alguém específico, então leia a contagem antes do
          percentual: uma diferença grande entre células de duas e três pessoas não é um achado.
        </p>
        <p>
          Isso vale porque esta aba é restrita a quem já vê o comp-ratio individual na lista acima.
          <strong> Se Compensação for aberta para perfis com escopo de área</strong> — um HRBP, um
          gestor —, esta tabela passa a publicar salário individual por dedução, e o mínimo de
          exibição precisa voltar.
        </p>
      </div>
    </ChartCard>
  );
}
