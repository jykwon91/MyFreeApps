/**
 * Viewer role — E2E tests, against a real viewer: a second account that joined
 * the shared E2E user's organization through a viewer invite.
 */
import type { Page } from "@playwright/test";
import { test, expect, getOrgId } from "./fixtures/auth";
import { ViewerMember } from "./fixtures/viewer-member";

const RUN_ID = Date.now();

interface MemberData {
  user_id: string;
  org_role: string;
}

interface InviteData {
  id: string;
  email: string;
  org_role: string;
}

// One viewer for the file. Serial, because the role-update test moves it off
// viewer for a moment and the enforcement tests need it to be one.
test.describe.configure({ mode: "serial" });

let viewerMember: ViewerMember | undefined;

test.beforeAll(async ({ playwright }) => {
  viewerMember = await ViewerMember.join(playwright, `role-${RUN_ID}`);
});

test.afterAll(async () => {
  await viewerMember?.delete();
});

function viewer(): ViewerMember {
  if (!viewerMember) throw new Error("the viewer member was not created");
  return viewerMember;
}

// ---------------------------------------------------------------------------
// API — invites and role updates
// ---------------------------------------------------------------------------

test.describe("Viewer role — API invite", () => {
  test("a viewer invite is created with org_role=viewer and listed as one", async ({ api }) => {
    const orgId = getOrgId();
    const email = `e2e-viewer-invite-${RUN_ID}@example.com`;
    const res = await api.post(`/organizations/${orgId}/invites`, { data: { email, org_role: "viewer" } });
    expect(res.status()).toBe(201);
    const created: InviteData = await res.json();
    try {
      expect(created.org_role).toBe("viewer");
      expect(created.email).toBe(email);

      const listRes = await api.get(`/organizations/${orgId}/invites`);
      expect(listRes.ok()).toBe(true);
      const invites: InviteData[] = await listRes.json();
      expect(invites.find((i) => i.id === created.id)?.org_role).toBe("viewer");
    } finally {
      await api.delete(`/organizations/${orgId}/invites/${created.id}`);
    }
  });
});

test.describe("Viewer role — API role update", () => {
  async function roleOf(api: Parameters<Parameters<typeof test>[2]>[0]["api"], userId: string): Promise<string | undefined> {
    const res = await api.get(`/organizations/${getOrgId()}/members`);
    expect(res.ok()).toBe(true);
    const members: MemberData[] = await res.json();
    return members.find((m) => m.user_id === userId)?.org_role;
  }

  test("the joined member is a viewer, and a role change to and from viewer persists", async ({ api }) => {
    const { userId } = viewer();
    const rolePath = `/organizations/${getOrgId()}/members/${userId}/role`;
    expect(await roleOf(api, userId)).toBe("viewer");

    try {
      const toUser = await api.patch(rolePath, { data: { org_role: "user" } });
      expect(toUser.status()).toBe(200);
      expect(await roleOf(api, userId)).toBe("user");
    } finally {
      const back = await api.patch(rolePath, { data: { org_role: "viewer" } });
      expect(back.status()).toBe(200);
    }
    expect(await roleOf(api, userId)).toBe("viewer");
  });

  for (const role of ["superadmin", "owner"]) {
    test(`a role change to "${role}" is rejected and the role is unchanged`, async ({ api }) => {
      const { userId } = viewer();
      const res = await api.patch(`/organizations/${getOrgId()}/members/${userId}/role`, { data: { org_role: role } });
      expect(res.status()).toBe(422);
      expect(await roleOf(api, userId)).toBe("viewer");
    });
  }
});

// ---------------------------------------------------------------------------
// UI — the owner's Members page
// ---------------------------------------------------------------------------

test.describe("Viewer role — Members page (owner)", () => {
  test.beforeEach(async ({ authedPage: page }) => {
    await page.goto("/members");
    await expect(page.getByRole("heading", { name: /members/i, level: 1 })).toBeVisible({ timeout: 10000 });
  });

  test("the page renders without critical JS errors", async ({ authedPage: page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.reload();
    await expect(page.getByRole("heading", { name: /members/i, level: 1 })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("combobox", { name: `Role for ${viewer().name}` })).toBeVisible();
    expect(errors.filter((e) => !e.includes("ResizeObserver"))).toHaveLength(0);
  });

  test("sending a viewer invite from the form lists it as a viewer", async ({ authedPage: page, api }) => {
    const email = `e2e-viewer-ui-${RUN_ID}@example.com`;
    await page.getByRole("textbox", { name: /email/i }).fill(email);
    await page.locator("#invite-role").selectOption("viewer");
    await page.getByRole("button", { name: /send invite/i }).click();

    try {
      await expect(page.getByText(new RegExp(`invite (sent to|created for) ${email}`, "i")).first()).toBeVisible({
        timeout: 10000,
      });
      const inviteRow = page.locator("table").last().locator("tbody tr").filter({ hasText: email });
      await expect(inviteRow.getByText(/viewer/i).first()).toBeVisible({ timeout: 5000 });
    } finally {
      const invitesRes = await api.get(`/organizations/${getOrgId()}/invites`);
      const invites: InviteData[] = await invitesRes.json();
      const invite = invites.find((i) => i.email === email);
      if (invite) await api.delete(`/organizations/${getOrgId()}/invites/${invite.id}`);
    }
  });

  test("the viewer's row shows viewer selected in its role dropdown", async ({ authedPage: page }) => {
    const roleSelect = page.getByRole("combobox", { name: `Role for ${viewer().name}` });
    await expect(roleSelect).toHaveValue("viewer", { timeout: 10000 });
    await expect(roleSelect.locator("option")).toHaveText([/^Admin/, /^User/, /^Viewer/]);
  });
});

// ---------------------------------------------------------------------------
// UI — signed in as the viewer
// ---------------------------------------------------------------------------

// Pages render only after organizations load. Wait for the heading and the
// "Viewer" label so absence checks run against the loaded page, not the skeleton.
async function openAsViewer(page: Page, path: string, heading: string): Promise<void> {
  await page.goto(path);
  await expect(page.getByRole("heading", { name: heading })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("Viewer", { exact: true })).toBeVisible();
}

test.describe("Viewer role — write affordances (signed in as the viewer)", () => {
  test.beforeEach(async ({ page }) => {
    await viewer().signIn(page);
  });

  test("Transactions disables Add Transaction and hides Vendor Rules and Import", async ({ page }) => {
    await openAsViewer(page, "/transactions", "Transactions");
    await expect(page.getByRole("button", { name: /add transaction/i })).toBeDisabled();
    await expect(page.getByRole("button", { name: /vendor rules/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^import$/i })).toHaveCount(0);
  });

  test("Documents hides the upload zone", async ({ page }) => {
    await openAsViewer(page, "/documents", "Documents");
    await expect(page.getByPlaceholder("Search by file name...")).toBeVisible();
    await expect(page.getByText(/drag and drop a file/i)).toHaveCount(0);
    await expect(page.locator("input[type='file']")).toHaveCount(0);
  });

  test("Properties hides the create form", async ({ page }) => {
    await openAsViewer(page, "/properties", "Properties");
    await expect(page.getByRole("textbox", { name: /property name/i })).toHaveCount(0);
  });

  test("read pages open without a redirect", async ({ page }) => {
    for (const [path, heading] of [["/", "Dashboard"], ["/transactions", "Transactions"], ["/documents", "Documents"]]) {
      await openAsViewer(page, path, heading);
      expect(new URL(page.url()).pathname).toBe(path);
    }
  });
});

// ---------------------------------------------------------------------------
// API — the viewer's own token
// ---------------------------------------------------------------------------

test.describe("Viewer role — API write enforcement", () => {
  test("the viewer can read transactions but creating one is refused and nothing is saved", async ({ api }) => {
    const vendor = `E2E Viewer Forbidden ${RUN_ID}`;
    expect((await viewer().api.get("/transactions")).status()).toBe(200);

    const res = await viewer().api.post("/transactions", {
      data: {
        transaction_date: "2025-06-15",
        amount: 5.0,
        vendor,
        category: "uncategorized",
        transaction_type: "expense",
      },
    });
    expect(res.status()).toBe(403);

    const ownerList = await api.get("/transactions");
    expect(ownerList.ok()).toBe(true);
    expect(JSON.stringify(await ownerList.json())).not.toContain(vendor);
  });
});
