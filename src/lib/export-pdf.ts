import jsPDF from 'jspdf';
// `html2canvas` puro não entende oklch()/oklab() -- e o Tailwind v4 deste
// projeto usa esse formato por padrão em quase toda cor, inclusive no espaço
// de interpolação dos gradientes ("in oklab"). Tentar reescrever cor por cor
// no clone era perseguição sem fim; `html2canvas-pro` é o mesmo motor com
// suporte nativo a oklch/oklab/lab/lch, então a captura não precisa saber
// que o tema usa esse formato.
import html2canvas from 'html2canvas-pro';
import logoUrl from '@/assets/flutter-logo.webp';
import { semFiltro, valorFiltro } from '@/lib/filtro-sentinela';

/**
 * Exportação da sub-aba de Engajamento para PDF.
 *
 * A imagem sai do DOM já renderizado, então os filtros ativos vêm de graça --
 * não há lógica de filtro duplicada aqui. A capa existe para que o PDF, longe
 * da tela, ainda diga de qual recorte ele fala.
 *
 * ------------------------------------------------------------------
 * A PAGINAÇÃO RESPEITA OS CARTÕES
 * ------------------------------------------------------------------
 * A primeira versão fatiava a imagem em alturas fixas, sem olhar pro que
 * tinha dentro -- um cartão de gráfico podia sair com a metade de cima numa
 * página e a de baixo na seguinte. Lido fora da tela, isso parece defeito,
 * mesmo a informação estando toda lá.
 *
 * Os componentes que não podem ser cortados marcam a própria raiz com
 * `data-pdf-block="true"` (ChartCard, o grid de KPIs, EngagementReading,
 * SurveyTimeline, TituloBloco). Antes de fatiar, esta função lê a posição de
 * cada um desses blocos e empurra o corte de página para ANTES do bloco --
 * ele inteiro migra pra próxima página -- a menos que o bloco sozinho já seja
 * maior que uma página inteira, caso em que não tem corte que resolva e ele é
 * atravessado mesmo (ver `pontosDeCorte`).
 */

export type ExportOpts = {
  departamento?: string | null;
  tempoCasa?: string | null;
  modeloTrabalho?: string | null;
  marcaProduto?: string | null;
  ondaLabel?: string | null;
  janela?: string | null;
};

const A4 = { w: 210, h: 297 };
const MARGEM = 12;
const ESCALA = 2;
// Espaço reservado em cada página de CONTEÚDO para o cabeçalho (título curto
// + número de página) e o rodapé (data de geração). A capa não usa isto --
// ela tem o próprio layout, desenhado à parte.
const CABECALHO_H = 11;
const RODAPE_H = 7;

function rotulo(v: string | null | undefined): string {
  return valorFiltro(v) ?? 'Todos';
}

function slug(v: string): string {
  return v
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'flutter-brazil';
}

function dataArquivo(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function tituloCurto(opts: ExportOpts): string {
  const area = rotulo(opts.departamento);
  return area === 'Todos'
    ? 'Relatório de Engajamento — Flutter Brazil'
    : `Relatório de Engajamento — ${area}`;
}

async function carregarLogo(): Promise<string | null> {
  try {
    const res = await fetch(logoUrl);
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0);
    return canvas.toDataURL('image/png');
  } catch {
    // Capa sem logo é melhor do que exportação falhada.
    return null;
  }
}

function desenharCapa(pdf: jsPDF, opts: ExportOpts, logo: string | null) {
  let y = MARGEM + 8;

  if (logo) {
    pdf.addImage(logo, 'PNG', MARGEM, y, 42, 42 * 0.35, undefined, 'FAST');
    y += 24;
  }

  pdf.setTextColor(20, 20, 20);
  pdf.setFontSize(24);
  pdf.text('Relatório de Engajamento', MARGEM, y);
  y += 10;

  const sub = [opts.ondaLabel, opts.janela].filter(Boolean).join(' · ');
  if (sub) {
    pdf.setFontSize(12);
    pdf.setTextColor(90, 90, 90);
    pdf.text(sub, MARGEM, y);
    y += 12;
  } else {
    y += 6;
  }

  pdf.setDrawColor(220, 220, 220);
  pdf.line(MARGEM, y, A4.w - MARGEM, y);
  y += 12;

  pdf.setTextColor(20, 20, 20);
  pdf.setFontSize(13);
  pdf.text('Filtros aplicados', MARGEM, y);
  y += 8;

  const linhas: Array<[string, string]> = [
    ['Área', rotulo(opts.departamento)],
    ['Tempo de casa', rotulo(opts.tempoCasa)],
    ['Modelo de trabalho', rotulo(opts.modeloTrabalho)],
    ['Marca de produto', rotulo(opts.marcaProduto)],
  ];
  pdf.setFontSize(11);
  for (const [k, v] of linhas) {
    pdf.setTextColor(110, 110, 110);
    pdf.text(`${k}:`, MARGEM, y);
    pdf.setTextColor(20, 20, 20);
    pdf.text(v, MARGEM + 44, y);
    y += 7;
  }

  y += 8;
  pdf.setFontSize(10);
  pdf.setTextColor(110, 110, 110);
  pdf.text(
    `Gerado em ${new Date().toLocaleString('pt-BR')}`,
    MARGEM,
    y,
  );

  pdf.setFontSize(8);
  pdf.setTextColor(150, 150, 150);
  pdf.text(
    'Gerado automaticamente pelo People Analytics — Flutter Brazil',
    MARGEM,
    A4.h - MARGEM,
  );
}

// Cabeçalho repetido em toda página de conteúdo: título curto à esquerda,
// número de página à direita, com uma linha fina separando do gráfico.
function desenharCabecalho(
  pdf: jsPDF,
  opts: ExportOpts,
  pagina: number,
  totalPaginas: number,
) {
  const y = MARGEM + 3;
  pdf.setFontSize(9);
  pdf.setTextColor(90, 90, 90);
  pdf.text(tituloCurto(opts), MARGEM, y);
  pdf.text(`Página ${pagina} de ${totalPaginas}`, A4.w - MARGEM, y, { align: 'right' });
  pdf.setDrawColor(225, 225, 225);
  pdf.line(MARGEM, y + 3, A4.w - MARGEM, y + 3);
}

// Rodapé repetido: só a data de geração, discreta -- quem recebe o PDF fora
// do contexto do Slack (ou impresso) ainda sabe de quando é o número.
function desenharRodape(pdf: jsPDF, dataGeracao: string) {
  const y = A4.h - MARGEM + 4;
  pdf.setFontSize(7.5);
  pdf.setTextColor(150, 150, 150);
  pdf.text(`Gerado em ${dataGeracao}`, MARGEM, y);
  pdf.text('People Analytics — Flutter Brazil', A4.w - MARGEM, y, { align: 'right' });
}

type Bloco = { top: number; bottom: number };

// Posição (em px do canvas capturado, já multiplicada pela escala) de cada
// elemento marcado com `data-pdf-block`, relativa ao topo do elemento
// exportado -- é com esses limites que os cortes de página desviam.
function blocosProtegidos(element: HTMLElement, escala: number): Bloco[] {
  const raiz = element.getBoundingClientRect();
  return Array.from(element.querySelectorAll<HTMLElement>('[data-pdf-block]')).map((no) => {
    const r = no.getBoundingClientRect();
    return {
      top: (r.top - raiz.top) * escala,
      bottom: (r.bottom - raiz.top) * escala,
    };
  });
}

// Onde cortar a imagem entre páginas. Parte de fatias de altura fixa
// (`fatiaMaxPx`) e, sempre que um corte cairia DENTRO de um bloco protegido,
// empurra o corte para o topo do bloco -- ele inteiro migra pra próxima
// página. Só não empurra quando isso deixaria a página atual vazia demais
// (bloco maior que a própria página, ou colado no topo dela): nesse caso o
// bloco é atravessado mesmo, por não caber inteiro em página nenhuma.
function pontosDeCorte(alturaTotalPx: number, fatiaMaxPx: number, blocos: Bloco[]): number[] {
  const pontos = [0];
  let atual = 0;
  while (atual < alturaTotalPx) {
    let proximo = Math.min(atual + fatiaMaxPx, alturaTotalPx);
    const bloco = blocos.find((b) => proximo > b.top && proximo < b.bottom);
    if (bloco && bloco.top - atual > fatiaMaxPx * 0.25) {
      proximo = bloco.top;
    }
    if (proximo <= atual) proximo = Math.min(atual + fatiaMaxPx, alturaTotalPx);
    pontos.push(proximo);
    atual = proximo;
  }
  return pontos;
}

export async function exportEngagementPdf(
  element: HTMLElement,
  opts: ExportOpts = {},
): Promise<void> {
  // Medido ANTES da captura: depois que `html2canvas` clona o elemento pra
  // um iframe fora da tela, a posição na tela real é a que importa aqui.
  const blocos = blocosProtegidos(element, ESCALA);

  const canvas = await html2canvas(element, {
    backgroundColor: '#ffffff',
    scale: ESCALA,
    useCORS: true,
    logging: false,
    windowWidth: element.scrollWidth,
  });

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const logo = await carregarLogo();
  desenharCapa(pdf, opts, logo);

  const larguraUtil = A4.w - MARGEM * 2;
  const alturaConteudoUtil = A4.h - MARGEM * 2 - CABECALHO_H - RODAPE_H;
  // Quantos pixels da imagem cabem numa página, na escala em que ela entra.
  const pxPorMm = canvas.width / larguraUtil;
  const fatiaMaxPx = Math.floor(alturaConteudoUtil * pxPorMm);

  const cortes = pontosDeCorte(canvas.height, fatiaMaxPx, blocos)
    .filter((v, i, arr) => i === 0 || v > arr[i - 1]); // descarta fatias de altura zero

  const dataGeracao = new Date().toLocaleString('pt-BR');
  const totalPaginas = cortes.length - 1;

  for (let i = 0; i < totalPaginas; i++) {
    const topo = cortes[i];
    const baixo = cortes[i + 1];
    const altura = baixo - topo;

    const fatia = document.createElement('canvas');
    fatia.width = canvas.width;
    fatia.height = altura;
    const ctx = fatia.getContext('2d');
    if (!ctx) break;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, fatia.width, fatia.height);
    ctx.drawImage(canvas, 0, topo, canvas.width, altura, 0, 0, canvas.width, altura);

    pdf.addPage();
    desenharCabecalho(pdf, opts, i + 1, totalPaginas);
    pdf.addImage(
      fatia.toDataURL('image/jpeg', 0.92),
      'JPEG',
      MARGEM,
      MARGEM + CABECALHO_H,
      larguraUtil,
      altura / pxPorMm,
      undefined,
      'FAST',
    );
    desenharRodape(pdf, dataGeracao);
  }

  const area = semFiltro(opts.departamento)
    ? 'flutter-brazil'
    : slug(valorFiltro(opts.departamento)!);
  pdf.save(`relatorio-engajamento-${area}-${dataArquivo(new Date())}.pdf`);
}
