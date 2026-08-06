import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { departmentScope, requireCallerAccess } from "../access";

const monthParam = z
  .string()
  .regex(/^\d{4}-\d{2}$/, "Use YYYY-MM")
  .describe("Month in YYYY-MM format");

export default defineTool({
  name: "get_recruitment_monthly",
  title: "Get recruitment metrics",
  description:
    "Monthly recruitment funnel metrics per department: closed jobs, time-to-hire (average and median, in calendar days with inactivity discounted), and application volume. Scoped profiles only see their own departments.",
  inputSchema: {
    from_month: monthParam.optional().describe("First month to include (YYYY-MM)."),
    to_month: monthParam.optional().describe("Last month to include (YYYY-MM)."),
    department: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Filter by department name (exact match)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ from_month, to_month, department }, ctx) => {
    const { supabase, access } = await requireCallerAccess(ctx);
    const scope = departmentScope(access);
    if (scope && scope.length === 0) {
      return {
        content: [{ type: "text", text: "[]" }],
        structuredContent: { rows: [] },
      };
    }

    let query = supabase
      .from("recruitment_monthly")
      .select("month, department, closed_jobs, tth_avg, tth_median, applications")
      .order("month", { ascending: false })
      .order("department", { ascending: true });

    if (from_month) query = query.gte("month", `${from_month}-01`);
    if (to_month) query = query.lte("month", `${to_month}-01`);
    if (department) query = query.eq("department", department);
    if (scope) query = query.in("department", scope);

    const { data, error } = await query;
    if (error) throw new Error(`Failed to load recruitment metrics: ${error.message}`);

    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { rows: data ?? [] },
    };
  },
});
