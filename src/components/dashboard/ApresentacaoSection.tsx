import { useEffect, useMemo, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import { Download, Loader2, Presentation, Info } from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { getSurveyWave, type SurveyWaveData } from '@/lib/survey.functions';
import { useDashboard } from '@/data/DashboardContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { tx } from '@/lib/i18n';
import {
  montarApresentacao, candidatos, tokensDoDeck, graficosDoDeck, sugestoes,
  fmtNum, fmtPct, fmtDelta, type DadosApresentacao, type Pergunta,
} from '@/lib/apresentacao/dados';

/**
 * ===========================================================================
 * SUB-ABA "APRESENTAÇÃO": O ROTEIRO DO HRBP, NA ORDEM DOS SLIDES
 * ===========================================================================
 * Pedido da Carolina (24/09): os HRBPs montam, para cada área, o deck do
 * template "[PT] Pesquisa Engajamento Departamento", e copiavam os números do
 * painel à mão. Esta sub-aba junta tudo na ordem da apresentação e gera o
 * .pptx já com os números.
 *
 * Três decisões que valem ler antes de mexer:
 *
 * 1. OS DADOS VÊM DE `getSurveyWave`, E NÃO DE UM ENDPOINT NOVO. Uma chamada
 *    por onda, com o mesmo filtro de departamento. A permissão continua num
 *    lugar só; quem não pode ver a área não recebe o dado e não consegue
 *    montar o deck dela.
 *
 * 2. PRECISA DE UMA ÁREA. A apresentação é "por departamento". Sem área
 *    escolhida (perfil global em "Todos"), a tela pede a escolha em vez de
 *    montar um deck da empresa com cara de deck de área.
 *
 * 3. LEITURA É DO HRBP. O deck sai com os números e com os campos de análise
 *    intactos. Aqui a tela mostra CANDIDATOS -- pistas por três réguas -- e
 *    diz que a escolha é humana.
 */

const COR_AREA = 'hsl(var(--flutter))';
const COR_BENCH = '#A9B1C7';

function Bloco({ slide, titulo, nota, children }: { slide: string; titulo: string; nota?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{tx(slide)}</p>
        <CardTitle className="text-base">{tx(titulo)}</CardTitle>
        {nota && <p className="text-xs text-muted-foreground">{tx(nota)}</p>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Kpi({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-xs text-muted-foreground">{tx(rotulo)}</p>
      <p className="text-2xl font-semibold tabular-nums">{valor}</p>
      {detalhe && <p className="text-xs text-muted-foreground">{detalhe}</p>}
    </div>
  );
}

const corDelta = (x: number | null) =>
  x == null ? '' : x > 0 ? 'text-emerald-600 dark:text-emerald-400' : x < 0 ? 'text-red-600 dark:text-red-400' : '';
const dif = (a: number | null, b: number | null) => (a == null || b == null ? null : a - b);

function Barras({ dados, chaves, formato }: {
  dados: Array<Record<string, string | number | null>>;
  chaves: Array<{ k: string; nome: string; cor: string }>;
  formato: (v: number) => string;
}) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={dados} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
        <XAxis dataKey="cat" tick={{ fontSize: 11 }} />
        <YAxis hide />
        <Tooltip formatter={(v: number) => formato(v)} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {chaves.map((c) => (
          <Bar key={c.k} dataKey={c.k} name={c.nome} fill={c.cor} radius={[3, 3, 0, 0]}>
            <LabelList dataKey={c.k} position="top" formatter={(v: number) => (v == null ? '' : formato(v))} className="text-[10px]" />
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function ListaCandidatos({ titulo, itens, formato }: {
  titulo: string; itens: Array<{ p: Pergunta; v: number }>; formato: (v: number) => string;
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold">{tx(titulo)}</p>
      {itens.length === 0 ? (
        <p className="text-xs text-muted-foreground">{tx('Nenhuma pergunta nesta régua.')}</p>
      ) : (
        <ul className="space-y-1">
          {itens.map(({ p, v }) => (
            <li key={p.pergunta} className="text-xs leading-snug">
              <span className="font-semibold tabular-nums">{formato(v)}</span>{' '}
              <span className="text-muted-foreground">{p.driver} ·</span> {p.pergunta}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ApresentacaoSection() {
  const { filters, brand } = useDashboard();
  const buscar = useServerFn(getSurveyWave);
  const [ondas, setOndas] = useState<{ atual: SurveyWaveData; todas: SurveyWaveData[] } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [gerando, setGerando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    setCarregando(true);
    setErro(null);
    (async () => {
      // SEM recorte de perfil: a apresentação é da área inteira. Os recortes
      // de tempo de casa, função etc. entram como tabela, não como filtro.
      const atual = (await buscar({ data: { department: filters.departamento, brand } })) as SurveyWaveData | null;
      if (!atual) return { atual: null, todas: [] as SurveyWaveData[] };
      const outras = await Promise.all(
        atual.ondas
          .filter((o) => o.wave !== atual.wave)
          .map((o) => buscar({ data: { wave: o.wave, department: filters.departamento, brand } }) as Promise<SurveyWaveData | null>),
      );
      return { atual, todas: [atual, ...outras.filter((o): o is SurveyWaveData => !!o)] };
    })()
      .then((r) => {
        if (cancelado) return;
        setOndas(r.atual ? { atual: r.atual, todas: r.todas } : null);
      })
      .catch((e: unknown) => {
        if (!cancelado) setErro(e instanceof Error ? e.message : 'Falha ao carregar');
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [buscar, filters.departamento, brand]);

  const bench = brand === 'combined' ? 'Flutter Brasil' : brand;
  const dados: DadosApresentacao | null = useMemo(() => {
    if (!ondas) return null;
    // `ondas` do servidor vem da mais recente para a mais antiga.
    const ordem = [...ondas.atual.ondas].reverse().map((o) => o.wave);
    return montarApresentacao(ondas.atual, ondas.todas, { bench, ordemOndas: ordem });
  }, [ondas, bench]);
  const cand = useMemo(() => (dados ? candidatos(dados) : null), [dados]);
  const sug = useMemo(() => (dados ? sugestoes(dados) : null), [dados]);

  async function gerar() {
    if (!dados) return;
    setGerando(true);
    try {
      const { gerarDeck } = await import('@/lib/apresentacao/deck');
      const resp = await fetch('/templates/apresentacao-engajamento.pptx');
      if (!resp.ok) throw new Error(`template indisponível (${resp.status})`);
      const { arquivo, faltando } = await gerarDeck(await resp.arrayBuffer(), tokensDoDeck(dados), graficosDoDeck(dados));
      if (faltando.length) console.warn('apresentação: chaves sem valor', faltando);
      // O JSZip devolve Uint8Array<ArrayBufferLike>; o TS 5.9 não aceita
      // isso como BlobPart por causa do SharedArrayBuffer. É sempre ArrayBuffer aqui.
      const blob = new Blob([arquivo as unknown as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Engajamento_${dados.area.replace(/\s+/g, '_')}_${dados.onda.curto.replace('/', '-')}.pptx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast.success(tx('Deck gerado. Os campos de leitura do HRBP seguem em aberto no arquivo.'));
    } catch (e) {
      toast.error(tx('Não foi possível gerar o deck: ') + (e instanceof Error ? e.message : String(e)));
    } finally {
      setGerando(false);
    }
  }

  if (erro) return <p className="py-16 text-center text-sm text-muted-foreground">{tx('Não foi possível carregar: ')}{erro}</p>;
  if (carregando) return <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (!ondas) return <p className="py-16 text-center text-sm text-muted-foreground">{tx('Nenhuma onda da pesquisa carregada.')}</p>;
  if (!dados) {
    return (
      <div className="rounded-md border border-border bg-muted/40 px-4 py-10 text-center text-sm text-muted-foreground">
        {tx('A apresentação é por área. Escolha um departamento no filtro do topo para montá-la.')}
      </div>
    );
  }

  const d = dados;
  const a = d.atual.area;
  const ant = d.atual.anterior;
  const b = d.atual.bench;
  const antCurto = d.ondaAnterior?.curto ?? tx('onda anterior');
  const histDados = d.historico.map((h) => ({
    cat: h.curto,
    enpsA: h.area.enps, enpsB: h.bench.enps,
    riscoA: h.area.risco, riscoB: h.bench.risco,
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-muted/40 px-4 py-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Presentation className="h-4 w-4 text-[hsl(var(--flutter))]" />
            {d.area} · {d.onda.label}
          </p>
          <p className="text-xs text-muted-foreground">
            {tx('Os números na ordem dos slides do template. O deck sai com os dados preenchidos e com os campos de leitura do HRBP em aberto.')}
          </p>
        </div>
        <Button onClick={gerar} disabled={gerando} className="gap-2">
          {gerando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {tx('Gerar deck pré-preenchido')}
        </Button>
      </div>

      <Bloco slide="Slide 3" titulo="Como ouvimos — participação"
        nota={d.participacao.semTaxa
          ? 'Com entidade selecionada não há taxa: o Cross Brand responde pelas duas entidades.'
          : 'Elegíveis = headcount do departamento no Convenia no mês de referência. A área declarada na pesquisa pode ser outra, então taxa perto ou acima de 100% pede ressalva.'}>
        <div className="grid gap-3 sm:grid-cols-4">
          <Kpi rotulo="Taxa de participação" valor={d.participacao.semTaxa ? '—' : fmtPct(d.participacao.taxa, 0)} detalhe={`${d.bench}: ${fmtPct(d.participacao.taxaBench, 1)}`} />
          <Kpi rotulo="Pessoas elegíveis" valor={fmtNum(d.participacao.elegiveis)} />
          <Kpi rotulo="Respostas recebidas" valor={fmtNum(d.participacao.respostas)} />
          <Kpi rotulo="Drivers medidos" valor={String(d.drivers.length)} detalhe={`${d.perguntas.length} ${tx('perguntas')}`} />
        </div>
      </Bloco>

      <Bloco slide="Slides 5 e 16" titulo={`Como o sentimento evoluiu em ${d.area}`} nota="Área vs empresa em cada onda disponível.">
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <p className="text-xs font-semibold">eNPS</p>
            <Barras dados={histDados} formato={(v) => fmtNum(v)}
              chaves={[{ k: 'enpsA', nome: d.area, cor: COR_AREA }, { k: 'enpsB', nome: d.bench, cor: COR_BENCH }]} />
          </div>
          <div>
            <p className="text-xs font-semibold">{tx('Risco de retenção (%)')}</p>
            <Barras dados={histDados} formato={(v) => fmtPct(v, 1)}
              chaves={[{ k: 'riscoA', nome: d.area, cor: COR_AREA }, { k: 'riscoB', nome: d.bench, cor: COR_BENCH }]} />
          </div>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-muted-foreground">
              <tr><th className="py-1">{tx('Onda')}</th><th>n</th><th>eNPS</th><th>{tx('Satisfação')}</th><th>{tx('Risco')}</th><th>eNPS {d.bench}</th><th>{tx('Risco')} {d.bench}</th></tr>
            </thead>
            <tbody className="tabular-nums">
              {d.historico.map((h) => (
                <tr key={h.wave} className="border-t border-border">
                  <td className="py-1">{h.label}</td><td>{fmtNum(h.area.n)}</td><td>{fmtNum(h.area.enps)}</td>
                  <td>{fmtNum(h.area.satisfacao, 1)}</td><td>{fmtPct(h.area.risco, 1)}</td>
                  <td>{fmtNum(h.bench.enps)}</td><td>{fmtPct(h.bench.risco, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Bloco>

      <Bloco slide="Slide 6" titulo="Onde estamos hoje">
        <div className="grid gap-3 sm:grid-cols-4">
          <Kpi rotulo="eNPS" valor={fmtNum(a.enps)} detalhe={`${fmtDelta(dif(a.enps, ant?.enps ?? null))} vs ${antCurto} · ${fmtDelta(dif(a.enps, b.enps))} vs ${d.bench}`} />
          <Kpi rotulo="Satisfação" valor={`${fmtNum(a.satisfacao, 1)} / 10`} detalhe={`${fmtDelta(dif(a.satisfacao, ant?.satisfacao ?? null), 1)} vs ${antCurto} · ${fmtDelta(dif(a.satisfacao, b.satisfacao), 1)} vs ${d.bench}`} />
          <Kpi rotulo="Risco de retenção" valor={fmtPct(a.risco, 1)} detalhe={`${fmtDelta(dif(a.risco, ant?.risco ?? null), 1, ' pp')} vs ${antCurto} · ${fmtDelta(dif(a.risco, b.risco), 1, ' pp')} vs ${d.bench}`} />
          <Kpi rotulo="Participação" valor={d.participacao.semTaxa ? '—' : fmtPct(d.participacao.taxa, 0)} detalhe={`n = ${fmtNum(a.n)}`} />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {tx('Composição do eNPS')} ({d.onda.curto}): {fmtNum(a.promotores)} {tx('promotores')}, {fmtNum(a.passivos)} {tx('neutros')}, {fmtNum(a.detratores)} {tx('detratores')}
          {ant && <> · {antCurto}: {fmtNum(ant.promotores)} / {fmtNum(ant.passivos)} / {fmtNum(ant.detratores)}</>}
        </p>
      </Bloco>

      {cand && (
        <Bloco slide="Slides 7, 8 e 11" titulo="Pistas para âncoras e fricções"
          nota="Três réguas, como pede o template: movimento, comparação com a empresa e associação com o eNPS. São pistas — a escolha do que proteger, tratar ou aprofundar é do HRBP.">
          <div className="grid gap-4 md:grid-cols-2">
            <ListaCandidatos titulo={`Maiores quedas vs ${antCurto} (pp)`} itens={cand.maioresQuedas} formato={(v) => fmtDelta(v, 1)} />
            <ListaCandidatos titulo={`Mais abaixo de ${d.bench} (pp)`} itens={cand.abaixoDaEmpresa} formato={(v) => fmtDelta(v, 1)} />
            <ListaCandidatos titulo={`Mais acima de ${d.bench} (pp)`} itens={cand.acimaDaEmpresa} formato={(v) => fmtDelta(v, 1)} />
            <ListaCandidatos titulo="Mais ligadas ao eNPS na área (r)" itens={cand.maisLigadasAoEnps} formato={(v) => fmtNum(v, 2)} />
          </div>
          {cand.maisLigadasAoEnps.length === 0 && (
            <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"><Info className="h-3 w-3" />{tx('A associação com o eNPS só é calculada em áreas com 30 ou mais respostas.')}</p>
          )}
          {sug && (
            <div className="mt-4 rounded-md border border-dashed border-border p-3">
              <p className="mb-2 text-xs font-semibold">{tx('Sugestão que sai no deck (slides 7, 8 e 9) — revisar antes da sessão')}</p>
              <div className="grid gap-3 text-xs md:grid-cols-3">
                <div>
                  <p className="mb-1 font-semibold text-emerald-600 dark:text-emerald-400">{tx('Âncoras (PROTEGER)')}</p>
                  {sug.ancoras.length === 0 ? <p className="text-muted-foreground">{tx('Nenhuma pergunta com favorável ≥ 75% acima da empresa.')}</p>
                    : sug.ancoras.map((a) => <p key={a.p.pergunta}><span className="font-semibold">{a.p.driver}</span> · {a.p.pergunta}</p>)}
                </div>
                <div>
                  <p className="mb-1 font-semibold text-red-600 dark:text-red-400">{tx('Fricções')}</p>
                  {sug.friccoes.filter(Boolean).map((f) => (
                    <p key={f!.p.pergunta}><span className="font-semibold">{f!.etiqueta}</span> · {f!.p.driver} · {f!.p.pergunta}</p>
                  ))}
                </div>
                <div>
                  <p className="mb-1 font-semibold">{tx('Populações destacadas')}</p>
                  {sug.populacoes.map(({ pop, qualificacao }) => (
                    <p key={pop.grupo + pop.segmento}>{tx(pop.segmento)} (n = {fmtNum(pop.n)}) · {tx('risco')} {fmtPct(pop.risco, 1)} vs {fmtPct(pop.riscoBench, 1)} · <span className="font-semibold">{qualificacao}</span></p>
                  ))}
                </div>
              </div>
            </div>
          )}
        </Bloco>
      )}

      <Bloco slide="Slides 9 e 17" titulo="Diferenças entre populações"
        nota={`Benchmark = a mesma população em ${d.bench}. n pequeno é indicativo; com n = 1 ou 2 o dado é praticamente individual — avalie antes de levar à sessão.`}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-muted-foreground">
              <tr><th className="py-1">{tx('Recorte')}</th><th>{tx('Segmento')}</th><th>n</th><th>eNPS</th><th>{tx('Risco')}</th><th>{tx('Risco')} {d.bench}</th><th>{tx('Diferença')}</th><th>eNPS {d.bench}</th></tr>
            </thead>
            <tbody className="tabular-nums">
              {d.populacoes.map((p) => {
                const df = dif(p.risco, p.riscoBench);
                return (
                  <tr key={p.grupo + p.segmento} className={cn('border-t border-border', (p.n ?? 0) < 5 && 'text-muted-foreground')}>
                    <td className="py-1">{tx(p.grupo)}</td><td>{tx(p.segmento)}</td><td>{fmtNum(p.n)}</td><td>{fmtNum(p.enps)}</td>
                    <td>{fmtPct(p.risco, 1)}</td><td>{fmtPct(p.riscoBench, 1)}</td>
                    <td className={cn(corDelta(df == null ? null : -df))}>{fmtDelta(df, 1, ' pp')}</td><td>{fmtNum(p.enpsBench)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Bloco>

      {d.evento && (
        <Bloco slide="Slide 10" titulo={`Evento recente: ${d.evento.nome}`} nota="Medido só nesta onda, sem ponto de comparação anterior.">
          <table className="w-full text-xs">
            <tbody className="tabular-nums">
              {d.evento.perguntas.map((p) => (
                <tr key={p.pergunta} className="border-t border-border">
                  <td className="py-1 pr-3">{p.pergunta}</td><td>{fmtPct(p.fav, 1)}</td>
                  <td className="text-muted-foreground">{d.bench} {fmtPct(p.favBench, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Bloco>
      )}

      <Bloco slide="Slides 14 e 15 (apêndice)" titulo="Resultados por driver e por pergunta"
        nota={`Favorável = % de notas 4–5. Diferenças em pontos percentuais. r = associação com o eNPS dentro da área.`}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-muted-foreground">
              <tr><th className="py-1">{tx('Driver / pergunta')}</th><th>{tx('Favorável')}</th><th>vs {antCurto}</th><th>vs {d.bench}</th><th>{tx('Média')}</th><th>r</th></tr>
            </thead>
            <tbody className="tabular-nums">
              {d.drivers.map((dr) => (
                <FragmentoDriver key={dr.nome} nome={dr.nome} fav={dr.fav} favAnt={dr.favAnt} favBench={dr.favBench} media={dr.media} perguntas={dr.perguntas} />
              ))}
            </tbody>
          </table>
        </div>
      </Bloco>
    </div>
  );
}

function FragmentoDriver({ nome, fav, favAnt, favBench, media, perguntas }: {
  nome: string; fav: number | null; favAnt: number | null; favBench: number | null; media: number | null; perguntas: Pergunta[];
}) {
  const dAnt = dif(fav, favAnt);
  const dB = dif(fav, favBench);
  return (
    <>
      <tr className="border-t-2 border-border bg-muted/40 font-semibold">
        <td className="py-1">{tx(nome)}</td><td>{fmtPct(fav, 1)}</td>
        <td className={corDelta(dAnt)}>{fmtDelta(dAnt, 1)}</td><td className={corDelta(dB)}>{fmtDelta(dB, 1)}</td>
        <td>{fmtNum(media, 2)}</td><td />
      </tr>
      {perguntas.map((p) => {
        const a = dif(p.fav, p.favAnt);
        const b = dif(p.fav, p.favBench);
        return (
          <tr key={p.pergunta} className="border-t border-border">
            <td className="py-1 pl-3 pr-3">{p.pergunta}</td><td>{fmtPct(p.fav, 1)}</td>
            <td className={corDelta(a)}>{fmtDelta(a, 1)}</td><td className={corDelta(b)}>{fmtDelta(b, 1)}</td>
            <td>{fmtNum(p.media, 2)}</td><td>{p.r == null ? '—' : fmtNum(p.r, 2)}</td>
          </tr>
        );
      })}
    </>
  );
}
