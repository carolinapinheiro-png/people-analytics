import { Languages } from 'lucide-react';
import { setLocale, tx, useLocale, type Locale } from '@/lib/i18n';

const IDIOMAS: { k: Locale; sigla: string; nome: string }[] = [
  { k: 'pt', sigla: 'PT-BR', nome: 'Português' },
  { k: 'en', sigla: 'EN', nome: 'English' },
];

/**
 * Seletor de idioma, no canto superior direito.
 *
 * Controle segmentado, e não lista como os filtros ao lado: são só duas
 * opções, cabem, e ver a outra opção É a função -- quem não lê português
 * precisa achar "EN" sem abrir nada. Pelo mesmo motivo os nomes dos idiomas
 * ficam sempre no próprio idioma ("English", não "Inglês") no title.
 */
export default function SeletorIdioma() {
  const locale = useLocale();
  return (
    <div
      role="group"
      aria-label={tx('Idioma')}
      title={tx('Idioma')}
      className="flex items-center gap-0.5 rounded-full border border-border p-0.5 shrink-0"
    >
      <Languages className="h-3.5 w-3.5 mx-1 text-muted-foreground" aria-hidden />
      {IDIOMAS.map((i) => {
        const ativo = locale === i.k;
        return (
          <button
            key={i.k}
            type="button"
            onClick={() => setLocale(i.k)}
            aria-pressed={ativo}
            title={tx(i.nome)}
            lang={i.k === 'en' ? 'en' : 'pt-BR'}
            className={
              'rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide transition-colors ' +
              (ativo
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary')
            }
          >
            {tx(i.sigla)}
          </button>
        );
      })}
    </div>
  );
}
