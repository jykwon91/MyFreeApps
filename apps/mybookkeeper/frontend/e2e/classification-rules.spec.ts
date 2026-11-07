import { test, expect } from "./fixtures/auth";

test.describe("Classification Rules panel", () => {
  test.beforeEach(async ({ authedPage: page }) => {
    await page.goto("/transactions");
    await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible();
    await expect(
      page.locator("tbody tr").first().or(page.getByText(/no transactions found/i))
    ).toBeVisible({ timeout: 10000 });
  });

  // Other specs add and remove rules on this account in parallel, so these
  // tests check their own rule rather than the account's whole list. The
  // empty state and exact counts are pinned in mocked/classification-rules-panel-mock.spec.ts.
  test("opens panel from toolbar and shows a rule created through the API", async ({ authedPage: page, api }) => {
    const pattern = `E2E Panel Rule ${Date.now()}`;
    const createRes = await api.post("/classification-rules", {
      data: { match_type: "vendor", match_pattern: pattern, category: "utilities" },
    });
    expect(createRes.ok()).toBe(true);
    const rule = await createRes.json();

    try {
      await page.reload();
      await page.getByRole("button", { name: /vendor rules/i }).click();

      const panel = page.getByRole("dialog", { name: "Classification Rules" });
      await expect(panel.getByText(/I learn these from your corrections/i)).toBeVisible();
      await expect(panel.getByRole("columnheader", { name: "Pattern" })).toBeVisible();
      await expect(panel.getByRole("columnheader", { name: "Category" })).toBeVisible();

      const row = panel.locator("tbody tr").filter({ hasText: pattern });
      await expect(row).toBeVisible();
      await expect(row).toContainText("Utilities");
    } finally {
      await api.delete(`/classification-rules/${rule.id}`);
    }
  });

  test("create a rule via API, verify it appears in UI, then delete via UI", async ({ authedPage: page, api }) => {
    // Create a rule via API
    const uniquePattern = `E2E Delete Rule ${Date.now()}`;
    const createRes = await api.post("/classification-rules", {
      data: {
        match_type: "vendor",
        match_pattern: uniquePattern,
        category: "utilities",
      },
    });
    expect(createRes.ok()).toBe(true);
    const rule = await createRes.json();

    // Reload to pick up the new rule
    await page.reload();
    await expect(
      page.locator("tbody tr").first().or(page.getByText(/no transactions found/i))
    ).toBeVisible({ timeout: 10000 });

    // Open classification rules panel
    await page.getByRole("button", { name: /vendor rules/i }).click();
    await expect(page.getByText("Classification Rules").first()).toBeVisible({ timeout: 5000 });

    // The new rule should appear
    const rulePattern = rule.match_pattern ?? uniquePattern;
    await expect(page.getByText(rulePattern).first()).toBeVisible({ timeout: 5000 });

    // Click the delete button for this rule
    const ruleRow = page.locator("tbody tr").filter({ hasText: rulePattern });
    await expect(ruleRow).toBeVisible({ timeout: 5000 });
    await ruleRow.getByRole("button", { name: new RegExp(`delete rule for ${rulePattern}`, "i") }).click();

    // Confirm dialog should appear
    await expect(page.getByText(/delete classification rule/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(new RegExp(`remove the rule for.*${rulePattern}`, "i"))).toBeVisible();

    // Click Delete to confirm
    await page.getByRole("button", { name: /^delete$/i }).click();

    // Rule row should disappear from the list
    await expect(ruleRow).not.toBeVisible({ timeout: 10000 });
  });

  test("delete confirmation cancel does not remove the rule", async ({ authedPage: page, api }) => {
    // Create a temporary rule
    const uniquePattern = `E2E Cancel Rule ${Date.now()}`;
    const createRes = await api.post("/classification-rules", {
      data: {
        match_type: "vendor",
        match_pattern: uniquePattern,
        category: "maintenance",
      },
    });
    expect(createRes.ok()).toBe(true);
    const rule = await createRes.json();

    await page.reload();
    await expect(
      page.locator("tbody tr").first().or(page.getByText(/no transactions found/i))
    ).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: /vendor rules/i }).click();
    await expect(page.getByText("Classification Rules").first()).toBeVisible({ timeout: 5000 });

    const rulePattern = rule.match_pattern ?? uniquePattern;
    const ruleRow = page.locator("tbody tr").filter({ hasText: rulePattern });
    await expect(ruleRow).toBeVisible({ timeout: 5000 });

    // Click delete
    await ruleRow.getByRole("button", { name: new RegExp(`delete rule for ${rulePattern}`, "i") }).click();
    await expect(page.getByText(/delete classification rule/i)).toBeVisible({ timeout: 5000 });

    // Cancel the deletion
    await page.getByRole("button", { name: /cancel/i }).click();

    // Confirm dialog should close
    await expect(page.getByText(/delete classification rule/i)).not.toBeVisible({ timeout: 3000 });

    // Rule should still be visible
    await expect(ruleRow).toBeVisible();

    // Cleanup via API
    await api.delete(`/classification-rules/${rule.id}`);
  });

  test("closing the panel removes it from view", async ({ authedPage: page }) => {
    await page.getByRole("button", { name: /vendor rules/i }).click();
    await expect(page.getByText("Classification Rules").first()).toBeVisible({ timeout: 5000 });

    // Close via the X button
    await page.getByRole("button", { name: /close panel/i }).click();

    // Panel content should no longer be visible
    await expect(page.getByText(/I learn these from your corrections/i)).not.toBeVisible({ timeout: 5000 });
  });

  test("rule count in footer matches the number of table rows", async ({ authedPage: page, api }) => {
    const pattern = `E2E Count Rule ${Date.now()}`;
    const createRes = await api.post("/classification-rules", {
      data: { match_type: "vendor", match_pattern: pattern, category: "insurance" },
    });
    expect(createRes.ok()).toBe(true);
    const rule = await createRes.json();

    try {
      await page.reload();
      await page.getByRole("button", { name: /vendor rules/i }).click();

      const panel = page.getByRole("dialog", { name: "Classification Rules" });
      const rows = panel.locator("tbody tr");
      await expect(rows.filter({ hasText: pattern })).toBeVisible();

      // Footer and rows come from the same fetch, so they agree whatever other specs are doing.
      const count = await rows.count();
      await expect(panel.getByText(`${count} rule${count === 1 ? "" : "s"} total`)).toBeVisible();
    } finally {
      await api.delete(`/classification-rules/${rule.id}`);
    }
  });
});

test.describe("Classification Rules API", () => {
  test("list classification rules returns array with required fields", async ({ api }) => {
    const res = await api.get("/classification-rules");
    expect(res.ok()).toBe(true);
    const rules = await res.json();
    expect(Array.isArray(rules)).toBe(true);

    for (const rule of rules) {
      expect(rule.id).toBeTruthy();
      expect(typeof rule.match_pattern).toBe("string");
      expect(rule.category).toBeTruthy();
      expect(typeof rule.times_applied).toBe("number");
    }
  });

  test("create and delete classification rule lifecycle", async ({ api }) => {
    // Create
    const pattern = `API Test Rule ${Date.now()}`;
    const createRes = await api.post("/classification-rules", {
      data: {
        match_type: "vendor",
        match_pattern: pattern,
        category: "insurance",
      },
    });
    expect(createRes.ok()).toBe(true);
    const rule = await createRes.json();
    expect(rule.id).toBeTruthy();
    expect(rule.category).toBe("insurance");

    // Verify it appears in the list
    const listRes = await api.get("/classification-rules");
    const rules = await listRes.json();
    const found = rules.find((r: { id: string }) => r.id === rule.id);
    expect(found).toBeTruthy();

    // Delete
    const deleteRes = await api.delete(`/classification-rules/${rule.id}`);
    expect(deleteRes.ok()).toBe(true);

    // Verify it's gone
    const listAfter = await api.get("/classification-rules");
    const rulesAfter = await listAfter.json();
    const notFound = rulesAfter.find((r: { id: string }) => r.id === rule.id);
    expect(notFound).toBeUndefined();
  });
});
