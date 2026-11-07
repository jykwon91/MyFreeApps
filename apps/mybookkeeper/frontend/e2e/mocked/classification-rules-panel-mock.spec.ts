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
 */
import { test, expect, type Page } from "@playwright/test";
import { json } from "./fixtures/mockResponse";
import { ORG_ID, plantAuth, stubSignedInShell } from "./fixtures/mockSession";
import type { ClassificationRule } from "@/shared/types/classification-rule/classification-rule";

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
