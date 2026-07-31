import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollText } from 'lucide-react';

export interface AccessLog {
  id: string;
  email: string;
  action: string;
  allowed: boolean;
  ip_address: string | null;
  created_at: string;
}

export default function AuditSection({ logs }: { logs: AccessLog[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <ScrollText className="h-5 w-5" />
          Logs de acesso
        </CardTitle>
        <CardDescription>Últimas tentativas de acesso ao dashboard.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {logs.map((log) => (
            <div
              key={log.id}
              className="flex items-center justify-between p-3 rounded-lg border border-border bg-card text-sm"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Badge variant={log.allowed ? 'outline' : 'destructive'} className="shrink-0">
                  {log.allowed ? 'Permitido' : 'Negado'}
                </Badge>
                <span className="truncate">{log.email}</span>
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                {new Date(log.created_at).toLocaleString('pt-BR')}
              </span>
            </div>
          ))}
          {logs.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhum log registrado ainda.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
