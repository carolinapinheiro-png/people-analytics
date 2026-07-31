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
import { UserPlus, ShieldAlert, ShieldCheck, Trash2, Pencil } from 'lucide-react';
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
  onChanged,
}: {
  emails: AllowedEmail[];
  departments: DepartmentOption[];
  onChanged: () => void;
}) {
  const [newEmail, setNewEmail] = useState('');
  const [addForm, setAddForm] = useState<UserFormState>(EMPTY_FORM);
  const [isLoading, setIsLoading] = useState(false);

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
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                type="email"
                placeholder="email@flutter.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                required
                className="flex-1"
              />
              <Button type="submit" disabled={isLoading || !!addValidationError}>
                {isLoading ? 'Adicionando...' : 'Adicionar'}
              </Button>
            </div>
            <UserAccessFormFields
              idSuffix="add"
              value={addForm}
              onChange={setAddForm}
              departmentOptions={activeDepartments}
              validationError={addValidationError}
            />
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
                Nenhum email autorizado ainda.
              </p>
            )}
          </div>
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
}: {
  idSuffix: string;
  value: UserFormState;
  onChange: (next: UserFormState) => void;
  departmentOptions: string[];
  validationError: string | null;
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

      <ChipPicker
        label="Responsabilidades"
        options={RESPONSIBILITY_PRESETS}
        value={value.responsibilities}
        onChange={(responsibilities) => patch({ responsibilities })}
      />

      {isScopedProfileValue(value.profile) && (
        <div className="space-y-3">
          <ChipPicker
            label="Departamentos atendidos"
            options={departmentOptions}
            value={value.departments}
            onChange={(departments) => patch({ departments })}
          />
          <ChipPicker
            label="Job type families atendidas"
            options={JOB_TYPE_FAMILIES}
            value={value.jobFamilies}
            onChange={(jobFamilies) => patch({ jobFamilies })}
          />
          {validationError ? (
            <p className="text-[11px] text-destructive">{validationError}</p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              O gestor vê o dashboard, mas só do seu time: <strong>união</strong> dos
              departamentos e das famílias marcadas.
            </p>
          )}
        </div>
      )}
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
