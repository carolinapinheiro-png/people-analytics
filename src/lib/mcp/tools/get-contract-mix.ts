import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireCallerAccess } from "../access";

const monthParam = z
  .string()
  .regex(/^\d{4}-\d{2}$/, "Use YYYY-MM")
  .describe("Month in YYYY-MM format");

export default defineTool({
  name: "get_contract_mix",
  title: "Get contract mix",
  description:
    "Monthly evolution of the workforce by contract type (e.g. CLT vs PJ) and brand, reconstructed from contract history and anchored to official headcount. Company-wide aggregates.",
  inputSchema: {
    from_month: monthParam.optional().describe("First month to include (YYYY-MM)."),
    to_month: monthParam.optional().describe("Last month to include (YYYY-MM)."),
    brand: z.string().trim().min(1).optional().describe("Filter by brand (exact match)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ from_month, to_month, brand }, ctx) => {
    const { supabase } = await requireCallerAccess(ctx);

    let query = supabase
      .from("contract_mix_monthly")
      .select("month, brand, contract, n")
      .order("month", { ascending: false });

    if (from_month) query = query.gte("month", `${from_month}-01`);
    if (to_month) query = query.lte("month", `${to_month}-01`);
    if (brand) query = query.eq("brand", brand);

    const { data, error } = await query;
    if (error) throw new Error(`Failed to load contract mix: ${error.message}`);

    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { rows: data ?? [] },
    };
  },
});
