/**
 * No-backend E2E for two numeric-input checks.
 *
 * Fully mocks the API via page.route(), so it runs under playwright.layout.config.ts
 * in the `frontend-layout-e2e` CI job.
 *
 * Verifies:
 *   - /admin/costs: a blank alert threshold shows a field error, sends nothing and
 *     shows no "Thresholds updated" toast; a fixed value saves every threshold.
 *   - /reconciliation: a negative, sub-cent or oversized 1099 amount shows a field
 *     error and sends nothing; a good amount is sent exactly as typed.
 */
import type { Page, Request } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubCurrentUser } from "@platform/ui/test-support/mockSession";
import { plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";
import { toast, toastRegion } from "@platform/ui/test-support/toast";

const THRESHOLDS = {
  daily_budget: 10,
  monthly_budget: 200,
  per_user_daily_alert: 5,
  input_rate_per_million: 3,
  output_rate_per_million: 15,
};

const ADMIN_USER = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "test@example.com",
  name: "Test User",
  role: "admin",
  is_active: true,
  is_superuser: false,
  is_verified: true,
};

interface FakeServer {
  thresholdPatches: unknown[];
  uploads: unknown[];
}

async function stubApi(page: Page): Promise<FakeServer> {
  const server: FakeServer = { thresholdPatches: [], uploads: [] };
  await page.route("**/api/**", (route, request: Request) =>
    route.fulfill(json(request.method() === "GET" ? [] : {})),
  );
  await stubWorkspaceShell(page, "owner");
  await stubCurrentUser(page, ADMIN_USER);
  await page.route("**/api/admin/costs/summary", (route) =>
    route.fulfill(json({ today: 1, this_week: 2, this_month: 3, total_tokens_today: 100, extractions_today: 1 })),
  );
  await page.route("**/api/admin/costs/thresholds", async (route, request: Request) => {
    if (request.method() === "PATCH") {
      server.thresholdPatches.push(request.postDataJSON());
      await route.fulfill(json(THRESHOLDS));
      return;
    }
    await route.fulfill(json(THRESHOLDS));
  });
  await page.route("**/api/reconciliation/upload-1099", async (route, request: Request) => {
    server.uploads.push(request.postDataJSON());
    await route.fulfill(json({}, 201));
  });
  return server;
}

test.describe("Admin alert thresholds", () => {
  let server: FakeServer;

  test.beforeEach(async ({ page }) => {
    await plantAuth(page);
    server = await stubApi(page);
  });

  test("a blank threshold is refused, not skipped with a success toast", async ({ page }) => {
    await page.goto("/admin/costs");
    await page.getByRole("button", { name: "Alert threshold settings" }).click();
    const daily = page.getByLabel("Daily Budget", { exact: true });
    await daily.fill("");
    await page.getByRole("button", { name: "Save Changes" }).click();

    await expect(page.getByRole("alert").filter({ hasText: "Enter a number from 0 to 500." })).toBeVisible();
    await expect(daily).toHaveAttribute("aria-invalid", "true");
    await expect(toastRegion(page).getByText("Thresholds updated", { exact: true })).toHaveCount(0);
    expect(server.thresholdPatches).toEqual([]);

    await daily.fill("25");
    await page.getByRole("button", { name: "Save Changes" }).click();
    await expect(toast(page, "Thresholds updated")).toBeVisible();
    expect(server.thresholdPatches).toEqual([{ ...THRESHOLDS, daily_budget: 25 }]);
  });
});

test.describe("1099 reported amount", () => {
  let server: FakeServer;

  test.beforeEach(async ({ page }) => {
    await plantAuth(page);
    server = await stubApi(page);
  });

  for (const [value, message] of [
    ["-5", "Enter an amount of $0 or more."],
    ["12.345", "Use dollars and cents, like 84.20."],
    ["10000000000", "That amount is too large."],
  ] as const) {
    test(`refuses ${value} and sends nothing`, async ({ page }) => {
      await page.goto("/reconciliation");
      const amount = page.getByLabel("Reported Amount");
      await amount.fill(value);
      await page.getByRole("button", { name: "Add 1099 Source" }).click();

      await expect(page.getByRole("alert").filter({ hasText: message })).toBeVisible();
      await expect(amount).toHaveAttribute("aria-invalid", "true");
      expect(server.uploads).toEqual([]);
    });
  }

  test("a good amount is sent as typed", async ({ page }) => {
    await page.goto("/reconciliation");
    await page.getByLabel("Reported Amount").fill("84.5");
    await page.getByRole("button", { name: "Add 1099 Source" }).click();

    await expect.poll(() => server.uploads.length).toBe(1);
    expect(server.uploads[0]).toMatchObject({ reported_amount: "84.5" });
  });
});
