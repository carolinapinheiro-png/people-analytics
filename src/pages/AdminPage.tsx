import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useServerFn } from '@tanstack/react-start';
import { Link } from '@tanstack/react-router';
import { Shield, ScrollText, ArrowLeft, Users, Database, Building2 } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { getAllowedEmails, getAccessLogs, getDepartments } from '@/lib/access.functions';
import UsersAccessSection, {
  type AllowedEmail,
  type DepartmentOption,
} from '@/components/admin/UsersAccessSection';
import DepartmentsSection from '@/components/admin/DepartmentsSection';
import UsersCsvCard from '@/components/admin/UsersCsvCard';
import AuditSection, { type AccessLog } from '@/components/admin/AuditSection';
import InhireSyncCard from '@/components/admin/InhireSyncCard';
import ConveniaCard from '@/components/admin/ConveniaCard';
import QohCard from '@/components/admin/QohCard';

interface UserPaginationState {
  items: AllowedEmail[];
  count: number;
  page: number;
  limit: number;
  totalPages: number;
  /** Quantos usuarios em cada perfil, sempre da base inteira. */
  porPerfil: Record<string, number>;
}

export default function AdminPage() {
  const { user, loading, isAdmin } = useAuth();
  const [pagination, setPagination] = useState<UserPaginationState>({
    items: [],
    count: 0,
    page: 1,
    limit: 20,
    totalPages: 1,
    porPerfil: {},
  });
  const [search, setSearch] = useState('');
  // Filtros da lista. O servidor ja os aceitava; a tela nunca os enviou.
  const [profileFilter, setProfileFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [logs, setLogs] = useState<AccessLog[]>([]);

  const getAllowedEmailsFn = useServerFn(getAllowedEmails);
  const getAccessLogsFn = useServerFn(getAccessLogs);
  const getDepartmentsFn = useServerFn(getDepartments);

  const fetchEmails = useCallback(async () => {
    try {
      const data = await getAllowedEmailsFn({
        data: { search, page, limit, profile: profileFilter, department: deptFilter },
      });
      setPagination({
        items: data.items as AllowedEmail[],
        count: data.count,
        page: data.page,
        limit: data.limit,
        totalPages: data.totalPages,
        porPerfil: data.porPerfil ?? {},
      });
      if (data.page > data.totalPages && data.totalPages > 0) {
        setPage(data.totalPages);
      }
    } catch (error) {
      toast.error('Erro ao carregar emails autorizados');
      console.error(error);
    }
  }, [getAllowedEmailsFn, search, page, limit, profileFilter, deptFilter]);

  const fetchDepartments = useCallback(async () => {
    try {
      const data = await getDepartmentsFn();
      setDepartments(data as DepartmentOption[]);
    } catch (error) {
      toast.error('Erro ao carregar catálogo de departamentos');
      console.error(error);
    }
  }, [getDepartmentsFn]);

  const fetchLogs = useCallback(async () => {
    try {
      const data = await getAccessLogsFn();
      setLogs(data as AccessLog[]);
    } catch (error) {
      toast.error('Erro ao carregar logs');
      console.error(error);
    }
  }, [getAccessLogsFn]);

  const refreshAccess = useCallback(() => {
    fetchEmails();
    fetchDepartments();
  }, [fetchEmails, fetchDepartments]);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setPage(1);
  }, []);

  const handleLimitChange = useCallback((value: number) => {
    setLimit(value);
    setPage(1);
  }, []);

  useEffect(() => {
    if (user && isAdmin) {
      fetchEmails();
    }
  }, [user, isAdmin, fetchEmails]);

  useEffect(() => {
    if (user && isAdmin) {
      fetchDepartments();
      fetchLogs();
    }
  }, [user, isAdmin, fetchDepartments, fetchLogs]);

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
            Administração de usuários, departamentos, auditoria e dados da plataforma.
          </p>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mt-2"
          >
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
            <TabsTrigger value="departments" className="gap-2">
              <Building2 className="h-4 w-4" />
              Departamentos
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

          <TabsContent value="access" className="mt-0">
            <UsersAccessSection
              emails={pagination.items}
              departments={departments}
              totalCount={pagination.count}
              page={pagination.page}
              totalPages={pagination.totalPages}
              limit={pagination.limit}
              search={search}
              porPerfil={pagination.porPerfil}
              profileFilter={profileFilter}
              deptFilter={deptFilter}
              onProfileFilterChange={(v) => { setProfileFilter(v); setPage(1); }}
              onDeptFilterChange={(v) => { setDeptFilter(v); setPage(1); }}
              onSearchChange={handleSearchChange}
              onPageChange={setPage}
              onLimitChange={handleLimitChange}
              onChanged={refreshAccess}
            />
            <div className="mt-4">
              <UsersCsvCard onChanged={refreshAccess} />
            </div>
          </TabsContent>

          <TabsContent value="departments" className="mt-0">
            <DepartmentsSection
              departments={departments}
              emails={pagination.items}
              onChanged={refreshAccess}
            />
          </TabsContent>

          <TabsContent value="audit" className="mt-0">
            <AuditSection logs={logs} />
          </TabsContent>

          {isAdmin && (
            <TabsContent value="data" className="space-y-6 mt-0">
              <InhireSyncCard />
              <ConveniaCard />
              <QohCard />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}
