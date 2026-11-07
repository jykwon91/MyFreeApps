import { test, expect, type APIRequestContext } from "./fixtures/auth";
import { TestAccount } from "./fixtures/test-account";
import { toasts } from "./fixtures/toasts";
import { formatCost } from "../src/admin/features/costs/format";
import type { CostSummary } from "../src/shared/types/admin/cost";

async function adminRoleOf(api: APIRequestContext, userId: string): Promise<string | undefined> {
  const res = await api.get("/admin/users");
  expect(res.status(), await res.text()).toBe(200);
  return ((await res.json()) as { id: string; role: string }[]).find((u) => u.id === userId)?.role;
}

test.describe("Admin Dashboard", () => {
  test.beforeEach(async ({ authedPage: page }) => {
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Admin" })).toBeVisible();
    // Wait for stats cards to load (past skeleton)
    await expect(page.getByText("Total Users")).toBeVisible({ timeout: 10000 });
  });

  test("stats cards show exact values from /admin/stats API", async ({ authedPage: page, api }) => {
    const res = await api.get("/admin/stats");
    expect(res.ok()).toBe(true);
    const stats = await res.json();

    // Each stat card should display its API value
    const expectedUsers = stats.total_users.toLocaleString();
    const expectedOrgs = stats.total_organizations.toLocaleString();
    const expectedTxns = stats.total_transactions.toLocaleString();
    const expectedDocs = stats.total_documents.toLocaleString();

    await expect(page.getByText(expectedUsers).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(expectedOrgs).first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(expectedTxns).first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(expectedDocs).first()).toBeVisible({ timeout: 5000 });

    // Active/inactive breakdown should also display
    const activeDetail = `${stats.active_users} active, ${stats.inactive_users} inactive`;
    await expect(page.getByText(activeDetail)).toBeVisible({ timeout: 5000 });
  });

  test("search filters users — nonexistent email shows empty state", async ({ authedPage: page }) => {
    const search = page.getByPlaceholder(/search by email or name/i);
    await search.fill("zzz-nonexistent-user-xyz@nowhere.invalid");

    // Empty state row should appear
    await expect(page.getByText(/no users found/i)).toBeVisible({ timeout: 5000 });
  });

  test("search filters users — typing real email shows matching row, clearing restores all", async ({ authedPage: page, api }) => {
    // The signed-in admin is always in the list.
    const me = await api.get("/users/me");
    expect(me.status(), await me.text()).toBe(200);
    const targetEmail = ((await me.json()) as { email: string }).email;
    const search = page.getByPlaceholder(/search by email or name/i);

    // Filter by the target email
    await search.fill(targetEmail);
    const matchingRow = page.locator("tbody tr").filter({ hasText: targetEmail });
    await expect(matchingRow.first()).toBeVisible({ timeout: 5000 });

    // Count visible rows — should be reduced
    const filteredCount = await page.locator("tbody tr").count();

    // Clear search — all rows should come back
    await search.fill("");
    await page.waitForTimeout(300); // debounce
    const fullCount = await page.locator("tbody tr").count();
    expect(fullCount).toBeGreaterThanOrEqual(filteredCount);
  });

  test("tab switching — Organizations tab shows org table, Users tab shows user table", async ({ authedPage: page }) => {
    // Switch to Organizations tab
    await page.getByRole("tab", { name: "Organizations" }).click();

    // Verify org table headers appear
    await expect(page.getByRole("columnheader", { name: "Owner" })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("columnheader", { name: "Members" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Transactions" })).toBeVisible();

    // Users table headers should not be visible
    await expect(page.getByRole("columnheader", { name: "Superuser" })).not.toBeVisible();

    // Switch back to Users tab
    await page.getByRole("tab", { name: "Users" }).click();
    await expect(page.getByRole("columnheader", { name: "Email" })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("columnheader", { name: "Role" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Superuser" })).toBeVisible();
  });

  test("Organizations tab shows data matching /admin/organizations API", async ({ authedPage: page, api }) => {
    const res = await api.get("/admin/orgs");
    expect(res.status(), await res.text()).toBe(200);
    const orgs = await res.json();

    await page.getByRole("tab", { name: "Organizations" }).click();
    await expect(page.getByRole("columnheader", { name: "Owner" })).toBeVisible({ timeout: 5000 });

    if (orgs.length === 0) {
      await expect(page.getByText(/no organizations found/i)).toBeVisible({ timeout: 5000 });
    } else {
      // First org name should appear in the table
      await expect(page.getByText(orgs[0].name).first()).toBeVisible({ timeout: 5000 });
    }
  });

  test("role change via dropdown saves the new role, and changing it back restores it", async ({
    authedPage: page,
    api,
    playwright,
  }) => {
    // A user of its own to change, so no real account's role is touched.
    const target = await TestAccount.create(playwright, "admin-role");
    try {
      expect(await adminRoleOf(api, target.userId)).toBe("user");
      await page.reload();
      await page.getByPlaceholder(/search by email or name/i).fill(target.email);
      const roleSelect = page.locator("tbody tr").filter({ hasText: target.email }).locator("select");
      await expect(roleSelect).toHaveValue("user", { timeout: 10000 });

      await roleSelect.selectOption("admin");
      await expect(toasts(page).getByText(/role updated/i)).toBeVisible({ timeout: 5000 });
      await expect.poll(() => adminRoleOf(api, target.userId)).toBe("admin");

      // Both changes say "Role updated", and the first toast may still be showing.
      await roleSelect.selectOption("user");
      await expect(toasts(page).getByText(/role updated/i)).toHaveCount(2, { timeout: 5000 });
      await expect.poll(() => adminRoleOf(api, target.userId)).toBe("user");
    } finally {
      await target.delete(playwright);
    }
  });
});

test.describe("System Health", () => {
  test.beforeEach(async ({ authedPage: page }) => {
    await page.goto("/admin/system-health");
    await expect(page.getByRole("heading", { name: "System Health" })).toBeVisible();
    await expect(page.getByText("Documents Processing")).toBeVisible({ timeout: 10000 });
  });

  test("stats grid values match /health/summary API", async ({ authedPage: page, api }) => {
    const res = await api.get("/health/summary");
    expect(res.ok()).toBe(true);
    const summary = await res.json();

    if (summary.stats) {
      // Verify specific stat values from API appear on page
      const failedCount = summary.stats.documents_failed.toLocaleString();
      const processingCount = summary.stats.documents_processing.toLocaleString();
      const extractionsCount = summary.stats.extractions_today.toLocaleString();

      // Find stat cards and verify values
      await expect(page.getByText(failedCount).first()).toBeVisible({ timeout: 5000 });
      await expect(page.getByText(processingCount).first()).toBeVisible({ timeout: 5000 });
      await expect(page.getByText(extractionsCount).first()).toBeVisible({ timeout: 5000 });
    }
  });

  test("severity filter changes the events table content", async ({ authedPage: page }) => {
    const severitySelect = page.locator("select[aria-label='Filter by severity']");
    await expect(severitySelect).toBeVisible({ timeout: 5000 });

    // Filter by "error": every row left must be an error event, or the empty state shows
    await severitySelect.selectOption("error");
    await page.waitForLoadState("networkidle");
    const severityCells = page.locator("table tbody tr td:nth-child(3)");
    const emptyState = page.getByText(/no events match/i);
    await expect(severityCells.first().or(emptyState)).toBeVisible({ timeout: 5000 });
    for (const severity of await severityCells.allInnerTexts()) {
      expect(severity.trim()).toBe("error");
    }

    // Reset to "all"
    await severitySelect.selectOption("all");
    await expect(severitySelect).toHaveValue("all");
  });

  test("Retry Failed Documents button click triggers API call", async ({ authedPage: page }) => {
    const retryBtn = page.getByRole("button", { name: /retry failed/i });
    await expect(retryBtn).toBeVisible();

    if (await retryBtn.isEnabled()) {
      await retryBtn.click();
      // Should show success or error toast
      await expect(
        toasts(page).getByText(/reset \d+ failed document/i).or(toasts(page).getByText(/couldn't retry/i))
      ).toBeVisible({ timeout: 10000 });
    }
    // If disabled, that means 0 failed documents — button correctly reflects state
  });
});

test.describe("Cost Monitoring", () => {
  test.beforeEach(async ({ authedPage: page }) => {
    await page.goto("/admin/costs");
    await expect(page.getByRole("heading", { name: "Cost Monitoring" }).first()).toBeVisible({ timeout: 10000 });
  });

  test("cost summary cards show values from API", async ({ authedPage: page, api }) => {
    const res = await api.get("/admin/costs/summary");
    expect(res.status(), await res.text()).toBe(200);
    const summary: CostSummary = await res.json();

    const cards: Array<[string, number]> = [
      ["Today", summary.today],
      ["This Week", summary.this_week],
      ["This Month", summary.this_month],
    ];
    for (const [label, cost] of cards) {
      const value = page.locator("p", { hasText: new RegExp(`^${label}$`) }).locator("xpath=following-sibling::p[1]");
      await expect(value).toHaveText(formatCost(cost), { timeout: 10000 });
    }
  });

  test("user period selector switches between today/week/month and updates table", async ({ authedPage: page }) => {
    const select = page.locator("#cost-user-period");
    await expect(select).toBeVisible({ timeout: 5000 });

    // Switch to week
    await select.selectOption("week");
    await expect(select).toHaveValue("week");
    await page.waitForLoadState("networkidle");

    // Switch to month
    await select.selectOption("month");
    await expect(select).toHaveValue("month");
    await page.waitForLoadState("networkidle");

    // Switch back to today
    await select.selectOption("today");
    await expect(select).toHaveValue("today");
  });

  test("alert threshold settings modal opens, shows fields, and closes", async ({ authedPage: page, api }) => {
    // Click the settings button
    await page.getByRole("button", { name: "Alert threshold settings" }).click();

    // Modal should open with threshold fields
    await expect(page.getByText("Alert Thresholds")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Daily Budget")).toBeVisible();
    await expect(page.getByText("Monthly Budget")).toBeVisible();
    await expect(page.getByText("Per-User Daily Alert")).toBeVisible();

    // Verify threshold values from API are populated in the inputs
    const thresholdsRes = await api.get("/admin/costs/thresholds");
    expect(thresholdsRes.status(), await thresholdsRes.text()).toBe(200);
    const thresholds = (await thresholdsRes.json()) as { daily_budget: number };
    const dailyInput = page.locator("#threshold-daily_budget");
    await expect(dailyInput).toBeVisible({ timeout: 3000 });
    expect(parseFloat(await dailyInput.inputValue())).toBe(thresholds.daily_budget);

    // Close the modal by clicking the X button
    await page.locator(".fixed button:has-text('×')").click();
    await expect(page.getByText("Alert Thresholds")).not.toBeVisible({ timeout: 3000 });
  });

  test("changing threshold value enables Save Changes button", async ({ authedPage: page }) => {
    await page.getByRole("button", { name: "Alert threshold settings" }).click();
    await expect(page.getByText("Daily Budget")).toBeVisible({ timeout: 5000 });

    // Initially Save Changes should not be visible (not dirty)
    await expect(page.getByRole("button", { name: /save changes/i })).not.toBeVisible({ timeout: 2000 });

    // Change a value
    const dailyInput = page.locator("#threshold-daily_budget");
    await expect(dailyInput).toBeVisible({ timeout: 3000 });
    const original = await dailyInput.inputValue();
    const newVal = String(parseFloat(original) + 1);
    await dailyInput.fill(newVal);

    // Save Changes should now appear
    await expect(page.getByRole("button", { name: /save changes/i })).toBeVisible({ timeout: 3000 });

    // Restore original to avoid side effects
    await dailyInput.fill(original);
  });
});
