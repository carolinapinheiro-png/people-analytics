import { describe, it, expect } from 'vitest';
import {
  resolverPeriodo, trimestreDe, rotuloMes, rotuloTrimestre,
  periodoAplicavel, PERIODO_INDISPONIVEL,
} from './periodo';

describe('trimestreDe', () => {
  it('devolve os tres meses do trimestre', () => {
    expect(trimestreDe('2026-08')).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(trimestreDe('2026-01')).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(trimestreDe('2026-12')).toEqual(['2026-10', '2026-11', '2026-12']);
  });
  it('aceita data completa', () => {
    expect(trimestreDe('2026-05-01')).toEqual(['2026-04', '2026-05', '2026-06']);
  });
});

describe('resolverPeriodo', () => {
  it('mensal recorta um mes so', () => {
    const p = resolverPeriodo({ view: 'monthly', currentMonth: '2026-07', activeYear: '2026' });
    expect(p.tipo).toBe('mes');
    expect(p.meses).toEqual(['2026-07']);
    expect(p.contem('2026-07')).toBe(true);
    expect(p.contem('2026-06')).toBe(false);
    expect(p.label).toBe('jul/2026');
  });

  it('trimestral recorta o trimestre que contem o mes', () => {
    const p = resolverPeriodo({ view: 'quarterly', currentMonth: '2026-08', activeYear: '2026' });
    expect(p.tipo).toBe('trimestre');
    expect(p.contem('2026-07')).toBe(true);
    expect(p.contem('2026-09-30')).toBe(true);
    expect(p.contem('2026-06')).toBe(false);
    expect(p.label).toBe('2026 Q3');
  });

  it('sem ano em escopo nao recorta nada', () => {
    const p = resolverPeriodo({ view: 'monthly', currentMonth: '2026-07', activeYear: null });
    expect(p.tipo).toBe('todos');
    expect(p.contem('2013-03')).toBe(true);
    expect(p.ateOFim('2013-03')).toBe(true);
  });

  it('sem mes resolvido ainda nao recorta nada', () => {
    const p = resolverPeriodo({ view: 'monthly', currentMonth: '', activeYear: '2026' });
    expect(p.tipo).toBe('todos');
  });

  it('ateOFim mantem a historia do ano ate o mes escolhido', () => {
    const p = resolverPeriodo({ view: 'monthly', currentMonth: '2026-07', activeYear: '2026' });
    expect(p.ateOFim('2026-01')).toBe(true);
    expect(p.ateOFim('2026-07')).toBe(true);
    expect(p.ateOFim('2026-08')).toBe(false);
    expect(p.ateOFim('2025-12')).toBe(false);
    expect(p.ateOFim(null)).toBe(false);
  });

  it('trimestral: a serie vai ate o fim do trimestre', () => {
    const p = resolverPeriodo({ view: 'quarterly', currentMonth: '2026-08', activeYear: '2026' });
    expect(p.ateOFim('2026-09')).toBe(true);
    expect(p.ateOFim('2026-10')).toBe(false);
  });
});

describe('rotulos', () => {
  it('formata mes e trimestre', () => {
    expect(rotuloMes('2026-03')).toBe('mar/2026');
    expect(rotuloTrimestre('2026-03')).toBe('2026 Q1');
  });
});

describe('periodoAplicavel', () => {
  it('as abas de foto do presente estao declaradas', () => {
    expect(periodoAplicavel('span')).toBe(false);
    expect(periodoAplicavel('team')).toBe(false);
    expect(periodoAplicavel('individual')).toBe(false);
    expect(periodoAplicavel('overview')).toBe(true);
    expect(periodoAplicavel('attrition')).toBe(true);
  });
  it('todo motivo declarado tem frase', () => {
    for (const [tab, motivo] of Object.entries(PERIODO_INDISPONIVEL)) {
      expect(motivo.length, tab).toBeGreaterThan(40);
    }
  });
});
