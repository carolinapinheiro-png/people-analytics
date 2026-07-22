import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface KpiCardProps {
  label: string;
  value: string | number;
  color: string;
  sub?: string;
  icon?: LucideIcon;
}

export default function KpiCard({ label, value, color, sub, icon: Icon }: KpiCardProps) {
  return (
    <div className="bg-card border border-border rounded-lg p-3.5 relative overflow-hidden hover:shadow-md transition-shadow">
      <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: color }} />
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">{label}</div>
          <div className={cn(
            'font-extrabold tracking-tight text-foreground',
            String(value).length > 10 ? 'text-sm' : 'text-xl'
          )}>
            {value}
          </div>
          {sub && <div className="text-[10px] text-muted-foreground mt-0.5" dangerouslySetInnerHTML={{ __html: sub }} />}
        </div>
        {Icon && (
          <div 
            className="p-1.5 rounded-md opacity-20"
            style={{ backgroundColor: color }}
          >
            <Icon className="w-4 h-4 text-white" />
          </div>
        )}
      </div>
    </div>
  );
}
