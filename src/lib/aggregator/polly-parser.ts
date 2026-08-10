import {
  canonArea, canonGestor, canonMarca, canonTempo, limpa,
  type PollyResponse,
} from './polly-survey';

/**
 * Leitura do export do Polly a partir do cabeçalho, não da posição da coluna.
 *
 * ------------------------------------------------------------------
 * POR QUE NÃO POR ÍNDICE
 * ------------------------------------------------------------------
 * As três ondas já têm layouts diferentes: jun/25 tem 13 colunas e nenhum
 * driver; jul/25 tem 30 colunas e 10 drivers, mas nenhuma pergunta de eNPS;
 * jan/26 tem 82 colunas com tudo junto, além de função e marca, que não
 * existiam antes. A onda de jul/26 quase certamente terá outro layout de novo.
 *
 * Ler por índice significaria um mapa novo a cada onda -- e, pior, um mapa
 * errado falha em silêncio: a coluna 15 de uma onda é retenção, de outra é
 * satisfação, e o número sai plausível. Reconhecer pelo texto do cabeçalho
 * falha alto: a pergunta não é encontrada e o campo vem null.
 *
 * ------------------------------------------------------------------
 * COMO AS PERGUNTAS SÃO RECONHECIDAS
 * ------------------------------------------------------------------
 * Por trecho característico, minúsculo e sem acento, escolhido para sobreviver
 * a reescrita de enunciado. "recomendar nossa organizacao" continua batendo se
 * alguém trocar "ótimo lugar para trabalhar" por "excelente lugar".
 *
 * As colunas "(comment) ..." são reconhecidas e DESCARTADAS de propósito -- e
 * precisam ser reconhecidas antes, senão o texto do comentário casa com o
 * mesmo trecho da pergunta e sobrescreve a nota.
 */

/** Remove acento e baixa a caixa, para o match não depender de grafia. */
function chave(s: string): string {
  return limpa(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

const MARCADORES = {
  nps: 'recomendar nossa organizacao',
  retencao: 'permanecer trabalhando aqui',
  satisfacao: 'nivel de satisfacao trabalhando',
  area: 'sua area de atuacao',
  tempo: 'tempo voce trabalha na organizacao',
  funcao: 'descreve melhor sua funcao',
  marca: 'qual marca voce atua',
} as const;

/**
 * Drivers vêm como `[Bloco] "Pergunta" (1 = Discordo...)`. Em jul/25 o bloco
 * não existe: a pergunta vem solta. Nesse caso o driver fica "Geral", para a
 * pergunta não se perder -- é o mesmo enunciado das ondas seguintes e o que
 * permite comparar.
 */
function parseDriverHeader(h: string): { driver: string; question: string } | null {
  const s = limpa(h);
  if (!/\(1\s*=/.test(s)) return null; // sem a escala declarada, não é driver
  const comBloco = s.match(/^\[([^\]]+)\]\s*[""“]?(.+?)[""”]?\s*\(1\s*=/);
  if (comBloco) return { driver: limpa(comBloco[1]), question: limpa(comBloco[2]) };
  const semBloco = s.match(/^[""“]?(.+?)[""”]?\s*\(1\s*=/);
  return semBloco ? { driver: 'Geral', question: limpa(semBloco[1]) } : null;
}

function num(v: string | undefined): number | null {
  const s = limpa(v);
  if (!s) return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export interface ParseResult {
  responses: PollyResponse[];
  /** O que foi reconhecido, para conferência antes de gravar. */
  encontrado: {
    nps: boolean; retencao: boolean; satisfacao: boolean;
    area: boolean; tempo: boolean; funcao: boolean; marca: boolean;
    drivers: number;
  };
  /** Cabeçalhos que não viraram nada. Nem todos são problema -- Polly Id não é. */
  ignorados: string[];
}

/**
 * @param rows linhas do CSV já divididas, incluindo o cabeçalho na posição 0.
 */
export function parsePollyExport(rows: string[][]): ParseResult {
  if (!rows.length) {
    return {
      responses: [],
      encontrado: { nps: false, retencao: false, satisfacao: false, area: false, tempo: false, funcao: false, marca: false, drivers: 0 },
      ignorados: [],
    };
  }

  const header = rows[0];
  const idx: Partial<Record<keyof typeof MARCADORES, number>> = {};
  const driverCols: Array<{ col: number; driver: string; question: string }> = [];
  const ignorados: string[] = [];

  header.forEach((h, i) => {
    const k = chave(h);
    if (!k) return;
    // Comentário livre: reconhecido para ser descartado. Precisa vir primeiro,
    // senão o texto casa com o marcador da pergunta que ele comenta.
    if (k.startsWith('(comment)')) return;

    for (const [campo, marca] of Object.entries(MARCADORES) as Array<[keyof typeof MARCADORES, string]>) {
      if (k.includes(marca) && idx[campo] == null) { idx[campo] = i; return; }
    }
    const d = parseDriverHeader(h);
    if (d) { driverCols.push({ col: i, ...d }); return; }
    ignorados.push(limpa(h));
  });

  const responses: PollyResponse[] = rows.slice(1)
    // Linha sem nenhuma célula preenchida: o export traz algumas no fim.
    .filter((r) => r.some((c) => limpa(c)))
    .map((r) => {
      const drivers: Record<string, number> = {};
      for (const d of driverCols) {
        const v = num(r[d.col]);
        // Nota fora de 1-5 é erro de leitura, não resposta. Descartar é melhor
        // que deixar entrar na média e ninguém perceber.
        if (v != null && v >= 1 && v <= 5) drivers[`${d.driver}||${d.question}`] = v;
      }
      return {
        area: idx.area != null ? canonArea(r[idx.area]) : null,
        tempoCasa: idx.tempo != null ? canonTempo(r[idx.tempo]) : null,
        gestor: idx.funcao != null ? canonGestor(r[idx.funcao]) : null,
        marca: idx.marca != null ? canonMarca(r[idx.marca]) : null,
        nps: idx.nps != null ? num(r[idx.nps]) : null,
        retencao: idx.retencao != null ? num(r[idx.retencao]) : null,
        satisfacao: idx.satisfacao != null ? num(r[idx.satisfacao]) : null,
        drivers,
      };
    });

  return {
    responses,
    encontrado: {
      nps: idx.nps != null, retencao: idx.retencao != null, satisfacao: idx.satisfacao != null,
      area: idx.area != null, tempo: idx.tempo != null, funcao: idx.funcao != null, marca: idx.marca != null,
      drivers: driverCols.length,
    },
    ignorados,
  };
}
