import { auth, defineMcp } from "@lovable.dev/mcp-js";
import getMyAccessTool from "./tools/get-my-access";
import listDepartmentsTool from "./tools/list-departments";
import getHeadcountSeriesTool from "./tools/get-headcount-series";
import getEngagementByDepartmentTool from "./tools/get-engagement-by-department";
import getRecruitmentMonthlyTool from "./tools/get-recruitment-monthly";
import getContractMixTool from "./tools/get-contract-mix";

// The OAuth issuer MUST be the direct Supabase host — on publish, SUPABASE_URL
// is rewritten to the `.lovable.cloud` proxy, which fails RFC 8414 issuer
// validation. The project ref is inlined at build time and survives publish.
const projectRef =
  import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "people-analytics-flutter-br",
  title: "People Analytics Flutter BR",
  version: "0.1.0",
  instructions:
    "Read-only people analytics for Flutter Brazil: headcount and attrition series, contract mix, engagement by department, and recruitment metrics. " +
    "Every tool requires the caller to sign in as an authorized People Analytics user and returns only what that user's access profile can see " +
    "(scoped profiles only see their own departments). Start with `get_my_access` to learn the caller's visibility scope.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    getMyAccessTool,
    listDepartmentsTool,
    getHeadcountSeriesTool,
    getEngagementByDepartmentTool,
    getRecruitmentMonthlyTool,
    getContractMixTool,
  ],
});
