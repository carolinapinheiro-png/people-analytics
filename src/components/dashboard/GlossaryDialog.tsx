import { useState } from 'react';
import { BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

/**
 * Glossario dentro do produto.
 *
 * Estas definicoes existiam so em documento e em comentario de codigo. O efeito
 * pratico era que qualquer pessoa nova ou supunha o significado, ou perguntava
 * -- e as duas coisas produzem numeros interpretados errado em reuniao.
 *
 * Fica num dialogo, e nao numa aba, por dois motivos: aba nova aumenta a
 * superficie de um dashboard que ja tem onze, e a aba "Dados" (onde isto
 * naturalmente moraria) so e visivel para perfis globais -- justamente quem NAO
 * precisa do glossario. Gestor precisa.
 */

interface Entry {
  term: string;
  def: string;
  /** Confusao concreta que este verbete evita. */
  watch?: string;
  tag?: 'estimativa' | 'reconstruído';
}

const GROUPS: Array<{ title: string; entries: Entry[] }> = [
  {
    title: 'Saídas',
    entries: [
      {
        term: 'Atrição (mensal)',
        def: 'Saídas do mês ÷ headcount do fim do mês. Mede só quem saiu.',
      },
      {
        term: 'Turnover (mensal)',
        def: '(entradas + saídas) ÷ 2 ÷ headcount médio do mês. Mede a movimentação total.',
        watch: 'Turnover é sempre maior que atrição num time que cresce — não são versões do mesmo número.',
      },
      {
        term: 'Acumulado do período',
        def: 'Total de saídas do intervalo ÷ headcount médio do intervalo.',
        watch:
          'Não é a média das taxas mensais, e não é anualizado. Um período de 6 meses mostra o acumulado de 6 meses.',
      },
      {
        term: 'Atrição não desejada',
        def: 'Hoje é uma estimativa: 65% das saídas. Não há classificação individual real.',
        tag: 'estimativa',
        watch: 'Aparece ao lado de números medidos. Enquanto a marcação na origem não existir, trate como ordem de grandeza.',
      },
      {
        term: 'Custo de substituição',
        def: 'Premissa de R$ 45.000 por pessoa. Não é custo apurado.',
        tag: 'estimativa',
      },
    ],
  },
  {
    title: 'Liderança e estrutura',
    entries: [
      {
        term: 'Líder',
        def: 'Flag do cadastro ("Liderança?"). Cerca de 122 ativos.',
      },
      {
        term: 'Gestor de pessoas',
        def: 'Tem reporte direto na cadeia. Cerca de 120 ativos.',
        watch:
          'São populações diferentes, com sobreposição parcial: 92 pessoas são as duas coisas. Escolher um dos dois muda o número.',
      },
      {
        term: 'Span de controle',
        def: 'Reportes diretos por gestor. Até ~8 é uma referência de span saudável.',
        watch: 'Referência, não meta. Time operacional e repetitivo acumula mais reportes de forma saudável.',
      },
    ],
  },
  {
    title: 'Como o histórico é montado',
    entries: [
      {
        term: 'Valor "da época"',
        def:
          'Nível, liderança, departamento e vínculo do mês consultado — reconstruídos a partir do snapshot atual, recuando por eventos datados do histórico.',
        tag: 'reconstruído',
        watch:
          'Uma conversão PJ→CLT aparece no mês em que aconteceu, e não reescreve o passado. Onde não há histórico (gênero, estado), vale o valor atual.',
      },
      {
        term: 'Recorte por departamento',
        def:
          'Com um departamento selecionado, as tendências mostram só aquele departamento ao longo do tempo. A soma dos departamentos reproduz o total da empresa.',
      },
      {
        term: '"Sem departamento"',
        def: 'Ativo sem registro de departamento vigente. É lacuna de cadastro, não uma área.',
        watch: 'Aparece de propósito. Esconder faria a soma das áreas não fechar com o headcount.',
      },
    ],
  },
  {
    title: 'Recrutamento',
    entries: [
      {
        term: 'TTH (tempo de contratação)',
        def:
          'Dias corridos entre a abertura e o fechamento da vaga, descontados os períodos em que ela esteve congelada ou cancelada.',
        tag: 'reconstruído',
        watch:
          'O campo de SLA do InHire vem vazio, então o número é reconstruído do histórico de status. Pode divergir levemente do painel deles.',
      },
      {
        term: 'Posição × Vaga',
        def:
          'Posição é a cadeira que a pessoa vai ocupar; vaga é o guarda-chuva que reúne várias posições. A unidade de contagem é a posição.',
        watch: 'Contar vagas em vez de posições subconta abertura e fechamento.',
      },
      {
        term: 'Vaga congelada',
        def: 'O relógio do SLA para, por decisão. A cadeira continua vazia.',
        watch: 'Não significa prazo estourado — significa o oposto: o tempo parou de correr.',
      },
      {
        term: '"Vazio" nos campos do InHire',
        def: 'O campo não foi preenchido no cadastro da vaga. É lacuna, não zero.',
      },
    ],
  },
  {
    title: 'Remuneração',
    entries: [
      {
        term: 'Comp ratio',
        def: 'Salário da pessoa ÷ ponto médio da faixa do cargo. 1,00 = no meio da faixa.',
      },
      {
        term: 'Salário individual',
        def: 'Não é exposto no dashboard. Só faixa, comp ratio e agregados.',
      },
    ],
  },
];

export default function GlossaryDialog() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
          <BookOpen className="h-3.5 w-3.5" />
          Glossário
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Como ler os números</DialogTitle>
          <DialogDescription>
            As definições que o dashboard usa. Quando dois números parecem contraditórios, a
            resposta costuma estar aqui.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {GROUPS.map((g) => (
            <div key={g.title} className="space-y-2.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {g.title}
              </p>
              {g.entries.map((e) => (
                <div key={e.term} className="border-l-2 border-border pl-3 space-y-0.5">
                  <p className="text-sm font-medium flex items-center gap-2">
                    {e.term}
                    {e.tag && (
                      <Badge
                        variant={e.tag === 'estimativa' ? 'destructive' : 'secondary'}
                        className="text-[10px] font-normal"
                      >
                        {e.tag}
                      </Badge>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{e.def}</p>
                  {e.watch && (
                    <p className="text-xs text-amber-600 dark:text-amber-500 leading-relaxed">
                      {e.watch}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>

        <p className="text-[11px] text-muted-foreground border-t border-border pt-3">
          Onde há <strong>estimativa</strong>, o número não foi medido — é premissa. Onde há{' '}
          <strong>reconstruído</strong>, o número foi calculado a partir de eventos datados, e não
          lido pronto de uma fonte.
        </p>
      </DialogContent>
    </Dialog>
  );
}
