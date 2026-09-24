import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { ChevronDown, History, Loader2 } from 'lucide-react';
import ChartCard from '@/components/dashboard/ChartCard';
import { getSurveyWave, type SurveyWaveData } from '@/lib/survey.functions';
import {
  agruparPorTema, chavesComparaveis, montarTendencia, sinaisDaTendencia, LIMIAR_SINAL_PP,
  type LinhaTendencia, type Sinal,
} from '@/lib/tendencia-comparaveis';
import { tx } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/**
 * A tendência entre duas ondas seguidas, no formato do slide "Engagement
 * Highlights (2/3)". Ver lib/tendencia-comparaveis.ts para o porquê.
 *
 * Um seletor oferece cada par de ondas seguidas (Jan/26 -> Ago/26,
 * Jul/25 -> Jan/26...), abrindo no mais recente. A Carolina foi clara: o
 * ponto é o FORMATO do deck para todos os comparativos, não só para o que o
 * painel principal deixou para trás.
 *
 * Busca a onda pelo MESMO `getSurveyWave` da aba -- escopo, entidade e
 * supressão aplicados no servidor como em qualquer outra visão. Nada do
 * painel principal muda; esta seção só acrescenta.
 */

type Brand = 'combined' | 'NSX' | 'Betfair BR' | 'Flutter International';

const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v)}%`);
const pp = (v: number | null) => {
  if (v == null) return '—';
  const r = Math.round(v);
  return r > 0 ? `+${r}pp` : r < 0 ? `−${Math.abs(r)}pp` : '0pp';
};
const corGap = (v: number | null) =>
  v == null ? '' : v >= LIMIAR_SINAL_PP
    ? 'font-semibold text-emerald-600'
    : v <= -LIMIAR_SINAL_PP ? 'font-semibold text-red-600' : '';

export default function TendenciaComparaveis({
  ondas, department, brand, areaFixa,
}: {
  /** Todas as ondas, da mais recente para a mais antiga. */
  ondas: ReadonlyArray<{ wave: string; label: string }>;
  /** O valor cru do filtro, como a aba manda para o servidor. */
  department: string | undefined | null;
  brand: Brand;
  /** Área (vocabulário da pesquisa) já escolhida no filtro ou pelo escopo. */
  areaFixa: string | null;
}) {
  // Um par por onda que tem anterior: a onda pedida ao servidor vem com a
  // anterior dela. A última da lista não tem com quem comparar.
  const pares = ondas.slice(0, -1).map((o, i) => ({
    wave: o.wave,
    rotulo: `${ondas[i + 1].label} → ${o.label}`,
  }));
  const [ondaEscolhida, setOndaEscolhida] = useState<string | null>(null);
  const ondaWave = pares.find((p) => p.wave === ondaEscolhida)?.wave ?? pares[0]?.wave ?? null;
  const fetchSurvey = useServerFn(getSurveyWave);
  const [dado, setDado] = useState<SurveyWaveData | null>(null);
  const [combinado, setCombinado] = useState<SurveyWaveData | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    if (!ondaWave) return;
    let cancelado = false;
    setCarregando(true);
    setFalhou(false);
    // Com entidade, a onda antiga pode não ter o recorte (jul/25 não
    // perguntou marca). SÓ nesse caso a visão combinada é pedida, e só para
    // dizer QUAIS perguntas são comparáveis -- ver `chavesComparaveis`.
    // Nenhum número dela vai para a tabela. Jan/26 -> Ago/26 com entidade tem
    // as duas ondas e não precisa da segunda consulta.
    const pedir = (b: Brand) =>
      fetchSurvey({ data: { wave: ondaWave, department: department ?? null, brand: b } });
    pedir(brand)
      .then(async (d) => {
        const w = d as SurveyWaveData | null;
        const faltaAntiga = !!w && brand !== 'combined'
          && !w.driversAnteriores.some((x) => x.cutType === 'company');
        const comb = faltaAntiga ? ((await pedir('combined')) as SurveyWaveData | null) : null;
        if (cancelado) return;
        setDado(w);
        setCombinado(comb);
      })
      .catch((e: unknown) => {
        console.error('tendência dos itens comparáveis indisponível:', e);
        if (!cancelado) setFalhou(true);
      })
      .finally(() => { if (!cancelado) setCarregando(false); });
    return () => { cancelado = true; };
  }, [fetchSurvey, ondaWave, department, brand]);

  // A onda antiga veio sem nenhuma linha da empresa: não tem este recorte.
  const antigaSemRecorte = !!dado
    && !dado.driversAnteriores.some((d) => d.cutType === 'company');
  const comparaveis = useMemo(
    () => (antigaSemRecorte && combinado
      ? chavesComparaveis(combinado.driversPorArea, combinado.driversAnteriores)
      : undefined),
    [antigaSemRecorte, combinado],
  );

  // A área vem SÓ do filtro de departamento do topo (ou do escopo de quem
  // tem uma área só), como em toda a aba. Um filtro próprio aqui faria a
  // seção mostrar Product sob um topo que diz Technology.
  const area = areaFixa;
  const linhas = useMemo(
    () => (dado ? montarTendencia(dado.driversPorArea, dado.driversAnteriores, area, comparaveis) : []),
    [dado, area, comparaveis],
  );
  const sinais = useMemo(() => sinaisDaTendencia(linhas), [linhas]);

  if (!ondaWave) return null;

  const antes = dado?.ondaAnteriorLabel ?? '';
  const depois = dado?.label ?? '';
  const titulo = dado
    ? tx('Tendência dos itens comparáveis ({0} → {1})', [antes, depois])
    : tx('Tendência dos itens comparáveis');


  let corpo: ReactNode;
  if (carregando) {
    corpo = (
      <div className="flex items-center gap-2 py-8 justify-center text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />{tx('Carregando…')}
      </div>
    );
  } else if (falhou || !dado) {
    corpo = <p className="text-xs text-muted-foreground py-6 text-center">{tx('Não foi possível carregar a pesquisa anterior.')}</p>;
  } else if (linhas.length === 0) {
    // Com entidade, a onda mais antiga pode não ter o recorte por marca --
    // jul/25 não perguntou marca. Vazio aqui é isso, não defeito.
    corpo = (
      <p className="text-xs text-muted-foreground py-6 text-center">
        {tx('{0} não tem este recorte, então não há itens para comparar com {1}.', [antes, depois])}
      </p>
    );
  } else {
    corpo = (
      <Tabela linhas={linhas} area={area} antes={antes} depois={depois} sinais={sinais} />
    );
  }

  return (
    <ChartCard
      title={titulo}
      icon={History}
      nota={tx('Mesma leitura do deck da diretoria. Favorável = % de notas 4 e 5. Δ = diferença entre as duas pesquisas, em pontos percentuais. Gap = Fav% da área menos Fav% da empresa na pesquisa mais nova. Só entram perguntas feitas nas duas pesquisas; "Recompensa justa" mudou de redação e é tratada como a mesma pergunta, como no deck.')}
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {tx('Só itens diretamente comparáveis: isola a mudança real do efeito da expansão do questionário.')}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {pares.length > 1 && (
              <div role="radiogroup" aria-label={tx('Comparativo')} className="inline-flex rounded-md border border-border overflow-hidden">
                {pares.map((p) => (
                  <button
                    key={p.wave}
                    type="button"
                    role="radio"
                    aria-checked={p.wave === ondaWave}
                    onClick={() => setOndaEscolhida(p.wave)}
                    className={cn(
                      'px-2.5 py-1 text-[11px] font-semibold transition-colors',
                      p.wave === ondaWave
                        ? 'bg-[hsl(var(--flutter))] text-white'
                        : 'bg-card text-muted-foreground hover:bg-secondary',
                    )}
                  >
                    {tx(p.rotulo)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        {!carregando && antigaSemRecorte && linhas.length > 0 && (
          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {tx('{0} não perguntou marca: para {1}, a seção mostra só {2} e a posição contra a empresa. Para ver a variação entre as duas pesquisas, use Combinado no seletor de entidade.', [antes, brand, depois])}
          </p>
        )}
        {!carregando && !area && linhas.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {tx('Mostrando a empresa. Escolha um departamento no filtro do topo para ver a área contra a empresa.')}
          </p>
        )}
        {corpo}
        {area && sinais.length > 0 && (
          <div className="border-t border-border pt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider mb-1.5">{tx('Sinais principais')}</p>
            <ul className="list-disc pl-5 space-y-1 text-xs text-foreground">
              {sinais.map((s) => <li key={s.tipo}>{textoDoSinal(s, antes)}</li>)}
            </ul>
          </div>
        )}
      </div>
    </ChartCard>
  );
}

function textoDoSinal(s: Sinal, antes: string): string {
  const l = s.linha;
  const item = tx(l.rotulo);
  if (s.tipo === 'destaque') {
    return tx('{0} é o principal destaque: {1} favorável, {2} vs a empresa.', [item, pct(l.areaDepois), pp(l.gap)]);
  }
  if (s.tipo === 'melhora') {
    return tx('{0} melhorou {1} vs {2} e está em {3}.', [item, pp(l.deltaArea), antes, pct(l.areaDepois)]);
  }
  return l.gap == null
    ? tx('{0} caiu {1} vs {2} e é o principal ponto de atenção.', [item, pp(l.deltaArea), antes])
    : tx('{0} caiu {1} vs {2} e é o principal ponto de atenção ({3} vs a empresa).', [item, pp(l.deltaArea), antes, pp(l.gap)]);
}

function Tabela({
  linhas, area, antes, depois, sinais,
}: {
  linhas: LinhaTendencia[];
  area: string | null;
  antes: string;
  depois: string;
  sinais: Sinal[];
}) {
  // ------------------------------------------------------------------
  // POR TEMA, E A PERGUNTA SÓ QUANDO A PESSOA PEDE
  // ------------------------------------------------------------------
  // Mesmo desenho de "Tema por tema, e o que a média esconde" (Carolina,
  // 24/09): uma linha por tema; clicar abre as perguntas dele. Um aberto por
  // vez, como lá -- vários abertos devolvem a tabela de 31 linhas que o
  // agrupamento existe para evitar.
  const temas = useMemo(() => agruparPorTema(linhas, area), [linhas, area]);
  const [aberto, setAberto] = useState<string | null>(null);
  // O deck põe em negrito o maior movimento; aqui, as perguntas que viraram
  // sinal -- a mesma regra que escreve o texto embaixo.
  const emDestaque = new Set(
    sinais.filter((s) => s.tipo !== 'destaque').map((s) => s.linha.chave),
  );
  const th = 'px-2 py-1.5 text-center font-semibold whitespace-nowrap';
  const td = 'px-2 py-1.5 text-center tabular-nums whitespace-nowrap';
  const tdAntes = cn(td, 'text-muted-foreground');
  const sep = 'border-l border-border';

  const celulas = (
    v: {
      areaAntes: number | null; areaDepois: number | null; deltaArea: number | null;
      empresaAntes: number | null; empresaDepois: number | null; deltaEmpresa: number | null;
      gap: number | null;
    },
    negritoDelta = false,
  ) => (
    <>
      {area && (
        <>
          <td className={cn(tdAntes, sep)}>{pct(v.areaAntes)}</td>
          <td className={td}>{pct(v.areaDepois)}</td>
          <td className={cn(td, negritoDelta && 'font-bold')}>{pp(v.deltaArea)}</td>
        </>
      )}
      <td className={cn(tdAntes, sep)}>{pct(v.empresaAntes)}</td>
      <td className={td}>{pct(v.empresaDepois)}</td>
      <td className={td}>{pp(v.deltaEmpresa)}</td>
      {area && <td className={cn(td, sep, corGap(v.gap))}>{pp(v.gap)}</td>}
    </>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border border-border">
        <thead>
          <tr className="bg-muted text-[11px] uppercase tracking-wider">
            <th className={cn(th, 'text-left')} rowSpan={2}>{tx('Tema')}</th>
            {area && <th className={cn(th, sep)} colSpan={3}>{area}</th>}
            <th className={cn(th, sep)} colSpan={3}>{tx('Empresa')}</th>
            {area && <th className={cn(th, sep)}>{tx('Gap {0}', [depois])}</th>}
          </tr>
          <tr className="bg-muted/60 text-[11px]">
            {area && (
              <>
                <th className={cn(th, sep, 'font-medium text-muted-foreground')}>{tx('{0} Fav%', [antes])}</th>
                <th className={th}>{tx('{0} Fav%', [depois])}</th>
                <th className={th}>Δ (pp)</th>
              </>
            )}
            <th className={cn(th, sep, 'font-medium text-muted-foreground')}>{tx('{0} Fav%', [antes])}</th>
            <th className={th}>{tx('{0} Fav%', [depois])}</th>
            <th className={th}>Δ (pp)</th>
            {area && <th className={cn(th, sep)}>{tx('Área vs empresa')}</th>}
          </tr>
        </thead>
        <tbody>
          {temas.map((t) => {
            const estaAberto = aberto === t.tema;
            return (
              <Fragment key={t.tema}>
                <tr
                  className={cn(
                    'border-t border-border cursor-pointer transition-colors',
                    estaAberto ? 'bg-muted/60' : 'hover:bg-muted/30',
                  )}
                  onClick={() => setAberto(estaAberto ? null : t.tema)}
                >
                  <td className="px-2 py-1.5 text-left">
                    <button
                      type="button"
                      aria-expanded={estaAberto}
                      className="flex items-center gap-1.5 text-left font-semibold text-foreground"
                    >
                      <ChevronDown
                        className={cn(
                          'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform',
                          estaAberto ? 'rotate-0' : '-rotate-90',
                        )}
                      />
                      <span>{tx(t.tema)}</span>
                      <span className="font-normal text-muted-foreground">
                        · {t.perguntas.length}{' '}{t.perguntas.length === 1 ? tx('pergunta') : tx('perguntas')}
                      </span>
                    </button>
                  </td>
                  {celulas(t)}
                </tr>
                {estaAberto && t.perguntas.map((l) => (
                  <tr key={l.chave} className="border-t border-border/60 bg-muted/20">
                    <td className="py-1.5 pl-8 pr-2 text-left text-muted-foreground" title={l.pergunta}>
                      {tx(l.rotulo)}
                    </td>
                    {celulas(l, emDestaque.has(l.chave))}
                  </tr>
                ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        {tx('Clique num tema para ver as perguntas. O Fav% do tema é a média simples das perguntas dele.')}
      </p>
    </div>
  );
}
