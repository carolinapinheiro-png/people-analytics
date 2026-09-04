import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Map as MapIcon, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { COLORS } from '@/lib/colors';
import { mapearCamposTalent, salvarEscolhaTalent, type MapaDeCampos } from '@/lib/talent-mobility.functions';
import type { CampoVisto } from '@/lib/talent-mobility';

/**
 * O mapa dos reports do Sandeep, antes de existir botão que os gere.
 *
 * O Talent Mobility Data Model tem 51 colunas no vocabulário do Workday, e o
 * Convenia tem os dados -- com nomes dados pelo RH. Esta tela mostra qual campo
 * preenche cada coluna, com que cobertura e que valores, e deixa a escolha ser
 * feita olhando. Ver `talent-mobility.ts` para por que não se chuta nome aqui.
 */
export function TalentMobilityCard() {
  const mapear = useServerFn(mapearCamposTalent);
  const salvar = useServerFn(salvarEscolhaTalent);
  const [dados, setDados] = useState<MapaDeCampos[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState<string | null>(null);

  const rodar = async () => {
    setCarregando(true); setErro(null);
    try {
      setDados(await mapear({}));
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCarregando(false);
    }
  };

  /**
   * Escolher grava e relê. Reler custa uma chamada, e paga: a escolha muda o
   * que sobra para as outras colunas -- um campo vale por uma só -- e uma tela
   * que mostra o mapa antigo depois de salvar faz duvidar do que foi gravado.
   */
  const escolher = async (coluna: string, campos: CampoVisto[], nome: string) => {
    setSalvando(coluna); setErro(null);
    try {
      const c = campos.find((x) => x.nome === nome);
      await salvar({ data: { coluna, campo: nome, origem: c?.origem ?? 'personalizado' } });
      setDados(await mapear({}));
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(null);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <MapIcon className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="flex-1">
          <h3 className="text-base font-semibold">Reports do Sandeep — de onde sai cada coluna</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            As 51 colunas do Talent Mobility Data Model contra o cadastro do Convenia. Para
            cada coluna, escolha o campo olhando a cobertura e os valores — a escolha fica
            gravada e é ela que o gerador do CSV vai ler. Meus palpites por nome aparecem
            como palpite e não contam: <code>Level</code> é o Compensation Grade, e os dois
            nomes não têm uma letra em comum.
          </p>

          <Button onClick={rodar} disabled={carregando} className="mt-4" variant="outline">
            <RefreshCw className={`mr-2 h-4 w-4 ${carregando ? 'animate-spin' : ''}`} />
            {carregando ? 'Lendo o cadastro…' : 'Mapear os campos'}
          </Button>

          {erro && <p className="mt-3 text-sm" style={{ color: COLORS.danger }}>{erro}</p>}

          {/* Depois da unificação existe uma base só, e as outras fontes leem
              zero. Imprimir "29 colunas sem fonte" cinco vezes não é notícia --
              é ruído com cara de problema. */}
          {dados && dados.filter((d) => d.amostra === 0 && !d.erro).length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Sem cadastro para ler:{' '}
              {dados.filter((d) => d.amostra === 0 && !d.erro).map((d) => d.empresa).join(', ')}
              {' '}— esperado desde a unificação.
            </p>
          )}

          {dados?.filter((d) => d.amostra > 0 || d.erro).map((d) => {
            const orfas = d.mapa.filter((m) => !m.jaTemos && !m.campo);
            return (
              <div key={d.empresa} className="mt-4 rounded-lg border border-border/60 p-3 text-xs">
                <p className="text-sm font-medium">
                  {d.empresa}
                  <span className="font-normal text-muted-foreground">
                    {' '}· {d.amostra} cadastros lidos
                  </span>
                </p>
                {d.erro && <p style={{ color: COLORS.danger }}>{d.erro}</p>}
                {!d.erro && (
                  <p className="mt-1 text-muted-foreground">
                    {d.mapa.filter((m) => m.jaTemos).length} colunas já saem do que temos ·{' '}
                    {d.mapa.filter((m) => m.forca === 'escolhida').length} escolhidas ·{' '}
                    {d.mapa.filter((m) => m.forca === 'exata' || m.forca === 'parcial').length}{' '}
                    palpite meu · {orfas.length} sem campo
                  </p>
                )}

                {/* Uma linha por coluna que precisa de campo. O seletor lista
                    TODOS os campos do cadastro com cobertura e valores: é
                    olhando o valor que se descobre que `Level` (L0/L5/L3) é o
                    Compensation Grade -- os nomes não têm uma letra em comum, e
                    nenhum casamento por nome chegaria lá. */}
                {d.mapa.filter((m) => !m.jaTemos).map((m) => (
                  <div key={m.coluna} className="mt-1 border-b border-border/40 py-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{m.coluna}</span>
                      <select
                        className="rounded border border-border bg-background px-1 py-0.5 font-mono"
                        disabled={salvando === m.coluna}
                        value={m.forca === 'escolhida' ? m.campo!.nome : ''}
                        onChange={(e) => escolher(m.coluna, d.campos, e.target.value)}
                      >
                        <option value="">
                          {m.campo ? `— palpite: ${m.campo.nome} —` : '— escolher campo —'}
                        </option>
                        {d.campos.map((c) => (
                          <option key={c.nome} value={c.nome}>
                            {c.nome} · {c.preenchidos}/{d.amostra}
                            {c.valores.length ? ` · ${c.valores.slice(0, 3).join(' | ')}` : ''}
                          </option>
                        ))}
                      </select>
                      {salvando === m.coluna && <span className="text-muted-foreground">salvando…</span>}
                      {m.forca === 'escolhida' && (
                        <span className="text-emerald-600 dark:text-emerald-500">
                          escolhido por {m.definidoPor}
                        </span>
                      )}
                      {m.forca === 'parcial' && (
                        <span className="text-amber-600 dark:text-amber-500">palpite por pedaço</span>
                      )}
                      {m.forca === 'exata' && (
                        <span className="text-muted-foreground">palpite por nome exato</span>
                      )}
                      {!m.campo && <span className="text-muted-foreground">sem campo</span>}
                    </div>
                    {m.campo && (
                      <p className="text-muted-foreground">
                        {m.campo.origem} · {m.campo.preenchidos}/{d.amostra} ·{' '}
                        {m.campo.valores.join(' | ') || '—'}
                      </p>
                    )}
                  </div>
                ))}

                {/* A lista de órfãs saiu: cada coluna agora diz na própria
                    linha que está sem campo, e repetir a mesma informação em
                    dois lugares faz um deles envelhecer. */}

                {/* Aberto por padrão. Na primeira execução real eu escondi esta
                    lista atrás de um resumo, e ela tinha 68 campos -- os únicos
                    lugares onde Job Family, Worker Type e FTE podem estar. O que
                    resolve o problema não fica atrás de um clique. */}
                {d.sobraram.length > 0 && (
                  <details className="mt-2" open>
                    <summary className="cursor-pointer font-medium">
                      {d.sobraram.length} campos do cadastro que nenhuma coluna reivindicou
                    </summary>
                    {d.sobraram.map((c) => (
                      <div key={c.nome} className="flex flex-wrap gap-x-2 py-0.5">
                        <code className="font-mono">{c.nome}</code>
                        <span className="text-muted-foreground">
                          {c.origem} · {c.preenchidos}/{d.amostra}
                        </span>
                        <span>{c.valores.join(' | ') || '—'}</span>
                      </div>
                    ))}
                  </details>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default TalentMobilityCard;
