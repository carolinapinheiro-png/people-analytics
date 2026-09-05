import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { FileSpreadsheet, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { COLORS } from '@/lib/colors';
import { baseTalentMobility } from '@/lib/talent-mobility-base.functions';

/**
 * O download da base do Talent Mobility.
 *
 * Card separado do mapa de campos de propósito: um é rotina mensal, o outro se
 * mexe quando o RH renomeia um campo. Empilhar os dois foi o erro que deixou o
 * card do Convenia com 516 linhas.
 */
export function TalentMobilityBaseCard() {
  const baixar = useServerFn(baseTalentMobility);
  const [baixando, setBaixando] = useState(false);
  const [resumo, setResumo] = useState<string | null>(null);
  const [vazios, setVazios] = useState<{ coluna: string; vazios: number }[]>([]);
  const [orfas, setOrfas] = useState<{ coluna: string; campo: string }[]>([]);
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

  const gerar = async () => {
    setBaixando(true); setErro(null); setResumo(null); setVazios([]); setOrfas([]);
    try {
      const [ano, mes] = alvo.split('-').map(Number);
      const r = await baixar({ data: { ano, mes } });
      const csv = [r.colunas, ...r.linhas]
        .map((l) => l.map((c) => (/[",\n;]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(','))
        .join('\n');
      // BOM: sem ele o Excel abre "José" como "JosÃ©".
      const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url; a.download = `talent-mobility-${r.rotulo.replace(/[./]/g, '-')}.csv`;
      a.click(); URL.revokeObjectURL(url);
      setVazios(r.vazios);
      // Antes de tudo: escolha que perdeu o campo dela. Dito pelo nome, e no
      // topo, porque isso não é "faltou dado" -- é o mapa apontando para um
      // nome que o RH mudou, e a coluna sai vazia sem nenhum outro sinal.
      setOrfas(r.escolhasOrfas);
      setResumo(
        `${r.rotulo}: ${r.linhas.length} pessoas, ${r.colunas.length} colunas.`
        + (r.admitidosDepois ? ` ${r.admitidosDepois} admitidas depois deste mês ficaram de fora.` : '')
        + (r.semCadastroCompleto
          ? ` ATENÇÃO: ${r.semCadastroCompleto} ainda não foram relidas pela carga — saem sem Job Family, Career Band, Compensation Grade e FTE. Rode a carga até a fila zerar.`
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
        <FileSpreadsheet className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="flex-1">
          <h3 className="text-base font-semibold">Base do Talent Mobility (Sandeep)</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            As 51 colunas no vocabulário do Workday, na ordem do arquivo — pronto para colar.
            O mapa de cada coluna foi medido contra as 654 pessoas de julho; o que não tem
            fonte sai vazio, com a contagem abaixo.
          </p>
          {/* Dito na tela, e não só no log: quem baixa merece saber que o
              download fica registrado, em vez de descobrir depois. */}
          <p className="mt-2 text-xs text-muted-foreground">
            Leva nome, data de nascimento e salário na mesma linha. Cada download é
            registrado com quem baixou, quando e de que mês.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <select
              className="rounded border border-border bg-background px-2 py-1 text-sm"
              value={alvo}
              onChange={(e) => { setAlvo(e.target.value); setResumo(null); setVazios([]); }}
              disabled={baixando}
            >
              {meses.map((m) => <option key={m.valor} value={m.valor}>{m.rotulo}</option>)}
            </select>
            <Button onClick={gerar} disabled={baixando} variant="outline">
              <RefreshCw className={`mr-2 h-4 w-4 ${baixando ? 'animate-spin' : ''}`} />
              {baixando ? 'Montando…' : 'Baixar base'}
            </Button>
          </div>

          {erro && <p className="mt-3 text-sm" style={{ color: COLORS.danger }}>{erro}</p>}

          {orfas.length > 0 && (
            <div className="mt-3 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-xs">
              <p className="font-medium">
                {orfas.length} {orfas.length === 1 ? 'coluna aponta' : 'colunas apontam'} para um
                campo que não existe mais no cadastro
              </p>
              <p className="mt-1 text-muted-foreground">
                {orfas.map((o) => `${o.coluna} → ${o.campo}`).join(' · ')}
              </p>
              <p className="mt-1 text-muted-foreground">
                Provável renomeação no Convenia. Elas saem VAZIAS neste arquivo até alguém
                reapontar no mapa abaixo.
              </p>
            </div>
          )}
          {resumo && <p className="mt-3 text-xs leading-relaxed">{resumo}</p>}

          {vazios.length > 0 && (
            <details className="mt-2 text-xs" open>
              <summary className="cursor-pointer text-muted-foreground">
                {vazios.length} colunas com célula vazia
              </summary>
              <p className="mt-1 text-muted-foreground">
                {vazios.map((v) => `${v.coluna} (${v.vazios})`).join(' · ')}
              </p>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}

export default TalentMobilityBaseCard;
