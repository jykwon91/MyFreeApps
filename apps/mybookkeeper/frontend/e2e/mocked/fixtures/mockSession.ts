/**
 * Signs a no-backend (fully mocked) spec in as a user of the one test workspace.
 * The token planting and the JSON helper are shared (@platform/ui/testing); what
 * stays here is MyBookkeeper's: the active-workspace key, its user shape and the
 * workspace, version and tax-profile reads every signed-in page makes.
 */
import type { Page } from "@playwright/test";
import { json } from "@platform/ui/testing/mockResponse";
import { plantAuth as plantSharedAuth, stubCurrentUser } from "@platform/ui/testing/mockSession";
import type { OrgRole } from "@mybookkeeper/api-client/types/organization/OrgRole";
import type { VersionInfo } from "@/shared/types/version/version-info";

export const ORG_ID = "00000000-0000-0000-0000-000000000010";
export const VERSION_INFO: VersionInfo = { commit: "abc1234", timestamp: "2026-11-01T00:00:00+00:00" };

const TEST_USER = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "test@example.com",
  name: "Test User",
  is_active: true,
  is_superuser: false,
  is_verified: true,
  role: "owner",
};

export async function plantAuth(page: Page): Promise<void> {
  await plantSharedAuth(page, { v1_activeOrgId: ORG_ID });
}

/** Answers the reads every signed-in page makes: the user, the workspace, version and tax profile. */
export async function stubSignedInShell(page: Page, orgRole: OrgRole): Promise<void> {
  await stubCurrentUser(page, TEST_USER);
  await page.route("**/api/organizations", (route) =>
    route.fulfill(json([{ id: ORG_ID, name: "Test Workspace", role: orgRole, org_role: orgRole }])),
  );
  await page.route("**/api/version", (route) => route.fulfill(json(VERSION_INFO)));
  await page.route("**/api/tax-profile", (route) =>
    route.fulfill(json({ onboarding_completed: true, tax_situations: [], filing_status: null, dependents_count: 0 })),
  );
}
