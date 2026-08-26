import { useMemo } from 'react';
import { EyeOff } from 'lucide-react';
import ChartCard from '@/components/dashboard/ChartCard';
import { COLORS } from '@/lib/colors';
import { cn } from '@/lib/utils';
import type { SurveyCut } from '@/lib/survey.functions';
import {
  partesDoCruzamento, ehCruzamento, rotuloDeCorte, CROSS_BRAND, CROSS_BRAND_DESCRICAO,
} from '@/lib/aggregator/polly-survey';

/**
 * Gestor/contribuidor, marca e tempo de casa -- recortes que só existem depois
 * de ler o arquivo original da pesquisa.
 *
 * ------------------------------------------------------------------
 * POR QUE ISTO DEIXOU DE SER GRÁFICO
 * ------------------------------------------------------------------
 * A versão anterior eram três gráficos de barra com uma linha por cima e dois
 * eixos verticais -- eNPS de um lado, risco do outro. Eixo duplo é a forma mais
 * fácil de fazer duas séries parecerem relacionadas quando a relação é só de
 * escala: mexer no domínio de um dos eixos muda a "história" sem mudar um dado
 * sequer. Além disso obriga a conferir de qual eixo cada série é antes de ler
 * qualquer coisa.
 *
 * O que importa aqui é uma comparação simples: este grupo está acima ou abaixo
 * da empresa, e por quanto. Isso é uma barra com uma linha de referência, e a
 * distância é o dado.
 *
 * ------------------------------------------------------------------
 * SIGILO
 * ------------------------------------------------------------------
 * O servidor esconde a nota de recortes com menos de 5 respostas antes de
 * enviar (survey.functions.ts) -- aqui já chega null. O n continua na tela:
 * sumir com a linha faria a pessoa concluir que o grupo não respondeu e
 * perguntar o número por fora, que é o caminho sem controle nenhum.
 */

/** O filtro manda "COMMERCIAL"; a carga guarda "Commercial". */
const chaveArea = (t: string) =>
  (t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();

const fmt1 = (n: number | null | undefined) =>
  n == null ? '—' : Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 1 });

/**
 * ------------------------------------------------------------------
 * ESTA LISTA ERA UMA LISTA DE PERMISSÃO, E ESCONDIA UM RECORTE INTEIRO
 * ------------------------------------------------------------------
 * `modelo` (Remoto / Híbrido / Presencial) existe em `survey_cut_scores` desde
 * ago/26 e nunca chegou à tela, porque esta lista tinha três itens escritos à
 * mão e ninguém a revisitou quando a carga passou a trazer o quarto.
 *
 * O que torna a omissão grave não é o recorte faltar -- é ele ser o mais
 * destoante da onda: Híbrido em eNPS 53 (16 abaixo da empresa) com risco 24,5%,
 * o mais alto dos três, e 98 pessoas.
 *
 * E a frase "O que observar", no topo da aba, JÁ considerava `modelo` entre os
 * candidatos: ela varre todos os recortes que não são empresa nem área. Em
 * ago/26 ela citou "Ambas" (eNPS 53) e não "Híbrido" (eNPS 53) porque os dois
 * empataram e o desempate foi a ordem da lista. Bastava um ponto de diferença
 * para a leitura do topo apontar um recorte que não aparece em lugar nenhum
 * abaixo dela.
 *
 * A lição para a próxima carga: uma lista escrita à mão sobre dado que cresce
 * falha em silêncio. O `naoMapeados` abaixo é a proteção -- ele grita.
 */
const BLOCOS: Array<{ tipo: string; titulo: string; curto: string; cruzado: string }> = [
  { tipo: 'funcao', titulo: 'Gestores e contribuidores', curto: 'gestão', cruzado: 'area+funcao' },
  { tipo: 'marca', titulo: 'Por marca', curto: 'marca', cruzado: 'area+marca' },
  { tipo: 'modelo', titulo: 'Por modelo de trabalho', curto: 'modelo de trabalho', cruzado: 'area+modelo' },
  { tipo: 'tempo', titulo: 'Por tempo de casa', curto: 'tempo de casa', cruzado: 'area+tempo' },
];

/** "a, b e c" -- para o aviso listar só os blocos que a onda de fato tem. */
const listar = (v: string[]) =>
  v.length <= 1 ? (v[0] ?? '') : `${v.slice(0, -1).join(', ')} e ${v[v.length - 1]}`;

/** Barra divergente: distância até a empresa, para a esquerda ou para a direita. */
function Divergente({
  valor, base, max, invertido = false,
}: {
  valor: number | null;
  base: number;
  max: number;
  /** true quando MAIOR é pior (caso do risco de saída). */
  invertido?: boolean;
}) {
  if (valor == null) {
    return <div className="h-3 rounded-full bg-muted/60 w-full" />;
  }
  const d = valor - base;
  const larguraPct = Math.min(Math.abs(d) / max, 1) * 50;
  const bom = invertido ? d <= 0 : d >= 0;
  const cor = bom ? COLORS.success : COLORS.warning;
  return (
    <div className="relative h-3 w-full">
      <div className="absolute inset-0 rounded-full bg-muted/50" />
      <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
      <div
        className="absolute inset-y-0 rounded-full transition-all"
        style={{
          // Intensidade acompanha a distância: perto da empresa quase apaga,
          // longe fica cheio. Sem isso, todo desvio parecia igual.
          background: `color-mix(in oklab, ${cor} ${55 + (larguraPct / 50) * 40}%, transparent)`,
          ...(d >= 0
            ? { left: '50%', width: `${larguraPct}%` }
            : { right: '50%', width: `${larguraPct}%` }),
        }}
      />
    </div>
  );
}

/**
 * Um painel por métrica (eNPS e risco), em vez das duas barras divergentes na
 * mesma linha. Duas escalas lado a lado numa linha de 11px obrigavam leitura
 * linha-a-linha; separadas, "quem está longe" salta antes da leitura consciente.
 */
function Painel({
  rotulo, rows, base, max, invertido = false, sufixo,
}: {
  rotulo: string;
  rows: SurveyCut[];
  base: number;
  max: number;
  invertido?: boolean;
  sufixo: string;
}) {
  const valorDe = (r: SurveyCut) => (invertido ? r.risco : r.enps);
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">{rotulo}</p>
      <div className="space-y-1.5">
        {rows.map((r) => {
          const v = valorDe(r);
          const d = v == null ? null : v - base;
          const bom = d == null ? false : invertido ? d <= 0 : d >= 0;
          return (
            <div key={r.cutValue} className="flex items-center gap-2 text-xs">
              <span
                className="w-[120px] shrink-0 truncate text-muted-foreground"
                title={rotuloDeCorte(r.cutValue)}
              >
                {rotuloDeCorte(r.cutValue)}
              </span>
              <div className="flex-1 min-w-0">
                <Divergente valor={v} base={base} max={max} invertido={invertido} />
              </div>
              <span className={cn(
                'tabular-nums w-[62px] shrink-0 text-right font-medium',
                d == null ? 'text-muted-foreground'
                : bom ? 'text-emerald-600 dark:text-emerald-500'
                : 'text-amber-600 dark:text-amber-500',
              )}>
                {d == null ? 'oculto' : `${d > 0 ? '+' : ''}${fmt1(d)}${sufixo}`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Bloco({ titulo, rows, empresa }: { titulo: string; rows: SurveyCut[]; empresa: SurveyCut | undefined }) {
  const baseEnps = empresa?.enps ?? 0;
  const baseRisco = empresa?.risco ?? 0;
  const maxEnps = useMemo(
    () => Math.max(...rows.map((r) => Math.abs((r.enps ?? baseEnps) - baseEnps)), 5),
    [rows, baseEnps],
  );
  const maxRisco = useMemo(
    () => Math.max(...rows.map((r) => Math.abs((r.risco ?? baseRisco) - baseRisco)), 3),
    [rows, baseRisco],
  );
  const ocultos = rows.filter((r) => r.suprimido);

  return (
    <div className="rounded-lg border border-border/60 bg-muted/15 p-3">
      <div className="flex items-baseline justify-between mb-2.5">
        <span className="text-sm font-medium">{titulo}</span>
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
          diferença para a empresa
        </span>
      </div>
      <div className="grid lg:grid-cols-2 gap-x-6 gap-y-4">
        <Painel rotulo="eNPS" rows={rows} base={baseEnps} max={maxEnps} sufixo=" pts" />
        <Painel rotulo="Risco de saída" rows={rows} base={baseRisco} max={maxRisco} invertido sufixo=" p.p." />
      </div>
      {/* Quem compõe o grupo, dito onde ele aparece. "Cross Brand" é mais
          honesto que "Ambas", mas continua sendo jargão para quem lê de fora
          -- e a Marilia pediu as duas coisas juntas, o termo e a explicação. */}
      {rows.some((r) => rotuloDeCorte(r.cutValue) === CROSS_BRAND) && (
        <p className="text-[11px] text-muted-foreground mt-2">
          <strong className="text-foreground">{CROSS_BRAND}</strong>: {CROSS_BRAND_DESCRICAO}.
        </p>
      )}
      {ocultos.length > 0 && (
        <p className="text-xs mt-2 flex items-start gap-1" style={{ color: COLORS.warning }}>
          <EyeOff className="h-3 w-3 mt-0.5 shrink-0" />
          {ocultos.length === 1 ? 'Um grupo tem' : `${ocultos.length} grupos têm`} menos de 5
          respostas — nota oculta para não apontar para pessoas.
        </p>
      )}
      <p className="text-[11px] text-muted-foreground mt-2">
        n por grupo: {rows.map((r) => `${rotuloDeCorte(r.cutValue)} ${r.n}`).join(' · ')}
      </p>
    </div>
  );
}


export default function SurveyCuts({
  cuts,
  departamentoSelecionado,
}: {
  cuts: SurveyCut[];
  /**
   * Departamento ativo no filtro.
   *
   * ------------------------------------------------------------------
   * ROTULAR NÃO BASTA: O NÚMERO DA EMPRESA NÃO SUBSTITUI O DA ÁREA
   * ------------------------------------------------------------------
   * Este cartão já mostrou "Betnacional 327 · Ambas 122 · Betfair 36" com
   * PRODUCT filtrado -- 485 pessoas, a empresa toda, ao lado dos 41
   * respondentes de Product. A primeira correção foi pôr um rótulo dizendo de
   * quem era o número. Honesto, e ainda assim errado: quem filtra uma área
   * pede a leitura DELA, e um bloco da empresa no lugar do dela ocupa o
   * espaço da resposta com outra coisa.
   *
   * Agora, com filtro, um bloco só aparece se existir o cruzamento com área.
   * Os que não existem viram uma nota do que falta e de como resolver --
   * reimportar --, porque a diferença entre "não foi calculado nesta carga" e
   * "não dá" é a distinção que este painel mais erra.
   *
   * A LINHA DE REFERÊNCIA DA EMPRESA FICA. Ela é a régua contra a qual a
   * barra da área é lida, não um substituto do dado da área: some ela e
   * "Marketing 44" deixa de significar qualquer coisa. Um agregado de nove
   * áreas também não identifica nenhuma delas.
   */
  departamentoSelecionado?: string | null;
}) {
  const empresa = cuts.find((c) => c.cutType === 'company');

  // ------------------------------------------------------------------
  // COM ÁREA SELECIONADA, CADA BLOCO PROCURA PRIMEIRO O CRUZAMENTO
  // ------------------------------------------------------------------
  // O aviso deste cartão dizia que estes recortes "cortam a empresa por outro
  // eixo e não identificam área". A primeira metade é verdade e a segunda era
  // conclusão errada: cada resposta traz área E marca E tempo E função juntas,
  // então "Commercial na Betnacional" sempre foi calculável. Não era.
  //
  // Onde a onda foi carregada com o cruzamento, o bloco vira o da área e o
  // nome perde o prefixo ("Commercial || Ambas" aparece como "Ambas"). Onde não
  // foi, cai no recorte da empresa e o aviso explica a diferença entre "não
  // calculado nesta carga" e "não dá".
  const candidatos = BLOCOS.map((b) => {
    const cruzadas = departamentoSelecionado
      ? cuts.flatMap((c) => {
          if (c.cutType !== b.cruzado) return [];
          const p = partesDoCruzamento(c.cutValue);
          if (!p || chaveArea(p.area) !== chaveArea(departamentoSelecionado)) return [];
          return [{ ...c, cutValue: p.valor }];
        })
      : [];
    if (cruzadas.length > 0) return { ...b, rows: cruzadas, daArea: true };
    // Sem filtro, o recorte da empresa É a leitura pedida.
    if (!departamentoSelecionado) {
      return { ...b, rows: cuts.filter((c) => c.cutType === b.tipo), daArea: false };
    }
    // Com filtro, não. Ver o comentário da prop.
    return { ...b, rows: [] as SurveyCut[], daArea: false };
  });

  const blocos = candidatos.filter((b) => b.rows.length > 0);

  // Existe na empresa, não existe para esta área: é isso que a nota promete
  // resolver. Um bloco que a carga não trouxe para ninguém não vira promessa.
  const faltando = departamentoSelecionado
    ? candidatos.filter((b) => !b.daArea && cuts.some((c) => c.cutType === b.tipo))
    : [];

  // ------------------------------------------------------------------
  // O QUE VEIO NA CARGA E NÃO TEM BLOCO
  // ------------------------------------------------------------------
  // `modelo` ficou fora da tela por meses porque BLOCOS é escrito à mão e o
  // dado cresceu sozinho. Silêncio é o pior comportamento aqui: some sem deixar
  // rastro, e a frase do topo da aba continua podendo citar o recorte sumido.
  //
  // Agora um recorte novo se anuncia. Feio de propósito -- é para alguém
  // dar-lhe um nome, não para virar paisagem.
  const naoMapeados = [
    ...new Set(
      cuts
        // Cruzado não é "recorte sem bloco": ele TEM bloco, é a versão por
        // área de um dos quatro. Sem esta exclusão o aviso pediria um nome
        // para 'area+tempo' logo abaixo do bloco de tempo de casa.
        .filter((c) => c.cutType !== 'company' && c.cutType !== 'area' && !ehCruzamento(c.cutType))
        .map((c) => c.cutType)
        .filter((t) => !BLOCOS.some((b) => b.tipo === t)),
    ),
  ];

  if (!empresa) return null;
  if (!blocos.length && !faltando.length && !naoMapeados.length) return null;

  // A frase de leitura sai do próprio dado: o maior afastamento entre grupos
  // grandes o bastante para o afastamento significar alguma coisa.
  const destaque = departamentoSelecionado ? undefined : cuts
    // ------------------------------------------------------------------
    // A FRASE DE DESTAQUE NÃO OLHA OS CRUZADOS
    // ------------------------------------------------------------------
    // Ela nomeia o recorte no texto: "Ambas está 16 pontos abaixo". Com os
    // cruzados no conjunto, ela escreveria "Commercial || Ambas está...", com
    // o separador cru na tela -- e falaria de um subgrupo de uma área como se
    // fosse um recorte da empresa, que é o que este cartão compara.
    //
    // Com uma área filtrada ela some inteira: a frase nomeia um recorte da
    // empresa ("Ambas está 16 pontos abaixo") e fala de 122 pessoas de fora
    // da área escolhida.
    .filter((c) =>
      c.cutType !== 'company' && c.cutType !== 'area' && !ehCruzamento(c.cutType)
      && !c.suprimido && c.enps != null && c.n >= 20)
    .sort((a, b) => (a.enps as number) - (b.enps as number))[0];

  return (
    <ChartCard
      title={departamentoSelecionado
        ? `Quem está mais distante da média em ${departamentoSelecionado}`
        : 'Quem está mais distante da média'}
      subtitle={`comparado com a empresa: eNPS ${empresa.enps}, risco ${fmt1(empresa.risco)}%`}
    >
      {/* Não é mais "este bloco não segue o filtro" -- todos seguem. É o que
          falta para esta área, e o que fazer a respeito. */}
      {faltando.length > 0 && (
        <p className="mb-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          Sem {listar(faltando.map((b) => b.curto))} para{' '}
          <strong>{departamentoSelecionado}</strong>: o cruzamento com área não foi calculado nas
          ondas já carregadas. Não é limite do dado — cada resposta traz os dois campos juntos —,
          e reimportar as ondas {faltando.length > 1 ? 'passa a trazê-los' : 'passa a trazê-lo'} por
          área. Até lá {faltando.length > 1 ? 'ficam' : 'fica'} de fora, em vez de{' '}
          {faltando.length > 1 ? 'aparecerem' : 'aparecer'} com o número da empresa inteira.
        </p>
      )}
      {naoMapeados.length > 0 && (
        <p className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:text-amber-200">
          A carga trouxe {naoMapeados.length === 1 ? 'um recorte' : 'recortes'} que esta tela ainda
          não sabe nomear: <strong>{naoMapeados.join(', ')}</strong>. {naoMapeados.length === 1
            ? 'Ele não está'
            : 'Eles não estão'}{' '}
          nos blocos abaixo — dê {naoMapeados.length === 1 ? 'a ele' : 'a eles'} um título em{' '}
          <code>BLOCOS</code>.
        </p>
      )}
      {destaque && (empresa.enps as number) - (destaque.enps as number) >= 8 && (
        <p className="text-sm leading-relaxed mb-3">
          <strong>{rotuloDeCorte(destaque.cutValue)}</strong> está{' '}
          {(empresa.enps as number) - (destaque.enps as number)} pontos de eNPS abaixo da empresa,
          e são {destaque.n} pessoas. É um recorte que a leitura por área não mostra.
        </p>
      )}
      <div className="space-y-3">
        {blocos.map((b) => (
          <Bloco
            key={b.tipo}
            // O título diz de quem é o bloco. Sem isso, "Por marca" com os
            // números de Commercial e "Por marca" com os da empresa ficam
            // idênticos na tela e diferentes no dado.
            titulo={b.daArea ? `${b.titulo} · ${departamentoSelecionado}` : b.titulo}
            rows={b.rows}
            empresa={empresa}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
        A linha do meio de cada barra é a empresa. Verde é melhor que a média, âmbar é pior — vale
        para os dois lados, já que em risco de saída menor é melhor.
      </p>
    </ChartCard>
  );
}
