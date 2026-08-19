import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { AlertTriangle, CheckCircle2, ClipboardList, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { parsePollyExport } from '@/lib/aggregator/polly-parser';
import {
  computeCuts, computeDriverScores, computeDriverImportance,
} from '@/lib/aggregator/polly-survey';
import { importSurveyWave, type ResultadoCarga } from '@/lib/survey-import.functions';

/**
 * Carga de uma onda de pesquisa, do CSV do Polly.
 *
 * ------------------------------------------------------------------
 * POR QUE A LEITURA ACONTECE AQUI, NO NAVEGADOR
 * ------------------------------------------------------------------
 * O export do Polly traz uma linha por respondente e -- na onda de agosto --
 * 87 colunas, das quais mais da metade eram comentários em texto aberto.
 * Comentário de pesquisa anônima é o tipo de dado que, uma vez no banco,
 * alguém eventualmente lê junto com o recorte de área e deixa de ser anônimo.
 *
 * Então o arquivo é lido e AGREGADO aqui. O que sobe são somas e contagens por
 * recorte. Nenhuma resposta individual atravessa a rede, e não existe caminho
 * no servidor que aceite uma.
 *
 * É a mesma decisão já tomada para o Talent_Mobility.xlsx.
 *
 * ------------------------------------------------------------------
 * PRÉVIA ANTES DE GRAVAR, SEMPRE
 * ------------------------------------------------------------------
 * As duas cargas feitas à mão (ago/26 e jul/25) só deram certo porque tiveram
 * conferência antes: contagem de respostas, de perguntas reconhecidas, e o que
 * o parser não reconheceu. É isso que esta tela mostra -- inclusive os
 * cabeçalhos ignorados, porque "34 perguntas reconhecidas" só significa alguma
 * coisa ao lado de "e estas oito colunas eu não entendi".
 */

/** CSV com aspas e quebra de linha dentro de célula. O export do Polly tem os dois. */
function lerCsv(txt: string): string[][] {
  const out: string[][] = [];
  let linha: string[] = [], cur = '', emAspas = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (emAspas) {
      if (c === '"') { if (txt[i + 1] === '"') { cur += '"'; i++; } else emAspas = false; }
      else cur += c;
    } else if (c === '"') emAspas = true;
    else if (c === ',') { linha.push(cur); cur = ''; }
    else if (c === '\n') { linha.push(cur); out.push(linha); linha = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur || linha.length) { linha.push(cur); out.push(linha); }
  return out;
}

interface Previa {
  respostas: number;
  encontrado: ReturnType<typeof parsePollyExport>['encontrado'];
  ignorados: string[];
  cuts: ReturnType<typeof computeCuts>;
  driverScores: ReturnType<typeof computeDriverScores>;
  importance: ReturnType<typeof computeDriverImportance>;
}

export function PesquisaCard() {
  const gravar = useServerFn(importSurveyWave);

  const [previa, setPrevia] = useState<Previa | null>(null);
  const [arquivo, setArquivo] = useState<string>('');
  const [wave, setWave] = useState('');
  const [label, setLabel] = useState('');
  const [referenceDate, setReferenceDate] = useState('');
  const [eligible, setEligible] = useState('');
  const [notes, setNotes] = useState('');
  const [resultado, setResultado] = useState<ResultadoCarga | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const aoEscolher = async (f: File | null) => {
    setErro(null); setResultado(null); setPrevia(null);
    if (!f) return;
    setArquivo(f.name);
    try {
      const linhas = lerCsv(await f.text());
      const p = parsePollyExport(linhas);
      setPrevia({
        respostas: p.responses.length,
        encontrado: p.encontrado,
        ignorados: p.ignorados,
        cuts: computeCuts(p.responses),
        driverScores: computeDriverScores(p.responses, ['company', 'area', 'tempo', 'funcao', 'marca', 'modelo']),
        importance: computeDriverImportance(p.responses),
      });
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  };

  const enviar = async (confirm: boolean) => {
    if (!previa) return;
    setOcupado(true); setErro(null);
    try {
      const r = await gravar({
        data: {
          wave: wave.trim(), label: label.trim(), referenceDate: referenceDate.trim(),
          respondents: previa.respostas,
          eligible: eligible.trim() ? Number(eligible) : null,
          notes: notes.trim() || null,
          cuts: previa.cuts,
          driverScores: previa.driverScores,
          importance: previa.importance,
          confirm,
        },
      });
      setResultado(r as ResultadoCarga);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  };

  const areas = previa?.cuts.filter((c) => c.cutType === 'area') ?? [];
  const podeGravar = wave.trim() && label.trim() && /^\d{4}-\d{2}-\d{2}$/.test(referenceDate.trim());

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <ClipboardList className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">Carregar onda de pesquisa</h3>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
            O CSV do Polly é lido e agregado <strong>no seu navegador</strong>. Sobem
            somas e contagens por recorte — nenhuma resposta individual e nenhum
            comentário atravessam a rede.
          </p>

          <div className="mt-3">
            <Input
              type="file" accept=".csv,text/csv"
              onChange={(ev) => void aoEscolher(ev.target.files?.[0] ?? null)}
              className="text-sm"
            />
          </div>

          {erro && <p className="mt-3 text-sm text-red-600 dark:text-red-500">{erro}</p>}

          {previa && (
            <div className="mt-4 space-y-3">
              <div className="rounded-md border border-border bg-secondary/30 px-3 py-2.5">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
                  O que o arquivo tem · {arquivo}
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 text-[13px]">
                  <Item rotulo="Respostas" valor={previa.respostas} />
                  <Item rotulo="Perguntas de driver" valor={previa.encontrado.drivers} />
                  <Item rotulo="Áreas" valor={areas.length} />
                  <Item rotulo="Recortes" valor={previa.cuts.length} />
                </div>

                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                  {([
                    ['eNPS', previa.encontrado.nps],
                    ['permanência', previa.encontrado.retencao],
                    ['satisfação', previa.encontrado.satisfacao],
                    ['área', previa.encontrado.area],
                    ['tempo de casa', previa.encontrado.tempo],
                    ['função', previa.encontrado.funcao],
                    ['marca', previa.encontrado.marca],
                    ['modelo', previa.encontrado.modelo],
                  ] as const).map(([nome, achou]) => (
                    <span key={nome} className={achou ? 'text-emerald-600 dark:text-emerald-500' : 'text-muted-foreground line-through'}>
                      {nome}
                    </span>
                  ))}
                </div>

                {/* Os cabeçalhos que o parser não entendeu. "34 perguntas
                    reconhecidas" só quer dizer alguma coisa ao lado de "e
                    estas eu não entendi" -- foi assim que a pergunta de
                    modelo de trabalho apareceu, descartada em silêncio. */}
                {previa.ignorados.length > 0 && (
                  <details className="mt-2">
                    <summary className="text-[11px] text-muted-foreground cursor-pointer">
                      {previa.ignorados.length} colunas não reconhecidas — vale conferir
                    </summary>
                    <ul className="mt-1 space-y-0.5">
                      {previa.ignorados.map((h) => (
                        <li key={h} className="text-[11px] text-muted-foreground truncate">{h}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <Campo rotulo="Identificador (ago_2026)" valor={wave} onChange={setWave} />
                <Campo rotulo="Como é chamada (Agosto/26)" valor={label} onChange={setLabel} />
                <Campo rotulo="Início da coleta (AAAA-MM-DD)" valor={referenceDate} onChange={setReferenceDate} />
                <Campo rotulo="Elegíveis na largada" valor={eligible} onChange={setEligible} />
              </div>
              <Campo rotulo="Observação (aparece na linha do tempo)" valor={notes} onChange={setNotes} />

              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => void enviar(false)} disabled={!podeGravar || ocupado} variant="outline" size="sm">
                  Simular
                </Button>
                <Button onClick={() => void enviar(true)} disabled={!podeGravar || ocupado} size="sm">
                  <Upload className="h-3.5 w-3.5 mr-1.5" />
                  Gravar
                </Button>
                {!podeGravar && (
                  <span className="text-[11px] text-muted-foreground">
                    preencha identificador, nome e data
                  </span>
                )}
              </div>
            </div>
          )}

          {resultado && (
            <div className="mt-4 rounded-md border border-border px-3 py-2.5">
              <div className="flex items-center gap-2">
                {resultado.gravado
                  ? <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-500" />
                  : <AlertTriangle className="h-4 w-4 text-muted-foreground" />}
                <p className="text-sm font-medium">
                  {resultado.gravado
                    ? `${resultado.wave} gravada`
                    : `Simulação de ${resultado.wave} — nada foi gravado`}
                </p>
              </div>
              <p className="mt-1 text-[12px] text-muted-foreground">
                {resultado.linhas.cuts} recortes · {resultado.linhas.engagementScores} áreas ·{' '}
                {resultado.linhas.engagementDrivers} perguntas ·{' '}
                {resultado.linhas.driverScores} notas por recorte ·{' '}
                {resultado.linhas.importance} correlações
              </p>
              {resultado.avisos.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {resultado.avisos.map((a) => (
                    <li key={a} className="text-[12px] leading-relaxed text-amber-700 dark:text-amber-400">
                      {a}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const Item = ({ rotulo, valor }: { rotulo: string; valor: number }) => (
  <div>
    <span className="text-muted-foreground">{rotulo}: </span>
    <strong className="tabular-nums">{valor}</strong>
  </div>
);

const Campo = ({ rotulo, valor, onChange }: {
  rotulo: string; valor: string; onChange: (v: string) => void;
}) => (
  <label className="block">
    <span className="text-[11px] text-muted-foreground">{rotulo}</span>
    <Input value={valor} onChange={(e) => onChange(e.target.value)} className="mt-0.5 h-8 text-sm" />
  </label>
);

export default PesquisaCard;
