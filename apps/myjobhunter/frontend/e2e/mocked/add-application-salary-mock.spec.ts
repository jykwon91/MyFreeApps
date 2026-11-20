/**
 * No-backend E2E for the salary a pasted job description gives: the review
 * step shows it so it can be checked and changed, and the saved application
 * carries it as posted_salary_*. A posting with no salary sends none.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";
import type { JdParseResponse } from "@myjobhunter/api-client/types/application/jd-parse-response";
import { mockApplication, mockCompany } from "./fixtures/mockData";

const COMPANY = mockCompany();
const APPLICATIONS_ENDPOINT = /\/api\/applications(\?|$)/;
const PARSE_ENDPOINT = /\/api\/applications\/parse-jd$/;
const COMPANIES_ENDPOINT = /\/api\/companies(\?|$)/;

const PARSED: JdParseResponse = {
  title: "Staff Engineer",
  company: COMPANY.name,
  location: null,
  remote_type: null,
  salary_min: null,
  salary_max: null,
  salary_currency: null,
  salary_period: null,
  seniority: null,
  must_have_requirements: [],
  nice_to_have_requirements: [],
  responsibilities: [],
  summary: null,
};

async function stubAddFlow(page: Page, parsed: JdParseResponse): Promise<Array<Record<string, unknown>>> {
  const posted: Array<Record<string, unknown>> = [];
  await stubSignedInShell(page);
  await page.route(COMPANIES_ENDPOINT, (route) => route.fulfill(json({ items: [COMPANY], total: 1 })));
  await page.route(/\/api\/companies\/[^/]+\/research/, (route) => route.fulfill(json({}, 202)));
  await page.route(PARSE_ENDPOINT, (route) => route.fulfill(json(parsed)));
  await page.route(APPLICATIONS_ENDPOINT, (route) => {
    const request = route.request();
    if (request.method() !== "POST") return route.fulfill(json({ items: [], total: 0 }));
    posted.push(request.postDataJSON() as Record<string, unknown>);
    return route.fulfill(json(mockApplication({ id: "new-1" }), 201));
  });
  return posted;
}

/** Opens the dialog, pastes a job description, and waits for the review step. */
async function pasteDescription(page: Page) {
  await page.goto("/applications");
  await page.getByRole("button", { name: "Add application" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add application" });
  await dialog.getByText(/no url\? paste the description text instead/i).click();
  await dialog.getByLabel(/job description text/i).fill("Staff Engineer. Pay: 120,000-150,000 EUR a year.");
  await dialog.getByRole("button", { name: /parse with ai/i }).click();
  await expect(dialog.getByText(/review and adjust before saving/i)).toBeVisible();
  return dialog;
}

test("a pasted description's salary is shown on review, can be changed, and is saved", async ({ page }) => {
  const posted = await stubAddFlow(page, {
    ...PARSED,
    salary_min: 120000,
    salary_max: 150000,
    salary_currency: "EUR",
    salary_period: "annual",
  });
  const dialog = await pasteDescription(page);

  await expect(dialog.getByLabel("Salary from (EUR)")).toHaveValue("120000");
  await expect(dialog.getByLabel("Salary to (EUR)")).toHaveValue("150000");
  await expect(dialog.getByLabel("Per", { exact: true })).toHaveValue("annual");

  await dialog.getByLabel("Salary to (EUR)").fill("155000");
  await dialog.getByRole("button", { name: "Add application" }).click();

  await expect(page.getByText("Application added", { exact: true })).toBeVisible();
  expect(posted).toHaveLength(1);
  expect(posted[0]).toMatchObject({
    company_id: COMPANY.id,
    role_title: "Staff Engineer",
    posted_salary_min: "120000",
    posted_salary_max: "155000",
    posted_salary_currency: "EUR",
    posted_salary_period: "annual",
  });
});

test("a description with no salary leaves it blank and saves none", async ({ page }) => {
  const posted = await stubAddFlow(page, PARSED);
  const dialog = await pasteDescription(page);

  await expect(dialog.getByLabel(/^Salary from/)).toHaveValue("");
  await expect(dialog.getByLabel(/^Salary to/)).toHaveValue("");
  await dialog.getByRole("button", { name: "Add application" }).click();

  await expect(page.getByText("Application added", { exact: true })).toBeVisible();
  expect(posted).toHaveLength(1);
  expect(posted[0]).toMatchObject({ posted_salary_min: null, posted_salary_max: null, posted_salary_period: null });
});
