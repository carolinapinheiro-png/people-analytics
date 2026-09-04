import { useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { AlertTriangle, CheckCircle2, KeyRound, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { COLORS } from '@/lib/colors';
import {
  getConveniaDiagnostico, testarCruzamento, syncConvenia, sondarCamposDaPessoa,
  type ConveniaDiagnostico, type Cruzamento, type ResumoSyncConvenia, type SondaCampos,
} from '@/lib/convenia.functions';

/**
 * Estado da integração com o Convenia, empresa por empresa.
 *
 * Não sincroniza nada. Pergunta a cada token o que ele enxerga e mostra a
 * resposta real -- porque a falha que isso previne é invisível: um token sem
 * data de admissão produz uma série de headcount plausível e errada.
 */
export function ConveniaCard() {
  const carregar = useServerFn(getConveniaDiagnostico);
  const [d, setD] = useState<ConveniaDiagnostico | null>(null);
  const [carregando, setCarregando] = useState(false);
  const cruzar = useServerFn(testarCruzamento);
  const [c, setC] = useState<Cruzamento | null>(null);
  const [cruzando, setCruzando] = useState(false);

  const rodarCruzamento = async () => {
    setCruzando(true);
    try {
      setC(await cruzar({}));
    } catch (e) {
      setC({ empresas: [], veredito: '', headcountReal: null, erro: e instanceof Error ? e.message : String(e) });
    } finally {
      setCruzando(false);
    }
  };

  const sondar = useServerFn(sondarCamposDaPessoa);
  const [sonda, setSonda] = useState<SondaCampos[] | null>(null);
  const [sondando, setSondando] = useState(false);
  const [erroSonda, setErroSonda] = useState<string | null>(null);

  const rodarSonda = async () => {
    setSondando(true); setErroSonda(null);
    try {
      setSonda(await sondar({}));
    } catch (e) {
      setErroSonda(e instanceof Error ? e.message : String(e));
    } finally {
      setSondando(false);
    }
  };

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

  const rodar = async () => {
    setCarregando(true);
    try {
      setD(await carregar({}));
    } catch (e) {
      setD({
        empresas: [], faltamSecrets: [], totalGeral: null, veredito: null, avisos: [],
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
          <h3 className="text-base font-semibold">Convenia — uma empresa por token</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            O Convenia é por CNPJ: cada empresa tem seu token e só enxerga a si mesma.
            Aqui dá para ver o que cada uma entrega antes de qualquer carga.
          </p>

          <Button onClick={rodar} disabled={carregando} className="mt-4" variant="outline">
            <RefreshCw className={`mr-2 h-4 w-4 ${carregando ? 'animate-spin' : ''}`} />
            {carregando ? 'Consultando…' : 'Conferir tokens'}
          </Button>

          {d?.erro && (
            <p className="mt-4 text-sm" style={{ color: COLORS.danger }}>{d.erro}</p>
          )}

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

          {d && d.empresas.length > 0 && (
            <div className="mt-4 rounded-lg border border-border/60 p-3">
              <div className="text-sm font-medium">Ativos e desligados são a mesma base?</div>
              <p className="mt-1 text-xs text-muted-foreground">
                Cruza as duas listagens pelo <code>id</code>. Se os desligados estiverem
                também na de colaboradores, a admissão e a área de quem saiu vêm de lá —
                e não é preciso buscar pessoa por pessoa. Baixa as listas inteiras, então
                demora ~1 minuto.
              </p>
              {/* ==================================================================
                  DE QUE CAMPO SAI A MARCA, DEPOIS DA UNIFICAÇÃO
                  ==================================================================
                  A marca hoje vem do TOKEN. Com a base unificada, um token só
                  devolve todo mundo e a marca tem que sair do cadastro da
                  pessoa. Esta sonda não decide qual campo é: ela mostra os
                  candidatos e deixa a escolha ser feita olhando.

                  O motivo de não chutar está fresco: `cargoDe` tentou sete
                  nomes de campo, acertou zero em 638, e a tela passou a afirmar
                  que o Convenia não tinha cargo. Cargo errado deixa um campo em
                  branco; marca errada reescreve a série inteira.
              ================================================================== */}
              <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
                <p className="text-sm font-medium">Unificação de bases: de onde vem a marca?</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Lê o cadastro de 8 pessoas por empresa e lista só os campos cujo <em>nome</em> fala
                  de empresa, marca, centro de custo, escritório, unidade ou local — com quantos
                  vieram preenchidos e que valores aparecem. CPF, endereço e conta bancária não
                  atravessam o filtro. Um campo preenchido em 100% com um valor único (o
                  &quot;GERALL&quot;) não serve: ele existe, mas não distingue.
                </p>
                <Button onClick={rodarSonda} disabled={sondando} className="mt-2" variant="outline" size="sm">
                  <RefreshCw className={`mr-2 h-4 w-4 ${sondando ? 'animate-spin' : ''}`} />
                  {sondando ? 'Sondando…' : 'Sondar campos do cadastro'}
                </Button>
                {erroSonda && <p className="mt-2 text-sm" style={{ color: COLORS.danger }}>{erroSonda}</p>}
                {sonda?.map((e) => (
                  <div key={e.empresa} className="mt-3 text-xs">
                    <p className="font-medium">
                      {e.empresa}
                      <span className="text-muted-foreground font-normal">
                        {' '}· {e.amostra} pessoas, {e.chavesNoDetalhe} campos no cadastro
                      </span>
                    </p>
                    {e.erro && <p style={{ color: COLORS.danger }}>{e.erro}</p>}
                    {!e.erro && e.candidatos.length === 0 && (
                      <p className="text-muted-foreground">
                        Nenhum campo com nome de empresa/local. Isso não quer dizer que não exista —
                        quer dizer que não está entre as chaves que este filtro deixa passar.
                      </p>
                    )}
                    {/* ------------------------------------------------------------
                        O CAMPO CONFIRMADO PELO RH, E SE ELE JÁ TEM CONTEÚDO
                        ------------------------------------------------------------
                        Isto é o painel de instrumentos da migração. Enquanto
                        estiver vazio, `fontes.ts` continua mandando e a série
                        continua travada -- porque ler é reversível e gravar
                        não. */}
                    {!e.erro && (
                      <div className="mt-1 rounded border border-border/60 p-1.5">
                        <p className="font-medium">
                          custom_fields
                          <span className="text-muted-foreground font-normal">
                            {' '}· escritório resolvido em {e.escritorioResolvido}/{e.amostra}
                          </span>
                        </p>
                        {e.personalizados.length === 0 ? (
                          <p className="text-muted-foreground">
                            Nenhum campo personalizado preenchido nesta amostra. O RH confirmou que
                            é aqui que o escritório vai ficar — enquanto não vier, a marca continua
                            saindo do token e a série mensal fica travada.
                          </p>
                        ) : (
                          e.personalizados.map((c3) => (
                            <div key={c3.nome} className="flex flex-wrap gap-x-2">
                              <code className="font-mono">{c3.nome}</code>
                              <span className="text-muted-foreground">{c3.preenchidos}/{e.amostra}</span>
                              <span>{c3.valores.join(' | ')}</span>
                            </div>
                          ))
                        )}
                        {e.personalizados.length > 0 && e.escritorioResolvido === 0 && (
                          <p className="mt-1 text-amber-600 dark:text-amber-500">
                            Há campos personalizados, mas nenhum com nome de escritório. Me diga qual
                            desses é — acrescento o nome em <code>NOMES_DE_ESCRITORIO</code> e a
                            marca passa a sair daqui.
                          </p>
                        )}
                      </div>
                    )}

                    {/* Os nomes de todos os campos, sem valor nenhum. O filtro por
                        nome me protege de vazar CPF, mas ele também esconde a
                        resposta quando o campo certo se chama outra coisa. Nome de
                        campo não é dado pessoal. */}
                    {e.chaves.length > 0 && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-muted-foreground">
                          ver os {e.chaves.length} nomes de campo (sem valores)
                        </summary>
                        <p className="font-mono text-[10px] leading-relaxed mt-1 text-muted-foreground">
                          {e.chaves.join(', ')}
                        </p>
                      </details>
                    )}
                    {e.candidatos.map((c2) => (
                      <div key={c2.campo} className="flex flex-wrap gap-x-2 py-0.5 border-b border-border/40">
                        <code className="font-mono">{c2.campo}</code>
                        <span className="text-muted-foreground">
                          {c2.origem} · {c2.preenchidos}/{e.amostra}
                        </span>
                        <span className={c2.valores.length === 1 ? 'text-amber-600 dark:text-amber-500' : ''}>
                          {c2.valores.join(' | ') || '—'}
                          {c2.valores.length === 1 && ' (valor único: não distingue)'}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              <Button onClick={rodarCruzamento} disabled={cruzando} className="mt-3" variant="outline" size="sm">
                <RefreshCw className={`mr-2 h-4 w-4 ${cruzando ? 'animate-spin' : ''}`} />
                {cruzando ? 'Cruzando…' : 'Testar cruzamento'}
              </Button>

              {c?.erro && <p className="mt-2 text-sm" style={{ color: COLORS.danger }}>{c.erro}</p>}

              {c && !c.erro && c.empresas.length > 0 && (
                <div className="mt-3 text-sm">
                  <p className="text-muted-foreground">{c.veredito}</p>
                  {c.headcountReal != null && (
                    <p className="mt-2">
                      Headcount de hoje: <strong>{c.headcountReal.toLocaleString('pt-BR')}</strong> pessoas
                    </p>
                  )}
                  <div className="mt-2 space-y-1">
                    {c.empresas.map((e) => (
                      <div key={e.empresa} className="text-xs text-muted-foreground">
                        <span className="font-medium">{e.empresa}</span>:{' '}
                        {e.erro ? e.erro : (
                          <>
                            {e.ativos} na listagem · {e.desligados} desligados ·{' '}
                            {e.encontradosNosAtivos} cruzaram · {e.resolvidos} com admissão e área
                            {e.status.length > 0 && ` · status: ${e.status.map((s) => `${s.valor} (${s.quantidade})`).join(', ')}`}
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
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

          <div className="mt-4 rounded-lg border border-border/60 p-3">
            <div className="text-sm font-medium">Reconstruir a série mensal</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Calcula headcount, entradas, saídas e atrição de cada mês a partir das datas
              de admissão e desligamento. Grava como uma <strong>terceira série</strong>
              {' '}(<code>convenia</code>), ao lado da congelada e da reconstruída — nada é
              sobrescrito. A comparação entre elas fica no card abaixo.
            </p>

            <div className="mt-3 flex gap-2">
              <Button onClick={() => rodarSync(false)} disabled={sincronizando} variant="outline" size="sm">
                <RefreshCw className={`mr-2 h-4 w-4 ${sincronizando ? 'animate-spin' : ''}`} />
                {sincronizando ? 'Calculando…' : 'Simular sem gravar'}
              </Button>
              {/* ------------------------------------------------------------
                  O BOTÃO NÃO PODE SUMIR SÓ PORQUE A SÉRIE FOI RECUSADA
                  ------------------------------------------------------------
                  A condição era `totalLinhas > 0`. Com a trava da unificação
                  zerando a série, o botão sumia -- e junto com ele o
                  organograma, o cargo, a empresa e o escritório, que gravam
                  normalmente e são justamente o que precisa avançar agora.

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
                    <>Prévia — nada foi gravado</>
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

          <p className="mt-3 text-xs text-muted-foreground">
            O diagnóstico devolve só nomes de campo. A carga lê o cadastro, reduz a
            quatro campos na chegada e grava apenas contagens por área e mês.
          </p>
        </div>
      </div>
    </div>
  );
}

export default ConveniaCard;
