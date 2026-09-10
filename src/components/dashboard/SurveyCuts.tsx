import { useState } from 'react';
import { EyeOff } from 'lucide-react';
import ChartCard from '@/components/dashboard/ChartCard';
import { COLORS } from '@/lib/colors';
import { cn } from '@/lib/utils';
import { composicaoDoGrupo } from '@/lib/drill';
import AreaDriverPanel from '@/components/dashboard/AreaDriverPanel';
import type { DriverPorRecorte } from '@/lib/survey.functions';
import { ChevronDown } from 'lucide-react';
import type { SurveyCut } from '@/lib/survey.functions';
import {
  partesDoCruzamento, ehCruzamento, rotuloDeCorte, CROSS_BRAND, CROSS_BRAND_DESCRICAO,
} from '@/lib/aggregator/polly-survey';
import { toneDe, rotuloDe, TONE_TEXT, type ChaveMetrica } from '@/lib/metric-help';

/**
 * Cor sólida por trás de cada tom -- as barras usam a MESMA régua de
 * `metric-help.ts` que já pinta o KpiCard e o EngagementTab. Antes esta tela
 * pintava a barra pela DISTÂNCIA até a empresa; um grupo em 44 de eNPS ficava
 * verde se a empresa estivesse em 30, e o mesmo 44 ficava âmbar se a empresa
 * estivesse em 60 -- o número parecia bom ou ruim dependendo de uma conta que
 * ninguém via. Agora a cor é sobre o valor em si: 44 é "patamar baixo" (âmbar)
 * em qualquer empresa, porque é isso que a régua de `metric-help` diz.
 */
const TONE_BAR: Record<string, string> = {
  good: COLORS.success,
  warn: COLORS.warning,
  bad: COLORS.danger,
  neutral: COLORS.gray400,
};

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

/**
 * Barra de valor absoluto, colorida pela régua de `metric-help.ts`.
 *
 * `centroZero` é só para o eNPS: a escala vai de -100 a +100 e o zero
 * continua marcado, porque negativo/positivo ainda é uma leitura real. O
 * risco não tem essa marca -- é uma % que começa em zero e não existe
 * "risco negativo".
 */
function BarraAbsoluta({
  valor, chave, escalaMin, escalaMax, centroZero = false,
}: {
  valor: number | null;
  chave: ChaveMetrica;
  escalaMin: number;
  escalaMax: number;
  centroZero?: boolean;
}) {
  if (valor == null) {
    return <div className="h-3 rounded-full bg-muted/60 w-full" />;
  }
  const cor = TONE_BAR[toneDe(chave, valor)];
  const posPct = (v: number) =>
    Math.max(0, Math.min(((v - escalaMin) / (escalaMax - escalaMin)) * 100, 100));

  if (!centroZero) {
    return (
      <div className="relative h-3 w-full rounded-full bg-muted/50 overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all"
          style={{ width: `${posPct(valor)}%`, background: cor }}
        />
      </div>
    );
  }

  const zero = posPct(0);
  const alvo = posPct(valor);
  const esquerda = Math.min(zero, alvo);
  const largura = Math.abs(alvo - zero);
  return (
    <div className="relative h-3 w-full">
      <div className="absolute inset-0 rounded-full bg-muted/50" />
      <div className="absolute inset-y-0 w-px bg-border" style={{ left: `${zero}%` }} />
      <div
        className="absolute inset-y-0 rounded-full transition-all"
        style={{ left: `${esquerda}%`, width: `${largura}%`, background: cor }}
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
  rotulo, rows, chave, escalaMin, escalaMax, centroZero = false, sufixo, destacado = false,
  baseEmpresa,
}: {
  rotulo: string;
  rows: SurveyCut[];
  /** Chave em `metric-help.ts` -- de onde vêm a cor e o selo de patamar. */
  chave: ChaveMetrica;
  escalaMin: number;
  escalaMax: number;
  centroZero?: boolean;
  sufixo: string;
  /** Pedido da Marilia: o eNPS um pouco maior que o vizinho. */
  destacado?: boolean;
  /**
   * O valor da empresa, mostrado uma vez ao pé do painel -- não mais como a
   * régua que decide a cor de cada linha.
   *
   * ------------------------------------------------------------------
   * POR QUE A COR PAROU DE SER "ACIMA/ABAIXO DA EMPRESA"
   * ------------------------------------------------------------------
   * Os BPs relataram que o cartão anterior ficava confuso em toda leitura, e
   * a raiz não era o layout -- era o conceito: "distância até a empresa"
   * exige guardar um segundo número de cabeça antes de saber se o primeiro é
   * bom. `metric-help.ts` já resolve isso para o resto do painel com uma
   * régua sobre o VALOR em si (patamar alto/saudável/baixo/crítico para
   * eNPS; sob controle/atenção/acima do confortável para risco). Reusar essa
   * régua aqui faz "44 de eNPS" significar a mesma coisa em qualquer cartão
   * do sistema.
   *
   * A empresa não sai da tela -- ela ainda é o contexto que a Controladoria e
   * o Sandeep usam --, só deixa de ser o que pinta a barra.
   */
  baseEmpresa: number | null;
}) {
  const valorDe = (r: SurveyCut) => (chave === 'riscoSaida' ? r.risco : r.enps);
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">{rotulo}</p>
      <div className="space-y-1.5">
        {rows.map((r) => {
          const v = valorDe(r);
          const tom = toneDe(chave, v);
          const selo = rotuloDe(chave, v);
          return (
            <div key={r.cutValue} className="flex items-center gap-2 text-xs">
              <span
                className="w-[120px] shrink-0 truncate text-muted-foreground"
                title={rotuloDeCorte(r.cutValue)}
              >
                {rotuloDeCorte(r.cutValue)}
              </span>
              <div className="flex-1 min-w-0">
                <BarraAbsoluta
                  valor={v} chave={chave} escalaMin={escalaMin} escalaMax={escalaMax}
                  centroZero={centroZero}
                />
              </div>
              {/* O valor do próprio grupo é o número principal agora, com o
                  selo de patamar ao lado -- "44 · patamar baixo" não exige
                  saber nada sobre a empresa para ser lido. */}
              <span className={cn(
                'tabular-nums shrink-0 text-right',
                destacado ? 'text-[13px] font-bold' : 'font-medium',
                v == null ? 'w-[132px] text-muted-foreground' : 'w-[132px]',
                v != null && TONE_TEXT[tom],
              )}>
                {v == null ? 'oculto' : (
                  <>
                    {`${fmt1(v)}${sufixo}`}
                    {selo && <span className="text-muted-foreground font-normal"> · {selo}</span>}
                  </>
                )}
              </span>
            </div>
          );
        })}
      </div>
      {/* A empresa, discreta, uma vez por painel -- não mais por linha. Segue
          servindo à Controladoria e ao Sandeep, sem carregar a leitura de
          quem só precisa saber "este grupo está bem ou mal". */}
      {baseEmpresa != null && (
        <p className="text-[10px] text-muted-foreground mt-1.5 pl-[120px]">
          empresa: {fmt1(baseEmpresa)}{sufixo}
        </p>
      )}
    </div>
  );
}

function Bloco({
  titulo, rows, empresa, composicao = [], drivers = [], cutType, minimoExibicao = 5,
}: {
  titulo: string;
  rows: SurveyCut[];
  empresa: SurveyCut | undefined;
  /** De quais áreas vem o Cross Brand. Vazio quando o cruzamento não foi carregado. */
  composicao?: Array<{ area: string; n: number }>;
  /**
   * Notas por pergunta em TODOS os recortes, para abrir o clima de um grupo.
   *
   * ------------------------------------------------------------------
   * ESTE BLOCO SÓ SABIA COMPARAR, NÃO EXPLICAR
   * ------------------------------------------------------------------
   * Ele diz que Cross Brand está 16 pontos de eNPS abaixo da empresa, e para
   * por aí. A pergunta seguinte é sempre a mesma -- "abaixo em quê?" -- e a
   * resposta existia no banco desde sempre, sem chegar a lugar nenhum.
   *
   * Agora cada grupo abre, com o mesmo painel que já abre por área: as
   * perguntas em que ele está mais longe da empresa, nas duas direções.
   */
  drivers?: DriverPorRecorte[];
  /** 'tempo', 'modelo', 'funcao', 'marca' -- o recorte que este bloco mostra. */
  cutType?: string;
  minimoExibicao?: number;
}) {
  const [aberto, setAberto] = useState<string | null>(null);
  const temClima = (valor: string) =>
    !!cutType && drivers.some((l) => l.cutType === cutType && l.cutValue === valor);
  const ocultos = rows.filter((r) => r.suprimido);

  return (
    <div className="rounded-lg border border-border/60 bg-muted/15 p-3">
      <div className="flex items-baseline justify-between mb-2.5">
        <span className="text-sm font-medium">{titulo}</span>
      </div>
      <div className="grid lg:grid-cols-2 gap-x-6 gap-y-4">
        {/* "O NPS em negrito para ficar um pouco maior, um pouco mais
            destacado." Os dois painéis tinham exatamente o mesmo peso, e o
            eNPS é o número que abre a conversa.

            As escalas são FIXAS, e não mais calculadas a partir do maior
            desvio do grupo (`maxEnps`/`maxRisco`, removidos): eram uma escala
            relativa por bloco -- o mesmo -19 de eNPS ocupava larguras de barra
            diferentes em "Por marca" e em "Por tempo de casa", conforme o
            desvio máximo de cada um. Cor e barra por VALOR absoluto exigem uma
            régua que não muda de bloco para bloco.

            eNPS vai de -100 a 100 (ver metric-help.ts). O risco é uma % que,
            nas três ondas carregadas até 10/09, nunca passou de 35 -- 40 dá
            folga sem esmagar a barra contra a esquerda, e ainda deixa a faixa
            "acima do confortável" (20+) ocupando a metade de fora da barra. */}
        <Painel
          rotulo="eNPS" rows={rows} chave="enps" escalaMin={-100} escalaMax={100}
          centroZero sufixo="" destacado baseEmpresa={empresa?.enps ?? null}
        />
        <Painel
          rotulo="Risco de saída" rows={rows} chave="riscoSaida" escalaMin={0} escalaMax={40}
          sufixo="%" baseEmpresa={empresa?.risco ?? null}
        />
      </div>
      {/* Abrir o clima de um grupo. Os nomes ficam aqui embaixo, e não em cada
          uma das duas colunas, porque o grupo é o mesmo nas duas -- repetir o
          gatilho daria dois botões para a mesma ação. */}
      {cutType && rows.some((r) => temClima(r.cutValue)) && (
        <div className="mt-2.5 pt-2 border-t border-border/60 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            ver o clima de
          </span>
          {rows.filter((r) => temClima(r.cutValue)).map((r) => {
            const nome = rotuloDeCorte(r.cutValue);
            const eAberto = aberto === r.cutValue;
            return (
              <button
                key={r.cutValue}
                type="button"
                onClick={() => setAberto(eAberto ? null : r.cutValue)}
                aria-expanded={eAberto}
                className={cn(
                  'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] transition-colors',
                  eAberto
                    ? 'border-foreground/30 bg-secondary'
                    : 'border-border hover:bg-secondary/50',
                )}
              >
                <ChevronDown
                  className={cn(
                    'h-3 w-3 shrink-0 text-muted-foreground transition-transform',
                    eAberto ? 'rotate-0' : '-rotate-90',
                  )}
                />
                {nome}
              </button>
            );
          })}
        </div>
      )}

      {aberto && cutType && (
        <AreaDriverPanel
          area={aberto}
          cutType={cutType}
          drivers={drivers}
          minimoExibicao={minimoExibicao}
        />
      )}

      {/* Quem compõe o grupo, dito onde ele aparece. "Cross Brand" é mais
          honesto que "Ambas", mas continua sendo jargão para quem lê de fora
          -- e a Marilia pediu as duas coisas juntas, o termo e a explicação. */}
      {rows.some((r) => rotuloDeCorte(r.cutValue) === CROSS_BRAND) && (
        <p className="text-[11px] text-muted-foreground mt-2">
          <strong className="text-foreground">{CROSS_BRAND}</strong>: {CROSS_BRAND_DESCRICAO}.
          {composicao.length > 0 && (
            <>
              {' '}
              Vêm de {composicao.map((f) => `${f.area} (${f.n})`).join(', ')}.
            </>
          )}
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
  drivers = [],
  minimoExibicao = 5,
}: {
  cuts: SurveyCut[];
  /** Notas por pergunta em todos os recortes. Ver o comentário no `Bloco`. */
  drivers?: DriverPorRecorte[];
  minimoExibicao?: number;
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

  // De quais áreas vêm as pessoas do Cross Brand. A Marilia pediu uma
  // descrição "enquanto a gente ainda não tem esses dados certinho" -- e o dado
  // existe, exato, no cruzamento area+marca. Ver `composicaoDoGrupo`.
  const composicaoCrossBrand = composicaoDoGrupo(cuts, 'area+marca', CROSS_BRAND);

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
      ajuda="maisDistanteDaMedia"
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
            composicao={b.tipo === 'marca' ? composicaoCrossBrand : []}
            drivers={b.daArea ? [] : drivers}
            cutType={b.daArea ? undefined : b.tipo}
            minimoExibicao={minimoExibicao}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
        A cor é sobre o valor do grupo, não sobre a distância até a empresa — a mesma régua que
        pinta os outros cartões do painel (<strong className="text-emerald-600 dark:text-emerald-500">verde</strong> é
        patamar bom, <strong className="text-amber-600 dark:text-amber-500">âmbar</strong> é atenção,{' '}
        <strong className="text-red-600 dark:text-red-500">vermelho</strong> é crítico). O número da
        empresa aparece embaixo de cada painel, como referência — não é mais o que decide a cor.
      </p>
    </ChartCard>
  );
}
