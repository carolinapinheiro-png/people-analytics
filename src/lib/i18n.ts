import { useSyncExternalStore } from 'react';
import { EN } from '@/lib/i18n-en';

/**
 * IDIOMA DA INTERFACE (PT-BR / EN)
 * ---------------------------------------------------------------------------
 * A chave de tradução é o PRÓPRIO texto em português. `tx('Mês anterior')`
 * devolve 'Previous month' em inglês e 'Mês anterior' em português. Três
 * razões para não usar chaves abstratas ('topbar.prevMonth'):
 *
 *   1. O código continua legível em português, que é a língua de quem mantém.
 *   2. Tradução faltando não quebra nada: cai no texto original. O pior caso
 *      de uma frase esquecida é ela aparecer em português na tela em inglês.
 *   3. `tx()` em texto que veio do banco (nome de área, pergunta de pesquisa)
 *      é inofensivo: sem entrada no dicionário, o texto passa intacto.
 *
 * O que NÃO se traduz aqui: dado. Nome de departamento, texto de pergunta de
 * pesquisa, valores do Convenia. Isso é conteúdo, não interface.
 *
 * Interpolação: `tx('{0} pessoas', [n])`. As posições numeradas deixam a
 * tradução reordenar ('{0} de {1}' -> '{1}'s {0}') sem mexer no código.
 *
 * `tx()` é uma função comum, não um hook, de propósito: precisa funcionar em
 * qualquer ponto do render, inclusive em helpers chamados por componentes.
 * O que garante que tudo re-renderize na troca é o `key={locale}` no __root.
 * NUNCA chame `tx()` no nível do módulo (fora de função): ali ele roda uma
 * vez só, no idioma do momento do import, e fica congelado.
 */
export type Locale = 'pt' | 'en';

const STORAGE_KEY = 'locale';
const listeners = new Set<() => void>();

function lerSalvo(): Locale {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'pt' || v === 'en') return v;
  } catch {
    /* ambiente sem storage: ignora */
  }
  return 'pt';
}

// Começa SEMPRE em português, inclusive no navegador: o primeiro render do
// cliente precisa bater com o HTML do servidor. O idioma salvo entra logo
// depois, por `carregarLocaleSalvo()` num efeito do __root.
let atual: Locale = 'pt';

export function carregarLocaleSalvo() {
  if (typeof window === 'undefined') return;
  setLocale(lerSalvo());
}

export function getLocale(): Locale {
  return atual;
}

export function setLocale(l: Locale) {
  if (l === atual) return;
  atual = l;
  try {
    localStorage.setItem(STORAGE_KEY, l);
  } catch {
    /* ignora */
  }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = l === 'en' ? 'en' : 'pt-BR';
  }
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * O servidor sempre renderiza em português (não enxerga o localStorage). O
 * `getServerSnapshot` devolve 'pt' para a hidratação bater; logo depois o
 * React re-renderiza com o idioma salvo. Sem isso, quem escolheu inglês veria
 * erro de hidratação em vez de uma troca.
 */
export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getLocale, () => 'pt');
}

function interpolar(s: string, vars?: ReadonlyArray<unknown>): string {
  if (!vars || vars.length === 0) return s;
  return s.replace(/\{(\d+)\}/g, (m, i) => {
    const v = vars[Number(i)];
    return v === undefined || v === null ? '' : String(v);
  });
}

// Aceita null/undefined e devolve o mesmo: rótulos opcionais ({sub ?? ...})
// passam direto, sem cada chamada precisar de guarda.
export function tx(pt: string, vars?: ReadonlyArray<unknown>): string;
export function tx<T extends null | undefined>(pt: string | T, vars?: ReadonlyArray<unknown>): string | T;
export function tx(pt: string | null | undefined, vars?: ReadonlyArray<unknown>): string | null | undefined {
  if (typeof pt !== 'string') return pt;
  if (atual === 'pt') return interpolar(pt, vars);
  const en = EN[pt] ?? EN[pt.trim()];
  return interpolar(en ?? pt, vars);
}

/** Locale para toLocaleString / Intl. Números seguem o idioma da interface. */
export function numLocale(): string {
  return atual === 'en' ? 'en-US' : 'pt-BR';
}

const MESES_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_EN = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * Abreviações de mês no idioma atual, minúsculas ('fev' / 'feb'). Função, e
 * não constante, pelo mesmo motivo de tx(): lida na hora do render.
 * `maiuscula` devolve 'Fev' / 'Feb'.
 */
export function mesesCurtos(maiuscula = false): string[] {
  const m = atual === 'en' ? MESES_EN : MESES_PT;
  return maiuscula ? m.map((s) => s[0].toUpperCase() + s.slice(1)) : m;
}
