import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireCallerAccess } from "../access";

const monthParam = z
  .string()
  .regex(/^\d{4}-\d{2}$/, "Use YYYY-MM")
  .describe("Month in YYYY-MM format");

const SCALAR_COLUMNS =
  "month, brand, source, business_unit, headcount, joiners, leavers, attrition_rate, promotions, leaders, leaders_pct, gender_female_pct, leader_female_pct, pcd, apprentice";

/**
 * ===========================================================================
 * UMA FONTE POR RESPOSTA
 * ===========================================================================
 * `monthly_metrics` guarda TRÊS séries do mesmo período, de propósito: a
 * congelada (`raw-data.ts`), a reconstruída pelo agregador (`reconstruido`) e
 * a que a carga do Convenia calcula (`convenia`). A chave única é
 * `(month, brand, source)` justamente para deixá-las conviver.
 *
 * Esta ferramenta não filtrava fonte nenhuma. Enquanto só existia
 * `reconstruido` para os meses recentes isso passou despercebido; no dia em
 * que a série do Convenia foi gravada, a mesma pergunta -- "headcount da NSX
 * em agosto" -- passou a ter duas linhas de resposta, com números diferentes e
 * sem nada dizendo qual é qual.
 *
 * O padrão é `convenia`, que é a série que o dashboard usa
 * (`sources: ['convenia', 'raw-data.ts']` em DashboardContext). Escolhi
 * `reconstruido` primeiro, por ter lido só `experience.functions` e
 * `data-quality.functions` -- os dois consumidores que ainda não migraram --
 * e concluído dali que era a canônica. Não era. Uma ferramenta que responde
 * uma série diferente da que a pessoa vê na tela produz a pior espécie de
 * divergência: as duas certas, e ninguém sabe por que discordam.
 *
 * `source` fica exposto na saída para que a resposta diga de onde veio, e
 * `quality_flag` exclui o que já foi reconhecido como errado -- inclusive os
 * meses anteriores ao primeiro desligado conhecido, em que a atrição sai zero
 * por ausência de dado.
 */
const FONTE_PADRAO = "convenia";

export default defineTool({
  name: "get_headcount_series",
  title: "Get headcount series",
  description:
    "Monthly company-level people metrics: headcount, joiners, leavers, attrition rate, promotions, leadership and diversity percentages. Company-wide aggregates; optionally filter by month range and brand.",
  inputSchema: {
    from_month: monthParam.optional().describe("First month to include (YYYY-MM)."),
    to_month: monthParam.optional().describe("Last month to include (YYYY-MM)."),
    brand: z.string().trim().min(1).optional().describe("Filter by brand (exact match)."),
    source: z
      .enum(["reconstruido", "convenia", "raw-data.ts"])
      .optional()
      .describe(
        "Which series to read. Defaults to 'reconstruido', the series the dashboard uses. "
        + "'convenia' is recalculated from hiring and dismissal dates on every load; "
        + "'raw-data.ts' is the frozen original. Never mix them in one comparison.",
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(120)
      .optional()
      .describe("Max rows, most recent first (default 36, max 120)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ from_month, to_month, brand, source, limit }, ctx) => {
    const { supabase } = await requireCallerAccess(ctx);

    let query = supabase
      .from("monthly_metrics")
      .select(SCALAR_COLUMNS)
      .eq("source", source ?? FONTE_PADRAO)
      .is("quality_flag", null)
      .order("month", { ascending: false })
      .limit(limit ?? 36);

    if (from_month) query = query.gte("month", `${from_month}-01`);
    if (to_month) query = query.lte("month", `${to_month}-01`);
    if (brand) query = query.eq("brand", brand);

    const { data, error } = await query;
    if (error) throw new Error(`Failed to load headcount series: ${error.message}`);

    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { rows: data ?? [] },
    };
  },
});
