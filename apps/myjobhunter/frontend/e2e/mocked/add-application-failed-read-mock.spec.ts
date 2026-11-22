/**
 * No-backend E2E for a failed read of a pasted description: switching to the
 * manual path and saving must not send the old pasted text as the job
 * description (it used to be kept from before the read ran).
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";
import { mockApplication, mockCompany } from "./fixtures/mockData";

const COMPANY = mockCompany();
const APPLICATIONS_ENDPOINT = /\/api\/applications(\?|$)/;
const PARSE_ENDPOINT = /\/api\/applications\/parse-jd$/;
const COMPANIES_ENDPOINT = /\/api\/companies(\?|$)/;

async function stubAddFlow(page: Page): Promise<Array<Record<string, unknown>>> {
  const posted: Array<Record<string, unknown>> = [];
  await stubSignedInShell(page);
  await page.route(COMPANIES_ENDPOINT, (route) => route.fulfill(json({ items: [COMPANY], total: 1 })));
  await page.route(PARSE_ENDPOINT, (route) => route.fulfill(json({ detail: "Could not read that" }, 502)));
  await page.route(APPLICATIONS_ENDPOINT, (route) => {
    const request = route.request();
    if (request.method() !== "POST") return route.fulfill(json({ items: [], total: 0 }));
    posted.push(request.postDataJSON() as Record<string, unknown>);
    return route.fulfill(json(mockApplication({ id: "new-1" }), 201));
  });
  return posted;
}

test("after a failed read of pasted text, saving by hand sends no job description", async ({ page }) => {
  const posted = await stubAddFlow(page);
  await page.goto("/applications");
  await page.getByRole("button", { name: "Add application" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add application" });

  await dialog.getByText(/no url\? paste the description text instead/i).click();
  await dialog.getByLabel(/job description text/i).fill("Staff Engineer at Acme. Old pasted text.");
  await dialog.getByRole("button", { name: /parse with ai/i }).click();

  await dialog.getByText(/adding manually\? type a company name/i).click();
  await dialog.getByLabel(/company name/i).fill(COMPANY.name);
  await dialog.getByRole("option", { name: new RegExp(COMPANY.name) }).first().click();
  await expect(dialog.getByText(/review and adjust before saving/i)).toBeVisible();
  await dialog.getByPlaceholder(/senior backend engineer/i).fill("Engineer");
  await dialog.getByRole("button", { name: "Add application" }).click();

  await expect(page.getByText("Application added", { exact: true })).toBeVisible();
  expect(posted).toHaveLength(1);
  expect(posted[0]).toMatchObject({ company_id: COMPANY.id, role_title: "Engineer", jd_text: null });
});
