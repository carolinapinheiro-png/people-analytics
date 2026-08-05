import { useDashboard } from '@/data/DashboardContext';
import { Button } from '@/components/ui/button';

/**
 * As abas de desligados dependem de dado individual, que agora vem do servidor
 * em vez de estar no bundle. Tratar carga e erro aqui, no ponto de troca de
 * aba, evita espalhar early return dentro de cada aba -- o que quebraria a
 * ordem dos hooks, ja que ambas chamam useMemo depois do useDashboard.
 */
export default function LeaversGate({ children }: { children: React.ReactNode }) {
  const { leaversLoading, leaversError, reloadLeavers } = useDashboard();

  if (leaversLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (leaversError) {
    return (
      <div className="max-w-md mx-auto text-center py-24 space-y-4">
        <h2 className="text-lg font-semibold text-foreground">
          Não foi possível carregar os desligados
        </h2>
        <p className="text-sm text-muted-foreground">{leaversError}</p>
        <Button onClick={() => reloadLeavers()}>Tentar novamente</Button>
      </div>
    );
  }

  return <>{children}</>;
}
