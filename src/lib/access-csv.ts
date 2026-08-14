import { ACCESS_PROFILES, type AccessProfile, type DashboardTab } from '@/lib/permissions';

/**
 * CSV de usuários: leitura e escrita.
 *
 * ===========================================================================
 * POR QUE ISTO É PURO, E TESTADO À PARTE
 * ===========================================================================
 * Este arquivo transforma texto colado por uma pessoa em CONCESSÃO DE ACESSO.
 * É a única entrada do sistema em que um erro de interpretação -- uma vírgula
 * lida como separador quando estava dentro de aspas, uma coluna deslocada --
 * não gera erro nenhum: gera um usuário com o escopo de outro.
 *
 * Separado da server function porque a parte difícil não é gravar, é ler. E
 * ler tem casos que ninguém reproduz à mão numa tela: campo com vírgula,
 * aspas dentro de aspas, BOM do Excel, linha em branco no fim, CRLF.
 */

// ---------------------------------------------------------------- leitura

/**
 * Divide UMA linha de CSV respeitando aspas.
 *
 * Escrito à mão, e não com split(','), porque `departments` é uma lista e
 * chega como `"TECHNOLOGY,PRODUCT"` -- exatamente o caso que o split quebra.
 * O Excel escreve aspas duplicadas (`""`) para representar uma aspa literal.
 */
export function dividirLinha(linha: string): string[] {
  const out: string[] = [];
  let atual = '';
  let dentroDeAspas = false;

  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (dentroDeAspas) {
      if (c === '"') {
        if (linha[i + 1] === '"') { atual += '"'; i++; } // aspas escapada
        else dentroDeAspas = false;
      } else {
        atual += c;
      }
    } else if (c === '"') {
      dentroDeAspas = true;
    } else if (c === ',' || c === ';') {
      // Aceita ; porque o Excel em português exporta com ponto e vírgula, e
      // recusar isso mandaria a pessoa editar o arquivo à mão para nada.
      out.push(atual.trim());
      atual = '';
    } else {
      atual += c;
    }
  }
  out.push(atual.trim());
  return out;
}

/** Remove o BOM que o Excel põe no começo do arquivo e normaliza a quebra. */
export function linhasDe(texto: string): string[] {
  return texto
    .replace(/^﻿/, '')
    .split(/\r\n|\n|\r/)
    .filter((l) => l.trim().length > 0);
}

export interface LinhaCsv {
  email: string;
  profile: string;
  departments: string[];
  jobFamilies: string[];
  extraTabs: string[];
  jobTitle: string;
  jobLevel: string;
  expiresAt: string;
  /** '', 'sim' ou 'nao'. Vazio = segue o padrão do perfil. */
  canSeeIndividual: string;
}

export interface ProblemaCsv {
  linha: number;
  email: string;
  motivo: string;
}

export interface LeituraCsv {
  linhas: LinhaCsv[];
  problemas: ProblemaCsv[];
  /** Cabeçalhos que vieram no arquivo e não são reconhecidos. */
  ignorados: string[];
}

/** Nomes aceitos por coluna. Minúsculo, sem acento. */
const COLUNAS: Record<keyof LinhaCsv, string[]> = {
  email: ['email', 'e-mail'],
  profile: ['profile', 'perfil'],
  departments: ['departments', 'departamentos', 'departamento'],
  jobFamilies: ['job_families', 'jobfamilies', 'familias', 'job families'],
  extraTabs: ['extra_tabs', 'extratabs', 'abas', 'abas extras'],
  jobTitle: ['job_title', 'cargo'],
  jobLevel: ['job_level', 'level', 'nivel'],
  expiresAt: ['expires_at', 'validade', 'expira em'],
  canSeeIndividual: ['can_see_individual', 'dado individual', 've individual'],
};

const semAcento = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/**
 * Normaliza cabeçalho: `_` vira espaço, espaços repetidos viram um.
 *
 * ------------------------------------------------------------------
 * O BUG QUE ISTO CONSERTA
 * ------------------------------------------------------------------
 * A exportação escrevia `dado_individual` e a importação só reconhecia
 * `dado individual`. A coluna caía como desconhecida e o campo voltava VAZIO
 * -- que não quer dizer "não", quer dizer "segue o padrão do perfil".
 *
 * Na prática: um HRBP explicitamente proibido de ver salário nominal era
 * exportado, editado no Excel, reimportado -- e voltava PODENDO ver, porque
 * o padrão do perfil HRBP é poder. Uma permissão a mais, concedida por uma
 * diferença entre sublinhado e espaço, sem erro em lugar nenhum.
 *
 * Encontrado pelo teste de ida e volta, que era justamente o ponto dele.
 */
const chaveCabecalho = (s: string) => semAcento(s).replace(/_/g, ' ').replace(/\s+/g, ' ');

/** Colunas que a exportação escreve e a importação ignora de propósito. */
const SO_LEITURA = ['ultimo acesso', 'last login at', 'criado em'];

const lista = (v: string): string[] =>
  v.split(/[,;|]/).map((x) => x.trim()).filter(Boolean);

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Lê o CSV inteiro. NUNCA lança: devolve o que entendeu e a lista de
 * problemas, para a prévia mostrar as duas coisas lado a lado.
 *
 * Uma linha com problema é DESCARTADA, não corrigida. Adivinhar o que a
 * pessoa quis dizer num arquivo de permissão é como um acesso errado entra
 * sem ninguém decidir que entraria.
 */
export function lerCsv(texto: string, abasValidas: readonly string[]): LeituraCsv {
  const linhasBrutas = linhasDe(texto);
  if (linhasBrutas.length < 2) {
    return {
      linhas: [], ignorados: [],
      problemas: [{ linha: 0, email: '', motivo: 'O arquivo não tem cabeçalho e ao menos uma linha.' }],
    };
  }

  const cabecalho = dividirLinha(linhasBrutas[0]).map(chaveCabecalho);
  const indice: Partial<Record<keyof LinhaCsv, number>> = {};
  const usados = new Set<number>();

  for (const [campo, nomes] of Object.entries(COLUNAS) as [keyof LinhaCsv, string[]][]) {
    const aceitos = nomes.map(chaveCabecalho);
    const i = cabecalho.findIndex((h) => aceitos.includes(h));
    if (i >= 0) { indice[campo] = i; usados.add(i); }
  }

  // `ultimo acesso` sai na exportacao e nao volta na importacao -- e leitura,
  // nao permissao. Nao entra em `ignorados` para nao virar alarme falso em
  // todo arquivo que veio de uma exportacao.
  const ignorados = cabecalho.filter(
    (h, i) => h.length > 0 && !usados.has(i) && !SO_LEITURA.includes(h),
  );

  const problemas: ProblemaCsv[] = [];
  if (indice.email == null) {
    problemas.push({ linha: 0, email: '', motivo: 'Falta a coluna "email" — sem ela não dá para saber de quem é cada linha.' });
    return { linhas: [], problemas, ignorados };
  }
  if (indice.profile == null) {
    problemas.push({ linha: 0, email: '', motivo: 'Falta a coluna "perfil".' });
    return { linhas: [], problemas, ignorados };
  }

  const linhas: LinhaCsv[] = [];
  const vistos = new Set<string>();

  for (let n = 1; n < linhasBrutas.length; n++) {
    const cols = dividirLinha(linhasBrutas[n]);
    const pega = (c: keyof LinhaCsv): string => {
      const i = indice[c];
      return i == null ? '' : (cols[i] ?? '').trim();
    };

    const email = pega('email').toLowerCase();
    const numero = n + 1; // como a pessoa vê no editor

    if (!email) { problemas.push({ linha: numero, email: '', motivo: 'Sem e-mail.' }); continue; }
    if (!EMAIL_OK.test(email)) {
      problemas.push({ linha: numero, email, motivo: 'E-mail com formato inválido.' });
      continue;
    }
    if (vistos.has(email)) {
      // Duas linhas para o mesmo e-mail: qual vale? Qualquer resposta seria
      // um palpite sobre permissão. Recusa as duas e devolve a decisão.
      problemas.push({ linha: numero, email, motivo: 'E-mail repetido no arquivo — corrija e reenvie.' });
      continue;
    }

    const profile = semAcento(pega('profile')).replace(/\s+/g, '_');
    if (!ACCESS_PROFILES.includes(profile as AccessProfile)) {
      problemas.push({
        linha: numero, email,
        motivo: `Perfil "${pega('profile')}" não existe. Use: ${ACCESS_PROFILES.join(', ')}.`,
      });
      continue;
    }

    const extraTabs = lista(pega('extraTabs'));
    const abaRuim = extraTabs.find((t) => !abasValidas.includes(t as DashboardTab));
    if (abaRuim) {
      problemas.push({ linha: numero, email, motivo: `Aba "${abaRuim}" não existe.` });
      continue;
    }

    const expiresAt = pega('expiresAt');
    if (expiresAt && Number.isNaN(new Date(expiresAt).getTime())) {
      problemas.push({ linha: numero, email, motivo: `Validade "${expiresAt}" não é uma data legível (use AAAA-MM-DD).` });
      continue;
    }

    const ind = semAcento(pega('canSeeIndividual'));
    const canSeeIndividual =
      ind === '' ? ''
      : ['sim', 'true', 's', '1', 'yes'].includes(ind) ? 'sim'
      : ['nao', 'false', 'n', '0', 'no'].includes(ind) ? 'nao'
      : 'ruim';
    if (canSeeIndividual === 'ruim') {
      problemas.push({ linha: numero, email, motivo: 'Dado individual: use "sim", "nao" ou deixe vazio.' });
      continue;
    }

    vistos.add(email);
    linhas.push({
      email,
      profile,
      departments: lista(pega('departments')).map((d) => d.toUpperCase()),
      jobFamilies: lista(pega('jobFamilies')),
      extraTabs,
      jobTitle: pega('jobTitle'),
      jobLevel: pega('jobLevel'),
      expiresAt,
      canSeeIndividual,
    });
  }

  return { linhas, problemas, ignorados };
}

// ---------------------------------------------------------------- escrita

const CABECALHO_EXPORT = [
  'email', 'perfil', 'departamentos', 'job_families', 'abas',
  'cargo', 'level', 'validade', 'dado_individual', 'ultimo_acesso',
] as const;

/** Envolve em aspas quando o valor tem separador, aspas ou quebra de linha. */
export function escaparCampo(v: string | null | undefined): string {
  const s = String(v ?? '');
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export interface LinhaExport {
  email: string;
  profile: string;
  departments?: string[] | null;
  job_families?: string[] | null;
  extra_tabs?: string[] | null;
  job_title?: string | null;
  job_level?: string | null;
  expires_at?: string | null;
  can_see_individual?: boolean | null;
  last_login_at?: string | null;
}

/**
 * O arquivo exportado é o MESMO formato que a importação lê. Não é detalhe:
 * é o que permite exportar, editar no Excel e reimportar sem traduzir nada à
 * mão -- que é como um time inteiro entra de uma vez.
 */
export function gerarCsv(linhas: LinhaExport[]): string {
  const corpo = linhas.map((r) => [
    r.email,
    r.profile,
    (r.departments ?? []).join(','),
    (r.job_families ?? []).join(','),
    (r.extra_tabs ?? []).join(','),
    r.job_title ?? '',
    r.job_level ?? '',
    r.expires_at ? String(r.expires_at).slice(0, 10) : '',
    r.can_see_individual == null ? '' : r.can_see_individual ? 'sim' : 'nao',
    r.last_login_at ? String(r.last_login_at).slice(0, 10) : '',
  ].map(escaparCampo).join(','));

  // BOM: sem ele o Excel abre "José" como "JosÃ©". O arquivo é para ser
  // editado no Excel, então ele manda no formato.
  return '﻿' + [CABECALHO_EXPORT.join(','), ...corpo].join('\r\n');
}
