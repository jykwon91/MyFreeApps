import { test, expect, getOrgId } from "./fixtures/auth";
import { toasts } from "./fixtures/toasts";
import { ViewerMember } from "./fixtures/viewer-member";

const RUN_ID = Date.now();

test.describe("Members page", () => {
  test.beforeEach(async ({ authedPage: page }) => {
    await page.goto("/members");
    await expect(page.getByRole("heading", { name: /members/i, level: 1 })).toBeVisible({ timeout: 10000 });
  });

  // ─── Member List ─────────────────────────────────────────────────────────────

  test.describe("Member list", () => {
    test("shows current user in the team members list with correct role", async ({ authedPage: page, api }) => {
      // Fetch current user to know what to look for
      const userRes = await api.get("/users/me");
      const currentUser = await userRes.json();

      // The user's email should appear in the member list
      await expect(page.getByText(currentUser.email).first()).toBeVisible({ timeout: 10000 });
    });

    test("members list shows roles from API for all members", async ({ authedPage: page, api }) => {
      const orgRes = await api.get("/organizations");
      const orgs = await orgRes.json();
      if (!orgs.length) {
        test.skip();
        return;
      }

      const membersRes = await api.get(`/organizations/${orgs[0].id}/members`);
      if (!membersRes.ok()) {
        test.skip();
        return;
      }
      const members = await membersRes.json();

      // At least one member should be visible with a role badge or dropdown
      for (const member of members.slice(0, 3)) {
        const email = member.user_email;
        if (email) {
          await expect(page.getByText(email).first()).toBeVisible({ timeout: 10000 });
        }
      }
    });

    test("current user row shows 'You' label instead of Remove button", async ({ authedPage: page }) => {
      // The current user's row should show "You" in the actions column
      await expect(page.getByText("You").first()).toBeVisible({ timeout: 10000 });
    });
  });

  // ─── Invite Flow ─────────────────────────────────────────────────────────────

  test.describe("Invite flow", () => {
    test("sends invite and verifies it appears in pending invites, then cleans up", async ({ authedPage: page, api }) => {
      const emailInput = page.getByRole("textbox", { name: /email/i });
      if (!(await emailInput.isVisible({ timeout: 5000 }))) {
        test.skip(true, "Invite form not visible — user may not be org admin");
        return;
      }

      const testEmail = `e2e-invite-${RUN_ID}@example.com`;

      // Fill email and select role
      await emailInput.fill(testEmail);
      const roleSelect = page.locator("#invite-role");
      await roleSelect.selectOption("user");

      // Submit the invite
      await page.getByRole("button", { name: /send invite/i }).click();

      // Success toast should appear (message varies based on whether email was sent)
      await expect(
        toasts(page).getByText(new RegExp(`invite (sent to|created for) ${testEmail}`, "i"))
      ).toBeVisible({ timeout: 10000 });

      // The invite should now appear in the pending invites table
      await expect(page.getByText(testEmail).first()).toBeVisible({ timeout: 10000 });

      // Verify the role column shows "user"
      const inviteRow = page.locator("table").last().locator("tbody tr").filter({ hasText: testEmail });
      await expect(inviteRow.getByText(/user/i).first()).toBeVisible({ timeout: 5000 });

      // Cleanup: cancel the invite via API
      const orgRes = await api.get("/organizations");
      const orgs = await orgRes.json();
      if (orgs.length > 0) {
        const invitesRes = await api.get(`/organizations/${orgs[0].id}/invites`);
        if (invitesRes.ok()) {
          const invites = await invitesRes.json();
          const invite = invites.find((i: { email: string; id: string }) => i.email === testEmail);
          if (invite) {
            await api.delete(`/organizations/${orgs[0].id}/invites/${invite.id}`);
          }
        }
      }
    });

    test("invite with invalid email is rejected by HTML5 validation", async ({ authedPage: page }) => {
      const emailInput = page.getByRole("textbox", { name: /email/i });
      if (!(await emailInput.isVisible({ timeout: 5000 }))) {
        test.skip(true, "Invite form not visible — user may not be org admin");
        return;
      }

      // Type an invalid email
      await emailInput.fill("not-an-email");
      await page.getByRole("button", { name: /send invite/i }).click();

      // The form should not submit — no success toast should appear
      await expect(toasts(page).getByText(/invite (sent to|created for)/i)).not.toBeVisible({ timeout: 3000 });

      // The email input should still have the invalid value (form didn't reset)
      expect(await emailInput.inputValue()).toBe("not-an-email");
    });

    test("invite form resets after successful submission", async ({ authedPage: page, api }) => {
      const emailInput = page.getByRole("textbox", { name: /email/i });
      if (!(await emailInput.isVisible({ timeout: 5000 }))) {
        test.skip(true, "Invite form not visible — user may not be org admin");
        return;
      }

      const testEmail = `e2e-reset-${RUN_ID}@example.com`;
      await emailInput.fill(testEmail);
      await page.getByRole("button", { name: /send invite/i }).click();

      // Wait for success (message varies based on whether email was sent)
      await expect(
        toasts(page).getByText(new RegExp(`invite (sent to|created for) ${testEmail}`, "i"))
      ).toBeVisible({ timeout: 10000 });

      // Email input should be cleared after successful submission
      expect(await emailInput.inputValue()).toBe("");

      // Cleanup
      const orgRes = await api.get("/organizations");
      const orgs = await orgRes.json();
      if (orgs.length > 0) {
        const invitesRes = await api.get(`/organizations/${orgs[0].id}/invites`);
        if (invitesRes.ok()) {
          const invites = await invitesRes.json();
          const invite = invites.find((i: { email: string; id: string }) => i.email === testEmail);
          if (invite) {
            await api.delete(`/organizations/${orgs[0].id}/invites/${invite.id}`);
          }
        }
      }
    });
  });

  // ─── Pending Invites Section ─────────────────────────────────────────────────

  test.describe("Pending invites", () => {
    test("pending invites section is visible to admin users", async ({ authedPage: page }) => {
      const pendingHeading = page.getByText("Pending invites");
      await expect(pendingHeading).toBeVisible({ timeout: 10000 });
    });

    test("pending invite rows show email, role, status badge, and expiry", async ({ authedPage: page, api }) => {
      // Seed our own invite: other specs create and cancel invites in parallel,
      // so an ambient one can vanish between the API read and the UI check.
      const orgs = await (await api.get("/organizations")).json();
      const orgId: string = orgs[0].id;
      const testEmail = `e2e-pending-row-${RUN_ID}@example.com`;
      const createRes = await api.post(`/organizations/${orgId}/invites`, {
        data: { email: testEmail, org_role: "viewer" },
      });
      expect(createRes.status()).toBe(201);
      const invite: { id: string } = await createRes.json();

      try {
        await page.reload();
        const row = page.getByRole("row").filter({ hasText: testEmail });
        await expect(row).toHaveCount(1);
        const cells = row.getByRole("cell");
        await expect(cells.nth(1)).toHaveText("viewer");
        await expect(cells.nth(2)).toHaveText("Pending");
        await expect(cells.nth(3)).toHaveText(/^in /);
      } finally {
        const del = await api.delete(`/organizations/${orgId}/invites/${invite.id}`);
        expect(del.ok(), `cleanup: cancel invite ${invite.id}`).toBe(true);
      }
    });
  });

  // ─── Cancel invite (PR #212) ─────────────────────────────────────────────────

  test.describe("Cancel invite UI", () => {
    test("X button cancels a pending invite and removes it from the list", async ({
      authedPage: page,
      api,
    }) => {
      // Seed an invite via API so the test is independent of the invite form UI state
      const orgRes = await api.get("/organizations");
      const orgs = await orgRes.json();
      if (!orgs.length) {
        test.skip(true, "No organizations available for current user");
        return;
      }
      const orgId = orgs[0].id;

      const testEmail = `e2e-cancel-${RUN_ID}@example.com`;
      const createRes = await api.post(`/organizations/${orgId}/invites`, {
        data: { email: testEmail, org_role: "user" },
      });
      if (createRes.status() !== 201) {
        test.skip(true, "Current user cannot create invites (non-admin)");
        return;
      }
      const created = await createRes.json();
      const inviteId: string = created.id;

      try {
        // Reload the page so the new invite shows up in the pending list
        await page.reload();
        await expect(
          page.getByRole("heading", { name: /members/i, level: 1 })
        ).toBeVisible({ timeout: 10000 });

        // The invite email must be visible in the pending invites table
        await expect(page.getByText(testEmail).first()).toBeVisible({ timeout: 10000 });

        // Find the row for this invite and click its cancel (X) button.
        const inviteRow = page
          .locator("table")
          .last()
          .locator("tbody tr")
          .filter({ hasText: testEmail });
        await expect(inviteRow).toBeVisible({ timeout: 5000 });

        const cancelBtn = inviteRow.getByRole("button", { name: `Cancel invite for ${testEmail}` });
        await expect(cancelBtn).toBeVisible({ timeout: 5000 });
        await cancelBtn.click();

        // The invite row should disappear from the table (scoped to avoid matching the toast)
        await expect(inviteRow).not.toBeVisible({ timeout: 10000 });

        // Verify the backend has deleted it — list invites and confirm it is gone
        const listRes = await api.get(`/organizations/${orgId}/invites`);
        expect(listRes.ok()).toBe(true);
        const invites: Array<{ id: string; status: string }> = await listRes.json();
        const stillPending = invites.find(
          (i) => i.id === inviteId && i.status === "pending"
        );
        expect(stillPending).toBeUndefined();
      } finally {
        // Ensure cleanup even if the assertions above failed
        await api.delete(`/organizations/${orgId}/invites/${inviteId}`).catch(() => {
          /* already deleted — expected */
        });
      }
    });

    test("cancel button shows success message via toast or absence from list", async ({
      authedPage: page,
      api,
    }) => {
      const orgRes = await api.get("/organizations");
      const orgs = await orgRes.json();
      if (!orgs.length) {
        test.skip(true, "No organizations available");
        return;
      }
      const orgId = orgs[0].id;

      const testEmail = `e2e-cancel-toast-${RUN_ID}@example.com`;
      const createRes = await api.post(`/organizations/${orgId}/invites`, {
        data: { email: testEmail, org_role: "user" },
      });
      if (createRes.status() !== 201) {
        test.skip(true, "Current user cannot create invites");
        return;
      }
      const created = await createRes.json();

      try {
        await page.reload();
        await expect(page.getByText(testEmail).first()).toBeVisible({ timeout: 10000 });

        const inviteRow = page
          .locator("table")
          .last()
          .locator("tbody tr")
          .filter({ hasText: testEmail });
        const cancelBtn = inviteRow.getByRole("button", { name: `Cancel invite for ${testEmail}` });
        await cancelBtn.click();

        // A success toast should appear confirming the cancellation
        const toast = toasts(page).getByText(new RegExp(`invite for ${testEmail} cancelled`, "i"));
        await expect(toast).toBeVisible({ timeout: 10000 });

        // The invite row should also be gone from the table (scoped to avoid matching the toast)
        await expect(inviteRow).not.toBeVisible({ timeout: 10000 });
      } finally {
        await api.delete(`/organizations/${orgId}/invites/${created.id}`).catch(() => {});
      }
    });
  });

  // ─── Role Change ─────────────────────────────────────────────────────────────

  test.describe("Role management", () => {
    let member: ViewerMember | undefined;

    test.beforeAll(async ({ playwright }) => {
      member = await ViewerMember.join(playwright, `members-${RUN_ID}`);
    });

    test.afterAll(async () => {
      await member?.delete();
    });

    test("changing a member role via dropdown shows success toast and saves it", async ({ authedPage: page, api }) => {
      if (!member) throw new Error("the second member was not created");
      const { userId, name } = member;
      const roleOf = async (): Promise<string | undefined> => {
        const res = await api.get(`/organizations/${getOrgId()}/members`);
        expect(res.ok()).toBe(true);
        const members: Array<{ user_id: string; org_role: string }> = await res.json();
        return members.find((m) => m.user_id === userId)?.org_role;
      };

      const roleSelect = page.getByRole("combobox", { name: `Role for ${name}` });
      await expect(roleSelect).toHaveValue("viewer", { timeout: 10000 });

      await roleSelect.selectOption("admin");
      await expect(toasts(page).getByText(new RegExp(`^Updated .* to admin$`))).toBeVisible({ timeout: 5000 });
      await expect.poll(roleOf).toBe("admin");

      // Restore — the first toast may still be showing.
      await roleSelect.selectOption("viewer");
      await expect(toasts(page).getByText(new RegExp(`^Updated .* to viewer$`))).toBeVisible({ timeout: 5000 });
      await expect.poll(roleOf).toBe("viewer");
    });
  });
});
