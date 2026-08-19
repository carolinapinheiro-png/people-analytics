import { useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { AlertTriangle, CheckCircle2, Database, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getMigracoesPendentes, type EstadoMigracoes } from '@/lib/migracoes.functions';

/**
 * O banco tem o que as migrations prometeram?
 *
 * ------------------------------------------------------------------
 * O INCIDENTE QUE PEDIU ESTE CARTÃO
 * ------------------------------------------------------------------
 * A aba de Salários passou dias quebrada para TODO MUNDO -- inclusive para a
 * admin -- porque `comp_ratio.n_layer` não existia. O arquivo da migration
 * estava no repositório havia cinco dias. Duas funções pediam a coluna no
 * `select`, o Postgres recusava a consulta inteira, e os pontos de chamada
 * engoliam o erro: a tela mostrava "…" para sempre.
 *
 * O sintoma que chegou não parecia schema. Foi "por que o mês em cima ainda
 * mostra junho?" -- outra coisa, em outra aba. Daí até a causa foram quatro
 * consultas.
 *
 * ------------------------------------------------------------------
 * O QUE ELE NÃO PROMETE
 * ------------------------------------------------------------------
 * Não é um verificador de SQL. Reconhece cinco tipos de declaração -- tabela,
 * coluna, índice, valor de enum e função -- e ignora policy, trigger e view de
 * propósito. O modo de falha é assimétrico e escolhido: o que ele não
 * reconhece não vira promessa, então ele pode DEIXAR DE AVISAR, mas não avisa
 * errado. Verificador que acusa o que está certo é desligado na primeira
 * semana, e leva junto os avisos verdadeiros.
 */
export function MigracoesCard() {
  const consultar = useServerFn(getMigracoesPendentes);
  const [e, setE] = useState<EstadoMigracoes | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  const rodar = async () => {
    setCarregando(true);
    setErro(null);
    try {
      setE(await consultar({}) as EstadoMigracoes);
    } catch (x) {
      setErro(x instanceof Error ? x.message : String(x));
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { void rodar(); }, []);

  // Zero arquivos lidos NÃO é banco saudável: é a verificação não tendo
  // rodado. Sem esta distinção o cartão diria "tudo certo" justamente quando
  // não sabe de nada -- o defeito que ele existe para combater.
  const naoRodou = e != null && e.arquivosLidos === 0;
  const emDia = e != null && !naoRodou && e.faltando.length === 0;

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <Database className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold">Estrutura do banco</h3>
            <Button onClick={rodar} disabled={carregando} variant="outline" size="sm">
              <RefreshCw className={carregando ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
              <span className="ml-1.5">Conferir</span>
            </Button>
          </div>

          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
            Lê o que cada migration promete criar e confere se existe. Não olha a
            tabela de controle do Supabase de propósito: ela conhece 5 dos 46
            arquivos, e as outras 41 foram aplicadas por outros caminhos — um
            alerta com 41 falsos positivos seria desligado na primeira semana.
          </p>

          {erro && (
            <p className="mt-3 text-sm text-red-600 dark:text-red-500">{erro}</p>
          )}

          {naoRodou && (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" />
              <p className="text-[13px] leading-relaxed text-amber-700 dark:text-amber-400">
                Nenhum arquivo de migration foi lido. Isto não quer dizer que o
                banco está em dia — quer dizer que a conferência não aconteceu.
              </p>
            </div>
          )}

          {emDia && (
            <div className="mt-3 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-500" />
              <p className="text-sm">
                Tudo o que as {e.arquivosLidos} migrations prometem existe no banco.
                <span className="text-muted-foreground"> {e.promessas} objetos conferidos.</span>
              </p>
            </div>
          )}

          {e && !naoRodou && e.faltando.length > 0 && (
            <div className="mt-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-500" />
                <p className="text-sm font-medium">
                  {e.faltando.length} {e.faltando.length === 1 ? 'objeto prometido não existe' : 'objetos prometidos não existem'}
                </p>
              </div>
              <ul className="mt-2 space-y-1">
                {e.faltando.map((f) => (
                  <li key={`${f.tipo}|${f.nome}`} className="text-[13px] leading-relaxed">
                    <code className="text-foreground">{f.nome}</code>
                    <span className="text-muted-foreground"> — {f.tipo}, declarada em {f.arquivo}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                Rode o arquivo indicado. Enquanto o objeto não existir, qualquer
                consulta que o mencione falha inteira — e o erro costuma aparecer
                como uma tela vazia, não como uma mensagem.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default MigracoesCard;
