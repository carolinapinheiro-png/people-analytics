import { useState, useEffect, useCallback } from 'react';
import { lerAba, gravarAba } from '@/lib/nav-state';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useServerFn } from '@tanstack/react-start';
import { Link } from '@tanstack/react-router';
import {
  Shield, ScrollText, ArrowLeft, Users, Database, Building2, Plug, FileSpreadsheet, KeyRound,
} from 'lucide-react';
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
import ConveniaSyncCard from '@/components/admin/convenia/ConveniaSyncCard';
import ConveniaTokensCard from '@/components/admin/convenia/ConveniaTokensCard';
import VinculoCamadaCard from '@/components/admin/VinculoCamadaCard';
import QohCard from '@/components/admin/QohCard';
import MigracoesCard from '@/components/admin/MigracoesCard';
import PesquisaCard from '@/components/admin/PesquisaCard';
import ControladoriaCard from '@/components/admin/ControladoriaCard';
import TalentMobilityBaseCard from '@/components/admin/TalentMobilityBaseCard';
import WilLocationCard from '@/components/admin/WilLocationCard';
import TalentMobilityCard from '@/components/admin/TalentMobilityCard';

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

  // ------------------------------------------------------------------
  // A ABA SOBREVIVE AO F5
  // ------------------------------------------------------------------
  // Eram `defaultValue`, ou seja, estado não controlado do Radix: vive dentro
  // do componente e morre no recarregamento. Quem estava em "Dados > Convenia"
  // apertava F5 e voltava para Usuários / Integrações, toda vez.
  //
  // Pesa mais aqui do que no dashboard: a aba de Dados é onde se roda carga e
  // se confere resultado, e cada conferência é um recarregamento.
  //
  // A restauração é feita em efeito, e não no init do `useState`, porque no
  // SSR não existe `localStorage` -- ler ali faria o HTML do servidor divergir
  // do cliente, que é o mesmo cuidado que o dashboard já tomava.
  const [aba, setAba] = useState('access');
  const [subAba, setSubAba] = useState('integracoes');
  const [abaRestaurada, setAbaRestaurada] = useState(false);

  useEffect(() => {
    const s = lerAba('admin');
    if (s?.tab) setAba(s.tab);
    if (s?.sub) setSubAba(s.sub);
    setAbaRestaurada(true);
  }, []);

  useEffect(() => {
    if (abaRestaurada) gravarAba('admin', { tab: aba, sub: subAba });
  }, [abaRestaurada, aba, subAba]);

  // "Dados" só existe para admin. Sem esta guarda, um admin que deixasse a
  // tela nessa aba e depois perdesse o perfil -- ou alguém usando o mesmo
  // navegador -- abriria o Admin numa aba sem gatilho: o Radix não seleciona
  // nada e o conteúdo some, sem erro e sem explicação. `loading` é esperado
  // porque `isAdmin` chega depois da autenticação, e corrigir antes disso
  // jogaria todo admin para fora da aba a cada abertura.
  useEffect(() => {
    if (!loading && !isAdmin && aba === 'data') setAba('access');
  }, [loading, isAdmin, aba]);
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

        <Tabs value={aba} onValueChange={setAba} className="space-y-6">
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

          {/* ------------------------------------------------------------
              REPORT NAO E INTEGRACAO
              ------------------------------------------------------------
              A aba empilhava seis cards de sync, e a base da Controladoria
              estava enterrada dentro do Convenia -- para baixar a planilha
              do mes era preciso atravessar diagnostico de token, sonda de
              campo e cruzamento de listagem.

              Sao duas perguntas diferentes: "a integracao esta de pe?" e
              "cade a base que eu mando para a Controladoria?". Cada uma na
              sua sub-aba. */}
          {isAdmin && (
            <TabsContent value="data" className="mt-0">
              <Tabs value={subAba} onValueChange={setSubAba} className="space-y-6">
                <TabsList className="h-auto flex-wrap">
                  <TabsTrigger value="integracoes" className="gap-2">
                    <Plug className="h-4 w-4" />
                    Integrações
                  </TabsTrigger>
                  <TabsTrigger value="convenia" className="gap-2">
                    <KeyRound className="h-4 w-4" />
                    Convenia
                  </TabsTrigger>
                  <TabsTrigger value="reports" className="gap-2">
                    <FileSpreadsheet className="h-4 w-4" />
                    Reports
                  </TabsTrigger>
                </TabsList>

                {/* ------------------------------------------------------------
                    O CONVENIA TINHA CINCO ASSUNTOS NUM CARD SÓ
                    ------------------------------------------------------------
                    516 linhas empilhando diagnóstico de token, sonda de campos,
                    cruzamento de listagens, veredito da série e a carga. Quem
                    vinha rodar a carga do mês atravessava os outros quatro para
                    achar o botão -- e clicou no errado mais de uma vez, porque
                    "Mapear os campos" e "Simular sem gravar" ficavam a uma tela
                    de distância e nenhum dos dois diz no nome o que grava.

                    Aba própria, um card por utilidade, e a carga primeiro: é a
                    única que se usa por rotina. */}
                <TabsContent value="convenia" className="space-y-6 mt-0">
                  <ConveniaSyncCard />
                  <ConveniaTokensCard />
                </TabsContent>

                <TabsContent value="integracoes" className="space-y-6 mt-0">
                  <InhireSyncCard />
                  {/* O Convenia tem aba própria: são cinco utilidades, e
                      empilhá-las aqui é o que tornava esta tela confusa. */}
                  <VinculoCamadaCard />
                  <QohCard />
                  <PesquisaCard />
                  {/* Por ultimo porque nao e rotina: e a pergunta que se faz
                      quando algo parece quebrado sem motivo. */}
                  <MigracoesCard />
                </TabsContent>

                <TabsContent value="reports" className="space-y-6 mt-0">
                  <p className="text-sm text-muted-foreground">
                    As bases que saem daqui para outras áreas — prontas para colar, no formato
                    que quem recebe já usa. O dashboard responde perguntas; estes arquivos
                    alimentam planilhas que não são nossas.
                  </p>
                  <ControladoriaCard />
                  <TalentMobilityBaseCard />
                  <WilLocationCard />
                  <TalentMobilityCard />
                </TabsContent>
              </Tabs>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}
