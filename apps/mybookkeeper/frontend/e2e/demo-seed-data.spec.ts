import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures/auth";
import { BACKEND_URL } from "./fixtures/config";
import { createDemoUser, deleteDemoUsersTagged } from "./fixtures/demo-users";
import { SuperuserSession } from "./fixtures/superuser-session";

test.describe("Demo Seed Data Verification", () => {
  test.describe.configure({ mode: "serial" });

  const TAG = `E2E Seed Data ${Date.now()}`;
  let session: SuperuserSession | undefined;
  let demoToken = "";
  let demoOrgId = "";

  // Creating a demo user takes a super admin; see superuser-session.ts.
  test.beforeAll(async ({ playwright }) => {
    session = await SuperuserSession.create(playwright, "seed", 2);
    const { email, password } = await createDemoUser(session, TAG);

    const loginRes = await fetch(`${BACKEND_URL}/auth/jwt/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `username=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`,
    });
    expect(loginRes.ok, await loginRes.clone().text()).toBe(true);
    demoToken = ((await loginRes.json()) as { access_token: string }).access_token;

    const orgRes = await fetch(`${BACKEND_URL}/organizations`, {
      headers: { Authorization: `Bearer ${demoToken}` },
    });
    expect(orgRes.ok).toBe(true);
    const orgs = (await orgRes.json()) as Array<{ id: string }>;
    expect(orgs).toHaveLength(1);
    demoOrgId = orgs[0].id;
  });

  test.afterAll(async () => {
    if (!session) return;
    try {
      await deleteDemoUsersTagged(session, TAG);
    } finally {
      await session.delete();
    }
  });

  // A demo account greets every new browser with a welcome dialog; get past it
  // the way a visitor does.
  async function openAsDemoUser(page: Page, path: string): Promise<void> {
    await page.goto("/login");
    await page.evaluate(
      ([t, o]) => {
        localStorage.setItem("token", t);
        localStorage.setItem("v1_activeOrgId", o);
      },
      [demoToken, demoOrgId],
    );
    await page.goto(path);
    const welcome = page.getByRole("dialog", { name: "Welcome to the sandbox!" });
    await welcome.getByRole("button", { name: "Got it, let me explore" }).click();
    await expect(welcome).toBeHidden();
  }

  test("demo user has seeded transactions", async ({ playwright }) => {
    const demoApi = await playwright.request.newContext({
      baseURL: BACKEND_URL,
      extraHTTPHeaders: {
        Authorization: `Bearer ${demoToken}`,
        "X-Organization-Id": demoOrgId,
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
    const demoApi = await playwright.request.newContext({
      baseURL: BACKEND_URL,
      extraHTTPHeaders: {
        Authorization: `Bearer ${demoToken}`,
        "X-Organization-Id": demoOrgId,
      },
    });

    const docRes = await demoApi.get("/documents");
    expect(docRes.ok()).toBe(true);
    const docs = (await docRes.json()) as Array<{ status: string }>;
    // Seeding writes its PDFs straight in as finished, never queued for extraction.
    expect(docs.length).toBeGreaterThan(0);
    expect(docs.filter((d) => d.status !== "completed")).toEqual([]);

    await demoApi.dispose();
  });

  test("demo user transactions cover all 3 properties", async ({
    playwright,
  }) => {
    const demoApi = await playwright.request.newContext({
      baseURL: BACKEND_URL,
      extraHTTPHeaders: {
        Authorization: `Bearer ${demoToken}`,
        "X-Organization-Id": demoOrgId,
      },
    });

    const propRes = await demoApi.get("/properties");
    expect(propRes.ok()).toBe(true);
    const properties = (await propRes.json()) as Array<{ id: string }>;
    expect(properties).toHaveLength(3);

    const txnRes = await demoApi.get("/transactions");
    expect(txnRes.ok()).toBe(true);
    const txns = (await txnRes.json()) as Array<{ property_id: string | null }>;

    // Some payouts are seeded with no property on purpose (demo_constants.py), so
    // they show up for attribution review; every property still has its own.
    const attributed = new Set(txns.flatMap((t) => (t.property_id ? [t.property_id] : [])));
    expect([...attributed].sort()).toEqual(properties.map((p) => p.id).sort());

    await demoApi.dispose();
  });

  test("demo user sees seeded documents on Documents page", async ({
    page,
  }) => {
    const docRes = await fetch(`${BACKEND_URL}/documents`, {
      headers: { Authorization: `Bearer ${demoToken}`, "X-Organization-Id": demoOrgId },
    });
    expect(docRes.ok).toBe(true);
    const [first] = (await docRes.json()) as Array<{ file_name: string }>;

    await openAsDemoUser(page, "/documents");
    await expect(
      page.getByRole("heading", { name: "Documents" }),
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("row").filter({ hasText: first.file_name })).toHaveCount(1);
  });

  test("demo user sees transactions on Transactions page", async ({
    page,
  }) => {
    await openAsDemoUser(page, "/transactions");
    await expect(
      page.getByRole("heading", { name: "Transactions" }),
    ).toBeVisible({ timeout: 15000 });

    // Table should have rows
    await expect(page.locator("table tbody tr").first()).toBeVisible({
      timeout: 10000,
    });
  });
});
