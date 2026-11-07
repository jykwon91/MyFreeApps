/**
 * Tax advisor persistence: reading the saved suggestions of a return, changing
 * their status, and the advisor panel on the return page.
 *
 * Runs in a fresh organization. Generating advice calls Claude, which the E2E
 * stack can't, so each test gives its own return a known set of suggestions
 * through /test/tax-returns/{id}/seed-advisor — the same save path generation
 * uses. One return per test (a distinct tax year each), because a status change
 * on one return carries over into its later advice.
 */
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { seededOrg } from "./fixtures/seeded-org";

const FAKE_ID = "00000000-0000-0000-0000-000000000000";

const HIGH = {
  id: "e2e-high",
  category: "deduction_gap",
  severity: "high",
  title: "E2E Missing depreciation",
  description: "Your rental property has no depreciation recorded.",
  estimated_savings: 1200,
  action: "Add the property's cost basis.",
  irs_reference: "Pub 527",
  confidence: "high",
};
const LOW = {
  id: "e2e-low",
  category: "data_quality",
  severity: "low",
  title: "E2E Uncategorized expense",
  description: "One expense has no category.",
  estimated_savings: null,
  action: "Pick a category for it.",
  confidence: "medium",
};

interface Suggestion {
  db_id: string;
  id: string;
  title: string;
  severity: string;
  status: string;
  generation_id: string;
}

interface Advice {
  suggestions: Suggestion[];
  disclaimer: string;
  generated_at: string | null;
  model_version: string | null;
}

interface AdvisedReturn {
  returnId: string;
  generationId: string;
}

const org = seededOrg("tax-advisor");

async function createReturn(api: APIRequestContext, year: number, withForm: boolean): Promise<string> {
  const res = await api.post("/tax-returns", { data: { tax_year: year } });
  expect(res.status(), await res.text()).toBe(201);
  const { id } = (await res.json()) as { id: string };
  if (withForm) {
    const form = await api.post(`/test/tax-returns/${id}/seed-form-instance`, { data: { form_name: "w2" } });
    expect(form.status(), await form.text()).toBe(201);
  }
  return id;
}

async function returnWithAdvice(api: APIRequestContext, year: number): Promise<AdvisedReturn> {
  const returnId = await createReturn(api, year, true);
  const res = await api.post(`/test/tax-returns/${returnId}/seed-advisor`, { data: { suggestions: [HIGH, LOW] } });
  expect(res.status(), await res.text()).toBe(201);
  const { generation_id } = (await res.json()) as { generation_id: string };
  return { returnId, generationId: generation_id };
}

async function getAdvice(api: APIRequestContext, returnId: string): Promise<Advice> {
  const res = await api.get(`/tax-returns/${returnId}/advisor`);
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()) as Advice;
}

function suggestionNamed(advice: Advice, title: string): Suggestion {
  const found = advice.suggestions.find((s) => s.title === title);
  if (!found) throw new Error(`no suggestion titled ${title} in ${JSON.stringify(advice.suggestions)}`);
  return found;
}

async function openReturn(page: Page, returnId: string): Promise<void> {
  await org().signIn(page);
  await page.goto(`/tax-returns/${returnId}`);
  await expect(page.getByRole("heading", { name: "AI Tax Advisor" })).toBeVisible({ timeout: 10000 });
}

function card(page: Page, title: string) {
  return page.locator("div.border.rounded-lg").filter({ hasText: title });
}

test.describe("Tax advisor API", () => {
  test("a return with no advice yet is a 404, as is a return that doesn't exist", async () => {
    const returnId = await createReturn(org().api, 2020, true);

    expect((await org().api.get(`/tax-returns/${returnId}/advisor`)).status()).toBe(404);
    expect((await org().api.get(`/tax-returns/${FAKE_ID}/advisor`)).status()).toBe(404);
  });

  test("returns the saved suggestions with the generation they came from", async () => {
    const { returnId, generationId } = await returnWithAdvice(org().api, 2021);

    const advice = await getAdvice(org().api, returnId);

    expect(advice.model_version).toBe("e2e-seed");
    expect(advice.generated_at).not.toBeNull();
    expect(advice.disclaimer).toMatch(/does not constitute tax advice/);
    expect(advice.suggestions.map((s) => [s.id, s.title, s.severity, s.status, s.generation_id])).toEqual([
      [HIGH.id, HIGH.title, "high", "active", generationId],
      [LOW.id, LOW.title, "low", "active", generationId],
    ]);
  });

  test("dismissing a suggestion drops it from the advice; reactivating brings it back", async () => {
    const { returnId } = await returnWithAdvice(org().api, 2022);
    const high = suggestionNamed(await getAdvice(org().api, returnId), HIGH.title);

    const dismissed = await org().api.patch(`/tax-returns/${returnId}/advisor/${high.db_id}`, {
      data: { status: "dismissed" },
    });
    expect(dismissed.status(), await dismissed.text()).toBe(200);
    expect(((await dismissed.json()) as Advice).suggestions.map((s) => s.title)).toEqual([LOW.title]);
    expect((await getAdvice(org().api, returnId)).suggestions.map((s) => s.title)).toEqual([LOW.title]);

    const restored = await org().api.patch(`/tax-returns/${returnId}/advisor/${high.db_id}`, {
      data: { status: "active" },
    });
    expect(restored.status(), await restored.text()).toBe(200);
    expect(suggestionNamed((await restored.json()) as Advice, HIGH.title).status).toBe("active");
  });

  test("resolving a suggestion keeps it in the advice as resolved", async () => {
    const { returnId } = await returnWithAdvice(org().api, 2023);
    const low = suggestionNamed(await getAdvice(org().api, returnId), LOW.title);

    const res = await org().api.patch(`/tax-returns/${returnId}/advisor/${low.db_id}`, {
      data: { status: "resolved" },
    });

    expect(res.status(), await res.text()).toBe(200);
    expect(suggestionNamed((await res.json()) as Advice, LOW.title).status).toBe("resolved");
    expect(suggestionNamed(await getAdvice(org().api, returnId), HIGH.title).status).toBe("active");
  });

  test("an unknown suggestion is a 404 and an unknown status is rejected", async () => {
    const { returnId } = await returnWithAdvice(org().api, 2024);
    const high = suggestionNamed(await getAdvice(org().api, returnId), HIGH.title);

    const unknown = await org().api.patch(`/tax-returns/${returnId}/advisor/${FAKE_ID}`, {
      data: { status: "dismissed" },
    });
    expect(unknown.status()).toBe(404);
    const invalid = await org().api.patch(`/tax-returns/${returnId}/advisor/${high.db_id}`, {
      data: { status: "invalid_status" },
    });
    expect(invalid.status()).toBe(422);
    expect(suggestionNamed(await getAdvice(org().api, returnId), HIGH.title).status).toBe("active");
  });
});

test.describe("Tax advisor panel", () => {
  test("a return with no forms says there's nothing to review", async ({ page }) => {
    const returnId = await createReturn(org().api, 2025, false);

    await openReturn(page, returnId);

    await expect(page.getByText(/don't have any tax forms to review yet/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Get Tax Advice" })).toHaveCount(0);
  });

  test("a return with forms but no advice offers to review it", async ({ page }) => {
    const returnId = await createReturn(org().api, 2026, true);

    await openReturn(page, returnId);

    await expect(page.getByText(/I can review your tax return/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Get Tax Advice" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Regenerate/ })).toHaveCount(0);
  });

  test("shows the saved suggestions grouped by priority, with Regenerate", async ({ page }) => {
    const { returnId } = await returnWithAdvice(org().api, 2027);

    await openReturn(page, returnId);

    await expect(page.getByRole("heading", { name: "High Priority (1)" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Low Priority (1)" })).toBeVisible();
    await expect(card(page, HIGH.title)).toContainText(HIGH.description);
    await expect(card(page, HIGH.title)).toContainText("Could save ~$1,200");
    await expect(card(page, LOW.title)).toContainText(LOW.action);
    await expect(page.getByRole("button", { name: /Regenerate/ })).toBeVisible();
    await expect(page.getByText(/does not constitute tax advice/)).toBeVisible();
  });

  test("dismissing a card hides it and saves the dismissal", async ({ page }) => {
    const { returnId } = await returnWithAdvice(org().api, 2028);
    await openReturn(page, returnId);
    const high = card(page, HIGH.title);
    await expect(high).toBeVisible();

    const saved = page.waitForResponse(
      (r) => r.request().method() === "PATCH" && r.url().includes(`/tax-returns/${returnId}/advisor/`),
    );
    await high.locator('button[title="Dismiss"]').click();

    await expect(high).toHaveCount(0);
    expect((await saved).status()).toBe(200);
    expect((await getAdvice(org().api, returnId)).suggestions.map((s) => s.title)).toEqual([LOW.title]);
    await page.reload();
    await expect(card(page, LOW.title)).toBeVisible({ timeout: 10000 });
    await expect(card(page, HIGH.title)).toHaveCount(0);
  });

  test("resolving a card marks it resolved and saves the status", async ({ page }) => {
    const { returnId } = await returnWithAdvice(org().api, 2029);
    await openReturn(page, returnId);
    await expect(card(page, LOW.title)).toBeVisible();

    const saved = page.waitForResponse(
      (r) => r.request().method() === "PATCH" && r.url().includes(`/tax-returns/${returnId}/advisor/`),
    );
    await card(page, LOW.title).locator('button[title="Mark as resolved"]').click();

    await expect(card(page, LOW.title)).toContainText("marked as resolved");
    expect((await saved).status()).toBe(200);
    expect(suggestionNamed(await getAdvice(org().api, returnId), LOW.title).status).toBe("resolved");
    await page.reload();
    await expect(card(page, LOW.title)).toContainText("marked as resolved", { timeout: 10000 });
    await expect(card(page, HIGH.title).locator('button[title="Dismiss"]')).toBeVisible();
  });
});
