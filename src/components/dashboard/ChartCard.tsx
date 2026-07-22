import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface ChartCardProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  icon?: LucideIcon;
}

export default function ChartCard({ title, subtitle, children, className, icon: Icon }: ChartCardProps) {
  return (
    <div className={cn('bg-card border border-border rounded-lg p-4', className)}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-4 w-4 text-[hsl(var(--flutter))]" />}
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</span>
        </div>
        {subtitle && <span className="text-[11px] text-muted-foreground">{subtitle}</span>}
      </div>
      {children}
    </div>
  );
}
