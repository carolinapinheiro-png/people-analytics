// Design Tokens - Cores do Dashboard People Analytics
// Centraliza todas as cores usadas no dashboard para manter consistência

export const COLORS = {
  // Cores principais Flutter
  flutter: '#5c6bc0',
  flutterLight: '#8e99f3',
  flutterDark: '#26418f',
  
  // Cores NSX
  nsx: '#26a69a',
  nsxLight: '#4db6ac',
  nsxDark: '#00897b',

  // Cores Betfair
  betfair: '#d62d20',
  betfairLight: '#ff6659',
  
  
  // Cores de status
  success: '#22c55e',
  successLight: '#86efac',
  warning: '#f59e0b',
  warningLight: '#fcd34d',
  danger: '#ef4444',
  dangerLight: '#fca5a5',
  info: '#3b82f6',
  infoLight: '#93c5fd',
  
  // Cores de gênero (DEI)
  female: '#ec4899',
  femaleLight: '#f9a8d4',
  male: '#3b82f6',
  maleLight: '#93c5fd',
  nonBinary: '#8b5cf6',
  nonBinaryLight: '#c4b5fd',
  
  // Cores de senioridade
  junior: '#22d3ee',
  mid: '#fbbf24',
  senior: '#f87171',
  staff: '#a78bfa',
  
  // Cores de departamentos
  purple: '#7e57c2',
  purpleLight: '#b39ddb',
  orange: '#ff7043',
  orangeLight: '#ffab91',
  teal: '#26a69a',
  tealLight: '#80cbc4',
  pink: '#ec407a',
  pinkLight: '#f48fb1',
  indigo: '#5c6bc0',
  indigoLight: '#9fa8da',
  cyan: '#26c6da',
  cyanLight: '#80deea',
  lime: '#d4e157',
  limeLight: '#e6ee9c',
  amber: '#ffca28',
  amberLight: '#ffe082',
  red: '#ef5350',
  redLight: '#ef9a9a',
  
  // Cores de localização
  brazil: '#16a34a',
  portugal: '#dc2626',
  colombia: '#facc15',
  mexico: '#06b6d4',
  
  // Cores de movimentação
  hired: '#22c55e',
  terminated: '#ef4444',
  promoted: '#3b82f6',
  transferred: '#f59e0b',
  
  // Cores de turnover
  voluntary: '#f59e0b',
  involuntary: '#ef4444',
  
  // Cores de engajamento
  promoter: '#22c55e',
  passive: '#94a3b8',
  detractor: '#ef4444',
  
  // Escala de cinza
  gray50: '#f8fafc',
  gray100: '#f1f5f9',
  gray200: '#e2e8f0',
  gray300: '#cbd5e1',
  gray400: '#94a3b8',
  gray500: '#64748b',
  gray600: '#475569',
  gray700: '#334155',
  gray800: '#1e293b',
  gray900: '#0f172a',
  dark: '#1a2236',
} as const;

// Paleta de cores para gráficos
export const CHART_COLORS = [
  COLORS.flutter,
  COLORS.nsx,
  COLORS.purple,
  COLORS.orange,
  COLORS.teal,
  COLORS.pink,
  COLORS.indigo,
  COLORS.cyan,
  COLORS.lime,
  COLORS.amber,
];

// Cores para heatmaps
export const HEATMAP_COLORS = {
  low: '#dcfce7',
  medium: '#fef9c3',
  high: '#fee2e2',
  critical: '#fecaca',
};

// Função para gerar cor com opacidade
export function withAlpha(color: string, alpha: number): string {
  // Converte hex para rgba
  const hex = color.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Função para gerar escala de cores
export function generateScale(baseColor: string, steps: number): string[] {
  const colors: string[] = [];
  for (let i = 0; i < steps; i++) {
    const alpha = 1 - (i / steps) * 0.7;
    colors.push(withAlpha(baseColor, alpha));
  }
  return colors;
}

export default COLORS;
