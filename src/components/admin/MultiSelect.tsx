import { useState } from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';

/**
 * Selecao multipla em dropdown, no lugar de despejar a lista inteira na tela.
 *
 * Por que trocamos os "chips" expostos:
 *  - eram ~30 opcoes visiveis de uma vez (responsabilidades + departamentos +
 *    familias), empurrando o botao de acao para fora da tela;
 *  - o estado de HOVER (texto claro) ficava parecido demais com o de
 *    SELECIONADO (fundo preenchido). Num tema escuro os dois liam como
 *    "ativo" -- da para olhar a tela e jurar que marcou algo que nao marcou.
 *    Aqui o selecionado tem check E fica listado no gatilho: duas evidencias,
 *    nao uma cor.
 *
 * O que esta selecionado aparece como badge removivel FORA do dropdown, entao
 * a resposta para "o que essa pessoa vai ver?" nao exige abrir nada.
 */
export default function MultiSelect({
  label,
  hint,
  options,
  value,
  onChange,
  placeholder = 'Selecionar...',
  searchPlaceholder = 'Buscar...',
  id,
}: {
  label: string;
  hint?: string;
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  id?: string;
}) {
  const [open, setOpen] = useState(false);

  const toggle = (opt: string) =>
    onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt]);

  const clear = () => onChange([]);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs text-muted-foreground" htmlFor={id}>
          {label}
        </Label>
        {value.length > 0 && (
          <button
            type="button"
            onClick={clear}
            className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            limpar
          </button>
        )}
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
          >
            <span className={value.length ? '' : 'text-muted-foreground'}>
              {value.length === 0
                ? placeholder
                : `${value.length} selecionado${value.length > 1 ? 's' : ''}`}
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>Nada encontrado.</CommandEmpty>
              <CommandGroup>
                {options.map((opt) => {
                  const selected = value.includes(opt);
                  return (
                    <CommandItem key={opt} value={opt} onSelect={() => toggle(opt)}>
                      <span
                        className={
                          'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border ' +
                          (selected
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-muted-foreground/40')
                        }
                      >
                        {selected && <Check className="h-3 w-3" />}
                      </span>
                      {opt}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Selecionados fora do dropdown: responder "o que ficou marcado?" nao
          pode depender de reabrir a lista. */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-0.5">
          {value.map((v) => (
            <Badge key={v} variant="secondary" className="text-[11px] font-normal gap-1 pr-1">
              {v}
              <button
                type="button"
                onClick={() => toggle(v)}
                aria-label={`Remover ${v}`}
                className="rounded-full hover:bg-background/60 p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
