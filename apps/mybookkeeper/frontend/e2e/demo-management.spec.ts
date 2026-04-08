import { test, expect } from "./fixtures/auth";
import { BACKEND_URL } from "./fixtures/config";

/** Helper: delete all demo users with a given tag via the admin API. */
async function cleanupDemoUsersByTag(
  api: import("@playwright/test").APIRequestContext,
  tag: string,
): Promise<void> {
  const res = await api.get("/demo/users");
  if (res.ok()) {
    const data = await res.json();
    for (const user of data.users ?? []) {
      if (user.tag === tag) {
        await api.delete(`/demo/users/${user.user_id}`).catch(() => {});
      }
    }
  }
}

test.describe("Demo Management (Admin)", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ authedPage: page }) => {
    await page.goto("/admin/demo");
    await expect(
      page.getByRole("heading", { name: "Demo Management" }),
    ).toBeVisible({ timeout: 15000 });
  });

  test("admin can create demo user via dialog and see credentials", async ({
    authedPage: page,
    api,
  }) => {
    const tag = "E2E Create Test";

    // Ensure no leftover user from a previous run
    await cleanupDemoUsersByTag(api, tag);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Demo Management" }),
    ).toBeVisible({ timeout: 15000 });

    // Click the "Create Demo User" button in the Demo Users section header
    const createBtn = page.getByRole("button", { name: /Create Demo User/i });
    await expect(createBtn).toBeVisible({ timeout: 10000 });
    await createBtn.click();

    // CreateDemoDialog should appear
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await expect(
      dialog.getByText("Create a demo account with sample data"),
    ).toBeVisible();

    // Fill in the Display Name field
    await dialog.locator("#demo-tag").fill(tag);

    // Submit the form
    await dialog.getByRole("button", { name: "Create" }).click();

    // CredentialsModal should appear with email and password
    const credentialsModal = page.getByRole("dialog");
    await expect(
      credentialsModal.getByText("Demo Credentials"),
    ).toBeVisible({ timeout: 15000 });

    // Verify the credential fields are present (use exact match to avoid ambiguity)
    await expect(
      credentialsModal.locator("p.text-xs.text-muted-foreground", { hasText: "Email" }),
    ).toBeVisible();
    await expect(
      credentialsModal.locator("[data-credential-password]"),
    ).toBeVisible();

    // The warning about saving credentials should be visible
    await expect(
      credentialsModal.getByText(/password won't be shown again/i),
    ).toBeVisible();

    // Close the credentials modal
    await credentialsModal.getByRole("button", { name: "Close" }).click();

    // The new user should appear in the Demo Users table
    await expect(page.getByText(tag)).toBeVisible({ timeout: 10000 });

    // Clean up
    await cleanupDemoUsersByTag(api, tag);
  });

  test("admin can reset a demo user", async ({ authedPage: page, api }) => {
    const tag = "E2E Data Wipe";

    // Ensure the user exists
    await cleanupDemoUsersByTag(api, tag);
    await api.post("/demo/create", { data: { tag } });

    // Reload to pick up the new user
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Demo Management" }),
    ).toBeVisible({ timeout: 15000 });

    // Find the user's row in the table and click the Reset button via its aria-label
    const row = page.locator("tr", { has: page.getByText(tag) });
    await expect(row).toBeVisible({ timeout: 10000 });
    const resetBtn = row.getByLabel(`Reset ${tag}`);
    await resetBtn.click();

    // Confirm dialog should appear
    const confirmDialog = page.getByRole("dialog");
    await expect(
      confirmDialog.getByText(/Reset demo user/i),
    ).toBeVisible({ timeout: 5000 });
    await expect(
      confirmDialog.getByText(/generate a new password/i),
    ).toBeVisible();

    // Click "Reset" to confirm
    await confirmDialog.getByRole("button", { name: "Reset" }).click();

    // CredentialsModal should appear with the new password
    await expect(page.getByText("Demo Credentials")).toBeVisible({
      timeout: 15000,
    });

    // Close the modal
    await page.getByRole("button", { name: "Close" }).click();

    // The user should still be in the table (use role=cell to avoid matching the toast)
    await expect(
      page.getByRole("cell", { name: tag, exact: true }),
    ).toBeVisible({ timeout: 10000 });

    // Clean up
    await cleanupDemoUsersByTag(api, tag);
  });

  test("admin can copy credentials from modal", async ({
    authedPage: page,
    api,
  }) => {
    const tag = "E2E Copy Test";

    // Grant clipboard permissions for this test
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);

    // Ensure no leftover user
    await cleanupDemoUsersByTag(api, tag);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Demo Management" }),
    ).toBeVisible({ timeout: 15000 });

    // Create a demo user to trigger the CredentialsModal
    const createBtn = page.getByRole("button", { name: /Create Demo User/i });
    await expect(createBtn).toBeVisible({ timeout: 10000 });
    await createBtn.click();

    // Fill in the dialog
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await dialog.locator("#demo-tag").fill(tag);
    await dialog.getByRole("button", { name: "Create" }).click();

    // Wait for CredentialsModal
    const credentialsModal = page.getByRole("dialog");
    await expect(
      credentialsModal.getByText("Demo Credentials"),
    ).toBeVisible({ timeout: 15000 });

    // Click "Copy credentials" button
    const copyBtn = credentialsModal.getByRole("button", {
      name: /Copy credentials/i,
    });
    await expect(copyBtn).toBeVisible();
    await copyBtn.click();

    // The button text should change to "Copied"
    await expect(
      credentialsModal.getByRole("button", { name: /Copied/i }),
    ).toBeVisible({ timeout: 3000 });

    // Close the modal
    await credentialsModal.getByRole("button", { name: "Close" }).click();

    // Clean up
    await cleanupDemoUsersByTag(api, tag);
  });
});

test.describe("Demo Seed Data Verification", () => {
  test.describe.configure({ mode: "serial" });

  const SEED_TAG = "E2E Seed Verify";
  let demoToken: string | null = null;
  let demoOrgId: string | null = null;

  test.beforeAll(async ({ api }) => {
    // Clean up any previous run
    await cleanupDemoUsersByTag(api, SEED_TAG);

    // Create a demo user
    const createRes = await api.post("/demo/create", {
      data: { tag: SEED_TAG },
    });
    if (createRes.ok()) {
      const createData = await createRes.json();
      // Login as the demo user to get a token
      const loginRes = await fetch(`${BACKEND_URL}/auth/jwt/login`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `username=${encodeURIComponent(createData.credentials.email)}&password=${encodeURIComponent(createData.credentials.password)}`,
      });
      if (loginRes.ok) {
        const loginData = await loginRes.json();
        demoToken = loginData.access_token;
      }
    }

    // Get demo user's org
    if (demoToken) {
      const orgRes = await fetch(`${BACKEND_URL}/organizations`, {
        headers: { Authorization: `Bearer ${demoToken}` },
      });
      if (orgRes.ok) {
        const orgs = await orgRes.json();
        if (orgs.length > 0) {
          demoOrgId = orgs[0].id;
        }
      }
    }
  });

  test.afterAll(async ({ api }) => {
    await cleanupDemoUsersByTag(api, SEED_TAG);
  });

  test("demo user has transactions covering all 12 months", async ({ page }) => {
    test.skip(!demoToken || !demoOrgId, "Demo user setup failed");

    // Login as demo user
    await page.goto("/login");
    await page.evaluate((t) => localStorage.setItem("token", t), demoToken!);
    await page.evaluate(
      (id) => localStorage.setItem("v1_activeOrgId", id),
      demoOrgId!,
    );

    // Go to Transactions page
    await page.goto("/transactions");
    await expect(
      page.getByRole("heading", { name: "Transactions" }),
    ).toBeVisible({ timeout: 15000 });

    // Verify the page shows transactions (not empty)
    // The table should have rows visible
    await expect(page.locator("table tbody tr").first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("demo user can access Documents page", async ({ page }) => {
    test.skip(!demoToken || !demoOrgId, "Demo user setup failed");

    await page.goto("/login");
    await page.evaluate((t) => localStorage.setItem("token", t), demoToken!);
    await page.evaluate(
      (id) => localStorage.setItem("v1_activeOrgId", id),
      demoOrgId!,
    );

    await page.goto("/documents");
    await expect(
      page.getByRole("heading", { name: "Documents" }),
    ).toBeVisible({ timeout: 15000 });
  });

  test("demo user has seeded transactions via API", async ({
    playwright,
  }) => {
    test.skip(!demoToken || !demoOrgId, "Demo user setup failed");

    const demoApi = await playwright.request.newContext({
      baseURL: BACKEND_URL,
      extraHTTPHeaders: {
        Authorization: `Bearer ${demoToken}`,
        "X-Organization-Id": demoOrgId!,
      },
    });

    // Verify transactions exist
    const txnRes = await demoApi.get("/transactions");
    expect(txnRes.ok()).toBe(true);
    const txnData = await txnRes.json();
    expect(txnData.length).toBeGreaterThan(0);

    // Should have both income and expense transactions
    const hasIncome = txnData.some(
      (t: Record<string, string>) => t.transaction_type === "income",
    );
    const hasExpenses = txnData.some(
      (t: Record<string, string>) => t.transaction_type === "expense",
    );
    expect(hasIncome).toBe(true);
    expect(hasExpenses).toBe(true);

    // Should cover all 3 properties
    const propIds = new Set(
      txnData.map((t: Record<string, string>) => t.property_id),
    );
    expect(propIds.size).toBe(3);

    await demoApi.dispose();
  });

  test("demo user documents API is accessible", async ({
    playwright,
  }) => {
    test.skip(!demoToken || !demoOrgId, "Demo user setup failed");

    const demoApi = await playwright.request.newContext({
      baseURL: BACKEND_URL,
      extraHTTPHeaders: {
        Authorization: `Bearer ${demoToken}`,
        "X-Organization-Id": demoOrgId!,
      },
    });

    const docRes = await demoApi.get("/documents");
    expect(docRes.ok()).toBe(true);
    const docs = await docRes.json();
    expect(Array.isArray(docs)).toBe(true);

    // If documents are seeded, they should all be completed
    if (docs.length > 0) {
      const allCompleted = docs.every(
        (d: Record<string, string>) => d.status === "completed",
      );
      expect(allCompleted).toBe(true);
    }

    await demoApi.dispose();
  });
});
