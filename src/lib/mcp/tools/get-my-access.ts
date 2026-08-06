import { defineTool } from "@lovable.dev/mcp-js";
import { requireCallerAccess } from "../access";

export default defineTool({
  name: "get_my_access",
  title: "Get my access profile",
  description:
    "Return the connected user's People Analytics access profile: email, role, visibility profile, and the department/job-family scope their data is limited to.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    const { access } = await requireCallerAccess(ctx);
    const payload = {
      email: access.email,
      role: access.role,
      profile: access.profile,
      companyWide: access.isGlobal,
      departments: access.departments,
      jobFamilies: access.jobFamilies,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
