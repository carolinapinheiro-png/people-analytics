import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Search, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { COLORS } from '@/lib/colors';
import { sondarCamposDaPessoa, type SondaCampos } from '@/lib/convenia.functions';

/**
 * ==========================================================================
 * DE QUE CAMPO SAI A MARCA, DEPOIS DA UNIFICAÇÃO
 * ==========================================================================
 * A marca hoje vem do TOKEN. Com a base unificada, um token só devolve todo
 * mundo e a marca tem que sair do cadastro da pessoa. Esta sonda não decide
 * qual campo é: ela mostra os candidatos e deixa a escolha ser feita olhando.
 *
 * O motivo de não chutar está fresco: `cargoDe` tentou sete nomes de campo,
 * acertou zero em 638, e a tela passou a afirmar que o Convenia não tinha
 * cargo. Cargo errado deixa um campo em branco; marca errada reescreve a série
 * inteira.
 */
export function ConveniaSondaCard() {
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

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <Search className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="flex-1">
          <h3 className="text-base font-semibold">Unificação: de onde vem a marca?</h3>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Lê o cadastro de 8 pessoas por empresa e lista só os campos cujo <em>nome</em> fala
            de empresa, marca, centro de custo, escritório, unidade ou local — com quantos
            vieram preenchidos e que valores aparecem. CPF, endereço e conta bancária não
            atravessam o filtro. Um campo preenchido em 100% com um valor único (o
            &quot;GERALL&quot;) não serve: ele existe, mas não distingue.
          </p>
          <Button onClick={rodarSonda} disabled={sondando} className="mt-3" variant="outline" size="sm">
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
              {/* ------------------------------------------------------------
                  AMOSTRA DE TAMANHO ZERO NÃO AUTORIZA CONCLUSÃO NENHUMA
                  ------------------------------------------------------------
                  Depois da unificação, as bases de Marechal, São Paulo, Betfair
                  e Flutter ficaram sem ninguém -- todo mundo passou para NSX
                  Brasil Recife.

                  A tela então pedia oito pessoas de uma base vazia, não achava
                  campo nenhum (porque não havia a quem perguntar) e concluía:
                  "nenhum campo personalizado preenchido... a marca continua
                  saindo do token e a série mensal fica travada".

                  Nenhuma das duas metades era verdade. Os campos não estavam
                  vazios -- em Recife, `Empresa` vem preenchido e traz a entidade
                  de origem. E a série não estava travada por causa deles. A
                  amostra é que tinha tamanho zero.

                  É a diferença entre "não perguntei a ninguém" e "ninguém
                  respondeu". A segunda é a que vira decisão. */}
              {!e.erro && e.amostra === 0 ? (
                <p className="text-muted-foreground">
                  Zero pessoas nesta base — a unificação moveu todos para NSX Brasil Recife.
                  Isto não é resposta sobre campo nenhum: é a ausência de quem perguntar. A
                  marca de origem de cada pessoa passou a viver no campo <code>Empresa</code>,
                  dentro de Recife.
                </p>
              ) : (
                <>

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
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ConveniaSondaCard;
