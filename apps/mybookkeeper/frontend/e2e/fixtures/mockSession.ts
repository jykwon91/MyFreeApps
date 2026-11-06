/** Signs a no-backend (fully mocked) spec in as a user of the one test workspace. */
import type { Page } from "@playwright/test";
import { json } from "./mockResponse";
import type { OrgRole } from "@mybookkeeper/api-client/types/organization/OrgRole";

export const ORG_ID = "00000000-0000-0000-0000-000000000010";

export async function plantAuth(page: Page): Promise<void> {
  await page.addInitScript(
    ([orgId]) => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
      const payload = btoa(JSON.stringify({ sub: "test-user", exp: futureExp }));
      window.localStorage.setItem("token", `${header}.${payload}.fake-signature`);
      window.localStorage.setItem("v1_activeOrgId", orgId);
    },
    [ORG_ID],
  );
}

/** Answers the reads every signed-in page makes: the user, the workspace, version and tax profile. */
export async function stubSignedInShell(page: Page, orgRole: OrgRole): Promise<void> {
  await page.route("**/api/users/me", (route) =>
    route.fulfill(
      json({
        id: "00000000-0000-0000-0000-000000000001",
        email: "test@example.com",
        name: "Test User",
        is_active: true,
        is_superuser: false,
        is_verified: true,
        role: "owner",
      }),
    ),
  );
  await page.route("**/api/organizations", (route) =>
    route.fulfill(json([{ id: ORG_ID, name: "Test Workspace", role: orgRole, org_role: orgRole }])),
  );
  await page.route("**/api/version", (route) => route.fulfill(json({ version: "test" })));
  await page.route("**/api/tax-profile", (route) =>
    route.fulfill(json({ onboarding_completed: true, tax_situations: [], filing_status: null, dependents_count: 0 })),
  );
}
