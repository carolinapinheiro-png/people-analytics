import { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface SubSectionProps {
  title: string;
  children: ReactNode;
  icon?: LucideIcon;
  className?: string;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
}

const variantStyles = {
  default: 'border-border bg-card',
  success: 'border-green-500/20 bg-green-950/20',
  warning: 'border-amber-500/20 bg-amber-950/20',
  danger: 'border-red-500/20 bg-red-950/20',
  info: 'border-blue-500/20 bg-blue-950/20',
};

const iconColors = {
  default: 'text-[hsl(var(--flutter))]',
  success: 'text-green-400',
  warning: 'text-amber-400',
  danger: 'text-red-400',
  info: 'text-blue-400',
};

export function SubSection({
  title,
  children,
  icon: Icon,
  className,
  variant = 'default',
}: SubSectionProps) {
  return (
    <Card className={cn('border', variantStyles[variant], className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2 text-slate-100">
          {Icon && <Icon className={cn('h-4 w-4', iconColors[variant])} />}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {children}
      </CardContent>
    </Card>
  );
}

interface MetricBoxProps {
  label: string;
  value: string | number;
  subtext?: string;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  className?: string;
}

const metricBoxStyles = {
  default: 'bg-slate-800/50 border-slate-700/50 text-slate-100',
  success: 'bg-green-950/30 border-green-500/20 text-green-300',
  warning: 'bg-amber-950/30 border-amber-500/20 text-amber-300',
  danger: 'bg-red-950/30 border-red-500/20 text-red-300',
  info: 'bg-blue-950/30 border-blue-500/20 text-blue-300',
};

export function MetricBox({
  label,
  value,
  subtext,
  variant = 'default',
  className,
}: MetricBoxProps) {
  return (
    <div className={cn('p-3 rounded-lg border text-center', metricBoxStyles[variant], className)}>
      <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">{label}</p>
      <p className="text-xl font-bold">{value}</p>
      {subtext && <p className="text-[10px] text-slate-500 mt-1">{subtext}</p>}
    </div>
  );
}

interface ListItemProps {
  label: string;
  value: ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger';
}

const listItemStyles = {
  default: 'bg-slate-800/30 border-slate-700/30',
  success: 'bg-green-950/20 border-green-500/20',
  warning: 'bg-amber-950/20 border-amber-500/20',
  danger: 'bg-red-950/20 border-red-500/20',
};

export function ListItem({ label, value, variant = 'default' }: ListItemProps) {
  return (
    <div className={cn('flex items-center justify-between p-2 rounded border text-sm', listItemStyles[variant])}>
      <span className="text-slate-300">{label}</span>
      <span className="font-medium text-slate-100">{value}</span>
    </div>
  );
}

export default SubSection;
