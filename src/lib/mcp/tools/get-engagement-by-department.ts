import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { departmentScope, requireCallerAccess } from "../access";

export default defineTool({
  name: "get_engagement_by_department",
  title: "Get engagement by department",
  description:
    "Engagement survey results per department and wave: eNPS (and delta vs enterprise), retention risk, and satisfaction. Scoped profiles only see their own departments.",
  inputSchema: {
    wave: z
      .string()
      .regex(/^\d{4}-\d{2}$/, "Use YYYY-MM")
      .optional()
      .describe("Survey wave in YYYY-MM format. Omit for all waves."),
    department: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Filter by department name (exact match)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ wave, department }, ctx) => {
    const { supabase, access } = await requireCallerAccess(ctx);
    const scope = departmentScope(access);
    if (scope && scope.length === 0) {
      return {
        content: [{ type: "text", text: "[]" }],
        structuredContent: { rows: [] },
      };
    }

    let query = supabase
      .from("engagement_dept_scores")
      .select(
        "wave, department, enps, enps_delta, enps_gap_ent, retention_risk, rr_delta_pp, rr_gap_ent_pp, satisfaction, sat_delta, sat_gap_ent, status",
      )
      .order("wave", { ascending: false })
      .order("department", { ascending: true });

    if (wave) query = query.eq("wave", `${wave}-01`);
    if (department) query = query.eq("department", department);
    if (scope) query = query.in("department", scope);

    const { data, error } = await query;
    if (error) throw new Error(`Failed to load engagement scores: ${error.message}`);

    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { rows: data ?? [] },
    };
  },
});
