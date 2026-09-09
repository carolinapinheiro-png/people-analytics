import { useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import { ShieldCheck, Plus, Trash2, Pencil, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import MultiSelect from '@/components/admin/MultiSelect';
import { COLORS } from '@/lib/colors';
import {
  listarPerfisDeAcesso, salvarPerfilDeAcesso, removerPerfilDeAcesso,
} from '@/lib/access.functions';
import { ALL_TABS, type DashboardTab } from '@/lib/permissions';
import type { PerfilOpcao } from '@/components/admin/UsersAccessSection';
import { TAB_LABELS, SUB_ABAS, SUB_ABA_LABEL } from '@/components/admin/UsersAccessSection';

/**
 * Criar e editar os perfis de acesso.
 *
 * ===========================================================================
 * ISTO NÃO É A VOLTA DO SELETOR DE PERFIL QUE SAIU EM 31/08
 * ===========================================================================
 * Aquilo era um ENUM FIXO com as abas escritas no código, e o defeito estava
 * registrado: "o perfil era um rótulo fingindo ser uma decisão" -- escolhê-lo
 * e depois ajustar os campos ao lado era responder a mesma pergunta duas
 * vezes, com a segunda vencendo em silêncio.
 *
 * Aqui o perfil É a decisão. As abas dele são escolhidas nesta tela, e quando
 * o cadastro de uma pessoa diverge, a divergência aparece marcada como
 * exceção em vez de brigar com o perfil em silêncio.
 *
 * ===========================================================================
 * O AVISO DE QUANTAS PESSOAS MUDAM
 * ===========================================================================
 * Editar um perfil muda o acesso de todo mundo que está nele, de uma vez. É o
 * que faz o perfil valer a pena e é o que o torna perigoso.
 *
 * Um botão "Salvar" que não diz quantas pessoas mudam é o mesmo defeito que
 * este painel passou a semana caçando: a consequência existe e a tela não a
 * mostra. Então o número aparece ANTES, no botão, e de novo DEPOIS, no toast.
 */
export default function PerfisDeAcessoSection() {
  const listar = useServerFn(listarPerfisDeAcesso);
  const salvar = useServerFn(salvarPerfilDeAcesso);
  const remover = useServerFn(removerPerfilDeAcesso);

  const [perfis, setPerfis] = useState<PerfilOpcao[]>([]);
  const [migrado, setMigrado] = useState(true);
  const [carregando, setCarregando] = useState(true);
  const [editando, setEditando] = useState<PerfilOpcao | 'novo' | null>(null);
  const [salvando, setSalvando] = useState(false);

  const recarregar = () => {
    setCarregando(true);
    listar({})
      .then((r) => {
        setPerfis(r.perfis as PerfilOpcao[]);
        setMigrado(r.migrado);
      })
      .catch((e: unknown) => {
        toast.error(e instanceof Error ? e.message : 'Falha ao carregar perfis');
      })
      .finally(() => setCarregando(false));
  };
  useEffect(recarregar, []);

  const [form, setForm] = useState({
    nome: '', descricao: '',
    veEmpresaToda: false, administraUsuarios: false, veIndividual: false,
    tabs: [] as string[], subTabs: [] as string[],
  });

  const abrir = (p: PerfilOpcao | 'novo') => {
    setEditando(p);
    setForm(p === 'novo'
      ? {
        nome: '', descricao: '',
        // O padrão é o mais restrito: um perfil salvo sem pensar concede o
        // mínimo. Mesma regra do cadastro de pessoa.
        veEmpresaToda: false, administraUsuarios: false, veIndividual: false,
        tabs: [], subTabs: [],
      }
      : {
        nome: p.nome, descricao: p.descricao ?? '',
        veEmpresaToda: p.veEmpresaToda,
        administraUsuarios: p.administraUsuarios,
        veIndividual: p.veIndividual,
        tabs: p.tabs, subTabs: p.subTabs,
      });
  };

  const emEdicao = editando !== 'novo' && editando ? editando : null;
  /** Quantos mudam ao salvar. Zero para perfil novo -- ninguém está nele. */
  const atingidos = emEdicao?.quantos ?? 0;

  const gravar = async () => {
    if (form.nome.trim().length < 2) {
      toast.error('Dê um nome ao perfil.');
      return;
    }
    setSalvando(true);
    try {
      const r = await salvar({
        data: {
          id: emEdicao?.id ?? null,
          nome: form.nome.trim(),
          descricao: form.descricao.trim() || null,
          veEmpresaToda: form.veEmpresaToda,
          administraUsuarios: form.administraUsuarios,
          veIndividual: form.veIndividual,
          tabs: form.tabs,
          subTabs: form.subTabs,
        },
      });
      toast.success(
        r.atingidos
          ? `Perfil salvo. O acesso de ${r.atingidos} pessoa${r.atingidos === 1 ? '' : 's'} mudou agora.`
          : 'Perfil salvo.',
      );
      setEditando(null);
      recarregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao salvar');
    } finally {
      setSalvando(false);
    }
  };

  const apagar = async (p: PerfilOpcao) => {
    try {
      await remover({ data: { id: p.id } });
      toast.success(`Perfil ${p.nome} apagado.`);
      recarregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao apagar');
    }
  };

  /** Sub-abas oferecidas: só das abas que o perfil de fato tem. */
  const subDisponiveis = SUB_ABAS.filter((sb) => form.tabs.includes(sb.aba));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4" /> Perfis de acesso
        </CardTitle>
        <CardDescription>
          Um perfil define as abas e o alcance de um grupo de pessoas. Quem diverge do perfil ganha
          uma exceção no próprio cadastro, e ela aparece marcada lá.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!migrado && (
          <p className="text-sm rounded-md border border-amber-500/40 p-3 text-amber-600 dark:text-amber-500">
            A tabela de perfis ainda não existe no banco. Rode as migrações{' '}
            <code>20260908120000_perfis_de_acesso.sql</code> e{' '}
            <code>20260908130000_perfis_iniciais.sql</code>. Até lá, os cadastros continuam
            funcionando avulsos — nada quebra, e nenhum perfil pode ser criado.
          </p>
        )}

        {migrado && !carregando && perfis.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nenhum perfil ainda. Crie o primeiro — ou rode a migração de perfis iniciais, que já
            traz Business Partner e Admin com as abas decididas na reunião de 08/09.
          </p>
        )}

        <div className="space-y-2">
          {perfis.map((p) => (
            <div key={p.id} className="rounded-lg border border-border p-3 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{p.nome}</span>
                <span className="text-[11px] text-muted-foreground">
                  {p.quantos === 0
                    ? 'ninguém usa'
                    : `${p.quantos} pessoa${p.quantos === 1 ? '' : 's'}`}
                </span>
                <div className="ml-auto flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => abrir(p)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={p.quantos > 0}
                    title={p.quantos > 0
                      ? 'Mova as pessoas para outro perfil antes de apagar'
                      : 'Apagar'}
                    onClick={() => void apagar(p)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              {p.descricao && (
                <p className="text-[11px] text-muted-foreground">{p.descricao}</p>
              )}
              <div className="flex flex-wrap gap-1">
                {p.tabs.map((t) => (
                  <span key={t} className="rounded bg-muted px-1.5 py-0.5 text-[11px]">
                    {TAB_LABELS[t as DashboardTab] ?? t}
                  </span>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {p.veEmpresaToda ? 'A empresa toda' : 'Só as áreas atribuídas'} ·{' '}
                {p.veIndividual ? 'com dado individual' : 'sem dado individual'}
                {p.administraUsuarios ? ' · administra usuários' : ''}
              </p>
            </div>
          ))}
        </div>

        {migrado && editando === null && (
          <Button variant="outline" size="sm" onClick={() => abrir('novo')}>
            <Plus className="h-4 w-4 mr-1.5" /> Novo perfil
          </Button>
        )}

        {editando !== null && (
          <div className="rounded-lg border border-border p-3 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Nome</Label>
                <Input
                  value={form.nome}
                  maxLength={60}
                  placeholder="Business Partner"
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Descrição (opcional)</Label>
                <Input
                  value={form.descricao}
                  maxLength={400}
                  placeholder="Para que serve este perfil"
                  onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                />
              </div>
            </div>

            {([
              ['veEmpresaToda', 'Vê a empresa inteira?'],
              ['veIndividual', 'Vê nome e salário de cada pessoa?'],
              ['administraUsuarios', 'Administra usuários?'],
            ] as const).map(([campo, pergunta]) => (
              <div key={campo} className="flex items-center justify-between gap-3 flex-wrap">
                <Label className="text-xs font-normal">{pergunta}</Label>
                <div className="flex gap-1 rounded-md bg-muted p-0.5">
                  {[false, true].map((v) => (
                    <button
                      key={String(v)}
                      type="button"
                      onClick={() => setForm({
                        ...form,
                        [campo]: v,
                        // Mesma regra do cadastro de pessoa, e pelo mesmo
                        // motivo: quem administra usuários se dá qualquer
                        // acesso pelo próprio cadastro. Um admin de uma área só
                        // seria teatro, e o interruptor se desfaria ao salvar.
                        ...(campo === 'administraUsuarios' && v ? { veEmpresaToda: true } : {}),
                      })}
                      className={`rounded px-2.5 py-1 text-[12px] ${
                        form[campo] === v
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

            <MultiSelect
              id="perfil-tabs"
              label="Abas deste perfil"
              options={ALL_TABS.filter((t) => form.veIndividual || t !== 'individual')}
              labels={TAB_LABELS}
              value={form.tabs}
              onChange={(tabs) => setForm({ ...form, tabs })}
              placeholder="Nenhuma — quem tiver este perfil entra e não vê nada"
              searchPlaceholder="Buscar aba..."
            />

            {subDisponiveis.length > 0 && (
              <MultiSelect
                id="perfil-subtabs"
                label="Sub-abas"
                options={subDisponiveis.map((sb) => sb.id)}
                labels={SUB_ABA_LABEL}
                value={form.subTabs}
                onChange={(subTabs) => setForm({ ...form, subTabs })}
                placeholder="Vazio = todas as das abas acima"
                searchPlaceholder="Buscar sub-aba..."
              />
            )}

            {/* O tamanho do que está sendo mexido, ANTES de mexer. */}
            {atingidos > 0 && (
              <p
                className="text-xs flex items-start gap-1.5"
                style={{ color: COLORS.warning }}
              >
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                Salvar muda o acesso de <strong>{atingidos} pessoa
                {atingidos === 1 ? '' : 's'}</strong> que herdam deste perfil, na mesma hora. Quem
                tiver exceção no próprio cadastro não é afetado naquele campo.
              </p>
            )}

            <div className="flex gap-2">
              <Button size="sm" onClick={() => void gravar()} disabled={salvando}>
                {salvando
                  ? 'Salvando…'
                  : atingidos > 0
                    ? `Salvar e mudar ${atingidos} acesso${atingidos === 1 ? '' : 's'}`
                    : 'Salvar perfil'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setEditando(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
