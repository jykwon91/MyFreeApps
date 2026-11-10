/**
 * No-backend E2E for creating a company: the form posts to the stubbed
 * POST /companies, a success toast shows, and the refetched list now holds
 * the new row; a 500 on POST shows an error toast and keeps the dialog open.
 */
import { test, expect, type Page } from "@playwright/test";
import { json } from "./fixtures/mockResponse";
import { stubSignedInShell } from "./fixtures/mockSession";
import { mockCompany } from "./fixtures/mockData";
import type { Company } from "@myjobhunter/api-client/types/company";

const COMPANIES_ENDPOINT = /\/api\/companies(\?|$)/;

async function stubCompanies(page: Page, store: Company[], postStatus: number): Promise<Array<Record<string, unknown>>> {
  const posted: Array<Record<string, unknown>> = [];
  await page.route(COMPANIES_ENDPOINT, (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      const payload = request.postDataJSON() as Record<string, unknown>;
      posted.push(payload);
      if (postStatus !== 201) return route.fulfill(json({ detail: "boom" }, postStatus));
      const created = mockCompany({ id: "created-1", name: String(payload.name), primary_domain: (payload.primary_domain as string | null) ?? null });
      store.push(created);
      return route.fulfill(json(created, 201));
    }
    return route.fulfill(json({ items: store, total: store.length }));
  });
  return posted;
}

test("creating a company posts the form, toasts, and the new row appears", async ({ page }) => {
  await stubSignedInShell(page);
  const posted = await stubCompanies(page, [mockCompany()], 201);

  await page.goto("/companies");
  await expect(page.getByRole("cell", { name: "Acme Corp" })).toBeVisible();

  await page.getByRole("button", { name: "Add company" }).click();
  await page.getByPlaceholder("e.g. Acme Corp").fill("Globex");
  await page.getByPlaceholder("acme.com").fill("globex.com");
  await page.getByRole("dialog").getByRole("button", { name: "Add company" }).click();

  await expect(page.getByText('Company "Globex" added', { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("cell", { name: "Globex", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Acme Corp" })).toBeVisible();
  expect(posted).toEqual([expect.objectContaining({ name: "Globex", primary_domain: "globex.com" })]);
});

test("a name is required: submitting empty posts nothing", async ({ page }) => {
  await stubSignedInShell(page);
  const posted = await stubCompanies(page, [mockCompany()], 201);

  await page.goto("/companies");
  await page.getByRole("button", { name: "Add company" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Add company" }).click();

  await expect(page.getByText("Name is required")).toBeVisible();
  expect(posted).toHaveLength(0);
});

test("a 500 on create shows an error toast and keeps the dialog open", async ({ page }) => {
  await stubSignedInShell(page);
  await stubCompanies(page, [mockCompany()], 500);

  await page.goto("/companies");
  await page.getByRole("button", { name: "Add company" }).click();
  await page.getByPlaceholder("e.g. Acme Corp").fill("Globex");
  await page.getByRole("dialog").getByRole("button", { name: "Add company" }).click();

  await expect(page.getByText("Couldn't create company: boom", { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Globex", exact: true })).toHaveCount(0);
});

test("an empty list shows the empty state", async ({ page }) => {
  await stubSignedInShell(page);
  await stubCompanies(page, [], 201);

  await page.goto("/companies");

  await expect(page.getByText("No companies here yet")).toBeVisible();
});
