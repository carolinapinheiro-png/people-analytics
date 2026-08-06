import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireCallerAccess } from "../access";

const monthParam = z
  .string()
  .regex(/^\d{4}-\d{2}$/, "Use YYYY-MM")
  .describe("Month in YYYY-MM format");

const SCALAR_COLUMNS =
  "month, brand, business_unit, headcount, joiners, leavers, attrition_rate, promotions, leaders, leaders_pct, gender_female_pct, leader_female_pct, pcd, apprentice";

export default defineTool({
  name: "get_headcount_series",
  title: "Get headcount series",
  description:
    "Monthly company-level people metrics: headcount, joiners, leavers, attrition rate, promotions, leadership and diversity percentages. Company-wide aggregates; optionally filter by month range and brand.",
  inputSchema: {
    from_month: monthParam.optional().describe("First month to include (YYYY-MM)."),
    to_month: monthParam.optional().describe("Last month to include (YYYY-MM)."),
    brand: z.string().trim().min(1).optional().describe("Filter by brand (exact match)."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(120)
      .optional()
      .describe("Max rows, most recent first (default 36, max 120)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ from_month, to_month, brand, limit }, ctx) => {
    const { supabase } = await requireCallerAccess(ctx);

    let query = supabase
      .from("monthly_metrics")
      .select(SCALAR_COLUMNS)
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
