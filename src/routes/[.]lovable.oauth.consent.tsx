import { createFileRoute, redirect } from '@tanstack/react-router';
import { useState } from 'react';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

/**
 * OAuth 2.1 consent screen for MCP / agent integrations.
 *
 * Supabase (the authorization server) redirects here with an
 * `authorization_id`; the signed-in user approves or denies the connecting
 * client (ChatGPT, Claude, Lovable, …) acting on their People Analytics data.
 */

interface AuthorizationDetails {
  client?: { name?: string | null } | null;
  redirect_url?: string | null;
  redirect_to?: string | null;
}

interface OAuthNamespace {
  getAuthorizationDetails(id: string): Promise<{ data: AuthorizationDetails | null; error: Error | null }>;
  approveAuthorization(id: string): Promise<{ data: AuthorizationDetails | null; error: Error | null }>;
  denyAuthorization(id: string): Promise<{ data: AuthorizationDetails | null; error: Error | null }>;
}

// `supabase.auth.oauth` is beta and not present in the published types.
const oauth = (supabase.auth as unknown as { oauth: OAuthNamespace }).oauth;

export const Route = createFileRoute('/.lovable/oauth/consent')({
  // Browser-only: the Supabase client reads its session from localStorage,
  // which is absent on the SSR pass.
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === 'string' ? s.authorization_id : '',
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error('Missing authorization_id');
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      // Preserve the full consent URL so the user returns here after sign-in.
      const next = location.pathname + location.searchStr;
      throw redirect({ to: '/login', search: { next } });
    }
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get('authorization_id')!;
    const { data, error } = await oauth.getAuthorizationDetails(authorizationId);
    if (error) throw error;
    // Already-approved client: the provider resolves immediately — bounce to it.
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  head: () => ({
    meta: [
      { title: 'Conectar aplicativo · People Analytics' },
      { name: 'description', content: 'Autorize um aplicativo a acessar o People Analytics como você.' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Não foi possível carregar esta solicitação</CardTitle>
          <CardDescription>
            {String((error as Error)?.message ?? error)}
          </CardDescription>
        </CardHeader>
      </Card>
    </main>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clientName = details?.client?.name ?? 'um aplicativo';

  // Event-handler errors are not caught by errorComponent — surface them in state.
  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const { data, error } = approve
      ? await oauth.approveAuthorization(authorization_id)
      : await oauth.denyAuthorization(authorization_id);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError('O servidor de autorização não retornou um redirecionamento.');
      return;
    }
    window.location.href = target;
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div
            className="w-12 h-12 rounded-xl mx-auto mb-4 flex items-center justify-center text-lg font-extrabold text-white"
            style={{ background: 'linear-gradient(to right bottom, rgb(92, 107, 192), rgb(38, 166, 154))' }}
          >
            F
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Flutter Brazil · People Analytics</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              Conectar {clientName}
            </CardTitle>
            <CardDescription>
              Isso permite que <strong>{clientName}</strong> acesse o People Analytics como você,
              respeitando seu perfil de acesso e seus departamentos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <div
                role="alert"
                aria-live="polite"
                className="mb-4 p-3 rounded-lg border border-red-500/30 bg-red-950/40 text-red-200 text-sm"
              >
                {error}
              </div>
            )}
            <div className="flex gap-3">
              <Button className="flex-1" disabled={busy} onClick={() => decide(true)}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Aprovar'}
              </Button>
              <Button
                className="flex-1"
                variant="outline"
                disabled={busy}
                onClick={() => decide(false)}
              >
                Negar
              </Button>
            </div>
            <p className="mt-4 text-center text-xs text-muted-foreground">
              Você pode revogar este acesso a qualquer momento com um administrador.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
