/**
 * ===========================================================================
 * O DECK PRÉ-PREENCHIDO, GERADO NO NAVEGADOR A PARTIR DO TEMPLATE
 * ===========================================================================
 * O arquivo em `public/templates/apresentacao-engajamento.pptx` é o template
 * dos HRBPs com três mudanças, e só três:
 *
 *   1. Cada campo de DADO virou uma chave `{{NOME}}`. Os campos de LEITURA do
 *      HRBP ficaram como estavam ("[ANÁLISE DO HRBP ...]"), para o deck sair
 *      com a mesma divisão de trabalho que o template pede.
 *   2. Os apêndices por driver e a biblioteca de perguntas já vêm duplicados
 *      (10 e 3 slides), com tabelas de capacidade fixa.
 *   3. Os lugares de "COLE A VISÃO DO DASHBOARD" viraram gráficos NATIVOS do
 *      PowerPoint, com dados de mentira. Aqui eles recebem os dados reais --
 *      no cache que o PowerPoint desenha E na planilha embutida que ele abre
 *      em "Editar dados". Trocar só o cache faria o gráfico voltar aos dados
 *      de mentira na primeira edição.
 *
 * Por que no navegador: o dado já está na tela, escopado pelo servidor. Gerar
 * no servidor pediria um segundo caminho até ele -- e segundo caminho para o
 * mesmo dado é onde a permissão costuma ficar para trás.
 */
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import type { DadosGrafico } from './dados';

/** Parte do template que desenha cada gráfico. Gerado junto com o template -- ver MANIFESTO_GRAFICOS no script. */
export const MANIFESTO_GRAFICOS: Record<string, string> = {
  s5_enps: 'ppt/charts/chart1.xml',
  s5_risco: 'ppt/charts/chart2.xml',
  s9_funcao: 'ppt/charts/chart3.xml',
  s9_tempo: 'ppt/charts/chart4.xml',
  d0: 'ppt/charts/chart5.xml',
  d1: 'ppt/charts/chart6.xml',
  d2: 'ppt/charts/chart7.xml',
  d3: 'ppt/charts/chart8.xml',
  d4: 'ppt/charts/chart9.xml',
  d5: 'ppt/charts/chart10.xml',
  d6: 'ppt/charts/chart11.xml',
  d7: 'ppt/charts/chart12.xml',
  d8: 'ppt/charts/chart13.xml',
  d9: 'ppt/charts/chart14.xml',
  h_enps: 'ppt/charts/chart15.xml',
  h_sat: 'ppt/charts/chart16.xml',
  h_risco: 'ppt/charts/chart17.xml',
  h_drivers: 'ppt/charts/chart18.xml',
  g_tempo: 'ppt/charts/chart19.xml',
  g_funcao: 'ppt/charts/chart20.xml',
  g_marca: 'ppt/charts/chart21.xml',
  g_modelo: 'ppt/charts/chart22.xml',
};

const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const NS_C = 'http://schemas.openxmlformats.org/drawingml/2006/chart';
const NS_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const DECLARACAO = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const CHAVE = /\{\{([A-Z0-9_]+)\}\}/g;
/** Célula de tabela de capacidade fixa: sem valor, a LINHA inteira sai. */
const CELULA = /^[A-Z0-9]+_R\d+_C\d+$/;

export interface XmlDeps {
  DOMParser: { new (): { parseFromString(s: string, tipo: string): Document } };
  XMLSerializer: { new (): { serializeToString(n: Node): string } };
}
const depsPadrao = (): XmlDeps => ({
  DOMParser: (globalThis as unknown as XmlDeps).DOMParser,
  XMLSerializer: (globalThis as unknown as XmlDeps).XMLSerializer,
});

function ancestral(el: Element, ns: string, nome: string): Element | null {
  let n: Node | null = el.parentNode;
  while (n) {
    if ((n as Element).namespaceURI === ns && (n as Element).localName === nome) return n as Element;
    n = n.parentNode;
  }
  return null;
}
const filhos = (el: Element, ns: string, nome: string): Element[] =>
  Array.from(el.childNodes).filter((n): n is Element =>
    (n as Element).namespaceURI === ns && (n as Element).localName === nome);
const filho = (el: Element, ns: string, nome: string): Element | null => filhos(el, ns, nome)[0] ?? null;

/** Troca as chaves de um slide. Devolve as chaves que ficaram sem valor (para diagnóstico). */
export function preencherSlide(xml: string, valores: Record<string, string>, deps: XmlDeps = depsPadrao()): { xml: string; faltando: string[] } {
  const doc = new deps.DOMParser().parseFromString(xml, 'application/xml');
  const faltando: string[] = [];
  const linhasParaRemover = new Set<Element>();
  const textos = Array.from(doc.getElementsByTagNameNS(NS_A, 't'));
  for (const t of textos) {
    const original = t.textContent ?? '';
    if (!original.includes('{{')) continue;
    let removerLinha = false;
    const novo = original.replace(CHAVE, (_m, k: string) => {
      if (k in valores) return valores[k];
      if (CELULA.test(k)) { removerLinha = true; return ''; }
      faltando.push(k);
      return '—';
    });
    t.textContent = novo;
    if (removerLinha) {
      const tr = ancestral(t, NS_A, 'tr');
      if (tr) linhasParaRemover.add(tr);
    }
  }
  for (const tr of linhasParaRemover) tr.parentNode?.removeChild(tr);
  const saida = new deps.XMLSerializer().serializeToString(doc).replace(/^<\?xml[^>]*\?>\s*/, '');
  return { xml: DECLARACAO + saida, faltando };
}

/** Coluna de planilha a partir do índice (0 -> A). */
const col = (i: number) => String.fromCharCode(65 + i);

/** Reescreve séries, categorias e valores de um gráfico de barras do template. */
export function preencherGrafico(xml: string, g: DadosGrafico, deps: XmlDeps = depsPadrao()): string {
  const doc = new deps.DOMParser().parseFromString(xml, 'application/xml');
  const sers = Array.from(doc.getElementsByTagNameNS(NS_C, 'ser'));
  const nCat = g.categorias.length;
  const mk = (nome: string) => doc.createElementNS(NS_C, `c:${nome}`);
  const pt = (idx: number, v: string) => {
    const p = mk('pt'); p.setAttribute('idx', String(idx));
    const vv = mk('v'); vv.textContent = v; p.appendChild(vv); return p;
  };
  sers.forEach((ser, s) => {
    const dados = g.series[s];
    if (!dados) { ser.parentNode?.removeChild(ser); return; }
    const letra = col(s + 1);
    // nome da série
    const tx = filho(ser, NS_C, 'tx');
    const strRefTx = tx && filho(tx, NS_C, 'strRef');
    if (strRefTx) {
      const cache = filho(strRefTx, NS_C, 'strCache');
      const v = cache ? cache.getElementsByTagNameNS(NS_C, 'v')[0] : null;
      if (v) v.textContent = dados.nome;
      const f = filho(strRefTx, NS_C, 'f'); if (f) f.textContent = `Sheet1!$${letra}$1`;
    }
    // categorias
    const cat = filho(ser, NS_C, 'cat');
    const strRef = cat && filho(cat, NS_C, 'strRef');
    if (strRef) {
      const f = filho(strRef, NS_C, 'f'); if (f) f.textContent = `Sheet1!$A$2:$A$${nCat + 1}`;
      const cache = filho(strRef, NS_C, 'strCache');
      if (cache) {
        while (cache.firstChild) cache.removeChild(cache.firstChild);
        const cnt = mk('ptCount'); cnt.setAttribute('val', String(nCat)); cache.appendChild(cnt);
        g.categorias.forEach((c, i) => cache.appendChild(pt(i, c)));
      }
    }
    // valores: ponto nulo não entra no cache (é "sem dado", não zero)
    const val = filho(ser, NS_C, 'val');
    const numRef = val && filho(val, NS_C, 'numRef');
    if (numRef) {
      const f = filho(numRef, NS_C, 'f'); if (f) f.textContent = `Sheet1!$${letra}$2:$${letra}$${nCat + 1}`;
      const cache = filho(numRef, NS_C, 'numCache');
      if (cache) {
        const fmt = filho(cache, NS_C, 'formatCode');
        while (cache.firstChild) cache.removeChild(cache.firstChild);
        if (fmt) cache.appendChild(fmt);
        const cnt = mk('ptCount'); cnt.setAttribute('val', String(nCat)); cache.appendChild(cnt);
        dados.valores.forEach((v, i) => { if (v != null && Number.isFinite(v)) cache.appendChild(pt(i, String(v))); });
      }
    }
  });
  return DECLARACAO + new deps.XMLSerializer().serializeToString(doc).replace(/^<\?xml[^>]*\?>\s*/, '');
}

/** A planilha que o PowerPoint abre em "Editar dados". */
export function planilhaDoGrafico(g: DadosGrafico): Uint8Array {
  const linhas: Array<Array<string | number | null>> = [['', ...g.series.map((s) => s.nome)]];
  g.categorias.forEach((c, i) => linhas.push([c, ...g.series.map((s) => s.valores[i] ?? null)]));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), 'Sheet1');
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
}

function alvoDaPlanilha(relsXml: string, deps: XmlDeps): string | null {
  const doc = new deps.DOMParser().parseFromString(relsXml, 'application/xml');
  const rel = Array.from(doc.getElementsByTagNameNS(NS_REL, 'Relationship'))
    .find((r) => (r.getAttribute('Type') ?? '').endsWith('/package'));
  const alvo = rel?.getAttribute('Target');
  return alvo ? alvo.replace(/^\.\.\//, 'ppt/') : null;
}

export async function gerarDeck(
  template: ArrayBuffer | Uint8Array,
  valores: Record<string, string>,
  graficos: Record<string, DadosGrafico>,
  deps: XmlDeps = depsPadrao(),
): Promise<{ arquivo: Uint8Array; faltando: string[] }> {
  const zip = await JSZip.loadAsync(template);
  const faltando = new Set<string>();

  const slides = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  for (const nome of slides) {
    const xml = await zip.file(nome)!.async('string');
    if (!xml.includes('{{')) continue;
    const r = preencherSlide(xml, valores, deps);
    r.faltando.forEach((k) => faltando.add(k));
    zip.file(nome, r.xml);
  }

  for (const [chave, parte] of Object.entries(MANIFESTO_GRAFICOS)) {
    const g = graficos[chave];
    const arq = zip.file(parte);
    if (!g || !arq) continue;
    zip.file(parte, preencherGrafico(await arq.async('string'), g, deps));
    const rels = zip.file(parte.replace('charts/', 'charts/_rels/') + '.rels');
    const alvo = rels ? alvoDaPlanilha(await rels.async('string'), deps) : null;
    if (alvo) zip.file(alvo, planilhaDoGrafico(g));
  }

  const arquivo = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  return { arquivo, faltando: [...faltando] };
}
