import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { AlertTriangle, CheckCircle2, DownloadCloud, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { COLORS } from '@/lib/colors';
import { syncConvenia, type ResumoSyncConvenia } from '@/lib/convenia.functions';
import { agruparAvisos } from '@/lib/convenia/avisos';

/**
 * A carga do Convenia.
 *
 * Saiu de dentro do card único que tinha cinco assuntos -- diagnóstico de
 * token, sonda de campos, cruzamento de listagens, veredito da série e esta
 * carga -- empilhados em 516 linhas. Quem vinha rodar a carga do mês
 * atravessava os outros quatro para chegar aqui, e mais de uma vez clicou no
 * botão errado.
 *
 * É o primeiro card da aba porque é o único que se usa por rotina. Os outros
 * três são para quando algo parece errado.
 */
export function ConveniaSyncCard() {
  const sincronizar = useServerFn(syncConvenia);
  const [r, setR] = useState<ResumoSyncConvenia | null>(null);
  const [erroSync, setErroSync] = useState<string | null>(null);
  const [sincronizando, setSincronizando] = useState(false);

  const rodarSync = async (confirm: boolean) => {
    setSincronizando(true);
    setErroSync(null);
    try {
      setR(await sincronizar({ data: { confirm } }));
    } catch (e) {
      setErroSync(e instanceof Error ? e.message : String(e));
      setR(null);
    } finally {
      setSincronizando(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <DownloadCloud className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="flex-1">
          <h3 className="text-base font-semibold">Rodar a carga</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Lê o cadastro do Convenia e grava: organograma, cargo, empresa, escritório e os
            campos que os reports usam. Calcula também headcount, entradas, saídas e atrição
            de cada mês, e grava como uma <strong>terceira série</strong> (<code>convenia</code>),
            ao lado da congelada e da reconstruída — nada é sobrescrito.
          </p>
          {/* O cadastro grava na simulação também, e isso não é óbvio pelo nome
              do botão. Quem lê "simular" espera que nada aconteça, e depois não
              entende por que as colunas encheram. Só a SÉRIE MENSAL espera
              confirmação -- ela é a que reescreve histórico. */}
          <p className="mt-2 text-xs text-muted-foreground">
            "Simular" já grava o cadastro das pessoas — é leitura barata e reversível. O que
            espera confirmação é a <strong>série mensal</strong>, que reescreve histórico.
          </p>

          <div className="mt-4 flex gap-2">
            <Button onClick={() => rodarSync(false)} disabled={sincronizando} variant="outline" size="sm">
              <RefreshCw className={`mr-2 h-4 w-4 ${sincronizando ? 'animate-spin' : ''}`} />
              {sincronizando ? 'Calculando…' : 'Simular sem gravar a série'}
            </Button>
            {/* ------------------------------------------------------------
                O BOTÃO NÃO PODE SUMIR SÓ PORQUE A SÉRIE FOI RECUSADA
                ------------------------------------------------------------
                A condição era `totalLinhas > 0`. Com a trava da unificação
                zerando a série, o botão sumia -- e junto com ele o organograma,
                o cargo, a empresa e o escritório, que gravam normalmente e são
                justamente o que precisa avançar agora.

                Ficaria assim: a prévia mostra o problema, e não há como
                confirmar nada. Uma trava que impede o que ela não queria
                impedir. */}
            {r && !r.gravado && (r.totalLinhas > 0 || r.totalOrg > 0) && (
              <Button onClick={() => rodarSync(true)} disabled={sincronizando} size="sm">
                {r.totalLinhas > 0
                  ? `Gravar ${r.totalLinhas} linhas`
                  : `Gravar só o organograma (${r.totalOrg} pessoas)`}
              </Button>
            )}
          </div>

          {erroSync && <p className="mt-2 text-sm" style={{ color: COLORS.danger }}>{erroSync}</p>}

          {/* A recusa da série é a informação mais importante da tela quando
              acontece. Enterrada no meio da lista de avisos, ela se perde. */}
          {r?.serieTravada && (
            <div className="mt-3 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3">
              <p className="text-sm font-medium flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                A série mensal não foi gravada
              </p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{r.serieTravada}</p>
            </div>
          )}

          {r && (
            <div className="mt-3 text-sm">
              {/* ------------------------------------------------------------
                  A FRASE DE RESULTADO, ANTES DOS NÚMEROS
                  ------------------------------------------------------------
                  "Gravado" sozinho não diz o que entrou. E os cinco cartões
                  abaixo não respondem em dois segundos: "Linhas 275" chega a
                  enganar, porque 193 dessas linhas nascem invisíveis. */}
              {/* ------------------------------------------------------------
                  O VEREDITO, ANTES DE TUDO
                  ------------------------------------------------------------
                  "Eu nunca sei quando tá pronto ou não." A tela terminava com
                  oito avisos e nenhuma resposta -- descobrir se dava para
                  gravar exigia ler todos, entender cada fila e fazer a conta.

                  Uma tela que exige interpretação para responder sim ou não
                  está empurrando o próprio trabalho para quem a usa. */}
              {r.gravado ? (
                <div className="flex items-center gap-2 font-medium">
                  <CheckCircle2 className="h-4 w-4" style={{ color: COLORS.success }} /> Gravado
                </div>
              ) : r.pronto ? (
                <div
                  className="rounded-lg border p-3"
                  style={{ borderColor: COLORS.success, background: `${COLORS.success}14` }}
                >
                  <p className="font-medium flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" style={{ color: COLORS.success }} />
                    Pronto para gravar
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Nenhuma fila em aberto. O que a carga vai gravar já está completo.
                  </p>
                </div>
              ) : (
                <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3">
                  <p className="font-medium flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 shrink-0" />
                    Ainda não — rode "Simular" de novo
                  </p>
                  <ul className="text-xs text-muted-foreground mt-1 space-y-0.5">
                    {r.oQueFalta.map((f) => <li key={f}>falta {f}</li>)}
                  </ul>
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Gravar agora funciona, mas grava incompleto — e a tela não teria como
                    dizer isso depois.
                  </p>
                </div>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                {r.pessoasUnicas} pessoas · {r.linhasVisiveis} meses que o painel mostra
                {r.totalLinhas > r.linhasVisiveis && ` (de ${r.totalLinhas} calculados)`}
                {' · '}{r.requisicoes} requisições ao Convenia
              </p>

              <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
                <div><div className="text-muted-foreground">Pessoas</div><div className="font-medium">{r.pessoasUnicas}</div></div>
                {/* "Linhas" era ambíguo entre calculado e visível. */}
                <div><div className="text-muted-foreground">Meses visíveis</div><div className="font-medium">{r.linhasVisiveis}</div></div>
                <div><div className="text-muted-foreground">Buscados 1 a 1</div><div className="font-medium">{r.detalhesBuscados}</div></div>
                <div><div className="text-muted-foreground">Não resolvidos</div><div className="font-medium">{r.naoResolvidos}</div></div>
                <div><div className="text-muted-foreground">Requisições</div><div className="font-medium">{r.requisicoes}</div></div>
              </div>

              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                {r.empresas.map((e) => (
                  <div key={e.empresa}>
                    <span className="font-medium">{e.empresa}</span>:{' '}
                    {e.erro ? e.erro : `${e.ativos} no cadastro · ${e.desligados} saídas · ${e.cruzaram} cruzaram`}
                  </div>
                ))}
              </div>

              {r.genero.total > 0 && (
                <div className="mt-3 rounded border border-border/60 p-2 text-xs">
                  <div className="font-medium">
                    Gênero: {r.genero.conhecidos} de {r.genero.total} resolvidos
                    {r.genero.pendentes > 0 && ` · ${r.genero.pendentes} pendentes`}
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded bg-muted">
                    <div
                      className="h-full"
                      style={{
                        width: `${Math.min(100, (r.genero.conhecidos / r.genero.total) * 100)}%`,
                        backgroundColor: r.genero.pendentes === 0 ? COLORS.success : COLORS.warning,
                      }}
                    />
                  </div>
                  {r.genero.buscadosAgora > 0 && (
                    <div className="mt-1 text-muted-foreground">
                      {r.genero.buscadosAgora} buscados nesta execução.
                      {r.genero.pendentes > 0 && ' Rode de novo para avançar.'}
                    </div>
                  )}
                </div>
              )}

              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                {r.linhasPorMarca.map((m) => (
                  <div key={m.marca}>
                    {/* CALCULADOS, e não visíveis: parte destes meses nasce
                        marcada. Dizer só "163 meses" ao lado de um aviso que
                        diz "82 aparecem" são duas frases discordando sobre o
                        mesmo resultado. */}
                    <span className="font-medium">{m.marca}</span>: {m.linhas} meses calculados
                    {m.de && ` (${m.de.slice(0, 7)} a ${m.ate?.slice(0, 7)})`}
                  </div>
                ))}
              </div>

              {/* ------------------------------------------------------------
                  TRÊS PESOS, PORQUE SÃO TRÊS COISAS
                  ------------------------------------------------------------
                  Antes eram oito linhas idênticas, todas com ⚠ amarelo. No
                  meio delas conviviam "gravei a foto" (recibo), "162 sem
                  Level" (alguém precisa preencher) e "193 linhas nascem
                  marcadas" (é assim e vai continuar sendo).

                  Quando tudo é alerta, nada é -- e quem lê aprende, em duas
                  execuções, a passar o olho por cima de todas. O que pede
                  ação fica em cima e sozinho; o resto desce de peso. */}
              {(() => {
                const g = agruparAvisos(r.avisos);
                return (
                  <>
                    {g.pendencia.length > 0 && (
                      <div className="mt-3 rounded-lg border border-amber-500/40 p-3">
                        <p className="text-xs font-medium flex items-center gap-1.5 text-amber-600 dark:text-amber-500">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                          Precisa de alguém
                        </p>
                        <ul className="mt-1.5 space-y-1.5">
                          {g.pendencia.map((a) => (
                            <li key={a} className="text-xs leading-relaxed">{a}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {g.feito.length > 0 && (
                      <ul className="mt-3 space-y-1">
                        {g.feito.map((a) => (
                          <li key={a} className="text-xs text-muted-foreground flex gap-1.5">
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" style={{ color: COLORS.success }} />
                            <span>{a}</span>
                          </li>
                        ))}
                      </ul>
                    )}

                    {/* Recolhido: verdadeiro hoje, amanhã e no mês que vem.
                        Não é notícia depois da primeira leitura -- e sumir
                        seria pior, porque alguém reencontraria o fato como se
                        fosse novidade. */}
                    {g.limite.length > 0 && (
                      <details className="mt-3">
                        <summary className="cursor-pointer text-xs text-muted-foreground">
                          Limites conhecidos ({g.limite.length}) — o que esta carga não tem como saber
                        </summary>
                        <ul className="mt-1.5 space-y-1.5 pl-1">
                          {g.limite.map((a) => (
                            <li key={a} className="text-xs text-muted-foreground leading-relaxed">{a}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ConveniaSyncCard;
