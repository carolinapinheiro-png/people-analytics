import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { AlertTriangle, Download, FileUp, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import {
  exportAllowedEmailsCsv, importAllowedEmailsCsv,
} from '@/lib/access.functions';

import { tx } from '@/lib/i18n';
/**
 * Entrada e saída em CSV da lista de usuários.
 *
 * ===========================================================================
 * A IMPORTAÇÃO TEM PRÉVIA OBRIGATÓRIA
 * ===========================================================================
 * É o mesmo padrão dos outros importadores do painel (Convenia, inHire,
 * Polly). Aqui ele pesa mais: os outros importam NÚMEROS, este importa
 * PERMISSÃO. Um arquivo com a coluna trocada não quebra nada -- concede
 * acesso a quem não devia, para várias pessoas de uma vez, sem erro nenhum.
 *
 * A prévia diz, linha a linha, o que vai mudar. Só depois disso grava.
 *
 * ===========================================================================
 * O ARQUIVO QUE SAI É O ARQUIVO QUE ENTRA
 * ===========================================================================
 * Exportar e importar usam o mesmo formato, de propósito: é o que permite
 * exportar, editar no Excel e reimportar sem traduzir nada à mão. Sem isso,
 * cadastrar um time inteiro continuaria sendo um por um.
 */

interface LinhaPrevia {
  email: string;
  acao: 'criar' | 'atualizar' | 'sem mudanca';
  mudancas: string[];
}

interface Resultado {
  criar: number;
  atualizar: number;
  semMudanca: number;
  problemas: Array<{ linha: number; email: string; motivo: string }>;
  ignorados: string[];
  previa: LinhaPrevia[];
  gravado: boolean;
}

export default function UsersCsvCard({ onChanged }: { onChanged: () => void }) {
  const exportar = useServerFn(exportAllowedEmailsCsv);
  const importar = useServerFn(importAllowedEmailsCsv);

  const [texto, setTexto] = useState('');
  const [res, setRes] = useState<Resultado | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const baixar = async () => {
    setOcupado(true);
    try {
      const { csv, linhas } = await exportar();
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `usuarios-acesso-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(tx("{0} usuário(s) exportado(s).", [linhas]));
    } catch (e) {
      toast.error(e instanceof Error ? tx(e.message) : tx("Falha ao exportar"));
    } finally {
      setOcupado(false);
    }
  };

  const lerArquivo = async (f: File) => {
    setTexto(await f.text());
    setRes(null);
  };

  const rodar = async (confirm: boolean) => {
    if (!texto.trim()) { toast.error(tx("Escolha um arquivo primeiro.")); return; }
    setOcupado(true);
    try {
      const r = await importar({ data: { texto, confirm } }) as Resultado;
      setRes(r);
      if (confirm) {
        toast.success(tx("{0} criado(s), {1} atualizado(s).", [r.criar, r.atualizar]));
        onChanged();
      }
    } catch (e) {
      toast.error(e instanceof Error ? tx(e.message) : tx("Falha ao ler o arquivo"));
    } finally {
      setOcupado(false);
    }
  };

  const vaiMudar = res ? res.criar + res.atualizar : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">{tx("Planilha de usuários")}</CardTitle>
        <CardDescription>
          {tx("Exporte para conferir ou editar em massa. O arquivo que sai é o mesmo que entra — dá para abrir no Excel, mexer e reimportar.")}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={baixar} disabled={ocupado}>
            <Download className="mr-2 h-4 w-4" />{" "}{tx("Exportar CSV")}
          </Button>

          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary">
            <FileUp className="h-4 w-4" />
            {tx("Escolher arquivo")}
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void lerArquivo(f); }}
            />
          </label>

          {texto && (
            <Button variant="outline" size="sm" onClick={() => rodar(false)} disabled={ocupado}>
              {tx("Conferir antes de gravar")}
            </Button>
          )}
        </div>

        {res && (
          <div className="rounded-lg border border-border/60 p-3 text-sm space-y-3">
            <div className="flex flex-wrap gap-3 text-[13px]">
              <span><strong>{res.criar}</strong>{" "}{tx("a criar")}</span>
              <span><strong>{res.atualizar}</strong>{" "}{tx("a atualizar")}</span>
              <span className="text-muted-foreground">{res.semMudanca}{" "}{tx("sem mudança")}</span>
              {res.problemas.length > 0 && (
                <span className="text-amber-600 dark:text-amber-500">
                  {res.problemas.length}{" "}{tx("linha(s) recusada(s)")}
                </span>
              )}
            </div>

            {res.ignorados.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                {tx("Colunas não reconhecidas (ignoradas):")}{" "}{tx(res.ignorados.join(', '))}.
              </p>
            )}

            {res.problemas.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-[12px] font-medium text-amber-600 dark:text-amber-500">
                  <AlertTriangle className="h-3.5 w-3.5" />{" "}{tx("Recusadas — corrija e reenvie")}
                </div>
                {res.problemas.slice(0, 12).map((p, i) => (
                  <div key={i} className="text-[12px] text-muted-foreground">
                    {p.linha ? tx("linha {0}", [p.linha]) : tx(p.email)} — {tx(p.motivo)}
                  </div>
                ))}
                {res.problemas.length > 12 && (
                  <div className="text-[11px] text-muted-foreground">
                    {tx("…e mais")}{" "}{res.problemas.length - 12}.
                  </div>
                )}
              </div>
            )}

            {/* Linha a linha, e nao so o total: "12 a atualizar" nao permite
                perceber que uma delas e a pessoa errada. */}
            {res.previa.filter((p) => p.acao !== 'sem mudanca').length > 0 && (
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {res.previa.filter((p) => p.acao !== 'sem mudanca').map((p) => (
                  <div key={p.email} className="text-[12px]">
                    <span className={p.acao === 'criar' ? 'font-medium' : ''}>{tx(p.email)}</span>
                    <span className="text-muted-foreground"> — {p.acao}: {tx(p.mudancas.join('; '))}</span>
                  </div>
                ))}
              </div>
            )}

            {!res.gravado && vaiMudar > 0 && (
              <Button onClick={() => rodar(true)} disabled={ocupado}>
                <Upload className="mr-2 h-4 w-4" />
                {tx("Gravar")}{" "}{vaiMudar}{" "}{tx("mudança(s)")}
              </Button>
            )}
            {res.gravado && (
              <p className="text-[12px] text-muted-foreground">{tx("Gravado.")}</p>
            )}
          </div>
        )}

        <p className="text-[11px] text-muted-foreground">
          {tx("Colunas aceitas: email, perfil, departamentos, job_families, abas, cargo, level, validade, dado_individual. Só")}{" "}<strong>{tx("email")}</strong>{" "}{tx("e")}{" "}<strong>{tx("perfil")}</strong>{" "}{tx("são obrigatórios. Linha com problema é recusada, nunca corrigida por conta própria.")}
        </p>
      </CardContent>
    </Card>
  );
}
