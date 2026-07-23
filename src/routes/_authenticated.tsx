import { useState } from 'react';
import { createFileRoute, Navigate, Outlet } from '@tanstack/react-router';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';

export const Route = createFileRoute('/_authenticated')({
  component: AuthenticatedLayout,
});

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );
}

function AuthenticatedLayout() {
  const { user, loading, accessStatus, retryAccessCheck, signOut } = useAuth();
  const [isRetrying, setIsRetrying] = useState(false);

  if (loading) return <Spinner />;

  // No session, or an authoritative denial (session already destroyed upstream).
  if (!user || accessStatus === 'denied') {
    return <Navigate to="/login" replace />;
  }

  // Verification failed. Do NOT redirect to /login: the session is still valid,
  // so LoginPage would bounce the user back to /dashboard and we'd ping-pong.
  // Hold here and offer a retry instead.
  if (accessStatus === 'error') {
    const handleRetry = async () => {
      setIsRetrying(true);
      try {
        await retryAccessCheck();
      } finally {
        setIsRetrying(false);
      }
    };

    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-lg font-semibold text-foreground">
            Não foi possível verificar seu acesso
          </h1>
          <p className="text-sm text-muted-foreground">
            Isso costuma ser instabilidade de conexão, não uma restrição de permissão.
            Sua sessão continua ativa.
          </p>
          <div className="flex items-center justify-center gap-3 pt-2">
            <Button onClick={handleRetry} disabled={isRetrying}>
              {isRetrying ? 'Verificando...' : 'Tentar novamente'}
            </Button>
            <Button variant="outline" onClick={() => signOut()} disabled={isRetrying}>
              Sair
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Session exists but the verdict has not arrived yet.
  if (accessStatus !== 'allowed') return <Spinner />;

  return <Outlet />;
}
