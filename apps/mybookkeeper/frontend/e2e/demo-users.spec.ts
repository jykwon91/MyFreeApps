import { test, expect } from "./fixtures/auth";

test.describe("Demo Users Management (consolidated page)", () => {
  test.beforeEach(async ({ authedPage: page }) => {
    await page.goto("/admin/demo");
    await expect(page.getByRole("heading", { name: "Demo Management" })).toBeVisible({ timeout: 15000 });
  });

  test("page renders demo users section with create button", async ({ authedPage: page }) => {
    await expect(page.getByRole("heading", { name: "Demo Users" })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("button", { name: /create demo user/i })).toBeVisible();

    const table = page.locator("table");
    const emptyState = page.getByText(/no demo users yet/i);
    await expect(table.or(emptyState)).toBeVisible({ timeout: 10000 });
  });

  test("legacy demo status and actions sections are removed", async ({ authedPage: page }) => {
    // The old "Demo Status" card with Active/Not Created badge should not exist
    await expect(page.getByText("Demo Status")).not.toBeVisible();
    await expect(page.getByText("Not Created")).not.toBeVisible();

    // The old "Actions" card with global "Reset Demo Data" button should not exist
    await expect(page.getByText("Reset Demo Data")).not.toBeVisible();

    // The old data counts grid (Properties, Transactions, Documents, Tax Returns stats) should not exist
    // These were stat labels in the DemoStatusCard — they should not appear as standalone stats
    const statsGrid = page.locator(".grid-cols-4");
    await expect(statsGrid).not.toBeVisible();
  });

  test("create demo user dialog has display name and email fields", async ({ authedPage: page }) => {
    await page.getByRole("button", { name: /create demo user/i }).click();

    await expect(page.getByLabel(/display name/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByLabel(/send invite to/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Create" })).toBeVisible();
  });

  test("create demo user flow shows credentials", async ({ authedPage: page }) => {
    await page.getByRole("button", { name: /create demo user/i }).click();

    const tag = `E2E Test ${Date.now()}`;
    await page.getByLabel(/display name/i).fill(tag);
    await page.getByRole("button", { name: "Create" }).click();

    await expect(page.getByText(/demo credentials/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/password won't be shown again/i)).toBeVisible();

    await page.getByRole("button", { name: "Close" }).click();

    await expect(page.getByText(tag)).toBeVisible({ timeout: 10000 });
  });

  test("table shows correct columns when users exist", async ({ authedPage: page, api }) => {
    const res = await api.get("/demo/users");
    const data = await res.json();

    if (data.total === 0) {
      await api.post("/demo/create", { data: { tag: "E2E Column Test" } });
      await page.reload();
      await expect(page.getByRole("heading", { name: "Demo Management" })).toBeVisible({ timeout: 15000 });
    }

    await expect(page.getByRole("columnheader", { name: "Tag" })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("columnheader", { name: "Email" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Uploads" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Actions" })).toBeVisible();
  });

  test("delete demo user removes from table", async ({ authedPage: page, api }) => {
    const tag = `E2E Delete ${Date.now()}`;
    await api.post("/demo/create", { data: { tag } });
    await page.reload();
    await expect(page.getByRole("heading", { name: "Demo Management" })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(tag)).toBeVisible({ timeout: 10000 });

    const row = page.locator("tr").filter({ hasText: tag });
    const deleteBtn = row.getByRole("button", { name: new RegExp(`Delete ${tag}`) });
    await deleteBtn.click();

    await expect(page.getByText(/delete demo user/i)).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: "Delete" }).click();

    await expect(page.getByText(/deleted/i).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(tag)).not.toBeVisible({ timeout: 10000 });
  });

  test.afterAll(async ({ api }) => {
    const res = await api.get("/demo/users");
    if (res.ok()) {
      const data = await res.json();
      for (const user of data.users) {
        if (user.tag.startsWith("E2E")) {
          await api.delete(`/demo/users/${user.user_id}`).catch(() => {});
        }
      }
    }
  });
});
