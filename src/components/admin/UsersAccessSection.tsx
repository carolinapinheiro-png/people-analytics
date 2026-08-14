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
import { entrarVerComo } from '@/components/layout/FaixaVerComo';
import {
  addAllowedEmail,
  removeAllowedEmail,
  updateAllowedEmailUser,
} from '@/lib/access.functions';
import {
  isScopedProfileValue,
  SCOPED_REQUIRES_SCOPE_MESSAGE,
} from '@/lib/access-rules';
import {
  ACCESS_PROFILES,
  PROFILE_LABELS,
  PROFILE_DESCRIPTIONS,
  isGlobalProfile,
  JOB_TYPE_FAMILIES,
  JOB_LEVEL_PRESETS,
  RESPONSIBILITY_PRESETS,
  type AccessProfile,
} from '@/lib/permissions';

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
}

export interface DepartmentOption {
  id: string;
  name: string;
  aliases: string[];
  active: boolean;
}

interface UserFormState {
  profile: AccessProfile;
  departments: string[];
  jobFamilies: string[];
  jobTitle: string;
  jobLevel: string;
  responsibilities: string[];
}

const EMPTY_FORM: UserFormState = {
  profile: 'dept_leader',
  departments: [],
  jobFamilies: [],
  jobTitle: '',
  jobLevel: '',
  responsibilities: [],
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
  if (form.profile === 'engagement_viewer') {
    return `${areas} — e só a aba Experiência › Engajamento. Nenhuma outra seção do painel, nem as outras sub-abas de Experiência.`;
  }
  return `${areas}. Só números agregados, sem nome de pessoa.`;
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

export default function UsersAccessSection({
  emails,
  departments,
  totalCount,
  page,
  totalPages,
  limit,
  search,
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
  onSearchChange: (value: string) => void;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
  onChanged: () => void;
}) {
  const [newEmail, setNewEmail] = useState('');
  const [addForm, setAddForm] = useState<UserFormState>(EMPTY_FORM);
  const [isLoading, setIsLoading] = useState(false);
  /** So mostra o erro depois da primeira mexida no formulario. */
  const [addTouched, setAddTouched] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<UserFormState>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);

  const addAllowedEmailFn = useServerFn(addAllowedEmail);
  const removeAllowedEmailFn = useServerFn(removeAllowedEmail);
  const updateAllowedEmailUserFn = useServerFn(updateAllowedEmailUser);

  const activeDepartments = departments.filter((d) => d.active).map((d) => d.name);
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
        data: { email: newEmail.trim(), ...addForm },
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

  const handleRemove = async (id: string) => {
    try {
      await removeAllowedEmailFn({ data: { id } });
      toast.success('Email removido');
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
      await updateAllowedEmailUserFn({ data: { id: editingId, ...editForm } });
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
                required
                className="max-w-md"
              />
            </div>

            <UserAccessFormFields
              idSuffix="add"
              value={addForm}
              onChange={(next) => {
                setAddTouched(true);
                setAddForm(next);
              }}
              departmentOptions={activeDepartments}
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
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {emails.map((item) => (
              <div
                key={item.id}
                className="flex items-start justify-between p-3 rounded-lg border border-border bg-card gap-4"
              >
                <div className="flex flex-col gap-1.5 min-w-0">
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
  validationError: string | null;
  showError?: boolean;
  emailPreview?: string;
}) {
  const patch = (partial: Partial<UserFormState>) => onChange({ ...value, ...partial });
  const levelListId = `job-levels-${idSuffix}`;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Perfil de acesso</Label>
          <select
            value={value.profile}
            onChange={(e) => patch({ profile: e.target.value as AccessProfile })}
            className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {ACCESS_PROFILES.map((p) => (
              <option key={p} value={p}>
                {PROFILE_LABELS[p]}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">{PROFILE_DESCRIPTIONS[value.profile]}</p>
        </div>
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
          <Label className="text-xs text-muted-foreground">Level</Label>
          <Input
            placeholder="Ex.: Manager"
            value={value.jobLevel}
            maxLength={40}
            list={levelListId}
            onChange={(e) => patch({ jobLevel: e.target.value })}
          />
          <datalist id={levelListId}>
            {JOB_LEVEL_PRESETS.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </div>
      </div>

      <MultiSelect
        id={`resp-${idSuffix}`}
        label="Responsabilidades"
        options={RESPONSIBILITY_PRESETS}
        value={value.responsibilities}
        onChange={(responsibilities) => patch({ responsibilities })}
        placeholder="Nenhuma (opcional)"
        searchPlaceholder="Buscar responsabilidade..."
      />

      {isScopedProfileValue(value.profile) && (
        <div className="space-y-3 rounded-lg border border-border p-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <MultiSelect
              id={`dept-${idSuffix}`}
              label="Departamentos atendidos"
              options={departmentOptions}
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

          {showError && validationError && (
            <p className="text-[11px] text-destructive flex items-center gap-1.5">
              <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
              {validationError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
