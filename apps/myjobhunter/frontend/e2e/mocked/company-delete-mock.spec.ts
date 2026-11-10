/**
 * No-backend E2E for deleting a company from its detail page: a coded 409
 * (applications still linked) shows the backend's message and stays on the
 * page; a 204 navigates back to the companies list.
 */
import { test, expect, type Page } from "@playwright/test";
import { json } from "./fixtures/mockResponse";
import { stubSignedInShell } from "./fixtures/mockSession";
import { mockCompany } from "./fixtures/mockData";

const COMPANY = mockCompany();
const COMPANY_ENDPOINT = new RegExp(`/api/companies/${COMPANY.id}$`);
const REFUSED_MESSAGE =
  "This company still has 2 applications linked to it (including any archived or deleted), so it can't be deleted.";

async function stubDetail(page: Page, deleteResponse: { status: number; body?: unknown }): Promise<string[]> {
  const methods: string[] = [];
  await page.route(COMPANY_ENDPOINT, (route) => {
    const method = route.request().method();
    methods.push(method);
    if (method === "DELETE") {
      return deleteResponse.status === 204
        ? route.fulfill({ status: 204 })
        : route.fulfill(json(deleteResponse.body, deleteResponse.status));
    }
    return route.fulfill(json(COMPANY));
  });
  await page.route(/\/api\/applications(\?|$)/, (route) => route.fulfill(json({ items: [], total: 0 })));
  await page.route(/\/api\/companies(\?|$)/, (route) => route.fulfill(json({ items: [COMPANY], total: 1 })));
  return methods;
}

test("a refused delete shows the backend message and stays on the company", async ({ page }) => {
  await stubSignedInShell(page);
  const methods = await stubDetail(page, {
    status: 409,
    body: { detail: { code: "COMPANY_HAS_APPLICATIONS", message: REFUSED_MESSAGE, application_count: 2 } },
  });
  page.on("dialog", (dialog) => dialog.accept());

  await page.goto(`/companies/${COMPANY.id}`);
  await page.getByRole("button", { name: "Delete" }).click();

  await expect(page.getByText(REFUSED_MESSAGE, { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Acme Corp", level: 1 })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/companies/${COMPANY.id}$`));
  expect(methods).toContain("DELETE");
});

test("a successful delete toasts and returns to the companies list", async ({ page }) => {
  await stubSignedInShell(page);
  await stubDetail(page, { status: 204 });
  page.on("dialog", (dialog) => dialog.accept());

  await page.goto(`/companies/${COMPANY.id}`);
  await page.getByRole("button", { name: "Delete" }).click();

  await expect(page.getByText('"Acme Corp" deleted', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/companies$/);
});
