import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { useServerFn } from '@tanstack/react-start';
import { Building2, Plus } from 'lucide-react';
import { addDepartment, setDepartmentActive } from '@/lib/access.functions';
import type { AllowedEmail, DepartmentOption } from './UsersAccessSection';

export default function DepartmentsSection({
  departments,
  emails,
  onChanged,
}: {
  departments: DepartmentOption[];
  emails: AllowedEmail[];
  onChanged: () => void;
}) {
  const [newName, setNewName] = useState('');
  const [newAliases, setNewAliases] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const addDepartmentFn = useServerFn(addDepartment);
  const setDepartmentActiveFn = useServerFn(setDepartmentActive);

  const usageCount = (name: string) =>
    emails.filter((e) => (e.departments ?? []).includes(name)).length;

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    setIsLoading(true);
    try {
      await addDepartmentFn({
        data: {
          name: newName.trim(),
          aliases: newAliases
            .split(',')
            .map((a) => a.trim())
            .filter(Boolean),
        },
      });
      toast.success('Departamento adicionado ao catálogo');
      setNewName('');
      setNewAliases('');
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao adicionar departamento');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggle = async (dept: DepartmentOption, active: boolean) => {
    const inUse = usageCount(dept.name);
    if (!active && inUse > 0) {
      toast.warning(
        `${dept.name} está atribuído a ${inUse} usuário${inUse !== 1 ? 's' : ''}. ` +
          'Enquanto inativo, esses cadastros não poderão ser editados sem ajustar o escopo.',
      );
    }
    try {
      await setDepartmentActiveFn({ data: { id: dept.id, active } });
      toast.success(active ? 'Departamento ativado' : 'Departamento desativado');
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao atualizar departamento');
      console.error(error);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Novo departamento
          </CardTitle>
          <CardDescription>
            O nome canônico é salvo em maiúsculas e precisa bater com os dados do dashboard.
            Apelidos cobrem variações vindas de outras fontes (ex.: engagement).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAdd} className="flex flex-col gap-2">
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                placeholder="Nome canônico (ex.: TECHNOLOGY)"
                value={newName}
                maxLength={60}
                onChange={(e) => setNewName(e.target.value)}
                required
                className="flex-1"
              />
              <Input
                placeholder="Apelidos, separados por vírgula (opcional)"
                value={newAliases}
                onChange={(e) => setNewAliases(e.target.value)}
                className="flex-1"
              />
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Adicionando...' : 'Adicionar'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Catálogo de departamentos
          </CardTitle>
          <CardDescription>
            {departments.length} departamento{departments.length !== 1 ? 's' : ''} mapeado
            {departments.length !== 1 ? 's' : ''}. Perfis escopados só aceitam departamentos
            ativos deste catálogo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {departments.map((dept) => {
              const inUse = usageCount(dept.name);
              return (
                <div
                  key={dept.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-border bg-card gap-4"
                >
                  <div className="flex flex-col gap-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{dept.name}</span>
                      {!dept.active && <Badge variant="destructive">Inativo</Badge>}
                      {inUse > 0 && (
                        <Badge variant="outline">
                          {inUse} usuário{inUse !== 1 ? 's' : ''}
                        </Badge>
                      )}
                    </div>
                    {dept.aliases?.length > 0 && (
                      <span className="text-xs text-muted-foreground truncate">
                        Também aparece como: {dept.aliases.join(', ')}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground">
                      {dept.active ? 'Ativo' : 'Inativo'}
                    </span>
                    <Switch
                      checked={dept.active}
                      onCheckedChange={(checked) => handleToggle(dept, checked)}
                    />
                  </div>
                </div>
              );
            })}
            {departments.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhum departamento no catálogo.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
