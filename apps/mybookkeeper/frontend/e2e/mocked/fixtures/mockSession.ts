/**
 * MyBookkeeper's signed-in workspace for no-backend (fully mocked) specs. The
 * token planting, the catch-all and the route helpers are shared
 * (@platform/ui/test-support); what stays here is MyBookkeeper's: the
 * active-workspace key, its user shape, the workspace, version and
 * tax-profile reads every signed-in page makes, and the dashboard's reads.
 *
 * Unlike the shared stubSignedInShell, stubWorkspaceShell registers no
 * catch-all and plants no token. A spec calls stubUnmatchedApi (or its own
 * catch-all) first, then plantAuth and stubWorkspaceShell, then its own stubs,
 * because Playwright tries the most recently added route first.
 */
import type { Page } from "@playwright/test";
import { plantAuth as plantSharedAuth, stubCurrentUser, stubJsonRoutes } from "@platform/ui/test-support/mockSession";
import type { OrgRole } from "@mybookkeeper/api-client/types/organization/OrgRole";
import type { OrgWithRole } from "@mybookkeeper/api-client/types/organization/OrgWithRole";
import type { TaxProfile } from "@/shared/types/organization/tax-profile";
import type { UserProfile } from "@/shared/types/user";
import type { VersionInfo } from "@/shared/types/version/version-info";
import { stubDashboardReads } from "./mockDashboard";

export const ORG_ID = "00000000-0000-0000-0000-000000000010";
export const VERSION_INFO: VersionInfo = { commit: "abc1234", timestamp: "2026-11-01T00:00:00+00:00" };

const ACTIVE_ORG_STORAGE_KEY = "v1_activeOrgId";
const ORG_CREATED_AT = "2026-01-01T00:00:00Z";
const TAX_PROFILE_ID = "00000000-0000-0000-0000-000000000011";

/** GET /users/me as MyBookkeeper's UserRead sends it: `name` and a platform `role`, no display_name. */
const TEST_USER: UserProfile = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "test@example.com",
  name: "Test User",
  role: "user",
  is_active: true,
  is_superuser: false,
  is_verified: true,
};

/** An onboarded tax profile, so RequireOrg doesn't send the page to /onboarding. */
const TAX_PROFILE: TaxProfile = {
  id: TAX_PROFILE_ID,
  organization_id: ORG_ID,
  tax_situations: [],
  dependents_count: 0,
  onboarding_completed: true,
};

/** One entry of GET /organizations: a workspace and the signed-in user's role in it. */
export function workspaceOf(id: string, name: string, orgRole: OrgRole): OrgWithRole {
  return { id, name, org_role: orgRole, is_demo: false, created_at: ORG_CREATED_AT };
}

export async function plantAuth(page: Page): Promise<void> {
  await plantSharedAuth(page, { [ACTIVE_ORG_STORAGE_KEY]: ORG_ID });
}

/**
 * Answers the reads every signed-in page makes (the user, the workspace with
 * `orgRole`, version and tax profile) and the dashboard's, so a spec that lands
 * on / renders it instead of crashing on catch-all answers.
 */
export async function stubWorkspaceShell(page: Page, orgRole: OrgRole): Promise<void> {
  await stubCurrentUser(page, TEST_USER);
  await stubJsonRoutes(page, [
    { path: "/organizations", body: [workspaceOf(ORG_ID, "Test Workspace", orgRole)] },
    { path: "/version", body: VERSION_INFO },
    { path: "/tax-profile", body: TAX_PROFILE },
  ]);
  await stubDashboardReads(page);
}
