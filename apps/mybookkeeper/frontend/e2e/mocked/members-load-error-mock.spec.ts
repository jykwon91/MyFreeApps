/**
 * No-backend E2E for a failed first load on /members, seen by an admin.
 *
 * Fully mocks the API via page.route(), so it runs under playwright.layout.config.ts
 * in the `frontend-layout-e2e` CI job.
 *
 * Verifies that when the members or invites list fails to load, its card says so
 * instead of showing an empty organization, that Retry shows it's working and then
 * loads the list, and that the invite form keeps what was typed throughout.
 */
import { test, expect, type Page } from "@playwright/test";
import type { OrgInvite } from "@mybookkeeper/api-client/types/organization/OrgInvite";
import type { OrgMember } from "@mybookkeeper/api-client/types/organization/OrgMember";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import { ORG_ID, plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";

const MEMBER: OrgMember = {
  id: "member-1",
  organization_id: ORG_ID,
  user_id: "user-2",
  org_role: "user",
  joined_at: "2026-01-01T00:00:00Z",
  user_name: null,
  user_email: "teammate@example.com",
};

const INVITE: OrgInvite = {
  id: "invite-1",
  organization_id: ORG_ID,
  email: "invited@example.com",
  org_role: "user",
  status: "pending",
  email_sent: true,
  created_at: "2026-01-01T00:00:00Z",
  expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
};

type ListName = "members" | "invites";

/**
 * Serves both lists, except that ``failing`` answers 500 until ``recover`` is called.
 * After that its loads wait until ``release`` is called, so a retry can be seen in
 * flight. (It fails every load, not just the first: once the page shows its lists,
 * a new subscriber to a failed query makes RTK Query try again on its own.)
 */
async function stubLoadFails(page: Page, failing: ListName): Promise<{ recover: () => void; release: () => void }> {
  let failingNow = true;
  let release!: () => void;
  const retryAllowed = new Promise<void>((resolve) => {
    release = resolve;
  });
  await stubUnmatchedApi(page, { answer: "empty" });
  await stubWorkspaceShell(page, "admin");
  const bodies: Record<ListName, unknown[]> = { members: [MEMBER], invites: [INVITE] };
  for (const name of ["members", "invites"] as const) {
    await page.route(`**/api/organizations/${ORG_ID}/${name}`, async (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      if (name === failing && failingNow) return route.fulfill(json({ detail: "Internal Server Error" }, 500));
      if (name === failing) await retryAllowed;
      return route.fulfill(json(bodies[name]));
    });
  }
  return {
    recover: () => {
      failingNow = false;
    },
    release,
  };
}

function row(page: Page, email: string) {
  return page.getByRole("row", { name: new RegExp(email.replaceAll(".", "\\.")) });
}

const CASES = [
  {
    list: "members",
    error: "I couldn't load the members.",
    empty: "No members yet.",
    rowEmail: "teammate@example.com",
  },
  {
    list: "invites",
    error: "I couldn't load the pending invites.",
    empty: "No pending invites.",
    rowEmail: "invited@example.com",
  },
] as const;

for (const { list, error, empty, rowEmail } of CASES) {
  test(`a failed ${list} load says so and retries, keeping the typed invite`, async ({ page }) => {
    await plantAuth(page);
    const { recover, release } = await stubLoadFails(page, list);
    await page.goto("/members");

    const retry = page.getByRole("button", { name: "Retry", exact: true });
    await expect(page.getByText(error)).toBeVisible();
    await expect(retry).toBeEnabled();
    await expect(page.getByText(empty)).toHaveCount(0);
    await expect(page.getByTestId("members-skeleton")).toHaveCount(0);
    const email = page.getByLabel("Email address");
    await email.fill("new-teammate@example.com");

    recover();
    await retry.click();
    await expect(page.getByRole("button", { name: "Retrying...", exact: true })).toBeDisabled();
    await expect(page.getByTestId("members-skeleton")).toHaveCount(0);
    await expect(email).toHaveValue("new-teammate@example.com");

    release();
    await expect(row(page, rowEmail)).toBeVisible();
    await expect(page.getByText(error)).toHaveCount(0);
    await expect(email).toHaveValue("new-teammate@example.com");
  });
}
