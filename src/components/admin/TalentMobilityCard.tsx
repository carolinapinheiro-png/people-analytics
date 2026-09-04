import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Map as MapIcon, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { COLORS } from '@/lib/colors';
import { mapearCamposTalent, type MapaDeCampos } from '@/lib/talent-mobility.functions';

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
  const [dados, setDados] = useState<MapaDeCampos[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

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

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <MapIcon className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="flex-1">
          <h3 className="text-base font-semibold">Reports do Sandeep — de onde sai cada coluna</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            As 51 colunas do Talent Mobility Data Model contra o cadastro do Convenia: o que
            já sai do que temos, que campo preenche o resto e o que ficou órfão. Não gera
            arquivo nenhum — é o mapa que precisa estar conferido antes de existir botão,
            porque 51 colunas plausíveis com o campo trocado é pior do que coluna faltando.
          </p>

          <Button onClick={rodar} disabled={carregando} className="mt-4" variant="outline">
            <RefreshCw className={`mr-2 h-4 w-4 ${carregando ? 'animate-spin' : ''}`} />
            {carregando ? 'Lendo o cadastro…' : 'Mapear os campos'}
          </Button>

          {erro && <p className="mt-3 text-sm" style={{ color: COLORS.danger }}>{erro}</p>}

          {dados?.map((d) => {
            const orfas = d.mapa.filter((m) => !m.jaTemos && !m.campo);
            const parciais = d.mapa.filter((m) => m.forca === 'parcial');
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
                    {d.mapa.filter((m) => m.forca === 'exata').length} casaram exato ·{' '}
                    {parciais.length} por pedaço (conferir) · {orfas.length} sem fonte
                  </p>
                )}

                {d.mapa.filter((m) => m.campo).map((m) => (
                  <div key={m.coluna} className="mt-1 flex flex-wrap gap-x-2 border-b border-border/40 py-0.5">
                    <span className="font-medium">{m.coluna}</span>
                    <code className="font-mono text-muted-foreground">{m.campo!.nome}</code>
                    <span className={m.forca === 'parcial' ? 'text-amber-600 dark:text-amber-500' : 'text-muted-foreground'}>
                      {m.campo!.origem} · {m.campo!.preenchidos}/{d.amostra}
                      {m.forca === 'parcial' && ' · casou por pedaço'}
                    </span>
                    <span>{m.campo!.valores.join(' | ') || '—'}</span>
                  </div>
                ))}

                {orfas.length > 0 && (
                  <div className="mt-2">
                    <p className="font-medium text-amber-600 dark:text-amber-500">
                      Sem fonte ({orfas.length})
                    </p>
                    <p className="text-muted-foreground">{orfas.map((m) => m.coluna).join(' · ')}</p>
                  </div>
                )}

                {/* Onde mora o que eu não previ. Se `FTE %` está no cadastro com
                    outro nome, é aqui que ele aparece -- e não na lista de órfãs,
                    que só sabe dizer que a coluna ficou vazia. */}
                {d.sobraram.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-muted-foreground">
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
