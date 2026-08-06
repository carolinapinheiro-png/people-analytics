import { ToolError, type ToolContext } from "@lovable.dev/mcp-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isGlobalProfile, type AccessProfile } from "@/lib/permissions";
import { supabaseForUser } from "./supabase";

/**
 * Access guard shared by every MCP tool.
 *
 * The app authorizes users through the `allowed_emails` allowlist (profile +
 * department/family scope), not just "has a session". Each tool re-checks the
 * caller's own allowlist row — readable under RLS via the "own row" policy —
 * and applies the same visibility rules the dashboard server functions use.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient<any, "public", any>;

export interface CallerAccess {
  email: string;
  role: string;
  profile: AccessProfile;
  departments: string[];
  jobFamilies: string[];
  /** Global profiles (admin, hr_leader) see the whole company. */
  isGlobal: boolean;
}

export const NOT_AUTHENTICATED =
  "Not authenticated. Connect with a People Analytics account to use this tool.";
export const NOT_AUTHORIZED =
  "Your email is not on the People Analytics authorized users list.";

/**
 * Resolves the caller's access profile, or throws a ToolError the MCP client
 * can surface. Never reads user identity from tool input — only from the
 * verified OAuth token.
 */
export async function requireCallerAccess(ctx: ToolContext): Promise<{
  supabase: AnySupabase;
  access: CallerAccess;
}> {
  if (!ctx.isAuthenticated()) throw new ToolError(NOT_AUTHENTICATED);
  const email = ctx.getUserEmail();
  if (!email) throw new ToolError(NOT_AUTHENTICATED);

  const supabase = supabaseForUser(ctx) as AnySupabase;
  const { data, error } = await supabase
    .from("allowed_emails")
    .select("email, role, profile, departments, job_families")
    .ilike("email", email)
    .maybeSingle();

  if (error) throw new ToolError(`Access check failed: ${error.message}`);
  if (!data) throw new ToolError(NOT_AUTHORIZED);

  const row = data as {
    email: string;
    role: string;
    profile: AccessProfile | null;
    departments: string[] | null;
    job_families: string[] | null;
  };

  // Rows predating profiles keep the legacy role mapping; everyone else
  // defaults to the most restrictive profile.
  const profile: AccessProfile =
    row.profile ?? (row.role === "admin" ? "admin" : "dept_leader");

  return {
    supabase,
    access: {
      email: row.email,
      role: row.role,
      profile,
      departments: row.departments ?? [],
      jobFamilies: row.job_families ?? [],
      isGlobal: isGlobalProfile(profile),
    },
  };
}

/**
 * Department scope for per-department queries.
 *   null → unrestricted (global profile)
 *   []   → scoped profile with nothing assigned (sees nothing)
 *   list → restrict to these department names
 */
export function departmentScope(access: CallerAccess): string[] | null {
  if (access.isGlobal) return null;
  return access.departments;
}
