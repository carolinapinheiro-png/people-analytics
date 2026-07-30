import { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  CheckCircle2, 
  Info,
  Lightbulb,
  Target,
  Users,
  BarChart3,
  Activity,
  AlertCircle
} from 'lucide-react';

interface StorySectionProps {
  title: string;
  children: ReactNode;
  icon?: React.ElementType;
  className?: string;
  variant?: 'default' | 'highlight' | 'warning' | 'success' | 'info';
}

const variantStyles = {
  default: 'border-l-4 border-l-[hsl(var(--flutter))] bg-card/50',
  highlight: 'border-l-4 border-l-[hsl(var(--flutter))] bg-gradient-to-r from-[hsl(var(--flutter))]/10 to-transparent',
  warning: 'border-l-4 border-l-amber-500 bg-amber-950/30',
  success: 'border-l-4 border-l-green-500 bg-green-950/30',
  info: 'border-l-4 border-l-blue-500 bg-blue-950/30',
};

const iconColors = {
  default: 'text-[hsl(var(--flutter))]',
  highlight: 'text-[hsl(var(--flutter))]',
  warning: 'text-amber-400',
  success: 'text-green-400',
  info: 'text-blue-400',
};

export function StorySection({ 
  title, 
  children, 
  icon: Icon = BarChart3, 
  className,
  variant = 'default'
}: StorySectionProps) {
  return (
    <Card className={cn(variantStyles[variant], className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2 text-foreground">
          <Icon className={cn("h-5 w-5", iconColors[variant])} />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {children}
      </CardContent>
    </Card>
  );
}

interface StoryInsightProps {
  children: ReactNode;
  type?: 'positive' | 'negative' | 'neutral' | 'warning';
  className?: string;
}

const insightStyles = {
  positive: 'bg-green-950/40 border-green-500/30 text-green-300',
  negative: 'bg-red-950/40 border-red-500/30 text-red-300',
  neutral: 'bg-muted/50 border-border/30 text-foreground',
  warning: 'bg-amber-950/40 border-amber-500/30 text-amber-300',
};

const insightIcons = {
  positive: CheckCircle2,
  negative: TrendingDown,
  neutral: Info,
  warning: AlertTriangle,
};

export function StoryInsight({ 
  children, 
  type = 'neutral',
  className 
}: StoryInsightProps) {
  const Icon = insightIcons[type];
  
  return (
    <div className={cn(
      "p-4 rounded-lg border text-sm",
      insightStyles[type],
      className
    )}>
      <div className="flex items-start gap-3">
        <Icon className="h-5 w-5 mt-0.5 flex-shrink-0 opacity-80" />
        <div className="leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

interface StoryMetricProps {
  label: string;
  value: string | number;
  subtext?: string;
  trend?: string;
  trendDirection?: 'up' | 'down' | 'neutral';
  className?: string;
}

export function StoryMetric({ 
  label, 
  value, 
  subtext,
  trend,
  trendDirection = 'neutral',
  className,
  color,
  icon: Icon
}: StoryMetricProps & { color?: string; icon?: React.ElementType }) {
  return (
    <div className={cn("text-center p-4 bg-muted/50 rounded-lg border border-border/50", className)}>
      <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">{label}</p>
      <p className={cn(
        'text-3xl font-bold',
        color ? '' : 'text-foreground'
      )} style={color ? { color } : undefined}>{value}</p>
      {subtext && (
        <p className="text-xs text-muted-foreground mt-1">{subtext}</p>
      )}
      {trend && (
        <div className={cn(
          "flex items-center justify-center gap-1 text-xs mt-2 font-medium",
          trendDirection === 'up' && "text-green-400",
          trendDirection === 'down' && "text-red-400",
          trendDirection === 'neutral' && "text-muted-foreground"
        )}>
          {trendDirection === 'up' && <TrendingUp className="h-3 w-3" />}
          {trendDirection === 'down' && <TrendingDown className="h-3 w-3" />}
          {trendDirection === 'neutral' && <Activity className="h-3 w-3" />}
          {trend}
        </div>
      )}
    </div>
  );
}

interface StoryAlertProps {
  title: string;
  children: ReactNode;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  className?: string;
}

const alertStyles = {
  low: 'bg-blue-950/40 border-blue-500/30 text-blue-200',
  medium: 'bg-amber-950/40 border-amber-500/30 text-amber-200',
  high: 'bg-orange-950/40 border-orange-500/30 text-orange-200',
  critical: 'bg-red-950/40 border-red-500/30 text-red-200',
};

const alertIcons = {
  low: Info,
  medium: AlertTriangle,
  high: AlertCircle,
  critical: AlertCircle,
};

const alertBadges = {
  low: { text: 'Info', class: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  medium: { text: 'Atenção', class: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  high: { text: 'Alerta', class: 'bg-orange-500/20 text-orange-300 border-orange-500/30' },
  critical: { text: 'Crítico', class: 'bg-red-500/20 text-red-300 border-red-500/30' },
};

export function StoryAlert({ 
  title, 
  children, 
  severity = 'medium',
  className 
}: StoryAlertProps) {
  const Icon = alertIcons[severity];
  const badge = alertBadges[severity];
  
  return (
    <div className={cn(
      "rounded-lg border p-4",
      alertStyles[severity],
      className
    )}>
      <div className="flex items-start gap-3">
        <Icon className="h-5 w-5 mt-0.5 flex-shrink-0 opacity-80" />
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <h4 className="font-semibold">{title}</h4>
            <Badge variant="outline" className={badge.class}>
              {badge.text}
            </Badge>
          </div>
          <div className="text-sm opacity-90 leading-relaxed">{children}</div>
        </div>
      </div>
    </div>
  );
}

// Componente de narrativa executiva completa
interface ExecutiveSummaryProps {
  title: string;
  summary: string;
  highlights: Array<{
    label: string;
    value: string;
    trend?: 'up' | 'down' | 'neutral';
  }>;
  alerts?: Array<{
    title: string;
    description: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
  }>;
  children?: ReactNode;
}

export function ExecutiveSummary({
  title,
  summary,
  highlights,
  alerts,
  children
}: ExecutiveSummaryProps) {
  return (
    <StorySection title={title} icon={Target} variant="highlight">
      <p className="text-sm text-foreground leading-relaxed">
        {summary}
      </p>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {highlights.map((h, i) => (
          <StoryMetric
            key={i}
            label={h.label}
            value={h.value}
            trendDirection={h.trend}
          />
        ))}
      </div>
      
      {alerts && alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((alert, i) => (
            <StoryAlert
              key={i}
              title={alert.title}
              severity={alert.severity}
            >
              {alert.description}
            </StoryAlert>
          ))}
        </div>
      )}
      
      {children}
    </StorySection>
  );
}

export default StorySection;
