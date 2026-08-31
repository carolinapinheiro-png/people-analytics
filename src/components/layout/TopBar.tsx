import { useDashboard, BrandType, ViewType } from '@/data/DashboardContext';
import { mLabel } from '@/data/helpers';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { COLORS } from '@/lib/colors';
import { rotuloAno } from '@/lib/cobertura';

import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/lib/theme';
import { LogOut, User, Shield, Sun, Moon } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import GlossaryDialog from '@/components/dashboard/GlossaryDialog';

const BRAND_COLORS: Record<string, string> = {
  combined: COLORS.flutter,
  NSX: COLORS.nsx,
  'Betfair BR': COLORS.betfair,
  'Flutter International': COLORS.flutter,
  Porto: COLORS.flutter,
};

const brands: { label: string; value: BrandType }[] = [
  { label: 'Combinado', value: 'combined' },
  { label: 'NSX', value: 'NSX' },
  { label: 'Betfair BR', value: 'Betfair BR' },
  { label: 'Flutter Intl', value: 'Flutter International' },
];

const views: { label: string; value: ViewType }[] = [
  { label: 'Mensal', value: 'monthly' },
  { label: 'Trimestral', value: 'quarterly' },
];

export default function TopBar() {
  const { brand, setBrand, view, setView, currentMonthIdx, setCurrentMonthIdx, monthsOrder, currentMonth,
    yearFilter, setYearFilter, availableYears, cobertura } = useDashboard();
  const brandColor = BRAND_COLORS[brand] || COLORS.flutter;
  const latestYear = availableYears[availableYears.length - 1] ?? '';
  // "Ano atual (2026)" e "2026" eram dois botoes lado a lado fazendo a mesma
  // coisa -- so divergiriam na virada do ano, o que ninguem deduz olhando.
  // O ano mais recente sai da lista numerada: quem quer o atual clica em
  // "Ano atual", que continua se movendo sozinho quando o ano vira.
  //
  // Do mais recente para o mais antigo: com quinze anos na lista, 2026 nao
  // pode estar no fim de uma rolagem. Quase toda escolha real e nos ultimos
  // dois anos.
  //
  // O rotulo diz o que o ano tem ("2017 · so quadro"), para a decisao
  // acontecer ANTES do clique -- e nao virar a interpretacao de tres abas
  // vazias depois dele. Ver lib/cobertura.ts.
  const yearOptions: { k: string; label: string }[] = [
    { k: 'atual', label: `Ano atual${latestYear ? ` (${latestYear})` : ''}` },
    ...[...availableYears]
      .filter((y) => y !== latestYear)
      .sort((a, b) => (a < b ? 1 : -1))
      .map((y) => ({ k: y, label: rotuloAno(y, cobertura) })),
    // "Todos" sozinho num campo sem rótulo visível não diz do que. Agora que o
    // controle pode ficar sem legenda em tela estreita, o valor precisa se
    // sustentar lido de fora.
    { k: 'Todos', label: 'Todos os anos' },
  ];

  return (
    <header className="bg-card border-b border-border px-4 md:px-7 py-3 flex items-center justify-between sticky top-[var(--faixa-ver-como,0px)] z-50">
      {/* shrink-0 e whitespace-nowrap: sem isto o titulo quebrava em duas
          linhas e o subtitulo em tres, empurrando tema e usuario para baixo
          dele -- um layout que ninguem desenhou, produzido pelo flex-wrap. */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-extrabold text-white shrink-0" style={{ background: `linear-gradient(to bottom right, ${brandColor}, ${COLORS.nsx})` }}>
          F
        </div>
        <div className="min-w-0">
          <div className="text-sm font-bold tracking-tight whitespace-nowrap">Flutter Brazil · People Analytics</div>
          {/* Contexto, nao informacao critica: some antes de atrapalhar. */}
          <div className="text-[11px] text-muted-foreground whitespace-nowrap hidden xl:block">NSX + Betfair · Dashboard mensal de RH</div>
        </div>
      </div>

      <div className="flex items-center gap-2 min-w-0 overflow-x-auto">
        {/* ------------------------------------------------------------------
            OS TRÊS FILTROS GLOBAIS, TODOS COMO LISTA
            ------------------------------------------------------------------
            Os três eram controles segmentados: quatro marcas, quinze anos e
            duas visões, mais os rótulos, mais a navegação de mês, glossário,
            tema e usuário -- tudo na mesma linha. Somados, ocupavam a barra
            inteira e empurravam a navegação de mês para fora da tela em telas
            de notebook.

            Um controle segmentado é melhor que uma lista quando as opções
            cabem lado a lado E a comparação entre elas importa na hora de
            escolher. Aqui nenhuma das duas coisas se sustenta: ninguém compara
            "Mensal" com "Trimestral" olhando, escolhe. O que o segmentado
            entrega em troca do espaço é ver a opção não escolhida -- e isso
            vale pouco em filtro global, que muda raramente e fica visível no
            valor selecionado.

            Um componente só para os três, para não divergirem no próximo
            ajuste. Foi a lição das treze cópias de `authorize()`, em escala
            menor: duas listas iguais escritas em dois lugares viram duas
            listas diferentes.
        ------------------------------------------------------------------ */}
        <Seletor
          rotulo="Marca"
          valor={brand}
          onChange={(v) => setBrand(v as BrandType)}
          cor={brandColor}
          opcoes={brands.map((b) => ({ k: b.value, label: b.label }))}
        />

        <Seletor
          rotulo="Ano"
          valor={yearFilter}
          onChange={setYearFilter}
          cor={brandColor}
          opcoes={yearOptions}
        />

        <Seletor
          rotulo="Visão"
          valor={view}
          onChange={(v) => setView(v as ViewType)}
          cor={brandColor}
          opcoes={views.map((v) => ({ k: v.value, label: v.label }))}
        />

        {/* ------------------------------------------------------------------
            MÊS: LISTA, MAS AS SETAS FICAM
            ------------------------------------------------------------------
            O rótulo do mês era texto fixo entre duas setas. Funcionava quando
            a série tinha dezoito meses; agora tem 272, e chegar em 2015 pela
            seta seriam mais de duzentos cliques. A lista resolve isso.

            As setas NÃO saem junto, e é a única diferença de tratamento entre
            este controle e os outros três. Marca, ano e visão mudam raramente;
            mês é a interação central de um painel mensal -- comparar com o
            anterior é o gesto que se repete o tempo todo. Trocar um clique por
            "abrir lista, procurar, escolher" nesse caso custaria mais do que o
            espaço economizado.

            Elas ficam desabilitadas nas pontas, em vez de clicáveis sem
            efeito: um botão que não faz nada e não diz que não faz nada é pior
            que um botão apagado.
        ------------------------------------------------------------------ */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => currentMonthIdx > 0 && setCurrentMonthIdx(currentMonthIdx - 1)}
            disabled={currentMonthIdx <= 0}
            aria-label="Mês anterior"
            title="Mês anterior"
            className="p-1 rounded border border-border hover:bg-secondary disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <select
            value={currentMonth}
            onChange={(e) => {
              const i = monthsOrder.indexOf(e.target.value);
              if (i >= 0) setCurrentMonthIdx(i);
            }}
            aria-label="Mês"
            title="Mês"
            className="border border-border rounded-md bg-card py-1.5 pl-2 pr-6 text-[11px] font-semibold text-foreground cursor-pointer hover:bg-secondary transition-colors focus:outline-none focus:ring-1"
            style={{ '--tw-ring-color': brandColor } as React.CSSProperties}
          >
            {/* Do mais recente para o mais antigo, como o filtro de ano: com
                272 meses, o mês corrente não pode estar no fim da rolagem. */}
            {[...monthsOrder].reverse().map((m) => (
              <option key={m} value={m}>{mLabel(m)}</option>
            ))}
          </select>
          <button
            onClick={() => currentMonthIdx < monthsOrder.length - 1 && setCurrentMonthIdx(currentMonthIdx + 1)}
            disabled={currentMonthIdx >= monthsOrder.length - 1}
            aria-label="Próximo mês"
            title="Próximo mês"
            className="p-1 rounded border border-border hover:bg-secondary disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Glossario: disponivel em qualquer aba, para qualquer perfil. */}
        <GlossaryDialog />

        {/* Theme toggle */}
        <ThemeToggle />

        {/* User menu */}
        <UserMenu />
      </div>
    </header>
  );
}

/**
 * Um filtro global do topo.
 *
 * O rótulo ("Marca", "Ano", "Visão") só aparece em telas largas: em notebook
 * ele é o primeiro a sair, porque o valor selecionado já diz do que se trata
 * -- "Combinado", "Trimestral" e "Ano atual (2026)" não precisam de legenda.
 * O `aria-label` fica sempre, então quem usa leitor de tela não perde nada
 * quando o texto some.
 *
 * `title` repete o rótulo no hover: é o resgate para quem está numa tela
 * estreita e não reconheceu o controle de cara.
 */
function Seletor({
  rotulo, valor, onChange, opcoes, cor,
}: {
  rotulo: string;
  valor: string;
  onChange: (v: string) => void;
  opcoes: { k: string; label: string }[];
  cor: string;
}) {
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground hidden 2xl:inline">
        {rotulo}
      </span>
      <select
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        aria-label={rotulo}
        title={rotulo}
        className="border border-border rounded-md bg-card py-1.5 pl-2 pr-6 text-[11px] font-semibold text-foreground max-w-[168px] truncate cursor-pointer hover:bg-secondary transition-colors focus:outline-none focus:ring-1"
        style={{ '--tw-ring-color': cor } as React.CSSProperties}
      >
        {opcoes.map((o) => (
          <option key={o.k} value={o.k}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
      aria-label="Alternar tema"
      className="p-2 rounded-full border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
    >
      {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

function UserMenu() {
  const { user, signOut, isAdmin } = useAuth();

  const handleSignOut = async () => {
    try {
      await signOut();
      toast.success('Logout realizado');
    } catch (error) {
      toast.error('Erro ao sair');
      console.error('Sign out error:', error);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full border border-border">
          <User className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="px-2 py-1.5 text-sm text-muted-foreground truncate">
          {user?.email || 'Usuário'}
        </div>
        {isAdmin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="cursor-pointer">
              <Link to="/admin">
                <Shield className="mr-2 h-4 w-4" />
                Admin
              </Link>
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer">
          <LogOut className="mr-2 h-4 w-4" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
