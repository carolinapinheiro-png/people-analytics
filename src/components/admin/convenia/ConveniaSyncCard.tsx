import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { AlertTriangle, CheckCircle2, DownloadCloud, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { COLORS } from '@/lib/colors';
import { syncConvenia, type ResumoSyncConvenia } from '@/lib/convenia.functions';

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
              <div className="flex items-center gap-2 font-medium">
                {r.gravado ? (
                  <><CheckCircle2 className="h-4 w-4" style={{ color: COLORS.success }} /> Gravado</>
                ) : (
                  <>Prévia — a série não foi gravada</>
                )}
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
                <div><div className="text-muted-foreground">Pessoas</div><div className="font-medium">{r.pessoasUnicas}</div></div>
                <div><div className="text-muted-foreground">Linhas</div><div className="font-medium">{r.totalLinhas}</div></div>
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
                    <span className="font-medium">{m.marca}</span>: {m.linhas} meses
                    {m.de && ` (${m.de.slice(0, 7)} a ${m.ate?.slice(0, 7)})`}
                  </div>
                ))}
              </div>

              {r.avisos.map((a) => (
                <p key={a} className="mt-2 text-xs" style={{ color: COLORS.warning }}>⚠ {a}</p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ConveniaSyncCard;
