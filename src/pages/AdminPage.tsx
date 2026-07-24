import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useServerFn } from '@tanstack/react-start';
import { Trash2, UserPlus, Shield, ScrollText, ShieldAlert, ShieldCheck } from 'lucide-react';
import {
  getAllowedEmails,
  getAccessLogs,
  addAllowedEmail,
  removeAllowedEmail,
  updateAllowedEmailRole,
} from '@/lib/access.functions';

interface AllowedEmail {
  id: string;
  email: string;
  role: 'admin' | 'viewer';
  created_at: string;
}

interface AccessLog {
  id: string;
  email: string;
  action: string;
  allowed: boolean;
  ip_address: string | null;
  created_at: string;
}

export default function AdminPage() {
  const { user, loading, isAdmin } = useAuth();
  const [emails, setEmails] = useState<AllowedEmail[]>([]);
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'viewer'>('viewer');
  const [isLoading, setIsLoading] = useState(false);

  const getAllowedEmailsFn = useServerFn(getAllowedEmails);
  const getAccessLogsFn = useServerFn(getAccessLogs);
  const addAllowedEmailFn = useServerFn(addAllowedEmail);
  const removeAllowedEmailFn = useServerFn(removeAllowedEmail);
  const updateAllowedEmailRoleFn = useServerFn(updateAllowedEmailRole);

  const fetchEmails = async () => {
    try {
      const data = await getAllowedEmailsFn();
      setEmails(data as AllowedEmail[]);
    } catch (error) {
      toast.error('Erro ao carregar emails autorizados');
      console.error(error);
    }
  };

  const fetchLogs = async () => {
    try {
      const data = await getAccessLogsFn();
      setLogs(data as AccessLog[]);
    } catch (error) {
      toast.error('Erro ao carregar logs');
      console.error(error);
    }
  };

  useEffect(() => {
    if (user && isAdmin) {
      fetchEmails();
      fetchLogs();
    }
  }, [user, isAdmin]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) return;

    setIsLoading(true);
    try {
      await addAllowedEmailFn({ data: { email: newEmail.trim(), role: newRole } });
      toast.success('Email autorizado com sucesso');
      setNewEmail('');
      setNewRole('viewer');
      fetchEmails();
    } catch (error) {
      toast.error('Erro ao adicionar email');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await removeAllowedEmailFn({ data: { id } });
      toast.success('Email removido');
      fetchEmails();
    } catch (error) {
      toast.error('Erro ao remover email');
      console.error(error);
    }
  };

  const handleRoleChange = async (id: string, role: 'admin' | 'viewer') => {
    try {
      await updateAllowedEmailRoleFn({ data: { id, role } });
      toast.success('Papel atualizado');
      fetchEmails();
    } catch (error) {
      toast.error('Erro ao alterar papel');
      console.error(error);
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
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6" />
            Gerenciar Acesso
          </h1>
          <p className="text-sm text-muted-foreground">
            Adicione, remova ou altere permissões de usuários autorizados.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Adicionar usuário
            </CardTitle>
            <CardDescription>
              O usuário precisará fazer login com esse email (senha ou Google).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-2">
              <Input
                type="email"
                placeholder="email@flutter.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                required
                className="flex-1"
              />
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as 'admin' | 'viewer')}
                className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="viewer">Visualizador</option>
                <option value="admin">Administrador</option>
              </select>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Adicionando...' : 'Adicionar'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Usuários autorizados</CardTitle>
            <CardDescription>
              {emails.length} usuário{emails.length !== 1 ? 's' : ''} com acesso
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {emails.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-border bg-card gap-4"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-sm truncate">{item.email}</span>
                    <Badge variant={item.role === 'admin' ? 'default' : 'secondary'} className="shrink-0">
                      {item.role === 'admin' ? (
                        <ShieldCheck className="h-3 w-3 mr-1" />
                      ) : (
                        <ShieldAlert className="h-3 w-3 mr-1" />
                      )}
                      {item.role === 'admin' ? 'Admin' : 'Viewer'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      value={item.role}
                      onChange={(e) => handleRoleChange(item.id, e.target.value as 'admin' | 'viewer')}
                      className="h-8 rounded-md border border-input bg-background px-2 py-1 text-xs"
                    >
                      <option value="viewer">Viewer</option>
                      <option value="admin">Admin</option>
                    </select>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemove(item.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
              {emails.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhum email autorizado ainda.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <ScrollText className="h-5 w-5" />
              Logs de acesso
            </CardTitle>
            <CardDescription>
              Últimas tentativas de acesso ao dashboard.
            </CardDescription>
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

      </div>
    </div>
  );
}
