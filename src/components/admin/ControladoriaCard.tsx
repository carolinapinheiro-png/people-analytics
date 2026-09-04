import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { FileSpreadsheet, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { baseControladoria } from '@/lib/controladoria.functions';

/**
 * A BASE DO REPORT DA CONTROLADORIA
 *
 * Todo mês: exportar do Convenia, colar na aba `dados`, atualizar o pivô.
 * Um script na minha mão resolveria agosto; um botão resolve setembro
 * também, e sem mim.
 *
 * Morava dentro do ConveniaCard, embaixo do diagnóstico de tokens. Quem vem
 * buscar a base não quer saber de token: saiu para cá, onde o assunto é o
 * report e não a integração que o alimenta.
 */
export function ControladoriaCard() {
  const baixarBase = useServerFn(baseControladoria);
  const [baixando, setBaixando] = useState(false);
  const [resumoBase, setResumoBase] = useState<string | null>(null);

  // Mês passado por padrão: a base de um mês só fecha depois que ele acaba.
  const anterior = new Date();
  anterior.setDate(1);
  anterior.setMonth(anterior.getMonth() - 1);
  const [alvo, setAlvo] = useState(
    `${anterior.getFullYear()}-${String(anterior.getMonth() + 1).padStart(2, '0')}`,
  );

  /**
   * Os 18 meses até o passado. O mês corrente não entra: ele ainda não fechou,
   * e um arquivo de setembro baixado no dia 4 tem cara de mês inteiro.
   */
  const meses = Array.from({ length: 18 }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1 - i);
    const valor = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return { valor, rotulo: d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) };
  });

  const gerarBase = async () => {
    setBaixando(true); setResumoBase(null);
    try {
      const [ano, mes] = alvo.split('-').map(Number);
      const r = await baixarBase({ data: { ano, mes } });
      const csv = [r.colunas, ...r.linhas]
        .map((l) => l.map((c) => (/[",\n;]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(','))
        .join('\n');
      // BOM: sem ele o Excel abre "José" como "JosÃ©", e alguém corrige 600
      // nomes à mão antes de descobrir por quê.
      const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url; a.download = `controladoria-${r.rotulo.replace(/[./]/g, '-')}.csv`;
      a.click(); URL.revokeObjectURL(url);
      setResumoBase(
        `${r.rotulo}: ${r.linhas.length} pessoas.` +
        (r.semEmpresa ? ` ${r.semEmpresa} sem Company — preencha com PROCV contra o mês anterior antes de mandar.` : ' Company completa.') +
        (r.admitidosDepois ? ` ${r.admitidosDepois} admitidas depois deste mês ficaram de fora.` : '') +
        // Este é o número que diz o quanto a base envelhece. Quem saiu não está
        // mais no cadastro, e `convenia_leavers` não guarda nome para repor.
        (r.saidosDepois ? ` ATENÇÃO: ${r.saidosDepois} pessoas estavam ativas neste mês e já foram desligadas — não estão nesta base, e não há como repô-las sem foto mensal do cadastro.` : '') +
        (r.naoLidos ? ` ATENÇÃO: ${r.naoLidos} ainda não foram lidas pela carga e vão sair com as colunas de campo personalizado vazias — rode a sync antes.` : ''),
      );
    } catch (e) {
      setResumoBase(e instanceof Error ? e.message : String(e));
    } finally {
      setBaixando(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <FileSpreadsheet className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="flex-1">
          <h3 className="text-base font-semibold">Base do report da Controladoria</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            As 17 colunas da aba <code>dados</code>, na ordem em que ela está — pronto para
            colar. A coluna <strong>Company</strong> sai vazia para quem ainda não
            tem o campo <code>Empresa</code> no Convenia: vazio é visível, empresa errada não é,
            e a planilha é cortada por empresa.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Meses anteriores são reconstruídos do cadastro de hoje: quem entrou depois fica de
            fora, mas quem já saiu não volta. O resumo diz quantas pessoas faltam — quanto mais
            antigo o mês, maior o número.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <select
              className="rounded border border-border bg-background px-2 py-1 text-sm"
              value={alvo}
              onChange={(e) => { setAlvo(e.target.value); setResumoBase(null); }}
              disabled={baixando}
            >
              {meses.map((m) => (
                <option key={m.valor} value={m.valor}>{m.rotulo}</option>
              ))}
            </select>
            <Button onClick={gerarBase} disabled={baixando} variant="outline">
              <RefreshCw className={`mr-2 h-4 w-4 ${baixando ? 'animate-spin' : ''}`} />
              {baixando ? 'Montando…' : 'Baixar base'}
            </Button>
          </div>

          {resumoBase && (
            <p className="mt-3 text-xs leading-relaxed">{resumoBase}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default ControladoriaCard;
