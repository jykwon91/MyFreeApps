import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures/auth";
import { createDemoUser, deleteDemoUsersTagged, demoUserIdsTagged } from "./fixtures/demo-users";
import { SuperuserSession } from "./fixtures/superuser-session";

// Create, reset and delete sit behind the strict superuser gate, so each one
// asks for a fresh code before it runs, as it does for the operator.
test.describe("Demo management (super admin)", () => {
  // One account for the file; each step-up spends a later code, which can mean
  // waiting for the next 30-second step.
  test.describe.configure({ mode: "serial", timeout: 90_000 });

  const runId = Date.now();
  let session: SuperuserSession | undefined;

  test.beforeAll(async ({ playwright }) => {
    session = await SuperuserSession.create(playwright, "demo", 4);
  });

  test.afterAll(async () => {
    await session?.delete();
  });

  function su(): SuperuserSession {
    if (!session) throw new Error("super admin session was not created");
    return session;
  }

  async function openDemoPage(page: Page): Promise<void> {
    await su().signIn(page);
    await page.goto("/admin/demo");
    await expect(page.getByRole("heading", { name: "Demo Management" })).toBeVisible({ timeout: 15000 });
  }

  async function confirmIdentity(page: Page): Promise<void> {
    const stepUp = page.getByRole("dialog", { name: "Confirm your identity" });
    await expect(stepUp).toBeVisible({ timeout: 10000 });
    await stepUp.getByLabel("6-digit code").fill(await su().nextTotpCode());
    await stepUp.getByRole("button", { name: "Verify" }).click();
    await expect(stepUp).toBeHidden({ timeout: 10000 });
  }

  function demoRow(page: Page, tag: string) {
    return page.getByRole("row").filter({ hasText: tag });
  }

  test("creating a demo user shows its credentials once and adds it to the table", async ({ page }) => {
    const tag = `E2E Demo Create ${runId}`;
    try {
      await openDemoPage(page);
      await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);

      await page.getByRole("button", { name: "Create Demo User" }).click();
      const form = page.getByRole("dialog", { name: "Create Demo User" });
      await form.getByLabel("Display Name").fill(tag);
      await expect(form.getByLabel("Send invite to")).toBeEmpty();
      const created = page.waitForResponse(
        (r) => r.url().endsWith("/admin/demo/create") && r.request().method() === "POST" && r.ok(),
      );
      await form.getByRole("button", { name: "Create", exact: true }).click();
      await confirmIdentity(page);
      const { credentials } = (await (await created).json()) as { credentials: { email: string; password: string } };

      const shown = page.getByRole("dialog", { name: "Demo Credentials" });
      await expect(shown.getByText(credentials.email, { exact: true })).toBeVisible();
      await expect(shown.locator("[data-credential-password]")).toHaveText(credentials.password);
      await shown.getByRole("button", { name: "Copy credentials" }).click();
      await expect(shown.getByRole("button", { name: "Copied" })).toBeVisible();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
        `Email: ${credentials.email}\nPassword: ${credentials.password}`,
      );
      await shown.getByRole("button", { name: "Close" }).click();
      await expect(shown).toBeHidden();

      await expect(page.getByRole("columnheader")).toHaveText(["Tag", "Email", "Uploads", "Created", "Actions"]);
      await expect(demoRow(page, tag).getByRole("cell").nth(1)).toHaveText(credentials.email);
      expect(await demoUserIdsTagged(su(), tag)).toHaveLength(1);
    } finally {
      await deleteDemoUsersTagged(su(), tag);
    }
  });

  test("resetting a demo user gives it a new password", async ({ page }) => {
    const tag = `E2E Demo Reset ${runId}`;
    try {
      const original = await createDemoUser(su(), tag);
      await openDemoPage(page);

      await demoRow(page, tag).getByRole("button", { name: `Reset ${tag}` }).click();
      const confirm = page.getByRole("dialog", { name: "Reset demo user?" });
      const reset = page.waitForResponse(
        (r) => r.url().endsWith(`/admin/demo/reset/${original.userId}`) && r.ok(),
      );
      await confirm.getByRole("button", { name: "Reset", exact: true }).click();
      await confirmIdentity(page);
      const fresh = (await (await reset).json()) as { email: string; password: string };

      expect(fresh.email).toBe(original.email);
      expect(fresh.password).not.toBe(original.password);
      const shown = page.getByRole("dialog", { name: "Demo Credentials" });
      await expect(shown.locator("[data-credential-password]")).toHaveText(fresh.password);
      await shown.getByRole("button", { name: "Close" }).click();

      await expect(demoRow(page, tag)).toHaveCount(1);
      expect(await demoUserIdsTagged(su(), tag)).toEqual([original.userId]);
    } finally {
      await deleteDemoUsersTagged(su(), tag);
    }
  });

  test("deleting a demo user removes it", async ({ page }) => {
    const tag = `E2E Demo Delete ${runId}`;
    try {
      await createDemoUser(su(), tag);
      await openDemoPage(page);

      await demoRow(page, tag).getByRole("button", { name: `Delete ${tag}` }).click();
      await page.getByRole("dialog", { name: "Delete demo user?" }).getByRole("button", { name: "Delete", exact: true }).click();
      await confirmIdentity(page);

      await expect(demoRow(page, tag)).toHaveCount(0, { timeout: 10000 });
      expect(await demoUserIdsTagged(su(), tag)).toEqual([]);
    } finally {
      await deleteDemoUsersTagged(su(), tag);
    }
  });
});
