import type { MonthRecord } from '@/data/raw-data';
import { calcTurnover } from '@/data/helpers';
import { resolverPeriodo, rotuloMes, type VisaoPeriodo } from '@/lib/periodo';

/**
 * ===========================================================================
 * PANORAMA DO PERÍODO = ACUMULADO DO ANO ATÉ O PERÍODO SELECIONADO
 * ===========================================================================
 * Decidido em 17/09/2026. Antes o card somava a série inteira do ano, até o
 * último mês carregado, ignorando o mês/trimestre escolhido -- selecionar
 * março mostrava saídas de agosto. E o título não dizia de quando a quando.
 *
 * Regra agora:
 *   - ano em escopo  -> de janeiro até o fim do mês/trimestre selecionado;
 *   - todos os anos  -> a série inteira (não existe "início do ano" único).
 *
 * Só o período selecionado (sem acumular) não serve: repetiria os KPIs
 * mensais que estão logo acima no Overview.
 *
 * SEMPRE SOBRE A SÉRIE MENSAL, mesmo na visão trimestral. Sobre a série
 * agregada por trimestre, a "média mensal" era média de trimestres e o
 * "43 → 45" comparava HC médio de trimestre, não o HC de um mês.
 */
export interface Panorama {
  meses: MonthRecord[];
  /** 'jan–mar/2026', 'nov/2025–set/2026' ou '' sem dado. */
  rotulo: string;
  hcInicio: number;
  hcFim: number;
  crescimentoPct: number;
  saidas: number;
  entradas: number;
  hcMedio: number;
  atricaoAcumulada: number;
  turnoverAcumulado: number;
  atricaoMediaMensal: number;
  turnoverMediaMensal: number;
  /** null = nenhum mês da janela calculou promoções. */
  promocoes: number | null;
}

const ym = (v: string) => String(v).slice(0, 7);

export function rotuloIntervalo(inicio: string, fim: string): string {
  if (!inicio || !fim) return '';
  const a = rotuloMes(inicio);
  const b = rotuloMes(fim);
  if (a === b) return a;
  const [ma, ya] = a.split('/');
  const [mb, yb] = b.split('/');
  return ya === yb ? `${ma}–${mb}/${yb}` : `${a}–${b}`;
}

const media = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

export function panoramaDoPeriodo(opts: {
  serieMensal: MonthRecord[];
  view: VisaoPeriodo;
  currentMonth: string;
  activeYear: string | null;
}): Panorama {
  const periodo = resolverPeriodo(opts);
  const ordenada = [...opts.serieMensal].sort((x, y) => ym(x.month).localeCompare(ym(y.month)));
  const meses = periodo.tipo === 'todos'
    ? ordenada
    : ordenada.filter((d) => ym(d.month).startsWith(opts.activeYear!) && periodo.ateOFim(d.month));

  const primeiro = meses[0];
  const ultimo = meses[meses.length - 1];
  const hcInicio = primeiro?.headcount || 0;
  const hcFim = ultimo?.headcount || 0;
  const saidas = meses.reduce((s, d) => s + (d.leavers || 0), 0);
  const entradas = meses.reduce((s, d) => s + (d.joiners || 0), 0);
  const hcMedio = media(meses.map((d) => d.headcount || 0));

  // O turnover do 1º mês da janela usa o mês anterior da série, se houver --
  // cortar a janela em janeiro não apaga dezembro do dado.
  const turnovers = meses.map((d) => {
    const i = ordenada.indexOf(d);
    return calcTurnover(d, i > 0 ? ordenada[i - 1] : undefined);
  });

  const semPromocao = meses.length > 0 && meses.every((d) => d.promotions == null);

  return {
    meses,
    rotulo: primeiro && ultimo ? rotuloIntervalo(primeiro.month, ultimo.month) : '',
    hcInicio,
    hcFim,
    crescimentoPct: hcInicio > 0 ? ((hcFim - hcInicio) / hcInicio) * 100 : 0,
    saidas,
    entradas,
    hcMedio,
    atricaoAcumulada: hcMedio > 0 ? (saidas / hcMedio) * 100 : 0,
    turnoverAcumulado: hcMedio > 0 ? ((entradas + saidas) / 2 / hcMedio) * 100 : 0,
    atricaoMediaMensal: media(meses.map((d) => d.attrition_rate || 0)),
    turnoverMediaMensal: media(turnovers),
    promocoes: semPromocao ? null : meses.reduce((s, d) => s + (d.promotions ?? 0), 0),
  };
}
