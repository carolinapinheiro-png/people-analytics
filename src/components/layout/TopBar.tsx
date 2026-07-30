import { cn } from '@/lib/utils';
import { useDashboard, BrandType, ViewType } from '@/data/DashboardContext';
import { mLabel } from '@/data/helpers';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { COLORS } from '@/lib/colors';

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
    yearFilter, setYearFilter, availableYears } = useDashboard();
  const brandColor = BRAND_COLORS[brand] || COLORS.flutter;
  const latestYear = availableYears[availableYears.length - 1] ?? '';
  const yearOptions: { k: string; label: string }[] = [
    { k: 'atual', label: `Ano atual${latestYear ? ` (${latestYear})` : ''}` },
    ...availableYears.map((y) => ({ k: y, label: y })),
    { k: 'Todos', label: 'Todos' },
  ];

  return (
    <header className="bg-card border-b border-border px-4 md:px-7 py-3 flex items-center justify-between sticky top-0 z-50">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-extrabold text-white" style={{ background: `linear-gradient(to bottom right, ${brandColor}, ${COLORS.nsx})` }}>
          F
        </div>
        <div>
          <div className="text-sm font-bold tracking-tight">Flutter Brazil · People Analytics</div>
          <div className="text-[11px] text-muted-foreground">NSX + Betfair · Dashboard mensal de RH</div>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
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

        {/* Year toggle (global) */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground hidden md:inline">Ano</span>
          <div className="flex border border-border rounded-md overflow-hidden">
            {yearOptions.map((y) => (
              <button
                key={y.k}
                onClick={() => setYearFilter(y.k)}
                className={cn(
                  'px-3 py-1.5 text-[11px] font-semibold transition-all',
                  yearFilter === y.k ? 'text-white' : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                )}
                style={yearFilter === y.k ? { backgroundColor: brandColor } : undefined}
              >
                {y.label}
              </button>
            ))}
          </div>
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
