import { useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { AlertTriangle, CheckCircle2, KeyRound, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { COLORS } from '@/lib/colors';
import { getConveniaDiagnostico, type ConveniaDiagnostico } from '@/lib/convenia.functions';

/**
 * O que o token do Convenia enxerga.
 *
 * Esta tela não sincroniza nada -- ela só pergunta à API quais permissões e
 * campos o token carrega. É o passo zero, e existe porque a falha que ela
 * previne é invisível: um token sem "data de admissão" não dá erro nenhum,
 * apenas produz uma série de headcount plausível e errada.
 */
export function ConveniaCard() {
  const carregar = useServerFn(getConveniaDiagnostico);
  const [d, setD] = useState<ConveniaDiagnostico | null>(null);
  const [carregando, setCarregando] = useState(false);

  const rodar = async () => {
    setCarregando(true);
    try {
      setD(await carregar({}));
    } catch (e) {
      setD({
        configurado: false, nomeDoToken: null, permissoes: [], faltando: [],
        excessos: [], amostra: null, sondas: [], veredito: null, avisos: [],
        erro: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { void rodar(); }, []);

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <KeyRound className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="flex-1">
          <h3 className="text-base font-semibold">Convenia — o que o token enxerga</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            O token do Convenia expõe só os campos marcados quando ele foi criado.
            Isto pergunta à API quais são, antes de qualquer carga — um campo que
            falta não dá erro, vira coluna vazia.
          </p>

          <Button onClick={rodar} disabled={carregando} className="mt-4" variant="outline">
            <RefreshCw className={`mr-2 h-4 w-4 ${carregando ? 'animate-spin' : ''}`} />
            {carregando ? 'Consultando…' : 'Conferir token'}
          </Button>

          {d?.erro && (
            <div className="mt-4 rounded-lg border border-border/60 p-3 text-sm">
              <div className="flex items-center gap-2 font-medium" style={{ color: COLORS.danger }}>
                <AlertTriangle className="h-4 w-4" /> Não deu para consultar
              </div>
              <p className="mt-1 text-muted-foreground">{d.erro}</p>
            </div>
          )}

          {d && !d.erro && (
            <div className="mt-4 rounded-lg border border-border/60 p-4">
              <div className="flex items-center gap-2 font-medium">
                {d.faltando.length === 0 ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" style={{ color: COLORS.success }} />
                    Token completo para o que o painel precisa
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-4 w-4" style={{ color: COLORS.warning }} />
                    Faltam campos no token
                  </>
                )}
              </div>

              {d.nomeDoToken && (
                <p className="mt-1 text-sm text-muted-foreground">
                  Token: <strong>{d.nomeDoToken}</strong>
                </p>
              )}

              {d.faltando.length > 0 && (
                <ul className="mt-3 space-y-1 text-sm">
                  {d.faltando.map((f) => (
                    <li key={f} style={{ color: COLORS.warning }}>• {f}</li>
                  ))}
                </ul>
              )}

              {d.permissoes.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm text-muted-foreground">
                    {d.permissoes.length} permissões — ver detalhe
                  </summary>
                  <div className="mt-2 space-y-2">
                    {d.permissoes.map((p) => (
                      <div key={p.recurso} className="text-sm">
                        <div className="font-medium">{p.recurso}</div>
                        {p.campos.length > 0 && (
                          <div className="text-muted-foreground">{p.campos.join(', ')}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {d.amostra && (
                <div className="mt-3 rounded-lg border border-border/60 p-3 text-sm">
                  <div className="font-medium">Resposta real da listagem de desligados</div>
                  {d.amostra.erro ? (
                    <p className="mt-1 text-muted-foreground">Não deu para consultar: {d.amostra.erro}</p>
                  ) : d.amostra.quantidade === 0 ? (
                    <p className="mt-1 text-muted-foreground">
                      A API respondeu, mas sem nenhum desligado nesta página — não dá para
                      inspecionar a forma da resposta com lista vazia.
                    </p>
                  ) : (
                    <>
                      <p className="mt-1" style={{ color: d.amostra.temTipoDesligamento ? COLORS.success : COLORS.warning }}>
                        {d.amostra.temTipoDesligamento
                          ? 'O tipo de desligamento VEM na resposta.'
                          : 'O tipo de desligamento NÃO vem na resposta.'}
                      </p>
                      <details className="mt-2">
                        <summary className="cursor-pointer text-muted-foreground">
                          {d.amostra.camposVistos.length} campos na resposta — ver nomes
                        </summary>
                        <p className="mt-1 text-muted-foreground">{d.amostra.camposVistos.join(', ')}</p>
                      </details>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Só os nomes dos campos saem daqui. Nenhum valor é lido nem guardado.
                      </p>
                    </>
                  )}
                </div>
              )}

              {d.veredito && (
                <div className="mt-3 rounded-lg border border-border/60 p-3 text-sm">
                  <div className="font-medium">Dá para reconstruir a série mensal?</div>
                  <p className="mt-1 text-muted-foreground">{d.veredito}</p>
                  {d.sondas.map((s) => (
                    <div key={s.recurso} className="mt-2">
                      <div className="text-xs font-medium">
                        {s.recurso}
                        {s.total != null && ` — ${s.total} registros no total`}
                      </div>
                      {s.erro ? (
                        <p className="text-xs text-muted-foreground">Erro: {s.erro}</p>
                      ) : (
                        <details>
                          <summary className="cursor-pointer text-xs text-muted-foreground">
                            {s.camposVistos.length} campos na resposta — ver nomes
                          </summary>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {s.camposVistos.join(', ') || '(nenhum)'}
                          </p>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {d.excessos.length > 0 && (
                <div className="mt-3 rounded-lg border border-border/60 p-3 text-sm">
                  <div className="font-medium">O token vai além do necessário</div>
                  <ul className="mt-1 space-y-1 text-muted-foreground">
                    {d.excessos.map((x) => <li key={x}>• {x}</li>)}
                  </ul>
                </div>
              )}

              {d.avisos.map((a) => (
                <p key={a} className="mt-3 text-sm text-muted-foreground">⚠ {a}</p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ConveniaCard;
