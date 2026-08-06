import { defineTool } from "@lovable.dev/mcp-js";
import { departmentScope, requireCallerAccess } from "../access";

export default defineTool({
  name: "list_departments",
  title: "List departments",
  description:
    "List the active departments in the People Analytics catalog (canonical names and aliases), limited to the connected user's scope.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    const { supabase, access } = await requireCallerAccess(ctx);
    const scope = departmentScope(access);
    if (scope && scope.length === 0) {
      return {
        content: [{ type: "text", text: "[]" }],
        structuredContent: { departments: [] },
      };
    }

    let query = supabase
      .from("departments")
      .select("name, aliases")
      .eq("active", true)
      .order("name", { ascending: true });
    if (scope) query = query.in("name", scope);

    const { data, error } = await query;
    if (error) throw new Error(`Failed to list departments: ${error.message}`);

    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { departments: data ?? [] },
    };
  },
});
