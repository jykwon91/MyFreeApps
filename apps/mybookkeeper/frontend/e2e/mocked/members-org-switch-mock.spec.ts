/**
 * No-backend E2E for switching organizations on /members, as an admin of both.
 *
 * Fully mocks the API via page.route(), so it runs under playwright.layout.config.ts
 * in the `frontend-layout-e2e` CI job.
 *
 * Verifies that while the new organization's lists load, the page never shows the
 * old organization's members or invites, and that a half-typed invite doesn't carry
 * over to the new organization.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import type { OrgInvite } from "@mybookkeeper/api-client/types/organization/OrgInvite";
import type { OrgMember } from "@mybookkeeper/api-client/types/organization/OrgMember";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import type { OrgWithRole } from "@mybookkeeper/api-client/types/organization/OrgWithRole";
import { ORG_ID, plantAuth, stubWorkspaceShell, workspaceOf } from "./fixtures/mockSession";

const OTHER_ORG_ID = "00000000-0000-0000-0000-000000000020";

function member(orgId: string, email: string): OrgMember {
  return {
    id: `member-${email}`,
    organization_id: orgId,
    user_id: `user-${email}`,
    org_role: "user",
    joined_at: "2026-01-01T00:00:00Z",
    user_name: null,
    user_email: email,
  };
}

function invite(orgId: string, email: string): OrgInvite {
  return {
    id: `invite-${email}`,
    organization_id: orgId,
    email,
    org_role: "user",
    status: "pending",
    email_sent: true,
    created_at: "2026-01-01T00:00:00Z",
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

/**
 * Serves both organizations; the other one's lists wait until ``release`` is called.
 * ``dropFirst`` makes the organizations list leave the first one out from then on.
 */
async function stubTwoOrgs(page: Page): Promise<{ release: () => void; dropFirst: () => void }> {
  let firstListed = true;
  let release!: () => void;
  const otherOrgReady = new Promise<void>((resolve) => {
    release = resolve;
  });
  await stubUnmatchedApi(page, { answer: "empty" });
  await stubWorkspaceShell(page, "admin");
  await page.route("**/api/organizations", (route) =>
    route.fulfill(
      json([
        ...(firstListed ? [workspaceOf(ORG_ID, "First Workspace", "admin")] : []),
        workspaceOf(OTHER_ORG_ID, "Second Workspace", "admin"),
      ] satisfies OrgWithRole[]),
    ),
  );
  await page.route(`**/api/organizations/${ORG_ID}/members`, (route) =>
    route.fulfill(json([member(ORG_ID, "first-member@example.com")])),
  );
  await page.route(`**/api/organizations/${ORG_ID}/invites`, (route) =>
    route.fulfill(json([invite(ORG_ID, "first-invite@example.com")])),
  );
  await page.route(`**/api/organizations/${OTHER_ORG_ID}/members`, async (route) => {
    await otherOrgReady;
    await route.fulfill(json([member(OTHER_ORG_ID, "second-member@example.com")]));
  });
  await page.route(`**/api/organizations/${OTHER_ORG_ID}/invites`, async (route) => {
    await otherOrgReady;
    await route.fulfill(json([invite(OTHER_ORG_ID, "second-invite@example.com")]));
  });
  return {
    release,
    dropFirst: () => {
      firstListed = false;
    },
  };
}

function row(page: Page, email: string) {
  return page.getByRole("row", { name: new RegExp(email.replaceAll(".", "\\.")) });
}

test("switching organizations never shows the old one's members or invites, or carries over a typed invite", async ({
  page,
}) => {
  await plantAuth(page);
  const { release: releaseOtherOrg } = await stubTwoOrgs(page);
  await page.goto("/members");

  await expect(row(page, "first-member@example.com")).toBeVisible();
  await expect(row(page, "first-invite@example.com")).toBeVisible();
  await page.getByLabel("Email address").fill("meant-for-first@example.com");

  await page.getByRole("button", { name: /First Workspace/ }).click();
  await page.getByRole("menuitem", { name: /Second Workspace/ }).click();

  // The second workspace's lists are still loading.
  await expect(page.getByTestId("members-skeleton")).toBeVisible();
  await expect(row(page, "first-member@example.com")).toHaveCount(0);
  await expect(row(page, "first-invite@example.com")).toHaveCount(0);
  await expect(page.getByLabel("Email address")).toHaveCount(0);

  releaseOtherOrg();
  await expect(row(page, "second-member@example.com")).toBeVisible();
  await expect(page.getByTestId("members-skeleton")).toHaveCount(0);
  await expect(row(page, "second-invite@example.com")).toBeVisible();
  await expect(page.getByLabel("Email address")).toHaveValue("");
});

test("when the active organization goes away, the page never shows its members or invites under the next one", async ({
  page,
}) => {
  await plantAuth(page);
  const { release: releaseOtherOrg, dropFirst } = await stubTwoOrgs(page);
  await page.goto("/members");
  await expect(row(page, "first-member@example.com")).toBeVisible();
  await expect(row(page, "first-invite@example.com")).toBeVisible();

  // Removed from the first workspace elsewhere: refocusing reloads the organizations
  // list, which falls back to the second one without clearing the API cache.
  dropFirst();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("button", { name: /Second Workspace/ })).toBeVisible();

  // Still loading: neither the first one's rows nor a false "nothing here" for the second.
  await expect(page.getByTestId("members-skeleton")).toBeVisible();
  await expect(row(page, "first-member@example.com")).toHaveCount(0);
  await expect(row(page, "first-invite@example.com")).toHaveCount(0);
  await expect(page.getByText("No members yet.")).toHaveCount(0);
  await expect(page.getByText("No pending invites.")).toHaveCount(0);
  await expect(page.getByLabel("Email address")).toHaveCount(0);

  releaseOtherOrg();
  await expect(row(page, "second-member@example.com")).toBeVisible();
  await expect(page.getByTestId("members-skeleton")).toHaveCount(0);
  await expect(row(page, "second-invite@example.com")).toBeVisible();
});
