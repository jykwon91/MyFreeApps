/**
 * No-backend E2E for the Classification Rules panel on /transactions.
 *
 * Fully mocks the API via page.route(), so it runs under playwright.layout.config.ts
 * in the `frontend-layout-e2e` CI job. The real-stack spec shares one account
 * with parallel specs that add rules, so it can't pin the rule list; this one can.
 *
 * Verifies:
 *   - With no rules, the panel shows its empty state and "0 rules total".
 *   - With rules, it lists each one (pattern, category, times used) and the
 *     footer count matches.
 *   - Delete: the confirm dialog shows loading until the request finishes, and a
 *     403 shows the view-only toast.
 */
import { test, expect, type Page } from "@playwright/test";
import { json } from "./fixtures/mockResponse";
import { ORG_ID, plantAuth, stubSignedInShell } from "./fixtures/mockSession";
import type { ClassificationRule } from "@mybookkeeper/api-client/types/classification-rule/classification-rule";

const rule = (id: string, match_pattern: string, category: string, times_applied: number): ClassificationRule => ({
  id,
  organization_id: ORG_ID,
  match_type: "vendor",
  match_pattern,
  match_context: null,
  category,
  property_id: null,
  activity_id: null,
  source: "user_correction",
  priority: 0,
  times_applied,
  is_active: true,
  created_at: "2026-10-01T00:00:00Z",
});

async function openPanel(page: Page, rules: ClassificationRule[]) {
  await plantAuth(page);
  // Registered first so the specific routes below win; the page's other reads get an empty answer.
  await page.route("**/api/**", (route, request) => route.fulfill(json(request.method() === "GET" ? [] : {})));
  await stubSignedInShell(page, "owner");
  await page.route("**/api/classification-rules", (route) => route.fulfill(json(rules)));

  await page.goto("/transactions");
  await page.getByRole("button", { name: /vendor rules/i }).click();
  return page.getByRole("dialog", { name: "Classification Rules" });
}

test("with no rules the panel shows its empty state", async ({ page }) => {
  const panel = await openPanel(page, []);

  await expect(panel.getByText("No classification rules yet.")).toBeVisible();
  await expect(panel.getByText("0 rules total")).toBeVisible();
  await expect(panel.getByRole("table")).toHaveCount(0);
});

test("lists every rule and counts them in the footer", async ({ page }) => {
  const panel = await openPanel(page, [
    rule("00000000-0000-0000-0000-0000000000c1", "Home Depot", "maintenance", 4),
    rule("00000000-0000-0000-0000-0000000000c2", "City Water", "utilities", 1),
  ]);

  const rows = panel.locator("tbody tr");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("Home Depot");
  await expect(rows.nth(0)).toContainText("Maintenance");
  await expect(rows.nth(0)).toContainText("4x");
  await expect(rows.nth(1)).toContainText("City Water");
  await expect(rows.nth(1)).toContainText("Utilities");
  await expect(panel.getByText("2 rules total")).toBeVisible();
});

const RULE_ID = "00000000-0000-0000-0000-0000000000c1";

test("the confirm dialog shows loading until the delete finishes", async ({ page }) => {
  const panel = await openPanel(page, [rule(RULE_ID, "Home Depot", "maintenance", 4)]);
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route(`**/api/classification-rules/${RULE_ID}`, async (route) => {
    await gate;
    await route.fulfill({ status: 204 });
  });

  await panel.getByRole("button", { name: "Delete rule for Home Depot" }).click();
  const dialog = page.getByRole("dialog").filter({ hasText: "Delete classification rule" });
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();

  await expect(dialog.getByText(/processing/i)).toBeVisible();
  release();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("Rule deleted.", { exact: true })).toBeVisible();
});

test("a 403 on delete shows the view-only message", async ({ page }) => {
  const panel = await openPanel(page, [rule(RULE_ID, "Home Depot", "maintenance", 4)]);
  await page.route(`**/api/classification-rules/${RULE_ID}`, (route) =>
    route.fulfill(json({ detail: "Forbidden" }, 403)),
  );

  await panel.getByRole("button", { name: "Delete rule for Home Depot" }).click();
  await page.getByRole("dialog").filter({ hasText: "Delete classification rule" }).getByRole("button", { name: "Delete", exact: true }).click();

  await expect(page.getByText("You have view-only access, so I can't delete rules.", { exact: true })).toBeVisible();
  await expect(panel.locator("tbody tr")).toHaveCount(1);
});
