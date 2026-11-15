/**
 * No-backend E2E for accepting an invite while signed in as the invited email.
 *
 * Fully mocks the API via page.route(), so it runs under playwright.layout.config.ts
 * in the `frontend-layout-e2e` CI job.
 *
 * Verifies that when accepting fails, the page says why instead of opening the
 * dashboard as if the person had joined, and that Try again shows it's working
 * and then joins.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import type { InviteInfo } from "@mybookkeeper/api-client/types/organization/InviteInfo";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import { plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";

const TOKEN = "mock-invite-token";
const SIGNED_IN_EMAIL = "test@example.com";

const INVITE: InviteInfo = {
  org_name: "Acme Co",
  org_role: "user",
  inviter_name: "Alice",
  email: SIGNED_IN_EMAIL,
  expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  is_expired: false,
  user_exists: true,
};

test("a failed accept says so and Try again joins", async ({ page }) => {
  await stubUnmatchedApi(page, { answer: "empty" });
  await plantAuth(page);
  await stubWorkspaceShell(page, "admin");
  await page.route(`**/api/organizations/invites/${TOKEN}/info`, (route) => route.fulfill(json(INVITE)));

  let succeed = false;
  let release!: () => void;
  const retryAllowed = new Promise<void>((resolve) => {
    release = resolve;
  });
  let acceptCalls = 0;
  await page.route(`**/api/organizations/invites/${TOKEN}/accept`, async (route) => {
    acceptCalls += 1;
    if (!succeed) return route.fulfill(json({ detail: "Invite not found or expired" }, 404));
    await retryAllowed;
    return route.fulfill(json({ organization_id: "org-1", org_role: "user" }));
  });

  await page.goto(`/invite/${TOKEN}`);

  await expect(page.getByText("Invite not found or expired")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Couldn't join Acme Co" })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/invite/${TOKEN}$`));
  await expect(page.getByRole("link", { name: "Go to dashboard" })).toHaveAttribute("href", "/");
  expect(acceptCalls).toBe(1);

  succeed = true;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("button", { name: "Trying again...", exact: true })).toBeDisabled();
  await expect(page).toHaveURL(new RegExp(`/invite/${TOKEN}$`));

  release();
  await expect(page).not.toHaveURL(/\/invite\//);
  expect(acceptCalls).toBe(2);
});
