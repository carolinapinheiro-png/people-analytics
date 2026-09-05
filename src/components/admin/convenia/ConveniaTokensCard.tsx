import { useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { AlertTriangle, CheckCircle2, KeyRound, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { COLORS } from '@/lib/colors';
import { getConveniaDiagnostico, type ConveniaDiagnostico } from '@/lib/convenia.functions';

/**
 * O que cada token enxerga, antes de qualquer carga.
 *
 * Não sincroniza nada. Pergunta a cada token o que ele devolve e mostra a
 * resposta real -- porque a falha que isso previne é invisível: um token sem
 * data de admissão produz uma série de headcount plausível e errada.
 */
export function ConveniaTokensCard() {
  const carregar = useServerFn(getConveniaDiagnostico);
  const [d, setD] = useState<ConveniaDiagnostico | null>(null);
  const [carregando, setCarregando] = useState(false);

  const rodar = async () => {
    setCarregando(true);
    try {
      setD(await carregar({}));
    } catch (e) {
      setD({
        empresas: [], faltamSecrets: [], aposentadas: [], totalGeral: null, veredito: null, avisos: [],
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
          <h3 className="text-base font-semibold">Tokens — uma empresa por CNPJ</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            O Convenia é por CNPJ: cada empresa tem seu token e só enxerga a si mesma.
            Aqui dá para ver o que cada uma entrega antes de qualquer carga.
          </p>

          <Button onClick={rodar} disabled={carregando} className="mt-4" variant="outline" size="sm">
            <RefreshCw className={`mr-2 h-4 w-4 ${carregando ? 'animate-spin' : ''}`} />
            {carregando ? 'Consultando…' : 'Conferir tokens'}
          </Button>

          {d?.erro && <p className="mt-4 text-sm" style={{ color: COLORS.danger }}>{d.erro}</p>}

          {d && d.totalGeral != null && (
            <div className="mt-4 rounded-lg border border-border/60 p-3">
              <div className="text-2xl font-semibold">{d.totalGeral.toLocaleString('pt-BR')}</div>
              <div className="text-sm text-muted-foreground">
                pessoas somando as {d.empresas.length} empresas já configuradas
                {d.faltamSecrets.length > 0 && ` — faltam ${d.faltamSecrets.length}`}
              </div>
            </div>
          )}

          {d?.empresas.map((e) => (
            <div key={e.env} className="mt-3 rounded-lg border border-border/60 p-3 text-sm">
              <div className="flex items-center gap-2">
                {e.erro || e.faltando.length ? (
                  <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: COLORS.warning }} />
                ) : (
                  <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: COLORS.success }} />
                )}
                <span className="font-medium">{e.empresa}</span>
                <span className="text-xs text-muted-foreground">
                  {e.marca}{e.local ? ` · ${e.local}` : ''}
                </span>
              </div>

              {e.erro ? (
                <p className="mt-1 text-muted-foreground">{e.erro}</p>
              ) : (
                <>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Token "{e.nomeDoToken ?? '—'}" · {e.qtdPermissoes} permissões
                    {e.permissoesEscrita > 0 && ` (${e.permissoesEscrita} de escrita)`}
                  </div>

                  {e.sondas.map((s) => (
                    <div key={s.recurso} className="mt-2">
                      <div className="text-xs">
                        <span className="font-medium">{s.recurso}</span>
                        {s.total != null && <span className="text-muted-foreground"> — {s.total} registros</span>}
                      </div>
                      {s.erro ? (
                        <p className="text-xs" style={{ color: COLORS.warning }}>{s.erro}</p>
                      ) : (
                        <details>
                          <summary className="cursor-pointer text-xs text-muted-foreground">
                            {s.camposVistos.length} campos na resposta
                          </summary>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {s.camposVistos.join(', ') || '(nenhum)'}
                          </p>
                        </details>
                      )}
                    </div>
                  ))}

                  {e.statusDosAtivos.length > 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Status na 1ª página:{' '}
                      {e.statusDosAtivos.map((s) => `${s.valor} (${s.quantidade})`).join(' · ')}
                    </p>
                  )}

                  {e.faltando.length > 0 && (
                    <p className="mt-2 text-xs" style={{ color: COLORS.warning }}>
                      Falta: {e.faltando.join(' · ')}
                    </p>
                  )}
                </>
              )}
            </div>
          ))}

          {d && d.aposentadas.length > 0 && (
            <div className="mt-3 rounded-lg border border-border/60 p-3 text-sm">
              <div className="font-medium">Bases desligadas de propósito</div>
              {/* Ausência decidida não é pendência. A tela pedia que alguém
                  recriasse os secrets removidos e avisava que o headcount
                  estava incompleto -- as duas coisas falsas. Alerta que pede
                  para desfazer o que acabou de ser feito ensina a ignorar
                  alerta, e o dia em que faltar um token de verdade é esse
                  alerta que ninguém vai ler. */}
              <ul className="mt-2 space-y-1">
                {d.aposentadas.map((a) => (
                  <li key={a.empresa} className="text-xs">
                    <span className="font-medium">{a.empresa}</span>
                    <span className="text-muted-foreground"> — {a.motivo}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {d && d.faltamSecrets.length > 0 && (
            <div className="mt-3 rounded-lg border border-border/60 p-3 text-sm">
              <div className="font-medium">Empresas sem token cadastrado</div>
              <p className="mt-1 text-xs text-muted-foreground">
                Crie um secret no Lovable com exatamente este nome para cada uma:
              </p>
              <ul className="mt-2 space-y-1">
                {d.faltamSecrets.map((f) => (
                  <li key={f.env} className="text-xs">
                    <code className="rounded bg-muted px-1 py-0.5">{f.env}</code>
                    <span className="text-muted-foreground"> — {f.empresa}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {d?.veredito && (
            <div className="mt-3 rounded-lg border border-border/60 p-3 text-sm">
              <div className="font-medium">Dá para reconstruir a série mensal?</div>
              <p className="mt-1 text-muted-foreground">{d.veredito}</p>
            </div>
          )}

          {d?.avisos.map((a) => (
            <p key={a} className="mt-3 text-sm text-muted-foreground">⚠ {a}</p>
          ))}

          <p className="mt-3 text-xs text-muted-foreground">
            O diagnóstico devolve só nomes de campo — nenhum valor de cadastro sai daqui.
          </p>
        </div>
      </div>
    </div>
  );
}

export default ConveniaTokensCard;
