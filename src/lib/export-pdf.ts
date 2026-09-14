import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import logoUrl from '@/assets/flutter-logo.webp';
import { semFiltro, valorFiltro } from '@/lib/filtro-sentinela';

/**
 * Exportação da sub-aba de Engajamento para PDF.
 *
 * A imagem sai do DOM já renderizado, então os filtros ativos vêm de graça --
 * não há lógica de filtro duplicada aqui. A capa existe para que o PDF, longe
 * da tela, ainda diga de qual recorte ele fala.
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

// Resolve oklch()/oklab() para rgb() usando o próprio browser: atribuir a
// fillStyle de um canvas 2d converte a cor, e lê-la de volta já vem em rgb().
function paraRgb(cor: string): string {
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return cor;
  try {
    ctx.fillStyle = '#000';
    ctx.fillStyle = cor;
    return ctx.fillStyle as string;
  } catch {
    return cor;
  }
}

// html2canvas não entende oklch()/oklab() (usados por alguns tokens do tema,
// ex. --border no modo escuro) e quebra a captura. Isto varre o DOM CLONADO
// que o html2canvas usa internamente (nunca a tela visível) e substitui
// qualquer cor computada nesse formato por rgb() equivalente.
function converterOklch(clonedDoc: Document) {
  const PROPS = [
    'color', 'background-color', 'border-top-color', 'border-right-color',
    'border-bottom-color', 'border-left-color', 'outline-color',
    'fill', 'stroke', 'stop-color',
  ];
  const view = clonedDoc.defaultView;
  if (!view) return;

  const nos = clonedDoc.querySelectorAll<HTMLElement>('*');
  nos.forEach((no) => {
    const computado = view.getComputedStyle(no);
    for (const prop of PROPS) {
      const valor = computado.getPropertyValue(prop);
      if (valor && (valor.includes('oklch(') || valor.includes('oklab('))) {
        no.style.setProperty(prop, paraRgb(valor), 'important');
      }
    }
  });
}

export async function exportEngagementPdf(
  element: HTMLElement,
  opts: ExportOpts = {},
): Promise<void> {
  const canvas = await html2canvas(element, {
    backgroundColor: '#ffffff',
    scale: 2,
    useCORS: true,
    logging: false,
    windowWidth: element.scrollWidth,
    onclone: converterOklch,
  });

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const logo = await carregarLogo();
  desenharCapa(pdf, opts, logo);

  const larguraUtil = A4.w - MARGEM * 2;
  const alturaUtil = A4.h - MARGEM * 2;
  // Quantos pixels da imagem cabem numa página, na escala em que ela entra.
  const pxPorMm = canvas.width / larguraUtil;
  const fatiaPx = Math.floor(alturaUtil * pxPorMm);

  for (let topo = 0; topo < canvas.height; topo += fatiaPx) {
    const altura = Math.min(fatiaPx, canvas.height - topo);
    const fatia = document.createElement('canvas');
    fatia.width = canvas.width;
    fatia.height = altura;
    const ctx = fatia.getContext('2d');
    if (!ctx) break;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, fatia.width, fatia.height);
    ctx.drawImage(canvas, 0, topo, canvas.width, altura, 0, 0, canvas.width, altura);

    pdf.addPage();
    pdf.addImage(
      fatia.toDataURL('image/jpeg', 0.92),
      'JPEG',
      MARGEM,
      MARGEM,
      larguraUtil,
      altura / pxPorMm,
      undefined,
      'FAST',
    );
  }

  const area = semFiltro(opts.departamento)
    ? 'flutter-brazil'
    : slug(valorFiltro(opts.departamento)!);
  pdf.save(`relatorio-engajamento-${area}-${dataArquivo(new Date())}.pdf`);
}
