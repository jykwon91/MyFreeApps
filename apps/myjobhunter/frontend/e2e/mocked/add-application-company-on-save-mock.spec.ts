/**
 * No-backend E2E for when Add application adds the posting's company: only on
 * Save. Cancelling after the link is read sends no POST /companies (it used to
 * add the company during the read, leaving one with no application). When
 * Save's add is refused because another company already has that domain
 * (409), the application is saved under that company.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";
import type { Company } from "@myjobhunter/api-client/types/company";
import type { JdUrlExtractResponse } from "@myjobhunter/api-client/types/application/jd-url-extract-response";
import { mockApplication, mockCompany } from "./fixtures/mockData";

const APPLICATIONS_ENDPOINT = /\/api\/applications(\?|$)/;
const EXTRACT_ENDPOINT = /\/api\/applications\/extract-from-url$/;
const COMPANIES_ENDPOINT = /\/api\/companies(\?|$)/;
const LINK = "https://jobs.example.com/linear/staff";

const EXTRACTED: JdUrlExtractResponse = {
  title: "Staff Engineer",
  company: "Linear",
  company_website: "https://linear.app/",
  company_logo_url: null,
  location: null,
  description_html: null,
  requirements_text: null,
  summary: null,
  source_url: LINK,
};

const LINEAR_INC = mockCompany({ id: "00000000-0000-0000-0000-0000000000c2", name: "Linear Inc", primary_domain: "linear.app" });

interface Sent {
  companies: Array<Record<string, unknown>>;
  applications: Array<Record<string, unknown>>;
}

/**
 * GET /companies serves `tracked` until a POST /companies is refused, then `afterRefusal`
 * (a company with that domain added elsewhere meanwhile). POST /companies answers `addReply`.
 */
async function stubAddFlow(page: Page, addReply: () => { status: number; body: unknown }, afterRefusal: Company[] = []): Promise<Sent> {
  const sent: Sent = { companies: [], applications: [] };
  let refused = false;
  await stubSignedInShell(page);
  await page.route(COMPANIES_ENDPOINT, (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      sent.companies.push(request.postDataJSON() as Record<string, unknown>);
      const { status, body } = addReply();
      if (status === 409) refused = true;
      return route.fulfill(json(body, status));
    }
    const items = refused ? afterRefusal : [];
    return route.fulfill(json({ items, total: items.length }));
  });
  await page.route(/\/api\/companies\/[^/]+\/research/, (route) => route.fulfill(json({}, 202)));
  await page.route(EXTRACT_ENDPOINT, (route) => route.fulfill(json(EXTRACTED)));
  await page.route(APPLICATIONS_ENDPOINT, (route) => {
    const request = route.request();
    if (request.method() !== "POST") return route.fulfill(json({ items: [], total: 0 }));
    sent.applications.push(request.postDataJSON() as Record<string, unknown>);
    return route.fulfill(json(mockApplication({ id: "new-1" }), 201));
  });
  return sent;
}

/** Opens the dialog, reads the link, and waits for the review step. */
async function readLink(page: Page) {
  await page.goto("/applications");
  await page.getByRole("button", { name: "Add application" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add application" });
  await dialog.getByLabel(/job posting url/i).fill(LINK);
  await dialog.getByRole("button", { name: /auto-fill/i }).click();
  await expect(dialog.getByText(/review and adjust before saving/i)).toBeVisible();
  return dialog;
}

test("cancelling after the link is read adds no company", async ({ page }) => {
  const sent = await stubAddFlow(page, () => ({ status: 201, body: mockCompany({ name: "Linear", primary_domain: "linear.app" }) }));
  const dialog = await readLink(page);

  await expect(dialog.getByText(/added when you save/i)).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();

  await expect(dialog).toBeHidden();
  expect(sent.companies).toEqual([]);
  expect(sent.applications).toEqual([]);
});

test("Save links the company that already has the domain when adding it is refused", async ({ page }) => {
  const sent = await stubAddFlow(
    page,
    () => ({ status: 409, body: { detail: "A company with primary_domain='linear.app' already exists." } }),
    [LINEAR_INC],
  );
  const dialog = await readLink(page);

  await dialog.getByRole("button", { name: "Add application" }).click();

  await expect(page.getByText("Application added", { exact: true })).toBeVisible();
  expect(sent.companies).toEqual([{ name: "Linear", primary_domain: "linear.app" }]);
  expect(sent.applications).toHaveLength(1);
  expect(sent.applications[0]).toMatchObject({ company_id: LINEAR_INC.id, role_title: "Staff Engineer" });
});
