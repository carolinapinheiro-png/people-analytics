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

  const gerarBase = async () => {
    setBaixando(true); setResumoBase(null);
    try {
      // O mês ANTERIOR: a base de um mês só fecha depois que ele acaba. Rodar
      // no dia 3 e pegar o mês corrente daria um mês pela metade com cara de
      // mês inteiro.
      const hoje = new Date();
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
      const r = await baixarBase({ data: { ano: d.getFullYear(), mes: d.getMonth() + 1 } });
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
            As 17 colunas da aba <code>dados</code>, do MÊS PASSADO, na ordem em que ela está —
            pronto para colar. A coluna <strong>Company</strong> sai vazia para quem ainda não
            tem o campo <code>Empresa</code> no Convenia: vazio é visível, empresa errada não é,
            e a planilha é cortada por empresa.
          </p>

          <Button onClick={gerarBase} disabled={baixando} className="mt-4" variant="outline">
            <RefreshCw className={`mr-2 h-4 w-4 ${baixando ? 'animate-spin' : ''}`} />
            {baixando ? 'Montando…' : 'Baixar base do mês passado'}
          </Button>

          {resumoBase && (
            <p className="mt-3 text-xs leading-relaxed">{resumoBase}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default ControladoriaCard;
