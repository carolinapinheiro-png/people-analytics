import { useState, useEffect } from 'react';
import { useNavigate, useSearch, Link } from '@tanstack/react-router';
import {
  useAuth,
  ACCESS_DENIED_STORAGE_KEY,
  ACCESS_DENIED_MESSAGE,
  ACCESS_CHECK_FAILED_MESSAGE,
} from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Lock, Mail, LogIn, KeyRound } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const INVALID_CREDENTIALS_MESSAGE = 'Email ou senha inválidos.';

/**
 * Maps a thrown error to a message the user can act on.
 * Authorization failures ("você não pode entrar") must never be collapsed into
 * credential failures ("você digitou errado") — they call for different actions.
 */
function describeLoginError(error: unknown): string {
  const raw = error instanceof Error ? error.message : '';

  if (raw === ACCESS_DENIED_MESSAGE) return ACCESS_DENIED_MESSAGE;
  if (raw === ACCESS_CHECK_FAILED_MESSAGE) return ACCESS_CHECK_FAILED_MESSAGE;
  if (raw.includes('Email not confirmed')) {
    return 'Seu email ainda não foi confirmado. Verifique sua caixa de entrada.';
  }
  if (raw.includes('Too many requests') || raw.includes('rate limit')) {
    return 'Muitas tentativas. Aguarde alguns instantes e tente novamente.';
  }
  return INVALID_CREDENTIALS_MESSAGE;
}

const ForgotPasswordDialog = () => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setIsLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/update-password`,
    });

    if (error) {
      toast.error('Erro ao enviar email de recuperação');
      console.error(error);
    } else {
      toast.success('Email de recuperação enviado. Verifique sua caixa de entrada.');
      setEmail('');
      setOpen(false);
    }
    setIsLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="text-sm text-primary hover:underline underline-offset-4"
        >
          Esqueci minha senha
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            Recuperar senha
          </DialogTitle>
          <DialogDescription>
            Digite seu email autorizado. Você receberá um link para criar uma nova senha.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label htmlFor="reset-email">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="reset-email"
                type="email"
                name="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu.email@flutter.com"
                className="pl-10"
                required
              />
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? 'Enviando...' : 'Enviar link de recuperação'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const { signIn, user, loading, googleSignIn } = useAuth();
  const navigate = useNavigate();
  // In-app destination to return to after sign-in (e.g. the OAuth consent
  // screen). Already validated as a same-origin relative path by the route.
  const { next } = useSearch({ from: '/login' });

  const isBusy = isLoading || isGoogleLoading;

  // A `next` return does a full navigation so the target (consent screen)
  // re-runs its loaders against the fresh session.
  const goAfterSignIn = () => {
    if (next) window.location.assign(next);
    else navigate({ to: '/dashboard', replace: true });
  };

  useEffect(() => {
    if (!loading && user) {
      if (next) window.location.assign(next);
      else navigate({ to: '/dashboard', replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading, navigate, next]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const denied = window.sessionStorage.getItem(ACCESS_DENIED_STORAGE_KEY);
    if (denied) {
      setAccessError(denied);
      toast.error(denied);
      window.sessionStorage.removeItem(ACCESS_DENIED_STORAGE_KEY);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setAccessError(null);
    try {
      await signIn(email, password);
      toast.success('Login realizado com sucesso');
      goAfterSignIn();
    } catch (error) {
      console.error('Login error details:', error);
      const message = describeLoginError(error);
      setAccessError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    setAccessError(null);
    try {
      // On the consent flow, send the OAuth redirect back to /login with the
      // preserved `next`, so the authed-useEffect above completes the return.
      await googleSignIn(next ? `/login?next=${encodeURIComponent(next)}` : undefined);
      // On the redirect flow the browser navigates away, so the loading state is
      // intentionally left on. On the popup flow the auth state change redirects
      // to /dashboard. Either way there is nothing to reset on success.
    } catch (error) {
      console.error('Google sign-in error:', error);
      const message = describeLoginError(error);
      setAccessError(message);
      toast.error(message);
      setIsGoogleLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl mx-auto mb-4 flex items-center justify-center text-lg font-extrabold text-white"
            style={{ background: 'linear-gradient(to right bottom, rgb(92, 107, 192), rgb(38, 166, 154))' }}>
            F
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Flutter Brazil · People Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">Acesso restrito a usuários autorizados</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LogIn className="h-5 w-5" />
              Entrar
            </CardTitle>
            <CardDescription>
              Use seu email corporativo autorizado.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {accessError && (
              <div
                role="alert"
                aria-live="polite"
                className="mb-4 p-3 rounded-lg border border-red-500/30 bg-red-950/40 text-red-200 text-sm"
              >
                {accessError}
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    name="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu.email@flutter.com"
                    className="pl-10"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Senha</Label>
                  <ForgotPasswordDialog />
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    name="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="pl-10"
                    required
                  />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={isBusy}>
                {isLoading ? 'Entrando...' : 'Entrar'}
              </Button>
            </form>

            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-card px-2 text-muted-foreground">ou</span>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleGoogleSignIn}
              disabled={isBusy}
            >
              {isGoogleLoading ? (
                <span className="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-current" />
              ) : (
                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
              )}
              {isGoogleLoading ? 'Conectando ao Google...' : 'Entrar com Google'}
            </Button>

            <p className="mt-6 text-center text-xs text-muted-foreground">
              Ainda não tem acesso?{' '}
              <Link
                to="/signup-closed"
                className="text-primary hover:underline underline-offset-4"
              >
                Saiba como solicitar
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
