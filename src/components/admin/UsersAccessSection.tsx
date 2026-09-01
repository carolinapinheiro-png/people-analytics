import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useServerFn } from '@tanstack/react-start';
import {
  UserPlus,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Pencil,
  Search,
  ChevronLeft,
  ChevronRight,
  Eye,
} from 'lucide-react';
import MultiSelect from '@/components/admin/MultiSelect';
import { perfilDeChaves, chavesDoCadastro } from '@/lib/perfil-derivado';
import { entrarVerComo } from '@/components/layout/FaixaVerComo';
import {
  addAllowedEmail,
  removeAllowedEmail,
  updateAllowedEmailUser,
  bulkUpdateAllowedEmails,
  sugerirEscopoPorEmail,
} from '@/lib/access.functions';
import {
  isScopedProfileValue,
  SCOPED_REQUIRES_SCOPE_MESSAGE,
} from '@/lib/access-rules';
import {
  ACCESS_PROFILES,
  PROFILE_LABELS,
  isGlobalProfile,
  JOB_TYPE_FAMILIES,
  JOB_LEVEL_PRESETS,
  RESPONSIBILITY_PRESETS,
  canSeeIndividualData,
  visibleTabs,
  isExtraTab,
  sugerirAbas,
  type AccessProfile,
  type DashboardTab,
} from '@/lib/permissions';

/** Rotulos das abas, para os chips da previa. */
const TAB_LABELS: Record<DashboardTab, string> = {
  overview: 'Overview',
  team: 'Meu Time',
  dei: 'DEI',
  comp: 'Salários',
  demographics: 'Demográficos',
  engagement: 'Experiência',
  span: 'Span',
  attrition: 'Atrição',
  recruitment: 'Recrutamento',
  individual: 'Perfil',
  data: 'Dados',
};

/**
 * As sub-abas que existem, agrupadas pela aba a que pertencem.
 *
 * Uma lista ACHATADA vai para o banco -- os identificadores são únicos --, mas
 * na tela elas precisam do contexto: "Custos & Bandas" sozinho não diz que é
 * de Salários.
 *
 * O ALCANCE DE CADA UMA É DIFERENTE, e a tela diz isso: em Experiência o corte
 * vale no servidor (o dado não entra na resposta); em Salários e Atrição ainda
 * é corte de navegação. Esconder na tela não é esconder.
 */
const SUB_ABAS: Array<{ aba: DashboardTab; id: string; rotulo: string; noServidor: boolean }> = [
  { aba: 'engagement', id: 'engajamento', rotulo: 'Engajamento', noServidor: true },
  { aba: 'engagement', id: 'onboarding', rotulo: 'Onboarding', noServidor: true },
  { aba: 'engagement', id: 'inclusao', rotulo: 'Inclusão & Pertencimento', noServidor: true },
  { aba: 'comp', id: 'custos', rotulo: 'Custos & Bandas', noServidor: true },
  { aba: 'comp', id: 'compratio', rotulo: 'Comp Ratio individual', noServidor: true },
  // Movimentações lê a série mensal do contexto, mas consome UM campo que
  // mais ninguém consome (`raise_events`). O corte existe -- é sobre o campo,
  // não sobre a chamada: quem não pode ver recebe a série sem ele.
  { aba: 'comp', id: 'movimentacoes', rotulo: 'Movimentações', noServidor: true },
  { aba: 'attrition', id: 'desligamentos', rotulo: 'Desligamentos', noServidor: true },
  { aba: 'attrition', id: 'nao-desejada', rotulo: 'Atrição não desejada', noServidor: true },
];

/**
 * Sub-abas que leem exatamente o MESMO dado de uma irmã.
 *
 * Desligamentos e Atrição não desejada são duas leituras da mesma lista de
 * pessoas. Separá-las no servidor exigiria partir a lista em duas por um
 * critério que não existe no dado -- seria inventar uma fronteira para poder
 * defendê-la.
 *
 * Então a tela diz a verdade: marcar uma sem a outra tira do menu, e não
 * protege. Diferente do aviso anterior, que dizia isso de Salários inteiro e
 * já não é mais verdade.
 */
const SUB_ABAS_QUE_COMPARTILHAM_DADO: Record<string, string> = {
  desligamentos: 'Atrição não desejada',
  'nao-desejada': 'Desligamentos',
};

const SUB_ABA_LABEL: Record<string, string> = Object.fromEntries(
  SUB_ABAS.map((s) => [s.id, `${TAB_LABELS[s.aba]} › ${s.rotulo}`]),
);

/**
 * As abas que o cadastro atual produz, em chips.
 *
 * O resumo em texto ja explicava o ESCOPO (quais areas). Nao explicava o
 * ALCANCE (quais telas) -- e "Department Leader" nao deixa obvio que isso
 * inclui salarios e atricao. Chips respondem a pergunta que a frase nao
 * respondia, e marcam o que foi concedido a mais.
 */
function PreviaDeAbas({ form }: { form: UserFormState }) {
  // ------------------------------------------------------------------
  // A PRÉVIA PRECISA DA MESMA QUARTA RESPOSTA QUE O LOGIN USA
  // ------------------------------------------------------------------
  // `visibleTabs` tira a aba `individual` quando a pessoa não vê dado
  // individual -- venha ela do preset ou da lista própria. O menu de verdade
  // (SideNav, TabNavigation) passa esse quarto argumento. Esta prévia não
  // passava, e por isso exibia o chip "Perfil" para quem tem
  // "Nome e salário individuais = Não".
  //
  // O erro é de UMA direção só: a prévia prometia SEMPRE a mais. Quem
  // cadastra marca a aba, vê o chip, salva -- e a pessoa entra sem ela.
  // A tela do admin virava a única fonte de uma permissão que o produto
  // recusa.
  const abas = visibleTabs(
    form.profile, form.extraTabs, form.tabs,
    canSeeIndividualData(form.profile, form.canSeeIndividual),
  );
  return (
    <div className="flex flex-wrap items-center gap-1">
      {abas.map((t) => {
        // Com lista própria, "extra" perde o sentido: não há preset por baixo
        // para algo estar além dele. O chip volta a ser neutro.
        const extra = !form.tabs.length && isExtraTab(form.profile, t);
        return (
          <span
            key={t}
            title={extra ? 'Concedida a esta pessoa, além do perfil' : 'Vem do perfil'}
            className={`rounded-full px-2 py-0.5 text-[11px] ${
              extra
                ? 'bg-primary/15 text-primary font-medium'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {TAB_LABELS[t]}{extra ? ' +' : ''}
          </span>
        );
      })}
      {abas.length === 0 && (
        <span className="text-[11px] text-muted-foreground">Nenhuma aba — a pessoa entra e não vê nada.</span>
      )}
    </div>
  );
}

export interface AllowedEmail {
  id: string;
  email: string;
  role: 'admin' | 'viewer';
  profile: AccessProfile;
  departments: string[];
  job_families: string[];
  job_title: string | null;
  job_level: string | null;
  responsibilities: string[];
  created_at: string;
  extra_tabs?: string[] | null;
  /** Abas DESTA pessoa. Vazio = preset do perfil + extra_tabs. */
  tabs?: string[] | null;
  /** Sub-abas desta pessoa, mesma regra. */
  sub_tabs?: string[] | null;
  can_see_individual?: boolean | null;
  expires_at?: string | null;
  last_login_at?: string | null;
}

export interface DepartmentOption {
  id: string;
  name: string;
  aliases: string[];
  active: boolean;
  /** Na folha de remuneração (`comp_ratio`). `null`/ausente = não medido. */
  pessoas?: number | null;
  /** No headcount do mês mais novo (`dept_data`). Populações diferentes. */
  pessoasHeadcount?: number | null;
}

interface UserFormState {
  profile: AccessProfile;
  departments: string[];
  jobFamilies: string[];
  jobTitle: string;
  jobLevel: string;
  responsibilities: string[];
  /** Abas concedidas alem das do perfil. So SOMA. */
  extraTabs: string[];
  /**
   * A lista DESTA pessoa. Preenchida, substitui o preset e os extras.
   * Ver `visibleTabs`: uma lista manda por vez.
   */
  tabs: string[];
  /** Sub-abas desta pessoa, mesma regra. Achatada entre as abas. */
  subTabs: string[];
  /**
   * As TRÊS chaves que substituíram o seletor de perfil.
   *
   * `profile` continua no estado porque 26 pontos do sistema o consultam --
   * ver `perfil-derivado.ts`. Ele é DERIVADO destas três e nunca escolhido
   * direto: quem edita o cadastro responde as perguntas, não escolhe o
   * rótulo.
   */
  global: boolean;
  admin: boolean;
  individual: boolean;
  /** Derivado de `individual`. Mantido porque é o que vai para o banco. */
  canSeeIndividual: boolean | null;
  /** '' = sem prazo. */
  expiresAt: string;
}

const EMPTY_FORM: UserFormState = {
  profile: 'dept_leader',
  // O padrão é o mais restrito das três: escopado, não administra, não vê
  // individual. Um cadastro salvo sem pensar concede o mínimo.
  global: false,
  admin: false,
  individual: false,
  departments: [],
  jobFamilies: [],
  jobTitle: '',
  jobLevel: '',
  responsibilities: [],
  extraTabs: [],
  tabs: [],
  subTabs: [],
  canSeeIndividual: null,
  expiresAt: '',
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * Traduz o escopo para uma frase.
 *
 * Existe porque "departamentos + familias" e ambiguo em portugues: lido como
 * INTERSECAO ("so quem e das duas coisas") o admin acha que esta restringindo,
 * quando na verdade a regra e UNIAO e ele esta AMPLIANDO o acesso. Numa tela de
 * permissao, errar esse sentido vaza dado -- entao o resumo diz "ou", em texto,
 * antes de salvar.
 */
function accessSummary(form: UserFormState, email: string): string {
  const who = email.trim() || 'A pessoa';
  if (isGlobalProfile(form.profile)) {
    return `${who} vê a empresa inteira, sem recorte de time.`;
  }
  const d = form.departments;
  const f = form.jobFamilies;
  if (d.length === 0 && f.length === 0) {
    return `${who} ainda não vê nada: falta marcar ao menos um departamento ou uma job family.`;
  }
  const partes: string[] = [];
  if (d.length) partes.push(`${d.length === 1 ? 'o departamento' : 'os departamentos'} ${d.join(', ')}`);
  if (f.length) partes.push(`${f.length === 1 ? 'a família' : 'as famílias'} ${f.join(', ')}`);
  // "ou" e nao "e": quem bate em QUALQUER um dos criterios entra no escopo.
  const areas = `${who} vê quem está em ${partes.join(' — ou em — ')}`;
  // O perfil de aba unica precisa dizer isso AQUI. Esta frase e a ultima coisa
  // lida antes de salvar, e "Experiencia -- Engajamento" no seletor nao deixa
  // obvio que TODAS as outras abas ficam de fora.
  const individual = canSeeIndividualData(form.profile, form.canSeeIndividual)
    ? 'Vê nome e salário individuais.'
    : 'Só números agregados, sem nome de pessoa.';

  // O resumo passa a NOMEAR as abas quando há lista própria. Antes ele só
  // sabia falar do caso `engagement_viewer`, e para todo o resto dizia apenas
  // o escopo -- justo agora que a lista de abas é a decisão principal.
  const abas = visibleTabs(
    form.profile, form.extraTabs, form.tabs,
    canSeeIndividualData(form.profile, form.canSeeIndividual),
  );
  if (form.profile === 'engagement_viewer' && form.tabs.length === 0 && form.extraTabs.length === 0) {
    return `${areas} — e só a aba Experiência › Engajamento. Nenhuma outra seção do painel, nem as outras sub-abas de Experiência.`;
  }
  if (form.tabs.length > 0) {
    const nomes = abas.map((t) => TAB_LABELS[t]).join(', ');
    return `${areas} — e só ${abas.length === 1 ? 'a aba' : 'as abas'}: ${nomes || 'nenhuma'}. ${individual}`;
  }
  return `${areas}. ${individual}`;
}

/**
 * Converte o formulario para o formato do servidor.
 *
 * O campo de data devolve 'YYYY-MM-DD', que vira meia-noite UTC -- ou seja, o
 * acesso morreria no COMECO do dia escolhido. Quem digita "31/12" quer o dia
 * 31 inteiro, entao a validade vai para o fim do dia.
 */
function paraEnvio(form: UserFormState) {
  return {
    ...form,
    expiresAt: form.expiresAt ? `${form.expiresAt}T23:59:59` : null,
  };
}

/** Validacao client-side espelhando o trigger do banco. */
function validateForm(form: UserFormState): string | null {
  if (
    isScopedProfileValue(form.profile) &&
    form.departments.length === 0 &&
    form.jobFamilies.length === 0
  ) {
    return SCOPED_REQUIRES_SCOPE_MESSAGE;
  }
  return null;
}

/** Dias inteiros entre uma data e agora. */
function diasDesde(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

const PARADA_DIAS = 60;

function SinaisDaLinha({
  item, departamentos,
}: { item: AllowedEmail; departamentos: DepartmentOption[] }) {
  const inativos = new Set(departamentos.filter((d) => !d.active).map((d) => d.name));
  // O trigger impede ATRIBUIR um departamento inativo, mas nao impede
  // INATIVAR um departamento que ja esta atribuido. Quem foi inativado depois
  // fica apontando para o vazio -- e o efeito e uma tela sem dado nenhum.
  const apontaParaInativo = (item.departments ?? []).filter((d) => inativos.has(d));

  const expira = item.expires_at ? new Date(item.expires_at) : null;
  const vencido = expira ? expira.getTime() <= Date.now() : false;
  const diasSemEntrar = diasDesde(item.last_login_at);

  const sinais: Array<{ texto: string; tom: 'aviso' | 'neutro' }> = [];
  if (apontaParaInativo.length) {
    sinais.push({
      tom: 'aviso',
      texto: `${apontaParaInativo.join(', ')} ${apontaParaInativo.length === 1 ? 'foi inativado' : 'foram inativados'} no catálogo — esta pessoa não vê dados dessa área.`,
    });
  }
  if (expira) {
    sinais.push({
      tom: vencido ? 'aviso' : 'neutro',
      texto: vencido
        ? `Acesso expirou em ${expira.toLocaleDateString('pt-BR')} — a pessoa já não entra.`
        : `Acesso válido até ${expira.toLocaleDateString('pt-BR')}.`,
    });
  }
  if (diasSemEntrar == null) {
    sinais.push({ tom: 'neutro', texto: 'Nunca entrou.' });
  } else if (diasSemEntrar >= PARADA_DIAS) {
    sinais.push({ tom: 'neutro', texto: `Sem entrar há ${diasSemEntrar} dias.` });
  }

  if (!sinais.length) return null;

  return (
    <div className="flex flex-col gap-0.5">
      {sinais.map((sg) => (
        <span
          key={sg.texto}
          className={`text-[11px] ${sg.tom === 'aviso' ? 'text-amber-600 dark:text-amber-500' : 'text-muted-foreground'}`}
        >
          {sg.tom === 'aviso' ? '⚠ ' : ''}{sg.texto}
        </span>
      ))}
    </div>
  );
}

export default function UsersAccessSection({
  emails,
  departments,
  totalCount,
  page,
  totalPages,
  limit,
  search,
  porPerfil,
  profileFilter,
  deptFilter,
  onProfileFilterChange,
  onDeptFilterChange,
  onSearchChange,
  onPageChange,
  onLimitChange,
  onChanged,
}: {
  emails: AllowedEmail[];
  departments: DepartmentOption[];
  totalCount: number;
  page: number;
  totalPages: number;
  limit: number;
  search: string;
  porPerfil: Record<string, number>;
  profileFilter: string;
  deptFilter: string;
  onProfileFilterChange: (v: string) => void;
  onDeptFilterChange: (v: string) => void;
  onSearchChange: (value: string) => void;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
  onChanged: () => void;
}) {
  const [newEmail, setNewEmail] = useState('');
  const [orgAviso, setOrgAviso] = useState('');
  const sugerirFn = useServerFn(sugerirEscopoPorEmail);

  /**
   * Preenche camada N e departamento a partir do organograma.
   *
   * ------------------------------------------------------------------
   * PREENCHE, MAS NAO TRAVA
   * ------------------------------------------------------------------
   * O padrao certo posto sozinho resolve o caso comum -- um lider de area,
   * que enxerga a propria area. Mas HRBP atende varias, e sempre existe a
   * excecao. Travar o campo transformaria a excecao num pedido de suporte.
   *
   * So preenche o que estiver VAZIO: se quem cadastra ja escolheu areas, a
   * busca nao apaga a escolha dele.
   */
  const buscarNoOrganograma = async (email: string) => {
    if (!email.includes('@')) { setOrgAviso(''); return; }
    try {
      const r = await sugerirFn({ data: { email } });
      setOrgAviso(r.motivo ?? '');
      if (!r.encontrado) return;
      // `f.x || sugestao` em todos: a sugestão preenche o que está VAZIO e
      // nunca sobrescreve o que já foi digitado. Quem corrigiu um cargo à mão
      // não pode perdê-lo por trocar uma letra do e-mail.
      setAddForm((f) => ({
        ...f,
        jobLevel: f.jobLevel || (r.camada ?? ''),
        jobTitle: f.jobTitle || (r.cargo ?? ''),
        departments: f.departments.length ? f.departments : (r.departamento ? [r.departamento.toUpperCase()] : []),
      }));
    } catch {
      // Falha aqui nao pode impedir o cadastro -- e so uma sugestao.
      setOrgAviso('');
    }
  };
  const [addForm, setAddForm] = useState<UserFormState>(EMPTY_FORM);
  const [isLoading, setIsLoading] = useState(false);
  /** So mostra o erro depois da primeira mexida no formulario. */
  const [addTouched, setAddTouched] = useState(false);

  /**
   * Remocao com atrito.
   *
   * Era um clique -- ao lado do lapis, no mesmo tamanho, na mesma cor de
   * icone. Tirar o acesso de alguem por engano so aparece quando a pessoa
   * reclama que nao consegue entrar, o que pode levar dias. Digitar o e-mail
   * custa cinco segundos e torna o engano praticamente impossivel.
   */
  const [removendo, setRemovendo] = useState<AllowedEmail | null>(null);
  const [confirmacao, setConfirmacao] = useState('');

  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [loteAberto, setLoteAberto] = useState(false);
  const [loteProfile, setLoteProfile] = useState('');
  const [loteAdd, setLoteAdd] = useState<string[]>([]);
  const [loteRemove, setLoteRemove] = useState<string[]>([]);
  const [loteSalvando, setLoteSalvando] = useState(false);
  const bulkFn = useServerFn(bulkUpdateAllowedEmails);

  const alternarSelecao = (id: string, marcado: boolean) => {
    setSelecionados((s) => {
      const n = new Set(s);
      if (marcado) n.add(id); else n.delete(id);
      return n;
    });
  };

  const selecionarPagina = (marcado: boolean) => {
    setSelecionados((s) => {
      const n = new Set(s);
      for (const e of emails) { if (marcado) n.add(e.id); else n.delete(e.id); }
      return n;
    });
  };

  const aplicarLote = async () => {
    if (!loteProfile && loteAdd.length === 0 && loteRemove.length === 0) {
      toast.error('Escolha ao menos uma mudança para aplicar.');
      return;
    }
    setLoteSalvando(true);
    try {
      const r = await bulkFn({ data: {
        ids: [...selecionados],
        profile: loteProfile ? (loteProfile as AccessProfile) : undefined,
        addDepartments: loteAdd,
        removeDepartments: loteRemove,
      } });
      // Sucesso parcial e o desfecho comum: alguem do lote pode ficar sem
      // escopo com a mudanca. Dizer so "pronto" esconderia isso.
      if (r.recusados.length) {
        toast.warning(
          `${r.aplicados.length} atualizado(s); ${r.recusados.length} recusado(s): ` +
          r.recusados.map((x) => x.email).join(', '),
        );
      } else {
        toast.success(`${r.aplicados.length} usuário(s) atualizado(s).`);
      }
      setLoteAberto(false);
      setSelecionados(new Set());
      setLoteProfile(''); setLoteAdd([]); setLoteRemove([]);
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e, 'Falha ao aplicar em lote'));
    } finally {
      setLoteSalvando(false);
    }
  };

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<UserFormState>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);

  const addAllowedEmailFn = useServerFn(addAllowedEmail);
  const removeAllowedEmailFn = useServerFn(removeAllowedEmail);
  const updateAllowedEmailUserFn = useServerFn(updateAllowedEmailUser);

  const activeDepartments = departments.filter((d) => d.active).map((d) => d.name);
  /**
   * Quantas pessoas cada área alcança. Ver `getDepartments`: o catálogo e a
   * base de pessoas se separaram, e atribuir alguém a uma área vazia salva
   * sem erro e entrega um painel em branco.
   */
  const alcancePorArea = new Map(
    departments.map((d) => [d.name, {
      folha: d.pessoas ?? null,
      headcount: d.pessoasHeadcount ?? null,
    }] as const),
  );
  const editingUser = emails.find((e) => e.id === editingId) ?? null;

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) return;

    const validationError = validateForm(addForm);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setIsLoading(true);
    try {
      await addAllowedEmailFn({
        data: { email: newEmail.trim(), ...paraEnvio(addForm) },
      });
      toast.success('Email autorizado com sucesso');
      setNewEmail('');
      setAddForm(EMPTY_FORM);
      setAddTouched(false);
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error, 'Erro ao adicionar email'));
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemove = async () => {
    if (!removendo) return;
    try {
      await removeAllowedEmailFn({ data: { id: removendo.id } });
      toast.success(`Acesso de ${removendo.email} removido`);
      setRemovendo(null);
      setConfirmacao('');
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error, 'Erro ao remover email'));
      console.error(error);
    }
  };

  const openEdit = (item: AllowedEmail) => {
    setEditingId(item.id);
    setEditForm({
      profile: item.profile,
      departments: item.departments ?? [],
      jobFamilies: item.job_families ?? [],
      jobTitle: item.job_title ?? '',
      jobLevel: item.job_level ?? '',
      responsibilities: item.responsibilities ?? [],
      extraTabs: item.extra_tabs ?? [],
      tabs: item.tabs ?? [],
      subTabs: item.sub_tabs ?? [],
      // Traduz o cadastro antigo para as três chaves. Um cadastro gravado
      // como 'hrbp' abre com Alcance=áreas, Individual=sim, Admin=não -- que
      // é exatamente o que ele já era.
      ...chavesDoCadastro(item.profile, item.can_see_individual),
      canSeeIndividual: chavesDoCadastro(item.profile, item.can_see_individual).individual,
      // O input de data quer 'YYYY-MM-DD'; o banco guarda timestamptz.
      expiresAt: item.expires_at ? String(item.expires_at).slice(0, 10) : '',
    });
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;

    const validationError = validateForm(editForm);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setIsSaving(true);
    try {
      await updateAllowedEmailUserFn({ data: { id: editingId, ...paraEnvio(editForm) } });
      toast.success('Usuário atualizado');
      setEditingId(null);
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error, 'Erro ao atualizar usuário'));
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  const addValidationError = validateForm(addForm);
  const editValidationError = editingId ? validateForm(editForm) : null;

  return (
    <div className="space-y-6">
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
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground" htmlFor="new-user-email">
                E-mail
              </Label>
              <Input
                id="new-user-email"
                type="email"
                placeholder="nome@nsx.bet"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                onBlur={(e) => void buscarNoOrganograma(e.target.value.trim())}
                required
                className="max-w-md"
              />
              <p className="text-[11px] text-muted-foreground">
                Ao sair do campo, cargo, camada N e departamento vêm do organograma do Convenia.
              </p>
              {orgAviso && (
                <p className="text-[11px] text-amber-600 dark:text-amber-500 max-w-md">{orgAviso}</p>
              )}
            </div>

            <UserAccessFormFields
              idSuffix="add"
              value={addForm}
              onChange={(next) => {
                setAddTouched(true);
                setAddForm(next);
              }}
              departmentOptions={activeDepartments}
              alcancePorArea={alcancePorArea}
              validationError={addValidationError}
              showError={addTouched}
              emailPreview={newEmail}
            />

            {/* Acao no FIM do formulario, com o motivo do bloqueio do lado.
                Antes o botao ficava no topo: a pessoa clicava, nada acontecia,
                e a explicacao estava a uma rolagem inteira de distancia. */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
              <Button type="submit" disabled={isLoading || !!addValidationError || !newEmail.trim()}>
                {isLoading ? 'Adicionando...' : 'Adicionar usuário'}
              </Button>
              {!newEmail.trim() ? (
                <span className="text-xs text-muted-foreground">Informe o e-mail para continuar.</span>
              ) : addValidationError ? (
                <span className="text-xs text-destructive">{addValidationError}</span>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-lg">Usuários autorizados</CardTitle>
              <CardDescription>
                {totalCount} usuário{totalCount !== 1 ? 's' : ''} com acesso
                {search ? ` · filtrado por "${search}"` : ''}
              </CardDescription>
            </div>
            <div className="relative max-w-xs w-full">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Buscar por email ou cargo..."
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {/* ------------------------------------------------------------------
              OS CONTADORES SAO O FILTRO
              ------------------------------------------------------------------
              Buscar por e-mail so ajuda quem ja sabe o e-mail. As perguntas
              reais sao "quem sao os dept leaders?" e "quem enxerga
              COMMERCIAL?" -- e a resposta da primeira ja esta na tela como
              numero. Clicar nela filtra: o caminho mais curto entre a duvida
              e a lista.

              A contagem vem da base INTEIRA, nao do filtro. Um contador que
              encolhe junto com o filtro deixa de responder "como esta a
              distribuicao", que e para o que ele serve.
          ------------------------------------------------------------------ */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            {ACCESS_PROFILES.filter((p) => (porPerfil[p] ?? 0) > 0).map((p) => {
              const ativo = profileFilter === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => onProfileFilterChange(ativo ? '' : p)}
                  aria-pressed={ativo}
                  className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                    ativo
                      ? 'border-primary bg-primary/10 text-foreground font-medium'
                      : 'border-border text-muted-foreground hover:text-foreground hover:bg-secondary'
                  }`}
                >
                  {PROFILE_LABELS[p]} · {porPerfil[p]}
                </button>
              );
            })}

            <select
              value={deptFilter}
              onChange={(e) => onDeptFilterChange(e.target.value)}
              className="ml-auto rounded border border-border bg-secondary px-2 py-1 text-[11px]"
              aria-label="Filtrar por departamento atendido"
            >
              <option value="">Todos os departamentos</option>
              {departments.filter((d) => d.active).map((d) => (
                <option key={d.name} value={d.name}>{d.name}</option>
              ))}
            </select>

            {(profileFilter || deptFilter) && (
              <button
                type="button"
                onClick={() => { onProfileFilterChange(''); onDeptFilterChange(''); }}
                className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                limpar filtros
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {/* ------------------------------------------------------------------
              LOTE
              ------------------------------------------------------------------
              A selecao vale so para a PAGINA VISIVEL, de proposito. Um
              "selecionar todos os 120" com filtro ligado e a forma classica de
              alguem trocar o perfil de gente que nunca viu na tela -- e a
              acao aqui concede acesso.
          ------------------------------------------------------------------ */}
          {emails.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px]">
              <label className="flex items-center gap-1.5 text-muted-foreground">
                <input
                  type="checkbox"
                  checked={emails.length > 0 && emails.every((e) => selecionados.has(e.id))}
                  onChange={(e) => selecionarPagina(e.target.checked)}
                />
                Selecionar os {emails.length} desta página
              </label>
              {selecionados.size > 0 && (
                <>
                  <span className="font-medium">{selecionados.size} selecionado{selecionados.size > 1 ? 's' : ''}</span>
                  <Button size="sm" variant="outline" className="h-7" onClick={() => setLoteAberto(true)}>
                    Editar em lote
                  </Button>
                  <button
                    type="button"
                    onClick={() => setSelecionados(new Set())}
                    className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  >
                    limpar seleção
                  </button>
                </>
              )}
            </div>
          )}

          <div className="space-y-2">
            {emails.map((item) => (
              <div
                key={item.id}
                className="flex items-start justify-between p-3 rounded-lg border border-border bg-card gap-4"
              >
                <input
                  type="checkbox"
                  checked={selecionados.has(item.id)}
                  onChange={(e) => alternarSelecao(item.id, e.target.checked)}
                  aria-label={`Selecionar ${item.email}`}
                  className="mt-1 shrink-0"
                />
                <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium truncate">{item.email}</span>
                    <Badge variant={item.profile === 'admin' ? 'default' : 'secondary'}>
                      {isGlobalProfile(item.profile) ? (
                        <ShieldCheck className="h-3 w-3 mr-1" />
                      ) : (
                        <ShieldAlert className="h-3 w-3 mr-1" />
                      )}
                      {PROFILE_LABELS[item.profile] ?? item.profile}
                    </Badge>
                    {(item.job_title || item.job_level) && (
                      <Badge variant="outline">
                        {[item.job_title, item.job_level].filter(Boolean).join(' · ')}
                      </Badge>
                    )}
                  </div>
                  {!isGlobalProfile(item.profile) && (
                    <span className="text-xs text-muted-foreground">
                      {(item.departments?.length || item.job_families?.length)
                        ? [...(item.departments ?? []), ...(item.job_families ?? [])].join(' · ')
                        : 'Sem escopo atribuído — sem acesso a dados'}
                    </span>
                  )}

                  {/* ------------------------------------------------------
                      SINAIS QUE SO APARECEM SE ALGUEM OLHAR
                      ------------------------------------------------------
                      Departamento inativado, validade vencida e conta parada
                      sao os tres jeitos de um cadastro apodrecer sem avisar.
                      Nenhum deles gera erro; todos produzem uma pessoa que
                      "nao esta vendo nada" e nao sabe por que. */}
                  <SinaisDaLinha item={item} departamentos={departments} />
                  {item.responsibilities?.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {item.responsibilities.map((r) => (
                        <span
                          key={r}
                          className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                        >
                          {r}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {/* "Ver como" mora AQUI, e nao num seletor solto, porque
                      esta e a unica tela em que o escopo da pessoa esta a
                      vista. Conferir o que alguem enxerga so quer dizer
                      alguma coisa se der para ler, na mesma linha, o que
                      esperavamos que ela enxergasse. */}
                  <Button
                    variant="ghost"
                    size="icon"
                    title={`Ver o painel como ${item.email}`}
                    aria-label={`Ver o painel como ${item.email}`}
                    onClick={() => entrarVerComo(item.email)}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(item)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => { setRemovendo(item); setConfirmacao(''); }}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            {emails.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                {search ? 'Nenhum usuário encontrado para esta busca.' : 'Nenhum email autorizado ainda.'}
              </p>
            )}
          </div>

          {totalCount > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 pt-4 border-t border-border">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>
                  Página {page} de {totalPages}
                </span>
                <span className="hidden sm:inline">·</span>
                <span className="flex items-center gap-1">
                  <select
                    value={limit}
                    onChange={(e) => onLimitChange(Number(e.target.value))}
                    className="h-7 rounded-md border border-input bg-background px-2 text-xs"
                    aria-label="Itens por página"
                  >
                    {[10, 20, 50].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  por página
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onPageChange(page - 1)}
                  disabled={page <= 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span className="sr-only">Anterior</span>
                </Button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <Button
                    key={p}
                    variant={p === page ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => onPageChange(p)}
                    className="min-w-[2.25rem]"
                  >
                    {p}
                  </Button>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onPageChange(page + 1)}
                  disabled={page >= totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                  <span className="sr-only">Próxima</span>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Remocao com confirmacao digitada. Ver a nota no estado `removendo`. */}
      {/* ------------------------------------------------------------------
          LOTE: SOMA E TIRA, NAO SUBSTITUI
          ------------------------------------------------------------------
          Um campo "departamentos" que substitui apagaria o escopo de todos
          para igualar ao de nenhum -- as pessoas do lote tem escopos
          diferentes, e e por isso que estao sendo editadas juntas. Somar e
          tirar sao as duas operacoes que fazem sentido sobre um conjunto
          heterogeneo.
      ------------------------------------------------------------------ */}
      <Dialog open={loteAberto} onOpenChange={setLoteAberto}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar {selecionados.size} usuário(s)</DialogTitle>
            <DialogDescription>
              O que ficar em branco não é alterado. Departamentos são somados ou
              retirados do que cada pessoa já tem — não substituem.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="lote-perfil">Trocar alcance e dado individual</Label>
              {/* ------------------------------------------------------------------
                  A MESMA LINGUAGEM DO CADASTRO INDIVIDUAL
                  ------------------------------------------------------------------
                  Aqui dizia "Trocar perfil" e listava os cinco rótulos -- ou
                  seja, a competição entre perfil e campos voltava pela porta
                  dos fundos, num lugar que mexe em VÁRIAS pessoas de uma vez.

                  As opções agora dizem o que fazem. São as quatro combinações
                  que os rótulos internos representam; `engagement_viewer`
                  saiu porque ele nunca foi uma combinação -- era uma lista de
                  abas, que não se troca em lote sem olhar caso a caso. */}
              <select
                id="lote-perfil"
                value={loteProfile}
                onChange={(e) => setLoteProfile(e.target.value)}
                className="w-full rounded border border-border bg-secondary px-2 py-1.5 text-sm"
              >
                <option value="">— não mexer —</option>
                <option value="admin">Empresa toda · vê individual · administra usuários</option>
                <option value="hr_leader">Empresa toda · vê individual</option>
                <option value="hrbp">Só as áreas atribuídas · vê individual</option>
                <option value="dept_leader">Só as áreas atribuídas · só agregados</option>
              </select>
              <p className="text-[11px] text-muted-foreground">
                Não mexe nas abas de cada pessoa — só no alcance, no dado individual e em
                administrar. As abas continuam como estão em cada cadastro.
              </p>
            </div>

            <MultiSelect
              id="lote-add"
              label="Somar departamentos"
              options={departments.filter((d) => d.active).map((d) => d.name)}
              value={loteAdd}
              onChange={setLoteAdd}
              placeholder="Nenhum"
              searchPlaceholder="Buscar departamento..."
            />
            <MultiSelect
              id="lote-remove"
              label="Tirar departamentos"
              options={departments.map((d) => d.name)}
              value={loteRemove}
              onChange={setLoteRemove}
              placeholder="Nenhum"
              searchPlaceholder="Buscar departamento..."
            />

            <p className="rounded-md bg-secondary/60 p-2 text-[11px] text-muted-foreground">
              Quem ficar com perfil restrito e nenhuma área é <strong>recusado</strong>,
              não salvo pela metade — e você vê a lista de quem foi.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setLoteAberto(false)}>Cancelar</Button>
            <Button onClick={aplicarLote} disabled={loteSalvando}>
              {loteSalvando ? 'Aplicando…' : `Aplicar a ${selecionados.size}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!removendo} onOpenChange={(open) => { if (!open) { setRemovendo(null); setConfirmacao(''); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remover acesso</DialogTitle>
            <DialogDescription>
              {removendo?.email} perde o acesso ao painel imediatamente.
            </DialogDescription>
          </DialogHeader>

          {removendo && (
            <div className="space-y-3">
              <div className="rounded-md bg-muted/50 p-2.5 space-y-1.5">
                <p className="text-xs text-muted-foreground">O que essa pessoa deixa de ver:</p>
                <PreviaDeAbas
                  form={{
                    ...EMPTY_FORM,
                    profile: removendo.profile,
                    extraTabs: removendo.extra_tabs ?? [],
                    tabs: removendo.tabs ?? [],
                    subTabs: removendo.sub_tabs ?? [],
                  }}
                />
                {(removendo.departments?.length || removendo.job_families?.length) ? (
                  <p className="text-[11px] text-muted-foreground">
                    Escopo: {[...(removendo.departments ?? []), ...(removendo.job_families ?? [])].join(' · ')}
                  </p>
                ) : null}
              </div>

              <div className="space-y-1">
                <Label htmlFor="confirma-remocao" className="text-xs">
                  Digite <strong>{removendo.email}</strong> para confirmar
                </Label>
                <Input
                  id="confirma-remocao"
                  value={confirmacao}
                  onChange={(e) => setConfirmacao(e.target.value)}
                  placeholder={removendo.email}
                  autoComplete="off"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setRemovendo(null); setConfirmacao(''); }}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={confirmacao.trim().toLowerCase() !== (removendo?.email ?? '').toLowerCase()}
              onClick={handleRemove}
            >
              Remover acesso
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingId} onOpenChange={(open) => !open && setEditingId(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar acesso</DialogTitle>
            <DialogDescription>{editingUser?.email}</DialogDescription>
          </DialogHeader>
          <UserAccessFormFields
            idSuffix="edit"
            value={editForm}
            onChange={setEditForm}
            departmentOptions={activeDepartments}
            alcancePorArea={alcancePorArea}
            validationError={editValidationError}
            emailPreview={editingUser?.email}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingId(null)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit} disabled={isSaving || !!editValidationError}>
              {isSaving ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function UserAccessFormFields({
  idSuffix,
  value,
  onChange,
  departmentOptions,
  alcancePorArea,
  validationError,
  /** Erro so aparece depois que a pessoa mexeu: o form nasce em dept_leader
   *  (perfil que exige escopo), entao antes a tela abria ja em vermelho,
   *  culpando o usuario por nao ter feito nada ainda. */
  showError = true,
  /** Email digitado, so para o resumo falar "fulano ve X" em vez de "A pessoa". */
  emailPreview,
}: {
  idSuffix: string;
  value: UserFormState;
  onChange: (next: UserFormState) => void;
  departmentOptions: string[];
  alcancePorArea: Map<string, { folha: number | null; headcount: number | null }>;
  validationError: string | null;
  showError?: boolean;
  emailPreview?: string;
}) {
  const patch = (partial: Partial<UserFormState>) => onChange({ ...value, ...partial });

  /**
   * Mexer numa chave recalcula o `profile` e o `canSeeIndividual`.
   *
   * Os dois são DERIVADOS -- ninguém os edita direto. Recalcular aqui, e não
   * na hora de salvar, faz a prévia de abas e os avisos reagirem na mesma
   * hora: quem liga "vê a empresa toda" vê o chip de Dados aparecer.
   */
  const patchChave = (partial: Partial<Pick<UserFormState, 'global' | 'admin' | 'individual'>>) => {
    const pedido = {
      global: value.global, admin: value.admin, individual: value.individual, ...partial,
    };
    // ADMIN IMPLICA ALCANCE TOTAL, e o código faz o que o aviso diz.
    //
    // Sem isto, "administra usuários" ligado com alcance por área produzia
    // `perfilDeChaves` -> 'dept_leader', ou seja, o interruptor de admin
    // ficava ligado na tela e sumia ao salvar. Um controle que se desfaz
    // sozinho é pior que um controle ausente.
    //
    // Quem administra o cadastro consegue se dar qualquer acesso de qualquer
    // forma; fingir que existe um admin de uma área só seria teatro.
    const chaves = pedido.admin ? { ...pedido, global: true } : pedido;
    onChange({
      ...value,
      ...chaves,
      profile: perfilDeChaves(chaves),
      canSeeIndividual: chaves.individual,
    });
  };

  const CHAVES: Array<{
    campo: 'global' | 'admin' | 'individual';
    titulo: string;
    sim: string;
    nao: string;
  }> = [
    {
      campo: 'global',
      titulo: 'Alcance',
      sim: 'A empresa toda',
      nao: 'Só as áreas atribuídas',
    },
    {
      campo: 'individual',
      titulo: 'Nome e salário individuais',
      sim: 'Vê pessoa a pessoa',
      nao: 'Só números agregados',
    },
    {
      campo: 'admin',
      titulo: 'Administra usuários',
      sim: 'Pode cadastrar e remover acessos',
      nao: 'Não administra',
    },
  ];
  const levelListId = `job-levels-${idSuffix}`;
  // Salarios so aparece por concessao individual desde 14/08/2026 -- e quando
  // aparece, o Level deixa de ser decorativo e passa a decidir o recorte.
  // `value.tabs` entra: sem ele, o aviso da camada N seguiria o preset do
  // perfil e mentiria para quem tem lista própria -- nos dois sentidos.
  const podeIndividual = canSeeIndividualData(value.profile, value.canSeeIndividual);
  const isCompVisivel = visibleTabs(
    value.profile, value.extraTabs, value.tabs, podeIndividual,
  ).includes('comp');

  return (
    <div className="space-y-4">
      {/* ==================================================================
          A ORDEM DA TELA É A ORDEM DAS DECISÕES
          ==================================================================
          O perfil vinha espremido numa grade de três colunas, com a descrição
          quebrando em quatro linhas num espaço estreito -- e ele é a PRIMEIRA
          decisão, a que muda todo o resto do formulário.

          Pior: o escopo (departamentos) ficava no fim, DEPOIS de tudo, e a
          mensagem de erro que exige o escopo aparecia lá embaixo. Quem
          preenchia de cima para baixo terminava o formulário para então
          descobrir que faltava o campo obrigatório.

          Agora: quem é (cargo e camada, que vêm sozinhos do e-mail) -> quem
          é no painel (as três chaves) -> o que alcança (escopo) -> o que vê
          (abas).

          Cargo e camada tinham DESCIDO nesta ordem, com o argumento de que não
          são a primeira pergunta. O argumento envelheceu no dia em que eles
          passaram a se preencher sozinhos ao sair do campo de e-mail: um campo
          que se preenche a dois terços de rolagem do gesto que o preencheu não
          é lido como automático, é lido como não tendo acontecido. Subiram de
          volta, agora por um motivo melhor -- o efeito ao alcance da vista da
          causa.
      ================================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Cargo</Label>
          <Input
            placeholder="Ex.: HRBP, Tech Lead"
            value={value.jobTitle}
            maxLength={80}
            onChange={(e) => patch({ jobTitle: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground" htmlFor={levelListId}>Camada N</Label>
          {/* ------------------------------------------------------------------
              LISTA FECHADA, E NAO MAIS TEXTO LIVRE
              ------------------------------------------------------------------
              Este campo era decorativo -- ninguem lia. Desde 14/08/2026 ele
              decide, na aba de Salarios, ate que degrau a pessoa enxerga
              remuneracao.
              Com texto livre, "Diretor" em vez de "Director" nao daria erro
              nenhum: o nivel simplesmente nao seria reconhecido, e a pessoa
              abriria a aba sem ver ninguem. O suporte diria "esta sem dado".
          ------------------------------------------------------------------ */}
          <select
            id={levelListId}
            value={value.jobLevel}
            onChange={(e) => patch({ jobLevel: e.target.value })}
            className="w-full rounded border border-border bg-secondary px-2 py-1.5 text-sm"
          >
            <option value="">— não definida —</option>
            {JOB_LEVEL_PRESETS.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
          {isCompVisivel && !value.jobLevel && (
            <p className="text-[11px] text-amber-600 dark:text-amber-500">
              Sem a camada N, esta pessoa abre a aba de Salários e não vê ninguém.
            </p>
          )}
        </div>
      </div>

      {/* ==================================================================
          TRÊS PERGUNTAS NO LUGAR DE UM SELETOR DE PERFIL
          ==================================================================
          Os cinco perfis, postos lado a lado, codificavam exatamente estas
          três respostas mais uma lista de abas -- ver `perfil-derivado.ts`.
          Admin e HR Leader diferiam só em "administra usuários"; HRBP e
          Department Leader, só em "vê dado individual".

          Então escolher um perfil e depois ajustar os campos ao lado era
          responder a mesma pergunta duas vezes, em dois lugares, com o
          segundo vencendo em silêncio. Agora as perguntas são as perguntas.
      ================================================================== */}
      <div className="space-y-2">
        {CHAVES.map((c) => (
          <div key={c.campo} className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <Label className="text-xs">{c.titulo}</Label>
              <p className="text-[11px] text-muted-foreground">
                {value[c.campo] ? c.sim : c.nao}
              </p>
            </div>
            <div className="flex gap-1 rounded-md bg-muted p-0.5">
              {[false, true].map((v) => (
                <button
                  key={String(v)}
                  type="button"
                  onClick={() => patchChave({ [c.campo]: v })}
                  className={`rounded px-2.5 py-1 text-[12px] ${
                    value[c.campo] === v
                      ? 'bg-background shadow-sm font-medium'
                      : 'text-muted-foreground'
                  }`}
                >
                  {v ? 'Sim' : 'Não'}
                </button>
              ))}
            </div>
          </div>
        ))}
        {value.admin && !value.global && (
          <p className="text-[11px] text-amber-600 dark:text-amber-500">
            Quem administra usuários alcança todo mundo pelo cadastro de qualquer forma — por isso
            ligar isto também liga o alcance à empresa toda.
          </p>
        )}
      </div>

      {isScopedProfileValue(value.profile) && (
        <div className="space-y-3 rounded-lg border border-border p-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* ------------------------------------------------------------------
                O NOME DA ÁREA NÃO DIZ SE ELA ALCANÇA ALGUÉM
                ------------------------------------------------------------------
                Três áreas ativas do catálogo -- CW GROUP, PORTO e TECHNOLOGY
                GROUP -- não batem com uma pessoa sequer. Escolher uma delas
                salva sem erro e entrega um painel vazio, e quem cadastrou
                conclui que a área está sem dado.

                O número entra no rótulo de cada opção, e um aviso aparece
                quando o que ficou marcado alcança zero. Nada é removido da
                lista: uma área pode estar vazia hoje e receber gente amanhã.
            ------------------------------------------------------------------ */}
            <MultiSelect
              id={`dept-${idSuffix}`}
              label="Departamentos atendidos"
              options={departmentOptions}
              labels={Object.fromEntries(departmentOptions.map((d) => {
                const a = alcancePorArea.get(d);
                if (!a || (a.folha == null && a.headcount == null)) return [d, d];
                const f = a.folha ?? 0;
                const h = a.headcount ?? 0;
                if (!f && !h) return [d, `${d} · ninguém em nenhuma das duas bases`];
                // Os dois números quando divergem: são populações diferentes,
                // e a diferença diz em QUE abas a área alcança gente.
                if (f && h && f !== h) return [d, `${d} · ${h} no headcount, ${f} na folha`];
                if (!f) return [d, `${d} · ${h} no headcount, ninguém na folha`];
                if (!h) return [d, `${d} · ${f} na folha, ninguém no headcount`];
                return [d, `${d} · ${f} pessoas`];
              }))}
              value={value.departments}
              onChange={(departments) => patch({ departments })}
              placeholder="Selecionar departamentos"
              searchPlaceholder="Buscar departamento..."
            />
            <MultiSelect
              id={`fam-${idSuffix}`}
              label="Job type families atendidas"
              options={JOB_TYPE_FAMILIES}
              value={value.jobFamilies}
              onChange={(jobFamilies) => patch({ jobFamilies })}
              placeholder="Selecionar famílias"
              searchPlaceholder="Buscar família..."
            />
          </div>

          {/* Resumo do efeito. Fica SEMPRE visivel -- antes a explicacao da
              uniao era trocada pela mensagem de erro, ou seja, sumia justo
              quando a pessoa mais precisava dela. */}
          <div className="rounded-md bg-muted/50 p-2.5 space-y-1">
            <p className="text-xs">
              <Eye className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5 text-muted-foreground" />
              {accessSummary(value, emailPreview ?? '')}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Departamento <strong>ou</strong> família: quem bate em qualquer um dos dois entra no
              escopo. Marcar os dois <em>amplia</em> o acesso, não restringe.
            </p>
          </div>

          {(() => {
            // Só acende quando a área não alcança ninguém em NENHUMA das duas
            // bases. Zero na folha e 18 no headcount é o caso do PORTO, e
            // dizer "não alcança ninguém" ali seria falso.
            const vazias = value.departments.filter((d) => {
              const a = alcancePorArea.get(d);
              return a && (a.folha ?? 0) === 0 && (a.headcount ?? 0) === 0;
            });
            if (!vazias.length) return null;
            return (
              <p className="text-[11px] text-amber-600 dark:text-amber-500">
                <strong>{vazias.join(', ')}</strong>{' '}
                {vazias.length === 1 ? 'não alcança' : 'não alcançam'} ninguém na base hoje. O
                cadastro salva assim mesmo, mas{' '}
                {value.jobFamilies.length
                  ? 'quem entrar vai ver só o que vier pelas job families.'
                  : 'quem entrar vai abrir o painel em branco — e vai parecer falta de dado, não de escopo.'}
              </p>
            );
          })()}

          {showError && validationError && (
            <p className="text-[11px] text-destructive flex items-center gap-1.5">
              <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
              {validationError}
            </p>
          )}
        </div>
      )}

      {/* ==================================================================
          "RESPONSABILIDADES" ERA A LISTA DE ABAS COM OUTRO NOME
          ==================================================================
          Eram dois seletores na mesma tela: oito "responsabilidades" e nove
          abas. Chegou como "esses dois são a mesma coisa, não?" -- e eram.

          Só que a simetria era falsa, e essa é a parte ruim:
          `responsibilities` é gravado no banco e NÃO decide nada. Nenhum ponto
          do produto consulta o campo. Ele alimentava um botão só -- "sugerir
          pelas responsabilidades" -- que copiava abas para a lista ao lado.
          Marcar "Comp & Ben" e não clicar no botão não liberava Salários, mas
          a tela deixava supor que sim.

          É o mesmo defeito dos cinco perfis que saíram daqui: duas perguntas
          para a mesma decisão, uma delas parecendo mandar sem mandar.

          O atalho era útil e ficou -- virou botão dentro da caixa de abas, que
          é onde a decisão mora. Soma ao que já está marcado, nunca substitui,
          e não aplica sozinho. A coluna do banco continua: o formulário
          devolve o valor que leu, então quem já tem responsabilidades gravadas
          não perde nada.
      ================================================================== */}
      <div className="space-y-3 rounded-lg border border-border p-3">
        <Label className="text-xs">O que esta pessoa vai ver</Label>

        <PreviaDeAbas form={value} />

        {/* ==================================================================
            UMA PERGUNTA, UM CONTROLE
            ==================================================================
            Aqui havia TRÊS seletores -- "abas desta pessoa", "abas concedidas
            além do perfil" e "sub-abas" --, todos respondendo à mesma
            pergunta: o que essa pessoa vê. Cada um com o seu texto de apoio
            explicando como interagia com os outros.

            Chegou como "não consigo escolher o perfil e entender essa tela", e
            estava certo: a regra por baixo é "uma lista manda por vez", e a
            tela mostrava as duas listas ao mesmo tempo pedindo que a pessoa
            fizesse a conta.

            Agora é uma escolha (seguir o perfil ou não) e uma lista. As abas
            concedidas saíram da tela: ninguém as usa, elas continuam
            funcionando para quem já tiver, e o mesmo efeito se obtém marcando
            a aba na lista.
        ================================================================== */}
        <div className="flex gap-1 rounded-md bg-muted p-0.5 w-fit">
          {([
            ['perfil', 'Segue o perfil'],
            ['proprias', 'Escolher abas'],
          ] as const).map(([modo, rotulo]) => {
            const ativo = modo === 'proprias' ? value.tabs.length > 0 : value.tabs.length === 0;
            return (
              <button
                key={modo}
                type="button"
                onClick={() => patch({
                  // Ao personalizar, começa do preset do perfil em vez de
                  // vazio: quem clica quer AJUSTAR, não recomeçar. Lista
                  // vazia significaria "segue o perfil" e o botão pareceria
                  // não funcionar.
                  tabs: modo === 'proprias'
                    ? visibleTabs(value.profile, value.extraTabs, null, podeIndividual)
                    : [],
                  subTabs: modo === 'proprias' ? value.subTabs : [],
                })}
                className={`rounded px-2.5 py-1 text-[12px] ${
                  ativo ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground'
                }`}
              >
                {rotulo}
              </button>
            );
          })}
        </div>

        {/* Os atalhos só existem no modo em que há lista para atalhar. Em
            "Segue o perfil" eles não teriam onde escrever. */}
        {value.tabs.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[11px] text-muted-foreground mr-0.5">Atalhos:</span>
            {RESPONSIBILITY_PRESETS.map((r) => {
              const sugeridas = sugerirAbas([r])
                .filter((t) => podeIndividual || t !== 'individual');
              const jaTem = sugeridas.every((t) => value.tabs.includes(t));
              return (
                <button
                  key={r}
                  type="button"
                  disabled={jaTem || !sugeridas.length}
                  // Soma, nunca substitui: quem clica quer acrescentar um
                  // pedaço, não recomeçar a lista que acabou de ajustar.
                  onClick={() => patch({
                    tabs: [...new Set([...value.tabs, ...sugeridas])],
                    // O atalho é conveniência de quem cadastra, mas também é a
                    // melhor descrição do PAPEL da pessoa que a tela tem.
                    // Gravar mantém a coluna viva e o histórico legível.
                    responsibilities: [...new Set([...value.responsibilities, r])],
                  })}
                  title={sugeridas.length
                    ? `Acrescenta: ${sugeridas.map((t) => TAB_LABELS[t]).join(', ')}`
                    : 'Nada a acrescentar com as chaves atuais'}
                  className={`rounded-full border px-2 py-0.5 text-[11px] ${
                    jaTem
                      ? 'border-border/50 text-muted-foreground/50'
                      : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/40'
                  }`}
                >
                  {r}
                </button>
              );
            })}
          </div>
        )}

        {value.tabs.length > 0 && (
          <MultiSelect
            id={`tabs-proprias-${idSuffix}`}
            label="Abas"
            // Oferecer `individual` a quem está marcado como "só números
            // agregados" é pedir uma decisão que o produto vai ignorar.
            options={Object.keys(TAB_LABELS).filter((t) => podeIndividual || t !== 'individual')}
            labels={TAB_LABELS}
            value={value.tabs}
            onChange={(tabs) => patch({ tabs })}
            placeholder="Nenhuma — a pessoa entra e não vê nada"
            searchPlaceholder="Buscar aba..."
          />
        )}

        {/* ------------------------------------------------------------------
            SUB-ABAS
            ------------------------------------------------------------------
            Só das abas que a pessoa realmente vê: oferecer "Onboarding" a quem
            não tem Experiência é pedir uma decisão que não existe. */}
        {(() => {
          const abasVisiveis = visibleTabs(
            value.profile, value.extraTabs, value.tabs, podeIndividual,
          );
          const disponiveis = SUB_ABAS.filter((sb) => abasVisiveis.includes(sb.aba));
          if (!disponiveis.length) return null;
          const parPartido = disponiveis.filter(
            (sb) => SUB_ABAS_QUE_COMPARTILHAM_DADO[sb.id]
              && value.subTabs.includes(sb.id)
              && !value.subTabs.includes(
                disponiveis.find((x) => x.rotulo === SUB_ABAS_QUE_COMPARTILHAM_DADO[sb.id])?.id ?? '',
              ),
          );
          return (
            <>
              <MultiSelect
                id={`subtabs-${idSuffix}`}
                label="Sub-abas (opcional)"
                options={disponiveis.map((sb) => sb.id)}
                labels={SUB_ABA_LABEL}
                value={value.subTabs}
                onChange={(subTabs) => patch({ subTabs })}
                placeholder="Vazio = todas"
                searchPlaceholder="Buscar sub-aba..."
              />
              {parPartido.length > 0 && (
                <p className="text-[11px] text-amber-600 dark:text-amber-500">
                  <strong>Atenção:</strong>{' '}
                  {parPartido.map((sb) => sb.rotulo).join(' e ')} e{' '}
                  {parPartido.map((sb) => SUB_ABAS_QUE_COMPARTILHAM_DADO[sb.id]).join(' e ')} leem a
                  MESMA lista de pessoas. Marcar uma sem a outra tira do menu, mas não protege.
                </p>
              )}
            </>
          );
        })()}

        {value.extraTabs.includes('data') && !isGlobalProfile(value.profile) && (
          <p className="text-[11px] text-amber-600 dark:text-amber-500">
            A aba <strong>Dados</strong> é da empresa inteira e não tem recorte por área —
            concedê-la a um perfil com escopo mostra números de todos os departamentos.
          </p>
        )}

        {/* "Nome e salário individuais" saiu daqui: virou a segunda das três
            chaves, no topo. Eram o mesmo campo em dois lugares, e o de baixo
            tinha três estados ("conforme o perfil") que deixaram de existir
            quando o perfil deixou de ser escolhido. */}
        <div className="space-y-1 sm:max-w-xs">
          <Label htmlFor={`exp-${idSuffix}`} className="text-xs">Acesso válido até</Label>
          <Input
            id={`exp-${idSuffix}`}
            type="date"
            value={value.expiresAt}
            onChange={(e) => patch({ expiresAt: e.target.value })}
          />
          <p className="text-[11px] text-muted-foreground">
            {value.expiresAt
              ? 'Depois desta data a pessoa deixa de entrar, sem precisar de ninguém.'
              : 'Em branco = sem prazo.'}
          </p>
        </div>
      </div>


    </div>
  );
}
