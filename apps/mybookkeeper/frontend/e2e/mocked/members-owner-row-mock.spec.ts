/**
 * No-backend E2E for the owner's row on /members, seen by an admin.
 *
 * Fully mocks the API via page.route(), so it runs under playwright.layout.config.ts
 * in the `frontend-layout-e2e` CI job.
 *
 * Verifies:
 *   - The owner's row offers no role change and no Remove: the server refuses both,
 *     since the owner changes only by ownership transfer.
 *   - Another member's row still offers them, and its role list never includes Owner.
 *   - Removing that member asks first, then sends the delete for them only.
 */
import { test, expect, type Page, type Request } from "@playwright/test";
import type { OrgMember } from "@mybookkeeper/api-client/types/organization/OrgMember";
import { json } from "@platform/ui/testing/mockResponse";
import { ORG_ID, plantAuth, stubSignedInShell } from "./fixtures/mockSession";

const ME_ID = "00000000-0000-0000-0000-000000000001";

function member(userId: string, email: string, orgRole: OrgMember["org_role"]): OrgMember {
  return {
    id: `m-${userId}`,
    organization_id: ORG_ID,
    user_id: userId,
    org_role: orgRole,
    joined_at: "2026-01-01T00:00:00Z",
    user_email: email,
    user_name: null,
  };
}

const MEMBERS: OrgMember[] = [
  member("owner-1", "owner@example.com", "owner"),
  member(ME_ID, "test@example.com", "admin"),
  member("user-2", "helper@example.com", "user"),
];

async function stubApi(page: Page): Promise<string[]> {
  const writes: string[] = [];
  await page.route("**/api/**", (route, request: Request) => {
    if (request.method() !== "GET") writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
    return route.fulfill(json(request.method() === "GET" ? [] : {}));
  });
  await stubSignedInShell(page, "admin");
  await page.route(`**/api/organizations/${ORG_ID}/members`, (route) => route.fulfill(json(MEMBERS)));
  return writes;
}

test.describe("Members: the owner's row", () => {
  test("offers no role change or removal for the owner, and both for others", async ({ page }) => {
    await plantAuth(page);
    const writes = await stubApi(page);

    await page.goto("/members");
    const ownerRow = page.getByRole("row", { name: /owner@example\.com/ });
    const helperRow = page.getByRole("row", { name: /helper@example\.com/ });
    await expect(ownerRow).toBeVisible();

    await expect(ownerRow.getByRole("combobox")).toHaveCount(0);
    await expect(ownerRow.getByRole("button", { name: /^Remove/ })).toHaveCount(0);
    await expect(ownerRow.getByText("Owner", { exact: true })).toBeVisible();

    const roles = helperRow.getByRole("combobox", { name: "Role for helper@example.com" });
    await expect(roles).toHaveValue("user");
    await expect(roles.locator("option")).toHaveCount(3);
    await expect(roles.locator('option[value="owner"]')).toHaveCount(0);

    await helperRow.getByRole("button", { name: "Remove helper@example.com" }).click();
    await expect(page.getByText(/remove helper@example\.com from the organization/)).toBeVisible();
    expect(writes).toEqual([]);
    await page.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
    await expect.poll(() => writes).toEqual([`DELETE /api/organizations/${ORG_ID}/members/user-2`]);
  });
});
