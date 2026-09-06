import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Globe, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { COLORS } from '@/lib/colors';
import { baseWIL } from '@/lib/wil-location.functions';

export function WilLocationCard() {
  const gerar = useServerFn(baseWIL);
  const [baixando, setBaixando] = useState(false);
  const [resumo, setResumo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const anterior = new Date();
  anterior.setDate(1);
  anterior.setMonth(anterior.getMonth() - 1);
  const [alvo, setAlvo] = useState(
    `${anterior.getFullYear()}-${String(anterior.getMonth() + 1).padStart(2, '0')}`,
  );
  const meses = Array.from({ length: 18 }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1 - i);
    return {
      valor: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      rotulo: d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
    };
  });

  const baixar = async () => {
    setBaixando(true); setErro(null); setResumo(null);
    try {
      const [ano, mes] = alvo.split('-').map(Number);
      const r = await gerar({ data: { ano, mes } });

      // O servidor devolve a planilha inteira em base64: as abas saem com os
      // nomes exatos do template, e não há colagem de CSV em aba nenhuma.
      const bytes = Uint8Array.from(atob(r.xlsxBase64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }));
      const a = document.createElement('a');
      a.href = url; a.download = `wil-${r.rotulo.replace(/[./]/g, '-')}.xlsx`;
      a.click(); URL.revokeObjectURL(url);

      const reg = r.linhas.filter((l) => l.tipo === 'Regular');
      const con = r.linhas.filter((l) => l.tipo === 'Contractor');
      const soma = (ls: typeof reg) => ls.reduce((s, l) => s + l.headcount, 0);
      setResumo(
        `${r.rotulo}: Regular ${soma(reg)}, Contractor ${soma(con)}.`
        + ` ${r.foraDoRecorte} pessoas fora do recorte NSX (Betfair e Flutter International).`
        + (r.semFamilia
          ? ` ATENÇÃO: ${r.semFamilia} pessoas da NSX sem Job Type Family ficaram de fora de todas as linhas — é a mesma população do carry-forward.`
          : '')
        + ` N-4: ${r.n4.reduce((t, l) => t + l.homensEmpregados + l.homensContractors + l.mulheresEmpregadas + l.mulheresContractors + l.semGenero, 0)} pessoas nas camadas N a N-4; ${r.abaixoDeN4} abaixo de N-4 não entram nessa aba.`
        + (r.familiasDesconhecidas.length
          ? ` Famílias não reconhecidas pelo de-para: ${r.familiasDesconhecidas.join(', ')}.`
          : ''),
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setBaixando(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <Globe className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="flex-1">
          <h3 className="text-base font-semibold">WIL/GPA — planilha do mês</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Um <code>.xlsx</code> com as abas <strong>Template - Location</strong> e{' '}
            <strong>N-4</strong> já preenchidas, com os nomes de aba do template. Só NSX — as
            três entidades; Betfair e Flutter International ficam de fora, e o resumo diz
            quantos.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            <strong>Total open roles</strong>, <strong>Backfill</strong> e <strong>New</strong>{' '}
            saem vazias: vêm da sua planilha, não do Convenia. A aba <strong>DEI Metrics</strong>{' '}
            ainda não é gerada — depende de nacionalidade e PCD, que a carga está preenchendo.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <select
              className="rounded border border-border bg-background px-2 py-1 text-sm"
              value={alvo}
              onChange={(e) => { setAlvo(e.target.value); setResumo(null); }}
              disabled={baixando}
            >
              {meses.map((m) => <option key={m.valor} value={m.valor}>{m.rotulo}</option>)}
            </select>
            <Button onClick={baixar} disabled={baixando} variant="outline">
              <RefreshCw className={`mr-2 h-4 w-4 ${baixando ? 'animate-spin' : ''}`} />
              {baixando ? 'Montando…' : 'Baixar planilha do WIL'}
            </Button>
          </div>

          {erro && <p className="mt-3 text-sm" style={{ color: COLORS.danger }}>{erro}</p>}
          {resumo && <p className="mt-3 text-xs leading-relaxed">{resumo}</p>}
        </div>
      </div>
    </div>
  );
}

export default WilLocationCard;
