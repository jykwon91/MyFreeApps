import { test, expect, getOrgId } from "./fixtures/auth";
import { toasts } from "./fixtures/toasts";
import { ViewerMember } from "./fixtures/viewer-member";
import type { OrgMember } from "@mybookkeeper/api-client/types/organization/OrgMember";
import type { UserProfile } from "../src/shared/types/user/user";

const RUN_ID = Date.now();
const orgId = getOrgId();

test.describe("Members page", () => {
  test.beforeAll(() => {
    expect(orgId, "the shared E2E user should have an organization").not.toBe("");
  });

  test.beforeEach(async ({ authedPage: page }) => {
    await page.goto("/members");
    await expect(page.getByRole("heading", { name: /members/i, level: 1 })).toBeVisible({ timeout: 10000 });
  });

  // ─── Member List ─────────────────────────────────────────────────────────────

  test.describe("Member list", () => {
    test("the current user's row shows their email, their role from the API, and 'You' instead of Remove", async ({
      authedPage: page,
      api,
    }) => {
      const meRes = await api.get("/users/me");
      expect(meRes.ok(), await meRes.text()).toBe(true);
      const me = (await meRes.json()) as UserProfile;
      const membersRes = await api.get(`/organizations/${orgId}/members`);
      expect(membersRes.ok(), await membersRes.text()).toBe(true);
      const self = ((await membersRes.json()) as OrgMember[]).find((m) => m.user_id === me.id);
      expect(self, "the E2E user should be a member of its organization").toBeDefined();

      const row = page.getByRole("row").filter({ hasText: me.email });
      await expect(row).toHaveCount(1);
      const cells = row.getByRole("cell");
      await expect(cells.nth(1)).toHaveText(new RegExp(`^${self!.org_role}$`, "i"));
      await expect(cells.nth(2)).toHaveText("You");
      await expect(row.getByRole("button", { name: /remove/i })).toHaveCount(0);
    });
  });

  // ─── Invite Flow ─────────────────────────────────────────────────────────────

  test.describe("Invite flow", () => {
    test("sends an invite that shows in pending invites with its role, and resets the form", async ({
      authedPage: page,
      invites,
    }) => {
      const testEmail = `e2e-invite-${RUN_ID}@example.com`;
      invites.track(testEmail);
      const emailInput = page.getByRole("textbox", { name: "Email address" });
      const roleSelect = page.getByRole("combobox", { name: "Role", exact: true });
      await emailInput.fill(testEmail);
      await roleSelect.selectOption("viewer");
      await page.getByRole("button", { name: /send invite/i }).click();

      await expect(toasts(page).getByText(`Invite sent to ${testEmail}`, { exact: true })).toBeVisible({
        timeout: 10000,
      });
      await expect(emailInput).toHaveValue("");
      await expect(roleSelect).toHaveValue("user");

      const row = page.getByRole("row").filter({ hasText: testEmail });
      await expect(row).toHaveCount(1);
      await expect(row.getByRole("cell").nth(1)).toHaveText("viewer");
      expect((await invites.findPending(testEmail))?.org_role).toBe("viewer");
    });

    test("an invalid email is stopped by the browser and never reaches the API", async ({
      authedPage: page,
      invites,
    }) => {
      const validEmail = `e2e-after-invalid-${RUN_ID}@example.com`;
      invites.track(validEmail);
      const posted: string[] = [];
      page.on("request", (req) => {
        if (req.method() === "POST" && req.url().endsWith(`/organizations/${orgId}/invites`)) {
          posted.push((req.postDataJSON() as { email: string }).email);
        }
      });
      const emailInput = page.getByRole("textbox", { name: "Email address" });
      const sendButton = page.getByRole("button", { name: /send invite/i });

      await emailInput.fill("not-an-email");
      await sendButton.click();
      expect(await emailInput.evaluate((el: HTMLInputElement) => !el.form!.noValidate && el.matches(":invalid"))).toBe(
        true,
      );
      await expect(emailInput).toHaveValue("not-an-email");

      // Requests go out in order, so if the invalid submit had posted, it would be listed before this one.
      await emailInput.fill(validEmail);
      await Promise.all([
        page.waitForResponse((res) => res.request().method() === "POST" && res.url().endsWith(`/organizations/${orgId}/invites`)),
        sendButton.click(),
      ]);
      expect(posted).toEqual([validEmail]);
    });
  });

  // ─── Pending Invites Section ─────────────────────────────────────────────────

  test.describe("Pending invites", () => {
    test("pending invite rows show email, role, status badge, and expiry", async ({ authedPage: page, invites }) => {
      // Seed our own invite: other specs create and cancel invites in parallel,
      // so an ambient one can vanish between the API read and the UI check.
      const testEmail = `e2e-pending-row-${RUN_ID}@example.com`;
      await invites.create(testEmail, "viewer");

      await page.reload();
      await expect(page.getByRole("heading", { name: "Pending invites" })).toBeVisible();
      const row = page.getByRole("row").filter({ hasText: testEmail });
      await expect(row).toHaveCount(1);
      const cells = row.getByRole("cell");
      await expect(cells.nth(1)).toHaveText("viewer");
      await expect(cells.nth(2)).toHaveText("Pending");
      await expect(cells.nth(3)).toHaveText(/^in /);
    });
  });

  // ─── Cancel invite (PR #212) ─────────────────────────────────────────────────

  test.describe("Cancel invite UI", () => {
    test("the X button cancels a pending invite, confirms it, and removes it", async ({ authedPage: page, invites }) => {
      const testEmail = `e2e-cancel-${RUN_ID}@example.com`;
      await invites.create(testEmail, "user");

      await page.reload();
      const row = page.getByRole("row").filter({ hasText: testEmail });
      await row.getByRole("button", { name: `Cancel invite for ${testEmail}` }).click();

      await expect(toasts(page).getByText(`Invite for ${testEmail} cancelled`, { exact: true })).toBeVisible({
        timeout: 10000,
      });
      await expect(row).toHaveCount(0);
      expect(await invites.findPending(testEmail)).toBeUndefined();
    });
  });

  // ─── Role Change ─────────────────────────────────────────────────────────────

  test.describe("Role management", () => {
    let member: ViewerMember | undefined;

    test.beforeAll(async ({ playwright }) => {
      member = await ViewerMember.join(playwright, `members-${RUN_ID}`);
    });

    test.afterAll(async ({ playwright }) => {
      await member?.delete(playwright);
    });

    test("changing a member role via dropdown shows success toast and saves it", async ({ authedPage: page, api }) => {
      if (!member) throw new Error("the second member was not created");
      const joined = member;
      const roleOf = (): Promise<string | undefined> => joined.roleIn(api);

      const roleSelect = page.getByRole("combobox", { name: `Role for ${joined.name}` });
      await expect(roleSelect).toHaveValue("viewer", { timeout: 10000 });

      await roleSelect.selectOption("admin");
      // Making someone an admin asks first; nothing changes until it's confirmed.
      const confirm = page.getByRole("dialog");
      await expect(confirm).toContainText(`Make ${joined.name} an admin?`);
      expect(await roleOf()).toBe("viewer");
      await confirm.getByRole("button", { name: "Make admin" }).click();
      await expect(toasts(page).getByText(new RegExp(`^Updated .* to admin$`))).toBeVisible({ timeout: 5000 });
      await expect.poll(roleOf).toBe("admin");

      // Restore — the first toast may still be showing.
      await roleSelect.selectOption("viewer");
      await expect(toasts(page).getByText(new RegExp(`^Updated .* to viewer$`))).toBeVisible({ timeout: 5000 });
      await expect.poll(roleOf).toBe("viewer");
    });
  });
});
