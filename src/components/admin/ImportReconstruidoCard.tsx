import { useRef, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import { FileSpreadsheet, Upload, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { importReconstruido } from '@/lib/metrics.functions';
import type { BusinessUnit, MonthAggregate } from '@/lib/aggregator/monthly-aggregator';
import type { ParsedWorkbook } from '@/lib/aggregator/xlsx-adapter';

/**
 * Importacao da serie reconstruida a partir do Talent_Mobility.xlsx.
 *
 * O arquivo e lido NO NAVEGADOR (LGPD: CPF, nascimento, raca, saude). So os
 * agregados mensais chegam ao servidor. O mapeamento de colunas detectado e
 * mostrado ANTES de gravar: descasamento de formato aparece aqui, nao
 * silenciosamente nos numeros.
 *
 * Betfair BR sai com base parcial declarada (so Talent_Mobility, 34 ativos);
 * a extensao a fonte Workday espera a decisao dos 18 duplicados.
 */

const BU_TO_BRAND: Record<BusinessUnit, 'NSX' | 'Betfair BR' | 'Flutter International'> = {
  nsx_br: 'NSX',
  betfair: 'Betfair BR',
  flutter_intl: 'Flutter International',
};

const YM = /^\d{4}-\d{2}$/;

interface Preview {
  parsed: ParsedWorkbook;
  aggregates: MonthAggregate[];
}

export default function ImportReconstruidoCard() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fromYm, setFromYm] = useState('2025-01');
  const [toYm, setToYm] = useState('2026-07');
  const [busy, setBusy] = useState<'parse' | 'save' | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);

  const importFn = useServerFn(importReconstruido);

  const handleFile = async (file: File) => {
    if (!YM.test(fromYm) || !YM.test(toYm)) {
      toast.error('Periodo invalido: use AAAA-MM.');
      return;
    }
    setBusy('parse');
    setPreview(null);
    setFileName(file.name);
    try {
      const [{ parseTalentMobility }, { aggregateRange }] = await Promise.all([
        import('@/lib/aggregator/xlsx-adapter'),
        import('@/lib/aggregator/monthly-aggregator'),
      ]);
      const parsed = parseTalentMobility(await file.arrayBuffer());
      if (parsed.report.errors.length) {
        setPreview({ parsed, aggregates: [] });
        toast.error('A planilha nao pode ser agregada; veja o relatorio.');
        return;
      }
      const aggregates = (Object.keys(BU_TO_BRAND) as BusinessUnit[]).flatMap((bu) =>
        aggregateRange(parsed.people, parsed.history, fromYm, toYm, bu),
      );
      setPreview({ parsed, aggregates });
    } catch (err) {
      toast.error('Falha ao ler o arquivo.');
      console.error(err);
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleSave = async () => {
    if (!preview || preview.aggregates.length === 0) return;
    setBusy('save');
    try {
      const rows = preview.aggregates.map((a) => ({
        ...a,
        promotions: null,
        brand: BU_TO_BRAND[a.business_unit],
      }));
      const result = (await importFn({ data: { rows } })) as { imported: number };
      toast.success(`Serie reconstruida gravada: ${result.imported} linhas.`);
      setPreview(null);
      setFileName(null);
    } catch (err) {
      toast.error('Falha ao gravar; nada foi registrado.');
      console.error(err);
    } finally {
      setBusy(null);
    }
  };

  const report = preview?.parsed.report;
  const byBu = preview
    ? (Object.keys(BU_TO_BRAND) as BusinessUnit[]).map((bu) => {
        const months = preview.aggregates.filter((a) => a.business_unit === bu);
        const last = months[months.length - 1];
        return {
          bu,
          brand: BU_TO_BRAND[bu],
          months: months.length,
          lastHc: last?.headcount ?? 0,
          joiners: months.reduce((s, m) => s + m.joiners, 0),
          leavers: months.reduce((s, m) => s + m.leavers, 0),
        };
      })
    : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5" />
          Importar serie reconstruida
        </CardTitle>
        <CardDescription>
          Talent_Mobility.xlsx e lido no navegador; so os agregados mensais vao para o banco
          (source=&quot;reconstruido&quot;). Reimportar o mesmo mes corrige em vez de duplicar. A
          serie congelada nunca e alterada.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
          <div className="space-y-1">
            <Label htmlFor="import-from">De (AAAA-MM)</Label>
            <Input
              id="import-from"
              value={fromYm}
              onChange={(e) => setFromYm(e.target.value)}
              className="w-32"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="import-to">Ate (AAAA-MM)</Label>
            <Input
              id="import-to"
              value={toYm}
              onChange={(e) => setToYm(e.target.value)}
              className="w-32"
            />
          </div>
          <div className="flex-1" />
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          <Button
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={busy !== null}
          >
            <Upload className="h-4 w-4 mr-2" />
            {busy === 'parse' ? 'Lendo...' : 'Escolher planilha'}
          </Button>
        </div>

        {fileName && (
          <p className="text-xs text-muted-foreground">
            Arquivo: {fileName} — lido localmente, linhas individuais nao saem desta maquina.
          </p>
        )}

        {report && (
          <div className="space-y-3">
            {report.errors.length > 0 && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 space-y-1">
                {report.errors.map((e) => (
                  <p key={e} className="text-sm text-destructive flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0" /> {e}
                  </p>
                ))}
              </div>
            )}

            <div className="rounded-lg border border-border p-3 space-y-2 text-sm">
              <p className="font-medium">Mapeamento detectado (confira antes de gravar)</p>
              <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
                {[
                  { title: `Pessoas: ${report.peopleSheet ?? '—'}`, mapping: report.peopleMapping },
                  {
                    title: `Historico: ${report.historySheet ?? '—'}`,
                    mapping: report.historyMapping,
                  },
                ].map(({ title, mapping }) => (
                  <div key={title}>
                    <p className="text-xs text-muted-foreground mb-1">{title}</p>
                    {mapping.map((m) => (
                      <p key={m.field} className="flex items-center gap-1 text-xs">
                        {m.header ? (
                          <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                        ) : (
                          <AlertTriangle
                            className={`h-3 w-3 shrink-0 ${m.required ? 'text-destructive' : 'text-amber-500'}`}
                          />
                        )}
                        <span className="text-muted-foreground">{m.field}:</span>{' '}
                        {m.header ?? 'nao encontrada'}
                        {m.alternatives.length > 0 && (
                          <span className="text-amber-600">
                            (ambigua: {m.alternatives.join(', ')})
                          </span>
                        )}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            {(report.unmappedCompanies.length > 0 ||
              report.futureAdmissions > 0 ||
              report.suspiciousSalaries > 0 ||
              report.multiLinkCpfs > 0) && (
              <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 space-y-1 text-sm">
                {report.unmappedCompanies.map((c) => (
                  <p key={c.company}>
                    <AlertTriangle className="h-4 w-4 inline mr-1 text-amber-600" />
                    Empresa fora do de-para (ficara FORA da serie): {c.company} — {c.rows}{' '}
                    linha{c.rows > 1 ? 's' : ''}
                  </p>
                ))}
                {report.futureAdmissions > 0 && (
                  <p>
                    <AlertTriangle className="h-4 w-4 inline mr-1 text-amber-600" />
                    {report.futureAdmissions} admissao(oes) com data futura — cadastro ja reportado
                    ao DP em 24/07.
                  </p>
                )}
                {report.suspiciousSalaries > 0 && (
                  <p>
                    <AlertTriangle className="h-4 w-4 inline mr-1 text-amber-600" />
                    {report.suspiciousSalaries} salario(s) em formato milhar sem centavos
                    (&quot;1.234&quot;): o valor seria lido mil vezes menor. Corrija na planilha
                    antes de gravar.
                  </p>
                )}
                {report.multiLinkCpfs > 0 && (
                  <p className="text-muted-foreground">
                    {report.multiLinkCpfs} CPF(s) com mais de um vinculo — tratados pela regra
                    hibrida (foto por pessoa, fluxo por evento).
                  </p>
                )}
              </div>
            )}

            {preview && preview.aggregates.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Previa ({fromYm} a {toYm})</p>
                <div className="rounded-lg border border-border divide-y divide-border text-sm">
                  {byBu.map((r) => (
                    <div key={r.bu} className="flex items-center justify-between p-2 gap-2">
                      <span className="flex items-center gap-2">
                        {r.brand}
                        {r.bu === 'betfair' && (
                          <Badge variant="secondary" className="text-[10px]">
                            base parcial: so Talent Mobility
                          </Badge>
                        )}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {r.months} meses · HC final {r.lastHc} · +{r.joiners} / −{r.leavers}
                      </span>
                    </div>
                  ))}
                </div>
                <Button onClick={handleSave} disabled={busy !== null}>
                  {busy === 'save' ? 'Gravando...' : 'Gravar serie reconstruida'}
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
