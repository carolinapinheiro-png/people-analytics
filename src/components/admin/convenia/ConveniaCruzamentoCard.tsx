import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { GitCompare, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { COLORS } from '@/lib/colors';
import { testarCruzamento, type Cruzamento } from '@/lib/convenia.functions';

/**
 * Ativos e desligados são a mesma base?
 *
 * Se os desligados estiverem também na listagem de colaboradores, a admissão e
 * a área de quem saiu vêm de lá -- e não é preciso buscar pessoa por pessoa,
 * que é caro e expõe cadastro para reconfirmar dado imutável.
 */
export function ConveniaCruzamentoCard() {
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

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <GitCompare className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="flex-1">
          <h3 className="text-base font-semibold">Ativos e desligados são a mesma base?</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Cruza as duas listagens pelo <code>id</code>. Se os desligados estiverem também na
            de colaboradores, a admissão e a área de quem saiu vêm de lá — e não é preciso
            buscar pessoa por pessoa. Baixa as listas inteiras, então demora ~1 minuto.
          </p>

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
      </div>
    </div>
  );
}

export default ConveniaCruzamentoCard;
