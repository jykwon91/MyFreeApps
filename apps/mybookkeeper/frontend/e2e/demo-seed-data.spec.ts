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

test.describe("Demo Seed Data Verification", () => {
  test.describe.configure({ mode: "serial" });

  const TAG = "E2E Seed Data";
  let demoToken: string | null = null;
  let demoOrgId: string | null = null;

  test.beforeAll(async ({ api }) => {
    await cleanupDemoUsersByTag(api, TAG);
    const createRes = await api.post("/demo/create", { data: { tag: TAG } });
    if (createRes.ok()) {
      const createData = await createRes.json();
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
    await cleanupDemoUsersByTag(api, TAG);
  });

  test("demo user has seeded transactions", async ({ playwright }) => {
    test.skip(!demoToken || !demoOrgId, "Demo user setup failed");

    const demoApi = await playwright.request.newContext({
      baseURL: BACKEND_URL,
      extraHTTPHeaders: {
        Authorization: `Bearer ${demoToken}`,
        "X-Organization-Id": demoOrgId!,
      },
    });

    const txnRes = await demoApi.get("/transactions");
    expect(txnRes.ok()).toBe(true);
    const txns = await txnRes.json();
    // Demo user should have seed transactions (amount varies by deployed version)
    expect(txns.length).toBeGreaterThan(0);

    // Should have revenue transactions
    const revenue = txns.filter(
      (t: Record<string, string>) => t.transaction_type === "income",
    );
    expect(revenue.length).toBeGreaterThan(0);

    // Should have expense transactions
    const expenses = txns.filter(
      (t: Record<string, string>) => t.transaction_type === "expense",
    );
    expect(expenses.length).toBeGreaterThan(0);

    await demoApi.dispose();
  });

  test("demo user documents API returns valid data", async ({ playwright }) => {
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

  test("demo user transactions cover all 3 properties", async ({
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

    const txnRes = await demoApi.get("/transactions");
    expect(txnRes.ok()).toBe(true);
    const txns = await txnRes.json();

    const propertyIds = new Set(
      txns.map((t: Record<string, string>) => t.property_id),
    );
    expect(propertyIds.size).toBe(3);

    await demoApi.dispose();
  });

  test("demo user can access Documents page", async ({
    page,
  }) => {
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

  test("demo user sees transactions on Transactions page", async ({
    page,
  }) => {
    test.skip(!demoToken || !demoOrgId, "Demo user setup failed");

    await page.goto("/login");
    await page.evaluate((t) => localStorage.setItem("token", t), demoToken!);
    await page.evaluate(
      (id) => localStorage.setItem("v1_activeOrgId", id),
      demoOrgId!,
    );

    await page.goto("/transactions");
    await expect(
      page.getByRole("heading", { name: "Transactions" }),
    ).toBeVisible({ timeout: 15000 });

    // Table should have rows
    await expect(page.locator("table tbody tr").first()).toBeVisible({
      timeout: 10000,
    });
  });
});
