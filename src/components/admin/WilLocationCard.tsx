import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Globe, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { COLORS } from '@/lib/colors';
import { baseWIL } from '@/lib/wil-location.functions';

/** As dezesseis colunas do template, na ordem em que ele as espera. */
const CABECALHO = [
  'LOCATION', 'JOB Family', 'Headcount at month end', 'Number of females at month end',
  'Number of contingent workers month end', 'number of FTE month end',
  'average headcount past 12 months', 'Total leavers past 12 months',
  'Total Female leavers past 12 months', 'Number of voluntary leavers past 12 months',
  'Female voluntary leavers past 12 months', 'Total hires past 12 months',
  'Female hires past 12 months', 'Total Leavers this month', 'Total Hires this month',
  'Total open roles', 'Number of Backfill open roles', 'Number of New open roles',
  'FlutterBR Notes',
];

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

      // As três colunas de vaga aberta saem VAZIAS, e a nota do bloco vai na
      // última: as duas coisas são como o arquivo entregue faz.
      const linhas = r.linhas.map((l) => [
        'BRAZIL', l.familia, l.headcount, l.mulheres, 0, l.fte, l.mediaHeadcount12m,
        l.saidas12m, l.saidasMulheres12m, l.saidasVoluntarias12m,
        l.saidasVoluntariasMulheres12m, l.entradas12m, l.entradasMulheres12m,
        l.saidasNoMes, l.entradasNoMes, '', '', '',
        l.tipo === 'Regular' ? 'Regular Employee' : 'Contractor',
      ].map(String));

      const csv = [CABECALHO, ...linhas]
        .map((l) => l.map((c) => (/[",\n;]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(','))
        .join('\n');
      const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url; a.download = `wil-location-${r.rotulo.replace(/[./]/g, '-')}.csv`;
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
          <h3 className="text-base font-semibold">WIL/GPA — aba Template - Location</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            As dez famílias de cargo em dois blocos, Regular e Contractor, na ordem do
            template. Só NSX — as três entidades; Betfair e Flutter International ficam de
            fora, e o resumo diz quantos.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            <strong>Total open roles</strong>, <strong>Backfill</strong> e <strong>New</strong>{' '}
            saem vazias: vêm da sua planilha, não do Convenia. As abas DEI Metrics e N-4 ainda
            não são geradas aqui.
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
              {baixando ? 'Montando…' : 'Baixar aba Location'}
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
