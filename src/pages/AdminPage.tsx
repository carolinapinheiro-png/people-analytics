import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useServerFn } from '@tanstack/react-start';
import { Link } from '@tanstack/react-router';
import { Trash2, UserPlus, Shield, ScrollText, ShieldAlert, ShieldCheck, ArrowLeft, Users, Database } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  getAllowedEmails,
  getAccessLogs,
  addAllowedEmail,
  removeAllowedEmail,
  updateAllowedEmailProfile,
} from '@/lib/access.functions';
import {
  ACCESS_PROFILES,
  PROFILE_LABELS,
  PROFILE_DESCRIPTIONS,
  isGlobalProfile,
  normalizeDept,
  type AccessProfile,
} from '@/lib/permissions';
import ImportReconstruidoCard from '@/components/admin/ImportReconstruidoCard';
import SeriesComparisonCard from '@/components/admin/SeriesComparisonCard';

interface AllowedEmail {
  id: string;
  email: string;
  role: 'admin' | 'viewer';
  profile: AccessProfile;
  departments: string[];
  job_families: string[];
  created_at: string;
}

const DEPARTMENTS = [
  'TECHNOLOGY',
  'PRODUCT',
  'MARKETING',
  'COMMERCIAL',
  'FINANCE',
  'OPERATIONS',
  'HR',
];

// Job type families (Talent Mobility). Escopo do gestor = uniao de departamentos
// + familias atribuidas.
const JOB_FAMILIES = [
  'Customer Operations',
  'Commercial & Marketing',
  'Product & Technology',
  'Data & Analytics',
  'Finance',
  'HR',
  'Legal',
  'Other (Property, Security, Cleaning)',
  'Leadership (Executive) SR and C-Levels (reporting to CEO or N-3)',
  'Risk and Trading',
];

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
  const [newProfile, setNewProfile] = useState<AccessProfile>('dept_leader');
  const [newDepartments, setNewDepartments] = useState<string[]>([]);
  const [newJobFamilies, setNewJobFamilies] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const getAllowedEmailsFn = useServerFn(getAllowedEmails);
  const getAccessLogsFn = useServerFn(getAccessLogs);
  const addAllowedEmailFn = useServerFn(addAllowedEmail);
  const removeAllowedEmailFn = useServerFn(removeAllowedEmail);
  const updateAllowedEmailProfileFn = useServerFn(updateAllowedEmailProfile);

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
      await addAllowedEmailFn({
        data: { email: newEmail.trim(), profile: newProfile, departments: newDepartments, jobFamilies: newJobFamilies },
      });
      toast.success('Email autorizado com sucesso');
      setNewEmail('');
      setNewProfile('dept_leader');
      setNewDepartments([]);
      setNewJobFamilies([]);
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

  const handleProfileChange = async (
    id: string,
    profile: AccessProfile,
    departments: string[],
    jobFamilies: string[],
  ) => {
    try {
      await updateAllowedEmailProfileFn({ data: { id, profile, departments, jobFamilies } });
      toast.success('Perfil atualizado');
      fetchEmails();
    } catch (error) {
      toast.error('Erro ao alterar perfil');
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
            Administração de usuários, auditoria e dados da plataforma.
          </p>
          <Link to="/dashboard" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mt-2">
            <ArrowLeft className="h-4 w-4" />
            Voltar ao dashboard
          </Link>
        </div>

        <Tabs defaultValue="access" className="space-y-6">
          <TabsList className="h-auto flex-wrap">
            <TabsTrigger value="access" className="gap-2">
              <Users className="h-4 w-4" />
              Usuários
            </TabsTrigger>
            <TabsTrigger value="audit" className="gap-2">
              <ScrollText className="h-4 w-4" />
              Auditoria
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="data" className="gap-2">
                <Database className="h-4 w-4" />
                Dados
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="access" className="space-y-6 mt-0">
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
                <form onSubmit={handleAdd} className="space-y-3">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                      type="email"
                      placeholder="email@flutter.com"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      required
                      className="flex-1"
                    />
                    <select
                      value={newProfile}
                      onChange={(e) => setNewProfile(e.target.value as AccessProfile)}
                      className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      {ACCESS_PROFILES.map((p) => (
                        <option key={p} value={p}>
                          {PROFILE_LABELS[p]}
                        </option>
                      ))}
                    </select>
                    <Button type="submit" disabled={isLoading}>
                      {isLoading ? 'Adicionando...' : 'Adicionar'}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {PROFILE_DESCRIPTIONS[newProfile]}
                  </p>
                  {!isGlobalProfile(newProfile) && (
                    <div className="space-y-3">
                      <ChipPicker label="Departamentos atendidos" options={DEPARTMENTS} value={newDepartments} onChange={setNewDepartments} />
                      <ChipPicker label="Job type families atendidas" options={JOB_FAMILIES} value={newJobFamilies} onChange={setNewJobFamilies} />
                      <p className="text-[11px] text-muted-foreground">
                        O gestor vê o dashboard, mas só do seu time: <strong>união</strong> dos departamentos e das famílias marcadas.
                      </p>
                    </div>
                  )}
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
                      <div className="flex flex-col gap-1 min-w-0">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-sm truncate">{item.email}</span>
                          <Badge
                            variant={item.profile === 'admin' ? 'default' : 'secondary'}
                            className="shrink-0"
                          >
                            {isGlobalProfile(item.profile) ? (
                              <ShieldCheck className="h-3 w-3 mr-1" />
                            ) : (
                              <ShieldAlert className="h-3 w-3 mr-1" />
                            )}
                            {PROFILE_LABELS[item.profile] ?? item.profile}
                          </Badge>
                        </div>
                        {!isGlobalProfile(item.profile) && (
                          <span className="text-xs text-muted-foreground truncate">
                            {(item.departments?.length || item.job_families?.length)
                              ? [...(item.departments ?? []), ...(item.job_families ?? [])].join(' · ')
                              : 'Sem escopo atribuido — sem acesso a dados'}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <select
                          value={item.profile}
                          onChange={(e) =>
                            handleProfileChange(
                              item.id,
                              e.target.value as AccessProfile,
                              item.departments ?? [],
                              item.job_families ?? [],
                            )
                          }
                          className="h-8 rounded-md border border-input bg-background px-2 py-1 text-xs"
                        >
                          {ACCESS_PROFILES.map((p) => (
                            <option key={p} value={p}>
                              {PROFILE_LABELS[p]}
                            </option>
                          ))}
                        </select>
                        {!isGlobalProfile(item.profile) && (
                          <select
                            value=""
                            onChange={(e) => {
                              const fam = e.target.value;
                              if (!fam) return;
                              const current = item.job_families ?? [];
                              const next = current.includes(fam)
                                ? current.filter((d) => d !== fam)
                                : [...current, fam];
                              handleProfileChange(item.id, item.profile, item.departments ?? [], next);
                            }}
                            className="h-8 rounded-md border border-input bg-background px-2 py-1 text-xs max-w-[140px]"
                          >
                            <option value="">Job families…</option>
                            {JOB_FAMILIES.map((f) => (
                              <option key={f} value={f}>
                                {(item.job_families ?? []).includes(f) ? '✓ ' : ''}
                                {f}
                              </option>
                            ))}
                          </select>
                        )}
                        {!isGlobalProfile(item.profile) && (
                          <select
                            value=""
                            onChange={(e) => {
                              const dept = normalizeDept(e.target.value);
                              if (!dept) return;
                              const current = item.departments ?? [];
                              const next = current.includes(dept)
                                ? current.filter((d) => d !== dept)
                                : [...current, dept];
                              handleProfileChange(item.id, item.profile, next, item.job_families ?? []);
                            }}
                            className="h-8 rounded-md border border-input bg-background px-2 py-1 text-xs"
                          >
                            <option value="">Departamentos…</option>
                            {DEPARTMENTS.map((d) => (
                              <option key={d} value={d}>
                                {(item.departments ?? []).includes(d) ? '✓ ' : ''}
                                {d}
                              </option>
                            ))}
                          </select>
                        )}
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
          </TabsContent>

          <TabsContent value="audit" className="space-y-6 mt-0">
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
          </TabsContent>

          {isAdmin && (
            <TabsContent value="data" className="space-y-6 mt-0">
              <ImportReconstruidoCard />
              <SeriesComparisonCard />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}

function ChipPicker({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const toggle = (opt: string) => {
    onChange(value.includes(opt) ? value.filter((d) => d !== opt) : [...value, opt]);
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => toggle(opt)}
            className={
              'rounded-full border px-3 py-1 text-xs transition-colors ' +
              (value.includes(opt)
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-input text-muted-foreground hover:text-foreground')
            }
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}
