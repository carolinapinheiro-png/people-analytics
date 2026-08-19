import { cn } from '@/lib/utils';
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
    { k: 'Todos', label: 'Todos' },
  ];

  return (
    <header className="bg-card border-b border-border px-4 md:px-7 py-3 flex items-center justify-between sticky top-0 z-50">
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

      <div className="flex items-center gap-3 min-w-0 overflow-x-auto">
        {/* Brand toggle */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground hidden md:inline">Marca</span>
          <div className="flex border border-border rounded-md overflow-hidden">
            {brands.map(b => (
              <button
                key={b.value}
                onClick={() => setBrand(b.value)}
                className={cn(
                  'px-3 py-1.5 text-[11px] font-semibold transition-all',
                  brand === b.value
                    ? 'text-white'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                )}
                style={brand === b.value ? { backgroundColor: brandColor } : undefined}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>

        {/* ------------------------------------------------------------------
            ANO: LISTA, NÃO BOTÕES LADO A LADO
            ------------------------------------------------------------------
            Isto era um controle segmentado, e funcionava bem enquanto a série
            tinha dois anos. Em 19/08/2026 a série do Convenia deixou de ser
            descartada na leitura e o painel passou a ter março/2013 em diante:
            quinze opções num controle desenhado para três, transbordando a
            barra e espremendo o seletor de marca.

            Um controle segmentado promete "as opções cabem na sua frente".
            Quando não cabem, ele não fica só feio -- ele passa a mentir. Lista
            escala, e ainda dá espaço para dizer o que cada ano tem.
        ------------------------------------------------------------------ */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground hidden md:inline">Ano</span>
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            aria-label="Filtrar por ano"
            className="border border-border rounded-md bg-card px-2.5 py-1.5 text-[11px] font-semibold text-foreground focus:outline-none focus:ring-1"
            style={{ '--tw-ring-color': brandColor } as React.CSSProperties}
          >
            {yearOptions.map((y) => (
              <option key={y.k} value={y.k}>{y.label}</option>
            ))}
          </select>
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground hidden md:inline">Visão</span>
          <div className="flex border border-border rounded-md overflow-hidden">
            {views.map(v => (
              <button
                key={v.value}
                onClick={() => setView(v.value)}
                className={cn(
                  'px-3 py-1.5 text-[11px] font-semibold transition-all',
                  view === v.value
                    ? 'text-white'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                )}
                style={view === v.value ? { backgroundColor: brandColor } : undefined}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {/* Month nav */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => currentMonthIdx > 0 && setCurrentMonthIdx(currentMonthIdx - 1)}
            className="p-1 rounded border border-border hover:border-border transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold min-w-[80px] text-center">{mLabel(currentMonth)}</span>
          <button
            onClick={() => currentMonthIdx < monthsOrder.length - 1 && setCurrentMonthIdx(currentMonthIdx + 1)}
            className="p-1 rounded border border-border hover:border-border transition-colors"
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
