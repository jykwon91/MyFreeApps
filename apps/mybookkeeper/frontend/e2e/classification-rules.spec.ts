import { test, expect } from "./fixtures/auth";

test.describe("Classification Rules panel", () => {
  test.beforeEach(async ({ authedPage: page }) => {
    await page.goto("/transactions");
    await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible();
    await expect(
      page.locator("tbody tr").first().or(page.getByText(/no transactions found/i))
    ).toBeVisible({ timeout: 10000 });
  });

  test("opens panel from toolbar and verifies rules load from API", async ({ authedPage: page, api }) => {
    await page.getByRole("button", { name: /vendor rules/i }).click();

    // Panel header shows "Classification Rules"
    await expect(page.getByText("Classification Rules").first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/I learn these from your corrections/i)).toBeVisible();

    // Fetch rules from API and verify UI matches
    const res = await api.get("/classification-rules");
    const rules = await res.json();

    if (Array.isArray(rules) && rules.length > 0) {
      // Table should show Pattern and Category columns
      await expect(page.getByText("Pattern").first()).toBeVisible({ timeout: 5000 });
      await expect(page.getByText("Category").first()).toBeVisible();

      // First rule's match pattern should appear
      await expect(page.getByText(rules[0].match_pattern).first()).toBeVisible({ timeout: 5000 });

      // Rule count in footer should match API
      const footerText = `${rules.length} rule${rules.length === 1 ? "" : "s"} total`;
      await expect(page.getByText(footerText)).toBeVisible({ timeout: 5000 });
    } else {
      // Empty state
      await expect(page.getByText(/no classification rules yet/i)).toBeVisible({ timeout: 5000 });
      await expect(page.getByText("0 rules total")).toBeVisible();
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
    if (!createRes.ok()) {
      test.skip(true, "Could not create a classification rule via API — skipping");
      return;
    }
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
    if (!createRes.ok()) {
      test.skip(true, "Could not create classification rule via API");
      return;
    }
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
    await page.getByRole("button", { name: /vendor rules/i }).click();
    await expect(page.getByText("Classification Rules").first()).toBeVisible({ timeout: 5000 });

    const res = await api.get("/classification-rules");
    const rules = await res.json();
    const count = Array.isArray(rules) ? rules.length : 0;

    // Footer text
    const footerRegex = new RegExp(`${count} rules? total`, "i");
    await expect(page.getByText(footerRegex)).toBeVisible({ timeout: 5000 });

    // Table rows should match count (if there are rules)
    if (count > 0) {
      // Count the data rows in the panel table (inside the panel, not the main transactions table)
      const panelTable = page.locator("[class*='Panel'] table, [class*='panel'] table").first();
      if (await panelTable.isVisible({ timeout: 3000 })) {
        const rows = panelTable.locator("tbody tr");
        await expect(rows).toHaveCount(count, { timeout: 5000 });
      }
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
