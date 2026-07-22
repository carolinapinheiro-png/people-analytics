import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Lock } from 'lucide-react';

export default function SignupClosedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div
            className="w-12 h-12 rounded-xl mx-auto mb-4 flex items-center justify-center text-lg font-extrabold text-white"
            style={{ background: 'linear-gradient(to right bottom, rgb(92, 107, 192), rgb(38, 166, 154))' }}
          >
            F
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Flutter Brazil · People Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">Acesso restrito a usuários autorizados</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Cadastros fechados
            </CardTitle>
            <CardDescription>
              Sign-ups are currently closed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Novos cadastros estão desativados no momento. Se você precisar de acesso, entre em contato com um administrador.
            </p>
            <Button asChild className="w-full">
              <Link to="/login">Voltar para o login</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
