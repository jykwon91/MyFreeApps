/**
 * No-backend E2E for pending invites on /members, seen by an admin.
 *
 * Fully mocks the API via page.route(), so it runs under playwright.layout.config.ts
 * in the `frontend-layout-e2e` CI job.
 *
 * Verifies:
 *   - An invite past its expiry reads Expired, not Pending (the server keeps it
 *     "pending" and refuses it at accept time).
 *   - An invite whose email didn't send says so.
 *   - Cancelling an invite that's already gone says so and reloads the list.
 *   - An invite whose email fails reports an error with a step the admin can take.
 */
import { test, expect, type Page, type Request } from "@playwright/test";
import type { OrgInvite } from "@mybookkeeper/api-client/types/organization/OrgInvite";
import { json } from "@platform/ui/testing/mockResponse";
import { ORG_ID, plantAuth, stubSignedInShell } from "./fixtures/mockSession";

const DAY_MS = 24 * 60 * 60 * 1000;

function invite(id: string, email: string, expiresInDays: number, emailSent = true): OrgInvite {
  return {
    id,
    organization_id: ORG_ID,
    email,
    org_role: "user",
    status: "pending",
    email_sent: emailSent,
    created_at: "2026-01-01T00:00:00Z",
    expires_at: new Date(Date.now() + expiresInDays * DAY_MS).toISOString(),
  };
}

const INVITES: OrgInvite[] = [
  invite("inv-fresh", "fresh@example.com", 5),
  invite("inv-late", "late@example.com", -2),
  invite("inv-unsent", "unsent@example.com", 5, false),
];

async function stubApi(page: Page): Promise<{ invitesLoads: () => number }> {
  let loads = 0;
  await page.route("**/api/**", (route, request: Request) =>
    route.fulfill(json(request.method() === "GET" ? [] : {})),
  );
  await stubSignedInShell(page, "admin");
  await page.route(`**/api/organizations/${ORG_ID}/invites`, (route, request) => {
    if (request.method() === "GET") {
      loads += 1;
      return route.fulfill(json(INVITES));
    }
    const body = request.postDataJSON() as { email: string; org_role: OrgInvite["org_role"] };
    return route.fulfill(json({ ...invite("inv-new", body.email, 7, false), org_role: body.org_role }, 201));
  });
  await page.route(`**/api/organizations/${ORG_ID}/invites/inv-fresh`, (route) =>
    route.fulfill(json({ detail: "Invite not found or already accepted" }, 404)),
  );
  return { invitesLoads: () => loads };
}

function row(page: Page, email: string) {
  return page.getByRole("row", { name: new RegExp(email.replaceAll(".", "\\.")) });
}

test.describe("Members: pending invites", () => {
  test("tells an expired or unsent invite apart from a pending one", async ({ page }) => {
    await plantAuth(page);
    await stubApi(page);
    await page.goto("/members");

    await expect(row(page, "fresh@example.com").getByText("Pending", { exact: true })).toBeVisible();
    await expect(row(page, "late@example.com").getByText("Expired", { exact: true })).toBeVisible();
    await expect(row(page, "late@example.com").getByText("Pending", { exact: true })).toHaveCount(0);
    await expect(row(page, "unsent@example.com").getByText("Email didn't send")).toBeVisible();
    await expect(row(page, "fresh@example.com").getByText("Email didn't send")).toHaveCount(0);
  });

  test("cancelling an invite that's already gone says so and reloads the list", async ({ page }) => {
    await plantAuth(page);
    const { invitesLoads } = await stubApi(page);
    await page.goto("/members");
    await expect(row(page, "fresh@example.com")).toBeVisible();
    const before = invitesLoads();

    await page.getByRole("button", { name: "Cancel invite for fresh@example.com" }).click();

    await expect(page.getByText("That invite is already gone.", { exact: true })).toBeVisible();
    await expect.poll(invitesLoads).toBeGreaterThan(before);
  });

  test("an invite whose email fails reports it with a next step", async ({ page }) => {
    await plantAuth(page);
    const { invitesLoads } = await stubApi(page);
    await page.goto("/members");

    await page.getByLabel("Email address").fill("typo@exmaple.com");
    await expect.poll(invitesLoads).toBeGreaterThan(0);
    const loadsBeforeSend = invitesLoads();
    await page.getByRole("button", { name: "Send invite" }).click();

    await expect(
      page.getByText("I made the invite but couldn't send the email to typo@exmaple.com. Check the address, or cancel it and try again.", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/Share the invite link/)).toHaveCount(0);
    // Kept so the admin can fix the typo, even after the invites list reloads.
    await expect.poll(invitesLoads).toBeGreaterThan(loadsBeforeSend);
    await expect(page.getByLabel("Email address")).toHaveValue("typo@exmaple.com");
  });
});
