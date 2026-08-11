import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Bloco recolhido de detalhe.
 *
 * POR QUE ISTO EXISTE
 * A aba tinha 11 gráficos abertos ao mesmo tempo e ninguém conseguia dizer o
 * que era principal. O problema não era o conteúdo -- cada peça respondia uma
 * pergunta legítima -- era não haver hierarquia: tudo com o mesmo peso equivale
 * a nada em destaque.
 *
 * A regra desta aba passa a ser: fica aberto o que responde "o que eu faço com
 * isso". Tudo que responde "como vocês chegaram nesse número" vem para cá.
 *
 * POR QUE RECOLHER E NÃO REMOVER
 * O detalhe é o que sustenta a conversa quando alguém duvida do número -- e
 * alguém sempre duvida. Remover empurraria a pergunta para fora do painel, e a
 * resposta viraria um print no Slack sem contexto nenhum. O `resumo` no
 * cabeçalho existe para que dê para decidir se vale abrir sem abrir.
 */
export default function Detalhe({
  titulo,
  resumo,
  children,
  defaultOpen = false,
}: {
  titulo: string;
  /** Uma linha dizendo o que tem dentro, para não precisar abrir para descobrir. */
  resumo?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [aberto, setAberto] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/25">
      <button
        onClick={() => setAberto((v) => !v)}
        className={cn(
          'w-full flex items-center gap-2.5 p-3 text-left transition-colors hover:bg-muted/50',
          aberto && 'border-b border-border',
        )}
        aria-expanded={aberto}
      >
        {aberto
          ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
        <span className="text-sm font-medium text-muted-foreground">{titulo}</span>
        {resumo && <span className="text-xs text-muted-foreground/80 truncate">{resumo}</span>}
      </button>
      {aberto && <div className="p-3 space-y-4">{children}</div>}
    </div>
  );
}
