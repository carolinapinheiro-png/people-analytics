import { useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { AlertTriangle, CheckCircle2, Plug, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { COLORS } from '@/lib/colors';
import {
  syncInhire, getInhireStatus,
  type InhireSyncResult, type InhireStatus,
} from '@/lib/inhire.functions';

/**
 * Sincronização do recrutamento com a API do InHire.
 *
 * DUAS ETAPAS, SEMPRE. "Simular" baixa tudo e mostra o que faria, sem gravar.
 * Só depois aparece o botão de gravar.
 *
 * Não é excesso de cuidado: os erros desta integração são silenciosos. Se o
 * de-para de departamento parar de bater porque alguém renomeou uma área no
 * InHire, nada falha -- o painel só reparte a área em duas linhas com metade do
 * volume cada. A prévia é o único momento em que isso fica visível antes de
 * virar número na tela de alguém.
 */

const fmtData = (iso: string | null) =>
  !iso ? '—' : new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export default function InhireSyncCard() {
  const [status, setStatus] = useState<InhireStatus | null>(null);
  const [resultado, setResultado] = useState<InhireSyncResult | null>(null);
  const [rodando, setRodando] = useState<'preview' | 'gravar' | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const fetchStatus = useServerFn(getInhireStatus);
  const runSync = useServerFn(syncInhire);

  const carregar = () => {
    fetchStatus().then((s) => setStatus(s as InhireStatus)).catch(() => setStatus(null));
  };
  useEffect(carregar, [fetchStatus]);

  const executar = async (confirm: boolean) => {
    setRodando(confirm ? 'gravar' : 'preview');
    setErro(null);
    try {
      const r = (await runSync({ data: { confirm } })) as InhireSyncResult;
      setResultado(r);
      if (confirm) carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao sincronizar');
      setResultado(null);
    } finally {
      setRodando(null);
    }
  };

  const configurado = status?.configurado ?? false;

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
      <div className="flex items-start gap-2.5">
        <Plug className="h-4 w-4 mt-0.5 text-[hsl(var(--flutter))]" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Recrutamento — sincronizar com o InHire</p>
          <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
            Busca as vagas pela API e recalcula a série mensal e a foto de vagas abertas.
            Só agregado por área: nenhum dado de candidato passa por aqui.
          </p>
        </div>
      </div>

      {status && !configurado && (
        <div className="rounded-md border p-3" style={{ borderColor: `${COLORS.warning}55`, background: `${COLORS.warning}0f` }}>
          <p className="text-xs font-medium mb-1">Integração ainda não configurada</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Faltam nos secrets: <strong>{status.faltando.join(', ')}</strong>. Crie um usuário de API
            no InHire em Configurações → Usuários de API (precisa ser owner, plano Advanced) e cole
            os valores. A senha aparece uma única vez.
          </p>
        </div>
      )}

      {status && (
        <div className="grid grid-cols-2 gap-3 text-[11px]">
          <div>
            <p className="text-muted-foreground">Última execução</p>
            <p className="font-medium">
              {status.ultimaExecucao ? fmtData(status.ultimaExecucao.quando) : 'nunca'}
              {status.ultimaExecucao && (
                <span className="text-muted-foreground"> · {status.ultimaExecucao.status}</span>
              )}
            </p>
            {status.ultimaExecucao?.erro && (
              <p className="text-[11px] mt-0.5" style={{ color: COLORS.danger }}>
                {status.ultimaExecucao.erro}
              </p>
            )}
          </div>
          <div>
            <p className="text-muted-foreground">Foto de vagas abertas</p>
            <p className="font-medium">{status.ultimaFoto ?? 'nenhuma ainda'}</p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" disabled={!configurado || rodando !== null}
          onClick={() => executar(false)}>
          {rodando === 'preview'
            ? <><RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />Simulando…</>
            : 'Simular sem gravar'}
        </Button>
        {resultado && !resultado.gravado && (
          <Button size="sm" disabled={rodando !== null} onClick={() => executar(true)}>
            {rodando === 'gravar'
              ? <><RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />Gravando…</>
              : `Gravar ${resultado.linhasMensais + resultado.linhasAbertas} linhas`}
          </Button>
        )}
      </div>

      {erro && (
        <p className="text-xs" style={{ color: COLORS.danger }}>{erro}</p>
      )}

      {resultado && (
        <div className="rounded-md border border-border p-3 space-y-2">
          <div className="flex items-center gap-1.5">
            {resultado.gravado
              ? <CheckCircle2 className="h-4 w-4" style={{ color: COLORS.success }} />
              : <AlertTriangle className="h-4 w-4" style={{ color: COLORS.info }} />}
            <p className="text-xs font-medium">
              {resultado.gravado ? 'Gravado' : 'Prévia — nada foi gravado ainda'}
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
            {[
              ['Vagas recebidas', resultado.vagasRecebidas],
              ['Talent pool excluídas', resultado.talentPoolExcluidas],
              ['Linhas de série mensal', resultado.linhasMensais],
              ['Linhas de foto', resultado.linhasAbertas],
              ['Fechadas com tempo', resultado.fechadasComTempo],
              ['Sem departamento', resultado.semDepartamento],
              ['Requisições usadas', resultado.requisicoes],
              ['Menor saldo do limite', resultado.menorSaldoLimite ?? '—'],
            ].map(([label, valor]) => (
              <div key={String(label)}>
                <p className="text-muted-foreground">{label}</p>
                <p className="font-medium tabular-nums">{String(valor)}</p>
              </div>
            ))}
          </div>

          {resultado.avisos.length > 0 && (
            <ul className="space-y-1 pt-1 border-t border-border/60">
              {resultado.avisos.map((a) => (
                <li key={a} className="text-[11px] text-muted-foreground leading-relaxed flex gap-1.5">
                  <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" style={{ color: COLORS.warning }} />
                  {a}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        O limite de requisições do InHire é <strong>por conta</strong>, compartilhado com o conector
        MCP que o time usa. A sincronização anda devagar de propósito — se ela corresse, derrubaria
        a ferramenta de quem está recrutando naquele momento.
      </p>
    </div>
  );
}
